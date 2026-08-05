type KlingOmniImageRole = "first_frame" | "last_frame" | "reference"

type KlingOmniRequestInput = {
  modelId?: string | null
  method?: string | null
  aspectRatio?: string | null
  mode?: string | null
  resolution?: string | null
  imageUrls?: Array<string | null | undefined>
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  videoUrl?: string | null
  videoUrls?: Array<string | null | undefined>
  generateAudio?: boolean
  negativePrompt?: string | null
  multiShot?: boolean
  shotType?: string | null
  multiPrompt?: Array<{ index: number; prompt: string; duration: string | number }>
  elementList?: Array<Record<string, unknown>>
  watermark?: boolean
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

function normalizeMode(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "std" || normalized === "pro" || normalized === "4k") return normalized
  if (normalized === "720p" || normalized === "720") return "std"
  if (normalized === "1080p" || normalized === "1080") return "pro"
  if (normalized === "2160p") return "4k"
  return undefined
}

function normalizeAspectRatio(value?: string | null) {
  const normalized = String(value || "").trim()
  if (normalized === "16:9" || normalized === "9:16" || normalized === "1:1") return normalized
  return undefined
}

export function isKlingV3OmniVideoModelId(modelId?: string | null) {
  return normalizeModelIdentity(modelId) === "kling-v3-omni"
}

export function buildKlingV3OmniRequestPatch(input: KlingOmniRequestInput): Record<string, unknown> {
  if (!isKlingV3OmniVideoModelId(input.modelId)) return {}

  const method = String(input.method || "").trim().toLowerCase()
  const firstFrame = String(input.firstFrameUrl || "").trim()
  const lastFrame = String(input.lastFrameUrl || "").trim()
  const imageUrls = normalizeUrls([
    ...(firstFrame ? [firstFrame] : []),
    ...(input.imageUrls || []),
  ], 32)
  const videoUrls = normalizeUrls([
    ...(input.videoUrl ? [input.videoUrl] : []),
    ...(input.videoUrls || []),
  ], 1)

  const patch: Record<string, unknown> = {
    images: undefined,
    referenceVideo: undefined,
    referenceVideos: undefined,
    audioReferences: undefined,
    video_url: undefined,
    videoUrl: undefined,
    imageTail: undefined,
    sound: undefined,
    generateAudio: undefined,
    audioEnabled: undefined,
    mode: normalizeMode(input.mode) || normalizeMode(input.resolution) || input.mode || undefined,
    aspect_ratio: normalizeAspectRatio(input.aspectRatio),
  }

  if (input.negativePrompt?.trim()) {
    patch.negative_prompt = input.negativePrompt.trim()
    patch.negativePrompt = input.negativePrompt.trim()
  }
  if (typeof input.watermark === "boolean") patch.watermark = input.watermark

  if (videoUrls.length > 0) {
    patch.method = "edit"
    patch.video_list = [{
      video_url: videoUrls[0],
      refer_type: "base",
      keep_original_sound: "no",
    }]
  } else if (method === "start_end" || lastFrame) {
    const roles: Array<{ url: string; role: KlingOmniImageRole }> = []
    const resolvedFirstFrame = firstFrame || imageUrls[0] || ""
    if (resolvedFirstFrame) roles.push({ url: resolvedFirstFrame, role: "first_frame" })
    if (lastFrame) roles.push({ url: lastFrame, role: "last_frame" })
    patch.method = "start_end"
    if (roles.length > 0) patch.image_with_roles = roles
  } else if (imageUrls.length > 0) {
    patch.method = "reference"
    patch.image_urls = imageUrls
  } else {
    patch.method = "text2video"
  }

  if (videoUrls.length === 0 && typeof input.generateAudio === "boolean") {
    patch.audio = input.generateAudio
  }

  if (typeof input.multiShot === "boolean") patch.multiShot = input.multiShot
  const shotType = String(input.shotType || "").trim()
  if (shotType) patch.shotType = shotType
  if (Array.isArray(input.multiPrompt) && input.multiPrompt.length > 0) {
    patch.multiPrompt = input.multiPrompt.slice(0, 6)
  }
  if (Array.isArray(input.elementList) && input.elementList.length > 0) {
    patch.elementList = input.elementList.slice(0, 3)
  }

  return patch
}
