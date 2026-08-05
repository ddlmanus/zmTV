import type {
  LibTvDirectorConsole3DJointAngles,
  LibTvDirectorConsole3DObject,
  LibTvDirectorConsole3DState,
  LibTvDirectorConsole3DMotionPath,
  LibTvDirectorConsole3DMotionPathType,
  LibTvDirectorConsole3DTimeline,
  LibTvDirectorConsole3DTimelineKeyframe,
  LibTvDirectorConsole3DTimelineMotionAction,
  LibTvDirectorConsole3DTimelineTrack,
  LibTvDirectorConsole3DVector3,
} from "./workflow"

export const DIRECTOR_CONSOLE_TIMELINE_DEFAULTS = Object.freeze({
  duration: 10,
  loop: true,
  autoKey: false,
  unit: "s" as const,
  zoom: 44,
})

type DirectorTimelineTargetType = LibTvDirectorConsole3DTimelineTrack["targetType"]

type UnknownRecord = Record<string, unknown>

const VECTOR_AXES = new Set(["x", "y", "z"])
const OBJECT_VECTOR_PROPERTIES = new Set(["position", "rotation", "scale"])
const CAMERA_VECTOR_PROPERTIES = new Set(["position", "rotation", "target"])
const OBJECT_NUMBER_PROPERTIES = new Set(["crowdCount", "crowdRows", "crowdCols", "crowdSpacing"])
const CAMERA_NUMBER_PROPERTIES = new Set(["fov"])
const UNSAFE_PROPERTY_SEGMENTS = new Set(["__proto__", "prototype", "constructor"])
const MOTION_PATH_TYPES = new Set<LibTvDirectorConsole3DMotionPathType>(["circle", "line", "rectangle", "pencil", "pen"])
const motionPathLengthCache = new Map<string, { points: LibTvDirectorConsole3DVector3[]; lengths: number[]; total: number }>()

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function finiteNumber(value: unknown, fallback: number) {
  const number = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeTimelineProperty(value: unknown) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const parts = raw
    .replace(/^transform\./i, "")
    .replace(/\[(?:"|')?([^\]"']+)(?:"|')?\]/g, ".$1")
    .replace(/[_/-]+/g, ".")
    .replace(/([a-z])([A-Z])/g, "$1.$2")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .toLowerCase()
    .split(".")
    .filter(Boolean)
  if (parts[0] === "joint" && parts[1] === "angles") parts.splice(0, 2, "jointAngles")
  else if (parts[0] === "jointangles") parts[0] = "jointAngles"
  const [head, axis, ...rest] = parts
  if (head === "jointAngles" && axis && rest.length === 1) return [head, axis, rest[0]].join(".")
  if (rest.length > 0) return parts.join(".")
  if ((head === "position" || head === "rotation" || head === "scale" || head === "target") && VECTOR_AXES.has(axis)) {
    return head + "." + axis
  }
  if (head === "fov") return "fov"
  if (head === "crowd" && axis === "count") return "crowdCount"
  if (head === "crowd" && axis === "rows") return "crowdRows"
  if (head === "crowd" && axis === "cols") return "crowdCols"
  if (head === "crowd" && axis === "spacing") return "crowdSpacing"
  return raw
}

function getTimelineSource(value: unknown) {
  if (!isRecord(value)) return {}
  if (isRecord(value.timeline)) return { ...value, ...value.timeline }
  return value
}

function resolveTargetType(rawTrack: UnknownRecord, targetId: string, state?: Pick<LibTvDirectorConsole3DState, "objects" | "cameras">): DirectorTimelineTargetType {
  const explicit = rawTrack.targetType ?? rawTrack.type ?? rawTrack.target_type
  if (explicit === "camera") return "camera"
  if (explicit === "object") return "object"
  if (typeof rawTrack.cameraId === "string") return "camera"
  if (state?.cameras.some((camera) => camera.id === targetId)) return "camera"
  return "object"
}

function resolveTargetName(targetId: string, targetType: DirectorTimelineTargetType, state?: Pick<LibTvDirectorConsole3DState, "objects" | "cameras">) {
  const target = targetType === "camera"
    ? state?.cameras.find((camera) => camera.id === targetId)
    : state?.objects.find((object) => object.id === targetId)
  return target?.name || (targetType === "camera" ? "机位" : "对象")
}

function normalizeKeyframes(value: unknown, trackId: string, duration: number) {
  if (!Array.isArray(value)) return []
  const keyframes: LibTvDirectorConsole3DTimelineKeyframe[] = []
  value.forEach((entry, index) => {
    if (!isRecord(entry)) return
    const property = normalizeTimelineProperty(entry.property ?? entry.propertyPath ?? entry.path ?? entry.key)
    if (!property) return
    let time = finiteNumber(entry.time ?? entry.at ?? entry.offset, Number.NaN)
    if (!Number.isFinite(time) && entry.timeMs !== undefined) time = finiteNumber(entry.timeMs, Number.NaN) / 1000
    if (!Number.isFinite(time)) return
    const number = finiteNumber(entry.value, Number.NaN)
    if (!Number.isFinite(number)) return
    const normalizedTime = clamp(time, 0, duration)
    keyframes.push({
      id: String(entry.id || [trackId, property, normalizedTime, index].join("-")),
      time: normalizedTime,
      property,
      value: number,
    })
  })
  // Later persisted entries win when old clients produced duplicate property/time pairs.
  const deduplicated = new Map<string, LibTvDirectorConsole3DTimelineKeyframe>()
  keyframes.forEach((keyframe) => deduplicated.set(keyframe.property + "\u0000" + keyframe.time, keyframe))
  return [...deduplicated.values()].sort((a, b) => a.time - b.time || a.property.localeCompare(b.property))
}

function normalizeVector3(value: unknown): LibTvDirectorConsole3DVector3 | null {
  if (!isRecord(value)) return null
  const x = finiteNumber(value.x, Number.NaN)
  const y = finiteNumber(value.y, Number.NaN)
  const z = finiteNumber(value.z, Number.NaN)
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null
}

export function getDirectorConsoleMotionPathCenter(points: LibTvDirectorConsole3DVector3[]) {
  if (points.length === 0) return { x: 0, y: 0, z: 0 }
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  points.forEach((point) => {
    min.x = Math.min(min.x, point.x); min.y = Math.min(min.y, point.y); min.z = Math.min(min.z, point.z)
    max.x = Math.max(max.x, point.x); max.y = Math.max(max.y, point.y); max.z = Math.max(max.z, point.z)
  })
  return roundedVector({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 })
}

function normalizeMotionPaths(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index): LibTvDirectorConsole3DMotionPath[] => {
    if (!isRecord(entry)) return []
    const type = String(entry.type || entry.pathType || "") as LibTvDirectorConsole3DMotionPathType
    const targetId = String(entry.targetId || entry.objectId || entry.cameraId || "").trim()
    const points = (Array.isArray(entry.points) ? entry.points : [])
      .map(normalizeVector3)
      .filter(Boolean)
      .slice(0, 512) as LibTvDirectorConsole3DVector3[]
    if (!MOTION_PATH_TYPES.has(type) || !targetId || points.length < 2) return []
    return [{
      id: String(entry.id || ["motion-path", targetId, index].join("-")),
      targetId,
      type,
      points,
      closed: typeof entry.closed === "boolean" ? entry.closed : type === "circle" || type === "rectangle",
      position: normalizeVector3(entry.position) || getDirectorConsoleMotionPathCenter(points),
      rotation: normalizeVector3(entry.rotation) || { x: 0, y: 0, z: 0 },
      scale: normalizeVector3(entry.scale) || { x: 1, y: 1, z: 1 },
    }]
  })
}

function normalizeMotionActions(value: unknown, trackId: string, duration: number) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index): LibTvDirectorConsole3DTimelineMotionAction[] => {
    if (!isRecord(entry) || (entry.type !== undefined && entry.type !== "motion-path")) return []
    const pathId = String(entry.pathId || entry.motionPathId || "").trim()
    if (!pathId) return []
    const startTime = clamp(finiteNumber(entry.startTime ?? entry.time, 0), 0, duration)
    const actionDuration = clamp(finiteNumber(entry.duration, duration - startTime || duration), 0.01, Math.max(0.01, duration - startTime))
    return [{
      id: String(entry.id || [trackId, "motion-path", index].join("-")),
      type: "motion-path",
      pathId,
      startTime,
      duration: actionDuration,
      orientToPath: entry.orientToPath !== false,
      headingOffset: finiteNumber(entry.headingOffset, 0),
    }]
  })
}

function normalizeTracks(
  value: unknown,
  duration: number,
  state?: Pick<LibTvDirectorConsole3DState, "objects" | "cameras">,
) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index): LibTvDirectorConsole3DTimelineTrack[] => {
    if (!isRecord(entry)) return []
    const targetId = String(entry.targetId ?? entry.objectId ?? entry.cameraId ?? "").trim()
    if (!targetId) return []
    const targetType = resolveTargetType(entry, targetId, state)
    const id = String(entry.id || ["timeline-track", targetType, targetId, index].join("-"))
    return [{
      id,
      targetId,
      targetType,
      name: String(entry.name ?? entry.title ?? resolveTargetName(targetId, targetType, state)),
      keyframes: normalizeKeyframes(entry.keyframes ?? entry.frames, id, duration),
      expanded: entry.expanded !== false,
      autoWalk: targetType === "object" ? entry.autoWalk !== false : undefined,
      actions: normalizeMotionActions(entry.actions ?? entry.motionActions, id, duration),
    }]
  })
}

function normalizeLegacyTrackIds(
  value: unknown,
  state?: Pick<LibTvDirectorConsole3DState, "objects" | "cameras">,
) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, index): LibTvDirectorConsole3DTimelineTrack[] => {
    const targetId = String(entry || "").trim()
    if (!targetId) return []
    const targetType: DirectorTimelineTargetType = state?.cameras.some((camera) => camera.id === targetId) ? "camera" : "object"
    return [{
      id: ["timeline-track", targetType, targetId, index].join("-"),
      targetId,
      targetType,
      name: resolveTargetName(targetId, targetType, state),
      keyframes: [],
      expanded: targetType === "object",
      autoWalk: targetType === "object" ? true : undefined,
      actions: [],
    }]
  })
}

export function createDirectorConsoleDefaultTimeline(): LibTvDirectorConsole3DTimeline {
  return { ...DIRECTOR_CONSOLE_TIMELINE_DEFAULTS, tracks: [], paths: [] }
}

/**
 * Accepts either a timeline value or a complete director-console state. It also
 * understands the temporary top-level fields used before timeline persistence.
 */
export function normalizeDirectorConsoleTimeline(
  value: unknown,
  state?: Pick<LibTvDirectorConsole3DState, "objects" | "cameras">,
): LibTvDirectorConsole3DTimeline {
  const raw = getTimelineSource(value)
  const duration = clamp(finiteNumber(raw.duration ?? raw.timelineDuration, DIRECTOR_CONSOLE_TIMELINE_DEFAULTS.duration), 0.01, 24 * 60 * 60)
  const unit = raw.unit === "ms" || raw.timelineUnit === "ms" ? "ms" : "s"
  const tracks = normalizeTracks(raw.tracks, duration, state)
  return {
    duration,
    loop: typeof (raw.loop ?? raw.timelineLoop) === "boolean" ? Boolean(raw.loop ?? raw.timelineLoop) : DIRECTOR_CONSOLE_TIMELINE_DEFAULTS.loop,
    autoKey: typeof (raw.autoKey ?? raw.timelineAutoKey) === "boolean" ? Boolean(raw.autoKey ?? raw.timelineAutoKey) : DIRECTOR_CONSOLE_TIMELINE_DEFAULTS.autoKey,
    unit,
    zoom: clamp(finiteNumber(raw.zoom ?? raw.timelineZoom, DIRECTOR_CONSOLE_TIMELINE_DEFAULTS.zoom), 8, 240),
    tracks: tracks.length > 0 ? tracks : normalizeLegacyTrackIds(raw.trackIds ?? raw.timelineTrackIds, state),
    paths: normalizeMotionPaths(raw.paths ?? raw.motionPaths),
  }
}

function getInterpolatedValue(keyframes: LibTvDirectorConsole3DTimelineKeyframe[], time: number) {
  if (keyframes.length === 0) return undefined
  if (time <= keyframes[0].time) return keyframes[0].value
  const last = keyframes[keyframes.length - 1]
  if (time >= last.time) return last.value
  for (let index = 1; index < keyframes.length; index += 1) {
    const right = keyframes[index]
    if (time > right.time) continue
    const left = keyframes[index - 1]
    const span = right.time - left.time
    if (span <= 0) return right.value
    const progress = (time - left.time) / span
    return left.value + (right.value - left.value) * progress
  }
  return last.value
}

function isAllowedProperty(targetType: DirectorTimelineTargetType, path: string[]) {
  if (path.length === 1) {
    return targetType === "camera" ? CAMERA_NUMBER_PROPERTIES.has(path[0]) : OBJECT_NUMBER_PROPERTIES.has(path[0])
  }
  if (path.length === 2 && VECTOR_AXES.has(path[1])) {
    return targetType === "camera" ? CAMERA_VECTOR_PROPERTIES.has(path[0]) : OBJECT_VECTOR_PROPERTIES.has(path[0])
  }
  return targetType === "object" && path.length === 3 && path[0] === "jointAngles"
}

function setNumericProperty<T extends object>(target: T, property: string, value: number): T {
  const path = property.split(".").filter(Boolean)
  if (path.some((segment) => UNSAFE_PROPERTY_SEGMENTS.has(segment))) return target
  let source: unknown = target
  const chain: UnknownRecord[] = []
  for (let index = 0; index < path.length - 1; index += 1) {
    if (!isRecord(source)) return target
    chain.push(source)
    source = source[path[index]]
  }
  const leaf = path[path.length - 1]
  if (!leaf || !isRecord(source) || typeof source[leaf] !== "number") return target
  let child: unknown = { ...source, [leaf]: value }
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    child = { ...chain[index], [path[index]]: child }
  }
  return child as T
}

function applyTrackKeyframes<T extends object>(target: T, track: LibTvDirectorConsole3DTimelineTrack, time: number) {
  const byProperty = new Map<string, LibTvDirectorConsole3DTimelineKeyframe[]>()
  track.keyframes.forEach((keyframe) => {
    const property = normalizeTimelineProperty(keyframe.property)
    const path = property.split(".").filter(Boolean)
    if (!isAllowedProperty(track.targetType, path)) return
    const propertyFrames = byProperty.get(property) || []
    propertyFrames.push(keyframe)
    byProperty.set(property, propertyFrames)
  })
  let result = target
  byProperty.forEach((frames, property) => {
    const value = getInterpolatedValue(frames.sort((a, b) => a.time - b.time), time)
    if (value !== undefined) result = setNumericProperty(result, property, value)
  })
  return result
}

function roundedVector(point: LibTvDirectorConsole3DVector3): LibTvDirectorConsole3DVector3 {
  return {
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
    z: Number(point.z.toFixed(3)),
  }
}

export function createDirectorConsoleMotionPath(
  type: LibTvDirectorConsole3DMotionPathType,
  targetId: string,
  origin: LibTvDirectorConsole3DVector3,
  id = ["motion-path", targetId, Date.now().toString(36)].join("-"),
): LibTvDirectorConsole3DMotionPath {
  let points: LibTvDirectorConsole3DVector3[] = []
  let closed = false
  if (type === "circle") {
    const radius = 2
    // LibTV presets place the ring centre two units to the left so the actor
    // starts at its current position rather than jumping when the path is made.
    const center = { x: origin.x - radius, y: origin.y, z: origin.z }
    points = Array.from({ length: 65 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2
      return roundedVector({ x: center.x + Math.cos(angle) * radius, y: origin.y, z: center.z + Math.sin(angle) * radius })
    })
    closed = true
  } else if (type === "line") {
    points = [roundedVector({ x: origin.x - 2, y: origin.y, z: origin.z }), roundedVector({ x: origin.x + 2, y: origin.y, z: origin.z })]
  } else if (type === "rectangle") {
    points = [
      roundedVector({ x: origin.x - 2, y: origin.y, z: origin.z - 1.5 }),
      roundedVector({ x: origin.x - 2, y: origin.y, z: origin.z + 1.5 }),
      roundedVector({ x: origin.x + 2, y: origin.y, z: origin.z + 1.5 }),
      roundedVector({ x: origin.x + 2, y: origin.y, z: origin.z - 1.5 }),
      roundedVector({ x: origin.x - 2, y: origin.y, z: origin.z - 1.5 }),
    ]
    closed = true
  } else if (type === "pen") {
    points = Array.from({ length: 49 }, (_, index) => {
      const t = index / 48
      const inverse = 1 - t
      const p0 = origin
      const p1 = { x: origin.x - 1.5, y: origin.y, z: origin.z + 5 }
      const p2 = { x: origin.x - 6.5, y: origin.y, z: origin.z - 3 }
      const p3 = { x: origin.x - 8, y: origin.y, z: origin.z + 2 }
      return roundedVector({
        x: inverse ** 3 * p0.x + 3 * inverse ** 2 * t * p1.x + 3 * inverse * t ** 2 * p2.x + t ** 3 * p3.x,
        y: origin.y,
        z: inverse ** 3 * p0.z + 3 * inverse ** 2 * t * p1.z + 3 * inverse * t ** 2 * p2.z + t ** 3 * p3.z,
      })
    })
  } else {
    points = [roundedVector(origin), roundedVector({ x: origin.x - 2, y: origin.y, z: origin.z + 1.4 })]
  }
  return { id, targetId, type, points, closed, position: getDirectorConsoleMotionPathCenter(points), rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
}

export function createDirectorConsoleMotionPathAction(
  pathId: string,
  duration: number,
  id = ["motion-action", pathId, Date.now().toString(36)].join("-"),
): LibTvDirectorConsole3DTimelineMotionAction {
  return { id, type: "motion-path", pathId, startTime: 0, duration: Math.max(0.01, duration), orientToPath: true, headingOffset: 0 }
}

export function sampleDirectorConsoleMotionPath(path: LibTvDirectorConsole3DMotionPath, progress: number) {
  const source = path.points
  if (source.length === 0) return null
  if (source.length === 1) return { position: source[0], tangent: { x: 0, y: 0, z: 1 } }
  const points = path.closed && (source[0].x !== source[source.length - 1].x || source[0].y !== source[source.length - 1].y || source[0].z !== source[source.length - 1].z)
    ? [...source, source[0]]
    : source
  if (path.type === "rectangle" && points.length >= 5) {
    const scaled = clamp(progress, 0, 1) * (points.length - 1)
    const segment = Math.min(points.length - 2, Math.floor(scaled))
    const local = scaled >= points.length - 1 ? 1 : scaled - segment
    const start = points[segment]
    const end = points[segment + 1]
    const tangentLength = Math.max(0.000001, Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z))
    return {
      position: roundedVector({ x: start.x + (end.x - start.x) * local, y: start.y + (end.y - start.y) * local, z: start.z + (end.z - start.z) * local }),
      tangent: { x: (end.x - start.x) / tangentLength, y: (end.y - start.y) / tangentLength, z: (end.z - start.z) / tangentLength },
    }
  }
  const cacheKey = [path.id, path.type, path.closed ? 1 : 0, points.length, points[0].x, points[0].y, points[0].z, points[points.length - 1].x, points[points.length - 1].y, points[points.length - 1].z].join(":")
  let cached = motionPathLengthCache.get(cacheKey)
  if (!cached) {
    const lengths: number[] = [0]
    let total = 0
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]
      const b = points[index]
      total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      lengths.push(total)
    }
    cached = { points, lengths, total }
    motionPathLengthCache.set(cacheKey, cached)
    if (motionPathLengthCache.size > 256) motionPathLengthCache.delete(motionPathLengthCache.keys().next().value as string)
  }
  const { lengths, total } = cached
  if (total <= 0.000001) return { position: points[0], tangent: { x: 0, y: 0, z: 1 } }
  const target = clamp(progress, 0, 1) * total
  let segment = 1
  while (segment < lengths.length - 1 && lengths[segment] < target) segment += 1
  const start = points[segment - 1]
  const end = points[segment]
  const span = Math.max(0.000001, lengths[segment] - lengths[segment - 1])
  const local = clamp((target - lengths[segment - 1]) / span, 0, 1)
  const tangentLength = Math.max(0.000001, Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z))
  return {
    position: roundedVector({
      x: start.x + (end.x - start.x) * local,
      y: start.y + (end.y - start.y) * local,
      z: start.z + (end.z - start.z) * local,
    }),
    tangent: {
      x: (end.x - start.x) / tangentLength,
      y: (end.y - start.y) / tangentLength,
      z: (end.z - start.z) / tangentLength,
    },
  }
}

function applyTrackMotionPath<T extends object>(
  target: T,
  track: LibTvDirectorConsole3DTimelineTrack,
  paths: LibTvDirectorConsole3DMotionPath[],
  time: number,
) {
  const actions = [...(track.actions || [])].sort((a, b) => a.startTime - b.startTime)
  if (actions.length === 0) return target
  const action = actions.find((item) => time >= item.startTime && time <= item.startTime + item.duration)
    || (time < actions[0].startTime ? actions[0] : actions[actions.length - 1])
  const path = paths.find((item) => item.id === action.pathId && item.targetId === track.targetId)
  if (!path) return target
  const progress = clamp((time - action.startTime) / Math.max(0.01, action.duration), 0, 1)
  const sampled = sampleDirectorConsoleMotionPath(path, progress)
  if (!sampled) return target
  let result = setNumericProperty(target, "position.x", sampled.position.x)
  result = setNumericProperty(result, "position.y", sampled.position.y)
  result = setNumericProperty(result, "position.z", sampled.position.z)
  if (track.targetType === "object" && action.orientToPath) {
    const angle = Math.atan2(sampled.tangent.x, sampled.tangent.z) * 180 / Math.PI + Number(action.headingOffset || 0)
    result = setNumericProperty(result, "rotation.y", angle)
  }
  return result
}

function directorTimelineWalkPose(time: number): LibTvDirectorConsole3DJointAngles {
  const phase = time * 10.5
  const swing = Math.sin(phase)
  const lift = (1 - Math.cos(phase * 2)) / 2
  return {
    body: { bend: 1.5 + 1.2 * lift, turn: 0, tilt: 1.1 * swing },
    torso: { bend: 2, turn: -2.8 * swing, tilt: -0.8 * swing },
    head: { nod: -10, turn: 0, tilt: 0 },
    l_arm: { raise: -5 + 20 * swing, straddle: 7, turn: 0 },
    r_arm: { raise: -5 - 20 * swing, straddle: 7, turn: 0 },
    l_elbow: { bend: 23 + 5 * Math.max(0, swing) },
    r_elbow: { bend: 23 + 5 * Math.max(0, -swing) },
    l_leg: { raise: -24 * swing, straddle: 0, turn: 0 },
    r_leg: { raise: 24 * swing, straddle: 0, turn: 0 },
    l_knee: { bend: 24 * Math.max(0, -swing) + 4 * lift },
    r_knee: { bend: 24 * Math.max(0, swing) + 4 * lift },
  }
}

function sampleTrackPosition(
  target: LibTvDirectorConsole3DObject,
  track: LibTvDirectorConsole3DTimelineTrack,
  paths: LibTvDirectorConsole3DMotionPath[],
  time: number,
) {
  let sampled = applyTrackKeyframes(target, track, time)
  sampled = applyTrackMotionPath(sampled, track, paths, time)
  return sampled.position
}

/** LibTV derives auto-walk from central-difference track speed, not saved pose. */
function applyCharacterMotionGait(
  target: LibTvDirectorConsole3DObject,
  track: LibTvDirectorConsole3DTimelineTrack,
  paths: LibTvDirectorConsole3DMotionPath[],
  time: number,
  duration: number,
) {
  if (target.kind !== "character" || track.autoWalk === false) return target
  const beforeTime = clamp(time - 0.05, 0, duration)
  const afterTime = clamp(time + 0.05, 0, duration)
  if (afterTime <= beforeTime) return target
  const before = sampleTrackPosition(target, track, paths, beforeTime)
  const after = sampleTrackPosition(target, track, paths, afterTime)
  const speed = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z) / (afterTime - beforeTime)
  if (speed <= 0.05) return target
  return { ...target, jointAngles: directorTimelineWalkPose(time) }
}

/** Returns a render-only state and never mutates the persisted editor state. */
export function applyDirectorTimelineStateAtTime(state: LibTvDirectorConsole3DState, time: number): LibTvDirectorConsole3DState {
  const timeline = state.timeline && Array.isArray(state.timeline.tracks)
    ? state.timeline
    : normalizeDirectorConsoleTimeline(state, state)
  const renderTime = clamp(finiteNumber(time, 0), 0, timeline.duration)
  if (timeline.tracks.length === 0) return state

  let objects = state.objects
  let cameras = state.cameras
  timeline.tracks.forEach((track) => {
    if (track.targetType === "camera") {
      const index = cameras.findIndex((camera) => camera.id === track.targetId)
      if (index < 0) return
      const current = cameras[index]
      let next = applyTrackKeyframes(current, track, renderTime)
      next = applyTrackMotionPath(next, track, timeline.paths || [], renderTime)
      if (next === current) return
      if (cameras === state.cameras) cameras = [...state.cameras]
      cameras[index] = next
      return
    }
    const index = objects.findIndex((object) => object.id === track.targetId)
    if (index < 0) return
    const current = objects[index]
    let next = applyTrackKeyframes(current, track, renderTime)
    next = applyTrackMotionPath(next, track, timeline.paths || [], renderTime)
    next = applyCharacterMotionGait(next, track, timeline.paths || [], renderTime, timeline.duration)
    if (next === current) return
    if (objects === state.objects) objects = [...state.objects]
    objects[index] = next
  })
  if (objects === state.objects && cameras === state.cameras) return state
  return { ...state, objects, cameras }
}
