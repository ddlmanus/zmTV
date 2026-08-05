"use client"

export type WorkflowMediaUploadOverlayStatus = "uploading" | "reviewing" | "success" | "error"

export const WORKFLOW_MEDIA_UPLOAD_SUCCESS_VISIBLE_MS = 1000
export const WORKFLOW_MEDIA_UPLOAD_ERROR_VISIBLE_MS = 3000

export function formatWorkflowMediaUploadPercent(progress: number | undefined) {
  if (!Number.isFinite(Number(progress))) return undefined
  return Math.max(0, Math.min(100, Math.round(Number(progress) * 100)))
}

export function getWorkflowMediaUploadOverlayLabel({
  status,
  progress,
  message,
}: {
  status: WorkflowMediaUploadOverlayStatus
  progress?: number
  message?: string
}) {
  if (status === "uploading") {
    const percent = formatWorkflowMediaUploadPercent(progress)
    return percent === undefined ? "上传中..." : `上传中（${percent}%）...`
  }
  if (status === "reviewing") return "审核中..."
  if (status === "success") return "上传成功"
  return String(message || "上传失败").trim() || "上传失败"
}

/**
 * Mirrors LibTV's canvas UploadOverlay structure (production module 799093).
 * Image and video resource nodes deliberately share this exact state layer;
 * only the preview below it differs by media type.
 */
export function WorkflowMediaUploadOverlay({
  status,
  progress,
  message,
  hasContent = false,
}: {
  status?: WorkflowMediaUploadOverlayStatus
  progress?: number
  message?: string
  hasContent?: boolean
}) {
  if (!status) return null

  const label = getWorkflowMediaUploadOverlayLabel({ status, progress, message })
  const isPending = status === "uploading" || status === "reviewing"

  return (
    <div
      aria-live="polite"
      aria-label={label}
      data-testid={`canvas-node-media-upload-${status}`}
      className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center overflow-hidden rounded-xl"
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 rounded-xl ${isPending ? "generating-breathing-dark" : "bg-black/30"}`}
        style={isPending && hasContent
          ? { backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }
          : undefined}
      />
      <span
        className={`relative max-w-[80%] truncate text-xs font-medium ${status === "error" ? "text-red-400" : "text-white/80"}`}
        title={status === "error" ? label : undefined}
      >
        {label}
      </span>
    </div>
  )
}
