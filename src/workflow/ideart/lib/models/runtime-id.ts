export const MODEL_RUNTIME_ID_SEPARATOR = '@@'

export interface ParsedModelRuntimeId {
    runtimeId: string
    modelId: string
    providerKey?: string
}

export function buildModelRuntimeId(modelId: string, providerKey?: string | null): string {
    const cleanModelId = (modelId || '').trim()
    const cleanProviderKey = (providerKey || '').trim()
    if (!cleanModelId) return ''

    const parsed = parseModelRuntimeId(cleanModelId)
    const baseModelId = (parsed.modelId || cleanModelId).trim()
    const existingProviderKey = (parsed.providerKey || '').trim()

    // No provider requested: keep existing runtime id if already namespaced.
    if (!cleanProviderKey) {
        return existingProviderKey ? `${baseModelId}${MODEL_RUNTIME_ID_SEPARATOR}${existingProviderKey}` : baseModelId
    }

    // Provider requested: overwrite/attach exactly once.
    return `${baseModelId}${MODEL_RUNTIME_ID_SEPARATOR}${cleanProviderKey}`
}

export function parseModelRuntimeId(input: string): ParsedModelRuntimeId {
    const runtimeId = (input || '').trim()
    if (!runtimeId) {
        return { runtimeId: '', modelId: '' }
    }

    if (!runtimeId.includes(MODEL_RUNTIME_ID_SEPARATOR)) {
        return { runtimeId, modelId: runtimeId }
    }

    // Normalize malformed chained runtime IDs like `model@@provider@@provider`.
    const segments = runtimeId
        .split(MODEL_RUNTIME_ID_SEPARATOR)
        .map((segment) => segment.trim())
        .filter(Boolean)

    if (segments.length < 2) {
        return { runtimeId, modelId: runtimeId }
    }

    const modelId = segments[0]
    const providerKey = segments[segments.length - 1]
    if (!modelId || !providerKey) {
        return { runtimeId, modelId: runtimeId }
    }

    return { runtimeId, modelId, providerKey }
}
