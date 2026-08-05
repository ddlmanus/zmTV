import type { LibTvWorkflowPlaylistItem } from "@/workflow/ideart/lib/libtv/workflow"

export type WorkflowPlaylistExportResult = {
  url: string
  durationSeconds?: number
  width?: number
  height?: number
}

export function getWorkflowPlaylistDuration(items: LibTvWorkflowPlaylistItem[]) {
  return items.reduce((total, item) => {
    const sourceDuration = Number.isFinite(Number(item.duration)) && Number(item.duration) > 0 ? Number(item.duration) : 5
    const trimStart = Number.isFinite(Number(item.trimStart)) ? Math.max(0, Math.min(sourceDuration - 0.05, Number(item.trimStart))) : 0
    const trimEnd = Number.isFinite(Number(item.trimEnd)) ? Math.max(trimStart + 0.05, Math.min(sourceDuration, Number(item.trimEnd))) : sourceDuration
    return total + (trimEnd - trimStart)
  }, 0)
}

export async function requestWorkflowPlaylistExport(params: {
  title: string
  items: LibTvWorkflowPlaylistItem[]
  startSeconds?: number
  endSeconds?: number
  backgroundAudioUrl?: string
  backgroundAudioVolume?: number
  voiceoverAudioUrl?: string
  voiceoverVolume?: number
  subtitles?: string
}) {
  const items = params.items.filter((item) => String(item.mediaUrl || "").trim())
  if (!items.length) throw new Error("请先连接已生成的视频节点")
  const totalDuration = getWorkflowPlaylistDuration(items)
  const startSeconds = Math.max(0, Number(params.startSeconds || 0))
  const endSeconds = Math.max(startSeconds, Number(params.endSeconds || totalDuration))
  const response = await fetch("/api/workflow/playlist-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      title: params.title,
      startSeconds,
      endSeconds,
      backgroundAudioUrl: String(params.backgroundAudioUrl || "").trim() || undefined,
      backgroundAudioVolume: params.backgroundAudioVolume,
      voiceoverAudioUrl: String(params.voiceoverAudioUrl || "").trim() || undefined,
      voiceoverVolume: params.voiceoverVolume,
      subtitles: String(params.subtitles || "").trim() || undefined,
      items: items.map((item) => ({
        title: item.title,
        mediaUrl: item.mediaUrl,
        duration: item.duration,
        trimStart: item.trimStart,
        trimEnd: item.trimEnd,
      })),
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(String(payload?.error || "视频合成失败"))
  const url = String(payload?.url || "").trim()
  if (!url) throw new Error("视频合成成功，但没有返回成片地址")
  return {
    url,
    durationSeconds: Number.isFinite(Number(payload?.durationSeconds)) ? Number(payload.durationSeconds) : undefined,
    width: Number.isFinite(Number(payload?.width)) ? Number(payload.width) : undefined,
    height: Number.isFinite(Number(payload?.height)) ? Number(payload.height) : undefined,
  } satisfies WorkflowPlaylistExportResult
}
