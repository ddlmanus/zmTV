/**
 * Spatial virtualization helpers for the LibTV canvas.
 *
 * The workflow document can contain many more records than the browser should
 * mount as ReactFlow nodes.  The index keeps the expensive viewport lookup
 * bounded by the number of occupied grid cells instead of walking the whole
 * document on every pan/zoom completion.
 */

export const LIBTV_WORKFLOW_VIRTUALIZATION_THRESHOLD = 600
export const LIBTV_WORKFLOW_VIRTUAL_NODE_LIMIT = 560
export const LIBTV_WORKFLOW_VIRTUAL_OVERSCAN_PX = 720
export const LIBTV_WORKFLOW_VIRTUAL_CELL_SIZE = 1024

export type LibTvViewportRect = {
  x: number
  y: number
  width: number
  height: number
}

export type LibTvViewportLike = {
  x: number
  y: number
  zoom: number
}

export type LibTvViewportNodeLike = {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  parentId?: string
  position?: { x?: number; y?: number }
  style?: { width?: number | string; height?: number | string }
}

export type LibTvViewportIndexOptions<T> = {
  cellSize?: number
  getRect?: (node: T) => LibTvViewportRect
}

export type LibTvViewportQueryOptions = {
  maxNodes?: number
  overscanPx?: number
  forcedIds?: ReadonlySet<string>
  fallbackId?: string
}

export type LibTvViewportQueryResult<T> = {
  nodes: T[]
  ids: Set<string>
  candidateCount: number
  visibleCount: number
  capped: boolean
  totalCount: number
}

type IndexedNode<T> = {
  node: T
  id: string
  index: number
  rect: LibTvViewportRect
}

type HeapEntry<T> = {
  item: IndexedNode<T>
  distance: number
}

function finite(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function positive(value: unknown, fallback = 1) {
  return Math.max(1, finite(value, fallback))
}

function intersects(left: LibTvViewportRect, right: LibTvViewportRect) {
  return left.x <= right.x + right.width
    && left.x + left.width >= right.x
    && left.y <= right.y + right.height
    && left.y + left.height >= right.y
}

function cellKey(x: number, y: number) {
  return `${x}:${y}`
}

function normalizeRect(rect: LibTvViewportRect): LibTvViewportRect {
  return {
    x: finite(rect.x),
    y: finite(rect.y),
    width: positive(rect.width),
    height: positive(rect.height),
  }
}

function resolveDefaultRect<T extends LibTvViewportNodeLike>(node: T): LibTvViewportRect {
  const width = positive(node.style?.width ?? node.width, 1)
  const height = positive(node.style?.height ?? node.height, 1)
  return {
    x: finite(node.position?.x ?? node.x),
    y: finite(node.position?.y ?? node.y),
    width,
    height,
  }
}

function distanceToViewportCenter(rect: LibTvViewportRect, viewport: LibTvViewportRect) {
  const rectCenterX = rect.x + rect.width / 2
  const rectCenterY = rect.y + rect.height / 2
  const viewportCenterX = viewport.x + viewport.width / 2
  const viewportCenterY = viewport.y + viewport.height / 2
  const x = rectCenterX - viewportCenterX
  const y = rectCenterY - viewportCenterY
  return x * x + y * y
}

function heapSwap<T>(heap: HeapEntry<T>[], left: number, right: number) {
  const value = heap[left]
  heap[left] = heap[right]
  heap[right] = value
}

function heapPush<T>(heap: HeapEntry<T>[], value: HeapEntry<T>) {
  heap.push(value)
  let index = heap.length - 1
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2)
    if (heap[parent].distance >= heap[index].distance) break
    heapSwap(heap, parent, index)
    index = parent
  }
}

function heapReplaceRoot<T>(heap: HeapEntry<T>[], value: HeapEntry<T>) {
  heap[0] = value
  let index = 0
  while (true) {
    const left = index * 2 + 1
    const right = left + 1
    let largest = index
    if (left < heap.length && heap[left].distance > heap[largest].distance) largest = left
    if (right < heap.length && heap[right].distance > heap[largest].distance) largest = right
    if (largest === index) break
    heapSwap(heap, index, largest)
    index = largest
  }
}

/**
 * Builds a small uniform-grid index.  Parent positions are resolved once so
 * ReactFlow's relative child coordinates can be queried as absolute bounds.
 */
export function createLibTvViewportIndex<T extends LibTvViewportNodeLike>(
  nodes: readonly T[],
  options: LibTvViewportIndexOptions<T> = {},
) {
  const cellSize = positive(options.cellSize, LIBTV_WORKFLOW_VIRTUAL_CELL_SIZE)
  const getRect = options.getRect || ((node: T) => resolveDefaultRect(node))
  const nodeById = new Map<string, T>()
  const localRects = new Map<string, LibTvViewportRect>()
  const absoluteRects = new Map<string, LibTvViewportRect>()
  const indexed: IndexedNode<T>[] = []
  const indexedById = new Map<string, IndexedNode<T>>()
  const cells = new Map<string, number[]>()
  const oversized: number[] = []
  const contentBounds: LibTvViewportRect = { x: 0, y: 0, width: 1, height: 1 }
  let contentMinX = 0
  let contentMinY = 0
  let contentMaxX = 1
  let contentMaxY = 1

  for (const node of nodes) {
    const id = String(node?.id || "").trim()
    if (!id || nodeById.has(id)) continue
    nodeById.set(id, node)
    localRects.set(id, normalizeRect(getRect(node)))
  }

  const resolveAbsoluteRect = (id: string, path = new Set<string>()): LibTvViewportRect => {
    const cached = absoluteRects.get(id)
    if (cached) return cached
    const local = localRects.get(id) || { x: 0, y: 0, width: 1, height: 1 }
    const node = nodeById.get(id)
    const parentId = String(node?.parentId || "").trim()
    if (!parentId || path.has(id) || !nodeById.has(parentId)) {
      absoluteRects.set(id, local)
      return local
    }
    path.add(id)
    const parent = resolveAbsoluteRect(parentId, path)
    path.delete(id)
    const absolute = {
      x: parent.x + local.x,
      y: parent.y + local.y,
      width: local.width,
      height: local.height,
    }
    absoluteRects.set(id, absolute)
    return absolute
  }

  nodes.forEach((node, originalIndex) => {
    const id = String(node?.id || "").trim()
    if (!id || !nodeById.has(id)) return
    const rect = resolveAbsoluteRect(id)
    const item: IndexedNode<T> = { node, id, index: originalIndex, rect }
    indexed.push(item)
    indexedById.set(id, item)
    const right = rect.x + rect.width
    const bottom = rect.y + rect.height
    contentMinX = indexed.length === 1 ? rect.x : Math.min(contentMinX, rect.x)
    contentMinY = indexed.length === 1 ? rect.y : Math.min(contentMinY, rect.y)
    contentMaxX = indexed.length === 1 ? right : Math.max(contentMaxX, right)
    contentMaxY = indexed.length === 1 ? bottom : Math.max(contentMaxY, bottom)
    contentBounds.x = contentMinX
    contentBounds.y = contentMinY
    contentBounds.width = Math.max(1, contentMaxX - contentMinX)
    contentBounds.height = Math.max(1, contentMaxY - contentMinY)

    const minCellX = Math.floor(rect.x / cellSize)
    const maxCellX = Math.floor((rect.x + rect.width) / cellSize)
    const minCellY = Math.floor(rect.y / cellSize)
    const maxCellY = Math.floor((rect.y + rect.height) / cellSize)
    const cellCount = (maxCellX - minCellX + 1) * (maxCellY - minCellY + 1)
    if (cellCount > 64) {
      oversized.push(indexed.length - 1)
      return
    }
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = cellKey(cellX, cellY)
        const bucket = cells.get(key) || []
        bucket.push(indexed.length - 1)
        cells.set(key, bucket)
      }
    }
  })

  const query = (
    viewport: LibTvViewportLike,
    viewportWidth: number,
    viewportHeight: number,
    queryOptions: LibTvViewportQueryOptions = {},
  ): LibTvViewportQueryResult<T> => {
    const zoom = Math.max(0.0001, finite(viewport.zoom, 1))
    const width = Math.max(1, finite(viewportWidth, 1))
    const height = Math.max(1, finite(viewportHeight, 1))
    const overscan = Math.max(0, finite(queryOptions.overscanPx, LIBTV_WORKFLOW_VIRTUAL_OVERSCAN_PX)) / zoom
    const visible: LibTvViewportRect = {
      x: -finite(viewport.x) / zoom - overscan,
      y: -finite(viewport.y) / zoom - overscan,
      width: width / zoom + overscan * 2,
      height: height / zoom + overscan * 2,
    }
    const maxNodes = Math.max(1, Math.floor(finite(queryOptions.maxNodes, LIBTV_WORKFLOW_VIRTUAL_NODE_LIMIT)))
    const candidateIndexes = new Set<number>()
    const minCellX = Math.floor(visible.x / cellSize)
    const maxCellX = Math.floor((visible.x + visible.width) / cellSize)
    const minCellY = Math.floor(visible.y / cellSize)
    const maxCellY = Math.floor((visible.y + visible.height) / cellSize)
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        for (const index of cells.get(cellKey(cellX, cellY)) || []) candidateIndexes.add(index)
      }
    }
    for (const index of oversized) candidateIndexes.add(index)

    const forcedIds = queryOptions.forcedIds || new Set<string>()
    const selected: IndexedNode<T>[] = []
    const selectedIds = new Set<string>()
    const heap: HeapEntry<T>[] = []
    let visibleCount = 0
    const selectedById = (item: IndexedNode<T>) => {
      if (selectedIds.has(item.id)) return
      selectedIds.add(item.id)
      selected.push(item)
    }
    for (const index of candidateIndexes) {
      const item = indexed[index]
      if (!item || !intersects(item.rect, visible)) continue
      visibleCount += 1
      const forced = forcedIds.has(item.id)
      if (forced) {
        selectedById(item)
        continue
      }
      const entry = { item, distance: distanceToViewportCenter(item.rect, visible) }
      if (selected.length < maxNodes && heap.length < maxNodes) {
        heapPush(heap, entry)
      } else if (heap.length > 0 && entry.distance < heap[0].distance) {
        heapReplaceRoot(heap, entry)
      }
    }
    for (const entry of heap) selectedById(entry.item)
    for (const id of forcedIds) {
      const item = indexedById.get(id)
      if (item) selectedById(item)
    }
    if (selected.length === 0 && queryOptions.fallbackId) {
      const fallback = indexedById.get(queryOptions.fallbackId)
      if (fallback) selectedById(fallback)
    }

    // ReactFlow requires parents to be present when a child is mounted.
    for (let cursor = 0; cursor < selected.length; cursor += 1) {
      let parentId = String(selected[cursor].node?.parentId || "").trim()
      const seen = new Set<string>()
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId)
        const parent = indexedById.get(parentId)
        if (!parent) break
        selectedById(parent)
        parentId = String(parent.node?.parentId || "").trim()
      }
    }
    selected.sort((left, right) => left.index - right.index)
    return {
      nodes: selected.map((item) => item.node),
      ids: selectedIds,
      candidateCount: candidateIndexes.size,
      visibleCount,
      capped: visibleCount > maxNodes,
      totalCount: indexed.length,
    }
  }

  return {
    query,
    totalCount: indexed.length,
    contentBounds,
    getBounds: (id: string) => indexedById.get(id)?.rect || null,
  }
}

export function createLibTvViewportEdgeIndex<T extends { id: string; source: string; target: string }>(edges: readonly T[]) {
  const byNodeId = new Map<string, T[]>()
  for (const edge of edges) {
    const source = String(edge?.source || "").trim()
    const target = String(edge?.target || "").trim()
    if (!source || !target) continue
    const sourceEdges = byNodeId.get(source) || []
    sourceEdges.push(edge)
    byNodeId.set(source, sourceEdges)
    if (target !== source) {
      const targetEdges = byNodeId.get(target) || []
      targetEdges.push(edge)
      byNodeId.set(target, targetEdges)
    }
  }
  return {
    query(visibleNodeIds: ReadonlySet<string>) {
      const result: T[] = []
      const seen = new Set<string>()
      for (const nodeId of visibleNodeIds) {
        for (const edge of byNodeId.get(nodeId) || []) {
          if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) continue
          const id = String(edge.id || "")
          if (seen.has(id)) continue
          seen.add(id)
          result.push(edge)
        }
      }
      return result
    },
    totalCount: edges.length,
  }
}
