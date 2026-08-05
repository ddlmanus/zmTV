import type { WorkflowGenerationKind } from "@/workflow/ideart/lib/codex/workflow-generation-kind"
import type { LibTvWorkflowNode, LibTvWorkflowNodeKind } from "@/workflow/ideart/lib/libtv/workflow"
import { workflowFetch as fetch } from "@/workflow/backend/client"

export type WorkflowCanvasGenerationSettledDetail = {
    source: "workflow-canvas"
    commandId?: string
    codexTaskId: string
    generationTaskId?: string
    nodeId: string
    status: "complete" | "failed"
    kind: WorkflowGenerationKind
    nodeKind?: LibTvWorkflowNodeKind
    prompt: string
    resultUrls: string[]
    error?: string
    aspectRatio?: string
    width?: number
    height?: number
    modelId?: string
}

async function settlementResponseError(response: Response) {
    const payload = await response.clone().json().catch(() => null) as { error?: unknown } | null
    const detail = String(payload?.error || "").trim()
    return new Error(`Codex 生成结果回写失败: HTTP ${response.status}${detail ? ` (${detail})` : ""}`)
}

export async function persistWorkflowCanvasGenerationSettlement(detail: WorkflowCanvasGenerationSettledDetail) {
    if (!detail.codexTaskId || !detail.nodeId) return
    const body = JSON.stringify({
        command_id: detail.commandId || "",
        generation_task_id: detail.generationTaskId || "",
        node_id: detail.nodeId,
        status: detail.status,
        kind: detail.kind,
        node_kind: detail.nodeKind || detail.kind,
        prompt: detail.prompt,
        result_urls: detail.resultUrls,
        error: detail.error || "",
        aspect_ratio: detail.aspectRatio || "",
        width: detail.width,
        height: detail.height,
        model_id: detail.modelId || "",
    })
    let lastError: unknown = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(`/api/codex/tasks/${encodeURIComponent(detail.codexTaskId)}/generations/settle`, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers: { "Content-Type": "application/json" },
                body,
            })
            if (response.ok) return
            lastError = await settlementResponseError(response)
            if (response.status < 500 && response.status !== 429) break
        } catch (error) {
            lastError = error
        }
        await new Promise((resolve) => globalThis.setTimeout(resolve, 300 * (attempt + 1)))
    }
    throw lastError || new Error("Codex 生成结果回写失败")
}

export function publishWorkflowCanvasGenerationSettlement(detail: WorkflowCanvasGenerationSettledDetail) {
    window.dispatchEvent(new CustomEvent("ideart.workflow-codex-generation-settled", { detail }))
    void persistWorkflowCanvasGenerationSettlement(detail).catch((error) => {
        console.error("[workflow canvas] failed to persist Codex generation settlement", error)
    })
}

export function workflowCanvasGenerationSettlementFromNode(
    node: LibTvWorkflowNode,
): WorkflowCanvasGenerationSettledDetail | null {
    const data = (node.data || {}) as unknown as Record<string, unknown>
    if (String(data.workflowGenerationController || "").trim() !== "codex") return null
    const codexTaskId = String(data.workflowCodexTaskId || "").trim()
    if (!codexTaskId) return null
    const kind: WorkflowGenerationKind | null = node.kind === "playlist"
        ? "playlist"
        : node.kind === "audio"
            ? "audio"
            : node.kind === "video" || data.componentType === "video-generator"
                ? "video"
                : node.kind === "image" || data.componentType === "image-generator"
                    ? "image"
                    : null
    if (!kind) return null
    const resultCandidates = [
        data.playlistExportUrl,
        data.mediaUrl,
        ...(Array.isArray(data.workflowImageResults) ? data.workflowImageResults : []),
        ...(Array.isArray(data.workflowVideoResults) ? data.workflowVideoResults : []),
    ]
    const resultUrls = Array.from(new Set(resultCandidates.map((item) => {
        if (typeof item === "string") return item.trim()
        if (!item || typeof item !== "object" || Array.isArray(item)) return ""
        const record = item as Record<string, unknown>
        return String(record.url || record.mediaUrl || "").trim()
    }).filter(Boolean)))
    const error = String(data.workflowGenerationError || "").trim()
    const status = resultUrls.length > 0 ? "complete" : !data.workflowGenerationRunning && error ? "failed" : null
    if (!status) return null
    return {
        source: "workflow-canvas",
        codexTaskId,
        generationTaskId: String(data.workflowCodexGenerationTaskId || data.workflowGenerationTaskId || node.id).trim(),
        nodeId: node.id,
        status,
        kind,
        nodeKind: node.kind,
        prompt: String(data.workflowInternalPrompt || data.prompt || "").trim(),
        resultUrls,
        error: status === "failed" ? error : "",
        aspectRatio: String(data.aspectRatio || "").trim(),
        width: Number(data.workflowMediaNaturalWidth || node.width) || undefined,
        height: Number(data.workflowMediaNaturalHeight || node.height) || undefined,
        modelId: String(data.modelId || "").trim(),
    }
}
