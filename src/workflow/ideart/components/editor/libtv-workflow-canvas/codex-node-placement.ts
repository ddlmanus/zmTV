export type WorkflowRect = {
    x: number
    y: number
    width: number
    height: number
}

export type CodexWorkflowPlacementBounds = {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
}

export const CODEX_WORKFLOW_STAGE_ORDER = [
    "source",
    "script",
    "assets",
    "storyboard",
    "video",
    "compose",
    "output",
] as const

export type CodexWorkflowStage = (typeof CODEX_WORKFLOW_STAGE_ORDER)[number]

export const CODEX_WORKFLOW_NODE_GAP = 80
export const CODEX_WORKFLOW_STAGE_COLUMN_WIDTH = 920
export const CODEX_WORKFLOW_STAGE_COLUMN_GAP = 160
export const CODEX_WORKFLOW_STAGE_ROW_HEIGHT = 560

type CodexWorkflowNodePlacementParams = {
    bounds: CodexWorkflowPlacementBounds
    width: number
    height: number
    obstacles: WorkflowRect[]
    stage: CodexWorkflowStage
    preferredPosition?: { x: number; y: number } | null
    anchorPosition?: { x: number; y: number } | null
    startRow?: number
    gap?: number
    columnWidth?: number
    columnGap?: number
    rowHeight?: number
}

export type CodexWorkflowNodePlacement = {
    x: number
    y: number
    row: number
    column: number
    columns: number
    stage: CodexWorkflowStage
    source: "preferred" | "stage-column" | "stage-overflow" | "fallback"
}

export function expandWorkflowRect(rect: WorkflowRect, padding: number): WorkflowRect {
    return {
        x: rect.x - padding,
        y: rect.y - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
    }
}

export function workflowRectsOverlap(a: WorkflowRect, b: WorkflowRect) {
    return a.x < b.x + b.width
        && a.x + a.width > b.x
        && a.y < b.y + b.height
        && a.y + a.height > b.y
}

function stageIndex(stage: CodexWorkflowStage) {
    return Math.max(0, CODEX_WORKFLOW_STAGE_ORDER.indexOf(stage))
}

export function findCodexWorkflowNodePlacement(
    params: CodexWorkflowNodePlacementParams,
): CodexWorkflowNodePlacement {
    const gap = Math.max(0, Number(params.gap ?? CODEX_WORKFLOW_NODE_GAP))
    const width = Math.max(1, Number(params.width || 1))
    const height = Math.max(1, Number(params.height || 1))
    const columnWidth = Math.max(1, Number(params.columnWidth ?? CODEX_WORKFLOW_STAGE_COLUMN_WIDTH))
    const columnGap = Math.max(0, Number(params.columnGap ?? CODEX_WORKFLOW_STAGE_COLUMN_GAP))
    const rowHeight = Math.max(1, Number(params.rowHeight ?? CODEX_WORKFLOW_STAGE_ROW_HEIGHT))
    const bounds = params.bounds
    const column = stageIndex(params.stage)
    const columns = CODEX_WORKFLOW_STAGE_ORDER.length
    const origin = params.anchorPosition || { x: bounds.left, y: bounds.top }
    const startRow = Math.max(0, Math.floor(Number(params.startRow) || 0))
    const collides = (rect: WorkflowRect) => params.obstacles.some((obstacle) => (
        workflowRectsOverlap(rect, expandWorkflowRect(obstacle, gap))
    ))
    const candidateAt = (row: number): WorkflowRect => ({
        x: origin.x + column * (columnWidth + columnGap),
        y: origin.y + row * (rowHeight + gap),
        width,
        height,
    })
    const placementFrom = (
        rect: WorkflowRect,
        row: number,
        source: CodexWorkflowNodePlacement["source"],
    ): CodexWorkflowNodePlacement => ({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        row,
        column,
        columns,
        stage: params.stage,
        source,
    })

    if (params.preferredPosition) {
        const preferred = {
            x: params.preferredPosition.x,
            y: params.preferredPosition.y,
            width,
            height,
        }
        if (!collides(preferred)) return placementFrom(preferred, -1, "preferred")
    }

    const visibleBottom = bounds.bottom
    for (let offset = 0; offset < 480; offset += 1) {
        const row = startRow + offset
        const candidate = candidateAt(row)
        if (!collides(candidate)) {
            return placementFrom(candidate, row, candidate.y + height <= visibleBottom ? "stage-column" : "stage-overflow")
        }
    }

    const stageX = origin.x + column * (columnWidth + columnGap)
    const sameColumnObstacles = params.obstacles.filter((obstacle) => (
        obstacle.x < stageX + columnWidth && obstacle.x + obstacle.width > stageX
    ))
    const furthestBottom = sameColumnObstacles.reduce((bottom, obstacle) => (
        Math.max(bottom, obstacle.y + obstacle.height)
    ), origin.y)
    return {
        x: Math.round(stageX),
        y: Math.round(furthestBottom + gap),
        row: startRow + 480,
        column,
        columns,
        stage: params.stage,
        source: "fallback",
    }
}

export type CodexWorkflowTaskLayoutNode = {
    taskId?: string
    anchorX?: number
    anchorY?: number
    layoutIndex?: number
    stage?: CodexWorkflowStage
    stageRow?: number
}

export type CodexWorkflowTaskPlacementNode = CodexWorkflowTaskLayoutNode & WorkflowRect & {
    parentId?: string | null
}

export function resolveCodexWorkflowTaskLayout(params: {
    taskId?: string | null
    stage: CodexWorkflowStage
    nodes: CodexWorkflowTaskLayoutNode[]
    fallbackAnchor: { x: number; y: number }
}) {
    const taskId = String(params.taskId || "").trim()
    const matchingNodes = taskId
        ? params.nodes.filter((node) => String(node.taskId || "").trim() === taskId)
        : []
    const indexedNodes = matchingNodes
        .filter((node) => Number.isFinite(Number(node.layoutIndex)) && Number(node.layoutIndex) >= 0)
        .sort((left, right) => Number(left.layoutIndex) - Number(right.layoutIndex))
    const anchorNode = indexedNodes.find((node) => (
        Number.isFinite(Number(node.anchorX)) && Number.isFinite(Number(node.anchorY))
    ))
    const stageNodes = matchingNodes.filter((node) => node.stage === params.stage)
    const persistedRows = stageNodes
        .map((node) => Number(node.stageRow))
        .filter((value) => Number.isFinite(value) && value >= 0)
    return {
        anchor: anchorNode
            ? { x: Number(anchorNode.anchorX), y: Number(anchorNode.anchorY) }
            : { x: params.fallbackAnchor.x, y: params.fallbackAnchor.y },
        nextIndex: indexedNodes.length
            ? Math.max(...indexedNodes.map((node) => Math.floor(Number(node.layoutIndex)))) + 1
            : 0,
        nextStageRow: persistedRows.length > 0
            ? Math.max(...persistedRows.map((value) => Math.floor(value))) + 1
            : stageNodes.length,
    }
}

export function allocateCodexWorkflowTaskPlacement(params: {
    nodes: CodexWorkflowTaskPlacementNode[]
    taskId?: string | null
    stage: CodexWorkflowStage
    bounds: CodexWorkflowPlacementBounds
    width: number
    height: number
    preferredPosition?: { x: number; y: number } | null
}) {
    const taskId = String(params.taskId || "").trim()
    const taskLayout = resolveCodexWorkflowTaskLayout({
        taskId,
        stage: params.stage,
        fallbackAnchor: { x: params.bounds.left, y: params.bounds.top },
        nodes: params.nodes,
    })
    const placement = findCodexWorkflowNodePlacement({
        bounds: params.bounds,
        stage: params.stage,
        width: params.width,
        height: params.height,
        obstacles: params.nodes
            .filter((node) => !node.parentId)
            .map(({ x, y, width, height }) => ({ x, y, width, height })),
        preferredPosition: params.preferredPosition,
        anchorPosition: taskId ? taskLayout.anchor : null,
        startRow: taskId ? taskLayout.nextStageRow : 0,
    })
    return {
        placement,
        taskId,
        anchor: taskLayout.anchor,
        layoutIndex: taskId ? taskLayout.nextIndex : undefined,
        layoutStage: params.stage,
        layoutRow: taskId
            ? placement.row >= 0 ? placement.row : taskLayout.nextStageRow
            : undefined,
    }
}

export function inferCodexWorkflowStage(
    kind: string,
    data: Record<string, unknown> | null | undefined,
): CodexWorkflowStage {
    const componentType = String(data?.componentType || "").trim().toLowerCase()
    const title = String(data?.title || "").trim().toLowerCase()
    const mediaRole = String(data?.mediaRole || "").trim().toLowerCase()
    if (kind === "script" || kind === "script-v2") return "script"
    if (kind === "playlist" || kind === "director-console-3d") return "compose"
    if (kind === "audio") return "video"
    if (kind === "threed") return "assets"
    if (kind === "image") {
        if (componentType === "storyboard-image") return "storyboard"
        if (
            componentType === "image-asset"
            || data?.workflowScriptV2AssetId
            || data?.workflowScriptV2AssetKind
            || data?.workflowAssetStage
        ) return "assets"
        return mediaRole === "ordinary" ? "source" : "storyboard"
    }
    if (kind === "video") {
        if (data?.workflowPlaylistSourceNodeId) return "output"
        return "video"
    }
    if (kind === "group") {
        if (/资产|asset/.test(title)) return "assets"
        if (/视频|video/.test(title)) return "video"
        if (/分镜|storyboard/.test(title)) return "storyboard"
    }
    return "source"
}
