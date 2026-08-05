export type CanvasSessionLeaseCommand = {
  userId: string
  workflowProjectId: string
  canvasSessionId: string
  status: string
  createdAt: string
}

export type CanvasSessionLeaseState = {
  lastSeenAt: Map<string, number>
  reboundTo: Map<string, { canvasSessionId: string; boundAt: number }>
  lastPrunedAt: number
}

export const CANVAS_SESSION_REBIND_GRACE_MS = 20_000
const CANVAS_SESSION_BINDING_TTL_MS = 8 * 60 * 60 * 1000
const CANVAS_SESSION_PRUNE_INTERVAL_MS = 60_000
const CANVAS_SESSION_MAX_TRACKED = 10_000

function sessionKey(userId: string, workflowProjectId: string, canvasSessionId: string) {
  return `${userId}\u0000${workflowProjectId}\u0000${canvasSessionId}`
}

export function createCanvasSessionLeaseState(): CanvasSessionLeaseState {
  return {
    lastSeenAt: new Map(),
    reboundTo: new Map(),
    lastPrunedAt: 0,
  }
}

export function pruneCanvasSessionLeaseState(
  state: CanvasSessionLeaseState,
  nowMs = Date.now(),
) {
  const cutoff = nowMs - CANVAS_SESSION_BINDING_TTL_MS
  for (const [key, seenAt] of state.lastSeenAt) {
    if (seenAt < cutoff) state.lastSeenAt.delete(key)
  }
  for (const [key, binding] of state.reboundTo) {
    if (binding.boundAt < cutoff) state.reboundTo.delete(key)
  }
  while (state.lastSeenAt.size > CANVAS_SESSION_MAX_TRACKED) {
    const oldest = state.lastSeenAt.keys().next().value
    if (!oldest) break
    state.lastSeenAt.delete(oldest)
  }
  while (state.reboundTo.size > CANVAS_SESSION_MAX_TRACKED) {
    const oldest = state.reboundTo.keys().next().value
    if (!oldest) break
    state.reboundTo.delete(oldest)
  }
  state.lastPrunedAt = nowMs
}

export function markCanvasSessionSeen(params: {
  state: CanvasSessionLeaseState
  userId: string
  workflowProjectId: string
  canvasSessionId: string
  nowMs?: number
}) {
  const nowMs = params.nowMs ?? Date.now()
  if (nowMs - params.state.lastPrunedAt >= CANVAS_SESSION_PRUNE_INTERVAL_MS) {
    pruneCanvasSessionLeaseState(params.state, nowMs)
  }
  params.state.lastSeenAt.set(
    sessionKey(params.userId, params.workflowProjectId, params.canvasSessionId),
    nowMs,
  )
}

export function bindCanvasSession(params: {
  state: CanvasSessionLeaseState
  userId: string
  workflowProjectId: string
  sourceCanvasSessionId: string
  targetCanvasSessionId: string
  nowMs?: number
}) {
  if (!params.sourceCanvasSessionId || params.sourceCanvasSessionId === params.targetCanvasSessionId) return
  params.state.reboundTo.set(
    sessionKey(params.userId, params.workflowProjectId, params.sourceCanvasSessionId),
    {
      canvasSessionId: params.targetCanvasSessionId,
      boundAt: params.nowMs ?? Date.now(),
    },
  )
}

export function resolveBoundCanvasSessionId(params: {
  state: CanvasSessionLeaseState
  userId: string
  workflowProjectId: string
  canvasSessionId: string
  nowMs?: number
}) {
  const nowMs = params.nowMs ?? Date.now()
  let current = params.canvasSessionId
  const visited = new Set<string>()
  while (current && !visited.has(current)) {
    visited.add(current)
    const key = sessionKey(params.userId, params.workflowProjectId, current)
    const binding = params.state.reboundTo.get(key)
    if (!binding) break
    if (nowMs - binding.boundAt > CANVAS_SESSION_BINDING_TTL_MS) {
      params.state.reboundTo.delete(key)
      break
    }
    current = binding.canvasSessionId
  }
  return current || params.canvasSessionId
}

export function findCanvasSessionCommandToClaim<T extends CanvasSessionLeaseCommand>(params: {
  state: CanvasSessionLeaseState
  commands: T[]
  userId: string
  workflowProjectId: string
  canvasSessionId: string
  nowMs?: number
  rebindGraceMs?: number
}) {
  const nowMs = params.nowMs ?? Date.now()
  const rebindGraceMs = Math.max(1_000, params.rebindGraceMs ?? CANVAS_SESSION_REBIND_GRACE_MS)
  const pending = params.commands.filter((command) => (
    command.userId === params.userId
    && command.workflowProjectId === params.workflowProjectId
    && command.status === 'pending'
  ))
  const exact = pending.find((command) => command.canvasSessionId === params.canvasSessionId)
  if (exact) return { command: exact, sourceCanvasSessionId: params.canvasSessionId, rebound: false }

  const alreadyBound = pending.find((command) => resolveBoundCanvasSessionId({
    state: params.state,
    userId: params.userId,
    workflowProjectId: params.workflowProjectId,
    canvasSessionId: command.canvasSessionId,
    nowMs,
  }) === params.canvasSessionId)
  if (alreadyBound) {
    return { command: alreadyBound, sourceCanvasSessionId: alreadyBound.canvasSessionId, rebound: true }
  }

  const stale = pending.find((command) => {
    if (command.canvasSessionId === params.canvasSessionId) return false
    const createdAt = Date.parse(command.createdAt)
    if (!Number.isFinite(createdAt) || nowMs - createdAt < rebindGraceMs) return false
    const lastSeenAt = params.state.lastSeenAt.get(sessionKey(
      params.userId,
      params.workflowProjectId,
      command.canvasSessionId,
    )) || 0
    return !lastSeenAt || nowMs - lastSeenAt >= rebindGraceMs
  })
  if (!stale) return null
  return { command: stale, sourceCanvasSessionId: stale.canvasSessionId, rebound: true }
}
