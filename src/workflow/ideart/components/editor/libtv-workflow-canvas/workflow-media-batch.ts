export const LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE = 350
export const LIBTV_WORKFLOW_MEDIA_NODE_MAX_LONG_SIDE = 5600
export const LIBTV_WORKFLOW_MEDIA_RATIO_MAX_LONG_SIDE = 1050

export const LIBTV_WORKFLOW_MEDIA_BATCH_MAX_FILES = 10
export const LIBTV_WORKFLOW_MEDIA_UPLOAD_CONCURRENCY = 3
export const LIBTV_WORKFLOW_MEDIA_METADATA_CONCURRENCY = 10

export const LIBTV_WORKFLOW_MEDIA_UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024
export const LIBTV_WORKFLOW_MEDIA_UPLOAD_PART_CONCURRENCY = 4
export const LIBTV_WORKFLOW_MEDIA_UPLOAD_PART_MIN_CONCURRENCY = 2
export const LIBTV_WORKFLOW_MEDIA_UPLOAD_PART_MAX_CONCURRENCY = 6
export const LIBTV_WORKFLOW_MEDIA_UPLOAD_MAX_RETRIES = 2
export const LIBTV_WORKFLOW_MEDIA_UPLOAD_TIMEOUT_MS = 45_000
export const LIBTV_WORKFLOW_VIDEO_METADATA_TIMEOUT_MS = 10_000

export type WorkflowMediaDisplayFrame = {
    width: number
    height: number
}

/**
 * Matches LibTV's computeNodeDimensionsFromNatural function.
 * Natural media always uses a 350px short side and caps only the long side.
 */
export function computeWorkflowMediaFrameFromNatural(
    width: number,
    height: number,
): WorkflowMediaDisplayFrame {
    if (width <= 0 || height <= 0) {
        return {
            width: LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE,
            height: LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE,
        }
    }
    if (width >= height) {
        return {
            width: Math.min(
                Math.round(width / height * LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE),
                LIBTV_WORKFLOW_MEDIA_NODE_MAX_LONG_SIDE,
            ),
            height: LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE,
        }
    }
    return {
        width: LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE,
        height: Math.min(
            Math.round(height / width * LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE),
            LIBTV_WORKFLOW_MEDIA_NODE_MAX_LONG_SIDE,
        ),
    }
}

/**
 * Matches LibTV's placeholder sizing before natural metadata is available.
 */
export function computeWorkflowMediaFrameFromRatio(
    ratio: string | null | undefined,
): WorkflowMediaDisplayFrame {
    const fallback = {
        width: LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE,
        height: LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE,
    }
    if (!ratio || ratio === "auto") return fallback

    const parts = ratio.split(":")
    if (parts.length !== 2) return fallback
    const width = Number.parseInt(parts[0], 10)
    const height = Number.parseInt(parts[1], 10)
    if (Number.isNaN(width) || Number.isNaN(height) || width <= 0 || height <= 0) return fallback

    if (width <= height) {
        return {
            width: LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE,
            height: Math.min(
                Math.round(height / width * LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE),
                LIBTV_WORKFLOW_MEDIA_RATIO_MAX_LONG_SIDE,
            ),
        }
    }
    return {
        width: Math.min(
            Math.round(width / height * LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE),
            LIBTV_WORKFLOW_MEDIA_RATIO_MAX_LONG_SIDE,
        ),
        height: LIBTV_WORKFLOW_MEDIA_NODE_SHORT_SIDE,
    }
}

export function takeWorkflowMediaBatch<T>(items: readonly T[]): T[] {
    return items.slice(0, LIBTV_WORKFLOW_MEDIA_BATCH_MAX_FILES)
}

/**
 * An order-preserving, failure-isolating worker queue. It intentionally returns
 * all-settled results so one rejected upload cannot strand the remaining files.
 */
export async function runWorkflowMediaTasksSettled<T, TResult>(
    items: readonly T[],
    concurrency: number,
    task: (item: T, index: number) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
    if (items.length === 0) return []

    const workerCount = Math.min(
        items.length,
        Math.max(1, Math.floor(Number(concurrency) || 1)),
    )
    const results = new Array<PromiseSettledResult<TResult>>(items.length)
    let cursor = 0

    const worker = async () => {
        while (cursor < items.length) {
            const index = cursor
            cursor += 1
            try {
                results[index] = {
                    status: "fulfilled",
                    value: await task(items[index], index),
                }
            } catch (reason) {
                results[index] = { status: "rejected", reason }
            }
        }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()))
    return results
}

/**
 * Mirrors LibTV's file-level upload gate. Keeping this limiter module-scoped
 * makes the limit global across simultaneous drops and upload entry points.
 */
class WorkflowMediaTaskLimiter {
    private active = 0

    private readonly waiting: Array<() => void> = []

    constructor(private readonly concurrency: number) {}

    async run<TResult>(task: () => Promise<TResult>): Promise<TResult> {
        if (this.active < this.concurrency) {
            this.active += 1
        } else {
            await new Promise<void>((resolve) => this.waiting.push(resolve))
        }
        try {
            return await task()
        } finally {
            const next = this.waiting.shift()
            if (next) {
                next()
            } else {
                this.active = Math.max(0, this.active - 1)
            }
        }
    }
}

const workflowMediaUploadLimiter = new WorkflowMediaTaskLimiter(LIBTV_WORKFLOW_MEDIA_UPLOAD_CONCURRENCY)
const workflowMediaMetadataLimiter = new WorkflowMediaTaskLimiter(LIBTV_WORKFLOW_MEDIA_METADATA_CONCURRENCY)

export function runWorkflowMediaUploadTasks<T, TResult>(
    items: readonly T[],
    task: (item: T, index: number) => Promise<TResult>,
) {
    return runWorkflowMediaTasksSettled(items, items.length || 1, (item, index) => (
        workflowMediaUploadLimiter.run(() => task(item, index))
    ))
}

export function runWorkflowMediaMetadataTasks<T, TResult>(
    items: readonly T[],
    task: (item: T, index: number) => Promise<TResult>,
) {
    return runWorkflowMediaTasksSettled(items, items.length || 1, (item, index) => (
        workflowMediaMetadataLimiter.run(() => task(item, index))
    ))
}
