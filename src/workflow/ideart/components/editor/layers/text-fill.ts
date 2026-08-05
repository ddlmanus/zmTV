export type TextFillPriority = 'color' | 'linear-gradient' | 'radial-gradient' | 'pattern'

export const resolveTextFillPresentation = (
  fillType: unknown,
  resolvedSolidFill: string,
  gradientType?: unknown,
) => {
  const normalized = String(fillType || '').trim().toLowerCase()
  const solidTextFill = !normalized || normalized === 'solid' ? resolvedSolidFill : undefined
  const fillPriority: TextFillPriority = normalized === 'gradient'
    ? (String(gradientType || '').trim().toLowerCase() === 'radial' ? 'radial-gradient' : 'linear-gradient')
    : (normalized === 'pattern' ? 'pattern' : 'color')
  return {
    solidTextFill,
    fillPriority,
    fillEnabled: Boolean(solidTextFill) || normalized === 'gradient' || normalized === 'pattern',
  }
}

export const isLayerSeparationV2Schema = (schemaVersion: unknown): boolean => {
  const normalized = String(schemaVersion || '').trim().toLowerCase()
  return normalized === '2.0' || normalized.includes('layer-separation.v2')
}

export const shouldInferLegacySeparatedTextEffects = (params: {
  isLayerSeparationText: boolean
  schemaVersion?: unknown
  hasExplicitEffects: boolean
}): boolean => params.isLayerSeparationText
  && !params.hasExplicitEffects
  && !isLayerSeparationV2Schema(params.schemaVersion)

const finite = (value: unknown, fallback: number) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const normalizeHalfTurn = (angle: number) => {
  let normalized = angle
  while (normalized <= -180) normalized += 360
  while (normalized > 180) normalized -= 360
  return normalized
}

const alignHalfTurnToReference = (angle: number, reference: number) => {
  let aligned = normalizeHalfTurn(angle)
  while (aligned - reference > 90) aligned -= 180
  while (aligned - reference <= -90) aligned += 180
  return normalizeHalfTurn(aligned)
}

const halfTurnDistance = (left: number, right: number) => {
  const delta = Math.abs(normalizeHalfTurn(left - right))
  return Math.min(delta, Math.abs(180 - delta))
}

/** Converts OCR's source-pixel polygon into the oriented rectangle expected by
 * Konva and PSD text transforms. OCR bbox is only an AABB and cannot preserve
 * rotated text dimensions on its own. */
export const resolveSeparatedTextGeometry = (params: {
  x?: unknown
  y?: unknown
  w?: unknown
  h?: unknown
  rotation?: unknown
  polygon?: unknown
}) => {
  const x = finite(params.x, 0)
  const y = finite(params.y, 0)
  const w = Math.max(1, finite(params.w, 200))
  const h = Math.max(1, finite(params.h, 40))
  const declaredRotation = normalizeHalfTurn(finite(params.rotation, 0))
  const source = Array.isArray(params.polygon) ? params.polygon : []
  const pairs = Array.isArray(source[0])
    ? source
    : Array.from({ length: Math.floor(source.length / 2) }, (_, index) => [source[index * 2], source[index * 2 + 1]])
  const points = pairs.flatMap((pair) => {
    const point = pair as unknown
    const px = finite(Array.isArray(point) ? point[0] : (point as { x?: unknown })?.x, Number.NaN)
    const py = finite(Array.isArray(point) ? point[1] : (point as { y?: unknown })?.y, Number.NaN)
    return Number.isFinite(px) && Number.isFinite(py) ? [{ x: px, y: py }] : []
  })

  const uniqueRoundedX = new Set(points.map((point) => Math.round(point.x * 1000)))
  const uniqueRoundedY = new Set(points.map((point) => Math.round(point.y * 1000)))
  const isAxisAlignedFallback = points.length >= 4
    && uniqueRoundedX.size <= 2
    && uniqueRoundedY.size <= 2
    && Math.abs(declaredRotation) > 0.01

  if (points.length >= 3 && !isAxisAlignedFallback) {
    const edges = points.flatMap((point, index) => {
      const next = points[(index + 1) % points.length]
      const dx = next.x - point.x
      const dy = next.y - point.y
      const length = Math.hypot(dx, dy)
      return length > 0.5 ? [{ angle: (Math.atan2(dy, dx) * 180) / Math.PI, length }] : []
    })
    const edge = edges.sort((left, right) => {
      const distance = halfTurnDistance(left.angle, declaredRotation) - halfTurnDistance(right.angle, declaredRotation)
      return Math.abs(distance) > 0.001 ? distance : right.length - left.length
    })[0]
    if (edge) {
      const rotation = alignHalfTurnToReference(edge.angle, declaredRotation)
      const radians = (rotation * Math.PI) / 180
      const ux = Math.cos(radians)
      const uy = Math.sin(radians)
      const vx = -uy
      const vy = ux
      const projectedX = points.map((point) => point.x * ux + point.y * uy)
      const projectedY = points.map((point) => point.x * vx + point.y * vy)
      const minX = Math.min(...projectedX)
      const maxX = Math.max(...projectedX)
      const minY = Math.min(...projectedY)
      const maxY = Math.max(...projectedY)
      return {
        x: minX * ux + minY * vx,
        y: minX * uy + minY * vy,
        w: Math.max(1, maxX - minX),
        h: Math.max(1, maxY - minY),
        rotation,
      }
    }
  }

  if (!declaredRotation) return { x, y, w, h, rotation: 0 }
  const rotationRad = (declaredRotation * Math.PI) / 180
  const cos = Math.cos(rotationRad)
  const sin = Math.sin(rotationRad)
  return {
    x: x + w / 2 + (-w / 2) * cos + (h / 2) * sin,
    y: y + h / 2 + (-w / 2) * sin - (h / 2) * cos,
    w,
    h,
    rotation: declaredRotation,
  }
}

/** Canvas stores a gradient axis as two local points. For radial gradients the
 * midpoint is the center and half of the axis length is the outer radius. */
export const resolveRadialTextGradientGeometry = (params: {
  start?: { x?: unknown; y?: unknown }
  end?: { x?: unknown; y?: unknown }
  width?: unknown
  height?: unknown
}) => {
  const width = Math.max(1, finite(params.width, 1))
  const height = Math.max(1, finite(params.height, 1))
  const fallbackStart = { x: 0, y: height / 2 }
  const fallbackEnd = { x: width, y: height / 2 }
  const start = {
    x: finite(params.start?.x, fallbackStart.x),
    y: finite(params.start?.y, fallbackStart.y),
  }
  const end = {
    x: finite(params.end?.x, fallbackEnd.x),
    y: finite(params.end?.y, fallbackEnd.y),
  }
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const radius = Math.max(0.5, Math.hypot(end.x - start.x, end.y - start.y) / 2)
  return {
    startPoint: center,
    endPoint: center,
    startRadius: 0,
    endRadius: radius,
  }
}
