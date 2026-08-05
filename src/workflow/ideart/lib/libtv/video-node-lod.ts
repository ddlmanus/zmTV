export const LIBTV_NODE_LOD_INITIAL_FULL_COUNT = 30
export const LIBTV_NODE_LOD_FRAME_BATCH_SIZE = 4
export const LIBTV_NODE_LOD_INTERACTION_PAUSE_MS = 180
export const LIBTV_NODE_LOD_ENTER_ZOOM = 0.23
export const LIBTV_NODE_LOD_EXIT_ZOOM = 0.27
export const LIBTV_VIDEO_NODE_SNAPSHOT_WIDTH = 400

export type LibTvNodeLodCandidate = {
  id: string
  selected?: boolean
  generating?: boolean
  failed?: boolean
}

export type LibTvVideoNodeLodMode = "full" | "snapshot"

function normalizeCandidateId(value: unknown) {
  return String(value || "").trim()
}

function normalizedCandidates(candidates: readonly LibTvNodeLodCandidate[]) {
  const seen = new Set<string>()
  const normalized: LibTvNodeLodCandidate[] = []
  for (const candidate of candidates) {
    const id = normalizeCandidateId(candidate?.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push(id === candidate.id ? candidate : { ...candidate, id })
  }
  return normalized
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false
  for (const id of left) {
    if (!right.has(id)) return false
  }
  return true
}

export function isLibTvNodeLodForcedFull(candidate: LibTvNodeLodCandidate | undefined) {
  return Boolean(candidate?.selected || candidate?.generating || candidate?.failed)
}

/**
 * LibTV mounts the first 30 nodes immediately. Forced nodes outside that
 * window are mounted as well so selection and task feedback never degrade.
 */
export function createLibTvInitialMountedNodeIds(
  candidates: readonly LibTvNodeLodCandidate[],
  initialCount = LIBTV_NODE_LOD_INITIAL_FULL_COUNT,
) {
  const mountedIds = new Set<string>()
  const safeInitialCount = Math.max(0, Math.floor(Number(initialCount) || 0))
  normalizedCandidates(candidates).forEach((candidate, index) => {
    if (index < safeInitialCount || isLibTvNodeLodForcedFull(candidate)) {
      mountedIds.add(candidate.id)
    }
  })
  return mountedIds
}

/**
 * Removes stale ids and eagerly admits selected/running/failed nodes. The
 * returned Set keeps its identity when no membership changed.
 */
export function synchronizeLibTvMountedNodeIds(
  mountedIds: ReadonlySet<string>,
  candidates: readonly LibTvNodeLodCandidate[],
) {
  const normalized = normalizedCandidates(candidates)
  const validIds = new Set(normalized.map((candidate) => candidate.id))
  const nextMountedIds = new Set<string>()
  for (const id of mountedIds) {
    if (validIds.has(id)) nextMountedIds.add(id)
  }
  for (const candidate of normalized) {
    if (isLibTvNodeLodForcedFull(candidate)) nextMountedIds.add(candidate.id)
  }
  return setsEqual(mountedIds, nextMountedIds) ? mountedIds : nextMountedIds
}

export type AdvanceLibTvMountedNodeIdsOptions = {
  now?: number
  pausedUntil?: number
  batchSize?: number
}

/**
 * Advances at most four ordinary nodes in one animation frame. Forced nodes
 * are synchronized even while ordinary progressive work is paused.
 */
export function advanceLibTvMountedNodeIds(
  mountedIds: ReadonlySet<string>,
  candidates: readonly LibTvNodeLodCandidate[],
  options: AdvanceLibTvMountedNodeIdsOptions = {},
) {
  const normalized = normalizedCandidates(candidates)
  const synchronized = synchronizeLibTvMountedNodeIds(mountedIds, normalized)
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : 0
  const pausedUntil = Number.isFinite(Number(options.pausedUntil)) ? Number(options.pausedUntil) : 0
  if (now < pausedUntil) return synchronized

  const safeBatchSize = Math.max(
    0,
    Math.floor(Number(options.batchSize ?? LIBTV_NODE_LOD_FRAME_BATCH_SIZE) || 0),
  )
  if (safeBatchSize === 0) return synchronized

  let admitted = 0
  let nextMountedIds: Set<string> | null = null
  for (const candidate of normalized) {
    if (synchronized.has(candidate.id)) continue
    if (!nextMountedIds) nextMountedIds = new Set(synchronized)
    nextMountedIds.add(candidate.id)
    admitted += 1
    if (admitted >= safeBatchSize) break
  }
  return nextMountedIds || synchronized
}

export function hasPendingLibTvNodeMounts(
  mountedIds: ReadonlySet<string>,
  candidates: readonly LibTvNodeLodCandidate[],
) {
  return normalizedCandidates(candidates).some((candidate) => !mountedIds.has(candidate.id))
}

/**
 * The gap between 0.23 and 0.27 is intentional hysteresis. It prevents the
 * media layer from repeatedly mounting/unmounting near a single threshold.
 */
export function resolveLibTvLowDetailMode(previousLowDetail: boolean, zoom: number) {
  const normalizedZoom = Number(zoom)
  if (!Number.isFinite(normalizedZoom)) return Boolean(previousLowDetail)
  if (previousLowDetail) return normalizedZoom < LIBTV_NODE_LOD_EXIT_ZOOM
  return normalizedZoom < LIBTV_NODE_LOD_ENTER_ZOOM
}

export function resolveLibTvVideoNodeLodMode(
  candidate: LibTvNodeLodCandidate,
  mountedIds: ReadonlySet<string>,
  lowDetail: boolean,
): LibTvVideoNodeLodMode {
  if (isLibTvNodeLodForcedFull(candidate)) return "full"
  const id = normalizeCandidateId(candidate.id)
  return !id || lowDetail || !mountedIds.has(id) ? "snapshot" : "full"
}
