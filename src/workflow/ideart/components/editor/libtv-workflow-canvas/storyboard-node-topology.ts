import type { LibTvWorkflowEdge, LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow"

type StoryboardEdgePair = {
    source: string
    target: string
}

type DesiredStoryboardEdgePair = StoryboardEdgePair & {
    role: "script" | "asset-group" | "asset"
}

export type WorkflowStoryboardTopologyParams = {
    currentEdges: LibTvWorkflowEdge[]
    scriptNodeId: string
    storyboardGroupId: string
    storyboardNodeIds: string[]
    assetGroupId?: string | null
    assetNodeIds: string[]
    assetEdges?: StoryboardEdgePair[]
}

export const WORKFLOW_STORYBOARD_GENERATOR_IDENTITY = Object.freeze({
    mediaRole: "generator" as const,
    componentType: "image-generator" as const,
})

function normalizeId(value: unknown) {
    return String(value || "").trim()
}

function edgePairKey(source: string, target: string) {
    return `${source}\u0000${target}`
}

/**
 * Keep storyboard topology edge ids stable across progress/result updates.
 * React Flow can render an edge without a persisted handle, but it cannot
 * recover cleanly when the same logical edge is replaced on every update.
 */
export function createWorkflowStoryboardEdgeId(role: string, source: string, target: string) {
    return `storyboard-${role}-${encodeURIComponent(source)}-${encodeURIComponent(target)}`
}

function addDesiredPair(
    pairs: DesiredStoryboardEdgePair[],
    seen: Set<string>,
    sourceValue: unknown,
    targetValue: unknown,
    role: DesiredStoryboardEdgePair["role"],
) {
    const source = normalizeId(sourceValue)
    const target = normalizeId(targetValue)
    if (!source || !target || source === target) return
    const key = edgePairKey(source, target)
    if (seen.has(key)) return
    seen.add(key)
    pairs.push({ source, target, role })
}

/**
 * Resolve the asset group recorded on a script-v2 node without allowing a
 * stale/deleted group id to create a dangling edge.
 */
export function resolveWorkflowStoryboardAssetGroupId(
    assetGroupId: unknown,
    nodes: Array<Pick<LibTvWorkflowNode, "id" | "kind" | "parentId" | "data">>,
    excludedGroupId?: string | null,
    assetNodeIds: string[] = [],
) {
    const candidate = normalizeId(assetGroupId)
    const excluded = normalizeId(excludedGroupId)
    if (candidate && candidate !== excluded && nodes.some((node) => node.id === candidate && node.kind === "group")) {
        return candidate
    }

    const assetIds = new Set(assetNodeIds.map(normalizeId).filter(Boolean))
    if (assetIds.size === 0) return ""
    const assetParents = new Map(nodes
        .filter((node) => assetIds.has(node.id))
        .map((node) => [node.id, normalizeId(node.parentId)]))
    const rankedGroups = nodes
        .filter((node) => node.kind === "group" && node.id !== excluded)
        .map((node) => {
            const memberIds = new Set((Array.isArray(node.data?.groupNodeIds) ? node.data.groupNodeIds : [])
                .map(normalizeId)
                .filter(Boolean))
            let matchedAssets = 0
            assetIds.forEach((assetId) => {
                if (memberIds.has(assetId) || assetParents.get(assetId) === node.id) matchedAssets += 1
            })
            return { id: node.id, matchedAssets }
        })
        .filter((group) => group.matchedAssets > 0)
        .sort((left, right) => right.matchedAssets - left.matchedAssets || left.id.localeCompare(right.id))
    return rankedGroups[0]?.id || ""
}

/**
 * Build the persisted graph for a storyboard run.
 *
 * The script is a group-level input. The asset group is also a group-level
 * input, while each matched asset keeps a precise edge to the shot generator
 * that consumes it. Old script-to-shot and stale reference edges are removed
 * only inside this storyboard subgraph; unrelated user connections survive.
 */
export function normalizeWorkflowStoryboardTopologyEdges(
    params: WorkflowStoryboardTopologyParams,
): LibTvWorkflowEdge[] {
    const scriptNodeId = normalizeId(params.scriptNodeId)
    const storyboardGroupId = normalizeId(params.storyboardGroupId)
    const assetGroupId = normalizeId(params.assetGroupId)
    const storyboardNodeIds = new Set(params.storyboardNodeIds.map(normalizeId).filter(Boolean))
    const assetNodeIds = new Set(params.assetNodeIds.map(normalizeId).filter(Boolean))
    const managedTargetIds = new Set([storyboardGroupId, ...storyboardNodeIds].filter(Boolean))
    const managedSourceIds = new Set([scriptNodeId, assetGroupId, ...assetNodeIds].filter(Boolean))

    const desiredPairs: DesiredStoryboardEdgePair[] = []
    const desiredKeys = new Set<string>()
    addDesiredPair(desiredPairs, desiredKeys, scriptNodeId, storyboardGroupId, "script")
    addDesiredPair(desiredPairs, desiredKeys, assetGroupId, storyboardGroupId, "asset-group")
    for (const edge of params.assetEdges || []) {
        if (!assetNodeIds.has(normalizeId(edge.source)) || !storyboardNodeIds.has(normalizeId(edge.target))) continue
        addDesiredPair(desiredPairs, desiredKeys, edge.source, edge.target, "asset")
    }

    const existingByPair = new Map<string, LibTvWorkflowEdge>()
    const nextEdges: LibTvWorkflowEdge[] = []
    const seenPairs = new Set<string>()
    for (const edge of params.currentEdges || []) {
        const source = normalizeId(edge.source)
        const target = normalizeId(edge.target)
        if (!source || !target) continue
        const key = edgePairKey(source, target)
        if (!existingByPair.has(key)) existingByPair.set(key, edge)
        const isManagedStoryboardEdge = managedSourceIds.has(source) && managedTargetIds.has(target)
        if (isManagedStoryboardEdge) continue
        if (seenPairs.has(key)) continue
        seenPairs.add(key)
        nextEdges.push(edge)
    }

    desiredPairs.forEach((pair) => {
        const key = edgePairKey(pair.source, pair.target)
        if (seenPairs.has(key)) return
        seenPairs.add(key)
        const existing = existingByPair.get(key)
        nextEdges.push(existing || {
            id: createWorkflowStoryboardEdgeId(pair.role, pair.source, pair.target),
            source: pair.source,
            target: pair.target,
        })
    })

    return nextEdges
}
