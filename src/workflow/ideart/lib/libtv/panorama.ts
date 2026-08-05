import type { CanvasLayer } from "@/workflow/ideart/lib/store/canvas-store"

export const LIBTV_PANORAMA_MODEL_OPTION_ID = "panorama-model"
export const LIBTV_PANORAMA_MODEL_OPTION_LABEL = "可环视全景"
export const LIBTV_OPEN_PANORAMA_PREVIEW_EVENT = "ideart:libtv-open-panorama-preview"
export const LIBTV_PANORAMA_SCREENSHOT_EVENT = "ideart:libtv-panorama-screenshot"
export const LIBTV_PANORAMA_DEFAULT_RATIO = "2:1"
export const LIBTV_PANORAMA_DEFAULT_IMAGE_SIZE = "4K"

export const LIBTV_PANORAMA_USAGE_NOTICES = [
  "生成结果会直接输出 2:1 的可环视全景贴图，便于直接进入预览。",
  "AI 在生成空旷的、无明确建筑或物体参照的户外场景时，可环视空间特征可能不明显。",
  "AI 生成存在随机性，偶尔会出现可环视空间特征不明显的情况，通常再生成 1-2 次可以改善。",
  "接缝无法无痕闭合、空间轻微扭曲等问题无法完全避免，但对图像和视频参考生成影响较小。",
  "截图后可结合 LibNano 模型做二次修复处理，进一步优化接缝和局部细节。",
] as const

export type LibTvPanoramaSourceMode = "scene" | "text" | "reference"

export type LibTvPanoramaPreviewOpenDetail = {
  layerId: string
}

export type LibTvPanoramaCaptureShot = {
  suffix: string
  yawDeg: number
  pitchDeg?: number
}

export type LibTvPanoramaScreenshotEventDetail = {
  layerId: string
  title: string
  images: Array<LibTvPanoramaCaptureShot & { dataUrl: string }>
}

function normalizePanoramaYaw(yawDeg: number) {
  let next = yawDeg % 360
  if (next < 0) next += 360
  return next
}

export function buildLibTvPanoramaFourShots(baseYaw = 0): LibTvPanoramaCaptureShot[] {
  return [
    { suffix: "前方", yawDeg: normalizePanoramaYaw(baseYaw) },
    { suffix: "右侧", yawDeg: normalizePanoramaYaw(baseYaw + 90) },
    { suffix: "后方", yawDeg: normalizePanoramaYaw(baseYaw + 180) },
    { suffix: "左侧", yawDeg: normalizePanoramaYaw(baseYaw + 270) },
  ]
}

export function buildLibTvPanoramaTwelveShots(baseYaw = 0): LibTvPanoramaCaptureShot[] {
  return new Array(12).fill(0).map((_, index) => ({
    suffix: `${index * 30}°`,
    yawDeg: normalizePanoramaYaw(baseYaw + index * 30),
  }))
}

function getLayerImageUrlCandidates(layer: CanvasLayer | null | undefined) {
  return [
    String(layer?.genResultImage || "").trim(),
    String(layer?.src || "").trim(),
    String(layer?.libtvMediaUrl || "").trim(),
  ].filter(Boolean)
}

export function isLibTvPanoramaGeneratorLayer(layer: CanvasLayer | null | undefined) {
  return layer?.libtvNodeKind === "image" && String(layer?.libtvOptionId || "").trim() === LIBTV_PANORAMA_MODEL_OPTION_ID
}

export function getLibTvPanoramaImageUrl(layer: CanvasLayer | null | undefined) {
  return getLayerImageUrlCandidates(layer)[0] || ""
}

export function isLibTvPanoramaPreviewableLayer(layer: CanvasLayer | null | undefined) {
  if (!layer) return false
  if (layer.genStatus === "generating") return false
  const hasUrl = Boolean(getLibTvPanoramaImageUrl(layer))
  if (!hasUrl) return false

  const explicitPanorama =
    layer.libtvPanoramaMode === "standard"
    || layer.libtvPanoramaMode === "generator"
    || String(layer.libtvOptionId || "").trim() === LIBTV_PANORAMA_MODEL_OPTION_ID
    || String(layer.genRatio || "").trim() === LIBTV_PANORAMA_DEFAULT_RATIO

  if (explicitPanorama) return true

  const width = Math.abs(Number(layer.width || 0) * Number(layer.scaleX || 1 || 1))
  const height = Math.abs(Number(layer.height || 0) * Number(layer.scaleY || 1 || 1))
  if (width > 0 && height > 0) {
    const aspect = width / height
    if (Math.abs(aspect - 2) <= 0.12) return true
  }

  return layer.type === "image"
}

export function buildLibTvPanoramaPrompt(args: {
  mode: LibTvPanoramaSourceMode
  userPrompt?: string
  referenceImageCount?: number
}) {
  const userPrompt = String(args.userPrompt || "").trim()
  const referenceImageCount = Math.max(0, Number(args.referenceImageCount || 0))
  const sections = [
    "你是专业的可环视全景贴图生成模型。",
    "请输出 1 张标准 2:1 equirectangular 全景贴图，构图必须适用于实时全景预览。",
    "画面必须满足完整环绕空间逻辑，左右边缘需要自然衔接，空间结构连续，不能像普通平面海报。",
    "必须保持真实空间透视与沉浸感，避免明显断层、重影、重复结构与严重缝合痕迹。",
    "输出要求：只返回最终图片，不要附加说明文字、水印、Logo 或拼贴布局。",
  ]

  if (args.mode === "scene") {
    sections.push(
      "请严格基于我提供的当前场景图延展生成可环视全景贴图。",
      "要求保留原图中的空间主题、主体关系、材质氛围与核心细节，不做明显风格漂移。",
      "不需要额外提示词微调，请优先保证和当前场景的一致性。"
    )
  } else if (args.mode === "reference") {
    sections.push(
      `请严格参考我提供的 ${Math.max(1, referenceImageCount)} 张场景参考图，生成一张可环视全景贴图。`,
      "生成结果在风格、空间主题和主要材质气质上要与参考图高度相似，但可自然补足四周空间。"
    )
  } else {
    sections.push(
      "请根据文字描述直接生成可环视全景贴图。",
      "画面要优先体现可环视的空间感、完整环境关系与统一光照氛围。"
    )
  }

  if (userPrompt) {
    sections.push(`补充创作要求：${userPrompt}`)
  }

  return sections.join("\n")
}

export function dispatchOpenLibTvPanoramaPreview(detail: LibTvPanoramaPreviewOpenDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(LIBTV_OPEN_PANORAMA_PREVIEW_EVENT, { detail }))
}

export function dispatchLibTvPanoramaScreenshot(detail: LibTvPanoramaScreenshotEventDetail) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(LIBTV_PANORAMA_SCREENSHOT_EVENT, { detail }))
}
