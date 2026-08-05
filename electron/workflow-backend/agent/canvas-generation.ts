export type CodexCanvasGenerationKind = "image" | "video" | "audio" | "playlist"

export function codexCanvasGenerationKind(value: unknown): CodexCanvasGenerationKind | "" {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "image" || normalized === "video" || normalized === "audio" || normalized === "playlist") {
    return normalized
  }
  return ""
}

export function codexCanvasGenerationMediaKind(kind: CodexCanvasGenerationKind) {
  return kind === "playlist" ? "video" : kind
}

export function codexCanvasGenerationPayloadType(kind: CodexCanvasGenerationKind) {
  if (kind === "audio") return "audioGeneration"
  return kind === "video" || kind === "playlist" ? "videoGeneration" : "imageGeneration"
}

export function codexCanvasGenerationEventType(kind: CodexCanvasGenerationKind) {
  if (kind === "audio") return "app.audioGeneration"
  return kind === "video" || kind === "playlist" ? "app.videoGeneration" : "app.imageGeneration"
}

export function codexCanvasGenerationOutputName(kind: CodexCanvasGenerationKind) {
  if (kind === "playlist") return "合成视频"
  if (kind === "audio") return "生成音频"
  return kind === "video" ? "生成视频" : "生成图片"
}
