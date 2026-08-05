import type { WorkflowGenerationKind } from "@/workflow/ideart/lib/codex/workflow-generation-kind"
import type { LibTvWorkflowNode, LibTvWorkflowNodeKind } from "@/workflow/ideart/lib/libtv/workflow"

function isWorkflowGeneratorNode(node: LibTvWorkflowNode) {
    const data = node.data || {}
    return String(data.mediaRole || "").trim() === "generator"
        || data.componentType === "image-generator"
        || data.componentType === "video-generator"
}

function workflowNodeGenerationKind(node: LibTvWorkflowNode): WorkflowGenerationKind | null {
    if (node.kind === "playlist") return "playlist"
    if (node.kind === "audio") return "audio"
    if (node.kind === "video") return "video"
    if (node.kind === "image") return "image"
    return null
}

export function codexWorkflowMediaIdentityKeys(value: unknown) {
    const keys = new Set<string>()
    let current = String(value || "").trim()
    for (let depth = 0; current && depth < 3; depth += 1) {
        keys.add(`raw:${current.toLowerCase()}`)
        try {
            const parsed = new URL(current, typeof window !== "undefined" ? window.location.origin : "http://localhost")
            if (parsed.pathname === "/api/image-proxy" || parsed.pathname === "/api/video-proxy") {
                const sourceUrl = String(parsed.searchParams.get("url") || "").trim()
                if (sourceUrl && sourceUrl !== current) {
                    current = sourceUrl
                    continue
                }
            }
            if (/^\/api\/codex\/projects\/[^/]+\/files\/view$/i.test(parsed.pathname)) {
                const projectPath = String(parsed.searchParams.get("path") || "").trim()
                if (projectPath) keys.add(`project:${projectPath.replace(/^\.\/+/, "").toLowerCase()}`)
            }
            const decodedPath = (() => {
                try {
                    return decodeURIComponent(parsed.pathname)
                } catch {
                    return parsed.pathname
                }
            })()
            keys.add(`url:${parsed.origin.toLowerCase()}${decodedPath.toLowerCase()}`)
            keys.add(`path:${decodedPath.replace(/^\/+/, "").toLowerCase()}`)
        } catch {
            keys.add(`path:${current.replace(/^\.\/+/, "").replace(/^\/+/, "").toLowerCase()}`)
        }
        break
    }
    return keys
}

export function codexWorkflowNodeMatchesMediaKind(node: LibTvWorkflowNode, kind: LibTvWorkflowNodeKind) {
    if (node.kind !== kind) return false
    return String(node.data?.mediaRole || "").trim() !== "generator"
}

export function codexWorkflowNodeMediaIdentityKeys(node: LibTvWorkflowNode) {
    const data = (node.data || {}) as unknown as Record<string, unknown>
    const values = [
        data.mediaUrl,
        data.imageUrl,
        data.image_url,
        data.videoUrl,
        data.video_url,
        data.audioUrl,
        data.audio_url,
        data.fileUrl,
        data.file_url,
        data.outputUrl,
        data.output_url,
        data.resultUrl,
        data.result_url,
        data.url,
        data.src,
        data.workflowSeedanceAssetUrl,
        data.thumbnailUrl,
        data.thumbnail_url,
    ]
    const keys = new Set<string>()
    values.forEach((value) => codexWorkflowMediaIdentityKeys(value).forEach((key) => keys.add(key)))
    return keys
}

function nodeMatchesResultUrls(node: LibTvWorkflowNode, resultUrls: unknown[]) {
    const nodeKeys = codexWorkflowNodeMediaIdentityKeys(node)
    if (!nodeKeys.size) return false
    return resultUrls.some((value) => {
        const resultKeys = codexWorkflowMediaIdentityKeys(value)
        return Array.from(resultKeys).some((key) => nodeKeys.has(key))
    })
}

export function shouldReuseExplicitCodexGenerationNode(params: {
    node: LibTvWorkflowNode
    kind: WorkflowGenerationKind
    codexTaskId?: string
    resultUrls?: unknown[]
}) {
    const { node, kind } = params
    if (workflowNodeGenerationKind(node) !== kind) return false
    if (isWorkflowGeneratorNode(node)) return true

    const data = node.data || {}
    const controller = String(data.workflowGenerationController || "").trim()
    const nodeCodexTaskId = String(data.workflowCodexTaskId || "").trim()
    const requestedCodexTaskId = String(params.codexTaskId || "").trim()
    const controlledBySameTask = controller === "codex" && (
        !requestedCodexTaskId
        || !nodeCodexTaskId
        || nodeCodexTaskId === requestedCodexTaskId
    )
    if (controlledBySameTask) return true
    return nodeMatchesResultUrls(node, Array.isArray(params.resultUrls) ? params.resultUrls : [])
}

export function findReusableCodexGenerationNode(params: {
    nodes: LibTvWorkflowNode[]
    explicitNodeId?: string
    kind: WorkflowGenerationKind
    codexTaskId?: string
    resultUrls?: unknown[]
}) {
    const explicitNodeId = String(params.explicitNodeId || "").trim()
    const explicitNode = explicitNodeId
        ? params.nodes.find((node) => node.id === explicitNodeId)
        : undefined
    if (explicitNode && shouldReuseExplicitCodexGenerationNode({
        node: explicitNode,
        kind: params.kind,
        codexTaskId: params.codexTaskId,
        resultUrls: params.resultUrls,
    })) {
        return explicitNode
    }

    const resultUrls = Array.isArray(params.resultUrls) ? params.resultUrls : []
    if (!resultUrls.length) return null
    const matches = params.nodes.filter((node) => (
        workflowNodeGenerationKind(node) === params.kind
        && nodeMatchesResultUrls(node, resultUrls)
    ))
    return matches.find((node) => !isWorkflowGeneratorNode(node)) || matches[0] || null
}

export function findDuplicateCodexGenerationMirrorNodeIds(nodes: LibTvWorkflowNode[]) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]))
    return nodes.flatMap((node) => {
        if (!isWorkflowGeneratorNode(node)) return []
        const data = node.data || {}
        if (String(data.workflowGenerationController || "").trim() !== "codex") return []
        const sourceNodeId = String(data.workflowCodexGenerationTaskId || "").trim()
        if (!sourceNodeId || sourceNodeId === node.id) return []
        const sourceNode = nodesById.get(sourceNodeId)
        if (!sourceNode || isWorkflowGeneratorNode(sourceNode)) return []
        if (workflowNodeGenerationKind(sourceNode) !== workflowNodeGenerationKind(node)) return []
        const sourceKeys = codexWorkflowNodeMediaIdentityKeys(sourceNode)
        const mirrorKeys = codexWorkflowNodeMediaIdentityKeys(node)
        if (!Array.from(sourceKeys).some((key) => mirrorKeys.has(key))) return []
        return [node.id]
    })
}
