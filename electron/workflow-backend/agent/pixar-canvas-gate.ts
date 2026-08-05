export type PixarCanvasGateCommand = {
  operation: string
  payload?: Record<string, unknown>
  status?: string
  result?: unknown
  createdAt?: string
}

export type PixarCanvasGateTask = {
  selectedContext?: {
    id?: string
    name?: string
    path?: string
  } | null
}

const CHARACTER_STAGES = new Set([
  'character-identity-master',
  'character-face-turnaround',
  'character-body-turnaround',
  'character-expression-sheet',
  'character-action-test',
])

const ALLOWED_ASSET_STAGES = new Set([
  ...CHARACTER_STAGES,
  'scene-master',
  'scene-lighting-variant',
  'product-master',
  'product-turnaround',
  'prop-master',
])

const REQUIRED_APPROVED_STAGES = [
  'character-identity-master',
  'character-face-turnaround',
  'character-body-turnaround',
  'character-expression-sheet',
  'scene-master',
  'product-master',
  'product-turnaround',
] as const

const DERIVED_MASTER_STAGE: Record<string, string> = {
  'character-face-turnaround': 'character-identity-master',
  'character-body-turnaround': 'character-identity-master',
  'character-expression-sheet': 'character-identity-master',
  'character-action-test': 'character-identity-master',
  'scene-lighting-variant': 'scene-master',
  'product-turnaround': 'product-master',
}

const PIXAR_SKILL_ID = 'pixar-animation-ad'
const DELIVERY_SPEC_STAGE = 'delivery-spec'
const BRAND_STYLE_STAGE = 'brand-style-bible'
const CHARACTER_BIBLE_STAGE = 'character-bible'
const CREATIVE_SCRIPT_STAGE = 'creative-script-lyrics'
const PIXAR_PREPRODUCTION_STAGES = new Set([
  DELIVERY_SPEC_STAGE,
  BRAND_STYLE_STAGE,
  CHARACTER_BIBLE_STAGE,
  CREATIVE_SCRIPT_STAGE,
])
const REQUIRED_CHARACTER_BIBLE_ASSET_STAGES = [
  'character-identity-master',
  'character-face-turnaround',
  'character-body-turnaround',
  'character-expression-sheet',
] as const

function text(value: unknown) {
  return String(value || '').trim()
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    : []
}

function isCompleted(command: PixarCanvasGateCommand) {
  return command.status === 'completed'
}

export function isPixarAnimationAdTask(task: PixarCanvasGateTask | null | undefined) {
  const context = task?.selectedContext
  const values = [context?.id, context?.name, context?.path]
    .map((value) => text(value).toLowerCase().replace(/_/g, '-'))
  return values.some((value) => value === 'pixar-animation-ad' || value.endsWith('/pixar-animation-ad') || value.includes('/pixar-animation-ad/'))
}

type CreatedNodeMeta = {
  id: string
  kind: string
  data: Record<string, unknown>
  commandIndex: number
}

function createdNodeMetas(commands: PixarCanvasGateCommand[]) {
  const metas: CreatedNodeMeta[] = []
  commands.forEach((command, commandIndex) => {
    if (!isCompleted(command)) return
    if (command.operation === 'snapshot') {
      list(record(command.result).nodes).forEach((node) => {
        const id = text(node.id)
        if (!id || metas.some((meta) => meta.id === id)) return
        metas.push({
          id,
          kind: text(node.kind),
          data: record(node.data),
          commandIndex,
        })
      })
      return
    }
    if (command.operation === 'update') {
      const payload = record(command.payload)
      const nodeId = text(payload.nodeId)
      const meta = metas.find((candidate) => candidate.id === nodeId)
      if (meta) meta.data = { ...meta.data, ...record(payload.data) }
      return
    }
    if (command.operation !== 'create') return
    const resultNode = record(record(command.result).node)
    const payload = record(command.payload)
    const payloadData = record(payload.data)
    const resultData = record(resultNode.data)
    const id = text(resultNode.id)
    if (!id) return
    metas.push({
      id,
      kind: text(resultNode.kind || payload.kind),
      data: { ...payloadData, ...resultData },
      commandIndex,
    })
  })
  return metas
}

function successfulRunIndexes(commands: PixarCanvasGateCommand[]) {
  const indexes = new Map<string, number>()
  commands.forEach((command, commandIndex) => {
    if (!isCompleted(command)) return
    if (command.operation === 'run') {
      const nodeId = text(command.payload?.nodeId)
      if (nodeId) indexes.set(nodeId, commandIndex)
      return
    }
    if (command.operation !== 'run-batch') return
    const resultItems = list(record(command.result).items)
    resultItems.forEach((item) => {
      if (item.ok !== true) return
      const nodeId = text(item.nodeId)
      if (nodeId) indexes.set(nodeId, commandIndex)
    })
  })
  return indexes
}

function attemptedRunNodeIds(commands: PixarCanvasGateCommand[]) {
  const ids = new Set<string>()
  commands.forEach((command) => {
    if (command.operation === 'run' && (command.status === 'completed' || command.status === 'failed')) {
      const nodeId = text(command.payload?.nodeId)
      if (nodeId) ids.add(nodeId)
      return
    }
    if (command.operation !== 'run-batch') return
    list(record(command.result).items).forEach((item) => {
      if (item.skipped === true || (item.ok !== true && item.ok !== false)) return
      const nodeId = text(item.nodeId)
      if (nodeId) ids.add(nodeId)
    })
  })
  return ids
}

function storyboardGeneratedNodeIds(commands: PixarCanvasGateCommand[]) {
  const ids = new Set<string>()
  commands.forEach((command) => {
    if (!isCompleted(command) || command.operation !== 'storyboard-create-images') return
    list(record(command.result).createdNodes).forEach((node) => {
      if (text(node.kind) !== 'image') return
      const nodeId = text(node.id)
      if (nodeId) ids.add(nodeId)
    })
  })
  return ids
}

function inspectedIndexes(commands: PixarCanvasGateCommand[]) {
  const indexes = new Map<string, number>()
  commands.forEach((command, commandIndex) => {
    if (!isCompleted(command) || command.operation !== 'inspect-result') return
    const nodeId = text(command.payload?.nodeId)
    if (nodeId) indexes.set(nodeId, commandIndex)
  })
  return indexes
}

function latestInspectionMediaUrl(commands: PixarCanvasGateCommand[], nodeId: string) {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index]
    if (!isCompleted(command) || command.operation !== 'inspect-result') continue
    if (text(command.payload?.nodeId) !== nodeId) continue
    const result = record(command.result)
    const data = record(record(result.node).data)
    return text(data.mediaUrl)
      || list(data.imageResults).map((item) => text(item.url)).find(Boolean)
      || list(data.videoResults).map((item) => text(item.url)).find(Boolean)
      || ''
  }
  return ''
}

function latestInspectionHasMedia(commands: PixarCanvasGateCommand[], nodeId: string) {
  return Boolean(latestInspectionMediaUrl(commands, nodeId))
}

function approvedIndexes(commands: PixarCanvasGateCommand[]) {
  const indexes = new Map<string, number>()
  commands.forEach((command, commandIndex) => {
    if (!isCompleted(command) || command.operation !== 'update') return
    const data = record(command.payload?.data)
    if (text(data.workflowAssetReviewStatus).toLowerCase() !== 'approved') return
    const nodeId = text(command.payload?.nodeId)
    if (nodeId) indexes.set(nodeId, commandIndex)
  })
  return indexes
}

function completedConnections(commands: PixarCanvasGateCommand[]) {
  return commands.filter((command) => isCompleted(command) && command.operation === 'connect')
    .map((command) => ({
      source: text(command.payload?.sourceNodeId),
      target: text(command.payload?.targetNodeId),
    }))
}

function nodeIsReviewedAndApproved(params: {
  nodeId: string
  commands: PixarCanvasGateCommand[]
  successfulRuns: Map<string, number>
  storyboardNodeIds: Set<string>
}) {
  const inspected = inspectedIndexes(params.commands).get(params.nodeId)
  const approved = approvedIndexes(params.commands).get(params.nodeId)
  const generated = params.successfulRuns.get(params.nodeId)
  const generatedIndex = generated ?? (params.storyboardNodeIds.has(params.nodeId) ? -1 : undefined)
  return generatedIndex !== undefined
    && inspected !== undefined
    && approved !== undefined
    && inspected >= generatedIndex
    && approved > inspected
}

function nodeStage(meta: CreatedNodeMeta | undefined) {
  return text(meta?.data.workflowAssetStage)
}

function nodePersona(meta: CreatedNodeMeta | undefined) {
  return text(meta?.data.workflowAssetPersonaId)
}

function nodeSkillStage(meta: CreatedNodeMeta | undefined) {
  return text(meta?.data.workflowSkillStage)
}

function nodeSkillStageStatus(meta: CreatedNodeMeta | undefined) {
  return text(meta?.data.workflowSkillStageStatus).toLowerCase()
}

function nodeSkillPersonaIds(meta: CreatedNodeMeta | undefined) {
  return Array.isArray(meta?.data.workflowSkillPersonaIds)
    ? Array.from(new Set(meta.data.workflowSkillPersonaIds.map((value) => text(value)).filter(Boolean)))
    : []
}

function skillStageMeta(metas: CreatedNodeMeta[], stage: string) {
  return metas.find((meta) => nodeSkillStage(meta) === stage)
}

function completedSkillStageMeta(metas: CreatedNodeMeta[], stage: string) {
  return metas.find((meta) => nodeSkillStage(meta) === stage && nodeSkillStageStatus(meta) === 'completed')
}

function completedStageConnection(params: {
  sourceStage: string
  targetStage: string
  metas: CreatedNodeMeta[]
  commands: PixarCanvasGateCommand[]
}) {
  const source = skillStageMeta(params.metas, params.sourceStage)
  const target = skillStageMeta(params.metas, params.targetStage)
  return Boolean(source && target && completedConnections(params.commands)
    .some((edge) => edge.source === source.id && edge.target === target.id))
}

function approvedStageMeta(params: {
  stage: string
  persona?: string
  metas: CreatedNodeMeta[]
  commands: PixarCanvasGateCommand[]
  successfulRuns: Map<string, number>
  storyboardNodeIds: Set<string>
}) {
  return params.metas.find((meta) => (
    nodeStage(meta) === params.stage
    && (!params.persona || nodePersona(meta) === params.persona)
    && nodeIsReviewedAndApproved({
      nodeId: meta.id,
      commands: params.commands,
      successfulRuns: params.successfulRuns,
      storyboardNodeIds: params.storyboardNodeIds,
    })
  ))
}

function latestCompletedOperation(commands: PixarCanvasGateCommand[], operation: string) {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    if (commands[index].operation === operation && isCompleted(commands[index])) return commands[index]
  }
  return undefined
}

function latestCompletedScriptV2Stage(
  commands: PixarCanvasGateCommand[],
  nodeId: string,
  stage: 'confirm-shots' | 'prepare-assets',
) {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index]
    if (!isCompleted(command) || command.operation !== 'run') continue
    if (text(command.payload?.nodeId) !== nodeId) continue
    if (text(command.payload?.scriptV2Stage) === stage) return command
  }
  return undefined
}

function scriptRowsFromCommand(command: PixarCanvasGateCommand | undefined) {
  if (!command) return []
  const payloadRows = list(command.payload?.rows)
  if (payloadRows.length) return payloadRows
  const result = record(command.result)
  const nodeData = record(record(result.node).data)
  const manifestRows = list(nodeData.scriptRowManifest)
  if (manifestRows.length) return manifestRows
  return list(record(record(result.details).scriptResult).rows)
}

function createdMetaForRunItem(
  item: Record<string, unknown>,
  metas: CreatedNodeMeta[],
) {
  const nodeId = text(item.nodeId)
  const meta = metas.find((candidate) => candidate.id === nodeId)
  if (meta) return meta
  const data = record(item.data)
  const stage = text(item.workflowAssetStage || data.workflowAssetStage)
  if (!nodeId || !stage) return undefined
  return {
    id: nodeId,
    kind: text(item.kind),
    data: {
      ...data,
      workflowAssetStage: stage,
      workflowAssetPersonaId: text(item.workflowAssetPersonaId || data.workflowAssetPersonaId),
      modelId: text(item.modelId || data.modelId),
    },
    commandIndex: -1,
  }
}

function runnableUngeneratedAssetMetas(params: {
  metas: CreatedNodeMeta[]
  commands: PixarCanvasGateCommand[]
  successfulRuns: Map<string, number>
  storyboardNodeIds: Set<string>
}) {
  const connections = completedConnections(params.commands)
  return params.metas.filter((meta) => {
    const stage = nodeStage(meta)
    if (
      meta.kind !== 'image'
      || !ALLOWED_ASSET_STAGES.has(stage)
      || params.successfulRuns.has(meta.id)
      || Boolean(text(meta.data.mediaUrl))
    ) return false
    const requiredMasterStage = DERIVED_MASTER_STAGE[stage]
    if (!requiredMasterStage) return true
    return params.metas.some((master) => (
      nodeStage(master) === requiredMasterStage
      && (!CHARACTER_STAGES.has(stage) || nodePersona(master) === nodePersona(meta))
      && nodeIsReviewedAndApproved({
        nodeId: master.id,
        commands: params.commands,
        successfulRuns: params.successfulRuns,
        storyboardNodeIds: params.storyboardNodeIds,
      })
      && connections.some((edge) => edge.source === master.id && edge.target === meta.id)
    ))
  })
}

function validateAssetBatchExecution(params: {
  operation: 'run' | 'run-batch'
  payload: Record<string, unknown>
  metas: CreatedNodeMeta[]
  commands: PixarCanvasGateCommand[]
  successfulRuns: Map<string, number>
  storyboardNodeIds: Set<string>
}) {
  const items = params.operation === 'run' ? [params.payload] : list(params.payload.items)
  const assetItems = items.map((item) => ({ item, meta: createdMetaForRunItem(item, params.metas) }))
    .filter((entry): entry is { item: Record<string, unknown>; meta: CreatedNodeMeta } => (
      entry.meta !== undefined
      && entry.meta.kind === 'image'
      && ALLOWED_ASSET_STAGES.has(nodeStage(entry.meta))
    ))
  if (!assetItems.length) return null

  const attempted = attemptedRunNodeIds(params.commands)
  const runnable = runnableUngeneratedAssetMetas(params)
  const requestedIds = new Set(assetItems.map(({ meta }) => meta.id))

  for (const { item, meta } of assetItems) {
    if ((attempted.has(meta.id) || params.successfulRuns.has(meta.id)) && item.force !== true) {
      return `资产 ${meta.id} 已执行过生成；只有明确的失败或质检不合格重试才允许再次提交，并且必须在修改提示词、模型或参数后传 force=true。`
    }
  }

  if (params.operation === 'run') {
    const nodeId = assetItems[0].meta.id
    const isRetry = attempted.has(nodeId) || params.successfulRuns.has(nodeId)
    const sameWave = isRetry && params.successfulRuns.has(nodeId) ? [] : runnable
    if (sameWave.length > 1) {
      return `当前依赖波次有 ${sameWave.length} 个待处理资产，禁止逐张 run；请先准备完整节点与引用，再用一次 run-batch 全量提交，concurrency 设为 ${Math.min(200, sameWave.length)}。`
    }
    return null
  }

  if (assetItems.length > 1) {
    const requiredConcurrency = Math.min(200, assetItems.length)
    const concurrency = Math.max(1, Math.floor(Number(params.payload.concurrency) || 200))
    if (concurrency < requiredConcurrency) {
      return `资产批次包含 ${assetItems.length} 项，concurrency 必须设为 ${requiredConcurrency}，不能把批处理降级成小并发串行队列。`
    }
  }

  const runnableIds = new Set(runnable.map((meta) => meta.id))
  if (assetItems.some(({ meta }) => runnableIds.has(meta.id))) {
    const missing = runnable.filter((meta) => !requestedIds.has(meta.id))
    if (missing.length) {
      return `资产生成必须覆盖当前依赖波次的全部待处理节点；本次还缺少 ${missing.length} 项，请合并到同一个 run-batch。`
    }
  }
  return null
}

function validateRawAssetCreate(params: {
  payload: Record<string, unknown>
  metas: CreatedNodeMeta[]
  commands: PixarCanvasGateCommand[]
  successfulRuns: Map<string, number>
  storyboardNodeIds: Set<string>
}) {
  const kind = text(params.payload.kind)
  const data = record(params.payload.data)
  const skillStage = text(data.workflowSkillStage)
  const skillId = text(data.workflowSkillId).toLowerCase().replace(/_/g, '-')
  if (skillStage) {
    if (!PIXAR_PREPRODUCTION_STAGES.has(skillStage)) {
      return `未知的皮克斯动画广告阶段 ${skillStage}；必须严格按 delivery-spec → brand-style-bible → character-bible → creative-script-lyrics 执行。`
    }
    if (skillId !== PIXAR_SKILL_ID) {
      return `阶段节点必须声明 workflowSkillId=${PIXAR_SKILL_ID}。`
    }
    if (skillStageMeta(params.metas, skillStage)) {
      return `阶段 ${skillStage} 已有节点；请复用并更新现有阶段产物，禁止重复创建。`
    }
    const content = text(data.content || data.prompt)
    if (skillStage === DELIVERY_SPEC_STAGE) {
      if (kind !== 'text' || text(data.componentType) !== 'text-editor' || !content) {
        return '阶段 1 必须先创建带完整输入与交付规格内容的 text-editor，并标记 workflowSkillStage=delivery-spec。'
      }
      return null
    }
    if (skillStage === BRAND_STYLE_STAGE) {
      if (!completedSkillStageMeta(params.metas, DELIVERY_SPEC_STAGE)) {
        return '必须先完成阶段 1 的 delivery-spec，才能建立品牌真相与原创风格圣经。'
      }
      if (kind !== 'text' || text(data.componentType) !== 'text-editor' || !content) {
        return '阶段 2 必须创建包含品牌事实、产品锁定、原创风格与连续性规则的 text-editor。'
      }
      return null
    }
    if (skillStage === CHARACTER_BIBLE_STAGE) {
      if (!completedSkillStageMeta(params.metas, BRAND_STYLE_STAGE)) {
        return '必须先完成阶段 2 的 brand-style-bible，才能建立角色圣经。'
      }
      if (!completedStageConnection({
        sourceStage: DELIVERY_SPEC_STAGE,
        targetStage: BRAND_STYLE_STAGE,
        metas: params.metas,
        commands: params.commands,
      })) {
        return '必须先把 delivery-spec 连接到 brand-style-bible，形成可追溯的阶段链路。'
      }
      if (kind !== 'text' || text(data.componentType) !== 'text-editor' || !content || nodeSkillPersonaIds({ id: '', kind, data, commandIndex: -1 }).length === 0) {
        return '阶段 3 必须创建角色圣经 text-editor，并通过 workflowSkillPersonaIds 声明全部稳定角色 ID。'
      }
      if (text(data.workflowSkillStageStatus).toLowerCase() === 'completed') {
        return '角色圣经创建时必须先保持 draft；完成全部角色立绘、转面、表情生成与审核后再更新为 completed。'
      }
      return null
    }
    if (skillStage === CREATIVE_SCRIPT_STAGE) {
      if (!completedSkillStageMeta(params.metas, CHARACTER_BIBLE_STAGE)) {
        return '必须先完成阶段 3 的角色立绘与角色圣经，才能创建阶段 4 的广告创意、脚本和广告歌词。'
      }
      if (!completedStageConnection({
        sourceStage: BRAND_STYLE_STAGE,
        targetStage: CHARACTER_BIBLE_STAGE,
        metas: params.metas,
        commands: params.commands,
      })) {
        return '必须先把 brand-style-bible 连接到 character-bible，才能进入阶段 4。'
      }
      if (kind !== 'script-v2') {
        return '阶段 4 必须使用唯一的原生 script-v2 承载广告创意、脚本、歌词和结构化镜头。'
      }
    }
  } else if (kind === 'script-v2') {
    return `创建 script-v2 时必须声明 workflowSkillId=${PIXAR_SKILL_ID}、workflowSkillStage=${CREATIVE_SCRIPT_STAGE}，不得越过前三个阶段。`
  }
  const mediaRole = text(data.mediaRole)
  const componentType = text(data.componentType)
  const isGenerator = mediaRole === 'generator' || componentType.endsWith('-generator')
  if (kind === 'script') {
    return '皮克斯动画广告必须使用唯一的原生 script-v2 节点；禁止创建普通 script 节点或逐镜脚本节点。'
  }
  if (kind === 'script-v2') {
    if (params.metas.some((meta) => meta.kind === 'script-v2')) {
      return '当前任务已经有一个 script-v2；请复用这一份结构化脚本，禁止按镜头重复创建脚本节点。'
    }
    return null
  }
  if (kind === 'video' && isGenerator) {
    return '皮克斯动画广告禁止手工创建剧情视频节点；角色、场景、道具批准后必须使用 storyboard-create-videos。'
  }
  if (kind !== 'image' || !isGenerator) return null

  const stage = text(data.workflowAssetStage)
  const persona = text(data.workflowAssetPersonaId)
  const assetKind = text(data.workflowScriptV2AssetKind)
  const assetId = text(data.workflowScriptV2AssetId)
  if (!ALLOWED_ASSET_STAGES.has(stage)) {
    return '皮克斯动画广告的手工图片节点只能用于带 workflowAssetStage 的角色、场景、产品或道具资产；剧情草图和关键帧必须使用 storyboard-create-images。'
  }
  if (!assetId || !assetKind) {
    return '资产节点必须声明 workflowScriptV2AssetId 和 workflowScriptV2AssetKind，才能进入原生分镜资产匹配链路。'
  }
  if (CHARACTER_STAGES.has(stage) && (!persona || assetKind !== '角色')) {
    return '角色资产必须声明 workflowAssetPersonaId，且 workflowScriptV2AssetKind 必须为“角色”。'
  }
  if (stage.startsWith('scene-') && assetKind !== '场景') {
    return '场景资产的 workflowScriptV2AssetKind 必须为“场景”。'
  }
  if (stage.startsWith('scene-')) {
    const prompt = text(data.prompt)
    if (!/(干净空场|空场|无人场景|无人物|无角色|empty\s+(?:scene|plate)|clean\s+(?:scene|plate))/iu.test(prompt)) {
      return '场景资产必须明确生成干净空场：不得出现角色、人物、动物、吉祥物、身体局部、角色倒影或角色影子。'
    }
  }
  if ((stage.startsWith('product-') || stage === 'prop-master') && assetKind !== '道具') {
    return '产品和道具资产的 workflowScriptV2AssetKind 必须为“道具”。'
  }
  if (Number(data.generationCount || 1) !== 1) {
    return '一致性资产每个节点只能生成 1 张；请逐张查看、批准后再进入下一阶段。'
  }
  const characterBible = skillStageMeta(params.metas, CHARACTER_BIBLE_STAGE)
  if (CHARACTER_STAGES.has(stage)) {
    if (!characterBible) {
      return '角色资产只能在完成阶段 1、2 并创建阶段 3 的 character-bible 后生成。'
    }
    if (!completedStageConnection({
      sourceStage: BRAND_STYLE_STAGE,
      targetStage: CHARACTER_BIBLE_STAGE,
      metas: params.metas,
      commands: params.commands,
    })) {
      return '角色资产生成前必须把 brand-style-bible 连接到 character-bible。'
    }
    const personaIds = nodeSkillPersonaIds(characterBible)
    if (!personaIds.includes(persona)) {
      return `角色 ${persona} 不在 character-bible 的 workflowSkillPersonaIds 中；请先更新角色圣经，禁止临时新增未规划角色。`
    }
  } else {
    const scriptNode = params.metas.find((meta) => meta.kind === 'script-v2')
    if (!scriptNode || !latestCompletedScriptV2Stage(params.commands, scriptNode.id, 'prepare-assets')) {
      return `${stage} 必须等阶段 4 的 script-v2 完成 confirm-shots 和 prepare-assets 后再创建。`
    }
  }
  if (stage === 'character-identity-master') {
    const prompt = text(data.prompt)
    if (!/(单人|单角色|唯一角色)/u.test(prompt) || !/(纯色|干净|中性)背景/u.test(prompt)) {
      return '角色身份主图必须是单人、单角色、干净或中性背景的独立图，不能把多视图拼版当身份主参考。'
    }
    if (/(设定图|转面|三视图|多视图|表情表|排版|拼版|宫格|contact sheet|turnaround)/iu.test(prompt)) {
      return '角色身份主图不能包含设定图、三视图、表情表或拼版；请先生成唯一的独立身份主图。'
    }
    if (params.metas.some((meta) => nodeStage(meta) === stage && nodePersona(meta) === persona)) {
      return `角色 ${persona} 已有身份主图；每个角色只能保留一个 character-identity-master。`
    }
  }

  const requiredMasterStage = DERIVED_MASTER_STAGE[stage]
  if (!requiredMasterStage) return null
  const master = approvedStageMeta({
    stage: requiredMasterStage,
    persona: CHARACTER_STAGES.has(stage) ? persona : undefined,
    metas: params.metas,
    commands: params.commands,
    successfulRuns: params.successfulRuns,
    storyboardNodeIds: params.storyboardNodeIds,
  })
  if (!master) {
    return `${stage} 只能在 ${requiredMasterStage} 已生成、查看并标记 approved 后创建。`
  }
  const masterModel = text(master.data.modelId)
  const requestedModel = text(data.modelId)
  if (!masterModel || !requestedModel || masterModel !== requestedModel) {
    return `${stage} 必须与 ${requiredMasterStage} 使用同一个已启用图像模型，避免跨模型身份漂移。`
  }
  return null
}

function validateRunItems(params: {
  items: Array<Record<string, unknown>>
  metas: CreatedNodeMeta[]
  commands: PixarCanvasGateCommand[]
  successfulRuns: Map<string, number>
  storyboardNodeIds: Set<string>
}) {
  const connections = completedConnections(params.commands)
  for (const item of params.items) {
    const meta = createdMetaForRunItem(item, params.metas)
    const kind = text(item.kind || meta?.kind)
    if (kind === 'script') {
      return '皮克斯动画广告禁止运行普通 script；请使用唯一的 script-v2 并按 confirm-shots → prepare-assets 顺序执行。'
    }
    if (kind === 'script-v2') {
      const nodeId = text(item.nodeId || meta?.id)
      if (nodeSkillStage(meta) !== CREATIVE_SCRIPT_STAGE || !completedSkillStageMeta(params.metas, CHARACTER_BIBLE_STAGE)) {
        return 'script-v2 只能在阶段 1–3 完成后作为 creative-script-lyrics 阶段运行；请先完成规格、品牌风格与角色圣经。'
      }
      const characterBible = skillStageMeta(params.metas, CHARACTER_BIBLE_STAGE)
      if (!characterBible || !completedConnections(params.commands).some((edge) => edge.source === characterBible.id && edge.target === nodeId)) {
        return '运行阶段 4 前必须把 character-bible 连接到唯一的 creative-script-lyrics script-v2。'
      }
      const stage = text(item.scriptV2Stage)
      if (stage !== 'confirm-shots' && stage !== 'prepare-assets') {
        return '运行 script-v2 时必须显式传入 scriptV2Stage=confirm-shots 或 prepare-assets。'
      }
      if (stage === 'prepare-assets' && !latestCompletedScriptV2Stage(params.commands, nodeId, 'confirm-shots')) {
        return '必须先运行 script-v2 的 confirm-shots 生成并确认结构化分镜行，再运行 prepare-assets 提取角色、场景和道具。'
      }
      if (stage === 'confirm-shots' && latestCompletedScriptV2Stage(params.commands, nodeId, 'prepare-assets')) {
        return 'script-v2 已进入资产准备阶段；请继续复用当前结构化脚本，不要重新创建或倒退到 confirm-shots。'
      }
      continue
    }
    if (kind === 'video') {
      return '皮克斯动画广告禁止通过 run/run-batch 手工执行剧情视频；必须使用 storyboard-create-videos。'
    }
    if (kind !== 'image') continue
    if (!meta || !ALLOWED_ASSET_STAGES.has(nodeStage(meta))) {
      return '皮克斯动画广告只能通过 run/run-batch 执行带资产阶段标签的图片节点；剧情分镜必须走原生 storyboard-create-images。'
    }
    const stage = nodeStage(meta)
    if (CHARACTER_STAGES.has(stage)) {
      const characterBible = skillStageMeta(params.metas, CHARACTER_BIBLE_STAGE)
      if (!characterBible || !nodeSkillPersonaIds(characterBible).includes(nodePersona(meta))) {
        return `${stage} 必须属于阶段 3 角色圣经中已声明的角色。`
      }
    } else {
      const scriptNode = params.metas.find((candidate) => candidate.kind === 'script-v2')
      if (!scriptNode || !latestCompletedScriptV2Stage(params.commands, scriptNode.id, 'prepare-assets')) {
        return `${stage} 必须在阶段 4 脚本完成 prepare-assets 后运行。`
      }
    }
    const requiredMasterStage = DERIVED_MASTER_STAGE[stage]
    if (!requiredMasterStage) continue
    const master = approvedStageMeta({
      stage: requiredMasterStage,
      persona: CHARACTER_STAGES.has(stage) ? nodePersona(meta) : undefined,
      metas: params.metas,
      commands: params.commands,
      successfulRuns: params.successfulRuns,
      storyboardNodeIds: params.storyboardNodeIds,
    })
    if (!master || !connections.some((edge) => edge.source === master.id && edge.target === meta.id)) {
      return `${stage} 必须连接已批准的 ${requiredMasterStage} 节点作为真实参考后才能生成。`
    }
  }
  return null
}

function validateApprovedUpdate(params: {
  payload: Record<string, unknown>
  metas: CreatedNodeMeta[]
  commands: PixarCanvasGateCommand[]
  successfulRuns: Map<string, number>
  storyboardNodeIds: Set<string>
}) {
  const data = record(params.payload.data)
  if (text(data.workflowSkillStageStatus).toLowerCase() === 'completed') {
    const nodeId = text(params.payload.nodeId)
    const meta = params.metas.find((candidate) => candidate.id === nodeId)
    const stage = nodeSkillStage(meta)
    if (!stage) return '只有带 workflowSkillStage 的阶段节点才能更新 workflowSkillStageStatus。'
    if (stage === DELIVERY_SPEC_STAGE && !text(meta?.data.content || meta?.data.prompt)) {
      return 'delivery-spec 内容为空，不能标记 completed。'
    }
    if (stage === BRAND_STYLE_STAGE && !completedSkillStageMeta(params.metas, DELIVERY_SPEC_STAGE)) {
      return '必须先完成 delivery-spec，才能完成 brand-style-bible。'
    }
    if (stage === CHARACTER_BIBLE_STAGE) {
      if (!completedSkillStageMeta(params.metas, BRAND_STYLE_STAGE)) {
        return '必须先完成 brand-style-bible，才能完成 character-bible。'
      }
      const personaIds = nodeSkillPersonaIds(meta)
      if (personaIds.length === 0) return 'character-bible 缺少 workflowSkillPersonaIds，不能完成阶段 3。'
      for (const persona of personaIds) {
        for (const assetStage of REQUIRED_CHARACTER_BIBLE_ASSET_STAGES) {
          if (!approvedStageMeta({
            stage: assetStage,
            persona,
            metas: params.metas,
            commands: params.commands,
            successfulRuns: params.successfulRuns,
            storyboardNodeIds: params.storyboardNodeIds,
          })) {
            return `角色 ${persona} 缺少已生成、查看并 approved 的 ${assetStage}，阶段 3 不能标记 completed。`
          }
        }
      }
    }
  }
  if (text(data.workflowAssetReviewStatus).toLowerCase() !== 'approved') return null
  const nodeId = text(params.payload.nodeId)
  const meta = params.metas.find((candidate) => candidate.id === nodeId)
  if (nodeStage(meta).startsWith('scene-') && data.workflowSceneCleanPlate !== true) {
    return '场景资产批准时必须同时设置 workflowSceneCleanPlate=true，确认实际结果是无角色、无人物、无动物、无倒影和无角色影子的干净空场。'
  }
  const generatedIndex = params.successfulRuns.get(nodeId) ?? (params.storyboardNodeIds.has(nodeId) ? -1 : undefined)
  const inspectIndex = inspectedIndexes(params.commands).get(nodeId)
  if (generatedIndex === undefined || inspectIndex === undefined || inspectIndex < generatedIndex) {
    return '不能直接把资产标记为 approved；必须先生成成功，再用 inspect-result 查看该节点的实际结果。'
  }
  if (!latestInspectionHasMedia(params.commands, nodeId)) {
    return 'inspect-result 没有返回可用媒体，不能把空白或失败结果标记为 approved；请只重试该失败项。'
  }
  return null
}

function validateAssetImport(params: {
  payload: Record<string, unknown>
  metas: CreatedNodeMeta[]
  commands: PixarCanvasGateCommand[]
  successfulRuns: Map<string, number>
  storyboardNodeIds: Set<string>
}) {
  const scriptNodeId = text(params.payload.nodeId)
  const scriptMeta = params.metas.find((meta) => meta.id === scriptNodeId)
  if (scriptMeta && scriptMeta.kind !== 'script-v2') {
    return 'script-import-assets 只能作用于唯一的原生 script-v2 节点。'
  }
  const prepareAssets = scriptNodeId
    ? latestCompletedScriptV2Stage(params.commands, scriptNodeId, 'prepare-assets')
    : undefined
  if (!scriptNodeId || !prepareAssets) {
    return '必须先按顺序完成 script-v2 的 confirm-shots 和 prepare-assets，再导入已审核资产。'
  }
  const rows = list(params.payload.rows).length
    ? list(params.payload.rows)
    : scriptRowsFromCommand(prepareAssets)
  if (!rows.length) {
    return 'script-import-assets 需要 script-v2 的完整分镜行匹配键；请重新运行 prepare-assets，不要手工复制整份脚本正文。'
  }
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const hasCharacter = [
      row.characterAssetId1,
      row.characterPersonaKey1,
      row.character1,
      ...((Array.isArray(row.characterKeys) ? row.characterKeys : []) as unknown[]),
      ...((Array.isArray(row.characters) ? row.characters : []) as unknown[]),
    ].some((value) => Boolean(text(value)))
    const hasScene = [row.sceneAssetKey, row.sceneKey, row.sceneTags]
      .some((value) => Array.isArray(value) ? value.some((item) => Boolean(text(item))) : Boolean(text(value)))
    if (!hasCharacter) return `分镜第 ${index + 1} 行缺少角色资产匹配键，禁止生成无法保持身份一致的镜头。`
    if (!hasScene) return `分镜第 ${index + 1} 行缺少场景资产匹配键，禁止生成无法保持空间连续性的镜头。`
  }
  for (const stage of REQUIRED_APPROVED_STAGES) {
    if (!approvedStageMeta({
      stage,
      metas: params.metas,
      commands: params.commands,
      successfulRuns: params.successfulRuns,
      storyboardNodeIds: params.storyboardNodeIds,
    })) {
      return `进入分镜前缺少已生成、已查看并 approved 的 ${stage} 资产。`
    }
  }

  const explicitAssetsByKind = record(params.payload.assetsByKind)
  const hasExplicitAssets = ['角色', '场景', '道具'].some((kind) => list(explicitAssetsByKind[kind]).length > 0)
  const inferredAssetsByKind = params.metas.reduce((result, meta) => {
    const kind = text(meta.data.workflowScriptV2AssetKind)
    if (kind !== '角色' && kind !== '场景' && kind !== '道具') return result
    if (!nodeIsReviewedAndApproved({
      nodeId: meta.id,
      commands: params.commands,
      successfulRuns: params.successfulRuns,
      storyboardNodeIds: params.storyboardNodeIds,
    })) return result
    const imageUrl = latestInspectionMediaUrl(params.commands, meta.id) || text(meta.data.mediaUrl)
    if (!imageUrl) return result
    result[kind].push({
      id: text(meta.data.workflowScriptV2AssetId) || meta.id,
      kind,
      imageUrl,
      sourceNodeId: meta.id,
      assetStage: nodeStage(meta),
      personaId: nodePersona(meta),
      reviewStatus: 'approved',
      modelId: text(meta.data.modelId),
      cleanPlate: meta.data.workflowSceneCleanPlate === true,
    })
    return result
  }, { 角色: [], 场景: [], 道具: [] } as Record<string, Array<Record<string, unknown>>>)
  const assetsByKind = hasExplicitAssets
    ? Object.fromEntries(['角色', '场景', '道具'].map((kind) => [
        kind,
        list(explicitAssetsByKind[kind]).map((item) => {
          const sourceNodeId = text(item.sourceNodeId)
          const sourceMeta = params.metas.find((meta) => meta.id === sourceNodeId)
          const sourceImageUrl = sourceMeta
            ? latestInspectionMediaUrl(params.commands, sourceMeta.id) || text(sourceMeta.data.mediaUrl)
            : ''
          return {
            ...(sourceMeta ? {
              id: text(sourceMeta.data.workflowScriptV2AssetId) || sourceMeta.id,
              sourceNodeId: sourceMeta.id,
              assetStage: nodeStage(sourceMeta),
              personaId: nodePersona(sourceMeta),
              reviewStatus: text(sourceMeta.data.workflowAssetReviewStatus),
              modelId: text(sourceMeta.data.modelId),
              cleanPlate: sourceMeta.data.workflowSceneCleanPlate === true,
              imageUrl: sourceImageUrl,
            } : {}),
            ...item,
            kind,
            imageUrl: text(item.imageUrl) || sourceImageUrl,
          }
        }),
      ]))
    : inferredAssetsByKind
  const approvedIdentityMetas = params.metas.filter((meta) => (
    nodeStage(meta) === 'character-identity-master'
    && Boolean(nodePersona(meta))
    && nodeIsReviewedAndApproved({
      nodeId: meta.id,
      commands: params.commands,
      successfulRuns: params.successfulRuns,
      storyboardNodeIds: params.storyboardNodeIds,
    })
  ))
  for (const identity of approvedIdentityMetas) {
    const persona = nodePersona(identity)
    for (const stage of ['character-face-turnaround', 'character-body-turnaround', 'character-expression-sheet']) {
      if (!approvedStageMeta({
        stage,
        persona,
        metas: params.metas,
        commands: params.commands,
        successfulRuns: params.successfulRuns,
        storyboardNodeIds: params.storyboardNodeIds,
      })) {
        return `角色 ${persona} 缺少已生成、已查看并 approved 的 ${stage}。`
      }
    }
    const importedIdentity = list(assetsByKind['角色']).find((item) => (
      text(item.assetStage) === 'character-identity-master'
      && text(item.reviewStatus).toLowerCase() === 'approved'
      && text(item.sourceNodeId) === identity.id
      && text(item.personaId) === persona
    ))
    if (!importedIdentity) {
      return `assetsByKind.角色 必须为角色 ${persona} 导入其唯一且已批准的身份主图。`
    }
  }
  const requiredImportedStages: Array<[string, string]> = [
    ['角色', 'character-identity-master'],
    ['场景', 'scene-master'],
    ['道具', 'product-master'],
  ]
  for (const [kind, stage] of requiredImportedStages) {
    const candidate = list(assetsByKind[kind]).find((item) => (
      text(item.assetStage) === stage
      && text(item.reviewStatus).toLowerCase() === 'approved'
      && (kind !== '场景' || item.cleanPlate === true)
      && Boolean(text(item.imageUrl))
      && Boolean(text(item.sourceNodeId))
    ))
    if (!candidate) {
      return `assetsByKind.${kind} 必须导入带 imageUrl、sourceNodeId、assetStage=${stage}、reviewStatus=approved${kind === '场景' ? '、cleanPlate=true' : ''} 的主参考资产。`
    }
    const sourceNodeId = text(candidate.sourceNodeId)
    const sourceMeta = params.metas.find((meta) => meta.id === sourceNodeId && nodeStage(meta) === stage)
    if (!sourceMeta || !nodeIsReviewedAndApproved({
      nodeId: sourceNodeId,
      commands: params.commands,
      successfulRuns: params.successfulRuns,
      storyboardNodeIds: params.storyboardNodeIds,
    })) {
      return `${stage} 的 sourceNodeId 不是当前任务中已审核通过的真实生成资产。`
    }
    if (text(candidate.modelId) && text(candidate.modelId) !== text(sourceMeta.data.modelId)) {
      return `${stage} 导入记录的 modelId 与真实生成节点不一致。`
    }
  }
  return null
}

export function validatePixarAnimationAdCanvasCommand(params: {
  task?: PixarCanvasGateTask | null
  operation: string
  payload?: Record<string, unknown>
  commands?: PixarCanvasGateCommand[]
}) {
  if (!isPixarAnimationAdTask(params.task)) return null
  const payload = params.payload || {}
  const commands = params.commands || []
  const metas = createdNodeMetas(commands)
  const successfulRuns = successfulRunIndexes(commands)
  const storyboardNodeIds = storyboardGeneratedNodeIds(commands)

  if (params.operation === 'create') {
    return validateRawAssetCreate({ payload, metas, commands, successfulRuns, storyboardNodeIds })
  }
  if (params.operation === 'run') {
    const runError = validateRunItems({ items: [payload], metas, commands, successfulRuns, storyboardNodeIds })
    if (runError) return runError
    return validateAssetBatchExecution({
      operation: 'run',
      payload,
      metas,
      commands,
      successfulRuns,
      storyboardNodeIds,
    })
  }
  if (params.operation === 'run-batch') {
    const runError = validateRunItems({ items: list(payload.items), metas, commands, successfulRuns, storyboardNodeIds })
    if (runError) return runError
    return validateAssetBatchExecution({
      operation: 'run-batch',
      payload,
      metas,
      commands,
      successfulRuns,
      storyboardNodeIds,
    })
  }
  if (params.operation === 'update') {
    return validateApprovedUpdate({ payload, metas, commands, successfulRuns, storyboardNodeIds })
  }
  if (params.operation === 'script-import-assets') {
    return validateAssetImport({ payload, metas, commands, successfulRuns, storyboardNodeIds })
  }
  if (params.operation === 'storyboard-create-images') {
    const assetImport = latestCompletedOperation(commands, 'script-import-assets')
    if (!assetImport) {
      return '必须先通过 script-import-assets 导入已审核的角色、场景和产品资产，才能生成原生分镜图。'
    }
    if (latestCompletedOperation(commands, 'storyboard-create-images')) {
      return '原生分镜图首次批次已经创建；不得再次拆分调用 storyboard-create-images，请使用 storyboard-regenerate-images 只重试失败或空白镜头。'
    }
    const rows = scriptRowsFromCommand(assetImport)
    const request = record(payload.request)
    const rowIndexes = Array.isArray(request.rowIndexes)
      ? Array.from(new Set(request.rowIndexes.map((value) => Number(value)).filter(Number.isInteger))).sort((a, b) => a - b)
      : []
    if (rows.length > 200) {
      return `当前脚本有 ${rows.length} 个镜头，超过单批 200 项上限；请先合并或拆分脚本项目，不能退回逐张生成。`
    }
    const missingRowIndexes = rows.map((_, index) => index).filter((index) => !rowIndexes.includes(index))
    const invalidRowIndexes = rowIndexes.filter((index) => index < 0 || index >= rows.length)
    if (!rowIndexes.length || missingRowIndexes.length || invalidRowIndexes.length) {
      return `首次 storyboard-create-images 必须在一个请求中提交全部 ${rows.length} 个 rowIndexes；不得逐镜调用。`
    }
    const identity = approvedStageMeta({
      stage: 'character-identity-master',
      metas,
      commands,
      successfulRuns,
      storyboardNodeIds,
    })
    if (!identity || !text(request.modelId) || text(request.modelId) !== text(identity.data.modelId)) {
      return '分镜图必须显式使用与角色身份主图相同的图像模型，跨模型生成会导致角色漂移。'
    }
    return null
  }
  if (params.operation === 'storyboard-regenerate-images') {
    if (!latestCompletedOperation(commands, 'storyboard-create-images')) {
      return '必须先用一次 storyboard-create-images 创建并生成完整分镜批次，之后才能只重试失败或空白镜头。'
    }
    return null
  }
  if (params.operation === 'storyboard-create-videos') {
    const storyboardCommand = latestCompletedOperation(commands, 'storyboard-create-images')
    if (!storyboardCommand) {
      return '必须先使用 storyboard-create-images 生成原生分镜图，才能生成分镜视频。'
    }
    const imageNodes = list(record(storyboardCommand.result).createdNodes)
      .filter((node) => text(node.kind) === 'image')
      .map((node) => text(node.id))
      .filter(Boolean)
    if (!imageNodes.length) {
      return '分镜命令没有产生可审核的真实图片节点，禁止直接生成视频。'
    }
    const unapproved = imageNodes.filter((nodeId) => !nodeIsReviewedAndApproved({
      nodeId,
      commands,
      successfulRuns,
      storyboardNodeIds,
    }))
    if (unapproved.length) {
      return `仍有 ${unapproved.length} 张分镜未执行 inspect-result 并标记 approved，禁止生成视频。`
    }
  }
  return null
}
