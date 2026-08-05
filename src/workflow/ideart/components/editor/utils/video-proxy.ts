"use client"

// Keep video URL normalization consistent between:
// - Canvas video playback overlays
// - Konva VideoLayer playback
// - Download actions (should match the fullscreen player's src)

export const shouldUseVideoProxy = (url: string) => {
  if (!url || !/^https?:\/\//i.test(url)) return false
  try {
    const parsed = new URL(url)
    const hostname = parsed.hostname.toLowerCase()
    return (
      /^ark-[a-z0-9-]+\.tos-[a-z0-9-]+\.volces\.com$/i.test(hostname) ||
      /^ark-content-generation-[a-z0-9-]+\.tos-[a-z0-9-]+\.volces\.com$/i.test(hostname) ||
      // OSS output buckets do not consistently expose browser CORS headers, including persisted workflow videos.
      /^[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(hostname) ||
      /^[a-z0-9-]+-\d+\.cos\.[a-z0-9-]+\.myqcloud\.com$/i.test(hostname) ||
      hostname === 'platform-outputs.agnes-ai.space' ||
      hostname === 'upload.apimart.ai' ||
      hostname === 'getapib.org'
    )
  } catch {
    return false
  }
}

export const isPersistedWorkflowVideoUrl = (url: string) => {
  if (!url || !/^https?:\/\//i.test(url)) return false
  try {
    const pathname = new URL(url).pathname
    return pathname.includes('/uploads/zaomeng-generated-videos/')
      || pathname.includes('/uploads/libtv-generated-videos/')
  } catch {
    return false
  }
}

export const toVideoDisplayUrl = (url: string) => {
  if (!url || !/^https?:\/\//i.test(url)) return url
  if (!shouldUseVideoProxy(url)) return url
  return `/api/video-proxy?url=${encodeURIComponent(url)}`
}
