"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useSearchParams } from "@/workflow/ideart/shims/next-navigation";
import dynamic from "@/workflow/ideart/shims/next-dynamic";
import type {
  Edge,
  Node as ReactFlowNode,
  ReactFlowInstance,
} from "@xyflow/react";
import { message } from "@/workflow/ideart/shims/antd";
import { useShallow } from "zustand/react/shallow";
import {
  useCanvasStore,
  type CanvasLayer,
} from "@/workflow/ideart/lib/store/canvas-store";
import { fetchSSE } from "@/workflow/ideart/lib/api/chat-sse";
import { workflowFetch as fetch } from "@/workflow/backend/client";
import {
  resumeWorkflowPredictionTasks,
  runWorkflowPrediction,
  type WorkflowPredictionTaskEvent,
} from "@/workflow/ideart/lib/wavespeed/workflow-runtime";
import {
  isOfficialSeedanceTaskContext,
  pollUnifiedVideoTaskUntilTerminal,
  queryUnifiedVideoTaskStatus,
  resolveProviderVideoPollIntervalMs,
  resolveUnifiedProviderTaskType,
} from "@/workflow/ideart/lib/utils/video-task-polling";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodexSupportWidget } from "@/workflow/ideart/components/codex/codex-support-widget";
import {
  buildCanvasProjectContentDocument,
  DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT,
  normalizeCanvasProjectContent,
  normalizeLibTvProjectCanvases,
  normalizeLibTvProjectCanvasViewport,
  type LibTvProjectCanvas,
  type LibTvProjectCanvasViewport,
} from "@/workflow/ideart/lib/canvas-project-content";
import {
  EMPTY_LIBTV_WORKFLOW_STATE,
  LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT,
  LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH,
  getLibTvWorkflowBounds,
  hasRecoverableWorkflowVideoGenerationTask,
  normalizeLibTvWorkflowState,
  type LibTvWorkflowEdge,
  type LibTvDirectorConsole3DCapture,
  type LibTvWorkflowNode,
  type LibTvWorkflowNodeKind,
  type LibTvWorkflowState,
} from "@/workflow/ideart/lib/libtv/workflow";
import {
  createEmptyStoryboardScriptRow,
  deriveLibTvScriptV2AssetsByKind,
  getLibTvScriptV2RowPropNames,
  normalizeLibTvStoryboardScriptResult,
  type LibTvScriptV2AssetItem,
  type LibTvScriptV2AssetKind,
  type LibTvStoryboardScriptResult,
  type LibTvStoryboardScriptRow,
} from "@/workflow/ideart/lib/libtv/script";
import {
  LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
  LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
  LIBTV_TAPNOW_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_GENERATOR_WIDTH,
  LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
  LIBTV_TAPNOW_SCRIPT_HEIGHT,
  LIBTV_TAPNOW_SCRIPT_WIDTH,
  LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
  LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_VIDEO_GENERATOR_WIDTH,
  LIBTV_TAPNOW_VIDEO_HEIGHT,
  LIBTV_TAPNOW_VIDEO_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import {
  buildLibTvImagePresetPrompt,
  getLibTvImagePresetById,
} from "@/workflow/ideart/lib/libtv/image-presets";
import { buildWorkflowStoryboardImagePrompt } from "@/workflow/ideart/lib/libtv/storyboard-image-prompt";
import {
  LIBTV_DEFAULT_ORDINARY_IMAGE_URL,
  uploadCanvasNodeFile,
} from "../libtv-upload-utils";
import {
  DEFAULT_STORYBOARD_SCRIPT_INPUT_TEXT,
  createWorkflowMarkdownTextContent,
  createWorkflowTextEditorInitialContent,
  fetchWorkflowModelOptions,
  getWorkflowGeneratorControlsForCodex,
  LibTvWorkflowSurface,
  resolveWorkflowAudioEndpointRuntimeId,
  resolveWorkflowImageMethodForModel,
  resolveWorkflowModelOptionById,
  resolveWorkflowVideoMethodForModel,
  type WorkflowAngleEditCreateRequest,
  type WorkflowEmotionAdjustmentCreateRequest,
  type WorkflowGenerationSubmitSettings,
  type WorkflowImageExpandRequest,
  type WorkflowImageGridSplitRequest,
  type WorkflowImageUpscaleRequest,
  type WorkflowOverlayNodeData,
  type WorkflowStoryboardGenerateRequest,
  type WorkflowStoryboardVideoGenerateRequest,
  type WorkflowVideoCropRequest,
  type WorkflowVideoTrimRequest,
  type WorkflowVideoUpscaleRequest,
} from "../libtv-workflow-surface";
import type { LibTvDirectorConsole3DVideoExport } from "../libtv-workflow-surface/nodes/director-console-3d";
import {
  normalizeWorkflowExtraParameterDefinitions,
  resolveWorkflowExtraParameterValues,
} from "../libtv-workflow-surface/workflow-extra-parameters";
import { useCanvasDataEffects } from "../hooks/use-canvas-data-effects";
import {
  fetchAndDownload,
  resolveImageDownloadUrl,
  triggerBrowserDownload,
} from "@/workflow/ideart/lib/url/download-url";
import { normalizeRenderableImageUrl } from "@/workflow/ideart/lib/url/image-proxy-policy";
import {
  rotateWorkflowImageClockwise,
  splitWorkflowImageIntoGrid,
} from "./workflow-image-local-tools";
import { resolveWorkflowImageToolRoute } from "./workflow-image-tool-routing";
import { normalizeWorkflowSourceImageSize } from "./workflow-image-source-size";
import { parseModelRuntimeId } from "@/workflow/ideart/lib/models/runtime-id";
import { getWorkflowErrorMessage } from "@/workflow/ideart/lib/error-message";
import { saveSeedanceCharacterLibraryAsset } from "@/workflow/ideart/lib/seedance-character-library";
import {
  classifyPlatformCharacterAsset,
  importPlatformAssetFromUrl,
  waitForPlatformSeedanceValidation,
} from "@/workflow/ideart/lib/platform-assets";
import { requestWorkflowPlaylistExport } from "@/workflow/ideart/lib/libtv/playlist-export";
import {
  hydrateLibTvWorkflowPlaylistItems,
  resolveLibTvWorkflowPlaylistExecutionState,
} from "@/workflow/ideart/lib/libtv/workflow-playlist-runtime";
import {
  normalizeWorkflowGenerationKind,
  workflowGenerationMediaKind,
  workflowGenerationShouldCreateMirror,
  type WorkflowGenerationKind,
} from "@/workflow/ideart/lib/codex/workflow-generation-kind";
import {
  isWorkflowChatAttachmentUrl,
  requestWorkflowChatAttachments,
  type WorkflowChatAttachmentPayload,
} from "@/workflow/ideart/lib/codex/workflow-chat-attachments";
import { runWorkflowVideoRuntime } from "./workflow-video-runtime";
import {
  buildWorkflowAudioRuntimeContext,
  runWorkflowAudioRuntime,
} from "./workflow-audio-runtime";
import {
  resolveWorkflowThreeDAssets,
  runWorkflowThreeDRuntime,
} from "./workflow-three-d-runtime";
import {
  isWorkflowPredictionTaskType,
  resolveWorkflowPredictionTaskIds,
  workflowPredictionTaskType,
} from "./workflow-prediction-task";
import {
  isWorkflowImagePredictionJobId,
  recoverWorkflowImageRuntimeFromHistory,
  resolveWorkflowImagePredictionTaskIds,
  runWorkflowImageRuntime,
} from "./workflow-image-runtime";
import {
  isPersistedWorkflowVideoUrl,
  toVideoDisplayUrl,
} from "../utils/video-proxy";
import {
  GENERATING_PLACEHOLDER_IMAGE,
  GENERATING_PLACEHOLDER_VIDEO,
} from "../right-sidebar-utils";
import type { MaterialManagerWorkflowAssetPayload } from "../material-manager-panel";
import {
  WorkflowHistoryDialog,
  type WorkflowHistoryFile,
} from "../workflow-history-dialog";
import {
  ThreeDWorldOverlay,
  WorkflowBottomControls,
  WorkflowCanvasAssetDrawer,
  WorkflowShortcutPanel,
  WorkflowSidebarControls,
  WorkflowTopBar,
  isWorkflowShortcutEditableTarget,
} from "./workflow-canvas-controls";
import type { ThreeDWorldEditSubmitPayload } from "./workflow-canvas-3d-overlay";
import { dataUrlToWorkflowFile } from "./workflow-canvas-media-utils";
import { getNumberedWorkflowNodeTitle } from "./workflow-canvas-node-utils";
import { buildWorkflowAutoLayoutPatches } from "./workflow-auto-layout";
import {
  buildCodexWorkflowModelCatalog,
  codexCanvasCommandSchema,
  queryCodexWorkflowModelCatalog,
  sanitizeCodexCanvasNodeData,
} from "./codex-canvas-contract";
import {
  buildCodexCanvasNodeReceipt,
  buildCodexCanvasRunReceipt,
  buildCodexCanvasSnapshot,
  buildCodexCanvasWorkflowDelta,
} from "./codex-canvas-response";
import { getOrCreateCodexCanvasSessionId } from "./codex-canvas-session";
import { buildCodexScriptImportAssets } from "./codex-canvas-assets";
import {
  allocateCodexWorkflowTaskPlacement,
  CODEX_WORKFLOW_NODE_GAP,
  CODEX_WORKFLOW_STAGE_ORDER,
  expandWorkflowRect,
  findCodexWorkflowNodePlacement,
  inferCodexWorkflowStage,
  workflowRectsOverlap,
  type CodexWorkflowTaskPlacementNode,
  type WorkflowRect,
} from "./codex-node-placement";
import {
  normalizeWorkflowStoryboardTopologyEdges,
  resolveWorkflowStoryboardAssetGroupId,
  WORKFLOW_STORYBOARD_GENERATOR_IDENTITY,
} from "./storyboard-node-topology";
import { buildWorkflowStoryboardVideoClipPlan } from "./storyboard-video-contract";
import { resolveWorkflowVideoEndpointSelection } from "./workflow-endpoint-schema";
import {
  publishWorkflowCanvasGenerationSettlement,
  workflowCanvasGenerationSettlementFromNode,
} from "./codex-generation-settlement";
import {
  codexWorkflowMediaIdentityKeys,
  codexWorkflowNodeMatchesMediaKind,
  codexWorkflowNodeMediaIdentityKeys,
  findDuplicateCodexGenerationMirrorNodeIds,
  findReusableCodexGenerationNode,
} from "./codex-generation-node-reuse";
import {
  focusCodexCanvasFrames,
  getCodexCanvasReservedRight,
} from "./codex-canvas-viewport";
import { buildCodexReferenceReconciliationPlan } from "./codex-reference-reconciliation";
import {
  LIBTV_WORKFLOW_MEDIA_BATCH_MAX_FILES,
  LIBTV_WORKFLOW_VIDEO_METADATA_TIMEOUT_MS,
  computeWorkflowMediaFrameFromNatural,
  runWorkflowMediaMetadataTasks,
  runWorkflowMediaUploadTasks,
  takeWorkflowMediaBatch,
} from "./workflow-media-batch";
import {
  PlaylistIntroDialog,
  ThreeDIntroDialog,
  WorkflowPublishDialog,
  type PendingPlaylistCreation,
  type PendingThreeDCreation,
} from "./workflow-canvas-dialogs";
import {
  WorkflowEmptyState,
  type WorkflowEmptyStarterId,
} from "./workflow-canvas-empty-state";
import {
  WorkflowAssetMarketplaceDialog,
  type WorkflowAssetMarketplaceType,
} from "./workflow-asset-marketplace-dialog";
import {
  WorkflowCodexSkillLibraryDialog,
  type WorkflowCodexSkill,
} from "./workflow-codex-skill-library-dialog";
import {
  WorkflowCharacterLibraryDialog,
  type WorkflowCharacterLibraryItem,
} from "./workflow-character-library-dialog";

const MaterialManagerPanel = dynamic(
  () =>
    import("../material-manager-panel").then((mod) => mod.MaterialManagerPanel),
  { ssr: false, loading: () => null },
);

const SaveMaterialDialog = dynamic(
  () => import("../save-material-dialog").then((mod) => mod.SaveMaterialDialog),
  { ssr: false, loading: () => null },
);

const WORKFLOW_TEXT_EDITOR_WIDTH = 350;
const WORKFLOW_TEXT_EDITOR_HEIGHT = 200;
const WORKFLOW_SCRIPT_VIDEO_REFERENCE_URL = "/videos/libtv/reference-video.mp4";
const WORKFLOW_TEXT_TO_VIDEO_DEFAULT_PROMPT =
  "高级广告镜头 黑色背景中一款高端腕表悬浮出现，镜头从极速距离微距开始，缓慢拉远，金属表面光泽细腻，细节清晰，柔光灯打亮轮廓，商业广告级质感，干净构图，慢速旋转展示";
const WORKFLOW_IMAGE_REVERSE_PROMPT_PRESET_IMAGE_URL =
  "/images/zmtv/characters/20260725/moonfang-half-spirit/character-sheet.png";
const WORKFLOW_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_URL =
  "/images/zmtv/characters/20260725/moonfang-half-spirit/full-body-reference.png";
const WORKFLOW_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE = {
  width: 1012,
  height: 1196,
};
const WORKFLOW_STORYBOARD_IMAGE_ESTIMATED_MS = 2 * 60 * 1000;
const WORKFLOW_STORYBOARD_PROGRESS_TICK_MS = 1000;

function isWorkflowSeedance2VideoModel(modelId?: string | null) {
  const normalized = String(modelId || "")
    .trim()
    .toLowerCase()
    .replace(/@@[a-z0-9_-]+$/, "")
    .replace(/@[a-z0-9_-]+$/, "")
    .replace(/\s+/g, "-");
  return (
    normalized === "volcengine-doubao-video" ||
    normalized.includes("doubao-seedance-2-0") ||
    normalized.includes("doubao-seedance-2.0") ||
    normalized.includes("seedance-2-0") ||
    normalized.includes("seedance-2.0") ||
    normalized.includes("seedance2.0") ||
    normalized.includes("seedance20")
  );
}
const WORKFLOW_START_END_VIDEO_FIRST_FRAME_URL =
  "/images/libtv/starter-first-frame-video.png";
const WORKFLOW_START_END_VIDEO_END_FRAME_URL =
  "/images/libtv/toolbox-template-cinema.png";
const WORKFLOW_TEXT_TO_MUSIC_DEFAULT_PROMPT =
  "生成一首现代品牌电子音乐（约 110 BPM），干净有力的低频贝斯，清晰电子鼓点，整体风格高级、未来感强。开场节奏型贝斯与简洁合成器音色建立律动，主段加入稳定鼓点，节奏清晰，保持克制的张力。强化段加入更丰富的音层，合成器音色提升，律动增强但不过度拥挤。结尾鼓点减弱，仅保留低频与氛围音渐出，干净利落收尾。";
const WORKFLOW_IMAGE_BACKGROUND_DEFAULT_PROMPT =
  "保留主体和构图不变，仅替换背景为干净自然、有质感的新场景；保持主体细节、光影方向、透视关系和边缘融合真实一致。";
const WORKFLOW_FIRST_FRAME_VIDEO_DEFAULT_PROMPT =
  "以首帧画面为起点生成一段自然流畅的视频，保持主体外观、场景风格和光影一致；加入轻微镜头推进和真实运动细节，让画面有电影感。";
const WORKFLOW_AUDIO_TO_VIDEO_DEFAULT_PROMPT =
  "根据音频的节奏、情绪和氛围生成匹配的视频画面；镜头运动与音乐起伏同步，画面风格统一，节奏清晰，整体具有电影感。";
const WORKFLOW_IMAGE_GENERATING_NOTE = "图片生成中";
const WORKFLOW_VIDEO_GENERATING_NOTE = "视频生成中";

function createWorkflowImportedId(prefix = "workflow") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const PLAYLIST_INTRO_DISMISSED_STORAGE_KEY =
  "ideart:workflow-playlist-intro-dismissed";
const THREED_INTRO_DISMISSED_STORAGE_KEY =
  "ideart:workflow-threed-intro-dismissed";

type WorkflowCanvasBackendJobKind =
  | "outpaint"
  | "upscale"
  | "video_upscale"
  | "image_generate"
  | "world_generate"
  | "world_edit";

function normalizeWorkflowCanvasUpscaleResolution(
  value: unknown,
): "2k" | "4k" | "8k" {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "8k" || normalized === "8") return "8k";
  if (normalized === "4k" || normalized === "4") return "4k";
  return "2k";
}

function normalizeWorkflowVideoGeneratingNote(value: unknown) {
  const label = String(value || "").trim();
  if (!label) return WORKFLOW_VIDEO_GENERATING_NOTE;
  const lowerLabel = label.toLowerCase();
  if (
    label === "排队中" ||
    label === "后台生成中" ||
    label === "提交视频任务" ||
    label === "生成中" ||
    label.includes("排队") ||
    label.includes("提交") ||
    label.includes("任务已") ||
    lowerLabel.includes("queued") ||
    lowerLabel.includes("queue") ||
    lowerLabel.includes("pending")
  ) {
    return WORKFLOW_VIDEO_GENERATING_NOTE;
  }
  return label.slice(0, 80);
}

function normalizeWorkflowImageGeneratingNote(value: unknown) {
  const label = String(value || "").trim();
  if (!label) return WORKFLOW_IMAGE_GENERATING_NOTE;
  const lowerLabel = label.toLowerCase();
  if (
    label === "生成中" ||
    label === "生成中..." ||
    label === "等待生成" ||
    label === "任务已创建" ||
    label.includes("图片生成") ||
    label.includes("任务已") ||
    label.includes("提交") ||
    label.includes("排队") ||
    /^image generation\b/i.test(label) ||
    lowerLabel.includes("image generation") ||
    lowerLabel.includes("task submitted") ||
    lowerLabel.includes("submitted") ||
    lowerLabel.includes("queued") ||
    lowerLabel.includes("queue") ||
    lowerLabel.includes("pending")
  ) {
    return WORKFLOW_IMAGE_GENERATING_NOTE;
  }
  return label.slice(0, 80);
}

function workflowCanvasUpscaleImageSize(value: unknown): "2K" | "4K" | "8K" {
  const normalized = normalizeWorkflowCanvasUpscaleResolution(value);
  if (normalized === "8k") return "8K";
  if (normalized === "4k") return "4K";
  return "2K";
}

function normalizeWorkflowCanvasUpscaleOutputFormat(
  value: unknown,
): "jpeg" | "png" | "webp" {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "png" || normalized === "webp" || normalized === "jpeg")
    return normalized;
  if (normalized === "jpg") return "jpeg";
  return "jpeg";
}

type WorkflowCanvasBackendJobRecord = {
  id: string;
  status: "processing" | "success" | "failed";
  kind: WorkflowCanvasBackendJobKind;
  payload?: {
    request?: Record<string, any>;
    projectId?: string;
  };
  resultData?: {
    stage?: string;
    progress?: number;
    message?: string;
    pollAfterMs?: number;
    externalTask?: any;
    response?: any;
  };
  resultUrl?: string | null;
  errorMessage?: string | null;
};

const localWorkflowCanvasJobs = new Map<
  string,
  WorkflowCanvasBackendJobRecord
>();

type WorkflowAudioTaskStatus = {
  success?: boolean;
  status?: "processing" | "success" | "failed" | string;
  taskId?: string;
  audioUrl?: string;
  duration?: number;
  imageUrl?: string;
  message?: string;
  error?: string;
};

type WorkflowSeparateVideoAudioMode = "audio-video" | "voice" | "background";

type WorkflowChatLayerSyncRecord = {
  workflowNodeId: string;
  kind: "image" | "video";
  completed: boolean;
  batchKey: string;
  batchIndex: number;
  rect: WorkflowRect;
};

type WorkflowChatPlaceholderBatch = {
  key: string;
  prompt: string;
  modelId: string;
  kind: "image" | "video";
  createdAt: number;
  count: number;
  cursorX: number;
  cursorY: number;
  rowHeight: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  panTarget?: { x: number; y: number } | null;
};

type CodexWorkflowGenerationReference = {
  url?: string;
  path?: string;
  name?: string;
  mediaKind?: string;
  nodeId?: string;
  sourceUrl?: string;
  naturalWidth?: number;
  naturalHeight?: number;
};

type CodexWorkflowGenerationDetail = {
  source?: string;
  codexTaskId?: string;
  codexTaskStatus?: string;
  itemId?: string;
  nodeId?: string;
  providerTaskId?: string;
  taskType?: string;
  statusUrl?: string;
  status?: "generating" | "complete" | "failed";
  kind?: WorkflowGenerationKind;
  nodeKind?: LibTvWorkflowNodeKind;
  prompt?: string;
  modelId?: string;
  modelName?: string;
  resultUrls?: string[];
  references?: CodexWorkflowGenerationReference[];
  aspectRatio?: string;
  width?: number;
  height?: number;
  error?: string;
};

type CodexWorkflowGenerationNodeRecord = {
  generatorNodeId: string;
  referenceNodeIds: string[];
  kind: WorkflowGenerationKind;
  nativeNode: boolean;
};

type CodexCanvasCommandOperation =
  | "snapshot"
  | "models"
  | "create"
  | "update"
  | "connect"
  | "disconnect"
  | "delete"
  | "run"
  | "run-batch"
  | "wait"
  | "inspect-result"
  | "script-create-input"
  | "script-import-assets"
  | "storyboard-create-images"
  | "storyboard-regenerate-images"
  | "storyboard-create-videos";

type CodexCanvasCommand = {
  id: string;
  codexTaskId?: string;
  workflowProjectId?: string;
  canvasSessionId?: string;
  operation: CodexCanvasCommandOperation;
  payload?: Record<string, unknown>;
  status?: "pending" | "running" | "completed" | "failed";
};

function isWorkflowProviderAccessError(error: unknown) {
  const message = getWorkflowErrorMessage(error, "");
  const normalized = message.toLowerCase();
  return [
    "api key",
    "unauthorized",
    "forbidden",
    "payment required",
    "insufficient balance",
    "insufficient quota",
    "insufficient credits",
    "余额不足",
    "额度不足",
    "密钥无效",
    "鉴权失败",
  ].some((token) => normalized.includes(token));
}

type CodexNativeStoryboardActions = {
  createImages?: (
    nodeId: string,
    request: WorkflowStoryboardGenerateRequest,
  ) => Promise<void>;
  regenerateImages?: (groupId: string) => Promise<void>;
  createVideos?: (
    groupId: string,
    request: WorkflowStoryboardVideoGenerateRequest,
  ) => Promise<void>;
  importAssets?: (
    sourceId: string,
    request: {
      title: string;
      rows: LibTvStoryboardScriptRow[];
      assetsByKind: Record<LibTvScriptV2AssetKind, LibTvScriptV2AssetItem[]>;
      codexTaskId?: string;
    },
  ) => void;
};

function stableCodexCanvasValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableCodexCanvasValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableCodexCanvasValue(entry)]),
  );
}

function codexCanvasRunSignature(
  node: LibTvWorkflowNode,
  edges: LibTvWorkflowEdge[],
) {
  const data = node.data || {};
  return JSON.stringify(
    stableCodexCanvasValue({
      nodeId: node.id,
      kind: node.kind,
      prompt: data.prompt,
      workflowInternalPrompt: data.workflowInternalPrompt,
      modelId: data.modelId,
      workflowExtraParameters: data.workflowExtraParameters,
      selectedOptionId: data.selectedOptionId,
      stylePreset: data.stylePreset,
      cameraControl: data.cameraControl,
      videoCameraMotion: data.videoCameraMotion,
      videoMethod: data.videoMethod,
      videoDuration: data.videoDuration,
      videoResolution: data.videoResolution,
      aspectRatio: data.aspectRatio,
      imageSize: data.imageSize,
      generationCount: data.generationCount,
      generateAudio: data.generateAudio,
      references: edges
        .filter((edge) => edge.target === node.id)
        .map((edge) => edge.source)
        .sort(),
    }),
  );
}

const WORKFLOW_IMAGE_DEFAULT_ASPECT_WIDTH = 16;
const WORKFLOW_IMAGE_DEFAULT_ASPECT_HEIGHT = 9;
const WORKFLOW_CHAT_PLACEHOLDER_GAP = 32;
const WORKFLOW_CHAT_PLACEHOLDER_BATCH_TTL_MS = 12_000;
function workflowModelDeclaresOptions(
  items:
    Array<{ id?: string; label?: string; isDefault?: boolean }> | undefined,
) {
  return (
    Array.isArray(items) &&
    items.some((item) => String(item?.id || "").trim().length > 0)
  );
}

function workflowCanvasChoiceForEndpoint(
  value: unknown,
  items:
    | Array<{
        id?: string;
        config?: Record<string, any>;
      }>
    | undefined,
  endpointMethod: string,
) {
  const selectedValue = String(value || "").trim();
  if (!selectedValue || !Array.isArray(items) || items.length === 0) return "";
  const item = items.find(
    (candidate) => String(candidate?.id || "").trim() === selectedValue,
  );
  if (!item) return "";
  const methods =
    Array.isArray(item.config?.methods) && item.config.methods.length > 0
      ? item.config.methods
      : item.config?.modes;
  if (!Array.isArray(methods) || methods.length === 0 || !endpointMethod)
    return selectedValue;
  const normalizedMethod = endpointMethod.trim().toLowerCase();
  return methods.some(
    (method) =>
      String(method || "")
        .trim()
        .toLowerCase() === normalizedMethod,
  )
    ? selectedValue
    : "";
}

function buildThreeDNodePatchFromCanvasJob(
  job: WorkflowCanvasBackendJobRecord,
): Partial<LibTvWorkflowNode["data"]> | null {
  if (!job || job.status !== "success") return null;
  const response = job.resultData?.response || {};
  const statusResponse = response.statusResponse || {};
  const modelUrl = String(
    response.modelUrl || statusResponse.modelUrl || job.resultUrl || "",
  ).trim();
  const imageUrl = String(
    response.imageUrl ||
      response.thumbnailUrl ||
      response.panoUrl ||
      statusResponse.imageUrl ||
      statusResponse.thumbnailUrl ||
      statusResponse.panoUrl ||
      "",
  ).trim();
  const worldUrl = String(
    response.worldUrl ||
      response.worldMarbleUrl ||
      statusResponse.worldUrl ||
      statusResponse.worldMarbleUrl ||
      "",
  ).trim();
  const providerKey = String(
    job.resultData?.externalTask?.providerKey ||
      job.payload?.request?.providerKey ||
      "worldlabs",
  )
    .trim()
    .toLowerCase();
  const taskType = String(
    job.resultData?.externalTask?.taskType || job.kind || "world_generate",
  ).trim();
  if (!modelUrl && !worldUrl && !imageUrl) return null;
  return {
    mediaUrl: modelUrl || worldUrl || imageUrl,
    mediaRole: "ordinary",
    workflowGenerationJobId: job.id,
    workflowGenerationTaskId:
      String(job.resultData?.externalTask?.taskId || "").trim() || undefined,
    workflowGenerationTaskType: taskType || undefined,
    workflowGenerationProviderKey: providerKey || undefined,
    workflowGenerationRunning: false,
    workflowGenerationProgress: undefined,
    workflowGenerationError: "",
    suppressGenerationBar: false,
    worldId:
      String(response.worldId || statusResponse.worldId || "").trim() ||
      undefined,
    worldUrl: worldUrl || undefined,
    worldMarbleUrl: worldUrl || undefined,
    splatUrl:
      String(response.splatUrl || statusResponse.splatUrl || "").trim() ||
      undefined,
    spzUrls:
      (response.spzUrls || statusResponse.spzUrls) &&
      typeof (response.spzUrls || statusResponse.spzUrls) === "object"
        ? response.spzUrls || statusResponse.spzUrls
        : undefined,
    colliderMeshUrl:
      String(
        response.colliderMeshUrl ||
          statusResponse.colliderMeshUrl ||
          modelUrl ||
          "",
      ).trim() || undefined,
    panoUrl:
      String(response.panoUrl || statusResponse.panoUrl || "").trim() ||
      undefined,
    thumbnailUrl:
      String(
        response.thumbnailUrl || statusResponse.thumbnailUrl || imageUrl || "",
      ).trim() || undefined,
    caption:
      String(response.caption || statusResponse.caption || "").trim() ||
      undefined,
  };
}

function workflowNodeFrame(kind: LibTvWorkflowNodeKind) {
  if (kind === "text")
    return {
      width: LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
      height: LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
    };
  if (kind === "video")
    return {
      width: LIBTV_TAPNOW_VIDEO_WIDTH,
      height: LIBTV_TAPNOW_VIDEO_HEIGHT,
    };
  if (kind === "playlist") return { width: 350, height: 350 };
  if (kind === "threed")
    return { width: 375, height: LIBTV_TAPNOW_VIDEO_HEIGHT };
  if (kind === "director-console-3d")
    return {
      width: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
      height: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
    };
  if (kind === "script" || kind === "script-v2")
    return {
      width: LIBTV_TAPNOW_SCRIPT_WIDTH,
      height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
    };
  if (kind === "image")
    return {
      width: LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
      height: LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
    };
  return {
    width: LIBTV_TAPNOW_GENERATOR_WIDTH,
    height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
  };
}

const WORKFLOW_EXTRA_PARAMETER_BLOCKED_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

function buildWorkflowExtraGenerationOptions(
  values?: LibTvWorkflowNode["data"]["workflowExtraParameters"],
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  const assign = (keyValue: unknown, value: unknown) => {
    const key = String(keyValue || "").trim();
    if (!key || WORKFLOW_EXTRA_PARAMETER_BLOCKED_KEYS.has(key.toLowerCase()))
      return;
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    )
      return;
    result[key] = value;
  };
  Object.entries(values || {})
    .slice(0, 64)
    .forEach(([key, value]) => {
      if (typeof value === "string") {
        const text = value.trim();
        if (text.startsWith("{") && text.endsWith("}")) {
          try {
            const parsed = JSON.parse(text);
            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              const entries = Object.entries(parsed).slice(0, 64);
              entries.forEach(([nestedKey, nestedValue]) =>
                assign(nestedKey, nestedValue),
              );
              if (entries.length > 0) return;
            }
          } catch {
            // 非 JSON 的选项值按普通字符串透传。
          }
        }
      }
      assign(key, value);
    });
  return result;
}

function isWorkflowScriptKind(kind: LibTvWorkflowNodeKind | undefined) {
  return kind === "script" || kind === "script-v2";
}

function isWorkflowGroupRunnableNode(node: LibTvWorkflowNode | undefined) {
  if (!node) return false;
  if (node.kind === "image") return node.data?.mediaRole === "generator";
  if (node.kind === "video")
    return (
      node.data?.mediaRole === "generator" ||
      node.data?.componentType === "video-generator"
    );
  if (node.kind === "text") return node.data?.componentType !== "text-editor";
  if (
    node.kind === "script" ||
    node.kind === "script-v2" ||
    node.kind === "audio" ||
    node.kind === "threed"
  )
    return true;
  return false;
}

function sortWorkflowNodesByCanvasPosition(nodes: LibTvWorkflowNode[]) {
  return [...nodes].sort(
    (a, b) =>
      Number(a.y || 0) - Number(b.y || 0) ||
      Number(a.x || 0) - Number(b.x || 0) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

function computeWorkflowGroupExecutionLevels(params: {
  group: LibTvWorkflowNode;
  nodes: LibTvWorkflowNode[];
  edges: LibTvWorkflowEdge[];
}) {
  const memberIds = new Set(
    Array.isArray(params.group.data?.groupNodeIds)
      ? params.group.data.groupNodeIds
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      : [],
  );
  const memberNodes = params.nodes.filter(
    (node) => memberIds.has(node.id) || node.parentId === params.group.id,
  );
  const runnableNodes = sortWorkflowNodesByCanvasPosition(
    memberNodes.filter(isWorkflowGroupRunnableNode),
  );
  const runnableIds = new Set(runnableNodes.map((node) => node.id));
  if (runnableNodes.length === 0) return [];

  const indegree = new Map(runnableNodes.map((node) => [node.id, 0]));
  const dependents = new Map<string, Set<string>>();
  params.edges.forEach((edge) => {
    const source = String(edge.source || "");
    const target = String(edge.target || "");
    if (!source || !target || source === target) return;
    if (!runnableIds.has(source) || !runnableIds.has(target)) return;
    const targets = dependents.get(source) || new Set<string>();
    if (targets.has(target)) return;
    targets.add(target);
    dependents.set(source, targets);
    indegree.set(target, (indegree.get(target) || 0) + 1);
  });

  const nodeById = new Map(runnableNodes.map((node) => [node.id, node]));
  const levels: LibTvWorkflowNode[][] = [];
  const placed = new Set<string>();
  let current = sortWorkflowNodesByCanvasPosition(
    runnableNodes.filter((node) => (indegree.get(node.id) || 0) === 0),
  );

  while (current.length > 0) {
    levels.push(current);
    const nextIds = new Set<string>();
    current.forEach((node) => {
      placed.add(node.id);
      (dependents.get(node.id) || new Set<string>()).forEach((targetId) => {
        const nextIndegree = Math.max(0, (indegree.get(targetId) || 0) - 1);
        indegree.set(targetId, nextIndegree);
        if (nextIndegree === 0 && !placed.has(targetId)) nextIds.add(targetId);
      });
    });
    current = sortWorkflowNodesByCanvasPosition(
      Array.from(nextIds)
        .map((id) => nodeById.get(id))
        .filter(Boolean) as LibTvWorkflowNode[],
    );
  }

  const remaining = runnableNodes.filter((node) => !placed.has(node.id));
  if (remaining.length > 0) levels.push(remaining);
  return levels;
}

function isDetachedWorkflowVisualGroupCandidate(
  group: LibTvWorkflowNode,
  members: LibTvWorkflowNode[],
) {
  if (group.kind !== "group") return false;
  const data = group.data as Record<string, any>;
  if (data?.workflowStoryboardSourceNodeId) return false;
  if (data?.workflowScriptV2AssetGroupSourceId) return true;
  return members.some((member) => {
    const memberData = member.data as Record<string, any>;
    return (
      !memberData?.workflowStoryboardSourceNodeId &&
      Boolean(
        normalizeWorkflowScriptV2AssetKind(
          memberData?.workflowScriptV2AssetKind,
        ),
      )
    );
  });
}

function isWorkflowNodeGenerationBusy(node: LibTvWorkflowNode | undefined) {
  const data = node?.data;
  return Boolean(data?.workflowGenerationRunning || data?.groupRunning);
}

async function waitForWorkflowNodeGenerationSettled(
  nodeId: string,
  timeoutMs = 2 * 60 * 60 * 1000,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const node = useCanvasStore
      .getState()
      .libtvWorkflow.nodes.find((item) => item.id === nodeId);
    if (!node) return { success: true, error: "" };
    if (!isWorkflowNodeGenerationBusy(node)) {
      const error = String(node.data?.workflowGenerationError || "").trim();
      return { success: !error, error };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { success: false, error: "整组执行等待超时" };
}

function workflowVideoGeneratorFrame(aspectRatio?: string) {
  const ratioSize = parseWorkflowAspectRatioSize(
    String(aspectRatio || "16:9"),
    16,
    9,
  );
  const ratio = Math.max(
    0.001,
    ratioSize.width / Math.max(1, ratioSize.height),
  );
  const baseHeight = LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT;
  if (ratio >= 1) {
    return {
      width: Math.max(baseHeight, Math.round(baseHeight * ratio)),
      height: baseHeight,
    };
  }
  return {
    width: baseHeight,
    height: Math.max(baseHeight, Math.round(baseHeight / ratio)),
  };
}

function workflowImageDisplayFrame(width: number, height: number) {
  const safeWidth = Math.max(1, Math.round(Number(width || 1)));
  const safeHeight = Math.max(1, Math.round(Number(height || 1)));
  const ratio = safeWidth / safeHeight;
  const baseSize = LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH;
  const baseHeight = LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT;
  if (ratio >= 1) {
    return {
      width: Math.max(baseSize, Math.round(baseHeight * ratio)),
      height: baseHeight,
    };
  }
  return {
    width: baseSize,
    height: Math.max(baseSize, Math.round(baseSize / ratio)),
  };
}

function buildWorkflowPortraitTextureSettingsPrompt(
  settings?: LibTvWorkflowNode["data"]["workflowPortraitTextureSettings"],
) {
  const selected = {
    sceneFusion:
      String(settings?.sceneFusion || "自然融合").trim() || "自然融合",
    lightingFusion:
      String(settings?.lightingFusion || "自然匹配").trim() || "自然匹配",
    skin: String(settings?.skin || "自然肤质").trim() || "自然肤质",
    texture: String(settings?.texture || "自然纹理").trim() || "自然纹理",
    sharpness: String(settings?.sharpness || "标准清晰").trim() || "标准清晰",
  };
  const sceneFusionGuide: Record<string, string> = {
    轻度对齐:
      "轻度统一人物与背景的色温、噪声和边缘过渡，保留原图差异，不改变整体摄影风格",
    自然融合:
      "自然匹配人物与背景的色温、颗粒、清晰度、景深和边缘软硬，让人物不再像贴片",
    深度融合:
      "更强地统一人物与环境的空气感、压缩质感、光照层次和边缘过渡，但不要改变人物身份和构图",
  };
  const lightingFusionGuide: Record<string, string> = {
    柔和补光: "柔和修正脸部和身体暗部，降低突兀阴影，保留自然光向与真实层次",
    自然匹配: "根据背景主光源同步调整面部高光、阴影方向、反光强度和环境色反射",
    氛围强化:
      "在保持真实的前提下强化场景光色、明暗对比和环境氛围，让人物受光融入背景",
  };
  const skinGuide: Record<string, string> = {
    清透修饰: "轻微修饰肤色不均和明显瑕疵，但必须保留毛孔、细纹和真实皮肤层次",
    自然肤质:
      "优先保留真实肤质、毛孔、轻微瑕疵、法令纹和面部微小色差，去除塑料磨皮感",
    真实肌理: "强化自然皮肤肌理、毛孔、细小纹理和年龄感，不要磨皮，不要美颜化",
  };
  const textureGuide: Record<string, string> = {
    柔和纹理: "轻度降低假纹理和脏噪点，保持自然摄影颗粒，不要糊脸",
    自然纹理: "统一人物与背景的真实照片颗粒、毛发细节、布料纹理和压缩质感",
    颗粒质感: "加入克制的真实胶片/相机颗粒和微纹理，让画面摆脱 AI 光滑感",
  };
  const sharpnessGuide: Record<string, string> = {
    柔焦: "柔化过硬五官边缘、发丝边缘和抠图边界，保持主体清晰但不过锐",
    标准清晰: "保持自然清晰度，修正过锐边缘和 AI 硬轮廓，让细节真实可读",
    高清锐化:
      "提升眼睛、毛发、服装和关键轮廓清晰度，但禁止过锐、描边或锐化噪声",
  };
  return [
    `人景融合：${selected.sceneFusion}（${sceneFusionGuide[selected.sceneFusion] || sceneFusionGuide["自然融合"]}）`,
    `光影融合：${selected.lightingFusion}（${lightingFusionGuide[selected.lightingFusion] || lightingFusionGuide["自然匹配"]}）`,
    `皮肤：${selected.skin}（${skinGuide[selected.skin] || skinGuide["自然肤质"]}）`,
    `纹理：${selected.texture}（${textureGuide[selected.texture] || textureGuide["自然纹理"]}）`,
    `锐度：${selected.sharpness}（${sharpnessGuide[selected.sharpness] || sharpnessGuide["标准清晰"]}）`,
    "通用约束：降低 AI 感，保留真实毛孔、发丝、轻微瑕疵和面部层次；禁止过度磨皮、塑料皮肤、蜡像脸、换脸、换装、换背景、五官变形、边缘描边或网红滤镜感",
  ].join("；");
}

function workflowMediaDisplayFrame(width: number, height: number) {
  return computeWorkflowMediaFrameFromNatural(width, height);
}

function getWorkflowAspectRatioFallbackSize(
  aspectRatio: string | undefined,
  fallbackWidth = 16,
  fallbackHeight = 9,
) {
  const ratioSize = parseWorkflowAspectRatioSize(
    String(aspectRatio || ""),
    fallbackWidth,
    fallbackHeight,
  );
  return {
    width: Math.max(1, Math.round(Number(ratioSize.width || fallbackWidth))),
    height: Math.max(1, Math.round(Number(ratioSize.height || fallbackHeight))),
  };
}

function workflowImageGenerationPlaceholderFrame(
  aspectRatio: string,
  count = 1,
) {
  const cell = workflowImageGeneratorFrame(aspectRatio);
  const safeCount = Math.max(1, Math.min(8, Math.round(Number(count || 1))));
  if (safeCount <= 1) {
    return {
      width: cell.width,
      height: cell.height,
      cellWidth: cell.width,
      cellHeight: cell.height,
      columns: 1,
      rows: 1,
      gap: 0,
    };
  }
  const gap = 8;
  const columns = Math.min(2, safeCount);
  const rows = Math.ceil(safeCount / columns);
  return {
    width: columns * cell.width + Math.max(0, columns - 1) * gap,
    height: rows * cell.height + Math.max(0, rows - 1) * gap,
    cellWidth: cell.width,
    cellHeight: cell.height,
    columns,
    rows,
    gap,
  };
}

function workflowImageGeneratorFrame(aspectRatio?: string) {
  const ratioSize = parseWorkflowAspectRatioSize(
    String(aspectRatio || "1:1"),
    WORKFLOW_IMAGE_DEFAULT_ASPECT_WIDTH,
    WORKFLOW_IMAGE_DEFAULT_ASPECT_HEIGHT,
  );
  const ratio = Math.max(
    0.001,
    ratioSize.width / Math.max(1, ratioSize.height),
  );
  const baseWidth = LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH;
  const baseHeight = LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT;
  if (ratio >= 1) {
    return {
      width: Math.max(baseWidth, Math.round(baseHeight * ratio)),
      height: baseHeight,
    };
  }
  return {
    width: baseWidth,
    height: Math.max(baseHeight, Math.round(baseWidth / ratio)),
  };
}

function parseWorkflowAspectRatioSize(
  value: string,
  fallbackWidth = LIBTV_TAPNOW_GENERATOR_WIDTH,
  fallbackHeight = LIBTV_TAPNOW_GENERATOR_HEIGHT,
) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  const matched = normalized.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!matched) return { width: fallbackWidth, height: fallbackHeight };
  const width = Number(matched[1]);
  const height = Number(matched[2]);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: fallbackWidth, height: fallbackHeight };
  }
  return { width, height };
}

function workflowStoryboardImageGridFrame(count: number, aspectRatio: string) {
  const safeCount = Math.max(1, Math.round(Number(count || 1)));
  const ratioSize = parseWorkflowAspectRatioSize(
    aspectRatio || "16:9",
    WORKFLOW_IMAGE_DEFAULT_ASPECT_WIDTH,
    WORKFLOW_IMAGE_DEFAULT_ASPECT_HEIGHT,
  );
  const ratio = Math.max(
    0.1,
    Number(ratioSize.width || 16) / Math.max(1, Number(ratioSize.height || 9)),
  );
  const columns = 1;
  const rows = Math.ceil(safeCount / columns);
  const gap = 24;
  const padX = 40;
  const padTop = 64;
  const padBottom = 40;
  const cellWidth = ratio >= 1 ? 340 : Math.max(220, Math.round(360 * ratio));
  const cellHeight =
    ratio >= 1 ? Math.max(190, Math.round(cellWidth / ratio)) : 360;
  return {
    columns,
    rows,
    gap,
    padX,
    padTop,
    padBottom,
    cellWidth,
    cellHeight,
    width: Math.max(
      420,
      padX * 2 + columns * cellWidth + Math.max(0, columns - 1) * gap,
    ),
    height: Math.max(
      280,
      padTop + padBottom + rows * cellHeight + Math.max(0, rows - 1) * gap,
    ),
  };
}

function resolveWorkflowStoryboardEstimatedProgress(
  startedAt: number,
  totalCount: number,
  completedCount: number,
) {
  const safeTotal = Math.max(1, Math.round(Number(totalCount || 1)));
  const safeCompleted = Math.max(
    0,
    Math.min(safeTotal, Math.round(Number(completedCount || 0))),
  );
  if (safeCompleted >= safeTotal) return 1;
  const elapsed = Math.max(0, Date.now() - startedAt);
  const estimated = elapsed / WORKFLOW_STORYBOARD_IMAGE_ESTIMATED_MS;
  const completedProgress = safeCompleted / safeTotal;
  return Math.max(0.03, Math.min(0.96, Math.max(estimated, completedProgress)));
}

function startWorkflowStoryboardEstimatedProgress(params: {
  rowIndexes: number[];
  rowNodeByIndex: Map<number, string>;
  sourceNodeId: string;
  groupNodeId: string;
  runningNotePrefix: string;
  updateWorkflowNode: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  getCompletedCount: () => number;
  isRowSettled: (rowIndex: number) => boolean;
}) {
  const startedAt = Date.now();
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const totalCount = Math.max(1, params.rowIndexes.length);
    const completedCount = Math.max(
      0,
      Math.min(totalCount, params.getCompletedCount()),
    );
    const progress = resolveWorkflowStoryboardEstimatedProgress(
      startedAt,
      totalCount,
      completedCount,
    );
    const note = `${params.runningNotePrefix} ${completedCount}/${totalCount}`;
    params.updateWorkflowNode(params.sourceNodeId, {
      note,
      workflowGenerationRunning: true,
      workflowGenerationProgress: progress,
      workflowGenerationError: "",
      suppressGenerationBar: true,
    });
    params.updateWorkflowNode(params.groupNodeId, {
      note,
      groupRunning: true,
    } as any);
    params.rowIndexes.forEach((rowIndex) => {
      if (params.isRowSettled(rowIndex)) return;
      const nodeId = params.rowNodeByIndex.get(rowIndex);
      if (!nodeId) return;
      params.updateWorkflowNode(nodeId, {
        note: "生成中",
        workflowGenerationRunning: true,
        workflowGenerationProgress: progress,
        workflowGenerationError: "",
      });
    });
  };
  tick();
  const timer = window.setInterval(tick, WORKFLOW_STORYBOARD_PROGRESS_TICK_MS);
  return {
    tick,
    stop: () => {
      stopped = true;
      window.clearInterval(timer);
    },
  };
}

function parseWorkflowDurationSeconds(value: unknown, fallbackSeconds = 5) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return value;
  const raw = String(value || "").trim();
  if (!raw) return fallbackSeconds;
  const colonParts =
    raw
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter((item) => Number.isFinite(item)) || [];
  if (raw.includes(":") && colonParts.length >= 2) {
    const parts = colonParts.slice(-3);
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return seconds > 0 ? seconds : fallbackSeconds;
  }
  const hours = Number(
    raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours|小时)/i)?.[1] || 0,
  );
  const minutes = Number(
    raw.match(
      /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes|分钟|分)/i,
    )?.[1] || 0,
  );
  const seconds = Number(
    raw.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds|秒)/i)?.[1] || 0,
  );
  const composed = hours * 3600 + minutes * 60 + seconds;
  if (composed > 0) return composed;
  const first = Number(raw.match(/\d+(?:\.\d+)?/)?.[0] || 0);
  return first > 0 ? first : fallbackSeconds;
}

function readWorkflowImageFileSize(file: File) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = Math.max(
        1,
        Math.round(image.naturalWidth || image.width || 1),
      );
      const height = Math.max(
        1,
        Math.round(image.naturalHeight || image.height || 1),
      );
      URL.revokeObjectURL(objectUrl);
      resolve({ width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("读取图片尺寸失败"));
    };
    image.src = objectUrl;
  });
}

function readWorkflowImageUrlSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: Math.max(1, Math.round(image.naturalWidth || image.width || 1)),
        height: Math.max(
          1,
          Math.round(image.naturalHeight || image.height || 1),
        ),
      });
    };
    image.onerror = () => reject(new Error("image size unavailable"));
    image.src = url;
  });
}

function readWorkflowVideoFileSize(file: File) {
  return new Promise<{ width: number; height: number; duration?: number }>(
    (resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        finish(null, new Error("读取视频尺寸超时"));
      }, LIBTV_WORKFLOW_VIDEO_METADATA_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        URL.revokeObjectURL(objectUrl);
        video.removeAttribute("src");
        video.load();
      };
      const finish = (
        value: { width: number; height: number; duration?: number } | null,
        error?: Error,
      ) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (value) {
          resolve(value);
        } else {
          reject(error || new Error("读取视频尺寸失败"));
        }
      };
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        finish({
          width: Math.max(1, Math.round(video.videoWidth || 1280)),
          height: Math.max(1, Math.round(video.videoHeight || 720)),
          duration: Number.isFinite(video.duration)
            ? Math.round(video.duration)
            : undefined,
        });
      };
      video.onerror = () => finish(null);
      video.src = objectUrl;
    },
  );
}

async function readWorkflowMediaFileSize(
  file: File,
  kind: LibTvWorkflowNodeKind,
) {
  if (kind === "image") return readWorkflowImageFileSize(file);
  if (kind === "video") return readWorkflowVideoFileSize(file);
  return null;
}

function applyWorkflowMediaNodeFrame(
  moveWorkflowNode: (
    nodeId: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void,
  nodeId: string,
  size: { width: number; height: number } | null | undefined,
  anchor?: { centerX?: number; centerY?: number; rightEdgeX?: number },
) {
  if (!size) return;
  const frame = workflowMediaDisplayFrame(size.width, size.height);
  const patch: Partial<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = {
    width: frame.width,
    height: frame.height,
  };
  if (typeof anchor?.centerX === "number") {
    patch.x = Math.round(anchor.centerX - frame.width / 2);
  } else if (typeof anchor?.rightEdgeX === "number") {
    patch.x = Math.round(anchor.rightEdgeX - frame.width);
  }
  if (typeof anchor?.centerY === "number") {
    patch.y = Math.round(anchor.centerY - frame.height / 2);
  }
  moveWorkflowNode(nodeId, patch);
}

function applyWorkflowUploadedMediaNodeFrame(
  moveWorkflowNode: (
    nodeId: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void,
  nodeId: string,
  kind: LibTvWorkflowNodeKind,
  size: { width: number; height: number } | null | undefined,
  fallbackFrame: { x: number; y: number; width: number; height: number },
) {
  if ((kind !== "image" && kind !== "video") || !size) return;
  applyWorkflowMediaNodeFrame(moveWorkflowNode, nodeId, size, {
    centerX: fallbackFrame.x + fallbackFrame.width / 2,
    centerY: fallbackFrame.y + fallbackFrame.height / 2,
  });
}

function getWorkflowMediaNaturalSizePatch(
  size: { width: number; height: number; duration?: number } | null | undefined,
): Partial<LibTvWorkflowNode["data"]> {
  const width = Math.max(0, Math.round(Number(size?.width || 0)));
  const height = Math.max(0, Math.round(Number(size?.height || 0)));
  if (width <= 0 || height <= 0) return {};
  const duration = Number(size?.duration || 0);
  return {
    workflowMediaNaturalWidth: width,
    workflowMediaNaturalHeight: height,
    ...(Number.isFinite(duration) && duration > 0
      ? {
          workflowMediaDurationSec: duration,
          videoDuration:
            (duration < 10
              ? duration.toFixed(1)
              : String(Math.round(duration))) + "s",
        }
      : {}),
  };
}

function getWorkflowUploadedMediaFrameLocked(kind: LibTvWorkflowNodeKind) {
  return kind === "audio";
}

function getWorkflowUploadPlaceholderNote(kind: LibTvWorkflowNodeKind) {
  if (kind === "video") return "视频上传中";
  if (kind === "audio") return "音频上传中";
  return "图片上传中";
}

function getWorkflowUploadGridLayout(
  entries: Array<{ kind: LibTvWorkflowNodeKind }>,
  center?: { x: number; y: number },
) {
  const frames = entries.map((entry) => workflowNodeFrame(entry.kind));
  const maxWidth = Math.max(...frames.map((frame) => frame.width), 1);
  const maxHeight = Math.max(...frames.map((frame) => frame.height), 1);
  // LibTV creates a batch immediately in one horizontal lane. Its recovered
  // node-origin step is 450px, independent of the eventual natural width.
  const columns = Math.max(1, entries.length);
  const rows = 1;
  const gap = Math.max(0, 450 - maxWidth);
  const width = columns * maxWidth + Math.max(0, columns - 1) * gap;
  const height = rows * maxHeight + Math.max(0, rows - 1) * gap;
  return {
    columns,
    gap,
    maxWidth,
    maxHeight,
    origin: center
      ? {
          x: Math.round(center.x - width / 2),
          y: Math.round(center.y - height / 2),
        }
      : null,
  };
}

function applyWorkflowImageUrlNodeFrame(
  moveWorkflowNode: (
    nodeId: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void,
  nodeId: string,
  imageUrl: string,
  anchor?: { centerX?: number; centerY?: number; rightEdgeX?: number },
  onSize?: (size: { width: number; height: number }) => void,
  shouldApplyFrame?: () => boolean,
) {
  void readWorkflowImageUrlSize(imageUrl)
    .then((size) => {
      onSize?.(size);
      if (shouldApplyFrame?.() === false) return;
      applyWorkflowMediaNodeFrame(moveWorkflowNode, nodeId, size, anchor);
    })
    .catch(() => undefined);
}

function readWorkflowVideoUrlSize(url: string) {
  return new Promise<{ width: number; height: number; duration?: number }>(
    (resolve, reject) => {
      const video = document.createElement("video");
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        finish(null, new Error("读取视频尺寸超时"));
      }, LIBTV_WORKFLOW_VIDEO_METADATA_TIMEOUT_MS);
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        video.removeAttribute("src");
        video.load();
      };
      const finish = (
        value: { width: number; height: number; duration?: number } | null,
        error?: Error,
      ) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (value) {
          resolve(value);
        } else {
          reject(error || new Error("video size unavailable"));
        }
      };
      video.preload = "metadata";
      video.crossOrigin = "anonymous";
      video.onloadedmetadata = () => {
        finish({
          width: Math.max(1, Math.round(video.videoWidth || 1280)),
          height: Math.max(1, Math.round(video.videoHeight || 720)),
          duration: Number.isFinite(video.duration)
            ? video.duration
            : undefined,
        });
      };
      video.onerror = () => finish(null);
      video.src = toVideoDisplayUrl(url);
    },
  );
}

async function readCodexMediaUrlSize(kind: LibTvWorkflowNodeKind, url: string) {
  if ((kind !== "image" && kind !== "video") || !url) return null;
  const metadataPromise =
    kind === "video"
      ? readWorkflowVideoUrlSize(url)
      : readWorkflowImageUrlSize(url);
  return Promise.race([
    metadataPromise.catch(() => null),
    new Promise<null>((resolve) =>
      window.setTimeout(() => resolve(null), 3_000),
    ),
  ]);
}

function applyWorkflowVideoUrlNodeFrame(
  moveWorkflowNode: (
    nodeId: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void,
  nodeId: string,
  videoUrl: string,
  anchor?: { centerX?: number; centerY?: number; rightEdgeX?: number },
  onMetadata?: (metadata: {
    width: number;
    height: number;
    duration?: number;
  }) => void,
  fallbackSize?: { width: number; height: number },
) {
  if (fallbackSize?.width && fallbackSize?.height) {
    applyWorkflowMediaNodeFrame(moveWorkflowNode, nodeId, fallbackSize, anchor);
  }
  void readWorkflowVideoUrlSize(videoUrl)
    .then((size) => {
      applyWorkflowMediaNodeFrame(moveWorkflowNode, nodeId, size, anchor);
      onMetadata?.(size);
    })
    .catch(() => undefined);
}

function isWorkflowChatGeneratingLayer(layer: CanvasLayer) {
  const src = String(layer.src || "").trim();
  return (
    layer.genStatus === "generating" ||
    src === GENERATING_PLACEHOLDER_IMAGE ||
    src === GENERATING_PLACEHOLDER_VIDEO
  );
}

function isWorkflowChatGeneratedLayer(layer: CanvasLayer) {
  return Boolean(
    layer.genStatus ||
    String(layer.genPrompt || "").trim() ||
    String(layer.genModel || "").trim() ||
    String(layer.genResultImage || "").trim() ||
    isWorkflowChatGeneratingLayer(layer),
  );
}

function getWorkflowChatLayerMediaKind(
  layer: CanvasLayer,
): "image" | "video" | null {
  const src = String(layer.src || "").trim();
  if (layer.type === "video" || src === GENERATING_PLACEHOLDER_VIDEO)
    return "video";
  if (
    layer.type === "image" ||
    layer.type === "gen_frame" ||
    layer.type === "video_gen_frame" ||
    src === GENERATING_PLACEHOLDER_IMAGE
  ) {
    return src === GENERATING_PLACEHOLDER_VIDEO ? "video" : "image";
  }
  return null;
}

function getWorkflowChatLayerResultUrl(
  layer: CanvasLayer,
  kind: "image" | "video",
) {
  const candidates =
    kind === "video"
      ? [layer.libtvMediaUrl, layer.src, layer.genResultImage]
      : [layer.genResultImage, layer.libtvMediaUrl, layer.src];
  for (const candidate of candidates) {
    const url = String(candidate || "").trim();
    if (!url) continue;
    if (
      url === GENERATING_PLACEHOLDER_IMAGE ||
      url === GENERATING_PLACEHOLDER_VIDEO
    )
      continue;
    return url;
  }
  return "";
}

function getWorkflowChatPlaceholderFrame(
  layer: CanvasLayer,
  kind: "image" | "video",
) {
  if (kind === "video") return workflowNodeFrame("video");
  const layerWidth = Number(layer.width || 0);
  const layerHeight = Number(layer.height || 0);
  const layerHasUsefulRatio =
    Number.isFinite(layerWidth) &&
    Number.isFinite(layerHeight) &&
    layerWidth > 0 &&
    layerHeight > 0 &&
    Math.abs(layerWidth / layerHeight - 1) > 0.01;
  const selectedAspectRatio = String(layer.genRatio || "").trim();
  const ratioSize = layerHasUsefulRatio
    ? { width: layerWidth, height: layerHeight }
    : parseWorkflowAspectRatioSize(
        selectedAspectRatio,
        WORKFLOW_IMAGE_DEFAULT_ASPECT_WIDTH,
        WORKFLOW_IMAGE_DEFAULT_ASPECT_HEIGHT,
      );
  const width = Math.max(
    1,
    Number(ratioSize.width || WORKFLOW_IMAGE_DEFAULT_ASPECT_WIDTH),
  );
  const height = Math.max(
    1,
    Number(ratioSize.height || WORKFLOW_IMAGE_DEFAULT_ASPECT_HEIGHT),
  );
  return workflowImageDisplayFrame(width, height);
}

function getWorkflowChatBatchKey(layer: CanvasLayer, kind: "image" | "video") {
  const prompt = String(layer.genPrompt || "").trim();
  const modelId = String(layer.genModel || "").trim();
  const streamId = String(layer.genStreamId || "").trim();
  if (streamId) return `${kind}:${streamId}`;
  return `${kind}:${modelId}:${prompt.slice(0, 240)}`;
}

function getWorkflowChatPlaceholderSlotKey(batchKey: string, index: number) {
  return `${batchKey}::${Math.max(0, index)}`;
}

function getWorkflowVisibleBounds(params: {
  flow: ReactFlowInstance<ReactFlowNode<WorkflowOverlayNodeData>, Edge> | null;
  container: HTMLDivElement | null;
  reserveRight?: number;
}) {
  const viewport = params.flow?.getViewport();
  const rect = params.container?.getBoundingClientRect();
  const zoom = Math.max(0.1, Number(viewport?.zoom || 1));
  const screenWidth = Math.max(
    360,
    Number(
      rect?.width || (typeof window !== "undefined" ? window.innerWidth : 1440),
    ),
  );
  const screenHeight = Math.max(
    360,
    Number(
      rect?.height ||
        (typeof window !== "undefined" ? window.innerHeight : 900),
    ),
  );
  const reservedRight = Math.max(0, Number(params.reserveRight || 0));
  const usableScreenWidth = Math.max(260, screenWidth - reservedRight);
  const viewportX = Number(viewport?.x || 0);
  const viewportY = Number(viewport?.y || 0);
  const left = (0 - viewportX) / zoom;
  const top = (0 - viewportY) / zoom;
  const right = (usableScreenWidth - viewportX) / zoom;
  const bottom = (screenHeight - viewportY) / zoom;
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const padX = Math.min(96, Math.max(32, width * 0.08));
  const padY = Math.min(96, Math.max(32, height * 0.08));
  return {
    left: left + padX,
    top: top + padY,
    right: right - padX,
    bottom: bottom - padY,
    width: Math.max(1, width - padX * 2),
    height: Math.max(1, height - padY * 2),
  };
}

function allocateWorkflowChatPlaceholderPosition(params: {
  batch: WorkflowChatPlaceholderBatch;
  width: number;
  height: number;
  obstacles?: WorkflowRect[];
}) {
  const gap = WORKFLOW_CHAT_PLACEHOLDER_GAP;
  const safeWidth = Math.min(
    Math.max(1, params.width),
    Math.max(1, params.batch.right - params.batch.left),
  );
  const safeHeight = Math.min(
    Math.max(1, params.height),
    Math.max(1, params.batch.bottom - params.batch.top),
  );
  const obstacles = params.obstacles || [];
  const columns = Math.max(
    1,
    Math.floor(
      (params.batch.right - params.batch.left + gap) / (safeWidth + gap),
    ),
  );
  const rows = Math.max(
    1,
    Math.floor(
      (params.batch.bottom - params.batch.top + gap) / (safeHeight + gap),
    ),
  );
  const collides = (rect: WorkflowRect) =>
    obstacles.some((obstacle) =>
      workflowRectsOverlap(rect, expandWorkflowRect(obstacle, gap)),
    );

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col;
      const shiftedIndex = index + params.batch.count;
      const shiftedRow = Math.floor(shiftedIndex / columns) % rows;
      const shiftedCol = shiftedIndex % columns;
      const x = params.batch.left + shiftedCol * (safeWidth + gap);
      const y = params.batch.top + shiftedRow * (safeHeight + gap);
      const rect = { x, y, width: safeWidth, height: safeHeight };
      if (!collides(rect)) {
        params.batch.count += 1;
        params.batch.cursorX = x + safeWidth + gap;
        params.batch.cursorY = y;
        params.batch.rowHeight = Math.max(params.batch.rowHeight, safeHeight);
        return { x: Math.round(x), y: Math.round(y) };
      }
    }
  }

  const overflowStartX = params.batch.right + gap;
  const overflowStartY = params.batch.top;
  const overflowColumns = Math.max(1, Math.min(3, columns));
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const col = attempt % overflowColumns;
    const row = Math.floor(attempt / overflowColumns);
    const x = overflowStartX + col * (safeWidth + gap);
    const y = overflowStartY + row * (safeHeight + gap);
    const rect = { x, y, width: safeWidth, height: safeHeight };
    if (!collides(rect)) {
      params.batch.count += 1;
      params.batch.panTarget = {
        x: x + safeWidth / 2,
        y: y + safeHeight / 2,
      };
      return { x: Math.round(x), y: Math.round(y) };
    }
  }

  const x = overflowStartX;
  const y =
    overflowStartY + Math.max(0, params.batch.count) * (safeHeight + gap);
  params.batch.count += 1;
  params.batch.panTarget = {
    x: x + safeWidth / 2,
    y: y + safeHeight / 2,
  };
  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

function getWorkflowNodeObstacleRect(node: LibTvWorkflowNode): WorkflowRect {
  const frame = workflowNodeFrame(node.kind);
  return {
    x: Number(node.x || 0),
    y: Number(node.y || 0),
    width: Math.max(frame.width, Number(node.width || frame.width)),
    height: Math.max(frame.height, Number(node.height || frame.height)),
  };
}

function getCodexWorkflowTaskPlacementNode(
  node: LibTvWorkflowNode,
): CodexWorkflowTaskPlacementNode {
  return {
    ...getWorkflowNodeObstacleRect(node),
    parentId: node.parentId,
    taskId: String(node.data?.workflowCodexTaskId || "").trim(),
    anchorX: Number(node.data?.workflowCodexLayoutAnchorX),
    anchorY: Number(node.data?.workflowCodexLayoutAnchorY),
    layoutIndex: Number(node.data?.workflowCodexLayoutIndex),
    stage: node.data?.workflowCodexLayoutStage,
    stageRow: Number(node.data?.workflowCodexLayoutRow),
  };
}

function panWorkflowToRect(params: {
  flow: ReactFlowInstance<ReactFlowNode<WorkflowOverlayNodeData>, Edge> | null;
  container: HTMLDivElement | null;
  rect: WorkflowRect;
  reserveRight?: number;
}) {
  const flow = params.flow;
  if (!flow) return;
  const viewport = flow.getViewport();
  const rect = params.container?.getBoundingClientRect();
  const screenWidth = Math.max(
    360,
    Number(
      rect?.width || (typeof window !== "undefined" ? window.innerWidth : 1440),
    ),
  );
  const screenHeight = Math.max(
    360,
    Number(
      rect?.height ||
        (typeof window !== "undefined" ? window.innerHeight : 900),
    ),
  );
  const reserveRight = Math.max(0, Number(params.reserveRight || 0));
  const usableWidth = Math.max(260, screenWidth - reserveRight);
  const zoom = Math.max(0.1, Number(viewport.zoom || 1));
  const centerX = params.rect.x + params.rect.width / 2;
  const centerY = params.rect.y + params.rect.height / 2;
  void flow.setViewport(
    {
      x: usableWidth / 2 - centerX * zoom,
      y: screenHeight / 2 - centerY * zoom,
      zoom,
    },
    { duration: 420 },
  );
}

function getFileNodeKind(file: File): LibTvWorkflowNodeKind | null {
  const mimeType = String(file.type || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return null;
}

function isWorkflowCsvFile(file: File) {
  const name = String(file.name || "").toLowerCase();
  const mimeType = String(file.type || "").toLowerCase();
  return (
    name.endsWith(".csv") ||
    mimeType.includes("csv") ||
    mimeType === "application/vnd.ms-excel"
  );
}

async function readWorkflowCsvText(file: File) {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  try {
    const decoded = new TextDecoder("gb18030", { fatal: false }).decode(buffer);
    return decoded.includes("\uFFFD") ? utf8 : decoded;
  } catch {
    return utf8;
  }
}

function parseWorkflowCsvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      row.push(cell);
      cell = "";
      if (row.some((value) => String(value || "").trim())) rows.push(row);
      row = [];
      if (char === "\r" && next === "\n") index += 1;
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => String(value || "").trim())) rows.push(row);
  return rows;
}

function normalizeWorkflowCsvHeader(value: string) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[：:]/g, "")
    .toLowerCase();
}

function getWorkflowCsvValue(
  record: Record<string, string>,
  aliases: string[],
) {
  for (const alias of aliases) {
    const value = record[normalizeWorkflowCsvHeader(alias)];
    if (String(value || "").trim()) return String(value || "").trim();
  }
  return "";
}

function workflowCsvRecordsToScriptResult(
  fileName: string,
  records: Array<Record<string, string>>,
  headers: string[],
): LibTvStoryboardScriptResult {
  const title = shortFileName(fileName) || "CSV 镜头脚本";
  const rows = records.map((record, index) => {
    const row = createEmptyStoryboardScriptRow(index);
    row.shotNumber =
      getWorkflowCsvValue(record, [
        "镜号",
        "分镜号",
        "镜头号",
        "shotNumber",
        "shot",
        "编号",
      ]) || String(index + 1);
    row.duration = getWorkflowCsvValue(record, [
      "时长",
      "持续时间",
      "duration",
      "seconds",
      "秒",
    ]);
    row.visualDescription = getWorkflowCsvValue(record, [
      "画面描述",
      "画面",
      "视觉描述",
      "visualDescription",
      "description",
      "分镜描述",
    ]);
    row.character1 = getWorkflowCsvValue(record, [
      "角色1",
      "角色一",
      "character1",
    ]);
    row.characterDescription1 = getWorkflowCsvValue(record, [
      "角色描述1",
      "角色1描述",
      "角色一描述",
      "characterDescription1",
    ]);
    row.characterImage1 = getWorkflowCsvValue(record, [
      "人物图1",
      "人物1图",
      "人物图片1",
      "角色图1",
      "角色1图",
      "角色图片1",
      "characterImage1",
    ]);
    row.character2 = getWorkflowCsvValue(record, [
      "角色2",
      "角色二",
      "character2",
    ]);
    row.characterDescription2 = getWorkflowCsvValue(record, [
      "角色描述2",
      "角色2描述",
      "角色二描述",
      "characterDescription2",
    ]);
    row.characterImage2 = getWorkflowCsvValue(record, [
      "人物图2",
      "人物2图",
      "人物图片2",
      "角色图2",
      "角色2图",
      "角色图片2",
      "characterImage2",
    ]);
    row.referenceImage = getWorkflowCsvValue(record, [
      "视频参考图",
      "参考图",
      "分镜图",
      "画面参考图",
      "referenceImage",
      "image",
    ]);
    row.shotType = getWorkflowCsvValue(record, [
      "景别",
      "镜头类型",
      "shotType",
    ]);
    row.characterAction = getWorkflowCsvValue(record, [
      "人物动作",
      "角色动作",
      "动作",
      "characterAction",
    ]);
    row.emotion = getWorkflowCsvValue(record, ["表情", "情绪", "emotion"]);
    row.sceneTags = getWorkflowCsvValue(record, [
      "场景",
      "场景标签",
      "sceneTags",
    ]);
    row.lightingAtmosphere = getWorkflowCsvValue(record, [
      "光影氛围",
      "光线氛围",
      "灯光",
      "lightingAtmosphere",
    ]);
    row.soundEffect = getWorkflowCsvValue(record, [
      "音效",
      "声音",
      "soundEffect",
    ]);
    row.dialogue = getWorkflowCsvValue(record, ["对白", "台词", "dialogue"]);
    row.storyboardPrompt = getWorkflowCsvValue(record, [
      "分镜提示词",
      "画面提示词",
      "storyboardPrompt",
      "imagePrompt",
    ]);
    row.motionPrompt = getWorkflowCsvValue(record, [
      "视频提示",
      "视频提示词",
      "视频运动提示词",
      "视频运镜提示词",
      "运镜提示词",
      "动态提示词",
      "motionPrompt",
      "motion_prompt",
      "videoMotionPrompt",
      "video_motion_prompt",
      "videoPrompt",
      "video_prompt",
    ]);
    const extraEntries = headers
      .map(
        (header) =>
          [header, record[normalizeWorkflowCsvHeader(header)]] as const,
      )
      .filter(([, value]) => String(value || "").trim());
    extraEntries.forEach(([header, value]) => {
      (row as LibTvStoryboardScriptRow & Record<string, unknown>)[header] =
        value;
    });
    return row;
  });
  return {
    title,
    summary: `从 CSV 导入 ${rows.length} 条分镜。`,
    sourceScript: "",
    userPrompt: "",
    selectedOptionId: "storyboard-script",
    rows,
    generatedAt: Date.now(),
  };
}

function collectWorkflowClipboardMediaFiles(
  clipboardData: DataTransfer | null,
) {
  const files: File[] = [];
  const seen = new Set<string>();
  const pushFile = (file: File | null | undefined) => {
    if (!file || !getFileNodeKind(file)) return;
    const normalizedName = String(file.name || "")
      .trim()
      .toLowerCase();
    const normalizedType = String(file.type || "")
      .trim()
      .toLowerCase();
    const normalizedSize = Number(file.size || 0);
    const key =
      normalizedSize > 0
        ? `${normalizedType}:${normalizedSize}`
        : `${normalizedName}:${normalizedType}:${Number(file.lastModified || 0)}`;
    if (seen.has(key)) return;
    seen.add(key);
    files.push(file);
  };
  Array.from(clipboardData?.files || []).forEach(pushFile);
  Array.from(clipboardData?.items || []).forEach((item) => {
    if (item.kind !== "file") return;
    pushFile(item.getAsFile());
  });
  return files;
}

function isWorkflowClipboardTargetEditable(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  if (!element) return false;
  return Boolean(
    element.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable=''], .ProseMirror, .tiptap, .ql-editor",
    ),
  );
}

function shortFileName(name: string) {
  return String(name || "")
    .replace(/\.[^.]+$/, "")
    .trim();
}

function inferWorkflowMediaDownloadExtension(node: LibTvWorkflowNode) {
  const mimeType = String(node.data?.workflowMediaMimeType || "").toLowerCase();
  const mediaUrl = String(
    node.data?.mediaUrl ||
      node.data?.colliderMeshUrl ||
      node.data?.splatUrl ||
      node.data?.worldUrl ||
      node.data?.worldMarbleUrl ||
      "",
  );
  const pathname = (() => {
    try {
      return decodeURIComponent(
        new URL(
          mediaUrl,
          typeof window !== "undefined"
            ? window.location.href
            : "http://localhost",
        ).pathname,
      );
    } catch {
      return mediaUrl;
    }
  })().toLowerCase();
  const extMatch = pathname.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
  const ext = extMatch?.[1]?.toLowerCase();
  if (node.kind === "video") {
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("quicktime")) return "mov";
    if (mimeType.includes("x-matroska")) return "mkv";
    if (mimeType.includes("mp4")) return "mp4";
    if (ext && ["mp4", "webm", "mov", "m4v", "mkv"].includes(ext)) return ext;
    return "mp4";
  }
  if (node.kind === "audio") {
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
    if (ext && ["mp3", "wav", "m4a", "aac", "ogg"].includes(ext)) return ext;
    return "mp3";
  }
  if (node.kind === "threed") {
    if (ext && ["spz", "glb", "gltf", "zip"].includes(ext)) return ext;
    if (node.data?.splatUrl) return "spz";
    if (node.data?.colliderMeshUrl) return "glb";
    return "zip";
  }
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (ext && ["png", "jpg", "jpeg", "webp", "gif"].includes(ext))
    return ext === "jpeg" ? "jpg" : ext;
  return "png";
}

function inferWorkflowVideoMethodFromInputCounts(inputCounts: {
  images: number;
  videos: number;
  audios: number;
}) {
  if (
    inputCounts.images > 0 ||
    inputCounts.videos > 0 ||
    inputCounts.audios > 0
  )
    return "reference";
  return "text2video";
}

function getWorkflowVideoInputCountsFromConnectedInputs(
  targetId: string,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  const upstreamNodes = edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node): node is LibTvWorkflowNode => Boolean(node));
  return {
    images: upstreamNodes.filter(
      (node) =>
        (node.kind === "image" && String(node.data?.mediaUrl || "").trim()) ||
        isWorkflowImageGeneratorResultGroupNode(node),
    ).length,
    videos: upstreamNodes.filter(
      (node) =>
        node.kind === "video" && String(node.data?.mediaUrl || "").trim(),
    ).length,
    audios: upstreamNodes.filter(
      (node) =>
        node.kind === "audio" && String(node.data?.mediaUrl || "").trim(),
    ).length,
  };
}

function inferWorkflowVideoMethodForUploadedInputs(
  entries: Array<{ kind: LibTvWorkflowNodeKind }>,
) {
  const nextMethod = inferWorkflowVideoMethodFromInputCounts({
    images: entries.filter((entry) => entry.kind === "image").length,
    videos: entries.filter((entry) => entry.kind === "video").length,
    audios: entries.filter((entry) => entry.kind === "audio").length,
  });
  return nextMethod === "text2video" ? undefined : nextMethod;
}

async function workflowBlobToFile(source: string, filename: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`读取图片失败: HTTP ${response.status}`);
  const blob = await response.blob();
  const ext = String(blob.type || "image/png").split("/")[1] || "png";
  return new File(
    [blob],
    filename.includes(".") ? filename : `${filename}.${ext}`,
    { type: blob.type || "image/png" },
  );
}

async function resolveWorkflowApiImageSource(source: string) {
  const value = String(source || "").trim();
  if (!value) throw new Error("图片地址为空");
  if (value.startsWith("data:") || value.startsWith("blob:")) {
    const file = value.startsWith("data:")
      ? await dataUrlToWorkflowFile(value, `workflow-source-${Date.now()}.png`)
      : await workflowBlobToFile(value, `workflow-source-${Date.now()}`);
    const { publicUrl, libtvUrl } = await uploadCanvasNodeFile(file);
    return libtvUrl || publicUrl;
  }
  if (value.startsWith("/api/image-proxy?")) {
    try {
      const parsed = new URL(value, window.location.origin);
      const proxied = parsed.searchParams.get("url");
      if (proxied) return proxied;
    } catch {
      return value;
    }
  }
  if (value.startsWith("/")) {
    if (typeof window !== "undefined" && window.location?.origin) {
      const absolute = new URL(value, window.location.origin).toString();
      try {
        const file = await workflowBlobToFile(
          absolute,
          `workflow-source-${Date.now()}`,
        );
        const { publicUrl, libtvUrl } = await uploadCanvasNodeFile(file);
        return libtvUrl || publicUrl;
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error("本地媒体上传到造梦 API 开放平台失败");
      }
    }
    return value;
  }
  return value;
}

async function resolveWorkflowApiMediaSource(
  source: string,
  kind: "image" | "video" | "audio" = "image",
) {
  const value = String(source || "").trim();
  if (!value)
    throw new Error(
      kind === "video"
        ? "视频地址为空"
        : kind === "audio"
          ? "音频地址为空"
          : "图片地址为空",
    );
  if (/^asset:\/\//i.test(value)) return value;
  if (kind === "image") return resolveWorkflowApiImageSource(value);
  if (value.startsWith("data:") || value.startsWith("blob:")) {
    const response = await fetch(value);
    if (!response.ok)
      throw new Error(
        `读取${kind === "video" ? "视频" : "音频"}失败: HTTP ${response.status}`,
      );
    const blob = await response.blob();
    const ext = kind === "video" ? "mp4" : "mp3";
    const file = new File([blob], `workflow-source-${Date.now()}.${ext}`, {
      type: blob.type || (kind === "video" ? "video/mp4" : "audio/mpeg"),
    });
    const { publicUrl, libtvUrl } = await uploadCanvasNodeFile(file);
    return libtvUrl || publicUrl;
  }
  if (
    value.startsWith("/api/image-proxy?") ||
    value.startsWith("/api/video-proxy?")
  ) {
    try {
      const parsed = new URL(value, window.location.origin);
      const proxied = parsed.searchParams.get("url");
      if (proxied) return proxied;
    } catch {
      return value;
    }
  }
  if (value.startsWith("/")) {
    if (typeof window !== "undefined" && window.location?.origin) {
      const absolute = new URL(value, window.location.origin).toString();
      try {
        const response = await fetch(absolute);
        if (!response.ok)
          throw new Error(
            "读取" +
              (kind === "video" ? "视频" : "音频") +
              "失败: HTTP " +
              response.status,
          );
        const blob = await response.blob();
        const ext = kind === "video" ? "mp4" : "mp3";
        const file = new File(
          [blob],
          "workflow-source-" + Date.now() + "." + ext,
          {
            type: blob.type || (kind === "video" ? "video/mp4" : "audio/mpeg"),
          },
        );
        const { publicUrl, libtvUrl } = await uploadCanvasNodeFile(file);
        return libtvUrl || publicUrl;
      } catch (error) {
        throw error instanceof Error
          ? error
          : new Error("本地媒体上传到造梦 API 开放平台失败");
      }
    }
    return value;
  }
  return value;
}

async function submitWorkflowSeedanceVirtualAsset(params: {
  fileId: number | string;
  name: string;
  modelId?: string;
  assetType?: "Image" | "Video" | "Audio";
}) {
  const assetType = params.assetType || "Image";
  const modelId =
    String(params.modelId || "volcengine-doubao-video").trim() ||
    "volcengine-doubao-video";
  const validation = await waitForPlatformSeedanceValidation(params.fileId);
  const assetId = String(validation.asset_id || "").trim();
  const assetUrl = String(
    validation.role_url || validation.asset_url || "",
  ).trim();
  if (!assetId || !assetUrl) throw new Error("Seedance2.0 未返回可用素材");
  return {
    fileId: Number(validation.file_id || params.fileId),
    fileUrl: String(validation.file_url || "").trim(),
    assetId,
    assetUrl,
    assetType,
    modelId,
    status: "Active" as const,
  };
}

async function classifyWorkflowCharacterImage(fileId: number | string) {
  const data = await classifyPlatformCharacterAsset(fileId);
  return {
    isCharacterAsset: Boolean(data?.is_character_asset),
    score: Number.isFinite(Number(data?.score)) ? Number(data.score) : 0,
    category: String(data?.category || "").trim(),
    reason: String(data?.reason || "").trim(),
  };
}

function normalizeWorkflowCanvasBackendJobRecord(
  value: unknown,
): WorkflowCanvasBackendJobRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, any>;
  const id = String(row.id || "").trim();
  const kind = String(row.kind || "").trim() as WorkflowCanvasBackendJobKind;
  const rawStatus = String(row.status || "")
    .trim()
    .toLowerCase();
  if (
    !id ||
    (kind !== "outpaint" &&
      kind !== "upscale" &&
      kind !== "video_upscale" &&
      kind !== "image_generate" &&
      kind !== "world_generate" &&
      kind !== "world_edit")
  )
    return null;
  const resultDataRaw =
    row.resultData && typeof row.resultData === "object"
      ? row.resultData
      : null;
  const payloadRaw =
    row.payload && typeof row.payload === "object" ? row.payload : null;
  return {
    id,
    kind,
    status:
      rawStatus === "success"
        ? "success"
        : rawStatus === "failed"
          ? "failed"
          : "processing",
    payload: payloadRaw
      ? {
          request:
            payloadRaw.request && typeof payloadRaw.request === "object"
              ? payloadRaw.request
              : undefined,
          projectId:
            typeof payloadRaw.projectId === "string"
              ? payloadRaw.projectId
              : undefined,
        }
      : undefined,
    resultData: resultDataRaw
      ? {
          stage:
            typeof resultDataRaw.stage === "string"
              ? resultDataRaw.stage
              : undefined,
          progress: Number.isFinite(Number(resultDataRaw.progress))
            ? Number(resultDataRaw.progress)
            : undefined,
          message:
            typeof resultDataRaw.message === "string"
              ? resultDataRaw.message
              : undefined,
          pollAfterMs: Number.isFinite(Number(resultDataRaw.pollAfterMs))
            ? Number(resultDataRaw.pollAfterMs)
            : undefined,
          externalTask: resultDataRaw.externalTask,
          response: resultDataRaw.response,
        }
      : undefined,
    resultUrl: typeof row.resultUrl === "string" ? row.resultUrl : null,
    errorMessage:
      typeof row.errorMessage === "string" ? row.errorMessage : null,
  };
}

async function createWorkflowCanvasBackendJob(params: {
  projectId: string;
  kind: WorkflowCanvasBackendJobKind;
  request: Record<string, any>;
  onImagePredictionSubmitted?: (event: WorkflowPredictionTaskEvent) => void;
  onImagePredictionCompleted?: (event: WorkflowPredictionTaskEvent) => void;
}) {
  if (params.kind === "image_generate") {
    const request = params.request || {};
    const modelId = String(request.modelId || request.model || "").trim();
    if (!modelId) throw new Error("请先选择图片模型");
    const submittedTaskIds: string[] = [];
    const prediction = await runWorkflowPrediction(
      {
        modelId,
        mode:
          String(request.workflowEndpointMethod || request.mode || "").trim() ||
          undefined,
        prompt: String(
          request.prompt || request.message || request.rawPrompt || "",
        ).trim(),
        aspectRatio: String(request.aspectRatio || "").trim() || undefined,
        imageSize:
          String(request.imageSize || request.size || "").trim() || undefined,
        count: request.count || request.n || 1,
        referenceImages: Array.isArray(request.referenceImages)
          ? request.referenceImages
          : Array.isArray(request.images)
            ? request.images
            : [],
        images: Array.isArray(request.images) ? request.images : [],
        extra: request,
      },
      {
        onSubmitted: (event) => {
          if (event.id && !submittedTaskIds.includes(event.id)) {
            submittedTaskIds.push(event.id);
          }
          params.onImagePredictionSubmitted?.(event);
        },
        onCompleted: params.onImagePredictionCompleted,
      },
    );
    const job: WorkflowCanvasBackendJobRecord = {
      id: "local-image-" + (prediction.id || Date.now()),
      kind: params.kind,
      status: "success",
      payload: { request, projectId: params.projectId },
      resultData: {
        stage: "completed",
        progress: 1,
        message: "图片生成完成",
        externalTask: {
          taskIds: submittedTaskIds,
          taskId:
            submittedTaskIds[submittedTaskIds.length - 1] || prediction.id,
        },
        response: {
          outputs: prediction.urls,
          urls: prediction.urls,
          prediction: prediction.result,
        },
      },
      resultUrl: prediction.urls[0] || null,
      errorMessage: null,
    };
    localWorkflowCanvasJobs.set(job.id, job);
    return job;
  }
  const response = await fetch("/api/canvas/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),

    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      getWorkflowErrorMessage(payload, "创建任务失败: HTTP " + response.status),
    );
  const job = normalizeWorkflowCanvasBackendJobRecord(payload);
  if (!job) throw new Error("创建任务返回异常");
  return job;
}

function isWorkflowTaskAbortError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: string }).name || "");
  const message = String((error as { message?: string }).message || "");
  return (
    name === "AbortError" ||
    message === "AbortError" ||
    message === "Workflow task aborted"
  );
}

const workflowCanvasJobDelay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Workflow task aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Workflow task aborted", "AbortError"));
    };
    signal?.addEventListener("abort", handleAbort, { once: true });
  });

async function fetchWorkflowCanvasBackendJob(
  jobId: string,
  signal?: AbortSignal,
) {
  const localJob = localWorkflowCanvasJobs.get(jobId);
  if (localJob) return localJob;
  let response: Response;
  try {
    response = await fetch(`/api/canvas/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store",
      signal,
      credentials: "include",
    });
  } catch (cause) {
    if (isWorkflowTaskAbortError(cause) || signal?.aborted) throw cause;
    const error = new Error(
      cause instanceof Error ? cause.message : "任务轮询网络异常",
    );
    (error as Error & { retryable?: boolean; cause?: unknown }).retryable =
      true;
    (error as Error & { retryable?: boolean; cause?: unknown }).cause = cause;
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (response.status === 429) {
    const retryAfter = Number(
      response.headers.get("retry-after") ||
        payload?.retryAfterMs ||
        payload?.retryAfter ||
        0,
    );
    const error = new Error(
      getWorkflowErrorMessage(payload, "任务状态查询过于频繁，请稍后重试"),
    );
    (error as Error & { status?: number; retryAfterMs?: number }).status = 429;
    (error as Error & { status?: number; retryAfterMs?: number }).retryAfterMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter > 100
          ? retryAfter
          : retryAfter * 1000
        : 3500;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(
      getWorkflowErrorMessage(payload, "任务轮询失败: HTTP " + response.status),
    );
    (error as Error & { status?: number; retryable?: boolean }).status =
      response.status;
    (error as Error & { status?: number; retryable?: boolean }).retryable =
      response.status === 408 ||
      response.status === 425 ||
      response.status >= 500;
    throw error;
  }
  const job = normalizeWorkflowCanvasBackendJobRecord(payload);
  if (!job) throw new Error("任务轮询返回异常");
  return job;
}

async function waitWorkflowCanvasBackendJob(params: {
  jobId: string;
  onProgress?: (job: WorkflowCanvasBackendJobRecord) => void;
  maxAttempts?: number;
  signal?: AbortSignal;
}) {
  const maxAttempts = Number.isFinite(Number(params.maxAttempts))
    ? Math.max(1, Math.floor(Number(params.maxAttempts)))
    : 280;
  let pollIntervalMs = 1400;
  let consecutiveTransientErrors = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (params.signal?.aborted)
      throw new DOMException("Workflow task aborted", "AbortError");
    let job: WorkflowCanvasBackendJobRecord;
    try {
      job = await fetchWorkflowCanvasBackendJob(params.jobId, params.signal);
    } catch (error) {
      const status = Number(
        (error as Error & { status?: number })?.status || 0,
      );
      const retryable =
        status === 429 ||
        Boolean((error as Error & { retryable?: boolean })?.retryable);
      if (retryable && consecutiveTransientErrors < 8) {
        consecutiveTransientErrors += 1;
        const retryAfterMs = Number(
          (error as Error & { retryAfterMs?: number })?.retryAfterMs || 0,
        );
        pollIntervalMs = Math.max(
          status === 429 ? 2500 : 1200,
          Math.min(
            12000,
            Number.isFinite(retryAfterMs) && retryAfterMs > 0
              ? retryAfterMs
              : pollIntervalMs * 1.6,
          ),
        );
        await workflowCanvasJobDelay(pollIntervalMs, params.signal);
        continue;
      }
      throw error;
    }
    consecutiveTransientErrors = 0;
    if (params.signal?.aborted)
      throw new DOMException("Workflow task aborted", "AbortError");
    params.onProgress?.(job);
    if (job.status === "success") return job;
    if (job.status === "failed")
      throw new Error(
        String(job.errorMessage || job.resultData?.message || "任务执行失败"),
      );
    const hintInterval = Number(job.resultData?.pollAfterMs || 0);
    if (Number.isFinite(hintInterval) && hintInterval > 0) {
      pollIntervalMs = Math.max(800, Math.min(8000, Math.floor(hintInterval)));
    } else if (attempt > 20) {
      pollIntervalMs = 2200;
    } else if (attempt > 8) {
      pollIntervalMs = 1800;
    }
    await workflowCanvasJobDelay(pollIntervalMs, params.signal);
  }
  throw new Error("任务轮询超时");
}

async function fetchWorkflowAudioTaskStatus(
  taskId: string,
  modelId: string,
  projectId?: string,
  signal?: AbortSignal,
): Promise<WorkflowAudioTaskStatus> {
  const query = new URLSearchParams();
  if (modelId) query.set("modelId", modelId);
  if (projectId) query.set("projectId", projectId);
  const queryText = query.toString();
  const url = `/api/libtv/audio/tasks/${encodeURIComponent(taskId)}${queryText ? `?${queryText}` : ""}`;
  console.info("[workflow/audio] poll task request", {
    url,
    taskId,
    modelId,
    projectId: projectId || "",
  });
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal,
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  console.info("[workflow/audio] poll task response", {
    url,
    statusCode: response.status,
    ok: response.ok,
    taskStatus: String(payload?.status || ""),
    hasAudioUrl: Boolean(String(payload?.audioUrl || "").trim()),
    error: String(payload?.error || ""),
    message: String(payload?.message || ""),
  });
  if (!response.ok)
    throw new Error(
      String(payload?.error || `音频任务轮询失败: HTTP ${response.status}`),
    );
  return payload || {};
}

async function waitWorkflowAudioTask(params: {
  taskId: string;
  modelId: string;
  projectId?: string;
  onProgress?: (status: WorkflowAudioTaskStatus, progress: number) => void;
  maxAttempts?: number;
  signal?: AbortSignal;
}) {
  const maxAttempts = Number.isFinite(Number(params.maxAttempts))
    ? Math.max(1, Math.floor(Number(params.maxAttempts)))
    : 180;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (params.signal?.aborted)
      throw new DOMException("Workflow task aborted", "AbortError");
    const status = await fetchWorkflowAudioTaskStatus(
      params.taskId,
      params.modelId,
      params.projectId,
      params.signal,
    );
    if (params.signal?.aborted)
      throw new DOMException("Workflow task aborted", "AbortError");
    const progress = Math.max(
      0.06,
      Math.min(0.98, 0.08 + (attempt / Math.max(1, maxAttempts - 1)) * 0.86),
    );
    params.onProgress?.(status, progress);
    if (
      String(status.status || "").toLowerCase() === "success" &&
      String(status.audioUrl || "").trim()
    ) {
      return status;
    }
    if (String(status.status || "").toLowerCase() === "failed") {
      throw new Error(String(status.error || status.message || "音频生成失败"));
    }
    await workflowCanvasJobDelay(attempt < 8 ? 2500 : 5000, params.signal);
  }
  throw new Error("音频任务轮询超时");
}

const WORKFLOW_CANVAS_RESULT_PAYLOAD_KEYS = [
  "url",
  "src",
  "image",
  "imageUrl",
  "image_url",
  "images",
  "imageUrls",
  "image_urls",
  "videoUrl",
  "video_url",
  "modelUrl",
  "model_url",
  "mediaUrl",
  "media_url",
  "fileUrl",
  "file_url",
  "downloadUrl",
  "download_url",
  "outputUrl",
  "output_url",
  "resultUrl",
  "result_url",
  "result",
  "results",
  "output",
  "outputs",
  "artifacts",
  "task_result",
  "taskResult",
  "data",
  "raw",
] as const;

function isWorkflowCanvasResultUrl(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("/")
  );
}

function getWorkflowNodeReferenceImageUrl(
  node: LibTvWorkflowNode | undefined,
): string {
  const data = (node?.data || {}) as Record<string, any>;
  const candidates: unknown[] = [
    data.mediaUrl,
    data.imageUrl,
    data.image_url,
    data.thumbnailUrl,
    data.thumbnail_url,
    data.fallbackImageUrl,
    data.outputUrl,
    data.output_url,
    data.resultUrl,
    data.result_url,
    data.url,
    data.src,
    Array.isArray(data.referenceImages) ? data.referenceImages[0] : undefined,
    Array.isArray(data.imageUrls) ? data.imageUrls[0] : undefined,
    Array.isArray(data.image_urls) ? data.image_urls[0] : undefined,
  ];
  for (const candidate of candidates) {
    const url = String(candidate || "").trim();
    if (url && isWorkflowCanvasResultUrl(url)) return url;
  }
  return "";
}

function enqueueWorkflowCanvasResultPayloadValues(
  queue: any[],
  current: Record<string, any>,
) {
  for (const key of WORKFLOW_CANVAS_RESULT_PAYLOAD_KEYS) {
    if (current[key]) queue.push(current[key]);
  }
}

function pickWorkflowCanvasJobResultUrl(payload: any): string | null {
  const queue: any[] = [payload];
  const seen = new Set<any>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (typeof current === "string") {
      const normalized = current.trim();
      if (isWorkflowCanvasResultUrl(normalized)) return normalized;
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current === "object") {
      if (seen.has(current)) continue;
      seen.add(current);
      enqueueWorkflowCanvasResultPayloadValues(
        queue,
        current as Record<string, any>,
      );
    }
  }
  return null;
}

function collectWorkflowCanvasJobResultUrls(payload: any): string[] {
  const out: string[] = [];
  const seen = new Set<any>();
  const push = (value: unknown) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    if (!isWorkflowCanvasResultUrl(normalized)) return;
    if (!out.includes(normalized)) out.push(normalized);
  };
  const queue: any[] = [payload];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (typeof current === "string") {
      push(current);
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current === "object") {
      if (seen.has(current)) continue;
      seen.add(current);
      enqueueWorkflowCanvasResultPayloadValues(
        queue,
        current as Record<string, any>,
      );
    }
  }
  return out;
}

function sanitizeWorkflowAngleExtraPrompt(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text
    .replace(/照片旋转|旋转画面/g, "")
    .replace(/[，,、\s]+$/g, "")
    .trim();
}

function describeWorkflowAngleHorizontalView(rotation: number) {
  if (rotation === 0) return "正面视角，拍摄对象正面朝向镜头";
  if (rotation === 45)
    return "虚拟相机沿拍摄对象周围的水平环绕轨道移动到 45° 左前方三分之四机位，拍摄对象在画面中呈向左旋转的侧面透视";
  if (rotation === 90)
    return "虚拟相机沿水平环绕轨道移动到 90° 纯侧面机位，拍摄对象侧面轮廓清晰";
  if (rotation === 135)
    return "虚拟相机沿水平环绕轨道移动到 135° 左后方三分之四机位，能看到拍摄对象背面/后侧与侧面";
  if (rotation === 180)
    return "虚拟相机沿水平环绕轨道移动到 180° 背面机位，生成同一拍摄对象的自然背面/后侧视角";
  if (rotation === 225)
    return "虚拟相机沿水平环绕轨道移动到 225° 右后方三分之四机位，能看到拍摄对象背面/后侧与另一侧侧面";
  if (rotation === 270)
    return "虚拟相机沿水平环绕轨道移动到 270° 纯侧面机位，拍摄对象另一侧侧面轮廓清晰";
  if (rotation === 315)
    return "虚拟相机沿水平环绕轨道移动到 315° 右前方三分之四机位，拍摄对象呈另一侧自然侧转透视";
  return `虚拟相机沿拍摄对象周围的 720° 球面轨道水平环绕到约 ${rotation}° 机位`;
}

function describeWorkflowAngleVerticalView(tilt: number, rotation: number) {
  if (tilt === 0) return "相机高度保持水平";
  const isFrontView = rotation === 0;
  if (tilt > 0) {
    return isFrontView
      ? `虚拟相机在拍摄对象正前方的球面轨道上升高到 +${tilt}° 高机位俯拍，镜头从拍摄对象上方前侧斜向下拍摄；拍摄对象的顶部/上表面和靠近镜头的前上部更大，底部/下端和远离镜头的部分更小，承托面或地面占画面更大面积，背景水平线或墙地交界线下移，形成真实正面俯拍透视`
      : `虚拟相机在球面轨道上升高到 +${tilt}° 俯拍机位，镜头向下看拍摄对象；近处顶部/上表面更大，远端和底部更小，承托面或地面透视明显`;
  }
  return isFrontView
    ? `虚拟相机在拍摄对象正前方的球面轨道下降低到 ${tilt}° 正面低机位仰拍，摄像机高度必须低于拍摄对象中线并接近地面/承托面，镜头明显向上看；画面必须出现低角度透视：拍摄对象底部/下端/前下边缘离镜头最近所以明显更大，顶部/上端更远更小，主体垂直边缘向上方汇聚，背景水平线升高或离开画面，能看到更多上方背景或顶部空间；禁止生成平视正面照、普通全身照、俯视顶面视角`
    : `虚拟相机在球面轨道下降低到 ${tilt}° 低机位仰拍，摄像机低于拍摄对象中线并向上看，拍摄对象下端近大、上端远小，背景和承托面产生真实低角度透视；禁止生成平视视角`;
}

function buildWorkflowAngleEditQwenPrompt(
  controls: WorkflowAngleEditCreateRequest["controls"],
) {
  const rotation = Math.round(Number(controls?.rotation || 0));
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  const tilt = Math.max(
    -30,
    Math.min(60, Math.round(Number(controls?.tilt || 0))),
  );
  const zoom = Math.max(
    0,
    Math.min(10, Math.round(Number(controls?.zoom || 0))),
  );
  const extraPrompt = controls?.promptEnabled
    ? sanitizeWorkflowAngleExtraPrompt(controls?.promptText)
    : "";
  const wantsDutchTilt = /dutch\s*angle|tilted\s*frame|倾斜视角|倾斜/i.test(
    String(controls?.promptText || ""),
  );
  const horizontalText =
    describeWorkflowAngleHorizontalView(normalizedRotation);
  const verticalText = describeWorkflowAngleVerticalView(
    tilt,
    normalizedRotation,
  );
  const zoomText =
    zoom <= 0
      ? "广角全景构图，拍摄对象完整入画，保留较多环境、承托面或背景空间"
      : zoom >= 10
        ? "近景构图，但不要裁掉拍摄对象关键轮廓、品牌标识、顶部、底部或边缘结构"
        : `中景到全景之间的景别缩放 ${zoom}/10，拍摄对象主体完整，画面类似真实摄影师靠近后拍摄`;

  return [
    "基于参考图做同一拍摄对象的多角度编辑，只输出一张真实摄影照片。",
    "核心逻辑：拍摄对象固定在原地不变，把参考图里的主体、承托面和背景当作可重建的三维场景；不要让主体主动变形、换姿态或换设计，而是让虚拟相机沿主体周围的 720° 球面轨道移动后重新拍摄。",
    `相机轨道参数：${horizontalText}；${verticalText}；${zoomText}。`,
    wantsDutchTilt
      ? "倾斜视角参考：低机位三分之四摄影，拍摄对象在画面中向左旋转，主体轮廓、垂直边缘或身体轴线因为低角度透视自然形成倾斜感；背景透视线向上汇聚，承托面近大远小，整体像真实摄影师从低处斜侧方拍摄。"
      : "",
    "只改变虚拟相机位置、镜头俯仰、景别和由此产生的主体透视关系；不要把原照片平面旋转、拉伸或简单裁切成假角度。",
    "保持拍摄对象身份、外形设计、比例、材质、颜色、纹理、品牌标识和整体摄影风格一致。",
    "根据新相机位置自然补全被遮挡侧面、背面/后侧、顶部、底部、边缘细节、承托面和背景透视，场景仍保持参考图的简洁摄影环境。",
    extraPrompt ? `额外要求：${extraPrompt}` : "",
    "禁止拼图、分屏、对比图、边框、水印、文字说明；禁止整张画面倾斜、禁止只旋转原图、禁止只移动主体不改变相机透视。",
  ]
    .filter(Boolean)
    .join("\n");
}

function collectWorkflowVideoUrls(payload: any): string[] {
  const urls = new Set<string>();
  const visit = (value: any, keyHint = "") => {
    if (!value) return;
    if (typeof value === "string") {
      const url = value.trim();
      if (!(
        url.startsWith("http://") ||
        url.startsWith("https://") ||
        url.startsWith("/")
      ))
        return;
      const isImageUrl =
        /\.(?:png|jpe?g|webp|gif|bmp|avif|svg)(?:[?#]|$)/i.test(url);
      const isPlayableUrl = /\.(?:mp4|mov|webm|m4v|mkv)(?:[?#]|$)/i.test(url);
      const isVideoKey = /video/i.test(keyHint);
      const isGenericResultKey =
        /(result|output|file|media|download|url)s?$/i.test(keyHint);
      if (isImageUrl && !isVideoKey) return;
      if (isPlayableUrl || isVideoKey || isGenericResultKey) urls.add(url);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, keyHint));
      return;
    }
    if (typeof value !== "object") return;
    const fileUrl = String(
      value.fileUrl || value.file_url || value.url || "",
    ).trim();
    const fileType = String(value.fileType || value.file_type || "")
      .trim()
      .toLowerCase();
    const mimeType = String(value.mimeType || value.mime_type || "")
      .trim()
      .toLowerCase();
    if (
      fileUrl &&
      (fileUrl.startsWith("http://") ||
        fileUrl.startsWith("https://") ||
        fileUrl.startsWith("/"))
    ) {
      const isImageDescriptor =
        fileType.includes("cover") ||
        fileType.includes("poster") ||
        fileType.includes("image") ||
        fileType.includes("frame") ||
        mimeType.startsWith("image/");
      const isVideoDescriptor =
        fileType.includes("video") ||
        mimeType.startsWith("video/") ||
        /\.(?:mp4|mov|webm|m4v|mkv)(?:[?#]|$)/i.test(fileUrl);
      if (isVideoDescriptor && !isImageDescriptor) {
        urls.add(fileUrl);
        return;
      }
      if (isImageDescriptor) return;
    }
    visit(value.videoUrl, `${keyHint}.videoUrl`);
    visit(value.url, `${keyHint}.url`);
    visit(value.video_url, `${keyHint}.video_url`);
    visit(value.src, `${keyHint}.src`);
    visit(value.resultUrl, `${keyHint}.resultUrl`);
    visit(value.result, `${keyHint}.result`);
    visit(value.results, `${keyHint}.results`);
    visit(value.task_result, `${keyHint}.task_result`);
    visit(value.taskResult, `${keyHint}.taskResult`);
    visit(value.output, `${keyHint}.output`);
    visit(value.data, `${keyHint}.data`);
    visit(value.videos, `${keyHint}.videos`);
  };
  visit(payload);
  return Array.from(urls);
}

function collectWorkflowVideoPosterUrls(payload: any): string[] {
  const urls = new Set<string>();
  const addUrl = (value: any) => {
    const url = String(value || "").trim();
    if (!url || !isWorkflowImageUrl(url)) return;
    urls.add(url);
  };
  const visit = (value: any, keyHint = "") => {
    if (!value) return;
    if (typeof value === "string") {
      if (
        /(thumbnail|thumb|cover|poster|preview|first[_-]?frame|last[_-]?frame)/i.test(
          keyHint,
        )
      )
        addUrl(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, keyHint));
      return;
    }
    if (typeof value !== "object") return;
    addUrl(value.thumbnailUrl);
    addUrl(value.thumbnail_url);
    addUrl(value.coverImageUrl);
    addUrl(value.cover_image_url);
    addUrl(value.posterUrl);
    addUrl(value.poster_url);
    addUrl(value.previewUrl);
    addUrl(value.preview_url);
    addUrl(value.firstFrameUrl);
    addUrl(value.first_frame_url);
    addUrl(value.lastFrameUrl);
    addUrl(value.last_frame_url);
    addUrl(value.content?.first_frame_url);
    addUrl(value.content?.last_frame_url);
    visit(value.task_result, `${keyHint}.task_result`);
    visit(value.taskResult, `${keyHint}.taskResult`);
    visit(value.result, `${keyHint}.result`);
    visit(value.results, `${keyHint}.results`);
    visit(value.output, `${keyHint}.output`);
    visit(value.data, `${keyHint}.data`);
    visit(value.task, `${keyHint}.task`);
    visit(value.raw, `${keyHint}.raw`);
  };
  visit(payload);
  return Array.from(urls);
}

function isWorkflowImageUrl(value: string) {
  const url = String(value || "").trim();
  return (
    Boolean(url) &&
    (url.startsWith("data:image/") ||
      url.startsWith("blob:") ||
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("/") ||
      /\.(?:png|jpe?g|webp|gif|bmp|avif)(?:[?#]|$)/i.test(url))
  );
}

function collectWorkflowVideoTailFrameUrls(payload: any): string[] {
  const urls = new Set<string>();
  const preferredKeys = new Set([
    "lastframeurl",
    "last_frame_url",
    "lastframe",
    "last_frame",
    "tailframeurl",
    "tail_frame_url",
    "tailframe",
    "tail_frame",
    "endframeurl",
    "end_frame_url",
    "endframe",
    "end_frame",
    "coverimage",
    "cover_image",
    "coverimageurl",
    "cover_image_url",
  ]);
  const visit = (value: any, keyHint = "") => {
    if (!value) return;
    if (typeof value === "string") {
      const url = value.trim();
      if (preferredKeys.has(keyHint.toLowerCase()) && isWorkflowImageUrl(url))
        urls.add(url);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, keyHint));
      return;
    }
    if (typeof value !== "object") return;
    if (preferredKeys.has(keyHint.toLowerCase())) {
      const url = String(
        (value as any).url ||
          (value as any).imageUrl ||
          (value as any).image_url ||
          (value as any).fileUrl ||
          (value as any).file_url ||
          (value as any).src ||
          "",
      ).trim();
      if (isWorkflowImageUrl(url)) urls.add(url);
    }
    Object.entries(value as Record<string, any>).forEach(([key, entry]) => {
      const normalizedKey = key.toLowerCase();
      if (preferredKeys.has(normalizedKey)) {
        visit(entry, normalizedKey);
        return;
      }
      if (
        normalizedKey === "files" ||
        normalizedKey === "images" ||
        normalizedKey === "content" ||
        normalizedKey === "task" ||
        normalizedKey === "data" ||
        normalizedKey === "result" ||
        normalizedKey === "results" ||
        normalizedKey === "output"
      ) {
        visit(entry, normalizedKey);
      }
    });
    const fileType = String(
      (value as any).fileType ||
        (value as any).file_type ||
        (value as any).type ||
        "",
    ).toLowerCase();
    if (
      fileType.includes("cover") ||
      fileType.includes("last") ||
      fileType.includes("tail") ||
      fileType.includes("end")
    ) {
      const url = String(
        (value as any).fileUrl ||
          (value as any).file_url ||
          (value as any).url ||
          (value as any).imageUrl ||
          (value as any).image_url ||
          "",
      ).trim();
      if (isWorkflowImageUrl(url)) urls.add(url);
    }
  };
  visit(payload);
  return Array.from(urls);
}

async function extractWorkflowVideoTailFrameUrl(videoUrl: string) {
  const sourceUrl = String(videoUrl || "").trim();
  if (!sourceUrl || typeof document === "undefined") return "";
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const cleanup = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("读取视频元数据超时")),
        20_000,
      );
      video.onloadedmetadata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("读取视频失败"));
      };
      video.src = toVideoDisplayUrl(sourceUrl);
      video.load();
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const targetTime = Math.max(0, duration - 0.08);
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("定位视频尾帧超时")),
        20_000,
      );
      video.onseeked = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("定位视频尾帧失败"));
      };
      try {
        video.currentTime = targetTime;
      } catch (error) {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("定位视频尾帧失败"));
      }
    });
    const width = Math.max(1, Math.round(video.videoWidth || 1280));
    const height = Math.max(1, Math.round(video.videoHeight || 720));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建尾帧画布");
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) resolve(value);
          else reject(new Error("尾帧导出失败"));
        },
        "image/jpeg",
        0.92,
      );
    });
    const file = new File([blob], `storyboard-video-tail-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    const { publicUrl, libtvUrl } = await uploadCanvasNodeFile(file);
    return libtvUrl || publicUrl;
  } catch (error) {
    console.warn(
      "[LibTvWorkflowCanvas] extract video tail frame failed",
      error,
    );
    return "";
  } finally {
    cleanup();
  }
}

function resolveWorkflowCanvasBackendJobResultUrl(
  job: WorkflowCanvasBackendJobRecord,
) {
  const direct = String(job.resultUrl || "").trim();
  if (direct) return direct;
  return pickWorkflowCanvasJobResultUrl([
    job.resultData?.response,
    job.resultData,
  ]);
}

function stripWorkflowHtmlToPlain(value: string) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pushUniqueString(target: string[], value: string) {
  const normalized = String(value || "").trim();
  if (!normalized || target.includes(normalized)) return;
  target.push(normalized);
}

function isWorkflowImageGeneratorResultGroupNode(
  node: LibTvWorkflowNode | undefined,
) {
  if (node?.kind !== "group" || !String(node.data?.mediaUrl || "").trim())
    return false;
  const title = String(node.data?.title || "").trim();
  if (title.includes("分镜")) return false;
  return (
    String(node.data?.componentType || "") === "image-generator" ||
    Boolean(node.data?.workflowGenerationJobId) ||
    Boolean(node.data?.generationCount) ||
    Boolean(node.data?.prompt) ||
    title.includes("图片生成器") ||
    title.includes("图片节点")
  );
}

function buildTextGeneratorWorkflowContext(
  sourceNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  const upstreamNodes = edges
    .filter((edge) => edge.target === sourceNode.id)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node): node is LibTvWorkflowNode => Boolean(node));

  const textBlocks: string[] = [];
  const videoBlocks: string[] = [];
  const imageUrls: string[] = [];

  upstreamNodes.forEach((node) => {
    if (node.kind === "text" && node.data?.componentType === "text-editor") {
      const plain =
        stripWorkflowHtmlToPlain(String(node.data?.content || "")) ||
        String(node.data?.prompt || "").trim();
      if (plain) {
        textBlocks.push(
          `【${String(node.data?.title || "普通文本").trim() || "普通文本"}】\n${plain}`,
        );
      }
      return;
    }

    if (node.kind === "image" && node.data?.mediaRole === "ordinary") {
      pushUniqueString(imageUrls, String(node.data?.mediaUrl || ""));
      return;
    }

    if (node.kind === "video" && node.data?.mediaRole === "ordinary") {
      const url = String(node.data?.mediaUrl || "").trim();
      const title = String(node.data?.title || "普通视频").trim() || "普通视频";
      const description =
        stripWorkflowHtmlToPlain(String(node.data?.content || "")) ||
        String(node.data?.prompt || "").trim();
      const lines = [`【参考视频：${title}】`];
      if (url) lines.push(`URL: ${url}`);
      if (description) lines.push(`说明: ${description}`);
      if (lines.length > 1) videoBlocks.push(lines.join("\n"));
    }
  });

  const ownReferenceImages = Array.isArray(sourceNode.data?.referenceImages)
    ? sourceNode.data.referenceImages
    : [];
  ownReferenceImages.forEach((url) =>
    pushUniqueString(imageUrls, String(url || "")),
  );

  return { textBlocks, videoBlocks, imageUrls };
}

function buildImageGeneratorWorkflowContext(
  sourceNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  const upstreamNodes = edges
    .filter((edge) => edge.target === sourceNode.id)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node): node is LibTvWorkflowNode => Boolean(node));

  const textBlocks: string[] = [];
  const referenceImages: string[] = [];
  const upstreamMedia: Array<{
    id: string;
    kind: LibTvWorkflowNodeKind;
    title: string;
    url?: string;
    role?: string;
  }> = [];

  upstreamNodes.forEach((node) => {
    const title = String(node.data?.title || node.kind).trim() || node.kind;
    if (node.kind === "text" && node.data?.componentType === "text-editor") {
      const plain =
        stripWorkflowHtmlToPlain(String(node.data?.content || "")) ||
        String(node.data?.prompt || "").trim();
      if (plain) textBlocks.push(`【${title}】\n${plain}`);
      return;
    }
    if (
      node.kind === "text" ||
      node.kind === "script" ||
      node.kind === "script-v2"
    ) {
      const plain =
        stripWorkflowHtmlToPlain(String(node.data?.content || "")) ||
        String(node.data?.prompt || "").trim();
      if (plain) textBlocks.push(`【${title}】\n${plain}`);
    }
    if (node.kind === "image" && node.data?.mediaRole === "ordinary") {
      const url = String(node.data?.mediaUrl || "").trim();
      if (url) {
        pushUniqueString(referenceImages, url);
        upstreamMedia.push({
          id: node.id,
          kind: node.kind,
          title,
          url,
          role: "reference_image",
        });
      }
      return;
    }
    if (isWorkflowImageGeneratorResultGroupNode(node)) {
      const url = String(node.data?.mediaUrl || "").trim();
      if (url) {
        pushUniqueString(referenceImages, url);
        upstreamMedia.push({
          id: node.id,
          kind: "image",
          title,
          url,
          role: "reference_image",
        });
      }
      return;
    }
    if (
      (node.kind === "video" || node.kind === "audio") &&
      node.data?.mediaRole === "ordinary"
    ) {
      upstreamMedia.push({
        id: node.id,
        kind: node.kind,
        title,
        url: String(node.data?.mediaUrl || "").trim() || undefined,
        role: "context_media",
      });
    }
  });

  const ownReferenceImages = Array.isArray(sourceNode.data?.referenceImages)
    ? sourceNode.data.referenceImages
    : [];
  ownReferenceImages.forEach((url) =>
    pushUniqueString(referenceImages, String(url || "")),
  );

  return { textBlocks, referenceImages, upstreamMedia };
}

function buildWorldGeneratorWorkflowContext(
  sourceNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  const base = buildImageGeneratorWorkflowContext(sourceNode, nodes, edges);
  const referenceVideos: string[] = [];
  const upstreamNodes = edges
    .filter((edge) => edge.target === sourceNode.id)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node): node is LibTvWorkflowNode => Boolean(node));

  upstreamNodes.forEach((node) => {
    if (node.kind === "video" && node.data?.mediaRole === "ordinary") {
      pushUniqueString(referenceVideos, String(node.data?.mediaUrl || ""));
    }
    if (node.kind === "threed") {
      const title = String(node.data?.title || "3D 世界").trim() || "3D 世界";
      const worldUrl = String(
        node.data?.worldUrl || node.data?.worldMarbleUrl || "",
      ).trim();
      const caption = String(
        node.data?.caption || node.data?.content || "",
      ).trim();
      const lines = [`【${title}】`];
      if (caption) lines.push(caption);
      if (worldUrl) lines.push(`Marble URL: ${worldUrl}`);
      if (lines.length > 1) base.textBlocks.push(lines.join("\n"));
    }
  });

  return { ...base, referenceVideos };
}

function buildWorldGeneratorPrompt(
  prompt: string,
  context: ReturnType<typeof buildWorldGeneratorWorkflowContext>,
) {
  const cleanPrompt = String(prompt || "").trim();
  if (cleanPrompt) return cleanPrompt;
  if (context.textBlocks.length > 0) return context.textBlocks.join("\n\n");
  return "Create an explorable 3D world based on the attached references.";
}

function buildWorldGeneratorDisplayName(
  prompt: string,
  sourceNode: LibTvWorkflowNode,
) {
  const cleanPrompt = String(prompt || "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanPrompt) return cleanPrompt.slice(0, 48);
  const title = String(sourceNode.data?.title || "")
    .replace(/\s+/g, " ")
    .trim();
  if (title) return title.slice(0, 48);
  return "Ideart 3D World";
}

function buildWorldGeneratorDebugPrompt(
  prompt: string,
  context: ReturnType<typeof buildWorldGeneratorWorkflowContext>,
) {
  const sections = [];
  if (context.textBlocks.length > 0) {
    sections.push(`# 上游文本内容\n${context.textBlocks.join("\n\n")}`);
  }
  if (context.referenceImages.length > 0) {
    sections.push(
      `# 参考图片\n已附带 ${context.referenceImages.length} 张图片作为空间、材质、构图或风格参考。`,
    );
  }
  if (context.referenceVideos.length > 0) {
    sections.push(`# 参考视频\n已附带 1 个视频作为空间和运动参考。`);
  }
  sections.push(`# 本次输入框提示词\n${prompt}`);
  return sections.join("\n\n");
}

function buildImageGeneratorPrompt(
  prompt: string,
  context: ReturnType<typeof buildImageGeneratorWorkflowContext>,
  cameraControl?: LibTvWorkflowNode["data"]["cameraControl"],
  stylePreset?: string,
) {
  const cleanPrompt = String(prompt || "").trim();
  const sections: string[] = [];
  if (context.textBlocks.length > 0) {
    sections.push(`# 上游文本内容\n${context.textBlocks.join("\n\n")}`);
  }
  if (context.referenceImages.length > 0) {
    sections.push(
      `# 参考图片\n已附带 ${context.referenceImages.length} 张图片作为主体、风格、构图或材质参考。不要把参考图拼贴进画面，而是提取可迁移的视觉信息。`,
    );
  }
  const normalizedStyle = String(stylePreset || "").trim();
  if (normalizedStyle && normalizedStyle !== "自动") {
    sections.push(`# 风格\n${normalizedStyle}`);
  }
  const mediaLines = context.upstreamMedia
    .filter((item) => item.kind !== "image")
    .map(
      (item) =>
        `- ${item.kind}: ${item.title}${item.url ? ` (${item.url})` : ""}`,
    );
  if (mediaLines.length > 0) {
    sections.push(`# 上游媒体上下文\n${mediaLines.join("\n")}`);
  }
  const cameraLines = [
    cameraControl?.camera ? `camera: ${cameraControl.camera}` : "",
    cameraControl?.lens ? `lens: ${cameraControl.lens}` : "",
    cameraControl?.focalLength
      ? `focal length: ${cameraControl.focalLength}`
      : "",
    cameraControl?.aperture ? `aperture: ${cameraControl.aperture}` : "",
  ].filter(Boolean);
  if (cameraLines.length > 0) {
    sections.push(`# 摄影机控制\n${cameraLines.join("\n")}`);
  }
  if (cleanPrompt) {
    sections.push(
      sections.length > 0 ? `# 生成要求\n${cleanPrompt}` : cleanPrompt,
    );
  }
  return sections.join("\n\n");
}

type WorkflowVideoMentionKind = "image" | "video" | "audio";

type WorkflowVideoMentionOption = {
  kind: WorkflowVideoMentionKind;
  nodeId: string;
  title: string;
  url: string;
  role?: string;
  originalUrl?: string;
};

const WORKFLOW_VIDEO_MEDIA_MENTION_REGEX =
  /@(图片|image|img|视频|video|vid|音频|audio|aud)\s*(\d{1,2})?/gi;
const WORKFLOW_SCRIPT_VIDEO_PROMPT_KEYS = [
  "motionPrompt",
  "motion_prompt",
  "videoMotionPrompt",
  "video_motion_prompt",
  "videoPrompt",
  "video_prompt",
  "videoDescription",
  "video_description",
  "cameraMovement",
  "camera_movement",
  "camera_motion",
  "镜头运动",
  "视频提示词",
  "动态提示词",
  "运镜提示词",
] as const;

function normalizeWorkflowVideoMentionKind(
  value: string,
): WorkflowVideoMentionKind | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["图片", "image", "img"].includes(normalized)) return "image";
  if (["视频", "video", "vid"].includes(normalized)) return "video";
  if (["音频", "audio", "aud"].includes(normalized)) return "audio";
  return null;
}

function normalizeWorkflowVideoPrompt(value: string) {
  return String(value || "")
    .replace(WORKFLOW_VIDEO_MEDIA_MENTION_REGEX, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolveWorkflowVideoMentionedUrls(
  prompt: string,
  options: WorkflowVideoMentionOption[],
  preferredKind: WorkflowVideoMentionKind,
) {
  const list = options.filter((item) => {
    if (item.kind !== preferredKind) return false;
    const role = String((item as any).role || "").trim();
    return role !== "seedance_virtual_character";
  });
  const resolved: string[] = [];
  const seen = new Set<string>();
  let autoIndex = 0;
  let match: RegExpExecArray | null = null;
  WORKFLOW_VIDEO_MEDIA_MENTION_REGEX.lastIndex = 0;
  while ((match = WORKFLOW_VIDEO_MEDIA_MENTION_REGEX.exec(prompt))) {
    const kind = normalizeWorkflowVideoMentionKind(match[1] || "");
    if (kind !== preferredKind) continue;
    const numbered = Number(match[2]);
    const index =
      Number.isFinite(numbered) && numbered > 0 ? numbered - 1 : autoIndex++;
    const option = list[index];
    if (!option?.url || seen.has(option.url)) continue;
    seen.add(option.url);
    resolved.push(option.url);
  }
  if (resolved.length > 0) return resolved;
  for (const option of list) {
    if (!option.url || seen.has(option.url)) continue;
    seen.add(option.url);
    resolved.push(option.url);
  }
  return resolved;
}

function getWorkflowSeedanceAssetUrlFromNode(node: LibTvWorkflowNode) {
  if (node.data?.workflowSeedanceAssetCategory !== "character") return "";
  const assetUrl = String(node.data?.workflowSeedanceAssetUrl || "").trim();
  if (/^asset:\/\//i.test(assetUrl)) return assetUrl;
  const assetId = String(node.data?.workflowSeedanceAssetId || "").trim();
  return assetId ? `asset://${assetId.replace(/^asset:\/\//i, "")}` : "";
}

function buildWorkflowVideoCharacterAssetFromNode(node: LibTvWorkflowNode) {
  const assetUrl = getWorkflowSeedanceAssetUrlFromNode(node);
  if (!assetUrl) return null;
  const assetId = String(
    node.data?.workflowSeedanceAssetId || assetUrl.replace(/^asset:\/\//i, ""),
  ).trim();
  const previewUrl = String(
    node.data?.mediaUrl || node.data?.thumbnailUrl || "",
  ).trim();
  const name = String(node.data?.title || "虚拟人物").trim();
  return {
    id: `seedance-virtual-${assetId || node.id}`,
    name,
    assetUrl,
    previewUrl: previewUrl || undefined,
    referenceImageUrl: previewUrl || undefined,
    source: "seedance-virtual-avatar",
    metadata: {
      mode: "private",
      assetId,
      assetUrl,
      groupId: node.data?.workflowSeedanceAssetGroupId,
      assetType: node.data?.workflowSeedanceAssetType || "Image",
      sourceNodeId: node.id,
      originalUrl: previewUrl || undefined,
    },
  } satisfies NonNullable<
    LibTvWorkflowNode["data"]["videoCharacterAssets"]
  >[number];
}

function collectWorkflowVideoCharacterReferenceKeys(node: LibTvWorkflowNode) {
  const assets = Array.isArray(node.data?.videoCharacterAssets)
    ? node.data.videoCharacterAssets
    : [];
  const sourceNodeIds = new Set<string>();
  const previewUrls = new Set<string>();
  for (const asset of assets) {
    const metadata =
      asset?.metadata && typeof asset.metadata === "object"
        ? asset.metadata
        : {};
    const sourceNodeId = String((metadata as any).sourceNodeId || "").trim();
    if (sourceNodeId) sourceNodeIds.add(sourceNodeId);
    [
      asset?.referenceImageUrl,
      asset?.previewUrl,
      (metadata as any).originalUrl,
      (metadata as any).previewUrl,
      (metadata as any).preview_url,
    ].forEach((value) => {
      const url = String(value || "").trim();
      if (url) previewUrls.add(url);
    });
  }
  return { sourceNodeIds, previewUrls };
}

function getWorkflowScriptRowMotionPrompt(row: LibTvStoryboardScriptRow) {
  const record = row as LibTvStoryboardScriptRow & Record<string, unknown>;
  for (const key of WORKFLOW_SCRIPT_VIDEO_PROMPT_KEYS) {
    const value = String(record[key] || "").trim();
    if (value && value !== "-") return value;
  }
  return "";
}

function collectWorkflowScriptRowReferenceImages(
  row: LibTvStoryboardScriptRow,
) {
  const images: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    const url = String(value || "").trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push(url);
  };
  push(row.referenceImage);
  push(row.characterImage1);
  push(row.characterImage2);
  return images;
}

function collectVideoGeneratorUpstreamScriptNodes(
  sourceNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  return edges
    .filter((edge) => edge.target === sourceNode.id)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node): node is LibTvWorkflowNode =>
      Boolean(
        (node?.kind === "script" || node?.kind === "script-v2") &&
        node.data?.scriptResult?.rows?.length,
      ),
    );
}

function buildWorkflowScriptRowVideoPrompt(
  scriptResult: LibTvStoryboardScriptResult,
  row: LibTvStoryboardScriptRow,
  rowIndex: number,
  userPrompt?: string,
) {
  const motionPrompt = getWorkflowScriptRowMotionPrompt(row);
  const storyboardNumber = String(row.shotNumber || rowIndex + 1).trim();
  const title = String(scriptResult.title || "分镜视频").trim();
  const lines = [
    `分镜 ${storyboardNumber} 视频生成`,
    `全片标题：${title}`,
    row.duration ? `时长：${row.duration}` : "",
    row.visualDescription ? `画面描述：${row.visualDescription}` : "",
    row.storyboardPrompt ? `分镜提示词：${row.storyboardPrompt}` : "",
    motionPrompt ? `视频提示词：${motionPrompt}` : "",
    row.character1
      ? `角色1：${row.character1}${row.characterDescription1 ? `，${row.characterDescription1}` : ""}`
      : "",
    row.character2
      ? `角色2：${row.character2}${row.characterDescription2 ? `，${row.characterDescription2}` : ""}`
      : "",
    row.shotType ? `镜头类型：${row.shotType}` : "",
    row.characterAction ? `人物动作：${row.characterAction}` : "",
    row.emotion ? `情绪：${row.emotion}` : "",
    row.sceneTags ? `场景标签：${row.sceneTags}` : "",
    row.lightingAtmosphere ? `光线氛围：${row.lightingAtmosphere}` : "",
    row.dialogue ? `对白：${row.dialogue}` : "",
    row.soundEffect ? `声音/音效：${row.soundEffect}` : "",
    userPrompt ? `额外要求：${normalizeWorkflowVideoPrompt(userPrompt)}` : "",
    "严格按照本分镜的信息生成单个视频片段，保持角色形象、参考图、场景和动作一致，不要合并其他分镜。",
  ].filter(Boolean);
  return lines.join("\n");
}

function buildVideoGeneratorWorkflowContext(
  sourceNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  const shouldUseSeedanceVirtualAssets = isWorkflowSeedance2VideoModel(
    sourceNode.data?.modelId,
  );
  const upstreamNodes = edges
    .filter((edge) => edge.target === sourceNode.id)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node): node is LibTvWorkflowNode => Boolean(node));

  const textBlocks: string[] = [];
  const mentionOptions: WorkflowVideoMentionOption[] = [];
  const upstreamMedia: Array<{
    id: string;
    kind: LibTvWorkflowNodeKind;
    title: string;
    url?: string;
    role?: string;
  }> = [];
  const seenMediaKeys = new Set<string>();
  const seedanceVirtualNodeIds = new Set<string>();
  const seedanceVirtualOriginalUrls = new Set<string>();
  const pushMediaOption = (
    option: WorkflowVideoMentionOption,
    role: string,
  ) => {
    const key = `${option.kind}:${option.url}`;
    if (!option.url || seenMediaKeys.has(key)) return;
    seenMediaKeys.add(key);
    mentionOptions.push({ ...option, role });
    upstreamMedia.push({
      id: option.nodeId,
      kind: option.kind,
      title: option.title,
      url: option.url,
      role,
    });
  };
  upstreamNodes.forEach((node) => {
    const title = String(node.data?.title || node.kind).trim() || node.kind;
    if (
      node.kind === "text" ||
      node.kind === "script" ||
      node.kind === "script-v2"
    ) {
      const plain =
        stripWorkflowHtmlToPlain(String(node.data?.content || "")) ||
        String(node.data?.prompt || "").trim();
      if (plain) textBlocks.push(`【${title}】\n${plain}`);
      return;
    }
    if (isWorkflowImageGeneratorResultGroupNode(node)) {
      const url = String(node.data?.mediaUrl || "").trim();
      if (!url) return;
      const seedanceAssetUrl = shouldUseSeedanceVirtualAssets
        ? getWorkflowSeedanceAssetUrlFromNode(node)
        : "";
      if (seedanceAssetUrl) {
        seedanceVirtualNodeIds.add(node.id);
        seedanceVirtualOriginalUrls.add(url);
      }
      pushMediaOption(
        {
          kind: "image",
          nodeId: node.id,
          title,
          url: seedanceAssetUrl || url,
          originalUrl: seedanceAssetUrl ? url : undefined,
        },
        seedanceAssetUrl ? "seedance_virtual_character" : "reference_image",
      );
      return;
    }
    if (
      node.kind === "image" ||
      node.kind === "video" ||
      node.kind === "audio"
    ) {
      const url = String(node.data?.mediaUrl || "").trim();
      if (!url) return;
      const kind = node.kind as WorkflowVideoMentionKind;
      const seedanceAssetUrl = shouldUseSeedanceVirtualAssets
        ? getWorkflowSeedanceAssetUrlFromNode(node)
        : "";
      if (seedanceAssetUrl) {
        seedanceVirtualNodeIds.add(node.id);
        seedanceVirtualOriginalUrls.add(url);
      }
      pushMediaOption(
        {
          kind,
          nodeId: node.id,
          title,
          url: seedanceAssetUrl || url,
          originalUrl: seedanceAssetUrl ? url : undefined,
        },
        seedanceAssetUrl ? "seedance_virtual_character" : `reference_${kind}`,
      );
    }
  });
  const ownReferenceImages = Array.isArray(sourceNode.data?.referenceImages)
    ? sourceNode.data.referenceImages
    : [];
  ownReferenceImages.forEach((item, index) => {
    const url = String(item || "").trim();
    if (!url) return;
    const nodeId = String(
      sourceNode.data?.referenceImageNodeIds?.[index] ||
        `${sourceNode.id}:reference-image:${index}`,
    );
    if (
      shouldUseSeedanceVirtualAssets &&
      ((nodeId && seedanceVirtualNodeIds.has(nodeId)) ||
        seedanceVirtualOriginalUrls.has(url))
    )
      return;
    const title = `参考图片 ${index + 1}`;
    pushMediaOption({ kind: "image", nodeId, title, url }, "reference_image");
  });
  return { textBlocks, mentionOptions, upstreamMedia };
}

function buildVideoGeneratorPrompt(
  prompt: string,
  context: ReturnType<typeof buildVideoGeneratorWorkflowContext>,
  cameraMotion?: LibTvWorkflowNode["data"]["videoCameraMotion"],
) {
  const cleanPrompt = normalizeWorkflowVideoPrompt(prompt);
  const sections: string[] = [];
  if (context.textBlocks.length > 0) {
    sections.push(`# 上游文本内容\n${context.textBlocks.join("\n\n")}`);
  }
  const motionLabel = String(cameraMotion?.label || "").trim();
  const motionPrompt = String(cameraMotion?.prompt || "").trim();
  if (motionLabel || motionPrompt) {
    sections.push(
      `# 运镜\n${[motionLabel, motionPrompt].filter(Boolean).join("：")}`,
    );
  }
  if (context.upstreamMedia.length > 0) {
    const characterCount = context.upstreamMedia.filter(
      (item) => item.role === "seedance_virtual_character",
    ).length;
    const imageCount = context.upstreamMedia.filter(
      (item) =>
        item.kind === "image" && item.role !== "seedance_virtual_character",
    ).length;
    const videoCount = context.upstreamMedia.filter(
      (item) => item.kind === "video",
    ).length;
    const audioCount = context.upstreamMedia.filter(
      (item) => item.kind === "audio",
    ).length;
    const mediaNotes = [
      characterCount > 0
        ? `已附带 ${characterCount} 个角色素材，作为人物外观、主体身份、服装和形象一致性的依据。`
        : "",
      imageCount > 0
        ? `已附带 ${imageCount} 张普通参考图片，作为场景、构图、风格或画面内容依据。`
        : "",
      videoCount > 0
        ? `已附带 ${videoCount} 个参考视频，作为动作、镜头或画面变化依据。`
        : "",
      audioCount > 0
        ? `已附带 ${audioCount} 段参考音频，作为声音或节奏依据。`
        : "",
    ].filter(Boolean);
    if (mediaNotes.length > 0) {
      sections.push(`# 参考素材\n${mediaNotes.join("\n")}`);
    }
  }
  if (cleanPrompt) {
    sections.push(
      sections.length > 0 ? `# 生成要求\n${cleanPrompt}` : cleanPrompt,
    );
  }
  return sections.length > 0
    ? sections.join("\n\n")
    : "请基于已提供的素材生成自然流畅的视频。";
}

function collectWorkflowScriptUpstreamIds(
  targetId: string,
  edges: LibTvWorkflowEdge[],
) {
  const reverseGraph = new Map<string, string[]>();
  edges.forEach((edge) => {
    const current = reverseGraph.get(edge.target) || [];
    current.push(edge.source);
    reverseGraph.set(edge.target, current);
  });
  const visited = new Set<string>();
  const queue = [...(reverseGraph.get(targetId) || [])];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);
    (reverseGraph.get(nodeId) || []).forEach((parentId) => {
      if (!visited.has(parentId)) queue.push(parentId);
    });
  }
  return [...visited];
}

function hasWorkflowScriptSourceContent(
  scriptNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  if (String(scriptNode.data?.prompt || "").trim()) return true;
  if (String(scriptNode.data?.content || "").trim()) return true;
  if (
    Array.isArray(scriptNode.data?.referenceImages) &&
    scriptNode.data.referenceImages.some((url) => String(url || "").trim())
  )
    return true;
  const upstreamIds = new Set(
    collectWorkflowScriptUpstreamIds(scriptNode.id, edges),
  );
  return nodes.some((node) => {
    if (!upstreamIds.has(node.id)) return false;
    if (node.kind === "text") {
      return Boolean(
        stripWorkflowHtmlToPlain(String(node.data?.content || "")) ||
        String(node.data?.prompt || "").trim(),
      );
    }
    if (
      node.kind === "image" ||
      node.kind === "video" ||
      node.kind === "audio"
    ) {
      return Boolean(
        String(
          node.data?.mediaUrl || node.data?.referenceImages?.[0] || "",
        ).trim(),
      );
    }
    return false;
  });
}

function normalizeWorkflowStoryboardMatchText(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-:：/\\|【】\[\]()（）"'“”‘’]+/g, "");
}

function workflowStoryboardTextMatches(text: unknown, candidate: unknown) {
  const normalizedText = normalizeWorkflowStoryboardMatchText(text);
  const normalizedCandidate = normalizeWorkflowStoryboardMatchText(candidate);
  if (!normalizedText || !normalizedCandidate) return false;
  return (
    normalizedText.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedText)
  );
}

function flattenWorkflowStoryboardMatchValues(value: unknown): unknown[] {
  if (Array.isArray(value))
    return value.flatMap(flattenWorkflowStoryboardMatchValues);
  if (value && typeof value === "object")
    return Object.values(value as Record<string, unknown>).flatMap(
      flattenWorkflowStoryboardMatchValues,
    );
  return [value];
}

function getWorkflowStoryboardNormalizedTokens(...values: unknown[]) {
  return new Set(
    values
      .flatMap(flattenWorkflowStoryboardMatchValues)
      .map((value) => normalizeWorkflowStoryboardMatchText(value))
      .filter((value) => value.length >= 2),
  );
}

function workflowStoryboardTokenMatches(
  tokens: Set<string>,
  ...candidates: unknown[]
) {
  const candidateTokens = getWorkflowStoryboardNormalizedTokens(...candidates);
  for (const token of tokens) {
    for (const candidate of candidateTokens) {
      if (
        token === candidate ||
        token.includes(candidate) ||
        candidate.includes(token)
      )
        return true;
    }
  }
  return false;
}

function workflowStoryboardExactTokenMatches(
  tokens: Set<string>,
  ...candidates: unknown[]
) {
  const candidateTokens = getWorkflowStoryboardNormalizedTokens(...candidates);
  for (const token of tokens) {
    for (const candidate of candidateTokens) {
      if (token && candidate && token === candidate) return true;
    }
  }
  return false;
}

function workflowStoryboardNameTokenMatches(
  tokens: Set<string>,
  ...candidates: unknown[]
) {
  const candidateTokens = getWorkflowStoryboardNormalizedTokens(...candidates);
  for (const token of tokens) {
    if (token.length < 2) continue;
    for (const candidate of candidateTokens) {
      if (candidate.length < 2) continue;
      if (token === candidate) return true;
      if (token.length >= 3 && candidate.includes(token)) return true;
    }
  }
  return false;
}

function getWorkflowStoryboardRowSearchText(
  row: LibTvStoryboardScriptRow | undefined,
) {
  if (!row) return "";
  return [
    row.shotNumber,
    row.visualDescription,
    row.narrativeContent,
    row.character1,
    row.characterDescription1,
    row.character2,
    row.characterDescription2,
    row.sceneKey,
    row.sceneAssetKey,
    row.sceneTags,
    row.lightingAtmosphere,
    row.characterAction,
    row.imageGenerationPrompt,
    row.storyboardPrompt,
    row.videoMotionPrompt,
    row.motionPrompt,
    row.dialogue,
    row.soundEffect,
    ...(Array.isArray(row.characters)
      ? row.characters.flatMap(flattenWorkflowStoryboardMatchValues)
      : []),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

function getWorkflowStoryboardRowPropNames(
  row: LibTvStoryboardScriptRow | undefined,
) {
  return getLibTvScriptV2RowPropNames(row);
}

function resolveWorkflowStoryboardRowImagePrompt(
  row: LibTvStoryboardScriptRow | undefined,
  fallbackPrompt = "",
) {
  if (!row) return String(fallbackPrompt || "").trim();
  const record = row as LibTvStoryboardScriptRow & Record<string, unknown>;
  return String(
    record.imageGenerationPrompt ||
      row.storyboardPrompt ||
      row.visualDescription ||
      row.narrativeContent ||
      row.characterAction ||
      fallbackPrompt ||
      "",
  ).trim();
}

function normalizeWorkflowScriptV2AssetKind(
  value: unknown,
): "角色" | "场景" | "道具" | "" {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return "";
  if (text === "角色" || text.includes("character") || text.includes("role"))
    return "角色";
  if (text === "场景" || text.includes("scene")) return "场景";
  if (text === "道具" || text.includes("prop")) return "道具";
  return "";
}

function getWorkflowStoryboardAssetReferenceNodesForRow(
  row: LibTvStoryboardScriptRow | undefined,
  assetNodes: LibTvWorkflowNode[],
) {
  const rowText = getWorkflowStoryboardRowSearchText(row);
  if (!rowText) return [];
  const characters = Array.isArray(row?.characters)
    ? row?.characters || []
    : [];
  const explicitCharacterIdTokens = getWorkflowStoryboardNormalizedTokens(
    row?.characterAssetId1,
    row?.characterAssetId2,
    row?.characterPersonaKey1,
    row?.characterPersonaKey2,
    row?.characterKeys,
    characters.map((character) => {
      const record = character as Record<string, unknown>;
      return [
        record.assetId,
        record.asset_id,
        record.characterAssetId,
        record.character_asset_id,
        record.personaKey,
        record.persona_key,
        record.characterPersonaKey,
        record.character_persona_key,
        record.id,
      ];
    }),
  );
  const characterNameTokens = getWorkflowStoryboardNormalizedTokens(
    row?.character1,
    row?.character2,
    Array.isArray(row?.characterKeys) ? row?.characterKeys : [],
    characters.map((character) => {
      const record = character as Record<string, unknown>;
      return [
        record.characterName,
        record.character_name,
        record.name,
        record.character,
        record.role,
        record.title,
      ];
    }),
  );
  const sceneText = [row?.sceneKey, row?.sceneAssetKey].join("\n");
  const propText = [getWorkflowStoryboardRowPropNames(row)].join("\n");
  const sceneTokens = getWorkflowStoryboardNormalizedTokens(
    row?.sceneKey,
    row?.sceneAssetKey,
  );
  const propTokens = getWorkflowStoryboardNormalizedTokens(
    getWorkflowStoryboardRowPropNames(row),
  );
  const result: LibTvWorkflowNode[] = [];
  const pushNode = (node: LibTvWorkflowNode) => {
    if (!getWorkflowNodeReferenceImageUrl(node)) return;
    if (result.some((item) => item.id === node.id)) return;
    result.push(node);
  };
  const roleAssets = assetNodes.filter(
    (node) =>
      normalizeWorkflowScriptV2AssetKind(
        (node.data as any)?.workflowScriptV2AssetKind,
      ) === "角色",
  );
  const sceneAssets = assetNodes.filter(
    (node) =>
      normalizeWorkflowScriptV2AssetKind(
        (node.data as any)?.workflowScriptV2AssetKind,
      ) === "场景",
  );
  const propAssets = assetNodes.filter(
    (node) =>
      normalizeWorkflowScriptV2AssetKind(
        (node.data as any)?.workflowScriptV2AssetKind,
      ) === "道具",
  );

  roleAssets.forEach((node) => {
    const title = String(node.data?.title || "").trim();
    const assetId = String(
      (node.data as any)?.workflowScriptV2AssetId || "",
    ).trim();
    const modelId = String(
      (node.data as any)?.workflowScriptV2AssetModelId ||
        node.data?.modelId ||
        "",
    ).trim();
    if (
      workflowStoryboardExactTokenMatches(
        explicitCharacterIdTokens,
        assetId,
        modelId,
      ) ||
      workflowStoryboardNameTokenMatches(characterNameTokens, title)
    )
      pushNode(node);
  });
  sceneAssets.forEach((node) => {
    const title = String(node.data?.title || "").trim();
    const assetId = String(
      (node.data as any)?.workflowScriptV2AssetId || "",
    ).trim();
    const modelId = String(
      (node.data as any)?.workflowScriptV2AssetModelId ||
        node.data?.modelId ||
        "",
    ).trim();
    if (
      workflowStoryboardTokenMatches(sceneTokens, assetId, modelId, title) ||
      workflowStoryboardTextMatches(sceneText || rowText, title)
    )
      pushNode(node);
  });
  propAssets.forEach((node) => {
    const title = String(node.data?.title || "").trim();
    const prompt = String(node.data?.prompt || "").trim();
    const assetId = String(
      (node.data as any)?.workflowScriptV2AssetId || "",
    ).trim();
    const modelId = String(
      (node.data as any)?.workflowScriptV2AssetModelId ||
        node.data?.modelId ||
        "",
    ).trim();
    if (
      workflowStoryboardTokenMatches(propTokens, assetId, modelId, title) ||
      workflowStoryboardTextMatches(propText, title) ||
      workflowStoryboardTextMatches(propText, prompt)
    )
      pushNode(node);
  });
  return result;
}

function hydrateWorkflowStoryboardAssetReferenceNodes(
  sourceNode: LibTvWorkflowNode,
  assetNodes: LibTvWorkflowNode[],
) {
  const assetsByKind = (sourceNode.data as Record<string, any>)
    ?.scriptV2AssetsByKind;
  if (!assetsByKind || typeof assetsByKind !== "object") return assetNodes;
  const assetById = new Map<
    string,
    LibTvScriptV2AssetItem & { kind?: LibTvScriptV2AssetKind }
  >();
  (["角色", "场景", "道具"] as LibTvScriptV2AssetKind[]).forEach((kind) => {
    const items = Array.isArray(assetsByKind[kind]) ? assetsByKind[kind] : [];
    items.forEach((item: LibTvScriptV2AssetItem) => {
      const id = String(item?.id || "").trim();
      if (id) assetById.set(id, { ...item, kind });
    });
  });
  if (assetById.size === 0) return assetNodes;
  return assetNodes.map((node) => {
    const assetId = String(
      (node.data as any)?.workflowScriptV2AssetId || "",
    ).trim();
    const asset = assetId ? assetById.get(assetId) : undefined;
    if (!asset) return node;
    return {
      ...node,
      data: {
        ...node.data,
        title: String(node.data?.title || asset.title || "").trim(),
        prompt: String(node.data?.prompt || asset.prompt || "").trim(),
        workflowScriptV2AssetKind: String(
          (node.data as any)?.workflowScriptV2AssetKind || asset.kind || "",
        ).trim(),
        workflowScriptV2AssetModelId: String(
          (node.data as any)?.workflowScriptV2AssetModelId ||
            asset.modelId ||
            "",
        ).trim(),
        workflowAssetStage:
          String(
            (node.data as any)?.workflowAssetStage || asset.assetStage || "",
          ).trim() || undefined,
        workflowAssetPersonaId:
          String(
            (node.data as any)?.workflowAssetPersonaId || asset.personaId || "",
          ).trim() || undefined,
        workflowAssetReviewStatus:
          (node.data as any)?.workflowAssetReviewStatus ||
          asset.reviewStatus ||
          undefined,
        workflowSceneCleanPlate:
          (node.data as any)?.workflowSceneCleanPlate === true ||
          asset.cleanPlate === true,
      } as any,
    };
  });
}

function getWorkflowScriptV2AssetIdsByKind(sourceNode: LibTvWorkflowNode) {
  const assetsByKind = (sourceNode.data as Record<string, any>)
    ?.scriptV2AssetsByKind;
  const idsByKind = new Map<string, Set<string>>();
  if (!assetsByKind || typeof assetsByKind !== "object") return idsByKind;
  (["角色", "场景", "道具"] as LibTvScriptV2AssetKind[]).forEach((kind) => {
    const items = Array.isArray(assetsByKind[kind]) ? assetsByKind[kind] : [];
    items.forEach((item: LibTvScriptV2AssetItem) => {
      const id = String(item?.id || "").trim();
      if (!id) return;
      const current = idsByKind.get(kind) || new Set<string>();
      current.add(id);
      idsByKind.set(kind, current);
    });
  });
  return idsByKind;
}

function getWorkflowStoryboardAssetNodesForScript(
  sourceNode: LibTvWorkflowNode,
  allNodes: LibTvWorkflowNode[],
  allEdges: LibTvWorkflowEdge[],
) {
  const nodeById = new Map(allNodes.map((node) => [node.id, node]));
  const candidateIds = new Set<string>();
  const addGroupMembers = (groupId: string) => {
    const group = nodeById.get(groupId);
    if (!group || group.kind !== "group") return;
    (Array.isArray(group.data?.groupNodeIds) ? group.data.groupNodeIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
      .forEach((id) => candidateIds.add(id));
    allNodes
      .filter((node) => node.parentId === group.id)
      .forEach((node) => candidateIds.add(node.id));
  };

  const assetGroupId = String(
    (sourceNode.data as Record<string, any>)?.scriptV2AssetGroupId || "",
  ).trim();
  if (assetGroupId) addGroupMembers(assetGroupId);

  allEdges
    .filter((edge) => edge.target === sourceNode.id)
    .forEach((edge) => {
      const upstream = nodeById.get(edge.source);
      if (!upstream) return;
      if (upstream.kind === "group") {
        addGroupMembers(upstream.id);
        return;
      }
      candidateIds.add(upstream.id);
    });

  const sourceAssetIdsByKind = getWorkflowScriptV2AssetIdsByKind(sourceNode);
  if (sourceAssetIdsByKind.size > 0) {
    allNodes.forEach((node) => {
      const kind = normalizeWorkflowScriptV2AssetKind(
        (node.data as any)?.workflowScriptV2AssetKind,
      );
      const assetId = String(
        (node.data as any)?.workflowScriptV2AssetId || "",
      ).trim();
      if (kind && assetId && sourceAssetIdsByKind.get(kind)?.has(assetId)) {
        candidateIds.add(node.id);
      }
    });
  }

  const assetNodes = Array.from(candidateIds)
    .map((id) => nodeById.get(id))
    .filter((node): node is LibTvWorkflowNode => Boolean(node))
    .filter(
      (node) =>
        node.kind === "image" &&
        Boolean(getWorkflowNodeReferenceImageUrl(node)) &&
        Boolean(
          normalizeWorkflowScriptV2AssetKind(
            (node.data as any)?.workflowScriptV2AssetKind,
          ),
        ),
    );
  return hydrateWorkflowStoryboardAssetReferenceNodes(sourceNode, assetNodes);
}

async function runWorkflowStoryboardRowsWithConcurrency(
  rowIndexes: number[],
  concurrency: number,
  handler: (rowIndex: number) => Promise<void>,
) {
  const queue = [...rowIndexes];
  const workerCount = Math.max(
    1,
    Math.min(Math.max(1, Math.floor(concurrency)), queue.length || 1),
  );
  let stopped = false;
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (!stopped && queue.length > 0) {
        const rowIndex = queue.shift();
        if (typeof rowIndex !== "number") continue;
        try {
          await handler(rowIndex);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    }),
  );
}

function WorkflowPersistenceEffects({
  libtvCanvases,
  activeLibTvCanvasId,
  autosaveReady,
}: {
  libtvCanvases?: LibTvProjectCanvas[];
  activeLibTvCanvasId?: string;
  autosaveReady: boolean;
}) {
  const stageRef = useRef<any>(null);
  const {
    projectId,
    libtvWorkflow,
    projectMaterials,
    snapshotRequest,
    setCanvasSnapshot,
    downloadTrigger,
    resetDownload,
  } = useCanvasStore(
    useShallow((state) => ({
      projectId: state.projectId,
      libtvWorkflow: state.libtvWorkflow,
      projectMaterials: state.projectMaterials,
      snapshotRequest: state.snapshotRequest,
      setCanvasSnapshot: state.setCanvasSnapshot,
      downloadTrigger: state.downloadTrigger,
      resetDownload: state.resetDownload,
    })),
  );

  useCanvasDataEffects({
    layers: [],
    updateLayer: () => undefined,
    stageRef,
    snapshotRequest,
    setCanvasSnapshot,
    projectId,
    libtvWorkflow,
    libtvCanvases,
    activeLibTvCanvasId,
    projectMaterials,
    selectedIds: [],
    downloadTrigger,
    resetDownload,
    autosaveReady,
    persistInitialState: true,
  });

  return null;
}

export function LibTvWorkflowCanvas({
  imageUrl: _imageUrl,
  readOnly = false,
  initialCanvases,
  initialActiveCanvasId,
  onCanvasWorkspaceChange,
}: {
  imageUrl: string | null;
  readOnly?: boolean;
  initialCanvases?: LibTvProjectCanvas[];
  initialActiveCanvasId?: string;
  onCanvasWorkspaceChange?: (
    canvases: LibTvProjectCanvas[],
    activeCanvasId: string,
  ) => void;
}) {
  const searchParams = useSearchParams();
  const workflowProjectIdForCanvasSession = String(
    searchParams.get("projectId") || "",
  ).trim();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCanvasWorkspaceChangeRef = useRef(onCanvasWorkspaceChange);
  const pendingCanvasWorkspaceChangeRef = useRef<{
    activeId: string;
    canvases: LibTvProjectCanvas[];
    workflow: LibTvWorkflowState;
    viewport: LibTvProjectCanvasViewport;
  } | null>(null);
  const canvasWorkspaceChangeTimerRef = useRef<number | null>(null);
  const flushCanvasWorkspaceChange = useCallback(() => {
    const pending = pendingCanvasWorkspaceChangeRef.current;
    const callback = onCanvasWorkspaceChangeRef.current;
    if (!pending || !callback) return;
    pendingCanvasWorkspaceChangeRef.current = null;
    const snapshot = normalizeLibTvProjectCanvases(
      pending.canvases,
      pending.workflow,
    ).map((canvas) =>
      canvas.id === pending.activeId
        ? {
            ...canvas,
            libtvWorkflow: normalizeLibTvWorkflowState(pending.workflow),
            viewport: pending.viewport,
          }
        : canvas,
    );
    callback(snapshot, pending.activeId);
  }, []);
  const [workflowCanvasSize, setWorkflowCanvasSize] = useState<{
    width: number;
    height: number;
  }>(() =>
    typeof window === "undefined"
      ? { width: 1470, height: 685 }
      : {
          width: Math.max(1, window.innerWidth),
          height: Math.max(1, window.innerHeight),
        },
  );
  const [uploading, setUploading] = useState(false);
  const [playlistIntroOpen, setPlaylistIntroOpen] = useState(false);
  const [playlistIntroDontShowAgain, setPlaylistIntroDontShowAgain] =
    useState(false);
  const [pendingPlaylistCreation, setPendingPlaylistCreation] =
    useState<PendingPlaylistCreation>(null);
  const [threeDIntroOpen, setThreeDIntroOpen] = useState(false);
  const [threeDIntroDontShowAgain, setThreeDIntroDontShowAgain] =
    useState(false);
  const [pendingThreeDCreation, setPendingThreeDCreation] =
    useState<PendingThreeDCreation>(null);
  const [activeThreeDWorldNodeId, setActiveThreeDWorldNodeId] = useState<
    string | null
  >(null);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [workflowViewport, setWorkflowViewport] =
    useState<LibTvProjectCanvasViewport>(() => ({
      ...DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT,
    }));
  const [workflowEdgesVisible, setWorkflowEdgesVisible] = useState(true);
  const [workflowSnapToGrid, setWorkflowSnapToGrid] = useState(false);
  const [workflowCanvasTheme, setWorkflowCanvasTheme] = useState<
    "dark" | "light"
  >("dark");
  const [hydratedWorkflowProjectId, setHydratedWorkflowProjectId] = useState<
    string | null
  >(null);
  const codexCanvasSessionId = useMemo(
    () => getOrCreateCodexCanvasSessionId(workflowProjectIdForCanvasSession),
    [workflowProjectIdForCanvasSession],
  );
  const documentThemeStateRef = useRef<{
    dark: boolean;
    light: boolean;
    canvasLight: boolean;
    colorScheme: string;
    bodyBackground: string;
  } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const updateSize = (width: number, height: number) => {
      const next = {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
      };
      setWorkflowCanvasSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };
    let resizeFrame: number | null = null;
    let pendingSize: { width: number; height: number } | null = null;
    const scheduleSizeUpdate = (width: number, height: number) => {
      pendingSize = { width, height };
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        const next = pendingSize;
        pendingSize = null;
        if (next) updateSize(next.width, next.height);
      });
    };
    const rect = element.getBoundingClientRect();
    updateSize(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.contentRect;
      scheduleSizeUpdate(box.width, box.height);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    };
  }, []);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [codexSkillLibraryOpen, setCodexSkillLibraryOpen] = useState(false);
  const [pendingDeleteNodeIds, setPendingDeleteNodeIds] = useState<string[]>(
    [],
  );
  const [characterLibraryOpen, setCharacterLibraryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workflowAssetDrawerOpen, setWorkflowAssetDrawerOpen] = useState(false);
  const [assetMarketplaceType, setAssetMarketplaceType] =
    useState<WorkflowAssetMarketplaceType | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishingWorkflow, setPublishingWorkflow] = useState(false);
  const [publishedWorkflowUrl, setPublishedWorkflowUrl] = useState("");
  const flowRef = useRef<ReactFlowInstance<
    ReactFlowNode<WorkflowOverlayNodeData>,
    Edge
  > | null>(null);
  const workflowViewportRef =
    useRef<LibTvProjectCanvasViewport>(workflowViewport);
  const pasteWorkflowNodeClipboardPayloadRef = useRef<
    (
      rawPayload: unknown,
      options?: {
        position?: { x: number; y: number };
        offset?: { x: number; y: number };
        titleSuffix?: string;
      },
    ) => string[]
  >(() => []);
  const resumeTaskAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const codexWorkflowGenerationNodesRef = useRef<
    Map<string, CodexWorkflowGenerationNodeRecord>
  >(new Map());
  const codexWorkflowReferenceNodeKeysRef = useRef<Map<string, string>>(
    new Map(),
  );
  const codexWorkflowSettlementSignaturesRef = useRef<Map<string, string>>(
    new Map(),
  );
  const {
    projectId,
    projectName,
    workflow,
    setWorkflow,
    selectedIds,
    addWorkflowNode,
    updateWorkflowNodeInStore,
    moveWorkflowNode,
    moveWorkflowNodes,
    groupWorkflowNodes,
    convertWorkflowGroupToStoryboard,
    ungroupWorkflowNode,
    setWorkflowSelectedIds,
    removeWorkflowNode,
    removeWorkflowNodes,
    removeWorkflowEdge,
    addWorkflowEdge,
    attachWorkflowReferenceImage,
    openMaterialSaveDialog,
    openMaterialManager,
    closeMaterialManager,
    setMaterialManagerCreateOpen,
    materialManagerOpen,
    materialSaveDialogOpen,
    undoHistory,
    redoHistory,
    resetWorkflowHistory,
    setActiveWorkflowNode,
    selectLayer,
    replaceWorkflowNodeWithImageGroup,
    layers,
    projectMaterials,
  } = useCanvasStore(
    useShallow((state) => ({
      projectId: state.projectId,
      projectName: state.projectName,
      workflow: state.libtvWorkflow,
      setWorkflow: state.setLibTvWorkflow,
      selectedIds: state.selectedIds,
      addWorkflowNode: state.addLibTvWorkflowNode,
      updateWorkflowNodeInStore: state.updateLibTvWorkflowNode,
      moveWorkflowNode: state.moveLibTvWorkflowNode,
      moveWorkflowNodes: state.moveLibTvWorkflowNodes,
      groupWorkflowNodes: state.groupLibTvWorkflowNodes,
      convertWorkflowGroupToStoryboard:
        state.convertLibTvWorkflowGroupToStoryboard,
      ungroupWorkflowNode: state.ungroupLibTvWorkflowNode,
      setWorkflowSelectedIds: state.setLibTvWorkflowSelectedIds,
      removeWorkflowNode: state.removeLibTvWorkflowNode,
      removeWorkflowNodes: state.removeLibTvWorkflowNodes,
      removeWorkflowEdge: state.removeLibTvWorkflowEdge,
      addWorkflowEdge: state.addLibTvWorkflowEdge,
      attachWorkflowReferenceImage: state.attachLibTvWorkflowReferenceImage,
      openMaterialSaveDialog: state.openMaterialSaveDialog,
      openMaterialManager: state.openMaterialManager,
      closeMaterialManager: state.closeMaterialManager,
      setMaterialManagerCreateOpen: state.setMaterialManagerCreateOpen,
      materialManagerOpen: state.materialManagerOpen,
      materialSaveDialogOpen: state.materialSaveDialogOpen,
      undoHistory: state.undoHistory,
      redoHistory: state.redoHistory,
      resetWorkflowHistory: state.resetLibTvWorkflowHistory,
      setActiveWorkflowNode: state.setLibTvWorkflowActiveNode,
      selectLayer: state.selectLayer,
      replaceWorkflowNodeWithImageGroup:
        state.replaceLibTvWorkflowNodeWithImageGroup,
      layers: state.layers,
      projectMaterials: state.projectMaterials,
    })),
  );
  const publishCodexNodeSettlement = useCallback(
    (node: LibTvWorkflowNode | undefined) => {
      if (!node) return;
      const detail = workflowCanvasGenerationSettlementFromNode(node);
      if (!detail) return;
      const signature = [
        detail.status,
        detail.generationTaskId || "",
        detail.resultUrls.join("|"),
        detail.error || "",
      ].join("::");
      if (
        codexWorkflowSettlementSignaturesRef.current.get(node.id) === signature
      )
        return;
      codexWorkflowSettlementSignaturesRef.current.set(node.id, signature);
      publishWorkflowCanvasGenerationSettlement(detail);
    },
    [],
  );
  const updateWorkflowNode = useCallback(
    (id: string, patch: Partial<LibTvWorkflowNode["data"]>) => {
      const before = useCanvasStore
        .getState()
        .libtvWorkflow.nodes.find((node) => node.id === id);
      updateWorkflowNodeInStore(id, patch);
      const controlledByCodex =
        String(
          (before?.data as any)?.workflowGenerationController || "",
        ).trim() === "codex" ||
        String((patch as any)?.workflowGenerationController || "").trim() ===
          "codex";
      if (!controlledByCodex) return;
      publishCodexNodeSettlement(
        useCanvasStore
          .getState()
          .libtvWorkflow.nodes.find((node) => node.id === id),
      );
    },
    [publishCodexNodeSettlement, updateWorkflowNodeInStore],
  );
  const initialWorkflowCanvasId = useMemo(() => {
    const fromUrl = String(
      searchParams.get("canvasId") || searchParams.get("boardId") || "",
    ).trim();
    return fromUrl || "default";
  }, [searchParams]);
  const [activeWorkflowCanvasId, setActiveWorkflowCanvasId] = useState(
    initialWorkflowCanvasId,
  );
  const [workflowCanvases, setWorkflowCanvases] = useState<
    LibTvProjectCanvas[]
  >(() => normalizeLibTvProjectCanvases(undefined, workflow));
  const workflowCanvasId = activeWorkflowCanvasId || "default";
  const workflowCanvasName = useMemo(() => {
    const activeCanvas =
      workflowCanvases.find((canvas) => canvas.id === workflowCanvasId) ||
      workflowCanvases[0];
    return String(activeCanvas?.name || "").trim() || "画布 1";
  }, [workflowCanvases, workflowCanvasId]);

  useEffect(() => {
    workflowViewportRef.current = workflowViewport;
  }, [workflowViewport]);

  useLayoutEffect(() => {
    const storedTheme =
      window.localStorage.getItem("zmtv-workflow-canvas-theme") ||
      window.localStorage.getItem("libtv-workflow-canvas-theme");
    if (storedTheme === "light" || storedTheme === "dark")
      setWorkflowCanvasTheme(storedTheme);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!documentThemeStateRef.current) {
      documentThemeStateRef.current = {
        dark: root.classList.contains("dark"),
        light: root.classList.contains("light"),
        canvasLight: root.classList.contains("canvas-light"),
        colorScheme: root.style.colorScheme,
        bodyBackground: document.body.style.backgroundColor,
      };
    }
    return () => {
      const previous = documentThemeStateRef.current;
      if (!previous) return;
      root.classList.toggle("dark", previous.dark);
      root.classList.toggle("light", previous.light);
      root.classList.toggle("canvas-light", previous.canvasLight);
      root.style.colorScheme = previous.colorScheme;
      document.body.style.backgroundColor = previous.bodyBackground;
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const light = workflowCanvasTheme === "light";
    root.classList.toggle("dark", !light);
    root.classList.toggle("light", light);
    root.classList.toggle("canvas-light", light);
    root.style.colorScheme = light ? "light" : "dark";
    document.body.style.backgroundColor = light ? "#F7F7F7" : "#141414";
  }, [workflowCanvasTheme]);

  useEffect(() => {
    if (initialCanvases?.length) {
      const canvases = normalizeLibTvProjectCanvases(initialCanvases, workflow);
      const requestedActiveId = String(initialActiveCanvasId || "").trim();
      const activeId = canvases.some(
        (canvas) => canvas.id === requestedActiveId,
      )
        ? requestedActiveId
        : canvases[0]?.id || "default";
      const activeCanvas =
        canvases.find((canvas) => canvas.id === activeId) || canvases[0];
      const viewport = normalizeLibTvProjectCanvasViewport(
        activeCanvas?.viewport,
      );
      workflowViewportRef.current = viewport;
      setWorkflowCanvases(canvases);
      setActiveWorkflowCanvasId(activeId);
      if (activeCanvas) {
        setWorkflow(activeCanvas.libtvWorkflow);
        resetWorkflowHistory("加载工作流画布");
      }
      setWorkflowSelectedIds([]);
      setWorkflowViewport(viewport);
      setViewportZoom(viewport.zoom);
      window.requestAnimationFrame(() => {
        void flowRef.current?.setViewport(viewport);
      });
      setHydratedWorkflowProjectId(projectId || "__local__");
      return;
    }

    if (!projectId) {
      const fallbackCanvases = normalizeLibTvProjectCanvases(
        undefined,
        workflow,
      );
      const viewport = normalizeLibTvProjectCanvasViewport(
        fallbackCanvases[0]?.viewport,
      );
      workflowViewportRef.current = viewport;
      setWorkflowCanvases(fallbackCanvases);
      setActiveWorkflowCanvasId(fallbackCanvases[0]?.id || "default");
      resetWorkflowHistory("加载工作流画布");
      setWorkflowViewport(viewport);
      setViewportZoom(viewport.zoom);
      setHydratedWorkflowProjectId("__local__");
      return;
    }

    let cancelled = false;
    fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((project) => {
        if (cancelled || !project) return;
        let parsedContent: unknown = project.content;
        if (typeof parsedContent === "string") {
          try {
            parsedContent = JSON.parse(parsedContent);
          } catch {
            parsedContent = null;
          }
        }
        const content = normalizeCanvasProjectContent(parsedContent);
        const canvases = normalizeLibTvProjectCanvases(
          content.libtvCanvases,
          content.libtvWorkflow,
        );
        const activeId = canvases.some(
          (canvas) => canvas.id === content.activeLibTvCanvasId,
        )
          ? String(content.activeLibTvCanvasId)
          : canvases[0]?.id || "default";
        const activeCanvas =
          canvases.find((canvas) => canvas.id === activeId) || canvases[0];
        setWorkflowCanvases(canvases);
        setActiveWorkflowCanvasId(activeId);
        if (activeCanvas) {
          const viewport = normalizeLibTvProjectCanvasViewport(
            activeCanvas.viewport,
          );
          workflowViewportRef.current = viewport;
          setWorkflow(activeCanvas.libtvWorkflow);
          resetWorkflowHistory("加载工作流画布");
          setWorkflowViewport(viewport);
          setViewportZoom(viewport.zoom);
          window.requestAnimationFrame(() => {
            void flowRef.current?.setViewport(viewport);
          });
        }
        setWorkflowSelectedIds([]);
        setHydratedWorkflowProjectId(projectId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    initialActiveCanvasId,
    initialCanvases,
    projectId,
    resetWorkflowHistory,
    setWorkflow,
    setWorkflowSelectedIds,
  ]);

  useEffect(() => {
    if (hydratedWorkflowProjectId !== (projectId || "__local__")) return;
    codexWorkflowSettlementSignaturesRef.current.clear();
    useCanvasStore
      .getState()
      .libtvWorkflow.nodes.forEach((node) => publishCodexNodeSettlement(node));
  }, [hydratedWorkflowProjectId, projectId, publishCodexNodeSettlement]);

  useEffect(() => {
    const activeId =
      String(activeWorkflowCanvasId || "default").trim() || "default";
    setWorkflowCanvases((current) => {
      const now = Date.now();
      const base =
        current.length > 0
          ? current
          : normalizeLibTvProjectCanvases(undefined, workflow);
      let matched = false;
      const next = base.map((canvas, index) => {
        const id =
          String(canvas.id || "").trim() ||
          (index === 0 ? "default" : `canvas-${index + 1}`);
        if (id !== activeId) return { ...canvas, id };
        matched = true;
        return {
          ...canvas,
          id,
          libtvWorkflow: normalizeLibTvWorkflowState(workflow),
          viewport: canvas.viewport || workflowViewportRef.current,
          updatedAt: now,
        };
      });
      if (matched) return next;
      return [
        ...next,
        {
          id: activeId,
          name: `画布 ${next.length + 1}`,
          libtvWorkflow: normalizeLibTvWorkflowState(workflow),
          viewport: workflowViewportRef.current,
          createdAt: now,
          updatedAt: now,
        },
      ];
    });
  }, [activeWorkflowCanvasId, workflow]);

  useEffect(() => {
    onCanvasWorkspaceChangeRef.current = onCanvasWorkspaceChange;
  }, [onCanvasWorkspaceChange]);

  useEffect(() => {
    if (!onCanvasWorkspaceChange) {
      if (canvasWorkspaceChangeTimerRef.current !== null) {
        window.clearTimeout(canvasWorkspaceChangeTimerRef.current);
        canvasWorkspaceChangeTimerRef.current = null;
      }
      pendingCanvasWorkspaceChangeRef.current = null;
      return;
    }
    if (hydratedWorkflowProjectId !== (projectId || "__local__")) return;
    const activeId =
      String(activeWorkflowCanvasId || "default").trim() || "default";
    pendingCanvasWorkspaceChangeRef.current = {
      activeId,
      canvases: workflowCanvases,
      workflow,
      viewport: workflowViewport,
    };
    if (canvasWorkspaceChangeTimerRef.current !== null) {
      window.clearTimeout(canvasWorkspaceChangeTimerRef.current);
    }
    canvasWorkspaceChangeTimerRef.current = window.setTimeout(() => {
      canvasWorkspaceChangeTimerRef.current = null;
      flushCanvasWorkspaceChange();
    }, 240);
  }, [
    activeWorkflowCanvasId,
    flushCanvasWorkspaceChange,
    hydratedWorkflowProjectId,
    onCanvasWorkspaceChange,
    projectId,
    workflow,
    workflowCanvases,
    workflowViewport,
  ]);

  useEffect(
    () => () => {
      if (canvasWorkspaceChangeTimerRef.current !== null) {
        window.clearTimeout(canvasWorkspaceChangeTimerRef.current);
        canvasWorkspaceChangeTimerRef.current = null;
      }
      flushCanvasWorkspaceChange();
    },
    [flushCanvasWorkspaceChange],
  );

  const createResumeTaskAbortController = useCallback(() => {
    const controller = new AbortController();
    resumeTaskAbortControllersRef.current.add(controller);
    return controller;
  }, []);

  const releaseResumeTaskAbortController = useCallback(
    (controller: AbortController) => {
      resumeTaskAbortControllersRef.current.delete(controller);
    },
    [],
  );

  const abortResumeTasks = useCallback(() => {
    resumeTaskAbortControllersRef.current.forEach((controller) =>
      controller.abort(),
    );
    resumeTaskAbortControllersRef.current.clear();
    resumedImageGenerationJobsRef.current.clear();
    settledImageGenerationJobsRef.current.clear();
    resumedVideoGenerationTasksRef.current.clear();
    settledVideoGenerationTasksRef.current.clear();
    activeVideoGenerationTaskIdsRef.current.clear();
    resumedAudioGenerationTasksRef.current.clear();
    settledAudioGenerationTasksRef.current.clear();
    activeAudioGenerationTaskIdsRef.current.clear();
    resumedThreeDPredictionTasksRef.current.clear();
    settledThreeDPredictionTasksRef.current.clear();
    activeThreeDGenerationTaskIdsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => abortResumeTasks();
  }, [abortResumeTasks]);

  useEffect(() => {
    return () => abortResumeTasks();
  }, [abortResumeTasks, projectId]);

  const nodes = workflow.nodes;
  const edges = workflow.edges;
  const workflowNodesRef = useRef(nodes);
  useEffect(() => {
    workflowNodesRef.current = nodes;
  }, [nodes]);

  const focusCodexWorkflowNodes = useCallback(
    (nodeIds: string[], options?: { duration?: number; maxZoom?: number }) => {
      const requestedIds = new Set(
        nodeIds.map((nodeId) => String(nodeId || "").trim()).filter(Boolean),
      );
      if (!requestedIds.size) return;
      const frames = useCanvasStore
        .getState()
        .libtvWorkflow.nodes.filter((node) => requestedIds.has(node.id))
        .map((node) => ({
          id: node.id,
          x: Number(node.x || 0),
          y: Number(node.y || 0),
          width: Number(node.width || workflowNodeFrame(node.kind).width),
          height: Number(node.height || workflowNodeFrame(node.kind).height),
        }));
      focusCodexCanvasFrames({
        flow: flowRef.current,
        container: containerRef.current,
        frames,
        duration: options?.duration,
        maxZoom: options?.maxZoom,
      });
    },
    [],
  );

  const normalizeCodexWorkflowMediaUrl = useCallback(
    (url: string, kind: "image" | "video" | "audio" = "image") => {
      const raw = String(url || "").trim();
      if (!raw) return "";
      if (kind === "image") return normalizeRenderableImageUrl(raw);
      return raw;
    },
    [],
  );

  const ensureCodexWorkflowGenerationNodes = useCallback(
    (detail: CodexWorkflowGenerationDetail) => {
      const key = String(
        detail.providerTaskId || detail.statusUrl || detail.itemId || "",
      ).trim();
      if (!key) return null;
      const providerPrompt = String(detail.prompt || "").trim();
      const detailCodexTaskId = String(detail.codexTaskId || "").trim();
      const references = Array.isArray(detail.references)
        ? detail.references
        : [];
      const currentBeforeReconciliation =
        useCanvasStore.getState().libtvWorkflow;
      const reconciliation = buildCodexReferenceReconciliationPlan({
        nodes: currentBeforeReconciliation.nodes,
        edges: currentBeforeReconciliation.edges,
        references,
      });
      reconciliation.nodePatches.forEach((patch) =>
        updateWorkflowNode(patch.nodeId, patch.data),
      );
      reconciliation.replacementEdges.forEach((edge) => {
        const currentEdges = useCanvasStore.getState().libtvWorkflow.edges;
        if (
          currentEdges.some(
            (currentEdge) =>
              currentEdge.source === edge.source &&
              currentEdge.target === edge.target,
          )
        ) {
          return;
        }
        addWorkflowEdge(edge.source, edge.target);
      });
      if (reconciliation.duplicateNodeIds.length) {
        removeWorkflowNodes(reconciliation.duplicateNodeIds);
        workflowNodesRef.current =
          useCanvasStore.getState().libtvWorkflow.nodes;
      }
      const explicitGeneratorNodeId = String(detail.nodeId || "").trim();
      const explicitGeneratorNode = explicitGeneratorNodeId
        ? workflowNodesRef.current.find(
            (node) => node.id === explicitGeneratorNodeId,
          )
        : null;
      const kind = normalizeWorkflowGenerationKind(
        detail.kind,
        detail.nodeKind || explicitGeneratorNode?.kind,
      );
      const semanticGenerationKey =
        detailCodexTaskId && providerPrompt
          ? `semantic:${detailCodexTaskId}:${kind}:${providerPrompt}`
          : "";
      const reusableCanvasNode = findReusableCodexGenerationNode({
        nodes: workflowNodesRef.current,
        explicitNodeId: explicitGeneratorNodeId,
        kind,
        codexTaskId: detailCodexTaskId,
        resultUrls: detail.resultUrls,
      });
      if (reusableCanvasNode && (kind === "image" || kind === "video")) {
        const data = reusableCanvasNode.data || {};
        const record = {
          generatorNodeId: reusableCanvasNode.id,
          referenceNodeIds: Array.from(
            new Set(
              [
                ...(Array.isArray(data.referenceImageNodeIds)
                  ? data.referenceImageNodeIds
                  : []),
                ...(Array.isArray(data.referenceVideoNodeIds)
                  ? data.referenceVideoNodeIds
                  : []),
              ]
                .map((value) => String(value || "").trim())
                .filter(Boolean),
            ),
          ),
          kind,
          nativeNode: true,
        } satisfies CodexWorkflowGenerationNodeRecord;
        codexWorkflowGenerationNodesRef.current.set(key, record);
        if (semanticGenerationKey)
          codexWorkflowGenerationNodesRef.current.set(
            semanticGenerationKey,
            record,
          );
        return record;
      }
      const nativeNodeKind =
        explicitGeneratorNode?.kind === "audio"
          ? "audio"
          : explicitGeneratorNode?.kind === "playlist"
            ? "playlist"
            : null;
      if (nativeNodeKind) {
        const nativeNode = explicitGeneratorNode as LibTvWorkflowNode;
        const nativePromptKeys = new Set(
          [
            providerPrompt,
            String(nativeNode.data?.workflowInternalPrompt || "").trim(),
            String(nativeNode.data?.prompt || "").trim(),
          ].filter(Boolean),
        );
        const nativeResultKeys = new Set(
          [
            ...(Array.isArray(detail.resultUrls) ? detail.resultUrls : []),
            nativeNode.data?.mediaUrl,
            nativeNode.data?.playlistExportUrl,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean),
        );
        const connectedNodeIds = new Set(
          useCanvasStore
            .getState()
            .libtvWorkflow.edges.flatMap((edge) => [edge.source, edge.target]),
        );
        const wrongMirrorIds = workflowNodesRef.current
          .filter((node) => {
            if (node.id === nativeNode.id) return false;
            const data = node.data || {};
            const wrongComponentType =
              nativeNodeKind === "audio"
                ? "image-generator"
                : "video-generator";
            if (data.componentType !== wrongComponentType) return false;
            const generationKeys = [
              (data as any).workflowCodexGenerationTaskId,
              (data as any).workflowGenerationTaskId,
              (data as any).workflowGenerationStatusUrl,
            ]
              .map((value) => String(value || "").trim())
              .filter(Boolean);
            const controlledByCodex =
              String(
                (data as any).workflowGenerationController || "",
              ).trim() === "codex";
            if (controlledByCodex && generationKeys.includes(key)) return true;

            // Older persisted projects did not retain the Codex controller fields.
            // Exact prompt + exact result matches safely identify those bad mirrors.
            const candidatePrompt = String(
              (data as any).workflowInternalPrompt || data.prompt || "",
            ).trim();
            const candidateResult = String(data.mediaUrl || "").trim();
            const exactPersistedMirror = Boolean(
              candidatePrompt &&
              candidateResult &&
              nativePromptKeys.has(candidatePrompt) &&
              nativeResultKeys.has(candidateResult),
            );
            if (exactPersistedMirror) return true;
            if (
              candidateResult ||
              connectedNodeIds.has(node.id) ||
              data.mediaRole !== "generator"
            )
              return false;
            const promptRelated = Array.from(nativePromptKeys).some(
              (nativePrompt) =>
                nativePrompt === candidatePrompt ||
                nativePrompt.startsWith(`${candidatePrompt}，`) ||
                nativePrompt.startsWith(`${candidatePrompt},`),
            );
            const legacySemanticMatch =
              nativeNodeKind === "playlist"
                ? /合成|成片|剪辑|拼接/.test(candidatePrompt)
                : /音频|音乐|配乐|广告歌|声音|旁白|配音/.test(candidatePrompt);
            return Boolean(
              candidatePrompt && promptRelated && legacySemanticMatch,
            );
          })
          .map((node) => node.id);
        if (wrongMirrorIds.length) removeWorkflowNodes(wrongMirrorIds);
        const record = {
          generatorNodeId: nativeNode.id,
          referenceNodeIds: [],
          kind: nativeNodeKind,
          nativeNode: true,
        } satisfies CodexWorkflowGenerationNodeRecord;
        codexWorkflowGenerationNodesRef.current.set(key, record);
        if (semanticGenerationKey)
          codexWorkflowGenerationNodesRef.current.set(
            semanticGenerationKey,
            record,
          );
        return record;
      }
      if (!workflowGenerationShouldCreateMirror(kind)) return null;
      const existing =
        codexWorkflowGenerationNodesRef.current.get(key) ||
        (semanticGenerationKey
          ? codexWorkflowGenerationNodesRef.current.get(semanticGenerationKey)
          : undefined);
      if (existing) return existing;
      const explicitGeneratorMatchesKind = Boolean(
        explicitGeneratorNode &&
        (kind === "video"
          ? explicitGeneratorNode.kind === "video" &&
            explicitGeneratorNode.data?.componentType === "video-generator"
          : explicitGeneratorNode.kind === "image" &&
            explicitGeneratorNode.data?.componentType === "image-generator"),
      );
      const existingGeneratorNode =
        (explicitGeneratorMatchesKind ? explicitGeneratorNode : null) ||
        workflowNodesRef.current.find((node) => {
          const data = node.data || {};
          const taskId = String(
            (data as any).workflowGenerationTaskId || "",
          ).trim();
          const codexGenerationTaskId = String(
            (data as any).workflowCodexGenerationTaskId || "",
          ).trim();
          const codexTaskId = String(
            (data as any).workflowCodexTaskId || "",
          ).trim();
          const statusUrl = String(
            (data as any).workflowGenerationStatusUrl || "",
          ).trim();
          const componentType = String(
            (data as any).componentType || "",
          ).trim();
          const mediaRole = String((data as any).mediaRole || "").trim();
          const nodePrompt = String(
            (data as any).workflowInternalPrompt || (data as any).prompt || "",
          ).trim();
          const sameGeneration =
            taskId === key ||
            codexGenerationTaskId === key ||
            statusUrl === key;
          const sameKind =
            kind === "video"
              ? componentType === "video-generator"
              : componentType === "image-generator";
          if (!sameKind || mediaRole !== "generator") return false;
          if (sameGeneration) return true;
          const sameCodexTurn = Boolean(
            detailCodexTaskId && codexTaskId === detailCodexTaskId,
          );
          const samePrompt = Boolean(
            providerPrompt && nodePrompt === providerPrompt,
          );
          const nodePending =
            Boolean((data as any).workflowGenerationRunning) ||
            !String((data as any).mediaUrl || "").trim();
          return (
            (sameCodexTurn && (samePrompt || !providerPrompt || !nodePrompt)) ||
            (samePrompt && nodePending)
          );
        });
      if (existingGeneratorNode) {
        const data = existingGeneratorNode.data || {};
        const record = {
          generatorNodeId: existingGeneratorNode.id,
          referenceNodeIds: Array.from(
            new Set(
              [
                ...(Array.isArray(data.referenceImageNodeIds)
                  ? data.referenceImageNodeIds
                  : []),
                ...(Array.isArray(data.referenceVideoNodeIds)
                  ? data.referenceVideoNodeIds
                  : []),
              ]
                .map((value) => String(value || "").trim())
                .filter(Boolean),
            ),
          ),
          kind,
          nativeNode:
            explicitGeneratorMatchesKind &&
            existingGeneratorNode.id === explicitGeneratorNode?.id,
        } satisfies CodexWorkflowGenerationNodeRecord;
        codexWorkflowGenerationNodesRef.current.set(key, record);
        if (semanticGenerationKey)
          codexWorkflowGenerationNodesRef.current.set(
            semanticGenerationKey,
            record,
          );
        return record;
      }

      const usableReferences = references
        .map((reference) => {
          const mediaKind = String(reference.mediaKind || "")
            .trim()
            .toLowerCase();
          const nodeKind: LibTvWorkflowNodeKind =
            mediaKind === "video"
              ? "video"
              : mediaKind === "audio"
                ? "audio"
                : "image";
          const rawUrl = String(
            reference.sourceUrl || reference.url || reference.path || "",
          ).trim();
          const mediaUrl = normalizeCodexWorkflowMediaUrl(
            rawUrl,
            nodeKind === "video"
              ? "video"
              : nodeKind === "audio"
                ? "audio"
                : "image",
          );
          const identityKeys = codexWorkflowMediaIdentityKeys(rawUrl);
          const explicitNodeId = String(reference.nodeId || "").trim();
          const existingReferenceNode =
            (explicitNodeId
              ? workflowNodesRef.current.find(
                  (node) =>
                    node.id === explicitNodeId &&
                    codexWorkflowNodeMatchesMediaKind(node, nodeKind),
                )
              : null) ||
            workflowNodesRef.current.find((node) => {
              if (!codexWorkflowNodeMatchesMediaKind(node, nodeKind))
                return false;
              const nodeKeys = codexWorkflowNodeMediaIdentityKeys(node);
              return Array.from(identityKeys).some((identity) =>
                nodeKeys.has(identity),
              );
            }) ||
            null;
          const identity =
            existingReferenceNode?.id ||
            Array.from(identityKeys).sort()[0] ||
            rawUrl.toLowerCase();
          return {
            ...reference,
            nodeKind,
            mediaUrl,
            existingReferenceNode,
            dedupeKey: `reference:${nodeKind}:${identity}`,
          };
        })
        .filter((reference) => reference.mediaUrl)
        .filter(
          (reference, index, list) =>
            list.findIndex((item) => item.dedupeKey === reference.dedupeKey) ===
            index,
        )
        .slice(0, 8);
      const detailWidth = Number(detail.width || 0);
      const detailHeight = Number(detail.height || 0);
      const generatorFrame =
        detailWidth > 0 && detailHeight > 0
          ? workflowMediaDisplayFrame(detailWidth, detailHeight)
          : kind === "video"
            ? workflowVideoGeneratorFrame(detail.aspectRatio || "16:9")
            : workflowImageGeneratorFrame(detail.aspectRatio || "1:1");
      const newReferences = usableReferences.filter(
        (reference) => !reference.existingReferenceNode,
      );
      const referenceFrames = newReferences.map((reference) => {
        const naturalWidth = Number(reference.naturalWidth || 0);
        const naturalHeight = Number(reference.naturalHeight || 0);
        return (reference.nodeKind === "image" ||
          reference.nodeKind === "video") &&
          naturalWidth > 0 &&
          naturalHeight > 0
          ? workflowMediaDisplayFrame(naturalWidth, naturalHeight)
          : workflowNodeFrame(reference.nodeKind);
      });
      const referenceGapY = 28;
      const referenceColumnHeight = referenceFrames.length
        ? referenceFrames.reduce((sum, frame) => sum + frame.height, 0) +
          Math.max(0, referenceFrames.length - 1) * referenceGapY
        : 0;
      const gapX = usableReferences.length ? 140 : 0;
      const referenceColumnWidth = referenceFrames.length
        ? Math.max(...referenceFrames.map((frame) => frame.width))
        : 0;
      const existingReferenceNodes = usableReferences
        .map((reference) => reference.existingReferenceNode)
        .filter((node): node is LibTvWorkflowNode => Boolean(node));
      const existingReferenceRight = existingReferenceNodes.length
        ? Math.max(
            ...existingReferenceNodes.map(
              (node) =>
                Number(node.x || 0) +
                Number(node.width || workflowNodeFrame(node.kind).width),
            ),
          )
        : null;
      const existingReferenceCenterY = existingReferenceNodes.length
        ? existingReferenceNodes.reduce(
            (sum, node) =>
              sum +
              Number(node.y || 0) +
              Number(node.height || workflowNodeFrame(node.kind).height) / 2,
            0,
          ) / existingReferenceNodes.length
        : null;
      const totalWidth =
        (newReferences.length ? referenceColumnWidth + gapX : 0) +
        generatorFrame.width;
      const totalHeight = Math.max(
        generatorFrame.height,
        referenceColumnHeight,
      );
      const visibleBounds = getWorkflowVisibleBounds({
        flow: flowRef.current,
        container: containerRef.current,
        reserveRight: getCodexCanvasReservedRight(containerRef.current),
      });
      const obstacles = useCanvasStore
        .getState()
        .libtvWorkflow.nodes.map(getWorkflowNodeObstacleRect);
      const groupPosition = findCodexWorkflowNodePlacement({
        bounds: visibleBounds,
        stage: kind === "video" ? "video" : "storyboard",
        width: totalWidth,
        height: totalHeight,
        obstacles,
        preferredPosition:
          existingReferenceRight !== null &&
          existingReferenceCenterY !== null &&
          !newReferences.length
            ? {
                x: existingReferenceRight + gapX,
                y: existingReferenceCenterY - generatorFrame.height / 2,
              }
            : null,
      });
      const referenceX = groupPosition.x;
      let referenceY =
        groupPosition.y +
        Math.max(0, (totalHeight - referenceColumnHeight) / 2);
      const generatorX =
        groupPosition.x +
        (newReferences.length ? referenceColumnWidth + gapX : 0);
      const generatorY =
        groupPosition.y +
        Math.max(0, (totalHeight - generatorFrame.height) / 2);
      const newReferencePositions = new Map<string, { x: number; y: number }>();
      newReferences.forEach((reference, index) => {
        const frame = referenceFrames[index];
        newReferencePositions.set(reference.dedupeKey, {
          x: Math.round(referenceX),
          y: Math.round(referenceY),
        });
        referenceY += frame.height + referenceGapY;
      });
      const referenceNodeIds: string[] = [];
      const referenceImageUrls: string[] = [];
      const referenceImageNodeIds: string[] = [];
      const referenceVideoUrls: string[] = [];
      const referenceVideoNodeIds: string[] = [];
      const referenceMentionNames: string[] = [];

      usableReferences.forEach((reference, index) => {
        const frame = workflowNodeFrame(reference.nodeKind);
        const existingReferenceNodeId =
          codexWorkflowReferenceNodeKeysRef.current.get(reference.dedupeKey);
        const existingNode =
          (existingReferenceNodeId
            ? workflowNodesRef.current.find(
                (node) => node.id === existingReferenceNodeId,
              )
            : null) || reference.existingReferenceNode;
        const referencePosition = newReferencePositions.get(
          reference.dedupeKey,
        ) || {
          x: Number(existingNode?.x || referenceX),
          y: Number(existingNode?.y || groupPosition.y),
        };
        const node =
          existingNode ||
          addWorkflowNode(reference.nodeKind, referencePosition);
        codexWorkflowReferenceNodeKeysRef.current.set(
          reference.dedupeKey,
          node.id,
        );
        referenceNodeIds.push(node.id);
        const title =
          String(node.data?.title || reference.name || "").trim() ||
          (reference.nodeKind === "video"
            ? "参考视频"
            : reference.nodeKind === "audio"
              ? "参考音频"
              : "参考图片");
        const mentionName =
          title.replace(/\s+/g, "_").replace(/^@+/, "").trim() ||
          `${reference.nodeKind === "video" ? "参考视频" : reference.nodeKind === "audio" ? "参考音频" : "参考图片"}${index + 1}`;
        referenceMentionNames.push(mentionName);
        const resolvedMediaUrl = normalizeCodexWorkflowMediaUrl(
          String(node.data?.mediaUrl || reference.mediaUrl || ""),
          reference.nodeKind === "video"
            ? "video"
            : reference.nodeKind === "audio"
              ? "audio"
              : "image",
        );
        if (!existingNode) {
          updateWorkflowNode(node.id, {
            title,
            content: "",
            prompt: "",
            mediaUrl: resolvedMediaUrl,
            mediaRole: "ordinary",
            selectedOptionId: "custom",
            options: [],
            workflowGenerationRunning: false,
            workflowMediaNaturalWidth:
              Number(reference.naturalWidth || 0) || undefined,
            workflowMediaNaturalHeight:
              Number(reference.naturalHeight || 0) || undefined,
            workflowMediaUserResized: false,
          });
          moveWorkflowNode(node.id, {
            x: referencePosition.x,
            y: referencePosition.y,
            width: frame.width,
            height: frame.height,
          });
        }
        if (reference.nodeKind === "image") {
          referenceImageUrls.push(resolvedMediaUrl);
          referenceImageNodeIds.push(node.id);
        } else if (reference.nodeKind === "video") {
          referenceVideoUrls.push(resolvedMediaUrl);
          referenceVideoNodeIds.push(node.id);
          if (!existingNode) {
            // Keep the allocated card frame stable so asynchronous media metadata
            // cannot grow a reference node back over its connected generator.
            void readWorkflowVideoUrlSize(resolvedMediaUrl)
              .then((metadata) => {
                updateWorkflowNode(
                  node.id,
                  getWorkflowMediaNaturalSizePatch(metadata),
                );
              })
              .catch(() => undefined);
          }
        }
      });

      const generatorNode = addWorkflowNode(kind, {
        x: generatorX,
        y: generatorY,
        linkFromNodeId: referenceImageNodeIds[0],
      });
      const referenceMentionPrefix =
        usableReferences.length > 1
          ? referenceMentionNames.map((name) => `@${name}`).join(" ")
          : "";
      const prompt = [referenceMentionPrefix, providerPrompt]
        .filter(Boolean)
        .join("\n");
      const detailProviderTaskId = String(detail.providerTaskId || "").trim();
      const detailTaskType = String(detail.taskType || "").trim();
      const detailStatusUrl = String(detail.statusUrl || "").trim();
      const pollableProviderTaskId =
        detailProviderTaskId && (detailTaskType || detailStatusUrl)
          ? detailProviderTaskId
          : "";
      updateWorkflowNode(generatorNode.id, {
        title: kind === "video" ? "视频生成器" : "图片生成器",
        content: "",
        prompt,
        workflowInternalPrompt: providerPrompt || prompt,
        mediaUrl: "",
        mediaRole: "generator",
        componentType: kind === "video" ? "video-generator" : "image-generator",
        selectedOptionId:
          kind === "video"
            ? referenceImageUrls.length || referenceVideoUrls.length
              ? "first-frame-to-video"
              : "text-to-video"
            : referenceImageUrls.length
              ? "reference-image"
              : "text-to-image",
        modelId: String(detail.modelId || "").trim() || undefined,
        aspectRatio: String(detail.aspectRatio || "").trim() || undefined,
        referenceImages: referenceImageUrls,
        referenceImageNodeIds,
        referenceVideos: referenceVideoUrls,
        referenceVideoNodeIds,
        workflowGenerationTaskId: pollableProviderTaskId || undefined,
        workflowGenerationTaskType: detailTaskType || undefined,
        workflowGenerationStatusUrl: detailStatusUrl || undefined,
        workflowGenerationController: "codex",
        workflowCodexGenerationTaskId: key,
        workflowCodexTaskId: detailCodexTaskId || undefined,
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0.03,
        workflowGenerationStartedAt: Date.now(),
        workflowGenerationError: "",
        note: kind === "video" ? "视频生成中" : "图片生成中",
        suppressGenerationBar: false,
      });
      moveWorkflowNode(generatorNode.id, {
        x: generatorX,
        y: generatorY,
        width: generatorFrame.width,
        height: generatorFrame.height,
      });
      referenceNodeIds.forEach((referenceNodeId) =>
        addWorkflowEdge(referenceNodeId, generatorNode.id),
      );
      selectLayer(generatorNode.id);
      setActiveWorkflowNode(generatorNode.id);
      setWorkflowSelectedIds([generatorNode.id]);
      const fitNodes = [...referenceNodeIds, generatorNode.id].map((id) => ({
        id,
      }));
      window.setTimeout(() => {
        focusCodexWorkflowNodes(
          fitNodes.map((node) => node.id),
          { maxZoom: 1 },
        );
      }, 0);

      const record = {
        generatorNodeId: generatorNode.id,
        referenceNodeIds,
        kind,
        nativeNode: false,
      } satisfies CodexWorkflowGenerationNodeRecord;
      codexWorkflowGenerationNodesRef.current.set(key, record);
      if (semanticGenerationKey)
        codexWorkflowGenerationNodesRef.current.set(
          semanticGenerationKey,
          record,
        );
      return record;
    },
    [
      addWorkflowEdge,
      addWorkflowNode,
      focusCodexWorkflowNodes,
      moveWorkflowNode,
      normalizeCodexWorkflowMediaUrl,
      removeWorkflowNodes,
      selectLayer,
      setActiveWorkflowNode,
      setWorkflowSelectedIds,
      updateWorkflowNode,
    ],
  );

  useEffect(() => {
    const handleCodexWorkflowGeneration = (event: Event) => {
      const detail = (event as CustomEvent<CodexWorkflowGenerationDetail>)
        .detail;
      if (!detail || detail.source !== "codex") return;
      const key = String(
        detail.providerTaskId || detail.statusUrl || detail.itemId || "",
      ).trim();
      if (!key) return;
      const status = detail.status || "generating";
      const record = ensureCodexWorkflowGenerationNodes(detail);
      if (!record) return;
      const resultUrl = String(detail.resultUrls?.[0] || "").trim();
      const mediaKind = workflowGenerationMediaKind(record.kind);
      const normalizedResultUrl = resultUrl
        ? normalizeCodexWorkflowMediaUrl(resultUrl, mediaKind)
        : "";
      if (status === "complete" && normalizedResultUrl) {
        const detailProviderTaskId = String(detail.providerTaskId || "").trim();
        const detailTaskType = String(detail.taskType || "").trim();
        const detailStatusUrl = String(detail.statusUrl || "").trim();
        const pollableProviderTaskId =
          detailProviderTaskId && (detailTaskType || detailStatusUrl)
            ? detailProviderTaskId
            : "";
        const currentGeneratorNode = workflowNodesRef.current.find(
          (node) => node.id === record.generatorNodeId,
        );
        const currentPrompt = String(
          currentGeneratorNode?.data?.prompt || "",
        ).trim();
        const nextPrompt = currentPrompt || String(detail.prompt || "").trim();
        updateWorkflowNode(record.generatorNodeId, {
          ...(record.kind === "playlist"
            ? {
                playlistExportUrl: normalizedResultUrl,
                mediaUrl: "",
                playlistExportRunning: false,
              }
            : { mediaUrl: normalizedResultUrl }),
          ...(record.kind === "audio"
            ? { mediaRole: "ordinary" as const }
            : {}),
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          note: "",
          workflowGenerationTaskId: pollableProviderTaskId || undefined,
          workflowGenerationTaskType: detailTaskType || undefined,
          workflowGenerationStatusUrl: detailStatusUrl || undefined,
          workflowGenerationController: "codex",
          workflowCodexGenerationTaskId: key,
          workflowCodexTaskId:
            String(detail.codexTaskId || "").trim() || undefined,
          ...(Number(detail.width || 0) > 0 && Number(detail.height || 0) > 0
            ? {
                workflowMediaNaturalWidth: Number(detail.width),
                workflowMediaNaturalHeight: Number(detail.height),
                workflowMediaUserResized: false,
              }
            : {}),
          ...(nextPrompt
            ? {
                prompt: nextPrompt,
                workflowInternalPrompt:
                  String(detail.prompt || "").trim() || nextPrompt,
              }
            : {}),
          workflowImageResults:
            record.kind === "image"
              ? (detail.resultUrls || []).map((url, index) => ({
                  id: `${key}-image-${index}`,
                  url: normalizeCodexWorkflowMediaUrl(url, "image"),
                  prompt: String(detail.prompt || "").trim(),
                  modelId: String(detail.modelId || "").trim() || undefined,
                }))
              : undefined,
          workflowImageResultsCollapsed:
            record.kind === "image" && (detail.resultUrls?.length || 0) > 1
              ? false
              : undefined,
          workflowVideoResults:
            record.kind === "video"
              ? [
                  {
                    id: `${key}-video-0`,
                    url: normalizedResultUrl,
                    prompt: String(detail.prompt || "").trim(),
                    modelId: String(detail.modelId || "").trim() || undefined,
                  },
                ]
              : undefined,
          workflowVideoResultsCollapsed:
            record.kind === "video" ? false : undefined,
        } as any);
        if (record.kind === "image") {
          applyWorkflowImageUrlNodeFrame(
            moveWorkflowNode,
            record.generatorNodeId,
            normalizedResultUrl,
            undefined,
            (metadata) => {
              updateWorkflowNode(
                record.generatorNodeId,
                getWorkflowMediaNaturalSizePatch(metadata),
              );
              focusCodexWorkflowNodes(
                [...record.referenceNodeIds, record.generatorNodeId],
                { maxZoom: 1 },
              );
            },
          );
        } else if (record.kind === "video") {
          applyWorkflowVideoUrlNodeFrame(
            moveWorkflowNode,
            record.generatorNodeId,
            normalizedResultUrl,
            undefined,
            (metadata) => {
              updateWorkflowNode(
                record.generatorNodeId,
                getWorkflowMediaNaturalSizePatch(metadata),
              );
              focusCodexWorkflowNodes(
                [...record.referenceNodeIds, record.generatorNodeId],
                { maxZoom: 1 },
              );
            },
          );
        }
        return;
      }
      if (status === "failed") {
        updateWorkflowNode(record.generatorNodeId, {
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: String(detail.error || "生成失败").trim(),
          note: String(detail.error || "生成失败").trim(),
        });
        return;
      }
      const currentGeneratorNode = workflowNodesRef.current.find(
        (node) => node.id === record.generatorNodeId,
      );
      const currentGeneratorData = (currentGeneratorNode?.data || {}) as Record<
        string,
        any
      >;
      const currentMediaUrl = String(
        record.kind === "playlist"
          ? currentGeneratorData.playlistExportUrl
          : currentGeneratorData.mediaUrl,
      ).trim();
      const codexTaskStatus = String(detail.codexTaskStatus || "")
        .trim()
        .toLowerCase();
      const codexTaskTerminal =
        Boolean(codexTaskStatus) &&
        !["queued", "running"].includes(codexTaskStatus);
      if (
        currentGeneratorNode &&
        currentMediaUrl &&
        (!currentGeneratorData.workflowGenerationRunning || codexTaskTerminal)
      ) {
        const resultCandidates = [
          currentGeneratorData.playlistExportUrl,
          currentMediaUrl,
          ...(Array.isArray(currentGeneratorData.workflowImageResults)
            ? currentGeneratorData.workflowImageResults
            : []),
          ...(Array.isArray(currentGeneratorData.workflowVideoResults)
            ? currentGeneratorData.workflowVideoResults
            : []),
        ];
        const resultUrls = Array.from(
          new Set(
            resultCandidates
              .map((item) =>
                String(
                  typeof item === "string"
                    ? item
                    : item?.url || item?.mediaUrl || "",
                ).trim(),
              )
              .filter(Boolean),
          ),
        );
        updateWorkflowNode(record.generatorNodeId, {
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          note: "",
        });
        publishWorkflowCanvasGenerationSettlement({
          source: "workflow-canvas",
          codexTaskId: String(detail.codexTaskId || "").trim(),
          generationTaskId: String(
            currentGeneratorData.workflowCodexGenerationTaskId ||
              detail.providerTaskId ||
              currentGeneratorNode.id,
          ).trim(),
          nodeId: currentGeneratorNode.id,
          status: "complete",
          kind: record.kind,
          nodeKind: currentGeneratorNode.kind,
          prompt: String(
            currentGeneratorData.workflowInternalPrompt ||
              currentGeneratorData.prompt ||
              detail.prompt ||
              "",
          ).trim(),
          resultUrls,
          error: "",
          aspectRatio: String(currentGeneratorData.aspectRatio || "").trim(),
          width:
            Number(
              currentGeneratorData.workflowMediaNaturalWidth ||
                currentGeneratorNode.width,
            ) || undefined,
          height:
            Number(
              currentGeneratorData.workflowMediaNaturalHeight ||
                currentGeneratorNode.height,
            ) || undefined,
          modelId: String(
            currentGeneratorData.modelId || detail.modelId || "",
          ).trim(),
        });
        return;
      }
      updateWorkflowNode(record.generatorNodeId, {
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0.08,
        workflowGenerationError: "",
        note:
          record.kind === "playlist"
            ? "视频合成中"
            : record.kind === "audio"
              ? "音频生成中"
              : record.kind === "video"
                ? "视频生成中"
                : "图片生成中",
        workflowGenerationController: "codex",
        workflowCodexGenerationTaskId: key,
        workflowCodexTaskId:
          String(detail.codexTaskId || "").trim() || undefined,
        ...(String(detail.prompt || "").trim()
          ? (() => {
              const currentGeneratorNode = workflowNodesRef.current.find(
                (node) => node.id === record.generatorNodeId,
              );
              const currentPrompt = String(
                currentGeneratorNode?.data?.prompt || "",
              ).trim();
              if (currentPrompt)
                return {
                  workflowInternalPrompt: String(detail.prompt || "").trim(),
                };
              return {
                prompt: String(detail.prompt || "").trim(),
                workflowInternalPrompt: String(detail.prompt || "").trim(),
              };
            })()
          : {}),
      });
    };
    window.addEventListener(
      "ideart.codex-workflow-generation",
      handleCodexWorkflowGeneration as EventListener,
    );
    return () =>
      window.removeEventListener(
        "ideart.codex-workflow-generation",
        handleCodexWorkflowGeneration as EventListener,
      );
  }, [
    ensureCodexWorkflowGenerationNodes,
    focusCodexWorkflowNodes,
    moveWorkflowNode,
    normalizeCodexWorkflowMediaUrl,
    updateWorkflowNode,
  ]);

  useEffect(() => {
    if (hydratedWorkflowProjectId !== (projectId || "__local__")) return;
    const duplicateMirrorIds = findDuplicateCodexGenerationMirrorNodeIds(nodes);
    if (duplicateMirrorIds.length) removeWorkflowNodes(duplicateMirrorIds);
  }, [hydratedWorkflowProjectId, nodes, projectId, removeWorkflowNodes]);

  useEffect(() => {
    const codexGenerators = nodes.filter((node) => {
      const data = node.data || {};
      if (
        String((data as any).workflowGenerationController || "").trim() !==
        "codex"
      )
        return false;
      if (data.mediaRole !== "generator") return false;
      return (
        data.componentType === "image-generator" ||
        data.componentType === "video-generator"
      );
    });
    if (codexGenerators.length < 2) return;
    const staleIds = codexGenerators
      .filter((node) => {
        const data = node.data || {};
        const hasPrompt = Boolean(
          String(data.prompt || data.workflowInternalPrompt || "").trim(),
        );
        const hasMedia = Boolean(String(data.mediaUrl || "").trim());
        if (hasPrompt || hasMedia) return false;
        return codexGenerators.some((other) => {
          if (other.id === node.id) return false;
          if (other.data?.componentType !== data.componentType) return false;
          return Boolean(
            String(
              other.data?.prompt ||
                other.data?.workflowInternalPrompt ||
                other.data?.mediaUrl ||
                "",
            ).trim(),
          );
        });
      })
      .map((node) => node.id);
    if (staleIds.length) removeWorkflowNodes(staleIds);
  }, [nodes, removeWorkflowNodes]);

  useEffect(() => {
    const groupEntries = new Map<
      string,
      {
        group: LibTvWorkflowNode;
        members: LibTvWorkflowNode[];
        parentedMembers: LibTvWorkflowNode[];
        memberIds: Set<string>;
      }
    >();
    const explicitGroupIdsByMemberId = new Map<string, string[]>();
    nodes.forEach((node) => {
      if (node.kind !== "group") return;
      groupEntries.set(node.id, {
        group: node,
        members: [],
        parentedMembers: [],
        memberIds: new Set(),
      });
      const memberIds = Array.isArray(node.data?.groupNodeIds)
        ? node.data.groupNodeIds
        : [];
      memberIds.forEach((memberId) => {
        const normalizedId = String(memberId || "").trim();
        if (!normalizedId) return;
        const groupIds = explicitGroupIdsByMemberId.get(normalizedId) || [];
        groupIds.push(node.id);
        explicitGroupIdsByMemberId.set(normalizedId, groupIds);
      });
    });
    nodes.forEach((node) => {
      const parentEntry = node.parentId
        ? groupEntries.get(node.parentId)
        : undefined;
      if (parentEntry) {
        parentEntry.parentedMembers.push(node);
        parentEntry.members.push(node);
        parentEntry.memberIds.add(node.id);
      }
      (explicitGroupIdsByMemberId.get(node.id) || []).forEach((groupId) => {
        const entry = groupEntries.get(groupId);
        if (!entry || entry.memberIds.has(node.id)) return;
        entry.members.push(node);
        entry.memberIds.add(node.id);
      });
    });
    const groupsToDetach = Array.from(groupEntries.values()).filter(
      ({ group, members, parentedMembers }) =>
        parentedMembers.length > 0 &&
        isDetachedWorkflowVisualGroupCandidate(group, members),
    );
    if (groupsToDetach.length === 0) return;

    const groupById = new Map(
      groupsToDetach.map((item) => [item.group.id, item]),
    );
    useCanvasStore.setState(
      (state: ReturnType<typeof useCanvasStore.getState>) => {
        let changed = false;
        const nextNodes = state.libtvWorkflow.nodes.map(
          (node: LibTvWorkflowNode) => {
            const detachingGroup = groupById.get(node.id);
            if (detachingGroup) {
              const memberIds = Array.from(
                new Set([
                  ...(Array.isArray(node.data?.groupNodeIds)
                    ? node.data.groupNodeIds
                    : []),
                  ...detachingGroup.members.map((member) => member.id),
                ]),
              );
              changed = true;
              return {
                ...node,
                data: {
                  ...node.data,
                  groupNodeIds: memberIds,
                },
              };
            }
            if (!node.parentId || !groupById.has(node.parentId)) return node;
            const parentGroup = groupById.get(node.parentId)!.group;
            changed = true;
            return {
              ...node,
              parentId: undefined,
              x: Math.round(Number(parentGroup.x || 0) + Number(node.x || 0)),
              y: Math.round(Number(parentGroup.y || 0) + Number(node.y || 0)),
            };
          },
        );
        if (!changed) return state;
        return {
          libtvWorkflow: {
            ...state.libtvWorkflow,
            nodes: nextNodes,
          },
        };
      },
    );
  }, [nodes]);
  const shouldApplyAutoMediaFrame = useCallback(
    (nodeId: string, mediaUrl?: string) => {
      const node = workflowNodesRef.current.find((item) => item.id === nodeId);
      if (!node) return true;
      const currentMediaUrl = String(node.data?.mediaUrl || "").trim();
      const expectedMediaUrl = String(mediaUrl || "").trim();
      if (
        expectedMediaUrl &&
        currentMediaUrl &&
        currentMediaUrl !== expectedMediaUrl
      )
        return true;
      return (
        node.data?.workflowMediaUserResized !== true &&
        (node.data as any)?.workflowMediaUserMoved !== true
      );
    },
    [],
  );
  const getDefaultNodeTitle = useCallback(
    (kind: LibTvWorkflowNodeKind, offset = 0) => {
      return getNumberedWorkflowNodeTitle(kind, nodes, offset);
    },
    [nodes],
  );
  const activeThreeDWorldNode = useMemo(
    () =>
      nodes.find(
        (node) => node.id === activeThreeDWorldNodeId && node.kind === "threed",
      ) || null,
    [activeThreeDWorldNodeId, nodes],
  );
  const resumedThreeDGenerationJobsRef = useRef<Set<string>>(new Set());
  const resumedThreeDPredictionTasksRef = useRef<Set<string>>(new Set());
  const settledThreeDPredictionTasksRef = useRef<Set<string>>(new Set());
  const activeThreeDGenerationTaskIdsRef = useRef<Set<string>>(new Set());
  const resumeThreeDGenerationJob = useCallback(
    (nodeId: string, jobId: string) => {
      const normalizedJobId = String(jobId || "").trim();
      if (!normalizedJobId) return;
      const resumeKey = `${nodeId}:${normalizedJobId}`;
      if (resumedThreeDGenerationJobsRef.current.has(resumeKey)) return;
      resumedThreeDGenerationJobsRef.current.add(resumeKey);
      const abortController = createResumeTaskAbortController();
      void (async () => {
        try {
          const completedJob = await waitWorkflowCanvasBackendJob({
            jobId: normalizedJobId,
            maxAttempts: 220,
            signal: abortController.signal,
            onProgress: (job) => {
              if (abortController.signal.aborted) return;
              updateWorkflowNode(nodeId, {
                workflowGenerationJobId: job.id,
                workflowGenerationTaskId:
                  String(job.resultData?.externalTask?.taskId || "").trim() ||
                  undefined,
                workflowGenerationTaskType:
                  String(
                    job.resultData?.externalTask?.taskType ||
                      job.kind ||
                      "world_generate",
                  ).trim() || undefined,
                workflowGenerationProviderKey:
                  String(
                    job.resultData?.externalTask?.providerKey ||
                      job.payload?.request?.providerKey ||
                      "worldlabs",
                  )
                    .trim()
                    .toLowerCase() || undefined,
                workflowGenerationRunning: true,
                workflowGenerationProgress: Number.isFinite(
                  Number(job.resultData?.progress),
                )
                  ? Math.max(
                      0,
                      Math.min(0.99, Number(job.resultData?.progress)),
                    )
                  : undefined,
                note: String(job.resultData?.message || "3D 世界生成中...")
                  .trim()
                  .slice(0, 80),
              });
            },
          });
          if (abortController.signal.aborted) return;
          const patch = buildThreeDNodePatchFromCanvasJob(completedJob);
          if (!patch) throw new Error("3D 世界任务未返回结果");
          updateWorkflowNode(nodeId, patch);
        } catch (error) {
          if (isWorkflowTaskAbortError(error) || abortController.signal.aborted)
            return;
          const messageText =
            error instanceof Error ? error.message : "3D 世界生成失败";
          updateWorkflowNode(nodeId, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: false,
          });
        } finally {
          resumedThreeDGenerationJobsRef.current.delete(resumeKey);
          releaseResumeTaskAbortController(abortController);
        }
      })();
    },
    [
      createResumeTaskAbortController,
      releaseResumeTaskAbortController,
      updateWorkflowNode,
    ],
  );

  useEffect(() => {
    nodes.forEach((node) => {
      if (node.kind !== "threed") return;
      const jobId = String(node.data?.workflowGenerationJobId || "").trim();
      if (!jobId) return;
      const hasDetailedWorldData = Boolean(
        node.data?.thumbnailUrl ||
        node.data?.panoUrl ||
        node.data?.colliderMeshUrl ||
        node.data?.splatUrl ||
        node.data?.worldUrl ||
        node.data?.worldMarbleUrl,
      );
      if (hasDetailedWorldData && !node.data?.workflowGenerationRunning) return;
      resumeThreeDGenerationJob(node.id, jobId);
    });
  }, [nodes, resumeThreeDGenerationJob]);

  const resumeThreeDPredictionTasks = useCallback(
    (nodeId: string, rawTaskIds: string[], baseUrl?: string) => {
      const taskIds = resolveWorkflowPredictionTaskIds({ taskIds: rawTaskIds });
      if (taskIds.length === 0) return;
      if (
        taskIds.some((id) => activeThreeDGenerationTaskIdsRef.current.has(id))
      ) {
        return;
      }
      const resumeKey = `${nodeId}:${taskIds.join(",")}`;
      if (
        resumedThreeDPredictionTasksRef.current.has(resumeKey) ||
        settledThreeDPredictionTasksRef.current.has(resumeKey)
      ) {
        return;
      }
      resumedThreeDPredictionTasksRef.current.add(resumeKey);
      const abortController = createResumeTaskAbortController();
      void (async () => {
        try {
          const recovered = await resumeWorkflowPredictionTasks(taskIds, {
            baseUrl,
            signal: abortController.signal,
            onCompleted: (event) => {
              updateWorkflowNode(nodeId, {
                note: "3D 世界生成中...",
                workflowGenerationRunning: true,
                workflowGenerationProgress: Math.min(
                  0.98,
                  Math.max(0.08, (event.index + 1) / event.total),
                ),
              });
            },
          });
          if (abortController.signal.aborted) return;
          const resolvedAssets = resolveWorkflowThreeDAssets(recovered.urls);
          const assetUrl = resolvedAssets.primaryUrl;
          if (!assetUrl) throw new Error("3D 世界生成未返回结果");
          updateWorkflowNode(nodeId, {
            mediaUrl: assetUrl,
            mediaRole: "ordinary",
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            workflowGenerationJobId: undefined,
            workflowGenerationTaskId: recovered.ids[recovered.ids.length - 1],
            workflowGenerationTaskIds: recovered.ids,
            workflowGenerationTaskType: workflowPredictionTaskType("3d"),
            workflowGenerationBaseUrl: recovered.baseUrl,
            colliderMeshUrl: resolvedAssets.modelUrl,
            splatUrl: resolvedAssets.splatUrl,
            worldUrl: resolvedAssets.worldUrl,
            worldMarbleUrl: resolvedAssets.worldUrl,
            thumbnailUrl: resolvedAssets.thumbnailUrl,
            suppressGenerationBar: false,
          });
          settledThreeDPredictionTasksRef.current.add(resumeKey);
        } catch (error) {
          if (isWorkflowTaskAbortError(error) || abortController.signal.aborted)
            return;
          const messageText =
            error instanceof Error ? error.message : "3D 世界生成失败";
          updateWorkflowNode(nodeId, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: false,
          });
          settledThreeDPredictionTasksRef.current.add(resumeKey);
        } finally {
          resumedThreeDPredictionTasksRef.current.delete(resumeKey);
          releaseResumeTaskAbortController(abortController);
        }
      })();
    },
    [
      createResumeTaskAbortController,
      releaseResumeTaskAbortController,
      updateWorkflowNode,
    ],
  );

  useEffect(() => {
    nodes.forEach((node) => {
      if (node.kind !== "threed") return;
      if (
        !isWorkflowPredictionTaskType(
          node.data?.workflowGenerationTaskType,
          "3d",
        )
      ) {
        return;
      }
      if (!node.data?.workflowGenerationRunning) return;
      if (String(node.data?.mediaUrl || "").trim()) return;
      const taskIds = resolveWorkflowPredictionTaskIds({
        taskIds: node.data?.workflowGenerationTaskIds,
        taskId: node.data?.workflowGenerationTaskId,
      });
      if (taskIds.length === 0) return;
      resumeThreeDPredictionTasks(
        node.id,
        taskIds,
        String(node.data?.workflowGenerationBaseUrl || "").trim() || undefined,
      );
    });
  }, [nodes, resumeThreeDPredictionTasks]);
  const resumedImageGenerationJobsRef = useRef<Set<string>>(new Set());
  const settledImageGenerationJobsRef = useRef<Set<string>>(new Set());
  const activeImageGenerationNodeIdsRef = useRef<Set<string>>(new Set());
  const activeImageGenerationTaskIdsRef = useRef<Set<string>>(new Set());
  const resumedImageGenerationTasksRef = useRef<Set<string>>(new Set());
  const settledImageGenerationTasksRef = useRef<Set<string>>(new Set());
  const resumedImageGenerationHistoryRef = useRef<Set<string>>(new Set());
  const resumedVideoGenerationTasksRef = useRef<Set<string>>(new Set());
  const settledVideoGenerationTasksRef = useRef<Set<string>>(new Set());
  const activeVideoGenerationTaskIdsRef = useRef<Set<string>>(new Set());
  const persistedExistingVideoUrlsRef = useRef<Set<string>>(new Set());
  const resumedAudioGenerationTasksRef = useRef<Set<string>>(new Set());
  const settledAudioGenerationTasksRef = useRef<Set<string>>(new Set());
  const activeAudioGenerationTaskIdsRef = useRef<Set<string>>(new Set());
  const workflowChatLayerSyncRef = useRef<
    Map<string, WorkflowChatLayerSyncRecord>
  >(new Map());
  const workflowChatPlaceholderBatchesRef = useRef<
    Map<string, WorkflowChatPlaceholderBatch>
  >(new Map());
  const workflowChatPlaceholderSlotsRef = useRef<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    persistedExistingVideoUrlsRef.current.clear();
  }, [projectId]);

  const prepareWorkflowImageGenerationPlaceholder = useCallback(
    (sourceNode: LibTvWorkflowNode, aspectRatio: string, _count = 1) => {
      const hasExistingImageGeneratorResults =
        (sourceNode.kind === "image" &&
          Array.isArray(sourceNode.data?.workflowImageResults) &&
          sourceNode.data.workflowImageResults.length > 1) ||
        isWorkflowImageGeneratorResultGroupNode(sourceNode);
      const placeholderCount = hasExistingImageGeneratorResults ? 1 : _count;
      const displayFrame = workflowImageGenerationPlaceholderFrame(
        aspectRatio,
        placeholderCount,
      );
      const nextFrame = {
        width: displayFrame.width,
        height: displayFrame.height,
      };
      moveWorkflowNode(sourceNode.id, nextFrame);
      updateWorkflowNode(sourceNode.id, {
        note: WORKFLOW_IMAGE_GENERATING_NOTE,
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0,
        workflowGenerationError: "",
        workflowGenerationResultIndex: 0,
      });
      return {
        width: displayFrame.width,
        height: displayFrame.height,
        cellWidth: displayFrame.cellWidth,
        cellHeight: displayFrame.cellHeight,
        columns: displayFrame.columns,
        rows: displayFrame.rows,
        gap: displayFrame.gap,
      };
    },
    [moveWorkflowNode, updateWorkflowNode],
  );

  const finalizeRecoveredWorkflowImageGeneration = useCallback(
    async (nodeId: string, resultUrls: string[], taskIds: string[]) => {
      const urls = Array.from(
        new Set(
          resultUrls.map((url) => String(url || "").trim()).filter(Boolean),
        ),
      );
      if (urls.length === 0) throw new Error("图片生成未返回结果");
      const currentNode = useCanvasStore
        .getState()
        .libtvWorkflow.nodes.find(
          (node: LibTvWorkflowNode) => node.id === nodeId,
        );
      if (!currentNode) return;
      const imageItems = await Promise.all(
        urls.map(async (url, index) => {
          const size = await readWorkflowImageUrlSize(url).catch(() => ({
            width: 16,
            height: 9,
          }));
          return {
            url,
            width: size.width,
            height: size.height,
            title: "图片 " + (index + 1),
          };
        }),
      );
      const normalizedTaskIds = Array.from(
        new Set(taskIds.map((id) => String(id || "").trim()).filter(Boolean)),
      );
      const latestTaskId = normalizedTaskIds[normalizedTaskIds.length - 1];

      if (imageItems.length <= 1 && currentNode.kind === "image") {
        const result = imageItems[0];
        updateWorkflowNode(nodeId, {
          mediaUrl: result.url,
          mediaRole: "generator",
          componentType: "image-generator",
          ...getWorkflowMediaNaturalSizePatch(result),
          workflowMediaUserResized: false,
          workflowImageResults: undefined,
          workflowImageResultsCollapsed: true,
          note: "",
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          workflowGenerationJobId: undefined,
          workflowGenerationTaskId: latestTaskId,
          workflowGenerationTaskIds: normalizedTaskIds,
          suppressGenerationBar: false,
        });
        applyWorkflowImageUrlNodeFrame(
          moveWorkflowNode,
          nodeId,
          result.url,
          undefined,
          (size) => {
            updateWorkflowNode(nodeId, getWorkflowMediaNaturalSizePatch(size));
          },
          () => shouldApplyAutoMediaFrame(nodeId, result.url),
        );
        return;
      }

      updateWorkflowNode(nodeId, {
        workflowGenerationTaskId: latestTaskId,
        workflowGenerationTaskIds: normalizedTaskIds,
        workflowGenerationJobId: undefined,
      });
      replaceWorkflowNodeWithImageGroup(nodeId, imageItems, {
        title:
          String(currentNode.data?.title || "图片生成器").trim() ||
          "图片生成器",
        prompt: String(currentNode.data?.prompt || ""),
        aspectRatio: String(currentNode.data?.aspectRatio || ""),
        imageSize: String(currentNode.data?.imageSize || ""),
        generationCount: Math.max(
          imageItems.length,
          Number(currentNode.data?.generationCount || 1),
        ),
        selectedOptionId: currentNode.data?.selectedOptionId,
      });
    },
    [moveWorkflowNode, replaceWorkflowNodeWithImageGroup, updateWorkflowNode],
  );

  const resumeImageGenerationTasks = useCallback(
    (nodeId: string, rawTaskIds: string[], baseUrl?: string) => {
      const taskIds = Array.from(
        new Set(
          rawTaskIds.map((id) => String(id || "").trim()).filter(Boolean),
        ),
      );
      if (taskIds.length === 0) return;
      if (
        activeImageGenerationNodeIdsRef.current.has(nodeId) ||
        taskIds.some((id) => activeImageGenerationTaskIdsRef.current.has(id))
      ) {
        return;
      }
      const resumeKey = nodeId + ":" + taskIds.join(",");
      if (
        resumedImageGenerationTasksRef.current.has(resumeKey) ||
        settledImageGenerationTasksRef.current.has(resumeKey)
      ) {
        return;
      }
      resumedImageGenerationTasksRef.current.add(resumeKey);
      const abortController = createResumeTaskAbortController();
      void (async () => {
        try {
          const recovered = await resumeWorkflowPredictionTasks(taskIds, {
            baseUrl,
            signal: abortController.signal,
            onCompleted: (event) => {
              updateWorkflowNode(nodeId, {
                workflowGenerationRunning: true,
                workflowGenerationProgress: Math.min(
                  0.98,
                  Math.max(0.08, (event.index + 1) / event.total),
                ),
                note: WORKFLOW_IMAGE_GENERATING_NOTE,
              });
            },
          });
          if (abortController.signal.aborted) return;
          await finalizeRecoveredWorkflowImageGeneration(
            nodeId,
            recovered.urls,
            recovered.ids,
          );
          settledImageGenerationTasksRef.current.add(resumeKey);
        } catch (error) {
          if (isWorkflowTaskAbortError(error) || abortController.signal.aborted)
            return;
          const messageText =
            error instanceof Error ? error.message : "图片生成恢复失败";
          updateWorkflowNode(nodeId, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: false,
          });
        } finally {
          resumedImageGenerationTasksRef.current.delete(resumeKey);
          releaseResumeTaskAbortController(abortController);
        }
      })();
    },
    [
      createResumeTaskAbortController,
      finalizeRecoveredWorkflowImageGeneration,
      releaseResumeTaskAbortController,
      updateWorkflowNode,
    ],
  );

  const recoverImageGenerationFromHistory = useCallback(
    (nodeId: string, startedAt: number) => {
      const resumeKey = nodeId + ":" + startedAt;
      if (resumedImageGenerationHistoryRef.current.has(resumeKey)) return;
      resumedImageGenerationHistoryRef.current.add(resumeKey);
      const abortController = createResumeTaskAbortController();
      void (async () => {
        try {
          for (let attempt = 0; attempt < 24; attempt += 1) {
            if (abortController.signal.aborted) return;
            const node = useCanvasStore
              .getState()
              .libtvWorkflow.nodes.find(
                (item: LibTvWorkflowNode) => item.id === nodeId,
              );
            if (!node || !node.data?.workflowGenerationRunning) return;
            const recovered = await recoverWorkflowImageRuntimeFromHistory({
              modelId: String(node.data?.modelId || "").trim(),
              prompt: [
                String(node.data?.workflowInternalPrompt || "").trim(),
                String(node.data?.prompt || "").trim(),
              ]
                .filter(Boolean)
                .join("\n\n"),
              startedAt,
              expectedCount: Number(node.data?.generationCount || 1),
            });
            if (recovered) {
              await finalizeRecoveredWorkflowImageGeneration(
                nodeId,
                recovered.urls,
                recovered.taskIds,
              );
              return;
            }
            await workflowCanvasJobDelay(5000, abortController.signal);
          }
        } catch (error) {
          if (
            !isWorkflowTaskAbortError(error) &&
            !abortController.signal.aborted
          ) {
            console.warn(
              "[LibTvWorkflowCanvas] recover image history failed",
              error,
            );
          }
        } finally {
          resumedImageGenerationHistoryRef.current.delete(resumeKey);
          releaseResumeTaskAbortController(abortController);
        }
      })();
    },
    [
      createResumeTaskAbortController,
      finalizeRecoveredWorkflowImageGeneration,
      releaseResumeTaskAbortController,
    ],
  );

  const resumeImageGenerationJob = useCallback(
    (nodeId: string, jobId: string) => {
      const normalizedJobId = String(jobId || "").trim();
      if (!normalizedJobId) return;
      const resumeKey = `${nodeId}:${normalizedJobId}`;
      if (
        resumedImageGenerationJobsRef.current.has(resumeKey) ||
        settledImageGenerationJobsRef.current.has(resumeKey)
      )
        return;
      resumedImageGenerationJobsRef.current.add(resumeKey);
      const abortController = createResumeTaskAbortController();
      void (async () => {
        try {
          const currentResumeNode = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.find(
              (node: LibTvWorkflowNode) => node.id === nodeId,
            );
          const currentStartedAt = Number(
            currentResumeNode?.data?.workflowGenerationStartedAt,
          );
          const effectiveStartedAt =
            Number.isFinite(currentStartedAt) && currentStartedAt > 0
              ? currentStartedAt
              : Date.now();
          if (!(Number.isFinite(currentStartedAt) && currentStartedAt > 0)) {
            updateWorkflowNode(nodeId, {
              workflowGenerationStartedAt: effectiveStartedAt,
            });
          }
          const completedJob = await waitWorkflowCanvasBackendJob({
            jobId: normalizedJobId,
            maxAttempts: 360,
            signal: abortController.signal,
            onProgress: (job) => {
              if (abortController.signal.aborted) return;
              const progressLabel = String(
                job.resultData?.message || "",
              ).trim();
              updateWorkflowNode(nodeId, {
                workflowGenerationJobId: job.id,
                workflowGenerationRunning: true,
                workflowGenerationProgress: Number.isFinite(
                  Number(job.resultData?.progress),
                )
                  ? Math.max(
                      0,
                      Math.min(0.99, Number(job.resultData?.progress)),
                    )
                  : undefined,
                note: normalizeWorkflowImageGeneratingNote(progressLabel),
              });
            },
          });
          if (abortController.signal.aborted) return;
          const resultUrls = collectWorkflowCanvasJobResultUrls(
            completedJob.resultData?.response || completedJob.resultUrl,
          );
          const resultUrl =
            resultUrls[0] ||
            resolveWorkflowCanvasBackendJobResultUrl(completedJob);
          if (!resultUrl) throw new Error("图片生成未返回结果");
          const jobRequest = completedJob.payload?.request || {};
          const rawPrompt = String(jobRequest.rawPrompt || "").trim();
          const aspectRatio = String(jobRequest.aspectRatio || "").trim();
          const imageSize = String(jobRequest.imageSize || "").trim();
          const currentNode = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.find(
              (node: LibTvWorkflowNode) => node.id === nodeId,
            );
          const keepImageGenerator =
            currentNode?.data?.mediaRole === "generator" ||
            currentNode?.data?.componentType === "image-generator";
          updateWorkflowNode(nodeId, {
            mediaUrl: resultUrl,
            mediaRole: keepImageGenerator ? "generator" : "ordinary",
            ...(keepImageGenerator ? { componentType: "image-generator" } : {}),
            ...(rawPrompt ? { prompt: rawPrompt } : {}),
            ...(aspectRatio ? { aspectRatio } : {}),
            ...(imageSize ? { imageSize } : {}),
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            workflowGenerationJobId: completedJob.id,
            suppressGenerationBar: false,
          });
          settledImageGenerationJobsRef.current.add(resumeKey);
        } catch (error) {
          if (isWorkflowTaskAbortError(error) || abortController.signal.aborted)
            return;
          const status = Number(
            (error as Error & { status?: number })?.status || 0,
          );
          if (status === 404) {
            const currentNode = useCanvasStore
              .getState()
              .libtvWorkflow.nodes.find(
                (node: LibTvWorkflowNode) => node.id === nodeId,
              );
            const startedAt = Number(
              currentNode?.data?.workflowGenerationStartedAt,
            );
            updateWorkflowNode(nodeId, {
              workflowGenerationJobId: undefined,
            });
            if (Number.isFinite(startedAt) && startedAt > 0) {
              recoverImageGenerationFromHistory(nodeId, startedAt);
            }
            return;
          }
          const messageText =
            error instanceof Error ? error.message : "图片生成失败";
          updateWorkflowNode(nodeId, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: false,
          });
          settledImageGenerationJobsRef.current.add(resumeKey);
        } finally {
          resumedImageGenerationJobsRef.current.delete(resumeKey);
          releaseResumeTaskAbortController(abortController);
        }
      })();
    },
    [
      createResumeTaskAbortController,
      recoverImageGenerationFromHistory,
      releaseResumeTaskAbortController,
      updateWorkflowNode,
    ],
  );

  useEffect(() => {
    nodes.forEach((node) => {
      if (node.kind !== "image") return;
      if (
        String((node.data as any)?.workflowGenerationCategory || "").trim() ===
        "workflow_angle_edit"
      )
        return;
      const jobId = String(node.data?.workflowGenerationJobId || "").trim();
      if (!jobId || isWorkflowImagePredictionJobId(jobId)) return;
      const hasMedia = Boolean(String(node.data?.mediaUrl || "").trim());
      const hasError = Boolean(
        String(node.data?.workflowGenerationError || "").trim(),
      );
      if (!node.data?.workflowGenerationRunning && !hasError && hasMedia)
        return;
      resumeImageGenerationJob(node.id, jobId);
    });
  }, [nodes, resumeImageGenerationJob]);

  useEffect(() => {
    const historyRecoveryTimers: number[] = [];
    nodes.forEach((node) => {
      if (node.kind !== "image") return;
      if (
        String((node.data as any)?.workflowGenerationCategory || "").trim() ===
        "workflow_angle_edit"
      ) {
        return;
      }
      const hasMedia = Boolean(String(node.data?.mediaUrl || "").trim());
      if (!node.data?.workflowGenerationRunning && hasMedia) return;
      const taskIds = resolveWorkflowImagePredictionTaskIds({
        taskIds: node.data?.workflowGenerationTaskIds,
        taskId: node.data?.workflowGenerationTaskId,
        jobId: node.data?.workflowGenerationJobId,
      });
      if (taskIds.length > 0) {
        resumeImageGenerationTasks(
          node.id,
          taskIds,
          String(node.data?.workflowGenerationBaseUrl || "").trim() ||
            undefined,
        );
        return;
      }
      const jobId = String(node.data?.workflowGenerationJobId || "").trim();
      if (jobId && !jobId.startsWith("local-image-") && !jobId.includes(",")) {
        return;
      }
      const startedAt = Number(node.data?.workflowGenerationStartedAt);
      if (
        !node.data?.workflowGenerationRunning ||
        !Number.isFinite(startedAt) ||
        startedAt <= 0
      ) {
        return;
      }
      const delay = Math.max(0, 5000 - (Date.now() - startedAt));
      historyRecoveryTimers.push(
        window.setTimeout(() => {
          const latestNode = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.find(
              (item: LibTvWorkflowNode) => item.id === node.id,
            );
          if (
            !latestNode?.data?.workflowGenerationRunning ||
            activeImageGenerationNodeIdsRef.current.has(node.id) ||
            String(latestNode.data?.workflowGenerationTaskId || "").trim() ||
            (Array.isArray(latestNode.data?.workflowGenerationTaskIds) &&
              latestNode.data.workflowGenerationTaskIds.length > 0)
          ) {
            return;
          }
          recoverImageGenerationFromHistory(node.id, startedAt);
        }, delay),
      );
    });
    return () => {
      historyRecoveryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [nodes, recoverImageGenerationFromHistory, resumeImageGenerationTasks]);

  const resumeVideoGenerationTask = useCallback(
    (
      nodeId: string,
      params: {
        providerTaskId: string;
        taskIds?: string[];
        taskType?: string;
        statusUrl?: string;
        modelId?: string;
        providerKey?: string;
        baseUrl?: string;
        seedanceJobId?: string;
      },
    ) => {
      const predictionTaskIds = resolveWorkflowPredictionTaskIds({
        taskIds: params.taskIds,
        taskId: params.providerTaskId,
      });
      const providerTaskId =
        predictionTaskIds[predictionTaskIds.length - 1] ||
        String(params.providerTaskId || "").trim();
      const seedanceJobId = String(params.seedanceJobId || "").trim();
      const rawTaskType = String(params.taskType || "").trim();
      const isPredictionTask = isWorkflowPredictionTaskType(
        rawTaskType,
        "video",
      );
      const taskType = isPredictionTask
        ? rawTaskType
        : resolveUnifiedProviderTaskType({
            taskType: params.taskType,
            modelId: params.modelId,
            providerKey: params.providerKey,
          });
      const statusUrl = String(params.statusUrl || "").trim();
      const effectiveModelId =
        String(params.modelId || "").trim() ||
        (taskType === "apimart-seedance-video"
          ? "doubao-seedance-2.0@@apimart"
          : "") ||
        (taskType === "apimart-skyreels-v4-video"
          ? "skyreels-v4-fast@@apimart"
          : "");
      if (!providerTaskId && !seedanceJobId && !statusUrl) return;
      if (
        isPredictionTask &&
        predictionTaskIds.some((id) =>
          activeVideoGenerationTaskIdsRef.current.has(id),
        )
      ) {
        return;
      }
      const resumeKey = `${nodeId}:${
        isPredictionTask && predictionTaskIds.length > 0
          ? predictionTaskIds.join(",")
          : providerTaskId || seedanceJobId || statusUrl
      }`;
      if (
        resumedVideoGenerationTasksRef.current.has(resumeKey) ||
        settledVideoGenerationTasksRef.current.has(resumeKey)
      )
        return;
      resumedVideoGenerationTasksRef.current.add(resumeKey);
      const abortController = createResumeTaskAbortController();
      void (async () => {
        try {
          if (isPredictionTask) {
            const recovered = await resumeWorkflowPredictionTasks(
              predictionTaskIds,
              {
                baseUrl: String(params.baseUrl || "").trim() || undefined,
                signal: abortController.signal,
                onCompleted: (event) => {
                  updateWorkflowNode(nodeId, {
                    note: WORKFLOW_VIDEO_GENERATING_NOTE,
                    workflowGenerationRunning: true,
                    workflowGenerationProgress: Math.min(
                      0.98,
                      Math.max(0.08, (event.index + 1) / event.total),
                    ),
                  });
                },
              },
            );
            if (abortController.signal.aborted) return;
            const currentNode = useCanvasStore
              .getState()
              .libtvWorkflow.nodes.find(
                (node: LibTvWorkflowNode) => node.id === nodeId,
              );
            if (!currentNode) return;
            const fallbackVideoSize = getWorkflowAspectRatioFallbackSize(
              String(currentNode.data?.aspectRatio || ""),
              16,
              9,
            );
            const videoItems = await Promise.all(
              recovered.urls.map(async (url, index) => {
                const metadata = await readWorkflowVideoUrlSize(url).catch(
                  () => fallbackVideoSize,
                );
                return {
                  url,
                  width: metadata.width,
                  height: metadata.height,
                  duration:
                    "duration" in metadata ? metadata.duration : undefined,
                  title: `视频 ${index + 1}`,
                };
              }),
            );
            const primaryVideo = videoItems[0];
            if (!primaryVideo) throw new Error("视频生成未返回结果");
            const keepGenerator =
              currentNode.data?.mediaRole === "generator" ||
              currentNode.data?.componentType === "video-generator";
            updateWorkflowNode(nodeId, {
              mediaUrl: primaryVideo.url,
              mediaRole: keepGenerator ? "generator" : "ordinary",
              ...getWorkflowMediaNaturalSizePatch(primaryVideo),
              workflowVideoResults:
                videoItems.length > 1 ? videoItems : undefined,
              workflowVideoResultsCollapsed: videoItems.length <= 1,
              note: "",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              workflowGenerationTaskId: recovered.ids[recovered.ids.length - 1],
              workflowGenerationTaskIds: recovered.ids,
              workflowGenerationTaskType: workflowPredictionTaskType("video"),
              workflowGenerationBaseUrl: recovered.baseUrl,
              suppressGenerationBar: false,
            });
            settledVideoGenerationTasksRef.current.add(resumeKey);
            return;
          }
          const isSeedanceBackgroundTask = isOfficialSeedanceTaskContext({
            taskType,
            providerKey: params.providerKey,
          });
          const pollIntervalMs = resolveProviderVideoPollIntervalMs({
            taskType,
            providerKey: params.providerKey,
            fallbackMs: 2500,
          });
          updateWorkflowNode(nodeId, {
            note: WORKFLOW_VIDEO_GENERATING_NOTE,
            workflowGenerationRunning: true,
          });
          const pollResult = await pollUnifiedVideoTaskUntilTerminal({
            intervalMs: pollIntervalMs,
            signal: abortController.signal,
            query: () =>
              queryUnifiedVideoTaskStatus({
                providerTaskId,
                taskType,
                statusUrl,
                modelId: effectiveModelId,
                providerKey: params.providerKey,
                seedanceJobId: isSeedanceBackgroundTask ? seedanceJobId : "",
                projectId: projectId || undefined,
                persistVideo: true,
                signal: abortController.signal,
                cache: "no-store",
              }),
            onResult: (nextResult) => {
              if (typeof nextResult.progress !== "number") return;
              updateWorkflowNode(nodeId, {
                note: WORKFLOW_VIDEO_GENERATING_NOTE,
                workflowGenerationRunning: true,
                workflowGenerationProgress: Math.max(
                  0,
                  Math.min(0.98, nextResult.progress),
                ),
              });
            },
          });
          if (abortController.signal.aborted) return;
          if (pollResult.status === "failed") {
            throw new Error(pollResult.statusMessage || "视频生成失败");
          }
          const thumbnailUrl = String(
            pollResult.thumbnailUrl ||
              collectWorkflowVideoPosterUrls(pollResult.payload)[0] ||
              "",
          ).trim();
          updateWorkflowNode(nodeId, {
            mediaUrl: pollResult.videos[0],
            thumbnailUrl: thumbnailUrl || undefined,
            mediaRole: "ordinary",
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: 1,
            workflowGenerationError: "",
          });
          settledVideoGenerationTasksRef.current.add(resumeKey);
        } catch (error) {
          if (isWorkflowTaskAbortError(error) || abortController.signal.aborted)
            return;
          const messageText =
            error instanceof Error ? error.message : "视频生成失败";
          updateWorkflowNode(nodeId, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
          });
          settledVideoGenerationTasksRef.current.add(resumeKey);
        } finally {
          resumedVideoGenerationTasksRef.current.delete(resumeKey);
          releaseResumeTaskAbortController(abortController);
        }
      })();
    },
    [
      createResumeTaskAbortController,
      projectId,
      releaseResumeTaskAbortController,
      updateWorkflowNode,
    ],
  );

  useEffect(() => {
    nodes.forEach((node) => {
      if (node.kind !== "video") return;
      if (!hasRecoverableWorkflowVideoGenerationTask(node)) return;
      let providerTaskId = String(
        (node.data as any)?.workflowGenerationTaskId || "",
      ).trim();
      const taskIds = resolveWorkflowPredictionTaskIds({
        taskIds: node.data?.workflowGenerationTaskIds,
        taskId: providerTaskId,
      });
      providerTaskId = providerTaskId || taskIds[taskIds.length - 1] || "";
      const seedanceJobId = String(
        (node.data as any)?.workflowGenerationBackgroundTaskId || "",
      ).trim();
      const statusUrl = String(
        (node.data as any)?.workflowGenerationStatusUrl || "",
      ).trim();
      const taskType = String(
        (node.data as any)?.workflowGenerationTaskType || "",
      ).trim();
      const isCodexControlled =
        String(
          (node.data as any)?.workflowGenerationController || "",
        ).trim() === "codex";
      if (isCodexControlled && !taskType && !statusUrl && !seedanceJobId)
        return;
      if (taskIds.length === 0 && !seedanceJobId && !statusUrl) return;
      if (!node.data?.workflowGenerationRunning) {
        updateWorkflowNode(node.id, {
          note: normalizeWorkflowVideoGeneratingNote(node.data?.note),
          workflowGenerationRunning: true,
          workflowGenerationError: "",
        });
      }
      resumeVideoGenerationTask(node.id, {
        providerTaskId,
        taskIds,
        taskType,
        statusUrl,
        modelId: String(node.data?.modelId || "").trim(),
        providerKey: String(
          (node.data as any)?.workflowGenerationProviderKey || "",
        ).trim(),
        baseUrl: String(
          (node.data as any)?.workflowGenerationBaseUrl || "",
        ).trim(),
        seedanceJobId,
      });
    });
  }, [nodes, resumeVideoGenerationTask]);

  const migrateExistingGeneratedVideo = useCallback(
    async (
      nodeId: string,
      sourceUrl: string,
      taskId: string,
      providerKey: string,
    ) => {
      const normalizedSourceUrl = String(sourceUrl || "").trim();
      if (
        !normalizedSourceUrl ||
        persistedExistingVideoUrlsRef.current.has(normalizedSourceUrl)
      )
        return;
      persistedExistingVideoUrlsRef.current.add(normalizedSourceUrl);
      try {
        const response = await fetch("/api/workflow/persist-generated-video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            sourceUrl: normalizedSourceUrl,
            projectId,
            taskId: taskId || undefined,
            providerKey: providerKey || undefined,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !String(payload?.videoUrl || "").trim()) {
          throw new Error(String(payload?.error || "视频转存失败"));
        }
        const nextVideoUrl = String(payload.videoUrl).trim();
        const nextThumbnailUrl = String(payload.thumbnailUrl || "").trim();
        const currentNode = useCanvasStore
          .getState()
          .libtvWorkflow.nodes.find((item) => item.id === nodeId);
        if (!currentNode) return;
        const currentMediaUrl = String(currentNode.data?.mediaUrl || "").trim();
        const currentResults = Array.isArray(
          currentNode.data?.workflowVideoResults,
        )
          ? currentNode.data.workflowVideoResults
          : [];
        const nextResults = currentResults.map((item) =>
          String(item?.url || "").trim() === normalizedSourceUrl
            ? {
                ...item,
                url: nextVideoUrl,
                thumbnailUrl: nextThumbnailUrl || item.thumbnailUrl,
              }
            : item,
        );
        const patch: Record<string, unknown> = {
          ...(currentMediaUrl === normalizedSourceUrl
            ? { mediaUrl: nextVideoUrl }
            : {}),
          ...(nextThumbnailUrl && currentMediaUrl === normalizedSourceUrl
            ? { thumbnailUrl: nextThumbnailUrl }
            : {}),
          ...(nextResults.length > 0
            ? { workflowVideoResults: nextResults }
            : {}),
        };
        const width = Number(payload.width || 0);
        const height = Number(payload.height || 0);
        if (
          width > 0 &&
          height > 0 &&
          currentMediaUrl === normalizedSourceUrl
        ) {
          Object.assign(
            patch,
            getWorkflowMediaNaturalSizePatch({ width, height }),
          );
        }
        updateWorkflowNode(nodeId, patch as any);
      } catch (error) {
        console.warn(
          "[LibTvWorkflowCanvas] existing video persistence failed",
          { nodeId, error },
        );
      }
    },
    [projectId, updateWorkflowNode],
  );

  useEffect(() => {
    if (readOnly || !projectId) return;
    const candidates = nodes
      .filter((node) => {
        if (node.kind !== "video") return false;
        const sourceUrl = String(node.data?.mediaUrl || "").trim();
        if (!/^https?:\/\//i.test(sourceUrl)) return false;
        if (persistedExistingVideoUrlsRef.current.has(sourceUrl)) return false;
        if (!(
          node.data?.mediaRole === "generator" ||
          node.data?.componentType === "video-generator" ||
          String(node.data?.workflowGenerationTaskId || "").trim()
        ))
          return false;
        return !isPersistedWorkflowVideoUrl(sourceUrl);
      })
      .slice(0, 2);
    if (candidates.length === 0) return;
    for (const node of candidates) {
      void migrateExistingGeneratedVideo(
        node.id,
        String(node.data?.mediaUrl || "").trim(),
        String(node.data?.workflowGenerationTaskId || "").trim(),
        String(node.data?.workflowGenerationProviderKey || "").trim(),
      );
    }
  }, [migrateExistingGeneratedVideo, nodes, projectId, readOnly]);

  const resumeAudioGenerationTask = useCallback(
    (
      nodeId: string,
      params: {
        taskId: string;
        taskIds?: string[];
        taskType?: string;
        modelId?: string;
        baseUrl?: string;
      },
    ) => {
      const taskIds = resolveWorkflowPredictionTaskIds({
        taskIds: params.taskIds,
        taskId: params.taskId,
      });
      const taskId =
        taskIds[taskIds.length - 1] || String(params.taskId || "").trim();
      const taskType = String(params.taskType || "").trim();
      const isPredictionTask = isWorkflowPredictionTaskType(taskType, "audio");
      const modelId = String(params.modelId || "").trim();
      if (!taskId || (!isPredictionTask && !modelId)) return;
      if (
        isPredictionTask &&
        taskIds.some((id) => activeAudioGenerationTaskIdsRef.current.has(id))
      ) {
        return;
      }
      const resumeKey = `${nodeId}:${
        isPredictionTask ? taskIds.join(",") : taskId
      }`;
      if (
        resumedAudioGenerationTasksRef.current.has(resumeKey) ||
        settledAudioGenerationTasksRef.current.has(resumeKey)
      )
        return;
      resumedAudioGenerationTasksRef.current.add(resumeKey);
      const abortController = createResumeTaskAbortController();
      void (async () => {
        try {
          if (isPredictionTask) {
            const recovered = await resumeWorkflowPredictionTasks(taskIds, {
              baseUrl: String(params.baseUrl || "").trim() || undefined,
              signal: abortController.signal,
              onCompleted: (event) => {
                updateWorkflowNode(nodeId, {
                  note: "音频生成中...",
                  workflowGenerationRunning: true,
                  workflowGenerationProgress: Math.min(
                    0.98,
                    Math.max(0.08, (event.index + 1) / event.total),
                  ),
                });
              },
            });
            if (abortController.signal.aborted) return;
            const audioUrl = String(recovered.urls[0] || "").trim();
            if (!audioUrl) throw new Error("音频生成未返回结果");
            updateWorkflowNode(nodeId, {
              mediaUrl: audioUrl,
              mediaRole: "ordinary",
              note: "",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              workflowGenerationTaskId: recovered.ids[recovered.ids.length - 1],
              workflowGenerationTaskIds: recovered.ids,
              workflowGenerationTaskType: workflowPredictionTaskType("audio"),
              workflowGenerationBaseUrl: recovered.baseUrl,
              suppressGenerationBar: false,
            });
            settledAudioGenerationTasksRef.current.add(resumeKey);
            return;
          }
          const completed = await waitWorkflowAudioTask({
            taskId,
            modelId,
            projectId: projectId || undefined,
            maxAttempts: 180,
            signal: abortController.signal,
            onProgress: (status, progress) => {
              if (abortController.signal.aborted) return;
              const messageText = String(status.message || "").trim();
              updateWorkflowNode(nodeId, {
                note: messageText ? messageText.slice(0, 80) : "音频生成中...",
                workflowGenerationRunning: true,
                workflowGenerationProgress: progress,
              });
            },
          });
          if (abortController.signal.aborted) return;
          const audioUrl = String(completed.audioUrl || "").trim();
          if (!audioUrl) throw new Error("音频生成未返回结果");
          updateWorkflowNode(nodeId, {
            mediaUrl: audioUrl,
            mediaRole: "ordinary",
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            workflowGenerationTaskId: taskId,
            workflowGenerationTaskType: "zmtv-audio",
            suppressGenerationBar: false,
          });
          settledAudioGenerationTasksRef.current.add(resumeKey);
        } catch (error) {
          if (isWorkflowTaskAbortError(error) || abortController.signal.aborted)
            return;
          const messageText =
            error instanceof Error ? error.message : "音频生成失败";
          updateWorkflowNode(nodeId, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: false,
          });
          settledAudioGenerationTasksRef.current.add(resumeKey);
        } finally {
          resumedAudioGenerationTasksRef.current.delete(resumeKey);
          releaseResumeTaskAbortController(abortController);
        }
      })();
    },
    [
      createResumeTaskAbortController,
      projectId,
      releaseResumeTaskAbortController,
      updateWorkflowNode,
    ],
  );

  useEffect(() => {
    nodes.forEach((node) => {
      if (node.kind !== "audio") return;
      if (!node.data?.workflowGenerationRunning) return;
      if (String(node.data?.mediaUrl || "").trim()) return;
      const taskId = String(
        (node.data as any)?.workflowGenerationTaskId || "",
      ).trim();
      const taskIds = resolveWorkflowPredictionTaskIds({
        taskIds: node.data?.workflowGenerationTaskIds,
        taskId,
      });
      if (taskIds.length === 0) return;
      resumeAudioGenerationTask(node.id, {
        taskId: taskId || taskIds[taskIds.length - 1],
        taskIds,
        taskType: String(node.data?.workflowGenerationTaskType || "").trim(),
        modelId: String(node.data?.modelId || "").trim(),
        baseUrl: String(node.data?.workflowGenerationBaseUrl || "").trim(),
      });
    });
  }, [nodes, resumeAudioGenerationTask]);

  useEffect(() => {
    let cancelled = false;
    nodes.forEach((node) => {
      if (node.kind !== "video" || node.data?.mediaRole !== "generator") return;
      if (node.data?.videoMethodUserSelected) return;
      const modelId = String(node.data?.modelId || "").trim();
      if (!modelId) return;
      const currentVideoMethod = String(node.data?.videoMethod || "").trim();
      const inputCounts = getWorkflowVideoInputCountsFromConnectedInputs(
        node.id,
        nodes,
        edges,
      );
      void resolveWorkflowVideoMethodForModel(
        modelId,
        currentVideoMethod,
        inputCounts,
      )
        .then((nextVideoMethod) => {
          if (
            cancelled ||
            !nextVideoMethod ||
            nextVideoMethod === currentVideoMethod
          )
            return;
          const latestNode = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.find((item) => item.id === node.id);
          if (!latestNode || latestNode.data?.videoMethodUserSelected) return;
          if (String(latestNode.data?.modelId || "").trim() !== modelId) return;
          if (
            String(latestNode.data?.videoMethod || "").trim() ===
            nextVideoMethod
          )
            return;
          updateWorkflowNode(node.id, { videoMethod: nextVideoMethod });
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [edges, nodes, updateWorkflowNode]);

  useEffect(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    edges.forEach((edge) => {
      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (!sourceNode || !targetNode) return;
      if (
        sourceNode.kind !== "image" ||
        sourceNode.data?.mediaRole !== "ordinary"
      )
        return;
      if (
        !(
          targetNode.kind === "image" ||
          targetNode.kind === "video" ||
          targetNode.kind === "script" ||
          targetNode.kind === "script-v2" ||
          targetNode.kind === "threed" ||
          targetNode.kind === "director-console-3d"
        ) ||
        (targetNode.kind === "image" &&
          targetNode.data?.mediaRole !== "generator") ||
        (targetNode.kind === "video" &&
          targetNode.data?.mediaRole !== "generator")
      )
        return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      const references = Array.isArray(targetNode.data.referenceImages)
        ? targetNode.data.referenceImages
        : [];
      const referenceNodeIds = Array.isArray(
        targetNode.data.referenceImageNodeIds,
      )
        ? targetNode.data.referenceImageNodeIds
        : [];
      const existingIndex = referenceNodeIds.findIndex(
        (id) => id === sourceNode.id,
      );
      if (!sourceUrl || sourceUrl === "Image") {
        if (existingIndex >= 0) {
          updateWorkflowNode(targetNode.id, {
            referenceImages: references.filter(
              (_, index) => referenceNodeIds[index] !== sourceNode.id,
            ),
            referenceImageNodeIds: referenceNodeIds.filter(
              (id) => id !== sourceNode.id,
            ),
          });
        }
        return;
      }
      if (existingIndex >= 0 && references[existingIndex] === sourceUrl) return;
      attachWorkflowReferenceImage(targetNode.id, sourceNode.id, sourceUrl);
    });
  }, [attachWorkflowReferenceImage, edges, nodes, updateWorkflowNode]);

  const handleCreateWorkflowCanvas = useCallback(() => {
    const now = Date.now();
    const nextId = `canvas-${now}`;
    const nextName = `画布 ${workflowCanvases.length + 1}`;
    const emptyWorkflow = normalizeLibTvWorkflowState({
      ...EMPTY_LIBTV_WORKFLOW_STATE,
      enabled: true,
    });
    setWorkflowCanvases((current) => {
      const activeId = String(
        activeWorkflowCanvasId || current[0]?.id || "default",
      ).trim();
      const savedCurrent =
        current.length > 0
          ? current
          : normalizeLibTvProjectCanvases(undefined, workflow);
      const currentViewport = workflowViewportRef.current;
      return [
        ...savedCurrent.map((canvas) =>
          canvas.id === activeId
            ? {
                ...canvas,
                libtvWorkflow: normalizeLibTvWorkflowState(workflow),
                viewport: currentViewport,
                updatedAt: now,
              }
            : canvas,
        ),
        {
          id: nextId,
          name: nextName,
          libtvWorkflow: emptyWorkflow,
          viewport: { ...DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT },
          createdAt: now,
          updatedAt: now,
        },
      ];
    });
    setActiveWorkflowCanvasId(nextId);
    setWorkflow(emptyWorkflow);
    resetWorkflowHistory("新建工作流画布");
    workflowViewportRef.current = { ...DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT };
    setWorkflowViewport({ ...DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT });
    setViewportZoom(DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT.zoom);
    setWorkflowSelectedIds([]);
    void flowRef.current?.setViewport(DEFAULT_LIBTV_PROJECT_CANVAS_VIEWPORT);
    message.success(`已新建${nextName}`);
  }, [
    activeWorkflowCanvasId,
    resetWorkflowHistory,
    setWorkflow,
    setWorkflowSelectedIds,
    workflow,
    workflowCanvases.length,
  ]);

  const handleSwitchWorkflowCanvas = useCallback(
    (canvasId: string) => {
      const nextId = String(canvasId || "").trim();
      if (!nextId || nextId === activeWorkflowCanvasId) return;
      const target = workflowCanvases.find((canvas) => canvas.id === nextId);
      if (!target) return;
      const now = Date.now();
      const nextViewport = normalizeLibTvProjectCanvasViewport(target.viewport);
      const currentViewport = workflowViewportRef.current;
      workflowViewportRef.current = nextViewport;
      setWorkflowCanvases((current) =>
        current.map((canvas) =>
          canvas.id === activeWorkflowCanvasId
            ? {
                ...canvas,
                libtvWorkflow: normalizeLibTvWorkflowState(workflow),
                viewport: currentViewport,
                updatedAt: now,
              }
            : canvas,
        ),
      );
      setActiveWorkflowCanvasId(nextId);
      setWorkflow(target.libtvWorkflow);
      resetWorkflowHistory("切换工作流画布");
      setWorkflowViewport(nextViewport);
      setViewportZoom(nextViewport.zoom);
      setWorkflowSelectedIds([]);
      void flowRef.current?.setViewport(nextViewport);
    },
    [
      activeWorkflowCanvasId,
      resetWorkflowHistory,
      setWorkflow,
      setWorkflowSelectedIds,
      workflow,
      workflowCanvases,
    ],
  );

  const handlePublishWorkflowProject = useCallback(
    async (payload: {
      title: string;
      description: string;
      coverUrl: string;
      videoUrl: string;
      socialUrl: string;
      activityTag: string;
      contestTrack: string;
      publicCanvas: boolean;
    }) => {
      if (!projectId || publishingWorkflow) return;
      if (!payload.publicCanvas) {
        message.info("当前先支持公开画布发布");
        return;
      }
      setPublishingWorkflow(true);
      try {
        const content = buildCanvasProjectContentDocument({
          layers: layers as Array<any>,
          libtvWorkflow: workflow,
          libtvCanvases: workflowCanvases,
          activeLibTvCanvasId: activeWorkflowCanvasId,
          projectMaterials,
        });
        const response = await fetch("/api/public-workflow-projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId,
            title: payload.title,
            description: payload.description,
            coverUrl: payload.coverUrl,
            videoUrl: payload.videoUrl,
            socialUrl: payload.socialUrl,
            activityTag: payload.activityTag,
            contestTrack: payload.contestTrack,
            content,
          }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "发布失败");
        const url = String(data?.publicUrl || "").trim();
        setPublishedWorkflowUrl(url);
        message.success("已发布公开画布，可复制链接分享");
      } catch (error) {
        message.error(error instanceof Error ? error.message : "发布失败");
      } finally {
        setPublishingWorkflow(false);
      }
    },
    [
      activeWorkflowCanvasId,
      layers,
      projectId,
      projectMaterials,
      publishingWorkflow,
      workflow,
      workflowCanvases,
    ],
  );

  const getNextNodePosition = useCallback(
    (kind: LibTvWorkflowNodeKind) => {
      const rect = containerRef.current?.getBoundingClientRect();
      const frame = workflowNodeFrame(kind);
      const centerPoint = {
        x: rect ? rect.left + rect.width / 2 : 960,
        y: rect ? rect.top + rect.height / 2 : 540,
      };
      const flowCenter =
        flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
      const offset = (nodes.length % 3) * 28;
      return {
        x: Math.round(Number(flowCenter.x || 0) - frame.width / 2 + offset),
        y: Math.round(Number(flowCenter.y || 0) - frame.height / 2 + offset),
      };
    },
    [nodes.length],
  );

  const createWorkflowNode = useCallback(
    (
      kind: LibTvWorkflowNodeKind,
      patch?: {
        title?: string;
        note?: string;
        x?: number;
        y?: number;
        linkFromNodeId?: string | null;
        linkToNodeId?: string | null;
      },
    ) => {
      const node = addWorkflowNode(
        kind,
        typeof patch?.x === "number" && typeof patch?.y === "number"
          ? {
              x: patch.x,
              y: patch.y,
              linkFromNodeId: patch.linkFromNodeId,
              linkToNodeId: patch.linkToNodeId,
            }
          : getNextNodePosition(kind),
      );
      const nextTitle =
        String(patch?.title || "").trim() || getDefaultNodeTitle(kind);
      if (nextTitle !== node.data.title || patch?.note) {
        updateWorkflowNode(node.id, {
          title: nextTitle,
          note: patch?.note || node.data.note,
        });
      }
      selectLayer(node.id);
      setActiveWorkflowNode(node.id);
      return node;
    },
    [
      addWorkflowNode,
      getDefaultNodeTitle,
      getNextNodePosition,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const createTextToVideoStarterWorkflow = useCallback(() => {
    const videoFrame = workflowVideoGeneratorFrame();
    const gap = 140;
    const rect = containerRef.current?.getBoundingClientRect();
    const centerPoint = {
      x: rect ? rect.left + rect.width / 2 : 960,
      y: rect ? rect.top + rect.height / 2 : 540,
    };
    const flowCenter =
      flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
    const totalWidth = WORKFLOW_TEXT_EDITOR_WIDTH + gap + videoFrame.width;
    const textX = Math.round(Number(flowCenter.x || 0) - totalWidth / 2);
    const textY = Math.round(
      Number(flowCenter.y || 0) - WORKFLOW_TEXT_EDITOR_HEIGHT / 2,
    );
    const videoX = Math.round(textX + WORKFLOW_TEXT_EDITOR_WIDTH + gap);
    const videoY = Math.round(
      Number(flowCenter.y || 0) - videoFrame.height / 2,
    );

    const textNode = addWorkflowNode("text", { x: textX, y: textY });
    updateWorkflowNode(textNode.id, {
      title: getDefaultNodeTitle("text"),
      content: createWorkflowTextEditorInitialContent(
        WORKFLOW_TEXT_TO_VIDEO_DEFAULT_PROMPT,
      ),
      prompt: "",
      componentType: "text-editor",
      selectedOptionId: "custom",
      options: [],
    });
    moveWorkflowNode(textNode.id, {
      x: textX,
      y: textY,
      width: WORKFLOW_TEXT_EDITOR_WIDTH,
      height: WORKFLOW_TEXT_EDITOR_HEIGHT,
    });

    const videoNode = addWorkflowNode("video", {
      x: videoX,
      y: videoY,
      linkFromNodeId: textNode.id,
    });
    updateWorkflowNode(videoNode.id, {
      title: getDefaultNodeTitle("video"),
      content: "",
      prompt: "根据文字描述生成视频。",
      mediaUrl: "",
      mediaRole: "generator",
      selectedOptionId: "text-to-video",
      options: [],
    });
    moveWorkflowNode(videoNode.id, {
      x: videoX,
      y: videoY,
      width: videoFrame.width,
      height: videoFrame.height,
    });
    selectLayer(videoNode.id);
    setActiveWorkflowNode(videoNode.id);
    window.setTimeout(() => {
      void flowRef.current?.fitView({
        nodes: [{ id: textNode.id }, { id: videoNode.id }],
        padding: 0.38,
        duration: 420,
        maxZoom: 1,
      });
    }, 0);
    return videoNode;
  }, [
    addWorkflowNode,
    getDefaultNodeTitle,
    moveWorkflowNode,
    selectLayer,
    setActiveWorkflowNode,
    updateWorkflowNode,
  ]);

  const createImageBackgroundStarterWorkflow = useCallback(() => {
    const imageFrame = workflowNodeFrame("image");
    const gap = 140;
    const rect = containerRef.current?.getBoundingClientRect();
    const centerPoint = {
      x: rect ? rect.left + rect.width / 2 : 960,
      y: rect ? rect.top + rect.height / 2 : 540,
    };
    const flowCenter =
      flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
    const totalWidth = imageFrame.width * 2 + gap;
    const sourceX = Math.round(Number(flowCenter.x || 0) - totalWidth / 2);
    const sourceY = Math.round(
      Number(flowCenter.y || 0) - imageFrame.height / 2,
    );
    const generatorX = Math.round(sourceX + imageFrame.width + gap);
    const generatorY = sourceY;

    const sourceNode = addWorkflowNode("image", { x: sourceX, y: sourceY });
    updateWorkflowNode(sourceNode.id, {
      title: getDefaultNodeTitle("image"),
      content: "",
      prompt: "",
      mediaUrl: LIBTV_DEFAULT_ORDINARY_IMAGE_URL,
      mediaRole: "ordinary",
      selectedOptionId: "custom",
      options: [],
    });
    moveWorkflowNode(sourceNode.id, {
      x: sourceX,
      y: sourceY,
      width: imageFrame.width,
      height: imageFrame.height,
    });

    const generatorNode = addWorkflowNode("image", {
      x: generatorX,
      y: generatorY,
      linkFromNodeId: sourceNode.id,
    });
    updateWorkflowNode(generatorNode.id, {
      title: "图片换背景",
      content: "",
      prompt: WORKFLOW_IMAGE_BACKGROUND_DEFAULT_PROMPT,
      mediaUrl: "",
      mediaRole: "generator",
      selectedOptionId: "reference-image",
      referenceImages: [LIBTV_DEFAULT_ORDINARY_IMAGE_URL],
      referenceImageNodeIds: [sourceNode.id],
    });
    moveWorkflowNode(generatorNode.id, {
      x: generatorX,
      y: generatorY,
      width: imageFrame.width,
      height: imageFrame.height,
    });
    selectLayer(generatorNode.id);
    setActiveWorkflowNode(generatorNode.id);
    window.setTimeout(() => {
      void flowRef.current?.fitView({
        nodes: [{ id: sourceNode.id }, { id: generatorNode.id }],
        padding: 0.38,
        duration: 420,
        maxZoom: 1,
      });
    }, 0);
    return generatorNode;
  }, [
    addWorkflowNode,
    getDefaultNodeTitle,
    moveWorkflowNode,
    selectLayer,
    setActiveWorkflowNode,
    updateWorkflowNode,
  ]);

  const createCharacterThreeViewStarterWorkflow = useCallback(() => {
    const sourceFrame = workflowMediaDisplayFrame(
      WORKFLOW_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE.width,
      WORKFLOW_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE.height,
    );
    const imageFrame = workflowNodeFrame("image");
    const gap = 140;
    const rect = containerRef.current?.getBoundingClientRect();
    const centerPoint = {
      x: rect ? rect.left + rect.width / 2 : 960,
      y: rect ? rect.top + rect.height / 2 : 540,
    };
    const flowCenter =
      flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
    const totalWidth = sourceFrame.width + imageFrame.width + gap;
    const sourceX = Math.round(Number(flowCenter.x || 0) - totalWidth / 2);
    const sourceY = Math.round(
      Number(flowCenter.y || 0) - sourceFrame.height / 2,
    );
    const generatorX = Math.round(sourceX + sourceFrame.width + gap);
    const generatorY = Math.round(
      Number(flowCenter.y || 0) - imageFrame.height / 2,
    );
    const sourceNode = addWorkflowNode("image", { x: sourceX, y: sourceY });
    updateWorkflowNode(sourceNode.id, {
      title: "人物参考图",
      content: "",
      prompt: "",
      mediaUrl: WORKFLOW_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_URL,
      workflowMediaNaturalWidth:
        WORKFLOW_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE.width,
      workflowMediaNaturalHeight:
        WORKFLOW_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE.height,
      workflowMediaUserResized: false,
      mediaRole: "ordinary",
      selectedOptionId: "custom",
      options: [],
    });
    moveWorkflowNode(sourceNode.id, {
      x: sourceX,
      y: sourceY,
      width: sourceFrame.width,
      height: sourceFrame.height,
    });

    const generatorNode = addWorkflowNode("image", {
      x: generatorX,
      y: generatorY,
      linkFromNodeId: sourceNode.id,
    });
    updateWorkflowNode(generatorNode.id, {
      title: "人物三视图",
      content: "",
      prompt: "",
      mediaUrl: "",
      mediaRole: "generator",
      selectedOptionId: "character-three-view",
      referenceImages: [WORKFLOW_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_URL],
      referenceImageNodeIds: [sourceNode.id],
      options: [],
    });
    moveWorkflowNode(generatorNode.id, {
      x: generatorX,
      y: generatorY,
      width: imageFrame.width,
      height: imageFrame.height,
    });
    selectLayer(generatorNode.id);
    setActiveWorkflowNode(generatorNode.id);
    window.setTimeout(() => {
      void flowRef.current?.fitView({
        nodes: [{ id: sourceNode.id }, { id: generatorNode.id }],
        padding: 0.38,
        duration: 420,
        maxZoom: 1,
      });
    }, 0);
    return generatorNode;
  }, [
    addWorkflowNode,
    moveWorkflowNode,
    selectLayer,
    setActiveWorkflowNode,
    updateWorkflowNode,
  ]);

  const createFirstFrameVideoStarterWorkflow = useCallback(() => {
    const imageFrame = workflowNodeFrame("image");
    const videoFrame = workflowVideoGeneratorFrame();
    const gap = 140;
    const rect = containerRef.current?.getBoundingClientRect();
    const centerPoint = {
      x: rect ? rect.left + rect.width / 2 : 960,
      y: rect ? rect.top + rect.height / 2 : 540,
    };
    const flowCenter =
      flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
    const totalWidth = imageFrame.width + gap + videoFrame.width;
    const imageX = Math.round(Number(flowCenter.x || 0) - totalWidth / 2);
    const imageY = Math.round(
      Number(flowCenter.y || 0) - imageFrame.height / 2,
    );
    const videoX = Math.round(imageX + imageFrame.width + gap);
    const videoY = Math.round(
      Number(flowCenter.y || 0) - videoFrame.height / 2,
    );

    const imageNode = addWorkflowNode("image", { x: imageX, y: imageY });
    updateWorkflowNode(imageNode.id, {
      title: getDefaultNodeTitle("image"),
      content: "",
      prompt: "",
      mediaUrl: LIBTV_DEFAULT_ORDINARY_IMAGE_URL,
      mediaRole: "ordinary",
      selectedOptionId: "custom",
      options: [],
    });
    moveWorkflowNode(imageNode.id, {
      x: imageX,
      y: imageY,
      width: imageFrame.width,
      height: imageFrame.height,
    });

    const videoNode = addWorkflowNode("video", {
      x: videoX,
      y: videoY,
      linkFromNodeId: imageNode.id,
    });
    updateWorkflowNode(videoNode.id, {
      title: "单帧视频方案",
      content: "",
      prompt: WORKFLOW_FIRST_FRAME_VIDEO_DEFAULT_PROMPT,
      mediaUrl: "",
      mediaRole: "generator",
      selectedOptionId: "first-frame-to-video",
      referenceImages: [LIBTV_DEFAULT_ORDINARY_IMAGE_URL],
      referenceImageNodeIds: [imageNode.id],
    });
    moveWorkflowNode(videoNode.id, {
      x: videoX,
      y: videoY,
      width: videoFrame.width,
      height: videoFrame.height,
    });
    selectLayer(videoNode.id);
    setActiveWorkflowNode(videoNode.id);
    window.setTimeout(() => {
      void flowRef.current?.fitView({
        nodes: [{ id: imageNode.id }, { id: videoNode.id }],
        padding: 0.38,
        duration: 420,
        maxZoom: 1,
      });
    }, 0);
    return videoNode;
  }, [
    addWorkflowNode,
    getDefaultNodeTitle,
    moveWorkflowNode,
    selectLayer,
    setActiveWorkflowNode,
    updateWorkflowNode,
  ]);

  const createAudioToVideoStarterWorkflow = useCallback(() => {
    const audioFrame = workflowNodeFrame("audio");
    const videoFrame = workflowVideoGeneratorFrame();
    const gap = 140;
    const rect = containerRef.current?.getBoundingClientRect();
    const centerPoint = {
      x: rect ? rect.left + rect.width / 2 : 960,
      y: rect ? rect.top + rect.height / 2 : 540,
    };
    const flowCenter =
      flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
    const totalWidth = audioFrame.width + gap + videoFrame.width;
    const audioX = Math.round(Number(flowCenter.x || 0) - totalWidth / 2);
    const audioY = Math.round(
      Number(flowCenter.y || 0) - audioFrame.height / 2,
    );
    const videoX = Math.round(audioX + audioFrame.width + gap);
    const videoY = Math.round(
      Number(flowCenter.y || 0) - videoFrame.height / 2,
    );

    const audioNode = addWorkflowNode("audio", { x: audioX, y: audioY });
    updateWorkflowNode(audioNode.id, {
      title: getDefaultNodeTitle("audio"),
      content: "",
      prompt: "",
      mediaUrl: "/audio/init_data.mp3",
      mediaRole: "ordinary",
      selectedOptionId: "custom",
      options: [],
    });
    moveWorkflowNode(audioNode.id, {
      x: audioX,
      y: audioY,
      width: audioFrame.width,
      height: audioFrame.height,
    });

    const videoNode = addWorkflowNode("video", {
      x: videoX,
      y: videoY,
      linkFromNodeId: audioNode.id,
    });
    updateWorkflowNode(videoNode.id, {
      title: "音频驱动视频",
      content: "",
      prompt: WORKFLOW_AUDIO_TO_VIDEO_DEFAULT_PROMPT,
      mediaUrl: "",
      mediaRole: "generator",
      selectedOptionId: "audio-to-video",
      options: [],
    });
    moveWorkflowNode(videoNode.id, {
      x: videoX,
      y: videoY,
      width: videoFrame.width,
      height: videoFrame.height,
    });
    selectLayer(videoNode.id);
    setActiveWorkflowNode(videoNode.id);
    window.setTimeout(() => {
      void flowRef.current?.fitView({
        nodes: [{ id: audioNode.id }, { id: videoNode.id }],
        padding: 0.38,
        duration: 420,
        maxZoom: 1,
      });
    }, 0);
    return videoNode;
  }, [
    addWorkflowNode,
    getDefaultNodeTitle,
    moveWorkflowNode,
    selectLayer,
    setActiveWorkflowNode,
    updateWorkflowNode,
  ]);

  const createStoryboardScriptV2StarterWorkflow = useCallback(() => {
    const textFrame = {
      width: WORKFLOW_TEXT_EDITOR_WIDTH,
      height: WORKFLOW_TEXT_EDITOR_HEIGHT,
    };
    const scriptFrame = workflowNodeFrame("script-v2");
    const gap = 140;
    const rect = containerRef.current?.getBoundingClientRect();
    const centerPoint = {
      x: rect ? rect.left + rect.width / 2 : 960,
      y: rect ? rect.top + rect.height / 2 : 540,
    };
    const flowCenter =
      flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
    const totalWidth = textFrame.width + gap + scriptFrame.width;
    const textX = Math.round(Number(flowCenter.x || 0) - totalWidth / 2);
    const textY = Math.round(Number(flowCenter.y || 0) - textFrame.height / 2);
    const scriptX = Math.round(textX + textFrame.width + gap);
    const scriptY = Math.round(
      Number(flowCenter.y || 0) - scriptFrame.height / 2,
    );

    const textNode = addWorkflowNode("text", { x: textX, y: textY });
    updateWorkflowNode(textNode.id, {
      title: "脚本输入",
      content: createWorkflowMarkdownTextContent(
        DEFAULT_STORYBOARD_SCRIPT_INPUT_TEXT,
      ),
      prompt: "",
      componentType: "text-editor",
      selectedOptionId: "custom",
      options: [],
    });
    moveWorkflowNode(textNode.id, {
      x: textX,
      y: textY,
      width: textFrame.width,
      height: textFrame.height,
    });

    const scriptNode = addWorkflowNode("script-v2", {
      x: scriptX,
      y: scriptY,
      linkFromNodeId: textNode.id,
    });
    updateWorkflowNode(scriptNode.id, {
      title: "脚本生成器",
      content: "",
      prompt:
        "根据左侧创作要求，生成一个画面非常好看、节奏抓人、可直接分镜和视频化制作的完整原创剧本",
      mediaUrl: "",
      mediaRole: "generator",
      selectedOptionId: "storyboard-script",
      options: [],
      componentType: "script-v2-generator",
    });
    moveWorkflowNode(scriptNode.id, {
      x: scriptX,
      y: scriptY,
      width: scriptFrame.width,
      height: scriptFrame.height,
    });
    selectLayer(scriptNode.id);
    setActiveWorkflowNode(scriptNode.id);
    window.setTimeout(() => {
      void flowRef.current?.fitView({
        nodes: [{ id: textNode.id }, { id: scriptNode.id }],
        padding: 0.38,
        duration: 420,
        maxZoom: 1,
      });
    }, 0);
    return scriptNode;
  }, [
    addWorkflowNode,
    moveWorkflowNode,
    selectLayer,
    setActiveWorkflowNode,
    updateWorkflowNode,
  ]);

  const handleAddNode = useCallback(
    (
      kind: LibTvWorkflowNodeKind,
      patch?: {
        title?: string;
        note?: string;
        x?: number;
        y?: number;
        linkFromNodeId?: string | null;
        linkToNodeId?: string | null;
      },
    ) => {
      if (
        (kind === "script" || kind === "script-v2") &&
        !patch &&
        nodes.length === 0
      ) {
        return createStoryboardScriptV2StarterWorkflow();
      }
      if (kind === "text" && !patch && nodes.length === 0) {
        return createTextToVideoStarterWorkflow();
      }
      if (kind === "image" && !patch && nodes.length === 0) {
        return createImageBackgroundStarterWorkflow();
      }
      if (kind === "video" && !patch && nodes.length === 0) {
        return createFirstFrameVideoStarterWorkflow();
      }
      if (kind === "audio" && !patch && nodes.length === 0) {
        return createAudioToVideoStarterWorkflow();
      }
      if (kind !== "playlist" && kind !== "threed") {
        return createWorkflowNode(kind, patch);
      }
      // The reference canvas creates the video-composition node immediately.
      // Its intro sheet is reserved for the 3D workspace and must not add an
      // extra click (or a persisted local-storage side effect) here.
      if (kind === "playlist") {
        return createWorkflowNode(kind, patch);
      }
      if (kind === "threed") {
        const dismissed =
          typeof window !== "undefined" &&
          window.localStorage.getItem(THREED_INTRO_DISMISSED_STORAGE_KEY) ===
            "1";
        if (dismissed) {
          return createWorkflowNode(kind, patch);
        }
        setPendingThreeDCreation({ patch });
        setThreeDIntroOpen(true);
        return null;
      }
      return createWorkflowNode(kind, patch);
    },
    [
      createAudioToVideoStarterWorkflow,
      createFirstFrameVideoStarterWorkflow,
      createImageBackgroundStarterWorkflow,
      createStoryboardScriptV2StarterWorkflow,
      createTextToVideoStarterWorkflow,
      createWorkflowNode,
      nodes.length,
    ],
  );

  const handleCreateEmptyStarter = useCallback(
    (starterId: WorkflowEmptyStarterId) => {
      if (starterId === "story-script") {
        createStoryboardScriptV2StarterWorkflow();
        return;
      }
      if (starterId === "character-three-view") {
        createCharacterThreeViewStarterWorkflow();
        return;
      }
      if (starterId === "first-frame-video") {
        createFirstFrameVideoStarterWorkflow();
        return;
      }
      createAudioToVideoStarterWorkflow();
    },
    [
      createAudioToVideoStarterWorkflow,
      createCharacterThreeViewStarterWorkflow,
      createFirstFrameVideoStarterWorkflow,
      createStoryboardScriptV2StarterWorkflow,
    ],
  );

  const handleContinuePlaylistIntro = useCallback(() => {
    const pending = pendingPlaylistCreation;
    if (playlistIntroDontShowAgain && typeof window !== "undefined") {
      window.localStorage.setItem(PLAYLIST_INTRO_DISMISSED_STORAGE_KEY, "1");
    }
    setPlaylistIntroOpen(false);
    setPendingPlaylistCreation(null);
    createWorkflowNode("playlist", pending?.patch);
  }, [createWorkflowNode, pendingPlaylistCreation, playlistIntroDontShowAgain]);

  const handleContinueThreeDIntro = useCallback(() => {
    const pending = pendingThreeDCreation;
    if (threeDIntroDontShowAgain && typeof window !== "undefined") {
      window.localStorage.setItem(THREED_INTRO_DISMISSED_STORAGE_KEY, "1");
    }
    setThreeDIntroOpen(false);
    setPendingThreeDCreation(null);
    createWorkflowNode("threed", pending?.patch);
  }, [createWorkflowNode, pendingThreeDCreation, threeDIntroDontShowAgain]);

  const handlePaneAddNode = useCallback(
    (kind: LibTvWorkflowNodeKind, position: { x: number; y: number }) => {
      const frame = workflowNodeFrame(kind);
      handleAddNode(kind, {
        x: Math.round(position.x - frame.width / 2),
        y: Math.round(position.y - frame.height / 2),
      });
    },
    [handleAddNode],
  );

  const getWorkflowChatPlaceholderBatch = useCallback(
    (
      layer: CanvasLayer,
      kind: "image" | "video",
      frame: { width: number; height: number },
    ) => {
      const prompt = String(layer.genPrompt || "").trim();
      const modelId = String(layer.genModel || "").trim();
      const batchKey = getWorkflowChatBatchKey(layer, kind);
      const now = Date.now();
      const current = workflowChatPlaceholderBatchesRef.current.get(batchKey);
      if (
        current &&
        now - current.createdAt < WORKFLOW_CHAT_PLACEHOLDER_BATCH_TTL_MS &&
        current.prompt === prompt &&
        current.modelId === modelId &&
        current.kind === kind
      ) {
        return current;
      }

      const bounds = getWorkflowVisibleBounds({
        flow: flowRef.current,
        container: containerRef.current,
      });
      const columns =
        bounds.width >= frame.width * 3 + WORKFLOW_CHAT_PLACEHOLDER_GAP * 2
          ? 3
          : bounds.width >= frame.width * 2 + WORKFLOW_CHAT_PLACEHOLDER_GAP
            ? 2
            : 1;
      const rowWidth = Math.min(
        bounds.width,
        frame.width * columns +
          WORKFLOW_CHAT_PLACEHOLDER_GAP * Math.max(0, columns - 1),
      );
      const startX = bounds.left + Math.max(0, (bounds.width - rowWidth) / 2);
      const startY =
        bounds.top + Math.max(0, (bounds.height - frame.height) / 2);
      const batch: WorkflowChatPlaceholderBatch = {
        key: batchKey,
        prompt,
        modelId,
        kind,
        createdAt: now,
        count: 0,
        cursorX: Math.round(startX),
        cursorY: Math.round(startY),
        rowHeight: 0,
        left: Math.round(bounds.left),
        right: Math.round(bounds.right),
        top: Math.round(bounds.top),
        bottom: Math.round(bounds.bottom),
      };
      workflowChatPlaceholderBatchesRef.current.set(batchKey, batch);
      return batch;
    },
    [],
  );

  const handlePanePaste = useCallback(
    async (position: { x: number; y: number }) => {
      try {
        const text = await navigator.clipboard?.readText?.();
        const trimmed = String(text || "").trim();
        if (!trimmed) {
          message.warning("剪贴板没有可粘贴内容");
          return;
        }
        try {
          const createdIds = pasteWorkflowNodeClipboardPayloadRef.current(
            trimmed,
            { position },
          );
          if (createdIds.length > 0) {
            message.success(
              createdIds.length > 1
                ? `已粘贴 ${createdIds.length} 个节点`
                : "已粘贴节点",
            );
            return;
          }
        } catch {
          // 不是工作流节点 payload 时继续按普通文本粘贴。
        }
        const node = handleAddNode("text", {
          x: Math.round(position.x - LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH / 2),
          y: Math.round(position.y - LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT / 2),
          note: "从剪贴板粘贴",
        });
        if (node) {
          updateWorkflowNode(node.id, { content: trimmed, prompt: trimmed });
        }
      } catch {
        message.warning("浏览器暂不允许读取剪贴板");
      }
    },
    [handleAddNode, updateWorkflowNode],
  );

  const handleCreateScriptInputNode = useCallback(
    (
      scriptNodeId: string,
      type: "story" | "video" | "character",
      initialContent?: string,
    ) => {
      const scriptNode = nodes.find(
        (node) => node.id === scriptNodeId && isWorkflowScriptKind(node.kind),
      );
      if (!scriptNode) return;
      const directIncomingNodes = edges
        .filter((edge) => edge.target === scriptNodeId)
        .map((edge) => nodes.find((node) => node.id === edge.source))
        .filter((node): node is LibTvWorkflowNode => Boolean(node));
      const sourceFrame = workflowNodeFrame(scriptNode.kind);
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(scriptNode.height || sourceFrame.height),
      );
      const gap = 240;

      if (type === "video") {
        const existingVideo = directIncomingNodes.find(
          (node) => node.kind === "video",
        );
        if (existingVideo) {
          selectLayer(existingVideo.id);
          setActiveWorkflowNode(existingVideo.id);
          return;
        }
        const videoFrame = workflowNodeFrame("video");
        const node = addWorkflowNode("video", {
          x: Number(scriptNode.x || 0) - videoFrame.width - gap,
          y: Number(scriptNode.y || 0) + (sourceHeight - videoFrame.height) / 2,
          linkToNodeId: scriptNodeId,
        });
        updateWorkflowNode(node.id, {
          title: getDefaultNodeTitle("video"),
          content: "",
          prompt: "",
          mediaUrl: WORKFLOW_SCRIPT_VIDEO_REFERENCE_URL,
          mediaRole: "ordinary",
          selectedOptionId: "custom",
          options: [],
        });
        selectLayer(node.id);
        setActiveWorkflowNode(node.id);
        return;
      }

      if (type === "character") {
        const existingImages = directIncomingNodes.filter(
          (node) => node.kind === "image",
        );
        if (existingImages.length > 0) {
          const target = existingImages[existingImages.length - 1];
          selectLayer(target.id);
          setActiveWorkflowNode(target.id);
          return;
        }
        const imageFrame = workflowNodeFrame("image");
        const verticalGap = 36;
        const baseX = Number(scriptNode.x || 0) - imageFrame.width - gap;
        const totalHeight = imageFrame.height * 2 + verticalGap;
        const baseY =
          Number(scriptNode.y || 0) + (sourceHeight - totalHeight) / 2;
        const createdNodes = [0, 1].map((index) => {
          const node = addWorkflowNode("image", {
            x: baseX,
            y: baseY + index * (imageFrame.height + verticalGap),
            linkToNodeId: scriptNodeId,
          });
          updateWorkflowNode(node.id, {
            title: `角色 ${index + 1}`,
            content: "",
            prompt: "",
            mediaUrl: LIBTV_DEFAULT_ORDINARY_IMAGE_URL,
            mediaRole: "ordinary",
            selectedOptionId: "custom",
            options: [],
          });
          attachWorkflowReferenceImage(
            scriptNodeId,
            node.id,
            LIBTV_DEFAULT_ORDINARY_IMAGE_URL,
          );
          return node;
        });
        const lastNode = createdNodes[createdNodes.length - 1];
        if (lastNode) {
          selectLayer(lastNode.id);
          setActiveWorkflowNode(lastNode.id);
        }
        return;
      }

      const existingText = directIncomingNodes.find(
        (node) => node.kind === "text",
      );
      if (existingText) {
        selectLayer(existingText.id);
        setActiveWorkflowNode(existingText.id);
        return;
      }
      const node = addWorkflowNode("text", {
        x: Number(scriptNode.x || 0) - WORKFLOW_TEXT_EDITOR_WIDTH - gap,
        y:
          Number(scriptNode.y || 0) +
          (sourceHeight - WORKFLOW_TEXT_EDITOR_HEIGHT) / 2,
        linkToNodeId: scriptNodeId,
      });
      updateWorkflowNode(node.id, {
        title: getDefaultNodeTitle("text"),
        content: createWorkflowTextEditorInitialContent(initialContent || ""),
        prompt: "",
        componentType: "text-editor",
        selectedOptionId: "custom",
        options: [],
      });
      moveWorkflowNode(node.id, {
        width: WORKFLOW_TEXT_EDITOR_WIDTH,
        height: WORKFLOW_TEXT_EDITOR_HEIGHT,
      });
      selectLayer(node.id);
      setActiveWorkflowNode(node.id);
    },
    [
      addWorkflowNode,
      attachWorkflowReferenceImage,
      edges,
      getDefaultNodeTitle,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleGenerateWorkflowNode = useCallback(
    async (
      nodeId: string,
      promptDraft?: string,
      submitSettings?: WorkflowGenerationSubmitSettings,
    ) => {
      // Canvas commands can update a node and run it before React publishes a
      // new callback closure. Read the store snapshot used by the native
      // canvas action so command-driven runs match a manual send exactly.
      const generationWorkflow = useCanvasStore.getState().libtvWorkflow;
      const generationNodes = generationWorkflow.nodes;
      const generationEdges = generationWorkflow.edges;
      const rawSourceNode = generationNodes.find((node) => node.id === nodeId);
      const sourceNode =
        rawSourceNode && submitSettings
          ? {
              ...rawSourceNode,
              data: { ...rawSourceNode.data, ...submitSettings },
            }
          : rawSourceNode;
      if (!sourceNode) return;
      const extraGenerationOptions = buildWorkflowExtraGenerationOptions(
        sourceNode.data?.workflowExtraParameters,
      );
      if (sourceNode.kind === "playlist") {
        const playlistExecution = resolveLibTvWorkflowPlaylistExecutionState(
          sourceNode,
          generationNodes,
          generationEdges,
        );
        const playlistItems = playlistExecution.items;
        if (!playlistItems.length) {
          const errorMessage = "请先连接已生成的视频节点";
          updateWorkflowNode(sourceNode.id, {
            playlistExportRunning: false,
            workflowGenerationRunning: false,
            workflowGenerationError: errorMessage,
            note: errorMessage,
          });
          message.warning(errorMessage);
          return false;
        }
        updateWorkflowNode(sourceNode.id, {
          playlistItems,
          playlistBackgroundAudioUrl: playlistExecution.backgroundAudioUrl,
          playlistBackgroundAudioNodeId:
            playlistExecution.backgroundAudioNodeId,
          playlistVoiceoverUrl: playlistExecution.voiceoverAudioUrl,
          playlistVoiceoverNodeId: playlistExecution.voiceoverAudioNodeId,
          playlistExportRunning: true,
          workflowGenerationRunning: true,
          workflowGenerationProgress: 0.08,
          workflowGenerationError: "",
          note: "正在合成视频",
        });
        try {
          const result = await requestWorkflowPlaylistExport({
            title: String(sourceNode.data?.title || "视频合成"),
            items: playlistItems,
            startSeconds: Number(sourceNode.data?.playlistTrimStart || 0),
            endSeconds:
              Number(sourceNode.data?.playlistTrimEnd || 0) || undefined,
            backgroundAudioUrl: playlistExecution.backgroundAudioUrl,
            backgroundAudioVolume:
              sourceNode.data?.playlistBackgroundAudioVolume,
            voiceoverAudioUrl: playlistExecution.voiceoverAudioUrl,
            voiceoverVolume: sourceNode.data?.playlistVoiceoverVolume,
            subtitles: sourceNode.data?.playlistSubtitles,
          });
          updateWorkflowNode(sourceNode.id, {
            playlistExportUrl: result.url,
            mediaUrl: "",
            playlistExportRunning: false,
            workflowGenerationRunning: false,
            workflowGenerationProgress: 1,
            workflowGenerationError: "",
            workflowMediaDurationSec: result.durationSeconds,
            workflowMediaNaturalWidth: result.width,
            workflowMediaNaturalHeight: result.height,
            note: "",
          });
          message.success("视频合成完成");
          return true;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "视频合成失败";
          updateWorkflowNode(sourceNode.id, {
            playlistExportRunning: false,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: errorMessage,
            note: errorMessage,
          });
          message.error(errorMessage);
          return false;
        }
      }
      const draftPrompt =
        typeof promptDraft === "string" ? promptDraft : undefined;
      const isImageGeneratorSource =
        (sourceNode.kind === "image" &&
          sourceNode.data?.mediaRole === "generator") ||
        isWorkflowImageGeneratorResultGroupNode(sourceNode);
      if (isImageGeneratorSource) {
        if (!projectId) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.error("项目未初始化，无法创建图片生成任务");
          return false;
        }
        const visiblePrompt = String(
          draftPrompt ??
            sourceNode.data?.prompt ??
            sourceNode.data?.content ??
            "",
        ).trim();
        const workflowInternalPrompt = String(
          sourceNode.data?.workflowInternalPrompt || "",
        ).trim();
        const generationPrompt = [workflowInternalPrompt, visiblePrompt]
          .filter(Boolean)
          .join("\n\n");
        const imageContext = buildImageGeneratorWorkflowContext(
          sourceNode,
          generationNodes,
          generationEdges,
        );
        const workflowGenerationCategory = String(
          sourceNode.data?.workflowGenerationCategory || "",
        ).trim();
        const angleEditControls =
          workflowGenerationCategory === "workflow_angle_edit" &&
          sourceNode.data?.workflowAngleEditControls &&
          typeof sourceNode.data.workflowAngleEditControls === "object" &&
          !Array.isArray(sourceNode.data.workflowAngleEditControls)
            ? (sourceNode.data
                .workflowAngleEditControls as WorkflowAngleEditCreateRequest["controls"])
            : null;
        const isAngleEditGenerator = Boolean(angleEditControls);
        const selectedImagePreset = getLibTvImagePresetById(
          sourceNode.data?.selectedOptionId,
        );
        const selectedImagePresetId = selectedImagePreset?.id || "";
        const selectedImagePresetLabel = selectedImagePreset?.label || "";
        if (
          selectedImagePreset?.forceReferenceImages &&
          imageContext.referenceImages.length === 0
        ) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先添加参考图");
          return false;
        }
        if (
          !generationPrompt &&
          imageContext.referenceImages.length === 0 &&
          imageContext.textBlocks.length === 0 &&
          !selectedImagePreset
        ) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先输入提示词或连接参考内容");
          return false;
        }
        const angleEditRoute = isAngleEditGenerator
          ? await resolveWorkflowImageToolRoute(
              String(sourceNode.data?.modelId || "").trim(),
            )
          : null;
        const modelId = angleEditRoute
          ? angleEditRoute.modelId
          : selectedImagePresetId === "panorama-720"
            ? "gpt-image-2"
            : String(sourceNode.data?.modelId || "").trim();
        if (!modelId) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先选择图片模型");
          return false;
        }
        const generationStartedAt = Date.now();
        updateWorkflowNode(sourceNode.id, {
          workflowGenerationRunning: true,
          workflowGenerationProgress: 0.03,
          workflowGenerationStartedAt: generationStartedAt,
          workflowGenerationError: "",
          workflowGenerationJobId: undefined,
          workflowGenerationTaskId: undefined,
          workflowGenerationTaskIds: [],
          workflowGenerationTaskType: undefined,
          workflowGenerationBaseUrl: undefined,
          workflowImageResults: undefined,
          workflowImageResultsCollapsed: true,
          note: WORKFLOW_IMAGE_GENERATING_NOTE,
          suppressGenerationBar: false,
        });

        const selectedModel = await resolveWorkflowModelOptionById(
          "image",
          modelId,
        );
        const supportsAspectRatio = workflowModelDeclaresOptions(
          selectedModel?.parameters?.aspectRatios,
        );
        const supportsImageSize = workflowModelDeclaresOptions(
          selectedModel?.parameters?.resolutions,
        );
        const aspectRatio =
          selectedImagePresetId === "panorama-720"
            ? "2:1"
            : supportsAspectRatio
              ? String(
                  sourceNode.data?.aspectRatio ||
                    selectedImagePreset?.defaultAspectRatio ||
                    "",
                ).trim()
              : "";
        const imageSize =
          selectedImagePresetId === "panorama-720"
            ? String(
                sourceNode.data?.imageSize ||
                  selectedImagePreset?.defaultImageSize ||
                  "2K",
              ).trim()
            : supportsImageSize
              ? String(
                  sourceNode.data?.imageSize ||
                    selectedImagePreset?.defaultImageSize ||
                    "",
                ).trim()
              : "";
        const generationCount = Math.max(
          1,
          Math.min(
            8,
            Math.round(Number(sourceNode.data?.generationCount || 1) || 1),
          ),
        );
        const stylePreset = selectedImagePreset
          ? ""
          : String(sourceNode.data?.stylePreset || "").trim();
        const webSearchEnabled = sourceNode.data?.enableWebSearch === true;
        const portraitTextureSettings =
          selectedImagePresetId === "portrait_texture_adjustment"
            ? {
                sceneFusion:
                  String(
                    sourceNode.data?.workflowPortraitTextureSettings
                      ?.sceneFusion || "自然融合",
                  ).trim() || "自然融合",
                lightingFusion:
                  String(
                    sourceNode.data?.workflowPortraitTextureSettings
                      ?.lightingFusion || "自然匹配",
                  ).trim() || "自然匹配",
                skin:
                  String(
                    sourceNode.data?.workflowPortraitTextureSettings?.skin ||
                      "自然肤质",
                  ).trim() || "自然肤质",
                texture:
                  String(
                    sourceNode.data?.workflowPortraitTextureSettings?.texture ||
                      "自然纹理",
                  ).trim() || "自然纹理",
                sharpness:
                  String(
                    sourceNode.data?.workflowPortraitTextureSettings
                      ?.sharpness || "标准清晰",
                  ).trim() || "标准清晰",
              }
            : null;
        const presetUserPrompt = buildImageGeneratorPrompt(
          generationPrompt ||
            (selectedImagePreset
              ? selectedImagePreset.description
              : "请基于上游输入和参考图生成图片。"),
          imageContext,
          sourceNode.data?.cameraControl,
          "",
        );
        const presetPromptWithSettings =
          selectedImagePresetId === "portrait_texture_adjustment"
            ? `${presetUserPrompt}\n\n人像质感调节参数：${buildWorkflowPortraitTextureSettingsPrompt(portraitTextureSettings || undefined)}。`
            : presetUserPrompt;
        const finalPrompt = selectedImagePreset
          ? buildLibTvImagePresetPrompt({
              presetId: selectedImagePreset.id,
              userPrompt: presetPromptWithSettings,
              referenceImageCount: imageContext.referenceImages.length,
            })
          : buildImageGeneratorPrompt(
              generationPrompt || "请基于上游输入和参考图生成图片。",
              imageContext,
              sourceNode.data?.cameraControl,
              stylePreset,
            );
        const finalGenerationPrompt =
          isAngleEditGenerator && angleEditControls
            ? buildWorkflowAngleEditQwenPrompt(angleEditControls)
            : finalPrompt;

        let createdJob: Awaited<
          ReturnType<typeof createWorkflowCanvasBackendJob>
        >;
        activeImageGenerationNodeIdsRef.current.add(sourceNode.id);
        try {
          const referenceImages = await Promise.all(
            imageContext.referenceImages.map((url) =>
              resolveWorkflowApiImageSource(url).catch(() =>
                String(url || "").trim(),
              ),
            ),
          );
          const filteredReferenceImages = referenceImages.filter(Boolean);
          createdJob = await createWorkflowCanvasBackendJob({
            projectId,
            kind: "image_generate",
            request:
              isAngleEditGenerator && angleEditControls
                ? {
                    ...extraGenerationOptions,
                    prompt: finalGenerationPrompt,
                    rawPrompt: visiblePrompt,
                    workflowInternalPrompt: workflowInternalPrompt || undefined,
                    model: modelId,
                    modelId,
                    workflowEndpointMethod: angleEditRoute?.methodId,
                    mode: angleEditRoute?.methodId,
                    ...(aspectRatio ? { aspectRatio } : {}),
                    ...(imageSize ? { imageSize } : {}),
                    count: 1,
                    n: 1,
                    forceSingle: true,
                    referenceImages: filteredReferenceImages,
                    images: filteredReferenceImages,
                    seed: -1,
                    category: "workflow_angle_edit",
                    workflowNodeId: sourceNode.id,
                    upstreamNodes: imageContext.upstreamMedia,
                    upstreamTextBlocks: imageContext.textBlocks,
                    angleControls: angleEditControls,
                  }
                : {
                    ...extraGenerationOptions,
                    prompt: finalGenerationPrompt,
                    rawPrompt: visiblePrompt,
                    workflowInternalPrompt: workflowInternalPrompt || undefined,
                    model: modelId,
                    workflowEndpointMethod:
                      sourceNode.data?.workflowEndpointMethod,
                    ...(aspectRatio ? { aspectRatio } : {}),
                    ...(imageSize ? { imageSize } : {}),
                    count: generationCount,
                    referenceImages: filteredReferenceImages,
                    workflowNodeId: sourceNode.id,
                    upstreamNodes: imageContext.upstreamMedia,
                    upstreamTextBlocks: imageContext.textBlocks,
                    cameraControl: sourceNode.data?.cameraControl,
                    stylePreset: stylePreset || undefined,
                    ...(portraitTextureSettings
                      ? {
                          workflowPortraitTextureSettings:
                            portraitTextureSettings,
                          portraitTextureSettings,
                          portraitTextureSettingsPrompt:
                            buildWorkflowPortraitTextureSettingsPrompt(
                              portraitTextureSettings,
                            ),
                        }
                      : {}),
                    tools: webSearchEnabled
                      ? [{ type: "web_search" }]
                      : undefined,
                    payload: webSearchEnabled
                      ? JSON.stringify({
                          google_search: true,
                          google_image_search: true,
                        })
                      : undefined,
                    projectId,
                    category: selectedImagePreset
                      ? "workflow_image_preset"
                      : "workflow_image_generation",
                    ...(selectedImagePreset
                      ? {
                          presetId: selectedImagePresetId,
                          presetLabel: selectedImagePresetLabel,
                          workflowImagePreset: selectedImagePresetId,
                        }
                      : {}),
                  },
            onImagePredictionSubmitted: (event) => {
              if (!event.id) return;
              activeImageGenerationTaskIdsRef.current.add(event.id);
              const currentNode = useCanvasStore
                .getState()
                .libtvWorkflow.nodes.find(
                  (node: LibTvWorkflowNode) => node.id === sourceNode.id,
                );
              const taskIds = Array.from(
                new Set(
                  [
                    ...(Array.isArray(
                      currentNode?.data?.workflowGenerationTaskIds,
                    )
                      ? currentNode.data.workflowGenerationTaskIds
                      : []),
                    event.id,
                  ]
                    .map((id) => String(id || "").trim())
                    .filter(Boolean),
                ),
              );
              updateWorkflowNode(sourceNode.id, {
                workflowGenerationTaskId: event.id,
                workflowGenerationTaskIds: taskIds,
                workflowGenerationTaskType: "wavespeed-compatible-image",
                workflowGenerationBaseUrl: event.baseUrl,
                workflowGenerationRunning: true,
                workflowGenerationProgress: Math.max(
                  0.04,
                  Math.min(0.18, taskIds.length / Math.max(1, event.total) / 5),
                ),
                note: WORKFLOW_IMAGE_GENERATING_NOTE,
              });
            },
            onImagePredictionCompleted: (event) => {
              if (event.id) {
                activeImageGenerationTaskIdsRef.current.delete(event.id);
              }
              const currentNode = useCanvasStore
                .getState()
                .libtvWorkflow.nodes.find(
                  (node: LibTvWorkflowNode) => node.id === sourceNode.id,
                );
              const existingResults = Array.isArray(
                currentNode?.data?.workflowImageResults,
              )
                ? currentNode.data.workflowImageResults
                : [];
              const knownUrls = new Set(
                existingResults.map((item) => String(item.url || "").trim()),
              );
              const nextResults = [...existingResults];
              event.urls.forEach((url) => {
                if (!url || knownUrls.has(url)) return;
                knownUrls.add(url);
                nextResults.push({
                  url,
                  title: "图片 " + (nextResults.length + 1),
                });
              });
              updateWorkflowNode(sourceNode.id, {
                workflowImageResults:
                  nextResults.length > 0 ? nextResults : undefined,
                workflowGenerationRunning: true,
                workflowGenerationProgress: Math.min(
                  0.98,
                  Math.max(
                    0.18,
                    nextResults.length / Math.max(1, generationCount),
                  ),
                ),
                note: WORKFLOW_IMAGE_GENERATING_NOTE,
              });
            },
          });
          activeImageGenerationNodeIdsRef.current.delete(sourceNode.id);
          prepareWorkflowImageGenerationPlaceholder(
            sourceNode,
            aspectRatio || "16:9",
            generationCount,
          );
          updateWorkflowNode(sourceNode.id, {
            workflowGenerationRunning: true,
            workflowGenerationJobId: createdJob.id.startsWith("local-image-")
              ? undefined
              : createdJob.id,
            workflowGenerationCategory: isAngleEditGenerator
              ? "workflow_angle_edit"
              : sourceNode.data?.workflowGenerationCategory,
            workflowGenerationStartedAt: generationStartedAt,
            workflowGenerationProgress: Number.isFinite(
              Number(createdJob.resultData?.progress),
            )
              ? Math.max(
                  0,
                  Math.min(0.99, Number(createdJob.resultData?.progress)),
                )
              : 0,
            note: normalizeWorkflowImageGeneratingNote(
              createdJob.resultData?.message,
            ),
            suppressGenerationBar: false,
          });
        } catch (error) {
          activeImageGenerationNodeIdsRef.current.delete(sourceNode.id);
          const currentTaskIds = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.find(
              (node: LibTvWorkflowNode) => node.id === sourceNode.id,
            )?.data?.workflowGenerationTaskIds;
          if (Array.isArray(currentTaskIds)) {
            currentTaskIds.forEach((id) =>
              activeImageGenerationTaskIdsRef.current.delete(String(id || "")),
            );
          }
          const messageText =
            error instanceof Error ? error.message : "图片生成失败";
          updateWorkflowNode(sourceNode.id, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: false,
          });
          message.error(messageText);
          console.error("[LibTvWorkflowCanvas] image generation failed", error);
          return false;
        }

        void (async () => {
          try {
            const completedJob = await waitWorkflowCanvasBackendJob({
              jobId: createdJob.id,
              maxAttempts: 360,
              onProgress: (job) => {
                const progressLabel = String(
                  job.resultData?.message || "",
                ).trim();
                updateWorkflowNode(sourceNode.id, {
                  workflowGenerationJobId: job.id.startsWith("local-image-")
                    ? undefined
                    : job.id,
                  workflowGenerationRunning: true,
                  workflowGenerationProgress: Number.isFinite(
                    Number(job.resultData?.progress),
                  )
                    ? Math.max(
                        0,
                        Math.min(0.99, Number(job.resultData?.progress)),
                      )
                    : undefined,
                  note: normalizeWorkflowImageGeneratingNote(progressLabel),
                });
              },
            });
            const resultUrls = collectWorkflowCanvasJobResultUrls(
              completedJob.resultData?.response || completedJob.resultUrl,
            );
            const fallbackResultUrl =
              resolveWorkflowCanvasBackendJobResultUrl(completedJob);
            const finalResultUrls =
              resultUrls.length > 0
                ? resultUrls
                : fallbackResultUrl
                  ? [fallbackResultUrl]
                  : [];
            if (finalResultUrls.length === 0)
              throw new Error("图片生成未返回结果");
            const imageItems = await Promise.all(
              finalResultUrls.map(async (url, index) => {
                const size = await readWorkflowImageUrlSize(url).catch(() => ({
                  width: 16,
                  height: 9,
                }));
                return {
                  url,
                  width: size.width,
                  height: size.height,
                  title: `图片 ${index + 1}`,
                };
              }),
            );
            if (imageItems.length <= 1 && sourceNode.kind === "image") {
              const resultUrl = imageItems[0]?.url;
              const resultSize = imageItems[0];
              if (!resultUrl) throw new Error("图片生成未返回结果");
              updateWorkflowNode(sourceNode.id, {
                mediaUrl: resultUrl,
                mediaRole: "generator",
                ...getWorkflowMediaNaturalSizePatch(resultSize),
                workflowMediaUserResized: false,
                prompt: visiblePrompt,
                workflowInternalPrompt: workflowInternalPrompt || undefined,
                content: "",
                note: "",
                workflowGenerationRunning: false,
                workflowGenerationCategory: isAngleEditGenerator
                  ? "workflow_angle_edit"
                  : sourceNode.data?.workflowGenerationCategory,
                workflowGenerationProgress: undefined,
                workflowGenerationError: "",
                workflowGenerationJobId: completedJob.id.startsWith(
                  "local-image-",
                )
                  ? undefined
                  : completedJob.id,
                workflowGenerationResultIndex: 0,
                suppressGenerationBar: false,
                selectedOptionId:
                  selectedImagePresetId || sourceNode.data?.selectedOptionId,
              });
              applyWorkflowImageUrlNodeFrame(
                moveWorkflowNode,
                sourceNode.id,
                resultUrl,
                undefined,
                (size) => {
                  updateWorkflowNode(
                    sourceNode.id,
                    getWorkflowMediaNaturalSizePatch(size),
                  );
                },
                () => shouldApplyAutoMediaFrame(sourceNode.id, resultUrl),
              );
            } else {
              replaceWorkflowNodeWithImageGroup(sourceNode.id, imageItems, {
                title:
                  String(sourceNode.data?.title || "图片生成器").trim() ||
                  "图片生成器",
                prompt: visiblePrompt,
                aspectRatio,
                imageSize,
                generationCount,
                jobId: completedJob.id.startsWith("local-image-")
                  ? undefined
                  : completedJob.id,
                selectedOptionId:
                  selectedImagePresetId || sourceNode.data?.selectedOptionId,
              });
            }
          } catch (error) {
            const messageText =
              error instanceof Error ? error.message : "图片生成失败";
            updateWorkflowNode(sourceNode.id, {
              note: messageText,
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: messageText,
              suppressGenerationBar: false,
            });
            message.error(messageText);
            console.error(
              "[LibTvWorkflowCanvas] image generation failed",
              error,
            );
          }
        })();
        return true;
      }
      if (
        sourceNode.kind === "video" &&
        (sourceNode.data?.mediaRole === "generator" ||
          sourceNode.data?.componentType === "video-generator")
      ) {
        if (!projectId) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.error("项目未初始化，无法创建视频生成任务");
          return;
        }
        const prompt = String(
          draftPrompt ??
            sourceNode.data?.prompt ??
            sourceNode.data?.content ??
            "",
        ).trim();
        const videoContext = buildVideoGeneratorWorkflowContext(
          sourceNode,
          generationNodes,
          generationEdges,
        );
        const upstreamScriptNodes = collectVideoGeneratorUpstreamScriptNodes(
          sourceNode,
          generationNodes,
          generationEdges,
        );
        if (
          !prompt &&
          videoContext.mentionOptions.length === 0 &&
          videoContext.textBlocks.length === 0 &&
          upstreamScriptNodes.length === 0
        ) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先输入提示词，或连接/上传图片、视频、音频素材");
          return;
        }
        const modelId = String(sourceNode.data?.modelId || "").trim();
        if (!modelId) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先选择视频模型");
          return;
        }
        const selectedVideoModel = await resolveWorkflowModelOptionById(
          "video",
          modelId,
        );
        if (!selectedVideoModel) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("当前视频模型不可用，请重新选择");
          return;
        }
        const modelProviderKey = String(
          selectedVideoModel.providerKey ||
            parseModelRuntimeId(modelId).providerKey ||
            "",
        ).trim();
        if (!modelProviderKey) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("当前视频节点缺少供应商，请重新选择一次视频模型");
          return;
        }

        const videoInputCounts = {
          images: videoContext.mentionOptions.filter(
            (option) => option.kind === "image",
          ).length,
          videos: videoContext.mentionOptions.filter(
            (option) => option.kind === "video",
          ).length,
          audios: videoContext.mentionOptions.filter(
            (option) => option.kind === "audio",
          ).length,
          scriptImages: upstreamScriptNodes.length > 0 ? 1 : 0,
        };
        const workflowEndpointMethod = await resolveWorkflowVideoMethodForModel(
          modelId,
          String(sourceNode.data?.videoMethod || "").trim(),
          videoInputCounts,
        );
        const videoMethods =
          selectedVideoModel.parameters?.methods ||
          selectedVideoModel.parameters?.modes ||
          [];
        if (videoMethods.length > 0 && !workflowEndpointMethod) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("当前素材与所选视频模式不兼容，请重新选择模式");
          return;
        }
        const endpointSelection = resolveWorkflowVideoEndpointSelection({
          model: selectedVideoModel,
          methodId: workflowEndpointMethod,
          aspectRatio: sourceNode.data?.aspectRatio,
          resolution:
            sourceNode.data?.videoResolution || sourceNode.data?.imageSize,
          duration: sourceNode.data?.videoDuration,
          generationCount: sourceNode.data?.generationCount,
          generateAudio: sourceNode.data?.generateAudio,
          enableWebSearch: sourceNode.data?.enableWebSearch,
        });
        const aspectRatio = endpointSelection.aspectRatio || "";
        const videoResolution = endpointSelection.resolution || "";
        const videoDuration = endpointSelection.duration || "";
        const durationSeconds = videoDuration
          ? parseWorkflowDurationSeconds(videoDuration, 0)
          : 0;
        const requestedGenerationCount = endpointSelection.generationCount;
        const generationCount = requestedGenerationCount || 1;
        const generateAudio = endpointSelection.generateAudio;
        const enableWebSearch = endpointSelection.enableWebSearch;
        const method = endpointSelection.routeMode || undefined;
        const videoExtraParameterDefinitions =
          normalizeWorkflowExtraParameterDefinitions(
            selectedVideoModel.parameters?.extraParameters,
            workflowEndpointMethod,
          );
        const resolvedVideoExtraParameters =
          resolveWorkflowExtraParameterValues(
            videoExtraParameterDefinitions,
            sourceNode.data?.workflowExtraParameters,
            { fillDefaults: true },
          );
        const videoExtraGenerationOptions = buildWorkflowExtraGenerationOptions(
          resolvedVideoExtraParameters,
        );
        const selectedCameraMotion = sourceNode.data?.videoCameraMotion;
        const scriptSourceNode = upstreamScriptNodes[0];
        const scriptResult = scriptSourceNode?.data?.scriptResult || null;
        if (scriptSourceNode && scriptResult?.rows?.length) {
          const storyboardRows = scriptResult.rows
            .map((row, rowIndex) => ({ row, rowIndex }))
            .filter((item) => Boolean(item.row));
          if (storyboardRows.length === 0) {
            updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
            message.warning("脚本里没有可生成的视频分镜");
            return;
          }

          const ratioSize = parseWorkflowAspectRatioSize(aspectRatio, 16, 9);
          const cellWidth = Math.max(
            220,
            Math.round(
              (LIBTV_TAPNOW_VIDEO_HEIGHT * ratioSize.width) /
                Math.max(1, ratioSize.height),
            ),
          );
          const cellHeight = Math.max(124, LIBTV_TAPNOW_VIDEO_HEIGHT);
          const columns = Math.max(
            1,
            Math.ceil(Math.sqrt(storyboardRows.length)),
          );
          const gap = 12;
          const rowsCount = Math.ceil(storyboardRows.length / columns);
          const groupWidth = Math.max(
            360,
            columns * cellWidth + Math.max(0, columns - 1) * gap + 56,
          );
          const groupHeight = Math.max(
            260,
            rowsCount * cellHeight + Math.max(0, rowsCount - 1) * gap + 56,
          );
          const sourceFrame = workflowNodeFrame(sourceNode.kind);
          const sourceWidth = Math.max(
            sourceFrame.width,
            Number(sourceNode.width || sourceFrame.width),
          );
          const outputGroup = addWorkflowNode("group", {
            x: Number(sourceNode.x || 0) + sourceWidth + 96,
            y: Number(sourceNode.y || 0),
            linkFromNodeId: sourceNode.id,
            linkToNodeId: null,
          });
          moveWorkflowNode(outputGroup.id, {
            width: groupWidth,
            height: groupHeight,
          });

          const videoChildren = storyboardRows.map((item, index) => {
            const column = index % columns;
            const rowIndexInGrid = Math.floor(index / columns);
            const childX = 28 + column * (cellWidth + gap);
            const childY = 44 + rowIndexInGrid * (cellHeight + gap);
            const child = addWorkflowNode("video", {
              x: childX,
              y: childY,
              linkFromNodeId: null,
              linkToNodeId: null,
            });
            const promptForRow = buildWorkflowScriptRowVideoPrompt(
              scriptResult,
              item.row,
              item.rowIndex,
              prompt,
            );
            const rowDuration =
              durationSeconds > 0
                ? durationSeconds
                : parseWorkflowDurationSeconds(item.row.duration, 1);
            const referenceImages = collectWorkflowScriptRowReferenceImages(
              item.row,
            );
            moveWorkflowNode(child.id, {
              x: childX,
              y: childY,
              width: cellWidth,
              height: cellHeight,
            });
            updateWorkflowNode(child.id, {
              title: `分镜 ${String(item.row.shotNumber || item.rowIndex + 1).trim()} 视频`,
              mediaUrl: "",
              mediaRole: "ordinary",
              content: "",
              prompt: promptForRow,
              modelId,
              aspectRatio: aspectRatio || undefined,
              videoResolution: videoResolution || undefined,
              videoDuration: videoDuration || undefined,
              videoMethod: workflowEndpointMethod || undefined,
              generationCount: requestedGenerationCount,
              generateAudio,
              enableWebSearch,
              workflowExtraParameters:
                Object.keys(resolvedVideoExtraParameters).length > 0
                  ? resolvedVideoExtraParameters
                  : undefined,
              referenceImages,
              workflowGenerationResultIndex: index,
              videoCameraMotion: selectedCameraMotion,
              videoCharacterAssets: sourceNode.data?.videoCharacterAssets,
              workflowStoryboardSourceRowIndex: item.rowIndex,
              workflowStoryboardSourceNodeId: scriptSourceNode.id,
              workflowStoryboardDuration: `${Math.round(rowDuration)}s`,
              workflowStoryboardVideoSegmentIndex: index,
              workflowStoryboardVideoSegmentCount: storyboardRows.length,
              workflowGenerationRunning: true,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              note: WORKFLOW_VIDEO_GENERATING_NOTE,
            } as any);
            return {
              id: child.id,
              row: item.row,
              rowIndex: item.rowIndex,
              prompt: promptForRow,
              duration: Math.max(1, rowDuration),
              referenceImages,
            };
          });

          updateWorkflowNode(outputGroup.id, {
            title: `${String(scriptResult.title || scriptSourceNode.data?.title || "分镜").trim()} 视频`,
            content: "",
            prompt,
            mediaUrl: "",
            mediaRole: undefined,
            selectedOptionId: "custom",
            options: [],
            groupNodeIds: videoChildren.map((node) => node.id),
            groupBackgroundColor: "transparent",
            groupRunning: true,
            note: `正在生成视频 0/${videoChildren.length}`,
          });
          updateWorkflowNode(sourceNode.id, {
            prompt,
            mediaRole: "generator",
            note: `正在按脚本生成视频 0/${videoChildren.length}`,
            workflowGenerationRunning: true,
            workflowGenerationProgress: 0.03,
            workflowGenerationError: "",
            suppressGenerationBar: false,
          });
          useCanvasStore.setState(
            (state: ReturnType<typeof useCanvasStore.getState>) => ({
              libtvWorkflow: {
                ...state.libtvWorkflow,
                activeNodeId: outputGroup.id,
                nodes: [
                  ...state.libtvWorkflow.nodes.filter(
                    (node: LibTvWorkflowNode) => node.id === outputGroup.id,
                  ),
                  ...state.libtvWorkflow.nodes
                    .filter(
                      (node: LibTvWorkflowNode) => node.id !== outputGroup.id,
                    )
                    .map((node: LibTvWorkflowNode) =>
                      videoChildren.some((child) => child.id === node.id)
                        ? { ...node, parentId: outputGroup.id }
                        : node,
                    ),
                ],
              },
              selectedIds: [outputGroup.id],
            }),
          );
          selectLayer(outputGroup.id);
          setActiveWorkflowNode(outputGroup.id);

          void (async () => {
            let completedCount = 0;
            const generatedVideos: Array<{ rowIndex: number; url: string }> =
              [];
            const generateOneScriptClip = async (
              child: (typeof videoChildren)[number],
            ) => {
              let resultUrl = "";
              let resultThumbnailUrl = "";
              const resultUrls: string[] = [];
              const resultThumbnailUrls: string[] = [];
              const appendResultUrls = (urls: string[]) => {
                urls.forEach((url) => {
                  const normalizedUrl = String(url || "").trim();
                  if (!normalizedUrl || resultUrls.includes(normalizedUrl))
                    return;
                  resultUrls.push(normalizedUrl);
                  if (!resultUrl) resultUrl = normalizedUrl;
                });
              };
              const appendResultThumbnailUrls = (urls: string[]) => {
                urls.forEach((url) => {
                  const normalizedUrl = String(url || "").trim();
                  if (
                    !normalizedUrl ||
                    resultThumbnailUrls.includes(normalizedUrl)
                  )
                    return;
                  resultThumbnailUrls.push(normalizedUrl);
                  if (!resultThumbnailUrl) resultThumbnailUrl = normalizedUrl;
                });
              };
              let resultTaskId = "";
              const resultTaskIds: string[] = [];
              let resultTaskType = "";
              let resultProviderKey = "";
              let resultBaseUrl = "";
              let resultStatusUrl = "";
              let resultBackgroundTaskId = "";
              const apiReferenceImages = await Promise.all(
                child.referenceImages.map((url) =>
                  resolveWorkflowApiMediaSource(url, "image").catch(() =>
                    String(url || "").trim(),
                  ),
                ),
              );
              const cleanReferenceImages = apiReferenceImages.filter(Boolean);
              const clipReferenceImages = cleanReferenceImages.filter(
                (url) => !/^asset:\/\//i.test(url),
              );
              updateWorkflowNode(child.id, {
                note: WORKFLOW_VIDEO_GENERATING_NOTE,
                workflowGenerationRunning: true,
                workflowGenerationProgress: undefined,
                workflowGenerationError: "",
                workflowGenerationTaskId: undefined,
                workflowGenerationTaskIds: [],
                workflowGenerationTaskType: undefined,
                workflowGenerationBaseUrl: undefined,
              });
              await runWorkflowVideoRuntime(
                {
                  ...videoExtraGenerationOptions,
                  message: child.prompt,
                  modelId,
                  providerKey: modelProviderKey,
                  ...(durationSeconds > 0
                    ? { duration: Math.round(child.duration) }
                    : {}),
                  ...(videoResolution ? { resolution: videoResolution } : {}),
                  ...(aspectRatio ? { aspectRatio } : {}),
                  ...(requestedGenerationCount
                    ? { count: requestedGenerationCount }
                    : {}),
                  method,
                  images: clipReferenceImages,
                  tools: enableWebSearch ? [{ type: "web_search" }] : undefined,
                  generateAudio,
                  audioEnabled: generateAudio,
                  cameraMotion: selectedCameraMotion,
                  projectId,
                  canvasId: workflowCanvasId,
                  canvasName: workflowCanvasName,
                  locale: "zh-CN",
                  workflowEndpointMethod: workflowEndpointMethod || undefined,
                },
                (event) => {
                  if (event?.type === "error")
                    throw new Error(String(event.message || "视频生成失败"));
                  if (event?.type === "step" && event?.status === "error")
                    throw new Error(
                      String(event.content || event.message || "视频生成失败"),
                    );
                  appendResultUrls(collectWorkflowVideoUrls(event));
                  appendResultThumbnailUrls(
                    collectWorkflowVideoPosterUrls(event),
                  );
                  const eventTaskIds = resolveWorkflowPredictionTaskIds({
                    taskIds: event?.taskIds,
                    taskId: event?.taskId,
                  });
                  eventTaskIds.forEach((taskId) => {
                    if (!resultTaskIds.includes(taskId)) {
                      resultTaskIds.push(taskId);
                    }
                    activeVideoGenerationTaskIdsRef.current.add(taskId);
                  });
                  if (eventTaskIds.length > 0) {
                    resultTaskId = eventTaskIds[eventTaskIds.length - 1];
                  }
                  if (event?.baseUrl)
                    resultBaseUrl = String(event.baseUrl).trim();
                  if ((event as any)?.providerKey || (event as any)?.provider)
                    resultProviderKey = String(
                      (event as any).providerKey || (event as any).provider,
                    );
                  if (event?.taskType)
                    resultTaskType = resolveUnifiedProviderTaskType({
                      taskType: event.taskType,
                      modelId,
                      providerKey: resultProviderKey,
                    });
                  if (event?.statusUrl)
                    resultStatusUrl = String(event.statusUrl);
                  if (event?.backgroundTaskId)
                    resultBackgroundTaskId = String(event.backgroundTaskId);
                  const label = String(
                    event?.content || event?.message || "",
                  ).trim();
                  if (
                    label ||
                    resultTaskId ||
                    resultTaskType ||
                    resultBackgroundTaskId
                  ) {
                    updateWorkflowNode(child.id, {
                      note: normalizeWorkflowVideoGeneratingNote(label),
                      workflowGenerationRunning: true,
                      workflowGenerationTaskId: resultTaskId || undefined,
                      workflowGenerationTaskIds: resultTaskIds,
                      workflowGenerationTaskType: resultTaskType || undefined,
                      workflowGenerationBaseUrl: resultBaseUrl || undefined,
                      workflowGenerationProviderKey:
                        resultProviderKey || undefined,
                      workflowGenerationStatusUrl: resultStatusUrl || undefined,
                      workflowGenerationBackgroundTaskId:
                        resultBackgroundTaskId || undefined,
                    } as any);
                  }
                },
              );

              if (
                resultTaskId &&
                !isWorkflowPredictionTaskType(resultTaskType, "video") &&
                resultUrls.length < generationCount
              ) {
                updateWorkflowNode(child.id, {
                  note: WORKFLOW_VIDEO_GENERATING_NOTE,
                  workflowGenerationRunning: true,
                  workflowGenerationTaskId: resultTaskId,
                  workflowGenerationTaskIds: resultTaskIds,
                  workflowGenerationTaskType: resultTaskType || undefined,
                  workflowGenerationBaseUrl: resultBaseUrl || undefined,
                  workflowGenerationProviderKey: resultProviderKey || undefined,
                  workflowGenerationStatusUrl: resultStatusUrl || undefined,
                  workflowGenerationBackgroundTaskId:
                    resultBackgroundTaskId || undefined,
                } as any);
                const isSeedanceBackgroundTask = isOfficialSeedanceTaskContext({
                  taskType: resultTaskType,
                  providerKey: resultProviderKey,
                });
                const pollIntervalMs = resolveProviderVideoPollIntervalMs({
                  taskType: resultTaskType,
                  providerKey: resultProviderKey,
                  fallbackMs: 2500,
                });
                const pollResult = await pollUnifiedVideoTaskUntilTerminal({
                  intervalMs: pollIntervalMs,
                  initialDelay: true,
                  query: () =>
                    queryUnifiedVideoTaskStatus({
                      providerTaskId: resultTaskId,
                      taskType: resultTaskType,
                      statusUrl: resultStatusUrl || undefined,
                      modelId,
                      providerKey: resultProviderKey || undefined,
                      seedanceJobId: isSeedanceBackgroundTask
                        ? resultBackgroundTaskId
                        : "",
                      projectId,
                      persistVideo: true,
                    }),
                  onResult: (nextResult) => {
                    if (typeof nextResult.progress !== "number") return;
                    updateWorkflowNode(child.id, {
                      note: WORKFLOW_VIDEO_GENERATING_NOTE,
                      workflowGenerationRunning: true,
                      workflowGenerationProgress: Math.max(
                        0,
                        Math.min(0.98, nextResult.progress),
                      ),
                    });
                  },
                });
                if (pollResult.status === "failed") {
                  throw new Error(pollResult.statusMessage || "视频生成失败");
                }
                appendResultUrls(pollResult.videos);
                appendResultThumbnailUrls([
                  String(pollResult.thumbnailUrl || "").trim(),
                  ...collectWorkflowVideoPosterUrls(pollResult.payload),
                ]);
              }
              if (!resultUrl) throw new Error("视频任务未返回结果");
              const fallbackVideoSize = getWorkflowAspectRatioFallbackSize(
                aspectRatio,
                16,
                9,
              );
              const finalResultUrls =
                resultUrls.length > 0 ? resultUrls : [resultUrl];
              const videoItems = await Promise.all(
                finalResultUrls.map(async (url, index) => {
                  const metadata = await readWorkflowVideoUrlSize(url).catch(
                    () => fallbackVideoSize,
                  );
                  return {
                    url,
                    thumbnailUrl:
                      resultThumbnailUrls[index] ||
                      resultThumbnailUrl ||
                      undefined,
                    width: metadata.width,
                    height: metadata.height,
                    duration:
                      "duration" in metadata ? metadata.duration : undefined,
                    title: `视频 ${index + 1}`,
                  };
                }),
              );
              const primaryVideo = videoItems[0];
              updateWorkflowNode(child.id, {
                mediaUrl: primaryVideo.url,
                thumbnailUrl: primaryVideo.thumbnailUrl,
                mediaRole: "ordinary",
                generationCount: requestedGenerationCount,
                workflowVideoResults:
                  videoItems.length > 1 ? videoItems : undefined,
                workflowVideoResultsCollapsed: videoItems.length <= 1,
                workflowGenerationRunning: false,
                workflowGenerationProgress: 1,
                workflowGenerationError: "",
                workflowGenerationTaskId: resultTaskId || undefined,
                workflowGenerationTaskIds: resultTaskIds,
                workflowGenerationTaskType: resultTaskType || undefined,
                workflowGenerationBaseUrl: resultBaseUrl || undefined,
                ...getWorkflowMediaNaturalSizePatch(primaryVideo),
                workflowMediaUserResized: false,
                workflowMediaFrameLocked: false,
                note: "",
              });
              resultTaskIds.forEach((taskId) =>
                activeVideoGenerationTaskIdsRef.current.delete(taskId),
              );
              applyWorkflowVideoUrlNodeFrame(
                moveWorkflowNode,
                child.id,
                primaryVideo.url,
                undefined,
                (metadata) => {
                  updateWorkflowNode(child.id, {
                    ...getWorkflowMediaNaturalSizePatch(metadata),
                    ...(durationSeconds > 0 &&
                    Number(metadata.duration || 0) > 0
                      ? {
                          workflowStoryboardDuration: `${Math.round(Number(metadata.duration))}s`,
                        }
                      : {}),
                  });
                },
                primaryVideo,
              );
              generatedVideos.push({
                rowIndex: child.rowIndex,
                url: primaryVideo.url,
              });
            };

            try {
              for (const child of videoChildren) {
                try {
                  await generateOneScriptClip(child);
                } catch (error) {
                  resolveWorkflowPredictionTaskIds({
                    taskIds: useCanvasStore
                      .getState()
                      .libtvWorkflow.nodes.find(
                        (node: LibTvWorkflowNode) => node.id === child.id,
                      )?.data?.workflowGenerationTaskIds,
                    taskId: useCanvasStore
                      .getState()
                      .libtvWorkflow.nodes.find(
                        (node: LibTvWorkflowNode) => node.id === child.id,
                      )?.data?.workflowGenerationTaskId,
                  }).forEach((taskId) =>
                    activeVideoGenerationTaskIdsRef.current.delete(taskId),
                  );
                  const errorMessage =
                    error instanceof Error ? error.message : "视频生成失败";
                  updateWorkflowNode(child.id, {
                    note: errorMessage.slice(0, 80),
                    workflowGenerationRunning: false,
                    workflowGenerationProgress: undefined,
                    workflowGenerationError: errorMessage,
                  });
                  console.error(
                    "[LibTvWorkflowCanvas] script video clip failed",
                    error,
                  );
                  if (isWorkflowProviderAccessError(error)) throw error;
                } finally {
                  completedCount += 1;
                  const progress = completedCount / videoChildren.length;
                  updateWorkflowNode(outputGroup.id, {
                    note: `正在生成视频 ${completedCount}/${videoChildren.length}`,
                    groupRunning: completedCount < videoChildren.length,
                  });
                  updateWorkflowNode(sourceNode.id, {
                    note: `正在按脚本生成视频 ${completedCount}/${videoChildren.length}`,
                    workflowGenerationRunning:
                      completedCount < videoChildren.length,
                    workflowGenerationProgress: Math.max(
                      0.03,
                      Math.min(1, progress),
                    ),
                  });
                }
              }
              updateWorkflowNode(outputGroup.id, {
                note: "",
                groupRunning: false,
              });
              updateWorkflowNode(sourceNode.id, {
                mediaRole: "generator",
                note: "",
                workflowGenerationRunning: false,
                workflowGenerationProgress:
                  generatedVideos.length > 0 ? 1 : undefined,
                workflowGenerationError:
                  generatedVideos.length > 0 ? "" : "视频生成失败",
                suppressGenerationBar: false,
              });
              useCanvasStore.getState().setLibTvWorkflowLastRun({
                status: generatedVideos.length > 0 ? "success" : "failed",
                targetNodeId: outputGroup.id,
                scriptNodeId: scriptSourceNode.id,
                sourceNodeIds: [scriptSourceNode.id, sourceNode.id],
                scriptResult,
                clips: generatedVideos,
                updatedAt: Date.now(),
              });
              if (generatedVideos.length > 0) {
                message.success(
                  `已按脚本生成 ${generatedVideos.length}/${videoChildren.length} 个视频`,
                );
              } else {
                message.error("视频生成失败");
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : "视频生成失败";
              updateWorkflowNode(outputGroup.id, {
                note: errorMessage,
                groupRunning: false,
              });
              updateWorkflowNode(sourceNode.id, {
                mediaRole: "generator",
                note: errorMessage,
                workflowGenerationRunning: false,
                workflowGenerationProgress: undefined,
                workflowGenerationError: errorMessage,
                suppressGenerationBar: false,
              });
              message.error(errorMessage);
              console.error(
                "[LibTvWorkflowCanvas] script video generation failed",
                error,
              );
            }
          })();
          return;
        }
        const finalPrompt = buildVideoGeneratorPrompt(
          prompt,
          videoContext,
          selectedCameraMotion,
        );
        const inputImages = resolveWorkflowVideoMentionedUrls(
          prompt,
          videoContext.mentionOptions,
          "image",
        );
        const inputVideos = resolveWorkflowVideoMentionedUrls(
          prompt,
          videoContext.mentionOptions,
          "video",
        );
        const inputAudios = resolveWorkflowVideoMentionedUrls(
          prompt,
          videoContext.mentionOptions,
          "audio",
        );
        const characterReferenceKeys =
          collectWorkflowVideoCharacterReferenceKeys(sourceNode);
        const filteredInputImages = inputImages.filter((url) => {
          const value = String(url || "").trim();
          return !characterReferenceKeys.previewUrls.has(value);
        });
        const frame = workflowNodeFrame("video");
        const currentWidth = Math.max(
          frame.width,
          Number(sourceNode.width || frame.width),
        );
        const currentHeight = Math.max(
          frame.height,
          Number(sourceNode.height || frame.height),
        );
        const anchor = {
          centerX: Number(sourceNode.x || 0) + currentWidth / 2,
          centerY: Number(sourceNode.y || 0) + currentHeight / 2,
        };
        const previousMediaUrl = String(sourceNode.data?.mediaUrl || "").trim();
        updateWorkflowNode(sourceNode.id, {
          prompt,
          content: "",
          ...(previousMediaUrl ? {} : { mediaUrl: "" }),
          mediaRole: "generator",
          componentType: "video-generator",
          note: WORKFLOW_VIDEO_GENERATING_NOTE,
          workflowGenerationRunning: true,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          workflowGenerationTaskId: undefined,
          workflowGenerationTaskIds: [],
          workflowGenerationTaskType: undefined,
          workflowGenerationBaseUrl: undefined,
          suppressGenerationBar: false,
        });
        void (async () => {
          let resultUrl = "";
          let resultThumbnailUrl = "";
          const resultUrls: string[] = [];
          const resultThumbnailUrls: string[] = [];
          const appendResultUrls = (urls: string[]) => {
            urls.forEach((url) => {
              const value = String(url || "").trim();
              if (!value || resultUrls.includes(value)) return;
              resultUrls.push(value);
              if (!resultUrl) resultUrl = value;
            });
          };
          const appendResultThumbnailUrls = (urls: string[]) => {
            urls.forEach((url) => {
              const value = String(url || "").trim();
              if (!value || resultThumbnailUrls.includes(value)) return;
              resultThumbnailUrls.push(value);
              if (!resultThumbnailUrl) resultThumbnailUrl = value;
            });
          };
          let resultTaskId = "";
          const resultTaskIds: string[] = [];
          let resultTaskType = "";
          let resultProviderKey = "";
          let resultBaseUrl = "";
          let resultStatusUrl = "";
          let resultBackgroundTaskId = "";
          try {
            const [referenceImages, referenceVideos, audioReferences] =
              await Promise.all([
                Promise.all(
                  filteredInputImages.map((url) =>
                    resolveWorkflowApiMediaSource(url, "image").catch(() =>
                      String(url || "").trim(),
                    ),
                  ),
                ),
                Promise.all(
                  inputVideos.map((url) =>
                    resolveWorkflowApiMediaSource(url, "video").catch(() =>
                      String(url || "").trim(),
                    ),
                  ),
                ),
                Promise.all(
                  inputAudios.map((url) =>
                    resolveWorkflowApiMediaSource(url, "audio").catch(() =>
                      String(url || "").trim(),
                    ),
                  ),
                ),
              ]);
            const cleanReferenceImages = referenceImages
              .filter(Boolean)
              .filter(
                (url) =>
                  !characterReferenceKeys.previewUrls.has(
                    String(url || "").trim(),
                  ),
              );
            const cleanReferenceVideos = referenceVideos.filter(Boolean);
            const cleanAudioReferences = audioReferences.filter(Boolean);
            if (generationCount > 1) {
              let batchCompletedCount = 0;
              const batchGeneratedVideos: Array<{
                url: string;
                thumbnailUrl?: string;
                width?: number;
                height?: number;
                duration?: number;
                title?: string;
              }> = [];
              const generateOneBatchVideo = async (index: number) => {
                let batchResultUrl = "";
                let batchThumbnailUrl = "";
                let batchTaskId = "";
                const batchTaskIds: string[] = [];
                let batchTaskType = "";
                let batchProviderKey = "";
                let batchBaseUrl = "";
                let batchStatusUrl = "";
                let batchBackgroundTaskId = "";
                const batchPayload = {
                  ...videoExtraGenerationOptions,
                  message: finalPrompt,
                  modelId,
                  providerKey: modelProviderKey,
                  ...(durationSeconds > 0 ? { duration: durationSeconds } : {}),
                  ...(videoResolution ? { resolution: videoResolution } : {}),
                  ...(aspectRatio ? { aspectRatio } : {}),
                  method,
                  images: cleanReferenceImages,
                  referenceVideo: cleanReferenceVideos[0] || undefined,
                  referenceVideos: cleanReferenceVideos.slice(1),
                  audioReferences: cleanAudioReferences,
                  tools: enableWebSearch ? [{ type: "web_search" }] : undefined,
                  generateAudio,
                  audioEnabled: generateAudio,
                  cameraMotion: selectedCameraMotion,
                  projectId,
                  canvasId: workflowCanvasId,
                  canvasName: workflowCanvasName,
                  locale: "zh-CN",
                  workflowEndpointMethod: workflowEndpointMethod || undefined,
                };
                await runWorkflowVideoRuntime(batchPayload, (event) => {
                  if (event?.type === "error")
                    throw new Error(String(event.message || "视频生成失败"));
                  if (event?.type === "step" && event?.status === "error")
                    throw new Error(
                      String(event.content || event.message || "视频生成失败"),
                    );
                  const urls = collectWorkflowVideoUrls(event);
                  if (urls[0]) batchResultUrl = urls[0];
                  const posterUrls = collectWorkflowVideoPosterUrls(event);
                  if (posterUrls[0]) batchThumbnailUrl = posterUrls[0];
                  const eventTaskIds = resolveWorkflowPredictionTaskIds({
                    taskIds: event?.taskIds,
                    taskId: event?.taskId,
                  });
                  eventTaskIds.forEach((taskId) => {
                    if (!batchTaskIds.includes(taskId)) {
                      batchTaskIds.push(taskId);
                    }
                    if (!resultTaskIds.includes(taskId)) {
                      resultTaskIds.push(taskId);
                    }
                    activeVideoGenerationTaskIdsRef.current.add(taskId);
                  });
                  if (eventTaskIds.length > 0) {
                    batchTaskId = eventTaskIds[eventTaskIds.length - 1];
                    resultTaskId = batchTaskId;
                  }
                  if (event?.baseUrl) {
                    batchBaseUrl = String(event.baseUrl).trim();
                    resultBaseUrl = batchBaseUrl;
                  }
                  if ((event as any)?.providerKey || (event as any)?.provider)
                    batchProviderKey = String(
                      (event as any).providerKey || (event as any).provider,
                    );
                  if (batchProviderKey) resultProviderKey = batchProviderKey;
                  if (event?.taskType)
                    batchTaskType = resolveUnifiedProviderTaskType({
                      taskType: event.taskType,
                      modelId,
                      providerKey: batchProviderKey,
                    });
                  if (batchTaskType) resultTaskType = batchTaskType;
                  if (event?.statusUrl)
                    batchStatusUrl = String(event.statusUrl);
                  if (event?.backgroundTaskId)
                    batchBackgroundTaskId = String(event.backgroundTaskId);
                  const label = String(
                    event?.content || event?.message || "",
                  ).trim();
                  if (
                    label ||
                    batchTaskId ||
                    batchTaskType ||
                    batchBackgroundTaskId
                  ) {
                    updateWorkflowNode(sourceNode.id, {
                      note: `正在生成视频 ${batchCompletedCount}/${generationCount}${label ? ` · ${normalizeWorkflowVideoGeneratingNote(label)}` : ""}`,
                      workflowGenerationRunning: true,
                      workflowGenerationTaskId: batchTaskId || undefined,
                      workflowGenerationTaskIds: resultTaskIds,
                      workflowGenerationTaskType: batchTaskType || undefined,
                      workflowGenerationBaseUrl: batchBaseUrl || undefined,
                      workflowGenerationProviderKey:
                        batchProviderKey || undefined,
                      workflowGenerationStatusUrl: batchStatusUrl || undefined,
                      workflowGenerationBackgroundTaskId:
                        batchBackgroundTaskId || undefined,
                    } as any);
                  }
                });
                if (
                  batchTaskId &&
                  !isWorkflowPredictionTaskType(batchTaskType, "video") &&
                  !batchResultUrl
                ) {
                  const isSeedanceBackgroundTask =
                    isOfficialSeedanceTaskContext({
                      taskType: batchTaskType,
                      providerKey: batchProviderKey,
                    });
                  const pollIntervalMs = resolveProviderVideoPollIntervalMs({
                    taskType: batchTaskType,
                    providerKey: batchProviderKey,
                    fallbackMs: 2500,
                  });
                  const pollResult = await pollUnifiedVideoTaskUntilTerminal({
                    intervalMs: pollIntervalMs,
                    initialDelay: true,
                    query: () =>
                      queryUnifiedVideoTaskStatus({
                        providerTaskId: batchTaskId,
                        taskType: batchTaskType,
                        statusUrl: batchStatusUrl || undefined,
                        modelId,
                        providerKey: batchProviderKey || undefined,
                        seedanceJobId: isSeedanceBackgroundTask
                          ? batchBackgroundTaskId
                          : "",
                        projectId,
                        persistVideo: true,
                      }),
                    onResult: (nextResult) => {
                      if (typeof nextResult.progress !== "number") return;
                      updateWorkflowNode(sourceNode.id, {
                        note: `正在生成视频 ${batchCompletedCount}/${generationCount}`,
                        workflowGenerationRunning: true,
                        workflowGenerationProgress: Math.max(
                          0,
                          Math.min(0.98, nextResult.progress),
                        ),
                      });
                    },
                  });
                  if (pollResult.status === "failed") {
                    throw new Error(pollResult.statusMessage || "视频生成失败");
                  }
                  batchResultUrl = pollResult.videos[0];
                  batchThumbnailUrl = String(
                    pollResult.thumbnailUrl ||
                      collectWorkflowVideoPosterUrls(pollResult.payload)[0] ||
                      batchThumbnailUrl ||
                      "",
                  ).trim();
                }
                if (!batchResultUrl) throw new Error("视频任务未返回结果");
                const fallbackVideoSize = getWorkflowAspectRatioFallbackSize(
                  aspectRatio,
                  16,
                  9,
                );
                const metadata = await readWorkflowVideoUrlSize(
                  batchResultUrl,
                ).catch(() => fallbackVideoSize);
                batchGeneratedVideos.push({
                  url: batchResultUrl,
                  thumbnailUrl: batchThumbnailUrl || undefined,
                  width: metadata.width,
                  height: metadata.height,
                  duration:
                    "duration" in metadata ? metadata.duration : undefined,
                  title: `视频 ${index + 1}`,
                });
              };
              for (let index = 0; index < generationCount; index += 1) {
                try {
                  await generateOneBatchVideo(index);
                } catch (error) {
                  console.error(
                    "[LibTvWorkflowCanvas] video batch item failed",
                    error,
                  );
                  if (isWorkflowProviderAccessError(error)) throw error;
                } finally {
                  batchCompletedCount += 1;
                  updateWorkflowNode(sourceNode.id, {
                    note: `正在生成视频 ${batchCompletedCount}/${generationCount}`,
                    workflowGenerationRunning:
                      batchCompletedCount < generationCount,
                    workflowGenerationProgress: Math.max(
                      0.03,
                      Math.min(1, batchCompletedCount / generationCount),
                    ),
                  });
                }
              }
              if (batchGeneratedVideos.length === 0)
                throw new Error("视频生成失败");
              const primaryVideo = batchGeneratedVideos[0];
              const fallbackVideoSize = getWorkflowAspectRatioFallbackSize(
                aspectRatio,
                16,
                9,
              );
              const primarySize = {
                width: primaryVideo.width || fallbackVideoSize.width,
                height: primaryVideo.height || fallbackVideoSize.height,
              };
              updateWorkflowNode(sourceNode.id, {
                mediaUrl: primaryVideo.url,
                thumbnailUrl: primaryVideo.thumbnailUrl || undefined,
                mediaRole: "generator",
                componentType: "video-generator",
                prompt,
                content: "",
                note: "",
                generationCount: requestedGenerationCount,
                workflowGenerationRunning: false,
                workflowGenerationProgress: 1,
                workflowGenerationError: "",
                workflowGenerationTaskId: resultTaskId || undefined,
                workflowGenerationTaskIds: resultTaskIds,
                workflowGenerationTaskType: resultTaskType || undefined,
                workflowGenerationProviderKey: resultProviderKey || undefined,
                workflowGenerationBaseUrl: resultBaseUrl || undefined,
                workflowVideoResults: batchGeneratedVideos,
                workflowVideoResultsCollapsed: false,
                ...getWorkflowMediaNaturalSizePatch(primarySize),
                workflowMediaUserResized: false,
                workflowMediaFrameLocked: false,
                suppressGenerationBar: false,
              } as any);
              resultTaskIds.forEach((taskId) =>
                activeVideoGenerationTaskIdsRef.current.delete(taskId),
              );
              applyWorkflowVideoUrlNodeFrame(
                moveWorkflowNode,
                sourceNode.id,
                primaryVideo.url,
                anchor,
                (metadata) => {
                  updateWorkflowNode(sourceNode.id, {
                    ...getWorkflowMediaNaturalSizePatch(metadata),
                    ...(durationSeconds > 0 &&
                    Number(metadata.duration || 0) > 0
                      ? {
                          videoDuration: `${Number(metadata.duration) < 10 ? Number(metadata.duration).toFixed(1) : Math.round(Number(metadata.duration))}s`,
                        }
                      : {}),
                  });
                },
                primarySize,
              );
              message.success(
                `视频生成完成，共 ${batchGeneratedVideos.length}/${generationCount} 个`,
              );
              return;
            }
            const videoGenerationPayload = {
              ...videoExtraGenerationOptions,
              message: finalPrompt,
              modelId,
              providerKey: modelProviderKey,
              ...(durationSeconds > 0 ? { duration: durationSeconds } : {}),
              ...(videoResolution ? { resolution: videoResolution } : {}),
              ...(aspectRatio ? { aspectRatio } : {}),
              ...(requestedGenerationCount
                ? { count: requestedGenerationCount }
                : {}),
              method,
              images: cleanReferenceImages,
              referenceVideo: cleanReferenceVideos[0] || undefined,
              referenceVideos: cleanReferenceVideos.slice(1),
              audioReferences: cleanAudioReferences,
              tools: enableWebSearch ? [{ type: "web_search" }] : undefined,
              generateAudio,
              audioEnabled: generateAudio,
              cameraMotion: selectedCameraMotion,
              projectId,
              canvasId: workflowCanvasId,
              canvasName: workflowCanvasName,
              locale: "zh-CN",
              workflowEndpointMethod: workflowEndpointMethod || undefined,
            };
            console.log(
              "[LibTvWorkflowCanvas] video generator request payload",
              {
                nodeId: sourceNode.id,
                modelId,
                method,
                workflowEndpointMethod,
                prompt,
                finalPrompt,
                upstreamMedia: videoContext.upstreamMedia,
                mentionedInputs: {
                  images: filteredInputImages,
                  videos: inputVideos,
                  audios: inputAudios,
                },
                resolvedInputs: {
                  images: cleanReferenceImages,
                  videos: cleanReferenceVideos,
                  audios: cleanAudioReferences,
                },
                payload: videoGenerationPayload,
              },
            );
            await runWorkflowVideoRuntime(videoGenerationPayload, (event) => {
              if (event?.type === "error")
                throw new Error(String(event.message || "视频生成失败"));
              if (event?.type === "step" && event?.status === "error")
                throw new Error(
                  String(event.content || event.message || "视频生成失败"),
                );
              const urls = collectWorkflowVideoUrls(event);
              appendResultUrls(urls);
              const posterUrls = collectWorkflowVideoPosterUrls(event);
              appendResultThumbnailUrls(posterUrls);
              const eventTaskIds = resolveWorkflowPredictionTaskIds({
                taskIds: event?.taskIds,
                taskId: event?.taskId,
              });
              eventTaskIds.forEach((taskId) => {
                if (!resultTaskIds.includes(taskId)) {
                  resultTaskIds.push(taskId);
                }
                activeVideoGenerationTaskIdsRef.current.add(taskId);
              });
              if (eventTaskIds.length > 0) {
                resultTaskId = eventTaskIds[eventTaskIds.length - 1];
              }
              if (event?.baseUrl) resultBaseUrl = String(event.baseUrl).trim();
              if ((event as any)?.providerKey || (event as any)?.provider)
                resultProviderKey = String(
                  (event as any).providerKey || (event as any).provider,
                );
              if (event?.taskType)
                resultTaskType = resolveUnifiedProviderTaskType({
                  taskType: event.taskType,
                  modelId,
                  providerKey: resultProviderKey,
                });
              if (event?.statusUrl) resultStatusUrl = String(event.statusUrl);
              if (event?.backgroundTaskId)
                resultBackgroundTaskId = String(event.backgroundTaskId);
              const label = String(
                event?.content || event?.message || "",
              ).trim();
              if (
                label ||
                resultTaskId ||
                resultTaskType ||
                resultProviderKey ||
                resultStatusUrl ||
                resultBackgroundTaskId
              ) {
                updateWorkflowNode(sourceNode.id, {
                  note: normalizeWorkflowVideoGeneratingNote(label),
                  workflowGenerationRunning: true,
                  workflowGenerationTaskId: resultTaskId || undefined,
                  workflowGenerationTaskIds: resultTaskIds,
                  workflowGenerationTaskType: resultTaskType || undefined,
                  workflowGenerationBaseUrl: resultBaseUrl || undefined,
                  workflowGenerationProviderKey: resultProviderKey || undefined,
                  workflowGenerationStatusUrl: resultStatusUrl || undefined,
                  workflowGenerationBackgroundTaskId:
                    resultBackgroundTaskId || undefined,
                } as any);
              }
            });

            if (
              resultTaskId &&
              !isWorkflowPredictionTaskType(resultTaskType, "video") &&
              resultUrls.length < generationCount
            ) {
              updateWorkflowNode(sourceNode.id, {
                note: WORKFLOW_VIDEO_GENERATING_NOTE,
                workflowGenerationRunning: true,
                workflowGenerationTaskId: resultTaskId,
                workflowGenerationTaskIds: resultTaskIds,
                workflowGenerationTaskType: resultTaskType || undefined,
                workflowGenerationBaseUrl: resultBaseUrl || undefined,
                workflowGenerationProviderKey: resultProviderKey || undefined,
                workflowGenerationStatusUrl: resultStatusUrl || undefined,
                workflowGenerationBackgroundTaskId:
                  resultBackgroundTaskId || undefined,
              } as any);
              const isSeedanceBackgroundTask = isOfficialSeedanceTaskContext({
                taskType: resultTaskType,
                providerKey: resultProviderKey,
              });
              const pollIntervalMs = resolveProviderVideoPollIntervalMs({
                taskType: resultTaskType,
                providerKey: resultProviderKey,
                fallbackMs: 2500,
              });
              const pollResult = await pollUnifiedVideoTaskUntilTerminal({
                intervalMs: pollIntervalMs,
                initialDelay: true,
                query: () =>
                  queryUnifiedVideoTaskStatus({
                    providerTaskId: resultTaskId,
                    taskType: resultTaskType,
                    statusUrl: resultStatusUrl || undefined,
                    modelId,
                    providerKey: resultProviderKey || undefined,
                    seedanceJobId: isSeedanceBackgroundTask
                      ? resultBackgroundTaskId
                      : "",
                    projectId,
                    persistVideo: true,
                  }),
                onResult: (nextResult) => {
                  if (typeof nextResult.progress !== "number") return;
                  updateWorkflowNode(sourceNode.id, {
                    note: WORKFLOW_VIDEO_GENERATING_NOTE,
                    workflowGenerationRunning: true,
                    workflowGenerationProgress: Math.max(
                      0,
                      Math.min(0.98, nextResult.progress),
                    ),
                  });
                },
              });
              if (pollResult.status === "failed") {
                throw new Error(pollResult.statusMessage || "视频生成失败");
              }
              appendResultUrls(pollResult.videos);
              appendResultThumbnailUrls([
                String(pollResult.thumbnailUrl || "").trim(),
                ...collectWorkflowVideoPosterUrls(pollResult.payload),
              ]);
            }

            if (!resultUrl) throw new Error("视频任务未返回结果");
            const fallbackVideoSize = getWorkflowAspectRatioFallbackSize(
              aspectRatio,
              16,
              9,
            );
            const finalVideoUrls =
              resultUrls.length > 0 ? resultUrls : [resultUrl];
            if (finalVideoUrls.length > 1) {
              const videoItems = await Promise.all(
                finalVideoUrls.map(async (url, index) => {
                  const size = await readWorkflowVideoUrlSize(url).catch(
                    () => fallbackVideoSize,
                  );
                  return {
                    url,
                    thumbnailUrl:
                      resultThumbnailUrls[index] ||
                      resultThumbnailUrl ||
                      undefined,
                    width: size.width,
                    height: size.height,
                    duration: "duration" in size ? size.duration : undefined,
                    title: `视频 ${index + 1}`,
                  };
                }),
              );
              const primaryVideo = videoItems[0];
              updateWorkflowNode(sourceNode.id, {
                mediaUrl: primaryVideo.url,
                thumbnailUrl: primaryVideo.thumbnailUrl || undefined,
                mediaRole: "generator",
                componentType: "video-generator",
                prompt,
                content: "",
                note: "",
                generationCount,
                workflowGenerationRunning: false,
                workflowGenerationProgress: 1,
                workflowGenerationError: "",
                workflowGenerationTaskId: resultTaskId || undefined,
                workflowGenerationTaskIds: resultTaskIds,
                workflowGenerationTaskType: resultTaskType || undefined,
                workflowGenerationBaseUrl: resultBaseUrl || undefined,
                workflowGenerationProviderKey: resultProviderKey || undefined,
                workflowGenerationBackgroundTaskId:
                  resultBackgroundTaskId || undefined,
                workflowVideoResults: videoItems,
                workflowVideoResultsCollapsed: false,
                ...getWorkflowMediaNaturalSizePatch(primaryVideo),
                workflowMediaUserResized: false,
                workflowMediaFrameLocked: false,
                suppressGenerationBar: false,
              } as any);
              resultTaskIds.forEach((taskId) =>
                activeVideoGenerationTaskIdsRef.current.delete(taskId),
              );
              applyWorkflowVideoUrlNodeFrame(
                moveWorkflowNode,
                sourceNode.id,
                primaryVideo.url,
                anchor,
                (metadata) => {
                  updateWorkflowNode(sourceNode.id, {
                    ...getWorkflowMediaNaturalSizePatch(metadata),
                    ...(Number(metadata.duration || 0) > 0
                      ? {
                          videoDuration: `${Number(metadata.duration) < 10 ? Number(metadata.duration).toFixed(1) : Math.round(Number(metadata.duration))}s`,
                        }
                      : {}),
                  });
                },
                primaryVideo,
              );
              message.success(`视频生成完成，共 ${videoItems.length} 个`);
              return;
            }
            updateWorkflowNode(sourceNode.id, {
              mediaUrl: resultUrl,
              thumbnailUrl: resultThumbnailUrl || undefined,
              mediaRole: "generator",
              componentType: "video-generator",
              prompt,
              content: "",
              note: "",
              generationCount: requestedGenerationCount,
              workflowGenerationRunning: false,
              workflowGenerationProgress: 1,
              workflowGenerationError: "",
              workflowGenerationTaskId: resultTaskId || undefined,
              workflowGenerationTaskIds: resultTaskIds,
              workflowGenerationTaskType: resultTaskType || undefined,
              workflowGenerationBaseUrl: resultBaseUrl || undefined,
              workflowGenerationProviderKey: resultProviderKey || undefined,
              workflowGenerationBackgroundTaskId:
                resultBackgroundTaskId || undefined,
              ...getWorkflowMediaNaturalSizePatch(fallbackVideoSize),
              workflowMediaUserResized: false,
              workflowMediaFrameLocked: false,
              suppressGenerationBar: false,
            } as any);
            resultTaskIds.forEach((taskId) =>
              activeVideoGenerationTaskIdsRef.current.delete(taskId),
            );
            applyWorkflowVideoUrlNodeFrame(
              moveWorkflowNode,
              sourceNode.id,
              resultUrl,
              anchor,
              (metadata) => {
                updateWorkflowNode(sourceNode.id, {
                  ...getWorkflowMediaNaturalSizePatch(metadata),
                  ...(durationSeconds > 0 && Number(metadata.duration || 0) > 0
                    ? {
                        videoDuration: `${Number(metadata.duration) < 10 ? Number(metadata.duration).toFixed(1) : Math.round(Number(metadata.duration))}s`,
                      }
                    : {}),
                });
              },
              fallbackVideoSize,
            );
            message.success("视频生成完成");
          } catch (error) {
            resultTaskIds.forEach((taskId) =>
              activeVideoGenerationTaskIdsRef.current.delete(taskId),
            );
            const messageText =
              error instanceof Error ? error.message : "视频生成失败";
            updateWorkflowNode(sourceNode.id, {
              ...(previousMediaUrl ? {} : { mediaUrl: "" }),
              mediaRole: "generator",
              componentType: "video-generator",
              note: messageText,
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: messageText,
              suppressGenerationBar: false,
            });
            message.error(messageText);
            console.error(
              "[LibTvWorkflowCanvas] video generation failed",
              error,
            );
          }
        })();
        return;
      }
      if (sourceNode.kind === "script" || sourceNode.kind === "script-v2") {
        const prompt = String(
          draftPrompt ?? sourceNode.data?.prompt ?? "",
        ).trim();
        const modelId = String(sourceNode.data?.modelId || "").trim();
        const selectedOptionId = String(
          sourceNode.data?.selectedOptionId || "",
        ).trim();
        const scriptV2Stage =
          sourceNode.kind === "script-v2"
            ? String(
                (submitSettings as any)?.scriptV2Stage || "confirm-shots",
              ).trim()
            : "full";
        const scriptContext = hasWorkflowScriptSourceContent(
          draftPrompt !== undefined
            ? {
                ...sourceNode,
                data: { ...sourceNode.data, prompt: draftPrompt },
              }
            : sourceNode,
          generationNodes,
          generationEdges,
        );
        if (!modelId) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先选择脚本模型");
          return;
        }
        if (!scriptContext) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先输入脚本提示词，或连接文本/图片/视频参考节点");
          return;
        }
        updateWorkflowNode(sourceNode.id, {
          prompt,
          note:
            scriptV2Stage === "prepare-assets"
              ? "正在提取资产信息"
              : "正在初始化脚本生成任务",
          workflowGenerationRunning: true,
          workflowGenerationProgress: 0.03,
          workflowGenerationError: "",
          suppressGenerationBar: true,
        });
        try {
          let scriptResult: any = null;
          let sourceNodeIds: string[] = [];
          let executionMode = "";
          await fetchSSE(
            "/api/libtv/script/generate",
            {
              ...extraGenerationOptions,
              targetNodeId: sourceNode.id,
              modelId,
              projectId: projectId || undefined,
              scriptV2Stage,
              workflow: {
                enabled: true,
                nodes: generationNodes,
                edges: generationEdges,
                activeNodeId: sourceNode.id,
                lastRun: null,
              },
              stream: true,
            },
            (data) => {
              if (data?.type === "error") {
                throw new Error(
                  String(data.error || data.message || "脚本生成失败"),
                );
              }
              if (data?.type === "progress") {
                const progress = Number(data.progress);
                const label = String(data.label || "脚本生成中").trim();
                updateWorkflowNode(sourceNode.id, {
                  note: label.slice(0, 80),
                  workflowGenerationRunning: true,
                  workflowGenerationProgress: Number.isFinite(progress)
                    ? Math.max(0, Math.min(0.99, progress / 100))
                    : undefined,
                });
              }
              if (data?.type === "result" && data.result) {
                scriptResult = normalizeLibTvStoryboardScriptResult(
                  data.result,
                );
                sourceNodeIds = Array.isArray(data.sourceNodeIds)
                  ? data.sourceNodeIds
                      .map((item: unknown) => String(item || ""))
                      .filter(Boolean)
                  : [];
                executionMode = String(
                  data.executionMode || data.mode || "",
                ).trim();
              }
            },
            { credentials: "include" },
          );
          if (!scriptResult || !Array.isArray(scriptResult.rows))
            throw new Error("脚本生成未返回表格结果");
          const nextScriptV2AssetsByKind =
            sourceNode.kind === "script-v2" &&
            scriptV2Stage === "prepare-assets"
              ? deriveLibTvScriptV2AssetsByKind(scriptResult)
              : null;
          if (sourceNode.kind === "script") {
            const scriptFrame = {
              width: LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH,
              height: LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT,
            };
            const currentFrame = workflowNodeFrame(sourceNode.kind);
            const centerX =
              Number(sourceNode.x || 0) +
              Math.max(
                currentFrame.width,
                Number(sourceNode.width || currentFrame.width),
              ) /
                2;
            const centerY =
              Number(sourceNode.y || 0) +
              Math.max(
                currentFrame.height,
                Number(sourceNode.height || currentFrame.height),
              ) /
                2;
            moveWorkflowNode(sourceNode.id, {
              x: Math.round(centerX - scriptFrame.width / 2),
              y: Math.round(centerY - scriptFrame.height / 2),
              width: scriptFrame.width,
              height: scriptFrame.height,
            });
          }
          updateWorkflowNode(sourceNode.id, {
            title: String(
              scriptResult.title || sourceNode.data?.title || "脚本生成器",
            ),
            componentType:
              sourceNode.kind === "script-v2"
                ? "script-v2-generator"
                : "script-document",
            selectedOptionId: String(
              scriptResult.selectedOptionId ||
                selectedOptionId ||
                sourceNode.data?.selectedOptionId ||
                "storyboard-script",
            ),
            scriptResult,
            scriptViewMode: "script",
            ...(sourceNode.kind === "script-v2" &&
            scriptV2Stage === "confirm-shots"
              ? {
                  scriptV2AssetsByKind: { 角色: [], 场景: [], 道具: [] },
                  scriptV2ActiveStep: "confirm-shots",
                }
              : nextScriptV2AssetsByKind
                ? {
                    scriptV2AssetsByKind: nextScriptV2AssetsByKind,
                    scriptV2ActiveStep: "prepare-assets",
                  }
                : {}),
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            suppressGenerationBar: false,
          });
          useCanvasStore.getState().setLibTvWorkflowLastRun({
            status: "success",
            executionMode,
            targetNodeId: sourceNode.id,
            scriptNodeId: sourceNode.id,
            sourceNodeIds,
            scriptResult,
            updatedAt: Date.now(),
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "脚本生成失败";
          updateWorkflowNode(sourceNode.id, {
            note: errorMessage,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: errorMessage,
            suppressGenerationBar: false,
          });
          message.error(errorMessage);
        }
        return;
      }
      if (sourceNode.kind === "threed") {
        const prompt = String(
          draftPrompt ??
            sourceNode.data?.prompt ??
            sourceNode.data?.content ??
            "",
        ).trim();
        const worldContext = buildWorldGeneratorWorkflowContext(
          sourceNode,
          generationNodes,
          generationEdges,
        );
        if (
          !prompt &&
          worldContext.referenceImages.length === 0 &&
          worldContext.referenceVideos.length === 0 &&
          worldContext.textBlocks.length === 0
        ) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先输入提示词或连接图片/视频/文本参考");
          return;
        }
        const selectedWorldModel = String(
          sourceNode.data?.modelId || "",
        ).trim();
        if (!selectedWorldModel) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先选择 3D 模型");
          return;
        }
        const parsedWorldModel = parseModelRuntimeId(selectedWorldModel);
        const worldProviderKey = String(parsedWorldModel.providerKey || "")
          .trim()
          .toLowerCase();
        const finalPrompt = buildWorldGeneratorPrompt(prompt, worldContext);
        const displayName = buildWorldGeneratorDisplayName(prompt, sourceNode);
        const workflowContextPrompt = buildWorldGeneratorDebugPrompt(
          prompt,
          worldContext,
        );

        updateWorkflowNode(sourceNode.id, {
          prompt,
          note: "正在创建 3D 世界任务",
          workflowGenerationRunning: true,
          workflowGenerationProgress: 0.04,
          workflowGenerationError: "",
          workflowGenerationJobId: undefined,
          workflowGenerationTaskId: undefined,
          workflowGenerationTaskIds: [],
          workflowGenerationTaskType: undefined,
          workflowGenerationProviderKey: worldProviderKey || undefined,
          workflowGenerationBaseUrl: undefined,
          suppressGenerationBar: true,
        });

        void (async () => {
          const taskIds: string[] = [];
          let taskType = workflowPredictionTaskType("3d");
          let taskBaseUrl = "";
          try {
            const [referenceImages, referenceVideos] = await Promise.all([
              Promise.all(
                worldContext.referenceImages
                  .slice(0, 8)
                  .map((url) =>
                    resolveWorkflowApiMediaSource(url, "image").catch(() =>
                      String(url || "").trim(),
                    ),
                  ),
              ),
              Promise.all(
                worldContext.referenceVideos
                  .slice(0, 4)
                  .map((url) =>
                    resolveWorkflowApiMediaSource(url, "video").catch(() =>
                      String(url || "").trim(),
                    ),
                  ),
              ),
            ]);
            const threeDMode = String(
              sourceNode.data?.workflowExtraParameters?.mode || "",
            ).trim();
            const runtimeResult = await runWorkflowThreeDRuntime(
              {
                ...extraGenerationOptions,
                modelId: selectedWorldModel,
                mode: threeDMode || undefined,
                prompt: finalPrompt,
                count: 1,
                referenceImages: referenceImages.filter(Boolean),
                referenceVideos: referenceVideos.filter(Boolean),
                displayName,
                workflowContextPrompt,
                workflowNodeId: sourceNode.id,
                upstreamNodes: worldContext.upstreamMedia,
                upstreamTextBlocks: worldContext.textBlocks,
                projectId,
              },
              (event) => {
                const eventTaskIds = resolveWorkflowPredictionTaskIds({
                  taskIds: event.taskIds,
                  taskId: event.taskId,
                });
                eventTaskIds.forEach((taskId) => {
                  if (!taskIds.includes(taskId)) taskIds.push(taskId);
                  activeThreeDGenerationTaskIdsRef.current.add(taskId);
                });
                if (event.taskType) taskType = String(event.taskType);
                if (event.baseUrl) taskBaseUrl = String(event.baseUrl).trim();
                if (eventTaskIds.length > 0) {
                  updateWorkflowNode(sourceNode.id, {
                    note: "3D 世界生成中...",
                    workflowGenerationRunning: true,
                    workflowGenerationProgress:
                      typeof event.progress === "number"
                        ? Math.max(0.08, Math.min(0.98, event.progress))
                        : 0.08,
                    workflowGenerationTaskId: taskIds[taskIds.length - 1],
                    workflowGenerationTaskIds: taskIds,
                    workflowGenerationTaskType: taskType,
                    workflowGenerationBaseUrl: taskBaseUrl || undefined,
                  });
                }
              },
            );
            const resolvedAssets = resolveWorkflowThreeDAssets(
              runtimeResult.assets,
            );
            const assetUrl = resolvedAssets.primaryUrl;
            if (!assetUrl) throw new Error("3D 世界生成未返回结果");
            updateWorkflowNode(sourceNode.id, {
              mediaUrl: assetUrl,
              mediaRole: "ordinary",
              prompt,
              content: "",
              note: "",
              modelId: selectedWorldModel,
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              workflowGenerationJobId: undefined,
              workflowGenerationTaskId: taskIds[taskIds.length - 1],
              workflowGenerationTaskIds: taskIds,
              workflowGenerationTaskType: taskType,
              workflowGenerationProviderKey: worldProviderKey || undefined,
              workflowGenerationBaseUrl: taskBaseUrl || undefined,
              colliderMeshUrl: resolvedAssets.modelUrl,
              splatUrl: resolvedAssets.splatUrl,
              worldUrl: resolvedAssets.worldUrl,
              worldMarbleUrl: resolvedAssets.worldUrl,
              thumbnailUrl: resolvedAssets.thumbnailUrl,
              suppressGenerationBar: false,
            });
            taskIds.forEach((taskId) =>
              activeThreeDGenerationTaskIdsRef.current.delete(taskId),
            );
          } catch (error) {
            taskIds.forEach((taskId) =>
              activeThreeDGenerationTaskIdsRef.current.delete(taskId),
            );
            const messageText =
              error instanceof Error ? error.message : "3D 世界生成失败";
            updateWorkflowNode(sourceNode.id, {
              note: messageText,
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: messageText,
              suppressGenerationBar: false,
            });
            message.error(messageText);
            console.error(
              "[LibTvWorkflowCanvas] world generation failed",
              error,
            );
          }
        })();
        return;
      }
      if (sourceNode.kind === "audio") {
        const prompt = String(
          draftPrompt ??
            sourceNode.data?.prompt ??
            sourceNode.data?.content ??
            "",
        ).trim();
        const modelId = String(sourceNode.data?.modelId || "").trim();
        if (!modelId) {
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
          message.warning("请先选择音频模型");
          return;
        }
        const audioContext = buildWorkflowAudioRuntimeContext(
          sourceNode,
          generationNodes,
          generationEdges,
        );

        updateWorkflowNode(sourceNode.id, {
          prompt,
          modelId,
          mediaUrl: "",
          mediaRole: undefined,
          note: "正在创建音频任务",
          workflowGenerationRunning: true,
          workflowGenerationProgress: 0.04,
          workflowGenerationError: "",
          workflowGenerationTaskId: undefined,
          workflowGenerationTaskIds: [],
          workflowGenerationTaskType: undefined,
          workflowGenerationBaseUrl: undefined,
          suppressGenerationBar: true,
        });

        void (async () => {
          const taskIds: string[] = [];
          let taskType = workflowPredictionTaskType("audio");
          let taskBaseUrl = "";
          try {
            const audioMode = String(
              sourceNode.data?.workflowExtraParameters?.audioMode ||
                sourceNode.data?.workflowExtraParameters?.mode ||
                "",
            ).trim();
            const audioEndpointModelId =
              await resolveWorkflowAudioEndpointRuntimeId(modelId, audioMode);
            if (!audioEndpointModelId) {
              throw new Error("当前音频模式没有可用的 endpoint");
            }
            const [referenceImages, referenceVideos, audioReferences] =
              await Promise.all([
                Promise.all(
                  audioContext.referenceImages.map((url) =>
                    resolveWorkflowApiMediaSource(url, "image").catch(() =>
                      String(url || "").trim(),
                    ),
                  ),
                ),
                Promise.all(
                  audioContext.referenceVideos.map((url) =>
                    resolveWorkflowApiMediaSource(url, "video").catch(() =>
                      String(url || "").trim(),
                    ),
                  ),
                ),
                Promise.all(
                  audioContext.audioReferences.map((url) =>
                    resolveWorkflowApiMediaSource(url, "audio").catch(() =>
                      String(url || "").trim(),
                    ),
                  ),
                ),
              ]);
            const runtimeResult = await runWorkflowAudioRuntime(
              {
                ...extraGenerationOptions,
                modelId: audioEndpointModelId,
                mode: audioMode || undefined,
                prompt: [prompt, ...audioContext.textBlocks]
                  .filter(Boolean)
                  .join("\n\n"),
                count: 1,
                referenceImages: referenceImages.filter(Boolean),
                referenceVideos: referenceVideos.filter(Boolean),
                audioReferences: audioReferences.filter(Boolean),
              },
              (event) => {
                const eventTaskIds = resolveWorkflowPredictionTaskIds({
                  taskIds: event.taskIds,
                  taskId: event.taskId,
                });
                eventTaskIds.forEach((taskId) => {
                  if (!taskIds.includes(taskId)) taskIds.push(taskId);
                  activeAudioGenerationTaskIdsRef.current.add(taskId);
                });
                if (event.taskType) taskType = String(event.taskType);
                if (event.baseUrl) taskBaseUrl = String(event.baseUrl).trim();
                if (eventTaskIds.length > 0) {
                  updateWorkflowNode(sourceNode.id, {
                    note: "音频生成中...",
                    workflowGenerationRunning: true,
                    workflowGenerationProgress:
                      typeof event.progress === "number"
                        ? Math.max(0.08, Math.min(0.98, event.progress))
                        : 0.08,
                    workflowGenerationTaskId: taskIds[taskIds.length - 1],
                    workflowGenerationTaskIds: taskIds,
                    workflowGenerationTaskType: taskType,
                    workflowGenerationBaseUrl: taskBaseUrl || undefined,
                  });
                }
              },
            );
            const audioUrl = String(runtimeResult.audios[0] || "").trim();
            if (!audioUrl) throw new Error("音频生成未返回结果");
            updateWorkflowNode(sourceNode.id, {
              mediaUrl: audioUrl,
              mediaRole: "ordinary",
              prompt,
              note: "",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              workflowGenerationTaskId: taskIds[taskIds.length - 1],
              workflowGenerationTaskIds: taskIds,
              workflowGenerationTaskType: taskType,
              workflowGenerationBaseUrl: taskBaseUrl || undefined,
              suppressGenerationBar: false,
            });
            taskIds.forEach((taskId) =>
              activeAudioGenerationTaskIdsRef.current.delete(taskId),
            );
          } catch (error) {
            taskIds.forEach((taskId) =>
              activeAudioGenerationTaskIdsRef.current.delete(taskId),
            );
            const messageText =
              error instanceof Error ? error.message : "音频生成失败";
            updateWorkflowNode(sourceNode.id, {
              note: messageText,
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: messageText,
              suppressGenerationBar: false,
            });
            message.error(messageText);
            console.error(
              "[LibTvWorkflowCanvas] audio generation failed",
              error,
            );
          }
        })();
        return;
      }
      if (sourceNode.kind !== "text") {
        updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
        message.info("该节点生成接口下一步接入");
        return;
      }
      if (sourceNode.data?.componentType === "text-editor") return;

      const prompt = String(
        draftPrompt ??
          sourceNode.data?.prompt ??
          sourceNode.data?.content ??
          "",
      ).trim();
      if (!prompt) {
        updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
        message.warning("请先输入提示词");
        return;
      }
      const modelId = String(sourceNode.data?.modelId || "").trim();
      if (!modelId) {
        updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
        message.warning("请先选择模型");
        return;
      }

      const workflowContext = buildTextGeneratorWorkflowContext(
        sourceNode,
        generationNodes,
        generationEdges,
      );
      updateWorkflowNode(sourceNode.id, {
        note: "生成中...",
        content: "",
        suppressGenerationBar: true,
      });
      try {
        let fullReply = "";
        await fetchSSE(
          "/api/workflow/text-agent",
          {
            ...extraGenerationOptions,
            prompt,
            modelId,
            textBlocks: workflowContext.textBlocks,
            videoBlocks: workflowContext.videoBlocks,
            imageUrls: workflowContext.imageUrls,
            projectId: projectId || undefined,
          },
          (data) => {
            if (data?.type === "error") {
              throw new Error(String(data.message || "文本生成失败"));
            }
            if (data?.type === "delta" && typeof data.text === "string") {
              fullReply += data.text;
              const liveReply = fullReply.trim();
              if (liveReply) {
                updateWorkflowNode(sourceNode.id, {
                  content: createWorkflowMarkdownTextContent(liveReply),
                  note: "生成中...",
                });
              }
            }
          },
          { credentials: "include" },
        );

        const result = fullReply.trim();
        if (!result) throw new Error("文本生成失败，未返回结果");

        updateWorkflowNode(sourceNode.id, {
          content: createWorkflowMarkdownTextContent(result),
          note: "",
          suppressGenerationBar: false,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "文本生成失败";
        updateWorkflowNode(sourceNode.id, {
          note: errorMessage,
          suppressGenerationBar: false,
        });
        message.error(errorMessage);
      }
    },
    [
      addWorkflowNode,
      edges,
      moveWorkflowNode,
      nodes,
      prepareWorkflowImageGenerationPlaceholder,
      projectId,
      replaceWorkflowNodeWithImageGroup,
      selectLayer,
      setActiveWorkflowNode,
      shouldApplyAutoMediaFrame,
      updateWorkflowNode,
    ],
  );

  const handleGenerateWorkflowNodeRef = useRef(handleGenerateWorkflowNode);
  const codexCanvasRunSignaturesRef = useRef(new Map<string, string>());
  const codexNativeStoryboardActionsRef = useRef<CodexNativeStoryboardActions>(
    {},
  );
  useEffect(() => {
    handleGenerateWorkflowNodeRef.current = handleGenerateWorkflowNode;
  }, [handleGenerateWorkflowNode]);

  const executeCodexCanvasCommand = useCallback(
    async (command: CodexCanvasCommand) => {
      const payload =
        command.payload && typeof command.payload === "object"
          ? command.payload
          : {};
      const currentWorkflow = () => useCanvasStore.getState().libtvWorkflow;
      const captureWorkflowIds = () => {
        const current = currentWorkflow();
        return {
          nodeIds: new Set(current.nodes.map((node) => node.id)),
          edgeIds: new Set(current.edges.map((edge) => edge.id)),
        };
      };
      const workflowDelta = (before: ReturnType<typeof captureWorkflowIds>) => {
        const current = currentWorkflow();
        return buildCodexCanvasWorkflowDelta(
          before,
          current.nodes,
          current.edges,
        );
      };
      const nodeResult = (
        nodeId: string,
        options: {
          include?: string[];
          rowOffset?: number;
          rowLimit?: number;
        } = {},
      ) => {
        const current = currentWorkflow();
        return buildCodexCanvasNodeReceipt({
          nodeId,
          nodes: current.nodes,
          edges: current.edges,
          ...options,
        });
      };
      const runResult = (nodeId: string) => {
        const current = currentWorkflow();
        return buildCodexCanvasRunReceipt({
          nodeId,
          nodes: current.nodes,
          edges: current.edges,
        });
      };
      if (command.operation === "snapshot") {
        const current = currentWorkflow();
        const visibleBounds = getWorkflowVisibleBounds({
          flow: flowRef.current,
          container: containerRef.current,
          reserveRight: getCodexCanvasReservedRight(containerRef.current),
        });
        const occupiedNodes = current.nodes.map((node) => ({
          nodeId: node.id,
          kind: node.kind,
          ...getWorkflowNodeObstacleRect(node),
        }));
        const visibleBoundsRect: WorkflowRect = {
          x: visibleBounds.left,
          y: visibleBounds.top,
          width: visibleBounds.width,
          height: visibleBounds.height,
        };
        const visibleOccupiedRects = occupiedNodes.filter((rect) =>
          workflowRectsOverlap(
            rect,
            expandWorkflowRect(visibleBoundsRect, CODEX_WORKFLOW_NODE_GAP),
          ),
        );
        const visibleOccupiedNodes = visibleOccupiedRects.slice(0, 240);
        const snapshot = buildCodexCanvasSnapshot({
          workflowProjectId: projectId,
          canvasSessionId: codexCanvasSessionId,
          nodes: current.nodes,
          edges: current.edges,
          selectedNodeIds: useCanvasStore.getState().selectedIds,
          knownRevision: String(payload.knownRevision || "").trim(),
          layout: {
            observedAt: new Date().toISOString(),
            viewport: flowRef.current?.getViewport() || null,
            visibleBounds,
            occupiedNodeCount: occupiedNodes.length,
            visibleOccupiedNodeCount: visibleOccupiedRects.length,
            visibleOccupiedNodes,
            visibleOccupancyTruncated:
              visibleOccupiedNodes.length < visibleOccupiedRects.length,
            autoPlacement: {
              order:
                "production-stages-left-to-right, same-stage-top-to-bottom",
              stages: CODEX_WORKFLOW_STAGE_ORDER,
              gap: CODEX_WORKFLOW_NODE_GAP,
              collisionSource: "live-canvas-store-at-create-commit",
              defaultMode: "auto-stage",
            },
          },
        });
        return payload.includeContract === true
          ? { ...snapshot, schema: codexCanvasCommandSchema() }
          : snapshot;
      }
      if (command.operation === "models") {
        const requestedKind = String(payload.kind || "")
          .trim()
          .toLowerCase();
        const kindMap: Record<
          string,
          {
            responseKind: string;
            fetchKind: "image" | "video" | "audio" | "chat" | "3d";
          }
        > = {
          image: { responseKind: "image", fetchKind: "image" },
          video: { responseKind: "video", fetchKind: "video" },
          audio: { responseKind: "audio", fetchKind: "audio" },
          text: { responseKind: "text", fetchKind: "chat" },
          chat: { responseKind: "text", fetchKind: "chat" },
          "3d": { responseKind: "threeD", fetchKind: "3d" },
          threed: { responseKind: "threeD", fetchKind: "3d" },
        };
        const resolvedKind = kindMap[requestedKind];
        if (!resolvedKind)
          throw new Error("models.kind 必须是 image、video、audio、text 或 3d");
        const modelOptions = await fetchWorkflowModelOptions(
          resolvedKind.fetchKind,
        ).catch(() => []);
        const compactModels = buildCodexWorkflowModelCatalog({
          [resolvedKind.responseKind]: modelOptions,
        });
        const controls = getWorkflowGeneratorControlsForCodex();
        return {
          ...queryCodexWorkflowModelCatalog({
            kind: resolvedKind.responseKind,
            catalog: compactModels.modelCatalog,
            parameterProfiles: compactModels.modelParameterProfiles,
            query: String(payload.query || ""),
            modelId: String(payload.modelId || ""),
            includeParameters: payload.includeParameters === true,
            limit: Number(payload.limit || 6),
          }),
          controls: {
            ...(resolvedKind.responseKind === "image"
              ? { kind: controls.image }
              : {}),
            ...(resolvedKind.responseKind === "video"
              ? { kind: controls.video }
              : {}),
            sendButton: controls.sendButton,
            executionRules: controls.executionRules,
          },
        };
      }
      if (command.operation === "create") {
        const requestedKind = String(
          payload.kind || "",
        ).trim() as LibTvWorkflowNodeKind;
        const allowedKinds = new Set<LibTvWorkflowNodeKind>([
          "text",
          "image",
          "video",
          "audio",
          "script",
          "script-v2",
          "playlist",
          "threed",
          "director-console-3d",
          "group",
        ]);
        if (!allowedKinds.has(requestedKind))
          throw new Error("不支持的画布节点类型");
        const positionValue =
          payload.position && typeof payload.position === "object"
            ? (payload.position as Record<string, unknown>)
            : {};
        const frameValue =
          payload.frame && typeof payload.frame === "object"
            ? (payload.frame as Record<string, unknown>)
            : {};
        const requestedData = sanitizeCodexCanvasNodeData(payload.data);
        const ordinaryMedia = requestedData.mediaRole === "ordinary";
        const defaultFrame = workflowNodeFrame(requestedKind);
        const mediaUrl = String(requestedData.mediaUrl || "").trim();
        const naturalSize = ordinaryMedia
          ? await readCodexMediaUrlSize(requestedKind, mediaUrl)
          : null;
        const mediaFrame = naturalSize
          ? workflowMediaDisplayFrame(naturalSize.width, naturalSize.height)
          : null;
        const requestedWidth = Math.max(
          1,
          mediaFrame
            ? mediaFrame.width
            : Number.isFinite(Number(frameValue.width))
              ? Number(frameValue.width)
              : defaultFrame.width,
        );
        const requestedHeight = Math.max(
          1,
          mediaFrame
            ? mediaFrame.height
            : Number.isFinite(Number(frameValue.height))
              ? Number(frameValue.height)
              : defaultFrame.height,
        );
        const requestedX = Number.isFinite(Number(frameValue.x))
          ? Number(frameValue.x)
          : Number.isFinite(Number(positionValue.x))
            ? Number(positionValue.x)
            : null;
        const requestedY = Number.isFinite(Number(frameValue.y))
          ? Number(frameValue.y)
          : Number.isFinite(Number(positionValue.y))
            ? Number(positionValue.y)
            : null;
        const placementMode =
          String(payload.placementMode || "").trim() === "exact"
            ? "exact"
            : "auto-stage";
        const requestedStage = inferCodexWorkflowStage(
          requestedKind,
          requestedData,
        );
        const liveNodes = currentWorkflow().nodes;
        const mediaIdentityKeys = codexWorkflowMediaIdentityKeys(mediaUrl);
        const reusableMediaNode =
          ordinaryMedia &&
          mediaIdentityKeys.size > 0 &&
          (requestedKind === "image" ||
            requestedKind === "video" ||
            requestedKind === "audio")
            ? liveNodes.find(
                (node) =>
                  codexWorkflowNodeMatchesMediaKind(node, requestedKind) &&
                  Array.from(codexWorkflowNodeMediaIdentityKeys(node)).some(
                    (identity) => mediaIdentityKeys.has(identity),
                  ),
              )
            : undefined;
        if (reusableMediaNode) {
          selectLayer(reusableMediaNode.id);
          setActiveWorkflowNode(reusableMediaNode.id);
          window.setTimeout(
            () => focusCodexWorkflowNodes([reusableMediaNode.id]),
            0,
          );
          return {
            ...nodeResult(reusableMediaNode.id),
            reused: true,
            reuseReason: "same-media-already-on-canvas",
          };
        }
        const taskPlacement = allocateCodexWorkflowTaskPlacement({
          nodes: liveNodes.map(getCodexWorkflowTaskPlacementNode),
          taskId: command.codexTaskId,
          stage: requestedStage,
          bounds: getWorkflowVisibleBounds({
            flow: flowRef.current,
            container: containerRef.current,
            reserveRight: getCodexCanvasReservedRight(containerRef.current),
          }),
          width: requestedWidth,
          height: requestedHeight,
          preferredPosition:
            placementMode === "exact" &&
            requestedX !== null &&
            requestedY !== null
              ? { x: requestedX, y: requestedY }
              : null,
        });
        const placement = taskPlacement.placement;
        const created = addWorkflowNode(requestedKind, placement);
        const generatorDefaults =
          requestedKind === "image" && !ordinaryMedia
            ? {
                title: "图片生成器",
                mediaRole: "generator",
                componentType: "image-generator",
              }
            : requestedKind === "video" && !ordinaryMedia
              ? {
                  title: "视频生成器",
                  mediaRole: "generator",
                  componentType: "video-generator",
                  generateAudio: true,
                }
              : requestedKind === "audio" && !ordinaryMedia
                ? { title: "音频生成器", componentType: "audio-generator" }
                : {};
        updateWorkflowNode(created.id, {
          ...generatorDefaults,
          ...requestedData,
          ...(requestedKind === "video" && !ordinaryMedia
            ? { generateAudio: true }
            : {}),
          ...(naturalSize
            ? {
                workflowMediaNaturalWidth: naturalSize.width,
                workflowMediaNaturalHeight: naturalSize.height,
                workflowMediaUserResized: false,
              }
            : {}),
          ...(taskPlacement.taskId
            ? {
                workflowGenerationController: "codex",
                workflowCodexTaskId: taskPlacement.taskId,
                workflowCodexLayoutAnchorX: taskPlacement.anchor.x,
                workflowCodexLayoutAnchorY: taskPlacement.anchor.y,
                workflowCodexLayoutIndex: taskPlacement.layoutIndex,
                workflowCodexLayoutStage: taskPlacement.layoutStage,
                workflowCodexLayoutRow: taskPlacement.layoutRow,
              }
            : {}),
        } as Partial<LibTvWorkflowNode["data"]>);
        moveWorkflowNode(created.id, {
          x: placement.x,
          y: placement.y,
          width: requestedWidth,
          height: requestedHeight,
        });
        selectLayer(created.id);
        setActiveWorkflowNode(created.id);
        const taskNodeIds = taskPlacement.taskId
          ? currentWorkflow()
              .nodes.filter(
                (node) =>
                  String(node.data?.workflowCodexTaskId || "").trim() ===
                  taskPlacement.taskId,
              )
              .map((node) => node.id)
          : [created.id];
        window.setTimeout(
          () =>
            focusCodexWorkflowNodes(
              Array.from(new Set([...taskNodeIds, created.id])),
              { maxZoom: 1 },
            ),
          0,
        );
        return {
          ...nodeResult(created.id),
          placement: {
            mode: placementMode,
            x: placement.x,
            y: placement.y,
            row: placement.row,
            column: placement.column,
            columns: placement.columns,
            source: placement.source,
            stage: placement.stage,
            anchorX: taskPlacement.anchor.x,
            anchorY: taskPlacement.anchor.y,
            layoutIndex: taskPlacement.layoutIndex,
            occupiedNodeCountAtCommit: liveNodes.length,
          },
        };
      }
      const nodeId = String(payload.nodeId || "").trim();
      const operationsRequiringNodeId = new Set<CodexCanvasCommandOperation>([
        "update",
        "delete",
        "run",
        "wait",
        "inspect-result",
        "script-create-input",
        "script-import-assets",
        "storyboard-create-images",
        "storyboard-regenerate-images",
        "storyboard-create-videos",
      ]);
      if (operationsRequiringNodeId.has(command.operation) && !nodeId) {
        throw new Error("nodeId 不能为空");
      }
      if (command.operation === "script-create-input") {
        const scriptNode = currentWorkflow().nodes.find(
          (node) => node.id === nodeId && isWorkflowScriptKind(node.kind),
        );
        if (!scriptNode) throw new Error("脚本节点不存在");
        const requestValue =
          payload.request &&
          typeof payload.request === "object" &&
          !Array.isArray(payload.request)
            ? (payload.request as Record<string, unknown>)
            : payload;
        const inputType = String(requestValue.inputType || "story").trim();
        if (
          inputType !== "story" &&
          inputType !== "video" &&
          inputType !== "character"
        ) {
          throw new Error("inputType 必须是 story、video 或 character");
        }
        const before = captureWorkflowIds();
        handleCreateScriptInputNode(
          nodeId,
          inputType,
          typeof requestValue.initialContent === "string"
            ? requestValue.initialContent
            : undefined,
        );
        return { ...nodeResult(nodeId), ...workflowDelta(before) };
      }
      if (command.operation === "script-import-assets") {
        const scriptNode = currentWorkflow().nodes.find(
          (node) => node.id === nodeId && node.kind === "script-v2",
        );
        if (!scriptNode) throw new Error("script-v2 节点不存在");
        const rows =
          normalizeLibTvStoryboardScriptResult({
            title: String(
              payload.title || scriptNode.data?.title || "脚本生成器",
            ),
            summary: "",
            sourceScript: "",
            userPrompt: String(scriptNode.data?.prompt || ""),
            selectedOptionId: String(
              scriptNode.data?.selectedOptionId || "custom",
            ),
            rows: Array.isArray(payload.rows)
              ? payload.rows
              : scriptNode.data?.scriptResult?.rows || [],
            generatedAt: Date.now(),
          })?.rows || [];
        if (rows.length === 0)
          throw new Error("rows 不能为空，且必须符合分镜脚本行结构");
        const assetsByKind = buildCodexScriptImportAssets(
          currentWorkflow().nodes,
          payload.assetsByKind,
        );
        if (
          !Object.values(assetsByKind).some((items) =>
            items.some((item) => Boolean(String(item.imageUrl || "").trim())),
          )
        ) {
          throw new Error(
            "画布上没有已生成、已审核并带可用媒体的角色、场景或道具资产",
          );
        }
        const action = codexNativeStoryboardActionsRef.current.importAssets;
        if (!action) throw new Error("脚本资产导入能力尚未就绪");
        const before = captureWorkflowIds();
        action(nodeId, {
          title: String(
            payload.title || scriptNode.data?.title || "脚本生成器",
          ),
          rows,
          assetsByKind,
          codexTaskId: command.codexTaskId,
        });
        return { ...nodeResult(nodeId), ...workflowDelta(before) };
      }
      if (command.operation === "storyboard-create-images") {
        const scriptNode = currentWorkflow().nodes.find(
          (node) => node.id === nodeId && isWorkflowScriptKind(node.kind),
        );
        if (!scriptNode) throw new Error("脚本节点不存在");
        const action = codexNativeStoryboardActionsRef.current.createImages;
        if (!action) throw new Error("分镜图生成能力尚未就绪");
        const requestValue =
          payload.request &&
          typeof payload.request === "object" &&
          !Array.isArray(payload.request)
            ? (payload.request as Record<string, unknown>)
            : payload;
        const request: WorkflowStoryboardGenerateRequest = {
          rowIndexes: Array.isArray(requestValue.rowIndexes)
            ? requestValue.rowIndexes.map(Number)
            : [],
          prompt: String(requestValue.prompt || scriptNode.data?.prompt || ""),
          modelId:
            typeof requestValue.modelId === "string"
              ? requestValue.modelId
              : undefined,
          workflowEndpointMethod:
            typeof requestValue.workflowEndpointMethod === "string"
              ? requestValue.workflowEndpointMethod
              : undefined,
          aspectRatio:
            typeof requestValue.aspectRatio === "string"
              ? requestValue.aspectRatio
              : undefined,
          imageSize:
            typeof requestValue.imageSize === "string"
              ? requestValue.imageSize
              : undefined,
          quality:
            typeof requestValue.quality === "string"
              ? requestValue.quality
              : undefined,
          generationCount: Number.isFinite(Number(requestValue.generationCount))
            ? Math.max(1, Math.round(Number(requestValue.generationCount)))
            : undefined,
          stylePreset:
            typeof requestValue.stylePreset === "string"
              ? requestValue.stylePreset
              : undefined,
          cameraControl:
            requestValue.cameraControl as WorkflowStoryboardGenerateRequest["cameraControl"],
          workflowExtraParameters:
            requestValue.workflowExtraParameters as WorkflowStoryboardGenerateRequest["workflowExtraParameters"],
          enableWebSearch: requestValue.enableWebSearch === true,
          deferGeneration: requestValue.deferGeneration === true,
          codexTaskId: command.codexTaskId,
        };
        const before = captureWorkflowIds();
        await action(nodeId, request);
        return { ...nodeResult(nodeId), ...workflowDelta(before) };
      }
      if (command.operation === "storyboard-regenerate-images") {
        const groupNode = currentWorkflow().nodes.find(
          (node) => node.id === nodeId && node.kind === "group",
        );
        if (!groupNode) throw new Error("分镜图组不存在");
        const action = codexNativeStoryboardActionsRef.current.regenerateImages;
        if (!action) throw new Error("分镜图重试能力尚未就绪");
        await action(nodeId);
        return nodeResult(nodeId);
      }
      if (command.operation === "storyboard-create-videos") {
        const groupNode = currentWorkflow().nodes.find(
          (node) => node.id === nodeId && node.kind === "group",
        );
        if (!groupNode) throw new Error("分镜图组不存在");
        const action = codexNativeStoryboardActionsRef.current.createVideos;
        if (!action) throw new Error("分镜视频生成能力尚未就绪");
        const requestValue =
          payload.request &&
          typeof payload.request === "object" &&
          !Array.isArray(payload.request)
            ? (payload.request as Record<string, unknown>)
            : payload;
        const request: WorkflowStoryboardVideoGenerateRequest = {
          modelId:
            typeof requestValue.modelId === "string"
              ? requestValue.modelId
              : undefined,
          aspectRatio:
            typeof requestValue.aspectRatio === "string"
              ? requestValue.aspectRatio
              : undefined,
          videoResolution:
            typeof requestValue.videoResolution === "string"
              ? requestValue.videoResolution
              : undefined,
          videoDuration:
            typeof requestValue.videoDuration === "string"
              ? requestValue.videoDuration
              : undefined,
          videoMethod:
            typeof requestValue.videoMethod === "string"
              ? requestValue.videoMethod
              : undefined,
          generationCount: Number.isFinite(Number(requestValue.generationCount))
            ? Math.max(1, Math.round(Number(requestValue.generationCount)))
            : undefined,
          generateAudio:
            typeof requestValue.generateAudio === "boolean"
              ? requestValue.generateAudio
              : undefined,
          enableWebSearch:
            typeof requestValue.enableWebSearch === "boolean"
              ? requestValue.enableWebSearch
              : undefined,
          workflowExtraParameters:
            requestValue.workflowExtraParameters as WorkflowStoryboardVideoGenerateRequest["workflowExtraParameters"],
          rowIndexes: Array.isArray(requestValue.rowIndexes)
            ? requestValue.rowIndexes.map(Number)
            : undefined,
          rowDurations:
            requestValue.rowDurations as WorkflowStoryboardVideoGenerateRequest["rowDurations"],
          deferGeneration: requestValue.deferGeneration === true,
          maxClipDurationSeconds:
            Number.isFinite(Number(requestValue.maxClipDurationSeconds)) &&
            Number(requestValue.maxClipDurationSeconds) > 0
              ? Number(requestValue.maxClipDurationSeconds)
              : undefined,
          plannedClipCount: Number.isFinite(
            Number(requestValue.plannedClipCount),
          )
            ? Number(requestValue.plannedClipCount)
            : undefined,
          outputGroupId:
            typeof requestValue.outputGroupId === "string"
              ? requestValue.outputGroupId
              : undefined,
          startClipIndex: Number.isFinite(Number(requestValue.startClipIndex))
            ? Number(requestValue.startClipIndex)
            : undefined,
          resumeTailFrameUrl:
            typeof requestValue.resumeTailFrameUrl === "string"
              ? requestValue.resumeTailFrameUrl
              : undefined,
          codexTaskId: command.codexTaskId,
        };
        const before = captureWorkflowIds();
        await action(nodeId, request);
        return { ...nodeResult(nodeId), ...workflowDelta(before) };
      }
      if (command.operation === "update") {
        const current = currentWorkflow();
        const currentNode = current.nodes.find((node) => node.id === nodeId);
        if (!currentNode) throw new Error("画布节点不存在");
        const sanitizedData = sanitizeCodexCanvasNodeData(
          payload.data,
        ) as Partial<LibTvWorkflowNode["data"]>;
        if (
          currentNode.kind === "playlist" &&
          Array.isArray(sanitizedData.playlistItems)
        ) {
          sanitizedData.playlistItems = hydrateLibTvWorkflowPlaylistItems(
            sanitizedData.playlistItems,
            current.nodes,
            currentNode.id,
          );
        }
        const recoveredMediaUrl =
          typeof sanitizedData.mediaUrl === "string"
            ? sanitizedData.mediaUrl.trim()
            : "";
        updateWorkflowNode(nodeId, {
          ...sanitizedData,
          ...(recoveredMediaUrl
            ? {
                workflowGenerationRunning: false,
                workflowGenerationProgress: undefined,
                workflowGenerationError: "",
                note: "",
              }
            : {}),
        });
        const positionValue =
          payload.position && typeof payload.position === "object"
            ? (payload.position as Record<string, unknown>)
            : null;
        if (positionValue) {
          const currentNode = currentWorkflow().nodes.find(
            (node) => node.id === nodeId,
          );
          moveWorkflowNode(nodeId, {
            x: Number.isFinite(Number(positionValue.x))
              ? Number(positionValue.x)
              : currentNode?.x,
            y: Number.isFinite(Number(positionValue.y))
              ? Number(positionValue.y)
              : currentNode?.y,
          });
        }
        return nodeResult(nodeId);
      }
      if (
        command.operation === "connect" ||
        command.operation === "disconnect"
      ) {
        const sourceNodeId = String(payload.sourceNodeId || "").trim();
        const targetNodeId = String(payload.targetNodeId || "").trim();
        if (!sourceNodeId || !targetNodeId)
          throw new Error("sourceNodeId 和 targetNodeId 不能为空");
        const current = currentWorkflow();
        if (
          !current.nodes.some((node) => node.id === sourceNodeId) ||
          !current.nodes.some((node) => node.id === targetNodeId)
        )
          throw new Error("连接节点不存在");
        const matchingEdges = current.edges.filter(
          (edge) =>
            edge.source === sourceNodeId && edge.target === targetNodeId,
        );
        if (command.operation === "connect") {
          if (!matchingEdges.length)
            addWorkflowEdge(sourceNodeId, targetNodeId);
        } else {
          matchingEdges.forEach((edge) => removeWorkflowEdge(edge.id));
        }
        return {
          sourceNodeId,
          targetNodeId,
          connected: command.operation === "connect",
        };
      }
      if (command.operation === "delete") {
        if (currentWorkflow().nodes.some((node) => node.id === nodeId))
          removeWorkflowNode(nodeId);
        return { nodeId, deleted: true };
      }
      const runNode = async (runPayload: Record<string, unknown>) => {
        const runNodeId = String(runPayload.nodeId || "").trim();
        if (!runNodeId) throw new Error("nodeId 不能为空");
        let beforeNode = currentWorkflow().nodes.find(
          (node) => node.id === runNodeId,
        );
        if (!beforeNode) throw new Error("画布节点不存在");
        const sanitizedRunData = sanitizeCodexCanvasNodeData({
          ...(typeof runPayload.prompt === "string"
            ? { prompt: runPayload.prompt }
            : {}),
          ...(typeof runPayload.modelId === "string"
            ? { modelId: runPayload.modelId }
            : {}),
          ...(typeof runPayload.aspectRatio === "string"
            ? { aspectRatio: runPayload.aspectRatio }
            : {}),
          ...(typeof runPayload.imageSize === "string"
            ? { imageSize: runPayload.imageSize }
            : {}),
          ...(typeof runPayload.quality === "string"
            ? { quality: runPayload.quality }
            : {}),
          ...(typeof runPayload.stylePreset === "string"
            ? { stylePreset: runPayload.stylePreset }
            : {}),
          ...(typeof runPayload.videoMethod === "string"
            ? { videoMethod: runPayload.videoMethod }
            : {}),
          ...(typeof runPayload.videoDuration === "string"
            ? { videoDuration: runPayload.videoDuration }
            : {}),
          ...(typeof runPayload.videoResolution === "string"
            ? { videoResolution: runPayload.videoResolution }
            : {}),
          ...(typeof runPayload.generationCount === "number"
            ? { generationCount: runPayload.generationCount }
            : {}),
          ...(typeof runPayload.generateAudio === "boolean"
            ? { generateAudio: runPayload.generateAudio }
            : {}),
          ...(typeof runPayload.enableWebSearch === "boolean"
            ? { enableWebSearch: runPayload.enableWebSearch }
            : {}),
          ...(typeof runPayload.workflowAssetStage === "string"
            ? { workflowAssetStage: runPayload.workflowAssetStage }
            : {}),
          ...(typeof runPayload.workflowAssetPersonaId === "string"
            ? { workflowAssetPersonaId: runPayload.workflowAssetPersonaId }
            : {}),
          ...(typeof runPayload.workflowAssetReviewStatus === "string"
            ? {
                workflowAssetReviewStatus: runPayload.workflowAssetReviewStatus,
              }
            : {}),
          ...(typeof runPayload.workflowSceneCleanPlate === "boolean"
            ? { workflowSceneCleanPlate: runPayload.workflowSceneCleanPlate }
            : {}),
          ...(runPayload.cameraControl &&
          typeof runPayload.cameraControl === "object"
            ? { cameraControl: runPayload.cameraControl }
            : {}),
          ...(runPayload.videoCameraMotion &&
          typeof runPayload.videoCameraMotion === "object"
            ? { videoCameraMotion: runPayload.videoCameraMotion }
            : {}),
          ...(runPayload.workflowExtraParameters &&
          typeof runPayload.workflowExtraParameters === "object"
            ? { workflowExtraParameters: runPayload.workflowExtraParameters }
            : {}),
        }) as WorkflowGenerationSubmitSettings & { prompt?: string };
        const runData: WorkflowGenerationSubmitSettings & { prompt?: string } =
          {
            ...sanitizedRunData,
            ...(beforeNode.kind === "video" ? { generateAudio: true } : {}),
          };
        const scriptV2Stage =
          runPayload.scriptV2Stage === "confirm-shots" ||
          runPayload.scriptV2Stage === "prepare-assets"
            ? runPayload.scriptV2Stage
            : undefined;
        if (Object.keys(runData).length > 0) {
          updateWorkflowNode(
            runNodeId,
            runData as Partial<LibTvWorkflowNode["data"]>,
          );
          beforeNode = {
            ...beforeNode,
            data: { ...beforeNode.data, ...runData },
          };
        }
        const beforeMediaUrl = String(beforeNode.data?.mediaUrl || "");
        const runSignature = codexCanvasRunSignature(
          beforeNode,
          currentWorkflow().edges,
        );
        if (
          runPayload.force !== true &&
          beforeMediaUrl &&
          codexCanvasRunSignaturesRef.current.get(runNodeId) === runSignature
        ) {
          return {
            ...runResult(runNodeId),
            reused: true,
            reason: "unchanged-successful-node",
          };
        }
        const started = await handleGenerateWorkflowNodeRef.current(
          runNodeId,
          typeof runData.prompt === "string" ? runData.prompt : undefined,
          { ...runData, ...(scriptV2Stage ? { scriptV2Stage } : {}) },
        );
        if (started === false)
          throw new Error(
            String(
              currentWorkflow().nodes.find((node) => node.id === runNodeId)
                ?.data?.workflowGenerationError || "原生生成器未能启动",
            ),
          );
        const afterStartNode = currentWorkflow().nodes.find(
          (node) => node.id === runNodeId,
        );
        const isMediaNode =
          beforeNode.kind === "image" ||
          beforeNode.kind === "video" ||
          beforeNode.kind === "audio" ||
          beforeNode.kind === "threed";
        if (
          isMediaNode &&
          afterStartNode &&
          !isWorkflowNodeGenerationBusy(afterStartNode) &&
          String(afterStartNode.data?.mediaUrl || "") === beforeMediaUrl
        ) {
          throw new Error(
            String(
              afterStartNode.data?.workflowGenerationError ||
                "原生生成器未启动，请检查提示词、模型与参考素材",
            ),
          );
        }
        const settled = await waitForWorkflowNodeGenerationSettled(runNodeId);
        if (!settled.success) throw new Error(settled.error || "生成失败");
        const completedNode = currentWorkflow().nodes.find(
          (node) => node.id === runNodeId,
        );
        if (completedNode?.data?.mediaUrl) {
          codexCanvasRunSignaturesRef.current.set(
            runNodeId,
            codexCanvasRunSignature(completedNode, currentWorkflow().edges),
          );
        }
        return runResult(runNodeId);
      };
      if (command.operation === "run") {
        return runNode(payload);
      }
      if (command.operation === "run-batch") {
        const items = Array.isArray(payload.items)
          ? payload.items.filter((item): item is Record<string, unknown> =>
              Boolean(item && typeof item === "object" && !Array.isArray(item)),
            )
          : [];
        if (!items.length) throw new Error("run-batch items 不能为空");
        if (items.length > 200)
          throw new Error("run-batch 最多支持 200 个任务");
        const nodeIds = items.map((item) => String(item.nodeId || "").trim());
        if (nodeIds.some((itemNodeId) => !itemNodeId))
          throw new Error("run-batch 每个任务都需要 nodeId");
        if (new Set(nodeIds).size !== nodeIds.length)
          throw new Error("run-batch 不能重复运行同一个节点");
        const concurrency = Math.max(
          1,
          Math.min(
            200,
            items.length,
            Math.floor(Number(payload.concurrency) || 200),
          ),
        );
        const results: Array<Record<string, unknown> | undefined> = new Array(
          items.length,
        );
        let nextIndex = 0;
        let providerAccessStop = "";
        const worker = async () => {
          while (!providerAccessStop) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= items.length) return;
            const itemPayload = items[index];
            const itemNodeId = String(itemPayload.nodeId || "").trim();
            try {
              results[index] = {
                index,
                nodeId: itemNodeId,
                ok: true,
                result: await runNode(itemPayload),
              };
            } catch (error) {
              const errorMessage =
                error instanceof Error
                  ? error.message
                  : String(error || "生成失败");
              results[index] = {
                index,
                nodeId: itemNodeId,
                ok: false,
                error: errorMessage,
              };
              if (isWorkflowProviderAccessError(error)) {
                providerAccessStop = errorMessage;
              }
            }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        const stoppedMessage = providerAccessStop || "批量生成已停止";
        for (let index = 0; index < items.length; index += 1) {
          if (results[index]) continue;
          results[index] = {
            index,
            nodeId: String(items[index].nodeId || "").trim(),
            ok: false,
            skipped: true,
            error: stoppedMessage,
          };
        }
        const settledItems = results as Array<Record<string, unknown>>;
        return {
          concurrency,
          itemCount: settledItems.length,
          succeededCount: settledItems.filter((item) => item.ok === true)
            .length,
          failedCount: settledItems.filter((item) => item.ok !== true).length,
          stoppedByProviderAccess: Boolean(providerAccessStop),
          items: settledItems,
        };
      }
      if (command.operation === "wait") {
        const timeoutMs = Math.max(
          1000,
          Math.min(
            2 * 60 * 60 * 1000,
            Number(payload.timeoutMs || 2 * 60 * 60 * 1000),
          ),
        );
        const settled = await waitForWorkflowNodeGenerationSettled(
          nodeId,
          timeoutMs,
        );
        if (!settled.success) throw new Error(settled.error || "等待生成失败");
        return nodeResult(nodeId);
      }
      if (command.operation === "inspect-result") {
        return nodeResult(nodeId, {
          include: Array.isArray(payload.include)
            ? payload.include.map((item) => String(item || ""))
            : [],
          rowOffset: Number(payload.rowOffset || 0),
          rowLimit: Number(payload.rowLimit || 20),
        });
      }
      throw new Error("不支持的画布命令");
    },
    [
      addWorkflowEdge,
      addWorkflowNode,
      codexCanvasSessionId,
      focusCodexWorkflowNodes,
      handleCreateScriptInputNode,
      moveWorkflowNode,
      projectId,
      removeWorkflowEdge,
      removeWorkflowNode,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const executeCodexCanvasCommandRef = useRef(executeCodexCanvasCommand);
  useEffect(() => {
    executeCodexCanvasCommandRef.current = executeCodexCanvasCommand;
  }, [executeCodexCanvasCommand]);

  useEffect(() => {
    if (readOnly || !projectId || !codexCanvasSessionId) return;
    let disposed = false;
    let timer: number | null = null;
    let claimController: AbortController | null = null;
    const postCommandResult = async (
      command: CodexCanvasCommand,
      result?: unknown,
      error?: unknown,
    ) => {
      const resultValue =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, any>)
          : {};
      const batchItems = Array.isArray(resultValue.items)
        ? resultValue.items
        : [];
      const responseBody = JSON.stringify({
        workflow_project_id: projectId,
        canvas_session_id: codexCanvasSessionId,
        ok: !error,
        result,
        error: error instanceof Error ? error.message : String(error || ""),
      });
      let response: Response | null = null;
      let responseError: unknown = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          response = await fetch(
            `/api/codex/workflow/canvas/commands/${encodeURIComponent(command.id)}/result`,
            {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: responseBody,
            },
          );
          if (response.ok) break;
          responseError = new Error(
            `画布命令回写失败: HTTP ${response.status}`,
          );
          if (response.status < 500 && response.status !== 429) break;
        } catch (cause) {
          responseError = cause;
        }
        await new Promise((resolve) =>
          window.setTimeout(resolve, 350 * (attempt + 1)),
        );
      }
      if (!response?.ok) throw responseError || new Error("画布命令回写失败");

      if (
        (command.operation === "run" || command.operation === "run-batch") &&
        typeof window !== "undefined"
      ) {
        const dispatchSettled = (
          runPayload: Record<string, unknown>,
          settledResult: unknown,
          settledError: unknown,
          eventCommandId: string,
        ) => {
          const settledValue =
            settledResult &&
            typeof settledResult === "object" &&
            !Array.isArray(settledResult)
              ? (settledResult as Record<string, any>)
              : {};
          const node =
            settledValue.node && typeof settledValue.node === "object"
              ? settledValue.node
              : {};
          const data =
            node.data && typeof node.data === "object" ? node.data : {};
          const settledKind = String(
            settledValue.kind || node.kind || runPayload.kind || "",
          ).trim();
          const kind = normalizeWorkflowGenerationKind(
            settledKind,
            settledKind,
          );
          const outputCandidates = [
            settledValue.mediaUrl,
            ...(Array.isArray(settledValue.mediaUrls)
              ? settledValue.mediaUrls
              : []),
            data.playlistExportUrl,
            settledValue.outputNode?.data?.mediaUrl,
            data.mediaUrl,
            ...(Array.isArray(data.workflowImageResults)
              ? data.workflowImageResults
              : []),
            ...(Array.isArray(data.workflowVideoResults)
              ? data.workflowVideoResults
              : []),
          ];
          const resultUrls = Array.from(
            new Set(
              outputCandidates
                .map((item) =>
                  String(
                    typeof item === "string"
                      ? item
                      : item?.url || item?.mediaUrl || "",
                  ).trim(),
                )
                .filter(Boolean),
            ),
          );
          const errorMessage =
            settledError instanceof Error
              ? settledError.message
              : String(
                  settledError ||
                    settledValue.error ||
                    data.workflowGenerationError ||
                    "",
                ).trim();
          if (!errorMessage && resultUrls.length === 0) return;
          publishWorkflowCanvasGenerationSettlement({
            source: "workflow-canvas",
            commandId: eventCommandId,
            codexTaskId: String(command.codexTaskId || "").trim(),
            generationTaskId: String(
              data.workflowCodexGenerationTaskId ||
                settledValue.taskId ||
                data.workflowGenerationTaskId ||
                settledValue.nodeId ||
                node.id ||
                runPayload.nodeId ||
                "",
            ).trim(),
            nodeId: String(
              settledValue.nodeId || node.id || runPayload.nodeId || "",
            ).trim(),
            status: errorMessage ? "failed" : "complete",
            kind,
            nodeKind: settledKind as LibTvWorkflowNodeKind,
            prompt: String(
              data.workflowInternalPrompt ||
                data.prompt ||
                runPayload.prompt ||
                "",
            ).trim(),
            resultUrls,
            error: errorMessage,
            aspectRatio: String(
              settledValue.aspectRatio ||
                data.aspectRatio ||
                runPayload.aspectRatio ||
                "",
            ).trim(),
            width:
              Number(
                settledValue.width ||
                  data.workflowMediaNaturalWidth ||
                  node.width ||
                  runPayload.width,
              ) || undefined,
            height:
              Number(
                settledValue.height ||
                  data.workflowMediaNaturalHeight ||
                  node.height ||
                  runPayload.height,
              ) || undefined,
            modelId: String(
              settledValue.modelId || data.modelId || runPayload.modelId || "",
            ).trim(),
          });
        };
        if (command.operation === "run") {
          dispatchSettled(command.payload || {}, result, error, command.id);
        } else {
          const runItems = Array.isArray(command.payload?.items)
            ? command.payload.items.filter(
                (item): item is Record<string, unknown> =>
                  Boolean(
                    item && typeof item === "object" && !Array.isArray(item),
                  ),
              )
            : [];
          runItems.forEach((runPayload, index) => {
            const nodeId = String(runPayload.nodeId || "").trim();
            const settledItem =
              batchItems.find(
                (item: any) =>
                  String(
                    item?.nodeId ||
                      item?.result?.nodeId ||
                      item?.result?.node?.id ||
                      "",
                  ).trim() === nodeId,
              ) || batchItems[index];
            dispatchSettled(
              runPayload,
              settledItem?.result,
              settledItem?.error || error,
              `${command.id}:${nodeId || index}`,
            );
          });
        }
      }
    };
    const poll = async () => {
      try {
        claimController = new AbortController();
        const response = await fetch(
          "/api/codex/workflow/canvas/commands/claim",
          {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workflow_project_id: projectId,
              canvas_session_id: codexCanvasSessionId,
              wait_ms: 15_000,
            }),
            signal: claimController.signal,
          },
        );
        if (!response.ok)
          throw new Error(`画布命令领取失败: HTTP ${response.status}`);
        const command = (await response
          .json()
          .catch(() => null)) as CodexCanvasCommand | null;
        if (command?.id) {
          try {
            const result = await executeCodexCanvasCommandRef.current(command);
            await postCommandResult(command, result);
          } catch (error) {
            await postCommandResult(command, undefined, error);
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          console.warn("[CodexCanvasBridge] poll failed", error);
      } finally {
        claimController = null;
        if (!disposed) timer = window.setTimeout(poll, 80);
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      claimController?.abort();
    };
  }, [codexCanvasSessionId, projectId, readOnly]);

  const executeStoryboardImageJobs = useCallback(
    async (params: {
      projectId: string;
      sourceNode: LibTvWorkflowNode;
      groupNodeId: string;
      scriptResult: LibTvStoryboardScriptResult;
      rowIndexes: number[];
      rowNodeByIndex: Map<number, string>;
      rowReferenceNodesByIndex: Map<number, LibTvWorkflowNode[]>;
      modelId: string;
      workflowEndpointMethod?: string;
      aspectRatio?: string;
      imageSize?: string;
      quality?: string;
      generationCount?: number;
      stylePreset?: string;
      cameraControl?: LibTvWorkflowNode["data"]["cameraControl"];
      workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
      enableWebSearch?: boolean;
      fallbackPrompt?: string;
      runningNotePrefix: string;
    }) => {
      const extraGenerationOptions = buildWorkflowExtraGenerationOptions(
        params.workflowExtraParameters,
      );
      const generatedStoryboardRowUrls = new Map<number, string>();
      const rowErrorIndexes = new Set<number>();
      const totalCount = Math.max(1, params.rowIndexes.length);
      let storyboardProgressTimer: ReturnType<
        typeof startWorkflowStoryboardEstimatedProgress
      > | null = null;
      const updateAggregateProgress = () => {
        const completedCount = generatedStoryboardRowUrls.size;
        const settledCount = completedCount + rowErrorIndexes.size;
        const progress = Math.max(
          0.03,
          Math.min(0.96, settledCount / totalCount),
        );
        updateWorkflowNode(params.sourceNode.id, {
          note: `${params.runningNotePrefix} ${completedCount}/${totalCount}`,
          workflowGenerationRunning: settledCount < totalCount,
          workflowGenerationProgress: progress,
          workflowGenerationError: "",
        });
        updateWorkflowNode(params.groupNodeId, {
          note: `${params.runningNotePrefix} ${completedCount}/${totalCount}`,
          groupRunning: settledCount < totalCount,
        });
        storyboardProgressTimer?.tick();
      };
      const applyImages = (rowIndex: number, urls: string[]) => {
        const targetChildId = params.rowNodeByIndex.get(rowIndex);
        if (!targetChildId || generatedStoryboardRowUrls.has(rowIndex)) return;
        const resultUrls = Array.from(
          new Set(urls.map((url) => String(url || "").trim()).filter(Boolean)),
        );
        const firstUrl = resultUrls[0];
        if (!firstUrl) return;
        generatedStoryboardRowUrls.set(rowIndex, firstUrl);
        updateWorkflowNode(targetChildId, {
          mediaUrl: firstUrl,
          workflowImageResults:
            resultUrls.length > 1
              ? resultUrls.map((url, index) => ({
                  url,
                  title: `分镜 ${rowIndex + 1} · 方案 ${index + 1}`,
                }))
              : undefined,
          workflowImageResultsCollapsed:
            resultUrls.length > 1 ? true : undefined,
          // A storyboard shot remains a native generator after it settles.
          // The prompt/reference controls and the left input handle must
          // stay mounted so persisted reference edges never become
          // visually detached when the result arrives.
          ...WORKFLOW_STORYBOARD_GENERATOR_IDENTITY,
          workflowGenerationRunning: false,
          workflowGenerationProgress: 1,
          workflowGenerationError: "",
          note: "",
        });
        updateAggregateProgress();
      };

      storyboardProgressTimer = startWorkflowStoryboardEstimatedProgress({
        rowIndexes: params.rowIndexes,
        rowNodeByIndex: params.rowNodeByIndex,
        sourceNodeId: params.sourceNode.id,
        groupNodeId: params.groupNodeId,
        runningNotePrefix: params.runningNotePrefix,
        updateWorkflowNode,
        getCompletedCount: () => generatedStoryboardRowUrls.size,
        isRowSettled: (rowIndex) =>
          generatedStoryboardRowUrls.has(rowIndex) ||
          rowErrorIndexes.has(rowIndex),
      });

      try {
        await runWorkflowStoryboardRowsWithConcurrency(
          params.rowIndexes,
          Math.min(200, params.rowIndexes.length),
          async (rowIndex) => {
            const childId = params.rowNodeByIndex.get(rowIndex);
            if (!childId) return;
            const row = params.scriptResult.rows[rowIndex];
            const migratedPrompt = buildWorkflowStoryboardImagePrompt({
              result: params.scriptResult,
              rowIndex,
              cameraControl: params.cameraControl,
            });
            const rowPrompt =
              migratedPrompt ||
              resolveWorkflowStoryboardRowImagePrompt(
                row,
                params.fallbackPrompt,
              );
            const referenceNodes =
              params.rowReferenceNodesByIndex.get(rowIndex) || [];
            const referenceImages = await Promise.all(
              referenceNodes
                .map((node) => getWorkflowNodeReferenceImageUrl(node))
                .filter(Boolean)
                .map((url) =>
                  resolveWorkflowApiImageSource(url).catch(() =>
                    String(url || "").trim(),
                  ),
                ),
            );
            try {
              const workflowEndpointMethod =
                (await resolveWorkflowImageMethodForModel(
                  params.modelId,
                  referenceImages.some(Boolean),
                ).catch(() => "")) || params.workflowEndpointMethod;
              const generationCount = Math.max(
                1,
                Math.round(Number(params.generationCount || 1) || 1),
              );
              const createdJob = await createWorkflowCanvasBackendJob({
                projectId: params.projectId,
                kind: "image_generate",
                request: {
                  ...extraGenerationOptions,
                  prompt: rowPrompt || "请根据当前分镜信息生成分镜图。",
                  rawPrompt: rowPrompt,
                  model: params.modelId,
                  workflowEndpointMethod: workflowEndpointMethod || undefined,
                  ...(params.aspectRatio
                    ? { aspectRatio: params.aspectRatio }
                    : {}),
                  ...(params.imageSize ? { imageSize: params.imageSize } : {}),
                  ...(params.quality ? { quality: params.quality } : {}),
                  count: generationCount,
                  referenceImages: referenceImages.filter(Boolean),
                  referenceImageNodeIds: referenceNodes.map((node) => node.id),
                  referenceImageRoles: referenceNodes.map(
                    (node) =>
                      normalizeWorkflowScriptV2AssetKind(
                        (node.data as any)?.workflowScriptV2AssetKind,
                      ) || "reference",
                  ),
                  workflowNodeId: childId,
                  workflowStoryboardSourceNodeId: params.sourceNode.id,
                  workflowStoryboardSourceRowIndex: rowIndex,
                  workflowStoryboardGroupNodeId: params.groupNodeId,
                  cameraControl: params.cameraControl,
                  stylePreset: params.stylePreset || undefined,
                  tools: params.enableWebSearch
                    ? [{ type: "web_search" }]
                    : undefined,
                  payload: params.enableWebSearch
                    ? JSON.stringify({
                        google_search: true,
                        google_image_search: true,
                      })
                    : undefined,
                  projectId: params.projectId,
                  category: "workflow_storyboard_image",
                },
              });
              updateWorkflowNode(childId, {
                workflowGenerationJobId: createdJob.id,
                workflowGenerationRunning: true,
                workflowGenerationProgress: Number.isFinite(
                  Number(createdJob.resultData?.progress),
                )
                  ? Math.max(
                      0.03,
                      Math.min(0.99, Number(createdJob.resultData?.progress)),
                    )
                  : 0.03,
                workflowGenerationError: "",
                note: normalizeWorkflowImageGeneratingNote(
                  createdJob.resultData?.message,
                ),
              });
              const completedJob = await waitWorkflowCanvasBackendJob({
                jobId: createdJob.id,
                maxAttempts: 360,
                onProgress: (job) => {
                  const progressLabel = String(
                    job.resultData?.message || "",
                  ).trim();
                  updateWorkflowNode(childId, {
                    workflowGenerationJobId: job.id,
                    workflowGenerationRunning: true,
                    workflowGenerationProgress: Number.isFinite(
                      Number(job.resultData?.progress),
                    )
                      ? Math.max(
                          0.03,
                          Math.min(0.99, Number(job.resultData?.progress)),
                        )
                      : undefined,
                    note: normalizeWorkflowImageGeneratingNote(progressLabel),
                  });
                },
              });
              const resultUrls = collectWorkflowCanvasJobResultUrls(
                completedJob.resultData?.response || completedJob.resultUrl,
              );
              const fallbackResultUrl =
                resolveWorkflowCanvasBackendJobResultUrl(completedJob);
              const normalizedResultUrls = Array.from(
                new Set(
                  [...resultUrls, fallbackResultUrl]
                    .map((url) => String(url || "").trim())
                    .filter(Boolean),
                ),
              );
              if (normalizedResultUrls.length === 0)
                throw new Error("图片生成未返回结果");
              applyImages(rowIndex, normalizedResultUrls);
            } catch (error) {
              rowErrorIndexes.add(rowIndex);
              const messageText =
                error instanceof Error ? error.message : "分镜图生成失败";
              updateWorkflowNode(childId, {
                note: messageText.slice(0, 80),
                workflowGenerationRunning: false,
                workflowGenerationProgress: undefined,
                workflowGenerationError: messageText,
              });
              updateAggregateProgress();
              if (isWorkflowProviderAccessError(error)) throw error;
            }
          },
        );
      } finally {
        storyboardProgressTimer?.stop();
      }

      return {
        images: params.rowIndexes
          .map((rowIndex) => ({
            rowIndex,
            url: generatedStoryboardRowUrls.get(rowIndex) || "",
          }))
          .filter((item) => item.url),
        rowErrorIndexes,
      };
    },
    [updateWorkflowNode],
  );

  const handleGenerateStoryboardFromScript = useCallback(
    async (nodeId: string, request: WorkflowStoryboardGenerateRequest) => {
      const sourceNode = nodes.find(
        (node) => node.id === nodeId && isWorkflowScriptKind(node.kind),
      );
      const scriptResult = sourceNode?.data?.scriptResult || null;
      if (!sourceNode || !scriptResult?.rows?.length) {
        if (sourceNode)
          updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
        message.warning("脚本生成器还没有可用的镜头脚本");
        return;
      }
      if (!projectId) {
        updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
        message.error("项目未初始化，无法生成分镜图");
        return;
      }
      const rowIndexes = Array.from(
        new Set(
          (request.rowIndexes || [])
            .map((value) => Math.round(Number(value)))
            .filter(
              (value) =>
                Number.isInteger(value) &&
                value >= 0 &&
                value < scriptResult.rows.length,
            ),
        ),
      ).sort((a, b) => a - b);
      if (rowIndexes.length === 0) {
        updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
        message.warning("请至少勾选一个镜头");
        return;
      }
      const modelId = String(request.modelId || "").trim();
      if (!modelId) {
        updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
        message.warning("请选择图片模型");
        return;
      }
      const storyboardImageModel = await resolveWorkflowModelOptionById(
        "image",
        modelId,
      );
      if (!storyboardImageModel) {
        updateWorkflowNode(sourceNode.id, { suppressGenerationBar: false });
        message.warning("当前图片模型已不可用，请重新选择");
        return;
      }
      const sourceAssets = (sourceNode.data as any)?.scriptV2AssetsByKind;
      const sourceHasReferences = Boolean(
        sourceAssets &&
        typeof sourceAssets === "object" &&
        Object.values(sourceAssets).some(
          (items) => Array.isArray(items) && items.length > 0,
        ),
      );
      const requestEndpointMethod =
        String(request.workflowEndpointMethod || "").trim() ||
        (await resolveWorkflowImageMethodForModel(
          modelId,
          sourceHasReferences,
        ));
      const requestAspectRatio = workflowCanvasChoiceForEndpoint(
        request.aspectRatio,
        storyboardImageModel.parameters?.aspectRatios,
        requestEndpointMethod,
      );
      const requestImageSize = workflowCanvasChoiceForEndpoint(
        request.imageSize,
        storyboardImageModel.parameters?.resolutions,
        requestEndpointMethod,
      );
      const requestGenerationCountValue = workflowCanvasChoiceForEndpoint(
        request.generationCount,
        storyboardImageModel.parameters?.counts,
        requestEndpointMethod,
      );
      const requestGenerationCount = requestGenerationCountValue
        ? Math.max(1, Math.round(Number(requestGenerationCountValue) || 1))
        : undefined;
      const deferGeneration = request.deferGeneration === true;

      const isScriptV2Storyboard = sourceNode.kind === "script-v2";
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const ratioSize = parseWorkflowAspectRatioSize(
        requestAspectRatio || "16:9",
        16,
        9,
      );
      const storyboardGrid = isScriptV2Storyboard
        ? workflowStoryboardImageGridFrame(
            rowIndexes.length,
            requestAspectRatio || "16:9",
          )
        : (() => {
            const columns = 1;
            const cellWidth = 340;
            const cellHeight = Math.round(
              (cellWidth * ratioSize.height) / Math.max(1, ratioSize.width),
            );
            const gap = 12;
            const rows = Math.ceil(rowIndexes.length / columns);
            return {
              columns,
              rows,
              gap,
              padX: 28,
              padTop: 44,
              padBottom: 28,
              cellWidth,
              cellHeight,
              width: Math.max(
                320,
                columns * cellWidth + Math.max(0, columns - 1) * gap + 56,
              ),
              height: Math.max(
                260,
                rows * cellHeight + Math.max(0, rows - 1) * gap + 56,
              ),
            };
          })();
      const { columns, cellWidth, cellHeight, gap } = storyboardGrid;
      const groupWidth = storyboardGrid.width;
      const groupHeight = storyboardGrid.height;
      const codexTaskId = String(
        request.codexTaskId || sourceNode.data?.workflowCodexTaskId || "",
      ).trim();
      const groupPlacement = allocateCodexWorkflowTaskPlacement({
        nodes: workflowNodesRef.current.map(getCodexWorkflowTaskPlacementNode),
        taskId: codexTaskId,
        stage: "storyboard",
        bounds: getWorkflowVisibleBounds({
          flow: flowRef.current,
          container: containerRef.current,
        }),
        width: groupWidth,
        height: groupHeight,
        preferredPosition: codexTaskId
          ? null
          : {
              x: Number(sourceNode.x || 0) + sourceWidth + 260,
              y:
                Number(sourceNode.y || 0) +
                Math.round((sourceHeight - groupHeight) / 2),
            },
      });
      const groupX = groupPlacement.placement.x;
      const groupY = groupPlacement.placement.y;
      const groupNode = addWorkflowNode("group", {
        x: groupX,
        y: groupY,
        linkFromNodeId: sourceNode.id,
        linkToNodeId: null,
      });
      moveWorkflowNode(groupNode.id, {
        width: groupWidth,
        height: groupHeight,
      });
      const childNodes = rowIndexes.map((rowIndex, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const childX = storyboardGrid.padX + column * (cellWidth + gap);
        const childY = storyboardGrid.padTop + row * (cellHeight + gap);
        const child = addWorkflowNode("image", {
          x: childX,
          y: childY,
          linkFromNodeId: null,
          linkToNodeId: null,
        });
        moveWorkflowNode(child.id, {
          x: childX,
          y: childY,
          width: cellWidth,
          height: cellHeight,
        });
        updateWorkflowNode(child.id, {
          title: `分镜 ${rowIndex + 1}`,
          mediaUrl: "",
          ...WORKFLOW_STORYBOARD_GENERATOR_IDENTITY,
          content: "",
          prompt: resolveWorkflowStoryboardRowImagePrompt(
            scriptResult.rows[rowIndex],
            request.prompt,
          ),
          selectedOptionId: "custom",
          options: [],
          modelId,
          workflowEndpointMethod: requestEndpointMethod || undefined,
          ...(requestAspectRatio ? { aspectRatio: requestAspectRatio } : {}),
          ...(requestImageSize ? { imageSize: requestImageSize } : {}),
          ...(request.quality ? { quality: request.quality } : {}),
          stylePreset: request.stylePreset || undefined,
          cameraControl: request.cameraControl,
          workflowExtraParameters: request.workflowExtraParameters,
          enableWebSearch: request.enableWebSearch === true,
          ...(requestGenerationCount
            ? { generationCount: requestGenerationCount }
            : {}),
          workflowGenerationResultIndex: index,
          workflowStoryboardSourceRowIndex: rowIndex,
          workflowStoryboardSourceNodeId: sourceNode.id,
          workflowStoryboardDuration: String(
            scriptResult.rows[rowIndex]?.duration || "",
          ),
          ...(codexTaskId
            ? {
                workflowGenerationController: "codex",
                workflowCodexTaskId: codexTaskId,
              }
            : {}),
          workflowGenerationRunning: !deferGeneration,
          workflowGenerationProgress: deferGeneration ? undefined : 0.03,
          workflowGenerationError: "",
          note: deferGeneration ? "等待整组执行" : "等待生成",
        });
        return { id: child.id, rowIndex };
      });
      updateWorkflowNode(groupNode.id, {
        title: `${String(sourceNode.data?.title || scriptResult.title || "分镜").trim()} 分镜图`,
        content: "",
        prompt: String(request.prompt || ""),
        mediaUrl: "",
        mediaRole: undefined,
        selectedOptionId: "custom",
        options: [],
        modelId,
        workflowEndpointMethod: requestEndpointMethod || undefined,
        ...(requestAspectRatio ? { aspectRatio: requestAspectRatio } : {}),
        ...(requestImageSize ? { imageSize: requestImageSize } : {}),
        ...(request.quality ? { quality: request.quality } : {}),
        stylePreset: request.stylePreset || undefined,
        cameraControl: request.cameraControl,
        workflowExtraParameters: request.workflowExtraParameters,
        enableWebSearch: request.enableWebSearch === true,
        ...(requestGenerationCount
          ? { generationCount: requestGenerationCount }
          : {}),
        ...(codexTaskId
          ? {
              workflowGenerationController: "codex",
              workflowCodexTaskId: codexTaskId,
              workflowCodexLayoutAnchorX: groupPlacement.anchor.x,
              workflowCodexLayoutAnchorY: groupPlacement.anchor.y,
              workflowCodexLayoutIndex: groupPlacement.layoutIndex,
              workflowCodexLayoutStage: groupPlacement.layoutStage,
              workflowCodexLayoutRow: groupPlacement.layoutRow,
            }
          : {}),
        workflowStoryboardPending: deferGeneration,
        workflowStoryboardSourceNodeId: sourceNode.id,
        workflowStoryboardRowIndexes: rowIndexes,
        groupNodeIds: childNodes.map((child) => child.id),
        groupBackgroundColor: "transparent",
        groupRunning: !deferGeneration,
        note: deferGeneration
          ? "等待整组执行"
          : `正在生成分镜图 0/${rowIndexes.length}`,
      } as any);
      useCanvasStore.setState(
        (state: ReturnType<typeof useCanvasStore.getState>) => ({
          libtvWorkflow: {
            ...state.libtvWorkflow,
            activeNodeId: groupNode.id,
            nodes: [
              ...state.libtvWorkflow.nodes.filter(
                (node: LibTvWorkflowNode) => node.id === groupNode.id,
              ),
              ...state.libtvWorkflow.nodes
                .filter((node: LibTvWorkflowNode) => node.id !== groupNode.id)
                .map((node: LibTvWorkflowNode) =>
                  childNodes.some((child) => child.id === node.id)
                    ? { ...node, parentId: groupNode.id }
                    : node,
                ),
            ],
          },
          selectedIds: [groupNode.id],
        }),
      );
      const latestWorkflowForAssets = useCanvasStore.getState().libtvWorkflow;
      const latestSourceNode =
        latestWorkflowForAssets.nodes.find(
          (node) =>
            node.id === sourceNode.id && isWorkflowScriptKind(node.kind),
        ) || sourceNode;
      const scriptV2AssetReferenceNodes =
        getWorkflowStoryboardAssetNodesForScript(
          latestSourceNode,
          latestWorkflowForAssets.nodes,
          latestWorkflowForAssets.edges,
        );
      const storyboardAssetGroupId = resolveWorkflowStoryboardAssetGroupId(
        (latestSourceNode.data as Record<string, any>)?.scriptV2AssetGroupId,
        latestWorkflowForAssets.nodes,
        groupNode.id,
        scriptV2AssetReferenceNodes.map((node) => node.id),
      );
      const rowReferenceNodesByIndex = new Map<number, LibTvWorkflowNode[]>();
      const storyboardAssetEdges: Array<{ source: string; target: string }> =
        [];
      const childReferencePatchById = new Map<
        string,
        Partial<LibTvWorkflowNode["data"]>
      >();
      childNodes.forEach((child) => {
        const row = scriptResult.rows[child.rowIndex];
        const matchedAssetNodes =
          scriptV2AssetReferenceNodes.length > 0
            ? getWorkflowStoryboardAssetReferenceNodesForRow(
                row,
                scriptV2AssetReferenceNodes,
              )
            : [];
        rowReferenceNodesByIndex.set(child.rowIndex, matchedAssetNodes);
        matchedAssetNodes.forEach((referenceNode) => {
          storyboardAssetEdges.push({
            source: referenceNode.id,
            target: child.id,
          });
        });
        childReferencePatchById.set(child.id, {
          referenceImages: matchedAssetNodes
            .map((node) => getWorkflowNodeReferenceImageUrl(node))
            .filter(Boolean),
          referenceImageNodeIds: matchedAssetNodes.map((node) => node.id),
          referenceImageRoles: matchedAssetNodes.map(
            (node) =>
              normalizeWorkflowScriptV2AssetKind(
                (node.data as any)?.workflowScriptV2AssetKind,
              ) || "reference",
          ),
        } as any);
      });
      useCanvasStore.setState(
        (state: ReturnType<typeof useCanvasStore.getState>) => ({
          libtvWorkflow: {
            ...state.libtvWorkflow,
            nodes: state.libtvWorkflow.nodes.map((node: LibTvWorkflowNode) => {
              const patch = childReferencePatchById.get(node.id);
              return patch
                ? { ...node, data: { ...node.data, ...patch } }
                : node;
            }),
            edges: normalizeWorkflowStoryboardTopologyEdges({
              currentEdges: state.libtvWorkflow.edges,
              scriptNodeId: sourceNode.id,
              storyboardGroupId: groupNode.id,
              storyboardNodeIds: childNodes.map((child) => child.id),
              assetGroupId: storyboardAssetGroupId,
              assetNodeIds: scriptV2AssetReferenceNodes.map((node) => node.id),
              assetEdges: storyboardAssetEdges,
            }),
          },
        }),
      );
      selectLayer(groupNode.id);
      setActiveWorkflowNode(groupNode.id);
      if (deferGeneration) {
        updateWorkflowNode(sourceNode.id, {
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          suppressGenerationBar: false,
        });
        message.success(
          `已创建 ${rowIndexes.length} 个分镜占位，点击整组执行后开始生成`,
        );
        return;
      }

      updateWorkflowNode(sourceNode.id, {
        note: `正在生成分镜图 0/${rowIndexes.length}`,
        workflowGenerationRunning: true,
        workflowGenerationCategory: "workflow_angle_edit",
        workflowGenerationProgress: 0.03,
        workflowGenerationError: "",
        suppressGenerationBar: true,
      });
      try {
        const rowNodeByIndex = new Map(
          childNodes.map((child) => [child.rowIndex, child.id]),
        );
        const { images, rowErrorIndexes } = await executeStoryboardImageJobs({
          projectId,
          sourceNode,
          groupNodeId: groupNode.id,
          scriptResult,
          rowIndexes,
          rowNodeByIndex,
          rowReferenceNodesByIndex,
          modelId,
          workflowEndpointMethod: requestEndpointMethod || undefined,
          aspectRatio: requestAspectRatio || undefined,
          imageSize: requestImageSize || undefined,
          quality: request.quality || undefined,
          generationCount: requestGenerationCount,
          stylePreset: request.stylePreset || undefined,
          cameraControl: request.cameraControl,
          workflowExtraParameters: request.workflowExtraParameters,
          enableWebSearch: request.enableWebSearch === true,
          fallbackPrompt: request.prompt || "",
          runningNotePrefix: "正在生成分镜图",
        });
        if (images.length === 0) throw new Error("分镜生成未返回图片");

        const generatedStoryboardRowUrls = new Map(
          images.map((image) => [image.rowIndex, image.url]),
        );
        const nextScriptResult = {
          ...scriptResult,
          rows: scriptResult.rows.map((row, rowIndex) => ({
            ...row,
            referenceImage:
              generatedStoryboardRowUrls.get(rowIndex) || row.referenceImage,
          })),
        };
        updateWorkflowNode(sourceNode.id, {
          scriptResult: nextScriptResult as any,
          note: "",
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          suppressGenerationBar: false,
        });
        childNodes.forEach((child) => {
          if (generatedStoryboardRowUrls.has(child.rowIndex)) return;
          const rowFailed = rowErrorIndexes.has(child.rowIndex);
          updateWorkflowNode(child.id, {
            note: rowFailed ? "生成失败" : "未生成",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: rowFailed ? "该镜头生成失败" : "",
          });
        });
        updateWorkflowNode(groupNode.id, {
          note: "",
          groupRunning: false,
        } as any);
        useCanvasStore.setState(
          (state: ReturnType<typeof useCanvasStore.getState>) => ({
            libtvWorkflow: {
              ...state.libtvWorkflow,
              activeNodeId: groupNode.id,
            },
            selectedIds: [groupNode.id],
          }),
        );
        selectLayer(groupNode.id);
        setActiveWorkflowNode(groupNode.id);
        useCanvasStore.getState().setLibTvWorkflowLastRun({
          status: "success",
          executionMode: "canvas_jobs",
          targetNodeId: groupNode.id,
          scriptNodeId: sourceNode.id,
          sourceNodeIds: [sourceNode.id],
          scriptResult: nextScriptResult,
          storyboardImages: images,
          updatedAt: Date.now(),
        });
        message.success(`已生成 ${images.length} 张分镜图`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "分镜生成失败";
        updateWorkflowNode(sourceNode.id, {
          note: errorMessage,
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: errorMessage,
          suppressGenerationBar: false,
        });
        updateWorkflowNode(groupNode.id, {
          note: errorMessage,
          groupRunning: false,
        });
        childNodes.forEach((child) => {
          const currentNode = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.find(
              (node: LibTvWorkflowNode) => node.id === child.id,
            );
          if (String(currentNode?.data?.mediaUrl || "").trim()) return;
          updateWorkflowNode(child.id, {
            note: errorMessage.slice(0, 80),
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: errorMessage,
          });
        });
        message.error(errorMessage);
        console.error(
          "[LibTvWorkflowCanvas] storyboard generation failed",
          error,
        );
        if (isWorkflowProviderAccessError(error)) throw error;
      }
    },
    [
      addWorkflowNode,
      executeStoryboardImageJobs,
      moveWorkflowNode,
      nodes,
      projectId,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );
  const handleRegenerateStoryboardImages = useCallback(
    async (groupId: string) => {
      const groupNode = nodes.find(
        (node) => node.id === groupId && node.kind === "group",
      );
      if (!groupNode) return;
      if (groupNode.data?.groupRunning) {
        message.info("分镜图正在生成中");
        return;
      }
      if (!projectId) {
        message.error("项目未初始化，无法重新生成分镜图");
        return;
      }
      const groupMemberIds = new Set(
        Array.isArray(groupNode.data?.groupNodeIds)
          ? groupNode.data.groupNodeIds
              .map((id) => String(id || "").trim())
              .filter(Boolean)
          : [],
      );
      const imageChildren = nodes
        .filter(
          (node) =>
            (node.parentId === groupId || groupMemberIds.has(node.id)) &&
            node.kind === "image",
        )
        .sort(
          (a, b) =>
            Number(a.data?.workflowGenerationResultIndex ?? 0) -
            Number(b.data?.workflowGenerationResultIndex ?? 0),
        );
      if (imageChildren.length === 0) {
        message.warning("这个分镜组里没有可重新生成的图片");
        return;
      }
      const retryChildren = imageChildren.filter((child) => {
        if (child.data?.workflowGenerationRunning) return false;
        const mediaUrl = String(child.data?.mediaUrl || "").trim();
        const error = String(child.data?.workflowGenerationError || "").trim();
        const note = String(child.data?.note || "").trim();
        return (
          !mediaUrl ||
          Boolean(error) ||
          note === "已清空" ||
          note === "未生成" ||
          note === "等待生成" ||
          note === "等待整组执行" ||
          note === "未完成，可重试"
        );
      });
      if (retryChildren.length === 0) {
        message.info("当前分镜组没有失败或空白的分镜需要重新生成");
        return;
      }
      const firstScriptNodeId = String(
        retryChildren[0]?.data?.workflowStoryboardSourceNodeId || "",
      ).trim();
      const scriptNodeId =
        firstScriptNodeId ||
        String(
          imageChildren[0]?.data?.workflowStoryboardSourceNodeId || "",
        ).trim();
      const sourceNode = nodes.find(
        (node) => node.id === scriptNodeId && isWorkflowScriptKind(node.kind),
      );
      const scriptResult = sourceNode?.data?.scriptResult || null;
      if (!sourceNode || !scriptResult?.rows?.length) {
        message.warning("找不到原始脚本节点，无法按分镜内容重新生成");
        return;
      }
      const rowNodeByIndex = new Map<number, string>();
      const rowIndexes = Array.from(
        new Set(
          retryChildren
            .map((child) => {
              const rowIndex = Number(
                child.data?.workflowStoryboardSourceRowIndex,
              );
              if (
                !Number.isInteger(rowIndex) ||
                rowIndex < 0 ||
                rowIndex >= scriptResult.rows.length
              )
                return null;
              rowNodeByIndex.set(rowIndex, child.id);
              return rowIndex;
            })
            .filter((value): value is number => typeof value === "number"),
        ),
      ).sort((a, b) => a - b);
      if (rowIndexes.length === 0) {
        message.warning("这些分镜没有脚本行信息，无法重新生成");
        return;
      }

      const groupData = groupNode.data as Record<string, any>;
      const isPendingStoryboardGroup =
        groupData.workflowStoryboardPending === true;
      const storyboardActionLabel = isPendingStoryboardGroup
        ? "生成"
        : "重新生成";
      const sourceData = sourceNode.data as Record<string, any>;
      const firstRetry = retryChildren[0];
      const width = Math.max(1, Number(firstRetry?.width || 1));
      const height = Math.max(1, Number(firstRetry?.height || 1));
      const fallbackAspectRatio =
        width && height
          ? `${Math.max(1, Math.round(width))}:${Math.max(1, Math.round(height))}`
          : "16:9";
      const persistedAspectRatio = String(
        groupData.aspectRatio || sourceData.storyboardImageAspectRatio || "",
      ).trim();
      const layoutAspectRatio = persistedAspectRatio || fallbackAspectRatio;
      if (sourceNode.kind === "script-v2") {
        const storyboardGrid = workflowStoryboardImageGridFrame(
          imageChildren.length,
          layoutAspectRatio,
        );
        moveWorkflowNode(groupId, {
          width: storyboardGrid.width,
          height: storyboardGrid.height,
        });
        imageChildren.forEach((child, index) => {
          const column = index % storyboardGrid.columns;
          const row = Math.floor(index / storyboardGrid.columns);
          const childX =
            storyboardGrid.padX +
            column * (storyboardGrid.cellWidth + storyboardGrid.gap);
          const childY =
            storyboardGrid.padTop +
            row * (storyboardGrid.cellHeight + storyboardGrid.gap);
          const isParentedChild = child.parentId === groupId;
          moveWorkflowNode(child.id, {
            x: isParentedChild ? childX : Number(groupNode.x || 0) + childX,
            y: isParentedChild ? childY : Number(groupNode.y || 0) + childY,
            width: storyboardGrid.cellWidth,
            height: storyboardGrid.cellHeight,
          });
        });
      }
      const groupModelId = String(groupData.modelId || "").trim();
      const modelId =
        groupModelId || String(sourceData.storyboardImageModelId || "").trim();
      if (!modelId) {
        message.warning("请先在分镜批量生图弹框里选择图片模型");
        return;
      }
      const storyboardImageModel = await resolveWorkflowModelOptionById(
        "image",
        modelId,
      );
      if (!storyboardImageModel) {
        message.warning("当前图片模型已不可用，请重新选择");
        return;
      }
      const sourceAssets = sourceData.scriptV2AssetsByKind;
      const sourceHasReferences = Boolean(
        sourceAssets &&
        typeof sourceAssets === "object" &&
        Object.values(sourceAssets).some(
          (items) => Array.isArray(items) && items.length > 0,
        ),
      );
      const workflowEndpointMethod =
        String(
          groupData.workflowEndpointMethod ||
            sourceData.storyboardImageEndpointMethod ||
            "",
        ).trim() ||
        (await resolveWorkflowImageMethodForModel(
          modelId,
          sourceHasReferences,
        ));
      const aspectRatio = workflowCanvasChoiceForEndpoint(
        persistedAspectRatio,
        storyboardImageModel.parameters?.aspectRatios,
        workflowEndpointMethod,
      );
      const imageSize = workflowCanvasChoiceForEndpoint(
        groupData.imageSize || sourceData.storyboardImageSize,
        storyboardImageModel.parameters?.resolutions,
        workflowEndpointMethod,
      );
      const generationCountValue = workflowCanvasChoiceForEndpoint(
        groupData.generationCount || sourceData.storyboardImageGenerationCount,
        storyboardImageModel.parameters?.counts,
        workflowEndpointMethod,
      );
      const generationCount = generationCountValue
        ? Math.max(1, Math.round(Number(generationCountValue) || 1))
        : undefined;
      const quality = String(
        groupData.quality || sourceData.storyboardImageQuality || "",
      ).trim();
      const stylePreset = String(
        groupData.stylePreset || sourceData.stylePreset || "",
      ).trim();
      const cameraControl = (groupData.cameraControl ||
        sourceData.cameraControl) as LibTvWorkflowNode["data"]["cameraControl"];
      const workflowExtraParameters = (groupData.workflowExtraParameters ||
        sourceData.storyboardImageExtraParameters) as LibTvWorkflowNode["data"]["workflowExtraParameters"];
      const enableWebSearch =
        groupData.enableWebSearch === true ||
        sourceData.storyboardImageWebSearch === true;
      const prompt = String(groupData.prompt || sourceData.prompt || "").trim();
      const latestWorkflowForAssets = useCanvasStore.getState().libtvWorkflow;
      const latestSourceNode =
        latestWorkflowForAssets.nodes.find(
          (node) =>
            node.id === sourceNode.id && isWorkflowScriptKind(node.kind),
        ) || sourceNode;
      const scriptV2AssetReferenceNodes =
        getWorkflowStoryboardAssetNodesForScript(
          latestSourceNode,
          latestWorkflowForAssets.nodes,
          latestWorkflowForAssets.edges,
        );
      const storyboardAssetGroupId = resolveWorkflowStoryboardAssetGroupId(
        (latestSourceNode.data as Record<string, any>)?.scriptV2AssetGroupId,
        latestWorkflowForAssets.nodes,
        groupId,
        scriptV2AssetReferenceNodes.map((node) => node.id),
      );
      const rowReferenceNodesByIndex = new Map<number, LibTvWorkflowNode[]>();
      const storyboardAssetEdges: Array<{ source: string; target: string }> =
        [];
      const childPatchById = new Map<
        string,
        Partial<LibTvWorkflowNode["data"]>
      >();
      rowIndexes.forEach((rowIndex) => {
        const childId = rowNodeByIndex.get(rowIndex);
        if (!childId) return;
        const row = scriptResult.rows[rowIndex];
        const matchedAssetNodes =
          scriptV2AssetReferenceNodes.length > 0
            ? getWorkflowStoryboardAssetReferenceNodesForRow(
                row,
                scriptV2AssetReferenceNodes,
              )
            : [];
        rowReferenceNodesByIndex.set(rowIndex, matchedAssetNodes);
        matchedAssetNodes.forEach((node) => {
          storyboardAssetEdges.push({ source: node.id, target: childId });
        });
        childPatchById.set(childId, {
          mediaUrl: "",
          ...WORKFLOW_STORYBOARD_GENERATOR_IDENTITY,
          prompt: resolveWorkflowStoryboardRowImagePrompt(row, prompt),
          selectedOptionId: "custom",
          options: [],
          modelId,
          workflowEndpointMethod: workflowEndpointMethod || undefined,
          aspectRatio: aspectRatio || undefined,
          imageSize: imageSize || undefined,
          quality: quality || undefined,
          stylePreset: stylePreset || undefined,
          cameraControl,
          workflowExtraParameters,
          enableWebSearch,
          generationCount,
          referenceImages: matchedAssetNodes
            .map((node) => getWorkflowNodeReferenceImageUrl(node))
            .filter(Boolean),
          referenceImageNodeIds: matchedAssetNodes.map((node) => node.id),
          referenceImageRoles: matchedAssetNodes.map(
            (node) =>
              normalizeWorkflowScriptV2AssetKind(
                (node.data as any)?.workflowScriptV2AssetKind,
              ) || "reference",
          ),
          note: "生成中",
          workflowGenerationRunning: true,
          workflowGenerationProgress: 0.03,
          workflowGenerationError: "",
        } as any);
      });
      useCanvasStore.setState(
        (state: ReturnType<typeof useCanvasStore.getState>) => ({
          libtvWorkflow: {
            ...state.libtvWorkflow,
            nodes: state.libtvWorkflow.nodes.map((node: LibTvWorkflowNode) => {
              const patch = childPatchById.get(node.id);
              return patch
                ? { ...node, data: { ...node.data, ...patch } }
                : node;
            }),
            edges: normalizeWorkflowStoryboardTopologyEdges({
              currentEdges: state.libtvWorkflow.edges,
              scriptNodeId: sourceNode.id,
              storyboardGroupId: groupId,
              storyboardNodeIds: imageChildren.map((node) => node.id),
              assetGroupId: storyboardAssetGroupId,
              assetNodeIds: scriptV2AssetReferenceNodes.map((node) => node.id),
              assetEdges: storyboardAssetEdges,
            }),
          },
        }),
      );
      updateWorkflowNode(groupId, {
        groupRunning: true,
        note: `正在${storyboardActionLabel}分镜图 0/${rowIndexes.length}`,
        modelId,
        workflowEndpointMethod: workflowEndpointMethod || undefined,
        aspectRatio: aspectRatio || undefined,
        imageSize: imageSize || undefined,
        quality: quality || undefined,
        stylePreset: stylePreset || undefined,
        cameraControl,
        workflowExtraParameters,
        enableWebSearch,
        generationCount,
      } as any);
      updateWorkflowNode(sourceNode.id, {
        note: `正在${storyboardActionLabel}分镜图 0/${rowIndexes.length}`,
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0.03,
        workflowGenerationError: "",
        suppressGenerationBar: true,
      });

      try {
        const { images, rowErrorIndexes } = await executeStoryboardImageJobs({
          projectId,
          sourceNode,
          groupNodeId: groupId,
          scriptResult,
          rowIndexes,
          rowNodeByIndex,
          rowReferenceNodesByIndex,
          modelId,
          workflowEndpointMethod: workflowEndpointMethod || undefined,
          aspectRatio: aspectRatio || undefined,
          imageSize: imageSize || undefined,
          quality: quality || undefined,
          generationCount,
          stylePreset: stylePreset || undefined,
          cameraControl,
          workflowExtraParameters,
          enableWebSearch,
          fallbackPrompt: prompt || "",
          runningNotePrefix: `正在${storyboardActionLabel}分镜图`,
        });
        if (images.length === 0) throw new Error("分镜重新生成未返回图片");

        const generatedStoryboardRowUrls = new Map(
          images.map((image) => [image.rowIndex, image.url]),
        );
        const currentScriptResult =
          sourceNode.data?.scriptResult || scriptResult;
        const nextScriptResult = {
          ...currentScriptResult,
          rows: currentScriptResult.rows.map((row, rowIndex) => ({
            ...row,
            referenceImage:
              generatedStoryboardRowUrls.get(rowIndex) || row.referenceImage,
          })),
        };
        updateWorkflowNode(sourceNode.id, {
          scriptResult: nextScriptResult as any,
          note: "",
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          suppressGenerationBar: false,
        });
        rowIndexes.forEach((rowIndex) => {
          if (generatedStoryboardRowUrls.has(rowIndex)) return;
          const childId = rowNodeByIndex.get(rowIndex);
          if (!childId) return;
          const rowFailed = rowErrorIndexes.has(rowIndex);
          updateWorkflowNode(childId, {
            note: rowFailed ? "生成失败" : "未生成",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: rowFailed ? "该镜头生成失败" : "",
          });
        });
        updateWorkflowNode(groupId, {
          note: "",
          groupRunning: false,
          workflowStoryboardPending: false,
        } as any);
        useCanvasStore.getState().setLibTvWorkflowLastRun({
          status: "success",
          executionMode: "canvas_jobs",
          targetNodeId: groupId,
          scriptNodeId: sourceNode.id,
          sourceNodeIds: [sourceNode.id],
          scriptResult: nextScriptResult,
          storyboardImages: imageChildren
            .map((child) => {
              const rowIndex = Number(
                child.data?.workflowStoryboardSourceRowIndex,
              );
              if (!Number.isInteger(rowIndex)) return null;
              return {
                rowIndex,
                url:
                  generatedStoryboardRowUrls.get(rowIndex) ||
                  String(child.data?.mediaUrl || "").trim(),
              };
            })
            .filter((item): item is { rowIndex: number; url: string } =>
              Boolean(item?.url),
            ),
          updatedAt: Date.now(),
        });
        message.success(`已${storyboardActionLabel} ${images.length} 张分镜图`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "分镜重新生成失败";
        updateWorkflowNode(sourceNode.id, {
          note: errorMessage,
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: errorMessage,
          suppressGenerationBar: false,
        });
        updateWorkflowNode(groupId, {
          note: errorMessage,
          groupRunning: false,
        });
        rowIndexes.forEach((rowIndex) => {
          const childId = rowNodeByIndex.get(rowIndex);
          if (!childId) return;
          const currentNode = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.find(
              (node: LibTvWorkflowNode) => node.id === childId,
            );
          if (String(currentNode?.data?.mediaUrl || "").trim()) return;
          updateWorkflowNode(childId, {
            note: errorMessage.slice(0, 80),
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: errorMessage,
          });
        });
        message.error(errorMessage);
        console.error(
          "[LibTvWorkflowCanvas] storyboard regeneration failed",
          error,
        );
        if (isWorkflowProviderAccessError(error)) throw error;
      }
    },
    [executeStoryboardImageJobs, nodes, projectId, updateWorkflowNode],
  );
  const handleGenerateStoryboardVideos = useCallback(
    async (
      groupId: string,
      request: WorkflowStoryboardVideoGenerateRequest,
    ) => {
      const imageGroup = nodes.find(
        (node) => node.id === groupId && node.kind === "group",
      );
      if (!imageGroup) {
        message.warning("请选择分镜图组");
        return;
      }
      if (!projectId) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.error("项目未初始化，无法生成视频");
        return;
      }

      const imageGroupMemberIds = new Set(
        Array.isArray(imageGroup.data?.groupNodeIds)
          ? imageGroup.data.groupNodeIds
              .map((id) => String(id || "").trim())
              .filter(Boolean)
          : [],
      );
      const requestedRowIndexes = Array.isArray(request.rowIndexes)
        ? new Set(
            request.rowIndexes
              .map((item) => Number(item))
              .filter((item) => Number.isInteger(item) && item >= 0),
          )
        : new Set<number>();
      const rowDurationOverrides = request.rowDurations || {};
      const imageChildren = nodes
        .filter(
          (node) =>
            (node.parentId === groupId || imageGroupMemberIds.has(node.id)) &&
            node.kind === "image",
        )
        .filter((node) => {
          if (requestedRowIndexes.size === 0) return true;
          const rowIndex = Number(node.data?.workflowStoryboardSourceRowIndex);
          return (
            Number.isInteger(rowIndex) && requestedRowIndexes.has(rowIndex)
          );
        })
        .sort(
          (a, b) =>
            Number(a.data?.workflowGenerationResultIndex ?? 0) -
            Number(b.data?.workflowGenerationResultIndex ?? 0),
        );
      if (imageChildren.length === 0) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.warning(
          requestedRowIndexes.size > 0
            ? "请选择至少一个可用镜头"
            : "分镜图组里没有可用图片",
        );
        return;
      }

      const sourceNodeId =
        String(
          imageChildren.find((child) =>
            String(
              (child.data as any)?.workflowStoryboardSourceNodeId || "",
            ).trim(),
          )?.data?.workflowStoryboardSourceNodeId || "",
        ) ||
        edges.find((edge) => edge.target === groupId)?.source ||
        "";
      const sourceNode =
        nodes.find(
          (node) => node.id === sourceNodeId && isWorkflowScriptKind(node.kind),
        ) ||
        nodes.find(
          (node) =>
            isWorkflowScriptKind(node.kind) &&
            node.data?.scriptResult?.rows?.length,
        );
      const scriptResult = sourceNode?.data?.scriptResult || null;
      if (!sourceNode || !scriptResult?.rows?.length) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.warning("找不到原始镜头脚本，无法严格按分镜生成视频");
        return;
      }
      const latestWorkflowForAssets = useCanvasStore.getState().libtvWorkflow;
      const latestSourceNodeForAssets =
        latestWorkflowForAssets.nodes.find(
          (node) =>
            node.id === sourceNode.id && isWorkflowScriptKind(node.kind),
        ) || sourceNode;
      const scriptV2AssetReferenceNodes =
        getWorkflowStoryboardAssetNodesForScript(
          latestSourceNodeForAssets,
          latestWorkflowForAssets.nodes,
          latestWorkflowForAssets.edges,
        );

      const requestedModelId = String(request.modelId || "").trim();
      if (!requestedModelId) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.warning("请选择视频模型");
        return;
      }
      const selectedStoryboardVideoModel = await resolveWorkflowModelOptionById(
        "video",
        requestedModelId,
      );
      if (!selectedStoryboardVideoModel) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.warning("当前视频模型不可用，请重新选择");
        return;
      }
      const requestedProviderKey = String(
        selectedStoryboardVideoModel.providerKey ||
          parseModelRuntimeId(requestedModelId).providerKey ||
          "",
      ).trim();
      if (!requestedProviderKey) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.warning("当前视频节点缺少供应商，请重新选择一次视频模型");
        return;
      }

      const workflowEndpointMethod = await resolveWorkflowVideoMethodForModel(
        requestedModelId,
        String(request.videoMethod || "").trim(),
        { images: 1, videos: 0, audios: 0, scriptImages: 0 },
      );
      const storyboardVideoMethods =
        selectedStoryboardVideoModel.parameters?.methods ||
        selectedStoryboardVideoModel.parameters?.modes ||
        [];
      if (storyboardVideoMethods.length > 0 && !workflowEndpointMethod) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.warning("当前分镜素材与所选视频模式不兼容，请重新选择模式");
        return;
      }
      const endpointSelection = resolveWorkflowVideoEndpointSelection({
        model: selectedStoryboardVideoModel,
        methodId: workflowEndpointMethod,
        aspectRatio: request.aspectRatio,
        resolution: request.videoResolution,
        duration: request.videoDuration,
        generationCount: request.generationCount,
        generateAudio: request.generateAudio,
        enableWebSearch: request.enableWebSearch,
      });
      const requestAspectRatio = endpointSelection.aspectRatio || "";
      const requestVideoResolution = endpointSelection.resolution || "";
      const requestVideoDuration = endpointSelection.duration || "";
      const requestVideoDurationSeconds = requestVideoDuration
        ? parseWorkflowDurationSeconds(requestVideoDuration, 0)
        : 0;
      const requestGenerationCount = endpointSelection.generationCount;
      const generationCount = requestGenerationCount || 1;
      const effectiveGenerateAudio = endpointSelection.generateAudio;
      const effectiveWebSearch = endpointSelection.enableWebSearch;
      const maxClipDuration = Math.max(
        1,
        requestVideoDurationSeconds ||
          Number(request.maxClipDurationSeconds) ||
          1,
      );
      const videoGeneratorFrame = workflowVideoGeneratorFrame(
        requestAspectRatio || "16:9",
      );
      const cellWidth = Math.max(220, videoGeneratorFrame.width);
      const cellHeight = Math.max(260, videoGeneratorFrame.height);
      const storyboardItems = imageChildren.flatMap((imageNode) => {
        const rowIndex = Number(
          imageNode.data?.workflowStoryboardSourceRowIndex,
        );
        if (
          !Number.isInteger(rowIndex) ||
          rowIndex < 0 ||
          rowIndex >= scriptResult.rows.length
        )
          return [];
        const row = scriptResult.rows[rowIndex];
        const matchedAssetNodes =
          getWorkflowStoryboardAssetReferenceNodesForRow(
            row,
            scriptV2AssetReferenceNodes,
          );
        const rawRowDuration =
          rowDurationOverrides[rowIndex] ||
          (imageNode.data as any)?.workflowStoryboardDuration ||
          row.duration ||
          requestVideoDuration;
        const schemaRowDuration = workflowCanvasChoiceForEndpoint(
          rawRowDuration,
          selectedStoryboardVideoModel.parameters?.durations,
          workflowEndpointMethod,
        );
        const rowDuration = parseWorkflowDurationSeconds(
          schemaRowDuration || requestVideoDuration || rawRowDuration,
          maxClipDuration,
        );
        return [
          {
            row,
            rowIndex,
            storyboardNumber: row.shotNumber || String(rowIndex + 1),
            imageNodeId: imageNode.id,
            referenceImage: String(
              imageNode.data?.mediaUrl || row.referenceImage || "",
            ).trim(),
            assetReferences: matchedAssetNodes
              .map((node) => ({
                nodeId: node.id,
                url: getWorkflowNodeReferenceImageUrl(node),
                role:
                  normalizeWorkflowScriptV2AssetKind(
                    (node.data as any)?.workflowScriptV2AssetKind,
                  ) || "reference",
                label: (() => {
                  const kind =
                    normalizeWorkflowScriptV2AssetKind(
                      (node.data as any)?.workflowScriptV2AssetKind,
                    ) || "资产";
                  const title = String(
                    node.data?.title || node.id || "",
                  ).trim();
                  return title ? `${kind}:${title}` : kind;
                })(),
              }))
              .filter((item) => Boolean(item.url)),
            duration: Math.max(1, rowDuration),
          },
        ];
      });
      const clipPlan = buildWorkflowStoryboardVideoClipPlan({
        items: storyboardItems,
        maxClipDuration,
        title: String(
          scriptResult.title || imageGroup.data?.title || "分镜",
        ).trim(),
        generateAudio: effectiveGenerateAudio === true,
      });

      if (clipPlan.length === 0) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.warning("没有可生成的视频片段");
        return;
      }

      const columns = 1;
      const gap = 12;
      const rowsCount = Math.ceil(clipPlan.length / columns);
      const groupWidth = Math.max(
        360,
        columns * cellWidth + Math.max(0, columns - 1) * gap + 56,
      );
      const groupHeight = Math.max(
        260,
        rowsCount * cellHeight + Math.max(0, rowsCount - 1) * gap + 56,
      );
      const outputGap = 96;
      const resumeOutputGroupId = String(request.outputGroupId || "").trim();
      const isResumeRun = Boolean(resumeOutputGroupId);
      const codexTaskId = String(
        request.codexTaskId ||
          imageGroup.data?.workflowCodexTaskId ||
          sourceNode.data?.workflowCodexTaskId ||
          "",
      ).trim();
      const method = endpointSelection.routeMode || undefined;
      const storyboardVideoExtraParameterDefinitions =
        normalizeWorkflowExtraParameterDefinitions(
          selectedStoryboardVideoModel.parameters?.extraParameters,
          workflowEndpointMethod,
        );
      const resolvedStoryboardVideoExtraParameters =
        resolveWorkflowExtraParameterValues(
          storyboardVideoExtraParameterDefinitions,
          request.workflowExtraParameters,
          { fillDefaults: true },
        );
      const videoExtraGenerationOptions = buildWorkflowExtraGenerationOptions(
        resolvedStoryboardVideoExtraParameters,
      );
      const outputGroupPlacement = isResumeRun
        ? null
        : allocateCodexWorkflowTaskPlacement({
            nodes: workflowNodesRef.current.map(
              getCodexWorkflowTaskPlacementNode,
            ),
            taskId: codexTaskId,
            stage: "video",
            bounds: getWorkflowVisibleBounds({
              flow: flowRef.current,
              container: containerRef.current,
            }),
            width: groupWidth,
            height: groupHeight,
            preferredPosition: codexTaskId
              ? null
              : {
                  x:
                    Number(imageGroup.x || 0) +
                    Math.max(Number(imageGroup.width || 0), 360) +
                    outputGap,
                  y: Number(imageGroup.y || 0),
                },
          });
      const outputGroup = isResumeRun
        ? nodes.find(
            (node) => node.id === resumeOutputGroupId && node.kind === "group",
          )
        : addWorkflowNode("group", {
            x:
              outputGroupPlacement?.placement.x ??
              Number(imageGroup.x || 0) +
                Math.max(Number(imageGroup.width || 0), 360) +
                outputGap,
            y: outputGroupPlacement?.placement.y ?? Number(imageGroup.y || 0),
            linkFromNodeId: imageGroup.id,
            linkToNodeId: null,
          });
      if (!outputGroup) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.error("找不到可继续生成的视频组");
        return;
      }
      if (!isResumeRun) {
        moveWorkflowNode(outputGroup.id, {
          width: groupWidth,
          height: groupHeight,
        });
      }

      const existingVideoChildren = isResumeRun
        ? nodes
            .filter(
              (node) =>
                node.parentId === outputGroup.id && node.kind === "video",
            )
            .sort(
              (a, b) =>
                Number(a.data?.workflowStoryboardVideoSegmentIndex ?? 0) -
                Number(b.data?.workflowStoryboardVideoSegmentIndex ?? 0),
            )
        : [];
      const videoChildren = clipPlan.map((clip, index) => {
        const existing = existingVideoChildren.find(
          (child) =>
            Number(child.data?.workflowStoryboardVideoSegmentIndex ?? -1) ===
            clip.clipIndex,
        );
        if (existing) {
          clip.referenceEdges = clip.referenceEdges.map((edge) => ({
            ...edge,
            target: existing.id,
          }));
          return { id: existing.id, clip };
        }
        const column = index % columns;
        const row = Math.floor(index / columns);
        const childX = 28 + column * (cellWidth + gap);
        const childY = 44 + row * (cellHeight + gap);
        const child = addWorkflowNode("video", {
          x: childX,
          y: childY,
          linkFromNodeId: null,
          linkToNodeId: null,
        });
        moveWorkflowNode(child.id, {
          x: childX,
          y: childY,
          width: cellWidth,
          height: cellHeight,
        });
        clip.referenceEdges = clip.referenceEdges.map((edge) => ({
          ...edge,
          target: child.id,
        }));
        return { id: child.id, clip };
      });

      const startClipIndex = Math.max(
        0,
        Math.min(
          clipPlan.length,
          Math.round(Number(request.startClipIndex || 0) || 0),
        ),
      );
      const shouldDeferGeneration =
        request.deferGeneration === true && !isResumeRun;
      const activeVideoChildren = videoChildren.filter(
        (item) => item.clip.clipIndex >= startClipIndex,
      );
      videoChildren.forEach(({ id, clip }) => {
        const shouldRun =
          !shouldDeferGeneration && clip.clipIndex >= startClipIndex;
        updateWorkflowNode(id, {
          title: `分镜 ${clip.storyboardLabel} 视频`,
          ...(shouldRun ? { mediaUrl: "" } : {}),
          mediaRole: "ordinary",
          content: "",
          prompt: clip.prompt,
          modelId: requestedModelId,
          aspectRatio: requestAspectRatio || undefined,
          videoResolution: requestVideoResolution || undefined,
          videoDuration: requestVideoDuration || undefined,
          videoMethod: workflowEndpointMethod || undefined,
          generationCount: requestGenerationCount,
          generateAudio: effectiveGenerateAudio,
          enableWebSearch: effectiveWebSearch,
          workflowExtraParameters:
            Object.keys(resolvedStoryboardVideoExtraParameters).length > 0
              ? resolvedStoryboardVideoExtraParameters
              : undefined,
          workflowSubtitleTimeline: clip.subtitleTimeline,
          referenceImages: clip.referenceImages,
          referenceImageNodeIds: clip.referenceImageNodeIds,
          referenceImageRoles: clip.referenceImageRoles,
          workflowGenerationResultIndex: clip.clipIndex,
          workflowStoryboardSourceRowIndex: clip.items[0]?.rowIndex ?? 0,
          workflowStoryboardSourceNodeId: sourceNode.id,
          workflowStoryboardDuration: `${Math.round(clip.clipDuration)}s`,
          workflowStoryboardVideoSegmentIndex: clip.clipIndex,
          workflowStoryboardVideoSegmentCount: clipPlan.length,
          workflowStoryboardSourceRowIndexes: clip.items.map(
            (item) => item.rowIndex,
          ),
          ...(codexTaskId
            ? {
                workflowGenerationController: "codex",
                workflowCodexTaskId: codexTaskId,
              }
            : {}),
          workflowGenerationRunning: shouldRun,
          workflowGenerationProgress: shouldRun
            ? undefined
            : shouldDeferGeneration
              ? undefined
              : 1,
          workflowGenerationError: "",
          note: shouldRun
            ? WORKFLOW_VIDEO_GENERATING_NOTE
            : shouldDeferGeneration
              ? "等待整组执行"
              : "",
        } as any);
      });

      updateWorkflowNode(outputGroup.id, {
        title: `${String(imageGroup.data?.title || scriptResult.title || "分镜").trim()} 视频`,
        content: "",
        prompt: "",
        mediaUrl: "",
        mediaRole: undefined,
        selectedOptionId: "custom",
        options: [],
        groupNodeIds: videoChildren.map((node) => node.id),
        groupBackgroundColor: "transparent",
        groupRunning: !shouldDeferGeneration && activeVideoChildren.length > 0,
        note: shouldDeferGeneration
          ? `已创建视频生成器组，共 ${videoChildren.length} 个占位`
          : isResumeRun
            ? `正在从第 ${startClipIndex + 1} 段继续生成`
            : `正在生成视频 0/${videoChildren.length}`,
        workflowStoryboardVideoSourceGroupId: groupId,
        workflowStoryboardVideoRowIndexes: request.rowIndexes,
        workflowStoryboardVideoRowDurations: request.rowDurations,
        workflowStoryboardVideoFailedSegmentIndex: undefined,
        workflowStoryboardVideoResumeFromSegmentIndex: startClipIndex,
        workflowStoryboardVideoResumeTailFrameUrl:
          String(request.resumeTailFrameUrl || "").trim() || undefined,
        workflowStoryboardVideoStopped: false,
        storyboardVideoModelId: requestedModelId,
        storyboardVideoAspectRatio: requestAspectRatio || undefined,
        storyboardVideoResolution: requestVideoResolution || undefined,
        storyboardVideoDuration: requestVideoDuration || undefined,
        storyboardVideoMethod: workflowEndpointMethod || undefined,
        storyboardVideoGenerationCount: requestGenerationCount,
        storyboardVideoGenerateAudio: effectiveGenerateAudio,
        storyboardVideoWebSearch: effectiveWebSearch,
        storyboardVideoExtraParameters:
          Object.keys(resolvedStoryboardVideoExtraParameters).length > 0
            ? resolvedStoryboardVideoExtraParameters
            : undefined,
        ...(codexTaskId
          ? {
              workflowGenerationController: "codex",
              workflowCodexTaskId: codexTaskId,
              workflowCodexLayoutAnchorX:
                outputGroupPlacement?.anchor.x ??
                outputGroup.data?.workflowCodexLayoutAnchorX,
              workflowCodexLayoutAnchorY:
                outputGroupPlacement?.anchor.y ??
                outputGroup.data?.workflowCodexLayoutAnchorY,
              workflowCodexLayoutIndex:
                outputGroupPlacement?.layoutIndex ??
                outputGroup.data?.workflowCodexLayoutIndex,
              workflowCodexLayoutStage:
                outputGroupPlacement?.layoutStage ??
                outputGroup.data?.workflowCodexLayoutStage,
              workflowCodexLayoutRow:
                outputGroupPlacement?.layoutRow ??
                outputGroup.data?.workflowCodexLayoutRow,
            }
          : {}),
      } as any);
      useCanvasStore.setState(
        (state: ReturnType<typeof useCanvasStore.getState>) => {
          const videoChildIds = new Set(videoChildren.map((child) => child.id));
          const referenceEdges = videoChildren
            .flatMap(({ clip }) => clip.referenceEdges)
            .map((edge) => ({
              source: String(edge.source || "").trim(),
              target: String(edge.target || "").trim(),
            }))
            .filter(
              (edge) =>
                edge.source && edge.target && edge.source !== edge.target,
            );
          const referenceEdgeKeys = new Set(
            referenceEdges.map((edge) => `${edge.source}->${edge.target}`),
          );
          const edgesWithoutStaleVideoReferences =
            state.libtvWorkflow.edges.filter((edge: LibTvWorkflowEdge) => {
              if (!videoChildIds.has(edge.target)) return true;
              return !String(edge.id || "").startsWith(
                "storyboard-video-reference-edge-",
              );
            });
          const existingReferenceEdgeKeys = new Set(
            edgesWithoutStaleVideoReferences.map(
              (edge: LibTvWorkflowEdge) => `${edge.source}->${edge.target}`,
            ),
          );
          const nextReferenceEdges = referenceEdges
            .filter((edge) =>
              referenceEdgeKeys.has(`${edge.source}->${edge.target}`),
            )
            .filter(
              (edge) =>
                !existingReferenceEdgeKeys.has(
                  `${edge.source}->${edge.target}`,
                ),
            )
            .map((edge) => ({
              id: createWorkflowImportedId("storyboard-video-reference-edge"),
              source: edge.source,
              target: edge.target,
            }));
          const nodesWithParents = state.libtvWorkflow.nodes.map(
            (node: LibTvWorkflowNode) =>
              videoChildIds.has(node.id)
                ? { ...node, parentId: outputGroup.id }
                : node,
          );
          const orderedNodes = isResumeRun
            ? nodesWithParents
            : [
                ...nodesWithParents.filter(
                  (node: LibTvWorkflowNode) => node.id === outputGroup.id,
                ),
                ...nodesWithParents.filter(
                  (node: LibTvWorkflowNode) => node.id !== outputGroup.id,
                ),
              ];
          return {
            libtvWorkflow: {
              ...state.libtvWorkflow,
              activeNodeId: outputGroup.id,
              nodes: orderedNodes,
              edges: [
                ...edgesWithoutStaleVideoReferences,
                ...nextReferenceEdges,
              ],
            },
            selectedIds: [outputGroup.id],
          };
        },
      );
      selectLayer(outputGroup.id);
      setActiveWorkflowNode(outputGroup.id);

      if (shouldDeferGeneration) {
        updateWorkflowNode(groupId, { suppressGenerationBar: false });
        message.success(
          `已创建视频生成器组 (${videoChildren.length})，点击整组执行开始生成`,
        );
        return;
      }

      let completedCount = startClipIndex;
      let previousTailFrameUrl = String(
        request.resumeTailFrameUrl || "",
      ).trim();
      const generatedVideos: Array<{
        rowIndexes: number[];
        segmentIndex: number;
        url: string;
        firstFrameUrl?: string;
        tailFrameUrl?: string;
        thumbnailUrl?: string;
      }> = [];

      const generateOneClip = async (
        childId: string,
        clip: (typeof clipPlan)[number],
      ) => {
        let resultUrl = "";
        let resultTailFrameUrl = "";
        let resultThumbnailUrl = "";
        const resultUrls: string[] = [];
        const resultThumbnailUrls: string[] = [];
        const appendResultUrls = (urls: string[]) => {
          urls.forEach((url) => {
            const normalizedUrl = String(url || "").trim();
            if (!normalizedUrl || resultUrls.includes(normalizedUrl)) return;
            resultUrls.push(normalizedUrl);
            if (!resultUrl) resultUrl = normalizedUrl;
          });
        };
        const appendResultThumbnailUrls = (urls: string[]) => {
          urls.forEach((url) => {
            const normalizedUrl = String(url || "").trim();
            if (!normalizedUrl || resultThumbnailUrls.includes(normalizedUrl))
              return;
            resultThumbnailUrls.push(normalizedUrl);
            if (!resultThumbnailUrl) resultThumbnailUrl = normalizedUrl;
          });
        };
        let resultTaskId = "";
        const resultTaskIds: string[] = [];
        let resultTaskType = "";
        let resultProviderKey = "";
        let resultBaseUrl = "";
        let resultStatusUrl = "";
        let resultBackgroundTaskId = "";
        const storyboardReferenceImages = clip.referenceImages
          .map((item) => String(item || "").trim())
          .filter(Boolean);
        const firstFrameUrl =
          previousTailFrameUrl || storyboardReferenceImages[0] || "";
        const actualReferenceImages = Array.from(
          new Set(
            [
              ...(firstFrameUrl ? [firstFrameUrl] : []),
              ...storyboardReferenceImages,
            ].filter(Boolean),
          ),
        );
        const actualReferenceImageNodeIds = Array.from(
          new Set(clip.referenceImageNodeIds.filter(Boolean)),
        );
        const actualReferenceImageRoles = actualReferenceImages.map((url) => {
          if (url === firstFrameUrl) return "first_frame";
          const sourceIndex = clip.referenceImages.findIndex(
            (item) => item === url,
          );
          return sourceIndex >= 0
            ? clip.referenceImageRoles[sourceIndex] || "reference"
            : "reference";
        });
        const actualPrompt = [
          clip.clipIndex > 0 && firstFrameUrl
            ? `本片段必须以上一段视频的尾帧图作为首帧开始，保持人物、场景、光线和动作无缝衔接。首帧图：${firstFrameUrl}`
            : "",
          clip.prompt,
        ]
          .filter(Boolean)
          .join("\n\n");
        updateWorkflowNode(childId, {
          note: WORKFLOW_VIDEO_GENERATING_NOTE,
          workflowGenerationRunning: true,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          workflowGenerationTaskId: undefined,
          workflowGenerationTaskIds: [],
          workflowGenerationTaskType: undefined,
          workflowGenerationBaseUrl: undefined,
          prompt: actualPrompt,
          generateAudio: effectiveGenerateAudio,
          enableWebSearch: effectiveWebSearch,
          generationCount: requestGenerationCount,
          workflowExtraParameters:
            Object.keys(resolvedStoryboardVideoExtraParameters).length > 0
              ? resolvedStoryboardVideoExtraParameters
              : undefined,
          workflowSubtitleTimeline: clip.subtitleTimeline,
          referenceImages: actualReferenceImages,
          referenceImageNodeIds: actualReferenceImageNodeIds,
          referenceImageRoles: actualReferenceImageRoles,
          workflowStoryboardVideoFirstFrameUrl: firstFrameUrl || undefined,
          workflowStoryboardVideoPreviousTailFrameUrl:
            previousTailFrameUrl || undefined,
        });
        await runWorkflowVideoRuntime(
          {
            ...videoExtraGenerationOptions,
            message: actualPrompt,
            modelId: requestedModelId,
            providerKey: requestedProviderKey,
            ...(requestVideoDurationSeconds > 0
              ? { duration: requestVideoDurationSeconds }
              : {}),
            ...(requestVideoResolution
              ? { resolution: requestVideoResolution }
              : {}),
            ...(requestAspectRatio ? { aspectRatio: requestAspectRatio } : {}),
            ...(requestGenerationCount
              ? { count: requestGenerationCount }
              : {}),
            method,
            images:
              actualReferenceImages.length > 0
                ? actualReferenceImages
                : undefined,
            firstFrameImage: firstFrameUrl || undefined,
            first_frame_image: firstFrameUrl || undefined,
            tools: effectiveWebSearch ? [{ type: "web_search" }] : undefined,
            generateAudio: effectiveGenerateAudio,
            generate_audio: effectiveGenerateAudio,
            audioEnabled: effectiveGenerateAudio,
            projectId,
            canvasId: workflowCanvasId,
            canvasName: workflowCanvasName,
            locale: "zh-CN",
            workflowEndpointMethod: workflowEndpointMethod || undefined,
          },
          (event) => {
            if (event?.type === "error")
              throw new Error(String(event.message || "视频生成失败"));
            appendResultUrls(collectWorkflowVideoUrls(event));
            appendResultThumbnailUrls(collectWorkflowVideoPosterUrls(event));
            const tailFrameUrls = collectWorkflowVideoTailFrameUrls(event);
            if (tailFrameUrls[0]) resultTailFrameUrl = tailFrameUrls[0];
            if ((event as any)?.providerKey || (event as any)?.provider) {
              resultProviderKey = String(
                (event as any).providerKey || (event as any).provider,
              );
              updateWorkflowNode(childId, {
                workflowGenerationProviderKey: resultProviderKey,
              } as any);
            }
            const eventTaskIds = resolveWorkflowPredictionTaskIds({
              taskIds: event?.taskIds,
              taskId: event?.taskId,
            });
            eventTaskIds.forEach((taskId) => {
              if (!resultTaskIds.includes(taskId)) {
                resultTaskIds.push(taskId);
              }
              activeVideoGenerationTaskIdsRef.current.add(taskId);
            });
            if (eventTaskIds.length > 0) {
              resultTaskId = eventTaskIds[eventTaskIds.length - 1];
            }
            if (event?.baseUrl) resultBaseUrl = String(event.baseUrl).trim();
            if (event?.taskType) {
              resultTaskType = resolveUnifiedProviderTaskType({
                taskType: event.taskType,
                modelId: requestedModelId,
                providerKey: resultProviderKey,
              });
            }
            if (event?.statusUrl) {
              resultStatusUrl = String(event.statusUrl);
            }
            if (event?.backgroundTaskId) {
              resultBackgroundTaskId = String(event.backgroundTaskId);
            }
            if (
              eventTaskIds.length > 0 ||
              resultTaskType ||
              resultStatusUrl ||
              resultBackgroundTaskId
            ) {
              updateWorkflowNode(childId, {
                workflowGenerationTaskId: resultTaskId || undefined,
                workflowGenerationTaskIds: resultTaskIds,
                workflowGenerationTaskType: resultTaskType || undefined,
                workflowGenerationBaseUrl: resultBaseUrl || undefined,
                workflowGenerationProviderKey: resultProviderKey || undefined,
                workflowGenerationStatusUrl: resultStatusUrl || undefined,
                workflowGenerationBackgroundTaskId:
                  resultBackgroundTaskId || undefined,
              } as any);
            }
          },
        );

        if (
          resultTaskId &&
          !isWorkflowPredictionTaskType(resultTaskType, "video") &&
          resultUrls.length < generationCount
        ) {
          updateWorkflowNode(childId, {
            note: WORKFLOW_VIDEO_GENERATING_NOTE,
            workflowGenerationRunning: true,
            workflowGenerationProgress: undefined,
            workflowGenerationTaskId: resultTaskId,
            workflowGenerationTaskIds: resultTaskIds,
            workflowGenerationTaskType: resultTaskType || undefined,
            workflowGenerationBaseUrl: resultBaseUrl || undefined,
            workflowGenerationProviderKey: resultProviderKey || undefined,
            workflowGenerationStatusUrl: resultStatusUrl || undefined,
            workflowGenerationBackgroundTaskId:
              resultBackgroundTaskId || undefined,
          });
          const isSeedanceBackgroundTask = isOfficialSeedanceTaskContext({
            taskType: resultTaskType,
            providerKey: resultProviderKey,
          });
          const pollIntervalMs = resolveProviderVideoPollIntervalMs({
            taskType: resultTaskType,
            providerKey: resultProviderKey,
            fallbackMs: 2500,
          });
          const pollResult = await pollUnifiedVideoTaskUntilTerminal({
            intervalMs: pollIntervalMs,
            initialDelay: true,
            query: () =>
              queryUnifiedVideoTaskStatus({
                providerTaskId: resultTaskId,
                taskType: resultTaskType,
                statusUrl: resultStatusUrl || undefined,
                modelId: requestedModelId,
                providerKey: resultProviderKey || undefined,
                seedanceJobId: isSeedanceBackgroundTask
                  ? resultBackgroundTaskId
                  : "",
                projectId,
                persistVideo: true,
              }),
            onResult: (nextResult) => {
              updateWorkflowNode(childId, {
                note: WORKFLOW_VIDEO_GENERATING_NOTE,
                workflowGenerationRunning: true,
              });
              const tailFrameUrls = collectWorkflowVideoTailFrameUrls(
                nextResult.payload,
              );
              if (tailFrameUrls[0]) resultTailFrameUrl = tailFrameUrls[0];
              appendResultUrls(nextResult.videos);
              appendResultThumbnailUrls([
                String(nextResult.thumbnailUrl || "").trim(),
                ...collectWorkflowVideoPosterUrls(nextResult.payload),
              ]);
              if (typeof nextResult.progress !== "number") return;
              updateWorkflowNode(childId, {
                note: WORKFLOW_VIDEO_GENERATING_NOTE,
                workflowGenerationRunning: true,
                workflowGenerationProgress: Math.max(
                  0,
                  Math.min(0.98, nextResult.progress),
                ),
              });
            },
          });
          if (pollResult.status === "failed") {
            throw new Error(pollResult.statusMessage || "视频生成失败");
          }
          appendResultUrls(pollResult.videos);
          appendResultThumbnailUrls([
            String(pollResult.thumbnailUrl || "").trim(),
            ...collectWorkflowVideoPosterUrls(pollResult.payload),
          ]);
        }

        if (!resultUrl) throw new Error("视频任务未返回结果");
        const finalResultUrls =
          resultUrls.length > 0 ? resultUrls : [resultUrl];
        if (!resultTailFrameUrl) {
          updateWorkflowNode(childId, {
            note: "提取尾帧",
            workflowGenerationRunning: true,
            workflowGenerationProgress: 0.99,
          });
          resultTailFrameUrl =
            await extractWorkflowVideoTailFrameUrl(resultUrl);
        }
        previousTailFrameUrl = resultTailFrameUrl || "";
        const fallbackVideoSize = getWorkflowAspectRatioFallbackSize(
          requestAspectRatio,
          16,
          9,
        );
        const videoItems = await Promise.all(
          finalResultUrls.map(async (url, index) => {
            const metadata = await readWorkflowVideoUrlSize(url).catch(
              () => fallbackVideoSize,
            );
            return {
              url,
              thumbnailUrl:
                resultThumbnailUrls[index] ||
                resultThumbnailUrl ||
                (index === 0
                  ? firstFrameUrl || resultTailFrameUrl || undefined
                  : undefined),
              width: metadata.width,
              height: metadata.height,
              duration: "duration" in metadata ? metadata.duration : undefined,
              title: `视频 ${index + 1}`,
            };
          }),
        );
        const primaryVideo = videoItems[0];
        updateWorkflowNode(childId, {
          mediaUrl: primaryVideo.url,
          thumbnailUrl:
            primaryVideo.thumbnailUrl ||
            firstFrameUrl ||
            resultTailFrameUrl ||
            undefined,
          mediaRole: "ordinary",
          generationCount: requestGenerationCount,
          workflowVideoResults: videoItems.length > 1 ? videoItems : undefined,
          workflowVideoResultsCollapsed: videoItems.length <= 1,
          workflowGenerationRunning: false,
          workflowGenerationProgress: 1,
          workflowGenerationError: "",
          workflowGenerationTaskId: resultTaskId || undefined,
          workflowGenerationTaskIds: resultTaskIds,
          workflowGenerationTaskType: resultTaskType || undefined,
          workflowGenerationProviderKey: resultProviderKey || undefined,
          workflowGenerationBaseUrl: resultBaseUrl || undefined,
          workflowStoryboardVideoFirstFrameUrl: firstFrameUrl || undefined,
          workflowStoryboardVideoTailFrameUrl: resultTailFrameUrl || undefined,
          ...getWorkflowMediaNaturalSizePatch(primaryVideo),
          workflowMediaUserResized: false,
          workflowMediaFrameLocked: false,
          note: "",
        });
        resultTaskIds.forEach((taskId) =>
          activeVideoGenerationTaskIdsRef.current.delete(taskId),
        );
        applyWorkflowVideoUrlNodeFrame(
          moveWorkflowNode,
          childId,
          primaryVideo.url,
          undefined,
          (metadata) => {
            updateWorkflowNode(childId, {
              ...getWorkflowMediaNaturalSizePatch(metadata),
              ...(requestVideoDurationSeconds > 0 &&
              Number(metadata.duration || 0) > 0
                ? {
                    workflowStoryboardDuration: `${Math.round(Number(metadata.duration))}s`,
                  }
                : {}),
            });
          },
          primaryVideo,
        );
        generatedVideos.push({
          rowIndexes: clip.items.map((item) => item.rowIndex),
          segmentIndex: clip.clipIndex,
          url: primaryVideo.url,
          firstFrameUrl: firstFrameUrl || undefined,
          tailFrameUrl: resultTailFrameUrl || undefined,
          thumbnailUrl:
            primaryVideo.thumbnailUrl ||
            firstFrameUrl ||
            resultTailFrameUrl ||
            undefined,
        });
        completedCount += 1;
        updateWorkflowNode(outputGroup.id, {
          note: `正在生成视频 ${completedCount}/${videoChildren.length}`,
          groupRunning: completedCount < videoChildren.length,
        });
      };

      try {
        let stoppedAtFailure = false;
        for (const item of activeVideoChildren) {
          try {
            await generateOneClip(item.id, item.clip);
          } catch (error) {
            resolveWorkflowPredictionTaskIds({
              taskIds: useCanvasStore
                .getState()
                .libtvWorkflow.nodes.find(
                  (node: LibTvWorkflowNode) => node.id === item.id,
                )?.data?.workflowGenerationTaskIds,
              taskId: useCanvasStore
                .getState()
                .libtvWorkflow.nodes.find(
                  (node: LibTvWorkflowNode) => node.id === item.id,
                )?.data?.workflowGenerationTaskId,
            }).forEach((taskId) =>
              activeVideoGenerationTaskIdsRef.current.delete(taskId),
            );
            const errorMessage =
              error instanceof Error ? error.message : "视频生成失败";
            stoppedAtFailure = true;
            completedCount += 1;
            updateWorkflowNode(item.id, {
              note: errorMessage.slice(0, 80),
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: errorMessage,
            });
            updateWorkflowNode(outputGroup.id, {
              note: `第 ${item.clip.clipIndex + 1} 段失败，已停止后续生成`,
              groupRunning: false,
              workflowStoryboardVideoFailedSegmentIndex: item.clip.clipIndex,
              workflowStoryboardVideoResumeTailFrameUrl:
                previousTailFrameUrl || undefined,
              workflowStoryboardVideoStopped: true,
            } as any);
            videoChildren
              .filter(
                (candidate) => candidate.clip.clipIndex > item.clip.clipIndex,
              )
              .forEach((candidate) => {
                updateWorkflowNode(candidate.id, {
                  note: "等待从失败处重试",
                  workflowGenerationRunning: false,
                  workflowGenerationProgress: undefined,
                  workflowGenerationError: "",
                });
              });
            console.error(
              "[LibTvWorkflowCanvas] storyboard video clip failed",
              error,
            );
            if (isWorkflowProviderAccessError(error)) throw error;
            break;
          }
        }
        if (stoppedAtFailure) {
          useCanvasStore.getState().setLibTvWorkflowLastRun({
            status: "failed",
            targetNodeId: outputGroup.id,
            scriptNodeId: sourceNode.id,
            sourceNodeIds: [sourceNode.id, imageGroup.id],
            scriptResult,
            clips: generatedVideos,
            updatedAt: Date.now(),
          });
          message.warning(
            "视频生成已在失败片段停止，可在视频组上点击“从失败处重试”",
          );
          return;
        }
        updateWorkflowNode(outputGroup.id, {
          note: "",
          groupRunning: false,
          workflowStoryboardVideoFailedSegmentIndex: undefined,
          workflowStoryboardVideoStopped: false,
          workflowStoryboardVideoResumeTailFrameUrl: undefined,
        });
        useCanvasStore.getState().setLibTvWorkflowLastRun({
          status: generatedVideos.length > 0 ? "success" : "failed",
          targetNodeId: outputGroup.id,
          scriptNodeId: sourceNode.id,
          sourceNodeIds: [sourceNode.id, imageGroup.id],
          scriptResult,
          clips: generatedVideos,
          updatedAt: Date.now(),
        });
        if (generatedVideos.length > 0) {
          message.success(
            `已生成 ${generatedVideos.length}/${videoChildren.length} 个视频片段`,
          );
        } else {
          message.error("视频生成失败");
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "视频生成失败";
        updateWorkflowNode(outputGroup.id, {
          note: errorMessage,
          groupRunning: false,
        });
        message.error(errorMessage);
        console.error(
          "[LibTvWorkflowCanvas] storyboard batch video generation failed",
          error,
        );
        if (isWorkflowProviderAccessError(error)) throw error;
      }
    },
    [
      addWorkflowNode,
      edges,
      moveWorkflowNode,
      nodes,
      projectId,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );
  const handleSelectNode = useCallback(
    (id: string) => {
      selectLayer(id);
      setActiveWorkflowNode(id);
    },
    [selectLayer, setActiveWorkflowNode],
  );

  const handleWorkflowSelectionChange = useCallback(
    (ids: string[]) => {
      const nodeIdSet = new Set(nodes.map((node) => node.id));
      const nextIds = Array.from(
        new Set(ids.filter((id) => nodeIdSet.has(id))),
      ).sort();
      const currentIds = Array.from(
        new Set(selectedIds.filter((id) => nodeIdSet.has(id))),
      ).sort();
      if (
        currentIds.length === nextIds.length &&
        currentIds.every((id, index) => id === nextIds[index])
      )
        return;
      setWorkflowSelectedIds(nextIds);
    },
    [nodes, selectedIds, setWorkflowSelectedIds],
  );

  const handleGroupWorkflowNodes = useCallback(
    (
      ids: string[],
      options?: { backgroundColor?: string; mode?: "normal" | "storyboard" },
    ) => {
      const group = groupWorkflowNodes(ids, options);
      if (group) {
        selectLayer(group.id);
        setActiveWorkflowNode(group.id);
        setWorkflowSelectedIds([group.id]);
        message.success(
          options?.mode === "storyboard" ? "已合并分镜组" : "已打组",
        );
      }
    },
    [
      groupWorkflowNodes,
      selectLayer,
      setActiveWorkflowNode,
      setWorkflowSelectedIds,
    ],
  );

  const handleImportScriptV2Assets = useCallback(
    (
      sourceId: string,
      request: {
        title: string;
        rows: LibTvStoryboardScriptRow[];
        assetsByKind: Record<LibTvScriptV2AssetKind, LibTvScriptV2AssetItem[]>;
        codexTaskId?: string;
      },
    ) => {
      const sourceNode = workflowNodesRef.current.find(
        (node) => node.id === sourceId && node.kind === "script-v2",
      );
      if (!sourceNode) return;
      const orderedAssets = (
        ["角色", "场景", "道具"] as LibTvScriptV2AssetKind[]
      )
        .flatMap((kind) =>
          (Array.isArray(request.assetsByKind?.[kind])
            ? request.assetsByKind[kind]
            : []
          ).map((asset) => ({ ...asset, kind })),
        )
        .filter((asset) => String(asset.imageUrl || "").trim());
      if (orderedAssets.length === 0) {
        message.warning("暂无可导入画布的资产图");
        return;
      }

      const previousGroupId = String(
        (sourceNode.data as any)?.scriptV2AssetGroupId || "",
      ).trim();
      if (previousGroupId) {
        useCanvasStore.setState(
          (state: ReturnType<typeof useCanvasStore.getState>) => {
            const previousGroup = state.libtvWorkflow.nodes.find(
              (node: LibTvWorkflowNode) =>
                node.id === previousGroupId && node.kind === "group",
            );
            if (
              !previousGroup ||
              String(
                (previousGroup.data as any)
                  ?.workflowScriptV2AssetGroupSourceId || "",
              ) !== sourceId
            )
              return state;
            const previousMemberIds = new Set<string>([
              previousGroup.id,
              ...(Array.isArray(previousGroup.data.groupNodeIds)
                ? previousGroup.data.groupNodeIds
                : []),
              ...state.libtvWorkflow.nodes
                .filter(
                  (node: LibTvWorkflowNode) =>
                    node.parentId === previousGroup.id,
                )
                .map((node: LibTvWorkflowNode) => node.id),
            ]);
            return {
              libtvWorkflow: {
                ...state.libtvWorkflow,
                nodes: state.libtvWorkflow.nodes.filter(
                  (node: LibTvWorkflowNode) => !previousMemberIds.has(node.id),
                ),
                edges: state.libtvWorkflow.edges.filter(
                  (edge) =>
                    !previousMemberIds.has(edge.source) &&
                    !previousMemberIds.has(edge.target),
                ),
              },
            };
          },
        );
      }

      const codexTaskId = String(
        request.codexTaskId || sourceNode.data?.workflowCodexTaskId || "",
      ).trim();
      const reusableAssets = orderedAssets.flatMap((asset) => {
        const sourceNodeId = String(asset.sourceNodeId || "").trim();
        const existingNode = workflowNodesRef.current.find(
          (node) =>
            node.id === sourceNodeId &&
            node.kind === "image" &&
            Boolean(getWorkflowNodeReferenceImageUrl(node)),
        );
        return existingNode ? [{ asset, node: existingNode }] : [];
      });
      const reusableAssetIds = new Set(
        reusableAssets.map(({ asset }) => String(asset.id || "").trim()),
      );
      const assetsToCreate = orderedAssets.filter(
        (asset) => !reusableAssetIds.has(String(asset.id || "").trim()),
      );
      reusableAssets.forEach(({ asset, node }) => {
        updateWorkflowNode(node.id, {
          workflowScriptV2AssetKind: asset.kind,
          workflowScriptV2AssetId: String(asset.id || "").trim(),
          workflowScriptV2AssetModelId: String(asset.modelId || "").trim(),
          workflowAssetStage:
            String(asset.assetStage || "").trim() || undefined,
          workflowAssetPersonaId:
            String(asset.personaId || "").trim() || undefined,
          workflowAssetReviewStatus: asset.reviewStatus,
          workflowSceneCleanPlate: asset.cleanPlate === true,
          ...(codexTaskId
            ? {
                workflowGenerationController: "codex",
                workflowCodexTaskId: codexTaskId,
              }
            : {}),
        } as any);
      });

      if (assetsToCreate.length === 0) {
        const fallbackScriptResult: LibTvStoryboardScriptResult = {
          title: String(sourceNode.data?.title || "脚本生成器"),
          summary: "",
          sourceScript: "",
          userPrompt: String(sourceNode.data?.prompt || ""),
          selectedOptionId: String(
            sourceNode.data?.selectedOptionId || "custom",
          ),
          rows: [],
          generatedAt: Date.now(),
        };
        updateWorkflowNode(sourceId, {
          scriptResult: {
            ...(sourceNode.data?.scriptResult || fallbackScriptResult),
            rows: request.rows,
          },
          scriptV2ActiveStep: "compose-prompts",
          scriptV2AssetsByKind: request.assetsByKind,
          scriptV2AssetGroupId: undefined,
          suppressGenerationBar: true,
        } as any);
        reusableAssets.forEach(({ node }) =>
          addWorkflowEdge(node.id, sourceId),
        );
        message.success(`已复用并连接 ${reusableAssets.length} 个现有资产节点`);
        return;
      }

      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const columns = 1;
      const cardWidth = 360;
      const cardHeight = 203;
      const gap = 36;
      const padding = 44;
      const rows = Math.ceil(assetsToCreate.length / columns);
      const groupWidth = Math.round(
        columns * cardWidth + Math.max(0, columns - 1) * gap + padding * 2,
      );
      const groupHeight = Math.round(
        rows * cardHeight + Math.max(0, rows - 1) * gap + padding * 2,
      );
      const groupPlacement = allocateCodexWorkflowTaskPlacement({
        nodes: workflowNodesRef.current.map(getCodexWorkflowTaskPlacementNode),
        taskId: codexTaskId,
        stage: "assets",
        bounds: getWorkflowVisibleBounds({
          flow: flowRef.current,
          container: containerRef.current,
        }),
        width: groupWidth,
        height: groupHeight,
        preferredPosition: codexTaskId
          ? null
          : {
              x: Math.round(Number(sourceNode.x || 0) - groupWidth - 240),
              y: Math.round(
                Number(sourceNode.y || 0) + sourceHeight / 2 - groupHeight / 2,
              ),
            },
      });
      const groupX = groupPlacement.placement.x;
      const groupY = groupPlacement.placement.y;
      const rawTitle = String(
        request.title || sourceNode.data?.title || "脚本",
      ).trim();
      const baseTitle =
        rawTitle.replace(/(?:脚本生成器|镜头脚本|脚本)$/u, "").trim() ||
        rawTitle;
      const groupTitle = `${baseTitle}资产组`;

      const groupNode = addWorkflowNode("group", { x: groupX, y: groupY });
      moveWorkflowNode(groupNode.id, {
        x: groupX,
        y: groupY,
        width: groupWidth,
        height: groupHeight,
      });

      const childNodes = assetsToCreate.map((asset, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const childX = padding + column * (cardWidth + gap);
        const childY = padding + row * (cardHeight + gap);
        const imageNode = addWorkflowNode("image", {
          x: groupX + childX,
          y: groupY + childY,
        });
        updateWorkflowNode(imageNode.id, {
          title: String(asset.title || `${asset.kind}${index + 1}`).trim(),
          content: "",
          prompt: String(asset.prompt || "").trim(),
          mediaUrl: String(asset.imageUrl || "").trim(),
          mediaRole: "ordinary",
          componentType: "image-asset",
          selectedOptionId: "reference-image",
          options: [],
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          suppressGenerationBar: false,
          workflowScriptV2AssetKind: asset.kind,
          workflowScriptV2AssetId: String(asset.id || "").trim(),
          workflowScriptV2AssetModelId: String(asset.modelId || "").trim(),
          workflowAssetStage:
            String(asset.assetStage || "").trim() || undefined,
          workflowAssetPersonaId:
            String(asset.personaId || "").trim() || undefined,
          workflowAssetReviewStatus:
            asset.reviewStatus === "approved" ||
            asset.reviewStatus === "rejected" ||
            asset.reviewStatus === "pending"
              ? asset.reviewStatus
              : undefined,
          workflowSceneCleanPlate: asset.cleanPlate === true,
          workflowGenerationJobId:
            String(asset.generationJobId || "").trim() || undefined,
          workflowGenerationTaskId:
            String(asset.generationTaskId || "").trim() || undefined,
          workflowGenerationTaskType:
            String(asset.generationTaskType || "").trim() || undefined,
          workflowGenerationProviderKey:
            String(asset.generationProviderKey || "")
              .trim()
              .toLowerCase() || undefined,
          ...(codexTaskId
            ? {
                workflowGenerationController: "codex",
                workflowCodexTaskId: codexTaskId,
              }
            : {}),
          workflowMediaFrameLocked: true,
        } as any);
        moveWorkflowNode(imageNode.id, {
          x: groupX + childX,
          y: groupY + childY,
          width: cardWidth,
          height: cardHeight,
        });
        return { id: imageNode.id };
      });

      useCanvasStore.setState(
        (state: ReturnType<typeof useCanvasStore.getState>) => ({
          libtvWorkflow: {
            ...state.libtvWorkflow,
            activeNodeId: groupNode.id,
            nodes: state.libtvWorkflow.nodes.map((node: LibTvWorkflowNode) => {
              if (node.id === groupNode.id) {
                return {
                  ...node,
                  x: groupX,
                  y: groupY,
                  width: groupWidth,
                  height: groupHeight,
                  data: {
                    ...node.data,
                    title: groupTitle,
                    content: "",
                    mediaUrl: "",
                    mediaRole: undefined,
                    groupNodeIds: childNodes.map((child) => child.id),
                    groupBackgroundColor: "rgba(255,255,255,0.06)",
                    groupRunning: false,
                    groupCollapsed: false,
                    workflowScriptV2AssetGroupSourceId: sourceId,
                    ...(codexTaskId
                      ? {
                          workflowGenerationController: "codex",
                          workflowCodexTaskId: codexTaskId,
                          workflowCodexLayoutAnchorX: groupPlacement.anchor.x,
                          workflowCodexLayoutAnchorY: groupPlacement.anchor.y,
                          workflowCodexLayoutIndex: groupPlacement.layoutIndex,
                          workflowCodexLayoutStage: groupPlacement.layoutStage,
                          workflowCodexLayoutRow: groupPlacement.layoutRow,
                        }
                      : {}),
                  } as any,
                };
              }
              if (childNodes.some((child) => child.id === node.id)) {
                return { ...node, parentId: undefined };
              }
              return node;
            }),
          },
          selectedIds: [groupNode.id],
        }),
      );
      const fallbackScriptResult: LibTvStoryboardScriptResult = {
        title: String(sourceNode.data?.title || "脚本生成器"),
        summary: "",
        sourceScript: "",
        userPrompt: String(sourceNode.data?.prompt || ""),
        selectedOptionId: String(sourceNode.data?.selectedOptionId || "custom"),
        rows: [],
        generatedAt: Date.now(),
      };
      updateWorkflowNode(sourceId, {
        scriptResult: {
          ...(sourceNode.data?.scriptResult || fallbackScriptResult),
          rows: request.rows,
        },
        scriptV2ActiveStep: "compose-prompts",
        scriptV2AssetsByKind: request.assetsByKind,
        scriptV2AssetGroupId: groupNode.id,
        suppressGenerationBar: true,
      } as any);
      reusableAssets.forEach(({ node }) => addWorkflowEdge(node.id, sourceId));
      childNodes.forEach((child) => addWorkflowEdge(child.id, sourceId));
      selectLayer(groupNode.id);
      setActiveWorkflowNode(groupNode.id);
      setWorkflowSelectedIds([groupNode.id]);
      window.setTimeout(() => {
        void flowRef.current?.fitView({
          nodes: [{ id: groupNode.id }, { id: sourceId }],
          padding: 0.24,
          duration: 420,
          maxZoom: 0.9,
        });
      }, 0);
      message.success(
        `已复用 ${reusableAssets.length} 个现有资产，并补充导入 ${childNodes.length} 个资产`,
      );
    },
    [
      addWorkflowEdge,
      addWorkflowNode,
      moveWorkflowNode,
      selectLayer,
      setActiveWorkflowNode,
      setWorkflowSelectedIds,
      updateWorkflowNode,
    ],
  );
  useLayoutEffect(() => {
    codexNativeStoryboardActionsRef.current = {
      createImages: handleGenerateStoryboardFromScript,
      regenerateImages: handleRegenerateStoryboardImages,
      createVideos: handleGenerateStoryboardVideos,
      importAssets: handleImportScriptV2Assets,
    };
    return () => {
      codexNativeStoryboardActionsRef.current = {};
    };
  }, [
    handleGenerateStoryboardFromScript,
    handleGenerateStoryboardVideos,
    handleImportScriptV2Assets,
    handleRegenerateStoryboardImages,
  ]);

  const handleCreatePlaylistFromSelection = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const videoNodes = nodes
        .filter(
          (node) =>
            idSet.has(node.id) &&
            node.kind === "video" &&
            String(node.data?.mediaUrl || "").trim(),
        )
        .sort(
          (a, b) =>
            Number(a.y || 0) - Number(b.y || 0) ||
            Number(a.x || 0) - Number(b.x || 0),
        );
      if (videoNodes.length < 2) {
        message.warning("请选择至少 2 个视频节点");
        return;
      }
      const minX = Math.min(...videoNodes.map((node) => Number(node.x || 0)));
      const maxX = Math.max(
        ...videoNodes.map(
          (node) =>
            Number(node.x || 0) +
            Number(node.width || workflowNodeFrame("video").width),
        ),
      );
      const maxY = Math.max(
        ...videoNodes.map(
          (node) =>
            Number(node.y || 0) +
            Number(node.height || workflowNodeFrame("video").height),
        ),
      );
      const playlistFrame = workflowNodeFrame("playlist");
      const playlistNode = addWorkflowNode("playlist", {
        x: Math.round(minX + (maxX - minX) / 2 - playlistFrame.width / 2),
        y: Math.round(maxY + 96),
      });
      updateWorkflowNode(playlistNode.id, {
        title: getDefaultNodeTitle("playlist"),
        playlistItems: videoNodes.map((node, index) => ({
          id: `${playlistNode.id}-${index}`,
          nodeId: node.id,
          title: String(node.data?.title || `视频 ${index + 1}`),
          mediaUrl: String(node.data?.mediaUrl || "").trim(),
          thumbnailUrl: String(node.data?.thumbnailUrl || "").trim(),
          duration: parseWorkflowDurationSeconds(
            node.data?.videoDuration || node.data?.workflowStoryboardDuration,
            5,
          ),
        })),
        playlistActiveIndex: 0,
        playlistPanelOpen: false,
        playlistTrimStart: 0,
        playlistTrimEnd: undefined,
        playlistExportUrl: undefined,
        playlistExportRunning: false,
      });
      selectLayer(playlistNode.id);
      setActiveWorkflowNode(playlistNode.id);
      message.success("已创建播放列表");
    },
    [
      addWorkflowNode,
      getDefaultNodeTitle,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleCreateNodeFromSelection = useCallback(
    (kind: LibTvWorkflowNodeKind, ids: string[]) => {
      const selectedNodeSet = new Set(ids);
      const materialNodes = nodes
        .filter(
          (node) =>
            selectedNodeSet.has(node.id) &&
            ((node.kind === "image" &&
              node.data?.mediaRole === "ordinary" &&
              String(node.data?.mediaUrl || "").trim()) ||
              (node.kind === "video" &&
                node.data?.mediaRole === "ordinary" &&
                String(node.data?.mediaUrl || "").trim()) ||
              (node.kind === "audio" &&
                node.data?.mediaRole === "ordinary" &&
                String(node.data?.mediaUrl || "").trim()) ||
              isWorkflowImageGeneratorResultGroupNode(node)),
        )
        .sort(
          (a, b) =>
            Number(a.y || 0) - Number(b.y || 0) ||
            Number(a.x || 0) - Number(b.x || 0),
        );
      if (materialNodes.length === 0) {
        message.warning("请先选择图片、视频或音频素材");
        return;
      }
      if (
        kind !== "image" &&
        kind !== "video" &&
        kind !== "text" &&
        kind !== "script" &&
        kind !== "script-v2"
      ) {
        message.warning("当前不支持把素材选择转换成该类型节点");
        return;
      }

      const targetFrame =
        kind === "video"
          ? workflowVideoGeneratorFrame()
          : workflowNodeFrame(kind);
      const gap = 240;
      const sourceTop = Math.min(
        ...materialNodes.map((node) => Number(node.y || 0)),
      );
      const sourceRight = Math.max(
        ...materialNodes.map((node) => {
          const frame =
            node.kind === "group"
              ? {
                  width: workflowNodeFrame("image").width,
                  height: workflowNodeFrame("image").height,
                }
              : workflowNodeFrame(node.kind);
          return (
            Number(node.x || 0) +
            Math.max(frame.width, Number(node.width || frame.width))
          );
        }),
      );
      const sourceBottom = Math.max(
        ...materialNodes.map((node) => {
          const frame =
            node.kind === "group"
              ? {
                  width: workflowNodeFrame("image").width,
                  height: workflowNodeFrame("image").height,
                }
              : workflowNodeFrame(node.kind);
          return (
            Number(node.y || 0) +
            Math.max(frame.height, Number(node.height || frame.height))
          );
        }),
      );
      const targetX = Math.round(sourceRight + gap);
      const targetY = Math.round(
        sourceTop + (sourceBottom - sourceTop) / 2 - targetFrame.height / 2,
      );

      const targetNode = addWorkflowNode(kind, {
        x: targetX,
        y: targetY,
        linkFromNodeId: materialNodes[0].id,
      });
      const defaultTargetVideoModelId =
        kind === "video" ? String(targetNode.data?.modelId || "").trim() : "";
      const shouldUseSeedanceVirtualAssets =
        kind === "video" &&
        isWorkflowSeedance2VideoModel(defaultTargetVideoModelId);
      const referenceImageNodes = materialNodes.filter(
        (node) =>
          (node.kind === "image" &&
            node.data?.mediaRole === "ordinary" &&
            String(node.data?.mediaUrl || "").trim()) ||
          isWorkflowImageGeneratorResultGroupNode(node),
      );
      const seedanceCharacterNodeIds = shouldUseSeedanceVirtualAssets
        ? new Set(
            referenceImageNodes
              .filter((node) =>
                Boolean(buildWorkflowVideoCharacterAssetFromNode(node)),
              )
              .map((node) => node.id),
          )
        : new Set<string>();
      const regularReferenceImageNodes = referenceImageNodes.filter(
        (node) => !seedanceCharacterNodeIds.has(node.id),
      );
      const activeReferenceImageNodes =
        kind === "video" ? regularReferenceImageNodes : referenceImageNodes;
      const referenceImages = activeReferenceImageNodes
        .map((node) => String(node.data?.mediaUrl || "").trim())
        .filter(Boolean);
      if (kind === "text") {
        updateWorkflowNode(targetNode.id, {
          title: getDefaultNodeTitle("text"),
          content: "",
          prompt: "",
          componentType: "text-generator",
          selectedOptionId: "custom",
          referenceImages,
          referenceImageNodeIds: activeReferenceImageNodes.map(
            (node) => node.id,
          ),
          note: "",
          suppressGenerationBar: false,
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
        });
      } else if (kind === "script" || kind === "script-v2") {
        updateWorkflowNode(targetNode.id, {
          title: getDefaultNodeTitle(kind),
          content: "",
          prompt: "",
          componentType:
            kind === "script-v2" ? "script-v2-generator" : "script-document",
          selectedOptionId: "custom",
          referenceImages,
          referenceImageNodeIds: activeReferenceImageNodes.map(
            (node) => node.id,
          ),
          note: "",
          suppressGenerationBar: false,
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
        });
      } else if (kind === "image") {
        updateWorkflowNode(targetNode.id, {
          title: getDefaultNodeTitle("image"),
          content: "",
          prompt: "根据左侧参考图片生成图片。",
          mediaUrl: "",
          mediaRole: "generator",
          selectedOptionId: "reference-image",
          componentType: "image-generator",
          referenceImages,
          referenceImageNodeIds: activeReferenceImageNodes.map(
            (node) => node.id,
          ),
          referenceImageRoles: activeReferenceImageNodes.map(() => "reference"),
          note: "",
          suppressGenerationBar: false,
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
        });
      } else {
        updateWorkflowNode(targetNode.id, {
          title: getDefaultNodeTitle("video"),
          content: "",
          prompt: "",
          mediaUrl: "",
          mediaRole: "generator",
          selectedOptionId: "text-to-video",
          componentType: "video-generator",
          referenceImages,
          referenceImageNodeIds: regularReferenceImageNodes.map(
            (node) => node.id,
          ),
          referenceImageRoles: regularReferenceImageNodes.map(
            () => "reference",
          ),
          note: "",
          suppressGenerationBar: false,
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
        });
      }
      moveWorkflowNode(targetNode.id, {
        x: targetX,
        y: targetY,
        width: targetFrame.width,
        height: targetFrame.height,
      });
      materialNodes.forEach((node, index) => {
        if (index === 0) return;
        addWorkflowEdge(node.id, targetNode.id);
      });
      regularReferenceImageNodes.forEach((node) => {
        attachWorkflowReferenceImage(targetNode.id, node.id);
      });
      selectLayer(targetNode.id);
      setActiveWorkflowNode(targetNode.id);
      window.setTimeout(() => {
        void flowRef.current?.fitView({
          nodes: [
            { id: targetNode.id },
            ...materialNodes.map((node) => ({ id: node.id })),
          ],
          padding: 0.28,
          duration: 360,
          maxZoom: 1,
        });
      }, 0);
      message.success(
        kind === "video"
          ? `已创建视频生成器并连接 ${materialNodes.length} 个素材`
          : kind === "image"
            ? `已创建图片生成器并引用 ${referenceImageNodes.length} 张图片`
            : `已创建${kind === "text" ? "文本" : "脚本"}生成器并连接 ${materialNodes.length} 个素材`,
      );
    },
    [
      addWorkflowEdge,
      addWorkflowNode,
      attachWorkflowReferenceImage,
      getDefaultNodeTitle,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleConvertGroupToStoryboard = useCallback(
    (id: string) => {
      const group = convertWorkflowGroupToStoryboard(id);
      if (group) {
        message.success("已转为分镜组");
      } else {
        message.warning("只有组内全是普通图片时，才能转为分镜组");
      }
    },
    [convertWorkflowGroupToStoryboard],
  );

  const handleRunWorkflowGroup = useCallback(
    (id: string) => {
      const group = nodes.find(
        (node) => node.id === id && node.kind === "group",
      );
      if (!group) return;
      if (group.data?.groupRunning) {
        message.info("整组正在执行中");
        return;
      }
      const storyboardVideoSourceGroupId = String(
        (group.data as any)?.workflowStoryboardVideoSourceGroupId || "",
      ).trim();
      if (storyboardVideoSourceGroupId) {
        const videoDuration = String(
          (group.data as any)?.storyboardVideoDuration || "",
        );
        const maxClipDurationSeconds = Number(
          String(videoDuration).replace(/[^\d.]/g, ""),
        );
        void handleGenerateStoryboardVideos(storyboardVideoSourceGroupId, {
          modelId: String((group.data as any)?.storyboardVideoModelId || ""),
          aspectRatio:
            String((group.data as any)?.storyboardVideoAspectRatio || "") ||
            undefined,
          videoResolution:
            String((group.data as any)?.storyboardVideoResolution || "") ||
            undefined,
          videoDuration: videoDuration || undefined,
          videoMethod:
            String((group.data as any)?.storyboardVideoMethod || "") ||
            undefined,
          generationCount: Number.isFinite(
            Number((group.data as any)?.storyboardVideoGenerationCount),
          )
            ? Math.max(
                1,
                Math.round(
                  Number((group.data as any)?.storyboardVideoGenerationCount),
                ),
              )
            : undefined,
          generateAudio:
            typeof (group.data as any)?.storyboardVideoGenerateAudio ===
            "boolean"
              ? Boolean((group.data as any).storyboardVideoGenerateAudio)
              : undefined,
          enableWebSearch:
            typeof (group.data as any)?.storyboardVideoWebSearch === "boolean"
              ? Boolean((group.data as any).storyboardVideoWebSearch)
              : undefined,
          rowIndexes: Array.isArray(
            (group.data as any)?.workflowStoryboardVideoRowIndexes,
          )
            ? (group.data as any).workflowStoryboardVideoRowIndexes
            : undefined,
          rowDurations:
            (group.data as any)?.workflowStoryboardVideoRowDurations &&
            typeof (group.data as any).workflowStoryboardVideoRowDurations ===
              "object"
              ? (group.data as any).workflowStoryboardVideoRowDurations
              : undefined,
          workflowExtraParameters: (group.data as any)
            ?.storyboardVideoExtraParameters,
          maxClipDurationSeconds:
            Number.isFinite(maxClipDurationSeconds) &&
            maxClipDurationSeconds > 0
              ? maxClipDurationSeconds
              : undefined,
          outputGroupId: group.id,
        });
        return;
      }
      const groupMemberIds = new Set(
        Array.isArray(group.data?.groupNodeIds)
          ? group.data.groupNodeIds
              .map((memberId) => String(memberId || "").trim())
              .filter(Boolean)
          : [],
      );
      const storyboardPlaceholderChildren = nodes.filter(
        (node) =>
          (node.parentId === group.id || groupMemberIds.has(node.id)) &&
          node.kind === "image" &&
          (Number.isFinite(
            Number(node.data?.workflowStoryboardSourceRowIndex),
          ) ||
            String(
              (node.data as any)?.workflowStoryboardSourceNodeId || "",
            ).trim()),
      );
      const hasPendingStoryboardImages = storyboardPlaceholderChildren.some(
        (child) => {
          const mediaUrl = String(child.data?.mediaUrl || "").trim();
          const error = String(
            child.data?.workflowGenerationError || "",
          ).trim();
          const note = String(child.data?.note || "").trim();
          return (
            !mediaUrl ||
            Boolean(error) ||
            note === "已清空" ||
            note === "未生成" ||
            note === "等待生成" ||
            note === "等待整组执行" ||
            note === "未完成，可重试"
          );
        },
      );
      if (
        (group.data as any)?.workflowStoryboardPending ||
        storyboardPlaceholderChildren.length > 0 ||
        hasPendingStoryboardImages
      ) {
        void handleRegenerateStoryboardImages(group.id);
        return;
      }
      const executionLevels = computeWorkflowGroupExecutionLevels({
        group,
        nodes,
        edges,
      });
      const runnableCount = executionLevels.reduce(
        (total, level) => total + level.length,
        0,
      );
      if (runnableCount === 0) {
        message.info("组内没有可执行的生成节点");
        return;
      }
      updateWorkflowNode(group.id, {
        groupRunning: true,
        note: `整组执行中 0/${runnableCount}`,
      });
      message.success(`已开始整组执行 ${runnableCount} 个节点`);

      void (async () => {
        let completedCount = 0;
        const failedNodeIds = new Set<string>();
        const blockedNodeIds = new Set<string>();
        const groupEdges = edges.filter((edge) => {
          const source = String(edge.source || "");
          const target = String(edge.target || "");
          return source && target;
        });

        try {
          for (const level of executionLevels) {
            const runnableLevel = level.filter((node) => {
              const upstreamIds = groupEdges
                .filter((edge) => edge.target === node.id)
                .map((edge) => edge.source);
              const blocked = upstreamIds.some(
                (sourceId) =>
                  failedNodeIds.has(sourceId) || blockedNodeIds.has(sourceId),
              );
              if (blocked) {
                blockedNodeIds.add(node.id);
                completedCount += 1;
                return false;
              }
              return true;
            });

            updateWorkflowNode(group.id, {
              groupRunning: true,
              note: `整组执行中 ${completedCount}/${runnableCount}`,
            });

            await Promise.all(
              runnableLevel.map(async (node) => {
                const started = await handleGenerateWorkflowNodeRef.current(
                  node.id,
                );
                if (started === false) {
                  failedNodeIds.add(node.id);
                  completedCount += 1;
                  return;
                }
                const settled = await waitForWorkflowNodeGenerationSettled(
                  node.id,
                );
                if (!settled.success) failedNodeIds.add(node.id);
                completedCount += 1;
                updateWorkflowNode(group.id, {
                  groupRunning: completedCount < runnableCount,
                  note: `整组执行中 ${completedCount}/${runnableCount}`,
                });
              }),
            );
          }

          const failedCount = failedNodeIds.size;
          const blockedCount = blockedNodeIds.size;
          updateWorkflowNode(group.id, {
            groupRunning: false,
            note:
              failedCount || blockedCount
                ? `整组执行完成，失败 ${failedCount} 个，跳过 ${blockedCount} 个`
                : "",
          });
          if (failedCount || blockedCount) {
            message.warning(
              `整组执行完成，失败 ${failedCount} 个，跳过 ${blockedCount} 个`,
            );
          } else {
            message.success("整组执行完成");
          }
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "整组执行失败";
          updateWorkflowNode(group.id, {
            groupRunning: false,
            note: messageText,
          });
          message.error(messageText);
          console.error(
            "[LibTvWorkflowCanvas] workflow group run failed",
            error,
          );
        }
      })();
    },
    [
      edges,
      handleGenerateStoryboardVideos,
      handleRegenerateStoryboardImages,
      nodes,
      updateWorkflowNode,
    ],
  );

  const handleUngroupWorkflowNode = useCallback(
    (id: string) => {
      ungroupWorkflowNode(id);
      message.success("已解组");
    },
    [ungroupWorkflowNode],
  );

  const handlePaneClick = useCallback(() => {
    selectLayer(null);
    setActiveWorkflowNode(null);
    setWorkflowSelectedIds([]);
  }, [selectLayer, setActiveWorkflowNode, setWorkflowSelectedIds]);

  const handleAddLinkedNode = useCallback(
    (
      sourceId: string,
      kind: LibTvWorkflowNodeKind,
      side: "left" | "right",
      position?: { x: number; y: number },
    ) => {
      const sourceNode = nodes.find((node) => node.id === sourceId);
      if (!sourceNode) return;
      const isImageGeneratorLeftInput =
        side === "left" &&
        sourceNode.kind === "image" &&
        sourceNode.data?.mediaRole === "generator";
      const isImageGeneratorLeftImageInput =
        isImageGeneratorLeftInput && kind === "image";
      const isVideoGeneratorLeftInput =
        side === "left" &&
        sourceNode.kind === "video" &&
        sourceNode.data?.mediaRole === "generator";
      const isLinkedTextNode = side === "left" && kind === "text";
      const linkedTextNodeTitle = `文本节点${nodes.filter((item) => item.kind === "text" && item.data?.componentType === "text-editor").length + 1}`;
      const frame = isLinkedTextNode
        ? {
            width: WORKFLOW_TEXT_EDITOR_WIDTH,
            height: WORKFLOW_TEXT_EDITOR_HEIGHT,
          }
        : workflowNodeFrame(kind);
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const gap = 240;
      const fallbackX =
        side === "right"
          ? Number(sourceNode.x || 0) + sourceWidth + gap
          : Number(sourceNode.x || 0) - frame.width - gap;
      const fallbackY =
        Number(sourceNode.y || 0) + (sourceHeight - frame.height) / 2;
      const x = position ? Math.round(Number(position.x || 0)) : fallbackX;
      const y = position
        ? Math.round(Number(position.y || 0) - frame.height / 2)
        : fallbackY;
      const node = createWorkflowNode(kind, {
        title: isLinkedTextNode ? linkedTextNodeTitle : undefined,
        x,
        y,
        linkFromNodeId: side === "right" ? sourceId : null,
        linkToNodeId: side === "left" ? sourceId : null,
      });
      if (!node) return;
      if (isImageGeneratorLeftImageInput) {
        updateWorkflowNode(node.id, {
          title: getDefaultNodeTitle("image"),
          content: "",
          prompt: "",
          mediaUrl: LIBTV_DEFAULT_ORDINARY_IMAGE_URL,
          mediaRole: "ordinary",
          selectedOptionId: "custom",
          options: [],
        });
      }
      if (isVideoGeneratorLeftInput) {
        if (kind === "image" || kind === "video" || kind === "audio") {
          updateWorkflowNode(node.id, {
            title: getDefaultNodeTitle(kind),
            content: "",
            prompt: "",
            mediaRole: "ordinary",
            selectedOptionId: "custom",
            options: [],
          });
        }
      }
      const isTextGeneratorContext =
        side === "left" &&
        sourceNode.kind === "text" &&
        sourceNode.data?.componentType !== "text-editor";
      if (isLinkedTextNode) {
        updateWorkflowNode(node.id, {
          title: linkedTextNodeTitle,
          content: "",
          prompt: "",
          componentType: "text-editor",
          selectedOptionId: "custom",
          options: [],
          suppressGenerationBar: true,
        });
        moveWorkflowNode(node.id, {
          width: WORKFLOW_TEXT_EDITOR_WIDTH,
          height: WORKFLOW_TEXT_EDITOR_HEIGHT,
        });
      }
      if (isTextGeneratorContext && (kind === "image" || kind === "video")) {
        updateWorkflowNode(node.id, {
          title: getDefaultNodeTitle(kind),
          content: "",
          prompt: "",
          mediaRole: "ordinary",
          selectedOptionId: "custom",
          options: [],
        });
      }
      if (side === "right" && sourceNode.kind === "image" && kind === "image") {
        attachWorkflowReferenceImage(node.id, sourceId);
      }
      if (
        side === "left" &&
        kind === "image" &&
        sourceNode.kind === "image" &&
        sourceNode.data?.mediaRole !== "generator"
      ) {
        attachWorkflowReferenceImage(sourceId, node.id);
      }
      selectLayer(node.id);
      setActiveWorkflowNode(node.id);
    },
    [
      attachWorkflowReferenceImage,
      createWorkflowNode,
      getDefaultNodeTitle,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleRunTextGeneratorPreset = useCallback(
    (sourceId: string, optionId: string) => {
      const sourceNode = nodes.find((node) => node.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "text") return;

      if (optionId === "image-reverse-prompt") {
        const imageWidth = 350;
        const imageHeight = 467;
        const imageX = Math.round(Number(sourceNode.x || 0) - imageWidth - 52);
        const imageY = Math.round(Number(sourceNode.y || 0));
        const textX = Math.round(Number(sourceNode.x || 0));
        const textY = Math.round(Number(sourceNode.y || 0));

        const imageNode = addWorkflowNode("image", {
          x: imageX,
          y: imageY,
          linkToNodeId: sourceId,
        });
        updateWorkflowNode(imageNode.id, {
          title: getDefaultNodeTitle("image"),
          content: "",
          prompt: "",
          mediaUrl: WORKFLOW_IMAGE_REVERSE_PROMPT_PRESET_IMAGE_URL,
          mediaRole: "ordinary",
          selectedOptionId: "custom",
          options: [],
        });
        moveWorkflowNode(imageNode.id, {
          x: imageX,
          y: imageY,
          width: imageWidth,
          height: imageHeight,
        });

        updateWorkflowNode(sourceId, {
          title:
            String(sourceNode.data?.title || "").trim() ||
            getDefaultNodeTitle("text"),
          content: "",
          prompt: "",
          componentType: "text-generator",
          selectedOptionId: "image-reverse-prompt",
          optionId: "image-reverse-prompt",
          optionLabel: "图片解析",
          referenceImages: [WORKFLOW_IMAGE_REVERSE_PROMPT_PRESET_IMAGE_URL],
          referenceImageNodeIds: [imageNode.id],
        });
        moveWorkflowNode(sourceId, {
          x: textX,
          y: textY,
          width: LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
          height: LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
        });

        window.setTimeout(() => {
          const group = groupWorkflowNodes([imageNode.id, sourceId], {
            backgroundColor: "rgba(255,255,255,0.06)",
          });
          if (group) {
            updateWorkflowNode(group.id, { title: "ZMTV 方案 - 图片解析" });
            selectLayer(group.id);
            setActiveWorkflowNode(group.id);
            void flowRef.current?.fitView({
              nodes: [{ id: group.id }],
              padding: 0.32,
              duration: 420,
              maxZoom: 1,
            });
          }
        }, 0);
        return;
      }

      if (optionId === "text-to-music") {
        const textWidth = 350;
        const textHeight = 338;
        const audioWidth = 350;
        const audioHeight = 338;
        const gap = 52;
        const textX = Math.round(Number(sourceNode.x || 0));
        const textY = Math.round(Number(sourceNode.y || 0));
        const audioX = Math.round(textX + textWidth + gap);
        const audioY = textY;

        updateWorkflowNode(sourceId, {
          title:
            String(sourceNode.data?.title || "").trim() ||
            getDefaultNodeTitle("text"),
          content: createWorkflowTextEditorInitialContent(
            WORKFLOW_TEXT_TO_MUSIC_DEFAULT_PROMPT,
          ),
          prompt: "",
          componentType: "text-editor",
          selectedOptionId: "custom",
          options: [],
          suppressGenerationBar: false,
        });
        moveWorkflowNode(sourceId, {
          x: textX,
          y: textY,
          width: textWidth,
          height: textHeight,
        });

        const audioNode = addWorkflowNode("audio", {
          x: audioX,
          y: audioY,
          linkFromNodeId: sourceId,
        });
        updateWorkflowNode(audioNode.id, {
          title: getDefaultNodeTitle("audio"),
          content: "",
          prompt: WORKFLOW_TEXT_TO_MUSIC_DEFAULT_PROMPT,
          lyrics: "",
          mediaUrl: "",
          mediaRole: "generator",
          selectedOptionId: "text-to-music",
          options: [],
        });
        moveWorkflowNode(audioNode.id, {
          x: audioX,
          y: audioY,
          width: audioWidth,
          height: audioHeight,
        });

        window.setTimeout(() => {
          const group = groupWorkflowNodes([sourceId, audioNode.id], {
            backgroundColor: "rgba(255,255,255,0.06)",
          });
          if (group) {
            updateWorkflowNode(group.id, { title: "ZMTV 方案 - 音乐生成" });
            selectLayer(group.id);
            setActiveWorkflowNode(group.id);
            void flowRef.current?.fitView({
              nodes: [{ id: group.id }],
              padding: 0.32,
              duration: 420,
              maxZoom: 1,
            });
          }
        }, 0);
        return;
      }

      if (optionId !== "text-to-video") return;
      const textX = Math.round(Number(sourceNode.x || 0));
      const textY = Math.round(Number(sourceNode.y || 0));
      const videoFrame = workflowVideoGeneratorFrame();
      const videoX = Math.round(textX + WORKFLOW_TEXT_EDITOR_WIDTH + 230);
      const videoY = Math.round(textY + 526);

      updateWorkflowNode(sourceId, {
        title:
          String(sourceNode.data?.title || "").trim() ||
          getDefaultNodeTitle("text"),
        content: createWorkflowTextEditorInitialContent(
          WORKFLOW_TEXT_TO_VIDEO_DEFAULT_PROMPT,
        ),
        prompt: "",
        componentType: "text-editor",
        selectedOptionId: "custom",
        options: [],
        suppressGenerationBar: false,
      });
      moveWorkflowNode(sourceId, {
        x: textX,
        y: textY,
        width: WORKFLOW_TEXT_EDITOR_WIDTH,
        height: WORKFLOW_TEXT_EDITOR_HEIGHT,
      });

      const videoNode = addWorkflowNode("video", {
        x: videoX,
        y: videoY,
        linkFromNodeId: sourceId,
      });
      updateWorkflowNode(videoNode.id, {
        title: getDefaultNodeTitle("video"),
        content: "",
        prompt: "根据文字描述生成视频。",
        mediaUrl: "",
        mediaRole: "generator",
        selectedOptionId: "text-to-video",
        options: [],
      });
      moveWorkflowNode(videoNode.id, {
        x: videoX,
        y: videoY,
        width: videoFrame.width,
        height: videoFrame.height,
      });

      window.setTimeout(() => {
        const group = groupWorkflowNodes([sourceId, videoNode.id], {
          backgroundColor: "rgba(255,255,255,0.06)",
        });
        if (group) {
          updateWorkflowNode(group.id, { title: "ZMTV 方案 - 文本视频" });
          selectLayer(group.id);
          setActiveWorkflowNode(group.id);
          void flowRef.current?.fitView({
            nodes: [{ id: group.id }],
            padding: 0.26,
            duration: 420,
            maxZoom: 1,
          });
        }
      }, 0);
    },
    [
      addWorkflowNode,
      getDefaultNodeTitle,
      groupWorkflowNodes,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleConnectNodes = useCallback(
    (sourceId: string, targetId: string) => {
      const sourceNode = nodes.find((node) => node.id === sourceId);
      const rawTargetNode = nodes.find((node) => node.id === targetId);
      const parentTargetNode = rawTargetNode?.parentId
        ? nodes.find((node) => node.id === rawTargetNode.parentId)
        : undefined;
      const shouldConnectStoryboardGroup = Boolean(
        sourceNode &&
        sourceNode.kind === "script" &&
        rawTargetNode?.kind === "image" &&
        parentTargetNode?.kind === "group" &&
        (Number.isFinite(
          Number(rawTargetNode.data?.workflowStoryboardSourceRowIndex),
        ) ||
          Boolean(
            String(
              (rawTargetNode.data as any)?.workflowStoryboardSourceNodeId || "",
            ).trim(),
          ) ||
          parentTargetNode.data?.workflowStoryboardPending === true ||
          Array.isArray(
            (parentTargetNode.data as any)?.workflowStoryboardRowIndexes,
          ) ||
          Boolean(
            String(
              (parentTargetNode.data as any)?.workflowStoryboardSourceNodeId ||
                "",
            ).trim(),
          ) ||
          String(parentTargetNode.data?.title || "").includes("分镜")),
      );
      const resolvedTargetId =
        shouldConnectStoryboardGroup && parentTargetNode
          ? parentTargetNode.id
          : targetId;
      const targetNode = nodes.find((node) => node.id === resolvedTargetId);
      if (!sourceNode || !targetNode) return;
      const rawTargetIsStoryboardImage = Boolean(
        rawTargetNode?.kind === "image" &&
        (Number.isFinite(
          Number(rawTargetNode.data?.workflowStoryboardSourceRowIndex),
        ) ||
          Boolean(
            String(
              (rawTargetNode.data as any)?.workflowStoryboardSourceNodeId || "",
            ).trim(),
          )),
      );
      const targetIsStoryboardGroup = Boolean(
        targetNode.kind === "group" &&
        (targetNode.data?.workflowStoryboardPending === true ||
          Array.isArray(
            (targetNode.data as any)?.workflowStoryboardRowIndexes,
          ) ||
          Boolean(
            String(
              (targetNode.data as any)?.workflowStoryboardSourceNodeId || "",
            ).trim(),
          ) ||
          String(targetNode.data?.title || "").includes("分镜")),
      );
      if (
        sourceNode.kind === "script-v2" &&
        (rawTargetIsStoryboardImage || targetIsStoryboardGroup)
      )
        return;
      const sourceIsImageResultGroup =
        isWorkflowImageGeneratorResultGroupNode(sourceNode);
      const sourceHasImageResult =
        sourceNode.kind === "image" &&
        Boolean(String(sourceNode.data?.mediaUrl || "").trim());
      const sourceHasVideoResult =
        sourceNode.kind === "video" &&
        Boolean(String(sourceNode.data?.mediaUrl || "").trim());
      if (
        targetNode.kind === "image" &&
        targetNode.data?.mediaRole === "generator"
      ) {
        const sourceIsImageContext =
          sourceHasImageResult || sourceIsImageResultGroup;
        const sourceIsPlainText =
          sourceNode.kind === "text" &&
          sourceNode.data?.componentType === "text-editor";
        const sourceIsScript = isWorkflowScriptKind(sourceNode.kind);
        if (!sourceIsImageContext && !sourceIsPlainText && !sourceIsScript) {
          message.warning("图片生成器左侧只能连接图片结果、普通文本、脚本");
          return;
        }
      }
      if (
        targetNode.kind === "video" &&
        targetNode.data?.mediaRole === "generator"
      ) {
        const sourceIsImageContext =
          sourceHasImageResult || sourceIsImageResultGroup;
        const sourceIsVideoContext = sourceHasVideoResult;
        const sourceIsPlainText =
          sourceNode.kind === "text" &&
          sourceNode.data?.componentType === "text-editor";
        const sourceIsScript = isWorkflowScriptKind(sourceNode.kind);
        const sourceIsAudio =
          sourceNode.kind === "audio" &&
          sourceNode.data?.mediaRole === "ordinary";
        if (
          !sourceIsImageContext &&
          !sourceIsVideoContext &&
          !sourceIsPlainText &&
          !sourceIsScript &&
          !sourceIsAudio
        ) {
          message.warning(
            "视频生成器左侧只能连接图片结果、视频结果、普通文本、脚本、普通音频",
          );
          return;
        }
      }
      if (
        targetNode.kind === "text" &&
        targetNode.data?.componentType !== "text-editor"
      ) {
        const sourceIsPlainText =
          sourceNode.kind === "text" &&
          sourceNode.data?.componentType === "text-editor";
        const sourceIsPlainMedia =
          ((sourceNode.kind === "image" || sourceNode.kind === "video") &&
            sourceNode.data?.mediaRole === "ordinary") ||
          sourceIsImageResultGroup;
        if (!sourceIsPlainText && !sourceIsPlainMedia) {
          message.warning(
            "文本生成器左侧只能连接普通文本、普通图片、普通视频节点",
          );
          return;
        }
      }
      if (isWorkflowScriptKind(targetNode.kind)) {
        const sourceIsOrdinaryImage =
          (sourceNode.kind === "image" &&
            sourceNode.data?.mediaRole === "ordinary") ||
          sourceIsImageResultGroup;
        const sourceIsOrdinaryVideo =
          sourceNode.kind === "video" &&
          sourceNode.data?.mediaRole === "ordinary";
        const sourceIsOrdinaryAudio =
          sourceNode.kind === "audio" &&
          sourceNode.data?.mediaRole === "ordinary";
        const sourceIsTextInput = sourceNode.kind === "text";
        if (
          !sourceIsOrdinaryImage &&
          !sourceIsOrdinaryVideo &&
          !sourceIsOrdinaryAudio &&
          !sourceIsTextInput
        ) {
          message.warning(
            "脚本节点左侧只能连接文本、文本生成器、普通图片、普通视频、普通音频节点",
          );
          return;
        }
      }
      if (
        targetNode.kind === "group" &&
        isWorkflowScriptKind(sourceNode.kind)
      ) {
        updateWorkflowNode(resolvedTargetId, {
          workflowStoryboardSourceNodeId: sourceNode.id,
        } as any);
      }
      addWorkflowEdge(sourceId, resolvedTargetId);
      if (
        targetNode.kind === "video" &&
        targetNode.data?.mediaRole === "generator" &&
        isWorkflowSeedance2VideoModel(targetNode.data?.modelId)
      ) {
        const characterAsset =
          buildWorkflowVideoCharacterAssetFromNode(sourceNode);
        if (characterAsset) {
          const currentReferenceImages = Array.isArray(
            targetNode.data?.referenceImages,
          )
            ? targetNode.data.referenceImages
            : [];
          const currentReferenceNodeIds = Array.isArray(
            targetNode.data?.referenceImageNodeIds,
          )
            ? targetNode.data.referenceImageNodeIds
            : [];
          const currentReferenceRoles = Array.isArray(
            targetNode.data?.referenceImageRoles,
          )
            ? targetNode.data.referenceImageRoles
            : [];
          const sourcePreviewUrl = String(
            sourceNode.data?.mediaUrl || sourceNode.data?.thumbnailUrl || "",
          ).trim();
          const nextReferenceImages: string[] = [];
          const nextReferenceNodeIds: string[] = [];
          const nextReferenceRoles: string[] = [];
          currentReferenceImages.forEach((url, index) => {
            const referenceNodeId = String(
              currentReferenceNodeIds[index] || "",
            ).trim();
            const normalizedUrl = String(url || "").trim();
            if (
              (referenceNodeId && referenceNodeId === sourceId) ||
              (sourcePreviewUrl && normalizedUrl === sourcePreviewUrl)
            ) {
              return;
            }
            nextReferenceImages.push(normalizedUrl);
            nextReferenceNodeIds.push(referenceNodeId);
            nextReferenceRoles.push(
              String(currentReferenceRoles[index] || "").trim(),
            );
          });
          updateWorkflowNode(targetId, {
            referenceImages: nextReferenceImages,
            referenceImageNodeIds: nextReferenceNodeIds,
            referenceImageRoles: nextReferenceRoles,
            videoMethod: targetNode.data?.videoMethodUserSelected
              ? targetNode.data?.videoMethod
              : "reference",
          });
          message.success("已作为 Seedance2.0 合规参考素材连接");
          return;
        }
      }
      if (
        (sourceNode.kind === "image" || sourceIsImageResultGroup) &&
        (targetNode.kind === "image" ||
          targetNode.kind === "video" ||
          isWorkflowScriptKind(targetNode.kind) ||
          targetNode.kind === "threed" ||
          targetNode.kind === "director-console-3d")
      ) {
        attachWorkflowReferenceImage(targetId, sourceId);
      }
    },
    [addWorkflowEdge, attachWorkflowReferenceImage, nodes, updateWorkflowNode],
  );

  const handleReferenceFilesUploaded = useCallback(
    (targetId: string, files: File[]) => {
      if (!targetId || files.length === 0) return;
      const targetNode = nodes.find((node) => node.id === targetId);
      if (
        !targetNode ||
        !(
          targetNode.kind === "image" ||
          targetNode.kind === "video" ||
          isWorkflowScriptKind(targetNode.kind) ||
          targetNode.kind === "threed" ||
          targetNode.kind === "director-console-3d"
        )
      )
        return;
      const compatibleFiles = files
        .map((file) => ({ file, kind: getFileNodeKind(file) }))
        .filter((entry): entry is { file: File; kind: LibTvWorkflowNodeKind } =>
          Boolean(entry.kind),
        )
        .filter(
          (entry) =>
            targetNode.kind === "video" ||
            isWorkflowScriptKind(targetNode.kind) ||
            targetNode.kind === "threed" ||
            targetNode.kind === "director-console-3d" ||
            entry.kind === "image",
        );
      if (compatibleFiles.length === 0) {
        message.warning(
          targetNode.kind === "video" || isWorkflowScriptKind(targetNode.kind)
            ? "仅支持上传图片、视频或音频文件"
            : targetNode.kind === "threed" ||
                targetNode.kind === "director-console-3d"
              ? "仅支持上传图片或视频文件"
              : "仅支持上传图片",
        );
        return;
      }
      const currentReferenceCount =
        targetNode.kind === "video"
          ? edges.filter((edge) => edge.target === targetId).length
          : Array.isArray(targetNode.data.referenceImages)
            ? targetNode.data.referenceImages.length
            : 0;
      const uploadableFiles = compatibleFiles.slice(
        0,
        Math.max(0, 14 - currentReferenceCount),
      );
      if (uploadableFiles.length === 0) return;
      if (targetNode.kind === "video") {
        const nextVideoMethod =
          inferWorkflowVideoMethodForUploadedInputs(uploadableFiles);
        if (nextVideoMethod && !targetNode.data?.videoMethodUserSelected) {
          updateWorkflowNode(targetId, { videoMethod: nextVideoMethod });
        }
      }

      const targetFrame = workflowNodeFrame(targetNode.kind);
      const targetHeight = Math.max(
        targetFrame.height,
        Number(targetNode.height || targetFrame.height),
      );
      const gap = 240;
      const verticalGap = 36;
      const existingIncomingReferences = edges.filter((edge) => {
        if (edge.target !== targetId) return false;
        const sourceKind = nodes.find((node) => node.id === edge.source)?.kind;
        return (
          sourceKind === "image" ||
          sourceKind === "video" ||
          sourceKind === "audio"
        );
      }).length;
      const xForFrame = (frameWidth: number) =>
        Number(targetNode.x || 0) - frameWidth - gap;

      uploadableFiles.forEach(({ file, kind }, index) => {
        const frame = workflowNodeFrame(kind);
        const order = existingIncomingReferences + index;
        const baseY =
          Number(targetNode.y || 0) + (targetHeight - frame.height) / 2;
        const placeholderFrame = {
          x: xForFrame(frame.width),
          y: baseY + order * (frame.height + verticalGap),
          width: frame.width,
          height: frame.height,
        };
        const node = addWorkflowNode(kind, {
          x: placeholderFrame.x,
          y: placeholderFrame.y,
          linkFromNodeId: null,
          linkToNodeId: targetId,
        });
        updateWorkflowNode(node.id, {
          title: getWorkflowUploadPlaceholderNote(kind),
          mediaUrl: "",
          mediaRole:
            kind === "image" || kind === "video" || kind === "audio"
              ? "ordinary"
              : undefined,
          content: "",
          prompt: "",
          selectedOptionId: "custom",
          options: [],
          note: getWorkflowUploadPlaceholderNote(kind),
          workflowGenerationRunning: true,
          workflowGenerationProgress: 0.08,
          workflowGenerationError: "",
          suppressGenerationBar: false,
          workflowMediaMimeType: file.type || undefined,
          workflowMediaNaturalWidth: undefined,
          workflowMediaNaturalHeight: undefined,
          workflowMediaFrameLocked: getWorkflowUploadedMediaFrameLocked(kind),
          workflowMediaUserResized: false,
        });
        void readWorkflowMediaFileSize(file, kind)
          .then((size) => {
            updateWorkflowNode(node.id, getWorkflowMediaNaturalSizePatch(size));
            applyWorkflowUploadedMediaNodeFrame(
              moveWorkflowNode,
              node.id,
              kind,
              size,
              placeholderFrame,
            );
          })
          .catch(() => undefined);
        uploadCanvasNodeFile(file)
          .then(({ publicUrl, libtvUrl }) => {
            const uploadedUrl = libtvUrl || publicUrl;
            updateWorkflowNode(node.id, {
              mediaUrl: uploadedUrl,
              mediaRole:
                kind === "image" || kind === "video" || kind === "audio"
                  ? "ordinary"
                  : undefined,
              title: shortFileName(file.name) || node.data.title,
              note: "",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              suppressGenerationBar: false,
              workflowMediaMimeType: file.type || undefined,
              workflowMediaFrameLocked:
                getWorkflowUploadedMediaFrameLocked(kind),
            });
            if (kind === "image" && targetNode.kind !== "video")
              attachWorkflowReferenceImage(targetId, node.id, uploadedUrl);
          })
          .catch((error) => {
            updateWorkflowNode(node.id, {
              title: `上传失败 - ${file.name || (kind === "video" ? "视频" : kind === "audio" ? "音频" : "Image")}`,
              note: "上传失败",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError:
                error instanceof Error ? error.message : "上传失败",
            });
            console.error(
              "[LibTvWorkflowCanvas] reference media upload failed",
              error,
            );
          });
      });
    },
    [
      addWorkflowNode,
      attachWorkflowReferenceImage,
      edges,
      nodes,
      updateWorkflowNode,
    ],
  );

  const createImageUpscalePresetGroup = useCallback(
    (targetId: string, file?: File) => {
      if (!targetId) return;
      const targetNode = nodes.find((node) => node.id === targetId);
      if (
        !targetNode ||
        targetNode.kind !== "image" ||
        targetNode.data?.mediaRole !== "generator"
      )
        return;
      if (file && getFileNodeKind(file) !== "image") {
        message.warning("仅支持上传图片");
        return;
      }

      const sourceFrame = workflowNodeFrame("image");
      const targetFrame = workflowNodeFrame("image");
      const gap = 240;
      const targetWidth = Math.max(
        targetFrame.width,
        Number(targetNode.width || targetFrame.width),
      );
      const targetHeight = Math.max(
        targetFrame.height,
        Number(targetNode.height || targetFrame.height),
      );
      const sourceX = Number(targetNode.x || 0) - sourceFrame.width - gap;
      const sourceY =
        Number(targetNode.y || 0) +
        Math.round((targetHeight - sourceFrame.height) / 2);
      const sourcePlaceholderFrame = {
        x: sourceX,
        y: sourceY,
        width: sourceFrame.width,
        height: sourceFrame.height,
      };
      const sourceNode = addWorkflowNode("image", {
        x: sourceX,
        y: sourceY,
        linkFromNodeId: null,
        linkToNodeId: targetId,
      });
      moveWorkflowNode(sourceNode.id, {
        x: sourceX,
        y: sourceY,
        width: sourceFrame.width,
        height: sourceFrame.height,
      });
      updateWorkflowNode(sourceNode.id, {
        title: file
          ? getWorkflowUploadPlaceholderNote("image")
          : getDefaultNodeTitle("image"),
        mediaUrl: file ? "" : LIBTV_DEFAULT_ORDINARY_IMAGE_URL,
        mediaRole: "ordinary",
        content: "",
        prompt: "",
        selectedOptionId: "custom",
        options: [],
        note: file ? getWorkflowUploadPlaceholderNote("image") : "",
        workflowGenerationRunning: Boolean(file),
        workflowGenerationProgress: file ? 0.08 : undefined,
        workflowGenerationError: "",
        suppressGenerationBar: false,
        workflowMediaMimeType: file?.type || undefined,
        workflowMediaNaturalWidth: undefined,
        workflowMediaNaturalHeight: undefined,
        workflowMediaFrameLocked: false,
      });

      updateWorkflowNode(targetId, {
        title: "高清",
        mediaUrl: "",
        mediaRole: "generator",
        componentType: "image-generator",
        content: "",
        prompt: "配置参数生成高清图像",
        selectedOptionId: "image-upscale",
        options: [],
        note: "",
        aspectRatio: String(targetNode.data?.aspectRatio || "auto"),
        imageSize: "4K",
        imageUpscaleTargetResolution: undefined,
        imageUpscaleOutputFormat: undefined,
        referenceImages: [],
        referenceImageNodeIds: [sourceNode.id],
        referenceImageRoles: ["reference"],
        suppressGenerationBar: false,
        workflowGenerationRunning: false,
        workflowGenerationProgress: undefined,
        workflowGenerationError: "",
      });
      moveWorkflowNode(targetId, {
        width: targetWidth,
        height: targetHeight,
      });
      const group = groupWorkflowNodes([sourceNode.id, targetId]);
      if (group) {
        updateWorkflowNode(group.id, {
          title: "ZMTV 方案 - 图片增强",
          groupBackgroundColor: "rgba(255,255,255,0.06)",
          groupNodeIds: [sourceNode.id, targetId],
        });
        selectLayer(group.id);
        setActiveWorkflowNode(group.id);
      } else {
        selectLayer(targetId);
        setActiveWorkflowNode(targetId);
      }
      window.setTimeout(() => {
        void flowRef.current?.fitView({
          nodes: [{ id: sourceNode.id }, { id: targetId }],
          padding: 0.28,
          duration: 420,
          maxZoom: 1,
        });
      }, 0);

      if (file) {
        void readWorkflowMediaFileSize(file, "image")
          .then((size) => {
            updateWorkflowNode(
              sourceNode.id,
              getWorkflowMediaNaturalSizePatch(size),
            );
            applyWorkflowUploadedMediaNodeFrame(
              moveWorkflowNode,
              sourceNode.id,
              "image",
              size,
              sourcePlaceholderFrame,
            );
          })
          .catch(() => undefined);
        uploadCanvasNodeFile(file)
          .then(({ publicUrl, libtvUrl }) => {
            const uploadedUrl = libtvUrl || publicUrl;
            updateWorkflowNode(sourceNode.id, {
              mediaUrl: uploadedUrl,
              mediaRole: "ordinary",
              title: shortFileName(file.name) || "参考图",
              note: "",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              suppressGenerationBar: false,
              workflowMediaMimeType: file.type || undefined,
              workflowMediaFrameLocked: false,
            });
            attachWorkflowReferenceImage(targetId, sourceNode.id, uploadedUrl);
          })
          .catch((error) => {
            updateWorkflowNode(sourceNode.id, {
              title: `上传失败 - ${file.name || "Image"}`,
              note: "上传失败",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError:
                error instanceof Error ? error.message : "上传失败",
            });
            message.error(error instanceof Error ? error.message : "上传失败");
            console.error(
              "[LibTvWorkflowCanvas] image upscale preset upload failed",
              error,
            );
          });
      } else {
        attachWorkflowReferenceImage(
          targetId,
          sourceNode.id,
          LIBTV_DEFAULT_ORDINARY_IMAGE_URL,
        );
      }
    },
    [
      addWorkflowNode,
      attachWorkflowReferenceImage,
      getDefaultNodeTitle,
      groupWorkflowNodes,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleCreateImageUpscalePreset = useCallback(
    (targetId: string) => {
      createImageUpscalePresetGroup(targetId);
    },
    [createImageUpscalePresetGroup],
  );

  const handleRunVideoGeneratorPreset = useCallback(
    async (targetId: string, optionId: string) => {
      const targetNode = nodes.find((node) => node.id === targetId);
      if (
        !targetNode ||
        targetNode.kind !== "video" ||
        targetNode.data?.mediaRole !== "generator"
      )
        return;

      const videoFrame = workflowVideoGeneratorFrame();
      const isStartEnd = optionId === "start-end-to-video";
      const isFirstFrame = optionId === "first-frame-to-video";
      if (!isStartEnd && !isFirstFrame) {
        message.info("开发中");
        return;
      }

      const imageWidth = 475;
      const imageHeight = isStartEnd ? 335 : 350;
      const imageGap = isStartEnd ? 48 : 0;
      const horizontalGap = isStartEnd ? 56 : 96;
      const imageStackHeight = isStartEnd
        ? imageHeight * 2 + imageGap
        : imageHeight;
      const targetX = Math.round(Number(targetNode.x || 0));
      const targetY = Math.round(Number(targetNode.y || 0));
      const nextVideoX = Math.round(targetX + (isStartEnd ? 80 : 40));
      const nextVideoY = Math.round(
        targetY + Math.max(0, (imageStackHeight - videoFrame.height) / 2),
      );
      const imageX = Math.round(nextVideoX - horizontalGap - imageWidth);
      const imageY = Math.round(
        nextVideoY + videoFrame.height / 2 - imageStackHeight / 2,
      );
      const presetTitle = isStartEnd
        ? "ZMTV 方案 - 双帧视频"
        : "ZMTV 方案 - 单帧视频";
      const videoTitle = isStartEnd
        ? getDefaultNodeTitle("video")
        : "单帧视频方案";
      const videoPrompt = isStartEnd
        ? "基于首帧和尾帧生成一段自然流畅的视频，保持主体、场景和风格连续；镜头运动自然，转场平滑。"
        : WORKFLOW_FIRST_FRAME_VIDEO_DEFAULT_PROMPT;
      const inputNodes: LibTvWorkflowNode[] = [];
      const modelId = String(targetNode.data?.modelId || "").trim();
      const selectedModel = modelId
        ? await resolveWorkflowModelOptionById("video", modelId)
        : null;
      const workflowEndpointMethod = modelId
        ? await resolveWorkflowVideoMethodForModel(
            modelId,
            isStartEnd ? "start_end" : "first_frame",
            {
              images: isStartEnd ? 2 : 1,
              videos: 0,
              audios: 0,
              scriptImages: 0,
            },
          )
        : "";
      const endpointSelection = resolveWorkflowVideoEndpointSelection({
        model: selectedModel,
        methodId: workflowEndpointMethod,
        aspectRatio: targetNode.data?.aspectRatio,
        resolution: targetNode.data?.videoResolution,
        duration: targetNode.data?.videoDuration,
        generationCount: targetNode.data?.generationCount,
        generateAudio: targetNode.data?.generateAudio,
        enableWebSearch: targetNode.data?.enableWebSearch,
      });

      const createFrameNode = (
        role: "first_frame" | "end_frame",
        index: number,
      ) => {
        const title = role === "first_frame" ? "首帧" : "尾帧";
        const mediaUrl =
          role === "first_frame"
            ? WORKFLOW_START_END_VIDEO_FIRST_FRAME_URL
            : WORKFLOW_START_END_VIDEO_END_FRAME_URL;
        const y = Math.round(imageY + index * (imageHeight + imageGap));
        const imageNode = addWorkflowNode("image", {
          x: imageX,
          y,
          linkToNodeId: targetId,
        });
        moveWorkflowNode(imageNode.id, {
          x: imageX,
          y,
          width: imageWidth,
          height: imageHeight,
        });
        updateWorkflowNode(imageNode.id, {
          title,
          content: "",
          prompt: "",
          mediaUrl,
          mediaRole: "ordinary",
          selectedOptionId: "custom",
          options: [],
          note: "",
          workflowMediaFrameLocked: false,
        });
        inputNodes.push(imageNode);
        return imageNode;
      };

      const firstFrameNode = createFrameNode("first_frame", 0);
      const endFrameNode = isStartEnd ? createFrameNode("end_frame", 1) : null;

      moveWorkflowNode(targetId, {
        x: nextVideoX,
        y: nextVideoY,
        width: videoFrame.width,
        height: videoFrame.height,
      });
      updateWorkflowNode(targetId, {
        title: videoTitle,
        content: "",
        prompt: videoPrompt,
        mediaUrl: "",
        mediaRole: "generator",
        selectedOptionId: optionId,
        videoMethod: workflowEndpointMethod || undefined,
        videoMethodUserSelected: true,
        videoDuration: endpointSelection.duration,
        videoResolution: endpointSelection.resolution,
        aspectRatio: endpointSelection.aspectRatio,
        generationCount: endpointSelection.generationCount,
        generateAudio: endpointSelection.generateAudio,
        enableWebSearch: endpointSelection.enableWebSearch,
        referenceImages: isStartEnd
          ? [
              WORKFLOW_START_END_VIDEO_FIRST_FRAME_URL,
              WORKFLOW_START_END_VIDEO_END_FRAME_URL,
            ]
          : [WORKFLOW_START_END_VIDEO_FIRST_FRAME_URL],
        referenceImageNodeIds: isStartEnd
          ? [firstFrameNode.id, endFrameNode?.id || ""].filter(Boolean)
          : [firstFrameNode.id],
        referenceImageRoles: isStartEnd
          ? ["first_frame", "end_frame"]
          : ["first_frame"],
        options: [],
        suppressGenerationBar: false,
      });

      attachWorkflowReferenceImage(
        targetId,
        firstFrameNode.id,
        WORKFLOW_START_END_VIDEO_FIRST_FRAME_URL,
      );
      if (endFrameNode)
        attachWorkflowReferenceImage(
          targetId,
          endFrameNode.id,
          WORKFLOW_START_END_VIDEO_END_FRAME_URL,
        );
      updateWorkflowNode(targetId, {
        referenceImages: isStartEnd
          ? [
              WORKFLOW_START_END_VIDEO_FIRST_FRAME_URL,
              WORKFLOW_START_END_VIDEO_END_FRAME_URL,
            ]
          : [WORKFLOW_START_END_VIDEO_FIRST_FRAME_URL],
        referenceImageNodeIds: isStartEnd
          ? [firstFrameNode.id, endFrameNode?.id || ""].filter(Boolean)
          : [firstFrameNode.id],
        referenceImageRoles: isStartEnd
          ? ["first_frame", "end_frame"]
          : ["first_frame"],
      });

      window.setTimeout(() => {
        const groupNodeIds = inputNodes.map((node) => node.id).concat(targetId);
        const group = groupWorkflowNodes(groupNodeIds, {
          backgroundColor: "rgba(255,255,255,0.06)",
        });
        if (group) {
          updateWorkflowNode(group.id, {
            title: presetTitle,
            groupBackgroundColor: "rgba(255,255,255,0.06)",
            groupNodeIds,
          });
          selectLayer(group.id);
          setActiveWorkflowNode(group.id);
          void flowRef.current?.fitView({
            nodes: [{ id: group.id }],
            padding: 0.26,
            duration: 420,
            maxZoom: 1,
          });
          return;
        }
        selectLayer(targetId);
        setActiveWorkflowNode(targetId);
      }, 0);
    },
    [
      addWorkflowNode,
      attachWorkflowReferenceImage,
      getDefaultNodeTitle,
      groupWorkflowNodes,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleImageUpscalePresetFilesUploaded = useCallback(
    (targetId: string, files: File[]) => {
      if (!targetId || files.length === 0) return;
      const file = files.find((item) => getFileNodeKind(item) === "image");
      if (!file) {
        message.warning("仅支持上传图片");
        return;
      }
      createImageUpscalePresetGroup(targetId, file);
    },
    [createImageUpscalePresetGroup],
  );

  const handleReferenceNodeRemoved = useCallback(
    (targetId: string, sourceId: string) => {
      if (!targetId) return;
      const edge = edges.find(
        (item) => item.source === sourceId && item.target === targetId,
      );
      if (edge) {
        removeWorkflowEdge(edge.id);
        return;
      }
      const targetNode = nodes.find((node) => node.id === targetId);
      if (!targetNode) return;
      const references = Array.isArray(targetNode.data.referenceImages)
        ? targetNode.data.referenceImages
        : [];
      const referenceNodeIds = Array.isArray(
        targetNode.data.referenceImageNodeIds,
      )
        ? targetNode.data.referenceImageNodeIds
        : [];
      if (!sourceId) {
        const manualIndex = referenceNodeIds.findIndex((id) => !id);
        if (manualIndex < 0) return;
        updateWorkflowNode(targetId, {
          referenceImages: references.filter(
            (_, index) => index !== manualIndex,
          ),
          referenceImageNodeIds: referenceNodeIds.filter(
            (_, index) => index !== manualIndex,
          ),
        });
        return;
      }
      updateWorkflowNode(targetId, {
        referenceImages: references.filter(
          (_, index) => referenceNodeIds[index] !== sourceId,
        ),
        referenceImageNodeIds: referenceNodeIds.filter((id) => id !== sourceId),
      });
    },
    [edges, nodes, removeWorkflowEdge, updateWorkflowNode],
  );

  const handleDisconnectWorkflowEdge = useCallback(
    (edgeId: string) => {
      if (!edgeId) return;
      removeWorkflowEdge(edgeId);
    },
    [removeWorkflowEdge],
  );

  const handleMediaFileReplace = useCallback(
    (nodeId: string, file: File) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (
        !node ||
        !(
          node.kind === "image" ||
          node.kind === "video" ||
          node.kind === "audio"
        )
      )
        return;
      const nextMediaRole =
        node.data?.mediaRole === "generator" ? "generator" : "ordinary";
      const currentFrame = {
        x: Number(node.x || 0),
        y: Number(node.y || 0),
        width: Number(node.width || workflowNodeFrame(node.kind).width),
        height: Number(node.height || workflowNodeFrame(node.kind).height),
      };
      void readWorkflowMediaFileSize(file, node.kind)
        .then((size) => {
          updateWorkflowNode(nodeId, getWorkflowMediaNaturalSizePatch(size));
          applyWorkflowUploadedMediaNodeFrame(
            moveWorkflowNode,
            nodeId,
            node.kind,
            size,
            currentFrame,
          );
        })
        .catch(() => undefined);
      updateWorkflowNode(nodeId, {
        title: getWorkflowUploadPlaceholderNote(node.kind),
        mediaUrl: "",
        workflowMediaMimeType: file.type || undefined,
        mediaRole: nextMediaRole,
        note: getWorkflowUploadPlaceholderNote(node.kind),
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0.08,
        workflowGenerationError: "",
        suppressGenerationBar: false,
        workflowMediaNaturalWidth: undefined,
        workflowMediaNaturalHeight: undefined,
        workflowMediaFrameLocked: getWorkflowUploadedMediaFrameLocked(
          node.kind,
        ),
      });
      uploadCanvasNodeFile(file)
        .then(({ publicUrl, libtvUrl }) => {
          updateWorkflowNode(nodeId, {
            mediaUrl: libtvUrl || publicUrl,
            title: shortFileName(file.name) || node.data.title,
            workflowMediaMimeType: file.type || undefined,
            mediaRole: nextMediaRole,
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            suppressGenerationBar: false,
            workflowMediaFrameLocked: getWorkflowUploadedMediaFrameLocked(
              node.kind,
            ),
          });
        })
        .catch((error) => {
          updateWorkflowNode(nodeId, {
            note: "上传失败",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError:
              error instanceof Error ? error.message : "上传失败",
          });
          message.error(error instanceof Error ? error.message : "替换失败");
          console.error("[LibTvWorkflowCanvas] replace media failed", error);
        });
    },
    [nodes, updateWorkflowNode],
  );

  const handleTrimVideoNode = useCallback(
    (sourceId: string, request: WorkflowVideoTrimRequest) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "video") return;
      const sourceUrl = String(
        request.sourceUrl || sourceNode.data?.mediaUrl || "",
      ).trim();
      if (!sourceUrl) return;
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const videoFrame = workflowNodeFrame("video");
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const placeholderWidth = videoFrame.width;
      const placeholderHeight = videoFrame.height;
      const sourceTitle =
        String(sourceNode.data?.title || "视频").trim() || "视频";
      const nextNode = addWorkflowNode("video", {
        x: Number(sourceNode.x || 0) - placeholderWidth - 240,
        y: Number(sourceNode.y || 0) + (sourceHeight - placeholderHeight) / 2,
        linkFromNodeId: sourceId,
        linkToNodeId: null,
      });
      const nextCenter = {
        centerX: Number(sourceNode.x || 0) - 240 - placeholderWidth / 2,
        centerY: Number(sourceNode.y || 0) + sourceHeight / 2,
      };
      moveWorkflowNode(nextNode.id, {
        width: placeholderWidth,
        height: placeholderHeight,
      });
      updateWorkflowNode(nextNode.id, {
        title: `${sourceTitle} 剪辑`,
        mediaUrl: "",
        workflowMediaMimeType: "video/mp4",
        mediaRole: "ordinary",
        content: "",
        prompt: `剪辑 ${request.startSeconds.toFixed(2)}s - ${request.endSeconds.toFixed(2)}s`,
        note: "剪辑中...",
        workflowRedrawRunning: true,
        workflowRedrawError: "",
        workflowStoryboardDuration: `${Math.max(1, Math.round(request.durationSeconds))}s`,
      });
      selectLayer(nextNode.id);
      setActiveWorkflowNode(nextNode.id);
      void (async () => {
        try {
          const trimSourceUrl = await resolveWorkflowApiMediaSource(
            sourceUrl,
            "video",
          );
          const response = await fetch("/api/workflow/trim-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceUrl: trimSourceUrl,
              startSeconds: request.startSeconds,
              endSeconds: request.endSeconds,
              title: `${sourceTitle} 剪辑`,
            }),

            credentials: "include",
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.url) {
            throw new Error(
              String(payload?.error || `视频合成失败: HTTP ${response.status}`),
            );
          }
          const duration = Number(
            payload.durationSeconds || request.durationSeconds,
          );
          const width = Number(payload.width || 0);
          const height = Number(payload.height || 0);
          if (width > 0 && height > 0) {
            applyWorkflowMediaNodeFrame(
              moveWorkflowNode,
              nextNode.id,
              { width, height },
              nextCenter,
            );
          }
          updateWorkflowNode(nextNode.id, {
            mediaUrl: String(payload.url),
            workflowMediaMimeType: String(payload.mimeType || "video/mp4"),
            mediaRole: "ordinary",
            note: "",
            workflowRedrawRunning: false,
            workflowRedrawError: "",
            workflowStoryboardDuration: `${Math.max(1, Math.round(Number.isFinite(duration) ? duration : request.durationSeconds))}s`,
          });
          message.success("已生成剪辑视频");
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "剪辑视频上传失败";
          updateWorkflowNode(nextNode.id, {
            note: messageText,
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
          });
          message.error(messageText);
          console.error("[LibTvWorkflowCanvas] trim video failed", error);
        }
      })();
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleCropVideoNode = useCallback(
    (sourceId: string, request: WorkflowVideoCropRequest) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "video") return;
      const sourceUrl = String(
        request.sourceUrl || sourceNode.data?.mediaUrl || "",
      ).trim();
      if (!sourceUrl) return;
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const outputWidth = Math.max(
        2,
        Math.round(Number(request.cropWidth || 0)),
      );
      const outputHeight = Math.max(
        2,
        Math.round(Number(request.cropHeight || 0)),
      );
      const videoFrame = workflowNodeFrame("video");
      const outputRatio = outputWidth / Math.max(1, outputHeight);
      const placeholderHeight = Math.max(
        160,
        Math.min(
          videoFrame.height,
          Math.round(videoFrame.width / Math.max(0.1, outputRatio)),
        ),
      );
      const placeholderWidth = Math.max(
        180,
        Math.round(placeholderHeight * outputRatio),
      );
      const x = Number(sourceNode.x || 0) + sourceWidth + 240;
      const y =
        Number(sourceNode.y || 0) + (sourceHeight - placeholderHeight) / 2;
      const sourceTitle =
        String(sourceNode.data?.title || "视频").trim() || "视频";
      const resultTitle = `${sourceTitle}_裁剪`;
      const nextNode = addWorkflowNode("video", {
        x,
        y,
        linkFromNodeId: sourceId,
        linkToNodeId: null,
      });
      const nextCenter = {
        centerX: x + placeholderWidth / 2,
        centerY: y + placeholderHeight / 2,
      };
      moveWorkflowNode(nextNode.id, {
        x,
        y,
        width: placeholderWidth,
        height: placeholderHeight,
      });
      updateWorkflowNode(nextNode.id, {
        title: resultTitle,
        mediaUrl: "",
        workflowMediaMimeType: "video/mp4",
        mediaRole: "ordinary",
        content: "",
        prompt: `画面裁剪 ${outputWidth} x ${outputHeight}`,
        note: "裁剪中...",
        workflowRedrawRunning: true,
        workflowRedrawError: "",
        workflowMediaNaturalWidth: outputWidth,
        workflowMediaNaturalHeight: outputHeight,
        workflowMediaFrameLocked: false,
      });
      selectLayer(nextNode.id);
      setActiveWorkflowNode(nextNode.id);
      void (async () => {
        try {
          const cropSourceUrl = await resolveWorkflowApiMediaSource(
            sourceUrl,
            "video",
          );
          const response = await fetch("/api/workflow/crop-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              sourceUrl: cropSourceUrl,
              cropX: request.cropX,
              cropY: request.cropY,
              cropWidth: request.cropWidth,
              cropHeight: request.cropHeight,
              sourceWidth: request.sourceWidth,
              sourceHeight: request.sourceHeight,
              title: resultTitle,
            }),
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.url) {
            throw new Error(
              String(payload?.error || `视频裁剪失败: HTTP ${response.status}`),
            );
          }
          const width = Math.max(
            0,
            Math.round(Number(payload.width || outputWidth)),
          );
          const height = Math.max(
            0,
            Math.round(Number(payload.height || outputHeight)),
          );
          if (width > 0 && height > 0) {
            applyWorkflowMediaNodeFrame(
              moveWorkflowNode,
              nextNode.id,
              { width, height },
              nextCenter,
            );
          }
          updateWorkflowNode(nextNode.id, {
            mediaUrl: String(payload.url),
            workflowMediaMimeType: String(payload.mimeType || "video/mp4"),
            mediaRole: "ordinary",
            note: "",
            workflowRedrawRunning: false,
            workflowRedrawError: "",
            workflowMediaNaturalWidth: width || outputWidth,
            workflowMediaNaturalHeight: height || outputHeight,
            workflowStoryboardDuration: payload.durationSeconds
              ? `${Math.max(1, Math.round(Number(payload.durationSeconds)))}s`
              : sourceNode.data?.workflowStoryboardDuration,
          });
          message.success("已生成裁剪视频");
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "裁剪视频上传失败";
          updateWorkflowNode(nextNode.id, {
            note: messageText,
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
          });
          message.error(messageText);
          console.error("[LibTvWorkflowCanvas] crop video failed", error);
        }
      })();
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleCreateVideoUpscaleNode = useCallback(
    (sourceId: string) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "video") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) {
        message.warning("请先选择一个有视频素材的节点");
        return;
      }
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const videoFrame = workflowNodeFrame("video");
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const placeholderWidth = Math.max(
        videoFrame.width,
        Number(sourceNode.width || videoFrame.width),
      );
      const placeholderHeight = Math.max(
        videoFrame.height,
        Number(sourceNode.height || videoFrame.height),
      );
      const x = Number(sourceNode.x || 0) + sourceWidth + 240;
      const y =
        Number(sourceNode.y || 0) + (sourceHeight - placeholderHeight) / 2;
      const nextNode = addWorkflowNode("video", {
        x,
        y,
        linkFromNodeId: sourceId,
        linkToNodeId: null,
      });
      moveWorkflowNode(nextNode.id, {
        x,
        y,
        width: placeholderWidth,
        height: placeholderHeight,
      });
      updateWorkflowNode(nextNode.id, {
        title: "高清（1080P）",
        mediaUrl: "",
        workflowMediaMimeType: "video/mp4",
        mediaRole: "generator",
        componentType: "video-generator",
        selectedOptionId: "video-upscale",
        content: "",
        prompt: "配置参数生成高清视频",
        note: "",
        videoMethod: "upscale",
        videoUpscaleSourceUrl: sourceUrl,
        videoUpscaleModelId: "wavespeed-ai/video-upscaler-pro",
        videoUpscaleResolution: "1080P",
        videoDuration:
          sourceNode.data?.videoDuration ||
          sourceNode.data?.workflowStoryboardDuration ||
          "5s",
        suppressGenerationBar: true,
        workflowGenerationRunning: false,
        workflowGenerationError: "",
        workflowGenerationProgress: undefined,
      });
    },
    [addWorkflowNode, moveWorkflowNode, nodes, updateWorkflowNode],
  );

  const handleAnalyzeVideoNode = useCallback(
    (sourceId: string) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "video") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) {
        message.warning("请先选择一个有视频素材的节点");
        return;
      }
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const placeholderFrame = workflowNodeFrame("script");
      const scriptFrame = {
        width: LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH,
        height: LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT,
      };
      const x = Number(sourceNode.x || 0) + sourceWidth + 240;
      const y =
        Number(sourceNode.y || 0) +
        (sourceHeight - placeholderFrame.height) / 2;
      const nextNode = addWorkflowNode("script", {
        x,
        y,
        linkFromNodeId: sourceId,
        linkToNodeId: null,
      });
      moveWorkflowNode(nextNode.id, {
        x,
        y,
        width: placeholderFrame.width,
        height: placeholderFrame.height,
      });
      updateWorkflowNode(nextNode.id, {
        title: "视频故事",
        selectedOptionId: "video-analysis",
        scriptViewMode: "script",
        content: createWorkflowTextEditorInitialContent("正在解析视频分镜..."),
        prompt: "对当前视频进行分镜拆解，提取关键帧、画面提示词和运镜提示词。",
        note: "正在解析视频分镜...",
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0.08,
        workflowGenerationError: "",
        suppressGenerationBar: true,
      });
      selectLayer(nextNode.id);
      setActiveWorkflowNode(nextNode.id);
      void (async () => {
        try {
          const resolvedSourceUrl = await resolveWorkflowApiMediaSource(
            sourceUrl,
            "video",
          );
          updateWorkflowNode(nextNode.id, {
            note: "正在抽取关键帧",
            workflowGenerationRunning: true,
            workflowGenerationProgress: 0.18,
          });
          const response = await fetch("/api/workflow/analyze-video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceUrl: resolvedSourceUrl,
              sourceNodeId: sourceId,
              targetNodeId: nextNode.id,
              projectId: projectId || undefined,
            }),
            credentials: "include",
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.result) {
            throw new Error(
              String(payload?.error || `视频解析失败: HTTP ${response.status}`),
            );
          }
          const scriptResult = normalizeLibTvStoryboardScriptResult(
            payload.result,
          );
          if (!scriptResult?.rows?.length)
            throw new Error("视频解析未返回分镜表格");
          moveWorkflowNode(nextNode.id, {
            x: Math.round(
              x + placeholderFrame.width / 2 - scriptFrame.width / 2,
            ),
            y: Math.round(
              y + placeholderFrame.height / 2 - scriptFrame.height / 2,
            ),
            width: scriptFrame.width,
            height: scriptFrame.height,
          });
          updateWorkflowNode(nextNode.id, {
            title: String(scriptResult.title || "视频故事"),
            componentType: "script-document",
            selectedOptionId: "video-analysis",
            scriptResult,
            scriptViewMode: "script",
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            suppressGenerationBar: false,
          });
          useCanvasStore.getState().setLibTvWorkflowLastRun({
            status: "success",
            executionMode: "video-analysis",
            targetNodeId: nextNode.id,
            scriptNodeId: nextNode.id,
            sourceNodeIds: [sourceId],
            scriptResult,
            updatedAt: Date.now(),
          });
          message.success("视频解析完成");
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "视频解析失败";
          updateWorkflowNode(nextNode.id, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: true,
          });
          message.error(messageText);
          console.error("[LibTvWorkflowCanvas] video analysis failed", error);
        }
      })();
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      projectId,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleSeparateVideoAudioNode = useCallback(
    (sourceId: string, mode: WorkflowSeparateVideoAudioMode) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "video") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) {
        message.warning("请先选择一个有视频素材的节点");
        return;
      }
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const videoFrame = workflowNodeFrame("video");
      const audioFrame = workflowNodeFrame("audio");
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const resultX = Number(sourceNode.x || 0) + sourceWidth + 240;
      const silentVideoY =
        Number(sourceNode.y || 0) +
        Math.max(0, sourceHeight - videoFrame.height) / 2;
      const audioY = silentVideoY - audioFrame.height - 48;
      if (mode !== "audio-video") {
        const sourceTitle =
          String(sourceNode.data?.title || "视频").trim() || "视频";
        const resultTitle =
          mode === "voice" ? `${sourceTitle}_人声` : `${sourceTitle}_背景音`;
        const audioNode = addWorkflowNode("audio", {
          x: resultX,
          y:
            Number(sourceNode.y || 0) +
            Math.max(0, sourceHeight - audioFrame.height) / 2,
          linkFromNodeId: sourceId,
          linkToNodeId: null,
        });
        moveWorkflowNode(audioNode.id, {
          width: audioFrame.width,
          height: audioFrame.height,
        });
        updateWorkflowNode(audioNode.id, {
          title: resultTitle,
          mediaUrl: "",
          workflowMediaMimeType: "audio/mp4",
          mediaRole: "ordinary",
          content: "",
          prompt:
            mode === "voice" ? "从视频中分离出人声" : "从视频中分离出背景音",
          note: "音频处理中...",
          workflowGenerationRunning: true,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          workflowRedrawRunning: false,
          workflowRedrawError: "",
          suppressGenerationBar: false,
          workflowStoryboardDuration:
            sourceNode.data?.workflowStoryboardDuration,
        });
        selectLayer(audioNode.id);
        setActiveWorkflowNode(audioNode.id);
        void (async () => {
          try {
            const resolvedSourceUrl = await resolveWorkflowApiMediaSource(
              sourceUrl,
              "video",
            );
            const response = await fetch("/api/workflow/separate-video-audio", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sourceUrl: resolvedSourceUrl,
                mode,
                title: sourceTitle,
                sourceNodeId: sourceId,
                projectId: projectId || undefined,
              }),
              credentials: "include",
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.audio?.url) {
              throw new Error(
                String(
                  payload?.error || `音频分离失败: HTTP ${response.status}`,
                ),
              );
            }
            updateWorkflowNode(audioNode.id, {
              title: String(payload.audio?.title || resultTitle),
              mediaUrl: String(payload.audio.url),
              workflowMediaMimeType: String(
                payload.audio?.mimeType || "audio/mp4",
              ),
              mediaRole: "ordinary",
              content: "",
              prompt:
                mode === "voice"
                  ? "从视频中分离出人声"
                  : "从视频中分离出背景音",
              note: "",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              workflowRedrawRunning: false,
              workflowRedrawError: "",
              workflowStoryboardDuration: payload.audio?.durationSeconds
                ? `${Math.max(1, Math.round(Number(payload.audio.durationSeconds)))}s`
                : sourceNode.data?.workflowStoryboardDuration,
              suppressGenerationBar: false,
            });
            selectLayer(audioNode.id);
            setActiveWorkflowNode(audioNode.id);
          } catch (error) {
            const messageText =
              error instanceof Error ? error.message : "音频分离失败";
            updateWorkflowNode(audioNode.id, {
              note: messageText,
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: messageText,
              workflowRedrawRunning: false,
              workflowRedrawError: messageText,
            });
            message.error(messageText);
            console.error(
              "[LibTvWorkflowCanvas] separate vocal/background audio failed",
              error,
            );
          }
        })();
        return;
      }
      const toastKey = `workflow-audio-separate-${sourceId}`;
      message.loading({
        key: toastKey,
        content: "音视频分离处理中，请稍候...",
        duration: 0,
      });
      updateWorkflowNode(sourceId, {
        note: "音视频分离处理中，请稍候...",
        workflowRedrawRunning: true,
        workflowRedrawError: "",
      });
      void (async () => {
        try {
          const resolvedSourceUrl = await resolveWorkflowApiMediaSource(
            sourceUrl,
            "video",
          );
          const response = await fetch("/api/workflow/separate-video-audio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceUrl: resolvedSourceUrl,
              mode,
              title: String(sourceNode.data?.title || "视频"),
              sourceNodeId: sourceId,
              projectId: projectId || undefined,
            }),
            credentials: "include",
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.video?.url || !payload?.audio?.url) {
            throw new Error(
              String(
                payload?.error || `音视频分离失败: HTTP ${response.status}`,
              ),
            );
          }
          const silentVideoNode = addWorkflowNode("video", {
            x: resultX,
            y: silentVideoY,
            linkFromNodeId: sourceId,
            linkToNodeId: null,
          });
          const audioNode = addWorkflowNode("audio", {
            x: resultX,
            y: audioY,
            linkFromNodeId: sourceId,
            linkToNodeId: null,
          });
          const width = Number(payload.video?.width || 0);
          const height = Number(payload.video?.height || 0);
          if (width > 0 && height > 0) {
            applyWorkflowMediaNodeFrame(
              moveWorkflowNode,
              silentVideoNode.id,
              { width, height },
              {
                centerX: resultX + videoFrame.width / 2,
                centerY: silentVideoY + videoFrame.height / 2,
              },
            );
          } else {
            moveWorkflowNode(silentVideoNode.id, {
              x: resultX,
              y: silentVideoY,
              width: Math.max(
                videoFrame.width,
                Number(sourceNode.width || videoFrame.width),
              ),
              height: Math.max(
                videoFrame.height,
                Number(sourceNode.height || videoFrame.height),
              ),
            });
          }
          moveWorkflowNode(audioNode.id, {
            x: resultX,
            y: audioY,
            width: audioFrame.width,
            height: audioFrame.height,
          });
          updateWorkflowNode(silentVideoNode.id, {
            title: String(
              payload.video?.title ||
                `${sourceNode.data?.title || "视频"}_无声`,
            ),
            mediaUrl: String(payload.video.url),
            workflowMediaMimeType: String(
              payload.video?.mimeType || "video/mp4",
            ),
            mediaRole: "ordinary",
            content: "",
            prompt: "音视频分离后的无声视频",
            note: "",
            workflowStoryboardDuration: payload.video?.durationSeconds
              ? `${Math.max(1, Math.round(Number(payload.video.durationSeconds)))}s`
              : sourceNode.data?.workflowStoryboardDuration,
            ...getWorkflowMediaNaturalSizePatch(
              width > 0 && height > 0 ? { width, height } : null,
            ),
          });
          updateWorkflowNode(audioNode.id, {
            title: String(
              payload.audio?.title ||
                `${sourceNode.data?.title || "视频"}_音频`,
            ),
            mediaUrl: String(payload.audio.url),
            workflowMediaMimeType: String(
              payload.audio?.mimeType || "audio/mp4",
            ),
            mediaRole: "ordinary",
            content: "",
            prompt: "从视频中分离出的原音频",
            note: "",
            workflowStoryboardDuration: payload.audio?.durationSeconds
              ? `${Math.max(1, Math.round(Number(payload.audio.durationSeconds)))}s`
              : sourceNode.data?.workflowStoryboardDuration,
            suppressGenerationBar: false,
          });
          updateWorkflowNode(sourceId, {
            note: "",
            workflowRedrawRunning: false,
            workflowRedrawError: "",
          });
          selectLayer(audioNode.id);
          setActiveWorkflowNode(audioNode.id);
          message.success({
            key: toastKey,
            content: "音视频分离完成",
            duration: 2.5,
          });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "音视频分离失败";
          updateWorkflowNode(sourceId, {
            note: messageText,
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
          });
          message.error({ key: toastKey, content: messageText, duration: 3 });
          console.error(
            "[LibTvWorkflowCanvas] separate video audio failed",
            error,
          );
        }
      })();
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      projectId,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleRemoveVideoSubtitlesNode = useCallback(
    (sourceId: string) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "video") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) {
        message.warning("请先选择一个有视频素材的节点");
        return;
      }
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const videoFrame = workflowNodeFrame("video");
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const placeholderWidth = Math.max(
        videoFrame.width,
        Number(sourceNode.width || videoFrame.width),
      );
      const placeholderHeight = Math.max(
        videoFrame.height,
        Number(sourceNode.height || videoFrame.height),
      );
      const resultX = Number(sourceNode.x || 0) + sourceWidth + 240;
      const resultY =
        Number(sourceNode.y || 0) +
        Math.max(0, sourceHeight - placeholderHeight) / 2;
      const sourceTitle =
        String(sourceNode.data?.title || "视频").trim() || "视频";
      const resultTitle = `${sourceTitle}_去字幕`;
      const resultNode = addWorkflowNode("video", {
        x: resultX,
        y: resultY,
        linkFromNodeId: sourceId,
        linkToNodeId: null,
      });
      moveWorkflowNode(resultNode.id, {
        x: resultX,
        y: resultY,
        width: placeholderWidth,
        height: placeholderHeight,
      });
      updateWorkflowNode(resultNode.id, {
        title: resultTitle,
        mediaUrl: "",
        workflowMediaMimeType: "video/mp4",
        mediaRole: "ordinary",
        content: "",
        prompt: "智能去字幕处理后的视频",
        note: "视频处理中",
        workflowRedrawRunning: true,
        workflowRedrawError: "",
        workflowGenerationRunning: false,
        workflowGenerationProgress: undefined,
        workflowGenerationError: "",
        suppressGenerationBar: false,
        workflowStoryboardDuration: sourceNode.data?.workflowStoryboardDuration,
        ...getWorkflowMediaNaturalSizePatch(
          Number(sourceNode.data?.workflowMediaNaturalWidth || 0) > 0 &&
            Number(sourceNode.data?.workflowMediaNaturalHeight || 0) > 0
            ? {
                width: Number(sourceNode.data.workflowMediaNaturalWidth),
                height: Number(sourceNode.data.workflowMediaNaturalHeight),
              }
            : null,
        ),
      });
      selectLayer(resultNode.id);
      setActiveWorkflowNode(resultNode.id);
      void (async () => {
        try {
          const resolvedSourceUrl = await resolveWorkflowApiMediaSource(
            sourceUrl,
            "video",
          );
          const response = await fetch("/api/workflow/remove-video-subtitles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sourceUrl: resolvedSourceUrl,
              title: sourceTitle,
              sourceNodeId: sourceId,
              projectId: projectId || undefined,
            }),
            credentials: "include",
          });
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.url) {
            throw new Error(
              String(
                payload?.error || `智能去字幕失败: HTTP ${response.status}`,
              ),
            );
          }
          const width = Number(payload.width || 0);
          const height = Number(payload.height || 0);
          if (width > 0 && height > 0) {
            const latestNode = useCanvasStore
              .getState()
              .libtvWorkflow.nodes.find((item) => item.id === resultNode.id);
            const currentWidth = Number(latestNode?.width || placeholderWidth);
            const currentHeight = Number(
              latestNode?.height || placeholderHeight,
            );
            applyWorkflowMediaNodeFrame(
              moveWorkflowNode,
              resultNode.id,
              { width, height },
              {
                centerX: Number(latestNode?.x ?? resultX) + currentWidth / 2,
                centerY: Number(latestNode?.y ?? resultY) + currentHeight / 2,
              },
            );
          }
          updateWorkflowNode(resultNode.id, {
            title: String(payload.title || resultTitle),
            mediaUrl: String(payload.url),
            workflowMediaMimeType: String(payload.mimeType || "video/mp4"),
            mediaRole: "ordinary",
            content: "",
            prompt: "智能去字幕处理后的视频",
            note: "",
            workflowRedrawRunning: false,
            workflowRedrawError: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            workflowStoryboardDuration: payload.durationSeconds
              ? `${Math.max(1, Math.round(Number(payload.durationSeconds)))}s`
              : sourceNode.data?.workflowStoryboardDuration,
            ...getWorkflowMediaNaturalSizePatch(
              width > 0 && height > 0 ? { width, height } : null,
            ),
          });
          selectLayer(resultNode.id);
          setActiveWorkflowNode(resultNode.id);
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "智能去字幕失败";
          updateWorkflowNode(resultNode.id, {
            note: messageText,
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
          });
          message.error(messageText);
          console.error(
            "[LibTvWorkflowCanvas] remove video subtitles failed",
            error,
          );
        }
      })();
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      projectId,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleSubmitVideoUpscaleNode = useCallback(
    (nodeId: string, request: WorkflowVideoUpscaleRequest) => {
      const targetNode = nodes.find((item) => item.id === nodeId);
      if (!targetNode || targetNode.kind !== "video") return;
      if (!projectId) {
        message.error("项目未初始化，无法创建高清视频任务");
        return;
      }
      const sourceUrl = String(
        request.sourceUrl || targetNode.data?.videoUpscaleSourceUrl || "",
      ).trim();
      if (!sourceUrl) {
        message.error("缺少输入视频");
        return;
      }
      updateWorkflowNode(nodeId, {
        title: `高清（${request.resolution}）`,
        note: "高清任务创建中...",
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0.08,
        workflowGenerationError: "",
        workflowRedrawRunning: false,
        workflowRedrawError: "",
        videoUpscaleModelId: request.modelId,
        videoUpscaleResolution: request.resolution,
        suppressGenerationBar: true,
      });
      void (async () => {
        try {
          const resolvedSourceUrl = await resolveWorkflowApiMediaSource(
            sourceUrl,
            "video",
          );
          const createdJob = await createWorkflowCanvasBackendJob({
            projectId,
            kind: "video_upscale",
            request: {
              sourceUrl: resolvedSourceUrl,
              modelId: request.modelId,
              resolution: request.resolution,
              durationSeconds: request.durationSeconds,
              workflowNodeId: nodeId,
            },
          });
          updateWorkflowNode(nodeId, {
            workflowGenerationJobId: createdJob.id,
            note: String(
              createdJob.resultData?.message || "高清任务已创建",
            ).slice(0, 80),
            workflowGenerationProgress: Math.max(
              0.12,
              Number(createdJob.resultData?.progress || 0.12),
            ),
          });
          const completedJob = await waitWorkflowCanvasBackendJob({
            jobId: createdJob.id,
            maxAttempts: 420,
            onProgress: (job) => {
              const note = String(job.resultData?.message || "").trim();
              const progress = Number(job.resultData?.progress);
              updateWorkflowNode(nodeId, {
                ...(note ? { note: note.slice(0, 80) } : {}),
                workflowGenerationProgress: Number.isFinite(progress)
                  ? Math.max(0.08, Math.min(0.98, progress))
                  : undefined,
              });
            },
          });
          const resultUrl =
            resolveWorkflowCanvasBackendJobResultUrl(completedJob);
          if (!resultUrl) throw new Error("视频高清未返回视频");
          const responseResult = completedJob.resultData?.response || {};
          const width = Number(
            responseResult.width || responseResult.output?.width || 0,
          );
          const height = Number(
            responseResult.height || responseResult.output?.height || 0,
          );
          if (width > 0 && height > 0) {
            applyWorkflowMediaNodeFrame(
              moveWorkflowNode,
              nodeId,
              { width, height },
              {
                centerX:
                  Number(targetNode.x || 0) +
                  Number(targetNode.width || workflowNodeFrame("video").width) /
                    2,
                centerY:
                  Number(targetNode.y || 0) +
                  Number(
                    targetNode.height || workflowNodeFrame("video").height,
                  ) /
                    2,
              },
            );
          }
          updateWorkflowNode(nodeId, {
            mediaUrl: resultUrl,
            workflowMediaMimeType: String(
              responseResult.mimeType || "video/mp4",
            ),
            mediaRole: "ordinary",
            componentType: "video-asset",
            prompt: `视频高清 ${request.resolution}`,
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            workflowRedrawRunning: false,
            workflowRedrawError: "",
            suppressGenerationBar: false,
            workflowStoryboardDuration: responseResult.durationSeconds
              ? `${Math.max(1, Math.round(Number(responseResult.durationSeconds)))}s`
              : targetNode.data?.workflowStoryboardDuration,
            ...getWorkflowMediaNaturalSizePatch(
              width > 0 && height > 0 ? { width, height } : null,
            ),
          });
          message.success("已生成高清视频");
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "视频高清失败";
          updateWorkflowNode(nodeId, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
            suppressGenerationBar: true,
          });
          message.error(messageText);
          console.error("[LibTvWorkflowCanvas] video upscale failed", error);
        }
      })();
    },
    [moveWorkflowNode, nodes, projectId, updateWorkflowNode],
  );

  const handleCreateAnnotatedImageNode = useCallback(
    (sourceId: string, dataUrl: string, prompt: string) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (
        !sourceNode ||
        (sourceNode.kind !== "image" && sourceNode.kind !== "video")
      )
        return;
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceTitle =
        String(
          sourceNode.data?.title ||
            (sourceNode.kind === "video" ? "视频" : "图片"),
        ).trim() || (sourceNode.kind === "video" ? "视频" : "图片");
      const normalizedPrompt = String(prompt || "").trim();
      const isPanoramaCapture = normalizedPrompt.startsWith("全景截图");
      const isVideoFrameCapture =
        sourceNode.kind === "video" && normalizedPrompt.startsWith("视频");
      const videoFrameSuffix = normalizedPrompt.replace(/^视频/, "").trim();
      const panoramaCaptureSuffix = normalizedPrompt
        .replace(/^全景截图[:：]?/, "")
        .trim();
      const imageFrame = isPanoramaCapture
        ? { width: 480, height: 270 }
        : workflowNodeFrame("image");
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const nextNode = addWorkflowNode("image", {
        x: Number(sourceNode.x || 0) + sourceWidth + 240,
        y: Number(sourceNode.y || 0) + (sourceHeight - imageFrame.height) / 2,
        linkFromNodeId: sourceId,
        linkToNodeId: null,
      });
      if (isPanoramaCapture) {
        moveWorkflowNode(nextNode.id, {
          width: imageFrame.width,
          height: imageFrame.height,
        });
      }
      updateWorkflowNode(nextNode.id, {
        title: isPanoramaCapture
          ? sourceTitle + " " + (panoramaCaptureSuffix || "全景截图")
          : isVideoFrameCapture
            ? sourceTitle + " " + (videoFrameSuffix || "截图")
            : sourceTitle + " 标注",
        mediaUrl: dataUrl,
        mediaRole: "ordinary",
        content: "",
        prompt: normalizedPrompt || "标注协作图",
        note: "",
        ...(isPanoramaCapture
          ? {
              workflowMediaNaturalWidth: imageFrame.width,
              workflowMediaNaturalHeight: imageFrame.height,
            }
          : {}),
      });
      if (!isPanoramaCapture) {
        void readWorkflowImageUrlSize(dataUrl)
          .then((size) => {
            const displayFrame = workflowMediaDisplayFrame(
              size.width,
              size.height,
            );
            moveWorkflowNode(nextNode.id, {
              width: displayFrame.width,
              height: displayFrame.height,
            });
            updateWorkflowNode(
              nextNode.id,
              getWorkflowMediaNaturalSizePatch(size),
            );
          })
          .catch(() => undefined);
      }
      selectLayer(nextNode.id);
      setActiveWorkflowNode(nextNode.id);

      void dataUrlToWorkflowFile(dataUrl, `annotation-${Date.now()}.png`)
        .then((file) => uploadCanvasNodeFile(file))
        .then(({ publicUrl, libtvUrl }) => {
          const uploadedUrl = libtvUrl || publicUrl;
          updateWorkflowNode(nextNode.id, {
            mediaUrl: uploadedUrl,
            mediaRole: "ordinary",
            prompt: normalizedPrompt || "标注协作图",
            ...(isPanoramaCapture
              ? {
                  workflowMediaNaturalWidth: imageFrame.width,
                  workflowMediaNaturalHeight: imageFrame.height,
                }
              : {}),
          });
        })
        .catch((error) => {
          message.error(
            error instanceof Error ? error.message : "标注图上传失败",
          );
          console.error(
            "[LibTvWorkflowCanvas] annotation image upload failed",
            error,
          );
        });
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleCreateDirectorConsoleCaptureNode = useCallback(
    (
      sourceId: string,
      capture: LibTvDirectorConsole3DCapture,
      options?: { batchIndex?: number; batchTotal?: number },
    ) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "director-console-3d") return;
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const ratioSize = parseWorkflowAspectRatioSize(
        capture.aspectRatio || "16:9",
        capture.width || 16,
        capture.height || 9,
      );
      const imageFrame = workflowImageDisplayFrame(
        ratioSize.width,
        ratioSize.height,
      );
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const batchIndex = Math.max(
        0,
        Math.round(Number(options?.batchIndex || 0)),
      );
      const batchTotal = Math.max(
        1,
        Math.round(Number(options?.batchTotal || 1)),
      );
      const verticalGap = 36;
      const batchHeight =
        batchTotal * imageFrame.height +
        Math.max(0, batchTotal - 1) * verticalGap;
      const x = Math.round(Number(sourceNode.x || 0) + sourceWidth + 240);
      const y = Math.round(
        Number(sourceNode.y || 0) +
          (sourceHeight - batchHeight) / 2 +
          batchIndex * (imageFrame.height + verticalGap),
      );
      const nextNode = addWorkflowNode("image", {
        x,
        y,
        linkFromNodeId: sourceId,
        linkToNodeId: null,
      });
      moveWorkflowNode(nextNode.id, {
        width: imageFrame.width,
        height: imageFrame.height,
        x,
        y,
      });
      const sourceTitle =
        String(sourceNode.data?.title || "3D 导演台").trim() || "3D 导演台";
      const prompt = `来自 ${sourceTitle} 的${capture.name || "机位截图"}，作为 3D 构图参考图。`;
      updateWorkflowNode(nextNode.id, {
        title: capture.name || `${sourceTitle} 截图`,
        mediaUrl: capture.dataUrl,
        mediaRole: "ordinary",
        content: "",
        prompt,
        note: "",
        aspectRatio: capture.aspectRatio,
        ...getWorkflowMediaNaturalSizePatch({
          width: capture.width,
          height: capture.height,
        }),
      });
      selectLayer(nextNode.id);
      setActiveWorkflowNode(nextNode.id);
      void dataUrlToWorkflowFile(
        capture.dataUrl,
        `director-console-${Date.now()}.png`,
      )
        .then((file) => uploadCanvasNodeFile(file))
        .then(({ publicUrl, libtvUrl }) => {
          const uploadedUrl = libtvUrl || publicUrl;
          updateWorkflowNode(nextNode.id, {
            mediaUrl: uploadedUrl,
            mediaRole: "ordinary",
            prompt,
          });
        })
        .catch((error) => {
          message.error(
            error instanceof Error ? error.message : "3D 导演台截图上传失败",
          );
          console.error(
            "[LibTvWorkflowCanvas] director console capture upload failed",
            error,
          );
        });
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleCreateDirectorConsoleVideoNode = useCallback(
    async (sourceId: string, exported: LibTvDirectorConsole3DVideoExport) => {
      const width = Math.max(1, Math.round(Number(exported.width || 1)));
      const height = Math.max(1, Math.round(Number(exported.height || 1)));
      const fileName = String(
        exported.fileName || "3d-director-animation-" + Date.now() + ".mp4",
      ).trim();
      const mimeType =
        String(
          exported.mimeType || exported.videoBlob.type || "video/mp4",
        ).trim() || "video/mp4";
      const duration = Math.max(0.1, Number(exported.duration || 0.1));
      const durationLabel = String(Number(duration.toFixed(3))) + "s";
      const initialSourceNode = nodes.find((item) => item.id === sourceId);
      if (
        !initialSourceNode ||
        initialSourceNode.kind !== "director-console-3d"
      ) {
        throw new Error("3D 导演台节点不存在");
      }

      const file = new File([exported.videoBlob], fileName, { type: mimeType });
      const { publicUrl, libtvUrl } = await uploadCanvasNodeFile(file);
      const uploadedUrl = String(libtvUrl || publicUrl || "").trim();
      if (!/^https?:\/\//i.test(uploadedUrl))
        throw new Error("3D 导演台动画上传未返回公网地址");

      const latestWorkflow = useCanvasStore.getState().libtvWorkflow;
      const latestNodes = latestWorkflow.nodes;
      const latestEdges = latestWorkflow.edges;
      const sourceNode = latestNodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "director-console-3d") {
        throw new Error("视频已上传，但 3D 导演台节点不存在");
      }
      const nodeById = new Map(latestNodes.map((node) => [node.id, node]));
      const getAbsolutePosition = (node: LibTvWorkflowNode) => {
        let x = Number(node.x || 0);
        let y = Number(node.y || 0);
        let parentId = node.parentId;
        const visited = new Set<string>();
        while (parentId && !visited.has(parentId)) {
          visited.add(parentId);
          const parent = nodeById.get(parentId);
          if (!parent) break;
          x += Number(parent.x || 0);
          y += Number(parent.y || 0);
          parentId = parent.parentId;
        }
        return { x, y };
      };
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourcePosition = getAbsolutePosition(sourceNode);
      const x = Math.round(sourcePosition.x + sourceWidth + 120);
      const linkedOutputIds = new Set(
        latestEdges
          .filter((edge) => edge.source === sourceId)
          .map((edge) => edge.target),
      );
      const linkedOutputs = latestNodes.filter((node) => {
        if (!linkedOutputIds.has(node.id)) return false;
        return getAbsolutePosition(node).x > sourcePosition.x;
      });
      const y = Math.round(
        linkedOutputs.length === 0
          ? sourcePosition.y
          : Math.max(
              ...linkedOutputs.map((node) => {
                const nodePosition = getAbsolutePosition(node);
                const frame = workflowNodeFrame(node.kind);
                return (
                  nodePosition.y +
                  Math.max(frame.height, Number(node.height || frame.height))
                );
              }),
            ) + 80,
      );
      const videoFrame = workflowImageDisplayFrame(width, height);
      const nextNode = addWorkflowNode("video", {
        x,
        y,
        linkFromNodeId: sourceId,
        linkToNodeId: null,
      });
      moveWorkflowNode(nextNode.id, {
        x,
        y,
        width: videoFrame.width,
        height: videoFrame.height,
      });
      const sourceTitle =
        String(sourceNode.data?.title || "3D 导演台").trim() || "3D 导演台";
      updateWorkflowNode(nextNode.id, {
        title: sourceTitle + " 动画导出",
        mediaUrl: uploadedUrl,
        mediaRole: "ordinary",
        componentType: "video-asset",
        content: "",
        note: "",
        workflowGenerationRunning: false,
        workflowGenerationProgress: undefined,
        workflowGenerationError: "",
        suppressGenerationBar: false,
        workflowMediaMimeType: mimeType,
        workflowMediaNaturalWidth: width,
        workflowMediaNaturalHeight: height,
        workflowMediaDurationSec: duration,
        workflowMediaPlaybackVolume: 0.5,
        workflowMediaHasAudio: false,
        workflowMediaFrameLocked: false,
        workflowMediaUserResized: false,
        videoDuration: durationLabel,
        workflowStoryboardDuration: durationLabel,
      });
    },
    [addWorkflowNode, moveWorkflowNode, nodes, updateWorkflowNode],
  );

  const handleRemoveBackgroundNode = useCallback(
    (sourceId: string) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) return;
      updateWorkflowNode(sourceId, {
        workflowRedrawRunning: true,
        workflowRedrawError: "",
        note: "",
      });

      void fetch("/api/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: sourceUrl,
          projectId: projectId || undefined,
        }),

        credentials: "include",
      })
        .then(async (response) => {
          const payload = await response.json().catch(() => null);
          if (!response.ok || !payload?.success || !payload?.url) {
            throw new Error(
              String(payload?.error || `抠图失败: HTTP ${response.status}`),
            );
          }
          return String(payload.url);
        })
        .then((resultUrl) => {
          const sourceFrame = workflowNodeFrame(sourceNode.kind);
          const imageFrame = workflowNodeFrame("image");
          const sourceWidth = Math.max(
            sourceFrame.width,
            Number(sourceNode.width || sourceFrame.width),
          );
          const sourceHeight = Math.max(
            sourceFrame.height,
            Number(sourceNode.height || sourceFrame.height),
          );
          const nextNode = addWorkflowNode("image", {
            x: Number(sourceNode.x || 0) + sourceWidth + 240,
            y:
              Number(sourceNode.y || 0) +
              (sourceHeight - imageFrame.height) / 2,
            linkFromNodeId: sourceId,
            linkToNodeId: null,
          });
          const sourceTitle =
            String(sourceNode.data?.title || "图片").trim() || "图片";
          updateWorkflowNode(nextNode.id, {
            title: `${sourceTitle} 抠图`,
            mediaUrl: resultUrl,
            mediaRole: "ordinary",
            content: "",
            prompt: "抠图",
            note: "",
          });
          updateWorkflowNode(sourceId, {
            workflowRedrawRunning: false,
            workflowRedrawError: "",
            note: "",
          });
          selectLayer(nextNode.id);
          setActiveWorkflowNode(nextNode.id);
        })
        .catch((error) => {
          const messageText =
            error instanceof Error ? error.message : "抠图失败";
          updateWorkflowNode(sourceId, {
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
            note: messageText,
          });
          message.error(messageText);
          console.error(
            "[LibTvWorkflowCanvas] remove background failed",
            error,
          );
        });
    },
    [
      addWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleSplitImageNode = useCallback(
    (sourceId: string, request: WorkflowImageGridSplitRequest) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) {
        message.warning("当前图片还没有可切分的素材");
        return;
      }
      const rows = Math.max(1, Math.min(5, Math.round(request.rows || 1)));
      const columns = Math.max(
        1,
        Math.min(5, Math.round(request.columns || 1)),
      );
      if (rows === 1 && columns === 1) {
        message.info("请选择至少 1×2 或 2×1 的宫格");
        return;
      }
      updateWorkflowNode(sourceId, {
        workflowRedrawRunning: true,
        workflowRedrawError: "",
        note: "正在切分图片...",
      });
      void splitWorkflowImageIntoGrid(sourceUrl, rows, columns)
        .then((pieces) => {
          const sourceFrame = workflowNodeFrame(sourceNode.kind);
          const sourceWidth = Math.max(
            sourceFrame.width,
            Number(sourceNode.width || sourceFrame.width),
          );
          const sourceTitle =
            String(sourceNode.data?.title || "图片").trim() || "图片";
          const firstPiece = pieces[0];
          const pieceFrame = workflowImageDisplayFrame(
            firstPiece?.width || 1,
            firstPiece?.height || 1,
          );
          const gap = 40;
          const startX = Number(sourceNode.x || 0) + sourceWidth + 240;
          const startY = Number(sourceNode.y || 0);
          const createdIds: string[] = [];
          for (const piece of pieces) {
            const x = startX + piece.column * (pieceFrame.width + gap);
            const y = startY + piece.row * (pieceFrame.height + gap);
            const resultNode = addWorkflowNode("image", {
              x,
              y,
              linkFromNodeId: sourceId,
              linkToNodeId: null,
            });
            moveWorkflowNode(resultNode.id, {
              x,
              y,
              width: pieceFrame.width,
              height: pieceFrame.height,
            });
            updateWorkflowNode(resultNode.id, {
              title:
                sourceTitle + " " + (piece.row + 1) + "-" + (piece.column + 1),
              mediaUrl: piece.dataUrl,
              mediaRole: "ordinary",
              content: "",
              prompt: rows + "×" + columns + " 宫格切分",
              note: "",
              workflowMediaNaturalWidth: piece.width,
              workflowMediaNaturalHeight: piece.height,
              workflowMediaUserResized: false,
            });
            createdIds.push(resultNode.id);
          }
          updateWorkflowNode(sourceId, {
            workflowRedrawRunning: false,
            workflowRedrawError: "",
            note: "",
          });
          if (createdIds[0]) {
            selectLayer(createdIds[0]);
            setActiveWorkflowNode(createdIds[0]);
          }
          message.success(
            "已切分为 " +
              rows +
              "×" +
              columns +
              " 共 " +
              pieces.length +
              " 张图片",
          );
        })
        .catch((error) => {
          const messageText =
            error instanceof Error ? error.message : "宫格切分失败";
          updateWorkflowNode(sourceId, {
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
            note: messageText,
          });
          message.error(messageText);
        });
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleRotateImageNode = useCallback(
    (sourceId: string) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) return;
      updateWorkflowNode(sourceId, {
        workflowRedrawRunning: true,
        workflowRedrawError: "",
        note: "正在旋转图片...",
      });
      void rotateWorkflowImageClockwise(sourceUrl)
        .then((result) => {
          const frame = workflowImageDisplayFrame(result.width, result.height);
          const currentWidth = Math.max(
            1,
            Number(sourceNode.width || frame.width),
          );
          const currentHeight = Math.max(
            1,
            Number(sourceNode.height || frame.height),
          );
          const centerX = Number(sourceNode.x || 0) + currentWidth / 2;
          const centerY = Number(sourceNode.y || 0) + currentHeight / 2;
          moveWorkflowNode(sourceId, {
            x: centerX - frame.width / 2,
            y: centerY - frame.height / 2,
            width: frame.width,
            height: frame.height,
          });
          updateWorkflowNode(sourceId, {
            mediaUrl: result.dataUrl,
            workflowMediaNaturalWidth: result.width,
            workflowMediaNaturalHeight: result.height,
            workflowMediaUserResized: false,
            workflowRedrawRunning: false,
            workflowRedrawError: "",
            note: "",
          });
        })
        .catch((error) => {
          const messageText =
            error instanceof Error ? error.message : "图片旋转失败";
          updateWorkflowNode(sourceId, {
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
            note: messageText,
          });
          message.error(messageText);
        });
    },
    [moveWorkflowNode, nodes, updateWorkflowNode],
  );

  const createLinkedWorkflowImageResultNode = useCallback(
    (
      sourceNode: LibTvWorkflowNode,
      params: {
        title: string;
        prompt: string;
        mediaUrl?: string;
        width?: number;
        height?: number;
        note?: string;
      },
    ) => {
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const imageFrame = workflowNodeFrame("image");
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const nextWidth = Math.max(
        imageFrame.width,
        Number(params.width || imageFrame.width),
      );
      const nextHeight = Math.max(
        imageFrame.height,
        Number(params.height || imageFrame.height),
      );
      const nextNode = addWorkflowNode("image", {
        x: Number(sourceNode.x || 0) + sourceWidth + 240,
        y: Number(sourceNode.y || 0) + (sourceHeight - nextHeight) / 2,
        linkFromNodeId: sourceNode.id,
        linkToNodeId: null,
      });
      moveWorkflowNode(nextNode.id, {
        width: nextWidth,
        height: nextHeight,
      });
      updateWorkflowNode(nextNode.id, {
        title: params.title,
        mediaUrl:
          typeof params.mediaUrl === "string"
            ? params.mediaUrl
            : String(sourceNode.data?.mediaUrl || ""),
        mediaRole: "ordinary",
        content: "",
        prompt: params.prompt,
        note: params.note || "",
        workflowRedrawRunning: true,
        workflowRedrawError: "",
      });
      selectLayer(nextNode.id);
      setActiveWorkflowNode(nextNode.id);
      return nextNode;
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleCreatePortraitTexturePreset = useCallback(
    (sourceId: string) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(
        sourceNode.data?.mediaUrl ||
          sourceNode.data?.referenceImages?.[0] ||
          "",
      ).trim();
      if (!sourceUrl) {
        message.warning("当前图片还没有可用素材");
        return;
      }
      const preset = getLibTvImagePresetById("portrait_texture_adjustment");
      if (!preset) {
        message.error("人像质感调节预设不存在");
        return;
      }
      const aspectRatio = String(
        sourceNode.data?.aspectRatio || preset.defaultAspectRatio || "16:9",
      );
      const ratioSize = parseWorkflowAspectRatioSize(aspectRatio, 16, 9);
      const displayFrame = workflowImageDisplayFrame(
        ratioSize.width,
        ratioSize.height,
      );
      const nextNode = createLinkedWorkflowImageResultNode(sourceNode, {
        title: preset.label,
        prompt: "",
        mediaUrl: "",
        width: displayFrame.width,
        height: displayFrame.height,
        note: "",
      });
      updateWorkflowNode(nextNode.id, {
        title: preset.label,
        mediaUrl: "",
        mediaRole: "generator",
        componentType: "image-generator",
        content: "",
        prompt: "",
        note: "",
        selectedOptionId: preset.id,
        aspectRatio,
        imageSize: String(
          sourceNode.data?.imageSize || preset.defaultImageSize || "2K",
        ),
        referenceImages: [sourceUrl],
        referenceImageNodeIds: [sourceNode.id],
        referenceImageRoles: ["reference"],
        workflowPortraitTextureSettings: {
          sceneFusion: "自然融合",
          lightingFusion: "自然匹配",
          skin: "自然肤质",
          texture: "自然纹理",
          sharpness: "标准清晰",
        },
        workflowGenerationRunning: false,
        workflowGenerationProgress: undefined,
        workflowGenerationError: "",
        workflowRedrawRunning: false,
        workflowRedrawError: "",
        suppressGenerationBar: false,
        workflowMediaUserResized: false,
      });
      window.setTimeout(() => {
        void flowRef.current?.fitView({
          nodes: [{ id: sourceNode.id }, { id: nextNode.id }],
          padding: 0.28,
          duration: 320,
          maxZoom: 1,
        });
      }, 0);
    },
    [createLinkedWorkflowImageResultNode, nodes, updateWorkflowNode],
  );

  const handleCreateEmotionAdjustmentPreset = useCallback(
    (sourceId: string, request: WorkflowEmotionAdjustmentCreateRequest) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(
        sourceNode.data?.mediaUrl ||
          sourceNode.data?.referenceImages?.[0] ||
          "",
      ).trim();
      if (!sourceUrl) {
        message.warning("当前图片还没有可用素材");
        return;
      }
      const modelId = String(request.modelId || "").trim();
      if (!modelId) {
        message.warning("请先选择图片模型");
        return;
      }
      const emotionLabel =
        String(request.emotionLabel || "淡然自若").trim() || "淡然自若";
      const aspectRatio = String(request.aspectRatio || "").trim();
      const imageSize = String(request.imageSize || "").trim();
      const requestedGenerationCount = Number(request.generationCount);
      const generationCount = Number.isFinite(requestedGenerationCount)
        ? Math.max(1, Math.round(requestedGenerationCount))
        : 1;
      const sourceTitle =
        String(sourceNode.data?.title || "图片").trim() || "图片";
      const layoutAspectRatio =
        aspectRatio || String(sourceNode.data?.aspectRatio || "").trim();
      const ratioSize = parseWorkflowAspectRatioSize(layoutAspectRatio, 4, 5);
      const displayFrame = workflowImageDisplayFrame(
        ratioSize.width,
        ratioSize.height,
      );
      const internalPrompt = [
        `以参考图一（原图）为主参考图，将选中人物的表情调整为「${emotionLabel}」。`,
        "保持人物身份、脸型、五官、发型、服装、构图、背景、光影和画面质感一致。",
        "只改变人物情绪和微表情，不改变人物数量、场景内容、主体姿态和镜头构图。",
      ].join("\n");
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceWidth = Math.max(
        sourceFrame.width,
        Number(sourceNode.width || sourceFrame.width),
      );
      const sourceHeight = Math.max(
        sourceFrame.height,
        Number(sourceNode.height || sourceFrame.height),
      );
      const nextNode = addWorkflowNode("image", {
        x: Number(sourceNode.x || 0) + sourceWidth + 240,
        y: Number(sourceNode.y || 0) + (sourceHeight - displayFrame.height) / 2,
        linkFromNodeId: sourceNode.id,
        linkToNodeId: null,
      });
      moveWorkflowNode(nextNode.id, {
        width: displayFrame.width,
        height: displayFrame.height,
      });
      const submitSettings: WorkflowGenerationSubmitSettings = {
        modelId,
        selectedOptionId: "custom",
        workflowEndpointMethod:
          String(request.workflowEndpointMethod || "").trim() || undefined,
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(imageSize ? { imageSize } : {}),
        ...(Number.isFinite(requestedGenerationCount)
          ? { generationCount }
          : {}),
        workflowExtraParameters: request.workflowExtraParameters,
        workflowInternalPrompt: internalPrompt,
        workflowEmotionAdjustmentSettings: {
          expression: emotionLabel,
          sourceNodeId: sourceNode.id,
          sourceUrl,
          ratio: aspectRatio || undefined,
          resolution: imageSize || undefined,
          count: Number.isFinite(requestedGenerationCount)
            ? generationCount
            : undefined,
        },
      };
      updateWorkflowNode(nextNode.id, {
        title: `${sourceTitle} 情绪调节`,
        mediaUrl: "",
        mediaRole: "generator",
        componentType: "image-generator",
        content: "",
        prompt: "",
        workflowInternalPrompt: internalPrompt,
        note: "情绪调节生成中...",
        selectedOptionId: "custom",
        modelId,
        workflowEndpointMethod:
          String(request.workflowEndpointMethod || "").trim() || undefined,
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(imageSize ? { imageSize } : {}),
        ...(Number.isFinite(requestedGenerationCount)
          ? { generationCount }
          : {}),
        workflowExtraParameters: request.workflowExtraParameters,
        referenceImages: [sourceUrl],
        referenceImageNodeIds: [sourceNode.id],
        referenceImageRoles: ["reference"],
        workflowEmotionAdjustmentSettings:
          submitSettings.workflowEmotionAdjustmentSettings,
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0,
        workflowGenerationError: "",
        workflowRedrawRunning: false,
        workflowRedrawError: "",
        suppressGenerationBar: true,
        workflowMediaUserResized: false,
      });
      selectLayer(nextNode.id);
      setActiveWorkflowNode(nextNode.id);
      window.requestAnimationFrame(() => {
        void flowRef.current?.fitView({
          nodes: [{ id: sourceNode.id }, { id: nextNode.id }],
          padding: 0.28,
          duration: 320,
          maxZoom: 1,
        });
        let attempts = 0;
        const startGenerationWhenReady = () => {
          attempts += 1;
          const exists = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.some((item) => item.id === nextNode.id);
          if (!exists && attempts < 8) {
            window.setTimeout(startGenerationWhenReady, 80);
            return;
          }
          void handleGenerateWorkflowNodeRef.current(
            nextNode.id,
            "",
            submitSettings,
          );
        };
        window.setTimeout(startGenerationWhenReady, 120);
      });
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleUpscaleImageNode = useCallback(
    (sourceId: string, request: WorkflowImageUpscaleRequest) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) return;
      if (!projectId) {
        message.error("项目未初始化，无法创建放大任务");
        return;
      }
      const sourceTitle =
        String(sourceNode.data?.title || "图片").trim() || "图片";
      const targetWidth = Math.max(
        1,
        Math.round(
          Number(
            request.targetWidth ||
              sourceNode.width ||
              LIBTV_TAPNOW_GENERATOR_WIDTH,
          ),
        ),
      );
      const targetHeight = Math.max(
        1,
        Math.round(
          Number(
            request.targetHeight ||
              sourceNode.height ||
              LIBTV_TAPNOW_GENERATOR_HEIGHT,
          ),
        ),
      );
      const displayFrame = workflowImageDisplayFrame(targetWidth, targetHeight);
      const resultNode = createLinkedWorkflowImageResultNode(sourceNode, {
        title: `${sourceTitle} 增强`,
        prompt: `高清放大 ${request.imageSize} ${request.aspectRatio}`,
        width: displayFrame.width,
        height: displayFrame.height,
        note: "放大中...",
      });

      void (async () => {
        try {
          const imageUrl = await resolveWorkflowApiImageSource(sourceUrl);
          const createdJob = await createWorkflowCanvasBackendJob({
            projectId,
            kind: "upscale",
            request: {
              layerId: sourceId,
              imageUrl,
              imageSize: request.imageSize,
              scale: request.imageSize,
              aspectRatio: request.aspectRatio,
              sourceWidth: Number(sourceNode.width || 0) || undefined,
              sourceHeight: Number(sourceNode.height || 0) || undefined,
              workflowNodeId: sourceId,
              workflowOutputNodeId: resultNode.id,
            },
          });
          const completedJob = await waitWorkflowCanvasBackendJob({
            jobId: createdJob.id,
            maxAttempts: 320,
            onProgress: (job) => {
              const progressLabel = String(
                job.resultData?.message || "",
              ).trim();
              if (progressLabel)
                updateWorkflowNode(resultNode.id, {
                  note: progressLabel.slice(0, 80),
                });
            },
          });
          const resultUrl =
            resolveWorkflowCanvasBackendJobResultUrl(completedJob);
          if (!resultUrl) throw new Error("高清放大未返回图片");
          const responseResult = completedJob.resultData?.response;
          const outputWidth = Number(
            responseResult?.output?.width ||
              responseResult?.target?.width ||
              targetWidth,
          );
          const outputHeight = Number(
            responseResult?.output?.height ||
              responseResult?.target?.height ||
              targetHeight,
          );
          const outputFrame = workflowImageDisplayFrame(
            outputWidth,
            outputHeight,
          );
          moveWorkflowNode(resultNode.id, {
            width: outputFrame.width,
            height: outputFrame.height,
          });
          updateWorkflowNode(resultNode.id, {
            mediaUrl: resultUrl,
            mediaRole: "ordinary",
            note: "",
            workflowRedrawRunning: false,
            workflowRedrawError: "",
          });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "高清放大失败";
          updateWorkflowNode(resultNode.id, {
            note: messageText,
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
          });
          message.error(messageText);
          console.error("[LibTvWorkflowCanvas] upscale failed", error);
        }
      })();
    },
    [
      createLinkedWorkflowImageResultNode,
      moveWorkflowNode,
      nodes,
      projectId,
      updateWorkflowNode,
    ],
  );

  const handleRunImageToolbarPreset = useCallback(
    (sourceId: string, presetId: string) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) {
        message.warning("当前图片还没有可用素材");
        return;
      }
      const preset = getLibTvImagePresetById(presetId);
      if (!preset) {
        message.error("图片预设不存在");
        return;
      }
      const isPanoramaPreset = preset.id === "panorama-720";
      const presetAspectRatio = isPanoramaPreset
        ? "2:1"
        : preset.defaultAspectRatio ||
          String(sourceNode.data?.aspectRatio || "16:9");
      const presetImageSize = isPanoramaPreset
        ? String(sourceNode.data?.imageSize || "2K")
        : preset.defaultImageSize || String(sourceNode.data?.imageSize || "2K");
      const ratioSize = parseWorkflowAspectRatioSize(
        String(presetAspectRatio),
        16,
        9,
      );
      const displayFrame = workflowImageDisplayFrame(
        ratioSize.width,
        ratioSize.height,
      );
      const resultNode = createLinkedWorkflowImageResultNode(sourceNode, {
        title: preset.label,
        prompt: "",
        mediaUrl: "",
        width: displayFrame.width,
        height: displayFrame.height,
        note: "",
      });
      updateWorkflowNode(resultNode.id, {
        title: preset.label,
        mediaRole: "generator",
        componentType: "image-generator",
        selectedOptionId: preset.id,
        modelId: isPanoramaPreset
          ? "gpt-image-2"
          : String(sourceNode.data?.modelId || ""),
        aspectRatio: presetAspectRatio,
        imageSize: presetImageSize,
        referenceImages: [sourceUrl],
        referenceImageNodeIds: [sourceNode.id],
        referenceImageRoles: ["reference"],
        workflowGenerationRunning: false,
        workflowGenerationProgress: undefined,
        workflowGenerationError: "",
        workflowRedrawRunning: false,
        workflowRedrawError: "",
        suppressGenerationBar: false,
        workflowMediaUserResized: false,
      });
      void flowRef.current?.fitView({
        nodes: [{ id: sourceNode.id }, { id: resultNode.id }],
        padding: 0.28,
        duration: 320,
        maxZoom: 1,
      });
    },
    [createLinkedWorkflowImageResultNode, nodes, updateWorkflowNode],
  );

  const handleCreateAngleEditNode = useCallback(
    (sourceId: string, request: WorkflowAngleEditCreateRequest) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) {
        message.warning("当前图片还没有可用素材");
        return;
      }
      if (!projectId) {
        message.error("项目未初始化，无法创建多角度任务");
        return;
      }
      const preset = getLibTvImagePresetById("multi-angle-nine-grid");
      const presetLabel = "多角度";
      const sourceNaturalWidth = Number(
        sourceNode.data?.workflowMediaNaturalWidth || sourceNode.width || 0,
      );
      const sourceNaturalHeight = Number(
        sourceNode.data?.workflowMediaNaturalHeight || sourceNode.height || 0,
      );
      const sourceImageSize = normalizeWorkflowSourceImageSize(
        sourceNaturalWidth,
        sourceNaturalHeight,
      );
      const aspectRatio = String(
        sourceNode.data?.aspectRatio ||
          request.aspectRatio ||
          preset?.defaultAspectRatio ||
          "",
      );
      const imageSize = sourceImageSize || String(request.imageSize || "");
      const visiblePrompt = String(request.prompt || "").trim();
      const internalPrompt = buildWorkflowAngleEditQwenPrompt(request.controls);
      const preferredModelId = String(
        request.modelId || sourceNode.data?.modelId || "",
      ).trim();
      const sourceFrame = workflowNodeFrame(sourceNode.kind);
      const sourceDisplayWidth = Math.max(
        1,
        Number(sourceNode.width || 0) || sourceFrame.width,
      );
      const sourceDisplayHeight = Math.max(
        1,
        Number(sourceNode.height || 0) || sourceFrame.height,
      );
      const resultNode = addWorkflowNode("image", {
        x: Number(sourceNode.x || 0) + sourceDisplayWidth + 240,
        y: Number(sourceNode.y || 0),
        linkFromNodeId: sourceNode.id,
        linkToNodeId: null,
      });
      moveWorkflowNode(resultNode.id, {
        width: sourceDisplayWidth,
        height: sourceDisplayHeight,
      });
      updateWorkflowNode(resultNode.id, {
        title: presetLabel,
        mediaUrl: "",
        mediaRole: "ordinary",
        content: "",
        prompt: visiblePrompt,
        workflowInternalPrompt: visiblePrompt,
        selectedOptionId: "multi-angle-nine-grid",
        aspectRatio,
        imageSize,
        generationCount: 1,
        referenceImages: [sourceUrl],
        referenceImageNodeIds: [sourceNode.id],
        referenceImageRoles: ["reference"],
        workflowGenerationRunning: true,
        workflowGenerationCategory: "workflow_angle_edit",
        workflowGenerationProgress: 0.03,
        workflowGenerationError: "",
        workflowRedrawRunning: false,
        workflowRedrawError: "",
        suppressGenerationBar: true,
        workflowMediaUserResized: false,
        workflowAngleEditControls: request.controls as Record<string, unknown>,
        note: WORKFLOW_IMAGE_GENERATING_NOTE,
      });
      selectLayer(resultNode.id);
      setActiveWorkflowNode(resultNode.id);
      void flowRef.current?.fitView({
        nodes: [{ id: sourceNode.id }, { id: resultNode.id }],
        padding: 0.28,
        duration: 320,
        maxZoom: 1,
      });

      void (async () => {
        try {
          const imageUrl = await resolveWorkflowApiImageSource(sourceUrl);
          const route = await resolveWorkflowImageToolRoute(preferredModelId);
          updateWorkflowNode(resultNode.id, {
            modelId: route.modelId,
            workflowEndpointMethod: route.methodId,
          });
          const createdJob = await createWorkflowCanvasBackendJob({
            projectId,
            kind: "image_generate",
            request: {
              ...(request.workflowExtraParameters || {}),
              prompt: internalPrompt,
              rawPrompt: visiblePrompt,
              workflowInternalPrompt: visiblePrompt || undefined,
              model: route.modelId,
              modelId: route.modelId,
              workflowEndpointMethod: route.methodId,
              mode: route.methodId,
              ...(aspectRatio ? { aspectRatio } : {}),
              ...(imageSize ? { imageSize, size: imageSize } : {}),
              workflowExtraParameters:
                request.workflowExtraParameters || undefined,
              count: 1,
              n: 1,
              forceSingle: true,
              referenceImages: [imageUrl],
              images: [imageUrl],
              seed: -1,
              category: "workflow_angle_edit",
              workflowNodeId: resultNode.id,
              upstreamNodes: [
                {
                  id: sourceNode.id,
                  kind: "image",
                  title:
                    String(sourceNode.data?.title || "图片").trim() || "图片",
                  mediaUrl: sourceUrl,
                  mediaRole: "ordinary",
                  componentType:
                    typeof sourceNode.data?.componentType === "string"
                      ? sourceNode.data.componentType
                      : undefined,
                },
              ],
              upstreamTextBlocks: [],
              angleControls: request.controls,
            },
          });
          updateWorkflowNode(resultNode.id, {
            workflowGenerationJobId: createdJob.id,
            workflowGenerationProgress: Number.isFinite(
              Number(createdJob.resultData?.progress),
            )
              ? Math.max(
                  0.03,
                  Math.min(0.99, Number(createdJob.resultData?.progress)),
                )
              : 0.03,
            note: normalizeWorkflowImageGeneratingNote(
              createdJob.resultData?.message,
            ),
          });
          const completedJob = await waitWorkflowCanvasBackendJob({
            jobId: createdJob.id,
            maxAttempts: 360,
            onProgress: (job) => {
              const progressLabel = String(
                job.resultData?.message || "",
              ).trim();
              updateWorkflowNode(resultNode.id, {
                workflowGenerationJobId: job.id,
                workflowGenerationRunning: true,
                workflowGenerationProgress: Number.isFinite(
                  Number(job.resultData?.progress),
                )
                  ? Math.max(
                      0.03,
                      Math.min(0.99, Number(job.resultData?.progress)),
                    )
                  : undefined,
                note: normalizeWorkflowImageGeneratingNote(progressLabel),
              });
            },
          });
          const resultUrls = collectWorkflowCanvasJobResultUrls(
            completedJob.resultData?.response || completedJob.resultUrl,
          );
          const resultUrl =
            resultUrls[0] ||
            resolveWorkflowCanvasBackendJobResultUrl(completedJob);
          if (!resultUrl) throw new Error("多角度生成未返回图片");
          updateWorkflowNode(resultNode.id, {
            mediaUrl: resultUrl,
            mediaRole: "ordinary",
            prompt: visiblePrompt,
            modelId: route.modelId,
            workflowEndpointMethod: route.methodId,
            aspectRatio: aspectRatio || undefined,
            imageSize: imageSize || undefined,
            workflowExtraParameters:
              request.workflowExtraParameters || undefined,
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            suppressGenerationBar: false,
          });
          applyWorkflowImageUrlNodeFrame(
            moveWorkflowNode,
            resultNode.id,
            resultUrl,
            {
              centerX: Number(resultNode.x || 0) + sourceDisplayWidth / 2,
              centerY: Number(resultNode.y || 0) + sourceDisplayHeight / 2,
            },
            (size) => {
              updateWorkflowNode(
                resultNode.id,
                getWorkflowMediaNaturalSizePatch(size),
              );
            },
          );
          selectLayer(resultNode.id);
          setActiveWorkflowNode(resultNode.id);
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "多角度生成失败";
          updateWorkflowNode(resultNode.id, {
            note: messageText.slice(0, 80),
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: false,
          });
          message.error(messageText);
          console.error("[LibTvWorkflowCanvas] angle edit failed", error);
        }
      })();
    },
    [
      addWorkflowNode,
      moveWorkflowNode,
      nodes,
      projectId,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleSubmitImageUpscaleNode = useCallback(
    (targetId: string, request: WorkflowImageUpscaleRequest) => {
      const targetNode = nodes.find((item) => item.id === targetId);
      if (!targetNode || targetNode.kind !== "image") return;
      if (!projectId) {
        message.error("项目未初始化，无法创建高清任务");
        return;
      }
      const incomingEdge = edges.find((edge) => edge.target === targetId);
      const sourceNode = nodes.find((item) => item.id === incomingEdge?.source);
      if (!sourceNode || sourceNode.kind !== "image") {
        message.warning("请先连接参考图片");
        return;
      }
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) {
        message.warning("参考图片还未上传完成");
        return;
      }
      const targetResolution = normalizeWorkflowCanvasUpscaleResolution(
        request.targetResolution ||
          request.imageSize ||
          request.scale ||
          targetNode.data?.imageUpscaleTargetResolution ||
          targetNode.data?.imageSize ||
          "4k",
      );
      const backendImageSize = workflowCanvasUpscaleImageSize(targetResolution);
      const outputFormat = normalizeWorkflowCanvasUpscaleOutputFormat(
        request.outputFormat ||
          targetNode.data?.imageUpscaleOutputFormat ||
          "jpeg",
      );
      const sourceTitle =
        String(sourceNode.data?.title || "图片").trim() || "图片";
      updateWorkflowNode(targetId, {
        title: "高清",
        mediaUrl: "",
        mediaRole: "generator",
        prompt: "配置参数生成高清图像",
        modelId: request.modelId || targetNode.data?.modelId,
        ...(request.modelVariant || targetNode.data?.imageUpscaleVariant
          ? {
              imageUpscaleVariant:
                request.modelVariant || targetNode.data?.imageUpscaleVariant,
            }
          : {}),
        imageUpscaleTargetResolution: targetResolution,
        imageUpscaleOutputFormat: outputFormat,
        imageSize: backendImageSize,
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0.03,
        workflowGenerationError: "",
        suppressGenerationBar: false,
        note: "高清放大中...",
      });

      void (async () => {
        try {
          const imageUrl = await resolveWorkflowApiImageSource(sourceUrl);
          const createdJob = await createWorkflowCanvasBackendJob({
            projectId,
            kind: "upscale",
            request: {
              layerId: sourceNode.id,
              imageUrl,
              imageSize: backendImageSize,
              scale: backendImageSize,
              target_resolution: targetResolution,
              targetResolution,
              output_format: outputFormat,
              outputFormat,
              aspectRatio: request.aspectRatio,
              model: request.modelId,
              modelId: request.modelId,
              modelVariant: request.modelVariant,
              sourceWidth: Number(sourceNode.width || 0) || undefined,
              sourceHeight: Number(sourceNode.height || 0) || undefined,
              workflowNodeId: sourceNode.id,
              workflowOutputNodeId: targetId,
            },
          });
          updateWorkflowNode(targetId, {
            workflowGenerationJobId: createdJob.id,
            workflowGenerationProgress: 0.08,
          });
          const completedJob = await waitWorkflowCanvasBackendJob({
            jobId: createdJob.id,
            maxAttempts: 320,
            onProgress: (job) => {
              const progress = Number(job.resultData?.progress);
              const progressLabel = String(
                job.resultData?.message || "",
              ).trim();
              updateWorkflowNode(targetId, {
                ...(Number.isFinite(progress)
                  ? {
                      workflowGenerationProgress: Math.max(
                        0.08,
                        Math.min(0.95, progress),
                      ),
                    }
                  : {}),
                ...(progressLabel ? { note: progressLabel.slice(0, 80) } : {}),
              });
            },
          });
          const resultUrl =
            resolveWorkflowCanvasBackendJobResultUrl(completedJob);
          if (!resultUrl) throw new Error("高清放大未返回图片");
          const responseResult = completedJob.resultData?.response;
          const outputWidth = Number(
            responseResult?.output?.width ||
              responseResult?.target?.width ||
              request.targetWidth,
          );
          const outputHeight = Number(
            responseResult?.output?.height ||
              responseResult?.target?.height ||
              request.targetHeight,
          );
          const outputFrame = workflowImageDisplayFrame(
            outputWidth,
            outputHeight,
          );
          moveWorkflowNode(targetId, {
            width: outputFrame.width,
            height: outputFrame.height,
          });
          updateWorkflowNode(targetId, {
            title: `${sourceTitle} 高清`,
            mediaUrl: resultUrl,
            mediaRole: "ordinary",
            prompt: `高清放大 ${targetResolution.toUpperCase()}`,
            note: "",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            suppressGenerationBar: false,
          });
          selectLayer(targetId);
          setActiveWorkflowNode(targetId);
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "高清放大失败";
          updateWorkflowNode(targetId, {
            note: messageText,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: messageText,
            suppressGenerationBar: false,
          });
          message.error(messageText);
          console.error(
            "[LibTvWorkflowCanvas] workflow upscale node failed",
            error,
          );
        }
      })();
    },
    [
      edges,
      moveWorkflowNode,
      nodes,
      projectId,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleExpandImageNode = useCallback(
    (sourceId: string, request: WorkflowImageExpandRequest) => {
      const sourceNode = nodes.find((item) => item.id === sourceId);
      if (!sourceNode || sourceNode.kind !== "image") return;
      const sourceUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!sourceUrl) return;
      const sourceTitle =
        String(sourceNode.data?.title || "图片").trim() || "图片";
      const targetWidth = Math.max(
        1,
        Math.round(
          Number(
            request.targetWidth ||
              sourceNode.width ||
              LIBTV_TAPNOW_GENERATOR_WIDTH,
          ),
        ),
      );
      const targetHeight = Math.max(
        1,
        Math.round(
          Number(
            request.targetHeight ||
              sourceNode.height ||
              LIBTV_TAPNOW_GENERATOR_HEIGHT,
          ),
        ),
      );
      const displayFrame = workflowImageDisplayFrame(targetWidth, targetHeight);
      const finalPrompt = [
        request.prompt,
        `当前扩图预设：${request.presetLabel}。`,
        request.expandRatioKey ? `目标画幅：${request.expandRatioKey}。` : "",
        `目标输出尺寸：${targetWidth}x${targetHeight}，只扩展画布，不要拉伸原图主体。`,
        request.scaleMultiplier > 1
          ? `需要额外扩展到 ${request.scaleMultiplier}x 的更大画布。`
          : "保持标准扩图范围。",
      ]
        .filter(Boolean)
        .join("");
      const resultNode = createLinkedWorkflowImageResultNode(sourceNode, {
        title: `${sourceTitle} ${request.presetLabel}扩图`,
        prompt: finalPrompt,
        width: displayFrame.width,
        height: displayFrame.height,
        note: "扩图生成中...",
      });

      void (async () => {
        try {
          const prediction = await runWorkflowImageRuntime({
            modelId: request.modelId,
            methodId: request.workflowEndpointMethod,
            prompt: finalPrompt,
            sourceImage: sourceUrl,
            aspectRatio: request.aspectRatio,
            resolution: request.resolution,
            count: request.generationCount,
            enableWebSearch: request.enableWebSearch,
            extraParameters: request.workflowExtraParameters,
          });
          const resultUrl = String(prediction.urls[0] || "").trim();
          if (!resultUrl) throw new Error("扩图未返回图片");
          updateWorkflowNode(resultNode.id, {
            mediaUrl: resultUrl,
            mediaRole: "ordinary",
            modelId: request.modelId,
            workflowEndpointMethod: request.workflowEndpointMethod,
            aspectRatio: request.aspectRatio,
            imageSize: request.resolution,
            generationCount: request.generationCount,
            enableWebSearch: request.enableWebSearch,
            workflowExtraParameters: request.workflowExtraParameters,
            workflowImageResults: prediction.urls.map((url, index) => ({
              url,
              title: `${sourceTitle} ${request.presetLabel}扩图 ${index + 1}`,
            })),
            workflowImageResultsCollapsed:
              prediction.urls.length > 1 ? false : undefined,
            prompt: finalPrompt,
            note: "",
            workflowRedrawRunning: false,
            workflowRedrawError: "",
          });
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "扩图失败";
          updateWorkflowNode(resultNode.id, {
            note: messageText,
            workflowRedrawRunning: false,
            workflowRedrawError: messageText,
          });
          message.error(messageText);
          console.error("[LibTvWorkflowCanvas] expand failed", error);
        }
      })();
    },
    [createLinkedWorkflowImageResultNode, nodes, updateWorkflowNode],
  );

  const getWorkflowNodeClipboardPayload = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return "";
      const relatedEdges = edges.filter(
        (edge) => edge.source === nodeId || edge.target === nodeId,
      );
      return JSON.stringify(
        {
          type: "ideart/workflow-node",
          version: 2,
          node: {
            id: node.id,
            kind: node.kind,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            parentId: node.parentId,
            data: node.data,
          },
          nodes: [
            {
              id: node.id,
              kind: node.kind,
              x: node.x,
              y: node.y,
              width: node.width,
              height: node.height,
              parentId: node.parentId,
              data: node.data,
            },
          ],
          edges: relatedEdges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
          })),
        },
        null,
        2,
      );
    },
    [edges, nodes],
  );

  const getWorkflowNodesClipboardPayload = useCallback(
    (nodeIds: string[]) => {
      const selectedNodeIds = Array.from(
        new Set(nodeIds.map((id) => String(id || "").trim()).filter(Boolean)),
      );
      const selectedNodeIdSet = new Set(selectedNodeIds);
      const selectedNodes = nodes.filter((node) =>
        selectedNodeIdSet.has(node.id),
      );
      if (selectedNodes.length === 0) return "";
      const selectedEdges = edges.filter(
        (edge) =>
          selectedNodeIdSet.has(edge.source) &&
          selectedNodeIdSet.has(edge.target),
      );
      return JSON.stringify(
        {
          type: "ideart/workflow-node",
          version: 2,
          nodes: selectedNodes.map((node) => ({
            id: node.id,
            kind: node.kind,
            x: node.x,
            y: node.y,
            width: node.width,
            height: node.height,
            parentId: selectedNodeIdSet.has(String(node.parentId || ""))
              ? node.parentId
              : undefined,
            data: node.data,
          })),
          edges: selectedEdges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
          })),
        },
        null,
        2,
      );
    },
    [edges, nodes],
  );

  const pasteWorkflowNodeClipboardPayload = useCallback(
    (
      rawPayload: unknown,
      options?: {
        position?: { x: number; y: number };
        offset?: { x: number; y: number };
        titleSuffix?: string;
      },
    ) => {
      const payload =
        typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as any).type !== "ideart/workflow-node"
      )
        return [];
      const sourceNodes = Array.isArray((payload as any).nodes)
        ? (payload as any).nodes
        : (payload as any).node
          ? [(payload as any).node]
          : [];
      const clipboardNodes = sourceNodes
        .filter((item: any) => item && typeof item === "object")
        .map((item: any, index: number) => {
          const kind = String(item.kind || "").trim() as LibTvWorkflowNodeKind;
          const frame = workflowNodeFrame(kind);
          return {
            originalId:
              String(item.id || `clipboard-node-${index}`).trim() ||
              `clipboard-node-${index}`,
            kind,
            x: Number.isFinite(Number(item.x)) ? Number(item.x) : 0,
            y: Number.isFinite(Number(item.y)) ? Number(item.y) : 0,
            width:
              Number.isFinite(Number(item.width)) && Number(item.width) > 0
                ? Number(item.width)
                : frame.width,
            height:
              Number.isFinite(Number(item.height)) && Number(item.height) > 0
                ? Number(item.height)
                : frame.height,
            parentId:
              typeof item.parentId === "string" ? item.parentId : undefined,
            data: item.data && typeof item.data === "object" ? item.data : {},
          };
        })
        .filter((item: any) => Boolean(item.kind));
      if (clipboardNodes.length === 0) return [];

      const minX = Math.min(...clipboardNodes.map((item: any) => item.x));
      const minY = Math.min(...clipboardNodes.map((item: any) => item.y));
      const maxX = Math.max(
        ...clipboardNodes.map((item: any) => item.x + item.width),
      );
      const maxY = Math.max(
        ...clipboardNodes.map((item: any) => item.y + item.height),
      );
      const offset = options?.position
        ? {
            x: Number(options.position.x) - (minX + (maxX - minX) / 2),
            y: Number(options.position.y) - (minY + (maxY - minY) / 2),
          }
        : options?.offset || { x: 36, y: 36 };
      const idMap = new Map<string, string>();
      const createdIds: string[] = [];
      for (const item of clipboardNodes) {
        const created = addWorkflowNode(item.kind, {
          x: Math.round(item.x + offset.x),
          y: Math.round(item.y + offset.y),
        });
        idMap.set(item.originalId, created.id);
        createdIds.push(created.id);
        moveWorkflowNode(created.id, {
          x: Math.round(item.x + offset.x),
          y: Math.round(item.y + offset.y),
          width: Math.max(1, Math.round(item.width)),
          height: Math.max(1, Math.round(item.height)),
        });
        const nextTitle = options?.titleSuffix
          ? `${String(item.data?.title || "节点").trim() || "节点"} ${options.titleSuffix}`
          : item.data?.title;
        updateWorkflowNode(created.id, {
          ...item.data,
          ...(nextTitle ? { title: nextTitle } : {}),
          referenceImages: Array.isArray(item.data?.referenceImages)
            ? [...item.data.referenceImages]
            : item.data?.referenceImages,
          referenceImageNodeIds: Array.isArray(item.data?.referenceImageNodeIds)
            ? item.data.referenceImageNodeIds.map(
                (id: unknown) =>
                  idMap.get(String(id || "")) || String(id || ""),
              )
            : item.data?.referenceImageNodeIds,
          referenceImageRoles: Array.isArray(item.data?.referenceImageRoles)
            ? [...item.data.referenceImageRoles]
            : item.data?.referenceImageRoles,
        });
      }

      const clipboardOriginalIds = new Set(
        clipboardNodes.map((item: any) => item.originalId),
      );
      const clipboardEdges = Array.isArray((payload as any).edges)
        ? (payload as any).edges
        : [];
      for (const edge of clipboardEdges) {
        const source = String(edge?.source || "").trim();
        const target = String(edge?.target || "").trim();
        if (!source || !target) continue;
        const nextSource =
          idMap.get(source) || (clipboardOriginalIds.has(source) ? "" : source);
        const nextTarget =
          idMap.get(target) || (clipboardOriginalIds.has(target) ? "" : target);
        if (!nextSource || !nextTarget || nextSource === nextTarget) continue;
        addWorkflowEdge(nextSource, nextTarget);
      }

      const lastId = createdIds[createdIds.length - 1];
      if (lastId) {
        selectLayer(lastId);
        setActiveWorkflowNode(lastId);
      }
      return createdIds;
    },
    [
      addWorkflowEdge,
      addWorkflowNode,
      moveWorkflowNode,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );
  useEffect(() => {
    pasteWorkflowNodeClipboardPayloadRef.current =
      pasteWorkflowNodeClipboardPayload;
  }, [pasteWorkflowNodeClipboardPayload]);

  const writeWorkflowClipboardText = useCallback(
    async (text: string, successMessage: string) => {
      if (!text) return;
      try {
        await navigator.clipboard?.writeText(text);
        message.success(successMessage);
      } catch {
        message.warning("浏览器暂不允许写入剪贴板");
      }
    },
    [],
  );

  const handleCopyNode = useCallback(
    (nodeId: string) => {
      const payload = getWorkflowNodeClipboardPayload(nodeId);
      void writeWorkflowClipboardText(payload, "已复制节点");
    },
    [getWorkflowNodeClipboardPayload, writeWorkflowClipboardText],
  );

  const handleCopyNodeMedia = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const mediaUrl = String(
        node.data?.mediaUrl || node.data?.referenceImages?.[0] || "",
      ).trim();
      if (!mediaUrl) {
        message.warning("当前节点没有可复制的素材");
        return;
      }
      if (node.kind !== "image") {
        void writeWorkflowClipboardText(
          mediaUrl,
          node.kind === "video" ? "已复制视频链接" : "已复制素材链接",
        );
        return;
      }

      void (async () => {
        try {
          const clipboard = navigator.clipboard;
          const ClipboardItemCtor =
            typeof window !== "undefined" ? window.ClipboardItem : undefined;
          if (!clipboard?.write || !ClipboardItemCtor)
            throw new Error("当前浏览器不支持复制图片");
          const response = await fetch(resolveImageDownloadUrl(mediaUrl), {
            credentials: "include",
          });
          if (!response.ok) throw new Error(`图片读取失败: ${response.status}`);
          const blob = await response.blob();
          const mimeType = blob.type.startsWith("image/")
            ? blob.type
            : "image/png";
          const clipboardBlob =
            blob.type === mimeType
              ? blob
              : new Blob([blob], { type: mimeType });
          await clipboard.write([
            new ClipboardItemCtor({ [mimeType]: clipboardBlob }),
          ]);
          message.success("已复制图片");
        } catch {
          await writeWorkflowClipboardText(mediaUrl, "已复制图片链接");
        }
      })();
    },
    [nodes, writeWorkflowClipboardText],
  );

  const handleCreateSubjectFromNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      const mediaUrl = String(
        node?.data?.mediaUrl || node?.data?.referenceImages?.[0] || "",
      ).trim();
      if (
        !node ||
        (node.kind !== "image" && node.kind !== "video") ||
        !mediaUrl
      ) {
        message.warning("当前节点没有可用于创建主体的素材");
        return;
      }
      setMaterialManagerCreateOpen(true, mediaUrl, "subjects");
    },
    [nodes, setMaterialManagerCreateOpen],
  );

  const handleRunSeedanceComplianceCheck = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node || (node.kind !== "image" && node.kind !== "video")) {
        message.warning("请选择图片或视频节点进行合规校验");
        return;
      }
      const mediaUrl = String(
        node.data?.mediaUrl || node.data?.referenceImages?.[0] || "",
      ).trim();
      if (!mediaUrl) {
        message.warning("当前节点没有可校验的素材");
        return;
      }
      void (async () => {
        const modelId = String(
          node.data?.modelId || "volcengine-doubao-video",
        ).trim();
        const assetType = node.kind === "video" ? "Video" : "Image";
        const name =
          String(node.data?.title || node.kind || "Seedance素材").trim() ||
          "Seedance素材";
        const loadingKey = `seedance-compliance-${node.id}`;
        message.loading({
          content: "正在提交 Seedance2.0 虚拟素材校验...",
          key: loadingKey,
          duration: 0,
        });
        try {
          const savedFileId = Number(node.data?.workflowPlatformFileId || 0);
          const platformFile = savedFileId
            ? { id: savedFileId, url: mediaUrl }
            : await importPlatformAssetFromUrl(mediaUrl, name);
          const seedanceAsset = await submitWorkflowSeedanceVirtualAsset({
            fileId: platformFile.id,
            name,
            modelId,
            assetType,
          });
          updateWorkflowNode(node.id, {
            workflowPlatformFileId: seedanceAsset.fileId,
            workflowPlatformFileUrl: seedanceAsset.fileUrl || platformFile.url,
            workflowPlatformValidationStatus: "completed",
            workflowSeedanceAssetId: seedanceAsset.assetId,
            workflowSeedanceAssetUrl: seedanceAsset.assetUrl,
            workflowSeedanceAssetType: assetType,
            workflowSeedanceAssetStatus: "Active",
            workflowSeedanceAssetCategory: "character",
          });
          await saveSeedanceCharacterLibraryAsset({
            projectId,
            name,
            assetId: seedanceAsset.assetId,
            assetUrl: seedanceAsset.assetUrl,
            referenceImageUrl:
              seedanceAsset.fileUrl || platformFile.url || mediaUrl,
            assetType,
            modelId,
            platformFileId: seedanceAsset.fileId,
            sourceNodeId: node.id,
          });
          message.success({
            content: "Seedance2.0 虚拟素材校验通过，已加入合规素材库",
            key: loadingKey,
          });
        } catch (error) {
          message.error({
            content:
              error instanceof Error
                ? error.message
                : "Seedance2.0 虚拟素材校验失败",
            key: loadingKey,
          });
          console.error(
            "[LibTvWorkflowCanvas] Seedance compliance check failed",
            error,
          );
        }
      })();
    },
    [nodes, projectId, updateWorkflowNode],
  );

  const handleCopyNodeTaskId = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      const taskId = String(
        node?.data?.workflowGenerationTaskId ||
          node?.data?.workflowGenerationBackgroundTaskId ||
          node?.data?.workflowGenerationStatusUrl ||
          "",
      ).trim();
      if (!taskId) {
        message.warning("当前节点没有 TaskId");
        return;
      }
      void writeWorkflowClipboardText(taskId, "已复制 TaskId");
    },
    [nodes, writeWorkflowClipboardText],
  );

  const handleVerifyGenerationResult = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      const taskId = String(
        node?.data?.workflowGenerationTaskId ||
          node?.data?.workflowGenerationBackgroundTaskId ||
          node?.data?.workflowGenerationStatusUrl ||
          "",
      ).trim();
      if (!node || node.kind !== "video") {
        message.warning("请选择视频节点核验生成结果");
        return;
      }
      if (!taskId) {
        message.warning("当前视频节点没有 TaskId");
        return;
      }
      message.info("核验生成结果入口已保留");
    },
    [nodes],
  );

  const handleEnterPanoramaPreview = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node || node.kind !== "image") {
        message.warning("请选择图片节点进入全景预览");
        return;
      }
      const mediaUrl = String(
        node.data?.mediaUrl || node.data?.referenceImages?.[0] || "",
      ).trim();
      if (!mediaUrl) {
        message.warning("当前图片节点没有可预览的图片");
        return;
      }
      const panoramaData = node.data as any;
      const targetWidth = LIBTV_TAPNOW_VIDEO_GENERATOR_WIDTH;
      const targetHeight = LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT;
      const currentWidth = Math.max(1, Number(node.width || targetWidth));
      const currentHeight = Math.max(1, Number(node.height || targetHeight));
      moveWorkflowNode(node.id, {
        width: targetWidth,
        height: targetHeight,
        x: Math.round(Number(node.x || 0) + currentWidth / 2 - targetWidth / 2),
        y: Math.round(
          Number(node.y || 0) + currentHeight / 2 - targetHeight / 2,
        ),
      });
      updateWorkflowNode(node.id, {
        workflowPanoramaActive: true,
        workflowPanoramaYaw: Number(panoramaData?.workflowPanoramaYaw || 0),
        workflowPanoramaPitch: Number(panoramaData?.workflowPanoramaPitch || 0),
      } as any);
    },
    [moveWorkflowNode, nodes, updateWorkflowNode],
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const payload = getWorkflowNodeClipboardPayload(nodeId);
      try {
        const createdIds = pasteWorkflowNodeClipboardPayload(payload, {
          offset: { x: 36, y: 36 },
          titleSuffix: "副本",
        });
        if (createdIds.length > 0) message.success("已创建节点副本");
      } catch (error) {
        console.error(
          "[LibTvWorkflowCanvas] duplicate workflow node failed",
          error,
        );
        message.error("创建副本失败");
      }
    },
    [getWorkflowNodeClipboardPayload, nodes, pasteWorkflowNodeClipboardPayload],
  );

  const handleDuplicateWorkflowSelection = useCallback(
    (nodeIds: string[], options?: { offset?: { x: number; y: number } }) => {
      const payload = getWorkflowNodesClipboardPayload(nodeIds);
      if (!payload) return;
      try {
        const createdIds = pasteWorkflowNodeClipboardPayload(payload, {
          offset: options?.offset || { x: 36, y: 36 },
          titleSuffix: "副本",
        });
        if (createdIds.length > 0) {
          setWorkflowSelectedIds(createdIds);
          setActiveWorkflowNode(createdIds.length === 1 ? createdIds[0] : null);
          selectLayer(createdIds.length === 1 ? createdIds[0] : null);
          message.success(
            createdIds.length > 1 ? "已复制节点和连线" : "已创建节点副本",
          );
        }
      } catch (error) {
        console.error(
          "[LibTvWorkflowCanvas] duplicate workflow selection failed",
          error,
        );
        message.error("创建副本失败");
      }
    },
    [
      getWorkflowNodesClipboardPayload,
      pasteWorkflowNodeClipboardPayload,
      selectLayer,
      setActiveWorkflowNode,
      setWorkflowSelectedIds,
    ],
  );

  const requestDeleteWorkflowNodes = useCallback((nodeIds: string[]) => {
    const uniqueIds = Array.from(
      new Set(nodeIds.map((id) => String(id || "").trim()).filter(Boolean)),
    );
    if (uniqueIds.length === 0) return;
    setPendingDeleteNodeIds(uniqueIds);
  }, []);

  const cancelDeleteWorkflowNodes = useCallback(() => {
    setPendingDeleteNodeIds([]);
  }, []);

  const confirmDeleteWorkflowNodes = useCallback(() => {
    if (pendingDeleteNodeIds.length === 0) return;
    removeWorkflowNodes(pendingDeleteNodeIds);
    setPendingDeleteNodeIds([]);
    setWorkflowSelectedIds([]);
    selectLayer(null);
    setActiveWorkflowNode(null);
  }, [
    pendingDeleteNodeIds,
    removeWorkflowNodes,
    selectLayer,
    setActiveWorkflowNode,
    setWorkflowSelectedIds,
  ]);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      requestDeleteWorkflowNodes([nodeId]);
    },
    [requestDeleteWorkflowNodes],
  );

  const autoRegisterWorkflowSeedanceVirtualAsset = useCallback(
    async (params: {
      nodeId: string;
      fileId: number;
      mediaUrl: string;
      title: string;
      assetType?: "Image" | "Video" | "Audio";
    }) => {
      const mediaUrl = String(params.mediaUrl || "").trim();
      if (!mediaUrl) return;
      updateWorkflowNode(params.nodeId, {
        workflowSeedanceAssetStatus: "Classifying",
      });
      try {
        const classification = await classifyWorkflowCharacterImage(
          params.fileId,
        );
        if (!classification.isCharacterAsset) {
          updateWorkflowNode(params.nodeId, {
            workflowPlatformValidationStatus: "unverified",
            workflowSeedanceAssetId: undefined,
            workflowSeedanceAssetUrl: undefined,
            workflowSeedanceAssetGroupId: undefined,
            workflowSeedanceAssetType: undefined,
            workflowSeedanceAssetStatus: "Skipped",
            workflowSeedanceAssetCategory: "non_character",
          });
          console.info(
            "[LibTvWorkflowCanvas] uploaded image skipped Seedance character registration",
            {
              nodeId: params.nodeId,
              category: classification.category,
              score: classification.score,
              reason: classification.reason,
            },
          );
          return;
        }
        updateWorkflowNode(params.nodeId, {
          workflowPlatformValidationStatus: "processing",
          workflowSeedanceAssetStatus: "Processing",
        });
        const seedanceAsset = await submitWorkflowSeedanceVirtualAsset({
          fileId: params.fileId,
          name: params.title || "虚拟人物",
          modelId: "volcengine-doubao-video",
          assetType: params.assetType || "Image",
        });
        updateWorkflowNode(params.nodeId, {
          workflowPlatformFileId: seedanceAsset.fileId,
          workflowPlatformFileUrl: seedanceAsset.fileUrl || mediaUrl,
          workflowPlatformValidationStatus: "completed",
          workflowSeedanceAssetId: seedanceAsset.assetId,
          workflowSeedanceAssetUrl: seedanceAsset.assetUrl,
          workflowSeedanceAssetType: seedanceAsset.assetType,
          workflowSeedanceAssetStatus: "Active",
          workflowSeedanceAssetCategory: "character",
        });
        await saveSeedanceCharacterLibraryAsset({
          projectId,
          name: params.title || "虚拟人物",
          assetId: seedanceAsset.assetId,
          assetUrl: seedanceAsset.assetUrl,
          referenceImageUrl: seedanceAsset.fileUrl || mediaUrl,
          assetType: seedanceAsset.assetType,
          modelId: seedanceAsset.modelId,
          platformFileId: seedanceAsset.fileId,
          sourceNodeId: params.nodeId,
        });
        message.success("已自动识别为 Seedance2.0 虚拟人物");
      } catch (error) {
        updateWorkflowNode(params.nodeId, {
          workflowPlatformValidationStatus: "failed",
          workflowSeedanceAssetId: undefined,
          workflowSeedanceAssetUrl: undefined,
          workflowSeedanceAssetGroupId: undefined,
          workflowSeedanceAssetType: undefined,
          workflowSeedanceAssetStatus: "Unavailable",
          workflowSeedanceAssetCategory: undefined,
        });
        console.info(
          "[LibTvWorkflowCanvas] uploaded media is not an active Seedance virtual asset",
          error,
        );
      }
    },
    [projectId, updateWorkflowNode],
  );

  const handleCopyNodeToClipboard = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const mediaUrl = String(
        node.data?.mediaUrl || node.data?.referenceImages?.[0] || "",
      ).trim();
      const text =
        mediaUrl ||
        String(
          node.data?.content || node.data?.prompt || node.data?.title || "",
        ).trim() ||
        getWorkflowNodeClipboardPayload(nodeId);
      void writeWorkflowClipboardText(text, "已复制到剪贴板");
    },
    [getWorkflowNodeClipboardPayload, nodes, writeWorkflowClipboardText],
  );

  const handleDownloadNodeOriginal = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const mediaUrl = String(
        node.data?.mediaUrl ||
          node.data?.splatUrl ||
          node.data?.colliderMeshUrl ||
          node.data?.worldUrl ||
          node.data?.worldMarbleUrl ||
          "",
      ).trim();
      if (!mediaUrl) {
        message.warning("当前节点没有可下载的资源");
        return;
      }
      const extension = inferWorkflowMediaDownloadExtension(node);
      const title =
        String(node.data?.title || node.kind || extension).trim() || extension;
      const safeTitle =
        title
          .replace(/[\\/:*?"<>|]+/g, "-")
          .replace(/\s+/g, "-")
          .slice(0, 80) || extension;
      const downloadUrl = resolveImageDownloadUrl(mediaUrl);
      const filename = `${safeTitle}.${extension}`;
      try {
        // A same-origin blob download is reliable for generated/uploaded
        // media whose source is on OSS/CDN. A bare cross-origin <a
        // download> is allowed to navigate instead of downloading.
        await fetchAndDownload(downloadUrl, filename);
        message.success(
          node.kind === "video"
            ? "已开始下载视频"
            : node.kind === "audio"
              ? "已开始下载音频"
              : "已开始下载原图",
        );
      } catch (error) {
        console.warn("[LibTvWorkflowCanvas] media download fallback", error);
        triggerBrowserDownload(downloadUrl, filename);
        message.warning("下载已在新窗口打开，请使用浏览器保存");
      }
    },
    [nodes],
  );

  const handleSaveNodeToMaterials = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      const mediaUrl = String(
        node.data?.mediaUrl || node.data?.referenceImages?.[0] || "",
      ).trim();
      if (!mediaUrl) {
        message.warning("当前节点没有可保存的素材");
        return;
      }
      openMaterialSaveDialog({
        name: String(node.data?.title || "素材").trim() || "素材",
        src: mediaUrl,
        thumbnailSrc: mediaUrl,
        coverSrc: mediaUrl,
        width: Number(node.width || 0) || undefined,
        height: Number(node.height || 0) || undefined,
        sourceLayerId: node.id,
      });
    },
    [nodes, openMaterialSaveDialog],
  );

  const handleReportNodeIssue = useCallback(
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      message.info(
        node
          ? `已记录节点反馈：${node.data?.title || node.kind}`
          : "已记录节点反馈",
      );
    },
    [nodes],
  );

  const handleWorkflowSurfaceInit = useCallback(
    (
      instance: ReactFlowInstance<ReactFlowNode<WorkflowOverlayNodeData>, Edge>,
    ) => {
      flowRef.current = instance;
      const viewport = workflowViewportRef.current;
      void instance.setViewport(viewport);
      setViewportZoom(viewport.zoom);
    },
    [],
  );

  const handleViewportChange = useCallback(
    (viewport: { x?: number; y?: number; zoom?: number }) => {
      const nextViewport = normalizeLibTvProjectCanvasViewport(viewport);
      const currentViewport = workflowViewportRef.current;
      setViewportZoom((current) =>
        Math.abs(current - nextViewport.zoom) < 0.001
          ? current
          : nextViewport.zoom,
      );
      if (
        Math.abs(currentViewport.x - nextViewport.x) < 0.1 &&
        Math.abs(currentViewport.y - nextViewport.y) < 0.1 &&
        Math.abs(currentViewport.zoom - nextViewport.zoom) < 0.001
      )
        return;
      workflowViewportRef.current = nextViewport;
      setWorkflowViewport(nextViewport);
      setWorkflowCanvases((current) =>
        current.map((canvas) =>
          canvas.id === activeWorkflowCanvasId
            ? { ...canvas, viewport: nextViewport, updatedAt: Date.now() }
            : canvas,
        ),
      );
    },
    [activeWorkflowCanvasId],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const createWorkflowMediaNodesFromFiles = useCallback(
    async (files: File[], options?: { center?: { x: number; y: number } }) => {
      if (files.length === 0) return;

      const csvFiles = files.filter(isWorkflowCsvFile);
      if (csvFiles.length > 0) {
        setUploading(true);
        try {
          for (let index = 0; index < csvFiles.length; index += 1) {
            const file = csvFiles[index];
            const text = await readWorkflowCsvText(file);
            const table = parseWorkflowCsvRows(text);
            const headers = (table[0] || []).map((item) =>
              String(item || "").trim(),
            );
            const records = table
              .slice(1)
              .map((row) => {
                const record: Record<string, string> = {};
                headers.forEach((header, headerIndex) => {
                  record[normalizeWorkflowCsvHeader(header)] = String(
                    row[headerIndex] || "",
                  ).trim();
                });
                return record;
              })
              .filter((record) =>
                Object.values(record).some((value) =>
                  String(value || "").trim(),
                ),
              );
            if (headers.length === 0 || records.length === 0)
              throw new Error(`${file.name || "CSV"} 没有可导入的分镜数据`);
            const scriptResult = workflowCsvRecordsToScriptResult(
              file.name,
              records,
              headers,
            );
            const frame = {
              width: LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH,
              height: LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT,
            };
            const basePosition = options?.center
              ? {
                  x: Math.round(options.center.x - frame.width / 2),
                  y: Math.round(options.center.y - frame.height / 2),
                }
              : getNextNodePosition("script");
            const node = addWorkflowNode("script", {
              x: basePosition.x + index * 34,
              y: basePosition.y + index * 34,
            });
            moveWorkflowNode(node.id, {
              x: basePosition.x + index * 34,
              y: basePosition.y + index * 34,
              width: frame.width,
              height: frame.height,
            });
            updateWorkflowNode(node.id, {
              title: scriptResult.title,
              content: createWorkflowTextEditorInitialContent(
                scriptResult.summary,
              ),
              componentType: "script-document",
              selectedOptionId: "storyboard-script",
              scriptResult,
              scriptViewMode: "script",
              prompt: "",
              note: "",
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
              suppressGenerationBar: false,
            });
            selectLayer(node.id);
            setActiveWorkflowNode(node.id);
          }
          message.success(`已导入 ${csvFiles.length} 个 CSV 脚本`);
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : "CSV 导入失败",
          );
        } finally {
          setUploading(false);
        }
      }

      const uncappedCompatibleFiles = files
        .filter((file) => !isWorkflowCsvFile(file))
        .map((file) => ({ file, kind: getFileNodeKind(file) }))
        .filter((entry): entry is { file: File; kind: LibTvWorkflowNodeKind } =>
          Boolean(entry.kind),
        );

      const compatibleFiles = takeWorkflowMediaBatch(uncappedCompatibleFiles);

      if (compatibleFiles.length === 0) {
        if (csvFiles.length === files.length) return;
        message.warning("仅支持上传 CSV、图片、视频或音频文件");
        return;
      }

      if (
        uncappedCompatibleFiles.length > LIBTV_WORKFLOW_MEDIA_BATCH_MAX_FILES
      ) {
        message.warning(
          "一次最多上传 " +
            LIBTV_WORKFLOW_MEDIA_BATCH_MAX_FILES +
            " 个文件，请分批继续上传",
        );
      }

      setUploading(true);
      try {
        const insertedIds: string[] = [];
        const preparedUploads: Array<{
          file: File;
          kind: LibTvWorkflowNodeKind;
          nodeId: string;
          placeholderFrame: {
            x: number;
            y: number;
            width: number;
            height: number;
          };
          previewUrl: string;
        }> = [];
        const gridLayout = getWorkflowUploadGridLayout(
          compatibleFiles,
          options?.center,
        );
        const baseUploadPosition = options?.center
          ? null
          : getNextNodePosition(compatibleFiles[0]?.kind || "image");
        for (let index = 0; index < compatibleFiles.length; index += 1) {
          const { file, kind } = compatibleFiles[index];
          const defaultFrame = workflowNodeFrame(kind);
          const column = index % gridLayout.columns;
          const row = Math.floor(index / gridLayout.columns);
          const defaultPosition = options?.center
            ? {
                x: Math.round(
                  (gridLayout.origin?.x || 0) +
                    column * (gridLayout.maxWidth + gridLayout.gap) +
                    (gridLayout.maxWidth - defaultFrame.width) / 2,
                ),
                y: Math.round(
                  (gridLayout.origin?.y || 0) +
                    row * (gridLayout.maxHeight + gridLayout.gap) +
                    (gridLayout.maxHeight - defaultFrame.height) / 2,
                ),
              }
            : {
                x: Math.round(
                  (baseUploadPosition?.x || 0) +
                    column * (gridLayout.maxWidth + gridLayout.gap) +
                    (gridLayout.maxWidth - defaultFrame.width) / 2,
                ),
                y: Math.round(
                  (baseUploadPosition?.y || 0) +
                    row * (gridLayout.maxHeight + gridLayout.gap) +
                    (gridLayout.maxHeight - defaultFrame.height) / 2,
                ),
              };
          const node = addWorkflowNode(kind, defaultPosition);
          const previewUrl = URL.createObjectURL(file);
          const placeholderFrame = {
            x: defaultPosition.x,
            y: defaultPosition.y,
            width: defaultFrame.width,
            height: defaultFrame.height,
          };
          moveWorkflowNode(node.id, {
            x: placeholderFrame.x,
            y: placeholderFrame.y,
            width: placeholderFrame.width,
            height: placeholderFrame.height,
          });
          updateWorkflowNode(node.id, {
            title: getWorkflowUploadPlaceholderNote(kind),
            content: "",
            mediaUrl: previewUrl,
            mediaRole:
              kind === "image" || kind === "video" || kind === "audio"
                ? "ordinary"
                : undefined,
            workflowMediaMimeType: file.type || undefined,
            workflowMediaNaturalWidth: undefined,
            workflowMediaNaturalHeight: undefined,
            workflowMediaFrameLocked: getWorkflowUploadedMediaFrameLocked(kind),
            note: getWorkflowUploadPlaceholderNote(kind),
            workflowMediaUploadState: "uploading",
            workflowGenerationRunning: true,
            workflowGenerationProgress: 0.08,
            workflowGenerationError: "",
            suppressGenerationBar: false,
          });
          insertedIds.push(node.id);
          preparedUploads.push({
            file,
            kind,
            nodeId: node.id,
            placeholderFrame,
            previewUrl,
          });
        }
        const lastInsertedId = insertedIds[insertedIds.length - 1];
        if (lastInsertedId) {
          selectLayer(lastInsertedId);
          setActiveWorkflowNode(lastInsertedId);
        }

        void runWorkflowMediaMetadataTasks(
          preparedUploads,
          async ({ file, kind, nodeId, placeholderFrame }) => {
            const size = await readWorkflowMediaFileSize(file, kind);
            updateWorkflowNode(nodeId, getWorkflowMediaNaturalSizePatch(size));
            applyWorkflowUploadedMediaNodeFrame(
              moveWorkflowNode,
              nodeId,
              kind,
              size,
              placeholderFrame,
            );
            return size;
          },
        );

        const results = await runWorkflowMediaUploadTasks(
          preparedUploads,
          async ({ file, kind, nodeId, previewUrl }) => {
            try {
              let lastUploadPercent = -1;
              const { publicUrl, libtvUrl, fileId, platformFile } =
                await uploadCanvasNodeFile(file, {
                  onProgress: (progress) => {
                    const normalizedProgress = Math.max(
                      0,
                      Math.min(1, Number(progress) || 0),
                    );
                    const uploadPercent = Math.round(normalizedProgress * 100);
                    if (uploadPercent === lastUploadPercent) return;
                    lastUploadPercent = uploadPercent;
                    const reviewing = uploadPercent >= 100;
                    updateWorkflowNode(nodeId, {
                      note: reviewing
                        ? "审核中"
                        : getWorkflowUploadPlaceholderNote(kind),
                      workflowMediaUploadState: reviewing
                        ? "reviewing"
                        : "uploading",
                      workflowGenerationRunning: true,
                      workflowGenerationProgress: reviewing
                        ? 1
                        : normalizedProgress,
                      workflowGenerationError: "",
                    });
                  },
                });
              const mediaUrl = libtvUrl || publicUrl;
              const title =
                shortFileName(file.name) ||
                (kind === "video"
                  ? "视频"
                  : kind === "audio"
                    ? "音频"
                    : "图片");
              updateWorkflowNode(nodeId, {
                title,
                content: "",
                mediaUrl,
                mediaRole:
                  kind === "image" || kind === "video" || kind === "audio"
                    ? "ordinary"
                    : undefined,
                workflowMediaMimeType: file.type || undefined,
                workflowPlatformFileId: fileId,
                workflowPlatformFileUrl: platformFile.url,
                workflowPlatformFileAssetType: platformFile.asset_type,
                workflowPlatformValidationStatus:
                  platformFile.validation_status || "unverified",
                workflowMediaFrameLocked:
                  getWorkflowUploadedMediaFrameLocked(kind),
                workflowMediaUserResized: false,
                note: "审核中",
                workflowMediaUploadState: "reviewing",
                // LibTV keeps the node in a forced-full LOD state while the
                // uploaded media is being reviewed. This prevents the local
                // preview from collapsing into a low-detail placeholder.
                workflowGenerationRunning: true,
                workflowGenerationProgress: 1,
                workflowGenerationError: "",
                workflowSeedanceAssetId: undefined,
                workflowSeedanceAssetUrl: undefined,
                workflowSeedanceAssetGroupId: undefined,
                workflowSeedanceAssetType: undefined,
                workflowSeedanceAssetStatus: undefined,
                workflowSeedanceAssetCategory: undefined,
                suppressGenerationBar: false,
              });
              URL.revokeObjectURL(previewUrl);
              window.setTimeout(() => {
                updateWorkflowNode(nodeId, {
                  note: "上传成功",
                  workflowMediaUploadState: "success",
                  workflowGenerationRunning: false,
                  workflowGenerationProgress: undefined,
                });
                window.setTimeout(() => {
                  updateWorkflowNode(nodeId, {
                    note: "",
                    workflowMediaUploadState: undefined,
                  });
                }, 1000);
              }, 1000);
              if (kind === "image") {
                void autoRegisterWorkflowSeedanceVirtualAsset({
                  nodeId,
                  fileId,
                  mediaUrl,
                  title,
                  assetType: "Image",
                });
              }
            } catch (error) {
              updateWorkflowNode(nodeId, {
                note: "上传失败",
                workflowMediaUploadState: "error",
                workflowGenerationRunning: false,
                workflowGenerationProgress: undefined,
                workflowGenerationError:
                  error instanceof Error ? error.message : "上传失败",
              });
              window.setTimeout(() => {
                URL.revokeObjectURL(previewUrl);
                removeWorkflowNode(nodeId);
              }, 3000);
              throw error;
            }
          },
        );
        const failed = results.find((result) => result.status === "rejected");
        if (failed) {
          const reason = failed.reason;
          message.error(reason instanceof Error ? reason.message : "上传失败");
        }
      } catch (error) {
        message.error(error instanceof Error ? error.message : "上传失败");
      } finally {
        setUploading(false);
      }
    },
    [
      addWorkflowNode,
      autoRegisterWorkflowSeedanceVirtualAsset,
      getNextNodePosition,
      moveWorkflowNode,
      removeWorkflowNode,
      selectLayer,
      setActiveWorkflowNode,
      updateWorkflowNode,
    ],
  );

  const handleUploadChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      await createWorkflowMediaNodesFromFiles(files);
    },
    [createWorkflowMediaNodesFromFiles],
  );

  const handlePaneFilesDrop = useCallback(
    (files: File[], position: { x: number; y: number }) => {
      void createWorkflowMediaNodesFromFiles(files, { center: position });
    },
    [createWorkflowMediaNodesFromFiles],
  );

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isWorkflowClipboardTargetEditable(event.target)) return;
      const text = String(
        event.clipboardData?.getData("text/plain") || "",
      ).trim();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.type === "ideart/workflow-node") {
            event.preventDefault();
            const rect = containerRef.current?.getBoundingClientRect();
            const centerPoint = {
              x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
              y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
            };
            const flowCenter =
              flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
            const createdIds = pasteWorkflowNodeClipboardPayload(parsed, {
              position: flowCenter,
            });
            if (createdIds.length > 0) {
              message.success(
                createdIds.length > 1
                  ? `已粘贴 ${createdIds.length} 个节点`
                  : "已粘贴节点",
              );
            }
            return;
          }
        } catch {
          // 不是工作流节点 payload 时继续尝试粘贴媒体文件。
        }
      }
      const files = collectWorkflowClipboardMediaFiles(event.clipboardData);
      if (files.length === 0) return;
      event.preventDefault();
      const rect = containerRef.current?.getBoundingClientRect();
      const centerPoint = {
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      };
      const flowCenter =
        flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
      void createWorkflowMediaNodesFromFiles(files, { center: flowCenter });
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [createWorkflowMediaNodesFromFiles, pasteWorkflowNodeClipboardPayload]);

  const handleUseWorkflowHistoryFile = useCallback(
    (file: WorkflowHistoryFile) => {
      const url = String(file.fileUrl || "").trim();
      if (!url) {
        message.warning("该历史记录没有可用文件");
        return;
      }
      const rawKind = String(file.fileType || "").toLowerCase();
      const kind: LibTvWorkflowNodeKind =
        rawKind === "video" ? "video" : rawKind === "audio" ? "audio" : "image";
      const position = getNextNodePosition(kind);
      const node = addWorkflowNode(kind, position);
      const defaultFrame = workflowNodeFrame(kind);
      const title =
        String(file.fileName || "").trim() || getDefaultNodeTitle(kind);
      updateWorkflowNode(node.id, {
        title,
        content: "",
        prompt: String(file.prompt || "").trim(),
        modelId: String(file.model || "").trim() || undefined,
        mediaUrl: url,
        mediaRole: "ordinary",
        workflowMediaMimeType:
          kind === "video"
            ? "video/*"
            : kind === "audio"
              ? "audio/*"
              : "image/*",
        selectedOptionId: "custom",
        options: [],
        ...getWorkflowMediaNaturalSizePatch({
          width: Number(file.width || 0),
          height: Number(file.height || 0),
        }),
        videoDuration:
          kind === "video" && Number(file.duration || 0) > 0
            ? `${Number(file.duration)}s`
            : undefined,
        note: "",
        workflowGenerationRunning: false,
        workflowGenerationProgress: undefined,
        workflowGenerationError: "",
        suppressGenerationBar: false,
        workflowMediaUserResized: false,
      });
      setWorkflowSelectedIds([node.id]);
      selectLayer(node.id);
      setActiveWorkflowNode(node.id);

      const anchor = {
        centerX: position.x + defaultFrame.width / 2,
        centerY: position.y + defaultFrame.height / 2,
      };
      if (kind === "image") {
        if (Number(file.width || 0) > 0 && Number(file.height || 0) > 0) {
          applyWorkflowMediaNodeFrame(
            moveWorkflowNode,
            node.id,
            { width: Number(file.width), height: Number(file.height) },
            anchor,
          );
        } else {
          applyWorkflowImageUrlNodeFrame(
            moveWorkflowNode,
            node.id,
            url,
            anchor,
            (size) => {
              updateWorkflowNode(
                node.id,
                getWorkflowMediaNaturalSizePatch(size),
              );
            },
            () => shouldApplyAutoMediaFrame(node.id, url),
          );
        }
      } else if (kind === "video") {
        if (Number(file.width || 0) > 0 && Number(file.height || 0) > 0) {
          applyWorkflowMediaNodeFrame(
            moveWorkflowNode,
            node.id,
            { width: Number(file.width), height: Number(file.height) },
            anchor,
          );
        } else {
          applyWorkflowVideoUrlNodeFrame(
            moveWorkflowNode,
            node.id,
            url,
            anchor,
            (metadata) => {
              updateWorkflowNode(node.id, {
                ...getWorkflowMediaNaturalSizePatch(metadata),
                ...(Number(metadata.duration || 0) > 0
                  ? {
                      videoDuration: `${Number(metadata.duration) < 10 ? Number(metadata.duration).toFixed(1) : Math.round(Number(metadata.duration))}s`,
                    }
                  : {}),
              });
            },
          );
        }
      }

      setHistoryOpen(false);
      message.success("已添加到工作流画布");
    },
    [
      addWorkflowNode,
      getDefaultNodeTitle,
      getNextNodePosition,
      moveWorkflowNode,
      selectLayer,
      setActiveWorkflowNode,
      setWorkflowSelectedIds,
      shouldApplyAutoMediaFrame,
      updateWorkflowNode,
    ],
  );

  const handleInsertWorkflowAsset = useCallback(
    (asset: MaterialManagerWorkflowAssetPayload) => {
      const url = String(asset.url || "").trim();
      if (!url) {
        message.warning("该资产没有可用素材");
        return;
      }
      const kind = asset.kind === "video" ? "video" : "image";
      const position = getNextNodePosition(kind);
      const node = addWorkflowNode(kind, position);
      const frame = workflowNodeFrame(kind);
      const title =
        String(asset.title || "").trim() ||
        (kind === "video" ? "视频素材" : "图片素材");
      updateWorkflowNode(node.id, {
        title,
        content: String(asset.content || "").trim(),
        prompt: String(asset.prompt || "").trim(),
        mediaUrl: url,
        mediaRole: "ordinary",
        referenceImages: Array.isArray(asset.referenceImages)
          ? asset.referenceImages
          : [],
        selectedOptionId: "custom",
        options: [],
        workflowMediaUserResized: false,
      });
      setWorkflowSelectedIds([node.id]);
      selectLayer(node.id);
      setActiveWorkflowNode(node.id);

      const anchor = {
        centerX: position.x + frame.width / 2,
        centerY: position.y + frame.height / 2,
      };
      if (Number(asset.width) > 0 && Number(asset.height) > 0) {
        updateWorkflowNode(
          node.id,
          getWorkflowMediaNaturalSizePatch({
            width: Number(asset.width),
            height: Number(asset.height),
          }),
        );
        applyWorkflowMediaNodeFrame(
          moveWorkflowNode,
          node.id,
          {
            width: Number(asset.width),
            height: Number(asset.height),
          },
          anchor,
        );
      } else if (kind === "video") {
        applyWorkflowVideoUrlNodeFrame(
          moveWorkflowNode,
          node.id,
          url,
          anchor,
          (metadata) => {
            updateWorkflowNode(node.id, {
              ...getWorkflowMediaNaturalSizePatch(metadata),
              ...(Number(metadata.duration || 0) > 0
                ? {
                    videoDuration: `${Number(metadata.duration) < 10 ? Number(metadata.duration).toFixed(1) : Math.round(Number(metadata.duration))}s`,
                  }
                : {}),
            });
          },
        );
      } else {
        applyWorkflowImageUrlNodeFrame(
          moveWorkflowNode,
          node.id,
          url,
          anchor,
          (size) => {
            updateWorkflowNode(node.id, getWorkflowMediaNaturalSizePatch(size));
          },
          () => shouldApplyAutoMediaFrame(node.id, url),
        );
      }

      message.success("已添加到工作流画布");
    },
    [
      addWorkflowNode,
      getNextNodePosition,
      moveWorkflowNode,
      selectLayer,
      setActiveWorkflowNode,
      setWorkflowSelectedIds,
      shouldApplyAutoMediaFrame,
      updateWorkflowNode,
    ],
  );

  const handleApplyCharacterLibraryItem = useCallback(
    async (item: WorkflowCharacterLibraryItem) => {
      const sources = [
        {
          key: "full",
          title: "人物立绘",
          url: String(item.fullBodyUrl || item.coverUrl || "").trim(),
        },
        {
          key: "face",
          title: "脸部近景",
          url: String(item.faceCloseupUrl || item.coverUrl || "").trim(),
        },
        {
          key: "expression",
          title: "表情参考",
          url: String(item.expressionGridUrl || item.coverUrl || "").trim(),
        },
        {
          key: "sheet",
          title: "三视图",
          url: String(item.characterSheetUrl || item.coverUrl || "").trim(),
        },
      ].filter((entry) => Boolean(entry.url));
      if (sources.length === 0) {
        message.warning("该人物没有可用素材");
        return;
      }

      const measured = await Promise.all(
        sources.map(async (entry) => {
          try {
            const size = await readWorkflowImageUrlSize(entry.url);
            return {
              ...entry,
              size,
              frame: workflowMediaDisplayFrame(size.width, size.height),
            };
          } catch {
            return {
              ...entry,
              size: { width: 1, height: 1 },
              frame: workflowMediaDisplayFrame(1, 1),
            };
          }
        }),
      );

      const gap = 16;
      const rowGap = 24;
      const topRow = measured.slice(0, 3);
      const bottomRow = measured.slice(3);
      const topWidth =
        topRow.reduce((total, entry) => total + entry.frame.width, 0) +
        Math.max(0, topRow.length - 1) * gap;
      const topHeight = Math.max(
        ...topRow.map((entry) => entry.frame.height),
        1,
      );
      const bottomSource = bottomRow[0];
      const bottomFrame = bottomSource
        ? {
            width: topWidth,
            height: Math.max(
              1,
              Math.round(
                (topWidth * bottomSource.size.height) /
                  Math.max(1, bottomSource.size.width),
              ),
            ),
          }
        : { width: topWidth, height: topHeight };
      const totalWidth = Math.max(topWidth, bottomFrame.width);
      const totalHeight = topHeight + rowGap + bottomFrame.height;

      const rect = containerRef.current?.getBoundingClientRect();
      const centerPoint = {
        x: rect ? rect.left + rect.width / 2 : 960,
        y: rect ? rect.top + rect.height / 2 : 540,
      };
      const flowCenter =
        flowRef.current?.screenToFlowPosition(centerPoint) || centerPoint;
      const startX = Math.round(Number(flowCenter.x || 0) - totalWidth / 2);
      const startY = Math.round(Number(flowCenter.y || 0) - totalHeight / 2);

      const createdNodeIds: string[] = [];

      let cursorX = Math.round(startX + (totalWidth - topWidth) / 2);
      for (const entry of topRow) {
        const node = addWorkflowNode("image", { x: cursorX, y: startY });
        updateWorkflowNode(node.id, {
          title: `${item.name || "人物"} ${entry.title}`,
          content: String(item.description || "").trim(),
          prompt: String(item.description || item.summaryText || "").trim(),
          mediaUrl: entry.url,
          mediaRole: "ordinary",
          selectedOptionId: "custom",
          options: [],
          workflowMediaUserResized: false,
          note: item.categoryName ? `人物库 · ${item.categoryName}` : "人物库",
          ...getWorkflowMediaNaturalSizePatch(entry.size),
        });
        moveWorkflowNode(node.id, {
          x: cursorX,
          y: startY,
          width: entry.frame.width,
          height: entry.frame.height,
        });
        createdNodeIds.push(node.id);
        cursorX += entry.frame.width + gap;
      }

      const bottomY = startY + topHeight + rowGap;
      cursorX = startX;
      for (const entry of bottomRow) {
        const node = addWorkflowNode("image", { x: cursorX, y: bottomY });
        updateWorkflowNode(node.id, {
          title: `${item.name || "人物"} ${entry.title}`,
          content: String(item.description || "").trim(),
          prompt: String(item.description || item.summaryText || "").trim(),
          mediaUrl: entry.url,
          mediaRole: "ordinary",
          selectedOptionId: "custom",
          options: [],
          workflowMediaUserResized: false,
          note: item.categoryName ? `人物库 · ${item.categoryName}` : "人物库",
          ...getWorkflowMediaNaturalSizePatch(entry.size),
        });
        moveWorkflowNode(node.id, {
          x: cursorX,
          y: bottomY,
          width: bottomFrame.width,
          height: bottomFrame.height,
        });
        createdNodeIds.push(node.id);
        cursorX += bottomFrame.width + gap;
      }

      const focusIds = createdNodeIds.map((id) => ({ id }));
      setWorkflowSelectedIds(createdNodeIds);
      if (createdNodeIds[0]) {
        selectLayer(createdNodeIds[0]);
        setActiveWorkflowNode(createdNodeIds[0]);
      }
      window.setTimeout(() => {
        void flowRef.current?.fitView({
          nodes: focusIds,
          padding: 0.28,
          duration: 420,
          maxZoom: 1,
        });
      }, 0);
      setCharacterLibraryOpen(false);
      message.success("已应用至画布");
    },
    [
      addWorkflowNode,
      flowRef,
      containerRef,
      setActiveWorkflowNode,
      setCharacterLibraryOpen,
      setWorkflowSelectedIds,
      selectLayer,
      updateWorkflowNode,
      moveWorkflowNode,
    ],
  );

  const handleSubmitThreeDWorldEdit = useCallback(
    async (node: LibTvWorkflowNode, payload: ThreeDWorldEditSubmitPayload) => {
      if (!projectId) {
        message.error("项目未初始化，无法创建 3D 世界编辑任务");
        return;
      }
      const prompt = String(payload.prompt || "").trim();
      const panoImage = String(
        node.data?.panoUrl ||
          node.data?.thumbnailUrl ||
          node.data?.mediaUrl ||
          "",
      ).trim();
      if (!panoImage) {
        message.warning("当前 3D 世界没有可编辑的全景图");
        return;
      }
      const selectedWorldModel =
        String(node.data?.modelId || "marble-1.1@@worldlabs").trim() ||
        "marble-1.1@@worldlabs";
      const parsedWorldModel = parseModelRuntimeId(selectedWorldModel);
      const worldModelId = String(
        parsedWorldModel.modelId || selectedWorldModel || "marble-1.1",
      ).trim();
      const worldProviderKey = String(
        parsedWorldModel.providerKey || "worldlabs",
      )
        .trim()
        .toLowerCase();
      const worldRuntimeModel = parsedWorldModel.providerKey
        ? selectedWorldModel
        : `${worldModelId}@@${worldProviderKey}`;

      updateWorkflowNode(node.id, {
        note: "正在创建 3D 世界编辑任务",
        workflowGenerationRunning: true,
        workflowGenerationProgress: 0.04,
        workflowGenerationError: "",
        workflowGenerationTaskType: "world_edit",
        workflowGenerationProviderKey: worldProviderKey,
        suppressGenerationBar: true,
      });

      try {
        const createdJob = await createWorkflowCanvasBackendJob({
          projectId,
          kind: "world_edit",
          request: {
            prompt,
            rawPrompt: prompt,
            panoImage: await resolveWorkflowApiImageSource(panoImage),
            panoMask: payload.maskData,
            maskBounds: payload.maskBounds,
            regionCount: payload.regionCount,
            sourceWorldId: String(node.data?.worldId || "").trim() || undefined,
            sourcePanoUrl: panoImage,
            displayName: `${String(node.data?.title || "Edited World").trim() || "Edited World"} edit`,
            model: worldRuntimeModel,
            modelId: worldModelId,
            providerKey: worldProviderKey,
            workflowNodeId: node.id,
            projectId,
            kind: "world_edit",
            outputType: "3d",
            resultType: "3d",
            category: "workflow_world_edit",
            tags: ["ideart", "workflow", "world-edit"],
          },
        });
        updateWorkflowNode(node.id, {
          workflowGenerationJobId: createdJob.id,
          workflowGenerationTaskType: "world_edit",
          workflowGenerationProviderKey: worldProviderKey,
          workflowGenerationProgress: Number.isFinite(
            Number(createdJob.resultData?.progress),
          )
            ? Math.max(
                0,
                Math.min(0.99, Number(createdJob.resultData?.progress)),
              )
            : 0.08,
          note: createdJob.resultData?.message || "3D 世界编辑任务已创建",
        });
        const completedJob = await waitWorkflowCanvasBackendJob({
          jobId: createdJob.id,
          maxAttempts: 220,
          onProgress: (job) => {
            const progressLabel = String(job.resultData?.message || "").trim();
            updateWorkflowNode(node.id, {
              workflowGenerationJobId: job.id,
              workflowGenerationRunning: true,
              workflowGenerationProgress: Number.isFinite(
                Number(job.resultData?.progress),
              )
                ? Math.max(0, Math.min(0.99, Number(job.resultData?.progress)))
                : undefined,
              note: progressLabel
                ? progressLabel.slice(0, 80)
                : "3D 世界编辑中...",
            });
          },
        });
        const response = completedJob.resultData?.response || {};
        const statusResponse = response.statusResponse || {};
        const modelUrl = String(
          response.modelUrl ||
            statusResponse.modelUrl ||
            completedJob.resultUrl ||
            "",
        ).trim();
        const imageUrl = String(
          response.imageUrl ||
            response.thumbnailUrl ||
            response.panoUrl ||
            statusResponse.imageUrl ||
            statusResponse.thumbnailUrl ||
            statusResponse.panoUrl ||
            "",
        ).trim();
        const worldUrl = String(
          response.worldUrl ||
            response.worldMarbleUrl ||
            statusResponse.worldUrl ||
            statusResponse.worldMarbleUrl ||
            "",
        ).trim();
        if (!modelUrl && !worldUrl && !imageUrl)
          throw new Error("3D 世界编辑未返回结果");
        updateWorkflowNode(node.id, {
          mediaUrl: modelUrl || worldUrl || imageUrl,
          mediaRole: "ordinary",
          prompt,
          content: "",
          note: "",
          modelId: worldRuntimeModel,
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          workflowGenerationJobId: completedJob.id,
          workflowGenerationTaskId:
            String(
              completedJob.resultData?.externalTask?.taskId || "",
            ).trim() || undefined,
          workflowGenerationTaskType: String(
            completedJob.resultData?.externalTask?.taskType || "world_edit",
          ).trim(),
          workflowGenerationProviderKey: String(
            completedJob.resultData?.externalTask?.providerKey ||
              worldProviderKey,
          )
            .trim()
            .toLowerCase(),
          suppressGenerationBar: false,
          worldId:
            String(response.worldId || statusResponse.worldId || "").trim() ||
            undefined,
          worldUrl: worldUrl || undefined,
          worldMarbleUrl: worldUrl || undefined,
          splatUrl:
            String(response.splatUrl || statusResponse.splatUrl || "").trim() ||
            undefined,
          spzUrls:
            (response.spzUrls || statusResponse.spzUrls) &&
            typeof (response.spzUrls || statusResponse.spzUrls) === "object"
              ? response.spzUrls || statusResponse.spzUrls
              : undefined,
          colliderMeshUrl:
            String(
              response.colliderMeshUrl ||
                statusResponse.colliderMeshUrl ||
                modelUrl ||
                "",
            ).trim() || undefined,
          panoUrl:
            String(
              response.panoUrl ||
                statusResponse.panoUrl ||
                response.editedPanoUrl ||
                "",
            ).trim() || undefined,
          thumbnailUrl:
            String(
              response.thumbnailUrl ||
                statusResponse.thumbnailUrl ||
                imageUrl ||
                response.editedPanoUrl ||
                "",
            ).trim() || undefined,
          caption:
            String(response.caption || statusResponse.caption || "").trim() ||
            undefined,
        });
        message.success("3D 世界编辑完成");
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "3D 世界编辑失败";
        updateWorkflowNode(node.id, {
          note: messageText,
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: messageText,
          suppressGenerationBar: false,
        });
        message.error(messageText);
        console.error("[LibTvWorkflowCanvas] world edit failed", error);
      }
    },
    [projectId, updateWorkflowNode],
  );

  const handleFitView = useCallback(() => {
    const flow = flowRef.current;
    const bounds = getLibTvWorkflowBounds({ nodes });
    if (!flow || !bounds) return;
    const width = Math.max(1, workflowCanvasSize.width);
    const height = Math.max(1, workflowCanvasSize.height);
    const paddedWidth = Math.max(1, bounds.width * 1.45);
    const paddedHeight = Math.max(1, bounds.height * 1.45);
    const nextZoom = Math.max(
      0.15,
      Math.min(1, width / paddedWidth, height / paddedHeight),
    );
    void flow.setViewport(
      {
        x: width / 2 - bounds.centerX * nextZoom,
        y: height / 2 - bounds.centerY * nextZoom,
        zoom: nextZoom,
      },
      { duration: 500 },
    );
  }, [nodes, workflowCanvasSize.height, workflowCanvasSize.width]);

  const handleOptimizeWorkflowLayout = useCallback(
    (_nodeId: string) => {
      const patches = buildWorkflowAutoLayoutPatches({ nodes, edges });
      if (patches.length === 0) {
        message.info("画布上还没有可整理的节点");
        return;
      }
      moveWorkflowNodes(patches);
      setWorkflowSelectedIds([]);
      message.success("已按工作流关系重新整理画布");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          void flowRef.current?.fitView({
            padding: 0.16,
            minZoom: 0.15,
            maxZoom: 1,
            duration: 650,
          });
        });
      });
    },
    [edges, moveWorkflowNodes, nodes, setWorkflowSelectedIds],
  );

  const handleLocateWorkflowAssetNode = useCallback(
    (nodeId: string) => {
      const node = useCanvasStore
        .getState()
        .libtvWorkflow.nodes.find((item) => item.id === nodeId);
      if (!node) return;
      setWorkflowSelectedIds([nodeId]);
      setActiveWorkflowNode(nodeId);
      selectLayer(nodeId);
      let attempts = 0;
      const focusWhenMounted = () => {
        const flow = flowRef.current;
        if (!flow) return;
        if (flow.getNode(nodeId)) {
          void flow.fitView({
            nodes: [{ id: nodeId }],
            padding: 0.45,
            duration: 360,
            maxZoom: 1,
          });
          return;
        }
        attempts += 1;
        if (attempts < 8) window.requestAnimationFrame(focusWhenMounted);
      };
      window.requestAnimationFrame(focusWhenMounted);
    },
    [selectLayer, setActiveWorkflowNode, setWorkflowSelectedIds],
  );

  const handleZoomTo = useCallback((nextZoom: number) => {
    const safeZoom = Math.max(0.15, Math.min(8, nextZoom));
    setViewportZoom(safeZoom);
    void flowRef.current?.zoomTo(safeZoom, { duration: 500 });
  }, []);

  const selectedWorkflowIds = useMemo(
    () => selectedIds.filter((id) => nodes.some((node) => node.id === id)),
    [nodes, selectedIds],
  );

  const handleSendNodeToCodexChat = useCallback(
    async (nodeId: string) => {
      const targetIds =
        selectedWorkflowIds.includes(nodeId) && selectedWorkflowIds.length > 1
          ? selectedWorkflowIds
          : [nodeId];
      const targetIdSet = new Set(targetIds);
      const mediaNodes = nodes.filter((node) => targetIdSet.has(node.id));
      const files = mediaNodes
        .map((node) => {
          const data = (node.data || {}) as Record<string, any>;
          const candidates = [
            data.workflowPlatformFileUrl,
            data.mediaUrl,
            data.imageUrl,
            data.image_url,
            data.videoUrl,
            data.video_url,
            data.audioUrl,
            data.audio_url,
            data.fileUrl,
            data.file_url,
            data.outputUrl,
            data.output_url,
            data.resultUrl,
            data.result_url,
            data.url,
            data.src,
            Array.isArray(data.referenceImages)
              ? data.referenceImages[0]
              : undefined,
            Array.isArray(data.imageUrls) ? data.imageUrls[0] : undefined,
            data.thumbnailUrl,
            data.thumbnail_url,
          ];
          const url =
            candidates
              .map((item) => String(item || "").trim())
              .find(isWorkflowChatAttachmentUrl) || "";
          if (!url) return null;
          const kind =
            node.kind === "image" ||
            node.kind === "video" ||
            node.kind === "audio"
              ? node.kind
              : /\.(?:png|jpe?g|webp|gif|svg|avif|bmp)(?:[?#].*)?$/i.test(url)
                ? "image"
                : /\.(?:mp4|mov|webm|mkv|avi|m4v|ogv|wmv)(?:[?#].*)?$/i.test(
                      url,
                    )
                  ? "video"
                  : /\.(?:mp3|wav|m4a|ogg|flac|aac)(?:[?#].*)?$/i.test(url)
                    ? "audio"
                    : "";
          if (!kind) return null;
          const title = String(data.title || data.name || "").trim();
          const fallbackName = (() => {
            try {
              return decodeURIComponent(
                new URL(url, window.location.href).pathname.split("/").pop() ||
                  "",
              );
            } catch {
              return "";
            }
          })();
          return {
            name: title || fallbackName || `${kind}-${node.id}`,
            path: url,
            url,
            mediaKind: kind,
            type:
              kind === "image"
                ? "image/*"
                : kind === "video"
                  ? "video/*"
                  : "audio/*",
            nodeId: node.id,
            platformFileId:
              Number(data.workflowPlatformFileId || 0) || undefined,
            platformFileUrl:
              String(data.workflowPlatformFileUrl || "").trim() || undefined,
            seedanceAssetId:
              String(data.workflowSeedanceAssetId || "").trim() || undefined,
            seedanceAssetUrl:
              String(data.workflowSeedanceAssetUrl || "").trim() || undefined,
            seedanceAssetStatus:
              String(data.workflowSeedanceAssetStatus || "").trim() ||
              undefined,
            seedanceAssetCategory:
              String(data.workflowSeedanceAssetCategory || "").trim() ||
              undefined,
            portraitCompliantExempt:
              String(data.workflowSeedanceAssetStatus || "").trim() ===
              "Skipped",
            naturalWidth:
              Number(data.workflowMediaNaturalWidth || 0) || undefined,
            naturalHeight:
              Number(data.workflowMediaNaturalHeight || 0) || undefined,
          } satisfies WorkflowChatAttachmentPayload;
        })
        .filter((file): file is NonNullable<typeof file> => Boolean(file));

      if (!files.length) {
        message.warning("当前选择没有可发送到聊天的图片、视频或音频素材");
        return;
      }

      try {
        await requestWorkflowChatAttachments(files);
      } catch (error) {
        message.error(
          error instanceof Error ? error.message : "发送到聊天失败",
        );
      }
    },
    [nodes, selectedWorkflowIds],
  );

  useEffect(() => {
    if (activeThreeDWorldNodeId && !activeThreeDWorldNode)
      setActiveThreeDWorldNodeId(null);
  }, [activeThreeDWorldNode, activeThreeDWorldNodeId]);

  useEffect(() => {
    const unsubscribe = useCanvasStore.subscribe((state, previousState) => {
      if (state.layers === previousState.layers) return;
      const currentLayerIds = new Set(state.layers.map((layer) => layer.id));
      workflowChatLayerSyncRef.current.forEach((record, layerId) => {
        if (!currentLayerIds.has(layerId) && !record.completed) {
          workflowChatLayerSyncRef.current.delete(layerId);
          const slotKey = getWorkflowChatPlaceholderSlotKey(
            record.batchKey,
            record.batchIndex,
          );
          if (
            workflowChatPlaceholderSlotsRef.current.get(slotKey) ===
            record.workflowNodeId
          ) {
            workflowChatPlaceholderSlotsRef.current.delete(slotKey);
          }
        }
      });

      state.layers.forEach((layer) => {
        if (!isWorkflowChatGeneratedLayer(layer)) return;
        const kind = getWorkflowChatLayerMediaKind(layer);
        if (!kind) return;
        const prompt = String(layer.genPrompt || "").trim();
        const resultUrl = getWorkflowChatLayerResultUrl(layer, kind);
        const isGenerating = isWorkflowChatGeneratingLayer(layer);
        if (!isGenerating && !resultUrl) return;
        const layerGenerationTaskId = String(
          (layer as any).genTaskId || "",
        ).trim();
        const layerGenerationTaskType = String(
          (layer as any).genTaskType || "",
        ).trim();
        const layerGenerationProviderKey = String(
          (layer as any).genProviderKey || "",
        ).trim();
        const layerGenerationStatusUrl = String(
          (layer as any).genStatusUrl || "",
        ).trim();
        const layerGenerationBackgroundTaskId = String(
          (layer as any).genBackgroundTaskId || "",
        ).trim();

        let record = workflowChatLayerSyncRef.current.get(layer.id);
        if (record?.completed && resultUrl) return;
        if (!record) {
          const frame = getWorkflowChatPlaceholderFrame(layer, kind);
          const batch = getWorkflowChatPlaceholderBatch(layer, kind, frame);
          const explicitBatchIndex = Number(layer.genBatchIndex);
          const batchIndex =
            Number.isInteger(explicitBatchIndex) && explicitBatchIndex >= 0
              ? explicitBatchIndex
              : batch.count;
          const slotKey = getWorkflowChatPlaceholderSlotKey(
            batch.key,
            batchIndex,
          );
          const existingWorkflowNodeId =
            workflowChatPlaceholderSlotsRef.current.get(slotKey);
          if (existingWorkflowNodeId) {
            const existingWorkflowNode = useCanvasStore
              .getState()
              .libtvWorkflow.nodes.find(
                (node) => node.id === existingWorkflowNodeId,
              );
            record = {
              workflowNodeId: existingWorkflowNodeId,
              kind,
              batchKey: batch.key,
              batchIndex,
              completed: false,
              rect: {
                x: Number(existingWorkflowNode?.x || 0),
                y: Number(existingWorkflowNode?.y || 0),
                width: Math.max(
                  1,
                  Number(existingWorkflowNode?.width || frame.width),
                ),
                height: Math.max(
                  1,
                  Number(existingWorkflowNode?.height || frame.height),
                ),
              },
            };
            workflowChatLayerSyncRef.current.set(layer.id, record);
          }
        }
        if (!record) {
          const frame = getWorkflowChatPlaceholderFrame(layer, kind);
          const batch = getWorkflowChatPlaceholderBatch(layer, kind, frame);
          const existingWorkflowNodeIds = new Set(
            Array.from(workflowChatLayerSyncRef.current.values()).map(
              (item) => item.workflowNodeId,
            ),
          );
          const obstacles = useCanvasStore
            .getState()
            .libtvWorkflow.nodes.filter(
              (node) => !existingWorkflowNodeIds.has(node.id),
            )
            .map(getWorkflowNodeObstacleRect);
          workflowChatLayerSyncRef.current.forEach((item) => {
            obstacles.push(item.rect);
          });
          const position = allocateWorkflowChatPlaceholderPosition({
            batch,
            width: frame.width,
            height: frame.height,
            obstacles,
          });
          const node = addWorkflowNode(kind, position);
          record = {
            workflowNodeId: node.id,
            kind,
            batchKey: batch.key,
            batchIndex:
              Number.isInteger(Number(layer.genBatchIndex)) &&
              Number(layer.genBatchIndex) >= 0
                ? Number(layer.genBatchIndex)
                : Math.max(0, batch.count - 1),
            completed: false,
            rect: {
              x: position.x,
              y: position.y,
              width: frame.width,
              height: frame.height,
            },
          };
          workflowChatLayerSyncRef.current.set(layer.id, record);
          workflowChatPlaceholderSlotsRef.current.set(
            getWorkflowChatPlaceholderSlotKey(
              record.batchKey,
              record.batchIndex,
            ),
            record.workflowNodeId,
          );
          moveWorkflowNode(node.id, {
            x: position.x,
            y: position.y,
            width: frame.width,
            height: frame.height,
          });
          if (batch.panTarget) {
            panWorkflowToRect({
              flow: flowRef.current,
              container: containerRef.current,
              rect: {
                x: position.x,
                y: position.y,
                width: frame.width,
                height: frame.height,
              },
            });
          }
          updateWorkflowNode(node.id, {
            title:
              String(
                layer.name || (kind === "video" ? "AI 视频" : "AI 图片"),
              ).trim() || (kind === "video" ? "AI 视频" : "AI 图片"),
            content: "",
            prompt,
            modelId: String(layer.genModel || "").trim(),
            mediaUrl: "",
            mediaRole: "ordinary",
            note: isGenerating
              ? String(
                  layer.genStatusLabel ||
                    (kind === "video" ? "视频生成中" : "图片生成中"),
                ).trim()
              : "",
            workflowGenerationRunning: isGenerating,
            workflowGenerationProgress: 0,
            workflowGenerationError: "",
            workflowGenerationTaskId: layerGenerationTaskId || undefined,
            workflowGenerationTaskType: layerGenerationTaskType || undefined,
            workflowGenerationProviderKey:
              layerGenerationProviderKey || undefined,
            workflowGenerationStatusUrl: layerGenerationStatusUrl || undefined,
            workflowGenerationBackgroundTaskId:
              layerGenerationBackgroundTaskId || undefined,
            suppressGenerationBar: true,
          });
          selectLayer(node.id);
          setActiveWorkflowNode(node.id);
        }

        if (layer.genStatus === "failed") {
          updateWorkflowNode(record.workflowNodeId, {
            note: "生成失败",
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "生成失败",
            suppressGenerationBar: false,
          });
          return;
        }

        if (isGenerating && !resultUrl) {
          updateWorkflowNode(record.workflowNodeId, {
            title:
              String(
                layer.name ||
                  (kind === "video" ? "AI 视频生成中" : "AI 图片生成中"),
              ).trim() ||
              (kind === "video" ? "AI 视频生成中" : "AI 图片生成中"),
            note: String(
              layer.genStatusLabel ||
                (kind === "video" ? "视频生成中" : "图片生成中"),
            ).trim(),
            prompt,
            modelId: String(layer.genModel || "").trim(),
            workflowGenerationRunning: true,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            workflowGenerationTaskId: layerGenerationTaskId || undefined,
            workflowGenerationTaskType: layerGenerationTaskType || undefined,
            workflowGenerationProviderKey:
              layerGenerationProviderKey || undefined,
            workflowGenerationStatusUrl: layerGenerationStatusUrl || undefined,
            workflowGenerationBackgroundTaskId:
              layerGenerationBackgroundTaskId || undefined,
            suppressGenerationBar: true,
          });
          return;
        }

        if (!resultUrl) return;
        const title =
          String(
            layer.name || (kind === "video" ? "AI 视频" : "AI 图片"),
          ).trim() || (kind === "video" ? "AI 视频" : "AI 图片");
        updateWorkflowNode(record.workflowNodeId, {
          title,
          prompt,
          modelId: String(layer.genModel || "").trim(),
          mediaUrl: resultUrl,
          mediaRole: "ordinary",
          note: "",
          workflowGenerationRunning: false,
          workflowGenerationProgress: undefined,
          workflowGenerationError: "",
          suppressGenerationBar: false,
        });
        record.completed = true;
        if (kind === "image") {
          applyWorkflowImageUrlNodeFrame(
            moveWorkflowNode,
            record.workflowNodeId,
            resultUrl,
            undefined,
            (size) => {
              updateWorkflowNode(
                record!.workflowNodeId,
                getWorkflowMediaNaturalSizePatch(size),
              );
            },
            () => shouldApplyAutoMediaFrame(record.workflowNodeId, resultUrl),
          );
        } else {
          applyWorkflowVideoUrlNodeFrame(
            moveWorkflowNode,
            record.workflowNodeId,
            resultUrl,
            undefined,
            (metadata) => {
              updateWorkflowNode(record!.workflowNodeId, {
                ...getWorkflowMediaNaturalSizePatch(metadata),
                ...(Number(metadata.duration || 0) > 0
                  ? {
                      workflowStoryboardDuration: `${Math.round(Number(metadata.duration))}s`,
                    }
                  : {}),
              });
            },
          );
        }
      });
    });
    return unsubscribe;
  }, [
    addWorkflowNode,
    getNextNodePosition,
    moveWorkflowNode,
    selectLayer,
    setActiveWorkflowNode,
    updateWorkflowNode,
  ]);

  useEffect(() => {
    if (readOnly) return;
    const consumeWorkflowShortcutEvent = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handleWorkflowKeyDown = (event: KeyboardEvent) => {
      if (isWorkflowShortcutEditableTarget(event.target)) return;

      const target = event.target as Node | null;
      const isDocumentTarget =
        target === document.body || target === document.documentElement;
      if (
        target &&
        !isDocumentTarget &&
        containerRef.current &&
        !containerRef.current.contains(target)
      )
        return;

      const key = event.key;
      const lowerKey = key.toLowerCase();
      const commandKey = event.metaKey || event.ctrlKey;

      if (key === "Escape") {
        if (shortcutsOpen) {
          event.preventDefault();
          setShortcutsOpen(false);
        }
        return;
      }

      if (shortcutsOpen || playlistIntroOpen || threeDIntroOpen) {
        return;
      }

      if (isWorkflowClipboardTargetEditable(event.target)) {
        return;
      }

      if (
        event.altKey &&
        event.shiftKey &&
        lowerKey === "f" &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        handleFitView();
        return;
      }

      if (!commandKey) {
        if (key === "Backspace" || key === "Delete") {
          if (selectedWorkflowIds.length === 0) return;
          consumeWorkflowShortcutEvent(event);
          requestDeleteWorkflowNodes(selectedWorkflowIds);
        }
        return;
      }

      if (lowerKey === "z") {
        consumeWorkflowShortcutEvent(event);
        if (event.shiftKey) {
          redoHistory();
        } else {
          undoHistory();
        }
        return;
      }

      if (lowerKey === "a") {
        consumeWorkflowShortcutEvent(event);
        const nodeIds = nodes.map((node) => node.id);
        setWorkflowSelectedIds(nodeIds);
        setActiveWorkflowNode(nodeIds.length === 1 ? nodeIds[0] : null);
        return;
      }

      if (lowerKey === "g") {
        consumeWorkflowShortcutEvent(event);
        if (event.altKey) {
          if (selectedWorkflowIds.length > 1) {
            handleGroupWorkflowNodes(selectedWorkflowIds, {
              mode: "storyboard",
            });
          } else {
            message.warning("请选择至少 2 个节点合并分镜组");
          }
        } else if (event.shiftKey) {
          selectedWorkflowIds.forEach((id) => {
            const node = nodes.find((item) => item.id === id);
            if (node?.kind === "group") ungroupWorkflowNode(id);
          });
        } else if (selectedWorkflowIds.length > 1) {
          handleGroupWorkflowNodes(selectedWorkflowIds);
        }
        return;
      }

      if (lowerKey === "c") {
        if (selectedWorkflowIds.length !== 1) return;
        consumeWorkflowShortcutEvent(event);
        handleCopyNode(selectedWorkflowIds[0]);
        return;
      }

      if (lowerKey === "d") {
        if (selectedWorkflowIds.length === 0) return;
        consumeWorkflowShortcutEvent(event);
        handleDuplicateWorkflowSelection(selectedWorkflowIds);
        return;
      }

      if (lowerKey === "l") {
        consumeWorkflowShortcutEvent(event);
        if (selectedWorkflowIds.length !== 2) {
          message.info("请选择 2 个节点后按快捷键连线");
          return;
        }
        const selectedNodes = selectedWorkflowIds
          .map((id) => nodes.find((node) => node.id === id))
          .filter(Boolean) as LibTvWorkflowNode[];
        const orderedNodes = selectedNodes.sort(
          (a, b) =>
            Number(a.x || 0) - Number(b.x || 0) ||
            Number(a.y || 0) - Number(b.y || 0),
        );
        handleConnectNodes(orderedNodes[0].id, orderedNodes[1].id);
        return;
      }

      if (key === "Enter") {
        consumeWorkflowShortcutEvent(event);
        const runnableNodes = selectedWorkflowIds
          .map((id) => nodes.find((node) => node.id === id))
          .filter(Boolean) as LibTvWorkflowNode[];
        if (runnableNodes.length === 0) {
          message.info("请选择要生成的节点");
          return;
        }
        runnableNodes.forEach((node) => {
          if (node.kind === "group") {
            handleRunWorkflowGroup(node.id);
          } else {
            void handleGenerateWorkflowNode(node.id);
          }
        });
        return;
      }

      if (key === "0") {
        consumeWorkflowShortcutEvent(event);
        handleFitView();
        return;
      }

      if (key === "-" || key === "_") {
        consumeWorkflowShortcutEvent(event);
        handleZoomTo(viewportZoom / 1.2);
        return;
      }

      if (key === "+" || key === "=") {
        consumeWorkflowShortcutEvent(event);
        handleZoomTo(viewportZoom * 1.2);
      }
    };

    window.addEventListener("keydown", handleWorkflowKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleWorkflowKeyDown, true);
    };
  }, [
    handleCopyNode,
    handleConnectNodes,
    handleDuplicateWorkflowSelection,
    handleFitView,
    handleGenerateWorkflowNode,
    handleGroupWorkflowNodes,
    handleRunWorkflowGroup,
    handleZoomTo,
    nodes,
    playlistIntroOpen,
    readOnly,
    redoHistory,
    requestDeleteWorkflowNodes,
    selectedWorkflowIds,
    setActiveWorkflowNode,
    setWorkflowSelectedIds,
    shortcutsOpen,
    threeDIntroOpen,
    undoHistory,
    ungroupWorkflowNode,
    viewportZoom,
  ]);

  return (
    <>
      <div
        ref={containerRef}
        data-canvas-container="true"
        className={`relative h-full min-w-0 flex-1 overflow-hidden [contain:paint] ${workflowCanvasTheme === "light" ? "canvas-light bg-[#f5f5f5] text-[#262626]" : "bg-black text-white"}`}
        style={
          {
            color: workflowCanvasTheme === "light" ? "#262626" : "#f7f7f7",
            fontFamily:
              '-apple-system, system-ui, "PingFang SC", Inter, "Noto Sans SC", "Microsoft YaHei", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
            lineHeight: 1.55,
            "--radius": "8px",
            "--radius-sm": "4px",
            "--radius-md": "6px",
            "--radius-lg": "8px",
            "--radius-xl": "12px",
            "--color-neutral-50": "#f7f7f7",
            "--color-neutral-800": "#363636",
          } as React.CSSProperties
        }
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <WorkflowPersistenceEffects
          libtvCanvases={workflowCanvases}
          activeLibTvCanvasId={activeWorkflowCanvasId}
          autosaveReady={!projectId || hydratedWorkflowProjectId === projectId}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.csv,text/csv"
          className="hidden"
          onChange={handleUploadChange}
        />

        <div
          data-workflow-surface-layer="true"
          className="pointer-events-auto absolute inset-0"
        >
          <LibTvWorkflowSurface
            projectId={projectId || undefined}
            nodes={nodes}
            edges={edges}
            selectedIds={selectedWorkflowIds}
            zoom={workflowViewport.zoom}
            stagePos={{ x: workflowViewport.x, y: workflowViewport.y }}
            tool="select"
            isDragging={false}
            standalone
            readOnly={readOnly}
            edgesVisible={workflowEdgesVisible}
            snapToGrid={workflowSnapToGrid}
            onSelectNode={handleSelectNode}
            onMoveNode={moveWorkflowNode}
            onMoveNodes={moveWorkflowNodes}
            onUpdateNode={updateWorkflowNode}
            onCreateScriptInputNode={handleCreateScriptInputNode}
            onAddLinkedNode={handleAddLinkedNode}
            onImportScriptV2Assets={handleImportScriptV2Assets}
            onRunTextGeneratorPreset={handleRunTextGeneratorPreset}
            onRunVideoGeneratorPreset={handleRunVideoGeneratorPreset}
            onRunImageToolbarPreset={handleRunImageToolbarPreset}
            onCreateAngleEditNode={handleCreateAngleEditNode}
            onCreatePortraitTexturePreset={handleCreatePortraitTexturePreset}
            onCreateEmotionAdjustmentPreset={
              handleCreateEmotionAdjustmentPreset
            }
            onReferenceFilesUploaded={handleReferenceFilesUploaded}
            onCreateImageUpscalePreset={handleCreateImageUpscalePreset}
            onImageUpscalePresetFilesUploaded={
              handleImageUpscalePresetFilesUploaded
            }
            onReferenceNodeRemoved={handleReferenceNodeRemoved}
            onGenerateNode={handleGenerateWorkflowNode}
            onOpenThreeDWorld={(id) => setActiveThreeDWorldNodeId(id)}
            onOpenDirectorConsole3D={(id) => setActiveWorkflowNode(id)}
            onCreateDirectorConsoleCaptureNode={
              handleCreateDirectorConsoleCaptureNode
            }
            onCreateDirectorConsoleVideoNode={
              handleCreateDirectorConsoleVideoNode
            }
            onGenerateStoryboard={(id, request) => {
              void handleGenerateStoryboardFromScript(id, request);
            }}
            onRegenerateStoryboardImages={(id) => {
              void handleRegenerateStoryboardImages(id);
            }}
            onGenerateStoryboardVideos={(id, request) => {
              void handleGenerateStoryboardVideos(id, request);
            }}
            onConnectNodes={handleConnectNodes}
            onDisconnectEdge={handleDisconnectWorkflowEdge}
            onSaveNodeToMaterials={handleSaveNodeToMaterials}
            onCopyNode={handleCopyNode}
            onDuplicateNode={handleDuplicateNode}
            onDeleteNode={handleDeleteNode}
            onDownloadNode={handleDownloadNodeOriginal}
            onCopyNodeMedia={handleCopyNodeMedia}
            onSendNodeToChat={handleSendNodeToCodexChat}
            onCopyNodeToClipboard={handleCopyNodeToClipboard}
            onCreateSubjectFromNode={handleCreateSubjectFromNode}
            onRunSeedanceComplianceCheck={handleRunSeedanceComplianceCheck}
            onEnterPanoramaPreview={handleEnterPanoramaPreview}
            onOptimizeWorkflowLayout={handleOptimizeWorkflowLayout}
            onCopyNodeTaskId={handleCopyNodeTaskId}
            onVerifyGenerationResult={handleVerifyGenerationResult}
            onReportNodeIssue={handleReportNodeIssue}
            onCreatePlaylistFromSelection={handleCreatePlaylistFromSelection}
            onCreateNodeFromSelection={handleCreateNodeFromSelection}
            onCreateAnnotatedImageNode={handleCreateAnnotatedImageNode}
            onRemoveBackgroundNode={handleRemoveBackgroundNode}
            onSplitImageNode={handleSplitImageNode}
            onRotateImageNode={handleRotateImageNode}
            onExpandImageNode={handleExpandImageNode}
            onUpscaleImageNode={handleUpscaleImageNode}
            onSubmitImageUpscaleNode={handleSubmitImageUpscaleNode}
            onCreateVideoUpscaleNode={handleCreateVideoUpscaleNode}
            onSubmitVideoUpscaleNode={handleSubmitVideoUpscaleNode}
            onCropVideoNode={handleCropVideoNode}
            onAnalyzeVideoNode={handleAnalyzeVideoNode}
            onSeparateVideoAudioNode={handleSeparateVideoAudioNode}
            onRemoveVideoSubtitlesNode={handleRemoveVideoSubtitlesNode}
            onPaneUpload={handleUploadClick}
            onPaneAddAsset={() => openMaterialManager("materials")}
            onPaneAddNode={handlePaneAddNode}
            onPaneUndo={undoHistory}
            onPaneRedo={redoHistory}
            onPanePaste={(position) => {
              void handlePanePaste(position);
            }}
            onPaneFilesDrop={handlePaneFilesDrop}
            onMediaFileReplace={handleMediaFileReplace}
            onSelectionChange={handleWorkflowSelectionChange}
            onGroupNodes={handleGroupWorkflowNodes}
            onUngroupNode={handleUngroupWorkflowNode}
            onConvertGroupToStoryboard={handleConvertGroupToStoryboard}
            onRunGroup={handleRunWorkflowGroup}
            onTrimVideoNode={handleTrimVideoNode}
            onInit={handleWorkflowSurfaceInit}
            onViewportChange={handleViewportChange}
            onPaneClick={handlePaneClick}
          />

          {nodes.length === 0 ? (
            <WorkflowEmptyState onCreateStarter={handleCreateEmptyStarter} />
          ) : null}
        </div>
        {!readOnly ? (
          <WorkflowTopBar
            workflowCanvases={workflowCanvases.map((canvas) => ({
              id: canvas.id,
              name: canvas.name,
            }))}
            activeWorkflowCanvasId={activeWorkflowCanvasId}
            onCreateWorkflowCanvas={handleCreateWorkflowCanvas}
            onSwitchWorkflowCanvas={handleSwitchWorkflowCanvas}
          />
        ) : null}
        {!readOnly ? (
          <WorkflowSidebarControls
            onAddNode={handleAddNode}
            onUpload={handleUploadClick}
            onOpenShortcuts={() => {
              setCodexSkillLibraryOpen(false);
              setCharacterLibraryOpen(false);
              setShortcutsOpen(true);
            }}
            onOpenSkillLibrary={() => {
              setShortcutsOpen(false);
              setCharacterLibraryOpen(false);
              setCodexSkillLibraryOpen(true);
            }}
            onOpenCharacterLibrary={() => {
              if (materialManagerOpen) closeMaterialManager();
              setCodexSkillLibraryOpen(false);
              setShortcutsOpen(false);
              setWorkflowAssetDrawerOpen(false);
              setCharacterLibraryOpen(true);
            }}
            onOpenStyleLibrary={() => setAssetMarketplaceType("style")}
            onOpenEffectLibrary={() => setAssetMarketplaceType("effect")}
            onOpenHistory={() => setHistoryOpen(true)}
          />
        ) : null}
        {!readOnly ? (
          <WorkflowCodexSkillLibraryDialog
            open={codexSkillLibraryOpen}
            onClose={() => setCodexSkillLibraryOpen(false)}
            onUseSkill={(skill: WorkflowCodexSkill) => {
              window.dispatchEvent(
                new CustomEvent("zaomeng:codex:select-skill", {
                  detail: { ...skill, targetScope: "workflow" },
                }),
              );
              setCodexSkillLibraryOpen(false);
            }}
            onCreateSkill={(skillCreator: WorkflowCodexSkill) => {
              window.dispatchEvent(
                new CustomEvent("zaomeng:codex:create-skill", {
                  detail: { ...skillCreator, targetScope: "workflow" },
                }),
              );
              setCodexSkillLibraryOpen(false);
            }}
          />
        ) : null}
        {!readOnly ? (
          <WorkflowBottomControls
            nodes={nodes}
            zoom={viewportZoom}
            viewport={workflowViewport}
            viewportSize={workflowCanvasSize}
            onFitView={handleFitView}
            onZoomTo={handleZoomTo}
            onOpenAssetLibrary={() =>
              setWorkflowAssetDrawerOpen((open) => !open)
            }
            edgesVisible={workflowEdgesVisible}
            snapToGrid={workflowSnapToGrid}
            onToggleEdgesVisible={() =>
              setWorkflowEdgesVisible((visible) => !visible)
            }
            onToggleSnapToGrid={() =>
              setWorkflowSnapToGrid((enabled) => !enabled)
            }
            getNodeFrame={workflowNodeFrame}
          />
        ) : null}
        {!readOnly ? (
          <WorkflowCanvasAssetDrawer
            open={workflowAssetDrawerOpen}
            projectName={projectName || "未命名项目"}
            nodes={nodes}
            defaultTab="assets"
            onClose={() => setWorkflowAssetDrawerOpen(false)}
            onLocateNode={handleLocateWorkflowAssetNode}
          />
        ) : null}
        {!readOnly ? (
          <WorkflowShortcutPanel
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
          />
        ) : null}
        {!readOnly && assetMarketplaceType ? (
          <WorkflowAssetMarketplaceDialog
            open
            type={assetMarketplaceType}
            onClose={() => setAssetMarketplaceType(null)}
            onApply={(item) => {
              const url = String(
                item.coverImageUrl || item.hoverImageUrl || "",
              ).trim();
              if (!url) {
                message.warning("该风格素材没有可用图片");
                return;
              }
              handleInsertWorkflowAsset({
                kind: "image",
                title: String(item.title || "").trim() || "风格素材",
                url,
                thumbnailUrl: url,
                prompt: String(item.description || "").trim(),
                content: String(
                  item.shortDescription || item.description || "",
                ).trim(),
                referenceImages: [url],
              });
            }}
          />
        ) : null}
        {!readOnly ? (
          <WorkflowCharacterLibraryDialog
            open={characterLibraryOpen}
            theme={workflowCanvasTheme}
            onClose={() => setCharacterLibraryOpen(false)}
            onApply={handleApplyCharacterLibraryItem}
          />
        ) : null}
        {!readOnly ? (
          <WorkflowHistoryDialog
            open={historyOpen}
            projectId={projectId}
            canvasId={workflowCanvasId}
            onClose={() => setHistoryOpen(false)}
            onUseFile={handleUseWorkflowHistoryFile}
          />
        ) : null}
        {!readOnly ? (
          <WorkflowPublishDialog
            open={publishOpen}
            projectName={projectName || "未命名"}
            publicUrl={publishedWorkflowUrl}
            publishing={publishingWorkflow}
            onClose={() => setPublishOpen(false)}
            onPublish={handlePublishWorkflowProject}
          />
        ) : null}
        {!readOnly && materialManagerOpen ? (
          <MaterialManagerPanel
            mode="workflow"
            onInsertWorkflowAsset={handleInsertWorkflowAsset}
          />
        ) : null}
        {!readOnly && materialSaveDialogOpen ? <SaveMaterialDialog /> : null}

        <Dialog
          open={pendingDeleteNodeIds.length > 0}
          onOpenChange={(open) => {
            if (!open) cancelDeleteWorkflowNodes();
          }}
        >
          <DialogContent
            hideCloseButton
            overlayClassName="backdrop-blur-[4px] !bg-black/45"
            className="w-auto max-w-none gap-0 border-0 bg-transparent p-0 text-white shadow-none"
          >
            <div className="w-[min(344px,calc(100vw-32px))] rounded-xl border border-[#363636] bg-[#262626] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.42)]">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <DialogTitle className="text-fg-default text-sm font-bold">
                    删除节点
                  </DialogTitle>
                </div>
                <DialogDescription className="sr-only">
                  删除节点前确认提示。
                </DialogDescription>
                <div className="text-fg-muted cursor-text select-text text-[13px]">
                  {pendingDeleteNodeIds.length > 1
                    ? "这些节点可能包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？"
                    : "该节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？"}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="text-fg-default bg-canvas-controls-hover hover:bg-canvas-controls-active h-8 cursor-pointer rounded-lg px-3 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={cancelDeleteWorkflowNodes}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="flex h-8 cursor-pointer items-center rounded-lg bg-[#F7F7F7] px-3 text-[13px] text-[#171717] transition-colors hover:bg-white active:bg-[#F7F7F7]/90 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={confirmDeleteWorkflowNodes}
                >
                  确定删除
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <PlaylistIntroDialog
          open={playlistIntroOpen}
          dontShowAgain={playlistIntroDontShowAgain}
          onDontShowAgainChange={setPlaylistIntroDontShowAgain}
          onClose={() => {
            setPlaylistIntroOpen(false);
            setPendingPlaylistCreation(null);
          }}
          onContinue={handleContinuePlaylistIntro}
        />
        <ThreeDIntroDialog
          open={threeDIntroOpen}
          dontShowAgain={threeDIntroDontShowAgain}
          onDontShowAgainChange={setThreeDIntroDontShowAgain}
          onClose={() => {
            setThreeDIntroOpen(false);
            setPendingThreeDCreation(null);
          }}
          onContinue={handleContinueThreeDIntro}
        />

        {uploading ? (
          <div className="absolute left-1/2 top-6 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#222225]/95 px-4 py-2 text-sm font-medium text-white/78 shadow-[0_12px_28px_rgba(0,0,0,0.25)]">
            正在上传资源...
          </div>
        ) : null}

        {activeThreeDWorldNode ? (
          <ThreeDWorldOverlay
            node={activeThreeDWorldNode}
            onClose={() => setActiveThreeDWorldNodeId(null)}
            onDownload={handleDownloadNodeOriginal}
            onAddCapturedImages={(files) =>
              createWorkflowMediaNodesFromFiles(files)
            }
            onSubmitWorldEdit={handleSubmitThreeDWorldEdit}
          />
        ) : null}
      </div>
      {!readOnly ? (
        <CodexSupportWidget
          label="聊天"
          scope="workflow"
          launcherIcon="director"
          workflowProjectId={projectId}
          canvasSessionId={codexCanvasSessionId}
        />
      ) : null}
    </>
  );
}
