export const LIBTV_VIDEO_PLAYBACK_LEASE_LIMIT = 3
export const LIBTV_VIDEO_PLAYBACK_LEASE_MS = 15_000
export const LIBTV_VIDEO_PLAYBACK_INTERACTION_RELEASE_MS = 1_500
export const LIBTV_VIDEO_PLAYBACK_INTERACTION_RESUME_MS = 200

export type LibTvVideoPlaybackInteractionSchedulerOptions = {
  setTimer?: (callback: () => void, delayMs: number) => unknown
  clearTimer?: (handle: unknown) => void
  onPause: () => void
  onRelease: () => void
  onResume: () => void
}

/**
 * Coordinates LibTV's two-stage canvas interaction policy: pause playback
 * immediately, keep decoders warm for short gestures, unload them only after a
 * continuous 1.5s interaction, and wait 200ms before allowing playback again.
 */
export function createLibTvVideoPlaybackInteractionScheduler(
  options: LibTvVideoPlaybackInteractionSchedulerOptions,
) {
  const setTimer = options.setTimer || ((callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer || ((handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>))
  let releaseTimer: unknown | null = null
  let resumeTimer: unknown | null = null
  let interacting = false
  let released = false
  let disposed = false

  const clearReleaseTimer = () => {
    if (releaseTimer === null) return
    clearTimer(releaseTimer)
    releaseTimer = null
  }
  const clearResumeTimer = () => {
    if (resumeTimer === null) return
    clearTimer(resumeTimer)
    resumeTimer = null
  }

  const start = () => {
    if (disposed) return
    clearResumeTimer()
    if (interacting) return
    interacting = true
    released = false
    options.onPause()
    releaseTimer = setTimer(() => {
      releaseTimer = null
      if (!interacting || disposed || released) return
      released = true
      options.onRelease()
    }, LIBTV_VIDEO_PLAYBACK_INTERACTION_RELEASE_MS)
  }

  const end = () => {
    if (disposed || !interacting) return
    interacting = false
    clearReleaseTimer()
    clearResumeTimer()
    resumeTimer = setTimer(() => {
      resumeTimer = null
      if (interacting || disposed) return
      released = false
      options.onResume()
    }, LIBTV_VIDEO_PLAYBACK_INTERACTION_RESUME_MS)
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    interacting = false
    clearReleaseTimer()
    clearResumeTimer()
  }

  return { start, end, dispose }
}

export type LibTvVideoPlaybackLeaseReleaseReason = "cancelled" | "expired" | "paused" | "disposed"

export type LibTvVideoPlaybackLeaseCallbacks = {
  onGrant: () => void
  onRelease: (reason: LibTvVideoPlaybackLeaseReleaseReason) => void
  onPausePlayback?: () => void
  onResumePlayback?: () => void
  /** Keep the decoder lease while this video is actively being watched. */
  pinned?: boolean
}

export type LibTvVideoPlaybackLeasePoolOptions = {
  limit?: number
  leaseMs?: number
  now?: () => number
  setTimer?: (callback: () => void, delayMs: number) => unknown
  clearTimer?: (handle: unknown) => void
  onCallbackError?: (error: unknown) => void
}

export type LibTvVideoPlaybackLeasePoolSnapshot<Token> = {
  activeTokens: Token[]
  waitingTokens: Token[]
  activeCount: number
  waitingCount: number
  requestCount: number
  timerCount: number
  paused: boolean
  disposed: boolean
}

type LeaseEntry<Token> = LibTvVideoPlaybackLeaseCallbacks & {
  token: Token
  state: "waiting" | "active"
  leaseId: number
  expiresAt: number
  timer: unknown | null
}

/**
 * A small FIFO resource manager matching LibTV's inline video policy.
 *
 * Requests keep their place while waiting. An active request is moved to the
 * back after its lease expires so another waiting video can decode. Pausing
 * synchronously revokes only the currently active leases; requests made while
 * paused join the same FIFO and are not granted until resume().
 */
export function createLibTvVideoPlaybackLeasePool<Token = symbol>(
  options: LibTvVideoPlaybackLeasePoolOptions = {},
) {
  const limit = Math.max(1, Math.floor(Number(options.limit ?? LIBTV_VIDEO_PLAYBACK_LEASE_LIMIT) || 0))
  const leaseMs = Math.max(1, Math.floor(Number(options.leaseMs ?? LIBTV_VIDEO_PLAYBACK_LEASE_MS) || 0))
  const now = options.now || (() => Date.now())
  const setTimer = options.setTimer || ((callback: () => void, delayMs: number) => globalThis.setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer || ((handle: unknown) => {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>)
  })

  const entries = new Map<Token, LeaseEntry<Token>>()
  const activeEntries = new Map<Token, LeaseEntry<Token>>()
  const waitingQueue: Token[] = []
  let nextLeaseId = 0
  let paused = false
  let grantsSuspended = false
  let disposed = false
  let pumping = false
  let repumpRequested = false

  const reportCallbackError = (error: unknown) => {
    try {
      options.onCallbackError?.(error)
    } catch {
      // Callback reporting must not corrupt the pool state.
    }
  }

  const invokeGrant = (entry: LeaseEntry<Token>) => {
    try {
      entry.onGrant()
    } catch (error) {
      reportCallbackError(error)
    }
  }

  const invokeRelease = (entry: LeaseEntry<Token>, reason: LibTvVideoPlaybackLeaseReleaseReason) => {
    try {
      entry.onRelease(reason)
    } catch (error) {
      reportCallbackError(error)
    }
  }

  const removeWaitingToken = (token: Token) => {
    const index = waitingQueue.indexOf(token)
    if (index >= 0) waitingQueue.splice(index, 1)
  }

  const clearEntryTimer = (entry: LeaseEntry<Token>) => {
    if (entry.timer === null) return
    clearTimer(entry.timer)
    entry.timer = null
  }

  const expireLease = (token: Token, leaseId: number) => {
    const entry = entries.get(token)
    if (!entry || entry.state !== "active" || entry.leaseId !== leaseId) return

    if (entry.pinned) {
      entry.expiresAt = now() + leaseMs
      entry.timer = setTimer(() => expireLease(token, leaseId), leaseMs)
      return
    }

    activeEntries.delete(token)
    entry.state = "waiting"
    entry.leaseId = 0
    entry.expiresAt = 0
    entry.timer = null
    waitingQueue.push(token)
    invokeRelease(entry, "expired")
    pump()
  }

  const grantEntry = (entry: LeaseEntry<Token>) => {
    entry.state = "active"
    entry.leaseId = ++nextLeaseId
    entry.expiresAt = now() + leaseMs
    activeEntries.set(entry.token, entry)
    const leaseId = entry.leaseId
    entry.timer = setTimer(() => expireLease(entry.token, leaseId), leaseMs)
    invokeGrant(entry)
  }

  const renewLeaseTimer = (entry: LeaseEntry<Token>) => {
    if (entry.state !== "active") return
    clearEntryTimer(entry)
    entry.expiresAt = now() + leaseMs
    const leaseId = entry.leaseId
    entry.timer = setTimer(() => expireLease(entry.token, leaseId), leaseMs)
  }

  function pump() {
    if (disposed || paused || grantsSuspended) return
    if (pumping) {
      repumpRequested = true
      return
    }

    do {
      repumpRequested = false
      pumping = true
      try {
        while (!paused && !grantsSuspended && !disposed && activeEntries.size < limit && waitingQueue.length > 0) {
          const token = waitingQueue.shift() as Token
          const entry = entries.get(token)
          if (!entry || entry.state !== "waiting") continue
          grantEntry(entry)
        }
      } finally {
        pumping = false
      }
    } while (repumpRequested && !paused && !grantsSuspended && !disposed)
  }

  const request = (token: Token, callbacks: LibTvVideoPlaybackLeaseCallbacks) => {
    if (disposed) return false
    const current = entries.get(token)
    if (current) {
      current.onGrant = callbacks.onGrant
      current.onRelease = callbacks.onRelease
      current.onPausePlayback = callbacks.onPausePlayback
      current.onResumePlayback = callbacks.onResumePlayback
      current.pinned = callbacks.pinned
      renewLeaseTimer(current)
    } else {
      const entry: LeaseEntry<Token> = {
        token,
        state: "waiting",
        leaseId: 0,
        expiresAt: 0,
        timer: null,
        ...callbacks,
      }
      entries.set(token, entry)
      waitingQueue.push(token)
    }
    pump()
    return true
  }

  const cancel = (token: Token, notifyRelease = true) => {
    const entry = entries.get(token)
    if (!entry) return false

    entries.delete(token)
    if (entry.state === "active") {
      activeEntries.delete(token)
      clearEntryTimer(entry)
      entry.leaseId = 0
      entry.expiresAt = 0
      if (notifyRelease) invokeRelease(entry, "cancelled")
    } else {
      removeWaitingToken(token)
    }
    pump()
    return true
  }

  const pauseAll = () => {
    if (disposed || paused) return false
    paused = true
    const leasedEntries = Array.from(activeEntries.values())
    activeEntries.clear()
    for (const entry of leasedEntries) {
      clearEntryTimer(entry)
      entry.state = "waiting"
      entry.leaseId = 0
      entry.expiresAt = 0
      waitingQueue.push(entry.token)
    }
    for (const entry of leasedEntries) invokeRelease(entry, "paused")
    return true
  }

  const pausePlayback = () => {
    if (disposed) return false
    const active = Array.from(activeEntries.values())
    for (const entry of active) {
      try {
        entry.onPausePlayback?.()
      } catch (error) {
        reportCallbackError(error)
      }
    }
    return active.length > 0
  }

  const suspendGrants = () => {
    if (disposed || grantsSuspended) return false
    grantsSuspended = true
    return true
  }

  const resumeGrants = () => {
    if (disposed || !grantsSuspended) return false
    grantsSuspended = false
    pump()
    return true
  }

  const resumePlayback = () => {
    if (disposed || paused) return false
    const active = Array.from(activeEntries.values())
    for (const entry of active) {
      try {
        entry.onResumePlayback?.()
      } catch (error) {
        reportCallbackError(error)
      }
    }
    return active.length > 0
  }

  const resume = () => {
    if (disposed || !paused) return false
    paused = false
    pump()
    return true
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    paused = true
    const leasedEntries = Array.from(activeEntries.values())
    activeEntries.clear()
    waitingQueue.length = 0
    entries.clear()
    for (const entry of leasedEntries) {
      clearEntryTimer(entry)
      entry.leaseId = 0
      entry.expiresAt = 0
      invokeRelease(entry, "disposed")
    }
  }

  const getSnapshot = (): LibTvVideoPlaybackLeasePoolSnapshot<Token> => {
    const waitingTokens = waitingQueue.filter((token) => {
      const entry = entries.get(token)
      return entry?.state === "waiting"
    })
    const activeTokens = Array.from(activeEntries.keys())
    return {
      activeTokens,
      waitingTokens,
      activeCount: activeTokens.length,
      waitingCount: waitingTokens.length,
      requestCount: entries.size,
      timerCount: Array.from(activeEntries.values()).filter((entry) => entry.timer !== null).length,
      paused,
      disposed,
    }
  }

  return {
    request,
    cancel,
    pauseAll,
    pausePlayback,
    resume,
    resumeGrants,
    resumePlayback,
    suspendGrants,
    dispose,
    getSnapshot,
  }
}
