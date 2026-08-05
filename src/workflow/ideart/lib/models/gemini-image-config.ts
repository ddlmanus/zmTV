export type GeminiAspectRatioKey =
    | '1:1'
    | '1:4'
    | '1:8'
    | '2:3'
    | '3:2'
    | '3:4'
    | '4:1'
    | '4:3'
    | '4:5'
    | '5:4'
    | '8:1'
    | '9:16'
    | '16:9'
    | '21:9'

export type GeminiImageSizeKey = '0.5K' | '1K' | '2K' | '4K'

type Resolution = { width: number; height: number }

export const GEMINI_IMAGE_SIZE_OPTIONS: GeminiImageSizeKey[] = ['0.5K', '1K', '2K', '4K']

// Gemini 3.1 Flash Image relays in production reject 0.5K with INVALID_REQUEST,
// so we only expose/request 1K+ here.
export const GEMINI_31_FLASH_IMAGE_SIZE_OPTIONS: GeminiImageSizeKey[] = ['1K', '2K', '4K']
export const GEMINI_3_PRO_IMAGE_SIZE_OPTIONS: GeminiImageSizeKey[] = ['1K', '2K', '4K']
export const GEMINI_25_FLASH_IMAGE_SIZE_OPTIONS: GeminiImageSizeKey[] = ['1K']

export const GEMINI_ASPECT_RATIO_ORDER: GeminiAspectRatioKey[] = [
    '1:1',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '3:2',
    '2:3',
    '4:5',
    '5:4',
    '21:9',
    '1:4',
    '4:1',
    '1:8',
    '8:1',
]

export const GEMINI_3_PRO_IMAGE_ASPECT_RATIOS = new Set<GeminiAspectRatioKey>([
    '1:1',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '3:2',
    '2:3',
    '4:5',
    '5:4',
    '21:9',
])

export const GEMINI_25_FLASH_IMAGE_ASPECT_RATIOS = new Set<GeminiAspectRatioKey>([
    '1:1',
    '16:9',
    '9:16',
    '4:3',
    '3:4',
    '3:2',
    '2:3',
    '4:5',
    '5:4',
    '21:9',
])

export const GEMINI_31_FLASH_IMAGE_ASPECT_RATIOS = new Set<GeminiAspectRatioKey>(GEMINI_ASPECT_RATIO_ORDER)

export const GEMINI_IMAGE_RESOLUTION_TABLE: Record<GeminiAspectRatioKey, Record<GeminiImageSizeKey, Resolution>> = {
    '1:1': {
        '0.5K': { width: 512, height: 512 },
        '1K': { width: 1024, height: 1024 },
        '2K': { width: 2048, height: 2048 },
        '4K': { width: 4096, height: 4096 },
    },
    '1:4': {
        '0.5K': { width: 256, height: 1024 },
        '1K': { width: 512, height: 2048 },
        '2K': { width: 1024, height: 4096 },
        '4K': { width: 2048, height: 8192 },
    },
    '1:8': {
        '0.5K': { width: 192, height: 1536 },
        '1K': { width: 384, height: 3072 },
        '2K': { width: 768, height: 6144 },
        '4K': { width: 1536, height: 12288 },
    },
    '2:3': {
        '0.5K': { width: 424, height: 632 },
        '1K': { width: 848, height: 1264 },
        '2K': { width: 1696, height: 2528 },
        '4K': { width: 3392, height: 5056 },
    },
    '3:2': {
        '0.5K': { width: 632, height: 424 },
        '1K': { width: 1264, height: 848 },
        '2K': { width: 2528, height: 1696 },
        '4K': { width: 5056, height: 3392 },
    },
    '3:4': {
        '0.5K': { width: 448, height: 600 },
        '1K': { width: 896, height: 1200 },
        '2K': { width: 1792, height: 2400 },
        '4K': { width: 3584, height: 4800 },
    },
    '4:1': {
        '0.5K': { width: 1024, height: 256 },
        '1K': { width: 2048, height: 512 },
        '2K': { width: 4096, height: 1024 },
        '4K': { width: 8192, height: 2048 },
    },
    '4:3': {
        '0.5K': { width: 600, height: 448 },
        '1K': { width: 1200, height: 896 },
        '2K': { width: 2400, height: 1792 },
        '4K': { width: 4800, height: 3584 },
    },
    '4:5': {
        '0.5K': { width: 464, height: 576 },
        '1K': { width: 928, height: 1152 },
        '2K': { width: 1856, height: 2304 },
        '4K': { width: 3712, height: 4608 },
    },
    '5:4': {
        '0.5K': { width: 576, height: 464 },
        '1K': { width: 1152, height: 928 },
        '2K': { width: 2304, height: 1856 },
        '4K': { width: 4608, height: 3712 },
    },
    '8:1': {
        '0.5K': { width: 1536, height: 192 },
        '1K': { width: 3072, height: 384 },
        '2K': { width: 6144, height: 768 },
        '4K': { width: 12288, height: 1536 },
    },
    '9:16': {
        '0.5K': { width: 384, height: 688 },
        '1K': { width: 768, height: 1376 },
        '2K': { width: 1536, height: 2752 },
        '4K': { width: 3072, height: 5504 },
    },
    '16:9': {
        '0.5K': { width: 688, height: 384 },
        '1K': { width: 1376, height: 768 },
        '2K': { width: 2752, height: 1536 },
        '4K': { width: 5504, height: 3072 },
    },
    '21:9': {
        '0.5K': { width: 792, height: 336 },
        '1K': { width: 1584, height: 672 },
        '2K': { width: 3168, height: 1344 },
        '4K': { width: 6336, height: 2688 },
    },
}

export const GEMINI_PRO_IMAGE_RESOLUTION_TABLE = GEMINI_IMAGE_RESOLUTION_TABLE

const toRatioNumber = (ratioKey: GeminiAspectRatioKey) => {
    const [w, h] = ratioKey.split(':').map(Number)
    return w / h
}

export const getClosestGeminiAspectRatio = (sourceWidth: number, sourceHeight: number): GeminiAspectRatioKey => {
    if (!sourceWidth || !sourceHeight) return '1:1'
    const sourceRatio = sourceWidth / sourceHeight

    let best: GeminiAspectRatioKey = '1:1'
    let bestDistance = Number.POSITIVE_INFINITY

    for (const ratioKey of GEMINI_ASPECT_RATIO_ORDER) {
        const ratio = toRatioNumber(ratioKey)
        const distance = Math.abs(sourceRatio - ratio)
        if (distance < bestDistance) {
            best = ratioKey
            bestDistance = distance
        }
    }

    return best
}

export const getGeminiResolution = (
    aspectRatio: GeminiAspectRatioKey,
    imageSize: GeminiImageSizeKey
): Resolution => {
    return GEMINI_IMAGE_RESOLUTION_TABLE[aspectRatio][imageSize]
}

export const getGeminiResolutionForSource = (
    sourceWidth: number,
    sourceHeight: number,
    imageSize: GeminiImageSizeKey
) => {
    const aspectRatio = getClosestGeminiAspectRatio(sourceWidth, sourceHeight)
    const resolution = getGeminiResolution(aspectRatio, imageSize)
    return {
        aspectRatio,
        width: resolution.width,
        height: resolution.height,
    }
}

export const isGeminiAspectRatioKey = (value: unknown): value is GeminiAspectRatioKey => {
    if (typeof value !== 'string') return false
    return (GEMINI_ASPECT_RATIO_ORDER as string[]).includes(value)
}

export const normalizeGeminiImageSize = (value: unknown): GeminiImageSizeKey | null => {
    const normalized = String(value || '').trim().toLowerCase()
    if (!normalized) return null
    if (normalized === '0.5k' || normalized === '0.5' || normalized === '05.k' || normalized === '05k') return '0.5K'
    if (normalized === '512' || normalized === '512px') return '0.5K'
    if (normalized === '1k') return '1K'
    if (normalized === '2k') return '2K'
    if (normalized === '4k') return '4K'
    return null
}

export const getGeminiSupportedImageSizes = (modelId: string): GeminiImageSizeKey[] => {
    const normalizedModelId = String(modelId || '').trim().toLowerCase()
    if (normalizedModelId.includes('gemini-3.1-flash-image-preview')) return GEMINI_31_FLASH_IMAGE_SIZE_OPTIONS
    if (normalizedModelId.includes('gemini-3-pro-image-preview')) return GEMINI_3_PRO_IMAGE_SIZE_OPTIONS
    if (normalizedModelId.includes('gemini-2.5-flash-image')) return GEMINI_25_FLASH_IMAGE_SIZE_OPTIONS
    return GEMINI_IMAGE_SIZE_OPTIONS
}

export const coerceGeminiImageSizeForModel = (
    modelId: string,
    requestedSize: GeminiImageSizeKey | null | undefined
): GeminiImageSizeKey | null => {
    if (!requestedSize) return null
    const supported = getGeminiSupportedImageSizes(modelId)
    if (supported.includes(requestedSize)) return requestedSize
    return supported[0] || null
}
