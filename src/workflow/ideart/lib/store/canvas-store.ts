import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import {
  getClosestGeminiAspectRatio,
  getGeminiResolution,
  isGeminiAspectRatioKey,
  type GeminiAspectRatioKey,
} from "@/workflow/ideart/lib/models/gemini-image-config";
import { fetchSSE } from "@/workflow/ideart/lib/api/chat-sse";
import { loadWorkflowModels } from "@/workflow/ideart/lib/wavespeed/workflow-runtime";
import { DEFAULT_CANVAS_OPEN_ZOOM } from "@/workflow/ideart/lib/constants/editor-layout";
import { fitCanvasMediaDisplaySize } from "@/workflow/ideart/lib/utils/canvas-display-size";
import { ModelType } from "@/workflow/ideart/lib/models/types";
import { useAgentStore } from "@/workflow/ideart/lib/store/agent-store";
import { fitLayersToViewport } from "@/workflow/ideart/lib/editor/canvas-camera";
import { normalizeRenderableImageUrl } from "@/workflow/ideart/lib/url/image-proxy-policy";
import {
  EMPTY_LIBTV_WORKFLOW_STATE,
  createLibTvWorkflowNode,
  normalizeLibTvWorkflowState,
  type LibTvWorkflowEdge,
  type LibTvWorkflowNode,
  type LibTvWorkflowNodeData,
  type LibTvWorkflowNodeKind,
  type LibTvWorkflowPlaylistItem,
  type LibTvWorkflowRunResult,
  type LibTvWorkflowState,
} from "@/workflow/ideart/lib/libtv/workflow";
import type { LibTvStoryboardScriptResult } from "@/workflow/ideart/lib/libtv/script";
import {
  isLibTvWorkflowBackgroundAudioMode,
  resolveLibTvWorkflowPlaylistOutputNodes,
} from "@/workflow/ideart/lib/libtv/workflow-playlist-runtime";
import {
  LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
  LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
  LIBTV_TAPNOW_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_GENERATOR_WIDTH,
  LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
  LIBTV_TAPNOW_SCRIPT_HEIGHT,
  LIBTV_TAPNOW_SCRIPT_WIDTH,
  LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_VIDEO_HEIGHT,
  LIBTV_TAPNOW_VIDEO_WIDTH,
  canvasLayerToLibTvWorkflowNode,
  createLibTvLayerDraft,
  getLibTvComponentType,
  getLibTvDefaultNodeConfig,
} from "@/workflow/ideart/lib/libtv/layer";
import {
  getLibTvWorkflowGroupBounds,
  isLibTvWorkflowGroupLayer,
} from "@/workflow/ideart/lib/libtv/grouped-workflow";
import {
  buildSeedanceVideoRequestPatch,
  isSeedanceVideoModelId,
} from "@/workflow/ideart/lib/video/seedance-request";
import {
  buildKlingV3OmniRequestPatch,
  isKlingV3OmniVideoModelId,
} from "@/workflow/ideart/lib/video/kling-omni-request";
import {
  buildKlingV3RequestPatch,
  isKlingV3VideoModelId,
} from "@/workflow/ideart/lib/video/kling-v3-request";
import {
  buildOmniFlashExtRequestPatch,
  isOmniFlashExtVideoModelId,
} from "@/workflow/ideart/lib/video/omni-flash-ext-request";
import {
  buildSkyReelsV4RequestPatch,
  isSkyReelsV4ApimartVideoModelId,
} from "@/workflow/ideart/lib/video/skyreels-v4-request";
import {
  buildVeo3VideoRequestPatch,
  isApimartVeo3VideoModelId,
} from "@/workflow/ideart/lib/video/veo3-request";
import {
  isOfficialSeedanceTaskContext,
  queryUnifiedVideoTaskStatus,
  resolveProviderVideoPollIntervalMs,
  resolveUnifiedProviderTaskType,
} from "@/workflow/ideart/lib/utils/video-task-polling";
import { waitForQuickEditImageTask } from "@/workflow/ideart/components/editor/quick-edit-task-polling";
import {
  buildProviderTaskStatusUrl,
  readProviderKeyFromTaskStatusUrl,
} from "@/workflow/ideart/lib/generation/provider-status-url";
import { toVideoDisplayUrl } from "@/workflow/ideart/components/editor/utils/video-proxy";
import { LOVART_FONT_OPTIONS } from "@/workflow/ideart/lib/lovart-font-list";
import {
  buildLovartRenderFontFamily,
  ensureLovartFontLoaded,
  ensureLovartFontUrlLoaded,
  resolveLovartLayerSeparationFontName,
} from "@/workflow/ideart/lib/lovart-font-loader";
import { assertStrictExplodeResponse } from "@/workflow/ideart/lib/layer-separation/strict-explode-response";
import {
  collapseLegacyTextRasterFallbackLayers,
  withInvalidatedTextRasterFallback,
} from "@/workflow/ideart/lib/layer-separation/text-raster-fallback";
import { resolveSeparatedTextGeometry } from "@/workflow/ideart/components/editor/layers/text-fill";

const CANVAS_BACKGROUND_PREFERENCE_STORAGE_KEY =
  "ideart:canvas-background-preference";
const LIBTV_DEFAULT_REFERENCE_IMAGE_URL =
  "/images/libtv/style-gallery-card.png";
const LIBTV_DEFAULT_SCRIPT_VIDEO_REFERENCE_URL =
  "/videos/libtv/reference-video.mp4";
const LIBTV_LEFT_LINK_GAP_PX = 240;
const LIBTV_WORKFLOW_SOFT_GROUP_PADDING = 44;
const LIBTV_WORKFLOW_IMAGE_RESULT_MAX_DISPLAY_SIZE = 622;

export type CanvasBackgroundPreference = "default" | "network_grid";

export type LibTvWorkflowNodeMovePatch = {
  id: string;
  position: Partial<{ x: number; y: number; width: number; height: number }>;
  data?: Partial<LibTvWorkflowNodeData>;
};

function parseLibTvWorkflowAspectRatioSize(
  value: string,
  fallbackWidth = 16,
  fallbackHeight = 9,
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

function getLibTvWorkflowMediaDisplayFrame(width: number, height: number) {
  const safeWidth = Math.max(1, Math.round(Number(width || 1)));
  const safeHeight = Math.max(1, Math.round(Number(height || 1)));
  const scale = Math.min(
    LIBTV_WORKFLOW_IMAGE_RESULT_MAX_DISPLAY_SIZE / safeWidth,
    LIBTV_WORKFLOW_IMAGE_RESULT_MAX_DISPLAY_SIZE / safeHeight,
    1,
  );
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function getLibTvWorkflowVideoResultDisplayFrame(
  node: Pick<LibTvWorkflowNode, "width" | "height" | "data">,
) {
  const naturalWidth = Number(node.data?.workflowMediaNaturalWidth || 0);
  const naturalHeight = Number(node.data?.workflowMediaNaturalHeight || 0);
  if (
    Number.isFinite(naturalWidth) &&
    Number.isFinite(naturalHeight) &&
    naturalWidth > 0 &&
    naturalHeight > 0
  ) {
    return getLibTvWorkflowMediaDisplayFrame(naturalWidth, naturalHeight);
  }
  const ratioSize = parseLibTvWorkflowAspectRatioSize(
    String(node.data?.aspectRatio || ""),
    16,
    9,
  );
  return getLibTvWorkflowMediaDisplayFrame(ratioSize.width, ratioSize.height);
}

function getLibTvWorkflowRenderedNodeFrame(
  node: Pick<LibTvWorkflowNode, "kind" | "width" | "height" | "data">,
) {
  const isVideoResult =
    node.kind === "video" && Boolean(String(node.data?.mediaUrl || "").trim());
  if (
    isVideoResult &&
    node.data?.workflowMediaUserResized !== true &&
    node.data?.workflowMediaFrameLocked !== true
  ) {
    return getLibTvWorkflowVideoResultDisplayFrame(node);
  }
  const defaultFrame = (() => {
    if (node.kind === "video" && node.data?.mediaRole !== "generator")
      return getLibTvWorkflowVideoResultDisplayFrame(node);
    if (node.kind === "video" || node.kind === "audio")
      return {
        width: LIBTV_TAPNOW_VIDEO_WIDTH,
        height: LIBTV_TAPNOW_VIDEO_HEIGHT,
      };
    if (node.kind === "script")
      return {
        width: LIBTV_TAPNOW_SCRIPT_WIDTH,
        height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
      };
    if (node.kind === "playlist") return { width: 350, height: 350 };
    if (node.kind === "threed")
      return { width: 375, height: LIBTV_TAPNOW_VIDEO_HEIGHT };
    if (node.kind === "director-console-3d")
      return {
        width: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
        height: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
      };
    if (node.kind === "image")
      return {
        width: LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
        height: LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
      };
    return {
      width: LIBTV_TAPNOW_GENERATOR_WIDTH,
      height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
    };
  })();
  return {
    width: Math.max(
      defaultFrame.width,
      Number(node.width || defaultFrame.width),
    ),
    height: Math.max(
      defaultFrame.height,
      Number(node.height || defaultFrame.height),
    ),
  };
}

function getLibTvWorkflowImageResultDisplayFrame(
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, Math.round(Number(width || 1)));
  const safeHeight = Math.max(1, Math.round(Number(height || 1)));
  const ratio = safeWidth / safeHeight;
  if (ratio >= 1) {
    const targetHeight = LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT;
    return {
      width: Math.min(
        LIBTV_WORKFLOW_IMAGE_RESULT_MAX_DISPLAY_SIZE,
        Math.max(
          LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
          Math.round(targetHeight * ratio),
        ),
      ),
      height: targetHeight,
    };
  }
  const targetWidth = LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH;
  return {
    width: targetWidth,
    height: Math.min(
      LIBTV_WORKFLOW_IMAGE_RESULT_MAX_DISPLAY_SIZE,
      Math.max(
        LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
        Math.round(targetWidth / ratio),
      ),
    ),
  };
}

function getLibTvVideoPosterUrl(value: unknown) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (!/\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(hostname)) return "";
  } catch {
    return "";
  }
  return `${url}${url.includes("?") ? "&" : "?"}x-oss-process=video/snapshot,t_0,f_jpg,w_1600,m_fast`;
}

type PendingCanvasLayerJobKind =
  | "remove-bg"
  | "edit-text"
  | "explode"
  | "upscale"
  | "image-generate"
  | "video"
  | "vectorize"
  | "expand"
  | "extend"
  | "erase";

type PendingCanvasLayerJob = {
  jobId: string;
  projectId: string;
  kind: PendingCanvasLayerJobKind;
  payload: Record<string, any>;
  attempts: number;
  createdAt: number;
  updatedAt: number;
};

type PendingCanvasJobExecutionOptions = {
  resumeJobId?: string;
  placeholderId?: string;
  existingTaskId?: string;
  existingTaskType?: string;
  existingProviderKey?: string;
  existingStatusUrl?: string;
  existingBackgroundTaskId?: string;
  existingOutputLayerId?: string;
  existingSourceLayerId?: string;
  existingBackendJobId?: string;
};

type CanvasBackendJobKind =
  | "remove_bg"
  | "vectorize"
  | "erase"
  | "outpaint"
  | "edit_text"
  | "explode"
  | "upscale"
  | "video_upscale"
  | "image_generate";

type CanvasBackendJobRecord = {
  id: string;
  status: "processing" | "success" | "failed";
  kind: CanvasBackendJobKind;
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

type RunCanvasImageGenerationJobParams = {
  projectId?: string | null;
  request: Record<string, any>;
  targetLayerIds: string[];
  targetLayerDrafts?: CanvasLayer[];
  onProgress?: (job: CanvasBackendJobRecord) => void;
};

function beginPendingCanvasLayerJob(
  projectId: string | null,
  _kind: PendingCanvasLayerJobKind,
  _payload: Record<string, any>,
  options?: { resumeJobId?: string },
): string {
  const normalizedProjectId = String(projectId || "").trim();
  const resumeJobId = String(options?.resumeJobId || "").trim();
  if (!normalizedProjectId) return resumeJobId;
  return resumeJobId || uuidv4();
}

const pendingCanvasRecoveryTimers = new Map<string, number>();
const activePendingCanvasRecoveryJobIds = new Set<string>();
const activePendingCanvasProviderTaskKeys = new Set<string>();
const pendingCanvasRecoveryBootstrappedProjects = new Set<string>();

function readCanvasBackgroundPreference(): CanvasBackgroundPreference {
  if (typeof window === "undefined" || !window.localStorage) return "default";
  const raw = String(
    window.localStorage.getItem(CANVAS_BACKGROUND_PREFERENCE_STORAGE_KEY) || "",
  ).trim();
  return raw === "network_grid" ? raw : "default";
}

function persistCanvasBackgroundPreference(
  preference: CanvasBackgroundPreference,
) {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(
    CANVAS_BACKGROUND_PREFERENCE_STORAGE_KEY,
    preference,
  );
}

// HMR-safe store creation for development
// This prevents the store from being reset during hot module replacement
declare global {
  interface Window {
    __CANVAS_STORE_CACHE__?: ReturnType<typeof createPhilartStore>;
  }
}

export type LayerType =
  | "rect"
  | "circle"
  | "text"
  | "image"
  | "video"
  | "path"
  | "gen_frame"
  | "video_gen_frame"
  | "smart_board"
  | "triangle"
  | "star"
  | "group";
export type LibTvNodeKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "script"
  | "script-v2"
  | "playlist"
  | "threed"
  | "director-console-3d";
export type LibTvComponentType =
  | "text-generator"
  | "text-editor"
  | "image-generator"
  | "storyboard-image"
  | "image-asset"
  | "image-reverse-prompt"
  | "video-generator"
  | "video-asset"
  | "audio-generator"
  | "audio-asset"
  | "playlist"
  | "threed"
  | "director-console-3d"
  | "script-generator"
  | "script-v2-generator"
  | "script-document";
export type UpscalePreset =
  | 2
  | 4
  | 8
  | "1K"
  | "2K"
  | "4K"
  | "8K"
  | "1k"
  | "2k"
  | "4k"
  | "8k";
export type MaterialManagerTab =
  | "materials"
  | "subjects"
  | "character-assets"
  | "scene-assets"
  | "prop-assets";
export type ActiveImageToolPanel =
  | null
  | "upscale"
  | "angle"
  | "adjust"
  | "expand";

export interface ProjectMaterialItem {
  id: string;
  name: string;
  src: string;
  thumbnailSrc?: string;
  coverSrc?: string;
  category?: string | null;
  width?: number;
  height?: number;
  createdAt: number;
  sourceLayerId?: string | null;
}

export interface PendingProjectMaterialSaveDraft {
  name?: string;
  src: string;
  thumbnailSrc?: string;
  coverSrc?: string;
  width?: number;
  height?: number;
  sourceLayerId?: string | null;
}

function normalizeProjectMaterialItem(
  item: Partial<ProjectMaterialItem> & {
    src?: string;
    id?: string;
    createdAt?: number;
  },
): ProjectMaterialItem | null {
  const normalizedSrc = String(item?.src || "").trim();
  if (!normalizedSrc) return null;

  return {
    id: String(item?.id || uuidv4()),
    name: String(item?.name || "未命名素材").trim() || "未命名素材",
    src: normalizedSrc,
    thumbnailSrc:
      typeof item?.thumbnailSrc === "string" &&
      item.thumbnailSrc.trim().length > 0
        ? item.thumbnailSrc.trim()
        : undefined,
    coverSrc:
      typeof item?.coverSrc === "string" && item.coverSrc.trim().length > 0
        ? item.coverSrc.trim()
        : undefined,
    category:
      typeof item?.category === "string" && item.category.trim().length > 0
        ? item.category.trim()
        : null,
    width: Number.isFinite(Number(item?.width))
      ? Number(item.width)
      : undefined,
    height: Number.isFinite(Number(item?.height))
      ? Number(item.height)
      : undefined,
    createdAt: Number.isFinite(Number(item?.createdAt))
      ? Number(item.createdAt)
      : Date.now(),
    sourceLayerId:
      typeof item?.sourceLayerId === "string" &&
      item.sourceLayerId.trim().length > 0
        ? item.sourceLayerId
        : null,
  };
}

function getLayerAabb(layer: {
  x: number;
  y: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
}) {
  const x = Number(layer.x || 0);
  const y = Number(layer.y || 0);
  const w = Math.max(0, Number(layer.width || 0));
  const h = Math.max(0, Number(layer.height || 0));
  const sx = Number.isFinite(Number(layer.scaleX)) ? Number(layer.scaleX) : 1;
  const sy = Number.isFinite(Number(layer.scaleY)) ? Number(layer.scaleY) : 1;
  const dx = w * sx;
  const dy = h * sy;
  const minX = x + Math.min(0, dx);
  const maxX = x + Math.max(0, dx);
  const minY = y + Math.min(0, dy);
  const maxY = y + Math.max(0, dy);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
    sx,
    sy,
    w,
    h,
  };
}

export interface CanvasAnnotation {
  id: string;
  type: "brush" | "rect" | "text";
  color: string;
  strokeWidth: number;
  text?: string;
  points?: Array<{ x: number; y: number }>;
  rect?: { x: number; y: number; width: number; height: number };
  previewUrl?: string;
  linkedRegionId?: string;
  note?: string;
}

export type LayerSeparationEditableMode =
  | "native_text"
  | "raster_fallback"
  | "raster_image"
  | "reference"
  | "hybrid";

export interface LayerSeparationProvenance {
  stage: string;
  provider?: string;
  model?: string;
  taskId?: string;
  generated?: boolean;
  sourceArtifactIds?: string[];
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface LayerSeparationWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
  recoverable: boolean;
  stage?: string;
  artifactId?: string;
  details?: Record<string, unknown>;
}

export interface LayerSeparationRasterFallback {
  imageUrl: string;
  visibleByDefault: boolean;
  editableTextVisibleByDefault: boolean;
  reason?: string;
  bbox?: [number, number, number, number];
}

/**
 * Editor-side presentation data for a hybrid separated text layer.
 *
 * The OCR raster crop is already axis-aligned and has its original stroke,
 * shadow and opacity baked into the pixels. Keep its parent-local placement
 * separate from the editable text transform so the two representations can
 * live behind one logical CanvasLayer without double-applying text effects.
 */
export interface CanvasTextRasterFallback {
  imageUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

export interface LayerSeparationMetadata {
  schemaVersion?: string;
  artifactId?: string;
  elementType?: string;
  confidence?: number;
  provenance: LayerSeparationProvenance[];
  warnings: LayerSeparationWarning[];
  editableMode?: LayerSeparationEditableMode;
  visibleByDefault?: boolean;
  maskUrl?: string;
  generatedMaskUrl?: string;
  bbox?: [number, number, number, number];
  maskBBox?: [number, number, number, number];
  generatedMaskBBox?: [number, number, number, number];
  polygon?: Array<[number, number]>;
  rasterFallback?: LayerSeparationRasterFallback;
}

export interface CanvasLayerMask {
  src: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  disabled?: boolean;
  feather?: number;
  invert?: boolean;
  positionRelativeToLayer?: boolean;
}

export interface CanvasLayer {
  id: string;
  type:
    | "rect"
    | "circle"
    | "image"
    | "text"
    | "video"
    | "triangle"
    | "star"
    | "group"
    | "gen_frame"
    | "video_gen_frame"
    | "smart_board"
    | "path";
  createdAt?: number;
  updatedAt?: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  fill?: string; // For solid color
  fillType?: "solid" | "gradient" | "pattern" | "image";
  fillGradientType?: "linear" | "radial";
  fillGradientStops?: Array<{ offset: number; color: string }>;
  fillGradientStart?: { x: number; y: number }; // Percentage 0-1 or Pixels? Usually relative to shape
  fillGradientEnd?: { x: number; y: number };
  fillPatternImage?: string; // URL
  fillPatternScale?: { x: number; y: number };
  fillPatternOffset?: { x: number; y: number };
  fillPatternRotation?: number;
  fillPatternRepeat?: "repeat" | "repeat-x" | "repeat-y" | "no-repeat";
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  blendMode?: string;
  rotation?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontFamilyLabel?: string;
  fontPostscriptName?: string;
  fontUrl?: string;
  src?: string; // For images
  scaleX?: number;
  scaleY?: number;
  points?: number[]; // For paths and triangles
  radius?: number; // For circles
  cornerRadius?: number; // For rounded rectangles/videos
  numPoints?: number; // For stars
  innerRadius?: number; // For stars
  outerRadius?: number; // For stars

  // Text Properties
  textAlign?: "left" | "center" | "right";
  fontStyle?: "normal" | "italic" | "bold" | "italic bold";
  textDecoration?: "none" | "underline" | "line-through";
  fontWeight?: string | number;
  letterSpacing?: number;

  // Smart Board specific
  smartBoardLayoutState?: "grid" | "manual";
  originalPositions?: Record<string, { x: number; y: number }>; // Store positions before auto-layout

  visible: boolean;
  locked: boolean;
  // UI-only draft used by detached editor surfaces. Never render or persist it.
  uiTransient?: boolean;

  // Group Properties
  children?: string[]; // IDs of child layers
  parentId?: string; // ID of parent group
  collapsed?: boolean; // For UI state

  // Generation Frame Properties
  genStatus?: "idle" | "analyzing" | "generating" | "success" | "failed";
  genStatusLabel?: string;
  genPrompt?: string;
  genReferenceImage?: string | null;
  genReferenceImages?: string[];
  genResultImage?: string | null;
  pendingNaturalResize?: boolean;
  genModel?: string;
  genStreamId?: string;
  genTaskId?: string;
  genTaskType?: string;
  genProviderKey?: string;
  genStatusUrl?: string;
  genBackgroundTaskId?: string;
  genBatchIndex?: number;
  genJobId?: string;
  genWorkflow?: "default" | "storyboard25";
  genGridSize?: number;
  genAgentRoleHint?: string;
  genPlaceholderRootId?: string;
  genPlaceholderIndex?: number;
  genStoryboardJson?: unknown;
  libtvNodeKind?: LibTvNodeKind;
  libtvComponentType?: LibTvComponentType;
  libtvOptionId?: string;
  libtvOptionLabel?: string;
  libtvPrompt?: string;
  libtvPanoramaMode?: "standard" | "generator";
  libtvPanoramaActive?: boolean;
  libtvPanoramaAutoOpen?: boolean;
  libtvPanoramaSourceMode?: "scene" | "text" | "reference";
  libtvPanoramaSourceUrl?: string;
  libtvPanoramaYaw?: number;
  libtvPanoramaPitch?: number;
  libtvReversePromptInput?: string;
  libtvMediaUrl?: string;
  libtvCharacterKeys?: string[];
  libtvSceneKey?: string;
  libtvNote?: string;
  libtvModelId?: string;
  libtvTaskId?: string;
  libtvTextEditorMode?: boolean;
  libtvTextRichContent?: string;
  libtvTextStatus?: "idle" | "generating" | "success" | "failed";
  libtvTextError?: string;
  libtvScriptResult?: LibTvStoryboardScriptResult | null;
  libtvScriptStatus?: "idle" | "generating" | "success" | "failed";
  libtvScriptError?: string;
  libtvScriptProgress?: number;
  libtvScriptProgressLabel?: string;

  // Custom / Metadata
  subtype?: string;
  assetMimeType?: string;
  vectorSourceUrl?: string;
  vectorFilename?: string;
  vectorPathCount?: number;
  groupBackgroundColor?: string;
  manualGroupWidth?: number;
  manualGroupHeight?: number;
  modelUrl?: string;
  ocrText?: string;
  ocrRotation?: number;
  ocrStyle?: string;
  lineHeight?: number;
  name?: string;
  genRatio?: string;
  genResolution?: string;
  videoDuration?: string | number;
  rotateSourceLayerId?: string;

  // Upload State (for optimistic UI)
  isUploading?: boolean; // True when file is being uploaded
  uploadError?: boolean; // True if upload failed

  // P1: Layer Effects
  effects?: LayerEffect[];

  // Image adjustments
  adjustments?: ImageAdjustments;
  annotations?: CanvasAnnotation[];

  // High-fidelity layer-separation metadata. Kept on the canvas layer so
  // confidence, model provenance and non-destructive raster fallbacks
  // survive project save/load and PSD export.
  layerSeparation?: LayerSeparationMetadata;
  textRasterFallback?: CanvasTextRasterFallback;
  maskSrc?: string;
  mask?: CanvasLayerMask;

  // Video editing metadata
  videoSessionId?: string | null;
  videoTrimStart?: number;
  videoTrimEnd?: number;
  videoOriginalDuration?: number;
  libtvKlingElementIds?: string[];
  libtvKlingVoiceIds?: string[];
  libtvKlingSound?: "on" | "off";
  libtvVideoReferenceMode?: string;
  libtvVideoCameraPresetId?: string;
  libtvVideoCameraPresetLabel?: string;
  libtvVideoStyle?: string;
  libtvVideoCameraControl?: {
    type?: string;
    config?: {
      horizontal?: number;
      vertical?: number;
      pan?: number;
      tilt?: number;
      roll?: number;
      zoom?: number;
    };
  } | null;
  videoHistory?: Array<{
    role: "user" | "agent" | "system";
    content: string;
  }>;

  // Legacy history field
  history?: unknown[];
}

export interface LayerEffect {
  id: string;
  type:
    | "dropShadow"
    | "stroke"
    | "outerGlow"
    | "innerShadow"
    | "innerGlow"
    | "bevel";
  isEnabled: boolean;
  params: {
    // Shared params
    color?: string;
    blur?: number;
    offsetX?: number;
    offsetY?: number;
    opacity?: number;

    // Stroke & Bevel
    size?: number;

    // Bevel specific
    highlightColor?: string;
    shadowColor?: string;
  };
}

export interface ImageAdjustments {
  light: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  saturation: number;
  temperature: number;
  tint: number;
  sharpen: number;
  clarity: number;
  grain: number;
  vignette: number;
  glamour: number;
  bloom: number;
}

export interface LayerHistoryEntry {
  id: string;
  label: string;
  createdAt: number;
  layers: CanvasLayer[];
  libtvWorkflow?: LibTvWorkflowState;
  workflowMergeKey?: string;
}

const HISTORY_LIMIT = 120;
const WORKFLOW_HISTORY_MERGE_WINDOW_MS = 320;
const WORKFLOW_HISTORY_MERGE_KEY = "workflow:snapshot";
const WORKFLOW_HISTORY_TRANSIENT_DATA_KEYS = new Set([
  "groupRunning",
  "playlistExportRunning",
  "playlistPanelOpen",
  "workflowGenerationJobId",
  "workflowGenerationTaskId",
  "workflowGenerationTaskIds",
  "workflowGenerationTaskType",
  "workflowGenerationProviderKey",
  "workflowGenerationBaseUrl",
  "workflowGenerationStatusUrl",
  "workflowGenerationBackgroundTaskId",
  "workflowGenerationStartedAt",
  "workflowGenerationRunning",
  "workflowGenerationProgress",
  "workflowGenerationError",
  "workflowRedrawRunning",
  "workflowRedrawError",
]);

/**
 * Generation status text is rendered from the live job state and should not
 * create an undo checkpoint for every polling tick. User-authored notes (for
 * example, a node annotation) deliberately remain part of history.
 */
const isWorkflowRuntimeNote = (value: unknown): boolean => {
  const note = String(value || "").trim();
  if (!note) return false;
  return (
    note === "生成中" ||
    note === "生成中..." ||
    note === "后台生成中" ||
    note === "排队中" ||
    note === "等待生成" ||
    note === "提交视频任务" ||
    note === "正在创建 3D 世界任务" ||
    note === "3D 世界任务已创建" ||
    note === "正在创建 3D 世界编辑任务" ||
    note === "3D 世界编辑任务已创建" ||
    /^正在/.test(note) ||
    /^等待/.test(note) ||
    /^排队/.test(note) ||
    /^提交/.test(note) ||
    /生成中/.test(note)
  );
};

const cloneLayers = (layers: CanvasLayer[]): CanvasLayer[] => {
  try {
    return JSON.parse(JSON.stringify(layers));
  } catch {
    return layers.map((layer) => ({ ...layer }));
  }
};

const cloneLibTvWorkflow = (
  workflow: LibTvWorkflowState,
): LibTvWorkflowState => {
  try {
    return JSON.parse(JSON.stringify(workflow)) as LibTvWorkflowState;
  } catch {
    return {
      ...workflow,
      nodes: workflow.nodes.map((node) => ({
        ...node,
        data: { ...node.data },
      })),
      edges: workflow.edges.map((edge) => ({ ...edge })),
    };
  }
};

const normalizeImportedLayer = (layer: CanvasLayer): CanvasLayer => {
  const rawId = typeof layer?.id === "string" ? layer.id.trim() : "";
  return {
    ...layer,
    id: rawId || uuidv4(),
    x: Number.isFinite(Number(layer?.x)) ? Number(layer.x) : 0,
    y: Number.isFinite(Number(layer?.y)) ? Number(layer.y) : 0,
    scaleX: Number.isFinite(Number(layer?.scaleX)) ? Number(layer.scaleX) : 1,
    scaleY: Number.isFinite(Number(layer?.scaleY)) ? Number(layer.scaleY) : 1,
    visible: layer?.visible ?? true,
    locked: layer?.locked ?? false,
  };
};

const layersFingerprint = (layers: CanvasLayer[]): string => {
  try {
    return JSON.stringify(layers);
  } catch {
    return `${layers.length}`;
  }
};

const workflowFingerprint = (workflow: LibTvWorkflowState): string => {
  try {
    return JSON.stringify(
      {
        ...workflow,
        activeNodeId: null,
        lastRun: null,
      },
      (key, value) => {
        if (WORKFLOW_HISTORY_TRANSIENT_DATA_KEYS.has(key)) return undefined;
        if (key === "note" && isWorkflowRuntimeNote(value)) return undefined;
        return value;
      },
    );
  } catch {
    return `${workflow.nodes.length}:${workflow.edges.length}:${workflow.activeNodeId || ""}:${workflow.enabled ? 1 : 0}`;
  }
};

const trimHistoryToLimit = (
  layerHistory: LayerHistoryEntry[],
): LayerHistoryEntry[] =>
  layerHistory.length > HISTORY_LIMIT
    ? layerHistory.slice(layerHistory.length - HISTORY_LIMIT)
    : layerHistory;

const stripLibTvWorkflowTransientHistoryData = (
  workflow: LibTvWorkflowState,
): LibTvWorkflowState => {
  const nextWorkflow = cloneLibTvWorkflow(workflow);
  nextWorkflow.activeNodeId = null;
  nextWorkflow.lastRun = null;
  nextWorkflow.nodes = nextWorkflow.nodes.map((node) => {
    const nextData = { ...node.data } as unknown as Record<string, unknown>;
    for (const key of WORKFLOW_HISTORY_TRANSIENT_DATA_KEYS) {
      delete nextData[key];
    }
    if (isWorkflowRuntimeNote(nextData.note)) delete nextData.note;
    return { ...node, data: nextData as unknown as LibTvWorkflowNodeData };
  });
  return nextWorkflow;
};

const mergeLibTvWorkflowTransientHistoryData = (
  snapshot: LibTvWorkflowState,
  current: LibTvWorkflowState,
): LibTvWorkflowState => {
  const currentById = new Map(current.nodes.map((node) => [node.id, node]));
  const nextWorkflow = cloneLibTvWorkflow(snapshot);
  nextWorkflow.activeNodeId = null;
  nextWorkflow.lastRun = current.lastRun;
  nextWorkflow.nodes = nextWorkflow.nodes.map((node) => {
    const currentNode = currentById.get(node.id);
    if (!currentNode) return node;
    const nextData = { ...node.data } as unknown as Record<string, unknown>;
    const currentData = currentNode.data as unknown as Record<string, unknown>;
    for (const key of WORKFLOW_HISTORY_TRANSIENT_DATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(currentData, key)) {
        nextData[key] = currentData[key];
      }
    }
    if (isWorkflowRuntimeNote(currentData.note)) {
      nextData.note = currentData.note;
    }
    return { ...node, data: nextData as unknown as LibTvWorkflowNodeData };
  });
  return nextWorkflow;
};

const createHistoryEntry = (
  label: string,
  layers: CanvasLayer[],
  workflow: LibTvWorkflowState,
): LayerHistoryEntry => ({
  id: uuidv4(),
  label,
  createdAt: Date.now(),
  layers: cloneLayers(layers),
  libtvWorkflow: stripLibTvWorkflowTransientHistoryData(workflow),
});

const appendHistoryEntry = (
  layerHistory: LayerHistoryEntry[],
  historyIndex: number,
  entry: LayerHistoryEntry,
): { layerHistory: LayerHistoryEntry[]; historyIndex: number } => {
  const nextHistory = trimHistoryToLimit([
    ...layerHistory.slice(0, historyIndex + 1),
    entry,
  ]);
  return {
    layerHistory: nextHistory,
    historyIndex: nextHistory.length - 1,
  };
};

const historyEntryMatchesState = (
  entry: LayerHistoryEntry | undefined,
  layers: CanvasLayer[],
  workflow: LibTvWorkflowState,
): boolean =>
  Boolean(
    entry &&
    layersFingerprint(entry.layers) === layersFingerprint(layers) &&
    workflowFingerprint(entry.libtvWorkflow || EMPTY_LIBTV_WORKFLOW_STATE) ===
      workflowFingerprint(workflow),
  );

const recordLibTvWorkflowHistory = (
  state: Pick<
    CanvasState,
    "layers" | "libtvWorkflow" | "layerHistory" | "historyIndex"
  >,
  nextWorkflow: LibTvWorkflowState,
  label: string,
  mergeKey = WORKFLOW_HISTORY_MERGE_KEY,
): { layerHistory: LayerHistoryEntry[]; historyIndex: number } => {
  const currentWorkflowFp = workflowFingerprint(state.libtvWorkflow);
  const nextWorkflowFp = workflowFingerprint(nextWorkflow);
  if (currentWorkflowFp === nextWorkflowFp) {
    return {
      layerHistory: state.layerHistory,
      historyIndex: state.historyIndex,
    };
  }

  const now = Date.now();
  const mergeWindowMs = WORKFLOW_HISTORY_MERGE_WINDOW_MS;
  const activeEntry = state.layerHistory[state.historyIndex];
  const activeEntryMatchesState = historyEntryMatchesState(
    activeEntry,
    state.layers,
    state.libtvWorkflow,
  );
  const activeEntryCanMerge = Boolean(
    activeEntry &&
    activeEntry.workflowMergeKey === mergeKey &&
    now - activeEntry.createdAt <= mergeWindowMs,
  );
  const useActiveSnapshot = activeEntryMatchesState || activeEntryCanMerge;
  const activeWorkflowFp = activeEntry
    ? workflowFingerprint(
        activeEntry.libtvWorkflow || EMPTY_LIBTV_WORKFLOW_STATE,
      )
    : "";
  if (
    useActiveSnapshot &&
    activeWorkflowFp === nextWorkflowFp &&
    state.historyIndex > 0
  ) {
    return {
      layerHistory: state.layerHistory.slice(0, state.historyIndex + 1),
      historyIndex: state.historyIndex,
    };
  }
  const historyAtCurrentState = useActiveSnapshot
    ? {
        layerHistory: state.layerHistory.slice(0, state.historyIndex + 1),
        historyIndex: state.historyIndex,
      }
    : (() => {
        const nextHistory = trimHistoryToLimit([
          ...state.layerHistory.slice(0, state.historyIndex + 1),
          createHistoryEntry(label, state.layers, state.libtvWorkflow),
          {
            ...createHistoryEntry(label, state.layers, nextWorkflow),
            createdAt: now,
            workflowMergeKey: mergeKey,
          },
        ]);
        return {
          layerHistory: nextHistory,
          historyIndex: nextHistory.length - 1,
        };
      })();
  if (!useActiveSnapshot) {
    return historyAtCurrentState;
  }
  const currentEntry =
    historyAtCurrentState.layerHistory[historyAtCurrentState.historyIndex];
  const previousEntry =
    historyAtCurrentState.layerHistory[historyAtCurrentState.historyIndex - 1];
  const canMerge = Boolean(
    historyAtCurrentState.historyIndex > 0 &&
    currentEntry?.workflowMergeKey === mergeKey &&
    now - currentEntry.createdAt <= mergeWindowMs &&
    (activeEntryMatchesState ||
      historyEntryMatchesState(
        previousEntry,
        state.layers,
        state.libtvWorkflow,
      )),
  );
  const nextEntry: LayerHistoryEntry = {
    ...createHistoryEntry(label, state.layers, nextWorkflow),
    createdAt: now,
    workflowMergeKey: mergeKey,
  };
  if (!canMerge) {
    return appendHistoryEntry(
      historyAtCurrentState.layerHistory,
      historyAtCurrentState.historyIndex,
      nextEntry,
    );
  }

  const nextHistory = historyAtCurrentState.layerHistory.slice(
    0,
    historyAtCurrentState.historyIndex + 1,
  );
  nextHistory[historyAtCurrentState.historyIndex] = nextEntry;
  return {
    layerHistory: nextHistory,
    historyIndex: historyAtCurrentState.historyIndex,
  };
};

const withLibTvWorkflowHistory = (
  state: CanvasState,
  nextWorkflow: LibTvWorkflowState,
  label: string,
  mergeKey = WORKFLOW_HISTORY_MERGE_KEY,
) => ({
  libtvWorkflow: nextWorkflow,
  ...recordLibTvWorkflowHistory(state, nextWorkflow, label, mergeKey),
});

const pickFirstImageSource = (
  candidates: Array<string | null | undefined>,
): string | null => {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return null;
};

const getLayerRecency = (
  layer: Pick<CanvasLayer, "updatedAt" | "createdAt"> | null | undefined,
): number => {
  const updatedAt = Number(layer?.updatedAt || 0);
  if (Number.isFinite(updatedAt) && updatedAt > 0) return updatedAt;
  const createdAt = Number(layer?.createdAt || 0);
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;
  return 0;
};

const pickLatestLayer = <T extends CanvasLayer>(
  layers: Array<T | null | undefined>,
): T | null => {
  return (
    layers
      .filter((layer): layer is T => Boolean(layer))
      .sort((a, b) => getLayerRecency(b) - getLayerRecency(a))[0] || null
  );
};

const collectLibTvWorkflowReferencePayload = (
  sourceNode: LibTvWorkflowNode | undefined,
  sourceUrlOverride?: string,
) => {
  const isImageGeneratorResultGroup = (() => {
    if (
      sourceNode?.kind !== "group" ||
      !String(sourceNode.data?.mediaUrl || "").trim()
    )
      return false;
    const title = String(sourceNode.data?.title || "").trim();
    if (title.includes("分镜")) return false;
    return (
      String(sourceNode.data?.componentType || "") === "image-generator" ||
      Boolean(sourceNode.data?.workflowGenerationJobId) ||
      Boolean(sourceNode.data?.generationCount) ||
      Boolean(sourceNode.data?.prompt) ||
      title.includes("图片生成器") ||
      title.includes("图片节点")
    );
  })();
  if (
    !sourceNode ||
    (sourceNode.kind !== "image" && !isImageGeneratorResultGroup)
  ) {
    return {
      referenceImages: [] as string[],
      referenceImageNodeIds: [] as string[],
      referenceImageRoles: [] as string[],
    };
  }

  const isReferenceImageSource = (value: string) =>
    /^https?:\/\//i.test(value) ||
    value.startsWith("/") ||
    value.startsWith("blob:") ||
    value.startsWith("data:image/");
  const sourceUrl = String(
    sourceUrlOverride || sourceNode.data.mediaUrl || "",
  ).trim();
  if (
    sourceNode.data.mediaRole === "ordinary" ||
    isImageGeneratorResultGroup ||
    (sourceNode.kind === "image" &&
      sourceNode.data.mediaRole === "generator" &&
      sourceUrl)
  ) {
    const referenceImages = isReferenceImageSource(sourceUrl)
      ? [sourceUrl]
      : [];
    return {
      referenceImages,
      referenceImageNodeIds: referenceImages.map(() => sourceNode.id),
      referenceImageRoles: referenceImages.map(() => ""),
    };
  }

  const explicitReferences = Array.isArray(sourceNode.data.referenceImages)
    ? sourceNode.data.referenceImages
        .map((item) => String(item || "").trim())
        .filter(isReferenceImageSource)
    : [];
  const nextReferences =
    explicitReferences.length > 0
      ? [...explicitReferences]
      : isReferenceImageSource(sourceUrl)
        ? [sourceUrl]
        : [];

  return {
    referenceImages: nextReferences.slice(0, 14),
    referenceImageNodeIds: nextReferences.slice(0, 14).map(() => sourceNode.id),
    referenceImageRoles: nextReferences.slice(0, 14).map(() => ""),
  };
};

const mergeLibTvWorkflowReferencePayload = (
  referenceImages: string[],
  referenceImageNodeIds: string[],
  referenceImageRoles: string[],
  sourceId: string,
  payload: {
    referenceImages: string[];
    referenceImageNodeIds: string[];
    referenceImageRoles?: string[];
  },
) => {
  const preservedImages: string[] = [];
  const preservedIds: string[] = [];
  const preservedRoles: string[] = [];
  referenceImages.forEach((image, index) => {
    if (referenceImageNodeIds[index] === sourceId) return;
    preservedImages.push(image);
    preservedIds.push(referenceImageNodeIds[index] || "");
    preservedRoles.push(referenceImageRoles[index] || "");
  });
  return {
    referenceImages: [...preservedImages, ...payload.referenceImages].slice(
      0,
      14,
    ),
    referenceImageNodeIds: [
      ...preservedIds,
      ...payload.referenceImageNodeIds,
    ].slice(0, 14),
    referenceImageRoles: [
      ...preservedRoles,
      ...(payload.referenceImageRoles || payload.referenceImages.map(() => "")),
    ].slice(0, 14),
  };
};

const syncLibTvWorkflowReferenceConsumers = (
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
  sourceId: string,
) => {
  const sourceNode = nodes.find((node) => node.id === sourceId);
  if (!sourceNode) return nodes;
  const payload = collectLibTvWorkflowReferencePayload(sourceNode);
  const targetIds = new Set(
    edges.filter((edge) => edge.source === sourceId).map((edge) => edge.target),
  );
  if (targetIds.size === 0) return nodes;

  return nodes.map((node) => {
    if (!targetIds.has(node.id)) return node;
    if (
      !(
        node.kind === "image" ||
        node.kind === "video" ||
        node.kind === "script" ||
        node.kind === "threed" ||
        node.kind === "director-console-3d"
      )
    )
      return node;
    const references = Array.isArray(node.data.referenceImages)
      ? node.data.referenceImages
          .map((item) => String(item || "").trim())
          .filter(Boolean)
      : [];
    const referenceNodeIds = Array.isArray(node.data.referenceImageNodeIds)
      ? node.data.referenceImageNodeIds
          .map((item) => String(item || "").trim())
          .slice(0, references.length)
      : [];
    const referenceRoles = Array.isArray(node.data.referenceImageRoles)
      ? node.data.referenceImageRoles
          .map((item) => String(item || "").trim())
          .slice(0, references.length)
      : [];
    while (referenceNodeIds.length < references.length)
      referenceNodeIds.push("");
    while (referenceRoles.length < references.length) referenceRoles.push("");
    if (payload.referenceImages.length === 0) return node;
    const next = mergeLibTvWorkflowReferencePayload(
      references,
      referenceNodeIds,
      referenceRoles,
      sourceId,
      payload,
    );
    const sameReferences =
      next.referenceImages.length === references.length &&
      next.referenceImages.every((item, index) => item === references[index]) &&
      next.referenceImageNodeIds.length === referenceNodeIds.length &&
      next.referenceImageNodeIds.every(
        (item, index) => item === referenceNodeIds[index],
      ) &&
      next.referenceImageRoles.length === referenceRoles.length &&
      next.referenceImageRoles.every(
        (item, index) => item === referenceRoles[index],
      );
    if (sameReferences) return node;
    return {
      ...node,
      data: {
        ...node.data,
        referenceImages: next.referenceImages,
        referenceImageNodeIds: next.referenceImageNodeIds,
        referenceImageRoles: next.referenceImageRoles,
      },
    };
  });
};

function parseLibTvWorkflowPlaylistDuration(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return value;
  const matched = String(value || "")
    .trim()
    .match(/(\d+(?:\.\d+)?)/);
  const duration = matched ? Number(matched[1]) : 0;
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

function buildLibTvWorkflowPlaylistItem(
  playlistId: string,
  sourceNode: LibTvWorkflowNode,
  existing?: LibTvWorkflowPlaylistItem,
): LibTvWorkflowPlaylistItem | null {
  if (sourceNode.kind !== "video") return null;
  const mediaUrl = String(sourceNode.data?.mediaUrl || "").trim();
  if (!mediaUrl) return null;
  return {
    id: String(existing?.id || `${playlistId}-${sourceNode.id}`),
    nodeId: sourceNode.id,
    title:
      String(sourceNode.data?.title || existing?.title || "视频").trim() ||
      "视频",
    mediaUrl,
    thumbnailUrl:
      String(
        sourceNode.data?.thumbnailUrl || existing?.thumbnailUrl || "",
      ).trim() || undefined,
    duration:
      parseLibTvWorkflowPlaylistDuration(
        sourceNode.data?.workflowMediaDurationSec,
      ) ||
      parseLibTvWorkflowPlaylistDuration(sourceNode.data?.videoDuration) ||
      parseLibTvWorkflowPlaylistDuration(existing?.duration),
    trimStart: existing?.trimStart,
    trimEnd: existing?.trimEnd,
  };
}

function areLibTvWorkflowPlaylistItemsEqual(
  left: LibTvWorkflowPlaylistItem[],
  right: LibTvWorkflowPlaylistItem[],
) {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const candidate = right[index];
      return (
        item.id === candidate?.id &&
        item.nodeId === candidate?.nodeId &&
        item.title === candidate?.title &&
        item.mediaUrl === candidate?.mediaUrl &&
        item.thumbnailUrl === candidate?.thumbnailUrl &&
        item.duration === candidate?.duration &&
        item.trimStart === candidate?.trimStart &&
        item.trimEnd === candidate?.trimEnd
      );
    })
  );
}

const syncLibTvWorkflowPlaylistConsumers = (
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
  sourceId?: string,
) => {
  const targetIds = sourceId
    ? new Set(
        edges
          .filter((edge) => edge.source === sourceId)
          .map((edge) => edge.target),
      )
    : new Set(
        nodes.filter((node) => node.kind === "playlist").map((node) => node.id),
      );
  if (targetIds.size === 0) return nodes;
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    if (node.kind !== "playlist" || !targetIds.has(node.id)) return node;
    const currentItems = Array.isArray(node.data.playlistItems)
      ? node.data.playlistItems
      : [];
    const nextItems = [...currentItems];
    let nextBackgroundAudioUrl = String(
      node.data.playlistBackgroundAudioUrl || "",
    ).trim();
    let nextBackgroundAudioNodeId = String(
      node.data.playlistBackgroundAudioNodeId || "",
    ).trim();
    let nextVoiceoverUrl = String(node.data.playlistVoiceoverUrl || "").trim();
    let nextVoiceoverNodeId = String(
      node.data.playlistVoiceoverNodeId || "",
    ).trim();
    const incomingVideoNodes = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => nodesById.get(edge.source))
      .filter(
        (candidate): candidate is LibTvWorkflowNode =>
          candidate?.kind === "video",
      );
    const incomingAudioNodes = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => nodesById.get(edge.source))
      .filter(
        (candidate): candidate is LibTvWorkflowNode =>
          candidate?.kind === "audio",
      );
    const incomingAudioNodeIds = new Set(
      incomingAudioNodes.map((candidate) => candidate.id),
    );

    if (
      nextBackgroundAudioNodeId &&
      !incomingAudioNodeIds.has(nextBackgroundAudioNodeId)
    ) {
      nextBackgroundAudioUrl = "";
      nextBackgroundAudioNodeId = "";
    }
    if (nextVoiceoverNodeId && !incomingAudioNodeIds.has(nextVoiceoverNodeId)) {
      nextVoiceoverUrl = "";
      nextVoiceoverNodeId = "";
    }

    incomingVideoNodes.forEach((sourceNode) => {
      const existingIndex = nextItems.findIndex(
        (item) => item.nodeId === sourceNode.id,
      );
      const existing =
        existingIndex >= 0 ? nextItems[existingIndex] : undefined;
      const nextItem = buildLibTvWorkflowPlaylistItem(
        node.id,
        sourceNode,
        existing,
      );
      if (!nextItem) return;
      const duplicateIndex = nextItems.findIndex(
        (item, index) =>
          index !== existingIndex &&
          String(item.mediaUrl || "").trim() === nextItem.mediaUrl,
      );
      if (duplicateIndex >= 0) nextItems.splice(duplicateIndex, 1);
      const adjustedExistingIndex = nextItems.findIndex(
        (item) => item.nodeId === sourceNode.id,
      );
      if (adjustedExistingIndex >= 0)
        nextItems[adjustedExistingIndex] = nextItem;
      else nextItems.push(nextItem);
    });

    incomingAudioNodes.forEach((sourceNode) => {
      const mediaUrl = String(sourceNode.data?.mediaUrl || "").trim();
      if (!mediaUrl) return;
      const audioMode = String(
        sourceNode.data?.workflowExtraParameters?.audioMode || "",
      )
        .trim()
        .toLowerCase();
      const titleAndPrompt =
        `${sourceNode.data?.title || ""} ${sourceNode.data?.prompt || ""}`.toLowerCase();
      const role =
        sourceNode.data?.workflowAudioRole ||
        (isLibTvWorkflowBackgroundAudioMode(audioMode) ||
        /背景音乐|配乐|bgm|music|soundtrack/.test(titleAndPrompt)
          ? "background_music"
          : "voiceover");
      if (role === "voiceover") {
        nextVoiceoverUrl = mediaUrl;
        nextVoiceoverNodeId = sourceNode.id;
      } else {
        nextBackgroundAudioUrl = mediaUrl;
        nextBackgroundAudioNodeId = sourceNode.id;
      }
    });

    const sameItems = areLibTvWorkflowPlaylistItemsEqual(
      currentItems,
      nextItems,
    );
    const sameAudio =
      nextBackgroundAudioUrl ===
        String(node.data.playlistBackgroundAudioUrl || "").trim() &&
      nextBackgroundAudioNodeId ===
        String(node.data.playlistBackgroundAudioNodeId || "").trim() &&
      nextVoiceoverUrl ===
        String(node.data.playlistVoiceoverUrl || "").trim() &&
      nextVoiceoverNodeId ===
        String(node.data.playlistVoiceoverNodeId || "").trim();
    if (sameItems && sameAudio) return node;
    return {
      ...node,
      data: {
        ...node.data,
        playlistItems: nextItems,
        playlistActiveIndex: Math.min(
          Math.max(0, Number(node.data.playlistActiveIndex || 0)),
          Math.max(0, nextItems.length - 1),
        ),
        playlistTrimEnd: undefined,
        playlistExportUrl: undefined,
        playlistExportRunning: false,
        playlistBackgroundAudioUrl: nextBackgroundAudioUrl || undefined,
        playlistBackgroundAudioNodeId: nextBackgroundAudioNodeId || undefined,
        playlistVoiceoverUrl: nextVoiceoverUrl || undefined,
        playlistVoiceoverNodeId: nextVoiceoverNodeId || undefined,
        mediaUrl: "",
      },
    };
  });
};

function syncLibTvWorkflowPlaylistOutput(
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
  playlistId: string,
) {
  const playlistNode = nodes.find(
    (node) => node.id === playlistId && node.kind === "playlist",
  );
  const exportUrl = String(playlistNode?.data?.playlistExportUrl || "").trim();
  if (!playlistNode || !exportUrl) return { nodes, edges };
  const outputResolution = resolveLibTvWorkflowPlaylistOutputNodes(
    playlistNode,
    nodes,
    edges,
  );
  const existingOutput = outputResolution.outputNode;
  const outputTitle = `${String(playlistNode.data?.title || "视频合成").trim() || "视频合成"}｜成片`;
  if (existingOutput) {
    const duplicateIds = new Set(outputResolution.duplicateNodeIds);
    const nextNodes = nodes
      .filter((node) => !duplicateIds.has(node.id))
      .map((node) =>
        node.id === existingOutput.id
          ? {
              ...node,
              data: {
                ...node.data,
                title: outputTitle,
                mediaUrl: exportUrl,
                mediaRole: "ordinary" as const,
                workflowPlaylistSourceNodeId: playlistId,
                workflowMediaDurationSec:
                  playlistNode.data?.workflowMediaDurationSec,
                workflowMediaNaturalWidth:
                  playlistNode.data?.workflowMediaNaturalWidth,
                workflowMediaNaturalHeight:
                  playlistNode.data?.workflowMediaNaturalHeight,
                workflowGenerationRunning: false,
                workflowGenerationProgress: 1,
                workflowGenerationError: "",
                note: "",
              },
            }
          : node,
      );
    let keptOutputEdge = false;
    const keptEdgePairs = new Set<string>();
    const nextEdges = edges
      .map((edge) => ({
        ...edge,
        source: duplicateIds.has(edge.source) ? existingOutput.id : edge.source,
        target: duplicateIds.has(edge.target) ? existingOutput.id : edge.target,
      }))
      .filter((edge) => {
        if (edge.source === edge.target) return false;
        const pairKey = `${edge.source}:${edge.target}`;
        if (keptEdgePairs.has(pairKey)) return false;
        keptEdgePairs.add(pairKey);
        if (edge.source === playlistId && edge.target === existingOutput.id)
          keptOutputEdge = true;
        return true;
      });
    return {
      nodes: nextNodes,
      edges: keptOutputEdge
        ? nextEdges
        : [
            ...nextEdges,
            { id: uuidv4(), source: playlistId, target: existingOutput.id },
          ],
    };
  }

  const outputNode = createLibTvWorkflowNode("video", {
    x:
      Number(playlistNode.x || 0) +
      Math.max(350, Number(playlistNode.width || 0)) +
      LIBTV_LEFT_LINK_GAP_PX,
    y:
      Number(playlistNode.y || 0) +
      (Math.max(350, Number(playlistNode.height || 0)) -
        LIBTV_TAPNOW_VIDEO_HEIGHT) /
        2,
  });
  let outputY = Number(outputNode.y || 0);
  const outputX = Number(outputNode.x || 0);
  const overlaps = (y: number) =>
    nodes.some(
      (node) =>
        outputX <
          Number(node.x || 0) +
            Math.max(1, Number(node.width || LIBTV_TAPNOW_VIDEO_WIDTH)) +
            36 &&
        outputX + LIBTV_TAPNOW_VIDEO_WIDTH + 36 > Number(node.x || 0) &&
        y <
          Number(node.y || 0) +
            Math.max(1, Number(node.height || LIBTV_TAPNOW_VIDEO_HEIGHT)) +
            36 &&
        y + LIBTV_TAPNOW_VIDEO_HEIGHT + 36 > Number(node.y || 0),
    );
  for (let attempt = 0; attempt < 80 && overlaps(outputY); attempt += 1) {
    outputY += LIBTV_TAPNOW_VIDEO_HEIGHT + 40;
  }
  const completedOutput: LibTvWorkflowNode = {
    ...outputNode,
    x: outputX,
    y: outputY,
    width: LIBTV_TAPNOW_VIDEO_WIDTH,
    height: LIBTV_TAPNOW_VIDEO_HEIGHT,
    data: {
      ...outputNode.data,
      title: outputTitle,
      mediaUrl: exportUrl,
      mediaRole: "ordinary",
      selectedOptionId: "custom",
      options: [],
      workflowPlaylistSourceNodeId: playlistId,
      workflowMediaDurationSec: playlistNode.data?.workflowMediaDurationSec,
      workflowMediaNaturalWidth: playlistNode.data?.workflowMediaNaturalWidth,
      workflowMediaNaturalHeight: playlistNode.data?.workflowMediaNaturalHeight,
      workflowGenerationRunning: false,
      workflowGenerationProgress: 1,
      workflowGenerationError: "",
      note: "",
    },
  };
  return {
    nodes: [...nodes, completedOutput],
    edges: [
      ...edges,
      { id: uuidv4(), source: playlistId, target: completedOutput.id },
    ],
  };
}

const collectLibTvWorkflowNodeRemovalIds = (
  nodes: LibTvWorkflowNode[],
  rootIds: Iterable<string>,
) => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const removedIds = new Set<string>();
  Array.from(rootIds).forEach((id) => {
    const normalizedId = String(id || "").trim();
    if (normalizedId && nodeById.has(normalizedId))
      removedIds.add(normalizedId);
  });
  let changed = true;
  while (changed) {
    changed = false;
    const removedGroupMemberIds = new Set<string>();
    removedIds.forEach((id) => {
      const node = nodeById.get(id);
      const groupNodeIds = Array.isArray(node?.data.groupNodeIds)
        ? node.data.groupNodeIds
        : [];
      groupNodeIds.forEach((memberId) => removedGroupMemberIds.add(memberId));
    });
    nodes.forEach((node) => {
      if (removedIds.has(node.id)) return;
      if (
        (node.parentId && removedIds.has(node.parentId)) ||
        removedGroupMemberIds.has(node.id)
      ) {
        removedIds.add(node.id);
        changed = true;
      }
    });
  }
  return removedIds;
};

const applyLibTvWorkflowNodeMovePatches = (
  workflow: LibTvWorkflowState,
  patches: LibTvWorkflowNodeMovePatch[],
): { workflow: LibTvWorkflowState; changed: boolean } => {
  if (patches.length === 0 || workflow.nodes.length === 0)
    return { workflow, changed: false };

  // Index the graph once and overwrite changed node objects in the same map.
  // This preserves sequential patch semantics (including detached group
  // movement) without mapping the complete graph once per patch.
  const nodeById = new Map<string, LibTvWorkflowNode>();
  const parentedGroupIds = new Set<string>();
  for (const node of workflow.nodes) {
    nodeById.set(node.id, node);
    const parentId = String(node.parentId || "").trim();
    if (parentId) parentedGroupIds.add(parentId);
  }
  const getCurrentNode = (id: string) => nodeById.get(id);
  const getDetachedBounds = (group: LibTvWorkflowNode) => {
    const memberIds = Array.isArray(group.data.groupNodeIds)
      ? group.data.groupNodeIds
      : [];
    if (memberIds.length === 0) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let memberCount = 0;
    for (const memberId of memberIds) {
      const member = getCurrentNode(String(memberId || "").trim());
      if (!member) continue;
      const frame = getLibTvWorkflowRenderedNodeFrame(member);
      const x = Number(member.x || 0);
      const y = Number(member.y || 0);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + frame.width);
      maxY = Math.max(maxY, y + frame.height);
      memberCount += 1;
    }
    if (
      memberCount === 0 ||
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    )
      return null;
    return {
      x: Math.round(minX - LIBTV_WORKFLOW_SOFT_GROUP_PADDING),
      y: Math.round(minY - LIBTV_WORKFLOW_SOFT_GROUP_PADDING),
      width: Math.round(maxX - minX + LIBTV_WORKFLOW_SOFT_GROUP_PADDING * 2),
      height: Math.round(maxY - minY + LIBTV_WORKFLOW_SOFT_GROUP_PADDING * 2),
    };
  };

  let changed = false;
  patches.forEach((patch) => {
    const nodeId = String(patch.id || "").trim();
    if (!nodeId) return;
    const targetNode = getCurrentNode(nodeId);
    if (!targetNode) return;

    const position = patch.position || {};
    const hasNextX = Number.isFinite(Number(position.x));
    const hasNextY = Number.isFinite(Number(position.y));
    const hasNextWidth = Number.isFinite(Number(position.width));
    const hasNextHeight = Number.isFinite(Number(position.height));
    const nextX = hasNextX ? Number(position.x) : targetNode.x;
    const nextY = hasNextY ? Number(position.y) : targetNode.y;
    const nextWidth = hasNextWidth
      ? Math.max(120, Number(position.width))
      : targetNode.width;
    const nextHeight = hasNextHeight
      ? Math.max(120, Number(position.height))
      : targetNode.height;
    const hasGeometryChange =
      (hasNextX && !Object.is(Number(targetNode.x || 0), nextX)) ||
      (hasNextY && !Object.is(Number(targetNode.y || 0), nextY)) ||
      (hasNextWidth && !Object.is(Number(targetNode.width || 0), nextWidth)) ||
      (hasNextHeight && !Object.is(Number(targetNode.height || 0), nextHeight));
    const dataPatch = patch.data || {};
    const hasDataChange = Object.entries(dataPatch).some(
      ([key, value]) =>
        !Object.is(
          (targetNode.data as unknown as Record<string, unknown>)[key],
          value,
        ),
    );
    if (!hasGeometryChange && !hasDataChange) return;

    const shouldMoveDetachedGroupMembers =
      targetNode.kind === "group" &&
      Array.isArray(targetNode.data.groupNodeIds) &&
      targetNode.data.groupNodeIds.length > 0 &&
      !parentedGroupIds.has(nodeId);
    const detachedGroupBounds = shouldMoveDetachedGroupMembers
      ? getDetachedBounds(targetNode)
      : null;
    const deltaBaseX = detachedGroupBounds?.x ?? Number(targetNode.x || 0);
    const deltaBaseY = detachedGroupBounds?.y ?? Number(targetNode.y || 0);
    const deltaX = hasNextX ? Number(nextX) - deltaBaseX : 0;
    const deltaY = hasNextY ? Number(nextY) - deltaBaseY : 0;

    if (shouldMoveDetachedGroupMembers && (deltaX !== 0 || deltaY !== 0)) {
      for (const memberId of targetNode.data.groupNodeIds || []) {
        const normalizedMemberId = String(memberId || "").trim();
        const member = getCurrentNode(normalizedMemberId);
        if (!member) continue;
        nodeById.set(normalizedMemberId, {
          ...member,
          x: Number(member.x || 0) + deltaX,
          y: Number(member.y || 0) + deltaY,
        });
      }
    }

    nodeById.set(nodeId, {
      ...targetNode,
      x:
        shouldMoveDetachedGroupMembers && detachedGroupBounds && hasNextX
          ? Math.round(detachedGroupBounds.x + deltaX)
          : hasNextX
            ? nextX
            : targetNode.x,
      y:
        shouldMoveDetachedGroupMembers && detachedGroupBounds && hasNextY
          ? Math.round(detachedGroupBounds.y + deltaY)
          : hasNextY
            ? nextY
            : targetNode.y,
      width: hasNextWidth
        ? nextWidth
        : (detachedGroupBounds?.width ?? targetNode.width),
      height: hasNextHeight
        ? nextHeight
        : (detachedGroupBounds?.height ?? targetNode.height),
      data: hasDataChange
        ? { ...targetNode.data, ...dataPatch }
        : targetNode.data,
    });
    changed = true;
  });

  if (!changed) return { workflow, changed: false };
  return {
    changed: true,
    workflow: {
      ...workflow,
      nodes: workflow.nodes.map((node) => nodeById.get(node.id) || node),
    },
  };
};

const applyLibTvWorkflowNodeMovePatch = (
  workflow: LibTvWorkflowState,
  patch: LibTvWorkflowNodeMovePatch,
): { workflow: LibTvWorkflowState; changed: boolean } =>
  applyLibTvWorkflowNodeMovePatches(workflow, [patch]);

const resolveLayerImageSource = (
  layer: CanvasLayer | undefined,
): string | null => {
  if (!layer) return null;
  return pickFirstImageSource([layer.src, layer.genResultImage]);
};

const blobUrlDataCache = new Map<string, string>();
const dataUrlUploadCache = new Map<string, string>();
const GENERATING_VIDEO_EDIT_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
        <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#EEF2F7"/>
                <stop offset="100%" stop-color="#E2E8F0"/>
            </linearGradient>
        </defs>
        <rect width="1280" height="720" fill="url(#bg)"/>
        <rect x="420" y="210" width="440" height="300" rx="28" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
        <rect x="560" y="285" width="160" height="110" rx="14" fill="#94A3B8" opacity="0.9"/>
        <polygon points="626,309 626,370 684,340" fill="#0F172A"/>
        <text x="640" y="448" text-anchor="middle" fill="#334155" font-size="32" font-family="Arial, sans-serif">视频编辑中...</text>
    </svg>`,
)}`;

const unwrapImageProxyUrl = (input: string): string => {
  const decodeProxyParam = (encoded: string | null) => {
    if (!encoded) return null;
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  };

  if (input.startsWith("/api/image-proxy?url=")) {
    const encoded = input.slice("/api/image-proxy?url=".length);
    return decodeProxyParam(encoded) || input;
  }

  try {
    const parsed = new URL(input);
    if (parsed.pathname === "/api/image-proxy") {
      const unwrapped = decodeProxyParam(parsed.searchParams.get("url"));
      if (unwrapped) return unwrapped;
    }
  } catch {
    // ignore parse errors for non-absolute urls
  }

  return input;
};

const blobToDataUrl = async (blobUrl: string): Promise<string> => {
  const cached = blobUrlDataCache.get(blobUrl);
  if (cached) return cached;

  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw new Error(`Failed to read blob url: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to encode blob as data URL"));
    };
    reader.onerror = () =>
      reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });

  blobUrlDataCache.set(blobUrl, dataUrl);
  return dataUrl;
};

const uploadDataUrlAsPublicImage = async (source: string): Promise<string> => {
  const cached = dataUrlUploadCache.get(source);
  if (cached) return cached;

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to decode data url: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const extFromType = blob.type.split("/")[1] || "png";
  const file = new File([blob], `canvas-image-${Date.now()}.${extFromType}`, {
    type: blob.type || "image/png",
  });
  const formData = new FormData();
  formData.append("file", file);

  const uploadResp = await fetch("/api/upload", {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  const uploadJson = await uploadResp.json();
  if (
    !uploadResp.ok ||
    !uploadJson?.success ||
    typeof uploadJson?.url !== "string"
  ) {
    throw new Error(uploadJson?.error || "Failed to upload data url image");
  }

  dataUrlUploadCache.set(source, uploadJson.url);
  return uploadJson.url;
};

const resolveApiImageSource = async (
  source: string,
  opts?: { preferPublicUrl?: boolean },
): Promise<string> => {
  let resolved = unwrapImageProxyUrl(source);
  if (source.startsWith("blob:")) {
    resolved = await blobToDataUrl(source);
  }
  if (opts?.preferPublicUrl && resolved.startsWith("data:")) {
    return uploadDataUrlAsPublicImage(resolved);
  }
  if (
    opts?.preferPublicUrl &&
    (resolved.startsWith("/") ||
      resolved.startsWith("http://") ||
      resolved.startsWith("https://"))
  ) {
    try {
      const absolute = resolved.startsWith("/")
        ? typeof window !== "undefined" && window.location?.origin
          ? new URL(resolved, window.location.origin).toString()
          : resolved
        : resolved;

      const parsed = new URL(absolute);
      const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname);
      const currentOrigin =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "";
      const isSameOrigin =
        Boolean(currentOrigin) && parsed.origin === currentOrigin;

      // Only fetch+upload when we are sure the browser can fetch it without CORS issues.
      // Public CDN/OSS URLs should be passed through as-is.
      if (isLocalHost || isSameOrigin) {
        const fetchResp = await fetch(absolute);
        if (!fetchResp.ok) {
          throw new Error(
            `Failed to fetch local image before upload: HTTP ${fetchResp.status}`,
          );
        }
        const blob = await fetchResp.blob();
        const extFromType = blob.type.split("/")[1] || "png";
        const file = new File(
          [blob],
          `canvas-public-${Date.now()}.${extFromType}`,
          {
            type: blob.type || "image/png",
          },
        );
        const formData = new FormData();
        formData.append("file", file);
        const uploadResp = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const uploadJson = await uploadResp.json();
        if (
          !uploadResp.ok ||
          !uploadJson?.success ||
          typeof uploadJson?.url !== "string"
        ) {
          throw new Error(
            uploadJson?.error || "Failed to upload local image as public URL",
          );
        }
        return uploadJson.url;
      }

      return absolute;
    } catch {
      if (resolved.startsWith("/")) {
        if (typeof window !== "undefined" && window.location?.origin) {
          return new URL(resolved, window.location.origin).toString();
        }
      }
    }
  }
  return resolved;
};

const normalizeCanvasBackendJobRecord = (
  value: unknown,
): CanvasBackendJobRecord | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id || "").trim();
  const kind = String(row.kind || "").trim() as CanvasBackendJobKind;
  const status = String(row.status || "")
    .trim()
    .toLowerCase();
  if (!id || !kind) return null;
  if (
    kind !== "remove_bg" &&
    kind !== "vectorize" &&
    kind !== "erase" &&
    kind !== "outpaint" &&
    kind !== "edit_text" &&
    kind !== "explode" &&
    kind !== "upscale" &&
    kind !== "image_generate"
  ) {
    return null;
  }
  const normalizedStatus: CanvasBackendJobRecord["status"] =
    status === "success"
      ? "success"
      : status === "failed"
        ? "failed"
        : "processing";
  const resultDataRaw = row.resultData;
  const payloadRaw = row.payload;
  const resultData =
    resultDataRaw && typeof resultDataRaw === "object"
      ? {
          stage:
            typeof (resultDataRaw as any).stage === "string"
              ? (resultDataRaw as any).stage
              : undefined,
          progress: Number.isFinite(Number((resultDataRaw as any).progress))
            ? Number((resultDataRaw as any).progress)
            : undefined,
          message:
            typeof (resultDataRaw as any).message === "string"
              ? (resultDataRaw as any).message
              : undefined,
          pollAfterMs: Number.isFinite(
            Number((resultDataRaw as any).pollAfterMs),
          )
            ? Number((resultDataRaw as any).pollAfterMs)
            : undefined,
          externalTask: (resultDataRaw as any).externalTask,
          response: (resultDataRaw as any).response,
        }
      : undefined;

  return {
    id,
    kind,
    status: normalizedStatus,
    payload:
      payloadRaw && typeof payloadRaw === "object"
        ? {
            request:
              (payloadRaw as any).request &&
              typeof (payloadRaw as any).request === "object"
                ? ((payloadRaw as any).request as Record<string, any>)
                : undefined,
            projectId:
              typeof (payloadRaw as any).projectId === "string"
                ? (payloadRaw as any).projectId
                : undefined,
          }
        : undefined,
    resultData,
    resultUrl: typeof row.resultUrl === "string" ? row.resultUrl : null,
    errorMessage:
      typeof row.errorMessage === "string" ? row.errorMessage : null,
  };
};

const canvasBackendPollDelay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const createCanvasBackendJob = async (params: {
  projectId: string;
  kind: CanvasBackendJobKind;
  request: Record<string, any>;
}): Promise<CanvasBackendJobRecord> => {
  const response = await fetch("/api/canvas/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      projectId: params.projectId,
      kind: params.kind,
      request: params.request,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      String(payload?.error || `Canvas job create failed (${response.status})`),
    );
  }
  const job = normalizeCanvasBackendJobRecord(payload);
  if (!job) {
    throw new Error("Canvas job create returned invalid payload");
  }
  return job;
};

const fetchCanvasBackendJob = async (
  jobId: string,
): Promise<CanvasBackendJobRecord> => {
  const response = await fetch(
    `/api/canvas/jobs/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    },
  );
  const payload = await response.json().catch(() => null);
  if (response.status === 429) {
    const retryAfter = Number(
      response.headers.get("retry-after") ||
        payload?.retryAfterMs ||
        payload?.retryAfter ||
        0,
    );
    const error = new Error(
      String(payload?.error || "Canvas job poll rate limited"),
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
    throw new Error(
      String(payload?.error || `Canvas job poll failed (${response.status})`),
    );
  }
  const job = normalizeCanvasBackendJobRecord(payload);
  if (!job) {
    throw new Error("Canvas job poll returned invalid payload");
  }
  return job;
};

const CANVAS_BACKEND_RESULT_PAYLOAD_KEYS = [
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

const isCanvasBackendResultUrl = (value: string): boolean => {
  const normalized = value.trim();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("/")
  );
};

const enqueueCanvasBackendResultPayloadValues = (
  queue: any[],
  current: Record<string, any>,
) => {
  for (const key of CANVAS_BACKEND_RESULT_PAYLOAD_KEYS) {
    if (current[key]) queue.push(current[key]);
  }
};

const pickCanvasJobResultUrl = (payload: any): string | null => {
  const queue: any[] = [payload];
  const seen = new Set<any>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (typeof current === "string") {
      const normalized = current.trim();
      if (isCanvasBackendResultUrl(normalized)) {
        return normalized;
      }
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current === "object") {
      if (seen.has(current)) continue;
      seen.add(current);
      enqueueCanvasBackendResultPayloadValues(
        queue,
        current as Record<string, any>,
      );
    }
  }
  return null;
};

const resolveCanvasBackendJobResultUrl = (
  job: CanvasBackendJobRecord,
): string | null => {
  const direct = String(job.resultUrl || "").trim();
  if (direct) return direct;
  return pickCanvasJobResultUrl([job.resultData?.response, job.resultData]);
};

function ensureStoryboardGroupSourceEdge(
  edges: LibTvWorkflowEdge[],
  nodes: LibTvWorkflowNode[],
  nodeId: string,
): LibTvWorkflowEdge[] {
  const groupNode = nodes.find((node) => node.id === nodeId);
  const sourceNodeId = String(
    groupNode?.data?.workflowStoryboardSourceNodeId || "",
  ).trim();
  if (
    !groupNode ||
    groupNode.kind !== "group" ||
    !sourceNodeId ||
    sourceNodeId === nodeId
  )
    return edges;
  if (!nodes.some((node) => node.id === sourceNodeId)) return edges;
  if (
    edges.some((edge) => edge.source === sourceNodeId && edge.target === nodeId)
  )
    return edges;
  return [...edges, { id: uuidv4(), source: sourceNodeId, target: nodeId }];
}

const waitCanvasBackendJob = async (params: {
  jobId: string;
  onProgress?: (job: CanvasBackendJobRecord) => void;
}) => {
  let pollIntervalMs = 1400;
  for (let attempt = 0; ; attempt += 1) {
    let job: CanvasBackendJobRecord;
    try {
      job = await fetchCanvasBackendJob(params.jobId);
    } catch (error) {
      const status = Number(
        (error as Error & { status?: number })?.status || 0,
      );
      if (status === 429) {
        const retryAfterMs = Number(
          (error as Error & { retryAfterMs?: number })?.retryAfterMs || 0,
        );
        pollIntervalMs = Math.max(
          2500,
          Math.min(
            12000,
            Number.isFinite(retryAfterMs) && retryAfterMs > 0
              ? retryAfterMs
              : pollIntervalMs * 1.6,
          ),
        );
        await canvasBackendPollDelay(pollIntervalMs);
        continue;
      }
      throw error;
    }
    params.onProgress?.(job);
    if (job.status === "success") return job;
    if (job.status === "failed") {
      throw new Error(
        String(job.errorMessage || job.resultData?.message || "任务执行失败"),
      );
    }
    const hintInterval = Number(job.resultData?.pollAfterMs || 0);
    if (Number.isFinite(hintInterval) && hintInterval > 0) {
      pollIntervalMs = Math.max(800, Math.min(8000, Math.floor(hintInterval)));
    } else if (attempt > 20) {
      pollIntervalMs = 2200;
    } else if (attempt > 8) {
      pollIntervalMs = 1800;
    }
    await canvasBackendPollDelay(pollIntervalMs);
  }
};

type ChatStreamJobRecordForCanvas = {
  id: string;
  status: "processing" | "success" | "failed";
  payload?: {
    streamId?: string;
    modelId?: string;
  };
  resultData?: {
    stage?: string;
    progress?: number;
    message?: string;
    streamId?: string;
    taskId?: string;
    taskType?: string;
    backgroundTaskId?: string;
    latestMedia?: {
      videoUrl?: string;
    };
    response?: any;
  };
  resultUrl?: string | null;
  errorMessage?: string | null;
};

const fetchChatStreamJobForCanvas = async (
  jobId: string,
): Promise<ChatStreamJobRecordForCanvas> => {
  const response = await fetch(`/api/chat/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      String(payload?.error || `Chat job poll failed (${response.status})`),
    );
  }
  const id = String(payload?.id || "").trim();
  if (!id) throw new Error("Chat job poll returned invalid payload");
  const statusRaw = String(payload?.status || "")
    .trim()
    .toLowerCase();
  return {
    id,
    status:
      statusRaw === "success"
        ? "success"
        : statusRaw === "failed"
          ? "failed"
          : "processing",
    payload:
      payload?.payload && typeof payload.payload === "object"
        ? payload.payload
        : undefined,
    resultData:
      payload?.resultData && typeof payload.resultData === "object"
        ? payload.resultData
        : undefined,
    resultUrl:
      typeof payload?.resultUrl === "string" ? payload.resultUrl : null,
    errorMessage:
      typeof payload?.errorMessage === "string" ? payload.errorMessage : null,
  };
};

const collectVideoUrlsFromTaskPayload = (payload: any): string[] => {
  const urls = new Set<string>();
  const visit = (value: unknown, keyHint = "") => {
    if (!value) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!/^https?:\/\//i.test(trimmed)) return;
      if (
        /\.(?:mp4|mov|webm)(?:[?#]|$)/i.test(trimmed) ||
        /video/i.test(keyHint) ||
        /(result|output|file|media|download|url)s?$/i.test(keyHint)
      ) {
        urls.add(trimmed);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, keyHint));
      return;
    }
    if (typeof value !== "object") return;
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      visit(item, keyHint ? `${keyHint}.${key}` : key);
    });
  };
  visit(payload);
  return Array.from(urls);
};

const resolveChatStreamJobVideoUrl = (
  job: ChatStreamJobRecordForCanvas,
): string => {
  return String(
    job.resultData?.latestMedia?.videoUrl ||
      collectVideoUrlsFromTaskPayload(job.resultData?.response)[0] ||
      job.resultUrl ||
      "",
  ).trim();
};

const waitChatStreamVideoJobForCanvas = async (params: {
  jobId: string;
  onProgress?: (job: ChatStreamJobRecordForCanvas) => void;
  maxAttempts?: number;
}) => {
  const maxAttempts = Number.isFinite(Number(params.maxAttempts))
    ? Math.max(1, Math.floor(Number(params.maxAttempts)))
    : 180;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const job = await fetchChatStreamJobForCanvas(params.jobId);
    params.onProgress?.(job);
    if (job.status === "success") return job;
    if (job.status === "failed") {
      throw new Error(
        String(
          job.errorMessage || job.resultData?.message || "视频任务执行失败",
        ),
      );
    }
    await canvasBackendPollDelay(attempt > 20 ? 5000 : 2500);
  }
  throw new Error("视频任务轮询超时");
};

const resolveVideoNaturalSize = (url: string) => {
  return new Promise<{
    width: number;
    height: number;
    duration?: number;
  } | null>((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const video = document.createElement("video");
    let settled = false;
    const finalize = (
      value: { width: number; height: number; duration?: number } | null,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };
    const timeoutId = window.setTimeout(() => finalize(null), 8000);
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.onloadedmetadata = () => {
      finalize({
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
        duration: Number.isFinite(video.duration)
          ? Math.round(video.duration)
          : undefined,
      });
    };
    video.onerror = () => finalize(null);
    video.src = toVideoDisplayUrl(url);
  });
};

const normalizeLooseText = (value: unknown): string =>
  String(value || "")
    .trim()
    .toLowerCase();
const MODEL_CATALOG_CACHE_TTL_MS = 5 * 60_000;
let modelCatalogCache: { expiresAt: number; models: any[] } | null = null;

const normalizeModelLookupKey = (value: unknown): string => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  return raw.replace(/@@[a-z0-9_-]+$/, "").replace(/@[a-z0-9_-]+$/, "");
};

const buildModelLookupKeys = (value: unknown): string[] => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  const normalized = normalizeModelLookupKey(value);
  const keys = [raw, normalized].filter(Boolean);
  return Array.from(new Set(keys));
};

const loadModelCatalogFromDb = async (force = false): Promise<any[]> => {
  const now = Date.now();
  if (!force && modelCatalogCache && modelCatalogCache.expiresAt > now) {
    return modelCatalogCache.models;
  }

  try {
    const models = await loadWorkflowModels(force);
    modelCatalogCache = {
      models,
      expiresAt: now + MODEL_CATALOG_CACHE_TTL_MS,
    };
    return models;
  } catch (error) {
    console.warn("[Store] loadModelCatalogFromDb failed:", error);
    return modelCatalogCache?.models || [];
  }
};

const findModelByIdentity = (models: any[], modelId: string): any | null => {
  const targetKeys = buildModelLookupKeys(modelId);
  if (!targetKeys.length) return null;
  for (const model of models) {
    const candidateKeys = Array.from(
      new Set([
        ...buildModelLookupKeys(model?.id),
        ...buildModelLookupKeys(model?.modelId),
      ]),
    );
    if (candidateKeys.some((key) => targetKeys.includes(key))) {
      return model;
    }
  }
  return null;
};

const modelSupportsVideoEditByDb = async (
  modelId: string,
): Promise<boolean> => {
  const normalized = String(modelId || "").trim();
  if (!normalized) return false;
  const models = await loadModelCatalogFromDb();
  const target = findModelByIdentity(models, normalized);
  if (!target) return false;
  const category = String(target?.category || "")
    .trim()
    .toLowerCase();
  if (category !== "video") return false;
  const supportsFlag = target?.parameters?.supportsVideoEdit;
  if (typeof supportsFlag === "boolean") return supportsFlag;
  return false;
};

const pickDefaultVideoEditModelId = async (): Promise<string> => {
  try {
    const models = await loadModelCatalogFromDb();
    const videoModels = models.filter(
      (model) => String(model?.category || "").toLowerCase() === "video",
    );
    if (!videoModels.length) return "";

    const editableVideoModels = videoModels.filter(
      (model) => model?.parameters?.supportsVideoEdit === true,
    );
    const pool =
      editableVideoModels.length > 0 ? editableVideoModels : videoModels;

    // Prefer a default model within the pool.
    let selected = pool.find((model) => model?.isDefault) || pool[0];

    // If multiple models are available, prefer Kling 2.6 as a broadly-supported baseline,
    // but do not hardcode any specific provider.
    const kling26 = pool.find(
      (model) => normalizeLooseText(model?.modelId) === "kling-2.6",
    );
    if (kling26) selected = kling26;

    return String(selected?.id || selected?.modelId || "").trim();
  } catch (error) {
    console.warn("[Store] pickDefaultVideoEditModelId failed:", error);
    return "";
  }
};

interface CanvasState {
  layers: CanvasLayer[];
  selectedIds: string[];
  tool:
    | "select"
    | "hand"
    | "rect"
    | "line"
    | "arrow"
    | "circle"
    | "triangle"
    | "star"
    | "text-rect"
    | "text-circle"
    | "text-bubble"
    | "text-arrow"
    | "text-other"
    | "text"
    | "pencil"
    | "pen"
    | "generator"
    | "storyboard-generator"
    | "video-generator"
    | "new"
    | "upload-image"
    | "upload-video"
    | "smart-board"
    | "text-arrow-left"
    | "expand"
    | "zmtv-text"
    | "zmtv-image"
    | "zmtv-video"
    | "zmtv-audio"
    | "zmtv-script"
    | "libtv-text"
    | "libtv-image"
    | "libtv-video"
    | "libtv-audio"
    | "libtv-script";

  zoom: number;
  stagePos: { x: number; y: number }; // Canvas stage position offset
  // Hint for LOD / virtualization: true while user is actively panning/zooming or inertia is running.
  isViewportMoving: boolean;
  projectId: string | null;
  projectName: string;
  projectThumbnail: string | null;
  projectMaterials: ProjectMaterialItem[];
  userMaterials: ProjectMaterialItem[];
  materialManagerOpen: boolean;
  materialManagerTab: MaterialManagerTab;
  materialManagerCreateOpen: boolean;
  materialManagerSeedImage: string | null;
  materialSaveDialogOpen: boolean;
  materialSaveDraft: PendingProjectMaterialSaveDraft | null;
  libtvWorkflow: LibTvWorkflowState;
  downloadTrigger: number; // Timestamp to trigger download in components
  isErasing: boolean;
  isTextEditing: boolean;
  isGenerativeFilling: boolean;
  isQuickEditing: boolean;
  isAnnotationQuickEditing: boolean;
  isAnnotating: boolean;
  isRotateEditing: boolean;
  isMoveObjectEditing: boolean;
  activeAnnotationRegionId: string | null;
  isExpanding: boolean;
  activeImageToolPanel: ActiveImageToolPanel;
  isEyedropperPicking: boolean;
  pencilColor: string;
  pencilSize: number;
  // Derived theme for canvas content (Konva layers), based on current in-canvas background.
  canvasBackgroundColor: string;
  canvasForegroundColor: string;
  canvasBackgroundPreference: CanvasBackgroundPreference;
  setCanvasTheme: (theme: {
    backgroundColor?: string;
    foregroundColor?: string;
  }) => void;
  setCanvasBackgroundPreference: (
    preference: CanvasBackgroundPreference,
  ) => void;
  activePath: { points: number[]; closed: boolean } | null;
  setActivePath: (path: { points: number[]; closed: boolean } | null) => void;
  finishActivePath: () => void;

  viewportSize: { width: number; height: number };
  setViewportSize: (size: { width: number; height: number }) => void;
  fitLayerToViewport: (layerId: string, padding?: number) => void;
  // Pan only (no zoom) to ensure a layer is visible in the current viewport.
  panLayerIntoViewport: (layerId: string, padding?: number) => void;

  // Snapshot mechanism
  snapshotRequest: number;
  canvasSnapshot: string | null;

  // Layer history (timeline)
  layerHistory: LayerHistoryEntry[];
  historyIndex: number;

  // Auto Layout Toggle
  toggleSmartBoardLayout: (boardId: string) => void;
  requestSnapshot: () => void;
  setCanvasSnapshot: (url: string | null) => void;
  captureHistory: (label?: string) => void;
  resetLibTvWorkflowHistory: (label?: string) => void;
  jumpToHistory: (index: number) => void;
  undoHistory: () => void;
  redoHistory: () => void;

  // Actions
  setProjectId: (id: string) => void;
  setProjectName: (name: string) => void;
  setProjectThumbnail: (thumbnail: string | null) => void;
  setProjectMaterials: (items: ProjectMaterialItem[]) => void;
  setUserMaterials: (items: ProjectMaterialItem[]) => void;
  addProjectMaterial: (
    item: Omit<ProjectMaterialItem, "id" | "createdAt"> & {
      id?: string;
      createdAt?: number;
    },
  ) => ProjectMaterialItem | null;
  addUserMaterial: (
    item: Omit<ProjectMaterialItem, "id" | "createdAt"> & {
      id?: string;
      createdAt?: number;
    },
  ) => ProjectMaterialItem | null;
  removeProjectMaterial: (id: string) => void;
  removeUserMaterial: (id: string) => void;
  openMaterialSaveDialog: (draft: PendingProjectMaterialSaveDraft) => void;
  closeMaterialSaveDialog: () => void;
  openMaterialManager: (tab?: MaterialManagerTab) => void;
  closeMaterialManager: () => void;
  setMaterialManagerTab: (tab: MaterialManagerTab) => void;
  setMaterialManagerCreateOpen: (
    open: boolean,
    seedImage?: string | null,
    tab?: MaterialManagerTab,
  ) => void;
  setLibTvWorkflow: (workflow: LibTvWorkflowState) => void;
  setLibTvWorkflowEnabled: (enabled: boolean) => void;
  setLibTvWorkflowActiveNode: (nodeId: string | null) => void;
  addLibTvWorkflowNode: (
    kind: LibTvWorkflowNodeKind,
    options?: {
      x?: number;
      y?: number;
      linkFromNodeId?: string | null;
      linkToNodeId?: string | null;
    },
  ) => LibTvWorkflowNode;
  updateLibTvWorkflowNode: (
    nodeId: string,
    patch: Partial<LibTvWorkflowNodeData> & { title?: string },
  ) => void;
  attachLibTvWorkflowReferenceImage: (
    targetId: string,
    sourceId: string,
    sourceUrlOverride?: string,
  ) => void;
  moveLibTvWorkflowNode: (
    nodeId: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  moveLibTvWorkflowNodes: (patches: LibTvWorkflowNodeMovePatch[]) => void;
  groupLibTvWorkflowNodes: (
    nodeIds: string[],
    options?: { backgroundColor?: string; mode?: "normal" | "storyboard" },
  ) => LibTvWorkflowNode | null;
  convertLibTvWorkflowGroupToStoryboard: (
    groupId: string,
  ) => LibTvWorkflowNode | null;
  replaceLibTvWorkflowNodeWithImageGroup: (
    nodeId: string,
    items: Array<{
      url: string;
      width: number;
      height: number;
      title?: string;
    }>,
    options?: {
      title?: string;
      prompt?: string;
      aspectRatio?: string;
      imageSize?: string;
      generationCount?: number;
      jobId?: string;
      selectedOptionId?: string;
    },
  ) => void;
  ungroupLibTvWorkflowNode: (groupId: string) => void;
  setLibTvWorkflowSelectedIds: (ids: string[]) => void;
  removeLibTvWorkflowNode: (nodeId: string) => void;
  removeLibTvWorkflowNodes: (nodeIds: string[]) => void;
  addLibTvWorkflowEdge: (sourceId: string, targetId: string) => void;
  removeLibTvWorkflowEdge: (edgeId: string) => void;
  clearLibTvWorkflow: () => void;
  setLibTvWorkflowLastRun: (result: LibTvWorkflowRunResult | null) => void;
  ensureLibTvTextEditorNode: (sourceLayerId: string) => string | null;
  ensureLibTvScriptInputNode: (scriptLayerId: string) => string | null;
  ensureLibTvScriptVideoReferenceNode: (scriptLayerId: string) => string | null;
  ensureLibTvImageReferenceNode: (textLayerId: string) => string | null;
  ensureLibTvGeneratorSourceImageNode: (
    generatorLayerId: string,
  ) => string | null;
  setStagePos: (pos: { x: number; y: number }) => void;
  setViewportCamera: (camera: {
    zoom: number;
    stagePos: { x: number; y: number };
  }) => void;
  initialize: (layers: CanvasLayer[]) => void;
  addLayer: (
    layer: Omit<CanvasLayer, "id" | "visible" | "locked">,
    options?: { autoSelect?: boolean },
  ) => CanvasLayer;
  updateLayer: (id: string, attrs: Partial<CanvasLayer>) => void;
  updateLayers: (
    patches: Array<{ id: string; attrs: Partial<CanvasLayer> }>,
  ) => void;
  removeLayer: (id: string) => void;
  setLayers: (layers: CanvasLayer[]) => void;
  runImageGenerationJob: (
    params: RunCanvasImageGenerationJobParams,
  ) => Promise<string[]>;
  selectLayer: (id: string | null, multi?: boolean) => void;
  setTool: (tool: CanvasState["tool"]) => void;
  setZoom: (zoom: number) => void;
  setIsViewportMoving: (moving: boolean) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  moveUp: (id: string) => void;
  moveDown: (id: string) => void;
  toggleLock: (id: string) => void;
  toggleVisibility: (id: string) => void;
  duplicateLayer: (id: string) => void;
  removeBackground: (
    id: string,
    options?: PendingCanvasJobExecutionOptions,
  ) => Promise<void>;
  editImage: (ids: string[], prompt: string) => Promise<void>;
  setTriggerDownload: () => void;
  resetDownload: () => void;
  setIsErasing: (isErasing: boolean) => void;
  setIsTextEditing: (isTextEditing: boolean) => void;
  setIsGenerativeFilling: (isGenerativeFilling: boolean) => void;
  setIsQuickEditing: (isQuickEditing: boolean) => void;
  setIsAnnotationQuickEditing: (isAnnotationQuickEditing: boolean) => void;
  setIsAnnotating: (isAnnotating: boolean) => void;
  setIsRotateEditing: (isRotateEditing: boolean) => void;
  setIsMoveObjectEditing: (isMoveObjectEditing: boolean) => void;
  setActiveAnnotationRegionId: (
    activeAnnotationRegionId: string | null,
  ) => void;
  setIsExpanding: (isExpanding: boolean) => void;
  setActiveImageToolPanel: (panel: ActiveImageToolPanel) => void;
  setIsEyedropperPicking: (isEyedropperPicking: boolean) => void;
  setPencilColor: (color: string) => void;
  setPencilSize: (size: number) => void;
  generativeFill: (
    id: string,
    maskData: string,
    prompt: string,
  ) => Promise<void>;
  editText: (
    id: string,
    originalText: string | Array<{ originalText: string; newText: string }>,
    newText?: string,
    maskImage?: string,
    options?: PendingCanvasJobExecutionOptions,
  ) => Promise<void>;
  explodeLayer: (
    id: string,
    options?: PendingCanvasJobExecutionOptions,
  ) => Promise<void>;
  upscaleLayer: (
    id: string,
    scale: UpscalePreset,
    aspectRatio?: GeminiAspectRatioKey,
    options?: PendingCanvasJobExecutionOptions,
  ) => Promise<void>;
  eraseArea: (
    id: string,
    maskData: string,
    prompt?: string,
    options?: PendingCanvasJobExecutionOptions,
  ) => Promise<void>;
  extendLayer: (
    id: string,
    direction: "up" | "down" | "left" | "right" | "all",
    ratio?: number,
    prompt?: string,
    options?: PendingCanvasJobExecutionOptions,
  ) => Promise<void>;
  vectorizeLayer: (
    id: string,
    options?: PendingCanvasJobExecutionOptions,
  ) => Promise<string | null>;
  expandLayerWithPreset: (
    id: string,
    params: {
      scaleMultiplier: number;
      presetKey: string;
      presetLabel: string;
      prompt: string;
      expandFactor: number;
      expandRatioKey: string;
      targetWidth?: number;
      targetHeight?: number;
      model?: string;
    },
    options?: PendingCanvasJobExecutionOptions,
  ) => Promise<void>;
  generateVideo: (
    prompt: string,
    options: {
      modelId: string;
      duration?: string;
      resolution?: string;
      aspectRatio?: string;
      count?: number;
      history?: any[];
      extensionImage?: string;
      adSource?: string;
      motionRefVideo?: string;
      generateAudio?: boolean;
      audioEnabled?: boolean;
      enableWebSearch?: boolean;
      tools?: Array<{ type: string }>;
      returnLastFrame?: boolean;
      editMode?: "extend" | "removal" | "addition" | "swap" | string;
      _job?: PendingCanvasJobExecutionOptions;
    },
  ) => Promise<void>;
  removeVideoWatermark: () => Promise<void>;

  // Merge Layers
  isMerging: boolean;
  mergeLayers: (ids: string[]) => void;
  finishMerge: (newLayout: CanvasLayer, mergedIds?: string[]) => void;

  // Group Layers
  createGroup: (ids: string[]) => void;
  ungroupLayer: (groupId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;

  // Group Layers
  groupLayers: (ids: string[]) => void;
  ungroupLayers: (groupId: string) => void;

  // Video Generation State
  duration: string;
  resolution: string;
  aspectRatio: string;
  videoStyle: string;
  audioEnabled: boolean;
  cameraControl: string;
  extendMode: boolean;

  // Video Actions
  setDuration: (duration: string) => void;
  setResolution: (resolution: string) => void;
  setAspectRatio: (aspectRatio: string) => void;
  setVideoStyle: (style: string) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setCameraControl: (control: string) => void;
  setExtendMode: (enabled: boolean) => void;
  extensionImage: string | null;
  setExtensionImage: (url: string | null) => void;

  // Ad Insertion State
  adSource: string | null;
  setAdSource: (url: string | null) => void;

  // Motion Control State
  motionRefVideo: string | null;
  setMotionRefVideo: (url: string | null) => void;
  isMotionMode: boolean;
  setMotionMode: (enabled: boolean) => void;
}

function buildPendingJobFromCanvasBackendJob(
  projectId: string,
  backendJob: CanvasBackendJobRecord,
): PendingCanvasLayerJob | null {
  const request =
    backendJob.payload?.request &&
    typeof backendJob.payload.request === "object"
      ? backendJob.payload.request
      : {};
  const layerId = String(request.layerId || "").trim();
  const now = Date.now();
  const base = {
    jobId: backendJob.id,
    projectId,
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  } satisfies Omit<PendingCanvasLayerJob, "kind" | "payload">;

  if (backendJob.kind === "remove_bg") {
    if (!layerId) return null;
    return {
      ...base,
      kind: "remove-bg",
      payload: { layerId, backendJobId: backendJob.id },
    };
  }
  if (backendJob.kind === "edit_text") {
    if (!layerId) return null;
    return {
      ...base,
      kind: "edit-text",
      payload: {
        layerId,
        originalText: request.originalText,
        newText: request.newText,
        maskImage: request.maskImage,
        changes: request.changes,
        backendJobId: backendJob.id,
      },
    };
  }
  if (backendJob.kind === "explode") {
    if (!layerId) return null;
    return {
      ...base,
      kind: "explode",
      payload: { layerId, backendJobId: backendJob.id },
    };
  }
  if (backendJob.kind === "upscale") {
    if (!layerId) return null;
    const resultUrl = resolveCanvasBackendJobResultUrl(backendJob);
    const placeholderId = String(
      request.placeholderId ||
        request.resultLayerId ||
        request.outputLayerId ||
        (backendJob.status === "success" && resultUrl
          ? `canvas-upscale-${backendJob.id}`
          : ""),
    ).trim();
    return {
      ...base,
      kind: "upscale",
      payload: {
        layerId,
        scale: request.scale || request.imageSize || "2K",
        aspectRatio: request.aspectRatio,
        placeholderId: placeholderId || undefined,
        backendJobId: backendJob.id,
        resultUrl: resultUrl || undefined,
      },
    };
  }
  if (backendJob.kind === "image_generate") {
    const externalTask =
      backendJob.resultData?.externalTask &&
      typeof backendJob.resultData.externalTask === "object"
        ? backendJob.resultData.externalTask
        : {};
    const targetLayerIds = Array.isArray(request.targetLayerIds)
      ? request.targetLayerIds
          .map((item: unknown) => String(item || "").trim())
          .filter(Boolean)
      : [];
    const targetLayerDrafts = Array.isArray(request.targetLayerDrafts)
      ? request.targetLayerDrafts
      : [];
    return {
      ...base,
      kind: "image-generate",
      payload: {
        backendJobId: backendJob.id,
        taskId:
          typeof externalTask.taskId === "string"
            ? externalTask.taskId
            : undefined,
        taskType:
          typeof externalTask.taskType === "string"
            ? externalTask.taskType
            : undefined,
        providerKey:
          typeof externalTask.providerKey === "string"
            ? externalTask.providerKey
            : undefined,
        modelId:
          typeof request.modelId === "string"
            ? request.modelId
            : typeof request.model === "string"
              ? request.model
              : undefined,
        targetLayerIds,
        targetLayerDrafts,
        prompt: typeof request.prompt === "string" ? request.prompt : undefined,
        ratio:
          typeof request.ratio === "string"
            ? request.ratio
            : typeof request.size === "string"
              ? request.size
              : undefined,
        resolution:
          typeof request.resolution === "string"
            ? request.resolution
            : undefined,
      },
    };
  }
  if (backendJob.kind === "erase") {
    if (!layerId) return null;
    const maskData = String(request.maskData || "");
    if (!maskData) return null;
    return {
      ...base,
      kind: "erase",
      payload: {
        layerId,
        maskData,
        prompt: typeof request.prompt === "string" ? request.prompt : undefined,
        backendJobId: backendJob.id,
      },
    };
  }
  if (backendJob.kind === "vectorize") {
    if (!layerId) return null;
    return {
      ...base,
      kind: "vectorize",
      payload: { layerId, backendJobId: backendJob.id },
    };
  }
  if (backendJob.kind === "outpaint") {
    if (!layerId) return null;
    const operation = String(request._canvasOperation || "")
      .trim()
      .toLowerCase();
    if (operation === "expand") {
      const expandParamsRaw =
        request.expandParams && typeof request.expandParams === "object"
          ? request.expandParams
          : request;
      return {
        ...base,
        kind: "expand",
        payload: {
          layerId,
          params: {
            scaleMultiplier: Number(expandParamsRaw.scaleMultiplier || 1),
            presetKey: String(expandParamsRaw.presetKey || "general"),
            presetLabel: String(expandParamsRaw.presetLabel || "扩图"),
            prompt: String(expandParamsRaw.prompt || request.prompt || ""),
            expandFactor: Number(
              expandParamsRaw.expandFactor || request.ratio || 1,
            ),
            expandRatioKey: String(expandParamsRaw.expandRatioKey || ""),
            model:
              typeof expandParamsRaw.model === "string"
                ? expandParamsRaw.model
                : undefined,
          },
          backendJobId: backendJob.id,
        },
      };
    }
    const direction = String(request.direction || "").trim();
    if (!direction) return null;
    return {
      ...base,
      kind: "extend",
      payload: {
        layerId,
        direction,
        ratio: Number(request.ratio),
        prompt: typeof request.prompt === "string" ? request.prompt : undefined,
        backendJobId: backendJob.id,
      },
    };
  }
  return null;
}

async function syncPendingCanvasLayerJobsFromBackend(
  projectId: string,
): Promise<PendingCanvasLayerJob[]> {
  if (typeof window === "undefined") return [];
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) return [];

  try {
    const response = await fetch(
      `/api/canvas/jobs?projectId=${encodeURIComponent(normalizedProjectId)}&limit=80`,
      {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      },
    );
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null);
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : [];
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const backendJobs = rows
      .map((item) => normalizeCanvasBackendJobRecord(item))
      .filter((item): item is CanvasBackendJobRecord => Boolean(item))
      .filter((item) => item.status === "processing");

    return backendJobs
      .map((backendJob) =>
        buildPendingJobFromCanvasBackendJob(normalizedProjectId, backendJob),
      )
      .filter((job): job is PendingCanvasLayerJob => Boolean(job));
  } catch (error) {
    console.warn("[Canvas] Failed to sync backend jobs for recovery:", error);
    return [];
  }
}

async function recoverPendingCanvasLayerJob(
  job: PendingCanvasLayerJob,
  getState: () => CanvasState,
) {
  const jobId = String(job.jobId || "").trim();
  if (!jobId || activePendingCanvasRecoveryJobIds.has(jobId)) return;
  activePendingCanvasRecoveryJobIds.add(jobId);
  try {
    const state = getState();
    if (state.projectId !== job.projectId) return;

    switch (job.kind) {
      case "remove-bg": {
        const layerId = String(job.payload?.layerId || "").trim();
        if (!layerId) {
          return;
        }
        await state.removeBackground(layerId, {
          resumeJobId: jobId,
          existingBackendJobId:
            typeof job.payload?.backendJobId === "string"
              ? job.payload.backendJobId
              : undefined,
        });
        return;
      }
      case "edit-text": {
        const layerId = String(job.payload?.layerId || "").trim();
        const originalText = job.payload?.originalText;
        const newText =
          typeof job.payload?.newText === "string"
            ? job.payload.newText
            : undefined;
        const maskImage =
          typeof job.payload?.maskImage === "string"
            ? job.payload.maskImage
            : undefined;
        if (
          !layerId ||
          (!Array.isArray(originalText) && typeof originalText !== "string")
        ) {
          return;
        }
        await state.editText(layerId, originalText as any, newText, maskImage, {
          resumeJobId: jobId,
          placeholderId:
            typeof job.payload?.resultLayerId === "string"
              ? job.payload.resultLayerId
              : undefined,
          existingBackendJobId:
            typeof job.payload?.backendJobId === "string"
              ? job.payload.backendJobId
              : undefined,
        });
        return;
      }
      case "explode": {
        const layerId = String(job.payload?.layerId || "").trim();
        if (!layerId) {
          return;
        }
        await state.explodeLayer(layerId, {
          resumeJobId: jobId,
          placeholderId:
            typeof job.payload?.placeholderId === "string"
              ? job.payload.placeholderId
              : undefined,
          existingBackendJobId:
            typeof job.payload?.backendJobId === "string"
              ? job.payload.backendJobId
              : undefined,
        });
        return;
      }
      case "upscale": {
        const layerId = String(job.payload?.layerId || "").trim();
        const scale = job.payload?.scale as UpscalePreset;
        if (!layerId || !scale) {
          return;
        }
        const resultUrl = String(job.payload?.resultUrl || "").trim();
        const placeholderId =
          typeof job.payload?.placeholderId === "string"
            ? job.payload.placeholderId
            : undefined;
        if (resultUrl) {
          const current = getState();
          const resultUrlEncoded = encodeURIComponent(resultUrl);
          const alreadyApplied = current.layers.some((layer) => {
            const values = [
              layer.src,
              layer.genResultImage,
              layer.libtvMediaUrl,
            ]
              .map((value) => String(value || "").trim())
              .filter(Boolean);
            return values.some(
              (value) =>
                value === resultUrl ||
                value.includes(resultUrl) ||
                value.includes(resultUrlEncoded),
            );
          });
          if (alreadyApplied) return;
        }
        await state.upscaleLayer(
          layerId,
          scale,
          typeof job.payload?.aspectRatio === "string" &&
            isGeminiAspectRatioKey(job.payload.aspectRatio)
            ? job.payload.aspectRatio
            : undefined,
          {
            resumeJobId: jobId,
            placeholderId,
            existingTaskId:
              typeof job.payload?.taskId === "string"
                ? job.payload.taskId
                : undefined,
            existingBackendJobId:
              typeof job.payload?.backendJobId === "string"
                ? job.payload.backendJobId
                : undefined,
          },
        );
        return;
      }
      case "image-generate": {
        const backendJobId = String(job.payload?.backendJobId || jobId).trim();
        const targetLayerIds = Array.isArray(job.payload?.targetLayerIds)
          ? job.payload.targetLayerIds
              .map((item: unknown) => String(item || "").trim())
              .filter(Boolean)
          : [];

        const targetLayerDrafts = Array.isArray(job.payload?.targetLayerDrafts)
          ? job.payload.targetLayerDrafts
          : [];
        if (targetLayerIds.length > 0) {
          const current = getState();
          const existingIds = new Set(current.layers.map((layer) => layer.id));
          const restoredLayers = targetLayerDrafts
            .filter((draft: any) => draft && typeof draft === "object")
            .filter(
              (draft: any) =>
                String(draft.id || "").trim() &&
                !existingIds.has(String(draft.id || "").trim()),
            )
            .map((draft: any) => ({
              ...draft,
              visible: draft.visible !== false,
              locked: draft.locked === true,
              genStatus: "generating" as const,
              genStatusLabel: String(draft.genStatusLabel || "正在生成图片"),
              genTaskId:
                typeof job.payload?.taskId === "string"
                  ? job.payload.taskId
                  : draft.genTaskId,
              genTaskType:
                typeof job.payload?.taskType === "string"
                  ? job.payload.taskType
                  : draft.genTaskType,
              genProviderKey:
                typeof job.payload?.providerKey === "string"
                  ? job.payload.providerKey
                  : draft.genProviderKey,
            }));
          current.setLayers([
            ...current.layers.map((layer) =>
              targetLayerIds.includes(layer.id)
                ? {
                    ...layer,
                    genStatus: "generating" as const,
                    genStatusLabel: String(
                      layer.genStatusLabel || "正在生成图片",
                    ),
                    genTaskId:
                      typeof job.payload?.taskId === "string"
                        ? job.payload.taskId
                        : layer.genTaskId,
                    genTaskType:
                      typeof job.payload?.taskType === "string"
                        ? job.payload.taskType
                        : layer.genTaskType,
                    genProviderKey:
                      typeof job.payload?.providerKey === "string"
                        ? job.payload.providerKey
                        : layer.genProviderKey,
                  }
                : layer,
            ),
            ...restoredLayers,
          ]);
        }

        const completedJob = await waitCanvasBackendJob({
          jobId: backendJobId,
          onProgress: (backendJob) => {
            if (targetLayerIds.length === 0) return;
            const current = getState();
            const label = String(
              backendJob.resultData?.message || "正在生成图片",
            );
            current.setLayers(
              current.layers.map((layer) =>
                targetLayerIds.includes(layer.id)
                  ? {
                      ...layer,
                      genStatus: "generating" as const,
                      genStatusLabel: label,
                    }
                  : layer,
              ),
            );
          },
        });
        const images = collectImagesFromGeneratedTaskStatusPayload(
          completedJob.resultData?.response,
        );
        const directResultUrl = resolveCanvasBackendJobResultUrl(completedJob);
        if (images.length === 0 && directResultUrl)
          images.push(directResultUrl);
        if (images.length === 0) throw new Error("图片生成返回为空");

        if (targetLayerIds.length > 0) {
          const current = getState();
          const appliedIds = new Set<string>();
          const nextLayers = current.layers.map((layer) => {
            const index = targetLayerIds.indexOf(layer.id);
            if (index < 0) return layer;
            const imageUrl = String(images[index] || "").trim();
            if (!imageUrl) {
              return {
                ...layer,
                genStatus: "idle" as const,
                genStatusLabel: undefined,
              };
            }
            appliedIds.add(layer.id);
            return {
              ...layer,
              type: "image" as const,
              src: imageUrl,
              fill: undefined,
              stroke: undefined,
              strokeWidth: undefined,
              genStatus: "idle" as const,
              genStatusLabel: undefined,
              genResultImage: imageUrl,
              genReferenceImage: imageUrl,
              genPrompt:
                typeof job.payload?.prompt === "string"
                  ? job.payload.prompt
                  : layer.genPrompt,
              genModel:
                typeof job.payload?.modelId === "string"
                  ? job.payload.modelId
                  : layer.genModel,
              genTaskId:
                typeof job.payload?.taskId === "string"
                  ? job.payload.taskId
                  : layer.genTaskId,
              genTaskType:
                typeof job.payload?.taskType === "string"
                  ? job.payload.taskType
                  : layer.genTaskType,
              genProviderKey:
                typeof job.payload?.providerKey === "string"
                  ? job.payload.providerKey
                  : layer.genProviderKey,
              genRatio:
                typeof job.payload?.ratio === "string"
                  ? job.payload.ratio
                  : layer.genRatio,
              genResolution:
                typeof job.payload?.resolution === "string"
                  ? job.payload.resolution
                  : layer.genResolution,
            };
          });
          current.setLayers(
            nextLayers.filter((layer) => {
              if (!targetLayerIds.includes(layer.id)) return true;
              const index = targetLayerIds.indexOf(layer.id);
              return index === 0 || appliedIds.has(layer.id);
            }),
          );
        }
        return;
      }
      case "video": {
        const prompt = String(job.payload?.prompt || "").trim();
        if (!prompt) {
          return;
        }
        const rawOptions =
          job.payload?.options && typeof job.payload.options === "object"
            ? (job.payload.options as Record<string, any>)
            : {};
        const normalizedOptions = {
          ...rawOptions,
          modelId: String(rawOptions.modelId || ""),
          _job: {
            resumeJobId: jobId,
            existingTaskId:
              typeof job.payload?.taskId === "string"
                ? job.payload.taskId
                : undefined,
            existingTaskType:
              typeof job.payload?.taskType === "string"
                ? job.payload.taskType
                : undefined,
            existingProviderKey:
              typeof job.payload?.providerKey === "string"
                ? job.payload.providerKey
                : undefined,
            existingStatusUrl:
              typeof job.payload?.statusUrl === "string"
                ? job.payload.statusUrl
                : undefined,
            existingBackgroundTaskId:
              typeof job.payload?.backgroundTaskId === "string"
                ? job.payload.backgroundTaskId
                : undefined,
            existingOutputLayerId:
              typeof job.payload?.outputLayerId === "string"
                ? job.payload.outputLayerId
                : undefined,
            existingSourceLayerId:
              typeof job.payload?.sourceLayerId === "string"
                ? job.payload.sourceLayerId
                : undefined,
          } satisfies PendingCanvasJobExecutionOptions,
        };
        await state.generateVideo(prompt, normalizedOptions as any);
        return;
      }
      case "vectorize": {
        const layerId = String(job.payload?.layerId || "").trim();
        if (!layerId) {
          return;
        }
        await state.vectorizeLayer(layerId, {
          resumeJobId: jobId,
          placeholderId:
            typeof job.payload?.placeholderId === "string"
              ? job.payload.placeholderId
              : undefined,
          existingBackendJobId:
            typeof job.payload?.backendJobId === "string"
              ? job.payload.backendJobId
              : undefined,
        });
        return;
      }
      case "expand": {
        const layerId = String(job.payload?.layerId || "").trim();
        if (!layerId) {
          return;
        }
        const params =
          job.payload?.params && typeof job.payload.params === "object"
            ? (job.payload.params as Record<string, any>)
            : {};
        await state.expandLayerWithPreset(
          layerId,
          {
            scaleMultiplier: Number(params.scaleMultiplier || 1),
            presetKey: String(params.presetKey || "general"),
            presetLabel: String(params.presetLabel || "扩图"),
            prompt: String(params.prompt || ""),
            expandFactor: Number(params.expandFactor || 1),
            expandRatioKey: String(params.expandRatioKey || ""),
            targetWidth: Number.isFinite(Number(params.targetWidth))
              ? Number(params.targetWidth)
              : undefined,
            targetHeight: Number.isFinite(Number(params.targetHeight))
              ? Number(params.targetHeight)
              : undefined,
            model: typeof params.model === "string" ? params.model : undefined,
          },
          {
            resumeJobId: jobId,
            placeholderId:
              typeof job.payload?.placeholderId === "string"
                ? job.payload.placeholderId
                : undefined,
            existingBackendJobId:
              typeof job.payload?.backendJobId === "string"
                ? job.payload.backendJobId
                : undefined,
          },
        );
        return;
      }
      case "extend": {
        const layerId = String(job.payload?.layerId || "").trim();
        const direction = String(job.payload?.direction || "") as
          | "up"
          | "down"
          | "left"
          | "right"
          | "all";
        if (!layerId || !direction) {
          return;
        }
        const ratio = Number(job.payload?.ratio);
        const prompt =
          typeof job.payload?.prompt === "string"
            ? job.payload.prompt
            : undefined;
        await state.extendLayer(
          layerId,
          direction,
          Number.isFinite(ratio) ? ratio : undefined,
          prompt,
          {
            resumeJobId: jobId,
            existingBackendJobId:
              typeof job.payload?.backendJobId === "string"
                ? job.payload.backendJobId
                : undefined,
          },
        );
        return;
      }
      case "erase": {
        const layerId = String(job.payload?.layerId || "").trim();
        const maskData = String(job.payload?.maskData || "");
        const prompt =
          typeof job.payload?.prompt === "string"
            ? job.payload.prompt
            : undefined;
        if (!layerId || !maskData) {
          return;
        }
        await state.eraseArea(layerId, maskData, prompt, {
          resumeJobId: jobId,
          placeholderId:
            typeof job.payload?.placeholderId === "string"
              ? job.payload.placeholderId
              : undefined,
          existingBackendJobId:
            typeof job.payload?.backendJobId === "string"
              ? job.payload.backendJobId
              : undefined,
        });
        return;
      }
      default:
        return;
    }
  } catch (error) {
    console.warn("[Canvas] Pending job recovery failed:", job.kind, error);
  } finally {
    activePendingCanvasRecoveryJobIds.delete(jobId);
  }
}

async function recoverPendingCanvasProviderLayerTasks(
  getState: () => CanvasState,
) {
  const current = getState();
  const groups = new Map<string, CanvasLayer[]>();
  current.layers.forEach((layer) => {
    if (layer.genStatus !== "generating") return;
    // Agent/Canvas Jobs own their recovery lifecycle. Only resume bare provider tasks here.
    if (String(layer.genJobId || "").trim()) return;
    const taskId = String(layer.genTaskId || "").trim();
    if (!taskId) return;
    const statusUrl = String(layer.genStatusUrl || "").trim();
    const providerKey = String(
      layer.genProviderKey || readProviderKeyFromTaskStatusUrl(statusUrl) || "",
    ).trim();
    const taskType = String(layer.genTaskType || "").trim();
    const key = [taskId, taskType, providerKey, statusUrl].join("|");
    const existing = groups.get(key) || [];
    existing.push(layer);
    groups.set(key, existing);
  });

  for (const [taskKey, taskLayers] of groups) {
    if (activePendingCanvasProviderTaskKeys.has(taskKey)) continue;
    activePendingCanvasProviderTaskKeys.add(taskKey);
    try {
      const firstLayer = taskLayers[0];
      const taskId = String(firstLayer.genTaskId || "").trim();
      const statusUrl = String(firstLayer.genStatusUrl || "").trim();
      const providerKey = String(
        firstLayer.genProviderKey ||
          readProviderKeyFromTaskStatusUrl(statusUrl) ||
          "",
      ).trim();
      const modelId = String(firstLayer.genModel || "").trim();
      const rawTaskType = String(firstLayer.genTaskType || "").trim();
      if (!providerKey) {
        throw new Error("历史异步任务缺少 providerKey，禁止猜测供应商");
      }
      const isVideoTask =
        firstLayer.type === "video" ||
        firstLayer.type === "video_gen_frame" ||
        /video/i.test(rawTaskType);
      const taskType = resolveUnifiedProviderTaskType({
        taskType: rawTaskType,
        modelId,
        providerKey,
        fallback: isVideoTask ? "image2video" : "image-generation",
      });
      const patchGroup = (
        patcher: (layer: CanvasLayer, index: number) => Partial<CanvasLayer>,
      ) => {
        const ids = new Set(taskLayers.map((layer) => layer.id));
        const state = getState();
        state.setLayers(
          state.layers.map((layer) => {
            if (
              !ids.has(layer.id) ||
              String(layer.genTaskId || "").trim() !== taskId
            )
              return layer;
            return {
              ...layer,
              ...patcher(
                layer,
                taskLayers.findIndex((item) => item.id === layer.id),
              ),
            };
          }),
        );
      };
      patchGroup(() => ({
        genStatus: "generating",
        genStatusLabel: isVideoTask ? "正在恢复视频任务" : "正在恢复图片任务",
        genTaskType: taskType,
        genProviderKey: providerKey,
      }));

      if (isVideoTask) {
        const isSeedanceBackgroundTask = isOfficialSeedanceTaskContext({
          taskType,
          providerKey,
        });
        const pollIntervalMs = resolveProviderVideoPollIntervalMs({
          taskType,
          providerKey,
          fallbackMs: 3000,
        });
        let resultUrls: string[] = [];
        for (
          let attempt = 0;
          attempt < (isSeedanceBackgroundTask ? 120 : 100);
          attempt += 1
        ) {
          if (attempt > 0)
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          const result = await queryUnifiedVideoTaskStatus({
            providerTaskId: taskId,
            taskType,
            statusUrl: statusUrl || undefined,
            modelId: modelId || undefined,
            providerKey,
            seedanceJobId: isSeedanceBackgroundTask
              ? String(firstLayer.genBackgroundTaskId || "").trim() || undefined
              : undefined,
            projectId: current.projectId || undefined,
            cache: "no-store",
          });
          if (result.status === "failed")
            throw new Error(result.statusMessage || "视频生成失败");
          if (result.status === "succeed" && result.videos.length > 0) {
            resultUrls = result.videos;
            break;
          }
          patchGroup(() => ({
            genStatus: "generating",
            genStatusLabel:
              typeof result.progress === "number"
                ? `视频生成中 ${Math.max(1, Math.min(99, Math.round(result.progress * 100)))}%`
                : result.statusMessage || "视频生成中",
          }));
        }
        if (resultUrls.length === 0) throw new Error("视频任务恢复超时");
        patchGroup((_layer, index) => {
          const url =
            resultUrls[index] || (taskLayers.length === 1 ? resultUrls[0] : "");
          return url
            ? {
                type: "video",
                src: url,
                genStatus: "success",
                genStatusLabel: undefined,
              }
            : {
                genStatus: "failed",
                genStatusLabel: "任务完成但未返回对应视频",
              };
        });
        continue;
      }

      const imageStatusUrl = buildProviderTaskStatusUrl({
        taskId,
        taskType,
        statusUrl,
        providerKey,
        modelId,
        projectId: current.projectId,
      });
      let resultUrls: string[] = [];
      for (let attempt = 0; attempt < 180; attempt += 1) {
        if (attempt > 0)
          await new Promise((resolve) => setTimeout(resolve, 3000));
        const response = await fetch(imageStatusUrl, {
          cache: "no-store",
          credentials: "include",
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            String(
              payload?.error ||
                payload?.message ||
                `图片任务查询失败: HTTP ${response.status}`,
            ),
          );
        resultUrls = collectImagesFromGeneratedTaskStatusPayload(payload);
        if (resultUrls.length > 0) break;
        const status = String(
          payload?.data?.task_status ||
            payload?.task_status ||
            payload?.status ||
            payload?.data?.status ||
            "",
        )
          .trim()
          .toLowerCase();
        if (
          [
            "failed",
            "fail",
            "error",
            "cancelled",
            "canceled",
            "expired",
          ].includes(status)
        ) {
          throw new Error(
            String(
              payload?.data?.task_status_msg ||
                payload?.error ||
                payload?.message ||
                "图片生成失败",
            ),
          );
        }
      }
      if (resultUrls.length === 0) throw new Error("图片任务恢复超时");
      patchGroup((_layer, index) => {
        const url =
          resultUrls[index] || (taskLayers.length === 1 ? resultUrls[0] : "");
        return url
          ? {
              type: "image",
              src: url,
              genResultImage: url,
              genReferenceImage: url,
              genStatus: "idle",
              genStatusLabel: undefined,
            }
          : { genStatus: "failed", genStatusLabel: "任务完成但未返回对应图片" };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "异步任务恢复失败";
      const ids = new Set(taskLayers.map((layer) => layer.id));
      const state = getState();
      state.setLayers(
        state.layers.map((layer) =>
          ids.has(layer.id)
            ? {
                ...layer,
                genStatus: "failed" as const,
                genStatusLabel: message.slice(0, 80),
              }
            : layer,
        ),
      );
    } finally {
      activePendingCanvasProviderTaskKeys.delete(taskKey);
    }
  }
}

function schedulePendingCanvasLayerRecovery(
  projectId: string,
  getState: () => CanvasState,
) {
  if (typeof window === "undefined") return;
  const normalizedProjectId = String(projectId || "").trim();
  if (!normalizedProjectId) return;
  const existingTimer = pendingCanvasRecoveryTimers.get(normalizedProjectId);
  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }
  const timer = window.setTimeout(async () => {
    pendingCanvasRecoveryTimers.delete(normalizedProjectId);
    const jobs =
      await syncPendingCanvasLayerJobsFromBackend(normalizedProjectId);
    for (const job of jobs) {
      await recoverPendingCanvasLayerJob(job, getState);
    }
    await recoverPendingCanvasProviderLayerTasks(getState);
  }, 320);
  pendingCanvasRecoveryTimers.set(normalizedProjectId, timer);
}

function normalizeGeneratedTaskImageValue(value: unknown): string {
  if (typeof value === "string") return normalizeRenderableImageUrl(value);
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  return normalizeRenderableImageUrl(
    String(
      row.url ||
        row.imageUrl ||
        row.image_url ||
        row.src ||
        row.fileUrl ||
        row.file_url ||
        row.resultUrl ||
        row.result_url ||
        row.mediaUrl ||
        row.media_url ||
        row.downloadUrl ||
        row.download_url ||
        "",
    ).trim(),
  );
}

function collectImagesFromGeneratedTaskStatusPayload(payload: any): string[] {
  const list: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalizeGeneratedTaskImageValue(value);
    if (normalized) list.push(normalized);
  };

  const arrays = [
    payload?.images,
    payload?.data?.images,
    payload?.result?.images,
    payload?.task_result?.images,
    payload?.data?.task_result?.images,
    payload?.data?.result?.images,
    payload?.data?.raw?.result?.images,
    payload?.data?.raw?.data?.result?.images,
    payload?.result?.imageUrls,
    payload?.data?.imageUrls,
    payload?.data?.task_result?.imageUrls,
    payload?.result?.image_urls,
    payload?.data?.image_urls,
    payload?.data?.task_result?.image_urls,
    payload?.output,
    payload?.outputs,
    payload?.data?.output,
    payload?.data?.outputs,
  ];
  arrays.forEach((items) => {
    if (Array.isArray(items)) items.forEach(push);
  });
  push(payload?.imageUrl);
  push(payload?.image_url);
  push(payload?.resultUrl);
  push(payload?.result_url);
  push(payload?.url);
  push(payload?.result?.imageUrl);
  push(payload?.result?.image_url);
  push(payload?.result?.resultUrl);
  push(payload?.result?.result_url);
  push(payload?.data?.imageUrl);
  push(payload?.data?.image_url);
  push(payload?.data?.resultUrl);
  push(payload?.data?.result_url);
  push(payload?.data?.task_result?.imageUrl);
  push(payload?.data?.task_result?.image_url);
  push(payload?.data?.task_result?.resultUrl);
  push(payload?.data?.task_result?.result_url);
  return Array.from(
    new Set(list.map((item) => String(item || "").trim()).filter(Boolean)),
  );
}

// Store creator function for HMR-safe store
const createPhilartStore = () =>
  create<CanvasState>((set, get) => ({
    layers: [],
    selectedIds: [],
    tool: "select",
    zoom: DEFAULT_CANVAS_OPEN_ZOOM,
    stagePos: { x: 0, y: 0 },
    isViewportMoving: false,
    projectId: null,
    projectName: "未命名项目",
    projectThumbnail: null,
    projectMaterials: [],
    userMaterials: [],
    materialManagerOpen: false,
    materialManagerTab: "materials",
    materialManagerCreateOpen: false,
    materialManagerSeedImage: null,
    materialSaveDialogOpen: false,
    materialSaveDraft: null,
    libtvWorkflow: { ...EMPTY_LIBTV_WORKFLOW_STATE },
    downloadTrigger: 0,
    snapshotRequest: 0,
    canvasSnapshot: null,
    layerHistory: [],
    historyIndex: -1,
    isErasing: false,
    isTextEditing: false,
    isGenerativeFilling: false,
    isQuickEditing: false,
    isAnnotationQuickEditing: false,
    isAnnotating: false,
    isRotateEditing: false,
    isMoveObjectEditing: false,
    activeAnnotationRegionId: null,
    isExpanding: false,
    activeImageToolPanel: null,
    isEyedropperPicking: false,
    pencilColor: "#000000",
    pencilSize: 2,
    canvasBackgroundColor: "#f5f5f5",
    canvasForegroundColor: "#141414",
    canvasBackgroundPreference: readCanvasBackgroundPreference(),
    setCanvasTheme: (theme) =>
      set((state) => ({
        canvasBackgroundColor:
          typeof theme?.backgroundColor === "string" &&
          theme.backgroundColor.trim()
            ? theme.backgroundColor.trim()
            : state.canvasBackgroundColor,
        canvasForegroundColor:
          typeof theme?.foregroundColor === "string" &&
          theme.foregroundColor.trim()
            ? theme.foregroundColor.trim()
            : state.canvasForegroundColor,
      })),
    setCanvasBackgroundPreference: (preference) => {
      persistCanvasBackgroundPreference(preference);
      set({ canvasBackgroundPreference: preference });
    },

    // Video Generation State
    duration: "5s",
    resolution: "720p",
    aspectRatio: "16:9",
    videoStyle: "",
    audioEnabled: false,
    cameraControl: "",
    extendMode: false,

    setDuration: (duration) => set({ duration }),
    setResolution: (resolution) => set({ resolution }),
    setAspectRatio: (aspectRatio) => set({ aspectRatio }),
    setVideoStyle: (style) => set({ videoStyle: style }),
    setAudioEnabled: (enabled) => set({ audioEnabled: enabled }),
    setCameraControl: (control) => set({ cameraControl: control }),
    setExtendMode: (enabled) => set({ extendMode: enabled }),
    extensionImage: null,
    setExtensionImage: (url) => set({ extensionImage: url }),

    // Ad Insertion State
    adSource: null,
    setAdSource: (url) => set({ adSource: url }),

    // Motion Control State
    motionRefVideo: null,
    setMotionRefVideo: (url) => set({ motionRefVideo: url }),
    isMotionMode: false,
    setMotionMode: (enabled) => set({ isMotionMode: enabled }),

    activePath: null,
    setActivePath: (path) => set({ activePath: path }),
    finishActivePath: () => {
      const { activePath, pencilColor, pencilSize, addLayer } = get();
      if (!activePath || activePath.points.length < 4) {
        set({ activePath: null });
        return;
      }
      addLayer({
        type: "path",
        name: "路径",
        x: 0,
        y: 0,
        points: activePath.points,
        stroke: pencilColor,
        strokeWidth: pencilSize,
        // closed: activePath.closed // Optional: depending on PathLayer support
      });
      set({ activePath: null });
    },

    isMerging: false,

    viewportSize: { width: 1920, height: 1080 },
    setViewportSize: (size) =>
      set((state) => {
        const width = Math.max(1, Math.round(Number(size?.width || 1)));
        const height = Math.max(1, Math.round(Number(size?.height || 1)));
        if (
          state.viewportSize.width === width &&
          state.viewportSize.height === height
        ) {
          return state;
        }
        return {
          viewportSize: {
            width,
            height,
          },
        };
      }),

    fitLayerToViewport: (layerId: string, padding = 140) => {
      const { layers, viewportSize, setZoom, setStagePos } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || !viewportSize.width || !viewportSize.height) return;

      const next = fitLayersToViewport({
        allLayers: layers,
        candidateLayers: [layer],
        viewport: viewportSize,
        padding,
        maxZoomIn: 1,
        widthFallback: 200,
        heightFallback: 200,
      });
      if (!next) return;

      setZoom(next.zoom);
      setStagePos(next.stagePos);
    },

    panLayerIntoViewport: (layerId: string, padding = 96) => {
      // Pan only: keep zoom unchanged, only move the stage so the layer is visible.
      if (typeof window === "undefined") return;
      const { layers, viewportSize, stagePos, zoom, setStagePos } = get();
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || !viewportSize?.width || !viewportSize?.height) return;

      const zoomSigned = Number(zoom || 1);
      const zoomAbs = Math.max(0.0001, Math.abs(zoomSigned));
      const padWorld = Math.max(0, Number(padding || 0)) / zoomAbs;

      const viewLeft = (0 - Number(stagePos?.x || 0)) / zoomAbs + padWorld;
      const viewTop = (0 - Number(stagePos?.y || 0)) / zoomAbs + padWorld;
      const viewRight =
        (Number(viewportSize.width) - Number(stagePos?.x || 0)) / zoomAbs -
        padWorld;
      const viewBottom =
        (Number(viewportSize.height) - Number(stagePos?.y || 0)) / zoomAbs -
        padWorld;
      const viewW = viewRight - viewLeft;
      const viewH = viewBottom - viewTop;
      if (!(viewW > 0 && viewH > 0)) return;

      const aabb = getLayerAabb(layer);
      const layerCenterX = aabb.minX + aabb.width / 2;
      const layerCenterY = aabb.minY + aabb.height / 2;
      const viewCenterX =
        (Number(viewportSize.width) / 2 - Number(stagePos?.x || 0)) / zoomAbs;
      const viewCenterY =
        (Number(viewportSize.height) / 2 - Number(stagePos?.y || 0)) / zoomAbs;

      let shiftX = 0;
      let shiftY = 0;

      if (aabb.width >= viewW) {
        // Too wide: center horizontally.
        shiftX = viewCenterX - layerCenterX;
      } else if (aabb.minX < viewLeft) {
        shiftX = viewLeft - aabb.minX;
      } else if (aabb.maxX > viewRight) {
        shiftX = viewRight - aabb.maxX;
      }

      if (aabb.height >= viewH) {
        // Too tall: center vertically.
        shiftY = viewCenterY - layerCenterY;
      } else if (aabb.minY < viewTop) {
        shiftY = viewTop - aabb.minY;
      } else if (aabb.maxY > viewBottom) {
        shiftY = viewBottom - aabb.maxY;
      }

      if (!shiftX && !shiftY) return;

      setStagePos({
        x: Number(stagePos?.x || 0) + shiftX * zoomAbs,
        y: Number(stagePos?.y || 0) + shiftY * zoomAbs,
      });
    },

    // Group Actions Implementation
    createGroup: (ids: string[]) =>
      set((state) => {
        if (ids.length === 0) return state;

        const parentId = uuidv4();
        const groupLayer: CanvasLayer = {
          id: parentId,
          type: "group",
          name: "Group",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          visible: true,
          locked: false,
          collapsed: false,
          children: ids,
          opacity: 1,
          blendMode: "source-over",
        };

        // Update children to reference parent
        const updatedLayers = state.layers.map((layer) => {
          if (ids.includes(layer.id)) {
            return { ...layer, parentId };
          }
          return layer;
        });

        // Insert group layer
        // Ideally we should insert it at the position of the top-most selected layer
        // But for now appending is fine, or finding the max index
        // Let's simplified: add group layer, keep children in place but they will be rendered inside group?
        // Actually for Konva Group, children need to be logically structured.
        // But our store is flat. The renderer will handle hierarchy.

        return {
          layers: [...updatedLayers, groupLayer],
          selectedIds: [parentId], // Select the new group
        };
      }),

    ungroupLayer: (groupId: string) =>
      set((state) => {
        const group = state.layers.find((l) => l.id === groupId);
        if (!group || group.type !== "group") return state;

        const groupX = group.x || 0;
        const groupY = group.y || 0;

        // Remove parentId from children and apply group offset
        const updatedLayers = state.layers
          .map((layer) => {
            if (layer.parentId === groupId) {
              return {
                ...layer,
                parentId: undefined,
                x: layer.x + groupX,
                y: layer.y + groupY,
              };
            }
            return layer;
          })
          .filter((layer) => layer.id !== groupId); // Remove group layer

        return {
          layers: updatedLayers,
          selectedIds: group.children || [], // Select children
        };
      }),

    toggleGroupCollapse: (groupId: string) =>
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === groupId ? { ...l, collapsed: !l.collapsed } : l,
        ),
      })),

    // Snapshot mechanism
    requestSnapshot: () =>
      set((state) => ({ snapshotRequest: state.snapshotRequest + 1 })),
    setCanvasSnapshot: (url) => set({ canvasSnapshot: url }),
    captureHistory: (label = "编辑图层") =>
      set((state) => {
        const historyLayers = state.layers.filter(
          (layer) => !layer.uiTransient,
        );
        if (
          historyLayers.length === 0 &&
          state.libtvWorkflow.nodes.length === 0 &&
          state.layerHistory.length === 0
        )
          return state;

        const currentLayers = cloneLayers(historyLayers);
        const currentFp = layersFingerprint(currentLayers);
        const currentWorkflow = stripLibTvWorkflowTransientHistoryData(
          state.libtvWorkflow,
        );
        const currentWorkflowFp = workflowFingerprint(currentWorkflow);
        const activeEntry = state.layerHistory[state.historyIndex];
        if (
          activeEntry &&
          layersFingerprint(activeEntry.layers) === currentFp &&
          workflowFingerprint(
            activeEntry.libtvWorkflow || EMPTY_LIBTV_WORKFLOW_STATE,
          ) === currentWorkflowFp
        ) {
          return state;
        }

        return appendHistoryEntry(state.layerHistory, state.historyIndex, {
          id: uuidv4(),
          label,
          createdAt: Date.now(),
          layers: currentLayers,
          libtvWorkflow: currentWorkflow,
        });
      }),
    resetLibTvWorkflowHistory: (label = "切换工作流画布") =>
      set((state) => ({
        layerHistory: [
          createHistoryEntry(label, state.layers, state.libtvWorkflow),
        ],
        historyIndex: 0,
      })),
    jumpToHistory: (index) =>
      set((state) => {
        if (
          index < 0 ||
          index >= state.layerHistory.length ||
          index === state.historyIndex
        )
          return state;
        const target = state.layerHistory[index];
        return {
          layers: cloneLayers(target.layers),
          libtvWorkflow: target.libtvWorkflow
            ? mergeLibTvWorkflowTransientHistoryData(
                target.libtvWorkflow,
                state.libtvWorkflow,
              )
            : state.libtvWorkflow,
          selectedIds: [],
          historyIndex: index,
        };
      }),
    undoHistory: () =>
      set((state) => {
        if (state.historyIndex <= 0) return state;
        const nextIndex = state.historyIndex - 1;
        const target = state.layerHistory[nextIndex];
        return {
          layers: cloneLayers(target.layers),
          libtvWorkflow: target.libtvWorkflow
            ? mergeLibTvWorkflowTransientHistoryData(
                target.libtvWorkflow,
                state.libtvWorkflow,
              )
            : state.libtvWorkflow,
          selectedIds: [],
          historyIndex: nextIndex,
        };
      }),
    redoHistory: () =>
      set((state) => {
        if (
          state.historyIndex < 0 ||
          state.historyIndex >= state.layerHistory.length - 1
        )
          return state;
        const nextIndex = state.historyIndex + 1;
        const target = state.layerHistory[nextIndex];
        return {
          layers: cloneLayers(target.layers),
          libtvWorkflow: target.libtvWorkflow
            ? mergeLibTvWorkflowTransientHistoryData(
                target.libtvWorkflow,
                state.libtvWorkflow,
              )
            : state.libtvWorkflow,
          selectedIds: [],
          historyIndex: nextIndex,
        };
      }),

    // Auto Layout Toggle
    toggleSmartBoardLayout: (boardId: string) =>
      set((state) => {
        const board = state.layers.find((l) => l.id === boardId);
        if (!board) return { layers: state.layers };

        // Treat layers fully contained by the board rect as "board children".
        const children = state.layers.filter(
          (l) =>
            l.id !== boardId &&
            l.visible &&
            l.x >= board.x &&
            l.x + (l.width || 0) <= board.x + (board.width || 0) &&
            l.y >= board.y &&
            l.y + (l.height || 0) <= board.y + (board.height || 0),
        );

        if (children.length === 0) return { layers: state.layers };

        const currentMode = board.smartBoardLayoutState || "manual";
        const newMode = currentMode === "manual" ? "grid" : "manual";

        if (newMode === "grid") {
          // Manual -> Grid: Save positions and Apply Layout
          const originalPositions: Record<string, { x: number; y: number }> =
            {};
          children.forEach((c) => {
            originalPositions[c.id] = { x: c.x, y: c.y };
          });

          const gap = 20;
          const columns = Math.ceil(Math.sqrt(children.length));
          const cellW = children[0].width || 100; // simplifying assumption
          const cellH = children[0].height || 100;

          // Apply a simple grid layout for smart-board children.
          const startX = board.x + 40;
          const startY = board.y + 60; // Header space

          const updatedLayers = state.layers.map((l) => {
            if (l.id === boardId) {
              return {
                ...l,
                smartBoardLayoutState: "grid" as const,
                originalPositions,
              };
            }
            const idx = children.findIndex((c) => c.id === l.id);
            if (idx !== -1) {
              const row = Math.floor(idx / columns);
              const col = idx % columns;
              return {
                ...l,
                x: startX + col * (cellW + gap),
                y: startY + row * (cellH + gap),
              };
            }
            return l;
          });

          return { layers: updatedLayers };
        } else {
          // Grid -> Manual: Restore positions
          const savedPositions = board.originalPositions || {};
          const updatedLayers = state.layers.map((l) => {
            if (l.id === boardId) {
              return {
                ...l,
                smartBoardLayoutState: "manual" as const,
                originalPositions: undefined,
              };
            }
            if (savedPositions[l.id]) {
              return {
                ...l,
                x: savedPositions[l.id].x,
                y: savedPositions[l.id].y,
              };
            }
            return l;
          });
          return { layers: updatedLayers };
        }
      }),

    setProjectId: (id) => {
      set({
        projectId: id,
        zoom: DEFAULT_CANVAS_OPEN_ZOOM,
        stagePos: { x: 0, y: 0 },
        selectedIds: [],
        projectThumbnail: null,
        projectMaterials: [],
        userMaterials: [],
        materialManagerOpen: false,
        materialManagerTab: "materials",
        materialManagerCreateOpen: false,
        materialManagerSeedImage: null,
        libtvWorkflow: { ...EMPTY_LIBTV_WORKFLOW_STATE },
        layerHistory: [],
        historyIndex: -1,
      });
      const normalizedProjectId = String(id || "").trim();
      if (normalizedProjectId) {
        pendingCanvasRecoveryBootstrappedProjects.delete(normalizedProjectId);
      }
    },
    setProjectName: (name) => set({ projectName: name }),
    setProjectThumbnail: (thumbnail) => set({ projectThumbnail: thumbnail }),
    setProjectMaterials: (items) =>
      set({
        projectMaterials: Array.isArray(items)
          ? items
              .map((item) => normalizeProjectMaterialItem(item))
              .filter((item): item is ProjectMaterialItem => Boolean(item))
              .sort(
                (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0),
              )
          : [],
      }),
    setUserMaterials: (items) =>
      set({
        userMaterials: Array.isArray(items)
          ? items
              .map((item) => normalizeProjectMaterialItem(item))
              .filter((item): item is ProjectMaterialItem => Boolean(item))
              .sort(
                (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0),
              )
          : [],
      }),
    addProjectMaterial: (item) => {
      const nextItem = normalizeProjectMaterialItem(item);
      if (!nextItem) return null;

      set((state) => {
        const duplicate = state.projectMaterials.find(
          (current) => String(current.src || "").trim() === nextItem.src,
        );
        if (duplicate) {
          return {
            projectMaterials: [
              {
                ...duplicate,
                name: nextItem.name || duplicate.name,
                thumbnailSrc: nextItem.thumbnailSrc || duplicate.thumbnailSrc,
                coverSrc: nextItem.coverSrc || duplicate.coverSrc,
                category: nextItem.category || duplicate.category || null,
                width: nextItem.width ?? duplicate.width,
                height: nextItem.height ?? duplicate.height,
                createdAt: Date.now(),
                sourceLayerId:
                  nextItem.sourceLayerId ?? duplicate.sourceLayerId ?? null,
              },
              ...state.projectMaterials.filter(
                (current) => current.id !== duplicate.id,
              ),
            ],
          };
        }

        return {
          projectMaterials: [nextItem, ...state.projectMaterials],
        };
      });

      return nextItem;
    },
    addUserMaterial: (item) => {
      const nextItem = normalizeProjectMaterialItem(item);
      if (!nextItem) return null;

      set((state) => {
        const duplicate = state.userMaterials.find(
          (current) => String(current.src || "").trim() === nextItem.src,
        );
        if (duplicate) {
          return {
            userMaterials: [
              {
                ...duplicate,
                name: nextItem.name || duplicate.name,
                thumbnailSrc: nextItem.thumbnailSrc || duplicate.thumbnailSrc,
                coverSrc: nextItem.coverSrc || duplicate.coverSrc,
                category: nextItem.category || duplicate.category || null,
                width: nextItem.width ?? duplicate.width,
                height: nextItem.height ?? duplicate.height,
                createdAt: Date.now(),
                sourceLayerId:
                  nextItem.sourceLayerId ?? duplicate.sourceLayerId ?? null,
              },
              ...state.userMaterials.filter(
                (current) => current.id !== duplicate.id,
              ),
            ],
          };
        }

        return {
          userMaterials: [nextItem, ...state.userMaterials],
        };
      });

      return nextItem;
    },
    removeProjectMaterial: (id) =>
      set((state) => ({
        projectMaterials: state.projectMaterials.filter(
          (item) => item.id !== id,
        ),
      })),
    removeUserMaterial: (id) =>
      set((state) => ({
        userMaterials: state.userMaterials.filter((item) => item.id !== id),
      })),
    openMaterialSaveDialog: (draft) =>
      set({
        materialManagerTab: "materials",
        materialSaveDialogOpen: true,
        materialSaveDraft: {
          name:
            typeof draft?.name === "string" && draft.name.trim().length > 0
              ? draft.name.trim()
              : "图片素材",
          src: String(draft?.src || "").trim(),
          thumbnailSrc:
            typeof draft?.thumbnailSrc === "string" &&
            draft.thumbnailSrc.trim().length > 0
              ? draft.thumbnailSrc.trim()
              : undefined,
          coverSrc:
            typeof draft?.coverSrc === "string" &&
            draft.coverSrc.trim().length > 0
              ? draft.coverSrc.trim()
              : undefined,
          width: Number.isFinite(Number(draft?.width))
            ? Number(draft.width)
            : undefined,
          height: Number.isFinite(Number(draft?.height))
            ? Number(draft.height)
            : undefined,
          sourceLayerId:
            typeof draft?.sourceLayerId === "string" &&
            draft.sourceLayerId.trim().length > 0
              ? draft.sourceLayerId
              : null,
        },
      }),
    closeMaterialSaveDialog: () =>
      set({
        materialSaveDialogOpen: false,
        materialSaveDraft: null,
      }),
    openMaterialManager: (tab = "materials") =>
      set({
        materialManagerOpen: true,
        materialManagerTab: tab,
      }),
    closeMaterialManager: () =>
      set({
        materialManagerOpen: false,
        materialManagerCreateOpen: false,
        materialManagerSeedImage: null,
      }),
    setMaterialManagerTab: (tab) =>
      set({
        materialManagerTab: tab,
        materialManagerOpen: true,
      }),
    setMaterialManagerCreateOpen: (open, seedImage, tab = "subjects") =>
      set((state) => ({
        materialManagerOpen: open ? true : state.materialManagerOpen,
        materialManagerTab: open ? tab : state.materialManagerTab,
        materialManagerCreateOpen: open,
        materialManagerSeedImage: open
          ? typeof seedImage === "string" && seedImage.trim().length > 0
            ? seedImage.trim()
            : null
          : null,
      })),
    setLibTvWorkflow: (workflow) =>
      set(() => {
        const normalized = normalizeLibTvWorkflowState(workflow);
        return {
          libtvWorkflow: {
            ...normalized,
            nodes: syncLibTvWorkflowPlaylistConsumers(
              normalized.nodes,
              normalized.edges,
            ),
          },
        };
      }),
    setLibTvWorkflowEnabled: (enabled) =>
      set((state) => ({
        libtvWorkflow: {
          ...state.libtvWorkflow,
          enabled: Boolean(enabled),
        },
      })),
    setLibTvWorkflowActiveNode: (nodeId) =>
      set((state) => {
        if (state.libtvWorkflow.activeNodeId === nodeId) return state;
        return {
          libtvWorkflow: {
            ...state.libtvWorkflow,
            activeNodeId: nodeId,
          },
        };
      }),
    addLibTvWorkflowNode: (kind, options) => {
      const node = createLibTvWorkflowNode(kind, {
        x: options?.x,
        y: options?.y,
      });
      set((state) => {
        const nextEdges = [...state.libtvWorkflow.edges];
        let nextNodes = [...state.libtvWorkflow.nodes, node];
        if (options?.linkFromNodeId && options.linkFromNodeId !== node.id) {
          nextEdges.push({
            id: uuidv4(),
            source: options.linkFromNodeId,
            target: node.id,
          });
        }
        if (options?.linkToNodeId && options.linkToNodeId !== node.id) {
          nextEdges.push({
            id: uuidv4(),
            source: node.id,
            target: options.linkToNodeId,
          });
        }
        if (options?.linkFromNodeId && options.linkFromNodeId !== node.id) {
          const sourceNode = state.libtvWorkflow.nodes.find(
            (item) => item.id === options.linkFromNodeId,
          );
          const payload = collectLibTvWorkflowReferencePayload(sourceNode);
          if (payload.referenceImages.length > 0) {
            nextNodes = nextNodes.map((item) =>
              item.id === node.id
                ? {
                    ...item,
                    data: {
                      ...item.data,
                      referenceImages: payload.referenceImages,
                      referenceImageNodeIds: payload.referenceImageNodeIds,
                    },
                  }
                : item,
            );
          }
        }
        if (options?.linkToNodeId && options.linkToNodeId !== node.id) {
          const targetNode = state.libtvWorkflow.nodes.find(
            (item) => item.id === options.linkToNodeId,
          );
          const payload = collectLibTvWorkflowReferencePayload(node);
          if (
            payload.referenceImages.length > 0 &&
            targetNode &&
            (targetNode.kind === "image" ||
              targetNode.kind === "video" ||
              targetNode.kind === "script" ||
              targetNode.kind === "threed" ||
              targetNode.kind === "director-console-3d")
          ) {
            nextNodes = nextNodes.map((item) =>
              item.id === options.linkToNodeId
                ? {
                    ...item,
                    data: {
                      ...item.data,
                      referenceImages: payload.referenceImages,
                      referenceImageNodeIds: payload.referenceImageNodeIds,
                    },
                  }
                : item,
            );
          }
        }
        const nextWorkflow = {
          ...state.libtvWorkflow,
          enabled: true,
          activeNodeId: node.id,
          nodes: syncLibTvWorkflowPlaylistConsumers(nextNodes, nextEdges),
          edges: nextEdges,
        };
        return {
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "新增工作流节点",
            `workflow:add:${node.id}`,
          ),
        };
      });
      return node;
    },
    updateLibTvWorkflowNode: (nodeId, patch) =>
      set((state) => {
        let changed = false;
        const nextNodes = state.libtvWorkflow.nodes.map((node) => {
          if (node.id !== nodeId) return node;
          const nextData = {
            ...node.data,
            ...patch,
            title:
              typeof patch.title === "string" ? patch.title : node.data.title,
          };
          const currentData = node.data as unknown as Record<string, unknown>;
          const nextDataRecord = nextData as Record<string, unknown>;
          const compareKeys = new Set([
            ...Object.keys(currentData),
            ...Object.keys(nextDataRecord),
          ]);
          let same = true;
          for (const key of compareKeys) {
            if (!Object.is(currentData[key], nextDataRecord[key])) {
              same = false;
              break;
            }
          }
          if (same) return node;
          changed = true;
          return {
            ...node,
            data: nextData,
          };
        });
        if (!changed) return state;
        const referenceSyncedNodes = syncLibTvWorkflowReferenceConsumers(
          nextNodes,
          state.libtvWorkflow.edges,
          nodeId,
        );
        const storyboardEdges = ensureStoryboardGroupSourceEdge(
          state.libtvWorkflow.edges,
          nextNodes,
          nodeId,
        );
        const playlistSyncedNodes = syncLibTvWorkflowPlaylistConsumers(
          referenceSyncedNodes,
          storyboardEdges,
          nodeId,
        );
        const playlistOutput = syncLibTvWorkflowPlaylistOutput(
          playlistSyncedNodes,
          storyboardEdges,
          nodeId,
        );
        const nextWorkflow = {
          ...state.libtvWorkflow,
          nodes: playlistOutput.nodes,
          edges: playlistOutput.edges,
        };
        return {
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "更新工作流节点",
            `workflow:update:${nodeId}`,
          ),
        };
      }),
    attachLibTvWorkflowReferenceImage: (
      targetId,
      sourceId,
      sourceUrlOverride,
    ) =>
      set((state) => {
        if (!targetId || !sourceId || targetId === sourceId) return state;
        const targetNode = state.libtvWorkflow.nodes.find(
          (node) => node.id === targetId,
        );
        const sourceNode = state.libtvWorkflow.nodes.find(
          (node) => node.id === sourceId,
        );
        if (!targetNode || !sourceNode) return state;
        if (
          !(
            targetNode.kind === "image" ||
            targetNode.kind === "video" ||
            targetNode.kind === "script" ||
            targetNode.kind === "threed" ||
            targetNode.kind === "director-console-3d"
          )
        )
          return state;
        const payload = collectLibTvWorkflowReferencePayload(
          sourceNode,
          sourceUrlOverride,
        );
        if (payload.referenceImages.length === 0) return state;

        const nextWorkflow = {
          ...state.libtvWorkflow,
          nodes: state.libtvWorkflow.nodes.map((node) => {
            if (node.id !== targetId) return node;
            const references = Array.isArray(node.data.referenceImages)
              ? node.data.referenceImages
                  .map((item) => String(item || "").trim())
                  .filter(Boolean)
              : [];
            const referenceNodeIds = Array.isArray(
              node.data.referenceImageNodeIds,
            )
              ? node.data.referenceImageNodeIds
                  .map((item) => String(item || "").trim())
                  .slice(0, references.length)
              : [];
            const referenceRoles = Array.isArray(node.data.referenceImageRoles)
              ? node.data.referenceImageRoles
                  .map((item) => String(item || "").trim())
                  .slice(0, references.length)
              : [];
            while (referenceNodeIds.length < references.length)
              referenceNodeIds.push("");
            while (referenceRoles.length < references.length)
              referenceRoles.push("");
            const merged = mergeLibTvWorkflowReferencePayload(
              references,
              referenceNodeIds,
              referenceRoles,
              sourceId,
              payload,
            );
            return {
              ...node,
              data: {
                ...node.data,
                referenceImages: merged.referenceImages,
                referenceImageNodeIds: merged.referenceImageNodeIds,
                referenceImageRoles: merged.referenceImageRoles,
              },
            };
          }),
        };
        return {
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "添加节点引用",
            `workflow:reference:${targetId}`,
          ),
        };
      }),
    moveLibTvWorkflowNode: (nodeId, position) =>
      set((state) => {
        const result = applyLibTvWorkflowNodeMovePatch(state.libtvWorkflow, {
          id: nodeId,
          position,
        });
        if (!result.changed) return state;
        return {
          ...withLibTvWorkflowHistory(
            state,
            result.workflow,
            "移动工作流节点",
            `workflow:move:${nodeId}`,
          ),
        };
      }),
    moveLibTvWorkflowNodes: (patches) =>
      set((state) => {
        const normalizedPatches = patches
          .map((patch) => ({ ...patch, id: String(patch.id || "").trim() }))
          .filter((patch) => Boolean(patch.id));
        if (normalizedPatches.length === 0) return state;
        const result = applyLibTvWorkflowNodeMovePatches(
          state.libtvWorkflow,
          normalizedPatches,
        );
        if (!result.changed) return state;
        return {
          ...withLibTvWorkflowHistory(
            state,
            result.workflow,
            "移动工作流节点",
            "workflow:move:batch",
          ),
        };
      }),
    groupLibTvWorkflowNodes: (nodeIds, options) => {
      const uniqueIds = Array.from(
        new Set(nodeIds.map((id) => String(id || "").trim()).filter(Boolean)),
      );
      let createdGroup: LibTvWorkflowNode | null = null;
      set((state) => {
        const selectedNodes = uniqueIds
          .map((id) => state.libtvWorkflow.nodes.find((node) => node.id === id))
          .filter(
            (node): node is LibTvWorkflowNode =>
              node !== undefined && node.kind !== "group",
          );
        if (selectedNodes.length < 2) return state;

        const selectedBounds = selectedNodes.map((node) => {
          const frame = getLibTvWorkflowRenderedNodeFrame(node);
          return {
            x: Number(node.x || 0),
            y: Number(node.y || 0),
            width: frame.width,
            height: frame.height,
          };
        });
        const minX = Math.min(...selectedBounds.map((bounds) => bounds.x));
        const minY = Math.min(...selectedBounds.map((bounds) => bounds.y));
        const maxX = Math.max(
          ...selectedBounds.map((bounds) => bounds.x + bounds.width),
        );
        const maxY = Math.max(
          ...selectedBounds.map((bounds) => bounds.y + bounds.height),
        );
        const padding = 44;
        const isStoryboardGroup = options?.mode === "storyboard";
        if (
          isStoryboardGroup &&
          !selectedNodes.every(
            (node) =>
              node.kind === "image" &&
              node.data.mediaRole === "ordinary" &&
              String(node.data.mediaUrl || "").trim(),
          )
        ) {
          return state;
        }
        const group = createLibTvWorkflowNode("group", {
          x: Math.round(minX - padding),
          y: Math.round(minY - padding),
        });
        const groupX = Math.round(minX - padding);
        const groupY = Math.round(minY - padding);
        const storyboardChildren = isStoryboardGroup
          ? selectedNodes.map((node, index) => ({
              ...node,
              parentId: undefined,
              x: Math.round(Number(node.x || 0)),
              y: Math.round(Number(node.y || 0)),
              data: {
                ...node.data,
                workflowGenerationResultIndex: index,
                workflowStoryboardSourceRowIndex: index,
                workflowGenerationRunning: false,
                workflowGenerationProgress: undefined,
                workflowGenerationError: "",
              },
            }))
          : [];
        createdGroup = {
          ...group,
          x: groupX,
          y: groupY,
          width: Math.round(maxX - minX + padding * 2),
          height: Math.round(maxY - minY + padding * 2),
          data: {
            ...group.data,
            title: isStoryboardGroup ? "合并分镜组" : "Group",
            content: "",
            mediaUrl: "",
            mediaRole: undefined,
            groupNodeIds: selectedNodes.map((node) => node.id),
            groupBackgroundColor: isStoryboardGroup
              ? "transparent"
              : String(
                  options?.backgroundColor || "rgba(255,255,255,0.06)",
                ).trim() || "rgba(255,255,255,0.06)",
            groupRunning: false,
            groupCollapsed: false,
          },
        };
        const nextWorkflow = {
          ...state.libtvWorkflow,
          enabled: true,
          activeNodeId: createdGroup.id,
          nodes: isStoryboardGroup
            ? [
                createdGroup,
                ...state.libtvWorkflow.nodes.filter(
                  (node) =>
                    !selectedNodes.some(
                      (selectedNode) => selectedNode.id === node.id,
                    ),
                ),
                ...storyboardChildren,
              ]
            : [
                createdGroup,
                ...state.libtvWorkflow.nodes.map((node) =>
                  selectedNodes.some(
                    (selectedNode) => selectedNode.id === node.id,
                  )
                    ? { ...node, parentId: undefined }
                    : node,
                ),
              ],
        };
        return {
          selectedIds: [createdGroup.id],
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "编组工作流节点",
            `workflow:group:${createdGroup.id}`,
          ),
        };
      });
      return createdGroup;
    },
    convertLibTvWorkflowGroupToStoryboard: (groupId) => {
      let convertedGroup: LibTvWorkflowNode | null = null;
      set((state) => {
        const group = state.libtvWorkflow.nodes.find(
          (node) => node.id === groupId && node.kind === "group",
        );
        if (!group) return state;
        const memberIds = new Set(
          Array.isArray(group.data.groupNodeIds) ? group.data.groupNodeIds : [],
        );
        const members = state.libtvWorkflow.nodes
          .filter((node) => memberIds.has(node.id) || node.parentId === groupId)
          .filter((node) => node.kind !== "group");
        if (members.length < 2) return state;
        if (
          !members.every(
            (node) =>
              node.kind === "image" &&
              node.data.mediaRole === "ordinary" &&
              String(node.data.mediaUrl || "").trim(),
          )
        ) {
          return state;
        }
        const groupX = Math.round(Number(group.x || 0));
        const groupY = Math.round(Number(group.y || 0));
        const nextMembers = members.map((node, index) => {
          const absoluteX =
            node.parentId === groupId
              ? groupX + Number(node.x || 0)
              : Number(node.x || 0);
          const absoluteY =
            node.parentId === groupId
              ? groupY + Number(node.y || 0)
              : Number(node.y || 0);
          return {
            ...node,
            parentId: undefined,
            x: Math.round(absoluteX),
            y: Math.round(absoluteY),
            data: {
              ...node.data,
              workflowGenerationResultIndex: index,
              workflowStoryboardSourceRowIndex: index,
              workflowGenerationRunning: false,
              workflowGenerationProgress: undefined,
              workflowGenerationError: "",
            },
          };
        });
        convertedGroup = {
          ...group,
          data: {
            ...group.data,
            title: String(group.data.title || "").trim() || "合并分镜组",
            content: "",
            mediaUrl: "",
            mediaRole: undefined,
            groupNodeIds: members.map((node) => node.id),
            groupBackgroundColor: "transparent",
            groupRunning: false,
            groupCollapsed: false,
          },
        };
        const nextMemberById = new Map(
          nextMembers.map((node) => [node.id, node]),
        );
        const nextWorkflow = {
          ...state.libtvWorkflow,
          activeNodeId: groupId,
          nodes: state.libtvWorkflow.nodes.map((node) => {
            if (node.id === groupId) return convertedGroup!;
            return nextMemberById.get(node.id) || node;
          }),
        };
        return {
          selectedIds: [groupId],
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "转换分镜组",
            `workflow:group:${groupId}`,
          ),
        };
      });
      return convertedGroup;
    },
    replaceLibTvWorkflowNodeWithImageGroup: (nodeId, items, options) =>
      set((state) => {
        const sourceNode = state.libtvWorkflow.nodes.find(
          (node) => node.id === nodeId,
        );
        if (
          !sourceNode ||
          (sourceNode.kind !== "image" && sourceNode.kind !== "group")
        )
          return state;
        const validItems = items
          .map((item) => ({
            url: String(item.url || "").trim(),
            width: Math.max(1, Math.round(Number(item.width || 1))),
            height: Math.max(1, Math.round(Number(item.height || 1))),
            title: String(item.title || "").trim(),
          }))
          .filter((item) => item.url);
        if (validItems.length === 0) return state;

        const aspectRatioSize = (() => {
          const matched = String(
            options?.aspectRatio || sourceNode.data?.aspectRatio || "",
          )
            .trim()
            .replace(/\s+/g, "")
            .match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
          const width = Number(matched?.[1] || 0);
          const height = Number(matched?.[2] || 0);
          return Number.isFinite(width) &&
            Number.isFinite(height) &&
            width > 0 &&
            height > 0
            ? { width, height }
            : {
                width: Math.max(1, Number(validItems[0]?.width || 16)),
                height: Math.max(1, Number(validItems[0]?.height || 9)),
              };
        })();
        const displayFrame = getLibTvWorkflowImageResultDisplayFrame(
          aspectRatioSize.width,
          aspectRatioSize.height,
        );
        const primaryItem = validItems[0];
        const nextNode: LibTvWorkflowNode = {
          ...sourceNode,
          kind: "image",
          width: displayFrame.width,
          height: displayFrame.height,
          parentId: undefined,
          data: {
            ...sourceNode.data,
            title:
              String(
                options?.title ||
                  sourceNode.data?.title ||
                  `图片节点 ${validItems.length}`,
              ).trim() || `图片节点 ${validItems.length}`,
            componentType: "image-generator",
            content: "",
            mediaUrl: primaryItem?.url || "",
            mediaRole: "generator",
            prompt: String(options?.prompt || sourceNode.data?.prompt || ""),
            aspectRatio: options?.aspectRatio || sourceNode.data?.aspectRatio,
            imageSize: options?.imageSize || sourceNode.data?.imageSize,
            generationCount:
              options?.generationCount ||
              sourceNode.data?.generationCount ||
              validItems.length,
            selectedOptionId: String(
              options?.selectedOptionId ||
                sourceNode.data?.selectedOptionId ||
                "custom",
            ),
            options: [],
            note: "",
            groupNodeIds: [],
            groupBackgroundColor: "",
            groupRunning: false,
            groupCollapsed: false,
            workflowImageResults: validItems,
            workflowImageResultsCollapsed: validItems.length <= 1,
            workflowMediaNaturalWidth: primaryItem?.width,
            workflowMediaNaturalHeight: primaryItem?.height,
            workflowMediaUserResized: false,
            workflowGenerationJobId: options?.jobId,
            workflowGenerationResultIndex: undefined,
            workflowGenerationRunning: false,
            workflowGenerationProgress: undefined,
            workflowGenerationError: "",
            suppressGenerationBar: false,
          },
        };

        const nextWorkflow = {
          ...state.libtvWorkflow,
          enabled: true,
          activeNodeId: nodeId,
          nodes: state.libtvWorkflow.nodes
            .filter((node) => node.id === nodeId || node.parentId !== nodeId)
            .map((node) => (node.id === nodeId ? nextNode : node)),
        };
        return {
          selectedIds: [nodeId],
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "更新工作流结果",
            `workflow:update:${nodeId}`,
          ),
        };
      }),
    ungroupLibTvWorkflowNode: (groupId) =>
      set((state) => {
        const group = state.libtvWorkflow.nodes.find(
          (node) => node.id === groupId && node.kind === "group",
        );
        if (!group) return state;
        const childIds = Array.from(
          new Set([
            ...(Array.isArray(group.data.groupNodeIds)
              ? group.data.groupNodeIds
              : []),
            ...state.libtvWorkflow.nodes
              .filter((node) => node.parentId === groupId)
              .map((node) => node.id),
          ]),
        );
        const hasParentedChildren = state.libtvWorkflow.nodes.some(
          (node) => node.parentId === groupId,
        );
        const nextWorkflow = {
          ...state.libtvWorkflow,
          activeNodeId: childIds[0] || null,
          nodes: state.libtvWorkflow.nodes
            .filter((node) => node.id !== groupId)
            .map((node) => {
              if (node.parentId !== groupId) return node;
              if (!hasParentedChildren) return { ...node, parentId: undefined };
              return {
                ...node,
                parentId: undefined,
                x: Number(group.x || 0) + Number(node.x || 0),
                y: Number(group.y || 0) + Number(node.y || 0),
              };
            }),
          edges: state.libtvWorkflow.edges.filter(
            (edge) => edge.source !== groupId && edge.target !== groupId,
          ),
        };
        return {
          selectedIds: childIds,
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "解组工作流节点",
            `workflow:ungroup:${groupId}`,
          ),
        };
      }),
    setLibTvWorkflowSelectedIds: (ids) =>
      set((state) => {
        const nodeIdSet = new Set(
          state.libtvWorkflow.nodes.map((node) => node.id),
        );
        const nextIds = Array.from(
          new Set(
            ids
              .map((id) => String(id || "").trim())
              .filter((id) => nodeIdSet.has(id)),
          ),
        ).sort();
        const currentIds = Array.from(
          new Set(state.selectedIds.filter((id) => nodeIdSet.has(id))),
        ).sort();
        const sameSelection =
          currentIds.length === nextIds.length &&
          currentIds.every((id, index) => id === nextIds[index]);
        const nextActiveNodeId = nextIds.length === 1 ? nextIds[0] : null;
        if (
          sameSelection &&
          state.libtvWorkflow.activeNodeId === nextActiveNodeId
        )
          return state;
        return {
          selectedIds: nextIds,
          libtvWorkflow: {
            ...state.libtvWorkflow,
            activeNodeId: nextActiveNodeId,
          },
        };
      }),
    removeLibTvWorkflowNode: (nodeId) =>
      set((state) => {
        const removedNode = state.libtvWorkflow.nodes.find(
          (node) => node.id === nodeId,
        );
        if (!removedNode) return state;
        const removedIds = collectLibTvWorkflowNodeRemovalIds(
          state.libtvWorkflow.nodes,
          [nodeId],
        );
        const nextNodes = state.libtvWorkflow.nodes.filter(
          (node) => !removedIds.has(node.id),
        );
        const activeNodeId = state.libtvWorkflow.activeNodeId;
        const nextActiveNodeId =
          activeNodeId && removedIds.has(activeNodeId)
            ? nextNodes[0]?.id || null
            : activeNodeId;
        const nextSelectedIds = state.selectedIds.filter(
          (id) => !removedIds.has(id),
        );
        const nextWorkflow = {
          ...state.libtvWorkflow,
          activeNodeId: nextActiveNodeId,
          nodes: nextNodes.map((node) => {
            if (node.kind === "playlist") {
              const currentItems = Array.isArray(node.data.playlistItems)
                ? node.data.playlistItems
                : [];
              const nextItems = currentItems.filter(
                (item) => !item.nodeId || !removedIds.has(item.nodeId),
              );
              const removesBackgroundAudio = Boolean(
                node.data.playlistBackgroundAudioNodeId &&
                removedIds.has(node.data.playlistBackgroundAudioNodeId),
              );
              const removesVoiceover = Boolean(
                node.data.playlistVoiceoverNodeId &&
                removedIds.has(node.data.playlistVoiceoverNodeId),
              );
              if (
                nextItems.length !== currentItems.length ||
                removesBackgroundAudio ||
                removesVoiceover
              ) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    playlistItems: nextItems,
                    playlistTrimEnd: undefined,
                    playlistExportUrl: undefined,
                    playlistExportRunning: false,
                    ...(removesBackgroundAudio
                      ? {
                          playlistBackgroundAudioUrl: undefined,
                          playlistBackgroundAudioNodeId: undefined,
                        }
                      : {}),
                    ...(removesVoiceover
                      ? {
                          playlistVoiceoverUrl: undefined,
                          playlistVoiceoverNodeId: undefined,
                        }
                      : {}),
                    mediaUrl: "",
                  },
                };
              }
            }
            const groupNodeIds = Array.isArray(node.data.groupNodeIds)
              ? node.data.groupNodeIds
              : [];
            if (
              (removedNode?.parentId === node.id ||
                groupNodeIds.some((id) => removedIds.has(id))) &&
              groupNodeIds.length > 0
            ) {
              return {
                ...node,
                data: {
                  ...node.data,
                  groupNodeIds: groupNodeIds.filter(
                    (id) => !removedIds.has(id),
                  ),
                },
              };
            }
            const references = Array.isArray(node.data.referenceImages)
              ? node.data.referenceImages
              : [];
            const referenceNodeIds = Array.isArray(
              node.data.referenceImageNodeIds,
            )
              ? node.data.referenceImageNodeIds
              : [];
            const referenceRoles = Array.isArray(node.data.referenceImageRoles)
              ? node.data.referenceImageRoles
              : [];
            if (!referenceNodeIds.some((id) => removedIds.has(id))) return node;
            const nextReferences = references.filter(
              (_, index) => !removedIds.has(referenceNodeIds[index] || ""),
            );
            const nextReferenceNodeIds = referenceNodeIds
              .filter((id) => !removedIds.has(id))
              .slice(0, nextReferences.length);
            const nextReferenceRoles = referenceRoles
              .filter(
                (_, index) => !removedIds.has(referenceNodeIds[index] || ""),
              )
              .slice(0, nextReferences.length);
            return {
              ...node,
              data: {
                ...node.data,
                referenceImages: nextReferences,
                referenceImageNodeIds: nextReferenceNodeIds,
                referenceImageRoles: nextReferenceRoles,
              },
            };
          }),
          edges: state.libtvWorkflow.edges.filter(
            (edge) =>
              !removedIds.has(edge.source) && !removedIds.has(edge.target),
          ),
        };
        return {
          selectedIds: nextSelectedIds,
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "删除工作流节点",
            `workflow:remove:${nodeId}`,
          ),
        };
      }),
    removeLibTvWorkflowNodes: (nodeIds) =>
      set((state) => {
        const rootIds = Array.from(
          new Set(nodeIds.map((id) => String(id || "").trim()).filter(Boolean)),
        );
        if (rootIds.length === 0) return state;
        const removedIds = collectLibTvWorkflowNodeRemovalIds(
          state.libtvWorkflow.nodes,
          rootIds,
        );
        if (removedIds.size === 0) return state;
        const nextNodes = state.libtvWorkflow.nodes.filter(
          (node) => !removedIds.has(node.id),
        );
        const activeNodeId = state.libtvWorkflow.activeNodeId;
        const nextActiveNodeId =
          activeNodeId && removedIds.has(activeNodeId)
            ? nextNodes[0]?.id || null
            : activeNodeId;
        const nextSelectedIds = state.selectedIds.filter(
          (id) => !removedIds.has(id),
        );
        const nextWorkflow = {
          ...state.libtvWorkflow,
          activeNodeId: nextActiveNodeId,
          nodes: nextNodes.map((node) => {
            if (node.kind === "playlist") {
              const currentItems = Array.isArray(node.data.playlistItems)
                ? node.data.playlistItems
                : [];
              const nextItems = currentItems.filter(
                (item) => !item.nodeId || !removedIds.has(item.nodeId),
              );
              const removesBackgroundAudio = Boolean(
                node.data.playlistBackgroundAudioNodeId &&
                removedIds.has(node.data.playlistBackgroundAudioNodeId),
              );
              const removesVoiceover = Boolean(
                node.data.playlistVoiceoverNodeId &&
                removedIds.has(node.data.playlistVoiceoverNodeId),
              );
              if (
                nextItems.length !== currentItems.length ||
                removesBackgroundAudio ||
                removesVoiceover
              ) {
                return {
                  ...node,
                  data: {
                    ...node.data,
                    playlistItems: nextItems,
                    playlistTrimEnd: undefined,
                    playlistExportUrl: undefined,
                    playlistExportRunning: false,
                    ...(removesBackgroundAudio
                      ? {
                          playlistBackgroundAudioUrl: undefined,
                          playlistBackgroundAudioNodeId: undefined,
                        }
                      : {}),
                    ...(removesVoiceover
                      ? {
                          playlistVoiceoverUrl: undefined,
                          playlistVoiceoverNodeId: undefined,
                        }
                      : {}),
                    mediaUrl: "",
                  },
                };
              }
            }
            const groupNodeIds = Array.isArray(node.data.groupNodeIds)
              ? node.data.groupNodeIds
              : [];
            const references = Array.isArray(node.data.referenceImages)
              ? node.data.referenceImages
              : [];
            const referenceNodeIds = Array.isArray(
              node.data.referenceImageNodeIds,
            )
              ? node.data.referenceImageNodeIds
              : [];
            const referenceRoles = Array.isArray(node.data.referenceImageRoles)
              ? node.data.referenceImageRoles
              : [];
            const hasRemovedGroupMember = groupNodeIds.some((id) =>
              removedIds.has(id),
            );
            const hasRemovedReference = referenceNodeIds.some((id) =>
              removedIds.has(id),
            );
            if (!hasRemovedGroupMember && !hasRemovedReference) return node;
            const nextReferences = hasRemovedReference
              ? references.filter(
                  (_, index) => !removedIds.has(referenceNodeIds[index] || ""),
                )
              : references;
            return {
              ...node,
              data: {
                ...node.data,
                ...(hasRemovedGroupMember
                  ? {
                      groupNodeIds: groupNodeIds.filter(
                        (id) => !removedIds.has(id),
                      ),
                    }
                  : {}),
                ...(hasRemovedReference
                  ? {
                      referenceImages: nextReferences,
                      referenceImageNodeIds: referenceNodeIds
                        .filter((id) => !removedIds.has(id))
                        .slice(0, nextReferences.length),
                      referenceImageRoles: referenceRoles
                        .filter(
                          (_, index) =>
                            !removedIds.has(referenceNodeIds[index] || ""),
                        )
                        .slice(0, nextReferences.length),
                    }
                  : {}),
              },
            };
          }),
          edges: state.libtvWorkflow.edges.filter(
            (edge) =>
              !removedIds.has(edge.source) && !removedIds.has(edge.target),
          ),
        };
        return {
          selectedIds: nextSelectedIds,
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "批量删除工作流节点",
            "workflow:remove:batch",
          ),
        };
      }),
    addLibTvWorkflowEdge: (sourceId, targetId) =>
      set((state) => {
        if (!sourceId || !targetId || sourceId === targetId) return state;
        const sourceExists =
          state.libtvWorkflow.nodes.some((node) => node.id === sourceId) ||
          state.layers.some(
            (layer) => layer.id === sourceId && Boolean(layer.libtvNodeKind),
          );
        const targetExists =
          state.libtvWorkflow.nodes.some((node) => node.id === targetId) ||
          state.layers.some(
            (layer) => layer.id === targetId && Boolean(layer.libtvNodeKind),
          );
        if (!sourceExists || !targetExists) return state;
        const exists = state.libtvWorkflow.edges.some(
          (edge) => edge.source === sourceId && edge.target === targetId,
        );
        if (exists) return state;
        let nextWorkflow = {
          ...state.libtvWorkflow,
          edges: [
            ...state.libtvWorkflow.edges,
            { id: uuidv4(), source: sourceId, target: targetId },
          ],
        };
        const sourceNode = state.libtvWorkflow.nodes.find(
          (node) => node.id === sourceId,
        );
        const targetNode = state.libtvWorkflow.nodes.find(
          (node) => node.id === targetId,
        );
        if (
          (sourceNode?.kind === "video" || sourceNode?.kind === "audio") &&
          targetNode?.kind === "playlist"
        ) {
          nextWorkflow = {
            ...nextWorkflow,
            nodes: syncLibTvWorkflowPlaylistConsumers(
              nextWorkflow.nodes,
              nextWorkflow.edges,
              sourceId,
            ),
          };
          return {
            ...withLibTvWorkflowHistory(
              state,
              nextWorkflow,
              "连接工作流节点",
              `workflow:connect:${sourceId}:${targetId}`,
            ),
          };
        }
        if (
          !sourceNode ||
          !targetNode ||
          sourceNode.kind !== "image" ||
          !(
            targetNode.kind === "image" ||
            targetNode.kind === "video" ||
            targetNode.kind === "script" ||
            targetNode.kind === "threed" ||
            targetNode.kind === "director-console-3d"
          )
        ) {
          return {
            ...withLibTvWorkflowHistory(
              state,
              nextWorkflow,
              "连接工作流节点",
              `workflow:connect:${sourceId}:${targetId}`,
            ),
          };
        }
        const payload = collectLibTvWorkflowReferencePayload(sourceNode);
        if (payload.referenceImages.length === 0) {
          return {
            ...withLibTvWorkflowHistory(
              state,
              nextWorkflow,
              "连接工作流节点",
              `workflow:connect:${sourceId}:${targetId}`,
            ),
          };
        }
        nextWorkflow = {
          ...nextWorkflow,
          nodes: state.libtvWorkflow.nodes.map((node) => {
            if (node.id !== targetId) return node;
            const references = Array.isArray(node.data.referenceImages)
              ? node.data.referenceImages
                  .map((item) => String(item || "").trim())
                  .filter(Boolean)
              : [];
            const referenceNodeIds = Array.isArray(
              node.data.referenceImageNodeIds,
            )
              ? node.data.referenceImageNodeIds
                  .map((item) => String(item || "").trim())
                  .slice(0, references.length)
              : [];
            const referenceRoles = Array.isArray(node.data.referenceImageRoles)
              ? node.data.referenceImageRoles
                  .map((item) => String(item || "").trim())
                  .slice(0, references.length)
              : [];
            while (referenceNodeIds.length < references.length)
              referenceNodeIds.push("");
            while (referenceRoles.length < references.length)
              referenceRoles.push("");
            const merged = mergeLibTvWorkflowReferencePayload(
              references,
              referenceNodeIds,
              referenceRoles,
              sourceId,
              payload,
            );
            return {
              ...node,
              data: {
                ...node.data,
                referenceImages: merged.referenceImages,
                referenceImageNodeIds: merged.referenceImageNodeIds,
                referenceImageRoles: merged.referenceImageRoles,
              },
            };
          }),
        };
        return {
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "连接工作流节点",
            `workflow:connect:${sourceId}:${targetId}`,
          ),
        };
      }),
    removeLibTvWorkflowEdge: (edgeId) =>
      set((state) => {
        const removedEdge = state.libtvWorkflow.edges.find(
          (edge) => edge.id === edgeId,
        );
        const nextEdges = state.libtvWorkflow.edges.filter(
          (edge) => edge.id !== edgeId,
        );
        if (!removedEdge) return state;
        const nextWorkflow = {
          ...state.libtvWorkflow,
          edges: nextEdges,
          nodes: state.libtvWorkflow.nodes.map((node) => {
            if (node.id !== removedEdge.target) return node;
            if (node.kind === "playlist") {
              const currentItems = Array.isArray(node.data.playlistItems)
                ? node.data.playlistItems
                : [];
              const nextItems = currentItems.filter(
                (item) => item.nodeId !== removedEdge.source,
              );
              const removesBackgroundAudio =
                node.data.playlistBackgroundAudioNodeId === removedEdge.source;
              const removesVoiceover =
                node.data.playlistVoiceoverNodeId === removedEdge.source;
              if (
                nextItems.length === currentItems.length &&
                !removesBackgroundAudio &&
                !removesVoiceover
              )
                return node;
              return {
                ...node,
                data: {
                  ...node.data,
                  playlistItems: nextItems,
                  playlistActiveIndex: Math.min(
                    Math.max(0, Number(node.data.playlistActiveIndex || 0)),
                    Math.max(0, nextItems.length - 1),
                  ),
                  playlistTrimEnd: undefined,
                  playlistExportUrl: undefined,
                  playlistExportRunning: false,
                  ...(removesBackgroundAudio
                    ? {
                        playlistBackgroundAudioUrl: undefined,
                        playlistBackgroundAudioNodeId: undefined,
                      }
                    : {}),
                  ...(removesVoiceover
                    ? {
                        playlistVoiceoverUrl: undefined,
                        playlistVoiceoverNodeId: undefined,
                      }
                    : {}),
                  mediaUrl: "",
                },
              };
            }
            const references = Array.isArray(node.data.referenceImages)
              ? node.data.referenceImages
              : [];
            const referenceNodeIds = Array.isArray(
              node.data.referenceImageNodeIds,
            )
              ? node.data.referenceImageNodeIds
              : [];
            const referenceRoles = Array.isArray(node.data.referenceImageRoles)
              ? node.data.referenceImageRoles
              : [];
            const nextReferences = references.filter(
              (_, index) => referenceNodeIds[index] !== removedEdge.source,
            );
            const nextReferenceNodeIds = referenceNodeIds
              .filter((id) => id !== removedEdge.source)
              .slice(0, nextReferences.length);
            const nextReferenceRoles = referenceRoles
              .filter(
                (_, index) => referenceNodeIds[index] !== removedEdge.source,
              )
              .slice(0, nextReferences.length);
            if (
              nextReferences.length === references.length &&
              nextReferenceNodeIds.length === referenceNodeIds.length &&
              nextReferenceRoles.length === referenceRoles.length
            )
              return node;
            return {
              ...node,
              data: {
                ...node.data,
                referenceImages: nextReferences,
                referenceImageNodeIds: nextReferenceNodeIds,
                referenceImageRoles: nextReferenceRoles,
              },
            };
          }),
        };
        return {
          ...withLibTvWorkflowHistory(
            state,
            nextWorkflow,
            "断开工作流连线",
            `workflow:disconnect:${removedEdge.source}:${removedEdge.target}`,
          ),
        };
      }),
    clearLibTvWorkflow: () =>
      set({
        libtvWorkflow: { ...EMPTY_LIBTV_WORKFLOW_STATE },
      }),
    setLibTvWorkflowLastRun: (result) =>
      set((state) => ({
        libtvWorkflow: {
          ...state.libtvWorkflow,
          lastRun: result,
        },
      })),
    ensureLibTvTextEditorNode: (sourceLayerId) => {
      const state = get();
      const sourceLayer = state.layers.find(
        (layer) => layer.id === sourceLayerId && layer.libtvNodeKind === "text",
      );
      if (!sourceLayer) return null;

      const directIncomingTextLayer = state.libtvWorkflow.edges
        .filter((edge) => edge.target === sourceLayerId)
        .map((edge) =>
          state.layers.find(
            (layer) =>
              layer.id === edge.source &&
              layer.libtvComponentType === "text-editor",
          ),
        );
      const latestDirectIncomingTextLayer = pickLatestLayer(
        directIncomingTextLayer,
      );

      if (latestDirectIncomingTextLayer) {
        get().setLibTvWorkflowEnabled(true);
        get().selectLayer(latestDirectIncomingTextLayer.id);
        get().setLibTvWorkflowActiveNode(latestDirectIncomingTextLayer.id);
        return latestDirectIncomingTextLayer.id;
      }

      const textDefaults = getLibTvDefaultNodeConfig("text");
      const textNode = get().addLayer(
        createLibTvLayerDraft({
          componentType: "text-editor",
          x:
            Number(sourceLayer.x || 0) -
            textDefaults.width -
            LIBTV_LEFT_LINK_GAP_PX,
          y:
            Number(sourceLayer.y || 0) +
            (Number(sourceLayer.height || LIBTV_TAPNOW_GENERATOR_HEIGHT) -
              LIBTV_TAPNOW_VIDEO_HEIGHT) /
              2,
          width: LIBTV_TAPNOW_VIDEO_WIDTH,
          height: LIBTV_TAPNOW_VIDEO_HEIGHT,
          patch: {
            libtvReversePromptInput: "",
          },
        }),
      );

      get().setLibTvWorkflowEnabled(true);
      get().addLibTvWorkflowEdge(textNode.id, sourceLayerId);
      get().selectLayer(textNode.id);
      get().setLibTvWorkflowActiveNode(textNode.id);
      return textNode.id;
    },
    ensureLibTvScriptInputNode: (scriptLayerId) => {
      const state = get();
      const scriptLayer = state.layers.find(
        (layer) =>
          layer.id === scriptLayerId && layer.libtvNodeKind === "script",
      );
      if (!scriptLayer) return null;

      const directIncomingTextLayer = state.libtvWorkflow.edges
        .filter((edge) => edge.target === scriptLayerId)
        .map((edge) =>
          state.layers.find(
            (layer) =>
              layer.id === edge.source && layer.libtvNodeKind === "text",
          ),
        );
      const latestDirectIncomingTextLayer = pickLatestLayer(
        directIncomingTextLayer,
      );

      if (latestDirectIncomingTextLayer) {
        get().selectLayer(latestDirectIncomingTextLayer.id);
        get().setLibTvWorkflowActiveNode(latestDirectIncomingTextLayer.id);
        return latestDirectIncomingTextLayer.id;
      }

      const textNode = get().addLayer(
        createLibTvLayerDraft({
          componentType: "text-editor",
          x:
            Number(scriptLayer.x || 0) -
            LIBTV_TAPNOW_VIDEO_WIDTH -
            LIBTV_LEFT_LINK_GAP_PX,
          y:
            Number(scriptLayer.y || 0) +
            (Number(scriptLayer.height || LIBTV_TAPNOW_SCRIPT_HEIGHT) -
              LIBTV_TAPNOW_VIDEO_HEIGHT) /
              2,
          width: LIBTV_TAPNOW_VIDEO_WIDTH,
          height: LIBTV_TAPNOW_VIDEO_HEIGHT,
          patch: {
            name: "脚本输入",
            subtype: "zmtv-script-input-helper",
            libtvReversePromptInput: "",
            libtvScriptResult: null,
            libtvScriptStatus: "idle",
            libtvScriptError: "",
          },
        }),
      );

      get().setLibTvWorkflowEnabled(true);
      get().addLibTvWorkflowEdge(textNode.id, scriptLayerId);
      get().selectLayer(textNode.id);
      get().setLibTvWorkflowActiveNode(textNode.id);
      return textNode.id;
    },
    ensureLibTvScriptVideoReferenceNode: (scriptLayerId) => {
      const state = get();
      const scriptLayer = state.layers.find(
        (layer) =>
          layer.id === scriptLayerId && layer.libtvNodeKind === "script",
      );
      if (!scriptLayer) return null;

      const directIncomingVideoLayer = state.libtvWorkflow.edges
        .filter((edge) => edge.target === scriptLayerId)
        .map((edge) =>
          state.layers.find(
            (layer) =>
              layer.id === edge.source && layer.libtvNodeKind === "video",
          ),
        );
      const latestDirectIncomingVideoLayer = pickLatestLayer(
        directIncomingVideoLayer,
      );

      if (latestDirectIncomingVideoLayer) {
        get().selectLayer(latestDirectIncomingVideoLayer.id);
        get().setLibTvWorkflowActiveNode(latestDirectIncomingVideoLayer.id);
        return latestDirectIncomingVideoLayer.id;
      }

      const width = LIBTV_TAPNOW_VIDEO_WIDTH;
      const height = LIBTV_TAPNOW_VIDEO_HEIGHT;
      const videoUrl = LIBTV_DEFAULT_SCRIPT_VIDEO_REFERENCE_URL;
      const videoNode = get().addLayer(
        createLibTvLayerDraft({
          componentType: "video-asset",
          x: Number(scriptLayer.x || 0) - width - LIBTV_LEFT_LINK_GAP_PX,
          y:
            Number(scriptLayer.y || 0) +
            (Number(scriptLayer.height || LIBTV_TAPNOW_SCRIPT_HEIGHT) -
              height) /
              2,
          width,
          height,
          name: "视频上传组件",
          patch: {
            type: "video",
            subtype: "zmtv-script-video-upload",
            libtvMediaUrl: videoUrl,
            src: videoUrl,
            genResultImage: getLibTvVideoPosterUrl(videoUrl) || undefined,
            genStatus: "idle",
            genStatusLabel: undefined,
            genPrompt: "",
            genModel: "",
            genRatio: "9:16",
            genResolution: "标准",
            genGridSize: 1,
            videoDuration: "15s",
            videoOriginalDuration: 15,
            videoTrimStart: undefined,
            videoTrimEnd: undefined,
            isUploading: false,
            uploadError: false,
          },
        }),
      );

      get().setLibTvWorkflowEnabled(true);
      get().addLibTvWorkflowEdge(videoNode.id, scriptLayerId);
      get().selectLayer(videoNode.id);
      get().setLibTvWorkflowActiveNode(videoNode.id);
      return videoNode.id;
    },
    ensureLibTvImageReferenceNode: (textLayerId) => {
      const state = get();
      const textLayer = state.layers.find(
        (layer) => layer.id === textLayerId && layer.libtvNodeKind === "text",
      );
      if (!textLayer) return null;

      const directIncomingImageLayer = state.libtvWorkflow.edges
        .filter((edge) => edge.target === textLayerId)
        .map((edge) =>
          state.layers.find(
            (layer) =>
              layer.id === edge.source &&
              getLibTvComponentType(layer) === "image-reverse-prompt",
          ),
        )
        .find((layer): layer is CanvasLayer => Boolean(layer));

      if (directIncomingImageLayer) {
        get().selectLayer(directIncomingImageLayer.id);
        get().setLibTvWorkflowActiveNode(directIncomingImageLayer.id);
        return directIncomingImageLayer.id;
      }

      const imageNode = get().addLayer(
        createLibTvLayerDraft({
          componentType: "image-reverse-prompt",
          x:
            Number(textLayer.x || 0) -
            LIBTV_TAPNOW_GENERATOR_WIDTH -
            LIBTV_LEFT_LINK_GAP_PX,
          y:
            Number(textLayer.y || 0) +
            (Number(textLayer.height || LIBTV_TAPNOW_GENERATOR_HEIGHT) -
              LIBTV_TAPNOW_GENERATOR_HEIGHT) /
              2,
          width: LIBTV_TAPNOW_GENERATOR_WIDTH,
          height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
          patch: {
            libtvMediaUrl: LIBTV_DEFAULT_REFERENCE_IMAGE_URL,
            src: LIBTV_DEFAULT_REFERENCE_IMAGE_URL,
            genResultImage: LIBTV_DEFAULT_REFERENCE_IMAGE_URL,
            genStatus: "idle",
            genStatusLabel: undefined,
          },
        }),
      );

      get().setLibTvWorkflowEnabled(true);
      get().addLibTvWorkflowEdge(imageNode.id, textLayerId);
      get().selectLayer(imageNode.id);
      get().setLibTvWorkflowActiveNode(imageNode.id);
      return imageNode.id;
    },
    ensureLibTvGeneratorSourceImageNode: (generatorLayerId) => {
      const state = get();
      const generatorLayer = state.layers.find(
        (layer) =>
          layer.id === generatorLayerId &&
          getLibTvComponentType(layer) === "image-generator",
      );
      if (!generatorLayer) return null;

      const directIncomingImageLayer = state.libtvWorkflow.edges
        .filter((edge) => edge.target === generatorLayerId)
        .map((edge) =>
          state.layers.find(
            (layer) =>
              layer.id === edge.source &&
              getLibTvComponentType(layer) === "image-asset",
          ),
        )
        .find((layer): layer is CanvasLayer => Boolean(layer));

      if (directIncomingImageLayer) {
        get().setLibTvWorkflowEnabled(true);
        get().selectLayer(directIncomingImageLayer.id);
        get().setLibTvWorkflowActiveNode(directIncomingImageLayer.id);
        return directIncomingImageLayer.id;
      }

      const imageNode = get().addLayer(
        createLibTvLayerDraft({
          componentType: "image-asset",
          x:
            Number(generatorLayer.x || 0) -
            LIBTV_TAPNOW_GENERATOR_WIDTH -
            LIBTV_LEFT_LINK_GAP_PX,
          y:
            Number(generatorLayer.y || 0) +
            (Number(generatorLayer.height || LIBTV_TAPNOW_GENERATOR_HEIGHT) -
              LIBTV_TAPNOW_GENERATOR_HEIGHT) /
              2,
          width: LIBTV_TAPNOW_GENERATOR_WIDTH,
          height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
          patch: {
            libtvMediaUrl: LIBTV_DEFAULT_REFERENCE_IMAGE_URL,
            src: LIBTV_DEFAULT_REFERENCE_IMAGE_URL,
            genResultImage: LIBTV_DEFAULT_REFERENCE_IMAGE_URL,
            genStatus: "idle",
            genStatusLabel: undefined,
          },
        }),
      );

      get().setLibTvWorkflowEnabled(true);
      get().addLibTvWorkflowEdge(imageNode.id, generatorLayerId);
      get().selectLayer(imageNode.id);
      get().setLibTvWorkflowActiveNode(imageNode.id);
      return imageNode.id;
    },
    setStagePos: (pos) =>
      set((state) => {
        const x = Number(pos?.x || 0);
        const y = Number(pos?.y || 0);
        if (state.stagePos.x === x && state.stagePos.y === y) return state;
        return { stagePos: { x, y } };
      }),
    setViewportCamera: (camera) =>
      set((state) => {
        const zoom = Number(camera?.zoom || 1);
        const x = Number(camera?.stagePos?.x || 0);
        const y = Number(camera?.stagePos?.y || 0);
        if (
          !Number.isFinite(zoom) ||
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        )
          return state;
        if (
          Math.abs(state.zoom - zoom) < 0.0001 &&
          state.stagePos.x === x &&
          state.stagePos.y === y
        ) {
          return state;
        }
        return { zoom, stagePos: { x, y } };
      }),

    initialize: (layers) => {
      const normalizedLayers = (Array.isArray(layers) ? layers : [])
        .filter((layer): layer is CanvasLayer => Boolean(layer))
        .map(normalizeImportedLayer);
      const migratedLayers =
        collapseLegacyTextRasterFallbackLayers(normalizedLayers);
      // Self-healing: Deduplicate IDs to prevent synchronized movement bugs
      const seenIds = new Set<string>();
      const cleanLayers = migratedLayers.map((layer) => {
        if (seenIds.has(layer.id)) {
          const newId = uuidv4();
          return { ...layer, id: newId };
        }
        seenIds.add(layer.id);
        return layer;
      });
      const now = Date.now();
      set({
        layers: cleanLayers,
        selectedIds: [],
        zoom: DEFAULT_CANVAS_OPEN_ZOOM,
        stagePos: { x: 0, y: 0 },
        libtvWorkflow: { ...EMPTY_LIBTV_WORKFLOW_STATE },
        layerHistory:
          cleanLayers.length > 0
            ? [
                {
                  id: uuidv4(),
                  label: "打开项目",
                  createdAt: now,
                  layers: cloneLayers(cleanLayers),
                  libtvWorkflow: stripLibTvWorkflowTransientHistoryData(
                    EMPTY_LIBTV_WORKFLOW_STATE,
                  ),
                },
              ]
            : [],
        historyIndex: cleanLayers.length > 0 ? 0 : -1,
      });
      const projectId = String(get().projectId || "").trim();
      if (
        projectId &&
        !pendingCanvasRecoveryBootstrappedProjects.has(projectId)
      ) {
        pendingCanvasRecoveryBootstrappedProjects.add(projectId);
        schedulePendingCanvasLayerRecovery(projectId, get);
      }
    },

    // Refined Add Layer to auto-select (default true)
    addLayer: (layer, options) => {
      const requestedId = String(
        (layer as Partial<CanvasLayer>).id || "",
      ).trim();
      const id = requestedId || uuidv4();
      const newLayer = { ...layer, id, visible: true, locked: false };
      const shouldAutoSelect = options?.autoSelect !== false;
      set((state) => {
        const nextTool = ["pencil", "pen"].includes(state.tool)
          ? state.tool
          : "select";

        // Should Smart Board be at bottom?
        let newLayers;
        if (newLayer.type === "smart_board") {
          newLayers = [newLayer, ...state.layers];
        } else {
          newLayers = [...state.layers, newLayer];
        }

        const libtvNode = canvasLayerToLibTvWorkflowNode(
          newLayer as CanvasLayer,
        );
        const nextWorkflowNodes = libtvNode
          ? [
              ...state.libtvWorkflow.nodes.filter(
                (node) => node.id !== libtvNode.id,
              ),
              libtvNode,
            ]
          : state.libtvWorkflow.nodes;

        return {
          layers: newLayers,
          selectedIds: shouldAutoSelect ? [id] : state.selectedIds,
          tool: shouldAutoSelect ? nextTool : state.tool,
          libtvWorkflow: libtvNode
            ? {
                ...state.libtvWorkflow,
                enabled: true,
                nodes: nextWorkflowNodes,
              }
            : state.libtvWorkflow,
        };
      });
      return newLayer;
    },

    updateLayers: (patches) =>
      set((state) => {
        const patchMap = new Map<string, Partial<CanvasLayer>>();
        for (const patch of patches || []) {
          const id = String(patch?.id || "");
          if (!id) continue;
          const previous = patchMap.get(id);
          patchMap.set(
            id,
            previous ? { ...previous, ...patch.attrs } : patch.attrs,
          );
        }
        if (patchMap.size === 0) return state;

        const changedIds = new Set<string>();
        let nextLayers = state.layers.map((layer) => {
          const attrs = patchMap.get(layer.id);
          if (!attrs) return layer;
          changedIds.add(layer.id);
          return {
            ...layer,
            ...withInvalidatedTextRasterFallback(layer, attrs),
          };
        });
        if (changedIds.size === 0) return state;

        for (const id of changedIds) {
          const nextLayer = nextLayers.find((layer) => layer.id === id);
          if (!isLibTvWorkflowGroupLayer(nextLayer)) continue;
          const attrs = { ...(patchMap.get(id) || {}) };
          delete attrs.x;
          delete attrs.y;
          delete attrs.width;
          delete attrs.height;
          delete attrs.rotation;
          delete attrs.scaleX;
          delete attrs.scaleY;
          const layoutBounds = getLibTvWorkflowGroupBounds(
            nextLayer,
            nextLayers,
          );
          if (!layoutBounds) continue;
          nextLayers = nextLayers.map((layer) =>
            layer.id === id ? { ...layer, ...attrs, ...layoutBounds } : layer,
          );
        }

        const existingWorkflowIds = new Set(
          state.libtvWorkflow.nodes.map((node) => node.id),
        );
        const changedWorkflowNodes = nextLayers
          .filter((layer) => changedIds.has(layer.id))
          .map((layer) => canvasLayerToLibTvWorkflowNode(layer))
          .filter((node): node is NonNullable<typeof node> => Boolean(node));
        const workflowChanged =
          changedWorkflowNodes.length > 0 ||
          Array.from(changedIds).some((id) => existingWorkflowIds.has(id));

        return {
          layers: nextLayers,
          libtvWorkflow: workflowChanged
            ? {
                ...state.libtvWorkflow,
                nodes: [
                  ...state.libtvWorkflow.nodes.filter(
                    (node) => !changedIds.has(node.id),
                  ),
                  ...changedWorkflowNodes,
                ],
              }
            : state.libtvWorkflow,
        };
      }),

    updateLayer: (id, attrs) => get().updateLayers([{ id, attrs }]),

    removeLayer: (id) =>
      set((state) => {
        const removedIds = collectLibTvWorkflowNodeRemovalIds(
          state.libtvWorkflow.nodes,
          [id],
        );
        const layerRemovedIds = new Set<string>([id, ...removedIds]);
        const activeNodeId = state.libtvWorkflow.activeNodeId;
        return {
          layers: state.layers.filter((l) => !layerRemovedIds.has(l.id)),
          selectedIds: state.selectedIds.filter(
            (sid) => !layerRemovedIds.has(sid),
          ),
          libtvWorkflow: {
            ...state.libtvWorkflow,
            activeNodeId:
              activeNodeId && removedIds.has(activeNodeId)
                ? null
                : activeNodeId,
            nodes: state.libtvWorkflow.nodes.filter(
              (node) => !removedIds.has(node.id),
            ),
            edges: state.libtvWorkflow.edges.filter(
              (edge) =>
                !removedIds.has(edge.source) && !removedIds.has(edge.target),
            ),
          },
        };
      }),

    runImageGenerationJob: async (params) => {
      const projectId = String(
        params.projectId || get().projectId || "",
      ).trim();
      if (!projectId) throw new Error("缺少项目 ID，无法创建画布生成任务");
      const targetLayerIds = Array.isArray(params.targetLayerIds)
        ? params.targetLayerIds
            .map((id) => String(id || "").trim())
            .filter(Boolean)
        : [];
      const request = {
        ...(params.request && typeof params.request === "object"
          ? params.request
          : {}),
        targetLayerIds,
        targetLayerDrafts: Array.isArray(params.targetLayerDrafts)
          ? params.targetLayerDrafts
          : undefined,
      };
      const createdJob = await createCanvasBackendJob({
        projectId,
        kind: "image_generate",
        request,
      });
      const completedJob = await waitCanvasBackendJob({
        jobId: createdJob.id,
        onProgress: params.onProgress,
      });
      const images = collectImagesFromGeneratedTaskStatusPayload(
        completedJob.resultData?.response,
      );
      const directResultUrl = resolveCanvasBackendJobResultUrl(completedJob);
      if (images.length === 0 && directResultUrl) images.push(directResultUrl);
      return Array.from(
        new Set(
          images.map((item) => String(item || "").trim()).filter(Boolean),
        ),
      );
    },

    setLayers: (layers) => set({ layers }),

    selectLayer: (id, multi = false) =>
      set((state) => {
        const resetModes = {
          isTextEditing: false,
          isGenerativeFilling: false,
          isExpanding: false,
          isErasing: false,
          isQuickEditing: false,
          isAnnotationQuickEditing: false,
          isRotateEditing: false,
        };

        if (id === null) return { selectedIds: [], ...resetModes };
        if (multi) {
          return {
            selectedIds: state.selectedIds.includes(id)
              ? state.selectedIds.filter((sid) => sid !== id)
              : [...state.selectedIds, id],
            ...resetModes,
          };
        }
        return { selectedIds: [id], ...resetModes };
      }),

    setTool: (tool) => set({ tool }),

    setZoom: (zoom) =>
      set((state) => {
        const next = Number(zoom || 1);
        if (!Number.isFinite(next)) return state;
        if (Math.abs(state.zoom - next) < 0.0001) return state;
        return { zoom: next };
      }),

    setIsViewportMoving: (moving) =>
      set((state) => {
        const next = Boolean(moving);
        if (state.isViewportMoving === next) return state;
        return { isViewportMoving: next };
      }),

    bringToFront: (id) =>
      set((state) => {
        const layerIndex = state.layers.findIndex((l) => l.id === id);
        if (layerIndex < 0 || layerIndex === state.layers.length - 1)
          return state;

        const newLayers = [...state.layers];
        const [removed] = newLayers.splice(layerIndex, 1);
        newLayers.push(removed);
        return { layers: newLayers };
      }),

    sendToBack: (id) =>
      set((state) => {
        const layerIndex = state.layers.findIndex((l) => l.id === id);
        if (layerIndex <= 0) return state;

        const newLayers = [...state.layers];
        const [removed] = newLayers.splice(layerIndex, 1);
        newLayers.unshift(removed);
        return { layers: newLayers };
      }),

    moveUp: (id) =>
      set((state) => {
        const index = state.layers.findIndex((l) => l.id === id);
        if (index < 0 || index === state.layers.length - 1) return state;

        const newLayers = [...state.layers];
        const temp = newLayers[index];
        newLayers[index] = newLayers[index + 1];
        newLayers[index + 1] = temp;
        return { layers: newLayers };
      }),

    moveDown: (id) =>
      set((state) => {
        const index = state.layers.findIndex((l) => l.id === id);
        if (index <= 0) return state;

        const newLayers = [...state.layers];
        const temp = newLayers[index];
        newLayers[index] = newLayers[index - 1];
        newLayers[index - 1] = temp;
        return { layers: newLayers };
      }),

    toggleLock: (id) =>
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === id ? { ...l, locked: !l.locked } : l,
        ),
      })),

    toggleVisibility: (id) =>
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === id ? { ...l, visible: !l.visible } : l,
        ),
      })),

    duplicateLayer: (id) =>
      set((state) => {
        const layer = state.layers.find((l) => l.id === id);
        if (!layer) return state;

        const newId = uuidv4();
        const newLayer = {
          ...layer,
          id: newId,
          x: layer.x + 20,
          y: layer.y + 20,
        };
        return {
          layers: [...state.layers, newLayer],
          selectedIds: [newId],
        };
      }),

    removeBackground: async (id, options) => {
      const projectId = String(get().projectId || "").trim();
      const existingBackendJobId = String(
        options?.existingBackendJobId || "",
      ).trim();
      beginPendingCanvasLayerJob(
        projectId,
        "remove-bg",
        {
          layerId: id,
          backendJobId: existingBackendJobId || undefined,
        },
        { resumeJobId: options?.resumeJobId },
      );
      const layer = get().layers.find((l) => l.id === id);
      if (!layer || layer.type !== "image" || !layer.src) {
        throw new Error("图层分离仅支持带有效图片地址的图像图层");
      }

      // 设置生成状态
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === id ? { ...l, genStatus: "generating" as const } : l,
        ),
      }));

      try {
        // Ensure remove-bg always receives a public URL (OSS) instead of blob/data/proxy urls.
        const sourceCandidate = resolveLayerImageSource(layer) || layer.src;
        const publicUrl = await resolveApiImageSource(sourceCandidate, {
          preferPublicUrl: true,
        });
        let backendJobId = existingBackendJobId;
        if (!backendJobId) {
          if (!projectId)
            throw new Error("projectId is required for remove background job");
          const createdJob = await createCanvasBackendJob({
            projectId,
            kind: "remove_bg",
            request: {
              imageUrl: publicUrl,
              layerId: id,
            },
          });
          backendJobId = createdJob.id;
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === id ? { ...l, genJobId: backendJobId } : l,
            ),
          }));
        }

        const completedJob = await waitCanvasBackendJob({
          jobId: backendJobId,
          onProgress: (job) => {
            const progressText =
              typeof job.resultData?.message === "string"
                ? job.resultData.message
                : "";
            if (!progressText) return;
            set((state) => ({
              layers: state.layers.map((l) =>
                l.id === id
                  ? {
                      ...l,
                      genStatus: "generating" as const,
                      genStatusLabel: progressText.slice(0, 60),
                    }
                  : l,
              ),
            }));
          },
        });

        const resultUrl = resolveCanvasBackendJobResultUrl(completedJob);
        if (!resultUrl) throw new Error("Remove background returned empty url");
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === id
              ? {
                  ...l,
                  src: resultUrl,
                  genResultImage: resultUrl,
                  genStatus: "idle" as const,
                  genStatusLabel: undefined,
                }
              : l,
          ),
        }));
      } catch (error) {
        console.error("Remove background error:", error);
        // 错误时恢复状态
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === id
              ? {
                  ...l,
                  genStatus: "idle" as const,
                  genStatusLabel: undefined,
                }
              : l,
          ),
        }));
      }
    },

    editImage: async (ids, prompt) => {
      const layers = get().layers.filter((l) => ids.includes(l.id));
      const imageUrls = layers
        .filter((l) => l.type === "image")
        .map((l) => l.src)
        .filter(Boolean) as string[];

      if (imageUrls.length === 0) return;

      // Set status to generating on the first layer for feedback
      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === ids[0] ? { ...l, genStatus: "generating" as const } : l,
        ),
      }));

      try {
        const response = await fetch("/api/edit-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrls,
            prompt,
            projectId: get().projectId || "",
          }),
          credentials: "include",
        });

        const data = await response.json();
        let resultUrl = String(data?.url || data?.imageUrl || "").trim();
        if (!resultUrl && (data?.taskId || data?.statusUrl)) {
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === ids[0]
                ? {
                    ...l,
                    genStatus: "generating" as const,
                    genStatusLabel: "图片任务已提交，正在生成",
                    genTaskId:
                      typeof data.taskId === "string" ? data.taskId : undefined,
                    genTaskType:
                      typeof data.taskType === "string"
                        ? data.taskType
                        : undefined,
                    genProviderKey:
                      typeof data.providerKey === "string"
                        ? data.providerKey
                        : undefined,
                    genStatusUrl:
                      typeof data.statusUrl === "string"
                        ? data.statusUrl
                        : undefined,
                    genBackgroundTaskId:
                      typeof data.backgroundTaskId === "string"
                        ? data.backgroundTaskId
                        : undefined,
                  }
                : l,
            ),
          }));
          resultUrl = await waitForQuickEditImageTask(
            {
              taskId: typeof data.taskId === "string" ? data.taskId : undefined,
              taskType:
                typeof data.taskType === "string" ? data.taskType : undefined,
              statusUrl:
                typeof data.statusUrl === "string" ? data.statusUrl : undefined,
              modelId:
                typeof data.modelId === "string" ? data.modelId : undefined,
              projectId: get().projectId || undefined,
              providerKey:
                typeof data.providerKey === "string"
                  ? data.providerKey
                  : undefined,
            },
            {
              onProgress: (message) =>
                set((state) => ({
                  layers: state.layers.map((l) =>
                    l.id === ids[0]
                      ? {
                          ...l,
                          genStatus: "generating" as const,
                          genStatusLabel: message.slice(0, 60),
                        }
                      : l,
                  ),
                })),
            },
          );
        }
        if (resultUrl) {
          const id = uuidv4();
          const firstLayer = layers[0];
          const gap = 20; // 原图和新图之间的间距

          set((state) => ({
            layers: [
              ...state.layers.map((l) =>
                l.id === ids[0] ? { ...l, genStatus: "idle" as const } : l,
              ),
              {
                id,
                type: "image",
                // 新图片放在原图右边：原图 x + 原图宽度 + 间距
                x: (firstLayer.x || 0) + (firstLayer.width || 400) + gap,
                y: firstLayer.y || 0, // 保持相同的 y 坐标
                width: firstLayer.width,
                height: firstLayer.height,
                src: resultUrl,
                genResultImage: resultUrl,
                visible: true,
                locked: false,
                genStatus: "idle" as const,
              },
            ],
            selectedIds: [id],
          }));
        } else {
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === ids[0] ? { ...l, genStatus: "idle" as const } : l,
            ),
          }));
        }
      } catch (error) {
        console.error("AI Edit failed:", error);
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === ids[0] ? { ...l, genStatus: "idle" as const } : l,
          ),
        }));
      }
    },

    explodeLayer: async (id: string, options) => {
      const projectId = String(get().projectId || "").trim();
      const existingBackendJobId = String(
        options?.existingBackendJobId || "",
      ).trim();
      const existingPlaceholderId = String(options?.placeholderId || "").trim();
      beginPendingCanvasLayerJob(
        projectId,
        "explode",
        {
          layerId: id,
          placeholderId: existingPlaceholderId || undefined,
          backendJobId: existingBackendJobId || undefined,
        },
        { resumeJobId: options?.resumeJobId },
      );
      const layer = get().layers.find((l) => l.id === id);
      if (!layer || layer.type !== "image" || !layer.src) {
        return;
      }

      const resolveWorldTransform = (layerId: string) => {
        const allLayers = get().layers;
        const byId = new Map(allLayers.map((l) => [l.id, l]));
        const start = byId.get(layerId);
        if (!start) {
          return { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 };
        }

        // Approximate world transform by composing parent transforms.
        // We apply parent's scale to child's position (ignoring rotation for position),
        // and multiply scales + add rotations.
        let x = Number(start.x || 0);
        let y = Number(start.y || 0);
        let sx = Number(start.scaleX ?? 1);
        let sy = Number(start.scaleY ?? 1);
        let rot = Number(start.rotation ?? 0);

        let cursor: any = start;
        while (cursor?.parentId) {
          const parent = byId.get(cursor.parentId);
          if (!parent) break;
          const psx = Number(parent.scaleX ?? 1);
          const psy = Number(parent.scaleY ?? 1);
          x = Number(parent.x || 0) + x * psx;
          y = Number(parent.y || 0) + y * psy;
          sx *= psx;
          sy *= psy;
          rot += Number(parent.rotation ?? 0);
          cursor = parent;
        }

        return { x, y, scaleX: sx || 1, scaleY: sy || 1, rotation: rot || 0 };
      };

      const resolveImageSize = async (
        src: string,
      ): Promise<{ width: number; height: number } | null> => {
        try {
          const img = new globalThis.Image();
          img.src = src;
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
          if (img.naturalWidth && img.naturalHeight) {
            return { width: img.naturalWidth, height: img.naturalHeight };
          }
        } catch {
          // ignore
        }
        return null;
      };

      const naturalSize = await resolveImageSize(layer.src);
      const sourceWidth =
        layer.width && layer.width > 1
          ? layer.width
          : naturalSize?.width || 1024;
      const sourceHeight =
        layer.height && layer.height > 1
          ? layer.height
          : naturalSize?.height || 1024;

      // Lovart-like UX: create a placeholder copy to the right so users can compare before/after.
      // Lovart/tldraw stores final sizes in w/h (no separate scale), so we "bake" world scale into width/height.
      const world = resolveWorldTransform(id);
      const duplicateId = existingPlaceholderId || uuidv4();
      const spacing = 50;
      const absWorldScaleX = Math.abs(world.scaleX || 1);
      const absWorldScaleY = Math.abs(world.scaleY || 1);
      const signWorldScaleX = (world.scaleX || 1) < 0 ? -1 : 1;
      const signWorldScaleY = (world.scaleY || 1) < 0 ? -1 : 1;
      const displayWidth = sourceWidth * absWorldScaleX;
      const displayHeight = sourceHeight * absWorldScaleY;
      const placeholderSrc = `data:image/svg+xml;utf8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
                <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#BCA78A"/>
                        <stop offset="100%" stop-color="#8D7A63"/>
                    </linearGradient>
                </defs>
                <rect width="1024" height="1024" fill="url(#g)"/>
            </svg>`,
      )}`;

      const hasDuplicateLayer = get().layers.some(
        (existing) => existing.id === duplicateId,
      );
      if (!hasDuplicateLayer) {
        set((state) => ({
          layers: [
            ...state.layers,
            {
              id: duplicateId,
              type: "image" as const,
              x: world.x + displayWidth + spacing,
              y: world.y,
              width: displayWidth,
              height: displayHeight,
              scaleX: signWorldScaleX,
              scaleY: signWorldScaleY,
              rotation: world.rotation || 0,
              opacity: layer.opacity ?? 1,
              src: placeholderSrc,
              visible: true,
              locked: false,
              genStatus: "generating" as const,
              genStatusLabel:
                "WaveSpeed SAM3 分割 → 阿里 Qwen OCR → ZenMux Image 2 背景补全",
              genPrompt: "严格图层分离中...",
            },
          ],
          // Avoid mixing nested/local coords with world coords in multi-selection bounds.
          selectedIds: [duplicateId],
        }));
      }
      get().panLayerIntoViewport(duplicateId, 96);

      try {
        const publicUrl = await resolveApiImageSource(layer.src, {
          preferPublicUrl: true,
        });
        let backendJobId = existingBackendJobId;
        if (!backendJobId) {
          if (!projectId)
            throw new Error("projectId is required for explode job");
          const createdJob = await createCanvasBackendJob({
            projectId,
            kind: "explode",
            request: {
              imageUrl: publicUrl,
              layerId: id,
            },
          });
          backendJobId = createdJob.id;
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === duplicateId ? { ...l, genJobId: backendJobId } : l,
            ),
          }));
        }

        const completedJob = await waitCanvasBackendJob({
          jobId: backendJobId,
          onProgress: (job) => {
            const stage = String(job.resultData?.stage || "")
              .trim()
              .toLowerCase();
            const stageLabel: Record<string, string> = {
              queued: "等待开始严格图层分离",
              segmentation: "SAM3 分割中",
              sam3: "SAM3 分割中",
              ocr: "OCR 文字识别与样式重建中",
              text_style: "OCR 文字识别与样式重建中",
              background_inpaint: "ZenMux Image 2 背景补全中",
              inpaint: "ZenMux Image 2 背景补全中",
              quality: "正在执行分层质量校验",
              psd: "分层完成，PSD 已就绪",
            };
            const message = String(
              job.resultData?.message || stageLabel[stage] || "",
            ).trim();
            if (!message) return;
            set((state) => ({
              layers: state.layers.map((l) =>
                l.id === duplicateId
                  ? {
                      ...l,
                      genStatus: "generating" as const,
                      genStatusLabel: message.slice(0, 60),
                    }
                  : l,
              ),
            }));
          },
        });
        const data = completedJob.resultData?.response || {};
        const strictResponse = assertStrictExplodeResponse(data);
        const artifacts = strictResponse.artifacts as any[];

        const toNumber = (value: any, fallback: number) => {
          const n = Number(value);
          return Number.isFinite(n) ? n : fallback;
        };

        const parseFontWeight = (value: any) => {
          const numeric = Number(value);
          if (Number.isFinite(numeric) && numeric > 0)
            return Math.max(100, Math.min(900, numeric));
          const normalized = String(value || "")
            .trim()
            .toLowerCase();
          if (!normalized) return 400;
          if (normalized.includes("thin")) return 100;
          if (
            normalized.includes("extra light") ||
            normalized.includes("extralight") ||
            normalized.includes("ultra light")
          )
            return 200;
          if (normalized.includes("light")) return 300;
          if (normalized.includes("medium")) return 500;
          if (
            normalized.includes("semi bold") ||
            normalized.includes("semibold") ||
            normalized.includes("demi bold")
          )
            return 600;
          if (
            normalized.includes("extra bold") ||
            normalized.includes("extrabold")
          )
            return 800;
          if (normalized.includes("heavy") || normalized.includes("black"))
            return 900;
          if (normalized.includes("bold")) return 700;
          return 400;
        };

        const resolveLovartFontFamily = (fontFamily: any, text: string) => {
          const requested =
            String(fontFamily || "").trim() ||
            (/[一-龥]/.test(text) ? "Source Han Sans CN" : "Arial");
          const compact = requested.replace(/\s+/g, "");
          const compactLower = compact.toLowerCase();
          const matched =
            LOVART_FONT_OPTIONS.find((name) => name === requested) ||
            LOVART_FONT_OPTIONS.find(
              (name) => name.replace(/\s+/g, "") === compact,
            ) ||
            LOVART_FONT_OPTIONS.find(
              (name) => name.replace(/\s+/g, "").toLowerCase() === compactLower,
            ) ||
            LOVART_FONT_OPTIONS.find((name) => {
              const lower = name.replace(/\s+/g, "").toLowerCase();
              return (
                lower.includes(compactLower) || compactLower.includes(lower)
              );
            }) ||
            requested;
          const cssFamily = buildLovartRenderFontFamily(String(matched));
          return {
            label: requested,
            resolvedFamily: String(matched),
            cssFamily,
          };
        };

        const parseCssColor = (value: any) => {
          const structured = Array.isArray(value)
            ? value
            : value && typeof value === "object"
              ? [
                  value.r ?? value.red,
                  value.g ?? value.green,
                  value.b ?? value.blue,
                  value.a ?? value.alpha,
                ]
              : null;
          if (structured && structured.length >= 3) {
            const channels = structured
              .slice(0, 4)
              .map((channel) => Number(channel));
            if (channels.slice(0, 3).every(Number.isFinite)) {
              const rgbScale = channels
                .slice(0, 3)
                .every((channel) => channel >= 0 && channel <= 1)
                ? 255
                : 1;
              const [r, g, b] = channels;
              const alphaRaw = channels[3];
              const alpha = Number.isFinite(alphaRaw)
                ? Math.max(
                    0,
                    Math.min(1, alphaRaw > 1 ? alphaRaw / 255 : alphaRaw),
                  )
                : 1;
              const fill = `#${[r, g, b]
                .map((channel) =>
                  Math.max(0, Math.min(255, Math.round(channel * rgbScale)))
                    .toString(16)
                    .padStart(2, "0"),
                )
                .join("")}`;
              return { fill, alpha };
            }
          }
          const raw = String(value || "").trim();
          if (!raw) return { fill: "#000000", alpha: 1 };
          const rgba = raw.match(/rgba?\(([^)]+)\)/i);
          if (rgba) {
            const parts = rgba[1]
              .split(/[\s,\/]+/)
              .filter(Boolean)
              .map((part) => Number(part.trim()));
            if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
              const [r, g, b] = parts;
              const alpha = Number.isFinite(parts[3])
                ? Math.max(0, Math.min(1, parts[3]))
                : 1;
              const fill = `#${[r, g, b]
                .map((n) =>
                  Math.max(0, Math.min(255, Math.round(n)))
                    .toString(16)
                    .padStart(2, "0"),
                )
                .join("")}`;
              return { fill, alpha };
            }
          }
          return { fill: raw, alpha: 1 };
        };

        const parseOptionalCssColor = (value: any) => {
          const raw = String(value || "").trim();
          if (!raw || raw === "null" || raw === "undefined") return null;
          return parseCssColor(value);
        };

        const firstDefined = (...values: any[]) =>
          values.find(
            (value) => value !== undefined && value !== null && value !== "",
          );

        const normalizeSeparationConfidence = (
          value: any,
        ): number | undefined => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric)) return undefined;
          const normalized =
            numeric > 1 && numeric <= 100 ? numeric / 100 : numeric;
          return Math.max(0, Math.min(1, normalized));
        };

        const normalizeSeparationProvenance = (
          value: any,
        ): LayerSeparationProvenance[] => {
          const entries = Array.isArray(value) ? value : value ? [value] : [];
          return entries.flatMap((entry): LayerSeparationProvenance[] => {
            if (typeof entry === "string") {
              const stage = entry.trim();
              return stage ? [{ stage }] : [];
            }
            if (!entry || typeof entry !== "object") return [];
            const stage = String(
              entry.stage || entry.name || entry.type || "",
            ).trim();
            if (!stage) return [];
            const sourceIdsRaw = firstDefined(
              entry.source_artifact_ids,
              entry.sourceArtifactIds,
            );
            const sourceArtifactIds = Array.isArray(sourceIdsRaw)
              ? sourceIdsRaw
                  .map((item) => String(item || "").trim())
                  .filter(Boolean)
              : undefined;
            return [
              {
                stage,
                provider: String(entry.provider || "").trim() || undefined,
                model: String(entry.model || "").trim() || undefined,
                taskId:
                  String(
                    firstDefined(entry.task_id, entry.taskId) || "",
                  ).trim() || undefined,
                generated:
                  typeof entry.generated === "boolean"
                    ? entry.generated
                    : undefined,
                sourceArtifactIds: sourceArtifactIds?.length
                  ? sourceArtifactIds
                  : undefined,
                startedAt:
                  String(
                    firstDefined(entry.started_at, entry.startedAt) || "",
                  ).trim() || undefined,
                completedAt:
                  String(
                    firstDefined(entry.completed_at, entry.completedAt) || "",
                  ).trim() || undefined,
                metadata:
                  entry.metadata &&
                  typeof entry.metadata === "object" &&
                  !Array.isArray(entry.metadata)
                    ? { ...entry.metadata }
                    : undefined,
              },
            ];
          });
        };

        const normalizeSeparationWarnings = (
          value: any,
        ): LayerSeparationWarning[] => {
          const entries = Array.isArray(value) ? value : value ? [value] : [];
          return entries.flatMap((entry, index): LayerSeparationWarning[] => {
            if (typeof entry === "string") {
              const message = entry.trim();
              return message
                ? [
                    {
                      code: `warning_${index + 1}`,
                      message,
                      severity: "warning",
                      recoverable: true,
                    },
                  ]
                : [];
            }
            if (!entry || typeof entry !== "object") return [];
            const message = String(entry.message || entry.detail || "").trim();
            if (!message) return [];
            const rawSeverity = String(entry.severity || "")
              .trim()
              .toLowerCase();
            const severity: LayerSeparationWarning["severity"] =
              rawSeverity === "error"
                ? "error"
                : rawSeverity === "info"
                  ? "info"
                  : "warning";
            return [
              {
                code: String(entry.code || `warning_${index + 1}`).trim(),
                message,
                severity,
                recoverable: entry.recoverable !== false,
                stage: String(entry.stage || "").trim() || undefined,
                artifactId:
                  String(
                    firstDefined(entry.artifact_id, entry.artifactId) || "",
                  ).trim() || undefined,
                details:
                  entry.details &&
                  typeof entry.details === "object" &&
                  !Array.isArray(entry.details)
                    ? { ...entry.details }
                    : undefined,
              },
            ];
          });
        };

        const normalizeSeparationBBox = (
          value: any,
        ): [number, number, number, number] | undefined => {
          if (!Array.isArray(value) || value.length < 4) return undefined;
          const bbox = value
            .slice(0, 4)
            .map((coordinate) => Number(coordinate));
          return bbox.every(Number.isFinite)
            ? (bbox as [number, number, number, number])
            : undefined;
        };

        const normalizeSeparationPolygon = (
          value: any,
        ): Array<[number, number]> | undefined => {
          if (!Array.isArray(value)) return undefined;
          const usesPointEntries =
            Array.isArray(value[0]) ||
            (value[0] &&
              typeof value[0] === "object" &&
              ("x" in value[0] || "y" in value[0]));
          const pairs = usesPointEntries
            ? value
            : Array.from(
                { length: Math.floor(value.length / 2) },
                (_, index) => [value[index * 2], value[index * 2 + 1]],
              );
          const polygon = pairs.flatMap((pair): Array<[number, number]> => {
            const x = Number(Array.isArray(pair) ? pair[0] : pair?.x);
            const y = Number(Array.isArray(pair) ? pair[1] : pair?.y);
            return Number.isFinite(x) && Number.isFinite(y) ? [[x, y]] : [];
          });
          return polygon.length >= 3 ? polygon : undefined;
        };

        const normalizeLayerSeparationMetadata = (
          ...sources: any[]
        ): LayerSeparationMetadata => {
          const validSources = sources.filter(
            (source) => source && typeof source === "object",
          );
          const pick = (...keys: string[]) => {
            for (const source of validSources) {
              for (const key of keys) {
                const value = source?.[key];
                if (value !== undefined && value !== null && value !== "")
                  return value;
              }
            }
            return undefined;
          };
          const provenance = validSources
            .flatMap((source) =>
              normalizeSeparationProvenance(source.provenance),
            )
            .filter(
              (entry, index, all) =>
                all.findIndex(
                  (candidate) =>
                    JSON.stringify(candidate) === JSON.stringify(entry),
                ) === index,
            );
          const warnings = validSources
            .flatMap((source) => normalizeSeparationWarnings(source.warnings))
            .filter(
              (entry, index, all) =>
                all.findIndex(
                  (candidate) =>
                    JSON.stringify(candidate) === JSON.stringify(entry),
                ) === index,
            );
          const editableModeValue = String(
            pick("editable_mode", "editableMode") || "",
          )
            .trim()
            .toLowerCase()
            .replace(/-/g, "_");
          const editableModeRaw =
            editableModeValue === "native" ? "native_text" : editableModeValue;
          const editableModes = new Set<LayerSeparationEditableMode>([
            "native_text",
            "raster_fallback",
            "raster_image",
            "reference",
            "hybrid",
          ]);
          const editableMode = editableModes.has(
            editableModeRaw as LayerSeparationEditableMode,
          )
            ? (editableModeRaw as LayerSeparationEditableMode)
            : undefined;
          const fallbackRequiredRaw = pick(
            "fallback_required",
            "fallbackRequired",
          );
          const fallbackRequired =
            fallbackRequiredRaw === true ||
            fallbackRequiredRaw === 1 ||
            String(fallbackRequiredRaw || "")
              .trim()
              .toLowerCase() === "true";
          const rasterFallbackRaw = pick("raster_fallback", "rasterFallback");
          const fallbackImageUrl = String(
            firstDefined(
              rasterFallbackRaw?.image_url,
              rasterFallbackRaw?.imageUrl,
              pick(
                "fallback_image_url",
                "fallbackImageUrl",
                "raster_fallback_url",
                "rasterFallbackUrl",
              ),
            ) || "",
          ).trim();
          const fallbackBBox = normalizeSeparationBBox(
            firstDefined(
              rasterFallbackRaw?.bbox,
              pick("raster_fallback_bbox", "rasterFallbackBBox"),
            ),
          );
          const rasterFallback = fallbackImageUrl
            ? ({
                imageUrl: fallbackImageUrl,
                visibleByDefault:
                  rasterFallbackRaw?.visible_by_default !== false &&
                  rasterFallbackRaw?.visibleByDefault !== false,
                editableTextVisibleByDefault:
                  rasterFallbackRaw?.editable_text_visible_by_default ===
                    true ||
                  rasterFallbackRaw?.editableTextVisibleByDefault === true,
                reason:
                  String(
                    rasterFallbackRaw?.reason ||
                      pick("fallback_reason", "fallbackReason") ||
                      "",
                  ).trim() || undefined,
                bbox: fallbackBBox,
              } satisfies LayerSeparationRasterFallback)
            : undefined;

          return {
            schemaVersion:
              String(pick("schema_version", "schemaVersion") || "").trim() ||
              undefined,
            artifactId:
              String(pick("artifact_id", "artifactId", "id") || "").trim() ||
              undefined,
            elementType:
              String(pick("element_type", "elementType") || "").trim() ||
              undefined,
            confidence: normalizeSeparationConfidence(pick("confidence")),
            provenance,
            warnings,
            editableMode:
              editableMode ||
              (fallbackRequired ? "raster_fallback" : undefined),
            visibleByDefault:
              typeof pick("visible_by_default", "visibleByDefault") ===
              "boolean"
                ? Boolean(pick("visible_by_default", "visibleByDefault"))
                : undefined,
            maskUrl:
              String(
                pick("mask_url", "maskUrl", "glyph_mask_url", "glyphMaskUrl") ||
                  "",
              ).trim() || undefined,
            generatedMaskUrl:
              String(
                pick("generated_mask_url", "generatedMaskUrl") || "",
              ).trim() || undefined,
            bbox: normalizeSeparationBBox(pick("bbox")),
            maskBBox: normalizeSeparationBBox(pick("mask_bbox", "maskBBox")),
            generatedMaskBBox: normalizeSeparationBBox(
              pick("generated_mask_bbox", "generatedMaskBBox"),
            ),
            polygon: normalizeSeparationPolygon(pick("polygon")),
            rasterFallback,
          };
        };

        const parseTextEffects = (
          raw: any,
          scale: number,
        ): LayerEffect[] | undefined => {
          const effects: LayerEffect[] = [];
          const strokeColor = parseOptionalCssColor(
            firstDefined(
              raw?.stroke_color_css,
              raw?.strokeColor,
              raw?.stroke_color,
              raw?.stroke?.color_css,
              raw?.stroke?.color,
              raw?.outline_color_css,
              raw?.outlineColor,
              raw?.outline_color,
            ),
          );
          const strokeWidth = toNumber(
            firstDefined(
              raw?.stroke_width_px,
              raw?.strokeWidth,
              raw?.stroke_width,
              raw?.stroke?.width_px,
              raw?.stroke?.width,
              raw?.outline_width_px,
              raw?.outlineWidth,
              raw?.outline_width,
            ),
            0,
          );
          const strokeOpacity = Math.max(
            0,
            Math.min(
              1,
              toNumber(
                firstDefined(raw?.stroke?.opacity, raw?.stroke_opacity),
                1,
              ),
            ),
          );
          if (strokeColor && strokeWidth > 0) {
            effects.push({
              id: uuidv4(),
              type: "stroke",
              isEnabled: true,
              params: {
                color: strokeColor.fill,
                size: Math.max(0.5, strokeWidth * scale),
                opacity: strokeOpacity * strokeColor.alpha,
              },
            });
          }

          const shadowColor = parseOptionalCssColor(
            firstDefined(
              raw?.shadow_color_css,
              raw?.shadowColor,
              raw?.shadow_color,
              raw?.shadow?.color_css,
              raw?.shadow?.color,
            ),
          );
          const shadowBlur = toNumber(
            firstDefined(
              raw?.shadow_blur_px,
              raw?.shadowBlur,
              raw?.shadow_blur,
              raw?.shadow?.blur_px,
              raw?.shadow?.blur,
            ),
            0,
          );
          const shadowOffsetX = toNumber(
            firstDefined(
              raw?.shadow_offset_x,
              raw?.shadowOffsetX,
              raw?.shadow_x,
              raw?.shadow?.offset_x_px,
              raw?.shadow?.offset_x,
              raw?.shadow?.offsetX,
            ),
            0,
          );
          const shadowOffsetY = toNumber(
            firstDefined(
              raw?.shadow_offset_y,
              raw?.shadowOffsetY,
              raw?.shadow_y,
              raw?.shadow?.offset_y_px,
              raw?.shadow?.offset_y,
              raw?.shadow?.offsetY,
            ),
            0,
          );
          const shadowOpacity = Math.max(
            0,
            Math.min(
              1,
              toNumber(
                firstDefined(raw?.shadow?.opacity, raw?.shadow_opacity),
                1,
              ),
            ),
          );
          if (
            shadowColor &&
            (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0)
          ) {
            effects.push({
              id: uuidv4(),
              type: "dropShadow",
              isEnabled: true,
              params: {
                color: shadowColor.fill,
                blur: Math.max(0, shadowBlur * scale),
                offsetX: shadowOffsetX * scale,
                offsetY: shadowOffsetY * scale,
                opacity: shadowOpacity * shadowColor.alpha,
              },
            });
          }

          return effects.length > 0 ? effects : undefined;
        };

        const normalizeTextAlign = (value: any): CanvasLayer["textAlign"] => {
          const alignRaw = String(value || "")
            .trim()
            .toUpperCase();
          if (alignRaw === "END" || alignRaw === "RIGHT") return "right";
          if (alignRaw === "CENTER") return "center";
          return "left";
        };

        const ensureSeparatedTextFontLoaded = async (
          fontFamily: string,
          fontUrl?: string,
        ) => {
          const url = String(fontUrl || "").trim();
          if (url) {
            const exactFontLoaded = await ensureLovartFontUrlLoaded(
              fontFamily,
              url,
            );
            if (exactFontLoaded) return true;
            console.warn("[explodeLayer] Failed to load detected font URL", {
              fontFamily,
            });
            return false;
          }
          return ensureLovartFontLoaded(fontFamily);
        };

        const parseTextStyle = (raw: any) => {
          const text = String(
            raw?.text ?? raw?.characters ?? raw?.content ?? "",
          );
          const fontWeight = parseFontWeight(
            firstDefined(raw?.font_weight, raw?.fontWeight),
          );
          const fontStyleRaw = String(
            firstDefined(raw?.font_style, raw?.fontStyle) || "",
          ).toLowerCase();
          const isItalic =
            fontStyleRaw.includes("italic") || fontStyleRaw.includes("oblique");
          const isBold = fontWeight >= 700 || fontStyleRaw.includes("bold");
          const fontStyle: CanvasLayer["fontStyle"] =
            isItalic && isBold
              ? "italic bold"
              : isItalic
                ? "italic"
                : isBold
                  ? "bold"
                  : "normal";

          const fontSizePx = toNumber(
            firstDefined(raw?.font_size_px, raw?.fontSize, raw?.font_size),
            16,
          );
          const leading = toNumber(
            firstDefined(raw?.line_height, raw?.lineHeight, raw?.leading),
            1.2,
          );
          const lineHeight =
            leading > 4
              ? Math.max(0.1, leading / Math.max(1, fontSizePx))
              : Math.max(0.1, leading);
          const color = parseCssColor(
            firstDefined(raw?.fill_rgba, raw?.color_css, raw?.fill, raw?.color),
          );
          const font = resolveLovartFontFamily(
            firstDefined(
              raw?.font_family,
              raw?.fontFamily,
              raw?.font_postscript_name,
            ),
            text,
          );
          const resolvedFontFamily = resolveLovartLayerSeparationFontName(
            font.resolvedFamily,
            text,
            fontSizePx,
            fontWeight,
          );
          const transform = Array.isArray(raw?.transform)
            ? raw.transform.map((value: any) => Number(value))
            : null;
          const transformRotation =
            transform &&
            transform.length >= 2 &&
            transform.slice(0, 2).every(Number.isFinite)
              ? (Math.atan2(transform[1], transform[0]) * 180) / Math.PI
              : 0;
          const gradientRaw =
            raw?.gradient && typeof raw.gradient === "object"
              ? raw.gradient
              : null;
          const gradientStops = Array.isArray(gradientRaw?.stops)
            ? gradientRaw.stops.flatMap(
                (stop: any): Array<{ offset: number; color: string }> => {
                  const offset = Number(stop?.offset);
                  const colorValue = String(
                    stop?.color_css || stop?.color || "",
                  ).trim();
                  return Number.isFinite(offset) && colorValue
                    ? [
                        {
                          offset: Math.max(0, Math.min(1, offset)),
                          color: colorValue,
                        },
                      ]
                    : [];
                },
              )
            : [];
          const gradient =
            gradientStops.length >= 2
              ? {
                  type:
                    String(gradientRaw?.type || "").toLowerCase() === "radial"
                      ? ("radial" as const)
                      : ("linear" as const),
                  angleDeg: toNumber(
                    firstDefined(gradientRaw?.angle_deg, gradientRaw?.angleDeg),
                    0,
                  ),
                  stops: gradientStops.sort(
                    (
                      left: { offset: number; color: string },
                      right: { offset: number; color: string },
                    ) => left.offset - right.offset,
                  ),
                }
              : undefined;
          const styleOpacity = Math.max(
            0,
            Math.min(1, toNumber(raw?.opacity, 1)),
          );

          return {
            text,
            fontSizePx,
            fontFamily: buildLovartRenderFontFamily(resolvedFontFamily),
            fontFamilyLabel: resolvedFontFamily,
            fontPostscriptName:
              String(raw?.font_postscript_name || "").trim() || undefined,
            fontUrl: String(raw?.font_url || "").trim() || undefined,
            resolvedFontFamily,
            fontWeight,
            fontStyle,
            fill: color.fill,
            opacity: color.alpha * styleOpacity,
            textAlign: normalizeTextAlign(
              firstDefined(raw?.text_align, raw?.textAlign),
            ),
            lineHeight,
            letterSpacing: toNumber(
              firstDefined(
                raw?.letter_spacing_px,
                raw?.letterSpacing,
                raw?.tracking,
              ),
              0,
            ),
            rotation: toNumber(raw?.rotation, transformRotation),
            gradient,
          };
        };

        const getSeparatedElementName = (metadata: any) => {
          const label = String(metadata?.label || "");
          if (label === "bg_image") return "背景";
          const elementType = String(
            metadata?.element_type || "",
          ).toLowerCase();
          if (elementType === "effect") return "特效元素";
          if (elementType === "decor") return "装饰元素";
          if (elementType === "subject") return "图像主体";
          return "图像元素";
        };

        let newLayers: CanvasLayer[] = [];

        if (artifacts) {
          // Determine canvas size from artifacts (preferred), fallback to natural size.
          const responseMetadata =
            data?.data?.metadata && typeof data.data.metadata === "object"
              ? data.data.metadata
              : data?.metadata && typeof data.metadata === "object"
                ? data.metadata
                : {};
          const responseSource =
            data?.data?.source && typeof data.data.source === "object"
              ? data.data.source
              : data?.source && typeof data.source === "object"
                ? data.source
                : {};
          let canvasW = Math.max(
            1,
            toNumber(
              firstDefined(
                responseSource?.width,
                responseMetadata?.canvas_size?.width,
                responseMetadata?.width,
                naturalSize?.width,
                sourceWidth,
              ),
              1024,
            ),
          );
          let canvasH = Math.max(
            1,
            toNumber(
              firstDefined(
                responseSource?.height,
                responseMetadata?.canvas_size?.height,
                responseMetadata?.height,
                naturalSize?.height,
                sourceHeight,
              ),
              1024,
            ),
          );
          for (const a of artifacts) {
            if (a?.type === "image" && a?.metadata?.label === "bg_image") {
              canvasW = Math.max(1, toNumber(a?.metadata?.width, canvasW));
              canvasH = Math.max(1, toNumber(a?.metadata?.height, canvasH));
            }
            if (a?.type === "text") {
              try {
                const parsed = JSON.parse(String(a?.content || ""));
                const cs = parsed?.canvas_size;
                if (cs?.width && cs?.height) {
                  canvasW = Math.max(1, toNumber(cs.width, canvasW));
                  canvasH = Math.max(1, toNumber(cs.height, canvasH));
                }
              } catch {
                // ignore
              }
            }
          }

          const ratioX = (sourceWidth || canvasW) / canvasW;
          const ratioY = (sourceHeight || canvasH) / canvasH;
          const buildSeparatedImageMask = (
            metadata: LayerSeparationMetadata,
          ): Pick<CanvasLayer, "maskSrc" | "mask"> => {
            if (!metadata.maskUrl) return {};
            const maskBBox = metadata.maskBBox;
            if (!maskBBox) return { maskSrc: metadata.maskUrl };
            return {
              mask: {
                src: metadata.maskUrl,
                x: maskBBox[0] * ratioX * absWorldScaleX,
                y: maskBBox[1] * ratioY * absWorldScaleY,
                width: Math.max(
                  1,
                  (maskBBox[2] - maskBBox[0]) * ratioX * absWorldScaleX,
                ),
                height: Math.max(
                  1,
                  (maskBBox[3] - maskBBox[1]) * ratioY * absWorldScaleY,
                ),
                positionRelativeToLayer: false,
              },
            };
          };

          // Create a group that contains all separated elements.
          // Children use local coordinates; group carries the original layer transform.
          const groupId = uuidv4();
          const groupRotation = world.rotation || 0;
          const groupLayerSeparation = normalizeLayerSeparationMetadata(
            responseMetadata,
            data?.data,
            ...artifacts.map((artifact: any) => artifact?.metadata),
          );
          if (
            !groupLayerSeparation.editableMode &&
            groupLayerSeparation.schemaVersion
          ) {
            groupLayerSeparation.editableMode = "hybrid";
          }
          const group: CanvasLayer = {
            id: groupId,
            type: "group",
            x: world.x + displayWidth + spacing,
            y: world.y,
            width: displayWidth,
            height: displayHeight,
            // Keep only flip sign on the group; scale is baked into child geometry.
            scaleX: signWorldScaleX,
            scaleY: signWorldScaleY,
            rotation: groupRotation,
            opacity: layer.opacity ?? 1,
            visible: true,
            locked: false,
            name: "编辑元素",
            children: [],
            layerSeparation: groupLayerSeparation,
          };

          newLayers.push(group);

          const sourceReferenceUrl = String(
            firstDefined(
              responseSource?.reference_url,
              responseSource?.referenceUrl,
              data?.data?.original_input_args?.image_url,
              data?.data?.originalInputArgs?.imageUrl,
              data?.original_input_args?.image_url,
              data?.originalInputArgs?.imageUrl,
              layer.src,
            ) || "",
          ).trim();
          const hasReferenceArtifact = artifacts.some((artifact: any) => {
            const metadata = artifact?.metadata || {};
            return (
              artifact?.type === "image" &&
              String(
                firstDefined(metadata?.editable_mode, metadata?.editableMode) ||
                  "",
              ).trim() === "reference"
            );
          });
          if (sourceReferenceUrl && !hasReferenceArtifact) {
            const referenceId = uuidv4();
            newLayers.push({
              id: referenceId,
              type: "image" as const,
              parentId: groupId,
              x: 0,
              y: 0,
              width: displayWidth,
              height: displayHeight,
              opacity: 1,
              src: sourceReferenceUrl,
              visible: false,
              locked: true,
              name: "原图参考",
              genStatus: "idle" as const,
              genPrompt: "original_reference",
              subtype: "layer-separation-reference",
              layerSeparation: {
                schemaVersion: groupLayerSeparation.schemaVersion,
                confidence: 1,
                provenance: [{ stage: "source", generated: false }],
                warnings: [],
                editableMode: "reference",
              },
            });
          }

          // Images first: bg then fg
          for (const a of artifacts) {
            if (!a || a.type !== "image") continue;
            const label = String(a?.metadata?.label || "");
            const src = typeof a.content === "string" ? a.content : "";
            if (!src) continue;
            const separationMetadata = normalizeLayerSeparationMetadata(
              a?.metadata,
              a,
              {
                schema_version:
                  data?.data?.schema_version || data?.schema_version,
              },
            );
            const isReference = separationMetadata.editableMode === "reference";

            if (label === "bg_image" && !isReference) {
              newLayers.push({
                id: uuidv4(),
                type: "image" as const,
                parentId: groupId,
                x: 0,
                y: 0,
                width: displayWidth,
                height: displayHeight,
                opacity: 1,
                src,
                visible: separationMetadata.visibleByDefault ?? true,
                locked: false,
                name: "背景",
                genStatus: "idle" as const,
                genPrompt: "bg_image",
                subtype: "layer-separation-bg",
                ...buildSeparatedImageMask(separationMetadata),
                layerSeparation: separationMetadata,
              });
              continue;
            }

            // fg_image (cropped content is preferred; bbox locates it on the canvas)
            const bbox = Array.isArray(a?.metadata?.bbox)
              ? a.metadata.bbox
              : null;
            const w = toNumber(a?.metadata?.width, 0);
            const h = toNumber(a?.metadata?.height, 0);

            const bx1 = bbox ? toNumber(bbox[0], 0) : 0;
            const by1 = bbox ? toNumber(bbox[1], 0) : 0;
            const bx2 = bbox ? toNumber(bbox[2], bx1 + w) : bx1 + w || canvasW;
            const by2 = bbox ? toNumber(bbox[3], by1 + h) : by1 + h || canvasH;

            const localW = Math.max(1, (bx2 - bx1) * ratioX);
            const localH = Math.max(1, (by2 - by1) * ratioY);

            newLayers.push({
              id: uuidv4(),
              type: "image" as const,
              parentId: groupId,
              x: bx1 * ratioX * absWorldScaleX,
              y: by1 * ratioY * absWorldScaleY,
              width: localW * absWorldScaleX,
              height: localH * absWorldScaleY,
              opacity: 1,
              src,
              visible:
                !isReference && (separationMetadata.visibleByDefault ?? true),
              locked: isReference,
              name: isReference
                ? "原图参考"
                : getSeparatedElementName(a?.metadata),
              genStatus: "idle" as const,
              genPrompt: isReference ? "original_reference" : "fg_image",
              subtype: isReference
                ? "layer-separation-reference"
                : "layer-separation-fg",
              ...buildSeparatedImageMask(separationMetadata),
              layerSeparation: separationMetadata,
            });
          }

          // Text render data
          for (const a of artifacts) {
            if (!a || a.type !== "text") continue;
            const raw = a.content;
            if (!raw) throw new Error("文字 artifact 缺少可编辑文字数据");
            try {
              const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
              if (
                parsed?.version !== "2.0" ||
                !Array.isArray(parsed?.layers) ||
                parsed.layers.length === 0
              ) {
                throw new Error("文字 artifact 不是有效的 v2 可编辑文字数据");
              }
              const textLayers = parsed.layers;
              const artifactSeparationMetadata =
                normalizeLayerSeparationMetadata(a?.metadata, parsed, {
                  schema_version:
                    data?.data?.schema_version || data?.schema_version,
                });
              for (let i = 0; i < textLayers.length; i += 1) {
                const tl = textLayers[i] || {};
                const textInfo = tl?.text_info || tl?.textInfo || {};
                const ti = parseTextStyle(textInfo);
                if (!ti.text.trim()) continue;
                const textRect = resolveSeparatedTextGeometry({
                  x: tl?.x,
                  y: tl?.y,
                  w: tl?.w,
                  h: tl?.h,
                  rotation: ti.rotation,
                  polygon: tl?.polygon,
                });
                const localX = textRect.x * ratioX * absWorldScaleX;
                const localY = textRect.y * ratioY * absWorldScaleY;
                const fontSize = Math.max(
                  1,
                  ti.fontSizePx * ratioY * absWorldScaleY,
                );
                const letterSpacing =
                  ti.letterSpacing * ratioX * absWorldScaleX;
                const localW = Math.max(
                  1,
                  textRect.w * ratioX * absWorldScaleX,
                );
                const localH = Math.max(
                  1,
                  textRect.h * ratioY * absWorldScaleY,
                );
                const textEffectScale = Math.max(
                  0.1,
                  (ratioX * absWorldScaleX + ratioY * absWorldScaleY) / 2,
                );
                const gradientRadius = Math.hypot(localW, localH) / 2;
                const gradientAngle =
                  ((ti.gradient?.angleDeg || 0) * Math.PI) / 180;
                const gradientCenter = { x: localW / 2, y: localH / 2 };
                const gradientStart = ti.gradient
                  ? {
                      x:
                        gradientCenter.x -
                        Math.cos(gradientAngle) * gradientRadius,
                      y:
                        gradientCenter.y -
                        Math.sin(gradientAngle) * gradientRadius,
                    }
                  : undefined;
                const gradientEnd = ti.gradient
                  ? {
                      x:
                        gradientCenter.x +
                        Math.cos(gradientAngle) * gradientRadius,
                      y:
                        gradientCenter.y +
                        Math.sin(gradientAngle) * gradientRadius,
                    }
                  : undefined;
                const textSeparationMetadata = normalizeLayerSeparationMetadata(
                  tl,
                  tl?.metadata,
                  textInfo,
                  artifactSeparationMetadata,
                );
                const editableMode = textSeparationMetadata.editableMode;
                const isHybridTwin =
                  editableMode === "raster_fallback" &&
                  tl?.editable_mode === "raster_fallback";
                if (
                  !isHybridTwin &&
                  (editableMode !== "native_text" ||
                    tl?.editable_mode !== "native_text")
                ) {
                  throw new Error(
                    `文字图层 ${i + 1} 缺少有效的可编辑文字 twin`,
                  );
                }
                if (
                  !isHybridTwin &&
                  textSeparationMetadata.visibleByDefault === false
                ) {
                  throw new Error(`原生文字图层 ${i + 1} 被标记为默认隐藏`);
                }
                const effects = parseTextEffects(textInfo, textEffectScale);
                // Hybrid layers display their verified pixel crop until the user
                // edits them. Font loading can therefore happen lazily in the text
                // editor instead of serially delaying every explode result.
                const fontLoaded = isHybridTwin
                  ? true
                  : await ensureSeparatedTextFontLoaded(
                      ti.resolvedFontFamily,
                      ti.fontUrl,
                    );
                if (!isHybridTwin && !fontLoaded) {
                  throw new Error(
                    `文字图层 ${i + 1} 的精确字体“${ti.resolvedFontFamily}”加载失败`,
                  );
                }

                const rasterFallback = textSeparationMetadata.rasterFallback;
                let textRasterFallback: CanvasTextRasterFallback | undefined;
                if (isHybridTwin) {
                  if (!rasterFallback?.imageUrl) {
                    throw new Error(`文字图层 ${i + 1} 缺少精确视觉备份`);
                  }
                  const fallbackBBox = rasterFallback.bbox;
                  const fallbackX = fallbackBBox
                    ? fallbackBBox[0] * ratioX * absWorldScaleX
                    : localX;
                  const fallbackY = fallbackBBox
                    ? fallbackBBox[1] * ratioY * absWorldScaleY
                    : localY;
                  const fallbackWidth = fallbackBBox
                    ? Math.max(
                        1,
                        (fallbackBBox[2] - fallbackBBox[0]) *
                          ratioX *
                          absWorldScaleX,
                      )
                    : localW;
                  const fallbackHeight = fallbackBBox
                    ? Math.max(
                        1,
                        (fallbackBBox[3] - fallbackBBox[1]) *
                          ratioY *
                          absWorldScaleY,
                      )
                    : localH;
                  textRasterFallback = {
                    imageUrl: rasterFallback.imageUrl,
                    x: fallbackX,
                    y: fallbackY,
                    width: fallbackWidth,
                    height: fallbackHeight,
                    active: rasterFallback.visibleByDefault,
                  };
                }

                newLayers.push({
                  id: uuidv4(),
                  type: "text" as const,
                  parentId: groupId,
                  x: localX,
                  y: localY,
                  width: localW,
                  height: localH,
                  text: ti.text,
                  fontSize,
                  fontFamily: ti.fontFamily,
                  fontFamilyLabel: ti.fontFamilyLabel,
                  fontPostscriptName: ti.fontPostscriptName,
                  fontUrl: ti.fontUrl,
                  fontWeight: ti.fontWeight,
                  fontStyle: ti.fontStyle,
                  fill: ti.fill,
                  fillType: ti.gradient ? "gradient" : "solid",
                  fillGradientType: ti.gradient?.type,
                  fillGradientStops: ti.gradient?.stops,
                  fillGradientStart: gradientStart,
                  fillGradientEnd: gradientEnd,
                  opacity: ti.opacity,
                  visible: isHybridTwin
                    ? Boolean(
                        rasterFallback?.visibleByDefault ||
                        rasterFallback?.editableTextVisibleByDefault,
                      )
                    : true,
                  locked: false,
                  name: `文字 ${i + 1}`,
                  genStatus: "idle" as const,
                  textAlign: ti.textAlign,
                  rotation: textRect.rotation,
                  lineHeight: ti.lineHeight,
                  letterSpacing,
                  effects,
                  genPrompt: `text_${i + 1}`,
                  subtype: "layer-separation-text",
                  layerSeparation: textSeparationMetadata,
                  textRasterFallback,
                });
              }
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);
              throw new Error(`文字图层解析失败：${message}`);
            }
          }

          group.children = newLayers
            .filter((candidate) => candidate.parentId === groupId)
            .map((candidate) => candidate.id);
        }

        const groupId = newLayers.find((l) => l.type === "group")?.id;
        const separatedChildren = groupId
          ? newLayers.filter((candidate) => candidate.parentId === groupId)
          : [];
        if (!groupId || separatedChildren.length === 0) {
          throw new Error("严格图层分离响应未生成任何可用图层");
        }
        set((state) => {
          const withoutDuplicate = state.layers.filter(
            (l) => l.id !== duplicateId,
          );
          const finalLayers = withoutDuplicate.flatMap((l) => {
            if (l.id !== id) return [l];
            return [l, ...newLayers];
          });

          return {
            layers: finalLayers,
            selectedIds: groupId ? [groupId] : [id],
          };
        });
      } catch (error) {
        console.error("OmniPSD Explode failed:", error);
        const message =
          error instanceof Error ? error.message : String(error || "未知错误");
        const visibleMessage = `图层分离失败：${message}`.slice(0, 120);
        set((state) => ({
          layers: state.layers.map((candidate) =>
            candidate.id === duplicateId
              ? {
                  ...candidate,
                  genStatus: "failed" as const,
                  genStatusLabel: visibleMessage,
                  genPrompt: visibleMessage,
                }
              : candidate,
          ),
          selectedIds: state.layers.some(
            (candidate) => candidate.id === duplicateId,
          )
            ? [duplicateId]
            : [id],
        }));
        throw error instanceof Error ? error : new Error(message);
      }
    },

    mergeLayers: (ids) => {
      set({ isMerging: true, selectedIds: ids });
    },

    finishMerge: (newLayer, mergedIds) => {
      const { layers, selectedIds } = get();
      const idsToMerge =
        mergedIds && mergedIds.length > 0 ? mergedIds : selectedIds;
      // Remove merged layers
      const remainingLayers = layers.filter((l) => !idsToMerge.includes(l.id));

      // Add new layer
      set({
        layers: [...remainingLayers, newLayer],
        selectedIds: [newLayer.id],
        isMerging: false,
      });
    },

    generativeFill: async (id, maskData, prompt) => {
      const layer = get().layers.find((l) => l.id === id);
      if (!layer || layer.type !== "image" || !layer.src) return;

      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === id ? { ...l, genStatus: "generating" as const } : l,
        ),
      }));

      try {
        let imageUrl = layer.src;
        if (
          typeof window !== "undefined" &&
          imageUrl &&
          !imageUrl.startsWith("data:")
        ) {
          try {
            const fetchUrl = imageUrl.startsWith("http")
              ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
              : imageUrl;
            const res = await fetch(fetchUrl);
            if (res.ok) {
              const blob = await res.blob();
              imageUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
          } catch (e) {
            console.warn(
              "[Store] Failed to convert image to data URL, using original src",
            );
          }
        }

        const response = await fetch("/api/erase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl,
            maskData,
            prompt,
            projectId: get().projectId || "",
          }),
          credentials: "include",
        });

        const data = await response.json();
        if (data.url) {
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === id
                ? {
                    ...l,
                    src: data.url,
                    genResultImage: data.url,
                    genStatus: "idle" as const,
                  }
                : l,
            ),
          }));
        } else {
          console.error("[Store] generativeFill failed: No URL in response");
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === id ? { ...l, genStatus: "idle" as const } : l,
            ),
          }));
        }
      } catch (error) {
        console.error("[Store] generativeFill error:", error);
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === id ? { ...l, genStatus: "idle" as const } : l,
          ),
        }));
      }
    },

    editText: async (id, originalText, newText, maskImage, options) => {
      const projectId = String(get().projectId || "").trim();
      const existingBackendJobId = String(
        options?.existingBackendJobId || "",
      ).trim();
      const existingResultLayerId = String(options?.placeholderId || "").trim();
      beginPendingCanvasLayerJob(
        projectId,
        "edit-text",
        {
          layerId: id,
          originalText,
          newText,
          maskImage,
          resultLayerId: existingResultLayerId || undefined,
          backendJobId: existingBackendJobId || undefined,
        },
        { resumeJobId: options?.resumeJobId },
      );
      const layer = get().layers.find((l) => l.id === id);
      if (!layer || layer.type !== "image" || !layer.src) {
        return;
      }

      let changes: Array<{ originalText: string; newText: string }> = [];
      let promptLabel = "";

      if (Array.isArray(originalText)) {
        changes = originalText;
        promptLabel = `Batch Edit: ${changes.length} texts`;
      } else {
        if (!newText) {
          return;
        }
        changes = [{ originalText, newText }];
        promptLabel = `${originalText} -> ${newText}`;
      }

      // Create a new layer for the result immediately (Side-by-side)
      const newId = existingResultLayerId || uuidv4();
      const gap = 20;
      const resolveImageSize = async (
        src: string,
      ): Promise<{ width: number; height: number } | null> => {
        try {
          const img = new globalThis.Image();
          img.src = src;
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
          if (img.naturalWidth && img.naturalHeight) {
            return { width: img.naturalWidth, height: img.naturalHeight };
          }
        } catch {
          // ignore
        }
        return null;
      };
      const naturalSize = await resolveImageSize(layer.src);
      const sourceWidth =
        naturalSize?.width ||
        (layer.width && layer.width > 1 ? layer.width : 1024);
      const sourceHeight =
        naturalSize?.height ||
        (layer.height && layer.height > 1 ? layer.height : 1024);
      const displayWidth = sourceWidth * Math.abs(layer.scaleX || 1);
      const newLayer: CanvasLayer = {
        ...layer,
        id: newId,
        x: layer.x + displayWidth + gap, // Position to the right (pan camera if needed)
        y: layer.y,
        width: sourceWidth,
        height: sourceHeight,
        visible: true,
        genStatus: "generating", // Set generating status on new layer
        genPrompt: `正在修改文字: ${promptLabel}`,
      };
      const hasExistingResultLayer = get().layers.some(
        (existing) => existing.id === newId,
      );
      if (hasExistingResultLayer) {
        set((state) => ({
          layers: state.layers.map((existing) =>
            existing.id === newId
              ? {
                  ...existing,
                  genStatus: "generating" as const,
                  genPrompt: `正在修改文字: ${promptLabel}`,
                }
              : existing,
          ),
          selectedIds: [newId],
        }));
      } else {
        set((state) => ({
          layers: [...state.layers, newLayer],
          selectedIds: [newId], // Select the new layer
        }));
      }
      get().panLayerIntoViewport(newId, 96);

      try {
        const { selectedModel } = useAgentStore.getState();
        let backendJobId = existingBackendJobId;
        if (!backendJobId) {
          if (!projectId)
            throw new Error("projectId is required for edit-text job");
          const createdJob = await createCanvasBackendJob({
            projectId,
            kind: "edit_text",
            request: {
              layerId: id,
              imageUrl: layer.src,
              originalText: Array.isArray(originalText)
                ? changes[0]?.originalText
                : originalText,
              newText: Array.isArray(originalText)
                ? changes[0]?.newText
                : newText,
              changes: Array.isArray(originalText) ? changes : undefined,
              maskImage,
              modelId: selectedModel,
              sourceWidth,
              sourceHeight,
              naturalWidth: naturalSize?.width,
              naturalHeight: naturalSize?.height,
            },
          });
          backendJobId = createdJob.id;
          set((state) => ({
            layers: state.layers.map((existing) =>
              existing.id === newId
                ? { ...existing, genJobId: backendJobId }
                : existing,
            ),
          }));
        }

        const completedJob = await waitCanvasBackendJob({
          jobId: backendJobId,
          onProgress: (job) => {
            const message = String(job.resultData?.message || "").trim();
            if (!message) return;
            set((state) => ({
              layers: state.layers.map((existing) =>
                existing.id === newId
                  ? {
                      ...existing,
                      genStatus: "generating" as const,
                      genStatusLabel: message.slice(0, 60),
                    }
                  : existing,
              ),
            }));
          },
        });
        const resultUrl = resolveCanvasBackendJobResultUrl(completedJob);
        if (!resultUrl) {
          throw new Error("editText returned empty url");
        }

        set((state) => ({
          layers: state.layers.map((l) => {
            if (l.id !== newId) return l;
            const responseResult = completedJob.resultData?.response;
            const outputWidth = Number(
              responseResult?.output?.width || responseResult?.source?.width,
            );
            const outputHeight = Number(
              responseResult?.output?.height || responseResult?.source?.height,
            );
            return {
              ...l,
              src: resultUrl,
              width:
                Number.isFinite(outputWidth) && outputWidth > 0
                  ? Math.round(outputWidth)
                  : sourceWidth,
              height:
                Number.isFinite(outputHeight) && outputHeight > 0
                  ? Math.round(outputHeight)
                  : sourceHeight,
              genStatus: "idle",
              genStatusLabel: undefined,
              genResultImage: resultUrl,
            };
          }),
        }));
      } catch (error) {
        console.error("[Store] editText error:", error);
        // Remove the failed layer
        set((state) => ({
          layers: state.layers.filter((l) => l.id !== newId),
        }));
      }
    },

    setTriggerDownload: () => set({ downloadTrigger: Date.now() }),
    resetDownload: () => set({ downloadTrigger: 0 }),
    setIsErasing: (isErasing) => set({ isErasing }),
    setIsTextEditing: (isTextEditing) => set({ isTextEditing }),
    setIsGenerativeFilling: (isGenerativeFilling) =>
      set({ isGenerativeFilling }),
    setIsQuickEditing: (isQuickEditing) => set({ isQuickEditing }),
    setIsAnnotationQuickEditing: (isAnnotationQuickEditing) =>
      set({ isAnnotationQuickEditing }),
    setIsAnnotating: (isAnnotating) => set({ isAnnotating }),
    setIsRotateEditing: (isRotateEditing) => set({ isRotateEditing }),
    setIsMoveObjectEditing: (isMoveObjectEditing) =>
      set({ isMoveObjectEditing }),
    setActiveAnnotationRegionId: (activeAnnotationRegionId) =>
      set({ activeAnnotationRegionId }),
    setIsExpanding: (isExpanding) => set({ isExpanding }),
    setActiveImageToolPanel: (activeImageToolPanel) =>
      set({ activeImageToolPanel }),
    setIsEyedropperPicking: (isEyedropperPicking) =>
      set({ isEyedropperPicking }),
    setPencilColor: (color) => set({ pencilColor: color }),
    setPencilSize: (size) => set({ pencilSize: size }),

    upscaleLayer: async (id, scale, aspectRatio, options) => {
      const layer = get().layers.find((l) => l.id === id);
      const existingTaskId = String(options?.existingTaskId || "").trim();
      const existingBackendJobId = String(
        options?.existingBackendJobId || "",
      ).trim();
      const requestedPlaceholderId = String(
        options?.placeholderId || "",
      ).trim();
      const fallbackPlaceholderId = requestedPlaceholderId || uuidv4();
      const sourceLayer =
        layer && layer.type === "image" && layer.src ? layer : null;
      const sourceWidth = sourceLayer
        ? Math.max(
            1,
            Math.round(
              (sourceLayer.width || 0) * Math.abs(sourceLayer.scaleX || 1),
            ),
          )
        : 0;
      const sourceHeight = sourceLayer
        ? Math.max(
            1,
            Math.round(
              (sourceLayer.height || 0) * Math.abs(sourceLayer.scaleY || 1),
            ),
          )
        : 0;
      const displayWidth = sourceLayer
        ? Math.max(
            1,
            Math.round(
              (sourceLayer.width || 0) * Math.abs(sourceLayer.scaleX || 1),
            ),
          )
        : 0;
      const gap = 20;
      const rawScale = String(scale).toUpperCase();
      const normalizedSize: "1K" | "2K" | "4K" | "8K" =
        rawScale === "8"
          ? "8K"
          : rawScale === "4"
            ? "4K"
            : rawScale === "2"
              ? "2K"
              : rawScale === "1K" ||
                  rawScale === "2K" ||
                  rawScale === "4K" ||
                  rawScale === "8K"
                ? rawScale
                : "2K";
      const normalizedAspectRatio =
        typeof aspectRatio === "string" ? aspectRatio.trim() : "";
      const resolvedAspectRatio: GeminiAspectRatioKey =
        sourceWidth > 0 &&
        sourceHeight > 0 &&
        isGeminiAspectRatioKey(normalizedAspectRatio)
          ? normalizedAspectRatio
          : getClosestGeminiAspectRatio(
              Math.max(1, sourceWidth),
              Math.max(1, sourceHeight),
            );
      const providerSize: "1K" | "2K" | "4K" =
        normalizedSize === "8K" ? "4K" : normalizedSize;
      const baseTargetSize = getGeminiResolution(
        resolvedAspectRatio,
        providerSize,
      );
      const targetPixelWidth =
        normalizedSize === "8K"
          ? baseTargetSize.width * 2
          : baseTargetSize.width;
      const targetPixelHeight =
        normalizedSize === "8K"
          ? baseTargetSize.height * 2
          : baseTargetSize.height;
      const scaleXAbs = Math.max(0.0001, Math.abs(sourceLayer?.scaleX || 1));
      const scaleYAbs = Math.max(0.0001, Math.abs(sourceLayer?.scaleY || 1));
      const targetCanvasWidth = Math.max(
        1,
        Math.round(targetPixelWidth / scaleXAbs),
      );
      const targetCanvasHeight = Math.max(
        1,
        Math.round(targetPixelHeight / scaleYAbs),
      );
      const projectId = String(get().projectId || "").trim();
      beginPendingCanvasLayerJob(
        projectId,
        "upscale",
        {
          layerId: id,
          scale: normalizedSize,
          aspectRatio: normalizedAspectRatio,
          placeholderId: fallbackPlaceholderId,
          taskId: existingTaskId || undefined,
          backendJobId: existingBackendJobId || undefined,
        },
        { resumeJobId: options?.resumeJobId },
      );
      const placeholderId =
        String(options?.placeholderId || "").trim() || fallbackPlaceholderId;
      if (!sourceLayer && !existingTaskId) {
        return;
      }
      const placeholderExists = get().layers.some(
        (existing) => existing.id === placeholderId,
      );
      if (!placeholderExists && sourceLayer) {
        const placeholderLayer: CanvasLayer = {
          ...sourceLayer,
          id: placeholderId,
          x: sourceLayer.x + displayWidth + gap,
          y: sourceLayer.y,
          width: targetCanvasWidth,
          height: targetCanvasHeight,
          visible: true,
          genStatus: "generating",
          genPrompt: `放大中 (${normalizedSize}${resolvedAspectRatio ? ` · ${resolvedAspectRatio}` : ""} · ${targetPixelWidth}x${targetPixelHeight})`,
        };

        set((state) => ({
          layers: [...state.layers, placeholderLayer],
          selectedIds: state.selectedIds.includes(id)
            ? [id]
            : state.selectedIds,
        }));
      } else {
        set((state) => ({
          layers: state.layers.map((existing) =>
            existing.id === placeholderId
              ? {
                  ...existing,
                  genStatus: "generating" as const,
                  genStatusLabel: "放大中",
                }
              : existing,
          ),
        }));
      }
      get().panLayerIntoViewport(placeholderId, 96);

      const applyUpscaleResult = (
        url: string,
        result?: {
          target?: { width?: number; height?: number };
          output?: { width?: number; height?: number };
        },
      ) => {
        // Always display through local proxy to avoid CORS/tainting.
        // Keep cache-busting stable so the browser can still cache between renders/sessions.
        const displaySrc =
          url && url.startsWith("http")
            ? `/api/image-proxy?url=${encodeURIComponent(url)}&v=${encodeURIComponent(`${placeholderId}-${Date.now()}`)}`
            : url;
        set((state) => ({
          layers: state.layers.map((l) => {
            if (l.id !== placeholderId) return l;
            const nextOutputWidth = Number(result?.output?.width);
            const nextOutputHeight = Number(result?.output?.height);
            const nextTargetWidth =
              Number.isFinite(nextOutputWidth) && nextOutputWidth > 0
                ? nextOutputWidth
                : Number(result?.target?.width);
            const nextTargetHeight =
              Number.isFinite(nextOutputHeight) && nextOutputHeight > 0
                ? nextOutputHeight
                : Number(result?.target?.height);
            const nextScaleXAbs = Math.max(0.0001, Math.abs(l.scaleX || 1));
            const nextScaleYAbs = Math.max(0.0001, Math.abs(l.scaleY || 1));
            const nextWidth =
              Number.isFinite(nextTargetWidth) && nextTargetWidth > 0
                ? Math.max(1, Math.round(nextTargetWidth / nextScaleXAbs))
                : l.width;
            const nextHeight =
              Number.isFinite(nextTargetHeight) && nextTargetHeight > 0
                ? Math.max(1, Math.round(nextTargetHeight / nextScaleYAbs))
                : l.height;
            return {
              ...l,
              width: nextWidth,
              height: nextHeight,
              src: displaySrc,
              genResultImage: url,
              genStatus: "idle" as const,
            };
          }),
        }));
      };

      try {
        let backendJobId = existingBackendJobId;
        if (!backendJobId) {
          if (!sourceLayer) {
            return;
          }
          const sourceImageSrc = String(sourceLayer.src || "").trim();
          if (!sourceImageSrc) {
            return;
          }
          let upscaleImageUrl = sourceImageSrc;
          try {
            upscaleImageUrl = await resolveApiImageSource(upscaleImageUrl, {
              preferPublicUrl: true,
            });
          } catch (error) {
            console.warn(
              "[Store] Failed to resolve public upscale URL, fallback to inline source",
              error,
            );
          }
          if (!projectId)
            throw new Error("projectId is required for upscale job");
          const createdJob = await createCanvasBackendJob({
            projectId,
            kind: "upscale",
            request: {
              layerId: id,
              placeholderId,
              resultLayerId: placeholderId,
              imageUrl: upscaleImageUrl,
              imageSize: normalizedSize,
              scale: normalizedSize,
              aspectRatio: normalizedAspectRatio,
              sourceWidth,
              sourceHeight,
            },
          });
          backendJobId = createdJob.id;
          set((state) => ({
            layers: state.layers.map((existing) =>
              existing.id === placeholderId
                ? { ...existing, genJobId: backendJobId }
                : existing,
            ),
          }));
        }

        const completedJob = await waitCanvasBackendJob({
          jobId: backendJobId,
          onProgress: (job) => {
            const progressLabel = String(job.resultData?.message || "").trim();
            if (!progressLabel) return;
            set((state) => ({
              layers: state.layers.map((existing) =>
                existing.id === placeholderId
                  ? {
                      ...existing,
                      genStatus: "generating" as const,
                      genStatusLabel: progressLabel.slice(0, 80),
                    }
                  : existing,
              ),
            }));
          },
        });

        const resultUrl = resolveCanvasBackendJobResultUrl(completedJob);
        if (!resultUrl) {
          throw new Error("Upscale returned empty result");
        }
        const responseResult = completedJob.resultData?.response;
        const targetResult =
          responseResult &&
          typeof responseResult === "object" &&
          ((responseResult as any).target || (responseResult as any).output)
            ? (responseResult as {
                target?: { width?: number; height?: number };
                output?: { width?: number; height?: number };
              })
            : undefined;
        applyUpscaleResult(resultUrl, targetResult);
      } catch (error) {
        console.error("Upscale failed:", error);
        const message =
          error instanceof Error
            ? error.message
            : String(error || "Upscale failed");
        // Keep the placeholder on canvas so users can see what happened and delete/retry if needed.
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === placeholderId
              ? {
                  ...l,
                  genStatus: "failed" as const,
                  genStatusLabel: "放大失败",
                  genPrompt: `放大失败: ${message}`.slice(0, 220),
                }
              : l,
          ),
        }));
      }
    },

    eraseArea: async (id, maskData, prompt, options) => {
      const projectId = String(get().projectId || "").trim();
      const existingBackendJobId = String(
        options?.existingBackendJobId || "",
      ).trim();
      const existingPlaceholderId = String(options?.placeholderId || "").trim();
      beginPendingCanvasLayerJob(
        projectId,
        "erase",
        {
          layerId: id,
          maskData,
          prompt,
          placeholderId: existingPlaceholderId || undefined,
          backendJobId: existingBackendJobId || undefined,
        },
        { resumeJobId: options?.resumeJobId },
      );
      const layer = get().layers.find((l) => l.id === id);
      const sourceImageUrl =
        layer && layer.type === "image" ? resolveLayerImageSource(layer) : "";
      if (!layer || layer.type !== "image" || !sourceImageUrl) {
        return;
      }
      const displayWidth = (layer.width || 400) * Math.abs(layer.scaleX || 1);
      const placeholderId = existingPlaceholderId || uuidv4();
      const hasPlaceholder = get().layers.some(
        (existing) => existing.id === placeholderId,
      );
      if (!hasPlaceholder) {
        set((state) => ({
          layers: [
            ...state.layers,
            {
              ...layer,
              id: placeholderId,
              name: `${layer.name || "图片"} 擦除`,
              x: (layer.x || 0) + displayWidth + 24,
              y: layer.y || 0,
              width: layer.width,
              height: layer.height,
              scaleX: layer.scaleX || 1,
              scaleY: layer.scaleY || 1,
              rotation: layer.rotation || 0,
              opacity: layer.opacity ?? 1,
              src: sourceImageUrl,
              genStatus: "generating" as const,
              genStatusLabel: "擦除中",
              genPrompt: prompt || "擦除中...",
              genReferenceImage: sourceImageUrl,
              genResultImage: null,
            },
          ],
        }));
      } else {
        set((state) => ({
          layers: state.layers.map((existing) =>
            existing.id === placeholderId
              ? {
                  ...existing,
                  genStatus: "generating" as const,
                  genStatusLabel: "擦除中",
                  genPrompt: prompt || "擦除中...",
                }
              : existing,
          ),
        }));
      }
      const placeholderLayer = get().layers.find(
        (existing) => existing.id === placeholderId,
      );
      if (!placeholderLayer) {
        return;
      }

      try {
        let imageUrl = sourceImageUrl;
        if (
          typeof window !== "undefined" &&
          imageUrl &&
          !imageUrl.startsWith("data:")
        ) {
          try {
            const fetchUrl = imageUrl.startsWith("http")
              ? `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`
              : imageUrl;
            const res = await fetch(fetchUrl);
            if (res.ok) {
              const blob = await res.blob();
              imageUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });
            }
          } catch (e) {
            console.warn(
              "[Store] Failed to convert erase image to data URL, using original src",
            );
          }
        }
        let resultUrl = "";
        if (existingBackendJobId) {
          const completedJob = await waitCanvasBackendJob({
            jobId: existingBackendJobId,
            onProgress: (job) => {
              const message = String(job.resultData?.message || "").trim();
              if (!message) return;
              set((state) => ({
                layers: state.layers.map((existing) =>
                  existing.id === placeholderLayer.id
                    ? {
                        ...existing,
                        genStatus: "generating" as const,
                        genStatusLabel: message.slice(0, 60),
                      }
                    : existing,
                ),
              }));
            },
          });
          resultUrl = resolveCanvasBackendJobResultUrl(completedJob) || "";
        } else {
          if (!projectId)
            throw new Error("projectId is required for erase job");
          const createdJob = await createCanvasBackendJob({
            projectId,
            kind: "erase",
            request: {
              layerId: id,
              placeholderId,
              imageUrl,
              maskData,
              prompt,
            },
          });
          set((state) => ({
            layers: state.layers.map((existing) =>
              existing.id === placeholderLayer.id
                ? { ...existing, genJobId: createdJob.id }
                : existing,
            ),
          }));
          const completedJob = await waitCanvasBackendJob({
            jobId: createdJob.id,
            onProgress: (job) => {
              const message = String(job.resultData?.message || "").trim();
              if (!message) return;
              set((state) => ({
                layers: state.layers.map((existing) =>
                  existing.id === placeholderLayer.id
                    ? {
                        ...existing,
                        genStatus: "generating" as const,
                        genStatusLabel: message.slice(0, 60),
                      }
                    : existing,
                ),
              }));
            },
          });
          resultUrl = resolveCanvasBackendJobResultUrl(completedJob) || "";
        }

        if (resultUrl) {
          // Always display through local proxy.
          // Keep cache-busting stable so the browser can still cache between renders/sessions.
          const displaySrc = resultUrl.startsWith("http")
            ? `/api/image-proxy?url=${encodeURIComponent(resultUrl)}&v=${encodeURIComponent(placeholderLayer.id)}`
            : resultUrl;
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === placeholderLayer.id
                ? {
                    ...l,
                    src: displaySrc,
                    genResultImage: resultUrl,
                    genStatus: "idle" as const,
                    genStatusLabel: undefined,
                  }
                : l,
            ),
          }));
        } else {
          console.error("[Store] eraseArea failed: No URL in response");
          get().removeLayer(placeholderLayer.id);
        }
      } catch (error) {
        console.error("Erase failed:", error);
        get().removeLayer(placeholderLayer.id);
      }
    },

    extendLayer: async (id, direction, ratio, prompt, options) => {
      const projectId = String(get().projectId || "").trim();
      const existingBackendJobId = String(
        options?.existingBackendJobId || "",
      ).trim();
      beginPendingCanvasLayerJob(
        projectId,
        "extend",
        {
          layerId: id,
          direction,
          ratio,
          prompt,
          backendJobId: existingBackendJobId || undefined,
        },
        { resumeJobId: options?.resumeJobId },
      );
      const layer = get().layers.find((l) => l.id === id);
      if (!layer || layer.type !== "image" || !layer.src) {
        return;
      }

      set((state) => ({
        layers: state.layers.map((l) =>
          l.id === id ? { ...l, genStatus: "generating" as const } : l,
        ),
      }));

      try {
        const { selectedModel } = useAgentStore.getState();
        let backendJobId = existingBackendJobId;
        if (!backendJobId) {
          if (!projectId)
            throw new Error("projectId is required for extend job");
          const createdJob = await createCanvasBackendJob({
            projectId,
            kind: "outpaint",
            request: {
              _canvasOperation: "extend",
              layerId: id,
              imageUrl: layer.src,
              direction,
              ratio,
              targetWidth: Number.isFinite(Number(layer.width))
                ? Math.max(
                    1,
                    Math.round(
                      Number(layer.width) * Math.max(1, Number(ratio || 1)),
                    ),
                  )
                : undefined,
              targetHeight: Number.isFinite(Number(layer.height))
                ? Math.max(
                    1,
                    Math.round(
                      Number(layer.height) * Math.max(1, Number(ratio || 1)),
                    ),
                  )
                : undefined,
              prompt,
              model: selectedModel,
            },
          });
          backendJobId = createdJob.id;
          set((state) => ({
            layers: state.layers.map((existing) =>
              existing.id === id
                ? { ...existing, genJobId: backendJobId }
                : existing,
            ),
          }));
        }
        const completedJob = await waitCanvasBackendJob({
          jobId: backendJobId,
          onProgress: (job) => {
            const message = String(job.resultData?.message || "").trim();
            if (!message) return;
            set((state) => ({
              layers: state.layers.map((existing) =>
                existing.id === id
                  ? {
                      ...existing,
                      genStatus: "generating" as const,
                      genStatusLabel: message.slice(0, 60),
                    }
                  : existing,
              ),
            }));
          },
        });
        const resultUrl = resolveCanvasBackendJobResultUrl(completedJob);
        if (resultUrl) {
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === id
                ? {
                    ...l,
                    src: resultUrl,
                    genResultImage: resultUrl,
                    genStatus: "idle" as const,
                    genStatusLabel: undefined,
                  }
                : l,
            ),
          }));
        } else {
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === id
                ? {
                    ...l,
                    genStatus: "idle" as const,
                    genStatusLabel: undefined,
                  }
                : l,
            ),
          }));
        }
      } catch (error) {
        console.error("Extend failed:", error);
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === id
              ? {
                  ...l,
                  genStatus: "idle" as const,
                  genStatusLabel: undefined,
                }
              : l,
          ),
        }));
      }
    },

    vectorizeLayer: async (id, options) => {
      const selectedLayer = get().layers.find((layer) => layer.id === id);
      const projectId = String(get().projectId || "").trim();
      const existingBackendJobId = String(
        options?.existingBackendJobId || "",
      ).trim();
      const existingPlaceholderId = String(options?.placeholderId || "").trim();
      beginPendingCanvasLayerJob(
        projectId,
        "vectorize",
        {
          layerId: id,
          placeholderId: existingPlaceholderId || undefined,
          backendJobId: existingBackendJobId || undefined,
        },
        { resumeJobId: options?.resumeJobId },
      );

      if (
        !selectedLayer ||
        selectedLayer.type !== "image" ||
        !selectedLayer.src
      ) {
        return null;
      }

      const displayWidth =
        (selectedLayer.width || 400) * Math.abs(selectedLayer.scaleX || 1);
      const placeholderId = existingPlaceholderId || uuidv4();
      const sourceName =
        String(selectedLayer.name || "Image")
          .trim()
          .replace(/\.[a-z0-9]{1,10}$/i, "") || "Image";
      const vectorFilename = `${sourceName}.svg`;
      const hasPlaceholder = get().layers.some(
        (existing) => existing.id === placeholderId,
      );
      if (!hasPlaceholder) {
        set((state) => ({
          layers: [
            ...state.layers,
            {
              ...selectedLayer,
              id: placeholderId,
              name: vectorFilename,
              x: (selectedLayer.x || 0) + displayWidth + 24,
              y: selectedLayer.y || 0,
              width: selectedLayer.width,
              height: selectedLayer.height,
              scaleX: selectedLayer.scaleX || 1,
              scaleY: selectedLayer.scaleY || 1,
              rotation: selectedLayer.rotation || 0,
              opacity: selectedLayer.opacity ?? 1,
              src: selectedLayer.src,
              genStatus: "generating" as const,
              genStatusLabel: "矢量化中",
              genPrompt: "矢量化中...",
              genReferenceImage: selectedLayer.src,
              genResultImage: null,
              subtype: "vector-svg-pending",
              assetMimeType: "image/svg+xml",
              vectorFilename,
            },
          ],
          selectedIds: [placeholderId],
        }));
      } else {
        set((state) => ({
          layers: state.layers.map((existing) =>
            existing.id === placeholderId
              ? {
                  ...existing,
                  genStatus: "generating" as const,
                  genStatusLabel: "矢量化中",
                  genPrompt: "矢量化中...",
                  subtype: "vector-svg-pending",
                  assetMimeType: "image/svg+xml",
                  vectorFilename,
                }
              : existing,
          ),
          selectedIds: [placeholderId],
        }));
      }

      try {
        let backendJobId = existingBackendJobId;
        if (!backendJobId) {
          if (!projectId)
            throw new Error("projectId is required for vectorize job");
          const createdJob = await createCanvasBackendJob({
            projectId,
            kind: "vectorize",
            request: {
              imageUrl: selectedLayer.src,
              layerId: id,
              filename: vectorFilename,
            },
          });
          backendJobId = createdJob.id;
          set((state) => ({
            layers: state.layers.map((existing) =>
              existing.id === placeholderId
                ? { ...existing, genJobId: backendJobId }
                : existing,
            ),
          }));
        }
        const completedJob = await waitCanvasBackendJob({
          jobId: backendJobId,
          onProgress: (job) => {
            const message = String(job.resultData?.message || "").trim();
            if (!message) return;
            set((state) => ({
              layers: state.layers.map((existing) =>
                existing.id === placeholderId
                  ? {
                      ...existing,
                      genStatus: "generating" as const,
                      genStatusLabel: message.slice(0, 60),
                    }
                  : existing,
              ),
            }));
          },
        });
        const resultUrl = resolveCanvasBackendJobResultUrl(completedJob);
        if (!resultUrl) throw new Error("Vectorize returned empty url");
        const responseData =
          completedJob.resultData?.response &&
          typeof completedJob.resultData.response === "object"
            ? (completedJob.resultData.response as Record<string, unknown>)
            : {};
        const svgUrl = String(
          responseData.svgUrl || responseData.url || resultUrl,
        ).trim();
        const resultFormat = String(responseData.format || "")
          .trim()
          .toLowerCase();
        const resultMimeType = String(responseData.mimeType || "")
          .trim()
          .toLowerCase();
        if (
          !svgUrl ||
          (resultFormat && resultFormat !== "svg") ||
          (resultMimeType && resultMimeType !== "image/svg+xml")
        ) {
          throw new Error("Vectorize did not return a real SVG asset");
        }
        const resultFilename =
          String(responseData.filename || vectorFilename).trim() ||
          vectorFilename;
        const pathCount = Number(responseData.pathCount);

        set((state) => ({
          layers: state.layers.map((layer) =>
            layer.id === placeholderId
              ? {
                  ...layer,
                  src: svgUrl,
                  genStatus: "idle" as const,
                  genStatusLabel: undefined,
                  genResultImage: svgUrl,
                  name: resultFilename,
                  subtype: "vector-svg",
                  assetMimeType: "image/svg+xml",
                  vectorSourceUrl: svgUrl,
                  vectorFilename: resultFilename.endsWith(".svg")
                    ? resultFilename
                    : `${resultFilename}.svg`,
                  vectorPathCount: Number.isFinite(pathCount)
                    ? Math.max(0, Math.floor(pathCount))
                    : undefined,
                }
              : layer,
          ),
        }));
        return svgUrl;
      } catch (error) {
        console.error("[Vectorize] failed:", error);
        set((state) => ({
          layers: state.layers.filter((layer) => layer.id !== placeholderId),
          selectedIds: state.selectedIds.includes(placeholderId)
            ? [id]
            : state.selectedIds,
        }));
        throw error;
      }
    },

    expandLayerWithPreset: async (id, params, options) => {
      const selectedLayer = get().layers.find((layer) => layer.id === id);
      const projectId = String(get().projectId || "").trim();
      const existingBackendJobId = String(
        options?.existingBackendJobId || "",
      ).trim();
      const existingPlaceholderId = String(options?.placeholderId || "").trim();
      beginPendingCanvasLayerJob(
        projectId,
        "expand",
        {
          layerId: id,
          params,
          placeholderId: existingPlaceholderId || undefined,
          backendJobId: existingBackendJobId || undefined,
        },
        { resumeJobId: options?.resumeJobId },
      );
      if (
        !selectedLayer ||
        selectedLayer.type !== "image" ||
        !selectedLayer.src
      ) {
        return;
      }

      const safeScaleMultiplier = Number.isFinite(
        Number(params?.scaleMultiplier),
      )
        ? Math.max(1, Number(params.scaleMultiplier))
        : 1;
      const safeExpandFactor = Number.isFinite(Number(params?.expandFactor))
        ? Math.max(1, Number(params.expandFactor))
        : 1;
      const presetKey = String(params?.presetKey || "general");
      const presetLabel = String(params?.presetLabel || "扩图");
      const expandRatioKey = String(params?.expandRatioKey || "");
      const userPrompt = String(params?.prompt || "");
      const modelId =
        typeof params?.model === "string" ? params.model : undefined;
      const selectedModelFromStore = useAgentStore.getState().selectedModel;
      const effectiveModel = modelId || selectedModelFromStore;
      const displayWidth =
        (selectedLayer.width || 400) * Math.abs(selectedLayer.scaleX || 1);
      const baseWidth = selectedLayer.width || 1;
      const baseHeight = selectedLayer.height || 1;
      const requestedTargetWidth = Number(params?.targetWidth);
      const requestedTargetHeight = Number(params?.targetHeight);
      const nextWidth =
        Number.isFinite(requestedTargetWidth) && requestedTargetWidth > 0
          ? Math.max(1, Math.round(requestedTargetWidth))
          : Math.max(
              1,
              Math.round(baseWidth * safeExpandFactor * safeScaleMultiplier),
            );
      const nextHeight =
        Number.isFinite(requestedTargetHeight) && requestedTargetHeight > 0
          ? Math.max(1, Math.round(requestedTargetHeight))
          : Math.max(
              1,
              Math.round(baseHeight * safeExpandFactor * safeScaleMultiplier),
            );
      const targetAspectRatio = `${nextWidth}:${nextHeight}`;
      const finalPrompt = [
        userPrompt,
        `当前扩图预设：${presetLabel}。`,
        expandRatioKey ? `目标画幅：${expandRatioKey}。` : "",
        `目标输出尺寸：${nextWidth}x${nextHeight}，只扩展画布，不要拉伸原图主体。`,
        safeScaleMultiplier > 1
          ? `需要额外扩展到 ${safeScaleMultiplier}x 的更大画布。`
          : "保持标准扩图范围。",
      ]
        .filter(Boolean)
        .join("");
      const placeholderId = existingPlaceholderId || uuidv4();

      const hasPlaceholder = get().layers.some(
        (existing) => existing.id === placeholderId,
      );
      if (!hasPlaceholder) {
        set((state) => ({
          layers: [
            ...state.layers,
            {
              ...selectedLayer,
              id: placeholderId,
              name: `${selectedLayer.name || "图片"} ${presetLabel}扩图`,
              x: (selectedLayer.x || 0) + displayWidth + 24,
              y: selectedLayer.y || 0,
              width: nextWidth,
              height: nextHeight,
              scaleX: selectedLayer.scaleX || 1,
              scaleY: selectedLayer.scaleY || 1,
              rotation: selectedLayer.rotation || 0,
              opacity: selectedLayer.opacity ?? 1,
              src: selectedLayer.src,
              genStatus: "generating" as const,
              genStatusLabel: "扩图生成中",
              genPrompt: finalPrompt,
              genModel: effectiveModel,
              genReferenceImage: selectedLayer.src,
              genResultImage: null,
            },
          ],
        }));
      } else {
        set((state) => ({
          layers: state.layers.map((existing) =>
            existing.id === placeholderId
              ? {
                  ...existing,
                  width: nextWidth,
                  height: nextHeight,
                  genStatus: "generating" as const,
                  genStatusLabel: "扩图生成中",
                  genPrompt: finalPrompt,
                  genModel: effectiveModel,
                }
              : existing,
          ),
        }));
      }

      try {
        let backendJobId = existingBackendJobId;
        if (!backendJobId) {
          if (!projectId)
            throw new Error("projectId is required for expand job");
          const createdJob = await createCanvasBackendJob({
            projectId,
            kind: "outpaint",
            request: {
              _canvasOperation: "expand",
              layerId: id,
              imageUrl: selectedLayer.src,
              direction: "all",
              ratio: nextWidth / nextHeight,
              targetWidth: nextWidth,
              targetHeight: nextHeight,
              aspectRatio: targetAspectRatio,
              prompt: finalPrompt,
              model: effectiveModel,
              expandParams: {
                scaleMultiplier: safeScaleMultiplier,
                presetKey,
                presetLabel,
                prompt: userPrompt,
                expandFactor: safeExpandFactor,
                expandRatioKey,
                targetWidth: nextWidth,
                targetHeight: nextHeight,
                model: effectiveModel,
              },
            },
          });
          backendJobId = createdJob.id;
          set((state) => ({
            layers: state.layers.map((existing) =>
              existing.id === placeholderId
                ? { ...existing, genJobId: backendJobId }
                : existing,
            ),
          }));
        }
        const completedJob = await waitCanvasBackendJob({
          jobId: backendJobId,
          onProgress: (job) => {
            const message = String(job.resultData?.message || "").trim();
            if (!message) return;
            set((state) => ({
              layers: state.layers.map((existing) =>
                existing.id === placeholderId
                  ? {
                      ...existing,
                      genStatus: "generating" as const,
                      genStatusLabel: message.slice(0, 60),
                    }
                  : existing,
              ),
            }));
          },
        });
        const resultUrl = resolveCanvasBackendJobResultUrl(completedJob);
        if (!resultUrl) throw new Error("Expand returned empty url");

        set((state) => ({
          layers: state.layers.map((layer) =>
            layer.id === placeholderId
              ? {
                  ...layer,
                  src: resultUrl,
                  width: nextWidth,
                  height: nextHeight,
                  genStatus: "idle" as const,
                  genStatusLabel: undefined,
                  genPrompt: finalPrompt,
                  genModel: effectiveModel,
                  genResultImage: resultUrl,
                  name: `${selectedLayer.name || "图片"} ${presetLabel}扩图`,
                  subtype:
                    presetKey === "general" ? undefined : "expanded-social",
                }
              : layer,
          ),
        }));
      } catch (error) {
        console.error("[Expand] failed:", error);
        set((state) => ({
          layers: state.layers.filter((layer) => layer.id !== placeholderId),
        }));
        throw error;
      }
    },

    generateVideo: async (prompt, options) => {
      const internalJob = options?._job;
      const resumeJobId = String(internalJob?.resumeJobId || "").trim();
      const resumeTaskId = String(internalJob?.existingTaskId || "").trim();
      const resumeTaskType = String(internalJob?.existingTaskType || "").trim();
      const resumeProviderKey = String(
        internalJob?.existingProviderKey || "",
      ).trim();
      const resumeStatusUrl = String(
        internalJob?.existingStatusUrl || "",
      ).trim();
      const resumeBackgroundTaskId = String(
        internalJob?.existingBackgroundTaskId || "",
      ).trim();
      const resumeOutputLayerId = String(
        internalJob?.existingOutputLayerId || "",
      ).trim();
      const resumeSourceLayerId = String(
        internalJob?.existingSourceLayerId || "",
      ).trim();
      const {
        selectedIds,
        layers,
        videoStyle,
        audioEnabled,
        cameraControl,
        extendMode,
      } = get();
      const targetId = selectedIds[0] || resumeSourceLayerId;
      if (!targetId) {
        return;
      }

      let layer = layers.find((l) => l.id === targetId);
      if (!layer && resumeTaskId && resumeOutputLayerId) {
        layer = layers.find((item) => item.id === resumeOutputLayerId);
      }
      if (!layer) {
        return;
      }
      const effectiveEditMode = String(
        options.editMode || (extendMode ? "extend" : ""),
      ).trim();
      const isRemovalEdit = effectiveEditMode.toLowerCase() === "removal";

      const fallbackVideoModelId = ModelType.KLING_V2_6;
      const requestedModelId = String(options.modelId || "").trim();
      const isSourceVideoEdit = layer.type === "video" && !!layer.src;
      const requestedSupportsVideoEdit =
        await modelSupportsVideoEditByDb(requestedModelId);
      const modelIdForVideoEdit =
        isSourceVideoEdit && isRemovalEdit && !requestedSupportsVideoEdit
          ? fallbackVideoModelId
          : requestedModelId;
      const supportsVideoEdit =
        await modelSupportsVideoEditByDb(modelIdForVideoEdit);

      const projectId = String(get().projectId || "").trim();
      const persistedOptions = { ...options } as Record<string, any>;
      delete persistedOptions._job;

      if (isSourceVideoEdit && !supportsVideoEdit && !isRemovalEdit) {
        console.error(
          "[Store] generateVideo failed: current model does not support multimodal video editing",
        );
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === targetId
              ? {
                  ...l,
                  genStatus: "failed" as const,
                  genStatusLabel: "仅支持可灵/豆包视频编辑",
                }
              : l,
          ),
        }));
        return;
      }

      let outputLayerId =
        resumeOutputLayerId &&
        layers.some((item) => item.id === resumeOutputLayerId)
          ? resumeOutputLayerId
          : targetId;
      let hasSeparatePlaceholder = outputLayerId !== targetId;
      if (isSourceVideoEdit && !hasSeparatePlaceholder) {
        const gap = 24;
        const sourceScaleX = layer.scaleX || 1;
        const displayWidth = (layer.width || 640) * sourceScaleX;
        const nextPlaceholderId = resumeOutputLayerId || uuidv4();
        const hasExistingOutputLayer = layers.some(
          (item) => item.id === nextPlaceholderId,
        );
        if (hasExistingOutputLayer) {
          outputLayerId = nextPlaceholderId;
          hasSeparatePlaceholder = true;
          set((state) => ({
            layers: state.layers.map((item) =>
              item.id === nextPlaceholderId
                ? {
                    ...item,
                    genStatus: "generating" as const,
                    genStatusLabel: isRemovalEdit
                      ? "视频去水印中"
                      : "视频编辑中",
                    genPrompt: prompt,
                  }
                : item,
            ),
          }));
        } else {
          set((state) => ({
            layers: [
              ...state.layers,
              {
                ...layer,
                id: nextPlaceholderId,
                type: "image" as const,
                name: `${isRemovalEdit ? "AI 视频去水印中" : "AI 视频编辑中"} ${new Date().toLocaleTimeString()}`,
                x: (layer.x || 0) + displayWidth + gap,
                y: layer.y || 0,
                width: layer.width || 640,
                height: layer.height || 360,
                scaleX: layer.scaleX || 1,
                scaleY: layer.scaleY || 1,
                rotation: layer.rotation || 0,
                opacity: layer.opacity ?? 1,
                src: GENERATING_VIDEO_EDIT_PLACEHOLDER,
                genStatus: "generating" as const,
                genStatusLabel: isRemovalEdit ? "视频去水印中" : "视频编辑中",
                genPrompt: prompt,
                genReferenceImage: layer.src,
                genResultImage: null,
              },
            ],
          }));
          outputLayerId = nextPlaceholderId;
          hasSeparatePlaceholder = true;
        }
        get().panLayerIntoViewport(outputLayerId, 96);
      } else if (!hasSeparatePlaceholder) {
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === targetId ? { ...l, genStatus: "generating" as const } : l,
          ),
        }));
      }

      beginPendingCanvasLayerJob(
        projectId,
        "video",
        {
          prompt,
          sourceLayerId: targetId,
          outputLayerId,
          options: persistedOptions,
          taskId: resumeTaskId || undefined,
          taskType: resumeTaskType || undefined,
          providerKey: resumeProviderKey || undefined,
          statusUrl: resumeStatusUrl || undefined,
          backgroundTaskId: resumeBackgroundTaskId || undefined,
        },
        { resumeJobId },
      );

      try {
        const { selectedModel } = useAgentStore.getState();
        const finalModelId =
          modelIdForVideoEdit || String(selectedModel || "").trim();

        let resultUrl = "";
        let resultTaskId = resumeTaskId;
        let resultTaskType = resumeTaskType;
        let resultProviderKey =
          resumeProviderKey || String(layer.genProviderKey || "").trim();
        let resultChatJobId = String(
          options._job?.existingBackendJobId || "",
        ).trim();
        let resultStreamId = "";
        let resultStatusUrl =
          resumeStatusUrl || String(layer.genStatusUrl || "").trim();
        let resultBackgroundTaskId =
          resumeBackgroundTaskId ||
          String(layer.genBackgroundTaskId || "").trim();
        let resultCharacterId = "";

        if (!resultChatJobId && !resultTaskId) {
          const seedanceRequestPatch = isSeedanceVideoModelId(finalModelId)
            ? buildSeedanceVideoRequestPatch({
                modelId: finalModelId,
                method:
                  effectiveEditMode === "extend"
                    ? "first_frame"
                    : layer.type === "video"
                      ? "reference"
                      : cameraControl || "first_frame",
                imageUrls: [
                  ...(layer.type === "image" && layer.src ? [layer.src] : []),
                  ...(options.extensionImage ? [options.extensionImage] : []),
                ],
                videoUrls: [
                  ...(layer.type === "video" && layer.src ? [layer.src] : []),
                  ...(options.motionRefVideo ? [options.motionRefVideo] : []),
                ],
                generateAudio:
                  typeof options.generateAudio === "boolean"
                    ? options.generateAudio
                    : typeof options.audioEnabled === "boolean"
                      ? options.audioEnabled
                      : audioEnabled,
                enableWebSearch:
                  options.enableWebSearch === false ? false : true,
                returnLastFrame:
                  typeof options.returnLastFrame === "boolean"
                    ? options.returnLastFrame
                    : effectiveEditMode === "extend" ||
                      Boolean(options.extensionImage),
              })
            : {};
          const klingOmniRequestPatch = isKlingV3OmniVideoModelId(finalModelId)
            ? buildKlingV3OmniRequestPatch({
                modelId: finalModelId,
                method:
                  layer.type === "video"
                    ? "edit"
                    : cameraControl || "first_frame",
                aspectRatio: options.aspectRatio,
                mode: videoStyle,
                resolution: options.resolution,
                imageUrls:
                  layer.type === "image" && layer.src ? [layer.src] : [],
                videoUrls: [
                  ...(layer.type === "video" && layer.src ? [layer.src] : []),
                  ...(options.motionRefVideo ? [options.motionRefVideo] : []),
                ],
                generateAudio:
                  typeof options.generateAudio === "boolean"
                    ? options.generateAudio
                    : typeof options.audioEnabled === "boolean"
                      ? options.audioEnabled
                      : audioEnabled,
              })
            : {};
          const klingV3RequestPatch = isKlingV3VideoModelId(finalModelId)
            ? buildKlingV3RequestPatch({
                modelId: finalModelId,
                method: cameraControl || "first_frame",
                aspectRatio: options.aspectRatio,
                mode: videoStyle,
                resolution: options.resolution,
                imageUrls:
                  layer.type === "image" && layer.src ? [layer.src] : [],
                generateAudio:
                  typeof options.generateAudio === "boolean"
                    ? options.generateAudio
                    : typeof options.audioEnabled === "boolean"
                      ? options.audioEnabled
                      : audioEnabled,
              })
            : {};
          const omniFlashExtRequestPatch = isOmniFlashExtVideoModelId(
            finalModelId,
          )
            ? buildOmniFlashExtRequestPatch({
                modelId: finalModelId,
                aspectRatio: options.aspectRatio,
                resolution: options.resolution,
                imageUrls:
                  layer.type === "image" && layer.src ? [layer.src] : [],
                firstFrameUrl:
                  layer.type === "image" && layer.src ? layer.src : undefined,
              })
            : {};
          const skyReelsV4RequestPatch = isSkyReelsV4ApimartVideoModelId(
            finalModelId,
          )
            ? buildSkyReelsV4RequestPatch({
                modelId: finalModelId,
                method:
                  effectiveEditMode === "extend"
                    ? "extend"
                    : layer.type === "video"
                      ? "reference"
                      : options.extensionImage
                        ? "start_end"
                        : cameraControl || "first_frame",
                aspectRatio: options.aspectRatio,
                resolution: options.resolution,
                imageUrls: [
                  ...(layer.type === "image" && layer.src ? [layer.src] : []),
                  ...(options.extensionImage ? [options.extensionImage] : []),
                ],
                videoUrls: [
                  ...(layer.type === "video" && layer.src ? [layer.src] : []),
                  ...(options.motionRefVideo ? [options.motionRefVideo] : []),
                ],
              })
            : {};
          const veo3RequestPatch = isApimartVeo3VideoModelId(finalModelId)
            ? buildVeo3VideoRequestPatch({
                modelId: finalModelId,
                method: options.extensionImage
                  ? "start_end"
                  : cameraControl || "first_frame",
                aspectRatio: options.aspectRatio,
                resolution: options.resolution,
                duration: options.duration,
                imageUrls: [
                  ...(layer.type === "image" && layer.src ? [layer.src] : []),
                  ...(options.extensionImage ? [options.extensionImage] : []),
                ],
                firstFrameUrl:
                  layer.type === "image" && layer.src ? layer.src : undefined,
                lastFrameUrl: options.extensionImage || undefined,
                generateAudio:
                  typeof options.generateAudio === "boolean"
                    ? options.generateAudio
                    : typeof options.audioEnabled === "boolean"
                      ? options.audioEnabled
                      : audioEnabled,
              })
            : {};
          await fetchSSE(
            "/api/chat/generate-video",
            {
              message: prompt,
              modelId: finalModelId,
              duration: options.duration,
              resolution: options.resolution,
              aspectRatio: options.aspectRatio,
              count: options.count,
              method: cameraControl || undefined,
              mode: videoStyle || undefined,
              history: options.history || layer.history || [],
              referenceVideo: layer.type === "video" ? layer.src : undefined,
              images:
                layer.type === "image" && layer.src ? [layer.src] : undefined,
              edit_mode: effectiveEditMode || undefined,
              motionRefVideo: options.motionRefVideo,
              extensions: options.extensionImage
                ? { endFrame: options.extensionImage }
                : undefined,
              editSource: options.adSource
                ? { url: options.adSource, type: "ad_insertion" }
                : undefined,
              audioEnabled,
              cameraControl,
              videoStyle,
              ...seedanceRequestPatch,
              ...klingOmniRequestPatch,
              ...klingV3RequestPatch,
              ...omniFlashExtRequestPatch,
              ...skyReelsV4RequestPatch,
              ...veo3RequestPatch,
            },
            (event) => {
              if (event?.type === "error") {
                throw new Error(event.message || "视频生成失败");
              }
              if (event?.videoUrl) resultUrl = String(event.videoUrl);
              if (event?.taskId) resultTaskId = String(event.taskId);
              if (event?.taskType) resultTaskType = String(event.taskType);
              if ((event as any)?.providerKey || (event as any)?.provider)
                resultProviderKey = String(
                  (event as any).providerKey || (event as any).provider,
                );
              if ((event as any)?.statusUrl)
                resultStatusUrl = String((event as any).statusUrl);
              if ((event as any)?.backgroundTaskId)
                resultBackgroundTaskId = String(
                  (event as any).backgroundTaskId,
                );
              if ((event as any)?.jobId)
                resultChatJobId = String((event as any).jobId);
              if ((event as any)?.streamId)
                resultStreamId = String((event as any).streamId);
              if (event?.characterId)
                resultCharacterId = String(event.characterId);
            },
            { credentials: "include" },
          );
        }

        if (resultChatJobId && !resultUrl) {
          const completedJob = await waitChatStreamVideoJobForCanvas({
            jobId: resultChatJobId,
            onProgress: (job) => {
              const outputLayerStillExists = get().layers.some(
                (item) => item.id === outputLayerId,
              );
              if (!outputLayerStillExists) return;
              const label = String(job.resultData?.message || "视频生成中");
              const taskId = String(
                job.resultData?.taskId || resultTaskId || "",
              ).trim();
              const taskType = String(
                job.resultData?.taskType || resultTaskType || "",
              ).trim();
              const providerKey = String(
                (job.resultData as any)?.providerKey ||
                  (job.payload as any)?.providerKey ||
                  resultProviderKey ||
                  "",
              ).trim();
              const statusUrl = String(
                (job.resultData as any)?.statusUrl || resultStatusUrl || "",
              ).trim();
              const backgroundTaskId = String(
                job.resultData?.backgroundTaskId ||
                  resultBackgroundTaskId ||
                  "",
              ).trim();
              resultProviderKey = providerKey || resultProviderKey;
              resultStatusUrl = statusUrl || resultStatusUrl;
              resultBackgroundTaskId =
                backgroundTaskId || resultBackgroundTaskId;
              const streamId = String(
                job.resultData?.streamId ||
                  job.payload?.streamId ||
                  resultStreamId ||
                  "",
              ).trim();
              set((state) => ({
                layers: state.layers.map((l) =>
                  l.id === outputLayerId
                    ? {
                        ...l,
                        genStatus: "generating" as const,
                        genStatusLabel: label,
                        genPrompt: prompt,
                        genModel: finalModelId || l.genModel,
                        genJobId: resultChatJobId,
                        genStreamId: streamId || l.genStreamId,
                        genTaskId: taskId || l.genTaskId,
                        genBackgroundTaskId:
                          backgroundTaskId || l.genBackgroundTaskId,
                        genTaskType: taskType || l.genTaskType,
                        genProviderKey: providerKey || l.genProviderKey,
                        genStatusUrl: statusUrl || l.genStatusUrl,
                      }
                    : l,
                ),
              }));
            },
          });
          resultUrl = resolveChatStreamJobVideoUrl(completedJob);
          resultTaskId = String(
            completedJob.resultData?.taskId || resultTaskId || "",
          ).trim();
          resultTaskType = String(
            completedJob.resultData?.taskType || resultTaskType || "",
          ).trim();
          resultProviderKey = String(
            (completedJob as any).resultData?.providerKey ||
              (completedJob as any).payload?.providerKey ||
              resultProviderKey ||
              "",
          ).trim();
          resultStatusUrl = String(
            (completedJob as any).resultData?.statusUrl ||
              resultStatusUrl ||
              "",
          ).trim();
          resultBackgroundTaskId = String(
            completedJob.resultData?.backgroundTaskId ||
              resultBackgroundTaskId ||
              "",
          ).trim();
          resultStreamId = String(
            completedJob.resultData?.streamId ||
              completedJob.payload?.streamId ||
              resultStreamId ||
              "",
          ).trim();
        }

        if (resultTaskId && !resultUrl) {
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === outputLayerId
                ? {
                    ...l,
                    genStatus: "generating" as const,
                    genStatusLabel: "视频生成中",
                    genPrompt: prompt,
                    genModel: finalModelId || l.genModel,
                    genTaskId: resultTaskId,
                    genTaskType: resultTaskType || l.genTaskType,
                    genProviderKey: resultProviderKey || l.genProviderKey,
                    genStatusUrl: resultStatusUrl || l.genStatusUrl,
                    genBackgroundTaskId:
                      resultBackgroundTaskId || l.genBackgroundTaskId,
                  }
                : l,
            ),
          }));
          const isSeedanceBackgroundTask = isOfficialSeedanceTaskContext({
            taskType: resultTaskType,
            providerKey: resultProviderKey,
          });
          const maxAttempts = isSeedanceBackgroundTask ? 120 : 100;
          const pollIntervalMs = resolveProviderVideoPollIntervalMs({
            taskType: resultTaskType,
            providerKey: resultProviderKey,
            fallbackMs: 2500,
          });
          for (let i = 0; i < maxAttempts; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
            const outputLayerStillExists = get().layers.some(
              (item) => item.id === outputLayerId,
            );
            if (!outputLayerStillExists) {
              return;
            }
            const pollResult = await queryUnifiedVideoTaskStatus({
              providerTaskId: resultTaskId,
              taskType:
                resolveUnifiedProviderTaskType({
                  taskType: resultTaskType,
                  modelId: finalModelId,
                  providerKey: resultProviderKey,
                  fallback: undefined,
                }) || undefined,
              modelId: finalModelId || undefined,
              providerKey: resultProviderKey || undefined,
              seedanceJobId: isSeedanceBackgroundTask
                ? resultBackgroundTaskId || undefined
                : undefined,
              projectId: projectId || undefined,
              statusUrl: resultStatusUrl || undefined,
              cache: "no-store",
            }).catch(() => null);
            const nextProgress =
              typeof pollResult?.progress === "number"
                ? pollResult.progress
                : undefined;
            const statusMessage = String(
              pollResult?.statusMessage || "",
            ).trim();
            const progressLabel =
              typeof nextProgress === "number"
                ? `视频生成中 ${Math.max(1, Math.min(99, Math.round(nextProgress * 100)))}%`
                : statusMessage || "视频生成中";
            set((state) => ({
              layers: state.layers.map((l) =>
                l.id === outputLayerId
                  ? {
                      ...l,
                      genStatus: "generating" as const,
                      genStatusLabel: progressLabel.slice(0, 80),
                      genPrompt: prompt,
                      genModel: finalModelId || l.genModel,
                      genTaskId: resultTaskId,
                      genTaskType: resultTaskType || l.genTaskType,
                      genProviderKey: resultProviderKey || l.genProviderKey,
                      genStatusUrl: resultStatusUrl || l.genStatusUrl,
                      genBackgroundTaskId:
                        resultBackgroundTaskId || l.genBackgroundTaskId,
                    }
                  : l,
              ),
            }));
            if (!pollResult) continue;
            if (pollResult.status === "succeed" && pollResult.videos[0]) {
              resultUrl = pollResult.videos[0];
              break;
            }
            if (pollResult.status === "failed") {
              throw new Error(pollResult.statusMessage || "视频生成失败");
            }
          }
        }

        if (resultUrl) {
          const requestedAspectRatio = String(options.aspectRatio || "").trim();
          const requestedResolution = String(options.resolution || "").trim();
          set((state) => ({
            layers: state.layers.map((l) => {
              if (l.id !== outputLayerId) return l;
              const nextHistory = [
                ...(l.history || []),
                { prompt, url: resultUrl, timestamp: Date.now() },
              ];
              if (hasSeparatePlaceholder) {
                return {
                  ...l,
                  type: "video",
                  name: `${isRemovalEdit ? "AI 视频去水印" : "AI 视频编辑"} ${new Date().toLocaleTimeString()}`,
                  src: resultUrl,
                  genStatus: "idle" as const,
                  genStatusLabel: undefined,
                  history: nextHistory,
                  genRatio: requestedAspectRatio || l.genRatio,
                  genResolution: requestedResolution || l.genResolution,
                  genJobId: resultChatJobId || l.genJobId,
                  genStreamId: resultStreamId || l.genStreamId,
                  genTaskId: resultTaskId || l.genTaskId,
                  genStatusUrl: resultStatusUrl || l.genStatusUrl,
                  genBackgroundTaskId:
                    resultBackgroundTaskId || l.genBackgroundTaskId,
                  genTaskType: resultTaskType || l.genTaskType,
                  genProviderKey: resultProviderKey || l.genProviderKey,
                };
              }
              return {
                ...l,
                src: resultUrl,
                genStatus: "idle" as const,
                history: nextHistory,
                genRatio: requestedAspectRatio || l.genRatio,
                genResolution: requestedResolution || l.genResolution,
                genJobId: resultChatJobId || l.genJobId,
                genStreamId: resultStreamId || l.genStreamId,
                genTaskId: resultTaskId || l.genTaskId,
                genStatusUrl: resultStatusUrl || l.genStatusUrl,
                genBackgroundTaskId:
                  resultBackgroundTaskId || l.genBackgroundTaskId,
                genTaskType: resultTaskType || l.genTaskType,
                genProviderKey: resultProviderKey || l.genProviderKey,
              };
            }),
          }));
          void resolveVideoNaturalSize(resultUrl).then((videoMeta) => {
            if (!videoMeta) return;
            set((state) => ({
              layers: state.layers.map((l) => {
                if (l.id !== outputLayerId) return l;
                const scaleXAbs = Math.max(0.0001, Math.abs(l.scaleX || 1));
                const scaleYAbs = Math.max(0.0001, Math.abs(l.scaleY || 1));
                const currentDisplayWidth = Math.max(
                  1,
                  (l.width || 640) * scaleXAbs,
                );
                const currentDisplayHeight = Math.max(
                  1,
                  (l.height || 360) * scaleYAbs,
                );
                const fitted = fitCanvasMediaDisplaySize(
                  {
                    width: videoMeta.width || 1280,
                    height: videoMeta.height || 720,
                  },
                  {
                    maxViewportWidthRatio: 0.46,
                    maxViewportHeightRatio: 0.46,
                    minSize: 120,
                  },
                );
                const nextDisplayWidth = fitted.width;
                const nextDisplayHeight = fitted.height;
                return {
                  ...l,
                  x: (l.x || 0) + (currentDisplayWidth - nextDisplayWidth) / 2,
                  y:
                    (l.y || 0) + (currentDisplayHeight - nextDisplayHeight) / 2,
                  width: Math.max(1, Math.round(nextDisplayWidth / scaleXAbs)),
                  height: Math.max(
                    1,
                    Math.round(nextDisplayHeight / scaleYAbs),
                  ),
                  videoDuration: videoMeta.duration ?? l.videoDuration,
                };
              }),
            }));
          });
        } else if (resultTaskId) {
          const statusLabel = "视频生成中";
          set((state) => ({
            layers: state.layers.map((l) =>
              l.id === outputLayerId
                ? {
                    ...l,
                    genStatus: "generating" as const,
                    genStatusLabel: statusLabel,
                  }
                : l,
            ),
          }));
          schedulePendingCanvasLayerRecovery(projectId, get);
        } else if (resultCharacterId) {
          const statusLabel = `角色创建成功: ${resultCharacterId}`;
          if (hasSeparatePlaceholder) {
            set((state) => ({
              layers: state.layers
                .filter((l) => l.id !== outputLayerId)
                .map((l) =>
                  l.id === targetId
                    ? {
                        ...l,
                        genStatus: "idle" as const,
                        genStatusLabel: statusLabel,
                      }
                    : l,
                ),
            }));
          } else {
            set((state) => ({
              layers: state.layers.map((l) =>
                l.id === outputLayerId
                  ? {
                      ...l,
                      genStatus: "idle" as const,
                      genStatusLabel: statusLabel,
                    }
                  : l,
              ),
            }));
          }
        } else {
          throw new Error("视频任务未返回结果");
        }
      } catch (error) {
        console.error("[Store] generateVideo failed:", error);
        const errorMessage =
          error instanceof Error ? String(error.message || "").trim() : "";
        const statusLabel = errorMessage || "编辑失败";
        if (hasSeparatePlaceholder) {
          set((state) => ({
            layers: state.layers
              .filter((l) => l.id !== outputLayerId)
              .map((l) =>
                l.id === targetId
                  ? {
                      ...l,
                      genStatus: "failed" as const,
                      genStatusLabel: statusLabel,
                    }
                  : l,
              ),
          }));
          return;
        }
        set((state) => ({
          layers: state.layers.map((l) =>
            l.id === outputLayerId
              ? {
                  ...l,
                  genStatus: "failed" as const,
                  genStatusLabel: statusLabel,
                }
              : l,
          ),
        }));
      }
    },

    removeVideoWatermark: async () => {
      const { selectedIds, layers, duration, resolution, aspectRatio } = get();
      const targetId = selectedIds[0];
      if (!targetId) return;

      const layer = layers.find((l) => l.id === targetId);
      if (!layer || layer.type !== "video" || !layer.src) return;

      const { selectedModel } = useAgentStore.getState();
      const preferredModelId = String(
        selectedModel || layer.genModel || "",
      ).trim();
      const discoveredVideoModelId = await pickDefaultVideoEditModelId();
      const preferredSupportsVideoEdit =
        await modelSupportsVideoEditByDb(preferredModelId);
      const modelIdForRemoval =
        discoveredVideoModelId ||
        (preferredSupportsVideoEdit ? preferredModelId : "") ||
        preferredModelId ||
        ModelType.KLING_V2_6;
      const removalPrompt =
        "请去除视频中所有可见水印、台标、字幕条和 Logo，保持主体、镜头、动作、节奏与时长不变，修复区域自然无闪烁，输出无水印版本。";

      await get().generateVideo(removalPrompt, {
        modelId: modelIdForRemoval,
        duration,
        resolution,
        aspectRatio,
        history: Array.isArray(layer.history) ? layer.history : [],
        editMode: "removal",
      });
    },

    // Group Layers
    groupLayers: (ids: string[]) => {
      if (ids.length < 2) return;

      const { layers } = get();
      const selectedSet = new Set(ids);
      const selectedLayers = layers.filter((layer) =>
        selectedSet.has(layer.id),
      );
      if (selectedLayers.length < 2) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      selectedLayers.forEach((layer) => {
        minX = Math.min(minX, Number(layer.x || 0));
        minY = Math.min(minY, Number(layer.y || 0));
        maxX = Math.max(maxX, Number(layer.x || 0) + Number(layer.width || 0));
        maxY = Math.max(maxY, Number(layer.y || 0) + Number(layer.height || 0));
      });

      const groupId = uuidv4();

      set((state) => ({
        layers: [
          ...state.layers.filter((layer) => !selectedSet.has(layer.id)),
          {
            id: groupId,
            type: "group" as const,
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
            visible: true,
            locked: false,
            children: ids,
            name: "编组",
          },
          ...selectedLayers.map((layer) => ({ ...layer, parentId: groupId })),
        ],
        selectedIds: [groupId],
      }));
    },

    ungroupLayers: (groupId: string) => {
      const { layers } = get();
      const group = layers.find((layer) => layer.id === groupId);

      if (!group || group.type !== "group") return;

      if (isLibTvWorkflowGroupLayer(group)) {
        set((state) => ({
          layers: state.layers.filter((layer) => layer.id !== groupId),
          selectedIds: Array.isArray((group as CanvasLayer).children)
            ? (group as CanvasLayer).children || []
            : [],
        }));
        return;
      }

      set((state) => ({
        layers: state.layers
          .filter((layer) => layer.id !== groupId)
          .map((layer) =>
            layer.parentId === groupId
              ? { ...layer, parentId: undefined }
              : layer,
          ),
        selectedIds: Array.isArray((group as CanvasLayer).children)
          ? (group as CanvasLayer).children || []
          : [],
      }));
    },
  }));

// HMR-safe store creation for development
// This prevents the store from being reset during hot module replacement
declare global {
  interface Window {
    __CANVAS_STORE_CACHE_V5__?: ReturnType<typeof createPhilartStore>;
  }
}

// ... (rest of file)

// HMR-safe store export
// In development, the store is cached on the window object to survive hot module replacement
// This prevents the canvas from resetting when you edit code and the module reloads
// UPDATE: Changed to V5 to force refresh of store implementation for history timeline support
export const useCanvasStore =
  typeof window !== "undefined" && process.env.NODE_ENV === "development"
    ? (window.__CANVAS_STORE_CACHE_V5__ ??= createPhilartStore())
    : createPhilartStore();
