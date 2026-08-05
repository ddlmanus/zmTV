import type { LibTvWorkflowEdge } from "@/workflow/ideart/lib/libtv/workflow"
import type { CanvasLayer } from "@/workflow/ideart/lib/store/canvas-store"
import { LIBTV_SCRIPT_STORYBOARD_OPTION_IDS } from "@/workflow/ideart/lib/libtv/skill-capabilities"

export const LIBTV_RUN_GROUP_WORKFLOW_EVENT = "zmtv:run-group-workflow"
export const LIBTV_STORYBOARD_GROUP_REGENERATE_EVENT = "zmtv:storyboard-group-regenerate"
export const LIBTV_STORYBOARD_GROUP_GENERATE_VIDEOS_EVENT = "zmtv:storyboard-group-generate-videos"
export const LIBTV_WORKFLOW_GROUP_SUBTYPE = "zmtv-workflow-group"
export const LIBTV_WORKFLOW_TOOLBOX_STORAGE_KEY = "ideart:zmtv:workflow-toolbox"
const LEGACY_LIBTV_WORKFLOW_TOOLBOX_STORAGE_KEY = "ideart:libtv:workflow-toolbox"
export const LIBTV_WORKFLOW_GROUP_LAYOUT = {
  paddingX: 28,
  paddingBottom: 26,
  headerHeight: 42,
  minWidth: 320,
  minHeight: 160,
} as const

const STORYBOARD_OPTION_IDS = LIBTV_SCRIPT_STORYBOARD_OPTION_IDS

export interface SavedLibTvWorkflow {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  coverSrc?: string
  tags?: string[]
  remark?: string
  rootGroupId: string
  nodeIds: string[]
  layers: CanvasLayer[]
  edges: LibTvWorkflowEdge[]
}

export interface LibTvRunGroupWorkflowEventDetail {
  targetNodeIds: string[]
}

export interface LibTvStoryboardGroupActionEventDetail {
  groupId: string
  placeholderRootId: string
}

export interface LibTvStoryboardPlaceholderGroupInfo {
  groupLayer: CanvasLayer
  childLayers: CanvasLayer[]
  placeholderRootId: string
  sourceLayer: CanvasLayer | null
}

export interface LibTvWorkflowGroupCandidate {
  groupLayer: CanvasLayer
  descendantLayers: CanvasLayer[]
  nodeLayers: CanvasLayer[]
  internalEdges: LibTvWorkflowEdge[]
  sinkNodeIds: string[]
  invalidReason: string | null
}

function sortLayersByInputOrder(layers: CanvasLayer[], originalLayers: CanvasLayer[]) {
  const indexById = new Map(originalLayers.map((layer, index) => [layer.id, index]))
  return [...layers].sort((a, b) => (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0))
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createSavedWorkflowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `workflow-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeSavedLibTvWorkflow(value: unknown): SavedLibTvWorkflow | null {
  if (!value || typeof value !== "object") return null
  const input = value as Record<string, unknown>
  const id = String(input.id || "").trim()
  const name = String(input.name || "").trim()
  const rootGroupId = String(input.rootGroupId || "").trim()
  const createdAt = Number(input.createdAt || 0)
  const updatedAt = Number(input.updatedAt || 0)
  const nodeIds = Array.isArray(input.nodeIds)
    ? input.nodeIds.map((item) => String(item || "").trim()).filter(Boolean)
    : []
  const layers = Array.isArray(input.layers)
    ? input.layers.filter((item): item is CanvasLayer => Boolean(item && typeof item === "object")).map((item) => cloneJsonValue(item))
    : []
  const edges = Array.isArray(input.edges)
    ? input.edges
      .filter((item): item is LibTvWorkflowEdge => Boolean(item && typeof item === "object"))
      .map((item) => ({
        id: String(item.id || "").trim(),
        source: String(item.source || "").trim(),
        target: String(item.target || "").trim(),
      }))
      .filter((item) => item.id && item.source && item.target)
    : []
  if (!id || !name || !rootGroupId || !createdAt || !updatedAt || layers.length === 0) return null
  return {
    id,
    name,
    createdAt,
    updatedAt,
    coverSrc: String(input.coverSrc || "").trim() || undefined,
    tags: Array.isArray(input.tags)
      ? input.tags.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
      : [],
    remark: String(input.remark || "").trim() || undefined,
    rootGroupId,
    nodeIds,
    layers,
    edges,
  }
}

export function listSavedLibTvWorkflows(): SavedLibTvWorkflow[] {
  if (typeof window === "undefined" || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(LIBTV_WORKFLOW_TOOLBOX_STORAGE_KEY)
      || window.localStorage.getItem(LEGACY_LIBTV_WORKFLOW_TOOLBOX_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeSavedLibTvWorkflow(item))
      .filter((item): item is SavedLibTvWorkflow => Boolean(item))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function writeSavedLibTvWorkflows(items: SavedLibTvWorkflow[]) {
  if (typeof window === "undefined" || !window.localStorage) return
  window.localStorage.setItem(LIBTV_WORKFLOW_TOOLBOX_STORAGE_KEY, JSON.stringify(items))
}

export function upsertSavedLibTvWorkflow(item: SavedLibTvWorkflow) {
  const normalized = normalizeSavedLibTvWorkflow(item)
  if (!normalized) return []
  const current = listSavedLibTvWorkflows()
  const next = [
    normalized,
    ...current.filter((entry) => entry.id !== normalized.id),
  ].sort((a, b) => b.updatedAt - a.updatedAt)
  writeSavedLibTvWorkflows(next)
  return next
}

export function buildSavedLibTvWorkflow(
  candidate: LibTvWorkflowGroupCandidate,
  allLayers: CanvasLayer[],
  options: {
    id?: string
    name: string
    coverSrc?: string
    tags?: string[]
    remark?: string
  }
): SavedLibTvWorkflow {
  const now = Date.now()
  const existingId = String(options.id || "").trim()
  const orderedLayers = sortLayersByInputOrder(
    [candidate.groupLayer, ...candidate.descendantLayers],
    allLayers
  )
  return {
    id: existingId || createSavedWorkflowId(),
    name: String(options.name || "").trim() || "工具箱",
    createdAt: existingId
      ? (listSavedLibTvWorkflows().find((item) => item.id === existingId)?.createdAt || now)
      : now,
    updatedAt: now,
    coverSrc: String(options.coverSrc || "").trim() || undefined,
    tags: Array.isArray(options.tags)
      ? options.tags.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5)
      : [],
    remark: String(options.remark || "").trim() || undefined,
    rootGroupId: candidate.groupLayer.id,
    nodeIds: candidate.nodeLayers.map((layer) => layer.id),
    layers: orderedLayers.map((layer) => cloneJsonValue(layer)),
    edges: candidate.internalEdges.map((edge) => cloneJsonValue(edge)),
  }
}

export function isLibTvWorkflowGroupLayer(layer: CanvasLayer | null | undefined): layer is CanvasLayer {
  return Boolean(layer && layer.type === "group" && layer.subtype === LIBTV_WORKFLOW_GROUP_SUBTYPE)
}

export function getLibTvStoryboardPlaceholderGroupInfo(
  groupLayer: CanvasLayer | null | undefined,
  layers: CanvasLayer[]
): LibTvStoryboardPlaceholderGroupInfo | null {
  if (!isLibTvWorkflowGroupLayer(groupLayer)) return null
  const normalizedGroupLayer = groupLayer

  const childIds = Array.isArray(normalizedGroupLayer.children)
    ? normalizedGroupLayer.children.map((item) => String(item || "").trim()).filter(Boolean)
    : []
  if (childIds.length === 0) return null

  const childLayers = childIds
    .map((childId) => layers.find((layer) => layer.id === childId))
    .filter((layer): layer is CanvasLayer => Boolean(layer))
  if (childLayers.length === 0) return null

  const placeholderRootIds = Array.from(new Set(
    childLayers
      .map((layer) => String(layer.genPlaceholderRootId || "").trim())
      .filter(Boolean)
  ))
  if (placeholderRootIds.length !== 1) return null

  const placeholderRootId = placeholderRootIds[0]
  if (!childLayers.every((layer) => String(layer.genPlaceholderRootId || "").trim() === placeholderRootId)) {
    return null
  }

  return {
    groupLayer: normalizedGroupLayer,
    childLayers,
    placeholderRootId,
    sourceLayer: layers.find((layer) => layer.id === placeholderRootId) || null,
  }
}

export function isLibTvStoryboardLayer(layer: CanvasLayer | null | undefined) {
  if (!layer || layer.libtvNodeKind !== "script") return false
  const optionId = String(layer.libtvOptionId || "").trim()
  return STORYBOARD_OPTION_IDS.has(optionId) || Boolean(layer.libtvScriptResult)
}

export function getLibTvGroupingBlockReason(layers: CanvasLayer[], selectedIds: string[]) {
  if (selectedIds.length < 2) return null
  const selectedLayers = layers.filter((layer) => selectedIds.includes(layer.id))
  if (selectedLayers.some((layer) => isLibTvStoryboardLayer(layer))) {
    return "框选到分镜表后不可打组"
  }
  return null
}

export function collectGroupDescendantLayers(layers: CanvasLayer[], groupId: string) {
  const groupLayer = layers.find((layer) => layer.id === groupId)
  const softChildIds = Array.isArray(groupLayer?.children) ? groupLayer.children : []
  if (softChildIds.length > 0) {
    const byId = new Map(layers.map((layer) => [layer.id, layer]))
    const output = softChildIds
      .map((childId) => byId.get(childId))
      .filter((layer): layer is CanvasLayer => Boolean(layer))
    return sortLayersByInputOrder(output, layers)
  }

  const childrenByParent = new Map<string, CanvasLayer[]>()
  for (const layer of layers) {
    const parentId = String(layer.parentId || "").trim()
    if (!parentId) continue
    const list = childrenByParent.get(parentId) || []
    list.push(layer)
    childrenByParent.set(parentId, list)
  }

  const output: CanvasLayer[] = []
  const visited = new Set<string>()
  const queue = [...(childrenByParent.get(groupId) || [])]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current.id)) continue
    visited.add(current.id)
    output.push(current)
    const children = childrenByParent.get(current.id) || []
    queue.push(...children)
  }

  return sortLayersByInputOrder(output, layers)
}

export function getSelectedLibTvWorkflowGroupCandidate(
  layers: CanvasLayer[],
  selectedIds: string[],
  edges: LibTvWorkflowEdge[]
): LibTvWorkflowGroupCandidate | null {
  if (selectedIds.length !== 1) return null
  const selectedLayer = layers.find((layer) => layer.id === selectedIds[0])
  if (!selectedLayer || selectedLayer.type !== "group") return null

  const descendantLayers = collectGroupDescendantLayers(layers, selectedLayer.id)
  const nonGroupLayers = descendantLayers.filter((layer) => layer.type !== "group")
  const nodeLayers = nonGroupLayers.filter((layer) => Boolean(layer.libtvNodeKind))
  const nodeIdSet = new Set(nodeLayers.map((layer) => layer.id))
  const internalEdges = edges
    .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
    .sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target))

  let invalidReason: string | null = null
  if (descendantLayers.length === 0) {
    invalidReason = "当前编组里没有节点"
  } else if (nonGroupLayers.length === 0) {
    invalidReason = "当前编组里没有可用节点"
  } else if (nonGroupLayers.some((layer) => !layer.libtvNodeKind)) {
    invalidReason = "仅支持保存纯 LibTV 工作流编组"
  } else if (nodeLayers.some((layer) => isLibTvStoryboardLayer(layer))) {
    invalidReason = "分镜表节点不支持该操作"
  }

  const outgoingCount = new Map<string, number>()
  for (const edge of internalEdges) {
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) || 0) + 1)
  }

  const sinkNodeIds = [...nodeLayers]
    .filter((layer) => (outgoingCount.get(layer.id) || 0) === 0)
    .sort((a, b) => Number(a.x || 0) - Number(b.x || 0) || Number(a.y || 0) - Number(b.y || 0))
    .map((layer) => layer.id)

  return {
    groupLayer: selectedLayer,
    descendantLayers,
    nodeLayers,
    internalEdges,
    sinkNodeIds,
    invalidReason,
  }
}

export function getLibTvWorkflowGroupBounds(
  groupLayer: CanvasLayer,
  layers: CanvasLayer[]
) {
  const childIds = Array.isArray(groupLayer.children) ? groupLayer.children : []
  const childLayers = childIds
    .map((childId) => layers.find((layer) => layer.id === childId))
    .filter((layer): layer is CanvasLayer => Boolean(layer))

  if (childLayers.length === 0) return null

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const layer of childLayers) {
    const x = Number(layer.x || 0)
    const y = Number(layer.y || 0)
    const width = Math.max(0, Number(layer.width || 0))
    const height = Math.max(0, Number(layer.height || 0))
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + width)
    maxY = Math.max(maxY, y + height)
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null
  }

  return {
    x: minX - LIBTV_WORKFLOW_GROUP_LAYOUT.paddingX,
    y: minY - LIBTV_WORKFLOW_GROUP_LAYOUT.headerHeight,
    width: Math.max(
      Math.max(0, Number(groupLayer.manualGroupWidth || 0)),
      LIBTV_WORKFLOW_GROUP_LAYOUT.minWidth,
      (maxX - minX) + LIBTV_WORKFLOW_GROUP_LAYOUT.paddingX * 2
    ),
    height: Math.max(
      Math.max(0, Number(groupLayer.manualGroupHeight || 0)),
      LIBTV_WORKFLOW_GROUP_LAYOUT.minHeight,
      (maxY - minY) + LIBTV_WORKFLOW_GROUP_LAYOUT.headerHeight + LIBTV_WORKFLOW_GROUP_LAYOUT.paddingBottom
    ),
  }
}
