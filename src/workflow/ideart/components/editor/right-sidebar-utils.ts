type StreamStep = {
  step:
    | 'thinking'
    | 'understanding'
    | 'searching'
    | 'gallery'
    | 'analysis'
    | 'agent_progress'
    | 'skill'
    | 'generating'
    | 'complete'
    | 'error'
    | 'chat_stream'
}

export const STREAM_STEP_TYPES: StreamStep['step'][] = [
  'thinking',
  'understanding',
  'searching',
  'gallery',
  'analysis',
  'agent_progress',
  'skill',
  'generating',
  'complete',
  'error',
  'chat_stream'
]

export const IMAGE_PLACEHOLDER_SPACING = 32
export const IMAGE_PLACEHOLDER_ROW_GAP = 100

type PlaceholderCardMode = 'single' | 'batch'

type PlaceholderCardSize = {
  width: number
  height: number
}

const COMMON_PLACEHOLDER_CARD_SIZES: Record<string, Record<PlaceholderCardMode, PlaceholderCardSize>> = {
  '1:1': {
    single: { width: 320, height: 320 },
    batch: { width: 256, height: 256 },
  },
  '16:9': {
    single: { width: 432, height: 243 },
    batch: { width: 336, height: 189 },
  },
  '9:16': {
    single: { width: 243, height: 432 },
    batch: { width: 189, height: 336 },
  },
  '4:3': {
    single: { width: 384, height: 288 },
    batch: { width: 300, height: 225 },
  },
  '3:4': {
    single: { width: 288, height: 384 },
    batch: { width: 225, height: 300 },
  },
  '3:2': {
    single: { width: 400, height: 267 },
    batch: { width: 320, height: 213 },
  },
  '2:3': {
    single: { width: 267, height: 400 },
    batch: { width: 213, height: 320 },
  },
  '21:9': {
    single: { width: 448, height: 192 },
    batch: { width: 336, height: 144 },
  },
  '9:21': {
    single: { width: 192, height: 448 },
    batch: { width: 144, height: 336 },
  },
  '2:1': {
    single: { width: 448, height: 224 },
    batch: { width: 336, height: 168 },
  },
  '1:2': {
    single: { width: 224, height: 448 },
    batch: { width: 168, height: 336 },
  },
  '5:4': {
    single: { width: 360, height: 288 },
    batch: { width: 288, height: 230 },
  },
  '4:5': {
    single: { width: 288, height: 360 },
    batch: { width: 230, height: 288 },
  },
  '16:10': {
    single: { width: 432, height: 270 },
    batch: { width: 336, height: 210 },
  },
  '10:16': {
    single: { width: 270, height: 432 },
    batch: { width: 210, height: 336 },
  },
}

function normalizePlaceholderAspectRatio(aspectRatio: string) {
  const raw = String(aspectRatio || '').trim().split('(')[0]?.trim() || ''
  if (!raw) return '1:1'
  const normalized = raw.replace(/[：／]/g, (char) => char === '：' ? ':' : '/').replace(/\s+/g, '')
  const match = normalized.match(/^(\d+(?:\.\d+)?)[:/](\d+(?:\.\d+)?)$/)
  if (!match) return '1:1'
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '1:1'
  }
  return `${width}:${height}`
}

function resolveCanvasResolutionLongEdge(resolution?: string) {
  const raw = String(resolution || '').trim().toUpperCase()
  if (!raw) return 1024
  const explicit = raw.match(/(\d{2,5})\s*[X×]\s*(\d{2,5})/)
  if (explicit) return null
  if (/^512(?:P|PX)?$/.test(raw)) return 512
  if (/^1K$/.test(raw)) return 1024
  if (/^2K$/.test(raw)) return 2048
  if (/^3K$/.test(raw)) return 3072
  if (/^4K$/.test(raw)) return 4096
  const numeric = Number(raw.replace(/(?:P|PX)$/i, ''))
  return Number.isFinite(numeric) && numeric >= 256 ? Math.round(numeric) : 1024
}

export function getCanvasGenerationPlaceholderSize(aspectRatio: string, resolution?: string): PlaceholderCardSize {
  const resolutionText = String(resolution || '').trim()
  const explicit = resolutionText.match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i)
  if (explicit) {
    return {
      width: Math.max(1, Math.round(Number(explicit[1]))),
      height: Math.max(1, Math.round(Number(explicit[2]))),
    }
  }

  const normalized = normalizePlaceholderAspectRatio(aspectRatio)
  const [rawWidth, rawHeight] = normalized.split(':').map(Number)
  const widthRatio = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1
  const heightRatio = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1
  const longEdge = resolveCanvasResolutionLongEdge(resolutionText) || 1024

  if (widthRatio >= heightRatio) {
    return {
      width: longEdge,
      height: Math.max(1, Math.round(longEdge * heightRatio / widthRatio)),
    }
  }
  return {
    width: Math.max(1, Math.round(longEdge * widthRatio / heightRatio)),
    height: longEdge,
  }
}

function derivePlaceholderCardSize(aspectRatio: string, mode: PlaceholderCardMode): PlaceholderCardSize {
  const normalized = normalizePlaceholderAspectRatio(aspectRatio)
  const preset = COMMON_PLACEHOLDER_CARD_SIZES[normalized]
  if (preset) return preset[mode]

  const [rawWidth, rawHeight] = normalized.split(':').map((value) => Number(value))
  const ratio = rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : 1
  const shortEdge = mode === 'single' ? 288 : 224
  const maxLongEdge = mode === 'single' ? 480 : 360
  const base = ratio >= 1
    ? { width: Math.round(shortEdge * ratio), height: shortEdge }
    : { width: shortEdge, height: Math.round(shortEdge / ratio) }
  const scale = Math.min(1, maxLongEdge / Math.max(base.width, base.height))
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  return {
    width: Math.max(120, Math.round(base.width * safeScale)),
    height: Math.max(120, Math.round(base.height * safeScale)),
  }
}

export function getPlaceholderCardSize(aspectRatio: string, mode: PlaceholderCardMode = 'single'): PlaceholderCardSize {
  return derivePlaceholderCardSize(aspectRatio, mode)
}

export const GENERATING_PLACEHOLDER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
        <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#101827"/>
                <stop offset="30%" stop-color="#173B6D"/>
                <stop offset="58%" stop-color="#402A78"/>
                <stop offset="82%" stop-color="#7C254F"/>
                <stop offset="100%" stop-color="#172033"/>
            </linearGradient>
            <radialGradient id="cyanGlow" cx="25%" cy="24%" r="44%">
                <stop offset="0%" stop-color="#00E0FF" stop-opacity="0.72"/>
                <stop offset="62%" stop-color="#3B82F6" stop-opacity="0.18"/>
                <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="pinkGlow" cx="76%" cy="66%" r="48%">
                <stop offset="0%" stop-color="#FF50B8" stop-opacity="0.64"/>
                <stop offset="58%" stop-color="#8B5CF6" stop-opacity="0.2"/>
                <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#00E0FF" stop-opacity="0"/>
                <stop offset="18%" stop-color="#00E0FF" stop-opacity="0.38"/>
                <stop offset="38%" stop-color="#6366F1" stop-opacity="0.58"/>
                <stop offset="58%" stop-color="#FF50B8" stop-opacity="0.56"/>
                <stop offset="78%" stop-color="#FFD666" stop-opacity="0.34"/>
                <stop offset="100%" stop-color="#FFD666" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#bg)"/>
        <rect width="1024" height="1024" fill="url(#cyanGlow)"/>
        <rect width="1024" height="1024" fill="url(#pinkGlow)"/>
        <rect width="1024" height="1024" fill="#ffffff" opacity="0.04"/>
        <rect x="-720" y="0" width="620" height="1024" fill="url(#sweep)" opacity="0.82">
            <animate attributeName="x" values="-720;1124" dur="2.8s" repeatCount="indefinite"/>
        </rect>
        <rect x="384" y="910" width="256" height="56" rx="28" fill="#111827" opacity="0.32"/>
  </svg>`
)}`

export const GENERATING_PLACEHOLDER_VIDEO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#0F172A"/>
                <stop offset="100%" stop-color="#1E293B"/>
            </linearGradient>
            <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#334155"/>
                <stop offset="100%" stop-color="#1F2937"/>
            </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#bg)"/>
        <rect x="460" y="230" width="360" height="260" rx="24" fill="url(#card)" stroke="#64748B" stroke-width="2"/>
        <rect x="590" y="300" width="120" height="80" rx="14" fill="#94A3B8" opacity="0.95"/>
        <polygon points="635,316 635,364 678,340" fill="#0F172A"/>
        <text x="640" y="440" text-anchor="middle" fill="#CBD5E1" font-size="32" font-family="Arial, sans-serif">视频生成中...</text>
    </svg>`
)}`

export const MODEL_PREVIEW_PLACEHOLDER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
        <defs>
            <linearGradient id="bg3d" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#EEF2FF"/>
                <stop offset="100%" stop-color="#E0E7FF"/>
            </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#bg3d)"/>
        <g transform="translate(512 512)">
            <path d="M0-190l180 95v190l-180 95-180-95v-190z" fill="#6366F1" opacity="0.16"/>
            <path d="M0-150l140 74v148L0 146-140 72V-76z" fill="none" stroke="#4F46E5" stroke-width="20" stroke-linejoin="round"/>
            <path d="M0-150v296M-140-76l140 74 140-74" fill="none" stroke="#4F46E5" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
        <text x="512" y="850" text-anchor="middle" fill="#4338CA" font-size="44" font-family="Arial, sans-serif">3D 模型预览</text>
    </svg>`
)}`

export const toStreamStepType = (value: unknown): StreamStep['step'] => {
  if (typeof value === 'string' && STREAM_STEP_TYPES.includes(value as StreamStep['step'])) {
    return value as StreamStep['step']
  }
  return 'thinking'
}

export const parseAspectRatioFromPrompt = (text: string): string | null => {
  if (!text) return null
  const normalized = text.replace(/[：／]/g, (char) => char === '：' ? ':' : '/').replace(/\s+/g, ' ')
  const allowed = new Set(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3', '5:4', '4:5', '9:21', '2:1', '1:2', '1:3', '3:1', '16:10', '10:16'])
  const patterns = [
    /(?:^|[^\d])(\d{1,2})\s*:\s*(\d{1,2})(?=$|[^\d])/,
    /(?:^|[^\d])(\d{1,2})\s*\/\s*(\d{1,2})(?=$|[^\d])/,
    /(?:^|[^\d])(\d{1,2})\s*比\s*(\d{1,2})(?=$|[^\d])/,
    /(?:^|[\s-])(?:ar|aspect\s*ratio)\s*[:=]?\s*(\d{1,2})\s*:\s*(\d{1,2})(?=$|[^\d])/i,
    /(?:比例|宽高比|画幅|尺寸比例)\s*[:：=]?\s*(\d{1,2})\s*[:\/比]\s*(\d{1,2})(?=$|[^\d])/,
  ]
  const match = patterns.map((pattern) => normalized.match(pattern)).find(Boolean)
  if (!match) return null
  const ratio = `${match[1]}:${match[2]}`
  return allowed.has(ratio) ? ratio : null
}

export const isTranslationEditIntent = (text: string): boolean => {
  if (!text) return false
  const lower = text.toLowerCase()
  const hasTranslateVerb =
    /翻译|译成|翻成|改成.*语|换成.*语|translate|translation|localiz|replace.*text|replace.*chinese|translate.*to/.test(text) ||
    /translate|translation|localiz|replace.*text|replace.*chinese|translate.*to/.test(lower)
  const hasTextTarget =
    /文字|文本|中文|英文|俄语|西班牙语|法语|德语|日语|韩语|葡萄牙语|意大利语|阿拉伯语|text|caption|subtitle|label|russian|spanish|french|german|japanese|korean|portuguese|italian|arabic/.test(text) ||
    /text|caption|subtitle|label|russian|spanish|french|german|japanese|korean|portuguese|italian|arabic/.test(lower)
  return hasTranslateVerb && hasTextTarget
}

export const isExplicitImageEditIntent = (text: string): boolean => {
  if (!text) return false
  const normalized = normalizeComposerText(text)
  if (!normalized) return false
  const lower = normalized.toLowerCase()
  const hasVisualAdjustmentTarget = /肤色|皮肤|肤质|面部|脸部|五官|轮廓|身材|头发|发型|服装|衣服|背景|光线|亮度|色彩|颜色|清晰度|质感|构图/.test(normalized)
  const hasVisualAdjustmentLanguage = /弄得|弄的|变得|再.*(?:一点|一些|更)|更.*(?:一点|一些)|稍微|轻微|紧致|提亮|均匀|自然些|真实些|清晰些|柔和些|增强|加强|减弱|降低/.test(normalized)

  return (
    /修改|编辑|改图|修图|修一下|调整|调一下|微调|处理一下|重修|精修|润色|翻译|译成|翻成|替换|替换成|替换为|换成|改成|换掉|去掉|去除|移除|删除|擦除|抹掉|去水印|消除|修复|扩图|补图|局部重绘|局部修改|局部编辑/.test(normalized) ||
    (hasVisualAdjustmentTarget && hasVisualAdjustmentLanguage) ||
    /\b(edit|modify|change|adjust|retouch|fix|repair|restore|remove|erase|delete|replace|swap|translate|localize|inpaint|outpaint)\b/i.test(lower)
  )
}

export const isExplicitNewImageGenerationIntent = (text: string): boolean => {
  if (!text) return false
  const normalized = normalizeComposerText(text)
  if (!normalized) return false
  return (
    /(?:参考|基于|按照|照着|模仿).{0,24}(?:生成|创作|制作|做|画|来)(?:一张|一幅|新图|新图片|另一张|不同)/.test(normalized) ||
    /(?:生成|创作|制作|做|画|来)(?:一张|一幅|新图|新图片|另一张|不同).{0,24}(?:参考|风格|版本)/.test(normalized) ||
    /(?:同风格|相似风格|参考风格).{0,16}(?:生成|创作|制作|做|画|来)/.test(normalized) ||
    /\b(?:generate|create|make|draw)\s+(?:a\s+)?(?:new|another|different)\b/i.test(normalized)
  )
}

export const shouldRouteImageRequestToEdit = (params: {
  hasInputImages: boolean
  isEditModel: boolean
  hasSelectedImageTarget: boolean
  message: string
}): boolean => {
  if (!params.hasInputImages || !params.isEditModel) return false
  if (isExplicitImageEditIntent(params.message)) return true
  return params.hasSelectedImageTarget && !isExplicitNewImageGenerationIntent(params.message)
}

export const isIdentitySwapEditIntent = (text: string): boolean => {
  if (!text) return false
  const lower = text.toLowerCase()
  const hasReplaceIntent =
    /替换|替换成|替换为|换成|改成|重绘成|角色.*替换|人物.*替换|主体.*替换|形象.*替换|形象.*换成|把.*变成/.test(text) ||
    /replace|swap|subject|identity|redraw|restyle|transform/.test(lower)
  const hasPreserveIntent =
    /保持.*不变|其[他余].*不变|画面.*不变|背景.*不变|其他元素.*不变|保持.*姿态|保持.*动作|保持.*服饰|保持.*服装|保留.*姿态|保留.*动作|保留.*服饰|保留.*服装|保持.*宽高比|保持.*比例/.test(text) ||
    /keep.*unchanged|preserve.*pose|preserve.*outfit|preserve.*costume|keep.*ratio|keep.*aspect|keep.*background|keep.*scene/i.test(lower)
  return hasReplaceIntent && hasPreserveIntent
}

export const normalizeComposerText = (value: string) => {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export const getImagePlaceholder = (index: number, locale: string) => {
  return locale === 'zh-CN' ? `[图片${index}]` : `[Image ${index}]`
}

export const getMarkerChipText = (
  marker: { isAnalyzing?: boolean; description?: string },
  locale: string
) => {
  if (marker.isAnalyzing || !marker.description) {
    return locale === 'zh-CN' ? '分析中...' : 'Analyzing...'
  }
  return marker.description
}

export const createClientId = (prefix = '') => {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
          const random = (Math.random() * 16) | 0
          const value = char === 'x' ? random : (random & 0x3) | 0x8
          return value.toString(16)
        })

  return prefix ? `${prefix}${id}` : id
}

export const fileToBase64 = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const blobToBase64 = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export const urlToBase64 = async (url: string): Promise<string> => {
  if (!url) return ''
  if (url.startsWith('data:')) return url

  try {
    const fetchCandidates = url.startsWith('http')
      ? [`/api/image-proxy?url=${encodeURIComponent(url)}`, url]
      : [url]

    for (const fetchUrl of fetchCandidates) {
      const response = await fetch(fetchUrl)
      if (!response.ok) {
        continue
      }
      const blob = await response.blob()
      return blobToBase64(blob)
    }
    throw new Error('All fetch candidates failed')
  } catch (error) {
    // CORS/403 failures are common for third-party image hosts; callers can gracefully fallback to URL usage.
    return ''
  }
}
