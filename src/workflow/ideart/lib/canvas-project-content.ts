import type { CanvasLayer } from "@/workflow/ideart/lib/store/canvas-store"
import type { ProjectMaterialItem } from "@/workflow/ideart/lib/store/canvas-store"
import {
  EMPTY_LIBTV_WORKFLOW_STATE,
  normalizeLibTvWorkflowState,
  type LibTvWorkflowState,
} from "@/workflow/ideart/lib/libtv/workflow"

export interface CanvasProjectContentDocument {
  version: 2
  layers: CanvasLayer[]
  libtvWorkflow: LibTvWorkflowState
  libtvCanvases?: LibTvProjectCanvas[]
  activeLibTvCanvasId?: string
  projectMaterials?: ProjectMaterialItem[]
}

export interface LibTvProjectCanvas {
  id: string
  name: string
  libtvWorkflow: LibTvWorkflowState
  viewport?: LibTvProjectCanvasViewport
  createdAt?: number
  updatedAt?: number
}

export interface LibTvProjectCanvasViewport {
  x: number
  y: number
  zoom: number
}

export const DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT: LibTvProjectCanvasViewport = { x: 0, y: 0, zoom: 1 }

export function normalizeLibTvProjectCanvasViewport(input: unknown): LibTvProjectCanvasViewport {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input as Partial<LibTvProjectCanvasViewport>
    : DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT
  const x = Number(raw.x)
  const y = Number(raw.y)
  const zoom = Number(raw.zoom)
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    zoom: Number.isFinite(zoom) ? Math.max(0.15, Math.min(8, zoom)) : 1,
  }
}

export function normalizeLibTvProjectCanvases(input: unknown, fallbackWorkflow?: unknown): LibTvProjectCanvas[] {
  const fallback = normalizeLibTvWorkflowState(fallbackWorkflow)
  if (!Array.isArray(input)) {
    return [{
      id: "default",
      name: "画布 1",
      libtvWorkflow: fallback,
      viewport: { ...DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }]
  }

  const canvases = input
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((item, index) => {
      const id = String(item.id || item.canvasId || "").trim() || (index === 0 ? "default" : `canvas-${index + 1}`)
      const name = String(item.name || item.title || "").trim() || `画布 ${index + 1}`
      return {
        id,
        name,
        libtvWorkflow: normalizeLibTvWorkflowState(item.libtvWorkflow ?? item.workflow),
        viewport: normalizeLibTvProjectCanvasViewport(item.viewport),
        createdAt: Number.isFinite(Number(item.createdAt)) ? Number(item.createdAt) : undefined,
        updatedAt: Number.isFinite(Number(item.updatedAt)) ? Number(item.updatedAt) : undefined,
      }
    })

  return canvases.length > 0 ? canvases : [{
    id: "default",
    name: "画布 1",
    libtvWorkflow: fallback,
    viewport: { ...DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }]
}

export function normalizeCanvasProjectContent(input: unknown): CanvasProjectContentDocument {
  if (Array.isArray(input)) {
    const libtvWorkflow = { ...EMPTY_LIBTV_WORKFLOW_STATE }
    return {
      version: 2,
      layers: input as CanvasLayer[],
      libtvWorkflow,
      libtvCanvases: normalizeLibTvProjectCanvases(undefined, libtvWorkflow),
      activeLibTvCanvasId: "default",
      projectMaterials: [],
    }
  }

  if (input && typeof input === "object") {
    const raw = input as Partial<CanvasProjectContentDocument> & { workflow?: unknown }
    const layers = Array.isArray(raw.layers)
      ? (raw.layers as CanvasLayer[])
      : []
    const projectMaterials = Array.isArray(raw.projectMaterials)
      ? (raw.projectMaterials as ProjectMaterialItem[])
      : []
    const libtvWorkflow = normalizeLibTvWorkflowState(raw.libtvWorkflow ?? raw.workflow)
    const libtvCanvases = normalizeLibTvProjectCanvases(raw.libtvCanvases, libtvWorkflow)
    const requestedActiveCanvasId = String(raw.activeLibTvCanvasId || "").trim()
    const activeCanvas = libtvCanvases.find((canvas) => canvas.id === requestedActiveCanvasId) || libtvCanvases[0]
    const activeLibTvCanvasId = activeCanvas?.id || "default"
    return {
      version: 2,
      layers,
      libtvWorkflow: activeCanvas ? activeCanvas.libtvWorkflow : libtvWorkflow,
      libtvCanvases,
      activeLibTvCanvasId,
      projectMaterials,
    }
  }

  const libtvWorkflow = { ...EMPTY_LIBTV_WORKFLOW_STATE }
  return {
    version: 2,
    layers: [],
    libtvWorkflow,
    libtvCanvases: normalizeLibTvProjectCanvases(undefined, libtvWorkflow),
    activeLibTvCanvasId: "default",
    projectMaterials: [],
  }
}

export function buildCanvasProjectContentDocument(params: {
  layers: CanvasLayer[]
  libtvWorkflow: LibTvWorkflowState
  libtvCanvases?: LibTvProjectCanvas[]
  activeLibTvCanvasId?: string
  projectMaterials?: ProjectMaterialItem[]
}): CanvasProjectContentDocument {
  const normalizedWorkflow = normalizeLibTvWorkflowState(params.libtvWorkflow)
  const normalizedCanvases = normalizeLibTvProjectCanvases(params.libtvCanvases, normalizedWorkflow)
  const requestedActiveCanvasId = String(params.activeLibTvCanvasId || "").trim()
  const activeCanvas = normalizedCanvases.find((canvas) => canvas.id === requestedActiveCanvasId) || normalizedCanvases[0]
  const activeLibTvCanvasId = activeCanvas?.id || "default"
  const libtvCanvases = normalizedCanvases.map((canvas) => canvas.id === activeLibTvCanvasId
    ? { ...canvas, libtvWorkflow: normalizedWorkflow }
    : canvas)
  return {
    version: 2,
    layers: params.layers,
    libtvWorkflow: normalizedWorkflow,
    libtvCanvases,
    activeLibTvCanvasId,
    projectMaterials: Array.isArray(params.projectMaterials) ? params.projectMaterials : [],
  }
}
