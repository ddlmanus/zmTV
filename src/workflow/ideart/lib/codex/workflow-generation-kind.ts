export type WorkflowGenerationKind = "image" | "video" | "audio" | "playlist"
export type WorkflowGenerationMediaKind = "image" | "video" | "audio"

export function normalizeWorkflowGenerationKind(
  value: unknown,
  nodeKind?: unknown,
): WorkflowGenerationKind {
  const signal = `${String(nodeKind || "").trim()} ${String(value || "").trim()}`.toLowerCase()
  if (/\bplaylist\b|video[_\s-]*(?:composition|compose|compositor)|视频合成/.test(signal)) return "playlist"
  if (/\baudio\b|music|speech|voiceover|sound[_\s-]*effect|音频|音乐|配音/.test(signal)) return "audio"
  if (/\bvideo\b|视频/.test(signal)) return "video"
  return "image"
}

export function workflowGenerationMediaKind(kind: WorkflowGenerationKind): WorkflowGenerationMediaKind {
  return kind === "playlist" ? "video" : kind
}

export function workflowGenerationShouldCreateMirror(kind: WorkflowGenerationKind) {
  return kind === "image" || kind === "video"
}

export function workflowGenerationStatusTitle(
  kind: WorkflowGenerationKind,
  status: "generating" | "complete" | "failed",
) {
  const subject = kind === "playlist"
    ? "视频合成"
    : kind === "audio"
      ? "音频生成"
      : kind === "video"
        ? "视频生成"
        : "图片生成"
  if (status === "complete") return `${subject}完成`
  if (status === "failed") return `${subject}失败`
  return `${subject}中`
}
