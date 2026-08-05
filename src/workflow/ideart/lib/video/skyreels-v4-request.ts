type SkyReelsV4RequestInput = {
  modelId?: string | null
  method?: string | null
  aspectRatio?: string | null
  resolution?: string | null
  promptOptimizer?: boolean
  imageUrls?: Array<string | null | undefined>
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  videoUrl?: string | null
  videoUrls?: Array<string | null | undefined>
  audioUrls?: Array<string | null | undefined>
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
  if (normalized === "16:9" || normalized === "4:3" || normalized === "1:1" || normalized === "9:16" || normalized === "3:4") return normalized
  return undefined
}

function normalizeResolution(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase()
  if (normalized === "480p" || normalized === "480") return "480p"
  if (normalized === "720p" || normalized === "720") return "720p"
  if (normalized === "1080p" || normalized === "1080") return "1080p"
  return undefined
}

export function isSkyReelsV4ApimartVideoModelId(modelId?: string | null) {
  const normalized = normalizeModelIdentity(modelId)
  return normalized === "skyreels-v4-fast" || normalized === "skyreels-v4-std"
}

export function buildSkyReelsV4RequestPatch(input: SkyReelsV4RequestInput): Record<string, unknown> {
  if (!isSkyReelsV4ApimartVideoModelId(input.modelId)) return {}

  const method = String(input.method || "").trim().toLowerCase()
  const firstFrame = String(input.firstFrameUrl || "").trim()
  const lastFrame = String(input.lastFrameUrl || "").trim()
  const imageUrls = normalizeUrls([
    ...(firstFrame ? [firstFrame] : []),
    ...(input.imageUrls || []),
    ...(lastFrame ? [lastFrame] : []),
  ], 8)
  const videoUrls = normalizeUrls([
    ...(input.videoUrl ? [input.videoUrl] : []),
    ...(input.videoUrls || []),
  ], 1)
  const audioUrls = normalizeUrls(input.audioUrls, 1)
  const wantsOmni = method === "reference"
    || method === "edit"
    || method === "motion"
    || method === "extend"
    || videoUrls.length > 0
    || audioUrls.length > 0
  const wantsKeyframes = method === "start_end" || method === "keyframe"

  const patch: Record<string, unknown> = {
    images: undefined,
    referenceVideo: undefined,
    referenceVideos: undefined,
    audioReferences: undefined,
    image_urls: undefined,
    imageUrls: undefined,
    image_with_roles: undefined,
    imageWithRoles: undefined,
    video_urls: undefined,
    videoUrls: undefined,
    audio_urls: undefined,
    audioUrls: undefined,
    video_list: undefined,
    videoList: undefined,
    video_url: undefined,
    videoUrl: undefined,
    first_frame_image: undefined,
    firstFrameImage: undefined,
    imageTail: undefined,
    sound: undefined,
    audio: undefined,
    generateAudio: undefined,
    audioEnabled: undefined,
    aspect_ratio: normalizeAspectRatio(input.aspectRatio),
    resolution: normalizeResolution(input.resolution) || input.resolution || undefined,
  }

  if (typeof input.promptOptimizer === "boolean") {
    patch.promptOptimizer = input.promptOptimizer
    patch.prompt_optimizer = input.promptOptimizer
  }

  if (wantsOmni) {
    patch.method = method === "extend" ? "extend" : "reference"
    if (method === "extend") {
      if (videoUrls[0]) {
        patch.ref_videos = [{ tag: "@video1", type: "extend", video_url: videoUrls[0] }]
      }
      return patch
    }
    if (imageUrls.length > 0) {
      patch.ref_images = [{
        tag: "@image_1",
        type: "image",
        image_urls: imageUrls.slice(0, 5),
        ...(audioUrls[0] ? { audio_url: audioUrls[0] } : {}),
      }]
    }
    if (videoUrls[0]) {
      patch.ref_videos = [{ tag: "@video_1", type: "reference", video_url: videoUrls[0] }]
    }
    return patch
  }

  if (wantsKeyframes) {
    const resolvedFirstFrame = firstFrame || imageUrls[0] || ""
    const resolvedEndFrame = lastFrame || imageUrls.find((url) => url !== resolvedFirstFrame) || ""
    patch.method = "start_end"
    if (resolvedFirstFrame) patch.first_frame_image = resolvedFirstFrame
    if (resolvedEndFrame) patch.end_frame_image = resolvedEndFrame
    const midFrameUrls = imageUrls.filter((url) => url !== resolvedFirstFrame && url !== resolvedEndFrame).slice(0, 6)
    if (midFrameUrls.length > 0) {
      patch.mid_frame_images = midFrameUrls.map((url, index) => ({
        tag: `@image${index + 1}`,
        image_url: url,
        time_stamp: index + 1,
      }))
    }
    return patch
  }

  if (imageUrls.length > 0) {
    patch.method = "first_frame"
    patch.first_frame_image = imageUrls[0]
  } else {
    patch.method = "text2video"
  }

  return patch
}
