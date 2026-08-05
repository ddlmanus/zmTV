"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react"
import { message } from "@/workflow/ideart/shims/antd"
import { useCanvasStore, type MaterialManagerTab, type ProjectMaterialItem } from "@/workflow/ideart/lib/store/canvas-store"
import { preloadModels } from "@/workflow/ideart/lib/hooks/useModels"
import { fitCanvasMediaDisplaySize } from "@/workflow/ideart/lib/utils/canvas-display-size"
import { getViewportCenterWorld } from "@/workflow/ideart/lib/editor/canvas-camera"
import { parseModelRuntimeId } from "@/workflow/ideart/lib/models/runtime-id"
import { normalizeRenderableImageUrl, toImageProxyUrlWithParams } from "@/workflow/ideart/lib/url/image-proxy-policy"
import {
  WorkflowSelect,
  WorkflowSelectContent,
  WorkflowSelectItem,
  WorkflowSelectTrigger,
  WorkflowSelectValue,
} from "./workflow-select"

type KlingElementOption = {
  element_id: number | string
  element_name: string
  element_description?: string
  owned_by?: string
  tag_list?: Array<string | { id?: string; tag_id?: string; name?: string; tag_name?: string; description?: string }>
  reference_type?: string
  element_type?: string
  element_image_list?: {
    frontal_image?: string
    refer_images?: Array<{ image_url?: string }>
  }
  element_video_list?: {
    refer_videos?: Array<{ video_url?: string }>
  }
  cover_url?: string
  coverUrl?: string
  element_cover_url?: string
  frontal_image?: string
  element_frontal_image?: string
  image_url?: string
}

type KlingVoiceOption = {
  voice_id: string
  voice_name: string
  trial_url?: string
  owned_by?: string
}

type LibTvCharacterAssetItem = {
  id: string
  characterKey: string
  personaKey: string
  name: string
  variantLabel: string
  description: string
  identityPrompt?: string
  facialFeatures?: string
  skinTone?: string
  hairStyle?: string
  outfit?: string
  accessories?: string
  referenceImageUrl?: string
  referenceImageUrls?: string[]
  source?: string
  createdAt: number
  updatedAt: number
}

type LibTvSceneAssetItem = {
  id: string
  sceneKey: string
  name: string
  description: string
  environmentPrompt?: string
  lightingAtmosphere?: string
  timeOfDay?: string
  weather?: string
  architectureStyle?: string
  props?: string
  referenceImageUrl?: string
  referenceImageUrls?: string[]
  source?: string
  createdAt: number
  updatedAt: number
}

type LibTvPropAssetItem = {
  id: string
  propKey: string
  name: string
  type: string
  description: string
  imagePrompt?: string
  eraScope?: string
  referenceImageUrl?: string
  referenceImageUrls?: string[]
  source?: string
  createdAt: number
  updatedAt: number
}

export type MaterialManagerWorkflowAssetPayload = {
  kind: "image" | "video"
  title: string
  url: string
  thumbnailUrl?: string
  width?: number
  height?: number
  duration?: number
  prompt?: string
  content?: string
  referenceImages?: string[]
}

type MaterialManagerPanelProps = {
  mode?: "canvas" | "workflow"
  onInsertWorkflowAsset?: (asset: MaterialManagerWorkflowAssetPayload) => void
}

const MATERIAL_CATEGORIES = ["全部", "人物", "场景", "物品", "风格", "音效", "其他"] as const
const SUBJECT_CATEGORIES = ["全部", "人物", "场景", "道具", "特效", "其它"] as const
const MATERIAL_PANEL_ANCHOR_OFFSET_TOP = 144.75
const ALLOWED_SUBJECT_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"])

function resolveElementReferenceType(element: KlingElementOption): "image_refer" | "video_refer" {
  return String(element.reference_type || element.element_type || "").trim().toLowerCase() === "video_refer"
    ? "video_refer"
    : "image_refer"
}

function getElementReferenceTypeLabel(element: KlingElementOption): string {
  return resolveElementReferenceType(element) === "video_refer" ? "视频主体" : "图片主体"
}

function formatVideoDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ""
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`
}

async function readVideoDuration(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video")
      video.preload = "metadata"
      video.onloadedmetadata = () => resolve(Number(video.duration) || 0)
      video.onerror = () => reject(new Error("无法读取视频时长，请换一个 mp4/mov 文件再试"))
      video.src = objectUrl
    })
    return duration
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function validateSubjectVideoFile(file: File): Promise<{ duration: number; formatLabel: string }> {
  const fileName = String(file.name || "").trim()
  const lowerName = fileName.toLowerCase()
  const mime = String(file.type || "").trim().toLowerCase()
  const isMp4 = mime === "video/mp4" || lowerName.endsWith(".mp4")
  const isMov = mime === "video/quicktime" || lowerName.endsWith(".mov")

  if (!isMp4 && !isMov && !ALLOWED_SUBJECT_VIDEO_MIME_TYPES.has(mime)) {
    throw new Error("视频主体仅支持 mp4 / mov 格式")
  }

  const duration = await readVideoDuration(file)
  if (!Number.isFinite(duration) || duration < 3 || duration > 60) {
    throw new Error("视频主体时长需在 3-60 秒之间")
  }

  return {
    duration,
    formatLabel: isMov ? "MOV" : "MP4",
  }
}

function pickModelsFromResponse(payload: any): any[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.models)) return payload.models
  return []
}

function normalizeOfficialKlingModelId(modelId?: string): string {
  const parsed = parseModelRuntimeId(String(modelId || "").trim())
  return String(parsed.modelId || modelId || "").trim()
}

function resolveElementPreviewUrl(element: KlingElementOption): string {
  const candidates = [
    element.cover_url,
    element.coverUrl,
    element.element_cover_url,
    element.frontal_image,
    element.element_frontal_image,
    element.image_url,
    element.element_image_list?.frontal_image,
    element.element_image_list?.refer_images?.[0]?.image_url,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return ""
}

function resolveElementVideoUrl(element: KlingElementOption): string {
  const candidates = [
    element.element_video_list?.refer_videos?.[0]?.video_url,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return ""
}

function inferWorkflowAssetKindFromUrl(url: string, fallback: "image" | "video" = "image"): "image" | "video" {
  const normalized = String(url || "").trim().toLowerCase().split("?")[0] || ""
  if (/\.(mp4|mov|webm|m4v|avi|mkv)$/.test(normalized)) return "video"
  if (normalized.startsWith("data:video/") || normalized.startsWith("blob:video/")) return "video"
  return fallback
}

function normalizeElementTags(element: KlingElementOption): string[] {
  const out: string[] = []
  const push = (value: unknown) => {
    const text = String(value || "").trim()
    if (text) out.push(text)
  }

  if (Array.isArray(element.tag_list)) {
    for (const item of element.tag_list) {
      if (typeof item === "string") {
        push(item)
        continue
      }
      if (item && typeof item === "object") {
        const tag = item as any
        push(tag.name)
        push(tag.tag_name)
        // Keep ids as fallback keywords (e.g. o_106) in case name is missing.
        push(tag.tag_id)
        push(tag.id)
      }
    }
  }

  push(element.element_type)
  push(element.reference_type)
  push(element.element_name)
  push(element.element_description)
  return out
}

function categorizeElement(element: KlingElementOption): typeof SUBJECT_CATEGORIES[number] {
  const haystack = normalizeElementTags(element).join(" ").toLowerCase()
  if (!haystack) return "其它"
  if (/(人物|角色|人像|portrait|character|person|girl|boy|woman|man)/i.test(haystack)) return "人物"
  if (/(场景|环境|空间|scene|environment|room|street|city|landscape)/i.test(haystack)) return "场景"
  if (/(道具|物品|装备|prop|object|item|product)/i.test(haystack)) return "道具"
  if (/(特效|光效|粒子|fx|effect|vfx)/i.test(haystack)) return "特效"
  return "其它"
}

function categorizeMaterial(item: ProjectMaterialItem): typeof MATERIAL_CATEGORIES[number] {
  const haystack = `${item.category || ""} ${item.name || ""} ${item.src || ""}`.toLowerCase()
  if (!haystack) return "其他"
  if (/(人物|角色|人像|portrait|character|person|girl|boy|woman|man)/i.test(haystack)) return "人物"
  if (/(场景|环境|空间|scene|environment|room|street|city|landscape)/i.test(haystack)) return "场景"
  if (/(物品|道具|商品|product|item|object|prop)/i.test(haystack)) return "物品"
  if (/(风格|style|anime|cinematic|cyberpunk|vintage|minimalist)/i.test(haystack)) return "风格"
  if (/(音效|音频|配乐|audio|sound|music)/i.test(haystack)) return "音效"
  return "其他"
}

function normalizePreviewCandidateUrls(values: unknown[]): string[] {
  const out: string[] = []
  for (const value of values) {
    const normalized = String(normalizeRenderableImageUrl(String(value || "").trim()) || "").trim()
    if (!normalized) continue
    if (!out.includes(normalized)) out.push(normalized)
  }
  return out
}

function isInlinePreviewUrl(url: string): boolean {
  const normalized = String(url || "").trim().toLowerCase()
  return normalized.startsWith("data:") || normalized.startsWith("blob:")
}

function AssetPreviewImage(props: {
  alt: string
  urls: string[]
  emptyLabel: string
  className?: string
}) {
  const candidates = useMemo(() => normalizePreviewCandidateUrls(props.urls), [props.urls])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [candidates])

  const currentUrl = candidates[index] || ""
  const useInlinePreview = isInlinePreviewUrl(currentUrl)
  const preview1x = currentUrl ? (useInlinePreview ? currentUrl : toImageProxyUrlWithParams(currentUrl, { w: 320 })) : ""
  const preview2x = currentUrl && !useInlinePreview ? toImageProxyUrlWithParams(currentUrl, { w: 640 }) : ""
  const previewSet = !useInlinePreview && preview2x && preview2x !== preview1x ? `${preview1x} 1x, ${preview2x} 2x` : undefined

  if (!currentUrl) {
    return (
      <div className={`absolute inset-0 flex items-center justify-center text-sm text-white/35 ${props.className || ""}`}>
        {props.emptyLabel}
      </div>
    )
  }

  return (
    <img
      alt={props.alt}
      className={props.className || "absolute inset-0 size-full object-cover"}
      src={preview1x}
      srcSet={previewSet}
      loading="lazy"
      decoding="async"
      onError={() => {
        setIndex((current) => Math.min(current + 1, candidates.length))
      }}
    />
  )
}

async function uploadFileToUrl(file: File): Promise<string> {
  const formData = new FormData()
  formData.append("file", file)
  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,

    credentials: "include"
  })
  const json = await response.json().catch(() => null)
  const url = typeof json?.url === "string" ? json.url : ""
  if (!response.ok || !url) {
    throw new Error(json?.error || "上传失败")
  }
  return url
}

export function MaterialManagerPanel({ mode = "canvas", onInsertWorkflowAsset }: MaterialManagerPanelProps) {
  const [panelPosition, setPanelPosition] = useState({ left: 77, top: 107.5 })
  const [createDialogPosition, setCreateDialogPosition] = useState({ left: 592, top: 112 })
  const open = useCanvasStore((state) => state.materialManagerOpen)
  const activeTab = useCanvasStore((state) => state.materialManagerTab)
  const createOpen = useCanvasStore((state) => state.materialManagerCreateOpen)
  const seedImage = useCanvasStore((state) => state.materialManagerSeedImage)
  const projectId = useCanvasStore((state) => state.projectId)
  const userMaterials = useCanvasStore((state) => state.userMaterials)
  const closeMaterialManager = useCanvasStore((state) => state.closeMaterialManager)
  const setMaterialManagerTab = useCanvasStore((state) => state.setMaterialManagerTab)
  const setMaterialManagerCreateOpen = useCanvasStore((state) => state.setMaterialManagerCreateOpen)
  const setUserMaterials = useCanvasStore((state) => state.setUserMaterials)
  const removeUserMaterial = useCanvasStore((state) => state.removeUserMaterial)
  const addLayer = useCanvasStore((state) => state.addLayer)
  const selectLayer = useCanvasStore((state) => state.selectLayer)

  const [klingModelId, setKlingModelId] = useState("")
  const [loadingSubjects, setLoadingSubjects] = useState(false)
  const [subjectError, setSubjectError] = useState("")
  const [presetElements, setPresetElements] = useState<KlingElementOption[]>([])
  const [customElements, setCustomElements] = useState<KlingElementOption[]>([])
  const [materialCategory, setMaterialCategory] = useState<typeof MATERIAL_CATEGORIES[number]>("全部")
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [materialError, setMaterialError] = useState("")
  const [loadingCharacterAssets, setLoadingCharacterAssets] = useState(false)
  const [characterAssetError, setCharacterAssetError] = useState("")
  const [characterAssets, setCharacterAssets] = useState<LibTvCharacterAssetItem[]>([])
  const [characterAssetName, setCharacterAssetName] = useState("")
  const [characterAssetDescription, setCharacterAssetDescription] = useState("")
  const [characterAssetImageUrl, setCharacterAssetImageUrl] = useState("")
  const [uploadingCharacterAssetImage, setUploadingCharacterAssetImage] = useState(false)
  const [creatingCharacterAsset, setCreatingCharacterAsset] = useState(false)
  const [loadingSceneAssets, setLoadingSceneAssets] = useState(false)
  const [sceneAssetError, setSceneAssetError] = useState("")
  const [sceneAssets, setSceneAssets] = useState<LibTvSceneAssetItem[]>([])
  const [sceneAssetName, setSceneAssetName] = useState("")
  const [sceneAssetDescription, setSceneAssetDescription] = useState("")
  const [sceneAssetImageUrl, setSceneAssetImageUrl] = useState("")
  const [uploadingSceneAssetImage, setUploadingSceneAssetImage] = useState(false)
  const [creatingSceneAsset, setCreatingSceneAsset] = useState(false)
  const [loadingPropAssets, setLoadingPropAssets] = useState(false)
  const [propAssetError, setPropAssetError] = useState("")
  const [propAssets, setPropAssets] = useState<LibTvPropAssetItem[]>([])
  const [propAssetName, setPropAssetName] = useState("")
  const [propAssetType, setPropAssetType] = useState("道具")
  const [propAssetDescription, setPropAssetDescription] = useState("")
  const [propAssetPrompt, setPropAssetPrompt] = useState("")
  const [propAssetImageUrl, setPropAssetImageUrl] = useState("")
  const [uploadingPropAssetImage, setUploadingPropAssetImage] = useState(false)
  const [creatingPropAsset, setCreatingPropAsset] = useState(false)
  const [subjectCategory, setSubjectCategory] = useState<typeof SUBJECT_CATEGORIES[number]>("全部")
  const [subjectName, setSubjectName] = useState("")
  const [subjectDescription, setSubjectDescription] = useState("")
  const [subjectReferenceType, setSubjectReferenceType] = useState<"image_refer" | "video_refer">("image_refer")
  const [subjectVoiceId, setSubjectVoiceId] = useState("")
  const [subjectVoiceSource, setSubjectVoiceSource] = useState<"preset" | "custom">("preset")
  const [subjectTag, setSubjectTag] = useState("")
  const [frontalImageUrl, setFrontalImageUrl] = useState("")
  const [referImageUrls, setReferImageUrls] = useState<string[]>([])
  const [referVideoUrl, setReferVideoUrl] = useState("")
  const [referVideoDuration, setReferVideoDuration] = useState(0)
  const [referVideoFormat, setReferVideoFormat] = useState("")
  const [creatingSubject, setCreatingSubject] = useState(false)
  const [uploadingFrontal, setUploadingFrontal] = useState(false)
  const [uploadingRefer, setUploadingRefer] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [loadingVoices, setLoadingVoices] = useState(false)
  const [voiceError, setVoiceError] = useState("")
  const [presetVoices, setPresetVoices] = useState<KlingVoiceOption[]>([])
  const [customVoices, setCustomVoices] = useState<KlingVoiceOption[]>([])
  const [showCreateVoice, setShowCreateVoice] = useState(false)
  const [creatingVoice, setCreatingVoice] = useState(false)
  const [voiceName, setVoiceName] = useState("")
  const [voiceUrl, setVoiceUrl] = useState("")
  const [voiceVideoId, setVoiceVideoId] = useState("")
  const [voiceUploadName, setVoiceUploadName] = useState("")
  const [uploadingVoiceAsset, setUploadingVoiceAsset] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  const frontalInputRef = useRef<HTMLInputElement | null>(null)
  const referInputRef = useRef<HTMLInputElement | null>(null)
  const referVideoInputRef = useRef<HTMLInputElement | null>(null)
  const voiceAssetInputRef = useRef<HTMLInputElement | null>(null)
  const characterAssetImageInputRef = useRef<HTMLInputElement | null>(null)
  const sceneAssetImageInputRef = useRef<HTMLInputElement | null>(null)
  const propAssetImageInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open || typeof window === "undefined") return

    const computeAnchoredPositions = () => {
      const trigger = document.querySelector('[data-testid="nav-asset-library-button"]') as HTMLElement | null
      const workflowSidebar = document.querySelector('[data-workflow-sidebar="true"]') as HTMLElement | null
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const workflowPanelWidth = 440
      const panelWidth = Math.min(mode === "workflow" ? workflowPanelWidth : 480, viewportWidth - 32)
      const createWidth = Math.min(520, viewportWidth - 32)
      const estimatedCreateHeight = Math.min(720, viewportHeight - 48)
      const triggerRect = trigger?.getBoundingClientRect()
      const workflowSidebarRect = workflowSidebar?.getBoundingClientRect()
      const nextPanelLeftBase = triggerRect ? triggerRect.right + 12 : 77
      const nextPanelTopBase = mode === "workflow"
        ? (workflowSidebarRect ? workflowSidebarRect.top : triggerRect ? triggerRect.top : 520)
        : ((triggerRect ? triggerRect.top + triggerRect.height / 2 : 252) - MATERIAL_PANEL_ANCHOR_OFFSET_TOP)
      const nextPanelLeft = Math.max(24, Math.min(viewportWidth - panelWidth - 24, nextPanelLeftBase))
      const nextPanelTop = Math.max(88, nextPanelTopBase)

      const nextCreateLeftBase = nextPanelLeft + panelWidth + 20
      const nextCreateLeft = nextCreateLeftBase + createWidth + 24 <= viewportWidth
        ? nextCreateLeftBase
        : Math.max(24, Math.min(viewportWidth - createWidth - 24, nextPanelLeft + 40))
      const nextCreateTop = Math.max(24, Math.min(viewportHeight - estimatedCreateHeight - 24, nextPanelTop + 6))

      return {
        panel: { left: nextPanelLeft, top: nextPanelTop },
        create: { left: nextCreateLeft, top: nextCreateTop },
      }
    }

    const applyAnchoredPositions = () => {
      const next = computeAnchoredPositions()
      setPanelPosition(next.panel)
      setCreateDialogPosition(next.create)
    }

    applyAnchoredPositions()
    window.addEventListener("resize", applyAnchoredPositions)
    return () => {
      window.removeEventListener("resize", applyAnchoredPositions)
    }
  }, [mode, open])

  const resolveKlingModelId = useCallback(async () => {
    const models = pickModelsFromResponse(await preloadModels())
    const candidates = models.filter(
      (item) =>
        String(item?.category || "").toLowerCase() === "video" &&
        item?.parameters?.supportsAssetLibrary === true
    )
    const klingPreferred =
      candidates.find((item) => /kling-2\.6/i.test(String(item?.modelId || item?.id || ""))) ||
      candidates.find((item) => item?.isDefault) ||
      candidates[0]
    return normalizeOfficialKlingModelId(String(klingPreferred?.modelId || klingPreferred?.id || "kling-v3"))
  }, [])

  const loadSubjects = useCallback(async (forcedModelId?: string) => {
    setLoadingSubjects(true)
    setSubjectError("")
    try {
      const modelId = normalizeOfficialKlingModelId(forcedModelId || klingModelId || (await resolveKlingModelId()))
      setKlingModelId(modelId)
      const [presetResp, customResp] = await Promise.all([
        fetch(`/api/kling/custom-elements?type=preset&pageNum=1&pageSize=200`, { credentials: "include" }),
        fetch(`/api/kling/custom-elements?type=custom&pageNum=1&pageSize=200`, { credentials: "include" }),
      ])
      const presetJson = await presetResp.json().catch(() => null)
      const customJson = await customResp.json().catch(() => null)
      if (!presetResp.ok) {
        throw new Error(presetJson?.error || "加载官方主体失败")
      }
      if (!customResp.ok) {
        throw new Error(customJson?.error || "加载我的主体失败")
      }
      setPresetElements(Array.isArray(presetJson?.elements) ? presetJson.elements : [])
      setCustomElements(Array.isArray(customJson?.elements) ? customJson.elements : [])
    } catch (error: any) {
      setSubjectError(String(error?.message || "加载主体失败"))
    } finally {
      setLoadingSubjects(false)
    }
  }, [klingModelId, resolveKlingModelId])

  useEffect(() => {
    if (!open || activeTab !== "subjects") return
    void loadSubjects()
  }, [activeTab, loadSubjects, open])

  const loadVoices = useCallback(async () => {
    setLoadingVoices(true)
    setVoiceError("")
    try {
      const [presetResp, customResp] = await Promise.all([
        fetch(`/api/kling/custom-voices?type=preset&pageNum=1&pageSize=200`, { credentials: "include" }),
        fetch(`/api/kling/custom-voices?type=custom&pageNum=1&pageSize=200`, { credentials: "include" }),
      ])
      const presetJson = await presetResp.json().catch(() => null)
      const customJson = await customResp.json().catch(() => null)
      if (!presetResp.ok) {
        throw new Error(presetJson?.error || "加载官方音色失败")
      }
      if (!customResp.ok) {
        throw new Error(customJson?.error || "加载我的音色失败")
      }
      setPresetVoices(Array.isArray(presetJson?.voices) ? presetJson.voices : [])
      setCustomVoices(Array.isArray(customJson?.voices) ? customJson.voices : [])
    } catch (error: any) {
      setVoiceError(String(error?.message || "加载音色失败"))
    } finally {
      setLoadingVoices(false)
    }
  }, [])

  useEffect(() => {
    if (!open || activeTab !== "subjects" || !createOpen) return
    void loadVoices()
  }, [activeTab, createOpen, loadVoices, open])

  const loadUserMaterials = useCallback(async () => {
    setLoadingMaterials(true)
    setMaterialError("")
    try {
      const response = await fetch("/api/materials", { cache: "no-store" , credentials: "include"})
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "加载素材失败")
      }
      setUserMaterials(Array.isArray(json?.items) ? json.items : [])
    } catch (error: any) {
      setMaterialError(String(error?.message || "加载素材失败"))
    } finally {
      setLoadingMaterials(false)
    }
  }, [setUserMaterials])

  useEffect(() => {
    if (!open || activeTab !== "materials") return
    void loadUserMaterials()
  }, [activeTab, loadUserMaterials, open])

  const loadCharacterAssets = useCallback(async () => {
    const normalizedProjectId = String(projectId || "").trim()
    if (!normalizedProjectId) {
      setCharacterAssets([])
      setCharacterAssetError("当前项目未加载完成")
      return
    }
    setLoadingCharacterAssets(true)
    setCharacterAssetError("")
    try {
      const response = await fetch(`/api/libtv/assets/characters?projectId=${encodeURIComponent(normalizedProjectId)}`, {
        cache: "no-store",

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "加载角色库失败")
      }
      setCharacterAssets(Array.isArray(json?.items) ? json.items : [])
    } catch (error: any) {
      setCharacterAssetError(String(error?.message || "加载角色库失败"))
    } finally {
      setLoadingCharacterAssets(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!open || activeTab !== "character-assets") return
    void loadCharacterAssets()
  }, [activeTab, loadCharacterAssets, open])

  const loadSceneAssets = useCallback(async () => {
    const normalizedProjectId = String(projectId || "").trim()
    if (!normalizedProjectId) {
      setSceneAssets([])
      setSceneAssetError("当前项目未加载完成")
      return
    }
    setLoadingSceneAssets(true)
    setSceneAssetError("")
    try {
      const response = await fetch(`/api/libtv/assets/scenes?projectId=${encodeURIComponent(normalizedProjectId)}`, {
        cache: "no-store",

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "加载场景库失败")
      }
      setSceneAssets(Array.isArray(json?.items) ? json.items : [])
    } catch (error: any) {
      setSceneAssetError(String(error?.message || "加载场景库失败"))
    } finally {
      setLoadingSceneAssets(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!open || activeTab !== "scene-assets") return
    void loadSceneAssets()
  }, [activeTab, loadSceneAssets, open])

  const loadPropAssets = useCallback(async () => {
    const normalizedProjectId = String(projectId || "").trim()
    if (!normalizedProjectId) {
      setPropAssets([])
      setPropAssetError("当前项目未加载完成")
      return
    }
    setLoadingPropAssets(true)
    setPropAssetError("")
    try {
      const response = await fetch(`/api/libtv/assets/props?projectId=${encodeURIComponent(normalizedProjectId)}`, {
        cache: "no-store",

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "加载道具库失败")
      }
      setPropAssets(Array.isArray(json?.items) ? json.items : [])
    } catch (error: any) {
      setPropAssetError(String(error?.message || "加载道具库失败"))
    } finally {
      setLoadingPropAssets(false)
    }
  }, [projectId])

  useEffect(() => {
    if (!open || activeTab !== "prop-assets") return
    void loadPropAssets()
  }, [activeTab, loadPropAssets, open])

  useEffect(() => {
    if (!createOpen) return
    if (seedImage && seedImage !== frontalImageUrl) {
      setFrontalImageUrl(seedImage)
    }
  }, [createOpen, frontalImageUrl, seedImage])

  const visibleSubjects = useMemo(() => {
    const all = [
      ...customElements.map((item) => ({ ...item, __source: "custom" as const })),
      ...presetElements.map((item) => ({ ...item, __source: "preset" as const })),
    ]
    if (subjectCategory === "全部") return all
    return all.filter((item) => categorizeElement(item) === subjectCategory)
  }, [customElements, presetElements, subjectCategory])

  const sortedMaterials = useMemo(
    () => [...userMaterials].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)),
    [userMaterials]
  )

  const visibleMaterials = useMemo(() => {
    if (materialCategory === "全部") return sortedMaterials
    return sortedMaterials.filter((item) => categorizeMaterial(item) === materialCategory)
  }, [materialCategory, sortedMaterials])

  const sortedCharacterAssets = useMemo(
    () => [...characterAssets].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
    [characterAssets]
  )

  const sortedSceneAssets = useMemo(
    () => [...sceneAssets].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
    [sceneAssets]
  )

  const sortedPropAssets = useMemo(
    () => [...propAssets].sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)),
    [propAssets]
  )

  const insertWorkflowAsset = useCallback((asset: MaterialManagerWorkflowAssetPayload) => {
    if (mode !== "workflow") return false
    const normalizedUrl = String(asset.url || "").trim()
    if (!normalizedUrl) {
      message.warning("该资产没有可用素材")
      return true
    }
    onInsertWorkflowAsset?.({
      ...asset,
      url: normalizedUrl,
      kind: asset.kind,
      title: String(asset.title || "").trim() || (asset.kind === "video" ? "视频素材" : "图片素材"),
    })
    return true
  }, [mode, onInsertWorkflowAsset])

  const insertMaterialToCanvas = useCallback((item: ProjectMaterialItem) => {
    const url = String(item.src || item.thumbnailSrc || item.coverSrc || "").trim()
    const handledByWorkflow = insertWorkflowAsset({
      kind: inferWorkflowAssetKindFromUrl(url, "image"),
      title: item.name || "素材",
      url,
      thumbnailUrl: item.thumbnailSrc || item.coverSrc,
      width: Number(item.width) || undefined,
      height: Number(item.height) || undefined,
    })
    if (handledByWorkflow) return

    const { zoom, stagePos, viewportSize } = useCanvasStore.getState()
    const center = getViewportCenterWorld({ zoom, stagePos }, viewportSize)
    const fitted = fitCanvasMediaDisplaySize({
      width: Number(item.width) || 1024,
      height: Number(item.height) || 1024,
    }, {
      minSize: 180,
      maxViewportWidthRatio: 0.5,
      maxViewportHeightRatio: 0.6,
    })
    const nextLayer = addLayer({
      type: "image",
      name: item.name || "素材图片",
      x: center.x - fitted.width / 2,
      y: center.y - fitted.height / 2,
      width: fitted.width,
      height: fitted.height,
      src: item.src,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    })
    if (nextLayer?.id) {
      selectLayer(nextLayer.id)
    }
    message.success("已添加到画布")
  }, [addLayer, insertWorkflowAsset, selectLayer])

  const insertCharacterAssetToWorkflow = useCallback((item: LibTvCharacterAssetItem) => {
    const referenceImages = normalizePreviewCandidateUrls([
      item.referenceImageUrl,
      ...(Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : []),
    ])
    const url = referenceImages[0] || ""
    insertWorkflowAsset({
      kind: "image",
      title: item.name || "角色资产",
      url,
      thumbnailUrl: url,
      prompt: [
        item.identityPrompt,
        item.description,
        item.facialFeatures,
        item.skinTone,
        item.hairStyle,
        item.outfit,
        item.accessories,
      ].map((value) => String(value || "").trim()).filter(Boolean).join("\n"),
      content: item.description || item.identityPrompt || "",
      referenceImages,
    })
  }, [insertWorkflowAsset])

  const insertSceneAssetToWorkflow = useCallback((item: LibTvSceneAssetItem) => {
    const referenceImages = normalizePreviewCandidateUrls([
      item.referenceImageUrl,
      ...(Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : []),
    ])
    const url = referenceImages[0] || ""
    insertWorkflowAsset({
      kind: "image",
      title: item.name || item.sceneKey || "场景资产",
      url,
      thumbnailUrl: url,
      prompt: [
        item.environmentPrompt,
        item.description,
        item.lightingAtmosphere,
        item.timeOfDay,
        item.weather,
        item.architectureStyle,
        item.props,
      ].map((value) => String(value || "").trim()).filter(Boolean).join("\n"),
      content: item.description || item.environmentPrompt || "",
      referenceImages,
    })
  }, [insertWorkflowAsset])

  const insertPropAssetToWorkflow = useCallback((item: LibTvPropAssetItem) => {
    const referenceImages = normalizePreviewCandidateUrls([
      item.referenceImageUrl,
      ...(Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : []),
    ])
    const url = referenceImages[0] || ""
    insertWorkflowAsset({
      kind: "image",
      title: item.name || "道具资产",
      url,
      thumbnailUrl: url,
      prompt: [item.imagePrompt, item.description, item.type, item.eraScope].map((value) => String(value || "").trim()).filter(Boolean).join("\n"),
      content: item.description || item.imagePrompt || "",
      referenceImages,
    })
  }, [insertWorkflowAsset])

  const insertSubjectToWorkflow = useCallback((element: KlingElementOption) => {
    const referenceType = resolveElementReferenceType(element)
    const videoUrl = referenceType === "video_refer" ? resolveElementVideoUrl(element) : ""
    const previewUrl = resolveElementPreviewUrl(element)
    const url = videoUrl || previewUrl
    insertWorkflowAsset({
      kind: videoUrl ? "video" : "image",
      title: element.element_name || (videoUrl ? "视频主体" : "图片主体"),
      url,
      thumbnailUrl: previewUrl,
      prompt: String(element.element_description || "").trim(),
      content: String(element.element_description || "").trim(),
      referenceImages: previewUrl ? [previewUrl] : [],
    })
  }, [insertWorkflowAsset])

  const handleDeleteUserMaterial = useCallback(async (id: string) => {
    const targetId = String(id || "").trim()
    if (!targetId) return
    try {
      const response = await fetch(`/api/materials/${encodeURIComponent(targetId)}`, { method: "DELETE" , credentials: "include"})
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "删除素材失败")
      }
      removeUserMaterial(targetId)
      message.success("素材已删除")
    } catch (error: any) {
      message.error(String(error?.message || "删除素材失败"))
    }
  }, [removeUserMaterial])

  const handleDeleteCharacterAsset = useCallback(async (id: string) => {
    const targetId = String(id || "").trim()
    if (!targetId) return
    try {
      const response = await fetch(`/api/libtv/assets/characters/${encodeURIComponent(targetId)}`, { method: "DELETE" , credentials: "include"})
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "删除角色资产失败")
      }
      setCharacterAssets((prev) => prev.filter((item) => item.id !== targetId))
      message.success("角色资产已删除")
    } catch (error: any) {
      message.error(String(error?.message || "删除角色资产失败"))
    }
  }, [])

  const handleDeleteSceneAsset = useCallback(async (id: string) => {
    const targetId = String(id || "").trim()
    if (!targetId) return
    try {
      const response = await fetch(`/api/libtv/assets/scenes/${encodeURIComponent(targetId)}`, { method: "DELETE" , credentials: "include"})
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "删除场景资产失败")
      }
      setSceneAssets((prev) => prev.filter((item) => item.id !== targetId))
      message.success("场景资产已删除")
    } catch (error: any) {
      message.error(String(error?.message || "删除场景资产失败"))
    }
  }, [])

  const handleDeletePropAsset = useCallback(async (id: string) => {
    const targetId = String(id || "").trim()
    if (!targetId) return
    try {
      const response = await fetch(`/api/libtv/assets/props/${encodeURIComponent(targetId)}`, { method: "DELETE" , credentials: "include"})
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "删除道具资产失败")
      }
      setPropAssets((prev) => prev.filter((item) => item.id !== targetId))
      message.success("道具资产已删除")
    } catch (error: any) {
      message.error(String(error?.message || "删除道具资产失败"))
    }
  }, [])

  const handleUploadFrontal = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploadingFrontal(true)
    try {
      const url = await uploadFileToUrl(file)
      setFrontalImageUrl(url)
    } catch (error: any) {
      message.error(String(error?.message || "上传图片失败"))
    } finally {
      setUploadingFrontal(false)
    }
  }, [])

  const handleUploadRefer = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ""
    if (files.length === 0) return
    setUploadingRefer(true)
    try {
      const existingCount = referImageUrls.length
      const availableFiles = files.slice(0, Math.max(0, 3 - existingCount))
      const urls = await Promise.all(availableFiles.map((file) => uploadFileToUrl(file)))
      setReferImageUrls((prev) => [...prev, ...urls].slice(0, 3))
    } catch (error: any) {
      message.error(String(error?.message || "上传参考图失败"))
    } finally {
      setUploadingRefer(false)
    }
  }, [referImageUrls.length])

  const handleUploadReferVideo = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploadingVideo(true)
    try {
      const metadata = await validateSubjectVideoFile(file)
      const url = await uploadFileToUrl(file)
      setReferVideoUrl(url)
      setReferVideoDuration(metadata.duration)
      setReferVideoFormat(metadata.formatLabel)
    } catch (error: any) {
      message.error(String(error?.message || "上传参考视频失败"))
    } finally {
      setUploadingVideo(false)
    }
  }, [])

  const handleUploadVoiceAsset = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploadingVoiceAsset(true)
    try {
      const url = await uploadFileToUrl(file)
      setVoiceUrl(url)
      setVoiceVideoId("")
      setVoiceUploadName(file.name)
    } catch (error: any) {
      message.error(String(error?.message || "上传音色素材失败"))
    } finally {
      setUploadingVoiceAsset(false)
    }
  }, [])

  const resetCreateForm = useCallback(() => {
    setCharacterAssetName("")
    setCharacterAssetDescription("")
    setCharacterAssetImageUrl("")
    setSceneAssetName("")
    setSceneAssetDescription("")
    setSceneAssetImageUrl("")
    setPropAssetName("")
    setPropAssetType("道具")
    setPropAssetDescription("")
    setPropAssetPrompt("")
    setPropAssetImageUrl("")
    setSubjectName("")
    setSubjectDescription("")
    setSubjectReferenceType("image_refer")
    setSubjectVoiceId("")
    setSubjectVoiceSource("preset")
    setSubjectTag("")
    setFrontalImageUrl("")
    setReferImageUrls([])
    setReferVideoUrl("")
    setReferVideoDuration(0)
    setReferVideoFormat("")
    setShowCreateVoice(false)
    setShowAdvancedSettings(false)
    setVoiceName("")
    setVoiceUrl("")
    setVoiceVideoId("")
    setVoiceUploadName("")
    setVoiceError("")
  }, [])

  const handleCloseCreateDialog = useCallback(() => {
    setMaterialManagerCreateOpen(false)
    resetCreateForm()
  }, [resetCreateForm, setMaterialManagerCreateOpen])

  const allVoices = useMemo(
    () => [...customVoices, ...presetVoices],
    [customVoices, presetVoices]
  )

  const visibleVoices = useMemo(
    () => (subjectVoiceSource === "custom" ? customVoices : presetVoices),
    [customVoices, presetVoices, subjectVoiceSource]
  )

  const selectedVoice = useMemo(
    () => allVoices.find((item) => String(item.voice_id) === String(subjectVoiceId)) || null,
    [allVoices, subjectVoiceId]
  )

  const pollCreatedVoice = useCallback(async (taskId: string) => {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      const res = await fetch(`/api/kling/custom-voices?taskId=${encodeURIComponent(taskId)}`, { credentials: "include" })
      const json = await res.json().catch(() => null)
      const status = String(json?.task?.task_status || "").trim().toLowerCase()
      if (status === "succeed") {
        const voices = Array.isArray(json?.voices) ? json.voices : []
        const createdVoiceId = String(voices[0]?.voice_id || "").trim()
        if (createdVoiceId) {
          setSubjectVoiceId(createdVoiceId)
          setSubjectVoiceSource("custom")
        }
        await loadVoices()
        return
      }
      if (status === "failed") {
        throw new Error(json?.task?.task_status_msg || "创建音色失败")
      }
    }
    throw new Error("音色创建超时，请稍后刷新列表查看")
  }, [loadVoices])

  const handleCreateVoice = useCallback(async () => {
    const name = voiceName.trim()
    const voiceUrlValue = voiceUrl.trim()
    const videoIdValue = voiceVideoId.trim()
    if (!name) {
      message.warning("请输入音色名称")
      return
    }
    if (!voiceUrlValue && !videoIdValue) {
      message.warning("请上传音频/视频，或填写历史作品ID")
      return
    }
    setCreatingVoice(true)
    try {
      const response = await fetch(`/api/kling/custom-voices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voice_name: name,
          voice_url: voiceUrlValue || undefined,
          video_id: videoIdValue || undefined,
        }),

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "创建音色失败")
      }
      const taskId = String(json?.task?.task_id || "").trim()
      if (taskId) {
        await pollCreatedVoice(taskId)
      } else {
        await loadVoices()
      }
      setShowCreateVoice(false)
      setVoiceName("")
      setVoiceUrl("")
      setVoiceVideoId("")
      setVoiceUploadName("")
      message.success("音色已创建")
    } catch (error: any) {
      message.error(String(error?.message || "创建音色失败"))
    } finally {
      setCreatingVoice(false)
    }
  }, [loadVoices, pollCreatedVoice, voiceName, voiceUrl, voiceVideoId])

  const handleCreateSubject = useCallback(async () => {
    const name = subjectName.trim()
    const description = subjectDescription.trim()
    if (!name) {
      message.warning("请输入主体名称")
      return
    }
    if (!description) {
      message.warning("请输入主体描述")
      return
    }
    if (subjectReferenceType === "image_refer") {
      if (!frontalImageUrl) {
        message.warning("请先上传角色正脸图")
        return
      }
      if (referImageUrls.length === 0) {
        message.warning("请至少上传 1 张参考图")
        return
      }
    }
    if (subjectReferenceType === "video_refer" && !referVideoUrl) {
      message.warning("请先上传参考视频")
      return
    }

    setCreatingSubject(true)
    try {
      const modelId = normalizeOfficialKlingModelId(klingModelId || (await resolveKlingModelId()))
      setKlingModelId(modelId)
      const response = await fetch(`/api/kling/custom-elements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          element_name: name,
          element_description: description,
          reference_type: subjectReferenceType,
          element_frontal_image: subjectReferenceType === "image_refer" ? frontalImageUrl : undefined,
          element_refer_list: subjectReferenceType === "image_refer" ? referImageUrls : undefined,
          element_video_list: subjectReferenceType === "video_refer"
            ? { refer_videos: [{ video_url: referVideoUrl }] }
            : undefined,
          tag_list: subjectTag ? [subjectTag] : undefined,
          element_voice_id: subjectVoiceId || undefined,
        }),

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "创建主体失败")
      }
      message.success("主体已创建")
      handleCloseCreateDialog()
      void loadSubjects(modelId)
    } catch (error: any) {
      message.error(String(error?.message || "创建主体失败"))
    } finally {
      setCreatingSubject(false)
    }
  }, [
    frontalImageUrl,
    handleCloseCreateDialog,
    klingModelId,
    loadSubjects,
    referVideoUrl,
    referImageUrls,
    resolveKlingModelId,
    subjectDescription,
    subjectName,
    subjectReferenceType,
    subjectTag,
    subjectVoiceId,
  ])

  const handleUploadCharacterAssetImage = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploadingCharacterAssetImage(true)
    try {
      const url = await uploadFileToUrl(file)
      setCharacterAssetImageUrl(url)
    } catch (error: any) {
      message.error(String(error?.message || "上传角色图失败"))
    } finally {
      setUploadingCharacterAssetImage(false)
    }
  }, [])

  const handleCreateCharacterAsset = useCallback(async () => {
    const normalizedProjectId = String(projectId || "").trim()
    const name = characterAssetName.trim()
    const description = characterAssetDescription.trim()
    const imageUrl = characterAssetImageUrl.trim()

    if (!normalizedProjectId) {
      message.warning("当前项目未加载完成")
      return
    }
    if (!name) {
      message.warning("请输入角色名称")
      return
    }
    if (!description) {
      message.warning("请输入角色描述")
      return
    }
    if (!imageUrl) {
      message.warning("请先上传角色图")
      return
    }

    setCreatingCharacterAsset(true)
    try {
      const response = await fetch("/api/libtv/assets/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: normalizedProjectId,
          asset: {
            name,
            description,
            identityPrompt: `角色名：${name}；稳定外观：${description}`,
            referenceImageUrl: imageUrl,
            referenceImageUrls: [imageUrl],
            source: "user-upload",
          },
        }),

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "创建角色资产失败")
      }
      const nextItem = json?.item
      if (nextItem) {
        setCharacterAssets((prev) => {
          const next = [nextItem, ...prev.filter((item) => item.id !== nextItem.id)]
          return next
        })
      } else {
        await loadCharacterAssets()
      }
      message.success("角色已加入角色库")
      handleCloseCreateDialog()
    } catch (error: any) {
      message.error(String(error?.message || "创建角色资产失败"))
    } finally {
      setCreatingCharacterAsset(false)
    }
  }, [
    characterAssetDescription,
    characterAssetImageUrl,
    characterAssetName,
    handleCloseCreateDialog,
    loadCharacterAssets,
    projectId,
  ])

  const handleUploadSceneAssetImage = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploadingSceneAssetImage(true)
    try {
      const url = await uploadFileToUrl(file)
      setSceneAssetImageUrl(url)
    } catch (error: any) {
      message.error(String(error?.message || "上传场景图失败"))
    } finally {
      setUploadingSceneAssetImage(false)
    }
  }, [])

  const handleUploadPropAssetImage = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setUploadingPropAssetImage(true)
    try {
      const url = await uploadFileToUrl(file)
      setPropAssetImageUrl(url)
    } catch (error: any) {
      message.error(String(error?.message || "上传道具图失败"))
    } finally {
      setUploadingPropAssetImage(false)
    }
  }, [])

  const handleCreateSceneAsset = useCallback(async () => {
    const normalizedProjectId = String(projectId || "").trim()
    const name = sceneAssetName.trim()
    const description = sceneAssetDescription.trim()
    const imageUrl = sceneAssetImageUrl.trim()

    if (!normalizedProjectId) {
      message.warning("当前项目未加载完成")
      return
    }
    if (!name) {
      message.warning("请输入场景名称")
      return
    }
    if (!description) {
      message.warning("请输入场景描述")
      return
    }
    if (!imageUrl) {
      message.warning("请先上传场景图")
      return
    }

    setCreatingSceneAsset(true)
    try {
      const response = await fetch("/api/libtv/assets/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: normalizedProjectId,
          asset: {
            name,
            sceneKey: name,
            description,
            environmentPrompt: description,
            referenceImageUrl: imageUrl,
            referenceImageUrls: [imageUrl],
            source: "user-upload",
          },
        }),

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "创建场景资产失败")
      }
      const nextItem = json?.item
      if (nextItem) {
        setSceneAssets((prev) => {
          const next = [nextItem, ...prev.filter((item) => item.id !== nextItem.id)]
          return next
        })
      } else {
        await loadSceneAssets()
      }
      message.success("场景已加入场景库")
      handleCloseCreateDialog()
    } catch (error: any) {
      message.error(String(error?.message || "创建场景资产失败"))
    } finally {
      setCreatingSceneAsset(false)
    }
  }, [
    handleCloseCreateDialog,
    loadSceneAssets,
    projectId,
    sceneAssetDescription,
    sceneAssetImageUrl,
    sceneAssetName,
  ])

  const handleCreatePropAsset = useCallback(async () => {
    const normalizedProjectId = String(projectId || "").trim()
    const name = propAssetName.trim()
    const type = propAssetType.trim() || "道具"
    const description = propAssetDescription.trim()
    const imagePrompt = propAssetPrompt.trim()
    const imageUrl = propAssetImageUrl.trim()

    if (!normalizedProjectId) {
      message.warning("当前项目未加载完成")
      return
    }
    if (!name) {
      message.warning("请输入道具名称")
      return
    }
    if (!description) {
      message.warning("请输入道具描述")
      return
    }
    if (!imagePrompt) {
      message.warning("请输入道具英文提示词")
      return
    }
    if (!imageUrl) {
      message.warning("请先上传道具图")
      return
    }

    setCreatingPropAsset(true)
    try {
      const response = await fetch("/api/libtv/assets/props", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: normalizedProjectId,
          asset: {
            name,
            type,
            description,
            imagePrompt,
            referenceImageUrl: imageUrl,
            referenceImageUrls: [imageUrl],
            source: "user-upload",
          },
        }),

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || !json?.success) {
        throw new Error(json?.error || "创建道具资产失败")
      }
      const nextItem = json?.item
      if (nextItem) {
        setPropAssets((prev) => [nextItem, ...prev.filter((item) => item.id !== nextItem.id)])
      } else {
        await loadPropAssets()
      }
      message.success("道具已加入道具库")
      handleCloseCreateDialog()
    } catch (error: any) {
      message.error(String(error?.message || "创建道具资产失败"))
    } finally {
      setCreatingPropAsset(false)
    }
  }, [
    handleCloseCreateDialog,
    loadPropAssets,
    projectId,
    propAssetDescription,
    propAssetImageUrl,
    propAssetName,
    propAssetPrompt,
    propAssetType,
  ])

  const handleDeleteCustomSubject = useCallback(async (elementId: number | string) => {
    if (!klingModelId) return
    try {
      const modelId = normalizeOfficialKlingModelId(klingModelId)
      const response = await fetch(`/api/kling/custom-elements`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ element_id: elementId }),

        credentials: "include"
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(json?.error || "删除主体失败")
      }
      message.success("主体已删除")
      void loadSubjects(modelId)
    } catch (error: any) {
      message.error(String(error?.message || "删除主体失败"))
    }
  }, [klingModelId, loadSubjects])

  const switchTab = useCallback((tab: MaterialManagerTab) => {
    setMaterialManagerTab(tab)
  }, [setMaterialManagerTab])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <>
      <div className="pointer-events-none fixed inset-0 z-[2147483200]">
        <div className="pointer-events-auto absolute inset-0 bg-black/28" onClick={closeMaterialManager} />
        <div
          data-hit-region="material-manager-panel"
          className="pointer-events-auto flex max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl"
          style={{
            position: "fixed",
            left: panelPosition.left,
            top: panelPosition.top,
            width: mode === "workflow" ? "440px" : "480px",
            backgroundColor: "rgba(20,20,20,0.98)",
            border: "0.5px solid rgba(255,255,255,0.12)",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
            boxShadow: "0px 20px 56px rgba(0, 0, 0, 0.48)",
            height: mode === "workflow" ? "min(50vh, 460px)" : activeTab === "materials" ? "289.5px" : "min(72vh, 680px)",
            zIndex: 2147483201,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between px-4 pt-3">
            <div className="flex items-center gap-3 text-sm">
              <button
                type="button"
                className={`cursor-pointer border-none bg-transparent text-sm transition-colors ${activeTab === "materials" ? "font-medium text-white" : "text-white/40 hover:text-white/60"}`}
                onClick={() => switchTab("materials")}
              >
                我的素材
              </button>
              <button
                type="button"
                className={`cursor-pointer border-none bg-transparent text-sm transition-colors ${activeTab === "character-assets" ? "font-medium text-white" : "text-white/40 hover:text-white/60"}`}
                onClick={() => switchTab("character-assets")}
              >
                角色库
              </button>
              <button
                type="button"
                className={`cursor-pointer border-none bg-transparent text-sm transition-colors ${activeTab === "scene-assets" ? "font-medium text-white" : "text-white/40 hover:text-white/60"}`}
                onClick={() => switchTab("scene-assets")}
              >
                场景库
              </button>
              <button
                type="button"
                className={`cursor-pointer border-none bg-transparent text-sm transition-colors ${activeTab === "prop-assets" ? "font-medium text-white" : "text-white/40 hover:text-white/60"}`}
                onClick={() => switchTab("prop-assets")}
              >
                道具库
              </button>
              <button
                type="button"
                className={`cursor-pointer border-none bg-transparent text-sm transition-colors ${activeTab === "subjects" ? "font-medium text-white" : "text-white/40 hover:text-white/60"}`}
                onClick={() => switchTab("subjects")}
              >
                我的主体库
              </button>
            </div>
            <button
              type="button"
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              onClick={closeMaterialManager}
              aria-label="关闭资产库"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mx-0 mt-3 h-px shrink-0" style={{ backgroundColor: "var(--canvas-controls-border)" }} />

          {activeTab === "materials" ? (
            <>
              <div className="flex shrink-0 gap-3 overflow-x-auto px-4 pb-3 pt-3">
                {MATERIAL_CATEGORIES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none px-3 text-[13px] transition-colors ${materialCategory === item ? "bg-white/10 text-white/80" : "bg-transparent text-white/50 hover:text-white/70"}`}
                    onClick={() => setMaterialCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="relative min-h-0 flex-1">
                <div className="tiny-scrollbar absolute inset-0 overflow-y-auto px-4 pb-3" style={{ visibility: "visible" }}>
                  {materialError ? (
                    <div className="mb-3 rounded-lg border border-[#cf3336]/30 bg-[#cf3336]/10 px-3 py-2 text-xs text-[#ffb7b9]">
                      {materialError}
                    </div>
                  ) : null}
                  {loadingMaterials ? (
                    <div className="flex h-40 items-center justify-center text-sm text-white/50">素材加载中...</div>
                  ) : visibleMaterials.length === 0 ? (
                    <div className="flex h-40 items-center justify-center text-sm text-white/50">暂无素材</div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {visibleMaterials.map((item) => (
                        <div key={item.id} className="group flex min-w-0 flex-col gap-1">
                          <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                            <button
                              type="button"
                              className="absolute inset-0 w-full text-left"
                              onClick={() => insertMaterialToCanvas(item)}
                              title="点击添加到画布"
                            >
                              {(() => {
                                const raw = item.thumbnailSrc || item.src
                                const src1x = toImageProxyUrlWithParams(raw, { w: 256 })
                                const src2x = toImageProxyUrlWithParams(raw, { w: 512 })
                                const srcSet = src2x && src2x !== src1x ? `${src1x} 1x, ${src2x} 2x` : undefined
                                return (
                                  <img
                                    alt={item.name}
                                    className="absolute inset-0 size-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-105"
                                    src={src1x}
                                    srcSet={srcSet}
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority="low"
                                  />
                                )
                              })()}
                              <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors duration-150 group-hover:bg-black/35" />
                            </button>
                            <button
                              type="button"
                              className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md border-none bg-black/45 text-white/70 opacity-0 transition-all duration-150 hover:bg-black/70 hover:text-white group-hover:opacity-100"
                              onClick={() => void handleDeleteUserMaterial(item.id)}
                              aria-label={`删除素材 ${item.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="truncate px-1 text-xs text-white/50">{item.name}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : activeTab === "character-assets" ? (
            <div className="relative min-h-0 flex-1">
              <div className="tiny-scrollbar absolute inset-0 overflow-y-auto px-4 py-3">
                {characterAssetError ? (
                  <div className="mb-3 rounded-lg border border-[#cf3336]/30 bg-[#cf3336]/10 px-3 py-2 text-xs text-[#ffb7b9]">
                    {characterAssetError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="group flex w-[calc((100%-24px)/3)] cursor-pointer flex-col gap-1"
                    onClick={() => setMaterialManagerCreateOpen(true, null, "character-assets")}
                  >
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg border-[0.5px] border-[#525252] bg-[#1F1F1F]/90 transition-colors hover:bg-[#1F1F1F]">
                      <div className="flex flex-col items-center gap-2">
                        <Plus className="mb-2 h-[13px] w-[13px] text-[#f7f7f7]" />
                        <span className="text-xs text-[#f7f7f7]">新增角色</span>
                      </div>
                    </div>
                    <p className="w-full truncate px-1 text-xs text-white/50">&nbsp;</p>
                  </button>

                  {loadingCharacterAssets ? (
                    <div className="w-full py-16 text-center text-sm text-white/50">角色库加载中...</div>
                  ) : sortedCharacterAssets.length === 0 ? (
                    <div className="w-full py-16 text-center text-sm text-white/50">
                      当前项目还没有角色资产
                    </div>
                  ) : (
                    sortedCharacterAssets.map((item) => {
                      const previewUrls = normalizePreviewCandidateUrls([
                        item.referenceImageUrl,
                        ...(Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : []),
                      ])
                      return (
                        <div key={item.id} className="group flex w-[calc((100%-24px)/3)] flex-col gap-1">
                          <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                            <button
                              type="button"
                              className="absolute inset-0 w-full text-left"
                              onClick={() => insertCharacterAssetToWorkflow(item)}
                              title="点击添加到工作流画布"
                            >
                              <AssetPreviewImage
                                alt={item.name}
                                urls={previewUrls}
                                emptyLabel={String(item.name || "角").slice(0, 1)}
                                className="absolute inset-0 size-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors duration-150 group-hover:bg-black/45" />
                            </button>
                            <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
                              <div className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/80">
                                {item.variantLabel || "标准形象"}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="absolute right-1.5 top-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md border-none bg-black/50 text-white/70 opacity-0 transition-colors hover:bg-black/70 hover:text-white group-hover:opacity-100"
                              onClick={() => void handleDeleteCharacterAsset(item.id)}
                              aria-label={`删除角色资产 ${item.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="truncate px-1 text-xs text-white/50" title={item.name}>
                            {item.name}
                          </p>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === "scene-assets" ? (
            <div className="relative min-h-0 flex-1">
              <div className="tiny-scrollbar absolute inset-0 overflow-y-auto px-4 py-3">
                {sceneAssetError ? (
                  <div className="mb-3 rounded-lg border border-[#cf3336]/30 bg-[#cf3336]/10 px-3 py-2 text-xs text-[#ffb7b9]">
                    {sceneAssetError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="group flex w-[calc((100%-24px)/3)] cursor-pointer flex-col gap-1"
                    onClick={() => setMaterialManagerCreateOpen(true, null, "scene-assets")}
                  >
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg border-[0.5px] border-[#525252] bg-[#1F1F1F]/90 transition-colors hover:bg-[#1F1F1F]">
                      <div className="flex flex-col items-center gap-2">
                        <Plus className="mb-2 h-[13px] w-[13px] text-[#f7f7f7]" />
                        <span className="text-xs text-[#f7f7f7]">新增场景</span>
                      </div>
                    </div>
                    <p className="w-full truncate px-1 text-xs text-white/50">&nbsp;</p>
                  </button>

                  {loadingSceneAssets ? (
                    <div className="w-full py-16 text-center text-sm text-white/50">场景库加载中...</div>
                  ) : sortedSceneAssets.length === 0 ? (
                    <div className="w-full py-16 text-center text-sm text-white/50">当前项目还没有场景资产</div>
                  ) : (
                    sortedSceneAssets.map((item) => {
                      const previewUrls = normalizePreviewCandidateUrls([
                        item.referenceImageUrl,
                        ...(Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : []),
                      ])
                      return (
                        <div key={item.id} className="group flex w-[calc((100%-24px)/3)] flex-col gap-1">
                          <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                            <button
                              type="button"
                              className="absolute inset-0 w-full text-left"
                              onClick={() => insertSceneAssetToWorkflow(item)}
                              title="点击添加到工作流画布"
                            >
                              <AssetPreviewImage
                                alt={item.name || item.sceneKey}
                                urls={previewUrls}
                                emptyLabel={String(item.name || item.sceneKey || "景").slice(0, 1)}
                                className="absolute inset-0 size-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors duration-150 group-hover:bg-black/45" />
                            </button>
                            <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
                              <div className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/80">
                                场景
                              </div>
                            </div>
                            <button
                              type="button"
                              className="absolute right-1.5 top-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md border-none bg-black/50 text-white/70 opacity-0 transition-colors hover:bg-black/70 hover:text-white group-hover:opacity-100"
                              onClick={() => void handleDeleteSceneAsset(item.id)}
                              aria-label={`删除场景资产 ${item.name || item.sceneKey}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="truncate px-1 text-xs text-white/50" title={item.name || item.sceneKey}>
                            {item.name || item.sceneKey}
                          </p>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === "prop-assets" ? (
            <div className="relative min-h-0 flex-1">
              <div className="tiny-scrollbar absolute inset-0 overflow-y-auto px-4 py-3">
                {propAssetError ? (
                  <div className="mb-3 rounded-lg border border-[#cf3336]/30 bg-[#cf3336]/10 px-3 py-2 text-xs text-[#ffb7b9]">
                    {propAssetError}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="group flex w-[calc((100%-24px)/3)] cursor-pointer flex-col gap-1"
                    onClick={() => setMaterialManagerCreateOpen(true, null, "prop-assets")}
                  >
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg border-[0.5px] border-[#525252] bg-[#1F1F1F]/90 transition-colors hover:bg-[#1F1F1F]">
                      <div className="flex flex-col items-center gap-2">
                        <Plus className="mb-2 h-[13px] w-[13px] text-[#f7f7f7]" />
                        <span className="text-xs text-[#f7f7f7]">新增道具</span>
                      </div>
                    </div>
                    <p className="w-full truncate px-1 text-xs text-white/50">&nbsp;</p>
                  </button>

                  {loadingPropAssets ? (
                    <div className="w-full py-16 text-center text-sm text-white/50">道具库加载中...</div>
                  ) : sortedPropAssets.length === 0 ? (
                    <div className="w-full py-16 text-center text-sm text-white/50">当前项目还没有道具资产</div>
                  ) : (
                    sortedPropAssets.map((item) => {
                      const previewUrls = normalizePreviewCandidateUrls([
                        item.referenceImageUrl,
                        ...(Array.isArray(item.referenceImageUrls) ? item.referenceImageUrls : []),
                      ])
                      return (
                        <div key={item.id} className="group flex w-[calc((100%-24px)/3)] flex-col gap-1">
                          <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                            <button
                              type="button"
                              className="absolute inset-0 w-full text-left"
                              onClick={() => insertPropAssetToWorkflow(item)}
                              title="点击添加到工作流画布"
                            >
                              <AssetPreviewImage
                                alt={item.name}
                                urls={previewUrls}
                                emptyLabel={String(item.name || "道").slice(0, 1)}
                                className="absolute inset-0 size-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors duration-150 group-hover:bg-black/45" />
                            </button>
                            <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
                              <div className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/80">
                                {item.type || "道具"}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="absolute right-1.5 top-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md border-none bg-black/50 text-white/70 opacity-0 transition-colors hover:bg-black/70 hover:text-white group-hover:opacity-100"
                              onClick={() => void handleDeletePropAsset(item.id)}
                              aria-label={`删除道具资产 ${item.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="truncate px-1 text-xs text-white/50" title={item.name}>
                            {item.name}
                          </p>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 flex min-h-0 flex-col">
                <div className="flex shrink-0 gap-3 overflow-x-auto px-4 pt-3">
                  {SUBJECT_CATEGORIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none px-3 text-[13px] transition-colors ${subjectCategory === item ? "bg-white/10 text-white/80" : "bg-transparent text-white/50 hover:text-white/70"}`}
                      onClick={() => setSubjectCategory(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="tiny-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {subjectError ? (
                    <div className="mb-3 rounded-lg border border-[#cf3336]/30 bg-[#cf3336]/10 px-3 py-2 text-xs text-[#ffb7b9]">
                      {subjectError}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="group flex w-[calc((100%-24px)/3)] cursor-pointer flex-col gap-1"
                      onClick={() => setMaterialManagerCreateOpen(true, null, "subjects")}
                    >
                      <div className="flex aspect-square w-full items-center justify-center rounded-lg border-[0.5px] border-[#525252] bg-[#1F1F1F]/90 transition-colors hover:bg-[#1F1F1F]">
                        <div className="flex flex-col items-center gap-2">
                          <Plus className="mb-2 h-[13px] w-[13px] text-[#f7f7f7]" />
                          <span className="text-xs text-[#f7f7f7]">创建主体</span>
                        </div>
                      </div>
                      <p className="w-full truncate px-1 text-xs text-white/50">&nbsp;</p>
                    </button>

                    {loadingSubjects ? (
                      <div className="w-full py-16 text-center text-sm text-white/50">主体加载中...</div>
                    ) : visibleSubjects.length === 0 ? (
                      <div className="w-full py-16 text-center text-sm text-white/50">暂无主体</div>
                    ) : (
                      visibleSubjects.map((element) => {
                        const previewUrl = resolveElementPreviewUrl(element)
                        const thumb1x = previewUrl ? toImageProxyUrlWithParams(previewUrl, { w: 320 }) : ""
                        const thumb2x = previewUrl ? toImageProxyUrlWithParams(previewUrl, { w: 640 }) : ""
                        const thumbSet = thumb2x && thumb2x !== thumb1x ? `${thumb1x} 1x, ${thumb2x} 2x` : undefined
                        const isCustom = element.__source === "custom"
                        const referenceTypeLabel = getElementReferenceTypeLabel(element)
                        return (
                          <div key={`${element.__source}-${element.element_id}`} className="group flex w-[calc((100%-24px)/3)] flex-col gap-1">
                            <div className="relative aspect-square w-full overflow-hidden rounded-lg">
                              <button
                                type="button"
                                className="absolute inset-0 w-full text-left"
                                onClick={() => insertSubjectToWorkflow(element)}
                                title="点击添加到工作流画布"
                              >
                                {previewUrl ? (
                                  <img
                                    alt={element.element_name}
                                    className="absolute inset-0 size-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-105"
                                    src={thumb1x}
                                    srcSet={thumbSet}
                                    loading="lazy"
                                    decoding="async"
                                    fetchPriority="low"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-[#1F1F1F] text-[28px] font-semibold text-white/45">
                                    {String(element.element_name || "主").slice(0, 1)}
                                  </div>
                                )}
                                <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors duration-150 group-hover:bg-black/45" />
                              </button>
                              <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
                                {!isCustom ? (
                                  <div className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/80">
                                    官方
                                  </div>
                                ) : null}
                                <div className="rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/80">
                                  {referenceTypeLabel}
                                </div>
                              </div>
                              {isCustom ? (
                                <button
                                  type="button"
                                  className="absolute right-1.5 top-1.5 flex size-6 cursor-pointer items-center justify-center rounded-md border-none bg-black/50 text-white/70 opacity-0 transition-colors hover:bg-black/70 hover:text-white group-hover:opacity-100"
                                  onClick={() => void handleDeleteCustomSubject(element.element_id)}
                                  aria-label={`删除主体 ${element.element_name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                            <p className="truncate px-1 text-xs text-white/50">{element.element_name}</p>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {createOpen ? (
        <div className="pointer-events-none fixed inset-0 z-[2147483300]">
          <div className="pointer-events-auto absolute inset-0 bg-black/36" onClick={handleCloseCreateDialog} />
          <div
            data-hit-region="material-manager-create-dialog"
            className="pointer-events-auto flex w-[520px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141414] shadow-[0px_4px_12px_rgba(0,0,0,0.25)]"
            style={{
              position: "fixed",
              left: createDialogPosition.left,
              top: createDialogPosition.top,
              maxHeight: "calc(100vh - 48px)",
              zIndex: 2147483301,
              backgroundColor: "rgba(20,20,20,0.99)",
              border: "0.5px solid rgba(255,255,255,0.12)",
              boxShadow: "0px 24px 64px rgba(0,0,0,0.56)",
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 pb-3 pt-3">
              <span className="text-sm font-medium text-[#F7F7F7]">
                {activeTab === "character-assets"
                  ? "新增角色"
                  : activeTab === "scene-assets"
                    ? "新增场景"
                    : activeTab === "prop-assets"
                      ? "新增道具"
                    : "创建主体"}
              </span>
              <button
                type="button"
                className="flex size-6 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-[#F7F7F7]"
                onClick={handleCloseCreateDialog}
                aria-label="关闭创建主体"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="tiny-scrollbar overflow-y-auto px-4 py-3" style={{ maxHeight: "min(76vh, 620px)" }}>
              {activeTab === "character-assets" ? (
                <>
                  <button
                    type="button"
                    className="flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-center transition-colors hover:bg-white/[0.05]"
                    onClick={() => characterAssetImageInputRef.current?.click()}
                  >
                    <Plus className="h-4 w-4 text-[#F7F7F7]" />
                    <span className="text-[13px] text-[#F7F7F7]">{uploadingCharacterAssetImage ? "上传中..." : "上传角色图"}</span>
                    <span className="text-[11px] leading-5 text-white/40">建议上传清晰正脸或标准角色设定图</span>
                  </button>

                  {characterAssetImageUrl ? (
                    <div className="mt-3 flex items-start gap-3">
                      <img
                        alt="角色图"
                        className="h-24 w-24 rounded-lg bg-black object-cover"
                        src={toImageProxyUrlWithParams(characterAssetImageUrl, { w: 320 })}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="truncate text-xs text-white/65">已上传角色图</div>
                        <div className="text-[11px] leading-5 text-white/35">
                          这张图片会直接作为该角色的 canonical 角色基准图，后续分镜优先复用。
                        </div>
                        <button
                          type="button"
                          className="flex h-8 w-fit items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] px-3 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                          onClick={() => setCharacterAssetImageUrl("")}
                        >
                          删除图片
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-sm text-[#A8A8A8]">角色名称 <span className="text-[#cf3336]">*</span></span>
                    <div className="relative w-full">
                      <input
                        placeholder="请输入角色名称"
                        maxLength={30}
                        className="h-8 w-full rounded-lg border border-white/15 bg-transparent px-3 pr-14 text-[13px] text-[#F7F7F7] outline-none placeholder:text-white/30"
                        type="text"
                        value={characterAssetName}
                        onChange={(event) => setCharacterAssetName(event.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">{characterAssetName.length}/30</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-sm text-[#A8A8A8]">角色描述 <span className="text-[#cf3336]">*</span></span>
                    <textarea
                      placeholder="填写角色的稳定识别锚点，例如年龄感、五官、肤色、发型、服饰、配饰、体态和气质"
                      maxLength={300}
                      rows={5}
                      className="w-full resize-none rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs leading-relaxed text-[#F7F7F7] outline-none placeholder:text-white/30"
                      value={characterAssetDescription}
                      onChange={(event) => setCharacterAssetDescription(event.target.value)}
                    />
                    <div className="text-right text-[11px] text-white/30">{characterAssetDescription.length}/300</div>
                  </div>
                </>
              ) : activeTab === "scene-assets" ? (
                <>
                  <button
                    type="button"
                    className="flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-center transition-colors hover:bg-white/[0.05]"
                    onClick={() => sceneAssetImageInputRef.current?.click()}
                  >
                    <Plus className="h-4 w-4 text-[#F7F7F7]" />
                    <span className="text-[13px] text-[#F7F7F7]">{uploadingSceneAssetImage ? "上传中..." : "上传场景图"}</span>
                    <span className="text-[11px] leading-5 text-white/40">建议上传能代表该场景空间与氛围的标准参考图</span>
                  </button>

                  {sceneAssetImageUrl ? (
                    <div className="mt-3 flex items-start gap-3">
                      <img
                        alt="场景图"
                        className="h-24 w-24 rounded-lg bg-black object-cover"
                        src={toImageProxyUrlWithParams(sceneAssetImageUrl, { w: 320 })}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="truncate text-xs text-white/65">已上传场景图</div>
                        <div className="text-[11px] leading-5 text-white/35">
                          这张图片会作为该场景的标准参考图，后续分镜优先复用空间、构图与氛围信息。
                        </div>
                        <button
                          type="button"
                          className="flex h-8 w-fit items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] px-3 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                          onClick={() => setSceneAssetImageUrl("")}
                        >
                          删除图片
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-sm text-[#A8A8A8]">场景名称 <span className="text-[#cf3336]">*</span></span>
                    <div className="relative w-full">
                      <input
                        placeholder="请输入场景名称"
                        maxLength={40}
                        className="h-8 w-full rounded-lg border border-white/15 bg-transparent px-3 pr-14 text-[13px] text-[#F7F7F7] outline-none placeholder:text-white/30"
                        type="text"
                        value={sceneAssetName}
                        onChange={(event) => setSceneAssetName(event.target.value)}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">{sceneAssetName.length}/40</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-sm text-[#A8A8A8]">场景描述 <span className="text-[#cf3336]">*</span></span>
                    <textarea
                      placeholder="填写场景的地点结构、时间段、光线、陈设、建筑语言、天气和氛围等稳定信息"
                      maxLength={400}
                      rows={5}
                      className="w-full resize-none rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs leading-relaxed text-[#F7F7F7] outline-none placeholder:text-white/30"
                      value={sceneAssetDescription}
                      onChange={(event) => setSceneAssetDescription(event.target.value)}
                    />
                    <div className="text-right text-[11px] text-white/30">{sceneAssetDescription.length}/400</div>
                  </div>
                </>
              ) : activeTab === "prop-assets" ? (
                <>
                  <button
                    type="button"
                    className="flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-center transition-colors hover:bg-white/[0.05]"
                    onClick={() => propAssetImageInputRef.current?.click()}
                  >
                    <Plus className="h-4 w-4 text-[#F7F7F7]" />
                    <span className="text-[13px] text-[#F7F7F7]">{uploadingPropAssetImage ? "上传中..." : "上传道具图"}</span>
                    <span className="text-[11px] leading-5 text-white/40">建议上传该道具的标准参考图或资产展示图</span>
                  </button>

                  {propAssetImageUrl ? (
                    <div className="mt-3 flex items-start gap-3">
                      <img
                        alt="道具图"
                        className="h-24 w-24 rounded-lg bg-black object-cover"
                        src={toImageProxyUrlWithParams(propAssetImageUrl, { w: 320 })}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="truncate text-xs text-white/65">已上传道具图</div>
                        <div className="text-[11px] leading-5 text-white/35">
                          这张图片会作为该道具的标准参考图，后续分镜优先复用它的造型和材质。
                        </div>
                        <button
                          type="button"
                          className="flex h-8 w-fit items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] px-3 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                          onClick={() => setPropAssetImageUrl("")}
                        >
                          删除图片
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid grid-cols-[1fr_0.75fr] gap-3">
                    <div className="flex flex-col gap-2">
                      <span className="text-sm text-[#A8A8A8]">道具名称 <span className="text-[#cf3336]">*</span></span>
                      <div className="relative w-full">
                        <input
                          placeholder="请输入道具名称"
                          maxLength={40}
                          className="h-8 w-full rounded-lg border border-white/15 bg-transparent px-3 pr-14 text-[13px] text-[#F7F7F7] outline-none placeholder:text-white/30"
                          type="text"
                          value={propAssetName}
                          onChange={(event) => setPropAssetName(event.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">{propAssetName.length}/40</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-sm text-[#A8A8A8]">道具类型 <span className="text-[#cf3336]">*</span></span>
                      <WorkflowSelect
                        value={propAssetType}
                        onValueChange={setPropAssetType}
                      >
                        <WorkflowSelectTrigger className="w-full" aria-label="道具类型">
                          <WorkflowSelectValue />
                        </WorkflowSelectTrigger>
                        <WorkflowSelectContent>
                          <WorkflowSelectItem value="道具">道具</WorkflowSelectItem>
                          <WorkflowSelectItem value="日常">日常</WorkflowSelectItem>
                          <WorkflowSelectItem value="武器">武器</WorkflowSelectItem>
                          <WorkflowSelectItem value="交通">交通</WorkflowSelectItem>
                          <WorkflowSelectItem value="装饰">装饰</WorkflowSelectItem>
                          <WorkflowSelectItem value="法器">法器</WorkflowSelectItem>
                        </WorkflowSelectContent>
                      </WorkflowSelect>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-sm text-[#A8A8A8]">道具描述 <span className="text-[#cf3336]">*</span></span>
                    <textarea
                      placeholder="填写道具的外观、材质、结构特征和叙事用途"
                      maxLength={300}
                      rows={4}
                      className="w-full resize-none rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs leading-relaxed text-[#F7F7F7] outline-none placeholder:text-white/30"
                      value={propAssetDescription}
                      onChange={(event) => setPropAssetDescription(event.target.value)}
                    />
                    <div className="text-right text-[11px] text-white/30">{propAssetDescription.length}/300</div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-sm text-[#A8A8A8]">英文提示词 <span className="text-[#cf3336]">*</span></span>
                    <textarea
                      placeholder="English prompt for AI image generation"
                      maxLength={400}
                      rows={4}
                      className="w-full resize-none rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs leading-relaxed text-[#F7F7F7] outline-none placeholder:text-white/30"
                      value={propAssetPrompt}
                      onChange={(event) => setPropAssetPrompt(event.target.value)}
                    />
                    <div className="text-right text-[11px] text-white/30">{propAssetPrompt.length}/400</div>
                  </div>
                </>
              ) : (
                <>
              <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    className={`flex h-9 items-center justify-center rounded-[10px] text-[13px] transition-colors ${subjectReferenceType === "image_refer" ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"}`}
                    onClick={() => setSubjectReferenceType("image_refer")}
                  >
                    图片主体
                  </button>
                  <button
                    type="button"
                    className={`flex h-9 items-center justify-center rounded-[10px] text-[13px] transition-colors ${subjectReferenceType === "video_refer" ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"}`}
                    onClick={() => setSubjectReferenceType("video_refer")}
                  >
                    视频主体
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 text-center transition-colors hover:bg-white/[0.05]"
                onClick={() => {
                  if (subjectReferenceType === "image_refer") {
                    frontalInputRef.current?.click()
                    return
                  }
                  referVideoInputRef.current?.click()
                }}
              >
                <Plus className="h-4 w-4 text-[#F7F7F7]" />
                {subjectReferenceType === "image_refer" ? (
                  <>
                    <span className="text-[13px] text-[#F7F7F7]">{uploadingFrontal ? "上传中..." : "添加角色图片"}</span>
                    <span className="text-[11px] leading-5 text-white/40">2-4张，第一张必须为清晰正脸图片</span>
                  </>
                ) : (
                  <>
                    <span className="text-[13px] text-[#F7F7F7]">{uploadingVideo ? "上传中..." : "添加角色视频"}</span>
                    <span className="text-[11px] leading-5 text-white/40">3-60s，单一连续镜头，mp4 / mov</span>
                  </>
                )}
              </button>

              {subjectReferenceType === "image_refer" && (frontalImageUrl || referImageUrls.length > 0) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {frontalImageUrl ? (
                    <div className="relative">
                      <img alt="主体正面图" className="h-16 w-16 rounded-lg object-cover" src={frontalImageUrl} />
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-black/70 px-1 text-[9px] text-white">正脸</span>
                    </div>
                  ) : null}
                  {referImageUrls.map((url, index) => (
                    <div key={`${url}-${index}`} className="relative">
                      <img alt={`参考图${index + 1}`} className="h-16 w-16 rounded-lg object-cover" src={url} />
                      <button
                        type="button"
                        className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#1C1C20] text-white/70 hover:text-white"
                        onClick={() => setReferImageUrls((prev) => prev.filter((_, currentIndex) => currentIndex !== index))}
                        aria-label={`删除参考图 ${index + 1}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                    onClick={() => referInputRef.current?.click()}
                    disabled={referImageUrls.length >= 3 || uploadingRefer}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              ) : null}

              {subjectReferenceType === "video_refer" && referVideoUrl ? (
                <div className="mt-3 flex items-start gap-3">
                  <video
                    className="h-24 w-24 rounded-lg bg-black object-cover"
                    src={referVideoUrl}
                    controls
                    preload="metadata"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="truncate text-xs text-white/65">已上传参考视频</div>
                    <div className="text-[11px] leading-5 text-white/35">
                      创建时会以 `video_refer` + `element_video_list.refer_videos[0].video_url` 提交。
                    </div>
                    <div className="text-[11px] text-white/45">
                      {[referVideoFormat, formatVideoDuration(referVideoDuration)].filter(Boolean).join(" · ")}
                    </div>
                    <button
                      type="button"
                      className="flex h-8 w-fit items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] px-3 text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                      onClick={() => {
                        setReferVideoUrl("")
                        setReferVideoDuration(0)
                        setReferVideoFormat("")
                      }}
                    >
                      删除视频
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid grid-cols-[1.15fr_0.85fr] gap-3">
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-sm text-[#A8A8A8]">主体名称 <span className="text-[#cf3336]">*</span></span>
                  <div className="relative w-full">
                    <input
                      placeholder="请输入主体名称"
                      maxLength={20}
                      className="h-8 w-full rounded-lg border border-white/15 bg-transparent px-3 pr-14 text-[13px] text-[#F7F7F7] outline-none placeholder:text-white/30"
                      type="text"
                      value={subjectName}
                      onChange={(event) => setSubjectName(event.target.value)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">{subjectName.length}/20</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-sm text-[#A8A8A8]">标签</span>
                  <WorkflowSelect
                    value={subjectTag || "__none__"}
                    onValueChange={(value) => setSubjectTag(value === "__none__" ? "" : value)}
                  >
                    <WorkflowSelectTrigger className="w-full" aria-label="主体标签">
                      <WorkflowSelectValue />
                    </WorkflowSelectTrigger>
                    <WorkflowSelectContent>
                      <WorkflowSelectItem value="__none__" className="text-white/40">请选择标签</WorkflowSelectItem>
                      <WorkflowSelectItem value="人物">人物</WorkflowSelectItem>
                      <WorkflowSelectItem value="场景">场景</WorkflowSelectItem>
                      <WorkflowSelectItem value="道具">道具</WorkflowSelectItem>
                      <WorkflowSelectItem value="特效">特效</WorkflowSelectItem>
                      <WorkflowSelectItem value="其它">其它</WorkflowSelectItem>
                    </WorkflowSelectContent>
                  </WorkflowSelect>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02]">
                <button
                  type="button"
                  className="flex h-10 w-full items-center justify-between px-3 text-left transition-colors hover:bg-white/[0.03]"
                  onClick={() => {
                    setShowAdvancedSettings((prev) => {
                      const next = !prev
                      if (!next) setShowCreateVoice(false)
                      return next
                    })
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] text-[#F7F7F7]">高级设置</div>
                    <div className="truncate text-[11px] text-white/40">
                      音色：{selectedVoice?.voice_name || "无配音"}
                    </div>
                  </div>
                  {showAdvancedSettings ? <ChevronUp className="h-4 w-4 text-white/45" /> : <ChevronDown className="h-4 w-4 text-white/45" />}
                </button>

                {showAdvancedSettings ? (
                  <div className="space-y-3 border-t border-white/10 px-3 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[#A8A8A8]">音色</span>
                      <button
                        type="button"
                        className="text-[11px] text-white/45 transition-colors hover:text-white/70"
                        onClick={() => void loadVoices()}
                      >
                        {loadingVoices ? "刷新中..." : "刷新"}
                      </button>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-1">
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          className={`flex h-8 items-center justify-center rounded-[10px] text-[12px] transition-colors ${subjectVoiceSource === "preset" ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"}`}
                          onClick={() => {
                            setSubjectVoiceSource("preset")
                            setShowCreateVoice(false)
                          }}
                        >
                          官方音色
                        </button>
                        <button
                          type="button"
                          className={`flex h-8 items-center justify-center rounded-[10px] text-[12px] transition-colors ${subjectVoiceSource === "custom" ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"}`}
                          onClick={() => setSubjectVoiceSource("custom")}
                        >
                          我的音色
                        </button>
                      </div>
                    </div>

                    <WorkflowSelect
                      value={subjectVoiceId || "__none__"}
                      onValueChange={(value) => setSubjectVoiceId(value === "__none__" ? "" : value)}
                    >
                      <WorkflowSelectTrigger className="w-full" aria-label="主体音色">
                        <WorkflowSelectValue />
                      </WorkflowSelectTrigger>
                      <WorkflowSelectContent>
                        <WorkflowSelectItem value="__none__">无配音</WorkflowSelectItem>
                        {selectedVoice && !visibleVoices.some((voice) => String(voice.voice_id) === String(subjectVoiceId)) ? (
                          <WorkflowSelectItem value={selectedVoice.voice_id}>
                            已选: {selectedVoice.voice_name}
                          </WorkflowSelectItem>
                        ) : null}
                        {visibleVoices.map((voice) => (
                          <WorkflowSelectItem key={voice.voice_id} value={voice.voice_id}>
                            {voice.voice_name}
                          </WorkflowSelectItem>
                        ))}
                      </WorkflowSelectContent>
                    </WorkflowSelect>

                    {voiceError ? (
                      <div className="rounded-lg border border-[#cf3336]/30 bg-[#cf3336]/10 px-3 py-2 text-[11px] text-[#ffb7b9]">
                        {voiceError}
                      </div>
                    ) : null}

                    {selectedVoice?.trial_url ? (
                      <audio
                        key={selectedVoice.voice_id}
                        controls
                        preload="none"
                        className="h-8 w-full"
                        src={selectedVoice.trial_url}
                      />
                    ) : (
                      <div className="text-[11px] text-white/35">
                        {loadingVoices ? "音色加载中..." : visibleVoices.length > 0 ? "支持试听已选音色" : "当前分组暂无可用音色"}
                      </div>
                    )}

                    {subjectVoiceSource === "custom" ? (
                      <>
                        <button
                          type="button"
                          className="flex h-8 w-full items-center justify-center rounded-lg border border-white/15 bg-white/[0.03] text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                          onClick={() => setShowCreateVoice((prev) => !prev)}
                        >
                          {showCreateVoice ? "收起新建音色" : "+ 新建音色"}
                        </button>

                        {showCreateVoice ? (
                          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <input
                              placeholder="音色名称（必填，最多20字）"
                              maxLength={20}
                              className="h-8 w-full rounded-lg border border-white/15 bg-transparent px-3 text-[13px] text-[#F7F7F7] outline-none placeholder:text-white/30"
                              type="text"
                              value={voiceName}
                              onChange={(event) => setVoiceName(event.target.value)}
                            />
                            <button
                              type="button"
                              className="flex h-9 w-full items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] text-[12px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                              onClick={() => voiceAssetInputRef.current?.click()}
                            >
                              {uploadingVoiceAsset ? "上传中..." : voiceUploadName ? `已上传：${voiceUploadName}` : "上传音频/视频文件"}
                            </button>
                            <input
                              placeholder="或直接粘贴音频/视频链接（voice_url）"
                              className="h-8 w-full rounded-lg border border-white/15 bg-transparent px-3 text-[13px] text-[#F7F7F7] outline-none placeholder:text-white/30"
                              type="text"
                              value={voiceUrl}
                              onChange={(event) => {
                                setVoiceUrl(event.target.value)
                                if (!event.target.value.trim()) setVoiceUploadName("")
                              }}
                            />
                            <input
                              placeholder="或填写历史作品ID（video_id）"
                              className="h-8 w-full rounded-lg border border-white/15 bg-transparent px-3 text-[13px] text-[#F7F7F7] outline-none placeholder:text-white/30"
                              type="text"
                              value={voiceVideoId}
                              onChange={(event) => setVoiceVideoId(event.target.value)}
                            />
                            <div className="text-[11px] leading-5 text-white/35">
                              支持 `.mp3` / `.wav` / `.mp4` / `.mov`，人声需干净且仅一种，时长 5-30 秒。
                            </div>
                            <button
                              type="button"
                              className="flex h-8 w-full items-center justify-center rounded-lg bg-white text-[13px] font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/35"
                              disabled={creatingVoice}
                              onClick={() => void handleCreateVoice()}
                            >
                              {creatingVoice ? "创建音色中..." : "创建并选中音色"}
                            </button>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex flex-col gap-2">
                <span className="text-sm text-[#A8A8A8]">主体描述 <span className="text-[#cf3336]">*</span></span>
                <textarea
                  placeholder="描述主体的核心特征或者描述希望保留的细节，不超过100字"
                  maxLength={100}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-white/15 bg-transparent px-3 py-2 text-xs leading-relaxed text-[#F7F7F7] outline-none placeholder:text-white/30"
                  value={subjectDescription}
                  onChange={(event) => setSubjectDescription(event.target.value)}
                />
              </div>
                </>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 px-4 pb-4 pt-2">
              <button
                type="button"
                className="flex h-8 cursor-pointer items-center rounded-lg border-none bg-white/10 px-3 text-[13px] text-[#F7F7F7] transition-colors hover:bg-white/15"
                onClick={handleCloseCreateDialog}
              >
                取消
              </button>
              <button
                type="button"
                className="flex h-8 items-center rounded-lg bg-white px-3 text-[13px] font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/35"
                disabled={
                  activeTab === "character-assets"
                    ? creatingCharacterAsset
                    : activeTab === "scene-assets"
                      ? creatingSceneAsset
                      : activeTab === "prop-assets"
                        ? creatingPropAsset
                      : creatingSubject
                }
                onClick={() => void (
                  activeTab === "character-assets"
                    ? handleCreateCharacterAsset()
                    : activeTab === "scene-assets"
                      ? handleCreateSceneAsset()
                      : activeTab === "prop-assets"
                        ? handleCreatePropAsset()
                      : handleCreateSubject()
                )}
              >
                {activeTab === "character-assets"
                  ? (creatingCharacterAsset ? "创建中..." : "保存角色")
                  : activeTab === "scene-assets"
                    ? (creatingSceneAsset ? "创建中..." : "保存场景")
                    : activeTab === "prop-assets"
                      ? (creatingPropAsset ? "创建中..." : "保存道具")
                  : (creatingSubject ? "创建中..." : "创建")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <input ref={frontalInputRef} type="file" className="hidden" accept="image/*" onChange={handleUploadFrontal} />
      <input ref={referInputRef} type="file" className="hidden" accept="image/*" multiple onChange={handleUploadRefer} />
      <input
        ref={characterAssetImageInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleUploadCharacterAssetImage}
      />
      <input
        ref={sceneAssetImageInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleUploadSceneAssetImage}
      />
      <input
        ref={propAssetImageInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={handleUploadPropAssetImage}
      />
      <input
        ref={referVideoInputRef}
        type="file"
        className="hidden"
        accept="video/mp4,video/quicktime,video/*"
        onChange={handleUploadReferVideo}
      />
      <input
        ref={voiceAssetInputRef}
        type="file"
        className="hidden"
        accept="audio/mpeg,audio/mp3,audio/wav,video/mp4,video/quicktime,audio/*,video/*"
        onChange={handleUploadVoiceAsset}
      />
    </>,
    document.body
  )
}
