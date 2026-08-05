type KlingV3RequestInput = {
  modelId?: string | null
  method?: string | null
  aspectRatio?: string | null
  mode?: string | null
  resolution?: string | null
  imageUrls?: Array<string | null | undefined>
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
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

function normalizeSize(value?: string | null) {
  const normalized = String(value || "").trim()
  if (normalized === "16:9" || normalized === "9:16" || normalized === "1:1") return normalized
  return undefined
}

export function isKlingV3VideoModelId(modelId?: string | null) {
  return normalizeModelIdentity(modelId) === "kling-v3"
}

export function buildKlingV3RequestPatch(input: KlingV3RequestInput): Record<string, unknown> {
  if (!isKlingV3VideoModelId(input.modelId)) return {}

  const firstFrame = String(input.firstFrameUrl || "").trim()
  const lastFrame = String(input.lastFrameUrl || "").trim()
  const imageUrls = normalizeUrls([
    ...(firstFrame ? [firstFrame] : []),
    ...(input.imageUrls || []),
    ...(lastFrame ? [lastFrame] : []),
  ], 2)

  const patch: Record<string, unknown> = {
    images: undefined,
    referenceVideo: undefined,
    referenceVideos: undefined,
    audioReferences: undefined,
    video_url: undefined,
    videoUrl: undefined,
    video_list: undefined,
    image_with_roles: undefined,
    imageWithRoles: undefined,
    imageTail: undefined,
    sound: undefined,
    generateAudio: undefined,
    audioEnabled: undefined,
    mode: normalizeMode(input.mode) || normalizeMode(input.resolution) || input.mode || undefined,
    size: normalizeSize(input.aspectRatio),
  }

  if (imageUrls.length > 0) patch.image_urls = imageUrls
  if (typeof input.generateAudio === "boolean") patch.audio = input.generateAudio
  if (input.negativePrompt?.trim()) {
    patch.negative_prompt = input.negativePrompt.trim()
    patch.negativePrompt = input.negativePrompt.trim()
  }
  if (typeof input.watermark === "boolean") patch.watermark = input.watermark
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
