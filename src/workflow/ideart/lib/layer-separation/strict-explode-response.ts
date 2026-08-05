export const STRICT_LAYER_SEPARATION_SCHEMA_VERSION = 'ideart.layer-separation.v2' as const
export const STRICT_LAYER_SEPARATION_PIPELINE_MODE = 'strict' as const
export const STRICT_LAYER_SEPARATION_SEGMENTATION_PROVIDER = 'wavespeed-ai/sam3-image-rle' as const
export const STRICT_LAYER_SEPARATION_OCR_PROVIDER = 'alibaba:qwen-vl-ocr-latest' as const
export const STRICT_LAYER_SEPARATION_INPAINT_PROVIDER = 'zenmux:gpt-image-2-mask-edit' as const
const STRICT_LAYER_SEPARATION_NO_MASK_PROVIDER = 'gpt-image-2:not-required-no-mask' as const

const FORBIDDEN_EXPLODE_PROVIDER_PATTERN = /(xingliu|qwen(?:[/@: _-]+)image(?:[/@: _-]+)layered|replicate|volcengine(?:[/@: _-]+)entity[_-]?seg)/i
const INVALID_REQUIRED_PROVIDER_PATTERN = /^(?:none|disabled|unknown|n\/a)$/i

type UnknownRecord = Record<string, unknown>

export type StrictExplodeResponse = {
    response: UnknownRecord
    data: UnknownRecord
    pipeline: UnknownRecord
    artifacts: UnknownRecord[]
}

const asRecord = (value: unknown): UnknownRecord | null => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as UnknownRecord
        : null
)

const requiredString = (value: unknown, field: string): string => {
    const normalized = String(value || '').trim()
    if (!normalized) throw new Error(`图层分离响应缺少 ${field}`)
    return normalized
}

const assertAllowedProvider = (value: string, field: string) => {
    if (INVALID_REQUIRED_PROVIDER_PATTERN.test(value)) {
        throw new Error(`图层分离响应中的 ${field} 无效：${value}`)
    }
    if (FORBIDDEN_EXPLODE_PROVIDER_PATTERN.test(value)) {
        throw new Error(`图层分离响应使用了禁止的回退供应商：${value}`)
    }
}

const parseStrictTextPayload = (artifact: UnknownRecord, index: number): UnknownRecord => {
    const content = artifact.content
    let payload: unknown = content
    if (typeof content === 'string') {
        try {
            payload = JSON.parse(content)
        } catch {
            throw new Error(`文字 artifact[${index}] 不是有效 JSON`)
        }
    }
    const record = asRecord(payload)
    if (!record || record.version !== '2.0' || !Array.isArray(record.layers) || record.layers.length === 0) {
        throw new Error(`文字 artifact[${index}] 不是有效的 v2 可编辑文字数据`)
    }
    record.layers.forEach((layer, layerIndex) => {
        const textLayer = asRecord(layer)
        const textInfo = asRecord(textLayer?.text_info)
        const editableMode = String(textLayer?.editable_mode || '')
        if (!textLayer || !['native_text', 'raster_fallback'].includes(editableMode) || !textInfo || typeof textInfo.text !== 'string') {
            throw new Error(`文字 artifact[${index}].layers[${layerIndex}] 缺少可编辑文字 twin`)
        }
        const requiredStyleFields = [
            'font_family', 'font_size_px', 'font_weight', 'font_style', 'color_css',
            'text_align', 'leading', 'tracking', 'rotation',
        ]
        const missingStyle = requiredStyleFields.find((field) => textInfo[field] === undefined || textInfo[field] === null || textInfo[field] === '')
        if (missingStyle) {
            throw new Error(`文字 artifact[${index}].layers[${layerIndex}].text_info 缺少 ${missingStyle}`)
        }
        if (editableMode === 'raster_fallback') {
            const fallback = asRecord(textLayer.raster_fallback)
            const fallbackUrl = String(fallback?.image_url || textInfo.raster_fallback_url || textInfo.fallback_image_url || '').trim()
            const glyphMaskUrl = String(textLayer.glyph_mask_url || textLayer.mask_url || '').trim()
            if (!fallback || !fallbackUrl || !glyphMaskUrl) {
                throw new Error(`文字 artifact[${index}].layers[${layerIndex}] 缺少视觉备份或 glyph mask`)
            }
            if (fallback.visible_by_default !== true || fallback.editable_text_visible_by_default !== false) {
                throw new Error(`文字 artifact[${index}].layers[${layerIndex}] hybrid twin 可见性无效`)
            }
        }
    })
    return record
}

const assertStrictArtifact = (artifact: unknown, index: number) => {
    const record = asRecord(artifact)
    const metadata = asRecord(record?.metadata)
    if (!record || !metadata || (record.type !== 'image' && record.type !== 'text')) {
        throw new Error(`图层分离 artifact[${index}] 结构无效`)
    }
    if (metadata.schema_version !== STRICT_LAYER_SEPARATION_SCHEMA_VERSION) {
        throw new Error(`图层分离 artifact[${index}] 不是 v2 schema`)
    }
    requiredString(metadata.artifact_id, `artifact[${index}].metadata.artifact_id`)
    if (!Array.isArray(metadata.provenance) || metadata.provenance.length === 0) {
        throw new Error(`图层分离 artifact[${index}] 缺少 provenance`)
    }
    for (const entry of metadata.provenance) {
        const provenance = asRecord(entry)
        if (!provenance) throw new Error(`图层分离 artifact[${index}] provenance 无效`)
        const stage = requiredString(provenance.stage, `artifact[${index}].provenance.stage`)
        if (stage.toLowerCase() === 'fallback') {
            throw new Error(`图层分离 artifact[${index}] 含有禁止的 fallback provenance`)
        }
        const provider = String(provenance.provider || '').trim()
        const model = String(provenance.model || '').trim()
        if (provider) assertAllowedProvider(provider, `artifact[${index}].provenance.provider`)
        if (model) assertAllowedProvider(model, `artifact[${index}].provenance.model`)
        if (provider || model) {
            assertAllowedProvider(`${provider} ${model}`.trim(), `artifact[${index}].provenance.provider+model`)
        }
    }
    if (Array.isArray(metadata.warnings)) {
        for (const warning of metadata.warnings) {
            const item = asRecord(warning)
            if (!item) throw new Error(`图层分离 artifact[${index}] warning 无效`)
            if (item.severity === 'error' || item.recoverable === false || /fallback/i.test(String(item.code || ''))) {
                throw new Error(`图层分离 artifact[${index}] 包含未解决的质量错误`)
            }
        }
    }

    if (record.type === 'image') {
        requiredString(record.content, `artifact[${index}].content`)
        if (metadata.label !== 'bg_image' && metadata.label !== 'fg_image') {
            throw new Error(`图层分离 artifact[${index}] image label 无效`)
        }
        if (metadata.editable_mode !== 'raster_image' && metadata.editable_mode !== 'reference') {
            throw new Error(`图层分离 artifact[${index}] image editable_mode 无效`)
        }
    } else {
        if (metadata.label !== 'text_render_data' || !['native_text', 'raster_fallback'].includes(String(metadata.editable_mode || ''))) {
            throw new Error(`文字 artifact[${index}] 缺少可编辑文字模式`)
        }
        parseStrictTextPayload(record, index)
    }
}

export function assertStrictExplodeResponse(value: unknown): StrictExplodeResponse {
    const response = asRecord(value)
    if (!response || Number(response.code) !== 0) {
        throw new Error(requiredString(response?.message || response?.error || '图层分离响应无效', 'response.message'))
    }
    const data = asRecord(response.data)
    if (!data || data.status !== 'completed') {
        throw new Error('图层分离任务未返回 completed 状态')
    }
    if (data.schema_version !== STRICT_LAYER_SEPARATION_SCHEMA_VERSION) {
        throw new Error(`图层分离仅接受 ${STRICT_LAYER_SEPARATION_SCHEMA_VERSION}`)
    }

    const pipeline = asRecord(data.pipeline)
    if (!pipeline || pipeline.mode !== STRICT_LAYER_SEPARATION_PIPELINE_MODE) {
        throw new Error('图层分离仅接受 strict pipeline')
    }
    const segmentationProvider = requiredString(pipeline.segmentation_provider, 'pipeline.segmentation_provider')
    if (segmentationProvider !== STRICT_LAYER_SEPARATION_SEGMENTATION_PROVIDER) {
        throw new Error(`图层分离必须使用 ${STRICT_LAYER_SEPARATION_SEGMENTATION_PROVIDER}`)
    }
    const ocrProvider = requiredString(pipeline.ocr_provider, 'pipeline.ocr_provider')
    const inpaintProvider = requiredString(pipeline.inpaint_provider, 'pipeline.inpaint_provider')
    assertAllowedProvider(ocrProvider, 'pipeline.ocr_provider')
    assertAllowedProvider(inpaintProvider, 'pipeline.inpaint_provider')
    if (ocrProvider !== STRICT_LAYER_SEPARATION_OCR_PROVIDER) {
        throw new Error(`图层分离 OCR 必须使用 ${STRICT_LAYER_SEPARATION_OCR_PROVIDER}`)
    }
    if (inpaintProvider !== STRICT_LAYER_SEPARATION_INPAINT_PROVIDER && inpaintProvider !== STRICT_LAYER_SEPARATION_NO_MASK_PROVIDER) {
        throw new Error(`图层分离背景补全必须使用 ${STRICT_LAYER_SEPARATION_INPAINT_PROVIDER}`)
    }

    if (!Array.isArray(data.artifacts) || data.artifacts.length === 0) {
        throw new Error('图层分离成功响应未返回任何 artifact')
    }
    const artifacts = data.artifacts as unknown[]
    artifacts.forEach(assertStrictArtifact)

    const imageArtifacts = artifacts.map(asRecord).filter((item): item is UnknownRecord => Boolean(item && item.type === 'image'))
    const cleanBackgrounds = imageArtifacts.filter((artifact) => {
        const metadata = asRecord(artifact.metadata)
        return metadata?.label === 'bg_image' && metadata.editable_mode !== 'reference'
    })
    if (cleanBackgrounds.length !== 1) {
        throw new Error(`图层分离必须返回且只能返回一个干净背景，当前为 ${cleanBackgrounds.length} 个`)
    }

    const backgroundProvenance = asRecord(cleanBackgrounds[0].metadata)?.provenance
    const reconstruction = asRecord(data.reconstruction)
    const maskCoverage = Number(reconstruction?.mask_coverage ?? reconstruction?.maskCoverage ?? 0)
    const hasSeparatedContent = artifacts.some((artifact) => {
        const item = asRecord(artifact)
        const metadata = asRecord(item?.metadata)
        return item?.type === 'text'
            || (item?.type === 'image' && metadata?.label === 'fg_image' && metadata?.editable_mode !== 'reference')
    })
    const requiresBackgroundInpaint = (Number.isFinite(maskCoverage) && maskCoverage > 0) || hasSeparatedContent
    if (requiresBackgroundInpaint && inpaintProvider !== STRICT_LAYER_SEPARATION_INPAINT_PROVIDER) {
        throw new Error(`图层分离背景补全必须使用 ${STRICT_LAYER_SEPARATION_INPAINT_PROVIDER}`)
    }
    const hasGptImage2BackgroundStage = Array.isArray(backgroundProvenance) && backgroundProvenance.some((entry) => {
        const provenance = asRecord(entry)
        if (String(provenance?.stage || '').toLowerCase() !== 'background_inpaint') return false
        return /gpt-image-2/i.test(`${String(provenance?.provider || '')} ${String(provenance?.model || '')}`)
    })
    if (requiresBackgroundInpaint && !hasGptImage2BackgroundStage) {
        throw new Error('干净背景缺少 GPT Image 2 background_inpaint provenance')
    }

    for (const artifact of imageArtifacts) {
        const metadata = asRecord(artifact.metadata)
        if (metadata?.label !== 'fg_image' || metadata.editable_mode === 'reference') continue
        const provenance = Array.isArray(metadata.provenance) ? metadata.provenance : []
        const hasSam3Stage = provenance.some((entry) => {
            const item = asRecord(entry)
            if (String(item?.stage || '').toLowerCase() !== 'segmentation') return false
            return `${String(item?.provider || '')} ${String(item?.model || '')}`.includes(STRICT_LAYER_SEPARATION_SEGMENTATION_PROVIDER)
        })
        if (!hasSam3Stage) throw new Error('前景图层缺少 WaveSpeed SAM3 segmentation provenance')
    }

    return {
        response,
        data,
        pipeline,
        artifacts: artifacts as UnknownRecord[],
    }
}
