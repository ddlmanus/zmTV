type OmniFlashExtRequestInput = {
  modelId?: string | null
  aspectRatio?: string | null
  resolution?: string | null
  imageUrls?: Array<string | null | undefined>
  firstFrameUrl?: string | null
}

function normalizeModelIdentity(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/@@[a-z0-9_-]+$/, "")
    .replace(/@[a-z0-9_-]+$/, "")
}

function normalizeUrls(values: Array<string | null | undefined> | undefined, maxItems: number) {
  const urls = (values || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
  return Array.from(new Set(urls)).slice(0, maxItems)
}

function normalizeAspectRatio(value?: string | null) {
  const normalized = String(value || "").trim()
  if (normalized === "16:9" || normalized === "9:16") return normalized
  return undefined
}

function normalizeResolution(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "720p" || normalized === "720" || normalized === "hd") return "720p"
  if (normalized === "1080p" || normalized === "1080" || normalized === "fhd") return "1080p"
  if (normalized === "4k" || normalized === "2160p" || normalized === "uhd") return "4k"
  return undefined
}

export function isOmniFlashExtVideoModelId(modelId?: string | null) {
  return normalizeModelIdentity(modelId) === "omni-flash-ext"
}

export function buildOmniFlashExtRequestPatch(input: OmniFlashExtRequestInput): Record<string, unknown> {
  if (!isOmniFlashExtVideoModelId(input.modelId)) return {}

  const firstFrame = String(input.firstFrameUrl || "").trim()
  const imageUrls = normalizeUrls([
    ...(firstFrame ? [firstFrame] : []),
    ...(input.imageUrls || []),
  ], 3)

  const patch: Record<string, unknown> = {
    images: undefined,
    image_with_roles: undefined,
    imageWithRoles: undefined,
    referenceVideo: undefined,
    referenceVideos: undefined,
    video_url: undefined,
    videoUrl: undefined,
    video_urls: undefined,
    videoUrls: undefined,
    audio_urls: undefined,
    audioUrls: undefined,
    first_frame_image: undefined,
    firstFrameImage: undefined,
    last_frame_image: undefined,
    lastFrameImage: undefined,
    end_frame_image: undefined,
    endFrameImage: undefined,
    aspect_ratio: normalizeAspectRatio(input.aspectRatio),
    size: normalizeAspectRatio(input.aspectRatio),
    resolution: normalizeResolution(input.resolution) || input.resolution || undefined,
  }

  if (imageUrls.length === 1 || imageUrls.length === 3) {
    patch.image_urls = imageUrls
    patch.imageUrls = imageUrls
  }

  return patch
}
