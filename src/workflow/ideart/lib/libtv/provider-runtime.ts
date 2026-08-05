export type LibTvProviderRuntimeModelLike = {
  id?: unknown
  modelId?: unknown
}

export function resolveLibTvProviderRuntimeModelId(model: LibTvProviderRuntimeModelLike | null | undefined): string {
  return String(model?.id || model?.modelId || '').trim()
}

export function extractLibTvProviderKeyFromRuntimeId(modelRuntimeId: unknown): string {
  const runtimeId = String(modelRuntimeId || '').trim()
  const separatorIndex = runtimeId.lastIndexOf('@@')
  return separatorIndex >= 0 ? runtimeId.slice(separatorIndex + 2).trim().toLowerCase() : ''
}
