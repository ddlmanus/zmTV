export type UnifiedVideoTaskStatus = 'succeed' | 'failed' | 'processing' | 'unknown'

export type QueryUnifiedVideoTaskStatusParams = {
    providerTaskId?: string
    taskType?: string
    statusUrl?: string
    projectId?: string
    modelId?: string
    providerKey?: string
    persistVideo?: boolean
    seedanceJobId?: string
    signal?: AbortSignal
    cache?: RequestCache
}

export type QueryUnifiedVideoTaskStatusResult = {
    status: UnifiedVideoTaskStatus
    statusMessage: string
    videos: string[]
    thumbnailUrl?: string
    lastFrameUrl?: string
    progress?: number
    source: 'seedance-job' | 'task-status' | 'unknown'
    payload: any
}

type HttpJsonResponse = {
    ok: boolean
    status: number
    payload: any
    retryAfterSeconds: number
}

const providerTaskStatusInFlight = new Map<string, Promise<QueryUnifiedVideoTaskStatusResult>>()
const providerTaskStatusCache = new Map<string, {
    result?: QueryUnifiedVideoTaskStatusResult
    error?: any
    expiresAt: number
}>()
const PROVIDER_TASK_STATUS_CACHE_MAX_ENTRIES = 256

function pruneProviderTaskStatusCache(nowMs = Date.now()) {
    for (const [key, entry] of providerTaskStatusCache) {
        if (entry.expiresAt <= nowMs) providerTaskStatusCache.delete(key)
    }
    while (providerTaskStatusCache.size > PROVIDER_TASK_STATUS_CACHE_MAX_ENTRIES) {
        const oldestKey = providerTaskStatusCache.keys().next().value
        if (!oldestKey) break
        providerTaskStatusCache.delete(oldestKey)
    }
}

const APIMART_PROVIDER_KEYS = new Set(['apimart', 'aishuch', 'apib', 'aiuxu'])

function buildProviderTaskStatusCacheKey(params: {
    providerTaskId: string
    taskType?: string
    statusUrl?: string
    projectId?: string
    modelId?: string
    providerKey?: string
    persistVideo?: boolean
}) {
    return [
        String(params.providerTaskId || '').trim(),
        String(params.taskType || '').trim(),
        String(params.statusUrl || '').trim(),
        String(params.projectId || '').trim(),
        String(params.modelId || '').trim(),
        String(params.providerKey || '').trim(),
        params.persistVideo ? 'persist-video' : '',
    ].join('|')
}

export function resolveUnifiedProviderTaskType(params: {
    taskType?: unknown
    modelId?: unknown
    providerKey?: unknown
    provider?: unknown
    fallback?: string
}): string {
    const taskType = String(params.taskType || '').trim()
    const providerKey = String(params.providerKey || '').trim().toLowerCase()
    const provider = String(params.provider || '').trim().toLowerCase()
    const fallback = String(params.fallback || '').trim()
    const isWavespeed = providerKey === 'wavespeed' || provider === 'wavespeed'
    const isApimart = ['apimart', 'aishuch', 'apib', 'aiuxu'].includes(providerKey) || provider === 'apimart'
    const isZenmux = ['zenmux', 'zenmux_ai', 'zenmux-ai'].includes(providerKey) || provider === 'zenmux'
    const outputHint = `${taskType} ${fallback}`.toLowerCase()
    const imageTaskHint = outputHint.includes('image') && !outputHint.includes('video')
    if (imageTaskHint) {
        if (taskType && taskType.toLowerCase() !== 'image') return taskType
        if (isWavespeed) return 'wavespeed-image'
        if (isApimart) return 'apimart-image'
        if (providerKey === 'ttapi' || provider === 'ttapi') {
            if (taskType.toLowerCase().startsWith('ttapi-')) return taskType
            return fallback.toLowerCase().startsWith('ttapi-') ? fallback : ''
        }
        return fallback || taskType || 'image-generation'
    }
    const genericTaskType = /^(?:image2video|text2video|multi-image2video|apimart-image|image|video)$/.test(taskType.toLowerCase())
    if (isZenmux && (!taskType || genericTaskType || taskType.toLowerCase() === 'seedance-video')) return 'zenmux-video'
    if (isApimart && (!taskType || genericTaskType || taskType.toLowerCase() === 'seedance-video')) return 'apimart-video'
    if (taskType && (!isWavespeed || !genericTaskType)) return taskType
    if (isWavespeed) {
        if (outputHint.includes('3d')) return 'wavespeed-3d'
        if (outputHint.includes('audio')) return 'wavespeed-audio'
        if (outputHint.includes('text')) return 'wavespeed-text'
        if (outputHint.includes('image') && !outputHint.includes('video')) return 'wavespeed-image'
        return 'wavespeed-video'
    }
    return fallback
}

function readProviderKeyFromStatusUrl(value: unknown): string {
    const statusUrl = String(value || '').trim()
    if (!statusUrl) return ''
    try {
        const parsed = new URL(statusUrl, 'http://localhost')
        return String(parsed.searchParams.get('providerKey') || '').trim()
    } catch {
        return ''
    }
}

export function isOfficialSeedanceTaskContext(params: {
    taskType?: unknown
    providerKey?: unknown
}): boolean {
    const providerKey = String(params.providerKey || '').trim().toLowerCase()
    return ['seedance', 'volcengine', 'doubao'].includes(providerKey)
}

export function resolveProviderVideoPollIntervalMs(params: {
    taskType?: unknown
    providerKey?: unknown
    fallbackMs?: number
}): number {
    const taskType = String(params.taskType || '').trim().toLowerCase()
    const providerKey = String(params.providerKey || '').trim().toLowerCase()
    if (providerKey) {
        if (['zenmux', 'zenmux_ai', 'zenmux-ai'].includes(providerKey)) return 15_000
        if (['seedance', 'volcengine', 'doubao'].includes(providerKey)) return 30_000
        if (APIMART_PROVIDER_KEYS.has(providerKey)) return 5_000
        return Math.max(1000, Math.floor(Number(params.fallbackMs || 3000)))
    }
    if (taskType === 'zenmux-video') return 15_000
    if (taskType === 'seedance-video') return 30_000
    if (taskType.startsWith('apimart-')) return 5_000
    return Math.max(1000, Math.floor(Number(params.fallbackMs || 3000)))
}

type PollUnifiedVideoTaskUntilTerminalParams = {
    query: () => Promise<QueryUnifiedVideoTaskStatusResult>
    intervalMs: number
    initialDelay?: boolean
    signal?: AbortSignal
    onResult?: (result: QueryUnifiedVideoTaskStatusResult) => void | Promise<void>
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>
}

function createVideoPollingAbortError(): Error {
    if (typeof DOMException !== 'undefined') {
        return new DOMException('Video task polling aborted', 'AbortError')
    }
    const error = new Error('Video task polling aborted')
    error.name = 'AbortError'
    return error
}

function isVideoPollingAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false
    return String((error as { name?: string }).name || '') === 'AbortError'
}

async function waitForNextVideoTaskPoll(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw createVideoPollingAbortError()
    await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>
        const handleAbort = () => {
            clearTimeout(timer)
            signal?.removeEventListener('abort', handleAbort)
            reject(createVideoPollingAbortError())
        }
        timer = setTimeout(() => {
            signal?.removeEventListener('abort', handleAbort)
            resolve()
        }, Math.max(0, Math.floor(Number(ms || 0))))
        signal?.addEventListener('abort', handleAbort, { once: true })
        if (signal?.aborted) handleAbort()
    })
}

export async function pollUnifiedVideoTaskUntilTerminal(
    params: PollUnifiedVideoTaskUntilTerminalParams
): Promise<QueryUnifiedVideoTaskStatusResult> {
    const wait = params.wait || waitForNextVideoTaskPoll
    let shouldWait = params.initialDelay === true

    while (true) {
        if (params.signal?.aborted) throw createVideoPollingAbortError()
        if (shouldWait) await wait(params.intervalMs, params.signal)

        let result: QueryUnifiedVideoTaskStatusResult
        try {
            result = await params.query()
        } catch (error) {
            if (params.signal?.aborted || isVideoPollingAbortError(error)) throw error
            shouldWait = true
            continue
        }

        await params.onResult?.(result)
        if (result.status === 'failed') return result
        if (result.status === 'succeed' && result.videos[0]) return result
        shouldWait = true
    }
}

function normalizeVideoUrls(value: unknown): string[] {
    const urls: string[] = []
    const seen = new Set<unknown>()
    const visit = (item: unknown, keyHint = '') => {
        if (!item) return
        if (typeof item === 'string') {
            const trimmed = item.trim()
            if (!trimmed) return
            if (/^[\[{]/.test(trimmed)) {
                try {
                    visit(JSON.parse(trimmed), keyHint)
                    return
                } catch {
                    // Continue treating the value as a URL-like string.
                }
            }
            if (!/^https?:\/\//i.test(trimmed)) return
            const lowerKeyHint = keyHint.toLowerCase()
            const isImageUrl = /\.(?:png|jpe?g|webp|gif|bmp|avif|svg)(?:[?#]|$)/i.test(trimmed)
            const isPlayableMediaUrl = /\.(?:mp4|mov|webm|m4v|mkv|mp3|wav|ogg|aac|flac|m4a|opus|glb|gltf|obj|fbx|usdz|ply|splat)(?:[?#]|$)/i.test(trimmed)
            const isExplicitMediaKey = /(video|audio|model|3d|text)/i.test(lowerKeyHint)
            const isGenericResultKey = /(result|output|file|media|download|url)s?$/i.test(lowerKeyHint)
            if (isImageUrl && !isExplicitMediaKey) return
            if (
                isPlayableMediaUrl ||
                isExplicitMediaKey ||
                isGenericResultKey
            ) {
                urls.push(trimmed)
            }
            return
        }
        if (Array.isArray(item)) {
            item.forEach((entry) => visit(entry, keyHint))
            return
        }
        if (typeof item === 'object') {
            if (seen.has(item)) return
            seen.add(item)
            const record = item as Record<string, unknown>
            const fileUrl = String(record.fileUrl || record.file_url || record.url || '').trim()
            const fileType = String(record.fileType || record.file_type || '').trim().toLowerCase()
            const mimeType = String(record.mimeType || record.mime_type || '').trim().toLowerCase()
            if (fileUrl && /^https?:\/\//i.test(fileUrl)) {
                const isImageDescriptor = fileType.includes('cover') || fileType.includes('poster') || fileType.includes('image') || fileType.includes('frame') || mimeType.startsWith('image/')
                const isMediaDescriptor = fileType.includes('video') || fileType.includes('audio') || fileType.includes('model') || mimeType.startsWith('video/') || mimeType.startsWith('audio/') || /\.(?:mp4|mov|webm|m4v|mkv|mp3|wav|ogg|aac|flac|m4a|opus|glb|gltf|obj|fbx|usdz|ply|splat)(?:[?#]|$)/i.test(fileUrl)
                if (isMediaDescriptor && !isImageDescriptor) {
                    urls.push(fileUrl)
                    return
                }
                if (isImageDescriptor) return
            }
            Object.entries(record).forEach(([key, entry]) => visit(entry, `${keyHint}.${key}`))
        }
    }
    visit(value)
    return Array.from(new Set(urls))
}

function mapStatus(rawStatus: unknown, hasVideo: boolean): UnifiedVideoTaskStatus {
    const normalized = String(rawStatus || '').trim().toLowerCase()
    if (hasVideo) return 'succeed'
    if (['succeed', 'succeeded', 'success', 'completed', 'done', 'finish', 'finished'].includes(normalized)) return 'succeed'
    if (['failed', 'fail', 'error', 'cancelled', 'canceled', 'expired', 'stalled'].includes(normalized)) return 'failed'
    if (['processing', 'running', 'queued', 'queueing', 'queuing', 'pending', 'submitted', 'in_progress'].includes(normalized)) return 'processing'
    return normalized ? 'unknown' : 'processing'
}

function normalizeTaskProgress(value: unknown): number | undefined {
    const raw = typeof value === 'number'
        ? value
        : (typeof value === 'string' && value.trim() ? Number(value.trim()) : Number.NaN)
    if (!Number.isFinite(raw)) return undefined
    const normalized = raw > 1 ? raw / 100 : raw
    return Math.max(0, Math.min(1, normalized))
}

function parseUnifiedPayload(payload: any, preferredSource: 'seedance-job' | 'task-status' | 'unknown'): QueryUnifiedVideoTaskStatusResult {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : null
    const task = payload?.task && typeof payload.task === 'object' ? payload.task : null
    const rawTask = data?.raw?.data && typeof data.raw.data === 'object'
        ? data.raw.data
        : null

    const videosFromData = normalizeVideoUrls([
        data?.task_result?.videos,
        data?.task_result?.audios,
        data?.task_result?.models,
        data?.task_result?.texts,
        data?.task_result?.video_url,
        data?.task_result?.videoUrl,
        data?.task_result?.audio_url,
        data?.task_result?.audioUrl,
        data?.task_result?.model_url,
        data?.task_result?.modelUrl,
        data?.task_result?.text,
        data?.task_result?.output_url,
        data?.task_result?.outputUrl,
        data?.task_result?.file_url,
        data?.task_result?.fileUrl,
        data?.task_result?.download_url,
        data?.task_result?.downloadUrl,
        data?.task_result?.media_url,
        data?.task_result?.mediaUrl,
        data?.result?.videos,
        data?.result?.audios,
        data?.result?.models,
        data?.result?.texts,
        data?.result?.video_url,
        data?.result?.videoUrl,
        data?.result?.audio_url,
        data?.result?.audioUrl,
        data?.result?.model_url,
        data?.result?.modelUrl,
        data?.result?.text,
        data?.result?.output_url,
        data?.result?.outputUrl,
        data?.result?.file_url,
        data?.result?.fileUrl,
        data?.result?.download_url,
        data?.result?.downloadUrl,
        data?.result?.media_url,
        data?.result?.mediaUrl,
    ])
    const videosFromTask = normalizeVideoUrls([
        task?.videoUrl,
        task?.audioUrl,
        task?.modelUrl,
        task?.text,
        task?.content?.video_url,
        task?.content?.audio_url,
        task?.content?.model_url,
        task?.content?.text,
        rawTask?.task_result?.videos,
        rawTask?.task_result?.audios,
        rawTask?.task_result?.models,
        rawTask?.task_result?.texts,
        rawTask?.task_result?.video_url,
        rawTask?.task_result?.videoUrl,
        rawTask?.task_result?.audio_url,
        rawTask?.task_result?.audioUrl,
        rawTask?.task_result?.model_url,
        rawTask?.task_result?.modelUrl,
        rawTask?.task_result?.text,
        rawTask?.task_result?.output_url,
        rawTask?.task_result?.outputUrl,
        rawTask?.task_result?.file_url,
        rawTask?.task_result?.fileUrl,
        rawTask?.task_result?.download_url,
        rawTask?.task_result?.downloadUrl,
        rawTask?.task_result?.media_url,
        rawTask?.task_result?.mediaUrl,
        rawTask?.result?.videos,
        rawTask?.result?.audios,
        rawTask?.result?.models,
        rawTask?.result?.texts,
        rawTask?.result?.video_url,
        rawTask?.result?.videoUrl,
        rawTask?.result?.audio_url,
        rawTask?.result?.audioUrl,
        rawTask?.result?.model_url,
        rawTask?.result?.modelUrl,
        rawTask?.result?.text,
        rawTask?.result?.output_url,
        rawTask?.result?.outputUrl,
        rawTask?.result?.file_url,
        rawTask?.result?.fileUrl,
        rawTask?.result?.download_url,
        rawTask?.result?.downloadUrl,
        rawTask?.result?.media_url,
        rawTask?.result?.mediaUrl,
    ])
    const videos = videosFromData.length > 0 ? videosFromData : videosFromTask
    const thumbnailUrl = String(
        data?.task_result?.thumbnail_url ??
        data?.task_result?.thumbnailUrl ??
        data?.thumbnail_url ??
        data?.thumbnailUrl ??
        task?.thumbnailUrl ??
        task?.thumbnail_url ??
        task?.coverImageUrl ??
        task?.cover_image_url ??
        task?.content?.last_frame_url ??
        rawTask?.task_result?.thumbnail_url ??
        rawTask?.task_result?.thumbnailUrl ??
        rawTask?.thumbnail_url ??
        rawTask?.thumbnailUrl ??
        rawTask?.coverImageUrl ??
        rawTask?.cover_image_url ??
        rawTask?.content?.last_frame_url ??
        ''
    ).trim()
    const lastFrameUrl = String(
        data?.task_result?.last_frame_url ??
        data?.task_result?.lastFrameUrl ??
        data?.last_frame_url ??
        data?.lastFrameUrl ??
        task?.last_frame_url ??
        task?.lastFrameUrl ??
        task?.content?.last_frame_url ??
        rawTask?.task_result?.last_frame_url ??
        rawTask?.task_result?.lastFrameUrl ??
        rawTask?.last_frame_url ??
        rawTask?.lastFrameUrl ??
        rawTask?.content?.last_frame_url ??
        ''
    ).trim()

    const rawStatus =
        data?.task_status ??
        data?.status ??
        task?.status ??
        rawTask?.status ??
        payload?.status ??
        ''
    const status = mapStatus(rawStatus, videos.length > 0)
    const statusMessage = String(
        data?.task_status_msg ??
        payload?.error ??
        data?.error?.message ??
        data?.error ??
        data?.fail_reason ??
        data?.failure_reason ??
        rawTask?.error?.message ??
        rawTask?.error ??
        rawTask?.fail_reason ??
        rawTask?.failure_reason ??
        rawTask?.result?.fail_reason ??
        rawTask?.result?.failure_reason ??
        rawTask?.message ??
        task?.error?.message ??
        task?.error ??
        task?.fail_reason ??
        task?.failure_reason ??
        payload?.message ??
        ''
    ).trim()
    const progress = normalizeTaskProgress(
        data?.task_progress ??
        data?.progress ??
        rawTask?.progress ??
        task?.progress ??
        payload?.progress
    )

    return {
        status,
        statusMessage,
        videos,
        thumbnailUrl: thumbnailUrl || undefined,
        lastFrameUrl: lastFrameUrl || undefined,
        progress,
        source: preferredSource,
        payload,
    }
}

async function fetchJson(
    url: string,
    options?: { signal?: AbortSignal; cache?: RequestCache }
): Promise<HttpJsonResponse> {
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: options?.signal,
        cache: options?.cache,
    })
    const payload = await response.json().catch(() => null)
    const retryAfterRaw = Number(
        response.headers.get('retry-after') ||
        response.headers.get('Retry-After') ||
        0
    )
    return {
        ok: response.ok,
        status: response.status,
        payload,
        retryAfterSeconds: Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw : 0,
    }
}

async function querySeedanceJobStatus(
    seedanceJobId: string,
    modelId?: string,
    options?: { signal?: AbortSignal; cache?: RequestCache; projectId?: string; persistVideo?: boolean }
): Promise<QueryUnifiedVideoTaskStatusResult | null> {
    const normalizedJobId = String(seedanceJobId || '').trim()
    if (!normalizedJobId) return null

    const query = new URLSearchParams()
    if (String(modelId || '').trim()) query.set('modelId', String(modelId).trim())
    if (String(options?.projectId || '').trim()) query.set('projectId', String(options?.projectId).trim())
    if (options?.persistVideo) query.set('persistVideo', '1')

    const response = await fetchJson(`/api/seedance/video-tasks/${encodeURIComponent(normalizedJobId)}?${query.toString()}`, options)
    if (!response.ok) return null
    return parseUnifiedPayload(response.payload, 'seedance-job')
}

async function queryProviderTaskStatus(params: {
    providerTaskId: string
    taskType?: string
    statusUrl?: string
    projectId?: string
    modelId?: string
    providerKey?: string
    persistVideo?: boolean
    signal?: AbortSignal
    cache?: RequestCache
}): Promise<QueryUnifiedVideoTaskStatusResult> {
    const cacheKey = buildProviderTaskStatusCacheKey(params)
    const nowMs = Date.now()
    pruneProviderTaskStatusCache(nowMs)
    const cached = providerTaskStatusCache.get(cacheKey)
    if (cached && cached.expiresAt > nowMs) {
        if (cached.error) throw cached.error
        if (cached.result) return cached.result
    }
    const inFlight = providerTaskStatusInFlight.get(cacheKey)
    if (inFlight) return inFlight

    const request = queryProviderTaskStatusUncached(params)
    providerTaskStatusInFlight.set(cacheKey, request)
    request
        .then((result) => {
            const ttlMs = result.status === 'processing' ? 2500 : 1000
            providerTaskStatusCache.set(cacheKey, { result, expiresAt: Date.now() + ttlMs })
            pruneProviderTaskStatusCache()
        })
        .catch((error) => {
            const status = Number((error as any)?.status || 0)
            const retryAfterMs = Math.max(0, Number((error as any)?.retryAfterSeconds || 0) * 1000)
            const ttlMs = status === 429 ? Math.max(5000, retryAfterMs || 0) : 1000
            providerTaskStatusCache.set(cacheKey, { error, expiresAt: Date.now() + ttlMs })
            pruneProviderTaskStatusCache()
        })
        .finally(() => {
            providerTaskStatusInFlight.delete(cacheKey)
        })
    return request
}

async function queryProviderTaskStatusUncached(params: {
    providerTaskId: string
    taskType?: string
    statusUrl?: string
    projectId?: string
    modelId?: string
    providerKey?: string
    persistVideo?: boolean
    signal?: AbortSignal
    cache?: RequestCache
}): Promise<QueryUnifiedVideoTaskStatusResult> {
    const statusUrl = String(params.statusUrl || '').trim()
    const requestUrl = statusUrl ? (() => {
        if (!params.persistVideo) return statusUrl
        try {
            const parsed = new URL(statusUrl, 'http://localhost')
            if (parsed.pathname !== '/api/chat/task-status') return statusUrl
            parsed.searchParams.set('persistVideo', '1')
            return statusUrl.startsWith('/') ? `${parsed.pathname}${parsed.search}` : parsed.toString()
        } catch {
            return statusUrl
        }
    })() : (() => {
        const query = new URLSearchParams({
            taskId: params.providerTaskId,
            type: String(params.taskType || resolveUnifiedProviderTaskType({ providerKey: params.providerKey, fallback: 'image2video' })),
            modelId: String(params.modelId || ''),
            providerKey: String(params.providerKey || ''),
        })
        if (String(params.projectId || '').trim()) {
            query.set('projectId', String(params.projectId).trim())
        }
        if (params.persistVideo) query.set('persistVideo', '1')
        return `/api/chat/task-status?${query.toString()}`
    })()

    const response = await fetchJson(requestUrl, {
        signal: params.signal,
        cache: params.cache,
    })
    if (!response.ok) {
        const error = new Error(String(response.payload?.error || `任务状态查询失败: HTTP ${response.status}`))
        ;(error as any).status = response.status
        ;(error as any).retryAfterSeconds = response.retryAfterSeconds
        ;(error as any).payload = response.payload
        throw error
    }
    return parseUnifiedPayload(response.payload, 'task-status')
}

export async function queryUnifiedVideoTaskStatus(
    params: QueryUnifiedVideoTaskStatusParams
): Promise<QueryUnifiedVideoTaskStatusResult> {
    const providerTaskId = String(params.providerTaskId || '').trim()
    const statusUrl = String(params.statusUrl || '').trim()
    const projectId = String(params.projectId || '').trim()
    const modelId = String(params.modelId || '').trim()
    const providerKey = String(params.providerKey || readProviderKeyFromStatusUrl(statusUrl)).trim()
    const persistVideo = params.persistVideo === true
    const taskType = resolveUnifiedProviderTaskType({
        taskType: params.taskType,
        providerKey,
    })
    const seedanceJobId = String(params.seedanceJobId || '').trim()
    const signal = params.signal
    const cache = params.cache

    if (seedanceJobId && isOfficialSeedanceTaskContext({ taskType, providerKey })) {
        const seedanceResult = await querySeedanceJobStatus(seedanceJobId, modelId, {
            signal,
            cache,
            projectId,
            persistVideo,
        })
        if (seedanceResult && (seedanceResult.status === 'succeed' || seedanceResult.status === 'failed' || !providerTaskId)) {
            return seedanceResult
        }
    }

    if ((providerTaskId || statusUrl) && !providerKey) {
        throw new Error('异步任务缺少 providerKey，无法确定应查询哪个供应商')
    }

    if (providerTaskId || statusUrl) {
        return queryProviderTaskStatus({
            providerTaskId,
            taskType,
            statusUrl,
            projectId,
            modelId,
            providerKey,
            persistVideo,
            signal,
            cache,
        })
    }

    return {
        status: 'unknown',
        statusMessage: '',
        videos: [],
        thumbnailUrl: undefined,
        lastFrameUrl: undefined,
        progress: undefined,
        source: 'unknown',
        payload: null,
    }
}
