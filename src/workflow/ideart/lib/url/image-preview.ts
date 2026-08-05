import { normalizeRenderableImageUrl } from "@/workflow/ideart/lib/url/image-proxy-policy"

function setProxyWidth(rawUrl: string, width: number): string {
  try {
    const parsed = new URL(rawUrl, "http://local")
    if (parsed.pathname !== "/api/image-proxy") return ""
    const sourceUrl = parsed.searchParams.get("url")
    if (!sourceUrl) return ""
    const directCdnPreviewUrl = buildDirectCdnPreviewUrl(sourceUrl, width)
    if (directCdnPreviewUrl) return directCdnPreviewUrl
    const params = new URLSearchParams()
    params.set("url", sourceUrl)
    if (width > 0) params.set("w", String(width))
    return `/api/image-proxy?${params.toString()}`
  } catch {
    return ""
  }
}

function toSameOriginUploadPath(rawUrl: string): string {
  const input = String(rawUrl || "").trim()
  if (!/^https?:\/\//i.test(input)) return input

  try {
    const parsed = new URL(input)
    if (typeof window !== "undefined" && parsed.origin === window.location.origin && parsed.pathname.startsWith("/uploads/")) {
      return `${parsed.pathname}${parsed.search || ""}`
    }
  } catch {}

  return input
}

function buildDirectCdnPreviewUrl(rawUrl: string, width: number): string {
  if (!/^https?:\/\//i.test(rawUrl)) return ""

  try {
    const parsed = new URL(rawUrl)
    const host = parsed.hostname.toLowerCase()
    const canUseOssProcess =
      host === "a.lovart.ai" ||
      host === "assets-persist.lovart.ai" ||
      host.endsWith(".alicdn.com") ||
      host.endsWith(".aliyuncs.com")

    if (!canUseOssProcess) return ""

    parsed.searchParams.delete("x-oss-process")
    parsed.searchParams.delete("imageMogr2")
    parsed.searchParams.set("x-oss-process", `image/resize,w_${width},m_lfit/format,webp`)
    return parsed.toString()
  } catch {
    return ""
  }
}

function isLikelyNonImageMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl, "http://local")
    return /\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac)(?:$|[?#])/i.test(parsed.pathname)
  } catch {
    return /\.(mp4|webm|mov|m4v|mp3|wav|m4a|aac|ogg|flac)(?:$|[?#])/i.test(rawUrl)
  }
}

export function buildImagePreviewUrl(rawUrl: string, width: number): string {
  const input = toSameOriginUploadPath(normalizeRenderableImageUrl(rawUrl))
  const rawWidth = Math.floor(Number(width) || 0)
  const requestedWidth = rawWidth > 0 ? Math.max(16, Math.min(4096, rawWidth)) : 0
  if (!input) return ""
  if (isLikelyNonImageMediaUrl(input)) return input
  if (!requestedWidth) return input
  if (input.startsWith("data:") || input.startsWith("blob:")) return input

  if (input.startsWith("/api/image-proxy?")) {
    return setProxyWidth(input, requestedWidth) || input
  }

  if (input.startsWith("/uploads/")) {
    const params = new URLSearchParams()
    params.set("url", input)
    params.set("w", String(requestedWidth))
    return `/api/image-proxy?${params.toString()}`
  }

  if (/^https?:\/\//i.test(input)) {
    const directCdnPreviewUrl = buildDirectCdnPreviewUrl(input, requestedWidth)
    if (directCdnPreviewUrl) return directCdnPreviewUrl

    const params = new URLSearchParams()
    params.set("url", input)
    params.set("w", String(requestedWidth))
    return `/api/image-proxy?${params.toString()}`
  }

  return input
}
