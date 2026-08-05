import type {
  LibTvWorkflowEdge,
  LibTvWorkflowNode,
  LibTvWorkflowPlaylistItem,
} from "@/workflow/ideart/lib/libtv/workflow"

export type LibTvWorkflowPlaylistExecutionState = {
  items: LibTvWorkflowPlaylistItem[]
  backgroundAudioUrl?: string
  backgroundAudioNodeId?: string
  voiceoverAudioUrl?: string
  voiceoverAudioNodeId?: string
}

export type LibTvWorkflowPlaylistOutputResolution = {
  outputNode?: LibTvWorkflowNode
  duplicateNodeIds: string[]
}

function playlistDuration(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
  const matched = String(value || "").trim().match(/(\d+(?:\.\d+)?)/)
  const duration = matched ? Number(matched[1]) : 0
  return Number.isFinite(duration) && duration > 0 ? duration : undefined
}

function playlistItemFromNode(
  playlistId: string,
  node: LibTvWorkflowNode,
  existing?: LibTvWorkflowPlaylistItem,
): LibTvWorkflowPlaylistItem | null {
  if (node.kind !== "video") return null
  const mediaUrl = String(node.data?.mediaUrl || "").trim()
  if (!mediaUrl) return null
  return {
    id: String(existing?.id || `${playlistId}-${node.id}`),
    nodeId: node.id,
    title: String(node.data?.title || existing?.title || "视频").trim() || "视频",
    mediaUrl,
    thumbnailUrl: String(node.data?.thumbnailUrl || existing?.thumbnailUrl || "").trim() || undefined,
    duration: playlistDuration(node.data?.workflowMediaDurationSec)
      || playlistDuration(node.data?.videoDuration)
      || playlistDuration(existing?.duration),
    trimStart: existing?.trimStart,
    trimEnd: existing?.trimEnd,
  }
}

export function isLibTvWorkflowBackgroundAudioMode(value: unknown) {
  const mode = String(value || "")
    .trim()
    .toLowerCase()
  return (
    mode === "music"
    || /music|generate-(?:bgm|song)|ace-step|(?:^|[/_-])bgm(?:$|[/_-])/.test(mode)
  )
}

function audioRole(node: LibTvWorkflowNode): "background_music" | "voiceover" {
  if (node.data?.workflowAudioRole === "background_music" || node.data?.workflowAudioRole === "voiceover") {
    return node.data.workflowAudioRole
  }
  const audioMode = String(node.data?.workflowExtraParameters?.audioMode || "").trim().toLowerCase()
  const titleAndPrompt = `${node.data?.title || ""} ${node.data?.prompt || ""}`.toLowerCase()
  return isLibTvWorkflowBackgroundAudioMode(audioMode) || /背景音乐|配乐|bgm|music|soundtrack/.test(titleAndPrompt)
    ? "background_music"
    : "voiceover"
}

export function hydrateLibTvWorkflowPlaylistItems(
  items: LibTvWorkflowPlaylistItem[],
  nodes: LibTvWorkflowNode[],
  playlistId = "playlist",
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  return items.map((item) => {
    const nodeId = String(item.nodeId || "").trim()
    const sourceNode = nodeId ? nodesById.get(nodeId) : undefined
    return sourceNode ? playlistItemFromNode(playlistId, sourceNode, item) || item : item
  })
}

export function resolveLibTvWorkflowPlaylistExecutionState(
  playlistNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
): LibTvWorkflowPlaylistExecutionState {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const incomingNodes = edges
    .filter((edge) => edge.target === playlistNode.id)
    .map((edge) => nodesById.get(edge.source))
    .filter((node): node is LibTvWorkflowNode => Boolean(node))
    .filter((node, index, list) => list.findIndex((candidate) => candidate.id === node.id) === index)
  const connectedVideos = incomingNodes.filter((node) => node.kind === "video")
  const connectedVideoIds = new Set(connectedVideos.map((node) => node.id))
  const connectedVideoByUrl = new Map(connectedVideos
    .map((node) => [String(node.data?.mediaUrl || "").trim(), node] as const)
    .filter(([url]) => Boolean(url)))
  const currentItems = Array.isArray(playlistNode.data?.playlistItems) ? playlistNode.data.playlistItems : []
  const orderedVideos: Array<{ node: LibTvWorkflowNode; existing?: LibTvWorkflowPlaylistItem }> = []
  const usedVideoIds = new Set<string>()

  currentItems.forEach((item) => {
    const nodeId = String(item.nodeId || "").trim()
    const mediaUrl = String(item.mediaUrl || "").trim()
    const node = nodeId && connectedVideoIds.has(nodeId)
      ? nodesById.get(nodeId)
      : mediaUrl ? connectedVideoByUrl.get(mediaUrl) : undefined
    if (!node || node.kind !== "video" || usedVideoIds.has(node.id)) return
    usedVideoIds.add(node.id)
    orderedVideos.push({ node, existing: item })
  })
  connectedVideos.forEach((node) => {
    if (usedVideoIds.has(node.id)) return
    usedVideoIds.add(node.id)
    const existing = currentItems.find((item) => (
      String(item.nodeId || "").trim() === node.id
      || Boolean(item.mediaUrl && String(item.mediaUrl).trim() === String(node.data?.mediaUrl || "").trim())
    ))
    orderedVideos.push({ node, existing })
  })

  const items = orderedVideos
    .map(({ node, existing }) => playlistItemFromNode(playlistNode.id, node, existing))
    .filter((item): item is LibTvWorkflowPlaylistItem => Boolean(item))

  const connectedAudio = incomingNodes
    .filter((node) => node.kind === "audio" && Boolean(String(node.data?.mediaUrl || "").trim()))
  const preferredBackgroundId = String(playlistNode.data?.playlistBackgroundAudioNodeId || "").trim()
  const preferredVoiceoverId = String(playlistNode.data?.playlistVoiceoverNodeId || "").trim()
  const backgroundNode = connectedAudio.find((node) => node.id === preferredBackgroundId && audioRole(node) === "background_music")
    || connectedAudio.filter((node) => audioRole(node) === "background_music").at(-1)
  const voiceoverNode = connectedAudio.find((node) => node.id === preferredVoiceoverId && audioRole(node) === "voiceover")
    || connectedAudio.filter((node) => audioRole(node) === "voiceover").at(-1)

  return {
    items,
    backgroundAudioUrl: String(backgroundNode?.data?.mediaUrl || "").trim() || undefined,
    backgroundAudioNodeId: backgroundNode?.id,
    voiceoverAudioUrl: String(voiceoverNode?.data?.mediaUrl || "").trim() || undefined,
    voiceoverAudioNodeId: voiceoverNode?.id,
  }
}

export function resolveLibTvWorkflowPlaylistOutputNodes(
  playlistNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
): LibTvWorkflowPlaylistOutputResolution {
  const playlistId = String(playlistNode.id || "").trim()
  const exportUrl = String(playlistNode.data?.playlistExportUrl || "").trim()
  if (!playlistId || !exportUrl) return { duplicateNodeIds: [] }

  const outputTitle = `${String(playlistNode.data?.title || "视频合成").trim() || "视频合成"}｜成片`
  const outgoingIds = new Set(edges
    .filter((edge) => edge.source === playlistId)
    .map((edge) => edge.target))
  const marked = nodes.filter((node) => (
    node.kind === "video"
    && String(node.data?.workflowPlaylistSourceNodeId || "").trim() === playlistId
  ))
  const connectedLegacy = nodes.filter((node) => {
    if (node.kind !== "video" || !outgoingIds.has(node.id)) return false
    if (node.data?.mediaRole === "generator" || node.data?.componentType === "video-generator") return false
    const mediaUrl = String(node.data?.mediaUrl || "").trim()
    const title = String(node.data?.title || "").trim()
    return mediaUrl === exportUrl || title === outputTitle
  })
  const candidates = [...marked, ...connectedLegacy]
    .filter((node, index, list) => list.findIndex((candidate) => candidate.id === node.id) === index)
  const outputNode = candidates.find((node) => String(node.data?.mediaUrl || "").trim() === exportUrl)
    || marked[0]
    || connectedLegacy[0]

  return {
    outputNode,
    duplicateNodeIds: outputNode
      ? candidates.filter((node) => node.id !== outputNode.id).map((node) => node.id)
      : [],
  }
}
