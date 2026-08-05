// Model Provider Interface
export interface ModelProvider {
    name: string
    generate(prompt: string, options?: GenerationOptions): Promise<GenerationResult>
    supportsStreaming?: boolean
}

export interface Message {
    role: 'user' | 'agent' | 'system'
    content: string
}

export interface GenerationOptions {
    width?: number
    height?: number
    aspectRatio?: string
    quality?: string
    imageSize?: string
    category?: string // Image category (e.g., 'image_editing', 'design_generation')
    style?: string
    stylePreset?: string // Consistent style preset
    negativePrompt?: string
    seed?: number // Random seed
    steps?: number
    n?: number // Batch size
    responseFormat?: 'url' | 'b64_json' | string
    outputFormat?: 'png' | 'jpeg' | string
    outputCompression?: number
    partialImages?: number
    background?: 'transparent' | 'opaque' | 'auto' | string
    moderation?: 'low' | 'auto' | string
    inputFidelity?: 'high' | 'low' | string
    user?: string
    sequentialImageGeneration?: 'auto' | 'disabled' | string
    sequentialMaxImages?: number
    optimizePromptMode?: 'standard' | 'fast' | string
    payload?: string | Record<string, unknown>
    tools?: Array<Record<string, any>>
    stream?: boolean
    guidanceScale?: number
    scale?: number // Jimeng 4.0: 文本影响强度 [0,1]
    forceSingle?: boolean // Jimeng 4.0: 是否强制单图
    minRatio?: number // Jimeng 4.0: 最小宽高比
    maxRatio?: number // Jimeng 4.0: 最大宽高比
    // Kling Image / Video advanced options
    resultType?: 'single' | 'series' | string
    seriesAmount?: number
    externalTaskId?: string
    shotType?: 'customize' | 'intelligence' | string
    multiPrompt?: Array<{
        index: number
        prompt: string
        duration: string
    }>
    elementList?: Array<{ element_id: number | string }>
    voiceList?: Array<{ voice_id: string | number }>
    imageTail?: string
    sound?: 'on' | 'off' | string
    mode?: 'std' | 'pro' | string
    cfgScale?: number
    staticMask?: string
    dynamicMasks?: Array<{
        mask: string
        trajectories: Array<{ x: number; y: number }>
    }>
    cameraControl?: {
        type?: string
        config?: {
            horizontal?: number
            vertical?: number
            pan?: number
            tilt?: number
            roll?: number
            zoom?: number
        }
    }
    botType?: 'MID_JOURNEY' | 'NIJI_JOURNEY' | string
    notifyHook?: string
    state?: string
    renderSpeed?: 'fast' | 'turbo' | string
    mjMode?: 'normal' | 'draft' | string
    mjModel?: 'v7' | 'niji' | 'niji7' | string
    mjTask?: 'imagine' | 'blend' | 'describe' | 'modal' | 'action' | string
    mjBlendDimensions?: 'PORTRAIT' | 'SQUARE' | 'LANDSCAPE' | string
    mjUpsampleIndex?: number | string
    mjTaskId?: string
    mjCustomId?: string
    mjActionCustomIds?: string[] | string
    mjModalText?: string

    // Video options

    // Video options
    duration?: string | number // 视频时长，支持 "5s", "10s" 或 数字
    frames?: number // Seedance 帧数参数（部分模型）
    videoMethod?: 'start_end' | 'motion' | string
    modelId?: string // 明确的模型 ID
    referenceImage?: string // For Image-to-Video (单张图片)
    referenceImages?: string[] // For Image-to-Video (多张图片：首尾帧、参考图)
    referenceVideo?: string // For Video-to-Video / Motion Control
    referenceVideos?: string[] // Multiple reference videos (e.g. Seedance extend with multiple clips)
    referenceAudios?: string[] // Seedance: 参考音频列表
    motionRefVideo?: string // Explicit Motion Control reference video

    // Volcengine 视频参数
    resolution?: '480p' | '720p' | '1080p' | string // 视频分辨率
    imageResolution?: '1k' | '2k' | '4k' | string // 图片分辨率档位（部分中转如 APIMart）
    officialFallback?: boolean
    official_fallback?: boolean
    googleSearch?: boolean
    google_search?: boolean
    googleImageSearch?: boolean
    google_image_search?: boolean
    ratio?: '16:9' | '4:3' | '1:1' | '3:4' | '9:16' | '21:9' | 'adaptive' // 宽高比
    cameraFixed?: boolean // 是否固定摄像头
    generateAudio?: boolean // 是否生成音频（Seedance 1.5 pro）
    draft?: boolean // 是否生成样片（Seedance 1.5 pro）
    draftTaskId?: string // 基于样片任务生成正式视频（Seedance 1.5 pro）
    createTaskOnly?: boolean // 仅创建任务并返回 taskId（不轮询）
    returnLastFrame?: boolean // 是否返回尾帧图像
    watermark?: boolean // 是否包含水印
    serviceTier?: 'default' | 'flex' // 服务等级
    executionExpiresAfter?: number // 任务超时阈值（秒）
    promptOptimizer?: boolean // MiniMax: 是否自动优化 prompt
    fastPretreatment?: boolean // MiniMax: 是否缩短 prompt_optimizer 的优化耗时
    movementAmplitude?: 'auto' | 'small' | 'medium' | 'large' | string
    bgm?: boolean
    audioType?: 'all' | 'speech_only' | 'sound_effect_only' | string
    voiceId?: string
    referenceMode?: 'subject' | 'general' | string
    offPeak?: boolean
    metaData?: string
    clientRequestId?: string
    debugTraceId?: string
    debugTaskIndex?: number
    debugTaskTotal?: number
    debugProjectId?: string
    callbackUrl?: string // Webhook callback_url
    enhancePrompt?: boolean
    enableUpsample?: boolean
    provider?: string // 指定供应商 (用于动态模型路由)
    providerConfig?: {
        key?: string
        isThirdParty?: boolean
        baseUrl?: string | null
        supportOpenAI?: boolean
    }
    videoStyle?: string // OpenAI-style video style (e.g. anime/comic)
    videoPrivate?: boolean // OpenAI-style video private flag
    history?: Message[] // 对话历史 (用于连续修改视频等)
    sessionId?: string // 对话/编辑 Session ID
    editMode?: 'addition' | 'swap' | 'removal' | string // 编辑模式
    thoughtSignature?: string | string[] // Gemini thought signature for multi-turn edits
    streamProgressToken?: string // Internal progress bridge token for orchestrated SSE updates
    redInkReferenceMode?: boolean // Xiaohongshu/RedInk parity: put reference image parts before the style prompt

    // ✅ Multi-turn conversation history for image editing (Chat session mode)
    // Format: [{ role: 'user', content: 'Create...' }, { role: 'model', image: 'data:image/...' }]
    conversationHistory?: Array<{
        role: 'user' | 'model'
        content?: string
        image?: string
    }>
}

export interface GenerationResult {
    imageUrl?: string
    images?: string[] // Multiple images support
    text?: string
    texts?: string[]
    videoUrl?: string
    modelUrl?: string
    imageBase64?: string
    revisedPrompt?: string
    model: string
    provider: string
    generationTime: number
    taskId?: string // Async task ID
    seed?: string | number
    seeds?: Array<string | number>

    // Video generation extra info
    lastFrameUrl?: string // Video tail frame URL
    duration?: number // Actual generated video duration
    ratio?: string // 实际生成的视频宽高比
    resolution?: string // 实际生成的视频分辨率

    // Gemini 3 Thought Signature（用于对话式编辑）
    metadata?: {
        [key: string]: any
    }

    thoughtSignature?: string // 用于多轮对话编辑的签名
    [key: string]: any
}

export enum ModelType {
    // Replicate (Direct)
    REPLICATE_FLUX_PRO = 'replicate-flux-pro',
    REPLICATE_FLUX_SCHNELL = 'replicate-flux-schnell',

    // OpenAI (Direct)
    OPENAI_DALLE3 = 'openai-dalle3',

    // Google (Direct)
    GOOGLE_IMAGEN = 'google-imagen',

    // Alibaba (Direct)
    ALIBABA_TONGYI = 'alibaba-tongyi',
    ALIBABA_QWEN_MAX = 'alibaba-qwen-max',
    ALIBABA_QWEN_EDIT = 'alibaba-qwen-edit',

    // Volcengine (Direct)
    VOLCENGINE_DOUBAO = 'volcengine-doubao',
    VOLCENGINE_JIMENG_IMAGE_V40 = 'jimeng-t2i-v40',
    VOLCENGINE_DOUBAO_VIDEO = 'volcengine-doubao-video',
    VOLCENGINE_DOUBAO_3D = 'volcengine-doubao-3d',
    VOLCENGINE_SEEDANCE_1_5_PRO = 'doubao-seedance-1-5-pro-251215',
    VOLCENGINE_SEEDANCE_2_0_MINI = 'doubao-seedance-2-0-mini-260615',

    // Kling (Direct)
    KLING_IMAGE_O1 = 'kling-image-o1',
    KLING_IMAGE_V3 = 'kling-image-v3',
    KLING_VIDEO_O1 = 'kling-video-o1',
    KLING_VIDEO_V3 = 'kling-v3',
    KLING_V2_6 = 'kling-2.6',
    KLING_V2_5_TURBO = 'kling-2.5-turbo',
    KLING_V2_1 = 'kling-2.1',
    KLING_V1_6 = 'kling-1.6',
    KLING_MOTION_CONTROL = 'kling-motion-control',

    // Vectorengine (Relay)
    VECTORENGINE_GEMINI_IMAGE = 'gemini-3-pro-image-preview',
    VECTORENGINE_GPT_4O = 'gpt-4o',
    VECTORENGINE_GPT_4O_MINI = 'gpt-4o-mini',
    VECTORENGINE_GPT_4O_AUDIO = 'gpt-4o-audio',
    VECTORENGINE_FLUX_PRO = 'flux.1-pro',
    VECTORENGINE_FLUX_DEV = 'flux-1-dev',
    VECTORENGINE_FLUX_SCHNELL = 'flux-1-schnell',
    VECTORENGINE_MIDJOURNEY = 'midjourney',
    VECTORENGINE_IDEOGRAM = 'ideogram',
    VECTORENGINE_LUMA = 'luma-dream-machine',
    VECTORENGINE_KLING = 'vectorengine-kling-v2', // Renamed to avoid collision with direct
    VECTORENGINE_VEO_3 = 'falai-veo3',
    VECTORENGINE_RUNWAY_GEN3 = 'runway-gen3',
    VECTORENGINE_JIMENG = 'jimeng-2.6',
    VECTORENGINE_HAILUO = 'hailuo-v2',
    VECTORENGINE_GROK = 'grok-video',
    VECTORENGINE_TENCENT = 'tencent-aigc-video',
    VECTORENGINE_SUNO = 'suno-v3.5',
    VECTORENGINE_GPT_IMAGE_2 = 'gpt-image-2',
    VECTORENGINE_GPT_IMAGE_1_5 = 'gpt-image-1.5',
    VECTORENGINE_GPT_IMAGE_1 = 'gpt-image-1',
    VECTORENGINE_GPT_IMAGE_1_MINI = 'gpt-image-1-mini',
    VECTORENGINE_GEMINI_2_5_FLASH = 'gemini-2.5-flash-image',
    VECTORENGINE_GEMINI_2_5_FLASH_PREVIEW = 'gemini-2.5-flash-image-preview',
    KLING_MULTI_IMAGE2IMAGE = 'kling-multi-image2image',

    // World Labs
    WORLDLABS_MARBLE_1_1 = 'marble-1.1',
    WORLDLABS_MARBLE_1_1_PLUS = 'marble-1.1-plus',
}

export interface UIModelConfig {
    id: string
    modelId?: string
    name: string
    isDefault?: boolean
    isPro?: boolean
    descriptionKey: string
    speed: string
    category: 'image' | 'video' | '3d' | 'audio' | 'chat'
    icon: string
    badge?: string
    provider?: string
    providerKey?: string
    providerType?: 'official' | 'relay' | 'custom'
    providerLabel?: string
    cost?: number
    imageCost?: number | null
    videoCost?: number | null
    threeDCost?: number | null
    billing?: {
        isFree?: boolean
        defaultResolution?: string
        defaultQuality?: string
        resolutionRates?: Record<string, number>
        qualityResolutionRates?: Record<string, Record<string, number | string> | unknown>
    }
    parameters?: {
        aspectRatios?: { id: string, label: string, config?: any }[]
        resolutions?: { id: string, label: string, config?: any, badge?: string }[]
        durations?: { id: string, label: string, config?: any }[]
        counts?: { id: string, label: string, config?: any }[]
        qualities?: { id: string, label: string, config?: any }[]
        modes?: { id: string, label: string, config?: any }[]
        methods?: { id: string, label: string, config?: any }[]
        modelFamily?: 'kling' | 'vidu' | 'veo' | 'hailuo' | 'doubao' | 'jimeng' | 'generic'
        extraParameters?: Array<{
            type: string
            label: string
            control?: 'select' | 'boolean' | 'text' | 'number'
            placeholder?: string
            defaultValue?: string | number | boolean
            config?: any
            options?: { id: string, label: string, badge?: string, config?: any }[]
        }>
        supportsFirstFrame?: boolean
        supportsEndFrame?: boolean
        supportsMotionControl?: boolean
        supportsAudio?: boolean
        supportsCameraControl?: boolean
        supportsStyles?: boolean
        supportsExtend?: boolean
        supportsReferenceImages?: boolean
        supportsImageInput?: boolean
        supportsVideoEdit?: boolean
        supportsAssetLibrary?: boolean
        supportsVoiceLibrary?: boolean
        supportsSound?: boolean
        defaultSound?: boolean
        supportsReferenceAudio?: boolean
        supportsWebSearch?: boolean
        defaultWebSearch?: boolean
        supportsGoogleSearch?: boolean
        defaultGoogleSearch?: boolean
        supportsGoogleImageSearch?: boolean
        defaultGoogleImageSearch?: boolean
        supportsOfficialFallback?: boolean
        defaultOfficialFallback?: boolean
        supportsPromptMentions?: boolean
        supportsReferenceVideo?: boolean
        supportsVideoInput?: boolean
        supportsAssetUrls?: boolean
        maxReferenceVideos?: number
        supportsAudioSetting?: boolean
        supportsPanoInput?: boolean
        supportsSubjectReference?: boolean
        isViduQ3Family?: boolean
        multiShot?: boolean
        maxReferenceImages?: number
    }
}

// Model Configuration
export const MODEL_CONFIG = {
    [ModelType.REPLICATE_FLUX_PRO]: {
        displayName: 'Flux 1.1 Pro Ultra',
        provider: 'Replicate (Official)',
        description: '最新最强版本 - 超高质量图像生成',
        maxWidth: 1440,
        maxHeight: 1440,
        estimatedTime: '20-30s'
    },
    [ModelType.REPLICATE_FLUX_SCHNELL]: {
        displayName: 'Flux Schnell',
        provider: 'Replicate (Official)',
        description: '快速生成，优质效果',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '5-10s'
    },
    [ModelType.OPENAI_DALLE3]: {
        displayName: 'DALL-E 3',
        provider: 'OpenAI (Official)',
        description: '最新版本 - 创意细节丰富',
        maxWidth: 1792,
        maxHeight: 1024,
        estimatedTime: '10-15s'
    },
    [ModelType.GOOGLE_IMAGEN]: {
        displayName: 'Imagen 3',
        provider: 'Google Cloud (Official)',
        description: '照片级真实感',
        maxWidth: 1536,
        maxHeight: 1536,
        estimatedTime: '15-20s'
    },
    [ModelType.ALIBABA_TONGYI]: {
        displayName: 'Tongyi Wanxiang v2',
        provider: 'Alibaba Cloud (Official)',
        description: '通义万相 v2 - 最新版本，中文优化',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '10-15s'
    },
    [ModelType.ALIBABA_QWEN_MAX]: {
        displayName: 'Qwen Image Max 0201',
        provider: 'Alibaba Cloud (Official)',
        description: 'Qwen-Image-Max 最新版 - 专业级生成',
        maxWidth: 1664,
        maxHeight: 1024,
        estimatedTime: '10-20s'
    },
    [ModelType.ALIBABA_QWEN_EDIT]: {
        displayName: 'Qwen Image Edit Max',
        provider: 'Alibaba Cloud (Official)',
        description: 'Qwen-Image-Edit - 专业图像编辑与多图融合',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '10-20s'
    },
    [ModelType.VOLCENGINE_DOUBAO]: {
        displayName: 'Doubao Seedream 4.5',
        provider: 'Volcano Engine (Official)',
        description: 'Doubao-Seedream 4.5 - 火山引擎绘画模型',
        maxWidth: 2048,
        maxHeight: 2048,
        estimatedTime: '10-20s'
    },
    [ModelType.VOLCENGINE_JIMENG_IMAGE_V40]: {
        displayName: 'Jimeng Image 4.0',
        provider: 'Volcano Engine (Official)',
        description: '即梦 AI 图片生成 4.0 - 文生图/多图融合/图像编辑一体化模型',
        maxWidth: 4096,
        maxHeight: 4096,
        estimatedTime: '10-30s'
    },
    [ModelType.VOLCENGINE_DOUBAO_VIDEO]: {
        displayName: 'Doubao 1.5 Pro (Video)',
        provider: 'Volcano Engine (Official)',
        description: 'Doubao-Seedance / 1.5 Pro - 火山引擎视频生成模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '30-60s'
    },
    [ModelType.VOLCENGINE_SEEDANCE_1_5_PRO]: {
        displayName: 'Doubao Seedance 1.5 Pro',
        provider: 'Volcano Engine (Official)',
        description: 'Doubao-Seedance 1.5 Pro - 最新旗舰级视频生成模型，支持音频生成',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '30-60s'
    },
    [ModelType.VOLCENGINE_SEEDANCE_2_0_MINI]: {
        displayName: 'Doubao Seedance 2.0 Mini',
        provider: 'Volcano Engine (Official)',
        description: 'Doubao-Seedance 2.0 mini - 官方视频生成模型',
        maxWidth: 1280,
        maxHeight: 720,
        estimatedTime: '20-40s'
    },
    [ModelType.VOLCENGINE_DOUBAO_3D]: {
        displayName: 'Doubao Seed3D 1.0',
        provider: 'Volcano Engine (Official)',
        description: 'Doubao-Seed3D 1.0 - 火山引擎 3D 生成模型',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '30-60s'
    },
    [ModelType.KLING_IMAGE_O1]: {
        displayName: 'Kling Image O1',
        provider: 'Kling (Official)',
        description: '可灵官方最新 o1 系列绘画模型',
        maxWidth: 2048,
        maxHeight: 2048,
        estimatedTime: '30-60s'
    },
    [ModelType.KLING_IMAGE_V3]: {
        displayName: 'Kling Image 3.0',
        provider: 'Kling (Official)',
        description: '可灵官方 3.0 图片模型',
        maxWidth: 2048,
        maxHeight: 2048,
        estimatedTime: '30-60s'
    },
    [ModelType.KLING_VIDEO_O1]: {
        displayName: 'Kling Video O1',
        provider: 'Kling (Official)',
        description: '可灵官方最新 o1 系列视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.KLING_VIDEO_V3]: {
        displayName: 'Kling 3.0',
        provider: 'Kling (Official)',
        description: '可灵官方 3.0 视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.KLING_V2_6]: {
        displayName: 'Kling v2.6',
        provider: 'Kling (Official)',
        description: '可灵官方 v2.6 视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.KLING_V2_5_TURBO]: {
        displayName: 'Kling v2.5 Turbo',
        provider: 'Kling (Official)',
        description: '可灵官方 v2.5 Turbo 视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '30-60s'
    },
    [ModelType.KLING_V2_1]: {
        displayName: 'Kling v2.1',
        provider: 'Kling (Official)',
        description: '可灵官方 v2.1 视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.KLING_V1_6]: {
        displayName: 'Kling v1.6',
        provider: 'Kling (Official)',
        description: '可灵官方 v1.6 视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.KLING_MOTION_CONTROL]: {
        displayName: 'Kling Motion Control',
        provider: 'Kling (Official)',
        description: '可灵官方动作控制 - 人物动作迁移（Dance）',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    // Unified Gemini 3 Pro Image configuration
    [ModelType.VECTORENGINE_GEMINI_IMAGE]: {
        displayName: 'Nano Banano Pro',
        provider: 'Vectorengine (Relay)',
        description: 'Nano Banana Pro - 最高质量图像生成，支持4K，先进推理能力',
        maxWidth: 4096,
        maxHeight: 4096,
        estimatedTime: '15-30s'
    },
    [ModelType.VECTORENGINE_GPT_4O]: {
        displayName: 'GPT-4o',
        provider: 'Vectorengine (Relay)',
        description: 'OpenAI 最强全能模型',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '5-15s'
    },
    [ModelType.VECTORENGINE_GPT_4O_MINI]: {
        displayName: 'GPT-4o mini',
        provider: 'Vectorengine (Relay)',
        description: '轻量级高效模型',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '3-8s'
    },
    [ModelType.VECTORENGINE_GPT_4O_AUDIO]: {
        displayName: 'GPT-4o Audio',
        provider: 'Vectorengine (Relay)',
        description: 'OpenAI 音频生成与处理',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '10-20s'
    },
    [ModelType.VECTORENGINE_FLUX_PRO]: {
        displayName: 'FLUX.1 Pro',
        provider: 'Vectorengine (Relay)',
        description: '极致写实与构图',
        maxWidth: 2048,
        maxHeight: 2048,
        estimatedTime: '20-40s'
    },
    [ModelType.VECTORENGINE_FLUX_DEV]: {
        displayName: 'FLUX.1 Dev',
        provider: 'Vectorengine (Relay)',
        description: 'FLUX 开发者版本',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '15-30s'
    },
    [ModelType.VECTORENGINE_FLUX_SCHNELL]: {
        displayName: 'FLUX.1 Schnell',
        provider: 'Vectorengine (Relay)',
        description: 'FLUX 快速版本',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '5-15s'
    },
    [ModelType.VECTORENGINE_MIDJOURNEY]: {
        displayName: 'Midjourney V6',
        provider: 'Vectorengine (Relay)',
        description: '艺术感极强的图像生成',
        maxWidth: 2048,
        maxHeight: 2048,
        estimatedTime: '30-60s'
    },
    [ModelType.VECTORENGINE_IDEOGRAM]: {
        displayName: 'Ideogram',
        provider: 'Vectorengine (Relay)',
        description: '极佳的文字嵌入与排版能力',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '20-40s'
    },
    [ModelType.VECTORENGINE_LUMA]: {
        displayName: 'Luma Dream Machine',
        provider: 'Vectorengine (Relay)',
        description: '高质量视频生成',
        maxWidth: 1280,
        maxHeight: 720,
        estimatedTime: '60-120s'
    },
    [ModelType.VECTORENGINE_KLING]: {
        displayName: 'Kling V2 (Relay)',
        provider: 'Vectorengine (Relay)',
        description: '通过 Vectorengine 调用的可灵模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.VECTORENGINE_VEO_3]: {
        displayName: 'Veo 3',
        provider: 'Vectorengine (Relay)',
        description: 'Google Veo3 视频模型 (via Fal.ai)',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.VECTORENGINE_RUNWAY_GEN3]: {
        displayName: 'Runway Gen-3',
        provider: 'Vectorengine (Relay)',
        description: 'Runway Gen-3 Alpha 视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.VECTORENGINE_JIMENG]: {
        displayName: 'Jimeng (即梦)',
        provider: 'Vectorengine (Relay)',
        description: '字节跳动即梦视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '45-90s'
    },
    [ModelType.VECTORENGINE_HAILUO]: {
        displayName: 'Hailuo (海螺)',
        provider: 'Vectorengine (Relay)',
        description: 'MiniMax 海螺视频模型',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '45-90s'
    },
    [ModelType.VECTORENGINE_GROK]: {
        displayName: 'Grok Video',
        provider: 'Vectorengine (Relay)',
        description: 'xAI Grok 视频生成',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.VECTORENGINE_TENCENT]: {
        displayName: 'Tencent Video',
        provider: 'Vectorengine (Relay)',
        description: '腾讯混元视频生成',
        maxWidth: 1920,
        maxHeight: 1080,
        estimatedTime: '60-120s'
    },
    [ModelType.VECTORENGINE_SUNO]: {
        displayName: 'Suno v3.5',
        provider: 'Vectorengine (Relay)',
        description: 'AI 音乐生成',
        maxWidth: 0,
        maxHeight: 0,
        estimatedTime: '60-120s'
    },
    [ModelType.VECTORENGINE_GPT_IMAGE_2]: {
        displayName: 'GPT Image 2',
        provider: 'Vectorengine (Relay)',
        description: 'Latest GPT image generation and editing',
        maxWidth: 1536,
        maxHeight: 1536,
        estimatedTime: '15-20s'
    },
    [ModelType.VECTORENGINE_GPT_IMAGE_1_5]: {
        displayName: 'GPT Image 1.5',
        provider: 'Vectorengine (Relay)',
        description: 'GPT flagship image generation',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '15-20s'
    },
    [ModelType.VECTORENGINE_GPT_IMAGE_1]: {
        displayName: 'GPT Image 1',
        provider: 'Vectorengine (Relay)',
        description: 'Standard GPT image generation',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '10-15s'
    },
    [ModelType.VECTORENGINE_GPT_IMAGE_1_MINI]: {
        displayName: 'GPT Image 1 Mini',
        provider: 'Vectorengine (Relay)',
        description: 'Fast GPT image generation',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '5-10s'
    },
    [ModelType.VECTORENGINE_GEMINI_2_5_FLASH]: {
        displayName: 'Nano Banano',
        provider: 'Vectorengine (Relay)',
        description: 'Fast and efficient image generation',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '5-10s'
    },
    [ModelType.VECTORENGINE_GEMINI_2_5_FLASH_PREVIEW]: {
        displayName: 'Nano Banana Flash Preview',
        provider: 'Vectorengine (Relay)',
        description: 'Preview version of Flash model',
        maxWidth: 1024,
        maxHeight: 1024,
        estimatedTime: '5-10s'
    },
    [ModelType.KLING_MULTI_IMAGE2IMAGE]: {
        displayName: 'Kling Multi-Image2Image',
        provider: 'Kling (Official)',
        description: '可灵官方多图参考生图 - 支持1-4张主体参考图',
        maxWidth: 2048,
        maxHeight: 2048,
        estimatedTime: '30-60s'
    },
    [ModelType.WORLDLABS_MARBLE_1_1]: {
        displayName: 'Marble 1.1',
        provider: 'World Labs (Official)',
        description: 'World Labs Marble - 文本/图片/视频生成可探索 3D 世界',
        maxWidth: 4096,
        maxHeight: 2048,
        estimatedTime: '2-8min'
    },
    [ModelType.WORLDLABS_MARBLE_1_1_PLUS]: {
        displayName: 'Marble 1.1 Plus',
        provider: 'World Labs (Official)',
        description: 'World Labs Marble 1.1 Plus - 更高质量的 3D 世界生成',
        maxWidth: 4096,
        maxHeight: 2048,
        estimatedTime: '2-8min'
    }
}

// Video Model Capabilities
export interface VideoModelCapabilities {
    supportsFirstFrame: boolean
    supportsEndFrame: boolean
    supportsMotionControl: boolean
    supportsAudio?: boolean
    supportsCameraControl?: boolean
    supportsStyles?: boolean
    supportsExtend?: boolean
    supportsReferenceImages?: boolean
    supportsReferenceAudio?: boolean
}

// Capability mapping for all video generation models
export const VIDEO_MODEL_CAPABILITIES: Record<string, VideoModelCapabilities> = {
    // Kling
    'kling-v1-6': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-v2-1': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-v2-6': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-v2-5-turbo': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-o1': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-image-o1': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true },
    'kling-image-v3': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false },
    'kling-video-o1': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-v3-omni': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true, supportsAudio: true, supportsReferenceImages: true },
    'kling-v3': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-v3-5': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-v3-5-turbo': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: true, supportsExtend: true, supportsCameraControl: true },
    'kling-motion-control': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: true, supportsCameraControl: true },

    // Luma
    'luma-ray-v1': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsExtend: true },
    'luma-ray-v2': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsExtend: true },
    'luma-dream-machine': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsExtend: true },

    // Runway
    'runway-gen2': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false, supportsExtend: true },
    'runway-gen3-turbo': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false, supportsExtend: true },
    'runway-gen3': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false, supportsExtend: true },

    // Veo
    'veo': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false },
    'veo3': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsReferenceImages: true, supportsAudio: true },
    'fal-ai/veo3': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false },
    'falai-veo3': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false },

    // Hailuo/MiniMax
    'minimax-hailuo-02': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsExtend: true },
    'minimax-hailuo-2.3': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false, supportsExtend: true },
    'minimax-hailuo-2.3-fast': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false, supportsExtend: true },
    'hailuo': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsExtend: true },
    'hailuo-v2': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsExtend: true },

    // Others
    'jimeng': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false },
    'jimeng-2.6': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false },
    'grok-video': { supportsFirstFrame: false, supportsEndFrame: false, supportsMotionControl: false },
    'tencent-aigc-video': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false },
    'volcengine-doubao-video': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true },
    'happyhorse-1.0': { supportsFirstFrame: true, supportsEndFrame: false, supportsMotionControl: false, supportsAudio: true, supportsStyles: true, supportsExtend: true, supportsReferenceImages: true },
    'viduq1': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true },
    'viduq2': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true },
    'viduq2-pro': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true, supportsReferenceImages: true },
    'viduq2-pro-fast': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true, supportsReferenceImages: true },
    'viduq2-turbo': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true, supportsReferenceImages: true },
    'viduq3-pro': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true },
    'viduq3-turbo': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true },
    'viduq1-classic': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true },
    'vidu2.0': { supportsFirstFrame: true, supportsEndFrame: true, supportsMotionControl: false, supportsAudio: true, supportsStyles: true, supportsReferenceImages: true },

    // Default fallback
    'default': { supportsFirstFrame: false, supportsEndFrame: false, supportsMotionControl: false }
}

const VIDEO_MODEL_CAPABILITY_ALIASES: Record<string, string> = {
    // Kling aliases used in DB
    'kling-2.0-master': 'kling-v2-1',
    'kling-2.6': 'kling-v2-6',
    'kling-3.0': 'kling-v3',
    'kling-3.0-pro': 'kling-v3',
    'kling-v3': 'kling-v3',
    'kling-v3-omni': 'kling-v3-omni',
    'kling-v3-5': 'kling-v3-5',
    'kling-v3-5-turbo': 'kling-v3-5-turbo',
    'kling-3.0-omni': 'kling-v3-omni',
    'kling-3.0-image': 'kling-image-v3',

    // Veo aliases used in DB
    'veo3.1': 'veo3',
    'veo3.1-fast': 'veo3',
    'veo3.1-quality': 'veo3',
    'veo3.1-lite': 'veo3',
    'veo3.1-fast-official': 'veo3',
    'veo3.1-quality-official': 'veo3',
    'veo3.1-pro': 'veo3',
    'veo3.1-4k': 'veo3',
    'veo3.1-pro-4k': 'veo3',
    'veo3.1-components': 'veo3',
    'veo-3.1': 'veo3',
    'veo-3.1-fast': 'veo3',
    'veo-3.1-quality': 'veo3',
    'veo-3.1-lite': 'veo3',
    'veo-3.1-fast-official': 'veo3',
    'veo-3.1-quality-official': 'veo3',
    'veo-3.1-4k': 'veo3',
    'veo-3.1-generate-preview': 'veo3',
    'veo-3.1-fast-generate-preview': 'veo3',

    // Other provider-specific names
    'minimax-hailuo-2.3': 'minimax-hailuo-2.3',
    'minimax-hailuo-2.3-fast': 'minimax-hailuo-2.3-fast',
    'doubao-seedance-1-5-pro-251215': 'volcengine-doubao-video',
    'doubao-seedance-2-0-260128': 'volcengine-doubao-video',
    'doubao-seedance-2-0-fast-260128': 'volcengine-doubao-video',
    'doubao-seedance-2-0-mini-260615': 'volcengine-doubao-video',
    'doubao-seedance-1-0-pro-fast-251015': 'volcengine-doubao-video',
    'doubao-seedance-1-0-lite-t2v-250428': 'volcengine-doubao-video',
    'doubao-seedance-1-0-lite-i2v-250428': 'volcengine-doubao-video',
    'doubao-seedance-2-0-mini': 'volcengine-doubao-video',
    'seedance 2.0': 'volcengine-doubao-video',
    'seedance 2.0 fast': 'volcengine-doubao-video',
    'seedance 2.0 mini': 'volcengine-doubao-video',
    'seedance-2.0': 'volcengine-doubao-video',
    'seedance-2.0-fast': 'volcengine-doubao-video',
    'seedance-2.0-mini': 'volcengine-doubao-video',
    'seedance-2-0-mini': 'volcengine-doubao-video',
    'happyhorse-1': 'happyhorse-1.0',
    'viduq1': 'viduq1',
    'viduq1-classic': 'viduq1',
    'viduq2': 'viduq2',
    'viduq2-pro': 'viduq2-pro',
    'viduq2-pro-fast': 'viduq2-pro',
    'viduq2-turbo': 'viduq2-pro',
    'viduq3-pro': 'viduq3-pro',
    'viduq3-turbo': 'viduq3-pro',
    'vidu2.0': 'vidu2.0'
}

interface ResolveVideoCapabilitiesOptions {
    modelId: string
    methods?: string[]
    overrides?: Partial<VideoModelCapabilities>
}

export function resolveVideoModelCapabilities({
    modelId,
    methods = [],
    overrides
}: ResolveVideoCapabilitiesOptions): VideoModelCapabilities {
    const normalizedModelId = (modelId || '').toLowerCase()
    const aliasModelId = VIDEO_MODEL_CAPABILITY_ALIASES[normalizedModelId]
    const staticCapabilities =
        VIDEO_MODEL_CAPABILITIES[modelId] ||
        VIDEO_MODEL_CAPABILITIES[normalizedModelId] ||
        (aliasModelId ? VIDEO_MODEL_CAPABILITIES[aliasModelId] : undefined) ||
        VIDEO_MODEL_CAPABILITIES['default']

    const normalizedMethods = methods.map(m => (m || '').toLowerCase().trim())
    const methodCapabilities: VideoModelCapabilities = {
        supportsFirstFrame: normalizedMethods.some(m => ['first_frame', 'start_end', 'reference', 'multi_reference'].includes(m)),
        supportsEndFrame: normalizedMethods.includes('start_end'),
        supportsMotionControl: normalizedMethods.some(m => ['motion', 'motion_control'].includes(m)),
        supportsExtend: normalizedMethods.some(m => ['extend', 'continuation', 'continue', 'video_extend'].includes(m)),
        supportsReferenceImages: normalizedMethods.some(m => ['reference', 'multi_reference'].includes(m)),
    }

    const hasMethodConfig = normalizedMethods.length > 0
    // Merge capabilities
    return {
        supportsFirstFrame: overrides?.supportsFirstFrame ?? (hasMethodConfig
            ? (staticCapabilities.supportsFirstFrame || methodCapabilities.supportsFirstFrame)
            : staticCapabilities.supportsFirstFrame),
        supportsEndFrame: overrides?.supportsEndFrame ?? (hasMethodConfig
            ? (staticCapabilities.supportsEndFrame || methodCapabilities.supportsEndFrame)
            : staticCapabilities.supportsEndFrame),
        supportsMotionControl: overrides?.supportsMotionControl ?? (hasMethodConfig
            ? (staticCapabilities.supportsMotionControl || methodCapabilities.supportsMotionControl)
            : staticCapabilities.supportsMotionControl),
        supportsAudio: overrides?.supportsAudio ?? staticCapabilities.supportsAudio,
        supportsCameraControl: overrides?.supportsCameraControl ?? staticCapabilities.supportsCameraControl,
        supportsStyles: overrides?.supportsStyles ?? staticCapabilities.supportsStyles,
        supportsExtend: overrides?.supportsExtend ?? (staticCapabilities.supportsExtend || Boolean(methodCapabilities.supportsExtend)),
        supportsReferenceImages: overrides?.supportsReferenceImages ?? (staticCapabilities.supportsReferenceImages || Boolean(methodCapabilities.supportsReferenceImages))
    }
}
