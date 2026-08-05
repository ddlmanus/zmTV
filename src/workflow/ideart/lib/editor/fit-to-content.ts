import type { CanvasLayer } from '@/workflow/ideart/lib/store/canvas-store'

export type WorldRect = { minX: number; minY: number; maxX: number; maxY: number }

const degToRad = (deg: number) => (deg * Math.PI) / 180

type Mat = { a: number; b: number; c: number; d: number; e: number; f: number }
const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

const mul = (m1: Mat, m2: Mat): Mat => ({
  a: m1.a * m2.a + m1.c * m2.b,
  b: m1.b * m2.a + m1.d * m2.b,
  c: m1.a * m2.c + m1.c * m2.d,
  d: m1.b * m2.c + m1.d * m2.d,
  e: m1.a * m2.e + m1.c * m2.f + m1.e,
  f: m1.b * m2.e + m1.d * m2.f + m1.f,
})

const apply = (m: Mat, x: number, y: number) => ({
  x: m.a * x + m.c * y + m.e,
  y: m.b * x + m.d * y + m.f,
})

const localMat = (layer: CanvasLayer): Mat => {
  const x = Number(layer.x || 0)
  const y = Number(layer.y || 0)
  const sx = Number.isFinite(Number(layer.scaleX)) ? Number(layer.scaleX) : 1
  const sy = Number.isFinite(Number(layer.scaleY)) ? Number(layer.scaleY) : 1
  const rad = degToRad(Number(layer.rotation || 0))
  const c = Math.cos(rad)
  const s = Math.sin(rad)

  // M = T(x,y) * R(rad) * S(sx,sy)
  const S: Mat = { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
  const R: Mat = { a: c, b: s, c: -s, d: c, e: 0, f: 0 }
  const T: Mat = { a: 1, b: 0, c: 0, d: 1, e: x, f: y }
  return mul(T, mul(R, S))
}

export function layerEffectiveVisible(layer: CanvasLayer, layerById: Map<string, CanvasLayer>): boolean {
  let cur: CanvasLayer | undefined = layer
  let guard = 0
  while (cur && guard < 2000) {
    if (cur.visible === false) return false
    if (!cur.parentId) return true
    cur = layerById.get(cur.parentId)
    guard += 1
  }
  return true
}

export function computeLayerWorldAabb(
  layer: CanvasLayer,
  _layerById: Map<string, CanvasLayer>,
  widthFallback = 200,
  heightFallback = 200
): WorldRect | null {
  const w = Math.max(0, Number(layer.width ?? widthFallback))
  const h = Math.max(0, Number(layer.height ?? heightFallback))
  if (!(w > 0 && h > 0)) return null

  const m = mul(IDENTITY, localMat(layer))
  // NOTE: This standalone helper does not apply parent transforms. Prefer computeLayersWorldAabb
  // when you need correct results for grouped layers.
  const corners = [
    apply(m, 0, 0),
    apply(m, w, 0),
    apply(m, 0, h),
    apply(m, w, h),
  ]

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of corners) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null
  return { minX, minY, maxX, maxY }
}

export function unionRects(rects: Array<WorldRect | null>): WorldRect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const r of rects) {
    if (!r) continue
    minX = Math.min(minX, r.minX)
    minY = Math.min(minY, r.minY)
    maxX = Math.max(maxX, r.maxX)
    maxY = Math.max(maxY, r.maxY)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }
  return { minX, minY, maxX, maxY }
}

export function computeLayersWorldAabb(params: {
  allLayers: CanvasLayer[]
  candidateLayers: CanvasLayer[]
  widthFallback?: number
  heightFallback?: number
}): WorldRect | null {
  const { allLayers, candidateLayers, widthFallback = 200, heightFallback = 200 } = params
  const layerById = new Map(allLayers.map((l) => [l.id, l]))
  const memo = new Map<string, Mat>()

  const worldMatOf = (id: string): Mat => {
    const cached = memo.get(id)
    if (cached) return cached
    const l = layerById.get(id)
    if (!l) return IDENTITY
    const parent = l.parentId ? worldMatOf(l.parentId) : IDENTITY
    const wm = mul(parent, localMat(l))
    memo.set(id, wm)
    return wm
  }

  const rects: Array<WorldRect | null> = []
  for (const layer of candidateLayers) {
    if (!layer) continue
    const w = Math.max(0, Number(layer.width ?? widthFallback))
    const h = Math.max(0, Number(layer.height ?? heightFallback))
    if (!(w > 0 && h > 0)) continue
    const m = worldMatOf(layer.id)
    const corners = [
      apply(m, 0, 0),
      apply(m, w, 0),
      apply(m, 0, h),
      apply(m, w, h),
    ]
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of corners) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
    rects.push(Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null)
  }

  return unionRects(rects)
}
