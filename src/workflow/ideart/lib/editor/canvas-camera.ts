import { CANVAS_ZOOM_STEPS, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM } from '@/workflow/ideart/lib/constants/editor-layout'
import type { CanvasLayer } from '@/workflow/ideart/lib/store/canvas-store'
import { computeLayersWorldAabb, layerEffectiveVisible } from '@/workflow/ideart/lib/editor/fit-to-content'

export type ScreenPoint = { x: number; y: number }
export type WorldPoint = { x: number; y: number }

export type CameraState = {
  zoom: number
  stagePos: { x: number; y: number } // screen-space offset in px
}

export type ViewportSize = { width: number; height: number }

const clampZoom = (value: number) =>
  Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, Number.isFinite(value) ? value : 1))

export function getNextZoomStep(currentZoom: number, direction: 'in' | 'out'): number {
  const zoom = clampZoom(currentZoom)
  return clampZoom(direction === 'in' ? zoom * 1.2 : zoom / 1.2)
}

export function snapZoomToNearestStep(currentZoom: number): number {
  const zoom = clampZoom(currentZoom)
  let bestStep: number = CANVAS_ZOOM_STEPS[0]
  let bestDistance = Math.abs(bestStep - zoom)

  for (const step of CANVAS_ZOOM_STEPS) {
    const distance = Math.abs(step - zoom)
    if (distance < bestDistance) {
      bestStep = step
      bestDistance = distance
    }
  }

  return bestStep
}

export function normalizeWheelDeltas(evt: WheelEvent): { dx: number; dy: number } {
  let dx = Number(evt.deltaX || 0)
  let dy = Number(evt.deltaY || 0)
  // deltaMode: 0=pixel, 1=line, 2=page
  if (evt.deltaMode === 1) {
    dx *= 16
    dy *= 16
  } else if (evt.deltaMode === 2) {
    const page = typeof window !== 'undefined' ? window.innerHeight || 800 : 800
    dx *= page
    dy *= page
  }
  return { dx, dy }
}

export function computeWheelZoomScale(params: {
  oldScale: number
  wheelDy: number
  isTrackpadLike: boolean
}): number {
  const oldScale = Math.max(0.0001, Math.abs(params.oldScale || 1))
  const dy = Number(params.wheelDy || 0)
  // Negative dy should zoom in. We use an exponential mapping for smoothness.
  // Trackpads emit small deltas at high frequency; mouse wheels emit larger steps.
  const k = params.isTrackpadLike ? 0.0032 : 0.0019
  const exponent = Math.max(-0.8, Math.min(0.8, -dy * k))
  return oldScale * Math.exp(exponent)
}

export function screenToWorld(p: ScreenPoint, camera: CameraState): WorldPoint {
  const z = Math.max(0.0001, Math.abs(Number(camera.zoom || 1)))
  return {
    x: (Number(p.x) - Number(camera.stagePos.x || 0)) / z,
    y: (Number(p.y) - Number(camera.stagePos.y || 0)) / z,
  }
}

export function worldToScreen(p: WorldPoint, camera: CameraState): ScreenPoint {
  const z = Math.max(0.0001, Math.abs(Number(camera.zoom || 1)))
  return {
    x: Number(p.x) * z + Number(camera.stagePos.x || 0),
    y: Number(p.y) * z + Number(camera.stagePos.y || 0),
  }
}

export function getViewportCenterWorld(camera: CameraState, viewport: ViewportSize): WorldPoint {
  return screenToWorld({ x: viewport.width / 2, y: viewport.height / 2 }, camera)
}

// Zoom while keeping a specific screen point fixed (pointer-anchored zoom).
export function zoomAtScreenPoint(params: {
  camera: CameraState
  nextZoom: number
  screenAnchor: ScreenPoint
}): CameraState {
  const nextZoom = clampZoom(params.nextZoom)
  const prevZoom = Math.max(0.0001, Math.abs(Number(params.camera.zoom || 1)))
  const anchorWorld = screenToWorld(params.screenAnchor, { zoom: prevZoom, stagePos: params.camera.stagePos })
  return {
    zoom: nextZoom,
    stagePos: {
      x: Number(params.screenAnchor.x) - anchorWorld.x * nextZoom,
      y: Number(params.screenAnchor.y) - anchorWorld.y * nextZoom,
    },
  }
}

export function zoomAtViewportCenter(params: {
  camera: CameraState
  nextZoom: number
  viewport: ViewportSize
}): CameraState {
  return zoomAtScreenPoint({
    camera: params.camera,
    nextZoom: params.nextZoom,
    screenAnchor: { x: params.viewport.width / 2, y: params.viewport.height / 2 },
  })
}

export function fitWorldRectToViewport(params: {
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  viewport: ViewportSize
  padding?: number
  maxZoomIn?: number // default 1 (100%)
}): CameraState {
  const padding = Math.max(0, Number(params.padding ?? 140))
  const vw = Math.max(1, Number(params.viewport.width || 1))
  const vh = Math.max(1, Number(params.viewport.height || 1))
  const contentW = Math.max(1, Number(params.bounds.maxX - params.bounds.minX))
  const contentH = Math.max(1, Number(params.bounds.maxY - params.bounds.minY))
  const centerX = params.bounds.minX + contentW / 2
  const centerY = params.bounds.minY + contentH / 2
  const scaleX = (vw - padding * 2) / contentW
  const scaleY = (vh - padding * 2) / contentH
  const maxZoomIn = Number.isFinite(params.maxZoomIn) ? Number(params.maxZoomIn) : 1
  const nextZoom = clampZoom(Math.min(scaleX, scaleY, maxZoomIn))
  return {
    zoom: nextZoom,
    stagePos: {
      x: vw / 2 - centerX * nextZoom,
      y: vh / 2 - centerY * nextZoom,
    },
  }
}

export function fitLayersToViewport(params: {
  allLayers: CanvasLayer[]
  candidateLayers?: CanvasLayer[]
  viewport: ViewportSize
  padding?: number
  widthFallback?: number
  heightFallback?: number
  maxZoomIn?: number
}): CameraState | null {
  const candidateLayers = params.candidateLayers ?? params.allLayers
  const layerById = new Map(params.allLayers.map((l) => [l.id, l]))
  const visibleCandidates = candidateLayers.filter((layer) => layerEffectiveVisible(layer, layerById))
  const bounds = computeLayersWorldAabb({
    allLayers: params.allLayers,
    candidateLayers: visibleCandidates,
    widthFallback: params.widthFallback ?? 200,
    heightFallback: params.heightFallback ?? 200,
  })
  if (!bounds) return null
  return fitWorldRectToViewport({
    bounds,
    viewport: params.viewport,
    padding: params.padding,
    maxZoomIn: params.maxZoomIn,
  })
}
