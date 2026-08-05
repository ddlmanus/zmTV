import type { LibTvWorkflowEdge, LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow"

export const CODEX_CANVAS_CONTRACT_VERSION = "2026-07-31.compact-v3"

const SNAPSHOT_TEXT_LIMIT = 320
const ERROR_TEXT_LIMIT = 1_000
const DETAIL_TEXT_LIMIT = 4_000
const SCRIPT_ROW_TEXT_LIMIT = 1_200
const MEDIA_URL_LIMIT = 8
const SCRIPT_ASSET_LIMIT = 200
const SCRIPT_ROW_PAGE_LIMIT = 20

const NODE_DATA_FIELDS = [
    "title",
    "mediaRole",
    "componentType",
    "modelId",
    "aspectRatio",
    "imageSize",
    "videoMethod",
    "videoDuration",
    "videoResolution",
    "generateAudio",
    "generationCount",
    "mediaUrl",
    "playlistExportUrl",
    "workflowGenerationRunning",
    "workflowGenerationTaskId",
    "workflowGenerationJobId",
    "workflowGenerationTaskType",
    "workflowGenerationProviderKey",
    "workflowCodexTaskId",
    "workflowCodexGenerationTaskId",
    "workflowAssetStage",
    "workflowAssetPersonaId",
    "workflowAssetReviewStatus",
    "workflowSceneCleanPlate",
    "workflowSkillId",
    "workflowSkillStage",
    "workflowSkillStageStatus",
    "workflowSkillPersonaIds",
    "workflowScriptV2AssetKind",
    "workflowScriptV2AssetId",
    "workflowScriptV2AssetModelId",
    "workflowPlaylistSourceNodeId",
    "workflowAudioRole",
    "scriptV2ActiveStep",
] as const

const SCRIPT_ASSET_KINDS = ["角色", "场景", "道具"] as const

function text(value: unknown, limit = SNAPSHOT_TEXT_LIMIT) {
    const normalized = String(value || "").trim()
    if (!normalized) return ""
    return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...[truncated]`
}

function record(value: unknown): Record<string, any> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, any>
        : {}
}

function compactEdge(edge: LibTvWorkflowEdge) {
    return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
    }
}

function mediaUrlFromValue(value: unknown) {
    if (typeof value === "string") return value.trim()
    const item = record(value)
    return text(item.url || item.src || item.mediaUrl || item.outputUrl, 4_000)
}

function collectNodeMediaUrls(data: Record<string, any>, playlistOutputNode?: LibTvWorkflowNode | null) {
    const candidates: unknown[] = [
        data.mediaUrl,
        data.playlistExportUrl,
        playlistOutputNode?.data?.mediaUrl,
        ...(Array.isArray(data.workflowImageResults) ? data.workflowImageResults : []),
        ...(Array.isArray(data.workflowVideoResults) ? data.workflowVideoResults : []),
        ...(Array.isArray(data.workflowAudioResults) ? data.workflowAudioResults : []),
    ]
    return Array.from(new Set(candidates.map(mediaUrlFromValue).filter(Boolean))).slice(0, MEDIA_URL_LIMIT)
}

function compactResultItems(value: unknown) {
    if (!Array.isArray(value)) return []
    return Array.from(new Set(value.map(mediaUrlFromValue).filter(Boolean)))
        .slice(0, MEDIA_URL_LIMIT)
        .map((url) => ({ url }))
}

function scriptRows(data: Record<string, any>) {
    const result = record(data.scriptResult)
    return Array.isArray(result.rows) ? result.rows : []
}

function scriptAssetCounts(data: Record<string, any>) {
    const assets = record(data.scriptV2AssetsByKind)
    return Object.fromEntries(SCRIPT_ASSET_KINDS.map((kind) => [kind, Array.isArray(assets[kind]) ? assets[kind].length : 0]))
}

function compactScriptAsset(value: unknown) {
    const asset = record(value)
    return {
        id: text(asset.id, 160),
        kind: text(asset.kind, 20),
        title: text(asset.title, 200),
        prompt: text(asset.prompt, 1_500),
        modelId: text(asset.modelId, 200),
        imageUrl: text(asset.imageUrl, 4_000),
        aspectRatio: text(asset.aspectRatio, 40),
        imageSize: text(asset.imageSize, 40),
        assetStage: text(asset.assetStage, 80),
        personaId: text(asset.personaId, 120),
        reviewStatus: text(asset.reviewStatus, 40),
        sourceNodeId: text(asset.sourceNodeId, 160),
        cleanPlate: asset.cleanPlate === true,
        generationError: text(asset.generationError, ERROR_TEXT_LIMIT),
    }
}

function compactScriptAssets(data: Record<string, any>) {
    const assets = record(data.scriptV2AssetsByKind)
    return Object.fromEntries(SCRIPT_ASSET_KINDS.map((kind) => [
        kind,
        (Array.isArray(assets[kind]) ? assets[kind] : []).slice(0, SCRIPT_ASSET_LIMIT).map(compactScriptAsset),
    ]))
}

function compactIdentifierList(value: unknown) {
    if (!Array.isArray(value)) return []
    return value.map((item) => text(item, 160)).filter(Boolean).slice(0, 20)
}

function compactScriptRowManifest(data: Record<string, any>) {
    return scriptRows(data).slice(0, 200).map((value, rowIndex) => {
        const row = record(value)
        const manifest = {
            rowIndex,
            shotNumber: text(row.shotNumber, 40),
            startTime: text(row.startTime, 40),
            endTime: text(row.endTime, 40),
            duration: text(row.duration, 40),
            character1: text(row.character1, 160),
            characterAssetId1: text(row.characterAssetId1, 160),
            characterPersonaKey1: text(row.characterPersonaKey1, 160),
            character2: text(row.character2, 160),
            characterAssetId2: text(row.characterAssetId2, 160),
            characterPersonaKey2: text(row.characterPersonaKey2, 160),
            characterKeys: compactIdentifierList(row.characterKeys),
            characters: compactIdentifierList(row.characters),
            sceneKey: text(row.sceneKey, 160),
            sceneAssetKey: text(row.sceneAssetKey, 160),
            sceneTags: compactIdentifierList(row.sceneTags),
            propKeys: compactIdentifierList(row.propKeys),
            propNames: compactIdentifierList(row.propNames),
        }
        return Object.fromEntries(Object.entries(manifest).filter(([key, item]) => (
            key === "rowIndex"
            || (Array.isArray(item) ? item.length > 0 : item !== "" && item !== undefined)
        )))
    })
}

function compactDetailValue(value: unknown, depth = 0): unknown {
    if (typeof value === "string") return text(value, depth === 0 ? DETAIL_TEXT_LIMIT : SCRIPT_ROW_TEXT_LIMIT)
    if (!value || typeof value !== "object") return value
    if (depth >= 5) return "[nested value omitted]"
    if (Array.isArray(value)) return value.slice(0, 30).map((item) => compactDetailValue(item, depth + 1))
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
        .slice(0, 60)
        .map(([key, item]) => [key, compactDetailValue(item, depth + 1)]))
}

function compactNodeData(node: LibTvWorkflowNode, options: {
    includeScriptAssets?: boolean
    includeResultItems?: boolean
} = {}) {
    const data = record(node.data)
    const compact: Record<string, unknown> = {}
    for (const key of NODE_DATA_FIELDS) {
        const value = data[key]
        if (value === undefined || value === null || value === "") continue
        compact[key] = typeof value === "string"
            ? text(value, key === "mediaUrl" || key === "playlistExportUrl" ? 4_000 : SNAPSHOT_TEXT_LIMIT)
            : value
    }
    const promptPreview = text(data.prompt, SNAPSHOT_TEXT_LIMIT)
    if (promptPreview) compact.promptPreview = promptPreview
    const generationError = text(data.workflowGenerationError, ERROR_TEXT_LIMIT)
    if (generationError) compact.workflowGenerationError = generationError
    if (options.includeResultItems) {
        const imageResults = compactResultItems(data.workflowImageResults)
        const videoResults = compactResultItems(data.workflowVideoResults)
        if (imageResults.length) compact.workflowImageResults = imageResults
        if (videoResults.length) compact.workflowVideoResults = videoResults
    }
    if (node.kind === "script" || node.kind === "script-v2") {
        compact.scriptSummary = {
            rowCount: scriptRows(data).length,
            activeStep: text(data.scriptV2ActiveStep, 40),
            assetCounts: scriptAssetCounts(data),
        }
        if (options.includeScriptAssets) {
            compact.scriptAssetsByKind = compactScriptAssets(data)
            compact.scriptRowManifest = compactScriptRowManifest(data)
        }
    }
    return compact
}

export function codexCanvasNodeSummary(node: LibTvWorkflowNode, options: {
    includeScriptAssets?: boolean
    includeResultItems?: boolean
} = {}) {
    return {
        id: node.id,
        kind: node.kind,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        parentId: node.parentId,
        locked: node.locked,
        data: compactNodeData(node, options),
        codexLayout: node.data?.workflowCodexTaskId ? {
            taskId: node.data.workflowCodexTaskId,
            anchorX: node.data.workflowCodexLayoutAnchorX,
            anchorY: node.data.workflowCodexLayoutAnchorY,
            index: node.data.workflowCodexLayoutIndex,
            stage: node.data.workflowCodexLayoutStage,
            row: node.data.workflowCodexLayoutRow,
        } : undefined,
    }
}

function hashCanvasValue(value: string) {
    let hash = 2166136261
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(36)
}

export function codexCanvasRevision(nodes: LibTvWorkflowNode[], edges: LibTvWorkflowEdge[]) {
    const nodeState = nodes.map((node) => {
        const data = record(node.data)
        return [
            node.id,
            node.kind,
            node.x,
            node.y,
            node.width,
            node.height,
            data.mediaUrl || data.playlistExportUrl || "",
            data.workflowGenerationRunning === true,
            data.workflowGenerationError || "",
            data.workflowAssetReviewStatus || "",
            data.scriptV2ActiveStep || "",
            data.title || "",
            hashCanvasValue(String(data.prompt || "")),
            data.modelId || "",
            data.aspectRatio || "",
            data.imageSize || "",
            data.videoMethod || "",
            data.videoDuration || "",
            data.videoResolution || "",
            hashCanvasValue(JSON.stringify(data.workflowExtraParameters || {})),
            hashCanvasValue(JSON.stringify(data.playlistItems || [])),
            record(data.scriptResult).generatedAt || "",
            scriptRows(data).length,
        ]
    }).sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    const edgeState = edges.map((edge) => [edge.id, edge.source, edge.target])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    return `canvas-${hashCanvasValue(JSON.stringify([nodeState, edgeState]))}`
}

export function buildCodexCanvasSnapshot(params: {
    workflowProjectId?: string | null
    canvasSessionId?: string | null
    nodes: LibTvWorkflowNode[]
    edges: LibTvWorkflowEdge[]
    selectedNodeIds?: string[]
    layout: Record<string, unknown>
    knownRevision?: string
}) {
    const revision = codexCanvasRevision(params.nodes, params.edges)
    const base = {
        workflowProjectId: params.workflowProjectId,
        canvasSessionId: params.canvasSessionId,
        contractVersion: CODEX_CANVAS_CONTRACT_VERSION,
        revision,
        nodeCount: params.nodes.length,
        edgeCount: params.edges.length,
    }
    if (params.knownRevision && params.knownRevision === revision) {
        return { ...base, unchanged: true }
    }
    return {
        ...base,
        unchanged: false,
        layout: params.layout,
        nodes: params.nodes.map((node) => codexCanvasNodeSummary(node)),
        edges: params.edges.map(compactEdge),
        selectedNodeIds: params.selectedNodeIds || [],
    }
}

function scriptResultPage(data: Record<string, any>, rowOffset: number, rowLimit: number) {
    const result = record(data.scriptResult)
    const rows = scriptRows(data)
    const offset = Math.max(0, Math.min(rows.length, Math.floor(rowOffset || 0)))
    const limit = Math.max(1, Math.min(SCRIPT_ROW_PAGE_LIMIT, Math.floor(rowLimit || SCRIPT_ROW_PAGE_LIMIT)))
    const metadataKeys = ["title", "summary", "sourceScript", "userPrompt", "selectedOptionId", "generatedAt"]
    const metadata = Object.fromEntries(metadataKeys
        .filter((key) => result[key] !== undefined)
        .map((key) => [key, compactDetailValue(result[key])]))
    const collectionCounts = Object.fromEntries([
        "characterProfiles",
        "characterAssets",
        "sceneProfiles",
        "propProfiles",
        "reviewRecords",
    ].map((key) => [key, Array.isArray(result[key]) ? result[key].length : 0]))
    return {
        ...metadata,
        collectionCounts,
        rows: rows.slice(offset, offset + limit).map((row) => compactDetailValue(row)),
        rowOffset: offset,
        rowLimit: limit,
        totalRows: rows.length,
        hasMore: offset + limit < rows.length,
    }
}

export function buildCodexCanvasNodeReceipt(params: {
    nodeId: string
    nodes: LibTvWorkflowNode[]
    edges: LibTvWorkflowEdge[]
    include?: string[]
    rowOffset?: number
    rowLimit?: number
}) {
    const node = params.nodes.find((item) => item.id === params.nodeId) || null
    const playlistOutputNode = node?.kind === "playlist"
        ? params.nodes.find((item) => item.kind === "video" && item.data?.workflowPlaylistSourceNodeId === node.id) || null
        : null
    const data = record(node?.data)
    const mediaUrls = collectNodeMediaUrls(data, playlistOutputNode)
    const include = new Set((params.include || []).map((item) => String(item || "").trim()).filter(Boolean))
    const details: Record<string, unknown> = {}
    if (node && include.has("scriptResult") && (node.kind === "script" || node.kind === "script-v2")) {
        details.scriptResult = scriptResultPage(data, Number(params.rowOffset || 0), Number(params.rowLimit || SCRIPT_ROW_PAGE_LIMIT))
    }
    if (include.has("content")) details.content = text(data.content, 12_000)
    if (include.has("playlistItems")) {
        details.playlistItems = Array.isArray(data.playlistItems)
            ? data.playlistItems.slice(0, 200).map((item: unknown) => compactDetailValue(item))
            : []
    }
    return {
        node: node ? codexCanvasNodeSummary(node, {
            includeScriptAssets: include.has("scriptAssets"),
            includeResultItems: include.has("resultItems"),
        }) : null,
        outputNode: playlistOutputNode ? codexCanvasNodeSummary(playlistOutputNode) : null,
        incomingEdges: params.edges.filter((edge) => edge.target === params.nodeId).map(compactEdge),
        outgoingEdges: params.edges.filter((edge) => edge.source === params.nodeId).map(compactEdge),
        task: node ? {
            status: data.workflowGenerationRunning
                ? "running"
                : data.workflowGenerationError ? "failed" : mediaUrls.length ? "completed" : "idle",
            taskId: text(data.workflowGenerationTaskId, 200),
            jobId: text(data.workflowGenerationJobId, 200),
            taskType: text(data.workflowGenerationTaskType, 120),
            providerKey: text(data.workflowGenerationProviderKey, 120),
            modelId: text(data.modelId, 200),
            mediaUrl: mediaUrls[0] || "",
            mediaUrls,
            error: text(data.workflowGenerationError, ERROR_TEXT_LIMIT),
        } : null,
        ...(Object.keys(details).length ? { details } : {}),
    }
}

export function buildCodexCanvasRunReceipt(params: {
    nodeId: string
    nodes: LibTvWorkflowNode[]
    edges: LibTvWorkflowEdge[]
}) {
    const node = params.nodes.find((item) => item.id === params.nodeId) || null
    const playlistOutputNode = node?.kind === "playlist"
        ? params.nodes.find((item) => item.kind === "video" && item.data?.workflowPlaylistSourceNodeId === node.id) || null
        : null
    const data = record(node?.data)
    const mediaUrls = collectNodeMediaUrls(data, playlistOutputNode)
    const error = text(data.workflowGenerationError, ERROR_TEXT_LIMIT)
    const isMediaNode = node?.kind === "image" || node?.kind === "video" || node?.kind === "audio" || node?.kind === "threed" || node?.kind === "playlist"
    const status = !node
        ? "missing"
        : data.workflowGenerationRunning
            ? "running"
            : error
                ? "failed"
                : mediaUrls.length || !isMediaNode
                    ? "completed"
                    : "idle"

    return {
        nodeId: params.nodeId,
        nodeExists: Boolean(node),
        kind: node?.kind || "",
        status,
        taskId: text(data.workflowGenerationTaskId, 200),
        jobId: text(data.workflowGenerationJobId, 200),
        providerKey: text(data.workflowGenerationProviderKey, 120),
        modelId: text(data.modelId, 200),
        aspectRatio: text(data.aspectRatio, 40),
        width: Number(node?.width) || undefined,
        height: Number(node?.height) || undefined,
        mediaUrl: mediaUrls[0] || "",
        mediaUrls,
        outputNodeId: playlistOutputNode?.id || "",
        error,
    }
}

export function buildCodexCanvasWorkflowDelta(
    before: { nodeIds: Set<string>; edgeIds: Set<string> },
    nodes: LibTvWorkflowNode[],
    edges: LibTvWorkflowEdge[],
) {
    return {
        createdNodes: nodes.filter((node) => !before.nodeIds.has(node.id)).map((node) => codexCanvasNodeSummary(node)),
        createdEdges: edges.filter((edge) => !before.edgeIds.has(edge.id)).map(compactEdge),
    }
}
