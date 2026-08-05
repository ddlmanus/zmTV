import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow"
import type { LibTvScriptV2AssetItem, LibTvScriptV2AssetKind } from "@/workflow/ideart/lib/libtv/script"

const ASSET_KINDS: LibTvScriptV2AssetKind[] = ["角色", "场景", "道具"]

function mediaUrl(value: unknown): string {
    if (typeof value === "string") return value.trim()
    if (!value || typeof value !== "object" || Array.isArray(value)) return ""
    const record = value as Record<string, unknown>
    return String(record.url || record.mediaUrl || record.imageUrl || "").trim()
}

function firstNodeMediaUrl(data: Record<string, any>) {
    const candidates = [
        data.mediaUrl,
        ...(Array.isArray(data.workflowImageResults) ? data.workflowImageResults : []),
        ...(Array.isArray(data.imageResults) ? data.imageResults : []),
    ]
    return candidates.map(mediaUrl).find(Boolean) || ""
}

function assetFromNode(node: LibTvWorkflowNode): LibTvScriptV2AssetItem | null {
    if (node.kind !== "image") return null
    const data = (node.data || {}) as Record<string, any>
    const kind = String(data.workflowScriptV2AssetKind || "").trim() as LibTvScriptV2AssetKind
    if (!ASSET_KINDS.includes(kind) || data.workflowAssetReviewStatus !== "approved") return null
    const imageUrl = firstNodeMediaUrl(data)
    if (!imageUrl) return null
    const id = String(data.workflowScriptV2AssetId || node.id).trim()
    return {
        id,
        kind,
        title: String(data.title || id).trim() || id,
        imageUrl,
        prompt: String(data.prompt || data.workflowInternalPrompt || "").trim(),
        modelId: String(data.workflowScriptV2AssetModelId || data.modelId || "").trim(),
        aspectRatio: String(data.aspectRatio || "").trim() || undefined,
        imageSize: String(data.imageSize || "").trim() || undefined,
        quality: String(data.quality || "").trim() || undefined,
        generationJobId: String(data.workflowGenerationJobId || "").trim() || undefined,
        generationTaskId: String(data.workflowGenerationTaskId || data.workflowCodexGenerationTaskId || "").trim() || undefined,
        generationTaskType: String(data.workflowGenerationTaskType || "").trim() || undefined,
        generationProviderKey: String(data.workflowGenerationProviderKey || "").trim() || undefined,
        assetStage: String(data.workflowAssetStage || "").trim() || undefined,
        personaId: String(data.workflowAssetPersonaId || "").trim() || undefined,
        reviewStatus: "approved",
        sourceNodeId: node.id,
        cleanPlate: data.workflowSceneCleanPlate === true,
        createdAt: Number(data.workflowGenerationStartedAt || 0),
    }
}

export function buildCodexScriptImportAssets(
    nodes: LibTvWorkflowNode[],
    rawAssets: unknown,
): Record<LibTvScriptV2AssetKind, LibTvScriptV2AssetItem[]> {
    const inferred = ASSET_KINDS.reduce((result, kind) => {
        result[kind] = []
        return result
    }, {} as Record<LibTvScriptV2AssetKind, LibTvScriptV2AssetItem[]>)
    nodes.forEach((node) => {
        const asset = assetFromNode(node)
        if (asset) inferred[asset.kind].push(asset)
    })
    const raw = rawAssets && typeof rawAssets === "object" && !Array.isArray(rawAssets)
        ? rawAssets as Record<string, unknown>
        : {}

    return ASSET_KINDS.reduce((result, kind) => {
        const hasExplicitKind = Array.isArray(raw[kind])
        const sourceItems = hasExplicitKind ? raw[kind] as unknown[] : inferred[kind]
        const hydrated = sourceItems.flatMap((value) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return []
            const item = value as Partial<LibTvScriptV2AssetItem>
            const sourceNodeId = String(item.sourceNodeId || "").trim()
            const itemId = String(item.id || "").trim()
            const fallback = inferred[kind].find((candidate) => (
                (sourceNodeId && candidate.sourceNodeId === sourceNodeId)
                || (itemId && candidate.id === itemId)
            ))
            const merged = {
                ...fallback,
                ...item,
                id: itemId || fallback?.id || sourceNodeId,
                kind,
                title: String(item.title || fallback?.title || itemId || sourceNodeId).trim(),
                imageUrl: String(item.imageUrl || fallback?.imageUrl || "").trim(),
                prompt: String(item.prompt || fallback?.prompt || "").trim(),
                modelId: String(item.modelId || fallback?.modelId || "").trim(),
                sourceNodeId: sourceNodeId || fallback?.sourceNodeId,
                reviewStatus: item.reviewStatus || fallback?.reviewStatus,
                createdAt: Number(item.createdAt ?? fallback?.createdAt ?? 0),
            } satisfies LibTvScriptV2AssetItem
            return merged.id && merged.imageUrl ? [merged] : []
        })
        const seen = new Set<string>()
        result[kind] = hydrated.filter((item) => {
            const key = String(item.sourceNodeId || item.id).trim()
            if (!key || seen.has(key)) return false
            seen.add(key)
            return true
        })
        return result
    }, {} as Record<LibTvScriptV2AssetKind, LibTvScriptV2AssetItem[]>)
}
