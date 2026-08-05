"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AlertCircle, Check, CheckCircle2, ChevronDown, MoreHorizontal, Trash2, X, Zap } from "lucide-react"
import { message } from "@/workflow/ideart/shims/antd"
import { ColorfulLoader } from "@/workflow/ideart/components/ui/colorful-loader"
import { preloadModels, type DynamicModel } from "@/workflow/ideart/lib/hooks/useModels"
import { extractLibTvProviderKeyFromRuntimeId, resolveLibTvProviderRuntimeModelId } from "@/workflow/ideart/lib/libtv/provider-runtime"
import { estimateImageGenerationPoints, formatBillingPoints } from "@/workflow/ideart/lib/models/billing-estimate"
import { buildImagePreviewUrl } from "@/workflow/ideart/lib/url/image-preview"
import { uploadCanvasNodeFile } from "../../libtv-upload-utils"
import {
  WorkflowExtraParametersPanel,
  flattenWorkflowExtraParameterValues,
  getWorkflowExtraParameterDefaults,
  normalizeWorkflowExtraParameterDefinitions,
  type WorkflowExtraParameterDefinition,
  type WorkflowExtraParameterValue,
} from "../workflow-extra-parameters"
import {
  deriveLibTvScriptV2AssetsByKind,
  type LibTvScriptV2AssetKind,
  type LibTvScriptV2AssetItem,
  type LibTvScriptV2AssetsByKind,
  type LibTvStoryboardScriptColumnKey,
  type LibTvStoryboardScriptResult,
  type LibTvStoryboardScriptRow,
} from "@/workflow/ideart/lib/libtv/script"
import { stopWorkflowNodeChromeEvent } from "./workflow-node-utils"

export type ScriptV2WorkspaceStep = "confirm-shots" | "prepare-assets" | "compose-prompts"

type ScriptV2WorkspaceProps = {
  title: string
  shotCount: number
  table?: React.ReactNode
  scriptResult?: LibTvStoryboardScriptResult | null
  projectId?: string
  canvasImageAssets?: ScriptV2CanvasImageAsset[]
  initialStep?: ScriptV2WorkspaceStep
  initialAssetsByKind?: Record<ScriptV2AssetKind, ScriptV2AssetItem[]>
  onRowChange?: (rowIndex: number, key: LibTvStoryboardScriptColumnKey, value: string) => void
  onRowsChange?: (rows: LibTvStoryboardScriptRow[]) => void
  onDeleteRow?: (rowIndex: number) => void
  onStepChange?: (step: ScriptV2WorkspaceStep, assetsByKind: Record<ScriptV2AssetKind, ScriptV2AssetItem[]>) => void
  onAssetsChange?: (assetsByKind: Record<ScriptV2AssetKind, ScriptV2AssetItem[]>) => void
  onPrepareAssets?: () => void
  preparingAssets?: boolean
  onComposePromptsComplete?: (rows: LibTvStoryboardScriptRow[], assetsByKind: Record<ScriptV2AssetKind, ScriptV2AssetItem[]>) => void
  onAddRow: () => void
  onClose: () => void
  onComposeAll: () => void
}

const SCRIPT_V2_STEPS: Array<{
  id: ScriptV2WorkspaceStep
  index: number
  label: string
}> = [
  { id: "confirm-shots", index: 1, label: "确认镜头" },
  { id: "prepare-assets", index: 2, label: "准备资产" },
  { id: "compose-prompts", index: 3, label: "合成提示词" },
]

function ScriptV2StepRing({
  index,
  active,
  complete,
  ready = 0,
  total = 0,
}: {
  index: number
  active: boolean
  complete: boolean
  ready?: number
  total?: number
}) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0))
  const safeReady = Math.max(0, Math.min(safeTotal, Math.floor(Number(ready) || 0)))
  const isFilled = complete || (safeTotal > 0 && safeReady >= safeTotal)
  const circumference = 2 * Math.PI * 14
  const segmentLength = safeTotal > 0 ? circumference / safeTotal : circumference
  return (
    <svg aria-hidden="true" className="h-9 w-9 shrink-0" width="36" height="36" viewBox="0 0 36 36">
      {isFilled ? (
        <circle cx="18" cy="18" fill="#F7F7F7" r="15.5" />
      ) : safeTotal > 1 ? (
        Array.from({ length: safeTotal }).map((_, segmentIndex) => (
          <circle
            key={segmentIndex}
            cx="18"
            cy="18"
            fill="none"
            r="14"
            stroke={segmentIndex < safeReady ? "#F7F7F7" : "#525252"}
            strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
            strokeDashoffset={-segmentLength * segmentIndex}
            strokeLinecap="butt"
            strokeWidth="3"
            transform="rotate(-90 18 18)"
          />
        ))
      ) : (
        <circle
          cx="18"
          cy="18"
          r="14"
          fill="none"
          stroke={safeReady > 0 ? "#F7F7F7" : active ? "#777777" : "#525252"}
          strokeWidth="3"
          transform="rotate(-90 18 18)"
        />
      )}
      <text
        x="18"
        y="18"
        fill={isFilled ? "#111111" : "rgba(247,247,247,0.9)"}
        dominantBaseline="central"
        fontSize="13"
        fontWeight="600"
        textAnchor="middle"
      >
        {index}
      </text>
    </svg>
  )
}

type ScriptV2Choice = {
  value: string
  label: string
  isDefault?: boolean
  config?: Record<string, any>
  paramKey?: string
}

type ScriptV2AssetItem = LibTvScriptV2AssetItem
type ScriptV2AssetKind = LibTvScriptV2AssetKind
type ScriptV2AssetsByKind = LibTvScriptV2AssetsByKind

export type ScriptV2CanvasImageAsset = {
  id: string
  title: string
  imageUrl: string
  prompt?: string
}

type ScriptV2BatchAssetTarget = ScriptV2AssetItem & {
  selected: boolean
  editablePrompt: string
}

type ScriptV2BatchImageConfig = {
  modelId: string
  imageSize?: string
  aspectRatio?: string
  quality?: string
  qualityKey?: string
  extraParameters?: Record<string, WorkflowExtraParameterValue>
}

type ScriptV2AssetGenerationStatus = {
  status: "queued" | "creating" | "running" | "success" | "failed" | "cancelled"
  progress: number
  label?: string
  jobId?: string
}

const SCRIPT_V2_IMAGE_GENERATING_LABEL = "图片生成中..."

type ScriptV2SelectedAsset = {
  kind: ScriptV2AssetKind
  id: string
}

type ScriptV2AssetModalInitialTab = "ai" | "canvas" | "upload"

type ScriptV2AssetModalRequest = {
  kind: ScriptV2AssetKind
  targetId?: string
  initialTab?: ScriptV2AssetModalInitialTab
  initialPrompt?: string
}

const SCRIPT_V2_ASSET_UPLOAD_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"
const SCRIPT_V2_ASSET_UPLOAD_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
])
const SCRIPT_V2_ASSET_UPLOAD_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])

function isScriptV2AssetUploadFile(file: File) {
  const mimeType = String(file.type || "").trim().toLowerCase()
  if (SCRIPT_V2_ASSET_UPLOAD_MIME_TYPES.has(mimeType)) return true
  if (mimeType) return false
  const extension = String(file.name || "").trim().toLowerCase().split(".").pop() || ""
  return SCRIPT_V2_ASSET_UPLOAD_EXTENSIONS.has(extension)
}

function getScriptV2UploadedAssetTitle(file: File, fallback: ScriptV2AssetKind) {
  return String(file.name || "")
    .replace(/\.[^.]+$/, "")
    .trim() || fallback
}

type ScriptV2PromptColumn = {
  key: LibTvStoryboardScriptColumnKey | "operations"
  label: string
  width: number
  align?: "left" | "center"
  placeholder?: string
  presets?: string[]
  emphasized?: boolean
}

type ScriptV2CellEditor = {
  rowIndex: number
  key: LibTvStoryboardScriptColumnKey
}

const SCRIPT_V2_PROMPT_COLUMNS: ScriptV2PromptColumn[] = [
  { key: "shotNumber", label: "镜号", width: 50, align: "center" },
  { key: "duration", label: "时长", width: 56, align: "center", placeholder: "5s" },
  { key: "visualDescription", label: "画面描述", width: 240, placeholder: "例如：日系青春动漫风、戏剧冲突氛围..." },
  { key: "shotType", label: "景别", width: 56, align: "center", presets: ["大远景", "远景", "全景", "中远景", "中景", "中近景", "近景", "特写"] },
  { key: "lightingAtmosphere", label: "光影氛围", width: 170, placeholder: "例如：日系青春动漫风、戏剧冲突氛围..." },
  { key: "dialogue", label: "对白·旁白", width: 200, placeholder: "空：请点击下方按钮添加", presets: ["台词", "旁白"] },
  { key: "soundEffect", label: "音效", width: 120, placeholder: "例如：风声、雨声、脚步声、鼓点......" },
  { key: "cameraMovement", label: "运镜", width: 120, placeholder: "例如：推镜、拉镜、摇镜、跟镜......", presets: ["推镜", "拉镜", "摇镜", "跟镜", "俯拍", "仰拍"] },
  { key: "storyboardPrompt", label: "最终提示词", width: 100, align: "center", emphasized: true },
  { key: "operations", label: "操作", width: 48, align: "center" },
]

const SCRIPT_V2_ROW_COLORS = [
  { id: "red", label: "红", className: "bg-red-500/[0.08]", swatch: "bg-red-400" },
  { id: "amber", label: "黄", className: "bg-amber-500/[0.08]", swatch: "bg-amber-400" },
  { id: "emerald", label: "绿", className: "bg-emerald-500/[0.08]", swatch: "bg-emerald-400" },
  { id: "sky", label: "蓝", className: "bg-sky-500/[0.08]", swatch: "bg-sky-400" },
  { id: "neutral", label: "灰", className: "bg-neutral-500/[0.08]", swatch: "bg-neutral-400" },
]

function getScriptV2RowValue(row: LibTvStoryboardScriptRow, key: LibTvStoryboardScriptColumnKey) {
  return String((row as LibTvStoryboardScriptRow & Record<string, unknown>)[key] || "").trim()
}

function areScriptV2AssetListsEqual(a: ScriptV2AssetItem[] = [], b: ScriptV2AssetItem[] = []) {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every((item, index) => {
    const other = b[index]
    return Boolean(other)
      && String(item.id || "") === String(other.id || "")
      && String(item.imageUrl || "") === String(other.imageUrl || "")
      && String(item.title || "") === String(other.title || "")
      && String(item.kind || "") === String(other.kind || "")
      && String(item.modelId || "") === String(other.modelId || "")
      && String(item.generationJobId || "") === String(other.generationJobId || "")
      && String(item.generationTaskId || "") === String(other.generationTaskId || "")
      && String(item.generationTaskType || "") === String(other.generationTaskType || "")
      && String(item.generationProviderKey || "") === String(other.generationProviderKey || "")
      && String(item.generationError || "") === String(other.generationError || "")
  })
}

function normalizeScriptV2PromptText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[，,。；;：:、/\\|—_\-\s]+/g, "")
}

function trimScriptV2PromptText(value: unknown, maxLength = 72) {
  const text = String(value || "").trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 1)}…`
}

function collectScriptV2AssetMatches(signals: unknown[], assets: ScriptV2AssetItem[], limit = 2) {
  const normalizedSignals = signals
    .map((value) => normalizeScriptV2PromptText(value))
    .filter(Boolean)
  if (normalizedSignals.length === 0 || assets.length === 0) return []

  return assets
    .map((asset) => {
      const haystack = normalizeScriptV2PromptText(`${asset.title} ${asset.prompt}`)
      if (!haystack) return { asset, score: 0 }
      let score = 0
      normalizedSignals.forEach((signal) => {
        if (haystack.includes(signal) || signal.includes(haystack)) score += 1
      })
      return { asset, score }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.asset)
}

function formatScriptV2AssetSummary(kind: ScriptV2AssetKind, assets: ScriptV2AssetItem[]) {
  if (assets.length === 0) return ""
  return `${getScriptV2AssetKindDisplayLabel(kind)}：${assets
    .map((asset) => {
      const prompt = trimScriptV2PromptText(asset.prompt, 40)
      return prompt ? `${asset.title}（${prompt}）` : asset.title
    })
    .join("；")}`
}

function pickScriptV2BestAsset(signals: unknown[], assets: ScriptV2AssetItem[]) {
  return collectScriptV2AssetMatches(signals, assets, 1)[0] || null
}

function formatScriptV2BracketClause(label: string, value: unknown) {
  const text = String(value || "").trim()
  return text ? `[${label}：${text}]` : ""
}

function getScriptV2AssetKindDisplayLabel(kind: ScriptV2AssetKind) {
  if (kind === "角色") return "人物"
  if (kind === "场景") return "环境"
  if (kind === "道具") return "物件"
  return kind
}

function buildScriptV2AssetContextSummary(row: LibTvStoryboardScriptRow, assetsByKind?: ScriptV2AssetsByKind) {
  const roleAssets = collectScriptV2AssetMatches([
    row.character1,
    row.characterDescription1,
    row.character2,
    row.characterDescription2,
  ], assetsByKind?.["角色"] || [])
  const sceneAssets = collectScriptV2AssetMatches([
    row.sceneKey,
    row.sceneAssetKey,
    row.sceneTags,
    row.visualDescription,
    row.lightingAtmosphere,
  ], assetsByKind?.["场景"] || [])
  const propAssets = collectScriptV2AssetMatches([
    row.narrativeContent,
    row.visualDescription,
    row.sceneTags,
  ], assetsByKind?.["道具"] || [])

  const sections = [
    formatScriptV2AssetSummary("角色", roleAssets),
    formatScriptV2AssetSummary("场景", sceneAssets),
    formatScriptV2AssetSummary("道具", propAssets),
  ].filter(Boolean)

  if (sections.length > 0) return sections.join("；")

  const counts = [
    assetsByKind?.["角色"]?.length ? `${getScriptV2AssetKindDisplayLabel("角色")} ${assetsByKind["角色"].length} 个` : "",
    assetsByKind?.["场景"]?.length ? `${getScriptV2AssetKindDisplayLabel("场景")} ${assetsByKind["场景"].length} 个` : "",
    assetsByKind?.["道具"]?.length ? `${getScriptV2AssetKindDisplayLabel("道具")} ${assetsByKind["道具"].length} 个` : "",
  ].filter(Boolean)
  return counts.length > 0 ? counts.join("，") : ""
}

function buildScriptV2ImageGenerationPrompt(row: LibTvStoryboardScriptRow, assetsByKind?: ScriptV2AssetsByKind) {
  const roleAsset = pickScriptV2BestAsset([
    row.character1,
    row.characterDescription1,
    row.character2,
    row.characterDescription2,
    row.visualDescription,
  ], assetsByKind?.["角色"] || [])
  const sceneAsset = pickScriptV2BestAsset([
    row.sceneKey,
    row.sceneAssetKey,
    row.sceneTags,
    row.visualDescription,
    row.lightingAtmosphere,
  ], assetsByKind?.["场景"] || [])
  const propAsset = pickScriptV2BestAsset([
    row.narrativeContent,
    row.visualDescription,
    row.sceneTags,
  ], assetsByKind?.["道具"] || [])

  const shotType = getScriptV2RowValue(row, "shotType")
  const cameraAngle = getScriptV2RowValue(row, "cameraAngle")
  const composition = [shotType, cameraAngle].filter(Boolean).join("，")
  const roleDescription = [
    roleAsset?.title || getScriptV2RowValue(row, "character1"),
    roleAsset?.prompt || getScriptV2RowValue(row, "characterDescription1") || getScriptV2RowValue(row, "characterDescription2"),
  ].filter(Boolean).join("，")
  const sceneDescription = [
    sceneAsset?.prompt || getScriptV2RowValue(row, "sceneTags"),
    getScriptV2RowValue(row, "visualDescription"),
  ].filter(Boolean).join("，")
  const lighting = getScriptV2RowValue(row, "lightingAtmosphere")
  const style = [
    sceneAsset?.title ? `${sceneAsset.title}${getScriptV2AssetKindDisplayLabel("场景")}` : "",
    propAsset?.title ? `${propAsset.title}${getScriptV2AssetKindDisplayLabel("道具")}` : "",
    "现代写实都市风格",
    lighting ? trimScriptV2PromptText(lighting, 24) : "",
  ].filter(Boolean).join("，")
  const technical = [
    getScriptV2RowValue(row, "focalDepth"),
    getScriptV2RowValue(row, "duration"),
  ].filter(Boolean).join("，")

  const clauses = [
    formatScriptV2BracketClause("画面构图", composition || "中景镜头"),
    formatScriptV2BracketClause("调用人物", roleDescription || getScriptV2RowValue(row, "character1")),
    formatScriptV2BracketClause("人物居于画面中央", sceneDescription || getScriptV2RowValue(row, "visualDescription")),
    formatScriptV2BracketClause("眼神与表情", [
      getScriptV2RowValue(row, "emotion"),
      getScriptV2RowValue(row, "characterAction"),
    ].filter(Boolean).join("，")),
    formatScriptV2BracketClause("环境信息", [
      sceneAsset?.prompt || getScriptV2RowValue(row, "sceneTags"),
      getScriptV2RowValue(row, "referenceImage") ? `参考图 ${getScriptV2RowValue(row, "referenceImage")}` : "",
    ].filter(Boolean).join("，")),
    formatScriptV2BracketClause("光影与氛围", lighting || sceneAsset?.prompt || ""),
    formatScriptV2BracketClause("风格", style || "现代写实都市风格"),
    formatScriptV2BracketClause("技术参数", technical || "35mm镜头，f/1.8大光圈，极浅景深"),
  ].filter(Boolean)

  return clauses.join(" + ") + "。"
}

function buildScriptV2MotionPrompt(row: LibTvStoryboardScriptRow) {
  const clauses = [
    formatScriptV2BracketClause("摄影机", getScriptV2RowValue(row, "cameraMovement") || "缓慢向前推轨，营造逐渐收紧的压迫感"),
    formatScriptV2BracketClause("主体动作", getScriptV2RowValue(row, "characterAction") || "人物的动作逐渐放缓，身体微微摇晃"),
    formatScriptV2BracketClause("表情变化", getScriptV2RowValue(row, "emotion") || "眼神开始失去焦距，透出疲惫与透支"),
    formatScriptV2BracketClause("环境动态", getScriptV2RowValue(row, "lightingAtmosphere") || "屏幕光在脸上微微闪烁"),
    formatScriptV2BracketClause("音效", getScriptV2RowValue(row, "soundEffect") || "键盘声由快转慢，伴随着突兀的提示音"),
    formatScriptV2BracketClause("台词", getScriptV2RowValue(row, "dialogue") || "无台词"),
    formatScriptV2BracketClause("时长", getScriptV2RowValue(row, "duration") ? `${getScriptV2RowValue(row, "duration")}` : "4.0秒"),
  ].filter(Boolean)
  return clauses.join(" + ") + "。"
}

function buildScriptV2PromptDraft(row: LibTvStoryboardScriptRow, assetsByKind?: ScriptV2AssetsByKind) {
  const imageGenerationPrompt = buildScriptV2ImageGenerationPrompt(row, assetsByKind)
  const videoMotionPrompt = buildScriptV2MotionPrompt(row)
  return {
    assetSummary: buildScriptV2AssetContextSummary(row, assetsByKind),
    imageGenerationPrompt,
    videoMotionPrompt,
    storyboardPrompt: imageGenerationPrompt,
    motionPrompt: videoMotionPrompt,
  }
}

function normalizeScriptV2Choice(item: any, fallbackPrefix: string, index: number, paramKey?: string): ScriptV2Choice | null {
  const value = String(item?.id ?? item?.value ?? item?.key ?? item?.label ?? "").trim()
  const label = String(item?.label ?? item?.name ?? item?.title ?? value).trim()
  if (!value && !label) return null
  return {
    value: value || `${fallbackPrefix}-${index}`,
    label: label || value,
    isDefault: item?.isDefault === true || item?.config?.isDefault === true,
    config: item?.config && typeof item.config === "object" ? item.config : undefined,
    paramKey,
  }
}

function uniqueScriptV2Choices(items: ScriptV2Choice[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.value || item.label
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function pickScriptV2DefaultChoice(items: ScriptV2Choice[], preferredValues: string[] = []) {
  if (items.length === 0) return ""
  const normalizedPreferred = preferredValues.map((item) => item.toLowerCase())
  const preferred = items.find((item) => {
    const value = item.value.toLowerCase()
    const label = item.label.toLowerCase()
    return normalizedPreferred.some((candidate) => candidate === value || candidate === label)
  })
  if (preferred) return preferred.value
  return items.find((item) => item.isDefault)?.value || items[0]?.value || ""
}

function getScriptV2ExtraParameterDefinitions(model: DynamicModel | null | undefined) {
  return normalizeWorkflowExtraParameterDefinitions(model?.parameters?.extraParameters as WorkflowExtraParameterDefinition[] | undefined)
}

function isScriptV2QualityDefinition(definition: WorkflowExtraParameterDefinition | undefined) {
  if (!definition) return false
  const key = `${definition.type || ""} ${definition.label || ""}`.toLowerCase()
  return key.includes("quality") || key.includes("画质")
}

function getScriptV2QualityDefinition(definitions: WorkflowExtraParameterDefinition[]) {
  return definitions.find((definition) => isScriptV2QualityDefinition(definition))
}

function scriptV2ChoicesFromDefinition(definition: WorkflowExtraParameterDefinition | undefined) {
  if (!definition) return []
  return uniqueScriptV2Choices((definition.options || [])
    .map((item, index) => normalizeScriptV2Choice(item, definition.type || "option", index, definition.type))
    .filter((item): item is ScriptV2Choice => Boolean(item)))
}

function getScriptV2NonQualityDefinitions(definitions: WorkflowExtraParameterDefinition[]) {
  return definitions.filter((definition) => !isScriptV2QualityDefinition(definition))
}

function getScriptV2ImageModelValue(model: DynamicModel | null | undefined) {
  return resolveLibTvProviderRuntimeModelId(model)
}

function isScriptV2PreferredImageModel(model: DynamicModel | null | undefined, modelId: string) {
  const expected = String(modelId || "").trim().toLowerCase()
  if (!expected) return false
  const runtimeId = String(model?.id || "").trim().toLowerCase()
  const providerModelId = String(model?.modelId || "").trim().toLowerCase()
  return providerModelId === expected || runtimeId === expected || runtimeId.startsWith(`${expected}@@`)
}

function hasScriptV2AssetImage(asset: ScriptV2AssetItem) {
  return Boolean(String(asset?.imageUrl || "").trim())
}

function getScriptV2ImagePreviewUrl(url: string, width: number) {
  const previewUrl = buildImagePreviewUrl(url, width)
  return previewUrl || url
}

function mergeScriptV2AssetsForCurrentScript(
  derivedAssetsByKind: LibTvScriptV2AssetsByKind,
  previousAssetsByKind?: Partial<Record<ScriptV2AssetKind, ScriptV2AssetItem[]>>,
): LibTvScriptV2AssetsByKind {
  const mergeKind = (kind: ScriptV2AssetKind) => {
    const previousById = new Map(
      (previousAssetsByKind?.[kind] || [])
        .map((asset) => [String(asset.id || "").trim(), asset] as const)
        .filter(([id]) => Boolean(id))
    )
    return (derivedAssetsByKind[kind] || []).map((asset) => {
      const previous = previousById.get(String(asset.id || "").trim())
      if (!previous) return asset
      return {
        ...asset,
        imageUrl: String(previous.imageUrl || asset.imageUrl || "").trim(),
        prompt: String(asset.prompt || previous.prompt || "").trim(),
        modelId: String(previous.modelId || asset.modelId || "").trim(),
        aspectRatio: previous.aspectRatio || asset.aspectRatio,
        imageSize: previous.imageSize || asset.imageSize,
        quality: previous.quality || asset.quality,
        generationJobId: previous.generationJobId || asset.generationJobId,
        generationTaskId: previous.generationTaskId || asset.generationTaskId,
        generationTaskType: previous.generationTaskType || asset.generationTaskType,
        generationProviderKey: previous.generationProviderKey || asset.generationProviderKey,
        generationError: previous.generationError || asset.generationError,
        createdAt: Number.isFinite(Number(previous.createdAt)) ? Number(previous.createdAt) : asset.createdAt,
      }
    })
  }
  return {
    "角色": mergeKind("角色"),
    "场景": mergeKind("场景"),
    "道具": mergeKind("道具"),
  }
}

function getScriptV2AssetImagePrompt(asset: ScriptV2AssetItem) {
  return String(asset?.prompt || asset?.title || "").trim()
}

function buildScriptV2AssetGenerationPrompt(kind: ScriptV2AssetKind, prompt: string, title?: string) {
  const rawPrompt = String(prompt || "").trim()
  const rawTitle = String(title || kind || "").trim()
  if (kind === "场景") {
    const identity = rawTitle && rawPrompt && !rawPrompt.includes(rawTitle)
      ? `${rawTitle}：${rawPrompt}`
      : (rawPrompt || rawTitle)
    return [
      "生成一张影视级环境设定图，只表现地点、空间、陈设、光影和氛围。",
      `环境设定：${identity}`,
      "画面中禁止出现人物、人体、脸、手、剪影、人群、演员或任何主体。",
      "如果原始描述里包含人物动作、表情、服装或人物名称，请只保留与环境有关的空间、物件、建筑、时间、天气、光影和氛围信息。",
      "需要适合作为后续人物合成和视频生成的干净背景参考图。",
      "empty cinematic environment concept art, no people, no characters, no human silhouette, establishing shot, detailed background, production design",
    ].join("\n")
  }
  if (kind !== "角色") return rawPrompt
  const identity = rawTitle && rawPrompt && !rawPrompt.includes(rawTitle)
    ? `${rawTitle}：${rawPrompt}`
    : (rawPrompt || rawTitle)
  return [
    "生成一张专业影视人物设定图/人物三视图，不是剧情截图。",
    `人物设定：${identity}`,
    "画面必须是横向人物设计板，干净纯白或浅灰背景，工作室均匀布光。",
    "同一人物在同一张图中展示：左侧正面近景头像或半身特写，中间正面全身站姿，右侧依次为侧面全身和背面全身。",
    "正面、侧面、背面必须保持同一人物、同一服装、同一发型、同一年龄气质，五官和服饰细节一致。",
    "全身视图需要完整展示头到脚、服装结构、配饰、鞋履和轮廓，适合作为视频人物一致性参考。",
    "不要生成电影剧照、多人合影、复杂场景、动作打斗、夸张表情、文字说明、水印、边框、UI元素。",
    "cinematic character turnaround sheet, front view, side view, back view, full body, portrait close-up, white background, consistent identity, high detail",
  ].join("\n")
}

function getScriptV2AssetKindNoun(kind: ScriptV2AssetKind) {
  return getScriptV2AssetKindDisplayLabel(kind)
}

function buildScriptV2MissingAssetText(counts: Record<ScriptV2AssetKind, number>) {
  const parts = (["角色", "场景", "道具"] as ScriptV2AssetKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${counts[kind]} 个${getScriptV2AssetKindNoun(kind)}`)
  if (parts.length === 0) return ""
  return `检测到有${parts.join("和")}没有设定图，您可以手动上传或AI批量生成`
}

function collectScriptV2AssetResultUrls(payload: any): string[] {
  const out: string[] = []
  const seenObjects = new Set<any>()
  const pushUrl = (value: unknown) => {
    const url = String(value || "").trim()
    if (!url) return
    if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("/") && !url.startsWith("data:image/")) return
    if (!out.includes(url)) out.push(url)
  }
  const queue: any[] = [payload]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    if (typeof current === "string") {
      pushUrl(current)
      continue
    }
    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }
    if (typeof current === "object") {
      if (seenObjects.has(current)) continue
      seenObjects.add(current)
      for (const [key, value] of Object.entries(current)) {
        const normalizedKey = key.toLowerCase()
        if (
          normalizedKey.includes("url") ||
          normalizedKey.includes("image") ||
          normalizedKey === "output" ||
          normalizedKey === "outputs" ||
          normalizedKey === "result" ||
          normalizedKey === "results" ||
          normalizedKey === "data" ||
          normalizedKey === "response"
        ) {
          queue.push(value)
        }
      }
    }
  }
  return out
}

async function createScriptV2AssetGenerationJob(params: {
  projectId: string
  request: Record<string, any>
}) {
  const response = await fetch("/api/canvas/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      projectId: params.projectId,
      kind: "image_generate",
      request: params.request,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(String(payload?.error || `创建任务失败: HTTP ${response.status}`))
  const id = String(payload?.id || payload?.jobId || payload?.job?.id || "").trim()
  if (!id) throw new Error("创建任务返回异常")
  return { ...payload, id }
}

async function waitScriptV2AssetGenerationJob(jobId: string, onProgress?: (label: string, progress: number) => void, shouldCancel?: () => boolean) {
  let delayMs = 1400
  for (let attempt = 0; attempt < 280; attempt += 1) {
    if (shouldCancel?.()) throw new Error("已取消")
    const response = await fetch(`/api/canvas/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
      credentials: "include",
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(String(payload?.error || `任务轮询失败: HTTP ${response.status}`))
    const status = String(payload?.status || "").trim().toLowerCase()
    const resultData = payload?.resultData && typeof payload.resultData === "object" ? payload.resultData : {}
    const progress = Number(resultData?.progress)
    const percent = Number.isFinite(progress) ? Math.max(1, Math.min(99, Math.round(progress * 100))) : 5
    onProgress?.(SCRIPT_V2_IMAGE_GENERATING_LABEL, percent)
    if (status === "success") return payload
    if (status === "failed") throw new Error(String(payload?.errorMessage || resultData?.message || "任务执行失败"))
    const hintDelay = Number(resultData?.pollAfterMs)
    delayMs = Number.isFinite(hintDelay) && hintDelay > 0 ? Math.max(800, Math.min(8000, Math.floor(hintDelay))) : delayMs
    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
  }
  throw new Error("任务轮询超时")
}

function ScriptV2AssetPlaceholder({
  label,
  assets,
  onAdd,
  onSelectAsset,
  generationStatusById = {},
  onCancelGeneration,
}: {
  label: ScriptV2AssetKind
  assets: ScriptV2AssetItem[]
  onAdd: (label: ScriptV2AssetKind) => void
  onSelectAsset: (asset: ScriptV2AssetItem) => void
  generationStatusById?: Record<string, ScriptV2AssetGenerationStatus>
  onCancelGeneration?: (assetId: string) => void
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[13px] font-normal leading-5 text-white">{label}</h3>
      <div className="flex flex-wrap gap-3">
        {assets.map((asset) => {
          const generationStatus = generationStatusById[asset.id]
          const isGenerating = generationStatus && ["queued", "creating", "running"].includes(generationStatus.status)
          const progressLabel = generationStatus?.label || SCRIPT_V2_IMAGE_GENERATING_LABEL
          return (
            <div
              key={asset.id}
              role="button"
              tabIndex={0}
              aria-label={`${label}资产：${asset.title}${hasScriptV2AssetImage(asset) ? "，已就绪" : "，未设定图"}`}
              className="nodrag group relative flex w-[277px] shrink-0 cursor-pointer flex-col gap-1.5 rounded-lg transition-shadow"
              data-asset-id={asset.id}
              data-asset-status={hasScriptV2AssetImage(asset) ? "ready" : "missing"}
              onClick={(event) => {
                event.stopPropagation()
                onSelectAsset(asset)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelectAsset(asset)
                }
              }}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-dashed border-white/15 bg-white/[0.02] transition-colors hover:border-white/30">
                {asset.imageUrl ? (
                  <img
                    src={getScriptV2ImagePreviewUrl(asset.imageUrl, 640)}
                    alt={asset.title}
                    className="h-full w-full object-cover"
                    draggable={false}
                    decoding="async"
                    loading="eager"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center px-3 text-center text-[10px] leading-[1.4] text-white/40">
                    <span>生成或上传{label}图</span>
                  </div>
                )}
                {isGenerating ? (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
                    <div className="generating-breathing-grey absolute inset-0 rounded-lg" />
                    <div className="group pointer-events-auto relative z-10 flex w-full max-w-[min(100%,280px)] flex-col items-center gap-2">
                      <div
                        className="flex h-8 items-center justify-center gap-2.5 rounded-lg px-4 py-2"
                        style={{
                          backdropFilter: "blur(16px)",
                          background: "rgba(0,0,0,0.45)",
                          border: "0.5px solid rgba(196,196,196,0.6)",
                        }}
                      >
                        <span className="whitespace-nowrap text-sm font-medium text-white">{progressLabel}</span>
                        <button
                          type="button"
                          className="nodrag cursor-pointer whitespace-nowrap bg-transparent text-sm font-normal text-white/50 transition-colors hover:text-white/80"
                          onClick={(event) => {
                            event.stopPropagation()
                            onCancelGeneration?.(asset.id)
                          }}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100" role="presentation">
                  <button
                    type="button"
                    aria-label="资产卡操作菜单"
                    className="flex h-5 w-5 items-center justify-center rounded bg-black/60 text-white shadow"
                    onClick={stopWorkflowNodeChromeEvent}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="truncate text-xs font-medium text-white/85" title={asset.title}>{asset.title}</div>
              <div className="truncate text-[10px] leading-tight text-white/45" title={asset.prompt || "已从脚本结果提取"}>
                {asset.prompt || "已从脚本结果提取"}
              </div>
              <div className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-30 hidden w-full rounded-lg border border-white/10 bg-[#1F1F1F] px-3 py-2 text-left shadow-[0_12px_34px_rgba(0,0,0,0.45)] group-hover:block group-focus-within:block">
                <div className="mb-1 break-words text-[12px] font-medium leading-[18px] text-white/90">{asset.title}</div>
                <div className="max-h-[88px] overflow-hidden break-words text-[11px] leading-[17px] text-white/58">{asset.prompt || "已从脚本结果提取"}</div>
              </div>
            </div>
          )
        })}
        <button
          type="button"
          className="nodrag flex h-[156px] w-[156px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1 self-start rounded-lg border border-dashed border-white/15 bg-white/[0.02] text-[10px] text-white/30 transition-colors hover:border-white/30 hover:text-white/60"
          title={`新增${label}`}
          aria-label={`新增${label}`}
          onClick={(event) => {
            event.stopPropagation()
            onAdd(label)
          }}
        >
          <svg aria-hidden="true" className="pointer-events-none" width="16" height="16" viewBox="0 0 17 17">
            <path d="M8.5 0C8.99705 8.57272e-06 9.40039 0.475703 9.40039 1.0625V7.59961H15.9375C16.5243 7.59961 17 8.00294 17 8.5C17 8.99706 16.5243 9.40039 15.9375 9.40039H9.40039V15.9375C9.40039 16.5243 8.99705 17 8.5 17C8.00294 17 7.59961 16.5243 7.59961 15.9375V9.40039H1.0625C0.475698 9.40039 7.60586e-08 8.99706 0 8.5C0 8.00294 0.475698 7.59961 1.0625 7.59961H7.59961V1.0625C7.59961 0.475697 8.00294 2.1727e-08 8.5 0Z" fill="currentColor" />
          </svg>
          <span>新增</span>
        </button>
      </div>
    </section>
  )
}

function ScriptV2AssetEditDrawer({
  asset,
  onChange,
  onOpenReplaceImage,
  onOpenAiGenerate,
  onClearImage,
  onDelete,
  onClose,
}: {
  asset: ScriptV2AssetItem
  onChange: (patch: Partial<ScriptV2AssetItem>) => void
  onOpenReplaceImage: () => void
  onOpenAiGenerate: () => void
  onClearImage: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const kind = asset.kind
  const titlePrefix = getScriptV2AssetKindDisplayLabel(kind)
  const imageLabel = kind === "角色" ? "人物形象" : kind === "场景" ? "环境图" : "物件图"
  const nameLabel = `${titlePrefix}名称`
  const descriptionLabel = `${titlePrefix}描述`

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[450]"
      data-testid="scriptv2-asset-edit-drawer-root"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <button
        type="button"
        aria-label="关闭资产编辑面板"
        className="absolute inset-0 cursor-default bg-black/[0.35]"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
      />
      <section
        className="absolute bottom-0 right-0 top-0 flex w-[520px] max-w-[calc(100vw-24px)] translate-x-0 flex-col border-l border-[#363636] bg-[#212121] text-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
        role="dialog"
        aria-modal="true"
        data-testid="asset-edit-panel"
        onClick={stopWorkflowNodeChromeEvent}
      >
      {actionMenuOpen ? (
        <button
          type="button"
          aria-label="关闭资产操作菜单"
          className="absolute inset-0 z-[1] cursor-default bg-transparent"
          onClick={(event) => {
            event.stopPropagation()
            setActionMenuOpen(false)
          }}
        />
      ) : null}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#363636] px-4">
          <h2 className="m-0 text-sm font-normal text-white">编辑{titlePrefix}</h2>
          <button
            type="button"
            aria-label="关闭"
            data-testid="asset-edit-panel-close"
            className="nodrag flex h-6 w-6 cursor-pointer items-center justify-center rounded text-[#F7F7F7] hover:bg-white/10"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="tiny-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
          <div className="flex shrink-0 flex-col gap-2">
            <label className="text-[13px] text-white">{imageLabel}</label>
            <div data-testid="asset-edit-panel-image-area" className="relative h-[346px] w-full overflow-hidden rounded-lg bg-white/[0.04]">
              {asset.imageUrl ? (
                <img
                  alt={asset.title}
                  className="h-full w-full object-cover"
                  draggable={false}
                  src={getScriptV2ImagePreviewUrl(asset.imageUrl, 1200)}
                  decoding="async"
                  loading="eager"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[13px] text-white/35">生成或上传{imageLabel}</div>
              )}
              <div className="absolute right-2 top-2 flex items-center gap-1">
                <button
                  type="button"
                  aria-label="全屏预览"
                  data-testid="asset-edit-panel-preview-btn"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-black/65 text-white hover:bg-black/80"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (asset.imageUrl) setPreviewOpen(true)
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="pointer-events-none" width="14" height="14" viewBox="0 0 20.2613 20.2565">
                    <path d="M9 0C13.9705 6.59711e-05 18 4.02948 18 9C18 11.1612 17.2374 13.1438 15.9678 14.6953L19.9971 18.7197C20.3489 19.0711 20.3494 19.6403 19.998 19.9922C19.6466 20.3441 19.0765 20.3446 18.7246 19.9932L14.6953 15.9678C13.1438 17.2374 11.1611 18 9 18C4.02944 18 0 13.9706 0 9C0 4.02944 4.02944 0 9 0ZM9 1.7998C5.02355 1.7998 1.7998 5.02355 1.7998 9C1.7998 12.9765 5.02355 16.2002 9 16.2002C12.9764 16.2001 16.2002 12.9764 16.2002 9C16.2002 5.02359 12.9764 1.79987 9 1.7998ZM8.99512 4.50488C9.49233 4.50495 9.89551 4.90804 9.89551 5.40527V8.09961H12.5996C13.0968 8.09968 13.5 8.50277 13.5 9C13.5 9.49723 13.0968 9.90032 12.5996 9.90039H9.89551V12.6045C9.89551 13.1017 9.49233 13.5048 8.99512 13.5049C8.49785 13.5049 8.09473 13.1018 8.09473 12.6045V9.90039H5.40039C4.90312 9.90039 4.5 9.49727 4.5 9C4.5 8.50273 4.90312 8.09961 5.40039 8.09961H8.09473V5.40527C8.09473 4.908 8.49785 4.50488 8.99512 4.50488Z" fill="currentColor" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="更多操作"
                  data-testid="asset-edit-panel-action-more"
                  className="flex h-7 w-7 cursor-pointer items-center justify-center rounded bg-black/65 text-white hover:bg-black/80"
                  aria-haspopup="menu"
                  aria-expanded={actionMenuOpen}
                  onClick={(event) => {
                    event.stopPropagation()
                    setActionMenuOpen((open) => !open)
                  }}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {actionMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-[38px] z-[2] w-[160px] rounded-lg border border-[#363636] bg-[#242424] p-2 text-[13px] text-[#A8A8A8] shadow-[0_18px_48px_rgba(0,0,0,0.45)]"
                    onClick={stopWorkflowNodeChromeEvent}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-8 w-full cursor-pointer items-center rounded-md px-3 text-left transition-colors hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        setActionMenuOpen(false)
                        onOpenReplaceImage()
                      }}
                    >
                      替换图片
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-8 w-full cursor-pointer items-center rounded-md px-3 text-left transition-colors hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        setActionMenuOpen(false)
                        onOpenAiGenerate()
                      }}
                    >
                      AI 生{titlePrefix}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-8 w-full cursor-pointer items-center rounded-md px-3 text-left transition-colors hover:bg-white/10 hover:text-white"
                      onClick={(event) => {
                        event.stopPropagation()
                        setActionMenuOpen(false)
                        onClearImage()
                      }}
                    >
                      清除图片
                    </button>
                    <div className="my-1 h-px bg-[#363636]" />
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-8 w-full cursor-pointer items-center rounded-md px-3 text-left text-[#FF4D4F] transition-colors hover:bg-white/10"
                      onClick={(event) => {
                        event.stopPropagation()
                        setActionMenuOpen(false)
                        onDelete()
                      }}
                    >
                      删除
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 flex shrink-0 flex-col gap-2">
            <label htmlFor="asset-edit-panel-name" className="text-[13px] text-white">{nameLabel}</label>
            <input
              id="asset-edit-panel-name"
              data-testid="asset-edit-panel-name"
              className="h-9 w-full rounded-lg border-0 bg-white/[0.05] px-3 py-2 text-[13px] text-white outline-none placeholder:text-white/30"
              placeholder={nameLabel}
              value={asset.title || ""}
              onChange={(event) => onChange({ title: event.target.value })}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
            />
          </div>

          <div data-testid="asset-edit-panel-description-field" className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <label htmlFor="asset-edit-panel-description" className="text-[13px] text-white">{descriptionLabel}</label>
            </div>
            <textarea
              id="asset-edit-panel-description"
              data-testid="asset-edit-panel-description"
              className="tiny-scrollbar min-h-[180px] flex-1 resize-none rounded-lg border-0 bg-white/[0.05] p-3 text-[13px] leading-[1.6] text-white outline-none placeholder:text-white/30"
              placeholder={descriptionLabel}
              value={asset.prompt || ""}
              onChange={(event) => onChange({ prompt: event.target.value })}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
            />
          </div>
        </div>
      </section>
      {previewOpen && asset.imageUrl ? (
        <div
          className="fixed inset-0 z-[460] flex items-center justify-center bg-black/80 p-6"
          data-testid="asset-edit-panel-image-preview"
          onClick={(event) => {
            event.stopPropagation()
            setPreviewOpen(false)
          }}
        >
          <img
            alt={asset.title}
            className="max-h-[92vh] max-w-[86vw] object-contain shadow-[0_18px_70px_rgba(0,0,0,0.45)]"
            draggable={false}
            src={getScriptV2ImagePreviewUrl(asset.imageUrl, 1800)}
            onClick={stopWorkflowNodeChromeEvent}
          />
          <button
            type="button"
            aria-label="关闭预览"
            className="absolute right-[calc(7vw-10px)] top-[calc(4vh-10px)] flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/70"
            onClick={(event) => {
              event.stopPropagation()
              setPreviewOpen(false)
            }}
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

function ScriptV2BatchAssetModal({
  assetsByKind,
  missingOnly,
  generating,
  status,
  onGenerate,
  onClose,
}: {
  assetsByKind: LibTvScriptV2AssetsByKind
  missingOnly: boolean
  generating: boolean
  status: string
  onGenerate: (targets: ScriptV2BatchAssetTarget[], config: ScriptV2BatchImageConfig) => void
  onClose: () => void
}) {
  const initialTargets = useMemo(() => {
    return (["角色", "场景", "道具"] as ScriptV2AssetKind[])
      .flatMap((kind) => assetsByKind[kind])
      .filter((asset) => missingOnly ? !hasScriptV2AssetImage(asset) : true)
      .map((asset): ScriptV2BatchAssetTarget => ({
        ...asset,
        selected: true,
        editablePrompt: getScriptV2AssetImagePrompt(asset),
      }))
  }, [assetsByKind, missingOnly])
  const [targets, setTargets] = useState<ScriptV2BatchAssetTarget[]>(initialTargets)
  const [models, setModels] = useState<DynamicModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelId, setModelId] = useState("")
  const [quality, setQuality] = useState("")
  const [imageSize, setImageSize] = useState("")
  const [aspectRatio, setAspectRatio] = useState("")
  const [extraParameters, setExtraParameters] = useState<Record<string, WorkflowExtraParameterValue>>({})
  const [activeMenu, setActiveMenu] = useState<"model" | "quality" | "resolution" | "ratio" | null>(null)

  useEffect(() => {
    setTargets(initialTargets)
  }, [initialTargets])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !generating) onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [generating, onClose])

  useEffect(() => {
    let cancelled = false
    setModelsLoading(true)
    preloadModels()
      .then((items) => {
        if (cancelled) return
        const imageModels = items.filter((item) => String(item?.category || "").toLowerCase() === "image")
        setModels(imageModels)
        const preferred = imageModels.find((item) => isScriptV2PreferredImageModel(item, "lib-image-2"))
          || imageModels.find((item) => item.isDefault)
          || imageModels[0]
        if (preferred) setModelId((current) => current || getScriptV2ImageModelValue(preferred))
      })
      .catch((error) => {
        message.error(error instanceof Error ? error.message : "模型加载失败")
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedModel = useMemo(() => models.find((item) => {
    const value = getScriptV2ImageModelValue(item)
    return value === modelId || item.id === modelId
  }) || null, [modelId, models])

  const resolutionChoices = useMemo(() => uniqueScriptV2Choices((selectedModel?.parameters?.resolutions || [])
    .map((item, index) => normalizeScriptV2Choice(item, "resolution", index))
    .filter((item): item is ScriptV2Choice => Boolean(item))), [selectedModel])

  const ratioChoices = useMemo(() => uniqueScriptV2Choices((selectedModel?.parameters?.aspectRatios || [])
    .map((item, index) => normalizeScriptV2Choice(item, "ratio", index))
    .filter((item): item is ScriptV2Choice => Boolean(item))), [selectedModel])

  const extraParameterDefinitions = useMemo(() => getScriptV2ExtraParameterDefinitions(selectedModel), [selectedModel])
  const qualityDefinition = useMemo(() => getScriptV2QualityDefinition(extraParameterDefinitions), [extraParameterDefinitions])
  const nonQualityParameterDefinitions = useMemo(() => getScriptV2NonQualityDefinitions(extraParameterDefinitions), [extraParameterDefinitions])
  const qualityChoices = useMemo(() => {
    const choices = scriptV2ChoicesFromDefinition(qualityDefinition)
    return uniqueScriptV2Choices(choices.length ? choices : [{ value: "medium", label: "标准画质", paramKey: "quality" }])
  }, [qualityDefinition])

  const selectModel = useCallback((value: string) => {
    setModelId(value)
    setImageSize("")
    setAspectRatio("")
    setQuality("")
    setExtraParameters({})
    setActiveMenu(null)
  }, [])

  useEffect(() => {
    setImageSize((current) => current && resolutionChoices.some((item) => item.value === current) ? current : pickScriptV2DefaultChoice(resolutionChoices, ["2K", "2k", "1024p", "medium"]))
  }, [resolutionChoices])

  useEffect(() => {
    setAspectRatio((current) => current && ratioChoices.some((item) => item.value === current) ? current : pickScriptV2DefaultChoice(ratioChoices, ["2:1", "16:9", "1:1"]))
  }, [ratioChoices])

  useEffect(() => {
    setQuality((current) => current && qualityChoices.some((item) => item.value === current) ? current : pickScriptV2DefaultChoice(qualityChoices, ["medium", "标准画质"]))
  }, [qualityChoices])

  useEffect(() => {
    setExtraParameters(getWorkflowExtraParameterDefaults(nonQualityParameterDefinitions))
  }, [modelId, nonQualityParameterDefinitions])

  const selectedResolution = resolutionChoices.find((item) => item.value === imageSize)
  const selectedRatio = ratioChoices.find((item) => item.value === aspectRatio)
  const selectedQuality = qualityChoices.find((item) => item.value === quality)
  const selectedTargets = targets.filter((asset) => asset.selected)
  const allSelected = targets.length > 0 && selectedTargets.length === targets.length
  const generationCost = estimateImageGenerationPoints(selectedModel, Math.max(1, selectedTargets.length), selectedResolution?.value || selectedResolution?.label || imageSize, selectedQuality?.value || quality || undefined).totalPoints

  const updateTarget = (id: string, patch: Partial<ScriptV2BatchAssetTarget>) => {
    setTargets((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const renderMenu = (kind: "model" | "quality" | "resolution" | "ratio", items: Array<{ value: string; label: string }>, onSelect: (value: string) => void) => {
    if (activeMenu !== kind) return null
    return (
      <div className="absolute bottom-[calc(100%+6px)] left-0 z-[10032] max-h-[220px] min-w-[180px] overflow-auto rounded-xl border border-[#363636] bg-[#242424] p-1 shadow-[0_18px_48px_rgba(0,0,0,0.42)]">
        {items.map((item) => (
          <button
            key={`${kind}-${item.value}`}
            type="button"
            className="flex h-8 w-full cursor-pointer items-center rounded-lg px-2.5 text-left text-[12px] text-[#F7F7F7] transition-colors hover:bg-white/10"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(item.value)
              setActiveMenu(null)
            }}
          >
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    )
  }

  const renderChip = (kind: "model" | "quality" | "resolution" | "ratio", icon: React.ReactNode, label: string, value: string, items: Array<{ value: string; label: string }>, onSelect: (value: string) => void, testId: string) => (
    <div className="relative">
      <button
        type="button"
        data-testid={testId}
        data-selector-value={value}
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-[13px] text-[#F7F7F7] transition-colors hover:bg-white/[0.06]"
        aria-haspopup="menu"
        aria-expanded={activeMenu === kind}
        onClick={(event) => {
          event.stopPropagation()
          setActiveMenu((current) => current === kind ? null : kind)
        }}
      >
        <span className="inline-flex shrink-0 items-center">{icon}</span>
        <span className="whitespace-nowrap">{label}</span>
        <ChevronDown className="size-3 opacity-60" />
      </button>
      {renderMenu(kind, items, onSelect)}
    </div>
  )

  const renderGroup = (kind: ScriptV2AssetKind) => {
    const group = targets.filter((asset) => asset.kind === kind)
    if (group.length === 0) return null
    return (
      <div className="mb-3">
        <div className="mb-1.5 text-[11px] font-medium text-white/50">{kind} ({group.length})</div>
        {group.map((asset) => (
          <div key={asset.id} className="mb-1 flex items-start gap-2 rounded-md border border-white/10 px-3 py-2">
            <input
              className="nodrag mt-1 h-3.5 w-3.5 accent-white"
              type="checkbox"
              checked={asset.selected}
              disabled={generating}
              onChange={(event) => updateTarget(asset.id, { selected: event.target.checked })}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-medium text-white/85">{asset.title}</span>
                <span className="shrink-0 rounded bg-white/10 px-1 py-px text-[9px] text-white/50">{asset.kind}</span>
              </div>
              <textarea
                rows={2}
                className="mt-1 w-full resize-none rounded border border-white/10 bg-transparent px-2 py-1 text-[11px] text-white/65 outline-none"
                value={asset.editablePrompt}
                disabled={generating}
                onChange={(event) => updateTarget(asset.id, { editablePrompt: event.target.value })}
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
              />
            </div>
            <div className="flex shrink-0 items-center gap-1 pt-1" />
          </div>
        ))}
      </div>
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[10025] flex items-center justify-center bg-black/70 px-6"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <section className="w-[800px] max-w-[calc(100vw-40px)] overflow-hidden rounded-xl border border-white/10 bg-[#181818] text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]" role="dialog" aria-modal="true">
        <header className="flex h-[54px] items-center justify-between bg-[#181818] px-4">
          <h2 className="m-0 text-[16px] font-medium text-white">一键生成所有资产</h2>
          <button
            type="button"
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            disabled={generating}
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="p-4">
          <div className="max-h-[420px] overflow-auto pr-1">
            {renderGroup("角色")}
            {renderGroup("场景")}
            {renderGroup("道具")}
            {targets.length === 0 ? <div className="flex h-[180px] items-center justify-center text-sm text-white/45">暂无需要生成的资产</div> : null}
          </div>
          <div data-testid="batch-asset-footer" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <div data-testid="batch-asset-footer-left" className="flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    className="nodrag h-3.5 w-3.5 accent-white"
                    type="checkbox"
                    checked={allSelected}
                    disabled={generating || targets.length === 0}
                    onChange={(event) => setTargets((current) => current.map((item) => ({ ...item, selected: event.target.checked })))}
                  />
                  <span className="text-[11px] text-white/65">已选 {selectedTargets.length}/{targets.length}</span>
                </label>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <div data-testid="asset-batch-config" className="flex flex-wrap items-center gap-1">
                  {renderChip(
                    "model",
                    selectedModel?.icon ? <img alt="" aria-hidden="true" loading="lazy" className="size-3.5 object-contain" src={selectedModel.icon} /> : <span className="text-xs">◉</span>,
                    modelsLoading ? "模型加载中" : selectedModel?.name || "选择模型",
                    modelId,
                    models.map((item) => ({ value: getScriptV2ImageModelValue(item), label: item.name || getScriptV2ImageModelValue(item) })).filter((item) => item.value),
                    selectModel,
                    "asset-batch-config-chip-model"
                  )}
                  {renderChip("quality", <span className="text-[11px] font-semibold">HD</span>, selectedQuality?.label || "标准画质", quality, qualityChoices, setQuality, "asset-batch-config-chip-quality")}
                  {resolutionChoices.length > 0 ? renderChip("resolution", <span className="inline-block size-3 rounded-sm border border-current" />, selectedResolution?.label || imageSize || "尺寸", imageSize, resolutionChoices, setImageSize, "asset-batch-config-chip-resolution") : null}
                  {ratioChoices.length > 0 ? renderChip("ratio", <span className="inline-flex h-[14px] w-[14px] items-center justify-center"><span className="rounded-[2px] border-[1.5px] border-current" style={{ width: 14, height: 7 }} /></span>, selectedRatio?.label || aspectRatio || "比例", aspectRatio, ratioChoices, setAspectRatio, "asset-batch-config-chip-ratio") : null}
                </div>
              </div>
            </div>
            {nonQualityParameterDefinitions.length > 0 ? (
              <div className="basis-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 pb-3">
                <WorkflowExtraParametersPanel
                  definitions={nonQualityParameterDefinitions}
                  values={extraParameters}
                  disabled={generating}
                  onChange={(patch) => setExtraParameters((current) => ({ ...current, ...patch }))}
                />
              </div>
            ) : null}
            <div data-testid="batch-asset-footer-right" className="flex shrink-0 items-center gap-2">
              {status ? <span className="max-w-[180px] truncate text-xs text-white/55">{status}</span> : null}
              <span data-testid="generation-points-budget" className="flex items-center gap-1 text-xs text-white/65">
                <Zap className="size-3.5 fill-current" />
                <span>{formatBillingPoints(generationCost)}</span>
              </span>
              <button
                type="button"
                className="flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#F7F7F7] px-3 text-[13px] font-normal text-[#171717] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={generating || !selectedModel || selectedTargets.length === 0}
                onClick={(event) => {
                  event.stopPropagation()
                  const qualityKey = selectedQuality?.paramKey || qualityDefinition?.type || "quality"
                  onGenerate(
                    selectedTargets,
                    {
                      modelId,
                      imageSize: selectedResolution?.value,
                      aspectRatio: selectedRatio?.value,
                      quality: selectedQuality?.value,
                      qualityKey,
                      extraParameters,
                    }
                  )
                }}
              >
                {generating ? <ColorfulLoader className="size-3.5" thickness={2} /> : `生成(${selectedTargets.length})`}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ScriptV2AssetModal({
  label,
  projectId,
  canvasImageAssets,
  initialTab = "ai",
  initialPrompt = "",
  title = `新增${label}`,
  allowMultiple = true,
  onGeneratedAsset,
  onClose,
}: {
  label: ScriptV2AssetKind
  projectId?: string
  canvasImageAssets: ScriptV2CanvasImageAsset[]
  initialTab?: ScriptV2AssetModalInitialTab
  initialPrompt?: string
  title?: string
  allowMultiple?: boolean
  onGeneratedAsset: (asset: ScriptV2AssetItem) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<ScriptV2AssetModalInitialTab>(initialTab)
  const [models, setModels] = useState<DynamicModel[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState("")
  const [prompt, setPrompt] = useState(initialPrompt)
  const [modelId, setModelId] = useState("")
  const [quality, setQuality] = useState("")
  const [imageSize, setImageSize] = useState("")
  const [aspectRatio, setAspectRatio] = useState("")
  const [extraParameters, setExtraParameters] = useState<Record<string, WorkflowExtraParameterValue>>({})
  const [activeMenu, setActiveMenu] = useState<"model" | "quality" | "resolution" | "ratio" | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState("")
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const uploadDragDepthRef = useRef(0)
  const uploadInFlightRef = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [uploadDragging, setUploadDragging] = useState(false)
  const [uploadStatus, setUploadStatus] = useState("")
  const [uploadError, setUploadError] = useState("")

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (!uploading) onClose()
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [onClose, uploading])

  useEffect(() => {
    if (tab !== "ai") return
    let cancelled = false
    setModelsLoading(true)
    setModelsError("")
    preloadModels()
      .then((items) => {
        if (cancelled) return
        const imageModels = items.filter((item) => String(item?.category || "").toLowerCase() === "image")
        setModels(imageModels)
        const preferred = imageModels.find((item) => isScriptV2PreferredImageModel(item, "lib-image-2"))
          || imageModels.find((item) => item.isDefault)
          || imageModels[0]
        if (preferred) setModelId((current) => current || getScriptV2ImageModelValue(preferred))
      })
      .catch((error) => {
        if (cancelled) return
        const text = error instanceof Error ? error.message : "模型加载失败"
        setModelsError(text)
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab])

  const selectedModel = useMemo(() => {
    return models.find((item) => {
      const value = getScriptV2ImageModelValue(item)
      return value === modelId || item.id === modelId
    }) || null
  }, [modelId, models])

  const resolutionChoices = useMemo(() => {
    const choices = (selectedModel?.parameters?.resolutions || [])
      .map((item, index) => normalizeScriptV2Choice(item, "resolution", index))
      .filter((item): item is ScriptV2Choice => Boolean(item))
    return uniqueScriptV2Choices(choices)
  }, [selectedModel])

  const ratioChoices = useMemo(() => {
    const choices = (selectedModel?.parameters?.aspectRatios || [])
      .map((item, index) => normalizeScriptV2Choice(item, "ratio", index))
      .filter((item): item is ScriptV2Choice => Boolean(item))
    return uniqueScriptV2Choices(choices)
  }, [selectedModel])

  const extraParameterDefinitions = useMemo(() => getScriptV2ExtraParameterDefinitions(selectedModel), [selectedModel])
  const qualityDefinition = useMemo(() => getScriptV2QualityDefinition(extraParameterDefinitions), [extraParameterDefinitions])
  const nonQualityParameterDefinitions = useMemo(() => getScriptV2NonQualityDefinitions(extraParameterDefinitions), [extraParameterDefinitions])
  const qualityChoices = useMemo(() => {
    const choices = scriptV2ChoicesFromDefinition(qualityDefinition)
    if (choices.length > 0) return uniqueScriptV2Choices(choices)
    return [{ value: "medium", label: "标准画质", paramKey: "quality" }]
  }, [qualityDefinition])

  const selectModel = useCallback((value: string) => {
    setModelId(value)
    setImageSize("")
    setAspectRatio("")
    setQuality("")
    setExtraParameters({})
    setActiveMenu(null)
  }, [])

  useEffect(() => {
    const nextResolution = pickScriptV2DefaultChoice(resolutionChoices, ["2k", "1024p", "medium"])
    setImageSize((current) => current && resolutionChoices.some((item) => item.value === current) ? current : nextResolution)
  }, [resolutionChoices])

  useEffect(() => {
    const nextRatio = pickScriptV2DefaultChoice(ratioChoices, label === "角色" ? ["16:9", "2:1", "1:1"] : ["2:1", "16:9", "1:1"])
    setAspectRatio((current) => current && ratioChoices.some((item) => item.value === current) ? current : nextRatio)
  }, [label, ratioChoices])

  useEffect(() => {
    const nextQuality = pickScriptV2DefaultChoice(qualityChoices, ["medium", "标准画质"])
    setQuality((current) => current && qualityChoices.some((item) => item.value === current) ? current : nextQuality)
  }, [qualityChoices])

  useEffect(() => {
    setExtraParameters(getWorkflowExtraParameterDefaults(nonQualityParameterDefinitions))
  }, [modelId, nonQualityParameterDefinitions])

  const selectedResolution = resolutionChoices.find((item) => item.value === imageSize)
  const selectedRatio = ratioChoices.find((item) => item.value === aspectRatio)
  const selectedQuality = qualityChoices.find((item) => item.value === quality)
  const generationCost = useMemo(() => {
    return estimateImageGenerationPoints(selectedModel, 1, selectedResolution?.value || selectedResolution?.label || imageSize, selectedQuality?.value || quality || undefined).totalPoints
  }, [imageSize, quality, selectedModel, selectedQuality?.value, selectedResolution])

  const runAiGeneration = useCallback(async () => {
    const finalPrompt = prompt.trim()
    if (!finalPrompt || generating) return
    if (!projectId) {
      message.error("项目未初始化，无法创建图片生成任务")
      return
    }
    const selectedModelId = getScriptV2ImageModelValue(selectedModel)
    if (!selectedModelId) {
      message.warning("请先选择图片模型")
      return
    }
    setGenerating(true)
    setGenerationStatus(SCRIPT_V2_IMAGE_GENERATING_LABEL)
    try {
      const extraParameterKey = selectedQuality?.paramKey || qualityDefinition?.type || "quality"
      const generationPrompt = buildScriptV2AssetGenerationPrompt(label, finalPrompt)
      const request: Record<string, any> = {
        prompt: generationPrompt,
        rawPrompt: finalPrompt,
        model: selectedModelId,
        count: 1,
        n: 1,
        forceSingle: true,
        category: "script_v2_asset_generation",
        scriptV2AssetKind: label,
      }
      if (selectedRatio?.value) request.aspectRatio = selectedRatio.value
      if (selectedResolution?.value) request.imageSize = selectedResolution.value
      if (selectedQuality?.value) request[extraParameterKey] = selectedQuality.value
      Object.assign(request, flattenWorkflowExtraParameterValues(extraParameters))
      const createdJob = await createScriptV2AssetGenerationJob({ projectId, request })
      const completedJob = await waitScriptV2AssetGenerationJob(createdJob.id, (label) => setGenerationStatus(label))
      const resultUrls = collectScriptV2AssetResultUrls(completedJob?.resultData?.response || completedJob?.resultData || completedJob?.resultUrl || completedJob)
      const resultUrl = resultUrls[0]
      if (!resultUrl) throw new Error("图片生成未返回结果")
      onGeneratedAsset({
        id: `scriptv2-asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        kind: label,
        title: `${label} ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`,
        imageUrl: resultUrl,
        prompt: finalPrompt,
        modelId: selectedModelId,
        aspectRatio: selectedRatio?.value,
        imageSize: selectedResolution?.value,
        quality: selectedQuality?.value,
        createdAt: Date.now(),
      })
      message.success(`${label}已生成`)
      onClose()
    } catch (error) {
      const text = error instanceof Error ? error.message : "图片生成失败"
      message.error(text)
      setGenerationStatus(text)
    } finally {
      setGenerating(false)
    }
  }, [extraParameters, generating, label, onClose, onGeneratedAsset, projectId, prompt, qualityDefinition, selectedModel, selectedQuality, selectedRatio, selectedResolution])

  const renderChipMenu = (kind: "model" | "quality" | "resolution" | "ratio", items: Array<{ value: string; label: string }>, onSelect: (value: string) => void) => {
    if (activeMenu !== kind) return null
    return (
      <div className="absolute bottom-[calc(100%+6px)] left-0 z-[2] max-h-[220px] min-w-[180px] overflow-auto rounded-xl border border-[#363636] bg-[#2A2A2A] p-1 shadow-[0_18px_48px_rgba(0,0,0,0.42)]">
        {items.map((item) => (
          <button
            key={`${kind}-${item.value}`}
            type="button"
            className="flex h-8 w-full cursor-pointer items-center rounded-lg px-2.5 text-left text-[12px] text-[#F7F7F7] transition-colors hover:bg-white/10"
            onClick={(event) => {
              event.stopPropagation()
              onSelect(item.value)
              setActiveMenu(null)
            }}
          >
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>
    )
  }

  const renderConfigChip = (kind: "model" | "quality" | "resolution" | "ratio", labelText: string, items: Array<{ value: string; label: string }>, onSelect: (value: string) => void, testId: string, value: string) => (
    <div className="relative">
      <button
        type="button"
        data-testid={testId}
        data-selector-value={value}
        className="flex h-8 cursor-pointer items-center gap-1 rounded-lg bg-white/[0.08] px-2.5 text-[12px] font-medium text-white/82 transition-colors hover:bg-white/[0.12]"
        onClick={(event) => {
          event.stopPropagation()
          setActiveMenu((current) => current === kind ? null : kind)
        }}
      >
        <span className="max-w-[132px] truncate">{labelText}</span>
        <ChevronDown className="size-3 text-white/45" />
      </button>
      {renderChipMenu(kind, items, onSelect)}
    </div>
  )

  const selectCanvasImage = useCallback((asset: ScriptV2CanvasImageAsset) => {
    onGeneratedAsset({
      id: `scriptv2-canvas-asset-${asset.id}-${Date.now()}`,
      kind: label,
      title: asset.title || label,
      imageUrl: asset.imageUrl,
      prompt: asset.prompt || "",
      modelId: "canvas",
      createdAt: Date.now(),
    })
    message.success(`已添加${label}`)
    onClose()
  }, [label, onClose, onGeneratedAsset])

  const uploadLocalFiles = useCallback(async (files: File[]) => {
    if (uploadInFlightRef.current) return
    const inputFiles = Array.from(files || []).filter(Boolean)
    const supportedFiles = inputFiles.filter(isScriptV2AssetUploadFile)
    const unsupportedFiles = inputFiles.filter((file) => !isScriptV2AssetUploadFile(file))
    const uploadFiles = allowMultiple ? supportedFiles : supportedFiles.slice(0, 1)
    const ignoredExtraCount = Math.max(0, supportedFiles.length - uploadFiles.length)

    if (uploadFiles.length === 0) {
      const errorText = inputFiles.length > 0
        ? "仅支持 PNG、JPG、JPEG、WebP 或 GIF 图片"
        : "请选择要上传的图片"
      setUploadStatus("")
      setUploadError(errorText)
      message.warning(errorText)
      return
    }

    uploadInFlightRef.current = true
    setUploading(true)
    setUploadDragging(false)
    setUploadError("")
    setUploadStatus(`正在上传 1/${uploadFiles.length}`)

    let successCount = 0
    const failedFiles: string[] = []
    const uploadedAssets: ScriptV2AssetItem[] = []
    for (let index = 0; index < uploadFiles.length; index += 1) {
      const file = uploadFiles[index]
      setUploadStatus(`正在上传 ${index + 1}/${uploadFiles.length}：${file.name}`)
      try {
        const { publicUrl, libtvUrl } = await uploadCanvasNodeFile(file)
        const uploadedUrl = String(libtvUrl || publicUrl || "").trim()
        if (!uploadedUrl) throw new Error("资源上传结果为空")
        uploadedAssets.push({
          id: `scriptv2-upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          kind: label,
          title: getScriptV2UploadedAssetTitle(file, label),
          imageUrl: uploadedUrl,
          prompt: "",
          modelId: "local-upload",
          createdAt: Date.now(),
        })
        successCount += 1
      } catch (error) {
        failedFiles.push(`${file.name}：${error instanceof Error ? error.message : "上传失败"}`)
      }
    }

    uploadInFlightRef.current = false
    setUploading(false)

    if (!allowMultiple && uploadedAssets.length > 0) {
      const skippedCount = unsupportedFiles.length + ignoredExtraCount
      if (skippedCount > 0) {
        message.warning(`已使用第一张有效图片，另有 ${skippedCount} 个文件未处理`)
      } else {
        message.success(`已上传${label}图片`)
      }
      onGeneratedAsset(uploadedAssets[0])
      onClose()
      return
    }

    uploadedAssets.forEach(onGeneratedAsset)
    const skippedCount = unsupportedFiles.length + ignoredExtraCount
    if (failedFiles.length > 0 || skippedCount > 0) {
      const details = [
        failedFiles.length > 0 ? failedFiles.slice(0, 2).join("；") + (failedFiles.length > 2 ? `；另有 ${failedFiles.length - 2} 张失败` : "") : "",
        unsupportedFiles.length > 0 ? `${unsupportedFiles.length} 个文件格式不支持` : "",
        ignoredExtraCount > 0 ? `${ignoredExtraCount} 张已忽略（替换时只能选择 1 张）` : "",
      ].filter(Boolean).join("，")
      const errorText = `${successCount > 0 ? `已上传 ${successCount} 张，` : ""}${details}`
      setUploadStatus(successCount > 0 ? `已上传 ${successCount}/${inputFiles.length} 张` : "")
      setUploadError(errorText)
      if (failedFiles.length > 0) message.error(errorText)
      else message.warning(errorText)
      return
    }

    setUploadStatus(`已上传 ${successCount} 张`)
    message.success(successCount > 1 ? `已上传 ${successCount} 张图片` : `已上传${label}图片`)
    onClose()
  }, [allowMultiple, label, onClose, onGeneratedAsset])

  const handleLocalUploadInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files || [])
    event.currentTarget.value = ""
    void uploadLocalFiles(files)
  }, [uploadLocalFiles])

  const handleLocalUploadDrop = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    uploadDragDepthRef.current = 0
    setUploadDragging(false)
    if (uploading) return
    void uploadLocalFiles(Array.from(event.dataTransfer.files || []))
  }, [uploadLocalFiles, uploading])

  return createPortal(
    <div
      className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/55 px-6"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={(event) => {
        event.stopPropagation()
        if (!uploading) onClose()
      }}
    >
      <section
        className="w-[640px] max-w-[calc(100vw-48px)] overflow-hidden rounded-xl border border-[#363636] bg-[#212121] text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scriptv2-asset-modal-title"
        onClick={stopWorkflowNodeChromeEvent}
      >
        <header className="flex h-12 items-center justify-between border-b border-[#363636] bg-[#212121] px-4">
          <h2 id="scriptv2-asset-modal-title" className="m-0 text-[14px] font-medium leading-6 text-[#F7F7F7]">{title}</h2>
          <button
            type="button"
            className="flex size-7 cursor-pointer items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/10 hover:text-white/85"
            aria-label="关闭"
            disabled={uploading}
            onClick={(event) => {
              event.stopPropagation()
              if (!uploading) onClose()
            }}
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="px-0 pb-4 pt-4">
          <input
            ref={uploadInputRef}
            accept={SCRIPT_V2_ASSET_UPLOAD_ACCEPT}
            className="hidden"
            type="file"
            multiple={allowMultiple}
            disabled={uploading}
            onChange={handleLocalUploadInputChange}
          />
          <div className="mb-4 flex gap-6 px-4 text-[13px]">
            {[
              { id: "ai" as const, label: "AI生成" },
              { id: "canvas" as const, label: "从当前画布选择" },
              { id: "upload" as const, label: "本地上传" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={uploading}
                className={`cursor-pointer leading-5 transition-colors ${tab === item.id ? "font-medium text-[#F7F7F7]" : "font-normal text-[#919191] hover:text-white/85"}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setTab(item.id)
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="h-[480px] overflow-hidden">
            {tab === "ai" ? (
              <div className="flex h-full min-h-0 flex-col gap-2 px-4">
                <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[#363636] bg-black/[0.14] p-2">
                  <textarea
                    placeholder="开始你的设计"
                    className="h-full w-full flex-1 resize-none bg-transparent p-1 text-[14px] leading-[1.8] text-white outline-none placeholder:text-[#A8A8A8]"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    disabled={generating}
                  />
                  {modelsError ? <div className="px-1 pb-1 text-[12px] text-red-300">{modelsError}</div> : null}
                </div>
                {nonQualityParameterDefinitions.length > 0 ? (
                  <div className="max-h-[150px] shrink-0 overflow-y-auto rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 pb-3">
                    <WorkflowExtraParametersPanel
                      definitions={nonQualityParameterDefinitions}
                      values={extraParameters}
                      disabled={generating}
                      onChange={(patch) => setExtraParameters((current) => ({ ...current, ...patch }))}
                    />
                  </div>
                ) : null}
                <div className="flex items-center gap-1 py-2">
                  <div data-testid="ai-generate-config" className="flex flex-1 flex-wrap items-center gap-1">
                    {renderConfigChip(
                      "model",
                      modelsLoading ? "模型加载中" : selectedModel?.name || "选择模型",
                      models.map((item) => ({ value: getScriptV2ImageModelValue(item), label: item.name || getScriptV2ImageModelValue(item) })).filter((item) => item.value),
                      selectModel,
                      "ai-generate-config-chip-model",
                      modelId,
                    )}
                    {renderConfigChip("quality", selectedQuality?.label || "标准画质", qualityChoices, setQuality, "ai-generate-config-chip-quality", quality)}
                    {resolutionChoices.length > 0 ? renderConfigChip("resolution", selectedResolution?.label || imageSize || "尺寸", resolutionChoices, setImageSize, "ai-generate-config-chip-resolution", imageSize) : null}
                    {ratioChoices.length > 0 ? renderConfigChip("ratio", selectedRatio?.label || aspectRatio || "比例", ratioChoices, setAspectRatio, "ai-generate-config-chip-ratio", aspectRatio) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1 text-[12px] font-medium text-white/72">
                      <Zap className="size-3.5 fill-[#FFD15C] text-[#FFD15C]" />
                      {formatBillingPoints(generationCost)}
                    </span>
                    <button
                      type="button"
                      className="flex h-8 min-w-[82px] cursor-pointer items-center justify-center rounded-lg bg-white px-4 text-xs font-medium text-neutral-900 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
                      disabled={!prompt.trim() || !selectedModel || generating}
                      onClick={(event) => {
                        event.stopPropagation()
                        void runAiGeneration()
                      }}
                    >
                      {generating ? <ColorfulLoader className="size-3.5" thickness={2} /> : "确认生成"}
                    </button>
                  </div>
                </div>
                {generating && generationStatus ? <div className="-mt-2 px-1 text-[12px] text-white/45">{generationStatus}</div> : null}
              </div>
            ) : tab === "canvas" ? (
              <div className="tiny-scrollbar h-full overflow-auto px-4">
                {canvasImageAssets.length > 0 ? (
                  <div className="grid grid-cols-4 gap-3 pb-1">
                    {canvasImageAssets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className="group/canvas-asset relative h-[132px] cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-black/20 text-left transition-colors hover:border-white/35"
                        title={asset.title}
                        onClick={(event) => {
                          event.stopPropagation()
                          selectCanvasImage(asset)
                        }}
                      >
                        <img
                          src={getScriptV2ImagePreviewUrl(asset.imageUrl, 480)}
                          alt={asset.title}
                          className="h-full w-full object-cover"
                          draggable={false}
                          decoding="async"
                          loading="eager"
                        />
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/82 to-transparent p-2 pt-8">
                          <div className="truncate text-[11px] font-medium leading-4 text-white/90">{asset.title}</div>
                          {asset.prompt ? <div className="truncate text-[10px] leading-4 text-white/46">{asset.prompt}</div> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/45">当前画布没有可选择的图片</div>
                )}
              </div>
            ) : tab === "upload" ? (
              <div className="flex h-full min-h-0 flex-col px-4">
                <button
                  type="button"
                  data-testid="scriptv2-local-upload-dropzone"
                  aria-busy={uploading}
                  disabled={uploading}
                  className={`flex h-full w-full flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-[45px] py-7 transition-colors disabled:cursor-wait ${uploadDragging ? "border-[#5DDCFF] bg-[#5DDCFF]/[0.08]" : "cursor-pointer border-[#525252] bg-black/[0.14] hover:border-white/40 hover:bg-black/[0.20]"}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!uploading) uploadInputRef.current?.click()
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (uploading) return
                    uploadDragDepthRef.current += 1
                    setUploadDragging(true)
                  }}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (!uploading) event.dataTransfer.dropEffect = "copy"
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    uploadDragDepthRef.current = Math.max(0, uploadDragDepthRef.current - 1)
                    if (uploadDragDepthRef.current === 0) setUploadDragging(false)
                  }}
                  onDrop={handleLocalUploadDrop}
                >
                  {uploading ? (
                    <>
                      <ColorfulLoader className="size-6" thickness={3} />
                      <div className="max-w-full truncate text-center text-sm font-medium leading-5 text-[#F7F7F7]">{uploadStatus || "正在上传图片..."}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-center text-sm font-medium leading-5">
                        <span className="text-[#5DDCFF] underline underline-offset-2">点击上传</span>
                        <span className="text-[#F7F7F7]"> 或 </span>
                        <span className="text-[#A8A8A8]">拖拽本地图片至此上传</span>
                      </div>
                      <div className="text-center text-[12px] leading-[1.6] text-[#919191]">
                        支持 PNG、JPG、WebP、GIF{allowMultiple ? "，可一次上传多张" : "，替换时仅上传一张"}
                      </div>
                    </>
                  )}
                  {uploadError ? <div role="alert" className="max-w-full text-center text-[12px] leading-5 text-red-300">{uploadError}</div> : null}
                </button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-sm text-white/45">功能开发中</div>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

function ScriptV2PromptTable({
  result,
  assetsByKind,
  onRowChange,
  onRowsChange,
  onDeleteRow,
  onAddRow,
  onComposeAll,
  composeOnFooter = true,
  composeButtonLabel = "一键合成全部提示词",
  composeDisabled = false,
}: {
  result: LibTvStoryboardScriptResult | null | undefined
  assetsByKind?: ScriptV2AssetsByKind
  onRowChange?: (rowIndex: number, key: LibTvStoryboardScriptColumnKey, value: string) => void
  onRowsChange?: (rows: LibTvStoryboardScriptRow[]) => void
  onDeleteRow?: (rowIndex: number) => void
  onAddRow: () => void
  onComposeAll: () => void
  composeOnFooter?: boolean
  composeButtonLabel?: string
  composeDisabled?: boolean
}) {
  const rows = Array.isArray(result?.rows) ? result.rows : []
  const [editingCell, setEditingCell] = useState<ScriptV2CellEditor | null>(null)
  const [editorText, setEditorText] = useState("")
  const [rowColorByIndex, setRowColorByIndex] = useState<Record<number, string>>({})
  const [operationMenu, setOperationMenu] = useState<{ rowIndex: number; x: number; y: number } | null>(null)
  const [promptViewer, setPromptViewer] = useState<{
    rowIndex: number
    title: string
    imageGenerationPrompt: string
    videoMotionPrompt: string
  } | null>(null)
  const tableMinWidth = SCRIPT_V2_PROMPT_COLUMNS.reduce((sum, column) => sum + column.width, 0)

  const openCellEditor = useCallback((rowIndex: number, key: LibTvStoryboardScriptColumnKey) => {
    const row = rows[rowIndex]
    if (!row || key === "shotNumber") return
    setEditingCell({ rowIndex, key })
    setEditorText(getScriptV2RowValue(row, key))
    setOperationMenu(null)
  }, [rows])

  const saveCellEditor = useCallback(() => {
    if (!editingCell) return
    onRowChange?.(editingCell.rowIndex, editingCell.key, editorText)
    setEditingCell(null)
  }, [editingCell, editorText, onRowChange])

  const composeRowPrompt = useCallback((rowIndex: number) => {
    const row = rows[rowIndex]
    if (!row) return
    const draft = buildScriptV2PromptDraft(row, assetsByKind)
    const nextStoryboardPrompt = draft.imageGenerationPrompt || "待补充画面描述后生成提示词"
    const nextMotionPrompt = draft.videoMotionPrompt || "待补充运镜信息后生成视频运动提示词"
    if (onRowsChange) {
      onRowsChange(rows.map((item, index) => index === rowIndex ? {
        ...item,
        storyboardPrompt: nextStoryboardPrompt,
        motionPrompt: nextMotionPrompt,
      } : item))
    } else {
      onRowChange?.(rowIndex, "storyboardPrompt", nextStoryboardPrompt)
      onRowChange?.(rowIndex, "motionPrompt", nextMotionPrompt)
    }
    setPromptViewer({
      rowIndex,
      title: `第 ${String(row.shotNumber || rowIndex + 1).trim()} 镜：最终提示词`,
      imageGenerationPrompt: nextStoryboardPrompt,
      videoMotionPrompt: nextMotionPrompt,
    })
  }, [assetsByKind, onRowChange, onRowsChange, rows])

  const openPromptViewer = useCallback((rowIndex: number) => {
    const row = rows[rowIndex]
    if (!row) return
    const draft = buildScriptV2PromptDraft(row, assetsByKind)
    setPromptViewer({
      rowIndex,
      title: `第 ${String(row.shotNumber || rowIndex + 1).trim()} 镜：最终提示词`,
      imageGenerationPrompt: getScriptV2RowValue(row, "storyboardPrompt") || draft.imageGenerationPrompt,
      videoMotionPrompt: getScriptV2RowValue(row, "motionPrompt") || draft.videoMotionPrompt,
    })
  }, [assetsByKind, rows])

  const renderTextCell = (row: LibTvStoryboardScriptRow, rowIndex: number, column: ScriptV2PromptColumn) => {
    const key = column.key as LibTvStoryboardScriptColumnKey
    const value = getScriptV2RowValue(row, key)
    const isPromptColumn = key === "storyboardPrompt"
    const isReadonly = key === "shotNumber"
    if (isPromptColumn) {
      const hasPrompt = Boolean(value || getScriptV2RowValue(row, "motionPrompt"))
      if (!composeOnFooter) {
        return (
          <div
            className="flex h-full min-h-[60px] w-full items-center justify-center py-1 text-xs leading-none text-fg-subtle"
            data-script-text-cell="true"
            title="请到第 3 步合成提示词"
          >
            待合成
          </div>
        )
      }
      return (
        <button
          type="button"
          className="group flex h-full min-h-[60px] w-full cursor-pointer items-center justify-center py-1 text-xs leading-none"
          data-script-text-cell="true"
          title={hasPrompt ? "点击查看提示词" : "点击生成提示词"}
          onClick={(event) => {
            event.stopPropagation()
            if (hasPrompt) openPromptViewer(rowIndex)
            else composeRowPrompt(rowIndex)
          }}
        >
          <span className="inline-flex items-center justify-center gap-1 transition-all group-hover:h-[32px] group-hover:w-[96px] group-hover:rounded-lg group-hover:border group-hover:border-border-emphasis group-hover:bg-canvas-controls-hover">
            <span className={hasPrompt ? "text-fg-default" : "text-fg-subtle"}>{hasPrompt ? "查看提示词" : "生成提示词"}</span>
          </span>
        </button>
      )
    }
    if (column.presets?.length && !value) {
      return (
        <button
          type="button"
          className={`box-border flex min-h-[60px] w-full cursor-pointer items-start whitespace-pre-wrap px-1 py-1.5 text-left text-[12px] leading-normal text-fg-muted ${column.align === "center" ? "!items-center !justify-center !text-center" : ""}`}
          data-script-text-cell="true"
          title={`点击选择${column.label}`}
          onClick={(event) => {
            event.stopPropagation()
            openCellEditor(rowIndex, key)
          }}
        >
          <span className="text-fg-disabled">+</span>
        </button>
      )
    }
    return (
      <button
        type="button"
        className={`box-border flex min-h-[60px] w-full cursor-pointer items-start whitespace-pre-wrap px-1 py-1.5 text-left text-[12px] leading-normal ${value ? "text-fg-default" : "text-fg-disabled"} ${column.align === "center" ? "!items-center !justify-center !text-center" : ""}`}
        data-script-text-cell="true"
        title={isReadonly ? column.label : `点击编辑${column.label}`}
        onClick={(event) => {
          event.stopPropagation()
          if (!isReadonly) openCellEditor(rowIndex, key)
        }}
        style={{ wordBreak: "break-word" }}
      >
        <span className={key === "duration" ? "tabular-nums" : undefined}>{value || column.placeholder || "+"}</span>
      </button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 tiny-scrollbar overflow-auto px-6 pb-4 pt-2">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <div data-testid="scriptv2-table-root" className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-[var(--canvas-node-border,#363636)] bg-[var(--Surface-Panel-background)] text-fg-default">
              <div className="tiny-scrollbar min-h-0 w-full flex-1 overflow-auto">
                <table className="w-full border-collapse" style={{ minWidth: tableMinWidth }}>
                  <thead className="sticky top-[-1px] z-10 bg-bg-surface-secondary">
                    <tr>
                      {SCRIPT_V2_PROMPT_COLUMNS.map((column) => (
                        <th
                          key={column.key}
                          data-column-id={column.key}
                          data-emphasized-column={column.emphasized ? "true" : undefined}
                          className={`relative select-none border border-[var(--canvas-node-border,#363636)] px-2 py-3.5 text-[12px] font-medium text-fg-muted ${column.align === "center" ? "text-center" : "text-left"}`}
                          style={{ width: column.width, background: column.emphasized ? "var(--workflow-script-emphasis-background)" : "var(--bg-surface-secondary)" }}
                        >
                          <span className="group relative inline-block">{column.label}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => {
                      const color = rowColorByIndex[rowIndex]
                      const colorClassName = SCRIPT_V2_ROW_COLORS.find((item) => item.id === color)?.className || ""
                      return (
                        <tr key={`${row.shotNumber || rowIndex}-${rowIndex}`} className={`group max-h-[120px] hover:bg-canvas-controls-hover ${colorClassName}`}>
                          {SCRIPT_V2_PROMPT_COLUMNS.map((column) => {
                            if (column.key === "operations") {
                              return (
                                <td key={column.key} data-column-id={column.key} className="relative border border-[var(--canvas-node-border,#363636)] align-middle" style={{ width: column.width, padding: 0 }}>
                                  <div className="flex h-full min-h-[60px] items-center justify-center">
                                    <button
                                      type="button"
                                      className="nodrag flex h-5 w-5 items-center justify-center rounded text-fg-muted hover:bg-canvas-controls-hover hover:text-fg-default"
                                      title="行操作"
                                      aria-label="行操作"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        const rect = event.currentTarget.getBoundingClientRect()
                                        setOperationMenu({ rowIndex, x: rect.left - 126, y: rect.bottom + 8 })
                                      }}
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </button>
                                  </div>
                                </td>
                              )
                            }
                            return (
                              <td key={column.key} data-column-id={column.key} className="relative border border-[var(--canvas-node-border,#363636)] align-middle" style={{ width: column.width, padding: 0 }}>
                                <div className={column.align === "center" ? "" : "tiny-scrollbar"} style={{ minHeight: 60, maxHeight: 120, overflow: column.align === "center" ? "hidden" : "hidden auto" }}>
                                  {renderTextCell(row, rowIndex, column)}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {rows.length === 0 ? <div className="flex min-h-[240px] items-center justify-center text-sm text-fg-muted">暂无镜头</div> : null}
              </div>
              <div data-testid="scriptv2-prompt-table-footer" className="flex h-[56px] shrink-0 items-center justify-between gap-3 border-t border-[var(--canvas-node-border,#363636)] bg-[var(--Surface-Panel-background)] px-6">
                <button
                  type="button"
                  data-testid="scriptv2-prompt-table-footer-append"
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-fg-default transition-colors hover:bg-canvas-controls-hover"
                  onClick={(event) => {
                    event.stopPropagation()
                    onAddRow()
                  }}
                >
                  <span className="text-xl font-light leading-none">+</span>
                  添加镜头
                </button>
                <button
                  type="button"
                  aria-label="合成最终提示词"
                  data-testid="scriptv2-prompt-table-footer-recompute"
                  className="flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[var(--btn-invert-bg)] px-5 text-xs font-medium text-[var(--btn-invert-text)] transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={composeDisabled}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (composeDisabled) return
                    if (composeOnFooter && onRowsChange) {
                      onRowsChange(rows.map((row) => {
                        const draft = buildScriptV2PromptDraft(row, assetsByKind)
                        return {
                          ...row,
                          storyboardPrompt: draft.imageGenerationPrompt || "待补充画面描述后生成提示词",
                          motionPrompt: draft.videoMotionPrompt || "待补充运镜信息后生成视频运动提示词",
                        }
                      }))
                    } else if (composeOnFooter) {
                      rows.forEach((_row, index) => composeRowPrompt(index))
                    }
                    onComposeAll()
                  }}
                >
                  {composeButtonLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editingCell ? createPortal(
        <div
          className="fixed inset-0 z-[10040]"
          onClick={(event) => {
            event.stopPropagation()
            saveCellEditor()
          }}
        >
          <div
            className="fixed z-[10041] w-[440px] rounded-xl border border-[#363636] bg-[#111] p-4 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
            style={{ left: "50%", top: "42%", transform: "translate(-50%, -50%)" }}
            onClick={stopWorkflowNodeChromeEvent}
          >
            <textarea
              className="h-[110px] w-full resize-none rounded-lg border border-[#2f2f2f] bg-[#151515] p-3 text-sm leading-6 text-white outline-none placeholder:text-white/28"
              value={editorText}
              placeholder={SCRIPT_V2_PROMPT_COLUMNS.find((item) => item.key === editingCell.key)?.placeholder || "请输入内容"}
              onChange={(event) => setEditorText(event.target.value)}
              onKeyDown={(event) => {
                event.stopPropagation()
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") saveCellEditor()
              }}
              autoFocus
            />
            {SCRIPT_V2_PROMPT_COLUMNS.find((item) => item.key === editingCell.key)?.presets?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {SCRIPT_V2_PROMPT_COLUMNS.find((item) => item.key === editingCell.key)?.presets?.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="rounded-md border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-white/72 transition-colors hover:bg-white/[0.10] hover:text-white"
                    onClick={(event) => {
                      event.stopPropagation()
                      setEditorText((current) => current ? `${current} ${preset}` : preset)
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-white/40">失焦自动保存</div>
              <button
                type="button"
                className="h-8 cursor-pointer rounded-lg bg-white px-4 text-xs font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
                onClick={(event) => {
                  event.stopPropagation()
                  saveCellEditor()
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {promptViewer ? createPortal(
        <div
          className="fixed inset-0 z-[10035] bg-black/70 backdrop-blur-[2px]"
          onClick={(event) => {
            event.stopPropagation()
            setPromptViewer(null)
          }}
        >
          <section
            className="absolute left-1/2 top-1/2 w-[980px] max-w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[12px] border border-[#363636] bg-[#212121] text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scriptv2-prompt-viewer-title"
            onClick={stopWorkflowNodeChromeEvent}
          >
            <div className="flex items-center gap-1 border-b border-[#363636] px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span id="scriptv2-prompt-viewer-title" className="truncate text-sm text-white">{promptViewer.title}</span>
              </div>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-black/5"
                aria-label="关闭"
                onClick={(event) => {
                  event.stopPropagation()
                  setPromptViewer(null)
                }}
              >
                <X className="h-3.5 w-3.5 text-[#F7F7F7]" />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-4 pb-4 pt-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[13px] text-white">
                  分镜提示词
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] leading-none text-emerald-500" title="分镜图提示词·已生成">
                    <Check className="h-3 w-3" />
                    <span>分镜图提示词·已生成</span>
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-[12px] border-[0.5px] border-[#363636] bg-[#141414]">
                  <textarea
                    className="min-h-[180px] w-full resize-none bg-transparent p-3 text-[12px] leading-[1.6] text-white outline-none"
                    value={promptViewer.imageGenerationPrompt}
                    readOnly
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[13px] text-white">
                  视频运动提示词
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[10px] leading-none text-emerald-500" title="视频运动提示词·已生成">
                    <Check className="h-3 w-3" />
                    <span>视频运动提示词·已生成</span>
                  </span>
                </div>
                <div className="relative overflow-hidden rounded-[12px] border-[0.5px] border-[#363636] bg-[#141414]">
                  <textarea
                    className="min-h-[180px] w-full resize-none bg-transparent p-3 text-[12px] leading-[1.6] text-white outline-none"
                    value={promptViewer.videoMotionPrompt}
                    readOnly
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="flex h-8 cursor-pointer items-center justify-center rounded-md bg-white px-3 text-xs font-medium text-[#141414] transition-colors hover:bg-white/90"
                  onClick={(event) => {
                    event.stopPropagation()
                    composeRowPrompt(promptViewer.rowIndex)
                  }}
                >
                  重新合成提示词
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}

      {operationMenu ? createPortal(
        <div className="fixed inset-0 z-[10030]" onClick={() => setOperationMenu(null)}>
          <div
            className="fixed z-[10031] min-w-[150px] rounded-md border border-[#363636] bg-[#202020] py-1 shadow-lg"
            style={{ left: operationMenu.x, top: operationMenu.y }}
            onClick={stopWorkflowNodeChromeEvent}
          >
            <div className="px-3 pb-1 pt-2 text-[11px] text-white/45">请选择颜色</div>
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <button
                type="button"
                aria-label="清除颜色"
                title="清除"
                className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-neutral-800 ring-1 ring-inset ring-white/20"
                onClick={(event) => {
                  event.stopPropagation()
                  setRowColorByIndex((current) => {
                    const next = { ...current }
                    delete next[operationMenu.rowIndex]
                    return next
                  })
                  setOperationMenu(null)
                }}
              >
                <span className="absolute h-px w-6 -rotate-45 bg-red-500" />
              </button>
              {SCRIPT_V2_ROW_COLORS.map((item) => {
                const active = rowColorByIndex[operationMenu.rowIndex] === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`relative flex h-5 w-5 items-center justify-center rounded-full ring-1 ring-inset transition-transform ${item.swatch} ${active ? "scale-105 ring-white/60" : "ring-black/10 hover:scale-105"}`}
                    title={item.label}
                    aria-label={`标记为${item.label}色`}
                    onClick={(event) => {
                      event.stopPropagation()
                      setRowColorByIndex((current) => ({ ...current, [operationMenu.rowIndex]: item.id }))
                      setOperationMenu(null)
                    }}
                  >
                    {active ? <Check className="size-3 text-white" strokeWidth={2.5} /> : null}
                  </button>
                )
              })}
            </div>
            <div className="my-1 border-t border-white/10" />
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-red-500 transition-colors hover:bg-white/10"
              onClick={(event) => {
                event.stopPropagation()
                onDeleteRow?.(operationMenu.rowIndex)
                setOperationMenu(null)
              }}
            >
              <Trash2 className="size-3.5" />
              删除该行
            </button>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  )
}

export function ScriptV2Workspace({
  title,
  shotCount,
  table: _table,
  scriptResult,
  projectId,
  canvasImageAssets = [],
  initialStep,
  initialAssetsByKind,
  onRowChange,
  onRowsChange,
  onDeleteRow,
  onStepChange,
  onAssetsChange,
  onPrepareAssets,
  preparingAssets = false,
  onComposePromptsComplete,
  onAddRow,
  onClose,
  onComposeAll,
}: ScriptV2WorkspaceProps) {
  const [assetModalRequest, setAssetModalRequest] = useState<ScriptV2AssetModalRequest | null>(null)
  const [batchAssetModalOpen, setBatchAssetModalOpen] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<ScriptV2SelectedAsset | null>(null)
  const hasExplicitScriptAssets = Boolean(
    scriptResult?.characterAssets?.length ||
    scriptResult?.characterProfiles?.length ||
    scriptResult?.sceneProfiles?.length ||
    scriptResult?.propProfiles?.length
  )
  const hasInitialAssets = Boolean(
    initialAssetsByKind &&
    (["角色", "场景", "道具"] as ScriptV2AssetKind[]).some((kind) => Array.isArray(initialAssetsByKind[kind]) && initialAssetsByKind[kind].length > 0)
  )
  const derivedAssetsByKind = useMemo<ScriptV2AssetsByKind>(() => (
    hasExplicitScriptAssets || hasInitialAssets
      ? deriveLibTvScriptV2AssetsByKind(scriptResult)
      : { "角色": [], "场景": [], "道具": [] }
  ), [hasExplicitScriptAssets, hasInitialAssets, scriptResult])
  const initialCurrentScriptAssetsByKind = useMemo<ScriptV2AssetsByKind>(() => (
    mergeScriptV2AssetsForCurrentScript(derivedAssetsByKind, initialAssetsByKind)
  ), [derivedAssetsByKind, initialAssetsByKind])
  const [step, setStep] = useState<ScriptV2WorkspaceStep>(initialStep || "confirm-shots")
  const lastExternalStepRef = useRef<ScriptV2WorkspaceStep>(initialStep || "confirm-shots")
  const skipNextStepPersistRef = useRef(false)
  const [batchGeneratingAssets, setBatchGeneratingAssets] = useState(false)
  const [batchGenerationStatus, setBatchGenerationStatus] = useState("")
  const [assetGenerationStatusById, setAssetGenerationStatusById] = useState<Record<string, ScriptV2AssetGenerationStatus>>({})
  const cancelledAssetIdsRef = useRef<Set<string>>(new Set())
  const recoveringAssetJobIdsRef = useRef<Set<string>>(new Set())
  const workspaceMountedRef = useRef(true)
  const [assetsByKind, setAssetsByKind] = useState<LibTvScriptV2AssetsByKind>(initialCurrentScriptAssetsByKind)

  useEffect(() => () => {
    workspaceMountedRef.current = false
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  useEffect(() => {
    const nextStep = initialStep || "confirm-shots"
    if (lastExternalStepRef.current === nextStep) return
    lastExternalStepRef.current = nextStep
    skipNextStepPersistRef.current = true
    setStep(nextStep)
  }, [initialStep])

  const activeIndex = SCRIPT_V2_STEPS.findIndex((item) => item.id === step)
  const totalAssets = assetsByKind["角色"].length + assetsByKind["场景"].length + assetsByKind["道具"].length
  const readyAssetCount = assetsByKind["角色"].filter(hasScriptV2AssetImage).length
    + assetsByKind["场景"].filter(hasScriptV2AssetImage).length
    + assetsByKind["道具"].filter(hasScriptV2AssetImage).length
  const missingAssetCount = Math.max(0, totalAssets - readyAssetCount)
  const hasAssetGenerationRunning = batchGeneratingAssets || Object.values(assetGenerationStatusById).some((item) => ["queued", "creating", "running"].includes(item.status))
  const missingAssetCounts = useMemo<Record<ScriptV2AssetKind, number>>(() => ({
    "角色": assetsByKind["角色"].filter((asset) => !hasScriptV2AssetImage(asset)).length,
    "场景": assetsByKind["场景"].filter((asset) => !hasScriptV2AssetImage(asset)).length,
    "道具": assetsByKind["道具"].filter((asset) => !hasScriptV2AssetImage(asset)).length,
  }), [assetsByKind])
  const missingAssetText = useMemo(() => buildScriptV2MissingAssetText(missingAssetCounts), [missingAssetCounts])
  const promptRows = Array.isArray(scriptResult?.rows) ? scriptResult.rows : []
  const composedPromptCount = promptRows.filter((row) => getScriptV2RowValue(row, "storyboardPrompt")).length
  const composeAllPromptRows = useCallback(() => promptRows.map((row) => {
    const draft = buildScriptV2PromptDraft(row, assetsByKind)
    return {
      ...row,
      storyboardPrompt: draft.imageGenerationPrompt || "待补充画面描述后生成提示词",
      motionPrompt: draft.videoMotionPrompt || "待补充运镜信息后生成视频运动提示词",
    }
  }), [assetsByKind, promptRows])
  const hints = useMemo<Record<ScriptV2WorkspaceStep, string>>(() => ({
    "confirm-shots": `${shotCount || 0}个镜头已就绪`,
    "prepare-assets": `${readyAssetCount}/${totalAssets} 已生成、还差 ${missingAssetCount} 个`,
    "compose-prompts": `${composedPromptCount}/${shotCount || 0} 已合成`,
  }), [composedPromptCount, missingAssetCount, readyAssetCount, shotCount, totalAssets])
  const selectedAssetItem = selectedAsset
    ? assetsByKind[selectedAsset.kind].find((asset) => asset.id === selectedAsset.id) || null
    : null

  const handleGeneratedAsset = useCallback((asset: ScriptV2AssetItem) => {
    setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
      ...current,
      [asset.kind]: [asset, ...current[asset.kind]],
    }))
  }, [])

  const handleAssetModalResult = useCallback((asset: ScriptV2AssetItem) => {
    const targetId = assetModalRequest?.targetId
    if (!targetId) {
      handleGeneratedAsset(asset)
      return
    }
    setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
      ...current,
      [asset.kind]: current[asset.kind].map((item) => item.id === targetId ? {
        ...item,
        imageUrl: asset.imageUrl,
        prompt: asset.prompt || item.prompt,
        modelId: asset.modelId,
        aspectRatio: asset.aspectRatio,
        imageSize: asset.imageSize,
        quality: asset.quality,
        createdAt: asset.createdAt || Date.now(),
      } : item),
    }))
    message.success(`已替换${asset.kind}图片`)
    setAssetModalRequest(null)
  }, [assetModalRequest?.targetId, handleGeneratedAsset])

  const handleSelectAsset = useCallback((asset: ScriptV2AssetItem) => {
    setSelectedAsset({ kind: asset.kind, id: asset.id })
  }, [])

  const handleUpdateSelectedAsset = useCallback((patch: Partial<ScriptV2AssetItem>) => {
    if (!selectedAsset) return
    setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
      ...current,
      [selectedAsset.kind]: current[selectedAsset.kind].map((asset) => (
        asset.id === selectedAsset.id ? { ...asset, ...patch, kind: selectedAsset.kind, id: selectedAsset.id } : asset
      )),
    }))
  }, [selectedAsset])

  const handleClearSelectedAssetImage = useCallback(() => {
    if (!selectedAsset) return
    setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
      ...current,
      [selectedAsset.kind]: current[selectedAsset.kind].map((asset) => (
        asset.id === selectedAsset.id ? { ...asset, imageUrl: "" } : asset
      )),
    }))
  }, [selectedAsset])

  const handleDeleteSelectedAsset = useCallback(() => {
    if (!selectedAsset) return
    setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
      ...current,
      [selectedAsset.kind]: current[selectedAsset.kind].filter((asset) => asset.id !== selectedAsset.id),
    }))
    setSelectedAsset(null)
  }, [selectedAsset])

  const handleCancelAssetGeneration = useCallback((assetId: string) => {
    cancelledAssetIdsRef.current.add(assetId)
    setAssetGenerationStatusById((current) => {
      const next = { ...current }
      delete next[assetId]
      return next
    })
  }, [])

  const handleBatchGenerateAssets = useCallback(async (targets: ScriptV2BatchAssetTarget[], imageConfig: ScriptV2BatchImageConfig) => {
    if (batchGeneratingAssets) return
    if (!projectId) {
      message.error("项目未初始化，无法创建图片生成任务")
      return
    }
    const selectedTargets = targets.filter((asset) => asset.selected)
    if (selectedTargets.length === 0) {
      message.warning("暂无可生成的资产")
      return
    }
    cancelledAssetIdsRef.current = new Set()
    setBatchGeneratingAssets(true)
    setBatchAssetModalOpen(false)
    setBatchGenerationStatus(`正在生成 ${selectedTargets.length} 个资产...`)
    setAssetGenerationStatusById((current) => {
      const next = { ...current }
      selectedTargets.forEach((asset) => {
        next[asset.id] = { status: "queued", progress: 5, label: SCRIPT_V2_IMAGE_GENERATING_LABEL }
      })
      return next
    })
    try {
      let successCount = 0
      const roleTargets = selectedTargets.filter((asset) => asset.kind === "角色")
      const remainingTargets = selectedTargets.filter((asset) => asset.kind !== "角色")

      const commitGeneratedAsset = (asset: ScriptV2BatchAssetTarget, resultUrl: string) => {
        const patch = {
          imageUrl: resultUrl,
          modelId: imageConfig.modelId,
          aspectRatio: imageConfig.aspectRatio,
          imageSize: imageConfig.imageSize,
          quality: imageConfig.quality,
          generationError: undefined,
          createdAt: Date.now(),
        }
        setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
          ...current,
          [asset.kind]: current[asset.kind].map((item) => item.id === asset.id ? {
            ...item,
            ...patch,
          } : item),
        }))
      }

      const runAssetGeneration = async (asset: ScriptV2BatchAssetTarget) => {
        const assetPrompt = String(asset.editablePrompt || getScriptV2AssetImagePrompt(asset)).trim()
        if (!assetPrompt) throw new Error(`${asset.title || asset.kind} 缺少生成提示词`)
        if (cancelledAssetIdsRef.current.has(asset.id)) throw new Error("已取消")
        setAssetGenerationStatusById((current) => ({
          ...current,
          [asset.id]: { ...(current[asset.id] || {}), status: "creating", progress: 5, label: SCRIPT_V2_IMAGE_GENERATING_LABEL },
        }))
        const generationPrompt = buildScriptV2AssetGenerationPrompt(asset.kind, assetPrompt, asset.title)
        const request: Record<string, any> = {
          prompt: generationPrompt,
          rawPrompt: assetPrompt,
          model: imageConfig.modelId,
          count: 1,
          n: 1,
          forceSingle: true,
          category: "script_v2_asset_generation",
          scriptV2AssetKind: asset.kind,
          scriptV2AssetId: asset.id,
        }
        if (imageConfig.aspectRatio) request.aspectRatio = imageConfig.aspectRatio
        if (imageConfig.imageSize) request.imageSize = imageConfig.imageSize
        if (imageConfig.quality) request[imageConfig.qualityKey || "quality"] = imageConfig.quality
        Object.assign(request, flattenWorkflowExtraParameterValues(imageConfig.extraParameters))
        const createdJob = await createScriptV2AssetGenerationJob({ projectId, request })
        setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
          ...current,
          [asset.kind]: current[asset.kind].map((item) => item.id === asset.id ? {
            ...item,
            modelId: imageConfig.modelId,
            aspectRatio: imageConfig.aspectRatio,
            imageSize: imageConfig.imageSize,
            quality: imageConfig.quality,
            generationJobId: createdJob.id,
            generationProviderKey: extractLibTvProviderKeyFromRuntimeId(imageConfig.modelId),
            generationError: undefined,
          } : item),
        }))
        setAssetGenerationStatusById((current) => ({
          ...current,
          [asset.id]: { ...(current[asset.id] || {}), status: "running", progress: 5, label: SCRIPT_V2_IMAGE_GENERATING_LABEL, jobId: createdJob.id },
        }))
        const completedJob = await waitScriptV2AssetGenerationJob(
          createdJob.id,
          (label, progress) => {
            if (cancelledAssetIdsRef.current.has(asset.id)) return
            setAssetGenerationStatusById((current) => ({
              ...current,
              [asset.id]: {
                ...(current[asset.id] || {}),
                status: "running",
                progress,
                label,
                jobId: createdJob.id,
              },
            }))
          },
          () => cancelledAssetIdsRef.current.has(asset.id)
        )
        if (cancelledAssetIdsRef.current.has(asset.id)) throw new Error("已取消")
        const resultUrls = collectScriptV2AssetResultUrls(completedJob?.resultData?.response || completedJob?.resultData || completedJob?.resultUrl || completedJob)
        const resultUrl = resultUrls[0]
        if (!resultUrl) throw new Error(`${asset.title || asset.kind} 图片生成未返回结果`)
        const externalTask = completedJob?.resultData?.externalTask && typeof completedJob.resultData.externalTask === "object"
          ? completedJob.resultData.externalTask
          : null
        setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
          ...current,
          [asset.kind]: current[asset.kind].map((item) => item.id === asset.id ? {
            ...item,
            generationJobId: createdJob.id,
            generationTaskId: String(externalTask?.taskId || "").trim() || item.generationTaskId,
            generationTaskType: String(externalTask?.taskType || "").trim() || item.generationTaskType,
            generationProviderKey: String(externalTask?.providerKey || extractLibTvProviderKeyFromRuntimeId(imageConfig.modelId)).trim().toLowerCase() || item.generationProviderKey,
            generationError: undefined,
          } : item),
        }))
        commitGeneratedAsset(asset, resultUrl)
        setAssetGenerationStatusById((current) => {
          const next = { ...current }
          delete next[asset.id]
          return next
        })
        successCount += 1
        return resultUrl
      }

      const runStage = async (stageTargets: ScriptV2BatchAssetTarget[]) => {
        if (stageTargets.length === 0) return []
        return Promise.allSettled(stageTargets.map(runAssetGeneration))
      }

      if (roleTargets.length > 0) {
        setBatchGenerationStatus(`正在生成 ${roleTargets.length} 个人物图...`)
        remainingTargets.forEach((asset) => {
          if (asset.kind !== "场景") return
          setAssetGenerationStatusById((current) => ({
            ...current,
            [asset.id]: { ...(current[asset.id] || {}), status: "queued", progress: 1, label: SCRIPT_V2_IMAGE_GENERATING_LABEL },
          }))
        })
      }
      const roleResults = await runStage(roleTargets)
      if (remainingTargets.length > 0) {
        setBatchGenerationStatus(`正在生成 ${remainingTargets.length} 个场景/道具资产...`)
      }
      const remainingResults = await runStage(remainingTargets)
      const results = [...roleResults, ...remainingResults]
      const settledTargets = [...roleTargets, ...remainingTargets]
      results.forEach((result, index) => {
        if (result.status !== "rejected") return
        const failedAsset = settledTargets[index]
        if (!failedAsset) return
        const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason || "资产生成失败")
        if (errorMessage === "已取消") return
        setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
          ...current,
          [failedAsset.kind]: current[failedAsset.kind].map((item) => item.id === failedAsset.id ? { ...item, generationError: errorMessage } : item),
        }))
        setAssetGenerationStatusById((current) => ({
          ...current,
          [failedAsset.id]: {
            ...(current[failedAsset.id] || {}),
            status: "failed",
            progress: 100,
            label: errorMessage,
          },
        }))
      })
      const failedResults = results.filter((item) => item.status === "rejected")
      const activeFailures = failedResults.filter((item) => {
        const reason = item.reason
        const text = reason instanceof Error ? reason.message : String(reason || "")
        return text !== "已取消"
      })
      if (successCount > 0) message.success(successCount === selectedTargets.length ? "资产已生成" : `已生成 ${successCount}/${selectedTargets.length} 个资产`)
      if (activeFailures.length > 0) {
        const reason = activeFailures[0].reason
        message.error(reason instanceof Error ? reason.message : "部分资产生成失败")
      }
      setBatchGenerationStatus("")
    } catch (error) {
      const text = error instanceof Error ? error.message : "资产生成失败"
      message.error(text)
      setBatchGenerationStatus(text)
    } finally {
      setBatchGeneratingAssets(false)
      setAssetGenerationStatusById((current) => {
        const next = { ...current }
        selectedTargets.forEach((asset) => {
          if (next[asset.id]?.status !== "failed") delete next[asset.id]
        })
        return next
      })
    }
  }, [batchGeneratingAssets, projectId])

  useEffect(() => {
    ;(["角色", "场景", "道具"] as ScriptV2AssetKind[]).forEach((kind) => {
      assetsByKind[kind].forEach((asset) => {
        const jobId = String(asset.generationJobId || "").trim()
        const activeStatus = assetGenerationStatusById[asset.id]?.status
        if (!jobId || hasScriptV2AssetImage(asset) || asset.generationError || recoveringAssetJobIdsRef.current.has(jobId)) return
        if (activeStatus === "queued" || activeStatus === "creating" || activeStatus === "running") return
        recoveringAssetJobIdsRef.current.add(jobId)
        setAssetGenerationStatusById((current) => ({
          ...current,
          [asset.id]: { status: "running", progress: 5, label: SCRIPT_V2_IMAGE_GENERATING_LABEL, jobId },
        }))
        void waitScriptV2AssetGenerationJob(
          jobId,
          (label, progress) => {
            if (!workspaceMountedRef.current) return
            setAssetGenerationStatusById((current) => ({
              ...current,
              [asset.id]: { status: "running", progress, label, jobId },
            }))
          },
          () => !workspaceMountedRef.current
        ).then((completedJob) => {
          if (!workspaceMountedRef.current) return
          const resultUrls = collectScriptV2AssetResultUrls(completedJob?.resultData?.response || completedJob?.resultData || completedJob?.resultUrl || completedJob)
          const resultUrl = resultUrls[0]
          if (!resultUrl) throw new Error(`${asset.title || asset.kind} 图片生成未返回结果`)
          const externalTask = completedJob?.resultData?.externalTask && typeof completedJob.resultData.externalTask === "object"
            ? completedJob.resultData.externalTask
            : null
          setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
            ...current,
            [kind]: current[kind].map((item) => item.id === asset.id ? {
              ...item,
              imageUrl: resultUrl,
              generationJobId: jobId,
              generationTaskId: String(externalTask?.taskId || "").trim() || item.generationTaskId,
              generationTaskType: String(externalTask?.taskType || "").trim() || item.generationTaskType,
              generationProviderKey: String(externalTask?.providerKey || item.generationProviderKey || extractLibTvProviderKeyFromRuntimeId(item.modelId)).trim().toLowerCase() || undefined,
              generationError: undefined,
              createdAt: Date.now(),
            } : item),
          }))
          setAssetGenerationStatusById((current) => {
            const next = { ...current }
            delete next[asset.id]
            return next
          })
        }).catch((error) => {
          if (!workspaceMountedRef.current || String((error as Error)?.message || "") === "已取消") return
          const errorMessage = error instanceof Error ? error.message : "资产生成失败"
          setAssetsByKind((current: LibTvScriptV2AssetsByKind) => ({
            ...current,
            [kind]: current[kind].map((item) => item.id === asset.id ? { ...item, generationError: errorMessage } : item),
          }))
          setAssetGenerationStatusById((current) => ({
            ...current,
            [asset.id]: { status: "failed", progress: 100, label: errorMessage, jobId },
          }))
        }).finally(() => {
          recoveringAssetJobIdsRef.current.delete(jobId)
        })
      })
    })
  }, [assetGenerationStatusById, assetsByKind])

  useEffect(() => {
    setAssetsByKind((current: LibTvScriptV2AssetsByKind) => {
      const next = mergeScriptV2AssetsForCurrentScript(initialCurrentScriptAssetsByKind, current)
      if (
        areScriptV2AssetListsEqual(current["角色"], next["角色"])
        && areScriptV2AssetListsEqual(current["场景"], next["场景"])
        && areScriptV2AssetListsEqual(current["道具"], next["道具"])
      ) {
        return current
      }
      return next
    })
  }, [initialCurrentScriptAssetsByKind])

  useEffect(() => {
    if (skipNextStepPersistRef.current) {
      skipNextStepPersistRef.current = false
      return
    }
    onStepChange?.(step, assetsByKind)
  }, [assetsByKind, onStepChange, step])

  useEffect(() => {
    onAssetsChange?.(assetsByKind)
  }, [assetsByKind, onAssetsChange])

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col text-white"
      style={{ zIndex: 400, background: "#2D2D2D" }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div data-testid="scriptv2-fullscreen-container" className="flex h-full flex-col" aria-label={title || "脚本"}>
          <div data-testid="scriptv2-fullscreen-stepper-row" className="relative flex h-16 shrink-0 items-center px-6">
            <div data-testid="scriptv2-fullscreen-stepper-shell" className="absolute left-1/2 top-1/2 my-0 flex h-14 w-[80vw] max-w-[min(1280px,calc(100vw-420px))] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
              <div data-testid="scriptv2-stepper-track" className="flex min-w-0 items-center justify-center gap-1.5">
                {SCRIPT_V2_STEPS.map((item, index) => {
                  const active = item.id === step
                  const complete = index < activeIndex
                  const ready = item.id === "confirm-shots" ? shotCount : item.id === "prepare-assets" ? readyAssetCount : composedPromptCount
                  const total = item.id === "confirm-shots" ? shotCount : item.id === "prepare-assets" ? totalAssets : shotCount
                  return (
                    <React.Fragment key={item.id}>
                      <button
                        type="button"
                        data-testid={`scriptv2-step-${item.id}`}
                        data-current={active}
                        data-complete={complete}
                        className={`flex min-w-[72px] cursor-pointer items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:opacity-80 ${active ? "bg-white/[0.08] text-white/88" : "bg-transparent text-white/88"}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          setStep(item.id)
                        }}
                      >
                        <ScriptV2StepRing index={item.index} active={active} complete={complete} ready={ready} total={total} />
                        <div className="flex min-w-0 flex-col gap-1">
                          <div className={`truncate text-[13px] font-normal leading-normal ${active ? "text-[#F7F7F7]" : "text-[#919191]"}`}>{item.label}</div>
                          <div className={`truncate text-xs leading-4 ${active ? "text-[#A8A8A8]" : "text-[#919191]"}`}>{hints[item.id]}</div>
                        </div>
                      </button>
                      {index < SCRIPT_V2_STEPS.length - 1 ? <div data-testid={`scriptv2-step-connector-${item.id}`} className="h-px w-[120px] max-w-[120px] shrink-0 bg-[#363636]" /> : null}
                    </React.Fragment>
                  )
                })}
              </div>
            </div>
            <div data-testid="scriptv2-fullscreen-step-summary" className="relative z-10 ml-auto shrink-0 whitespace-nowrap text-xs leading-[18px] text-[#F7F7F7]">{Math.min(SCRIPT_V2_STEPS.length, Math.max(1, activeIndex + 1))}/{SCRIPT_V2_STEPS.length} 完成后可批量生视频</div>
            <button
              type="button"
              data-testid="scriptv2-fullscreen-close"
              className="relative z-10 ml-6 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
              title="关闭 (ESC)"
              onClick={(event) => {
                event.stopPropagation()
                onClose()
              }}
            >
              <X className="size-3" />
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            {step === "confirm-shots" ? (
              <ScriptV2PromptTable
                result={scriptResult}
                onRowChange={onRowChange}
                onRowsChange={onRowsChange}
                onDeleteRow={onDeleteRow}
                onAddRow={onAddRow}
                onComposeAll={() => {
                  onPrepareAssets?.()
                }}
                composeOnFooter={false}
                composeButtonLabel={preparingAssets ? "正在提取资产..." : "→ 下一步：准备资产"}
                composeDisabled={preparingAssets}
              />
            ) : step === "compose-prompts" ? (
              <ScriptV2PromptTable
                result={scriptResult}
                onRowChange={onRowChange}
                onRowsChange={onRowsChange}
                onDeleteRow={onDeleteRow}
                onAddRow={onAddRow}
                onComposeAll={onComposeAll}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex h-full w-full flex-col">
                  <div className="tiny-scrollbar min-h-0 flex-1 overflow-auto px-6 py-3">
                    <div className="flex flex-col gap-7">
                      <ScriptV2AssetPlaceholder
                        label="角色"
                        assets={assetsByKind["角色"]}
                        generationStatusById={assetGenerationStatusById}
                        onAdd={(kind) => setAssetModalRequest({ kind })}
                        onSelectAsset={handleSelectAsset}
                        onCancelGeneration={handleCancelAssetGeneration}
                      />
                      <ScriptV2AssetPlaceholder
                        label="场景"
                        assets={assetsByKind["场景"]}
                        generationStatusById={assetGenerationStatusById}
                        onAdd={(kind) => setAssetModalRequest({ kind })}
                        onSelectAsset={handleSelectAsset}
                        onCancelGeneration={handleCancelAssetGeneration}
                      />
                      <ScriptV2AssetPlaceholder
                        label="道具"
                        assets={assetsByKind["道具"]}
                        generationStatusById={assetGenerationStatusById}
                        onAdd={(kind) => setAssetModalRequest({ kind })}
                        onSelectAsset={handleSelectAsset}
                        onCancelGeneration={handleCancelAssetGeneration}
                      />
                    </div>
                  </div>
                  <div data-testid="scriptv2-asset-bottombar" className="flex shrink-0 items-center justify-between gap-3 border-t border-[#363636] bg-[#1f1f1f] px-6 py-4">
                    <div className="flex items-center gap-2 text-xs">
                      {missingAssetCount > 0 ? (
                        <AlertCircle className="size-4 shrink-0 text-[#FF7D00]" />
                      ) : (
                        <CheckCircle2 className="size-4 shrink-0 text-[#15B373]" />
                      )}
                      <span className="text-white/85">
                        {batchGenerationStatus || (missingAssetCount > 0 ? missingAssetText : "资产已生成，如再次生成将会覆盖之前的图片/场景/道具等资产")}
                      </span>
                    </div>
                    <button
                      type="button"
                      title={missingAssetCount > 0 ? "一键生成所有资产" : "下一步：合成提示词"}
                      data-testid="scriptv2-asset-bottombar-batch-generate"
                      className="flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white px-5 text-xs font-medium text-neutral-900 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/45"
                      disabled={hasAssetGenerationRunning}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (missingAssetCount > 0) {
                          setBatchAssetModalOpen(true)
                        } else {
                          const nextRows = composeAllPromptRows()
                          if (nextRows.length > 0) {
                            onRowsChange?.(nextRows)
                          }
                          onComposePromptsComplete?.(nextRows, assetsByKind)
                          onComposeAll()
                          setStep("compose-prompts")
                          onClose()
                        }
                      }}
                    >
                      {batchGeneratingAssets ? <ColorfulLoader className="size-3.5" thickness={2} /> : missingAssetCount > 0 ? "一键生成所有资产" : "→ 下一步：合成提示词"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {assetModalRequest ? (
        <ScriptV2AssetModal
          label={assetModalRequest.kind}
          projectId={projectId}
          canvasImageAssets={canvasImageAssets}
          initialTab={assetModalRequest.initialTab}
          initialPrompt={assetModalRequest.initialPrompt}
          title={assetModalRequest.targetId ? "选择图片" : `新增${assetModalRequest.kind}`}
          allowMultiple={!assetModalRequest.targetId}
          onGeneratedAsset={handleAssetModalResult}
          onClose={() => setAssetModalRequest(null)}
        />
      ) : null}
      {batchAssetModalOpen ? (
        <ScriptV2BatchAssetModal
          assetsByKind={assetsByKind}
          missingOnly={missingAssetCount > 0}
          generating={batchGeneratingAssets}
          status={batchGenerationStatus}
          onGenerate={handleBatchGenerateAssets}
          onClose={() => {
            if (!batchGeneratingAssets) setBatchAssetModalOpen(false)
          }}
        />
      ) : null}
      {selectedAssetItem ? (
        <ScriptV2AssetEditDrawer
          asset={selectedAssetItem}
          onChange={handleUpdateSelectedAsset}
          onOpenReplaceImage={() => {
            setAssetModalRequest({
              kind: selectedAssetItem.kind,
              targetId: selectedAssetItem.id,
              initialTab: "canvas",
              initialPrompt: selectedAssetItem.prompt || selectedAssetItem.title || "",
            })
          }}
          onOpenAiGenerate={() => {
            setAssetModalRequest({
              kind: selectedAssetItem.kind,
              targetId: selectedAssetItem.id,
              initialTab: "ai",
              initialPrompt: selectedAssetItem.prompt || selectedAssetItem.title || "",
            })
          }}
          onClearImage={handleClearSelectedAssetImage}
          onDelete={handleDeleteSelectedAsset}
          onClose={() => setSelectedAsset(null)}
        />
      ) : null}
    </div>,
    document.body,
  )
}
