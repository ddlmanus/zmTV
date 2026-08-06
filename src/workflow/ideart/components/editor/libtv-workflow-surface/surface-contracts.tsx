"use client";

import React from "react";
import {
  type ReactFlowInstance,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";
import type {
  LibTvDirectorConsole3DCapture,
  LibTvWorkflowNode,
} from "@/workflow/ideart/lib/libtv/workflow";
import { type LibTvVideoNodeLodMode } from "@/workflow/ideart/lib/libtv/video-node-lod";
import { type AngleEditControls } from "@/workflow/ideart/components/editor/angle-edit-utils";
import {
  type GeminiAspectRatioKey,
  type GeminiImageSizeKey,
} from "@/workflow/ideart/lib/models/gemini-image-config";
import { type WorkflowExtraParameterValue } from "./workflow-extra-parameters";
import { type LibTvDirectorConsole3DVideoExport } from "./nodes/director-console-3d";
import {
  type ScriptV2CanvasImageAsset,
  type ScriptV2WorkspaceStep,
} from "./nodes/script-v2-workspace";
import type {
  ScriptInputCreationType,
  ScriptV2AssetImportRequest,
  WorkflowCableTone,
  WorkflowEdge,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";

export type WorkflowCropDragMode =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "nw"
  | "ne"
  | "sw"
  | "se";

export type WorkflowCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorkflowCropDragState = {
  mode: WorkflowCropDragMode;
  startX: number;
  startY: number;
  startRect: WorkflowCropRect;
};

export type WorkflowRedrawTool = "brush" | "rect" | "eraser";

export type WorkflowRedrawMode = "redraw" | "erase";

export type WorkflowRedrawPoint = {
  x: number;
  y: number;
};

export type WorkflowRedrawBrushOperation = {
  id: string;
  tool: "brush" | "eraser";
  size: number;
  points: WorkflowRedrawPoint[];
};

export type WorkflowRedrawRectOperation = {
  id: string;
  tool: "rect";
  start: WorkflowRedrawPoint;
  rect: WorkflowCropRect;
};

export type WorkflowRedrawOperation =
  | WorkflowRedrawBrushOperation
  | WorkflowRedrawRectOperation;

export type WorkflowRedrawMenu =
  | "model"
  | "aspect"
  | "size"
  | "quality"
  | "count"
  | "advanced"
  | null;

export type WorkflowRedrawChoice = {
  value: string;
  label: string;
  config?: Record<string, any>;
  isDefault?: boolean;
};

export type WorkflowRedrawSubmitRequest = {
  mode: WorkflowRedrawMode;
  prompt: string;
  operations: WorkflowRedrawOperation[];
  displaySize: { width: number; height: number };
  modelId: string;
  workflowEndpointMethod?: string;
  referenceImages?: string[];
  aspectRatio?: string;
  size?: string;
  count?: number;
  enableWebSearch?: boolean;
  workflowExtraParameters?: Record<string, WorkflowExtraParameterValue>;
};

export type WorkflowAnnotationTool = "brush" | "rect" | "eraser" | "text";

export type WorkflowAnnotationPoint = {
  x: number;
  y: number;
};

export type WorkflowAnnotationBrushItem = {
  id: string;
  tool: "brush" | "eraser";
  color: string;
  strokeWidth: number;
  points: WorkflowAnnotationPoint[];
};

export type WorkflowAnnotationRectItem = {
  id: string;
  tool: "rect";
  color: string;
  strokeWidth: number;
  rect: WorkflowCropRect;
};

export type WorkflowAnnotationTextItem = {
  id: string;
  tool: "text";
  color: string;
  strokeWidth: number;
  point: WorkflowAnnotationPoint;
  text: string;
};

export type WorkflowAnnotationItem =
  | WorkflowAnnotationBrushItem
  | WorkflowAnnotationRectItem
  | WorkflowAnnotationTextItem;

export type WorkflowAnnotationSaveRequest = {
  dataUrl: string;
  prompt: string;
};

export type WorkflowUpscaleImageSizeKey =
  | Exclude<GeminiImageSizeKey, "0.5K">
  | "8K";

export type WorkflowImageUpscaleRequest = {
  imageSize: WorkflowUpscaleImageSizeKey;
  aspectRatio: GeminiAspectRatioKey;
  targetWidth: number;
  targetHeight: number;
  cost: number;
  modelId?: string;
  modelVariant?: string;
  scale?: string;
  targetResolution?: string;
  outputFormat?: string;
};

export type WorkflowImageExpandRequest = {
  scaleMultiplier: number;
  presetKey: string;
  presetLabel: string;
  prompt: string;
  expandFactor: number;
  expandRatioKey: string;
  targetWidth: number;
  targetHeight: number;
  modelId: string;
  workflowEndpointMethod?: string;
  aspectRatio?: string;
  resolution?: string;
  generationCount?: number;
  enableWebSearch?: boolean;
  workflowExtraParameters?: Record<string, WorkflowExtraParameterValue>;
};

export type WorkflowVideoTrimRequest = {
  sourceUrl: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
};

export type WorkflowVideoCropRequest = {
  sourceUrl: string;
  cropX: number;
  cropY: number;
  cropWidth: number;
  cropHeight: number;
  sourceWidth: number;
  sourceHeight: number;
};

export type WorkflowVideoUpscaleRequest = {
  sourceUrl: string;
  modelId: string;
  resolution: "1080P" | "2K" | "4K";
  durationSeconds: number;
};

export type WorkflowStoryboardGenerateRequest = {
  rowIndexes: number[];
  prompt: string;
  modelId?: string;
  workflowEndpointMethod?: string;
  aspectRatio?: string;
  imageSize?: string;
  quality?: string;
  generationCount?: number;
  stylePreset?: string;
  cameraControl?: LibTvWorkflowNode["data"]["cameraControl"];
  workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
  enableWebSearch?: boolean;
  deferGeneration?: boolean;
  codexTaskId?: string;
};

export type WorkflowStoryboardVideoGenerateRequest = {
  modelId?: string;
  aspectRatio?: string;
  videoResolution?: string;
  videoDuration?: string;
  videoMethod?: string;
  generationCount?: number;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
  workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
  rowIndexes?: number[];
  rowDurations?: Record<number, string>;
  deferGeneration?: boolean;
  maxClipDurationSeconds?: number;
  plannedClipCount?: number;
  outputGroupId?: string;
  startClipIndex?: number;
  resumeTailFrameUrl?: string;
  codexTaskId?: string;
};

export type WorkflowGenerationSubmitSettings = Partial<
  Pick<
    LibTvWorkflowNode["data"],
    | "modelId"
    | "workflowEndpointMethod"
    | "aspectRatio"
    | "imageSize"
    | "workflowInternalPrompt"
    | "workflowEmotionAdjustmentSettings"
    | "workflowPortraitTextureSettings"
    | "stylePreset"
    | "selectedOptionId"
    | "videoResolution"
    | "videoDuration"
    | "videoMethod"
    | "videoMethodUserSelected"
    | "generateAudio"
    | "enableWebSearch"
    | "generationCount"
    | "cameraControl"
    | "videoCameraMotion"
    | "videoCharacterAssets"
    | "workflowExtraParameters"
  >
> & {
  scriptV2Stage?: ScriptV2WorkspaceStep;
};

export type WorkflowGenerateNodeResult =
  | boolean
  | void
  | Promise<boolean | void>;

export type WorkflowGenerateNodeHandler = (
  id: string,
  promptDraft?: string,
  settings?: WorkflowGenerationSubmitSettings,
) => WorkflowGenerateNodeResult;

export type WorkflowGenerationSubmitHandler = (
  promptDraft?: string,
  settings?: WorkflowGenerationSubmitSettings,
) => WorkflowGenerateNodeResult;

export type WorkflowEmotionAdjustmentCreateRequest = {
  emotionLabel: string;
  modelId: string;
  workflowEndpointMethod?: string;
  aspectRatio?: string;
  imageSize?: string;
  generationCount?: number;
  workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
};

export type WorkflowAngleEditCreateRequest = {
  controls: AngleEditControls;
  prompt: string;
  modelId?: string;
  workflowEndpointMethod?: string;
  aspectRatio?: string;
  imageSize?: string;
  workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
};

export type WorkflowImageGridSplitRequest = {
  rows: number;
  columns: number;
};

export type WorkflowFocusPickOverlay = {
  nodeId: string;
  startRelX: number;
  startRelY: number;
  endRelX: number;
  endRelY: number;
  status: "selecting" | "uploading" | "done";
};

export type WorkflowOverlayNodeData = {
  interactive: boolean;
  workflowNode: LibTvWorkflowNode;
  videoLodMode?: LibTvVideoNodeLodMode;
  childNodes?: LibTvWorkflowNode[];
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
  canvasImageAssets?: ScriptV2CanvasImageAsset[];
  storyboardVideoGroups?: WorkflowStoryboardVideoGroupSummary[];
  isDragging?: boolean;
  isViewportMoving?: boolean;
  nodeEventsSuppressed?: boolean;
  isSelected?: boolean;
  suppressFloatingControls?: boolean;
  focusPickActive?: boolean;
  focusPickOverlay?: WorkflowFocusPickOverlay | null;
  hasIncomingEdge: boolean;
  hasOutgoingEdge: boolean;
  hasIncomingTextEdge: boolean;
  hasOutgoingTextEdge: boolean;
  connectionNodeById?: ReadonlyMap<string, LibTvWorkflowNode>;
  connectionEdgePairs?: ReadonlySet<string>;
  connectionHandlesDisabled?: boolean;
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onMoveNode?: (
    id: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  onMoveNodes?: (
    patches: Array<{
      id: string;
      position: Partial<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
      data?: Partial<LibTvWorkflowNode["data"]>;
    }>,
  ) => void;
  onCreateScriptInputNode?: (
    id: string,
    type: ScriptInputCreationType,
    initialContent?: string,
  ) => void;
  onAddLinkedNode?: (
    id: string,
    kind: LibTvWorkflowNode["kind"],
    side: "left" | "right",
    position?: { x: number; y: number },
  ) => void;
  onImportScriptV2Assets?: (
    sourceId: string,
    request: ScriptV2AssetImportRequest,
  ) => void;
  onRunTextGeneratorPreset?: (id: string, optionId: string) => void;
  onRunVideoGeneratorPreset?: (id: string, optionId: string) => void;
  onRunImageToolbarPreset?: (id: string, presetId: string) => void;
  onCreateAngleEditNode?: (
    id: string,
    request: WorkflowAngleEditCreateRequest,
  ) => void;
  onCreatePortraitTexturePreset?: (id: string) => void;
  onCreateEmotionAdjustmentPreset?: (
    id: string,
    request: WorkflowEmotionAdjustmentCreateRequest,
  ) => void;
  onDeleteNode?: (id: string) => void;
  onReferenceFilesUploaded?: (id: string, files: File[]) => void;
  onCreateImageUpscalePreset?: (id: string) => void;
  onImageUpscalePresetFilesUploaded?: (id: string, files: File[]) => void;
  onReferenceNodeRemoved?: (id: string, sourceId: string) => void;
  onStartFocusPick?: (id: string) => void;
  onCompleteFocusPick?: (
    sourceId: string,
    rect: WorkflowCropRect,
    displaySize: { width: number; height: number },
  ) => void;
  onMediaFileReplace?: (id: string, file: File) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
  onOpenThreeDWorld?: (id: string) => void;
  onOpenDirectorConsole3D?: (id: string) => void;
  onCreateDirectorConsoleCaptureNode?: (
    id: string,
    capture: LibTvDirectorConsole3DCapture,
    options?: { batchIndex?: number; batchTotal?: number },
  ) => Promise<void> | void;
  onCreateDirectorConsoleVideoNode?: (
    id: string,
    exported: LibTvDirectorConsole3DVideoExport,
  ) => Promise<void> | void;
  onGenerateStoryboard?: (
    id: string,
    request: WorkflowStoryboardGenerateRequest,
  ) => void;
  onRegenerateStoryboardImages?: (id: string) => void;
  onGenerateStoryboardVideos?: (
    id: string,
    request: WorkflowStoryboardVideoGenerateRequest,
  ) => void;
  onConvertGroupToStoryboard?: (id: string) => void;
  onRunGroup?: (id: string) => void;
  onDisconnectEdge?: (edgeId: string) => void;
  onRequestGenerationFrame?: (id: string, aspectRatio: string) => void;
  onRequestImageResultFrame?: (id: string, imageUrl: string) => void;
  onUngroupNode?: (id: string) => void;
  onDownloadNode?: (id: string) => void;
  onSaveNodeToMaterials?: (id: string) => void;
  onReportNodeIssue?: (id: string) => void;
  onCreateAnnotatedImageNode?: (
    id: string,
    dataUrl: string,
    prompt: string,
  ) => void;
  onRemoveBackgroundNode?: (id: string) => void;
  onSplitImageNode?: (
    id: string,
    request: WorkflowImageGridSplitRequest,
  ) => void;
  onRotateImageNode?: (id: string) => void;
  onExpandImageNode?: (id: string, request: WorkflowImageExpandRequest) => void;
  onUpscaleImageNode?: (
    id: string,
    request: WorkflowImageUpscaleRequest,
  ) => void;
  onSubmitImageUpscaleNode?: (
    id: string,
    request: WorkflowImageUpscaleRequest,
  ) => void;
  onTrimVideoNode?: (id: string, request: WorkflowVideoTrimRequest) => void;
  onCropVideoNode?: (id: string, request: WorkflowVideoCropRequest) => void;
  onCreateVideoUpscaleNode?: (id: string) => void;
  onSubmitVideoUpscaleNode?: (
    id: string,
    request: WorkflowVideoUpscaleRequest,
  ) => void;
  onAnalyzeVideoNode?: (id: string) => void;
  onSeparateVideoAudioNode?: (
    id: string,
    mode: "audio-video" | "voice" | "background",
  ) => void;
  onRemoveVideoSubtitlesNode?: (id: string) => void;
  projectId?: string;
};

export type LibTvWorkflowSurfaceProps = {
  nodes: LibTvWorkflowNode[];
  edges: WorkflowEdge[];
  selectedIds: string[];
  zoom?: number;
  stagePos?: { x: number; y: number };
  tool: string;
  isDragging: boolean;
  standalone?: boolean;
  readOnly?: boolean;
  edgesVisible?: boolean;
  snapToGrid?: boolean;
  onSelectNode: (id: string) => void;
  onMoveNode: (
    id: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  onMoveNodes?: (
    patches: Array<{
      id: string;
      position: Partial<{
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
      data?: Partial<LibTvWorkflowNode["data"]>;
    }>,
  ) => void;
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onCreateScriptInputNode?: (
    id: string,
    type: ScriptInputCreationType,
    initialContent?: string,
  ) => void;
  onAddLinkedNode?: (
    sourceId: string,
    kind: LibTvWorkflowNode["kind"],
    side: "left" | "right",
    position?: { x: number; y: number },
  ) => void;
  onImportScriptV2Assets?: (
    sourceId: string,
    request: ScriptV2AssetImportRequest,
  ) => void;
  onRunTextGeneratorPreset?: (sourceId: string, optionId: string) => void;
  onRunVideoGeneratorPreset?: (sourceId: string, optionId: string) => void;
  onRunImageToolbarPreset?: (sourceId: string, presetId: string) => void;
  onCreateAngleEditNode?: (
    sourceId: string,
    request: WorkflowAngleEditCreateRequest,
  ) => void;
  onCreatePortraitTexturePreset?: (sourceId: string) => void;
  onCreateEmotionAdjustmentPreset?: (
    sourceId: string,
    request: WorkflowEmotionAdjustmentCreateRequest,
  ) => void;
  onReferenceFilesUploaded?: (id: string, files: File[]) => void;
  onCreateImageUpscalePreset?: (id: string) => void;
  onImageUpscalePresetFilesUploaded?: (id: string, files: File[]) => void;
  onReferenceNodeRemoved?: (id: string, sourceId: string) => void;
  onStartFocusPick?: (id: string) => void;
  onMediaFileReplace?: (id: string, file: File) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
  onOpenThreeDWorld?: (id: string) => void;
  onOpenDirectorConsole3D?: (id: string) => void;
  onCreateDirectorConsoleCaptureNode?: (
    id: string,
    capture: LibTvDirectorConsole3DCapture,
    options?: { batchIndex?: number; batchTotal?: number },
  ) => Promise<void> | void;
  onCreateDirectorConsoleVideoNode?: (
    id: string,
    exported: LibTvDirectorConsole3DVideoExport,
  ) => Promise<void> | void;
  onGenerateStoryboard?: (
    id: string,
    request: WorkflowStoryboardGenerateRequest,
  ) => void;
  onRegenerateStoryboardImages?: (id: string) => void;
  onGenerateStoryboardVideos?: (
    id: string,
    request: WorkflowStoryboardVideoGenerateRequest,
  ) => void;
  onConvertGroupToStoryboard?: (id: string) => void;
  onRunGroup?: (id: string) => void;
  onConnectNodes?: (sourceId: string, targetId: string) => void;
  onDisconnectEdge?: (edgeId: string) => void;
  onSaveNodeToMaterials?: (id: string) => void;
  onDownloadNode?: (id: string) => void;
  onCopyNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;
  onDeleteNode?: (id: string) => void;
  onCopyNodeMedia?: (id: string) => void;
  onSendNodeToChat?: (id: string) => void;
  onCopyNodeToClipboard?: (id: string) => void;
  onCreateSubjectFromNode?: (id: string) => void;
  onRunSeedanceComplianceCheck?: (id: string) => void;
  onEnterPanoramaPreview?: (id: string) => void;
  onOptimizeWorkflowLayout?: (id: string) => void;
  onCopyNodeTaskId?: (id: string) => void;
  onVerifyGenerationResult?: (id: string) => void;
  onReportNodeIssue?: (id: string) => void;
  onCreatePlaylistFromSelection?: (ids: string[]) => void;
  onCreateNodeFromSelection?: (
    kind: LibTvWorkflowNode["kind"],
    ids: string[],
  ) => void;
  onCreateAnnotatedImageNode?: (
    id: string,
    dataUrl: string,
    prompt: string,
  ) => void;
  onRemoveBackgroundNode?: (id: string) => void;
  onSplitImageNode?: (
    id: string,
    request: WorkflowImageGridSplitRequest,
  ) => void;
  onRotateImageNode?: (id: string) => void;
  onExpandImageNode?: (id: string, request: WorkflowImageExpandRequest) => void;
  onUpscaleImageNode?: (
    id: string,
    request: WorkflowImageUpscaleRequest,
  ) => void;
  onSubmitImageUpscaleNode?: (
    id: string,
    request: WorkflowImageUpscaleRequest,
  ) => void;
  onTrimVideoNode?: (id: string, request: WorkflowVideoTrimRequest) => void;
  onCropVideoNode?: (id: string, request: WorkflowVideoCropRequest) => void;
  onCreateVideoUpscaleNode?: (id: string) => void;
  onSubmitVideoUpscaleNode?: (
    id: string,
    request: WorkflowVideoUpscaleRequest,
  ) => void;
  onAnalyzeVideoNode?: (id: string) => void;
  onSeparateVideoAudioNode?: (
    id: string,
    mode: "audio-video" | "voice" | "background",
  ) => void;
  onRemoveVideoSubtitlesNode?: (id: string) => void;
  onPaneUpload?: () => void;
  onPaneAddAsset?: () => void;
  onPaneAddNode?: (
    kind: LibTvWorkflowNode["kind"],
    position: { x: number; y: number },
  ) => void;
  onPaneUndo?: () => void;
  onPaneRedo?: () => void;
  onPanePaste?: (position: { x: number; y: number }) => void;
  onPaneFilesDrop?: (files: File[], position: { x: number; y: number }) => void;
  onSelectionChange?: (ids: string[]) => void;
  onGroupNodes?: (
    ids: string[],
    options?: { backgroundColor?: string; mode?: "normal" | "storyboard" },
  ) => void;
  onUngroupNode?: (id: string) => void;
  onInit?: (
    instance: ReactFlowInstance<Node<WorkflowOverlayNodeData>, Edge>,
  ) => void;
  onViewportChange?: (viewport: Viewport) => void;
  onPaneClick?: (event: React.MouseEvent<Element>) => void;
  onPaneDoubleClick?: (event: React.MouseEvent<Element>) => void;
  projectId?: string;
};

export const INVISIBLE_HANDLE_STYLE: React.CSSProperties = {
  width: 0,
  height: 0,
  minWidth: 0,
  minHeight: 0,
  padding: 0,
  border: 0,
  background: "transparent",
  borderRadius: 0,
  overflow: "visible",
  pointerEvents: "auto",
  zIndex: 20,
  top: "50%",
};

export const WORKFLOW_HANDLE_HIT_AREA_STYLE: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  width: 80,
  height: 80,
  borderRadius: "9999px",
  pointerEvents: "auto",
  transform: "translateY(-50%)",
};

export const CANVAS_CONTROLS_MENU_PANEL_STYLE: React.CSSProperties = {
  border: "0.5px solid var(--canvas-controls-border, #363636)",
  background: "var(--canvas-controls-bg, #262626)",
  boxShadow: "rgba(0, 0, 0, 0.08) 0px 4px 10px 0px",
  backdropFilter: "blur(16px)",
  color: "var(--canvas-controls-text, #fff)",
};

export const WORKFLOW_SOURCE_HANDLE_RIGHT = "source-right";

export const WORKFLOW_SOURCE_HANDLE_ASSET_UNDER = "source-asset-under";

export const WORKFLOW_TARGET_HANDLE_LEFT = "target-left";

export const WORKFLOW_SNAP_GRID: [number, number] = [16, 16];

export const WORKFLOW_PAN_MOUSE_BUTTONS: [number] = [1];

export const EMPTY_WORKFLOW_EDGES: Edge[] = [];

export function isScriptV2AssetImageNode(node: LibTvWorkflowNode | undefined) {
  return (
    node?.kind === "image" &&
    Boolean(String((node.data as any)?.workflowScriptV2AssetKind || "").trim())
  );
}

export const TAPNOW_NODE_MIN_SIZE = 250;

export const WORKFLOW_ORDINARY_MEDIA_SHORT_SIDE = 350;

export const WORKFLOW_ORDINARY_MEDIA_MAX_LONG_SIDE = 5600;

export const WORKFLOW_CABLE_COLORS: Record<WorkflowCableTone, string> = {
  neutral: "var(--workflow-cable-neutral, #8f9ba8)",
  text: "var(--workflow-cable-text, #aa91e8)",
  image: "var(--workflow-cable-image, #6da5e8)",
  video: "var(--workflow-cable-video, #63bd91)",
  audio: "var(--workflow-cable-audio, #d9ad5d)",
  spatial: "var(--workflow-cable-spatial, #6fb8c4)",
};

export const WORKFLOW_CABLE_BASE_WIDTH = 2;

export const WORKFLOW_CABLE_HIT_WIDTH = 20;

export const WORKFLOW_CABLE_PATH_SAMPLE_COUNT = 80;

export const TAPNOW_NODE_PANEL_BACKGROUND =
  "var(--Surface-secondary-background, #262626)";

export const WORKFLOW_NODE_CLOSE_MENUS_EVENT =
  "ideart.workflow-node-close-menus";

export const WORKFLOW_MULTI_SELECTION_CONNECTION_EVENT =
  "ideart.workflow-multi-selection-connection";

export const WORKFLOW_SELECTION_BUTTON_HOVER_CONIC =
  "conic-gradient(rgb(93, 93, 93) 0deg, rgba(106, 106, 106, 0.1) 70deg, rgb(144, 144, 144) 180deg, rgba(144, 144, 144, 0.1) 290deg, rgb(93, 93, 93) 360deg)";

export const WORKFLOW_SELECTION_BUTTON_HOVER_RADIAL =
  "radial-gradient(200% 140% at 50% 40.25%, rgb(26, 26, 26) 16%, rgb(101, 103, 102) 85%)";

export const WORKFLOW_GROUP_DEFAULT_BACKGROUND = "rgba(255,255,255,0.06)";

export const WORKFLOW_GROUP_DEFAULT_SWATCH = "#D9D9D9";

export const WORKFLOW_GROUP_COLORS = [
  "transparent",
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#30D5C8",
  "#007AFF",
  "#5856D6",
  "#FF2D95",
  "#8E8E93",
];

export const WORKFLOW_VIDEO_UPSCALE_NODE_FRAME = { width: 350, height: 350 };

export const WORKFLOW_TEXT_NODE_DEFAULT_FRAME = { width: 350, height: 200 };

export const WORKFLOW_TEXT_NODE_MIN_FRAME = { width: 240, height: 160 };

export const WORKFLOW_GROUP_COLOR_OPTIONS = WORKFLOW_GROUP_COLORS;

export const WORKFLOW_VIEWPORT_LIVE_EVENT = "ideart:workflow-viewport-live";

export type BatchStoryboardVideoItem = {
  id: string;
  rowIndex: number;
  label: string;
  prompt: string;
  duration: string;
};

export type WorkflowStoryboardVideoGroupSummary = {
  id: string;
  title: string;
  items: BatchStoryboardVideoItem[];
  modelId?: string;
  aspectRatio?: string;
  videoResolution?: string;
  videoDuration?: string;
  videoMethod?: string;
  generationCount?: number;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
  workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
};

export type OrdinaryImageToolbarAction =
  | "portrait-texture"
  | "emotion-texture"
  | "panorama"
  | "crop"
  | "clip"
  | "rotate"
  | "rotate-image"
  | "edit"
  | "clean"
  | "expand"
  | "erase"
  | "annotate"
  | "enhance"
  | "resize"
  | "remove-bg"
  | "vocal-separate"
  | "separate-av"
  | "grid-split"
  | "split-2"
  | "split-3"
  | "split-4"
  | "split-5"
  | "seedance-check"
  | "save"
  | "download"
  | "fullscreen"
  | "replace"
  | "report";

export type ScriptTryPromptType = "story" | "video" | "character";
