export type ProviderTaskStatusUrlInput = {
  taskId?: unknown
  taskType?: unknown
  statusUrl?: unknown
  providerKey?: unknown
  modelId?: unknown
  projectId?: unknown
}

export function readProviderKeyFromTaskStatusUrl(value: unknown): string {
  const statusUrl = String(value || '').trim()
  if (!statusUrl) return ''
  try {
    return String(new URL(statusUrl, 'http://localhost').searchParams.get('providerKey') || '').trim()
  } catch {
    return ''
  }
}

export function buildProviderTaskStatusUrl(input: ProviderTaskStatusUrlInput): string {
  const rawStatusUrl = String(input.statusUrl || '').trim()
  const providerKey = String(input.providerKey || readProviderKeyFromTaskStatusUrl(rawStatusUrl) || '').trim()
  if (rawStatusUrl) {
    if (!providerKey) throw new Error('异步任务缺少 providerKey，无法确定应查询哪个供应商')
    return rawStatusUrl
  }
  const taskId = String(input.taskId || '').trim()
  if (!taskId) return ''
  if (!providerKey) throw new Error('异步任务缺少 providerKey，无法确定应查询哪个供应商')
  const query = new URLSearchParams({
    taskId,
    type: String(input.taskType || '').trim() || 'image-generation',
    providerKey,
  })
  const modelId = String(input.modelId || '').trim()
  if (modelId) query.set('modelId', modelId)
  const projectId = String(input.projectId || '').trim()
  if (projectId) query.set('projectId', projectId)
  return `/api/chat/task-status?${query.toString()}`
}
