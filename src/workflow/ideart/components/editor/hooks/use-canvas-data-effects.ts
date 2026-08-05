import { useEffect, useRef } from 'react'
import type React from 'react'

import { parseDurationSeconds } from '../utils/duration'
import { toVideoDisplayUrl } from '../utils/video-proxy'
import { resolveImageDownloadUrl } from '@/workflow/ideart/lib/url/download-url'
import { buildCanvasProjectContentDocument, type LibTvProjectCanvas } from '@/workflow/ideart/lib/canvas-project-content'
import type { LibTvWorkflowState } from '@/workflow/ideart/lib/libtv/workflow'
import type { ProjectMaterialItem } from '@/workflow/ideart/lib/store/canvas-store'

const INLINE_IMAGE_SAVE_THRESHOLD_BYTES = 384 * 1024
const inlineImageUploadCache = new Map<string, string>()
const inlineImageUploadInflight = new Map<string, Promise<string>>()
const MAX_INLINE_IMAGE_CACHE_ITEMS = 128
const LARGE_WORKFLOW_AUTOSAVE_NODE_THRESHOLD = 2_000
const autosaveSuppressedProjectIds = new Set<string>()
const saveObjectIdentity = new WeakMap<object, number>()
let nextSaveObjectIdentity = 0

export function suppressCanvasAutosaveForProject(projectId: string | null | undefined) {
  const normalized = String(projectId || '').trim()
  if (normalized) autosaveSuppressedProjectIds.add(normalized)
}

export function resumeCanvasAutosaveForProject(projectId: string | null | undefined) {
  const normalized = String(projectId || '').trim()
  if (normalized) autosaveSuppressedProjectIds.delete(normalized)
}

function isCanvasAutosaveSuppressed(projectId: string | null | undefined) {
  const normalized = String(projectId || '').trim()
  return Boolean(normalized && autosaveSuppressedProjectIds.has(normalized))
}

const estimateBase64DataUrlBytes = (value: string): number => {
  if (!value.startsWith('data:image/')) return 0
  const commaIndex = value.indexOf(',')
  if (commaIndex <= 0) return 0
  const header = value.slice(0, commaIndex).toLowerCase()
  if (!header.includes(';base64')) return 0
  const payloadLength = Math.max(0, value.length - commaIndex - 1)
  return Math.floor((payloadLength * 3) / 4)
}

const shouldUploadInlineImage = (value: string): boolean => {
  if (!value.startsWith('data:image/')) return false
  if (value.startsWith('data:image/svg+xml')) return false
  return estimateBase64DataUrlBytes(value) >= INLINE_IMAGE_SAVE_THRESHOLD_BYTES
}

const collectInlineImageCandidates = (node: unknown, output: Set<string>) => {
  if (typeof node === 'string') {
    if (shouldUploadInlineImage(node)) output.add(node)
    return
  }

  if (Array.isArray(node)) {
    for (const item of node) collectInlineImageCandidates(item, output)
    return
  }

  if (!node || typeof node !== 'object') return

  for (const value of Object.values(node as Record<string, unknown>)) {
    collectInlineImageCandidates(value, output)
  }
}

const cloneWithInlineImageReplacements = (node: unknown, replacements: Map<string, string>): unknown => {
  if (typeof node === 'string') {
    return replacements.get(node) ?? node
  }

  if (Array.isArray(node)) {
    return node.map((item) => cloneWithInlineImageReplacements(item, replacements))
  }

  if (!node || typeof node !== 'object') return node

  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    next[key] = cloneWithInlineImageReplacements(value, replacements)
  }
  return next
}

const getImageExtensionFromMime = (mime: string): string => {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/avif':
      return 'avif'
    case 'image/heic':
      return 'heic'
    default:
      return 'png'
  }
}

const setInlineImageUploadCache = (key: string, value: string) => {
  if (!inlineImageUploadCache.has(key) && inlineImageUploadCache.size >= MAX_INLINE_IMAGE_CACHE_ITEMS) {
    const firstKey = inlineImageUploadCache.keys().next().value
    if (typeof firstKey === 'string') inlineImageUploadCache.delete(firstKey)
  }
  inlineImageUploadCache.set(key, value)
}

const uploadInlineImageDataUrl = async (dataUrl: string): Promise<string> => {
  const cached = inlineImageUploadCache.get(dataUrl)
  if (cached) return cached

  const inflight = inlineImageUploadInflight.get(dataUrl)
  if (inflight) return inflight

  const uploader = (async () => {
    const commaIndex = dataUrl.indexOf(',')
    const header = commaIndex > 0 ? dataUrl.slice(0, commaIndex) : ''
    const mimeMatch = header.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64$/i)
    const mimeType = mimeMatch?.[1]?.toLowerCase() || 'image/png'
    const ext = getImageExtensionFromMime(mimeType)

    const decoded = await fetch(dataUrl)
    if (!decoded.ok) {
      throw new Error(`Failed to decode inline image: HTTP ${decoded.status}`)
    }
    const blob = await decoded.blob()
    const file = new File([blob], `project-inline-${Date.now()}.${ext}`, {
      type: blob.type || mimeType,
    })

    const formData = new FormData()
    formData.append('file', file)

    const uploadResp = await fetch('/api/upload', {
      method: 'POST',
      body: formData,

      credentials: "include"
    })

    const uploadJson = await uploadResp.json().catch(() => null)
    const uploadUrl = typeof uploadJson?.url === 'string' ? uploadJson.url : ''
    if (!uploadResp.ok || !uploadUrl) {
      throw new Error(uploadJson?.error || `Upload failed: HTTP ${uploadResp.status}`)
    }

    setInlineImageUploadCache(dataUrl, uploadUrl)
    return uploadUrl
  })()

  inlineImageUploadInflight.set(dataUrl, uploader)
  try {
    return await uploader
  } finally {
    inlineImageUploadInflight.delete(dataUrl)
  }
}

const estimateJsonBytes = (value: unknown): number => {
  try {
    return new Blob([JSON.stringify(value)]).size
  } catch {
    return 0
  }
}

const contentFingerprint = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return String(Date.now())
  }
}

const getSaveObjectIdentity = (value: unknown) => {
  if (!value || typeof value !== 'object') return String(value)
  const object = value as object
  const cached = saveObjectIdentity.get(object)
  if (cached) return String(cached)
  const next = ++nextSaveObjectIdentity
  saveObjectIdentity.set(object, next)
  return String(next)
}

const largeCanvasContentFingerprint = (value: {
  layers: unknown
  libtvWorkflow: unknown
  libtvCanvases: unknown
  activeLibTvCanvasId: unknown
  projectMaterials: unknown
}) => [
  getSaveObjectIdentity(value.layers),
  getSaveObjectIdentity(value.libtvWorkflow),
  getSaveObjectIdentity(value.libtvCanvases),
  String(value.activeLibTvCanvasId || ''),
  getSaveObjectIdentity(value.projectMaterials),
].join(':')

const TRANSIENT_WORKFLOW_NOTES = new Set([
  '生成中...',
  '生成中',
  '后台生成中',
  '排队中',
  '提交视频任务',
  '等待生成',
  '正在创建 3D 世界任务',
  '3D 世界任务已创建',
  '正在创建 3D 世界编辑任务',
  '3D 世界编辑任务已创建',
])

const toPersistableLibTvWorkflow = (workflow: LibTvWorkflowState): LibTvWorkflowState => {
  let changed = false
  const nodes = workflow.nodes.map((node) => {
    const note = String(node.data?.note || '').trim()
    const shouldStrip = node.data?.workflowGenerationRunning !== undefined
      || node.data?.workflowGenerationProgress !== undefined
      || node.data?.workflowRedrawRunning !== undefined
      || node.data?.groupRunning !== undefined
      || TRANSIENT_WORKFLOW_NOTES.has(note)
      || /^正在(?:按脚本)?生成/.test(note)
      || /^正在重新生成/.test(note)
      || /生成中/.test(note)
    if (!shouldStrip) return node
    changed = true
    const data = { ...node.data }
    delete data.workflowGenerationRunning
    delete data.workflowGenerationProgress
    delete data.workflowRedrawRunning
    delete data.groupRunning
    if (
      TRANSIENT_WORKFLOW_NOTES.has(note)
      || /^正在(?:按脚本)?生成/.test(note)
      || /^正在重新生成/.test(note)
      || /生成中/.test(note)
    ) {
      delete data.note
    }
    return { ...node, data }
  })
  return changed ? { ...workflow, nodes } : workflow
}

const mergeActiveWorkflowIntoCanvases = (
  canvases: LibTvProjectCanvas[] | undefined,
  activeCanvasId: string | undefined,
  workflow: LibTvWorkflowState
): LibTvProjectCanvas[] | undefined => {
  if (!Array.isArray(canvases) || canvases.length === 0) return undefined
  const activeId = String(activeCanvasId || canvases[0]?.id || "default").trim()
  const now = Date.now()
  let matched = false
  const next = canvases.map((canvas, index) => {
    const id = String(canvas.id || "").trim() || (index === 0 ? "default" : `canvas-${index + 1}`)
    if (id !== activeId) return { ...canvas, id }
    matched = true
    return {
      ...canvas,
      id,
      libtvWorkflow: workflow,
      updatedAt: now,
    }
  })
  if (!matched) {
    next.push({
      id: activeId,
      name: `画布 ${next.length + 1}`,
      libtvWorkflow: workflow,
      createdAt: now,
      updatedAt: now,
    })
  }
  return next
}

const offloadLargeInlineImagesForSave = async (content: unknown): Promise<{
  content: unknown
  replacedCount: number
  candidateCount: number
  beforeBytes: number
  afterBytes: number
}> => {
  const candidates = new Set<string>()
  collectInlineImageCandidates(content, candidates)
  if (candidates.size === 0) {
    return {
      content,
      replacedCount: 0,
      candidateCount: 0,
      beforeBytes: 0,
      afterBytes: 0,
    }
  }

  const replacements = new Map<string, string>()
  const settled = await Promise.allSettled(
    Array.from(candidates).map(async (candidate) => {
      const url = await uploadInlineImageDataUrl(candidate)
      return { candidate, url }
    })
  )

  for (const result of settled) {
    if (result.status !== 'fulfilled') {
      console.warn('[Canvas] Failed to offload inline image before save:', result.reason)
      continue
    }
    replacements.set(result.value.candidate, result.value.url)
  }

  if (replacements.size === 0) {
    return {
      content,
      replacedCount: 0,
      candidateCount: candidates.size,
      beforeBytes: 0,
      afterBytes: 0,
    }
  }

  const nextContent = cloneWithInlineImageReplacements(content, replacements)

  return {
    content: nextContent,
    replacedCount: replacements.size,
    candidateCount: candidates.size,
    beforeBytes: estimateJsonBytes(content),
    afterBytes: estimateJsonBytes(nextContent),
  }
}

const stripEphemeralLayerFieldsForSave = (inputLayers: Array<any>) =>
  inputLayers
    .filter((layer) => !layer?.uiTransient)
    .map((layer) => {
      if (!layer || typeof layer !== 'object') return layer
      const persistableLayer = { ...layer }
      delete persistableLayer.uiTransient
      return persistableLayer
    })

type UseCanvasDataEffectsParams = {
  layers: Array<any>
  updateLayer: (id: string, attrs: any) => void
  stageRef: React.RefObject<any>
  snapshotRequest: number
  setCanvasSnapshot: (dataUrl: string | null) => void
  projectId: string | null
  libtvWorkflow: LibTvWorkflowState
  libtvCanvases?: LibTvProjectCanvas[]
  activeLibTvCanvasId?: string
  projectMaterials: ProjectMaterialItem[]
  selectedIds: string[]
  downloadTrigger: number
  resetDownload: () => void
  autosaveReady?: boolean
  persistInitialState?: boolean
}

export function useCanvasDataEffects({
  layers,
  updateLayer,
  stageRef,
  snapshotRequest,
  setCanvasSnapshot,
  projectId,
  libtvWorkflow,
  libtvCanvases,
  activeLibTvCanvasId,
  projectMaterials,
  selectedIds,
  downloadTrigger,
  resetDownload,
  autosaveReady = true,
  persistInitialState = false,
}: UseCanvasDataEffectsParams) {
  const videoDurationLoadingRef = useRef<Set<string>>(new Set())
  const autosaveDisabledRef = useRef(false)
  const latestLayersRef = useRef(layers)
  const latestWorkflowRef = useRef(libtvWorkflow)
  const latestCanvasesRef = useRef<LibTvProjectCanvas[] | undefined>(libtvCanvases)
  const latestActiveCanvasIdRef = useRef<string | undefined>(activeLibTvCanvasId)
  const latestMaterialsRef = useRef(projectMaterials)
  const latestProjectIdRef = useRef(projectId)
  const latestAutosaveReadyRef = useRef(autosaveReady)
  const prevLayersRef = useRef(layers)
  const prevWorkflowRef = useRef(libtvWorkflow)
  const prevCanvasesRef = useRef<LibTvProjectCanvas[] | undefined>(libtvCanvases)
  const prevMaterialsRef = useRef(projectMaterials)
  const lastSavedFingerprintRef = useRef<string | null>(null)
  const hadPersistableContentRef = useRef(false)
  const fingerprintProjectIdRef = useRef(projectId)
  const autosaveInFlightRef = useRef<Promise<void> | null>(null)
  const autosavePendingRef = useRef(false)

  useEffect(() => {
    latestLayersRef.current = layers
    latestWorkflowRef.current = libtvWorkflow
    latestCanvasesRef.current = libtvCanvases
    latestActiveCanvasIdRef.current = activeLibTvCanvasId
    latestMaterialsRef.current = projectMaterials
    latestProjectIdRef.current = projectId
    latestAutosaveReadyRef.current = autosaveReady
  }, [activeLibTvCanvasId, autosaveReady, layers, libtvCanvases, libtvWorkflow, projectId, projectMaterials])

  useEffect(() => {
    if (fingerprintProjectIdRef.current === projectId) return
    fingerprintProjectIdRef.current = projectId
    lastSavedFingerprintRef.current = null
    hadPersistableContentRef.current = false
    autosaveDisabledRef.current = false
    prevLayersRef.current = layers
    prevWorkflowRef.current = libtvWorkflow
    prevCanvasesRef.current = libtvCanvases
    prevMaterialsRef.current = projectMaterials
  }, [layers, libtvCanvases, libtvWorkflow, projectId, projectMaterials])

  const inferImageExtensionFromSource = (source: string): string => {
    const trimmed = String(source || '').trim()
    if (!trimmed) return 'png'
    const lower = trimmed.toLowerCase()
    if (lower.startsWith('data:image/')) {
      if (lower.startsWith('data:image/jpeg') || lower.startsWith('data:image/jpg')) return 'jpg'
      if (lower.startsWith('data:image/webp')) return 'webp'
      if (lower.startsWith('data:image/avif')) return 'avif'
      if (lower.startsWith('data:image/gif')) return 'gif'
      if (lower.startsWith('data:image/svg+xml')) return 'svg'
      return 'png'
    }
    const noQuery = lower.split('?')[0].split('#')[0]
    const match = noQuery.match(/\.([a-z0-9]{2,5})$/i)
    if (!match) return 'png'
    const ext = match[1]
    return ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg', 'bmp', 'tif', 'tiff'].includes(ext)
      ? (ext === 'jpeg' ? 'jpg' : ext)
      : 'png'
  }

  const inferVideoExtensionFromSource = (source: string): string => {
    const trimmed = String(source || '').trim()
    if (!trimmed) return 'mp4'
    const lower = trimmed.toLowerCase()
    if (lower.startsWith('data:video/')) {
      if (lower.startsWith('data:video/quicktime')) return 'mov'
      if (lower.startsWith('data:video/webm')) return 'webm'
      if (lower.startsWith('data:video/ogg')) return 'ogg'
      return 'mp4'
    }
    const noQuery = lower.split('?')[0].split('#')[0]
    const match = noQuery.match(/\.([a-z0-9]{2,5})$/i)
    if (!match) return 'mp4'
    const ext = match[1]
    return ['mp4', 'mov', 'webm', 'm4v', 'ogg'].includes(ext) ? ext : 'mp4'
  }

  const resolveVideoDownloadUrl = (source: string): string => {
    const trimmed = String(source || '').trim()
    if (!trimmed) return ''
    return toVideoDisplayUrl(trimmed)
  }

  const hasPotentiallyTaintedImage = (stage: any) => {
    const images = stage.find('Image')
    return images.some((imageNode: any) => {
      const htmlImage = imageNode.image?.()
      const src = htmlImage?.src
      if (!src || typeof src !== 'string') return false
      if (src.startsWith('data:') || src.startsWith('blob:')) return false
      if (src.startsWith('/')) return false
      try {
        const parsed = new URL(src, window.location.origin)
        if (parsed.origin === window.location.origin) return false
        return true
      } catch {
        return false
      }
    })
  }

  useEffect(() => {
    const videoLayers = layers.filter((layer) => layer.type === 'video' && layer.src)

    videoLayers.forEach((layer) => {
      if (videoDurationLoadingRef.current.has(layer.id)) return
      videoDurationLoadingRef.current.add(layer.id)

      const video = document.createElement('video')
      video.preload = 'metadata'

      video.onloadedmetadata = () => {
        const durationSeconds = Number.isFinite(video.duration) ? Math.round(video.duration) : 0
        const currentSeconds = parseDurationSeconds(layer.videoDuration)

        if (durationSeconds > 0 && durationSeconds !== currentSeconds) {
          updateLayer(layer.id, { videoDuration: durationSeconds })
        }

        videoDurationLoadingRef.current.delete(layer.id)
      }

      video.onerror = () => {
        videoDurationLoadingRef.current.delete(layer.id)
      }

      const src = layer.src as string
      video.src = resolveVideoDownloadUrl(src)
    })
  }, [layers, updateLayer])

  useEffect(() => {
    if (!snapshotRequest || !stageRef.current) return

    const stage = stageRef.current

    const captureSnapshot = () => {
      if (hasPotentiallyTaintedImage(stage)) {
        setCanvasSnapshot(null)
        return
      }

      const allImages = stage.find('Image')
      let targetImage: any = null

      if (!targetImage && allImages.length > 0) {
        targetImage = allImages.reduce((largest: any, current: any) => {
          const largestRect = largest.getClientRect()
          const currentRect = current.getClientRect()
          const largestArea = largestRect.width * largestRect.height
          const currentArea = currentRect.width * currentRect.height
          return currentArea > largestArea ? current : largest
        })
      }

      let dataUrl: string
      if (targetImage) {
        const rect = targetImage.getClientRect()
        dataUrl = stage.toDataURL({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          pixelRatio: 2,
        })
      } else {
        dataUrl = stage.toDataURL({ pixelRatio: 2 })
      }

      setCanvasSnapshot(dataUrl)
    }

    requestAnimationFrame(captureSnapshot)
  }, [snapshotRequest, setCanvasSnapshot, stageRef])

  useEffect(() => {
    const hasWorkflowContent = libtvWorkflow.enabled || libtvWorkflow.nodes.length > 0 || libtvWorkflow.edges.length > 0
    const hasPersistableContent = stripEphemeralLayerFieldsForSave(layers).length > 0 || hasWorkflowContent || projectMaterials.length > 0
    if (!projectId) return
    if (!autosaveReady) return
    if (autosaveDisabledRef.current || isCanvasAutosaveSuppressed(projectId)) return
    if (!hasPersistableContent && !hadPersistableContentRef.current) return

    const previousLayers = prevLayersRef.current
    const layersChanged = prevLayersRef.current !== layers
    const workflowChanged = prevWorkflowRef.current !== libtvWorkflow
    const canvasesChanged = prevCanvasesRef.current !== libtvCanvases
    const materialsChanged = prevMaterialsRef.current !== projectMaterials
    prevLayersRef.current = layers
    prevWorkflowRef.current = libtvWorkflow
    prevCanvasesRef.current = libtvCanvases
    prevMaterialsRef.current = projectMaterials
    if (hasPersistableContent) hadPersistableContentRef.current = true
    const largeWorkflow = libtvWorkflow.nodes.length > LARGE_WORKFLOW_AUTOSAVE_NODE_THRESHOLD

    if (lastSavedFingerprintRef.current === null && !persistInitialState) {
      if (largeWorkflow) {
        lastSavedFingerprintRef.current = largeCanvasContentFingerprint({
          layers,
          libtvWorkflow,
          libtvCanvases,
          activeLibTvCanvasId,
          projectMaterials,
        })
      } else {
        const initialWorkflow = toPersistableLibTvWorkflow(libtvWorkflow)
        lastSavedFingerprintRef.current = contentFingerprint({
          layers: stripEphemeralLayerFieldsForSave(layers),
          libtvWorkflow: initialWorkflow,
          libtvCanvases: mergeActiveWorkflowIntoCanvases(libtvCanvases, activeLibTvCanvasId, initialWorkflow),
          activeLibTvCanvasId,
          projectMaterials,
        })
      }
      return
    }

    const removedLayer = layersChanged && layers.length < previousLayers.length
    const autosaveDelay = largeWorkflow
      ? 4_500
      : removedLayer
      ? 120
      : ((workflowChanged || canvasesChanged || materialsChanged) && !layersChanged)
        ? 800
        : 1000

    let idleHandle: number | null = null
    const saveLatestSnapshot = async () => {
      const latestLayers = latestLayersRef.current
      const rawLatestWorkflow = latestWorkflowRef.current
      const latestActiveCanvasId = latestActiveCanvasIdRef.current
      const latestMaterials = latestMaterialsRef.current
      const latestProjectId = latestProjectIdRef.current
      const latestIsLargeWorkflow = rawLatestWorkflow.nodes.length > LARGE_WORKFLOW_AUTOSAVE_NODE_THRESHOLD
      const largeFingerprint = latestIsLargeWorkflow
        ? largeCanvasContentFingerprint({
            layers: latestLayers,
            libtvWorkflow: rawLatestWorkflow,
            libtvCanvases: latestCanvasesRef.current,
            activeLibTvCanvasId: latestActiveCanvasId,
            projectMaterials: latestMaterials,
          })
        : ""
      if (latestIsLargeWorkflow && lastSavedFingerprintRef.current === largeFingerprint) return
      const latestWorkflow = toPersistableLibTvWorkflow(rawLatestWorkflow)
      const latestCanvases = mergeActiveWorkflowIntoCanvases(
        latestCanvasesRef.current,
        latestActiveCanvasId,
        latestWorkflow
      )
      const persistableLayers = stripEphemeralLayerFieldsForSave(latestLayers)
      const pendingContentFingerprint = latestIsLargeWorkflow
        ? largeFingerprint
        : contentFingerprint({
            layers: persistableLayers,
            libtvWorkflow: latestWorkflow,
            libtvCanvases: latestCanvases,
            activeLibTvCanvasId: latestActiveCanvasId,
            projectMaterials: latestMaterials,
          })
      if (lastSavedFingerprintRef.current === pendingContentFingerprint) return
      const latestHasWorkflowContent = latestWorkflow.enabled || latestWorkflow.nodes.length > 0 || latestWorkflow.edges.length > 0
      const latestHasPersistableContent = persistableLayers.length > 0 || latestHasWorkflowContent || latestMaterials.length > 0
      let thumbnail = null
      if (stageRef.current) {
        try {
          if (hasPotentiallyTaintedImage(stageRef.current)) {
            thumbnail = null
          } else {
            // 0.2 is too blurry for project cards; keep a balanced ratio for clarity/size.
            thumbnail = stageRef.current.toDataURL({ pixelRatio: 0.5, mimeType: 'image/jpeg', quality: 0.72 })
          }
        } catch (error) {
          // Ignore tainted-canvas thumbnail errors to avoid noisy console loops.
          thumbnail = null
        }
      }

      try {
        const offloaded = await offloadLargeInlineImagesForSave(persistableLayers)
        if (offloaded.replacedCount > 0) {
          const beforeMb = (offloaded.beforeBytes / (1024 * 1024)).toFixed(2)
          const afterMb = (offloaded.afterBytes / (1024 * 1024)).toFixed(2)
          console.log(
            `[Canvas] Offloaded ${offloaded.replacedCount}/${offloaded.candidateCount} inline images before save (${beforeMb}MB -> ${afterMb}MB)`
          )
        }

        const content = buildCanvasProjectContentDocument({
          layers: offloaded.content as Array<any>,
          libtvWorkflow: latestWorkflow,
          libtvCanvases: latestCanvases,
          activeLibTvCanvasId: latestActiveCanvasId,
          projectMaterials: latestMaterials,
        })

        if (!latestProjectId || isCanvasAutosaveSuppressed(latestProjectId)) return
        const res = await fetch(`/api/projects/${latestProjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            thumbnail: latestHasPersistableContent ? thumbnail : null,
            responseView: 'lite',
          }),

          credentials: "include"
        })
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          // Avoid a noisy console/network loop when the project is unavailable,
          // including the expected delete-versus-autosave race.
          autosaveDisabledRef.current = true
          if (res.status !== 404) console.warn('[Canvas] Auto-save disabled due to auth/permission error', res.status)
        } else if (res.ok && latestProjectIdRef.current === latestProjectId) {
          lastSavedFingerprintRef.current = pendingContentFingerprint
        }
      } catch (error) {
        console.error('Auto-save failed:', error)
      }
    }
    const runAutosave = async () => {
      if (autosaveInFlightRef.current) {
        autosavePendingRef.current = true
        return
      }
      const request = (async () => {
        do {
          autosavePendingRef.current = false
          await saveLatestSnapshot()
        } while (autosavePendingRef.current)
      })()
      autosaveInFlightRef.current = request
      try {
        await request
      } finally {
        if (autosaveInFlightRef.current === request) autosaveInFlightRef.current = null
      }
    }
    const timer = setTimeout(() => {
      if (largeWorkflow && typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(() => {
          idleHandle = null
          void runAutosave()
        }, { timeout: 2_000 })
        return
      }
      void runAutosave()
    }, autosaveDelay)

    return () => {
      clearTimeout(timer)
      if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle)
      }
    }
  }, [activeLibTvCanvasId, autosaveReady, layers, libtvCanvases, libtvWorkflow, persistInitialState, projectId, projectMaterials, stageRef])

  useEffect(() => {
    const flushProjectSave = () => {
      if (autosaveDisabledRef.current) return
      if (autosaveInFlightRef.current) {
        autosavePendingRef.current = true
        return
      }
      if (!latestAutosaveReadyRef.current) return
      const currentProjectId = latestProjectIdRef.current
      if (isCanvasAutosaveSuppressed(currentProjectId)) return
      const currentLayers = stripEphemeralLayerFieldsForSave(latestLayersRef.current)
      const currentWorkflow = latestWorkflowRef.current
      const currentCanvases = latestCanvasesRef.current
      const currentActiveCanvasId = latestActiveCanvasIdRef.current
      const currentProjectMaterials = latestMaterialsRef.current
      const hasWorkflowContent = currentWorkflow.enabled || currentWorkflow.nodes.length > 0 || currentWorkflow.edges.length > 0
      const hasPersistableContent = currentLayers.length > 0 || hasWorkflowContent || currentProjectMaterials.length > 0
      if (!currentProjectId || (!hasPersistableContent && !hadPersistableContentRef.current)) return

      try {
        const content = buildCanvasProjectContentDocument({
          layers: currentLayers as Array<any>,
          libtvWorkflow: currentWorkflow,
          libtvCanvases: mergeActiveWorkflowIntoCanvases(currentCanvases, currentActiveCanvasId, currentWorkflow),
          activeLibTvCanvasId: currentActiveCanvasId,
          projectMaterials: currentProjectMaterials,
        })

        fetch(`/api/projects/${currentProjectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, thumbnail: null, responseView: 'lite' }),
          keepalive: true,

          credentials: "include"
        }).catch(() => {})
      } catch {
        // Ignore page-exit save failures.
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushProjectSave()
      }
    }

    window.addEventListener('pagehide', flushProjectSave)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flushProjectSave)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (downloadTrigger === 0) return

    const stage = stageRef.current
    if (!stage) return

    const downloadDataUrl = (dataUrl: string, filename: string) => {
      const link = document.createElement('a')
      link.download = filename
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    const downloadSourceFile = (source: string, filename: string) => {
      const downloadUrl = resolveImageDownloadUrl(source)
      if (!downloadUrl) return
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    const downloadVideoFile = (source: string, filename: string) => {
      const downloadUrl = resolveVideoDownloadUrl(source)
      if (!downloadUrl) return
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      link.target = '_blank'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    try {
      let dataURL: string
      const filename = `philart-export-${Date.now()}.png`

      if (selectedIds.length > 0) {
        const selectedNodes = selectedIds.map((id) => stage.findOne(`#${id}`)).filter(Boolean)
        const selectedLayers = selectedIds
          .map((id) => layers.find((item) => item.id === id))
          .filter((layer): layer is NonNullable<typeof layer> => Boolean(layer))
        const selectedMediaLayers = selectedLayers.filter((layer) => {
          if (layer.type === 'video' || layer.type === 'video_gen_frame') {
            return Boolean(String(layer.src || '').trim())
          }
          if (layer.type === 'image' || layer.type === 'gen_frame') {
            return Boolean(String(layer.src || layer.genResultImage || '').trim())
          }
          return false
        })

        if (selectedIds.length > 1 && selectedMediaLayers.length > 0) {
          selectedMediaLayers.forEach((layer, index) => {
            window.setTimeout(() => {
              if (layer.type === 'video' || layer.type === 'video_gen_frame') {
                const rawSource = String(layer.src || '').trim()
                if (!rawSource) return
                const ext = inferVideoExtensionFromSource(rawSource)
                downloadVideoFile(rawSource, `video-${layer.id}.${ext}`)
                return
              }

              const rawSource = String(layer.vectorSourceUrl || layer.src || layer.genResultImage || '').trim()
              if (!rawSource) return
              const isVectorSvg = layer.subtype === 'vector-svg' || layer.assetMimeType === 'image/svg+xml'
              const ext = isVectorSvg ? 'svg' : inferImageExtensionFromSource(rawSource)
              const filename = isVectorSvg
                ? String(layer.vectorFilename || `image-${layer.id}.svg`)
                : `image-${layer.id}.${ext}`
              downloadSourceFile(rawSource, filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`)
            }, index * 120)
          })
          resetDownload()
          return
        }

        if (selectedNodes.length === 1) {
          const layerId = selectedIds[0]
          const layer = layers.find((item) => item.id === layerId)

          if ((layer?.type === 'video' || layer?.type === 'video_gen_frame') && layer.src) {
            const ext = inferVideoExtensionFromSource(layer.src)
            downloadVideoFile(layer.src, `video-${layer.id}.${ext}`)
            resetDownload()
            return
          }

          if ((layer?.type === 'image' || layer?.type === 'gen_frame')) {
            const rawSource = String(layer.vectorSourceUrl || layer.src || layer.genResultImage || '').trim()
            const isVectorSvg = layer.subtype === 'vector-svg' || layer.assetMimeType === 'image/svg+xml'
            const ext = isVectorSvg ? 'svg' : inferImageExtensionFromSource(rawSource)

            if (!rawSource) {
              resetDownload()
              return
            }

            const filename = isVectorSvg
              ? String(layer.vectorFilename || `image-${layer.id}.svg`)
              : `image-${layer.id}.${ext}`
            downloadSourceFile(rawSource, filename.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`)
            resetDownload()
            return
          }

          dataURL = selectedNodes[0].toDataURL({ pixelRatio: 2 })
        } else {
          dataURL = stage.toDataURL({ pixelRatio: 2 })
        }
      } else {
        dataURL = stage.toDataURL({ pixelRatio: 2 })
      }

      downloadDataUrl(dataURL, filename)
      resetDownload()
    } catch (error) {
      console.error('[Canvas] Download failed:', error)
      resetDownload()
    }
  }, [downloadTrigger, layers, resetDownload, selectedIds, stageRef])
}
