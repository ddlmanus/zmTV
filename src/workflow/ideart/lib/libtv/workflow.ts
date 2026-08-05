import { v4 as uuidv4 } from "uuid";
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
  LIBTV_TAPNOW_VIDEO_HEIGHT,
  LIBTV_TAPNOW_VIDEO_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import { LIBTV_SCRIPT_NODE_OPTION_DESCRIPTORS } from "@/workflow/ideart/lib/libtv/skill-capabilities";
import {
  normalizeLibTvStoryboardScriptResult,
  type LibTvScriptV2AssetsByKind,
  type LibTvStoryboardScriptResult,
} from "@/workflow/ideart/lib/libtv/script";
import type { LibTvComponentType } from "@/workflow/ideart/lib/store/canvas-store";

export type LibTvWorkflowNodeKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "script"
  | "script-v2"
  | "playlist"
  | "threed"
  | "director-console-3d"
  | "group";

export interface LibTvWorkflowNodeOption {
  id: string;
  label: string;
  description?: string;
}

export interface LibTvWorkflowVideoCharacterAsset {
  id?: string;
  name?: string;
  assetUrl?: string;
  previewUrl?: string;
  referenceImageUrl?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface LibTvWorkflowPortraitTextureSettings {
  sceneFusion?: string;
  lightingFusion?: string;
  skin?: string;
  texture?: string;
  sharpness?: string;
}

export type LibTvDirectorConsole3DObjectKind =
  | "character"
  | "primitive"
  | "crowd"
  | "uploaded";
export type LibTvDirectorConsole3DPrimitive =
  | "box"
  | "sphere"
  | "cylinder"
  | "torus"
  | "cone"
  | "pyramid"
  | "plane";

export interface LibTvDirectorConsole3DVector3 {
  x: number;
  y: number;
  z: number;
}

export interface LibTvDirectorConsole3DDirectiveRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LibTvDirectorConsole3DPanoramaAnchor {
  projection: "equirectangular";
  points: Array<{ u: number; v: number }>;
}

export interface LibTvDirectorConsole3DPanoramaBinding {
  projection: "equirectangular";
  environmentFingerprint: string;
  u: number;
  v: number;
  depth: number;
  rotationOffsetY: number;
  sourceDirectiveId?: string;
}

export interface LibTvDirectorConsole3DDetectedCharacter {
  id: string;
  label?: string;
  bbox: LibTvDirectorConsole3DDirectiveRect;
  footPoint: { x: number; y: number };
  bodyType?: string;
  poseId?: string;
  facing?: "camera" | "away" | "left" | "right";
  confidence?: number;
}

export interface LibTvDirectorConsole3DCharacterDetection {
  sourceFingerprint: string;
  sourceUrl?: string;
  status: "pending" | "succeeded" | "failed";
  projection?: "flat" | "equirectangular";
  detections: LibTvDirectorConsole3DDetectedCharacter[];
  characterObjectIds: string[];
  modelId?: string;
  error?: string;
  detectedAt?: number;
}

export type LibTvDirectorConsole3DDirectiveAction =
  | "character"
  | "add"
  | "edit"
  | "remove"
  | "panorama";
export type LibTvDirectorConsole3DPanoramaOperation = "add" | "edit" | "remove";
export type LibTvDirectorConsole3DGenerationStatus =
  | "idle"
  | "submitting"
  | "processing"
  | "succeeded"
  | "failed";

export interface LibTvDirectorConsole3DDirective {
  id: string;
  name: string;
  rect: LibTvDirectorConsole3DDirectiveRect;
  panoramaAnchor?: LibTvDirectorConsole3DPanoramaAnchor;
  panoramaBinding?: LibTvDirectorConsole3DPanoramaBinding;
  prompt: string;
  action?: LibTvDirectorConsole3DDirectiveAction;
  panoramaOperation?: LibTvDirectorConsole3DPanoramaOperation;
  targetObjectId?: string;
  targetObjectIds?: string[];
  targetCharacterPreset?: string;
  attachmentMode?: "auto" | "none" | "leftHand" | "rightHand";
  attachmentCharacterId?: string;
  referenceImageUrl?: string;
  generationStatus?: LibTvDirectorConsole3DGenerationStatus;
  generationTaskId?: string;
  generationModelRuntimeId?: string;
  generatedModelUrl?: string;
  generationError?: string;
  status?: "draft" | "planning" | "applied" | "error";
  poseId?: string;
  facing?: "camera" | "away" | "left" | "right" | "keep";
  position?: LibTvDirectorConsole3DVector3;
  summary?: string;
  createdAt?: number;
}

export interface LibTvDirectorConsole3DJointAngles {
  root?: { height?: number; pitch?: number; roll?: number };
  body?: { bend?: number; turn?: number; tilt?: number };
  torso?: { bend?: number; turn?: number; tilt?: number };
  head?: { nod?: number; turn?: number; tilt?: number };
  l_arm?: { raise?: number; straddle?: number; turn?: number };
  r_arm?: { raise?: number; straddle?: number; turn?: number };
  l_elbow?: { bend?: number };
  r_elbow?: { bend?: number };
  l_wrist?: { bend?: number; turn?: number; tilt?: number };
  r_wrist?: { bend?: number; turn?: number; tilt?: number };
  l_leg?: { raise?: number; straddle?: number; turn?: number };
  r_leg?: { raise?: number; straddle?: number; turn?: number };
  l_knee?: { bend?: number };
  r_knee?: { bend?: number };
  l_ankle?: { bend?: number; turn?: number; tilt?: number };
  r_ankle?: { bend?: number; turn?: number; tilt?: number };
}

export interface LibTvDirectorConsole3DObject {
  id: string;
  name: string;
  kind: LibTvDirectorConsole3DObjectKind;
  primitive?: LibTvDirectorConsole3DPrimitive;
  color?: string;
  position: LibTvDirectorConsole3DVector3;
  rotation: LibTvDirectorConsole3DVector3;
  scale: LibTvDirectorConsole3DVector3;
  uniformScale?: number;
  shadowEnabled?: boolean;
  panoramaGroundSnapEnabled?: boolean;
  panoramaBinding?: LibTvDirectorConsole3DPanoramaBinding;
  visible?: boolean;
  locked?: boolean;
  groupId?: string;
  pose?: string;
  jointAngles?: LibTvDirectorConsole3DJointAngles;
  bodyType?: string;
  crowdCount?: number;
  crowdRows?: number;
  crowdCols?: number;
  crowdSpacing?: number;
  modelUrl?: string;
  parentObjectId?: string;
  attachBone?: "leftHand" | "rightHand";
}

export interface LibTvDirectorConsole3DCapture {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  cameraId: string;
  aspectRatio: string;
  createdAt: number;
}

export interface LibTvDirectorConsole3DCamera {
  id: string;
  name: string;
  position: LibTvDirectorConsole3DVector3;
  target: LibTvDirectorConsole3DVector3;
  rotation?: LibTvDirectorConsole3DVector3;
  targetObjectId?: string;
  fov: number;
  aspectRatio?: string;
  visible?: boolean;
  locked?: boolean;
  captures?: LibTvDirectorConsole3DCapture[];
}

export interface LibTvDirectorConsole3DTimelineKeyframe {
  id: string;
  time: number;
  property: string;
  value: number;
}

export type LibTvDirectorConsole3DMotionPathType =
  | "circle"
  | "line"
  | "rectangle"
  | "pencil"
  | "pen";

export interface LibTvDirectorConsole3DMotionPath {
  id: string;
  targetId: string;
  type: LibTvDirectorConsole3DMotionPathType;
  points: LibTvDirectorConsole3DVector3[];
  closed: boolean;
  position?: LibTvDirectorConsole3DVector3;
  rotation?: LibTvDirectorConsole3DVector3;
  scale?: LibTvDirectorConsole3DVector3;
}

export interface LibTvDirectorConsole3DTimelineMotionAction {
  id: string;
  type: "motion-path";
  pathId: string;
  startTime: number;
  duration: number;
  orientToPath: boolean;
  headingOffset?: number;
}

export interface LibTvDirectorConsole3DTimelineTrack {
  id: string;
  targetId: string;
  targetType: "object" | "camera";
  name: string;
  keyframes: LibTvDirectorConsole3DTimelineKeyframe[];
  expanded?: boolean;
  autoWalk?: boolean;
  actions?: LibTvDirectorConsole3DTimelineMotionAction[];
}

export interface LibTvDirectorConsole3DTimeline {
  duration: number;
  loop: boolean;
  autoKey: boolean;
  unit: "s" | "ms";
  zoom: number;
  tracks: LibTvDirectorConsole3DTimelineTrack[];
  paths?: LibTvDirectorConsole3DMotionPath[];
}

export interface LibTvDirectorConsole3DState {
  objects: LibTvDirectorConsole3DObject[];
  cameras: LibTvDirectorConsole3DCamera[];
  directives?: LibTvDirectorConsole3DDirective[];
  objectGroups?: Array<{ id: string; name: string; objectIds: string[] }>;
  selectedObjectIds?: string[];
  activeGroupId?: string;
  activeObjectId?: string;
  activeCameraId?: string;
  backgroundColor?: string;
  environmentUrl?: string;
  environmentSourceUrl?: string;
  environmentProjection?: "flat" | "equirectangular";
  characterDetection?: LibTvDirectorConsole3DCharacterDetection;
  gridSnap?: boolean;
  sceneScale?: number;
  scenePosition?: LibTvDirectorConsole3DVector3;
  sceneRotation?: LibTvDirectorConsole3DVector3;
  skyColor?: string;
  panoramaRotation?: number;
  panoramaRadius?: number;
  panoramaHeight?: number;
  screenPlacementEnabled?: boolean;
  screenPlacementDepth?: number;
  gaussianGroundSnapEnabled?: boolean;
  showCharacterLabels?: boolean;
  groundVisible?: boolean;
  groundOpacity?: number;
  groundHeight?: number;
  transformMode?: "translate" | "rotate" | "scale";
  timeline?: LibTvDirectorConsole3DTimeline;
}

export interface LibTvWorkflowPlaylistItem {
  id?: string;
  nodeId?: string;
  title?: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  duration?: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface LibTvWorkflowImageResult {
  url: string;
  width?: number;
  height?: number;
  title?: string;
}

export interface LibTvWorkflowVideoResult {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  duration?: number;
  title?: string;
}

export interface LibTvWorkflowSubtitleCue {
  text: string;
  startTime: number;
  endTime: number;
  shotNumber?: string;
  speaker?: string;
  sourceStartTime?: string;
  sourceEndTime?: string;
}

export interface LibTvWorkflowNodeData {
  title: string;
  content: string;
  componentType?: LibTvComponentType;
  mediaUrl?: string;
  workflowMediaMimeType?: string;
  workflowMediaNaturalWidth?: number;
  workflowMediaNaturalHeight?: number;
  workflowMediaUserResized?: boolean;
  workflowMediaFrameLocked?: boolean;
  /** Persisted playback metadata for ordinary video-resource nodes. */
  workflowMediaDurationSec?: number;
  workflowMediaPlaybackVolume?: number;
  workflowMediaUploadState?: "uploading" | "reviewing" | "success" | "error";
  workflowMediaHasAudio?: boolean;
  workflowPlatformFileId?: number;
  workflowPlatformFileUrl?: string;
  workflowPlatformFileAssetType?: string;
  workflowPlatformValidationStatus?: string;
  workflowSeedanceAssetId?: string;
  workflowSeedanceAssetUrl?: string;
  workflowSeedanceAssetGroupId?: string;
  workflowSeedanceAssetType?: "Image" | "Video" | "Audio";
  workflowSeedanceAssetStatus?: string;
  workflowSeedanceAssetCategory?: "character" | "non_character";
  workflowScriptV2AssetKind?: "角色" | "场景" | "道具" | string;
  workflowScriptV2AssetId?: string;
  workflowScriptV2AssetModelId?: string;
  mediaRole?: "ordinary" | "generator";
  prompt?: string;
  workflowInternalPrompt?: string;
  modelId?: string;
  workflowEndpointMethod?: string;
  /**
   * Model-specific controls that are not part of the common workflow schema.
   * Keep these values on the node so changing/reloading a canvas never silently
   * drops a provider's extra parameter (for example quality, seed, voice or
   * reference mode).
   */
  workflowExtraParameters?: Record<string, string | number | boolean>;
  aspectRatio?: string;
  imageSize?: string;
  workflowEmotionAdjustmentSettings?: {
    expression?: string;
    sourceNodeId?: string;
    sourceUrl?: string;
    ratio?: string;
    resolution?: string;
    count?: number;
  };
  workflowPortraitTextureSettings?: LibTvWorkflowPortraitTextureSettings;
  stylePreset?: string;
  videoMethod?: string;
  videoMethodUserSelected?: boolean;
  videoDuration?: string;
  videoResolution?: string;
  videoUpscaleSourceUrl?: string;
  videoUpscaleModelId?: string;
  videoUpscaleResolution?: string;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
  generationCount?: number;
  cameraControl?: {
    camera?: string;
    lens?: string;
    focalLength?: string;
    aperture?: string;
  };
  videoCameraMotion?: {
    id?: string;
    label?: string;
    prompt?: string;
    previewUrl?: string;
  };
  videoCharacterAssets?: LibTvWorkflowVideoCharacterAsset[];
  playlistItems?: LibTvWorkflowPlaylistItem[];
  playlistActiveIndex?: number;
  playlistPanelOpen?: boolean;
  playlistTrimStart?: number;
  playlistTrimEnd?: number;
  playlistExportUrl?: string;
  playlistExportRunning?: boolean;
  playlistBackgroundAudioUrl?: string;
  playlistBackgroundAudioNodeId?: string;
  playlistBackgroundAudioVolume?: number;
  playlistVoiceoverUrl?: string;
  playlistVoiceoverNodeId?: string;
  playlistVoiceoverVolume?: number;
  playlistSubtitles?: string;
  workflowSubtitleTimeline?: LibTvWorkflowSubtitleCue[];
  workflowAudioRole?: "voiceover" | "background_music";
  workflowPlaylistSourceNodeId?: string;
  lyrics?: string;
  referenceImages?: string[];
  referenceImageNodeIds?: string[];
  referenceImageRoles?: string[];
  referenceVideos?: string[];
  referenceVideoNodeIds?: string[];
  referenceVideoRoles?: string[];
  worldId?: string;
  worldUrl?: string;
  worldMarbleUrl?: string;
  splatUrl?: string;
  spzUrls?: Record<string, string>;
  colliderMeshUrl?: string;
  panoUrl?: string;
  thumbnailUrl?: string;
  caption?: string;
  scriptResult?: LibTvStoryboardScriptResult | null;
  scriptViewMode?: "script" | "creative";
  scriptV2ActiveStep?: "confirm-shots" | "prepare-assets" | "compose-prompts";
  scriptV2AssetsByKind?: LibTvScriptV2AssetsByKind;
  scriptV2AssetGroupId?: string;
  workflowAssetStage?: string;
  workflowAssetPersonaId?: string;
  workflowAssetReviewStatus?: "pending" | "approved" | "rejected";
  workflowSceneCleanPlate?: boolean;
  workflowSkillId?: string;
  workflowSkillStage?: string;
  workflowSkillStageStatus?: "draft" | "completed";
  workflowSkillPersonaIds?: string[];
  optionId?: string;
  optionLabel?: string;
  selectedOptionId?: string;
  options?: LibTvWorkflowNodeOption[];
  note?: string;
  groupNodeIds?: string[];
  groupBackgroundColor?: string;
  groupRunning?: boolean;
  groupCollapsed?: boolean;
  groupToolbarHidden?: boolean;
  workflowImageResults?: LibTvWorkflowImageResult[];
  workflowImageResultsCollapsed?: boolean;
  workflowVideoResults?: LibTvWorkflowVideoResult[];
  workflowVideoResultsCollapsed?: boolean;
  workflowPromptDisabled?: boolean;
  workflowPromptPlaceholder?: string;
  workflowTemplateEffectId?: string;
  workflowTemplateSourceId?: string;
  workflowTemplateModeType?: string;
  workflowRedrawRunning?: boolean;
  workflowRedrawError?: string;
  workflowGenerationCategory?: string;
  workflowGenerationJobId?: string;
  workflowGenerationTaskId?: string;
  workflowGenerationTaskIds?: string[];
  workflowGenerationTaskType?: string;
  workflowGenerationProviderKey?: string;
  workflowGenerationBaseUrl?: string;
  workflowGenerationStatusUrl?: string;
  workflowGenerationController?: "codex" | string;
  workflowCodexGenerationTaskId?: string;
  workflowCodexTaskId?: string;
  workflowCodexLayoutAnchorX?: number;
  workflowCodexLayoutAnchorY?: number;
  workflowCodexLayoutIndex?: number;
  workflowCodexLayoutStage?:
    | "source"
    | "script"
    | "assets"
    | "storyboard"
    | "video"
    | "compose"
    | "output";
  workflowCodexLayoutRow?: number;
  workflowGenerationBackgroundTaskId?: string;
  workflowGenerationResultIndex?: number;
  workflowGenerationStartedAt?: number;
  workflowGenerationRunning?: boolean;
  workflowGenerationProgress?: number;
  workflowGenerationError?: string;
  workflowAngleEditControls?: Record<string, unknown>;
  imageUpscaleTargetResolution?: string;
  imageUpscaleOutputFormat?: string;
  imageUpscaleScale?: string;
  imageUpscaleVariant?: string;
  suppressGenerationBar?: boolean;
  workflowStoryboardPending?: boolean;
  workflowStoryboardSourceRowIndex?: number;
  workflowStoryboardSourceNodeId?: string;
  workflowStoryboardRowIndexes?: number[];
  workflowStoryboardDuration?: string;
  workflowStoryboardVideoSegmentIndex?: number;
  workflowStoryboardVideoSegmentCount?: number;
  workflowStoryboardVideoFirstFrameUrl?: string;
  workflowStoryboardVideoPreviousTailFrameUrl?: string;
  workflowStoryboardVideoTailFrameUrl?: string;
  workflowStoryboardVideoSourceGroupId?: string;
  workflowStoryboardVideoFailedSegmentIndex?: number;
  workflowStoryboardVideoResumeFromSegmentIndex?: number;
  workflowStoryboardVideoResumeTailFrameUrl?: string;
  workflowStoryboardVideoStopped?: boolean;
  directorConsole3D?: LibTvDirectorConsole3DState;
  panoramaUrl?: string;
  panoramaSource?: string;
  panoramaNodeId?: string;
  previewImageUrl?: string;
  compositionData?: LibTvDirectorConsole3DState;
  contentWidth?: number;
  contentHeight?: number;
}

export interface LibTvWorkflowNode {
  id: string;
  kind: LibTvWorkflowNodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  locked?: boolean;
  data: LibTvWorkflowNodeData;
}

export const LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH = 800;
export const LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT = 400;

export interface LibTvWorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface LibTvWorkflowRunResult {
  status: "idle" | "running" | "success" | "failed";
  sessionId?: string;
  projectUuid?: string;
  projectUrl?: string;
  executionMode?: string;
  targetNodeId?: string;
  scriptNodeId?: string;
  sourceNodeIds?: string[];
  scriptContext?: unknown;
  resultUrls?: string[];
  scriptResult?: unknown;
  shots?: unknown[];
  storyboardImages?: unknown[];
  clips?: unknown[];
  qaSummaries?: string[];
  error?: string;
  updatedAt?: number;
}

export interface LibTvWorkflowState {
  enabled: boolean;
  nodes: LibTvWorkflowNode[];
  edges: LibTvWorkflowEdge[];
  activeNodeId: string | null;
  lastRun: LibTvWorkflowRunResult | null;
}

export const LIBTV_WORKFLOW_NODE_WIDTH = 320;
const LEGACY_DIRECTOR_CONSOLE_3D_DEFAULT_SIZE = 350;

function getDefaultNodeFrame(kind: LibTvWorkflowNodeKind) {
  switch (kind) {
    case "text":
      return {
        width: LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
        height: LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
      };
    case "image":
      return {
        width: LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
        height: LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
      };
    case "video":
      return {
        width: LIBTV_TAPNOW_VIDEO_WIDTH,
        height: LIBTV_TAPNOW_VIDEO_HEIGHT,
      };
    case "audio":
      return {
        width: LIBTV_TAPNOW_GENERATOR_WIDTH,
        height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
      };
    case "playlist":
      return { width: 960, height: 125 };
    case "threed":
      return { width: 375, height: LIBTV_TAPNOW_VIDEO_HEIGHT };
    case "director-console-3d":
      return {
        width: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
        height: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
      };
    case "script":
    case "script-v2":
      return {
        width: LIBTV_TAPNOW_SCRIPT_WIDTH,
        height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
      };
    case "group":
      return { width: 520, height: 360 };
    default:
      return { width: LIBTV_WORKFLOW_NODE_WIDTH, height: 220 };
  }
}

const DEFAULT_TEXT_OPTIONS: LibTvWorkflowNodeOption[] = [
  { id: "custom", label: "文本输入", description: "直接填写提示词或故事内容" },
  {
    id: "text-to-video",
    label: "视频方案",
    description: "把文本整理为视频生成方向",
  },
  {
    id: "image-reverse-prompt",
    label: "图片解析",
    description: "把参考图目标描述整理成可复用提示词",
  },
  {
    id: "text-to-music",
    label: "音乐方案",
    description: "根据文本描述生成音乐方向",
  },
];

const DEFAULT_IMAGE_OPTIONS: LibTvWorkflowNodeOption[] = [
  {
    id: "reference-image",
    label: "参考图片",
    description: "作为生成或编辑的视觉参考",
  },
  {
    id: "style-image",
    label: "风格图片",
    description: "给后续节点提供风格方向",
  },
];

const DEFAULT_VIDEO_OPTIONS: LibTvWorkflowNodeOption[] = [
  {
    id: "start-end-to-video",
    label: "双帧视频",
    description: "自动连接左侧两张普通图片，作为首帧和尾帧参考",
  },
  {
    id: "first-frame-to-video",
    label: "单帧视频",
    description: "自动连接左侧一张普通图片，作为首帧参考",
  },
  {
    id: "audio-to-video",
    label: "音频驱动",
    description: "自动连接左侧一条普通音频，作为视频声音参考",
  },
];

const DEFAULT_AUDIO_OPTIONS: LibTvWorkflowNodeOption[] = [
  {
    id: "music-inspiration",
    label: "音乐灵感",
    description: "根据灵感描述直接生成完整歌曲",
  },
  {
    id: "audio-to-video",
    label: "音频驱动",
    description: "上传音频或输入描述，为后续视频生成提供声音驱动",
  },
];

const DEFAULT_SCRIPT_OPTIONS: LibTvWorkflowNodeOption[] =
  LIBTV_SCRIPT_NODE_OPTION_DESCRIPTORS;

export const EMPTY_LIBTV_WORKFLOW_STATE: LibTvWorkflowState = {
  enabled: false,
  nodes: [],
  edges: [],
  activeNodeId: null,
  lastRun: null,
};

const LEGACY_WORKFLOW_DEFAULT_ORDINARY_IMAGE_URL =
  "/images/libtv/style-gallery-card.png";
const ZMTV_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_URL =
  "/images/zmtv/characters/20260725/moonfang-half-spirit/full-body-reference.png";
const ZMTV_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE = {
  width: 1012,
  height: 1196,
};
const WORKFLOW_MEDIA_NODE_SHORT_SIDE = 350;
const WORKFLOW_MEDIA_NODE_MAX_LONG_SIDE = 5600;

function computeWorkflowMediaNodeFrame(width: number, height: number) {
  const safeWidth = Math.max(1, Math.round(Number(width || 1)));
  const safeHeight = Math.max(1, Math.round(Number(height || 1)));
  if (safeWidth >= safeHeight) {
    return {
      width: Math.min(
        Math.round((safeWidth / safeHeight) * WORKFLOW_MEDIA_NODE_SHORT_SIDE),
        WORKFLOW_MEDIA_NODE_MAX_LONG_SIDE,
      ),
      height: WORKFLOW_MEDIA_NODE_SHORT_SIDE,
    };
  }
  return {
    width: WORKFLOW_MEDIA_NODE_SHORT_SIDE,
    height: Math.min(
      Math.round((safeHeight / safeWidth) * WORKFLOW_MEDIA_NODE_SHORT_SIDE),
      WORKFLOW_MEDIA_NODE_MAX_LONG_SIDE,
    ),
  };
}

function getDefaultOptions(
  kind: LibTvWorkflowNodeKind,
): LibTvWorkflowNodeOption[] {
  switch (kind) {
    case "text":
      return DEFAULT_TEXT_OPTIONS;
    case "image":
      return DEFAULT_IMAGE_OPTIONS;
    case "video":
      return DEFAULT_VIDEO_OPTIONS;
    case "audio":
      return DEFAULT_AUDIO_OPTIONS;
    case "playlist":
      return [];
    case "threed":
      return [];
    case "director-console-3d":
      return [];
    case "script":
    case "script-v2":
      return DEFAULT_SCRIPT_OPTIONS;
    case "group":
      return [];
    default:
      return [];
  }
}

function getDefaultTitle(kind: LibTvWorkflowNodeKind) {
  switch (kind) {
    case "text":
      return "文本生成器";
    case "image":
      return "图片生成器";
    case "video":
      return "视频生成器";
    case "audio":
      return "音频生成器";
    case "playlist":
      return "视频合成";
    case "threed":
      return "3D 世界";
    case "director-console-3d":
      return "3D 导演台";
    case "script":
      return "脚本生成器";
    case "script-v2":
      return "脚本生成器";
    case "group":
      return "分组";
    default:
      return "节点";
  }
}

function getDefaultContent(kind: LibTvWorkflowNodeKind) {
  switch (kind) {
    case "text":
      return "";
    case "script":
    case "script-v2":
      return "场景一：\n角色：\n镜头：\n情绪：";
    default:
      return "";
  }
}

export function normalizeLibTvWorkflowTextContent(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  )
    return String(value);
  if (Array.isArray(value)) {
    if (value.some((item) => item && typeof item === "object")) {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return value
          .map((item) => normalizeLibTvWorkflowTextContent(item))
          .filter(Boolean)
          .join("\n");
      }
    }
    return value
      .map((item) => normalizeLibTvWorkflowTextContent(item))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function normalizeWorkflowScriptResult(
  input: unknown,
): LibTvStoryboardScriptResult | null {
  if (!input || typeof input !== "object") return null;
  return normalizeLibTvStoryboardScriptResult(
    input as LibTvStoryboardScriptResult,
  );
}

export function createLibTvWorkflowNode(
  kind: LibTvWorkflowNodeKind,
  position?: { x?: number; y?: number },
): LibTvWorkflowNode {
  const options = getDefaultOptions(kind);
  const frame = getDefaultNodeFrame(kind);
  return {
    id: uuidv4(),
    kind,
    x: Number(position?.x ?? 120),
    y: Number(position?.y ?? 120),
    width: frame.width,
    height: frame.height,
    locked: false,
    data: {
      title: getDefaultTitle(kind),
      content: getDefaultContent(kind),
      componentType:
        kind === "text"
          ? "text-generator"
          : kind === "script"
            ? "script-generator"
            : kind === "script-v2"
              ? "script-v2-generator"
              : undefined,
      prompt: "",
      lyrics: "",
      referenceImages: [],
      referenceImageNodeIds: [],
      referenceImageRoles: [],
      selectedOptionId: undefined,
      options,
      mediaUrl: "",
      mediaRole: kind === "image" || kind === "video" ? "generator" : undefined,
      playlistItems: kind === "playlist" ? [] : undefined,
      playlistActiveIndex: kind === "playlist" ? 0 : undefined,
      playlistPanelOpen: kind === "playlist" ? false : undefined,
      playlistTrimStart: kind === "playlist" ? 0 : undefined,
      playlistTrimEnd: undefined,
      playlistExportUrl: undefined,
      playlistExportRunning: false,
      note: "",
      groupNodeIds: [],
      groupBackgroundColor: "",
      groupRunning: false,
      suppressGenerationBar: false,
    },
  };
}

function migrateCharacterThreeViewStarterReferences(
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  const characterGeneratorIds = new Set(
    nodes
      .filter(
        (node) =>
          node.kind === "image" &&
          node.data.selectedOptionId === "character-three-view",
      )
      .map((node) => node.id),
  );
  if (characterGeneratorIds.size === 0) return nodes;

  const characterReferenceNodeIds = new Set(
    edges
      .filter((edge) => characterGeneratorIds.has(edge.target))
      .map((edge) => edge.source),
  );
  if (characterReferenceNodeIds.size === 0) return nodes;

  const referenceFrame = computeWorkflowMediaNodeFrame(
    ZMTV_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE.width,
    ZMTV_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE.height,
  );

  return nodes.map((node) => {
    if (characterGeneratorIds.has(node.id)) {
      const referenceImages = Array.isArray(node.data.referenceImages)
        ? node.data.referenceImages
        : [];
      const shouldMigrate =
        referenceImages.includes(LEGACY_WORKFLOW_DEFAULT_ORDINARY_IMAGE_URL) ||
        referenceImages.includes(
          "/images/zmtv/characters/20260725/moonfang-half-spirit/full-body.png",
        );
      if (!shouldMigrate) return node;
      return {
        ...node,
        data: {
          ...node.data,
          referenceImages: referenceImages.map((url) =>
            url === LEGACY_WORKFLOW_DEFAULT_ORDINARY_IMAGE_URL ||
            url ===
              "/images/zmtv/characters/20260725/moonfang-half-spirit/full-body.png"
              ? ZMTV_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_URL
              : url,
          ),
        },
      };
    }

    if (
      characterReferenceNodeIds.has(node.id) &&
      node.kind === "image" &&
      node.data.mediaRole === "ordinary" &&
      node.data.title === "人物参考图" &&
      (node.data.mediaUrl === LEGACY_WORKFLOW_DEFAULT_ORDINARY_IMAGE_URL ||
        node.data.mediaUrl ===
          "/images/zmtv/characters/20260725/moonfang-half-spirit/full-body.png")
    ) {
      return {
        ...node,
        width: referenceFrame.width,
        height: referenceFrame.height,
        data: {
          ...node.data,
          mediaUrl: ZMTV_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_URL,
          workflowMediaNaturalWidth:
            ZMTV_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE.width,
          workflowMediaNaturalHeight:
            ZMTV_CHARACTER_THREE_VIEW_REFERENCE_IMAGE_SIZE.height,
          workflowMediaUserResized: false,
        },
      };
    }

    return node;
  });
}

export function normalizeLibTvWorkflowState(
  input: unknown,
): LibTvWorkflowState {
  if (!input || typeof input !== "object") {
    return { ...EMPTY_LIBTV_WORKFLOW_STATE };
  }

  const raw = input as Partial<LibTvWorkflowState>;
  let nodes = Array.isArray(raw.nodes)
    ? raw.nodes
        .filter(
          (node): node is LibTvWorkflowNode =>
            !!node && typeof node === "object",
        )
        .map((node) => {
          const kind = isLibTvWorkflowNodeKind(node.kind) ? node.kind : "text";
          const frame = getDefaultNodeFrame(kind);
          const usesLegacyDirectorDefaultFrame =
            kind === "director-console-3d" &&
            Number(node.width) === LEGACY_DIRECTOR_CONSOLE_3D_DEFAULT_SIZE &&
            Number(node.height) === LEGACY_DIRECTOR_CONSOLE_3D_DEFAULT_SIZE;
          const options =
            Array.isArray(node.data?.options) && node.data?.options.length > 0
              ? node.data.options
                  .filter(
                    (option): option is LibTvWorkflowNodeOption =>
                      !!option && typeof option === "object",
                  )
                  .map((option) => ({
                    id: String(option.id || uuidv4()),
                    label: String(option.label || ""),
                    description:
                      typeof option.description === "string"
                        ? option.description
                        : undefined,
                  }))
              : getDefaultOptions(kind);

          const normalizedNode: LibTvWorkflowNode = {
            id:
              typeof node.id === "string" && node.id.trim()
                ? node.id
                : uuidv4(),
            kind,
            x: Number.isFinite(Number(node.x)) ? Number(node.x) : 120,
            y: Number.isFinite(Number(node.y)) ? Number(node.y) : 120,
            width: usesLegacyDirectorDefaultFrame
              ? frame.width
              : Number.isFinite(Number(node.width))
                ? Math.max(
                    kind === "playlist"
                      ? 250
                      : kind === "script" &&
                          node.data?.componentType === "script-document"
                        ? LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH
                        : 260,
                    Number(node.width),
                  )
                : kind === "script" &&
                    node.data?.componentType === "script-document"
                  ? LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH
                  : frame.width,
            height: usesLegacyDirectorDefaultFrame
              ? frame.height
              : Number.isFinite(Number(node.height))
                ? Math.max(
                    kind === "playlist"
                      ? 125
                      : kind === "script" &&
                          node.data?.componentType === "script-document"
                        ? LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT
                        : 160,
                    Number(node.height),
                  )
                : kind === "script" &&
                    node.data?.componentType === "script-document"
                  ? LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT
                  : frame.height,
            parentId:
              typeof node.parentId === "string" && node.parentId.trim()
                ? node.parentId
                : undefined,
            locked: Boolean(node.locked),
            data: {
              title: String(node.data?.title || getDefaultTitle(kind)),
              content: normalizeLibTvWorkflowTextContent(node.data?.content),
              componentType:
                typeof node.data?.componentType === "string"
                  ? (node.data.componentType as LibTvComponentType)
                  : kind === "text"
                    ? "text-generator"
                    : kind === "script"
                      ? "script-generator"
                      : kind === "script-v2"
                        ? "script-v2-generator"
                        : undefined,
              mediaUrl:
                typeof node.data?.mediaUrl === "string"
                  ? node.data.mediaUrl
                  : "",
              workflowMediaMimeType:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowMediaMimeType === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowMediaMimeType,
                    )
                  : undefined,
              workflowMediaNaturalWidth:
                Number.isFinite(
                  Number(
                    (node.data as unknown as Record<string, unknown>)
                      ?.workflowMediaNaturalWidth,
                  ),
                ) &&
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowMediaNaturalWidth,
                ) > 0
                  ? Math.round(
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowMediaNaturalWidth,
                      ),
                    )
                  : undefined,
              workflowMediaNaturalHeight:
                Number.isFinite(
                  Number(
                    (node.data as unknown as Record<string, unknown>)
                      ?.workflowMediaNaturalHeight,
                  ),
                ) &&
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowMediaNaturalHeight,
                ) > 0
                  ? Math.round(
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowMediaNaturalHeight,
                      ),
                    )
                  : undefined,
              workflowMediaDurationSec:
                Number.isFinite(
                  Number(
                    (node.data as unknown as Record<string, unknown>)
                      ?.workflowMediaDurationSec,
                  ),
                ) &&
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowMediaDurationSec,
                ) > 0
                  ? Number(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowMediaDurationSec,
                    )
                  : undefined,
              workflowMediaPlaybackVolume: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowMediaPlaybackVolume,
                ),
              )
                ? Math.max(
                    0,
                    Math.min(
                      1,
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowMediaPlaybackVolume,
                      ),
                    ),
                  )
                : undefined,
              workflowMediaUploadState: [
                "uploading",
                "reviewing",
                "success",
                "error",
              ].includes(
                String(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowMediaUploadState || "",
                ),
              )
                ? (String(
                    (node.data as unknown as Record<string, unknown>)
                      .workflowMediaUploadState,
                  ) as "uploading" | "reviewing" | "success" | "error")
                : undefined,
              workflowMediaHasAudio:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowMediaHasAudio === "boolean"
                  ? Boolean(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowMediaHasAudio,
                    )
                  : undefined,
              workflowMediaUserResized: Boolean(
                (node.data as unknown as Record<string, unknown>)
                  ?.workflowMediaUserResized,
              ),
              workflowMediaFrameLocked: Boolean(
                (node.data as unknown as Record<string, unknown>)
                  ?.workflowMediaFrameLocked,
              ),
              workflowSeedanceAssetId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowSeedanceAssetId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowSeedanceAssetId,
                    ).trim() || undefined
                  : undefined,
              workflowSeedanceAssetUrl:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowSeedanceAssetUrl === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowSeedanceAssetUrl,
                    ).trim() || undefined
                  : undefined,
              workflowSeedanceAssetGroupId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowSeedanceAssetGroupId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowSeedanceAssetGroupId,
                    ).trim() || undefined
                  : undefined,
              workflowSeedanceAssetType: (() => {
                const value = String(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowSeedanceAssetType || "",
                ).trim();
                return value === "Image" ||
                  value === "Video" ||
                  value === "Audio"
                  ? value
                  : undefined;
              })(),
              workflowSeedanceAssetStatus:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowSeedanceAssetStatus === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowSeedanceAssetStatus,
                    ).trim() || undefined
                  : undefined,
              workflowPlatformFileId: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowPlatformFileId,
                ),
              )
                ? Number(
                    (node.data as unknown as Record<string, unknown>)
                      .workflowPlatformFileId,
                  )
                : undefined,
              workflowPlatformFileUrl:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowPlatformFileUrl === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowPlatformFileUrl,
                    ).trim() || undefined
                  : undefined,
              workflowPlatformFileAssetType:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowPlatformFileAssetType === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowPlatformFileAssetType,
                    ).trim() || undefined
                  : undefined,
              workflowPlatformValidationStatus:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowPlatformValidationStatus === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowPlatformValidationStatus,
                    ).trim() || undefined
                  : undefined,
              workflowSeedanceAssetCategory: (() => {
                const value = String(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowSeedanceAssetCategory || "",
                ).trim();
                return value === "character" || value === "non_character"
                  ? value
                  : undefined;
              })(),
              workflowScriptV2AssetKind:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowScriptV2AssetKind === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowScriptV2AssetKind,
                    ).trim() || undefined
                  : undefined,
              workflowScriptV2AssetId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowScriptV2AssetId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowScriptV2AssetId,
                    ).trim() || undefined
                  : undefined,
              workflowScriptV2AssetModelId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowScriptV2AssetModelId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowScriptV2AssetModelId,
                    ).trim() || undefined
                  : undefined,
              mediaRole:
                node.data?.mediaRole === "ordinary" ||
                node.data?.mediaRole === "generator"
                  ? node.data.mediaRole
                  : kind === "image" || kind === "video"
                    ? "generator"
                    : undefined,
              prompt:
                typeof node.data?.prompt === "string" ? node.data.prompt : "",
              workflowInternalPrompt:
                typeof node.data?.workflowInternalPrompt === "string"
                  ? node.data.workflowInternalPrompt
                  : undefined,
              modelId:
                typeof node.data?.modelId === "string"
                  ? node.data.modelId
                  : undefined,
              workflowEndpointMethod:
                typeof node.data?.workflowEndpointMethod === "string"
                  ? node.data.workflowEndpointMethod
                  : undefined,
              workflowExtraParameters: (() => {
                const raw = (node.data as unknown as Record<string, unknown>)
                  ?.workflowExtraParameters;
                if (!raw || typeof raw !== "object" || Array.isArray(raw))
                  return undefined;
                const normalized = Object.fromEntries(
                  Object.entries(raw)
                    .map(([key, value]) => {
                      const normalizedKey = String(key || "").trim();
                      if (
                        !normalizedKey ||
                        (typeof value !== "string" &&
                          typeof value !== "number" &&
                          typeof value !== "boolean")
                      )
                        return null;
                      return [normalizedKey, value] as const;
                    })
                    .filter(
                      (
                        entry,
                      ): entry is readonly [
                        string,
                        string | number | boolean,
                      ] => Boolean(entry),
                    )
                    .slice(0, 64),
                );
                return Object.keys(normalized).length > 0
                  ? normalized
                  : undefined;
              })(),
              aspectRatio:
                typeof node.data?.aspectRatio === "string"
                  ? node.data.aspectRatio
                  : undefined,
              imageSize:
                typeof node.data?.imageSize === "string"
                  ? node.data.imageSize
                  : undefined,
              stylePreset:
                typeof node.data?.stylePreset === "string"
                  ? node.data.stylePreset
                  : undefined,
              videoMethod:
                typeof node.data?.videoMethod === "string"
                  ? node.data.videoMethod
                  : undefined,
              videoDuration:
                typeof node.data?.videoDuration === "string"
                  ? node.data.videoDuration
                  : undefined,
              videoResolution:
                typeof node.data?.videoResolution === "string"
                  ? node.data.videoResolution
                  : undefined,
              generateAudio:
                typeof node.data?.generateAudio === "boolean"
                  ? node.data.generateAudio
                  : undefined,
              enableWebSearch:
                typeof node.data?.enableWebSearch === "boolean"
                  ? node.data.enableWebSearch
                  : undefined,
              generationCount: Number.isFinite(
                Number(node.data?.generationCount),
              )
                ? Math.max(1, Math.round(Number(node.data?.generationCount)))
                : undefined,
              cameraControl:
                node.data?.cameraControl &&
                typeof node.data.cameraControl === "object"
                  ? {
                      camera:
                        typeof node.data.cameraControl.camera === "string"
                          ? node.data.cameraControl.camera
                          : undefined,
                      lens:
                        typeof node.data.cameraControl.lens === "string"
                          ? node.data.cameraControl.lens
                          : undefined,
                      focalLength:
                        typeof node.data.cameraControl.focalLength === "string"
                          ? node.data.cameraControl.focalLength
                          : undefined,
                      aperture:
                        typeof node.data.cameraControl.aperture === "string"
                          ? node.data.cameraControl.aperture
                          : undefined,
                    }
                  : undefined,
              videoCameraMotion:
                node.data?.videoCameraMotion &&
                typeof node.data.videoCameraMotion === "object"
                  ? {
                      id:
                        typeof node.data.videoCameraMotion.id === "string"
                          ? node.data.videoCameraMotion.id
                          : undefined,
                      label:
                        typeof node.data.videoCameraMotion.label === "string"
                          ? node.data.videoCameraMotion.label
                          : undefined,
                      prompt:
                        typeof node.data.videoCameraMotion.prompt === "string"
                          ? node.data.videoCameraMotion.prompt
                          : undefined,
                      previewUrl:
                        typeof node.data.videoCameraMotion.previewUrl ===
                        "string"
                          ? node.data.videoCameraMotion.previewUrl
                          : undefined,
                    }
                  : undefined,
              videoCharacterAssets: Array.isArray(
                node.data?.videoCharacterAssets,
              )
                ? node.data.videoCharacterAssets
                    .filter((item): item is LibTvWorkflowVideoCharacterAsset =>
                      Boolean(item && typeof item === "object"),
                    )
                    .map((item) => ({
                      id: typeof item.id === "string" ? item.id : undefined,
                      name:
                        typeof item.name === "string" ? item.name : undefined,
                      assetUrl:
                        typeof item.assetUrl === "string"
                          ? item.assetUrl
                          : undefined,
                      previewUrl:
                        typeof item.previewUrl === "string"
                          ? item.previewUrl
                          : undefined,
                      referenceImageUrl:
                        typeof item.referenceImageUrl === "string"
                          ? item.referenceImageUrl
                          : undefined,
                      source:
                        typeof item.source === "string"
                          ? item.source
                          : undefined,
                      metadata:
                        item.metadata &&
                        typeof item.metadata === "object" &&
                        !Array.isArray(item.metadata)
                          ? (item.metadata as Record<string, unknown>)
                          : undefined,
                    }))
                    .filter((item) =>
                      Boolean(
                        item.assetUrl ||
                        item.referenceImageUrl ||
                        item.previewUrl ||
                        item.id,
                      ),
                    )
                    .slice(0, 9)
                : undefined,
              directorConsole3D:
                node.data?.directorConsole3D &&
                typeof node.data.directorConsole3D === "object" &&
                !Array.isArray(node.data.directorConsole3D)
                  ? (node.data.directorConsole3D as LibTvDirectorConsole3DState)
                  : undefined,
              panoramaUrl:
                typeof node.data?.panoramaUrl === "string"
                  ? node.data.panoramaUrl
                  : undefined,
              panoramaSource:
                typeof node.data?.panoramaSource === "string"
                  ? node.data.panoramaSource
                  : undefined,
              panoramaNodeId:
                typeof node.data?.panoramaNodeId === "string"
                  ? node.data.panoramaNodeId
                  : undefined,
              previewImageUrl:
                typeof node.data?.previewImageUrl === "string"
                  ? node.data.previewImageUrl
                  : undefined,
              compositionData:
                node.data?.compositionData &&
                typeof node.data.compositionData === "object" &&
                !Array.isArray(node.data.compositionData)
                  ? (node.data.compositionData as LibTvDirectorConsole3DState)
                  : undefined,
              contentWidth:
                Number.isFinite(Number(node.data?.contentWidth)) &&
                Number(node.data?.contentWidth) > 0
                  ? Number(node.data.contentWidth)
                  : undefined,
              contentHeight:
                Number.isFinite(Number(node.data?.contentHeight)) &&
                Number(node.data?.contentHeight) > 0
                  ? Number(node.data.contentHeight)
                  : undefined,
              playlistItems: Array.isArray(node.data?.playlistItems)
                ? node.data.playlistItems
                    .filter((item): item is LibTvWorkflowPlaylistItem =>
                      Boolean(item && typeof item === "object"),
                    )
                    .map((item) => ({
                      id:
                        typeof item.id === "string" && item.id.trim()
                          ? item.id
                          : uuidv4(),
                      nodeId:
                        typeof item.nodeId === "string" && item.nodeId.trim()
                          ? item.nodeId
                          : undefined,
                      title:
                        typeof item.title === "string" ? item.title : undefined,
                      mediaUrl:
                        typeof item.mediaUrl === "string"
                          ? item.mediaUrl.trim()
                          : "",
                      thumbnailUrl:
                        typeof item.thumbnailUrl === "string"
                          ? item.thumbnailUrl.trim()
                          : undefined,
                      duration:
                        Number.isFinite(Number(item.duration)) &&
                        Number(item.duration) > 0
                          ? Number(item.duration)
                          : undefined,
                      trimStart:
                        Number.isFinite(Number(item.trimStart)) &&
                        Number(item.trimStart) >= 0
                          ? Number(item.trimStart)
                          : undefined,
                      trimEnd:
                        Number.isFinite(Number(item.trimEnd)) &&
                        Number(item.trimEnd) > 0
                          ? Number(item.trimEnd)
                          : undefined,
                    }))
                    .filter((item) => Boolean(item.nodeId || item.mediaUrl))
                    .slice(0, 80)
                : kind === "playlist"
                  ? []
                  : undefined,
              playlistActiveIndex: Number.isFinite(
                Number(node.data?.playlistActiveIndex),
              )
                ? Math.max(
                    0,
                    Math.round(Number(node.data?.playlistActiveIndex)),
                  )
                : kind === "playlist"
                  ? 0
                  : undefined,
              playlistPanelOpen:
                typeof node.data?.playlistPanelOpen === "boolean"
                  ? node.data.playlistPanelOpen
                  : kind === "playlist"
                    ? false
                    : undefined,
              playlistTrimStart: Number.isFinite(
                Number(node.data?.playlistTrimStart),
              )
                ? Math.max(0, Number(node.data?.playlistTrimStart))
                : kind === "playlist"
                  ? 0
                  : undefined,
              playlistTrimEnd:
                Number.isFinite(Number(node.data?.playlistTrimEnd)) &&
                Number(node.data?.playlistTrimEnd) > 0
                  ? Number(node.data?.playlistTrimEnd)
                  : undefined,
              playlistExportUrl:
                typeof node.data?.playlistExportUrl === "string"
                  ? node.data.playlistExportUrl.trim()
                  : undefined,
              // Export activity is tab-local. Persisting it can permanently lock
              // the export button after a refresh or interrupted request.
              playlistExportRunning: false,
              playlistBackgroundAudioUrl:
                typeof node.data?.playlistBackgroundAudioUrl === "string"
                  ? node.data.playlistBackgroundAudioUrl.trim()
                  : undefined,
              playlistBackgroundAudioNodeId:
                typeof node.data?.playlistBackgroundAudioNodeId === "string"
                  ? node.data.playlistBackgroundAudioNodeId.trim()
                  : undefined,
              playlistBackgroundAudioVolume: Number.isFinite(
                Number(node.data?.playlistBackgroundAudioVolume),
              )
                ? Math.max(
                    0,
                    Math.min(
                      1,
                      Number(node.data.playlistBackgroundAudioVolume),
                    ),
                  )
                : undefined,
              playlistVoiceoverUrl:
                typeof node.data?.playlistVoiceoverUrl === "string"
                  ? node.data.playlistVoiceoverUrl.trim()
                  : undefined,
              playlistVoiceoverNodeId:
                typeof node.data?.playlistVoiceoverNodeId === "string"
                  ? node.data.playlistVoiceoverNodeId.trim()
                  : undefined,
              playlistVoiceoverVolume: Number.isFinite(
                Number(node.data?.playlistVoiceoverVolume),
              )
                ? Math.max(
                    0,
                    Math.min(2, Number(node.data.playlistVoiceoverVolume)),
                  )
                : undefined,
              playlistSubtitles:
                typeof node.data?.playlistSubtitles === "string"
                  ? node.data.playlistSubtitles
                  : undefined,
              workflowSubtitleTimeline: Array.isArray(
                node.data?.workflowSubtitleTimeline,
              )
                ? node.data.workflowSubtitleTimeline
                    .filter((item): item is LibTvWorkflowSubtitleCue =>
                      Boolean(item && typeof item === "object"),
                    )
                    .map((item) => ({
                      text: String(item.text || "").trim(),
                      startTime: Math.max(0, Number(item.startTime) || 0),
                      endTime: Math.max(0, Number(item.endTime) || 0),
                      shotNumber:
                        typeof item.shotNumber === "string"
                          ? item.shotNumber.trim() || undefined
                          : undefined,
                      speaker:
                        typeof item.speaker === "string"
                          ? item.speaker.trim() || undefined
                          : undefined,
                      sourceStartTime:
                        typeof item.sourceStartTime === "string"
                          ? item.sourceStartTime.trim() || undefined
                          : undefined,
                      sourceEndTime:
                        typeof item.sourceEndTime === "string"
                          ? item.sourceEndTime.trim() || undefined
                          : undefined,
                    }))
                    .filter(
                      (item) => item.text && item.endTime > item.startTime,
                    )
                    .slice(0, 240)
                : undefined,
              workflowAudioRole:
                node.data?.workflowAudioRole === "voiceover" ||
                node.data?.workflowAudioRole === "background_music"
                  ? node.data.workflowAudioRole
                  : undefined,
              workflowPlaylistSourceNodeId:
                typeof node.data?.workflowPlaylistSourceNodeId === "string"
                  ? node.data.workflowPlaylistSourceNodeId.trim() || undefined
                  : undefined,
              lyrics:
                typeof node.data?.lyrics === "string" ? node.data.lyrics : "",
              referenceImages: Array.isArray(node.data?.referenceImages)
                ? node.data.referenceImages
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                    .slice(0, 14)
                : [],
              referenceImageNodeIds: Array.isArray(
                node.data?.referenceImageNodeIds,
              )
                ? node.data.referenceImageNodeIds
                    .map((item) => String(item || "").trim())
                    .slice(0, 14)
                : [],
              referenceImageRoles: Array.isArray(node.data?.referenceImageRoles)
                ? node.data.referenceImageRoles
                    .map((item) => String(item || "").trim())
                    .slice(0, 14)
                : [],
              referenceVideos: Array.isArray(node.data?.referenceVideos)
                ? node.data.referenceVideos
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                    .slice(0, 8)
                : [],
              referenceVideoNodeIds: Array.isArray(
                node.data?.referenceVideoNodeIds,
              )
                ? node.data.referenceVideoNodeIds
                    .map((item) => String(item || "").trim())
                    .slice(0, 8)
                : [],
              referenceVideoRoles: Array.isArray(node.data?.referenceVideoRoles)
                ? node.data.referenceVideoRoles
                    .map((item) => String(item || "").trim())
                    .slice(0, 8)
                : [],
              worldId:
                typeof node.data?.worldId === "string"
                  ? node.data.worldId
                  : undefined,
              worldUrl:
                typeof node.data?.worldUrl === "string"
                  ? node.data.worldUrl
                  : undefined,
              worldMarbleUrl:
                typeof node.data?.worldMarbleUrl === "string"
                  ? node.data.worldMarbleUrl
                  : undefined,
              splatUrl:
                typeof node.data?.splatUrl === "string"
                  ? node.data.splatUrl
                  : undefined,
              spzUrls:
                node.data?.spzUrls &&
                typeof node.data.spzUrls === "object" &&
                !Array.isArray(node.data.spzUrls)
                  ? Object.fromEntries(
                      Object.entries(node.data.spzUrls)
                        .map(([key, value]) => [
                          String(key),
                          String(value || "").trim(),
                        ])
                        .filter(([, value]) => Boolean(value)),
                    )
                  : undefined,
              colliderMeshUrl:
                typeof node.data?.colliderMeshUrl === "string"
                  ? node.data.colliderMeshUrl
                  : undefined,
              panoUrl:
                typeof node.data?.panoUrl === "string"
                  ? node.data.panoUrl
                  : undefined,
              thumbnailUrl:
                typeof node.data?.thumbnailUrl === "string"
                  ? node.data.thumbnailUrl
                  : undefined,
              caption:
                typeof node.data?.caption === "string"
                  ? node.data.caption
                  : undefined,
              scriptResult: normalizeWorkflowScriptResult(
                node.data?.scriptResult,
              ),
              scriptViewMode:
                node.data?.scriptViewMode === "creative"
                  ? "creative"
                  : "script",
              scriptV2ActiveStep: (() => {
                const step = String(node.data?.scriptV2ActiveStep || "").trim();
                return step === "confirm-shots" ||
                  step === "prepare-assets" ||
                  step === "compose-prompts"
                  ? step
                  : undefined;
              })(),
              scriptV2AssetsByKind: (() => {
                const value = node.data?.scriptV2AssetsByKind;
                if (!value || typeof value !== "object" || Array.isArray(value))
                  return undefined;
                return {
                  角色: Array.isArray(value.角色) ? value.角色 : [],
                  场景: Array.isArray(value.场景) ? value.场景 : [],
                  道具: Array.isArray(value.道具) ? value.道具 : [],
                };
              })(),
              scriptV2AssetGroupId:
                typeof node.data?.scriptV2AssetGroupId === "string"
                  ? node.data.scriptV2AssetGroupId.trim() || undefined
                  : undefined,
              workflowAssetStage:
                typeof node.data?.workflowAssetStage === "string"
                  ? node.data.workflowAssetStage.trim() || undefined
                  : undefined,
              workflowAssetPersonaId:
                typeof node.data?.workflowAssetPersonaId === "string"
                  ? node.data.workflowAssetPersonaId.trim() || undefined
                  : undefined,
              workflowAssetReviewStatus:
                node.data?.workflowAssetReviewStatus === "pending" ||
                node.data?.workflowAssetReviewStatus === "approved" ||
                node.data?.workflowAssetReviewStatus === "rejected"
                  ? node.data.workflowAssetReviewStatus
                  : undefined,
              workflowSceneCleanPlate:
                node.data?.workflowSceneCleanPlate === true,
              workflowSkillId:
                typeof node.data?.workflowSkillId === "string"
                  ? node.data.workflowSkillId.trim() || undefined
                  : undefined,
              workflowSkillStage:
                typeof node.data?.workflowSkillStage === "string"
                  ? node.data.workflowSkillStage.trim() || undefined
                  : undefined,
              workflowSkillStageStatus:
                node.data?.workflowSkillStageStatus === "draft" ||
                node.data?.workflowSkillStageStatus === "completed"
                  ? node.data.workflowSkillStageStatus
                  : undefined,
              workflowSkillPersonaIds: Array.isArray(
                node.data?.workflowSkillPersonaIds,
              )
                ? Array.from(
                    new Set(
                      node.data.workflowSkillPersonaIds
                        .map((item) => String(item || "").trim())
                        .filter(Boolean),
                    ),
                  ).slice(0, 200)
                : undefined,
              groupNodeIds: Array.isArray(node.data?.groupNodeIds)
                ? node.data.groupNodeIds
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
                : [],
              groupBackgroundColor:
                typeof node.data?.groupBackgroundColor === "string"
                  ? node.data.groupBackgroundColor
                  : "",
              groupRunning: Boolean(node.data?.groupRunning),
              groupCollapsed: Boolean(node.data?.groupCollapsed),
              groupToolbarHidden: Boolean(node.data?.groupToolbarHidden),
              workflowImageResults: Array.isArray(
                node.data?.workflowImageResults,
              )
                ? node.data.workflowImageResults
                    .filter((item): item is LibTvWorkflowImageResult =>
                      Boolean(item && typeof item === "object"),
                    )
                    .map((item) => ({
                      url: String(item.url || "").trim(),
                      width:
                        Number.isFinite(Number(item.width)) &&
                        Number(item.width) > 0
                          ? Math.round(Number(item.width))
                          : undefined,
                      height:
                        Number.isFinite(Number(item.height)) &&
                        Number(item.height) > 0
                          ? Math.round(Number(item.height))
                          : undefined,
                      title:
                        typeof item.title === "string"
                          ? item.title.trim() || undefined
                          : undefined,
                    }))
                    .filter((item) => Boolean(item.url))
                    .slice(0, 8)
                : undefined,
              workflowImageResultsCollapsed:
                typeof node.data?.workflowImageResultsCollapsed === "boolean"
                  ? node.data.workflowImageResultsCollapsed
                  : undefined,
              workflowVideoResults: Array.isArray(
                node.data?.workflowVideoResults,
              )
                ? node.data.workflowVideoResults
                    .filter((item): item is LibTvWorkflowVideoResult =>
                      Boolean(item && typeof item === "object"),
                    )
                    .map((item) => ({
                      url: String(item.url || "").trim(),
                      thumbnailUrl:
                        typeof item.thumbnailUrl === "string"
                          ? item.thumbnailUrl.trim() || undefined
                          : undefined,
                      width:
                        Number.isFinite(Number(item.width)) &&
                        Number(item.width) > 0
                          ? Math.round(Number(item.width))
                          : undefined,
                      height:
                        Number.isFinite(Number(item.height)) &&
                        Number(item.height) > 0
                          ? Math.round(Number(item.height))
                          : undefined,
                      duration:
                        Number.isFinite(Number(item.duration)) &&
                        Number(item.duration) > 0
                          ? Number(item.duration)
                          : undefined,
                      title:
                        typeof item.title === "string"
                          ? item.title.trim() || undefined
                          : undefined,
                    }))
                    .filter((item) => Boolean(item.url))
                    .slice(0, 8)
                : undefined,
              workflowVideoResultsCollapsed:
                typeof node.data?.workflowVideoResultsCollapsed === "boolean"
                  ? node.data.workflowVideoResultsCollapsed
                  : undefined,
              selectedOptionId:
                typeof node.data?.selectedOptionId === "string"
                  ? node.data.selectedOptionId
                  : undefined,
              options,
              note: typeof node.data?.note === "string" ? node.data.note : "",
              workflowGenerationCategory:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationCategory === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowGenerationCategory,
                    )
                  : undefined,
              workflowGenerationJobId:
                typeof node.data?.workflowGenerationJobId === "string"
                  ? node.data.workflowGenerationJobId
                  : undefined,
              workflowGenerationTaskId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationTaskId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowGenerationTaskId,
                    )
                  : undefined,
              workflowGenerationTaskIds: Array.isArray(
                (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationTaskIds,
              )
                ? Array.from(
                    new Set(
                      (
                        (node.data as unknown as Record<string, unknown>)
                          .workflowGenerationTaskIds as unknown[]
                      )
                        .map((item) => String(item || "").trim())
                        .filter(Boolean),
                    ),
                  )
                : undefined,
              workflowGenerationTaskType:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationTaskType === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowGenerationTaskType,
                    )
                  : undefined,
              workflowGenerationProviderKey:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationProviderKey === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowGenerationProviderKey,
                    )
                  : undefined,
              workflowGenerationBaseUrl:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationBaseUrl === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowGenerationBaseUrl,
                    )
                  : undefined,
              workflowGenerationStatusUrl:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationStatusUrl === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowGenerationStatusUrl,
                    )
                  : undefined,
              workflowGenerationController:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationController === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowGenerationController,
                    )
                  : undefined,
              workflowCodexGenerationTaskId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowCodexGenerationTaskId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowCodexGenerationTaskId,
                    )
                  : undefined,
              workflowCodexTaskId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowCodexTaskId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowCodexTaskId,
                    )
                  : undefined,
              workflowCodexLayoutAnchorX: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowCodexLayoutAnchorX,
                ),
              )
                ? Number(
                    (node.data as unknown as Record<string, unknown>)
                      .workflowCodexLayoutAnchorX,
                  )
                : undefined,
              workflowCodexLayoutAnchorY: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowCodexLayoutAnchorY,
                ),
              )
                ? Number(
                    (node.data as unknown as Record<string, unknown>)
                      .workflowCodexLayoutAnchorY,
                  )
                : undefined,
              workflowCodexLayoutIndex: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowCodexLayoutIndex,
                ),
              )
                ? Math.max(
                    0,
                    Math.round(
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowCodexLayoutIndex,
                      ),
                    ),
                  )
                : undefined,
              workflowCodexLayoutStage: (() => {
                const stage = String(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowCodexLayoutStage || "",
                );
                return stage === "source" ||
                  stage === "script" ||
                  stage === "assets" ||
                  stage === "storyboard" ||
                  stage === "video" ||
                  stage === "compose" ||
                  stage === "output"
                  ? stage
                  : undefined;
              })(),
              workflowCodexLayoutRow: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowCodexLayoutRow,
                ),
              )
                ? Math.max(
                    0,
                    Math.round(
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowCodexLayoutRow,
                      ),
                    ),
                  )
                : undefined,
              workflowGenerationBackgroundTaskId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowGenerationBackgroundTaskId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowGenerationBackgroundTaskId,
                    )
                  : undefined,
              workflowGenerationResultIndex: Number.isFinite(
                Number(node.data?.workflowGenerationResultIndex),
              )
                ? Math.max(
                    0,
                    Math.round(Number(node.data.workflowGenerationResultIndex)),
                  )
                : undefined,
              workflowGenerationStartedAt: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowGenerationStartedAt,
                ),
              )
                ? Math.max(
                    0,
                    Math.round(
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowGenerationStartedAt,
                      ),
                    ),
                  )
                : undefined,
              workflowGenerationRunning: Boolean(
                node.data?.workflowGenerationRunning,
              ),
              workflowGenerationProgress: Number.isFinite(
                Number(node.data?.workflowGenerationProgress),
              )
                ? Math.max(
                    0,
                    Math.min(1, Number(node.data?.workflowGenerationProgress)),
                  )
                : undefined,
              workflowGenerationError:
                typeof node.data?.workflowGenerationError === "string"
                  ? node.data.workflowGenerationError
                  : "",
              workflowAngleEditControls:
                node.data?.workflowAngleEditControls &&
                typeof node.data.workflowAngleEditControls === "object" &&
                !Array.isArray(node.data.workflowAngleEditControls)
                  ? (node.data.workflowAngleEditControls as Record<
                      string,
                      unknown
                    >)
                  : undefined,
              suppressGenerationBar: Boolean(node.data?.suppressGenerationBar),
              workflowStoryboardPending: Boolean(
                (node.data as unknown as Record<string, unknown>)
                  ?.workflowStoryboardPending,
              ),
              workflowStoryboardSourceRowIndex: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowStoryboardSourceRowIndex,
                ),
              )
                ? Math.max(
                    0,
                    Math.round(
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowStoryboardSourceRowIndex,
                      ),
                    ),
                  )
                : undefined,
              workflowStoryboardSourceNodeId:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowStoryboardSourceNodeId === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowStoryboardSourceNodeId,
                    )
                  : undefined,
              workflowStoryboardRowIndexes: Array.isArray(
                (node.data as unknown as Record<string, unknown>)
                  ?.workflowStoryboardRowIndexes,
              )
                ? (
                    (node.data as unknown as Record<string, unknown>)
                      .workflowStoryboardRowIndexes as unknown[]
                  )
                    .map((item) => Math.round(Number(item)))
                    .filter((item) => Number.isInteger(item) && item >= 0)
                : undefined,
              workflowStoryboardDuration:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowStoryboardDuration === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowStoryboardDuration,
                    )
                  : undefined,
              workflowStoryboardVideoSegmentIndex: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowStoryboardVideoSegmentIndex,
                ),
              )
                ? Math.max(
                    0,
                    Math.round(
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowStoryboardVideoSegmentIndex,
                      ),
                    ),
                  )
                : undefined,
              workflowStoryboardVideoSegmentCount: Number.isFinite(
                Number(
                  (node.data as unknown as Record<string, unknown>)
                    ?.workflowStoryboardVideoSegmentCount,
                ),
              )
                ? Math.max(
                    1,
                    Math.round(
                      Number(
                        (node.data as unknown as Record<string, unknown>)
                          .workflowStoryboardVideoSegmentCount,
                      ),
                    ),
                  )
                : undefined,
              workflowStoryboardVideoFirstFrameUrl:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowStoryboardVideoFirstFrameUrl === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowStoryboardVideoFirstFrameUrl,
                    )
                  : undefined,
              workflowStoryboardVideoPreviousTailFrameUrl:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowStoryboardVideoPreviousTailFrameUrl === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowStoryboardVideoPreviousTailFrameUrl,
                    )
                  : undefined,
              workflowStoryboardVideoTailFrameUrl:
                typeof (node.data as unknown as Record<string, unknown>)
                  ?.workflowStoryboardVideoTailFrameUrl === "string"
                  ? String(
                      (node.data as unknown as Record<string, unknown>)
                        .workflowStoryboardVideoTailFrameUrl,
                    )
                  : undefined,
            },
          };
          return normalizedNode;
        })
    : [];

  const nodeIdSet = new Set(nodes.map((node) => node.id));
  const edges = Array.isArray(raw.edges)
    ? raw.edges
        .filter(
          (edge): edge is LibTvWorkflowEdge =>
            !!edge && typeof edge === "object",
        )
        .map((edge) => ({
          id:
            typeof edge.id === "string" && edge.id.trim() ? edge.id : uuidv4(),
          source: String(edge.source || ""),
          target: String(edge.target || ""),
        }))
        .filter(
          (edge) =>
            edge.source &&
            edge.target &&
            nodeIdSet.has(edge.source) &&
            nodeIdSet.has(edge.target) &&
            edge.source !== edge.target,
        )
    : [];

  nodes = migrateCharacterThreeViewStarterReferences(nodes, edges);

  const activeNodeId =
    typeof raw.activeNodeId === "string" && nodeIdSet.has(raw.activeNodeId)
      ? raw.activeNodeId
      : nodes[0]?.id || null;

  const lastRun =
    raw.lastRun && typeof raw.lastRun === "object"
      ? {
          status: isLibTvWorkflowRunStatus(raw.lastRun.status)
            ? raw.lastRun.status
            : "idle",
          sessionId:
            typeof raw.lastRun.sessionId === "string"
              ? raw.lastRun.sessionId
              : undefined,
          projectUuid:
            typeof raw.lastRun.projectUuid === "string"
              ? raw.lastRun.projectUuid
              : undefined,
          projectUrl:
            typeof raw.lastRun.projectUrl === "string"
              ? raw.lastRun.projectUrl
              : undefined,
          executionMode:
            typeof raw.lastRun.executionMode === "string"
              ? raw.lastRun.executionMode
              : undefined,
          targetNodeId:
            typeof raw.lastRun.targetNodeId === "string"
              ? raw.lastRun.targetNodeId
              : undefined,
          scriptNodeId:
            typeof raw.lastRun.scriptNodeId === "string"
              ? raw.lastRun.scriptNodeId
              : undefined,
          sourceNodeIds: Array.isArray(raw.lastRun.sourceNodeIds)
            ? raw.lastRun.sourceNodeIds
                .map((item) => String(item || ""))
                .filter(Boolean)
            : [],
          scriptContext: raw.lastRun.scriptContext,
          resultUrls: Array.isArray(raw.lastRun.resultUrls)
            ? raw.lastRun.resultUrls
                .map((item) => String(item || ""))
                .filter(Boolean)
            : [],
          scriptResult: raw.lastRun.scriptResult,
          shots: Array.isArray(raw.lastRun.shots) ? raw.lastRun.shots : [],
          storyboardImages: Array.isArray(raw.lastRun.storyboardImages)
            ? raw.lastRun.storyboardImages
            : [],
          clips: Array.isArray(raw.lastRun.clips) ? raw.lastRun.clips : [],
          qaSummaries: Array.isArray(raw.lastRun.qaSummaries)
            ? raw.lastRun.qaSummaries
                .map((item) => String(item || ""))
                .filter(Boolean)
            : [],
          error:
            typeof raw.lastRun.error === "string"
              ? raw.lastRun.error
              : undefined,
          updatedAt: Number.isFinite(Number(raw.lastRun.updatedAt))
            ? Number(raw.lastRun.updatedAt)
            : undefined,
        }
      : null;

  return {
    enabled: Boolean(raw.enabled),
    nodes,
    edges,
    activeNodeId,
    lastRun,
  };
}

function toLibTvWorkflowSnapshotKind(value: unknown): LibTvWorkflowNodeKind {
  const normalized = String(value || "").trim();
  if (isLibTvWorkflowNodeKind(normalized)) return normalized;
  if (normalized === "text_resource") return "text";
  if (normalized === "image_resource") return "image";
  if (normalized === "video_resource") return "video";
  if (normalized === "group") return "group";
  return "text";
}

function toLibTvWorkflowSnapshotString(value: unknown) {
  return String(value || "").trim();
}

function toLibTvWorkflowSnapshotContent(value: unknown) {
  return normalizeLibTvWorkflowTextContent(value);
}

function toLibTvWorkflowSnapshotNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toLibTvWorkflowSnapshotStringListFromUrlArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function toLibTvWorkflowSnapshotNodeData(
  node: any,
  kind: LibTvWorkflowNodeKind,
) {
  const data =
    node?.data && typeof node.data === "object" && !Array.isArray(node.data)
      ? node.data
      : {};
  const params =
    data.params &&
    typeof data.params === "object" &&
    !Array.isArray(data.params)
      ? data.params
      : {};
  const settings =
    params.settings &&
    typeof params.settings === "object" &&
    !Array.isArray(params.settings)
      ? params.settings
      : {};
  const firstMediaUrl = (() => {
    const urlList = toLibTvWorkflowSnapshotStringListFromUrlArray(data.url);
    if (urlList.length > 0) return urlList[0];
    const imageList = Array.isArray(params.imageList) ? params.imageList : [];
    for (const item of imageList) {
      const urls = toLibTvWorkflowSnapshotStringListFromUrlArray(item?.url);
      if (urls.length > 0) return urls[0];
    }
    const videoList = Array.isArray(params.videoList) ? params.videoList : [];
    for (const item of videoList) {
      const urls = toLibTvWorkflowSnapshotStringListFromUrlArray(item?.url);
      if (urls.length > 0) return urls[0];
    }
    return "";
  })();
  const mediaUrls = toLibTvWorkflowSnapshotStringListFromUrlArray(data.url);
  const referenceImages = (() => {
    const imageList = Array.isArray(params.imageList) ? params.imageList : [];
    const urls: string[] = [];
    for (const item of imageList) {
      const nextUrls = toLibTvWorkflowSnapshotStringListFromUrlArray(item?.url);
      if (nextUrls.length > 0) urls.push(nextUrls[0]);
    }
    return urls.filter(Boolean);
  })();
  const groupNodeIds = Array.isArray(data.childNodeIds)
    ? data.childNodeIds
        .map((item: unknown) => String(item || "").trim())
        .filter(Boolean)
    : [];
  return {
    title: toLibTvWorkflowSnapshotString(data.name) || getDefaultTitle(kind),
    content: toLibTvWorkflowSnapshotContent(data.content),
    componentType:
      kind === "text"
        ? "text-generator"
        : kind === "image"
          ? "image-generator"
          : kind === "video"
            ? "video-generator"
            : undefined,
    mediaUrl: kind === "image" || kind === "video" ? firstMediaUrl : "",
    mediaRole: kind === "image" || kind === "video" ? "ordinary" : undefined,
    prompt: toLibTvWorkflowSnapshotString(params.prompt),
    modelId: toLibTvWorkflowSnapshotString(params.model),
    aspectRatio: toLibTvWorkflowSnapshotString(settings.ratio),
    imageSize: toLibTvWorkflowSnapshotString(
      settings.quality || settings.resolution,
    ),
    videoDuration:
      settings.duration != null
        ? `${toLibTvWorkflowSnapshotNumber(settings.duration, 0)}s`
        : undefined,
    generationCount: Number.isFinite(Number(params.count))
      ? Math.max(1, Math.round(Number(params.count)))
      : undefined,
    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
    referenceImageNodeIds:
      referenceImages.length > 0 && Array.isArray(params.imageList)
        ? params.imageList
            .map((item: any) => String(item?.nodeId || "").trim())
            .filter(Boolean)
        : undefined,
    groupNodeIds: groupNodeIds.length > 0 ? groupNodeIds : undefined,
    groupBackgroundColor:
      typeof node?.style?.background === "string"
        ? node.style.background
        : undefined,
    groupToolbarHidden: Boolean(
      data.groupToolbarHidden || data.hideToolbar || data.guideOnly,
    ),
    note: kind === "text" ? toLibTvWorkflowSnapshotString(data.name) : "",
    workflowGenerationRunning: false,
    workflowGenerationProgress: 1,
    workflowGenerationError: "",
    workflowImageResults:
      kind === "image" && mediaUrls.length > 1
        ? mediaUrls.slice(0, 8).map((url, index) => ({
            url,
            title: `${toLibTvWorkflowSnapshotString(data.name) || "图片"} ${index + 1}`,
          }))
        : undefined,
    workflowImageResultsCollapsed:
      kind === "image" && mediaUrls.length > 1 ? true : undefined,
    workflowVideoResults:
      kind === "video" && mediaUrls.length > 1
        ? mediaUrls.slice(0, 8).map((url, index) => ({
            url,
            title: `${toLibTvWorkflowSnapshotString(data.name) || "视频"} ${index + 1}`,
          }))
        : undefined,
    workflowVideoResultsCollapsed:
      kind === "video" && mediaUrls.length > 1 ? true : undefined,
    suppressGenerationBar: true,
  } as Partial<LibTvWorkflowNodeData>;
}

export function normalizeLibTvWorkflowSnapshotData(
  input: unknown,
): LibTvWorkflowState {
  const raw =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const nodes = rawNodes.map((node: any, index) => {
    const kind = toLibTvWorkflowSnapshotKind(
      node?.type ||
        node?.data?.type ||
        node?.data?.action ||
        node?.data?.generatorType,
    );
    const position =
      node?.position && typeof node.position === "object" ? node.position : {};
    const width = Number.isFinite(Number(node?.width))
      ? Number(node.width)
      : undefined;
    const height = Number.isFinite(Number(node?.height))
      ? Number(node.height)
      : undefined;
    const normalizedNode: LibTvWorkflowNode = {
      id: toLibTvWorkflowSnapshotString(node?.id) || uuidv4(),
      kind,
      x: Number.isFinite(Number(position?.x))
        ? Number(position.x)
        : 120 + index * 24,
      y: Number.isFinite(Number(position?.y))
        ? Number(position.y)
        : 120 + index * 24,
      width: Number.isFinite(Number(width))
        ? Number(width)
        : getDefaultNodeFrame(kind).width,
      height: Number.isFinite(Number(height))
        ? Number(height)
        : getDefaultNodeFrame(kind).height,
      parentId: toLibTvWorkflowSnapshotString(node?.parentId) || undefined,
      locked: Boolean(node?.locked),
      data: {
        title:
          toLibTvWorkflowSnapshotString(node?.data?.name) ||
          getDefaultTitle(kind),
        content: toLibTvWorkflowSnapshotContent(node?.data?.content),
        componentType: undefined,
        mediaUrl: "",
        mediaRole: undefined,
        prompt: "",
        modelId: undefined,
        aspectRatio: undefined,
        imageSize: undefined,
        videoDuration: undefined,
        referenceImages: [],
        referenceImageNodeIds: [],
        groupNodeIds: [],
        note: "",
        suppressGenerationBar: false,
      },
    };
    const nextData = toLibTvWorkflowSnapshotNodeData(node, kind);
    normalizedNode.data = {
      ...normalizedNode.data,
      ...nextData,
    };
    return normalizedNode;
  });
  const edges = rawEdges
    .map((edge: any, index) => {
      const source = toLibTvWorkflowSnapshotString(edge?.source);
      const target = toLibTvWorkflowSnapshotString(edge?.target);
      return {
        id: toLibTvWorkflowSnapshotString(edge?.id) || `edge-${index + 1}`,
        source,
        target,
      } as LibTvWorkflowEdge;
    })
    .filter((edge) => edge.source && edge.target);
  return normalizeLibTvWorkflowState({
    enabled: true,
    nodes,
    edges,
    activeNodeId: nodes[0]?.id || null,
    lastRun: null,
  });
}

export function getLibTvWorkflowBounds(
  workflow: Pick<LibTvWorkflowState, "nodes">,
) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  if (nodes.length === 0) return null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const absolutePositionById = new Map<string, { x: number; y: number }>();
  const getAbsolutePosition = (
    node: LibTvWorkflowNode,
  ): { x: number; y: number } => {
    const cached = absolutePositionById.get(node.id);
    if (cached) return cached;
    const chain: LibTvWorkflowNode[] = [];
    const seen = new Set<string>();
    let cursor: LibTvWorkflowNode | undefined = node;
    let base = { x: 0, y: 0 };
    while (cursor && !seen.has(cursor.id)) {
      const known = absolutePositionById.get(cursor.id);
      if (known) {
        base = known;
        break;
      }
      seen.add(cursor.id);
      chain.push(cursor);
      cursor = cursor.parentId ? nodeById.get(cursor.parentId) : undefined;
    }
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      const item = chain[index];
      base = {
        x: base.x + Number(item.x || 0),
        y: base.y + Number(item.y || 0),
      };
      absolutePositionById.set(item.id, base);
    }
    return (
      absolutePositionById.get(node.id) || {
        x: Number(node.x || 0),
        y: Number(node.y || 0),
      }
    );
  };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const position = getAbsolutePosition(node);
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x + Number(node.width || 0));
    maxY = Math.max(maxY, position.y + Number(node.height || 0));
  }
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  )
    return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: minX + (maxX - minX) / 2,
    centerY: minY + (maxY - minY) / 2,
  };
}

export function translateLibTvWorkflowState(
  workflow: LibTvWorkflowState,
  deltaX: number,
  deltaY: number,
): LibTvWorkflowState {
  const nextDeltaX = Number.isFinite(Number(deltaX)) ? Number(deltaX) : 0;
  const nextDeltaY = Number.isFinite(Number(deltaY)) ? Number(deltaY) : 0;
  if (nextDeltaX === 0 && nextDeltaY === 0) return workflow;
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => ({
      ...node,
      x: node.parentId ? Number(node.x || 0) : Number(node.x || 0) + nextDeltaX,
      y: node.parentId ? Number(node.y || 0) : Number(node.y || 0) + nextDeltaY,
    })),
  };
}

export function isLibTvWorkflowNodeKind(
  value: unknown,
): value is LibTvWorkflowNodeKind {
  return (
    value === "text" ||
    value === "image" ||
    value === "video" ||
    value === "audio" ||
    value === "script" ||
    value === "script-v2" ||
    value === "playlist" ||
    value === "threed" ||
    value === "director-console-3d" ||
    value === "group"
  );
}

export function hasRecoverableWorkflowVideoGenerationTask(
  node: Pick<LibTvWorkflowNode, "kind" | "data"> | null | undefined,
): boolean {
  if (!node || node.kind !== "video") return false;
  const hasMedia = Boolean(String(node.data?.mediaUrl || "").trim());
  const controller = String(
    node.data?.workflowGenerationController || "",
  ).trim();
  const taskType = String(node.data?.workflowGenerationTaskType || "").trim();
  const statusUrl = String(node.data?.workflowGenerationStatusUrl || "").trim();
  const backgroundTaskId = String(
    node.data?.workflowGenerationBackgroundTaskId || "",
  ).trim();
  if (controller === "codex" && !taskType && !statusUrl && !backgroundTaskId)
    return false;
  const generationError = String(
    node.data?.workflowGenerationError || "",
  ).trim();
  const isLegacyClientPollTimeout =
    /视频任务未返回结果|供应商仍在生成|刷新后.*继续查询/.test(generationError);
  const isTransientClientError =
    /failed to fetch|fetch failed|network|网络|连接|timeout|超时/i.test(
      generationError,
    );
  if (hasMedia && !generationError) return false;
  if (
    !node.data?.workflowGenerationRunning &&
    generationError &&
    !isLegacyClientPollTimeout &&
    !isTransientClientError
  )
    return false;
  if (node.data?.workflowGenerationRunning) return true;
  if (
    Array.isArray(node.data?.workflowGenerationTaskIds) &&
    node.data.workflowGenerationTaskIds.some((id) => String(id || "").trim())
  )
    return true;
  if (String(node.data?.workflowGenerationTaskId || "").trim()) return true;
  if (statusUrl) return true;
  if (backgroundTaskId) return true;
  return false;
}

function isLibTvWorkflowRunStatus(
  value: unknown,
): value is LibTvWorkflowRunResult["status"] {
  return (
    value === "idle" ||
    value === "running" ||
    value === "success" ||
    value === "failed"
  );
}

export function findLibTvWorkflowSourceNodes(state: LibTvWorkflowState) {
  const targetIds = new Set(state.edges.map((edge) => edge.target));
  return state.nodes.filter((node) => !targetIds.has(node.id));
}

export function findLibTvWorkflowSinkNodes(state: LibTvWorkflowState) {
  const sourceIds = new Set(state.edges.map((edge) => edge.source));
  return state.nodes.filter((node) => !sourceIds.has(node.id));
}

export function getLibTvWorkflowNodeById(
  state: LibTvWorkflowState,
  nodeId: string | null | undefined,
) {
  if (!nodeId) return null;
  return state.nodes.find((node) => node.id === nodeId) || null;
}
