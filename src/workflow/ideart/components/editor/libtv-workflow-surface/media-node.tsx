"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useReactFlow,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";
import { Check, ImageIcon } from "lucide-react";
import type {
  LibTvWorkflowImageResult,
  LibTvWorkflowNode,
  LibTvWorkflowVideoResult,
} from "@/workflow/ideart/lib/libtv/workflow";
import { hasRecoverableWorkflowVideoGenerationTask } from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_VIDEO_GENERATOR_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import {
  WorkflowImageGenerationPlaceholder,
  WorkflowVideoGenerationPlaceholder,
} from "./nodes/workflow-node-placeholders";
import {
  WorkflowMediaUploadOverlay,
  type WorkflowMediaUploadOverlayStatus,
} from "./nodes/workflow-media-upload-overlay";
import {
  TAPNOW_NODE_ICON_META,
  TapNowNodeIcon,
} from "./nodes/workflow-node-icons";
import { stopWorkflowNodeChromeEvent } from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  isWorkflowStoryboardImageGeneratorNode,
  isWorkflowVideoGeneratorNode,
} from "./workflow-node-kinds";
import {
  getWorkflowImageFitMode,
  normalizeWorkflowImageGenerationDisplayLabel,
  parseWorkflowAspectRatioSize,
  parseWorkflowDurationSeconds,
  resolveWorkflowEstimatedImageGenerationProgress,
  runWorkflowRedrawGeneration,
  workflowOrdinaryImageDisplayFrameFromRatio,
} from "./workflow-media-utils";
import { getWorkflowSurfaceSeedanceAssetUrl } from "./workflow-models";
import {
  TAPNOW_NODE_MIN_SIZE,
  TAPNOW_NODE_PANEL_BACKGROUND,
} from "./surface-contracts";
import {
  OrdinaryVideoPlayer,
  PanoramaEntryIcon,
  TapNowNodeBody,
  WorkflowEmotionAdjustPanel,
  WorkflowEmotionFacePickOverlay,
  WorkflowEmotionPickToolbar,
  WorkflowFocusPickNodeOverlay,
  WorkflowImageGeneratorResultStrip,
  WorkflowInlinePanoramaPreview,
  WorkflowMediaFullscreenPreview,
  WorkflowResourceReuploadIcon,
  ZMTV_NODE_SURFACE_BACKGROUND,
  ZMTV_NODE_SURFACE_BORDER,
  ZMTV_NODE_SURFACE_SELECTED_SHADOW,
  ZMTV_NODE_SURFACE_SHADOW,
  getWorkflowEmotionLabel,
} from "./node-shared-ui";
import {
  WORKFLOW_NODE_TITLE_BAR_CLASS,
  WORKFLOW_NODE_TITLE_BAR_STYLE,
  getWorkflowNodeTitleWidth,
} from "./workflow-connections";
import { OrdinaryImageToolbar } from "./image-toolbar";
import { WorkflowAngleEditPanel } from "./image-angle";
import { WorkflowRelightPanel } from "./image-relight";
import { WorkflowImageRedrawOverlay } from "./image-redraw";
import { WorkflowImageAnnotationOverlay } from "./image-annotation";
import { WorkflowImageResizePanel } from "./image-resize";
import {
  WorkflowImageExpandPanel,
  WorkflowImageUpscaleGenerationBar,
  WorkflowImageUpscalePanel,
  WorkflowVideoUpscalePanel,
} from "./image-expand-upscale";
import { WorkflowVideoGeneratorResultStrip } from "./text-node";
import { WorkflowImageCropOverlay } from "./image-crop";
import {
  WorkflowVideoCropOverlay,
  WorkflowVideoTrimOverlay,
} from "./video-editing";
import { NodeGenerationBar } from "./generation-composer";
import type { WorkflowUpstreamNodeSummary } from "./workflow-models";
import type {
  OrdinaryImageToolbarAction,
  WorkflowAngleEditCreateRequest,
  WorkflowCropRect,
  WorkflowEmotionAdjustmentCreateRequest,
  WorkflowFocusPickOverlay,
  WorkflowGenerateNodeHandler,
  WorkflowImageExpandRequest,
  WorkflowImageGridSplitRequest,
  WorkflowImageUpscaleRequest,
  WorkflowOverlayNodeData,
  WorkflowRedrawMode,
  WorkflowRedrawSubmitRequest,
  WorkflowVideoCropRequest,
  WorkflowVideoTrimRequest,
  WorkflowVideoUpscaleRequest,
} from "./surface-contracts";
import type {
  WorkflowEmotionAdjustMode,
  WorkflowEmotionPoint,
} from "./node-shared-ui";

export function TapNowMediaNode({
  node,
  selected,
  showFloatingControls,
  dragging,
  upstreamNodes,
  focusPickActive,
  focusPickOverlay,
  onUpdateNode,
  onReferenceFilesUploaded,
  onCreateImageUpscalePreset,
  onRunVideoGeneratorPreset,
  onRunImageToolbarPreset,
  onCreateAngleEditNode,
  onCreatePortraitTexturePreset,
  onCreateEmotionAdjustmentPreset,
  onReferenceNodeRemoved,
  onStartFocusPick,
  onCompleteFocusPick,
  onMediaFileReplace,
  onMoveNode,
  onGenerateNode,
  onRequestGenerationFrame,
  onRequestImageResultFrame,
  onDownloadNode,
  onSaveNodeToMaterials,
  onReportNodeIssue,
  onCreateAnnotatedImageNode,
  onRemoveBackgroundNode,
  onSplitImageNode,
  onRotateImageNode,
  onExpandImageNode,
  onUpscaleImageNode,
  onSubmitImageUpscaleNode,
  onTrimVideoNode,
  onCropVideoNode,
  onCreateVideoUpscaleNode,
  onSubmitVideoUpscaleNode,
  onAnalyzeVideoNode,
  onSeparateVideoAudioNode,
  onRemoveVideoSubtitlesNode,
  projectId,
}: {
  node: LibTvWorkflowNode;
  selected: boolean;
  showFloatingControls: boolean;
  dragging: boolean;
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
  focusPickActive?: boolean;
  focusPickOverlay?: WorkflowFocusPickOverlay | null;
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onReferenceFilesUploaded?: (id: string, files: File[]) => void;
  onCreateImageUpscalePreset?: (id: string) => void;
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
  onReferenceNodeRemoved?: (id: string, sourceId: string) => void;
  onStartFocusPick?: (id: string) => void;
  onCompleteFocusPick?: (
    sourceId: string,
    rect: WorkflowCropRect,
    displaySize: { width: number; height: number },
  ) => void;
  onMediaFileReplace?: (id: string, file: File) => void;
  onMoveNode?: (
    id: string,
    position: Partial<{ x: number; y: number; width: number; height: number }>,
  ) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
  onRequestGenerationFrame?: (id: string, aspectRatio: string) => void;
  onRequestImageResultFrame?: (id: string, imageUrl: string) => void;
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
}) {
  const meta = TAPNOW_NODE_ICON_META[node.kind] || TAPNOW_NODE_ICON_META.text;
  const flow = useReactFlow<Node<WorkflowOverlayNodeData>, Edge>();
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const imageGeneratorReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const restoreAngleEditViewportRef = useRef<Viewport | null>(null);
  const restoreRelightViewportRef = useRef<Viewport | null>(null);
  const restoreRedrawViewportRef = useRef<Viewport | null>(null);
  const [title, setTitle] = useState(String(node.data?.title || meta.label));
  const [cropOpen, setCropOpen] = useState(false);
  const [angleEditOpen, setAngleEditOpen] = useState(false);
  const [relightOpen, setRelightOpen] = useState(false);
  const [redrawOpen, setRedrawOpen] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [expandOpen, setExpandOpen] = useState(false);
  const [upscaleOpen, setUpscaleOpen] = useState(false);
  const [videoTrimOpen, setVideoTrimOpen] = useState(false);
  const [videoCropOpen, setVideoCropOpen] = useState(false);
  const [redrawMode, setRedrawMode] = useState<WorkflowRedrawMode>("redraw");
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [mediaPreviewOpen, setMediaPreviewOpen] = useState(false);
  const [emotionAdjustMode, setEmotionAdjustMode] =
    useState<WorkflowEmotionAdjustMode | null>(null);
  const [emotionPoint, setEmotionPoint] = useState<WorkflowEmotionPoint>({
    x: 50,
    y: 50,
  });
  const [generationProgressNow, setGenerationProgressNow] = useState(() =>
    Date.now(),
  );
  const prompt = String(node.data?.prompt || "");
  const mediaUrl = String(node.data?.mediaUrl || "").trim();
  const mediaUploadState = (
    ["uploading", "reviewing", "success", "error"] as const
  ).includes(
    String(
      node.data?.workflowMediaUploadState || "",
    ) as WorkflowMediaUploadOverlayStatus,
  )
    ? (String(
        node.data?.workflowMediaUploadState,
      ) as WorkflowMediaUploadOverlayStatus)
    : undefined;
  const hasEmotionAdjustmentSettings =
    node.kind === "image" &&
    (Boolean(node.data?.workflowEmotionAdjustmentSettings) ||
      (!mediaUrl &&
        /情绪调节/.test(String(node.data?.title || node.data?.note || ""))));
  const isOrdinaryImageNode =
    node.kind === "image" &&
    node.data?.mediaRole !== "generator" &&
    !hasEmotionAdjustmentSettings;
  const isVideoGeneratorNode = isWorkflowVideoGeneratorNode(node);
  const isOrdinaryVideoNode = node.kind === "video" && !isVideoGeneratorNode;
  const isVideoUpscaleNode =
    node.kind === "video" &&
    node.data?.componentType === "video-generator" &&
    String(node.data?.videoMethod || "") === "upscale";
  const isOrdinaryMediaNode = isOrdinaryImageNode || isOrdinaryVideoNode;
  const isImageGeneratorNode =
    node.kind === "image" &&
    (node.data?.mediaRole === "generator" || hasEmotionAdjustmentSettings);
  const isImageGeneratorResultNode = isImageGeneratorNode && Boolean(mediaUrl);
  const isImageResultNode = isOrdinaryImageNode || isImageGeneratorResultNode;
  const isVideoGeneratorResultNode = isVideoGeneratorNode && Boolean(mediaUrl);
  const isVideoResultNode = isOrdinaryVideoNode || isVideoGeneratorResultNode;
  // Ordinary images and videos intentionally share the exact same node-scaled
  // title row. Keeping media labels in one coordinate system prevents video
  // dimensions from drifting away while the canvas is zoomed out.
  const videoHasAudio =
    typeof node.data?.workflowMediaHasAudio === "boolean"
      ? node.data.workflowMediaHasAudio
      : !(
          isOrdinaryVideoNode &&
          node.data?.componentType === "video-asset" &&
          (upstreamNodes?.some((item) => item.kind === "director-console-3d") ||
            /动画导出/.test(String(node.data?.title || "")))
        );
  const isMediaGeneratorNode = isImageGeneratorNode || isVideoGeneratorNode;
  const isImageUpscaleNode =
    isImageGeneratorNode &&
    String(node.data?.selectedOptionId || "") === "image-upscale";
  const panoramaActive =
    isImageResultNode &&
    Boolean(mediaUrl) &&
    Boolean((node.data as any)?.workflowPanoramaActive);
  const panoramaInitialYaw = Number(
    (node.data as any)?.workflowPanoramaYaw || 0,
  );
  const panoramaInitialPitch = Number(
    (node.data as any)?.workflowPanoramaPitch || 0,
  );
  const referenceImages = Array.isArray(node.data?.referenceImages)
    ? node.data.referenceImages
    : [];
  const referenceImageNodeIds = Array.isArray(node.data?.referenceImageNodeIds)
    ? node.data.referenceImageNodeIds
    : [];
  const referenceImageRoles = Array.isArray(node.data?.referenceImageRoles)
    ? node.data.referenceImageRoles
    : [];
  const redrawRunning = Boolean(node.data?.workflowRedrawRunning);
  const generationRunning =
    node.kind === "video"
      ? Boolean(node.data?.workflowGenerationRunning) ||
        hasRecoverableWorkflowVideoGenerationTask(node)
      : Boolean(node.data?.workflowGenerationRunning);
  const rawGenerationProgress = Number(node.data?.workflowGenerationProgress);
  const shouldTickEstimatedImageGenerationProgress =
    node.kind === "image" &&
    generationRunning &&
    Number.isFinite(Number(node.data?.workflowGenerationStartedAt));
  const generationProgress =
    node.kind === "image"
      ? resolveWorkflowEstimatedImageGenerationProgress(
          node.data?.workflowGenerationStartedAt,
          rawGenerationProgress,
          generationProgressNow,
        )
      : Number.isFinite(rawGenerationProgress)
        ? Math.max(0, Math.min(1, rawGenerationProgress))
        : undefined;
  const naturalMediaWidth = Math.max(
    0,
    Math.round(Number(node.data?.workflowMediaNaturalWidth || 0)),
  );
  const naturalMediaHeight = Math.max(
    0,
    Math.round(Number(node.data?.workflowMediaNaturalHeight || 0)),
  );
  const naturalMediaSizeLabel =
    naturalMediaWidth > 0 && naturalMediaHeight > 0
      ? `${naturalMediaWidth} × ${naturalMediaHeight}`
      : "";
  const canEnterPanoramaPreview = useMemo(() => {
    if (!isImageResultNode || !mediaUrl) return false;
    const ratio =
      naturalMediaWidth > 0 && naturalMediaHeight > 0
        ? naturalMediaWidth / naturalMediaHeight
        : (() => {
            const parsed = parseWorkflowAspectRatioSize(
              String(node.data?.aspectRatio || ""),
              0,
              0,
            );
            return parsed.width > 0 && parsed.height > 0
              ? parsed.width / parsed.height
              : 0;
          })();
    return ratio > 0 && Math.abs(ratio - 2) <= 0.04;
  }, [
    isImageResultNode,
    mediaUrl,
    naturalMediaHeight,
    naturalMediaWidth,
    node.data?.aspectRatio,
  ]);
  const workflowImageResults = useMemo<LibTvWorkflowImageResult[]>(() => {
    const rawResults = Array.isArray(node.data?.workflowImageResults)
      ? node.data.workflowImageResults
      : [];
    const normalized = rawResults
      .map((item) => ({
        url: String(item?.url || "").trim(),
        width:
          Number.isFinite(Number(item?.width)) && Number(item?.width) > 0
            ? Math.round(Number(item.width))
            : undefined,
        height:
          Number.isFinite(Number(item?.height)) && Number(item?.height) > 0
            ? Math.round(Number(item.height))
            : undefined,
        title:
          typeof item?.title === "string"
            ? item.title.trim() || undefined
            : undefined,
      }))
      .filter((item) => Boolean(item.url));
    if (mediaUrl && !normalized.some((item) => item.url === mediaUrl)) {
      normalized.unshift({
        url: mediaUrl,
        width: naturalMediaWidth || undefined,
        height: naturalMediaHeight || undefined,
        title,
      });
    }
    return normalized.slice(0, 8);
  }, [
    mediaUrl,
    naturalMediaHeight,
    naturalMediaWidth,
    node.data?.workflowImageResults,
    title,
  ]);
  const hasImageGeneratorResultStrip =
    isImageResultNode && workflowImageResults.length > 1;
  const imageGeneratorResultsCollapsed = Boolean(
    node.data?.workflowImageResultsCollapsed,
  );
  const imageGeneratorResultsExpanded =
    hasImageGeneratorResultStrip && !imageGeneratorResultsCollapsed;
  const workflowVideoResults = useMemo<LibTvWorkflowVideoResult[]>(() => {
    const rawResults = Array.isArray(node.data?.workflowVideoResults)
      ? node.data.workflowVideoResults
      : [];
    const normalized = rawResults
      .map((item) => ({
        url: String(item?.url || "").trim(),
        thumbnailUrl:
          typeof item?.thumbnailUrl === "string"
            ? item.thumbnailUrl.trim() || undefined
            : undefined,
        width:
          Number.isFinite(Number(item?.width)) && Number(item?.width) > 0
            ? Math.round(Number(item.width))
            : undefined,
        height:
          Number.isFinite(Number(item?.height)) && Number(item.height) > 0
            ? Math.round(Number(item.height))
            : undefined,
        duration:
          Number.isFinite(Number(item?.duration)) && Number(item.duration) > 0
            ? Number(item.duration)
            : undefined,
        title:
          typeof item?.title === "string"
            ? item.title.trim() || undefined
            : undefined,
      }))
      .filter((item) => Boolean(item.url));
    if (mediaUrl && !normalized.some((item) => item.url === mediaUrl)) {
      normalized.unshift({
        url: mediaUrl,
        thumbnailUrl: String(node.data?.thumbnailUrl || "").trim() || undefined,
        width: naturalMediaWidth || undefined,
        height: naturalMediaHeight || undefined,
        duration: undefined,
        title,
      });
    }
    return normalized.slice(0, 4);
  }, [
    mediaUrl,
    naturalMediaHeight,
    naturalMediaWidth,
    node.data?.thumbnailUrl,
    node.data?.workflowVideoResults,
    title,
  ]);
  const hasVideoGeneratorResultStrip =
    isVideoResultNode && workflowVideoResults.length > 1;
  const videoGeneratorResultsCollapsed = Boolean(
    node.data?.workflowVideoResultsCollapsed,
  );
  const hasGeneratorResultStrip =
    hasImageGeneratorResultStrip || hasVideoGeneratorResultStrip;
  const showGeneratorInputBar =
    (!node.data?.suppressGenerationBar || isVideoGeneratorResultNode) &&
    !imageGeneratorResultsExpanded;
  const isStoryboardImageGenerator =
    isWorkflowStoryboardImageGeneratorNode(node);
  const showStoryboardGeneratorInputBar =
    !isStoryboardImageGenerator || selected;
  const hasSeedanceCharacterComplianceBadge =
    isOrdinaryImageNode && Boolean(getWorkflowSurfaceSeedanceAssetUrl(node));

  const enterPanoramaPreview = useCallback(() => {
    if (!mediaUrl) {
      message.warning("当前图片节点没有可预览的图片");
      return;
    }
    const targetWidth = LIBTV_TAPNOW_VIDEO_GENERATOR_WIDTH;
    const targetHeight = LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT;
    const currentWidth = Math.max(1, Number(node.width || targetWidth));
    const currentHeight = Math.max(1, Number(node.height || targetHeight));
    onMoveNode?.(node.id, {
      width: targetWidth,
      height: targetHeight,
      x: Math.round(Number(node.x || 0) + currentWidth / 2 - targetWidth / 2),
      y: Math.round(Number(node.y || 0) + currentHeight / 2 - targetHeight / 2),
    });
    onUpdateNode?.(node.id, {
      workflowPanoramaActive: true,
      workflowPanoramaYaw: panoramaInitialYaw,
      workflowPanoramaPitch: panoramaInitialPitch,
    } as any);
  }, [
    mediaUrl,
    node.height,
    node.id,
    node.width,
    node.x,
    node.y,
    onMoveNode,
    onUpdateNode,
    panoramaInitialPitch,
    panoramaInitialYaw,
  ]);

  const exitPanoramaPreview = useCallback(
    (angles: { yaw: number; pitch: number }) => {
      onUpdateNode?.(node.id, {
        workflowPanoramaActive: false,
        workflowPanoramaYaw: Number(angles.yaw || 0),
        workflowPanoramaPitch: Number(angles.pitch || 0),
      } as any);
    },
    [node.id, onUpdateNode],
  );

  const handleVideoMetadataLoaded = useCallback(
    (metadata: { width: number; height: number; duration?: number }) => {
      const width = Math.max(1, Math.round(Number(metadata.width || 0)));
      const height = Math.max(1, Math.round(Number(metadata.height || 0)));
      if (width <= 0 || height <= 0) return;
      const duration = Number(metadata.duration || 0);
      const patch: Partial<LibTvWorkflowNode["data"]> = {
        workflowMediaNaturalWidth: width,
        workflowMediaNaturalHeight: height,
      };
      if (
        Number.isFinite(duration) &&
        duration > 0 &&
        isVideoGeneratorResultNode
      ) {
        patch.videoDuration = `${duration < 10 ? duration.toFixed(1) : Math.round(duration)}s`;
      }
      if (Number.isFinite(duration) && duration > 0) {
        patch.workflowMediaDurationSec = duration;
      }
      onUpdateNode?.(node.id, patch);
      if (
        node.data?.workflowMediaUserResized === true ||
        node.data?.workflowMediaFrameLocked === true
      )
        return;
      const currentWidth = Math.max(1, Number(node.width || 0));
      const currentHeight = Math.max(1, Number(node.height || 0));
      const frame = workflowOrdinaryImageDisplayFrameFromRatio(width, height);
      if (
        Math.round(currentWidth) === frame.width &&
        Math.round(currentHeight) === frame.height
      )
        return;
      onMoveNode?.(node.id, {
        width: frame.width,
        height: frame.height,
        x: Math.round(Number(node.x || 0) + currentWidth / 2 - frame.width / 2),
        y: Math.round(
          Number(node.y || 0) + currentHeight / 2 - frame.height / 2,
        ),
      });
    },
    [
      isVideoGeneratorResultNode,
      node.data?.workflowMediaFrameLocked,
      node.data?.workflowMediaUserResized,
      node.height,
      node.id,
      node.width,
      node.x,
      node.y,
      onMoveNode,
      onUpdateNode,
    ],
  );

  useEffect(() => {
    setTitle(String(node.data?.title || meta.label));
  }, [meta.label, node.data?.title]);

  useEffect(() => {
    if (!shouldTickEstimatedImageGenerationProgress) return;
    const timer = window.setInterval(
      () => setGenerationProgressNow(Date.now()),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [shouldTickEstimatedImageGenerationProgress]);

  useEffect(() => {
    if (!isImageResultNode || !mediaUrl) setEmotionAdjustMode(null);
  }, [isImageResultNode, mediaUrl]);

  const restoreAngleEditViewport = useCallback(() => {
    const previousViewport = restoreAngleEditViewportRef.current;
    restoreAngleEditViewportRef.current = null;
    if (!previousViewport) return;
    void flow.setViewport(previousViewport, { duration: 360 });
  }, [flow]);

  const restoreRelightViewport = useCallback(() => {
    const previousViewport = restoreRelightViewportRef.current;
    restoreRelightViewportRef.current = null;
    if (!previousViewport) return;
    void flow.setViewport(previousViewport, { duration: 360 });
  }, [flow]);

  const restoreRedrawViewport = useCallback(() => {
    const previousViewport = restoreRedrawViewportRef.current;
    restoreRedrawViewportRef.current = null;
    if (!previousViewport) return;
    void flow.setViewport(previousViewport, { duration: 360 });
  }, [flow]);

  const openAngleEditPanel = useCallback(() => {
    restoreAngleEditViewportRef.current = flow.getViewport();
    setCropOpen(false);
    setResizeOpen(false);
    setExpandOpen(false);
    setUpscaleOpen(false);
    if (relightOpen) {
      setRelightOpen(false);
      restoreRelightViewportRef.current = null;
    }
    if (redrawOpen) {
      setRedrawOpen(false);
      restoreRedrawViewportRef.current = null;
    }
    setAnnotationOpen(false);
    setAngleEditOpen(true);
    const nodeWidth = Math.max(
      TAPNOW_NODE_MIN_SIZE,
      Number(node.width || TAPNOW_NODE_MIN_SIZE),
    );
    const nodeHeight = Math.max(
      TAPNOW_NODE_MIN_SIZE,
      Number(node.height || TAPNOW_NODE_MIN_SIZE),
    );
    const panelWidth = 600;
    const panelHeight = 340;
    const nodeX = Number(node.x || 0);
    const nodeY = Number(node.y || 0);
    const panelX = nodeX + nodeWidth / 2 - panelWidth / 2;
    const panelY = nodeY + nodeHeight + 12;
    const minX = Math.min(nodeX, panelX);
    const minY = Math.min(nodeY - 72, panelY);
    const maxX = Math.max(nodeX + nodeWidth, panelX + panelWidth);
    const maxY = Math.max(nodeY + nodeHeight, panelY + panelHeight);
    requestAnimationFrame(() => {
      void flow.fitBounds(
        {
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
        },
        {
          padding: 0.12,
          duration: 420,
        },
      );
    });
  }, [flow, node.height, node.width, node.x, node.y, redrawOpen, relightOpen]);

  const closeAngleEditPanel = useCallback(() => {
    setAngleEditOpen(false);
    restoreAngleEditViewport();
  }, [restoreAngleEditViewport]);

  const openRelightPanel = useCallback(() => {
    restoreRelightViewportRef.current = flow.getViewport();
    setCropOpen(false);
    setResizeOpen(false);
    setExpandOpen(false);
    setUpscaleOpen(false);
    if (angleEditOpen) {
      setAngleEditOpen(false);
      restoreAngleEditViewportRef.current = null;
    }
    if (redrawOpen) {
      setRedrawOpen(false);
      restoreRedrawViewportRef.current = null;
    }
    setAnnotationOpen(false);
    setRelightOpen(true);
    const nodeWidth = Math.max(
      TAPNOW_NODE_MIN_SIZE,
      Number(node.width || TAPNOW_NODE_MIN_SIZE),
    );
    const nodeHeight = Math.max(
      TAPNOW_NODE_MIN_SIZE,
      Number(node.height || TAPNOW_NODE_MIN_SIZE),
    );
    const panelWidth = 592;
    const panelHeight = 338;
    const nodeX = Number(node.x || 0);
    const nodeY = Number(node.y || 0);
    const panelX = nodeX + nodeWidth / 2 - panelWidth / 2;
    const panelY = nodeY + nodeHeight + 12;
    const minX = Math.min(nodeX, panelX);
    const minY = Math.min(nodeY - 72, panelY);
    const maxX = Math.max(nodeX + nodeWidth, panelX + panelWidth);
    const maxY = Math.max(nodeY + nodeHeight, panelY + panelHeight);
    requestAnimationFrame(() => {
      void flow.fitBounds(
        {
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
        },
        {
          padding: 0.12,
          duration: 420,
        },
      );
    });
  }, [
    angleEditOpen,
    flow,
    node.height,
    node.width,
    node.x,
    node.y,
    redrawOpen,
  ]);

  const closeRelightPanel = useCallback(() => {
    setRelightOpen(false);
    restoreRelightViewport();
  }, [restoreRelightViewport]);

  const openRedrawPanel = useCallback(
    (mode: WorkflowRedrawMode = "redraw") => {
      restoreRedrawViewportRef.current = flow.getViewport();
      setCropOpen(false);
      setResizeOpen(false);
      setExpandOpen(false);
      setUpscaleOpen(false);
      if (angleEditOpen) {
        setAngleEditOpen(false);
        restoreAngleEditViewportRef.current = null;
      }
      if (relightOpen) {
        setRelightOpen(false);
        restoreRelightViewportRef.current = null;
      }
      setAnnotationOpen(false);
      setRedrawMode(mode);
      setRedrawOpen(true);
      const nodeWidth = Math.max(
        TAPNOW_NODE_MIN_SIZE,
        Number(node.width || TAPNOW_NODE_MIN_SIZE),
      );
      const nodeHeight = Math.max(
        TAPNOW_NODE_MIN_SIZE,
        Number(node.height || TAPNOW_NODE_MIN_SIZE),
      );
      const promptWidth = 420;
      const promptHeight = 150;
      const toolbarHeight = 64;
      const nodeX = Number(node.x || 0);
      const nodeY = Number(node.y || 0);
      const panelX = nodeX + nodeWidth / 2 - promptWidth / 2;
      const panelY = nodeY + nodeHeight + 12;
      const minX = Math.min(nodeX, panelX);
      const minY = Math.min(nodeY - toolbarHeight, panelY);
      const maxX = Math.max(nodeX + nodeWidth, panelX + promptWidth);
      const maxY = Math.max(nodeY + nodeHeight, panelY + promptHeight);
      requestAnimationFrame(() => {
        void flow.fitBounds(
          {
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
          },
          {
            padding: 0.12,
            duration: 420,
          },
        );
      });
    },
    [angleEditOpen, flow, node.height, node.width, node.x, node.y, relightOpen],
  );

  const closeRedrawPanel = useCallback(() => {
    setRedrawOpen(false);
    restoreRedrawViewport();
  }, [restoreRedrawViewport]);

  const openAnnotationPanel = useCallback(() => {
    setCropOpen(false);
    setResizeOpen(false);
    setExpandOpen(false);
    setUpscaleOpen(false);
    if (angleEditOpen) {
      setAngleEditOpen(false);
      restoreAngleEditViewportRef.current = null;
    }
    if (relightOpen) {
      setRelightOpen(false);
      restoreRelightViewportRef.current = null;
    }
    if (redrawOpen) {
      setRedrawOpen(false);
      restoreRedrawViewportRef.current = null;
    }
    setAnnotationOpen(true);
  }, [angleEditOpen, redrawOpen, relightOpen]);

  const openResizePanel = useCallback(() => {
    setCropOpen(false);
    setExpandOpen(false);
    setUpscaleOpen(false);
    if (angleEditOpen) {
      setAngleEditOpen(false);
      restoreAngleEditViewportRef.current = null;
    }
    if (relightOpen) {
      setRelightOpen(false);
      restoreRelightViewportRef.current = null;
    }
    if (redrawOpen) {
      setRedrawOpen(false);
      restoreRedrawViewportRef.current = null;
    }
    setAnnotationOpen(false);
    setResizeOpen(true);
  }, [angleEditOpen, redrawOpen, relightOpen]);

  const openExpandPanel = useCallback(() => {
    setCropOpen(false);
    setResizeOpen(false);
    setUpscaleOpen(false);
    if (angleEditOpen) {
      setAngleEditOpen(false);
      restoreAngleEditViewportRef.current = null;
    }
    if (relightOpen) {
      setRelightOpen(false);
      restoreRelightViewportRef.current = null;
    }
    if (redrawOpen) {
      setRedrawOpen(false);
      restoreRedrawViewportRef.current = null;
    }
    setAnnotationOpen(false);
    setExpandOpen(true);
  }, [angleEditOpen, redrawOpen, relightOpen]);

  const openUpscalePanel = useCallback(() => {
    setCropOpen(false);
    setResizeOpen(false);
    setExpandOpen(false);
    if (angleEditOpen) {
      setAngleEditOpen(false);
      restoreAngleEditViewportRef.current = null;
    }
    if (relightOpen) {
      setRelightOpen(false);
      restoreRelightViewportRef.current = null;
    }
    if (redrawOpen) {
      setRedrawOpen(false);
      restoreRedrawViewportRef.current = null;
    }
    setAnnotationOpen(false);
    setUpscaleOpen(true);
  }, [angleEditOpen, redrawOpen, relightOpen]);

  const submitRedraw = useCallback(
    (request: WorkflowRedrawSubmitRequest) => {
      const sourceImageUrl = mediaUrl;
      const previousTitle =
        String(title || node.data?.title || "Image").trim() || "Image";
      setRedrawOpen(false);
      restoreRedrawViewport();
      onUpdateNode?.(node.id, {
        workflowRedrawRunning: true,
        workflowRedrawError: "",
        note: "",
      });
      void runWorkflowRedrawGeneration({
        mode: request.mode,
        imageUrl: sourceImageUrl,
        prompt: request.prompt,
        operations: request.operations,
        displaySize: request.displaySize,
        modelId: request.modelId,
        workflowEndpointMethod: request.workflowEndpointMethod,
        referenceImages: request.referenceImages,
        aspectRatio: request.aspectRatio,
        size: request.size,
        count: request.count,
        enableWebSearch: request.enableWebSearch,
        workflowExtraParameters: request.workflowExtraParameters,
      })
        .then((resultUrls) => {
          const resultUrl = String(resultUrls[0] || "").trim();
          if (!resultUrl) throw new Error("重绘任务未返回图片");
          const suffix = request.mode === "erase" ? "擦除" : "重绘";
          onUpdateNode?.(node.id, {
            title: `${previousTitle} ${suffix}`,
            mediaUrl: resultUrl,
            mediaRole: isImageGeneratorNode ? "generator" : "ordinary",
            modelId: request.modelId,
            workflowEndpointMethod: request.workflowEndpointMethod,
            aspectRatio: request.aspectRatio,
            imageSize: request.size,
            generationCount: request.count,
            enableWebSearch: request.enableWebSearch,
            workflowExtraParameters: request.workflowExtraParameters,
            workflowImageResults: resultUrls.map((url, index) => ({
              url,
              title: `${previousTitle} ${suffix} ${index + 1}`,
            })),
            workflowImageResultsCollapsed:
              resultUrls.length > 1 ? false : undefined,
            workflowMediaUserResized: false,
            prompt: request.prompt,
            note: "",
            workflowRedrawRunning: false,
            workflowRedrawError: "",
          });
          onRequestImageResultFrame?.(node.id, resultUrl);
        })
        .catch((error) => {
          console.error("[Workflow redraw] failed", error);
          const message = error instanceof Error ? error.message : "重绘失败";
          onUpdateNode?.(node.id, {
            note: message,
            workflowRedrawRunning: false,
            workflowRedrawError: message,
          });
        });
    },
    [
      isImageGeneratorNode,
      mediaUrl,
      node.data?.title,
      node.id,
      onRequestImageResultFrame,
      onUpdateNode,
      restoreRedrawViewport,
      title,
    ],
  );

  const closeEmotionAdjustMode = useCallback(() => {
    setEmotionAdjustMode(null);
  }, []);

  const openEmotionAdjustMode = useCallback(() => {
    if (!isImageResultNode || !mediaUrl) {
      message.warning("当前图片节点没有可调节的图片");
      return;
    }
    setCropOpen(false);
    setResizeOpen(false);
    setExpandOpen(false);
    setUpscaleOpen(false);
    setVideoTrimOpen(false);
    setVideoCropOpen(false);
    if (angleEditOpen) closeAngleEditPanel();
    if (relightOpen) closeRelightPanel();
    if (redrawOpen) closeRedrawPanel();
    setAnnotationOpen(false);
    setEmotionPoint({ x: 50, y: 50 });
    setEmotionAdjustMode("pick");
  }, [
    angleEditOpen,
    closeAngleEditPanel,
    closeRedrawPanel,
    closeRelightPanel,
    isImageResultNode,
    mediaUrl,
    redrawOpen,
    relightOpen,
  ]);

  const submitEmotionAdjust = useCallback(
    (request: WorkflowEmotionAdjustmentCreateRequest) => {
      const emotionLabel =
        request.emotionLabel || getWorkflowEmotionLabel(emotionPoint);
      if (!request.modelId) {
        message.warning("请先选择图片模型");
        return;
      }
      setEmotionAdjustMode(null);
      onCreateEmotionAdjustmentPreset?.(node.id, { ...request, emotionLabel });
    },
    [emotionPoint, node.id, onCreateEmotionAdjustmentPreset],
  );

  return (
    <div
      className={`group node-shell relative overflow-visible ${focusPickActive ? "cursor-crosshair" : ""} ${isMediaGeneratorNode ? "rounded-xl" : "rounded-2xl"} bg-[var(--Surface-secondary-background)] text-fg-default`}
      data-testid={`canvas-node-${node.kind}-${node.id}`}
      style={{
        width: "100%",
        height: "100%",
        minWidth: isOrdinaryMediaNode ? undefined : TAPNOW_NODE_MIN_SIZE,
        minHeight:
          isOrdinaryImageNode || isOrdinaryVideoNode
            ? undefined
            : TAPNOW_NODE_MIN_SIZE,
        background: hasGeneratorResultStrip
          ? "transparent"
          : isOrdinaryMediaNode
            ? "transparent"
            : isMediaGeneratorNode
              ? ZMTV_NODE_SURFACE_BACKGROUND
              : TAPNOW_NODE_PANEL_BACKGROUND,
        border: hasGeneratorResultStrip
          ? undefined
          : isMediaGeneratorNode
            ? ZMTV_NODE_SURFACE_BORDER
            : undefined,
        color: "var(--fg-default, rgba(255,255,255,0.9))",
        boxShadow: hasGeneratorResultStrip
          ? "none"
          : isMediaGeneratorNode
            ? selected
              ? ZMTV_NODE_SURFACE_SELECTED_SHADOW
              : ZMTV_NODE_SURFACE_SHADOW
            : selected
              ? "var(--workflow-node-shadow-selected)"
              : "var(--workflow-node-shadow)",
      }}
    >
      {isOrdinaryMediaNode ? (
        <div
          className="node-floating-ui pointer-events-none absolute left-0 flex w-full min-w-0 items-center gap-1 bg-transparent text-[var(--canvas-controls-icon)]"
          style={{
            top: -28,
            height: 24,
            fontSize: 13,
            lineHeight: "24px",
            background: "transparent",
            boxShadow: "none",
            backdropFilter: "none",
          }}
        >
          {isOrdinaryImageNode ? (
            <ImageIcon className="size-3.5 shrink-0" />
          ) : (
            <span className="flex size-3.5 shrink-0 items-center justify-center">
              <TapNowNodeIcon kind="video" size={14} />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{title || meta.label}</span>
          {isOrdinaryImageNode && hasSeedanceCharacterComplianceBadge ? (
            <span
              className="pointer-events-auto inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-sky-300/35 bg-sky-500/22 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.22)]"
              title="素材内容已合规，可用于Seedance2.0视频生成"
              aria-label="素材内容已合规，可用于Seedance2.0视频生成"
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
            >
              <Check className="size-3" strokeWidth={2.4} />
            </span>
          ) : null}
          {naturalMediaSizeLabel ? (
            <span
              className="shrink-0 whitespace-nowrap text-[11px] tabular-nums opacity-80"
              title={naturalMediaSizeLabel}
            >
              {naturalMediaSizeLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {!isOrdinaryMediaNode ? (
        <div
          className={WORKFLOW_NODE_TITLE_BAR_CLASS}
          style={{
            ...WORKFLOW_NODE_TITLE_BAR_STYLE,
            ...(isMediaGeneratorNode
              ? { width: "100%", maxWidth: "100%" }
              : {}),
          }}
        >
          <span
            className="flex shrink-0 items-center text-[var(--canvas-controls-icon)]"
            style={{ width: 12, height: 12 }}
          >
            <TapNowNodeIcon kind={node.kind} size={12} />
          </span>
          <div
            className="relative min-w-0 max-w-full shrink"
            style={{
              width: isMediaGeneratorNode
                ? "100%"
                : getWorkflowNodeTitleWidth(title || meta.label),
            }}
          >
            <span
              className="pointer-events-none invisible inline-block select-none whitespace-pre align-top"
              aria-hidden="true"
              style={{
                fontSize: 12,
                lineHeight: "18px",
              }}
            >
              {title || meta.label}
            </span>
            <input
              placeholder="请输入标题"
              className="nodrag nopan nowheel absolute inset-0 box-border h-auto w-full border-none bg-transparent p-0 text-inherit outline-none"
              data-testid="canvas-node-title"
              value={title}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() =>
                onUpdateNode?.(node.id, { title: title.trim() || meta.label })
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
              style={{
                fontSize: 12,
                lineHeight: "18px",
                minWidth: 0,
              }}
            />
          </div>
          {isVideoGeneratorResultNode && naturalMediaSizeLabel ? (
            <span
              className="shrink-0 whitespace-nowrap text-[11px] tabular-nums opacity-80"
              title={naturalMediaSizeLabel}
            >
              {naturalMediaSizeLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {showFloatingControls &&
      (isImageResultNode ||
        isOrdinaryVideoNode ||
        isVideoGeneratorResultNode) &&
      !emotionAdjustMode &&
      !panoramaActive &&
      !focusPickActive &&
      !generationRunning &&
      !redrawOpen &&
      !redrawRunning &&
      !annotationOpen &&
      !resizeOpen &&
      !expandOpen &&
      !upscaleOpen &&
      !videoTrimOpen &&
      !videoCropOpen ? (
        <OrdinaryImageToolbar
          kind={node.kind}
          onImagePreset={(presetId) =>
            onRunImageToolbarPreset?.(node.id, presetId)
          }
          onAction={(action, options) => {
            if (isVideoResultNode) {
              if (action === "download") {
                onDownloadNode?.(node.id);
                return;
              }
              if (action === "clip") {
                setVideoTrimOpen(true);
                return;
              }
              if (action === "crop") {
                setVideoCropOpen(true);
                return;
              }
              if (action === "fullscreen") {
                if (mediaUrl) setMediaPreviewOpen(true);
                return;
              }
              if (action === "enhance") {
                onCreateVideoUpscaleNode?.(node.id);
                return;
              }
              if (action === "seedance-check") {
                onAnalyzeVideoNode?.(node.id);
                return;
              }
              if (action === "split-2") {
                onSeparateVideoAudioNode?.(node.id, "audio-video");
                return;
              }
              if (action === "vocal-separate" || action === "separate-av") {
                onSeparateVideoAudioNode?.(
                  node.id,
                  action === "vocal-separate" ? "voice" : "background",
                );
                return;
              }
              if (action === "remove-bg") {
                onRemoveVideoSubtitlesNode?.(node.id);
                return;
              }
              const videoActionLabels: Partial<
                Record<OrdinaryImageToolbarAction, string>
              > = {
                erase: "字幕区域擦除",
              };
              const label = videoActionLabels[action] || action;
              message.info(`${label} 开发中`);
              onUpdateNode?.(node.id, { note: `${label} 开发中` });
              return;
            }
            if (action === "download") {
              onDownloadNode?.(node.id);
              return;
            }
            if (action === "portrait-texture") {
              onCreatePortraitTexturePreset?.(node.id);
              return;
            }
            if (action === "emotion-texture") {
              openEmotionAdjustMode();
              return;
            }
            if (action === "panorama") {
              onRunImageToolbarPreset?.(node.id, "panorama-720");
              return;
            }
            if (action === "grid-split") {
              onSplitImageNode?.(node.id, {
                rows: Math.max(1, Number(options?.gridRows || 1)),
                columns: Math.max(1, Number(options?.gridColumns || 1)),
              });
              return;
            }
            if (
              action === "split-2" ||
              action === "split-3" ||
              action === "split-4" ||
              action === "split-5"
            ) {
              const size = Number(action.slice("split-".length));
              onSplitImageNode?.(node.id, { rows: size, columns: size });
              return;
            }
            if (action === "rotate-image") {
              onRotateImageNode?.(node.id);
              return;
            }
            if (action === "crop" || action === "clip") {
              if (angleEditOpen) closeAngleEditPanel();
              if (relightOpen) closeRelightPanel();
              if (redrawOpen) closeRedrawPanel();
              if (isOrdinaryVideoNode) {
                setVideoTrimOpen(true);
                return;
              }
              setCropOpen(true);
              return;
            }
            if (action === "rotate") {
              if (angleEditOpen) {
                closeAngleEditPanel();
              } else {
                openAngleEditPanel();
              }
              return;
            }
            if (action === "clean") {
              if (relightOpen) {
                closeRelightPanel();
              } else {
                openRelightPanel();
              }
              return;
            }
            if (action === "edit") {
              if (redrawOpen) {
                closeRedrawPanel();
              } else {
                openRedrawPanel("redraw");
              }
              return;
            }
            if (action === "erase") {
              if (redrawOpen) {
                closeRedrawPanel();
              } else {
                openRedrawPanel("erase");
              }
              return;
            }
            if (action === "annotate") {
              if (annotationOpen) {
                setAnnotationOpen(false);
              } else {
                openAnnotationPanel();
              }
              return;
            }
            if (action === "resize") {
              if (resizeOpen) {
                setResizeOpen(false);
              } else {
                openResizePanel();
              }
              return;
            }
            if (action === "expand") {
              if (expandOpen) {
                setExpandOpen(false);
              } else {
                openExpandPanel();
              }
              return;
            }
            if (action === "enhance") {
              if (upscaleOpen) {
                setUpscaleOpen(false);
              } else {
                openUpscalePanel();
              }
              return;
            }
            if (action === "remove-bg") {
              onRemoveBackgroundNode?.(node.id);
              return;
            }
            if (action === "save") {
              onSaveNodeToMaterials?.(node.id);
              return;
            }
            if (action === "report") {
              onReportNodeIssue?.(node.id);
              return;
            }
            if (action === "replace") {
              replaceInputRef.current?.click();
              return;
            }
            if (action === "fullscreen") {
              if (mediaUrl) setMediaPreviewOpen(true);
              return;
            }
            message.info("该功能 开发中");
          }}
        />
      ) : null}
      {mediaPreviewOpen && mediaUrl ? (
        <WorkflowMediaFullscreenPreview
          kind={node.kind === "video" ? "video" : "image"}
          mediaUrl={mediaUrl}
          initialVolume={Number(node.data?.workflowMediaPlaybackVolume ?? 0.5)}
          hasAudio={videoHasAudio}
          onClose={() => setMediaPreviewOpen(false)}
        />
      ) : null}
      {angleEditOpen && isImageResultNode && mediaUrl ? (
        <WorkflowAngleEditPanel
          imageUrl={mediaUrl}
          title={title}
          modelId={String(node.data?.modelId || "")}
          workflowEndpointMethod={node.data?.workflowEndpointMethod}
          aspectRatio={node.data?.aspectRatio}
          imageSize={node.data?.imageSize}
          workflowExtraParameters={node.data?.workflowExtraParameters}
          onClose={closeAngleEditPanel}
          onSubmit={(request) => {
            onCreateAngleEditNode?.(node.id, request);
            restoreAngleEditViewport();
          }}
        />
      ) : null}
      {relightOpen && isImageResultNode && mediaUrl ? (
        <WorkflowRelightPanel
          imageUrl={mediaUrl}
          title={title}
          modelId={String(node.data?.modelId || "")}
          projectId={projectId}
          onClose={closeRelightPanel}
          onComplete={(resultUrl, promptText) => {
            const currentTitle =
              String(title || node.data?.title || "Image").trim() || "Image";
            onUpdateNode?.(node.id, {
              title: `${currentTitle} 打光`,
              mediaUrl: resultUrl,
              mediaRole: isImageGeneratorNode ? "generator" : "ordinary",
              workflowMediaUserResized: false,
              prompt: promptText,
              note: "",
            });
            onRequestImageResultFrame?.(node.id, resultUrl);
            restoreRelightViewport();
          }}
        />
      ) : null}
      {redrawOpen && isImageResultNode && mediaUrl && !redrawRunning ? (
        <WorkflowImageRedrawOverlay
          imageUrl={mediaUrl}
          title={title}
          nodeWidth={Number(node.width || TAPNOW_NODE_MIN_SIZE)}
          nodeHeight={Number(node.height || TAPNOW_NODE_MIN_SIZE)}
          fitMode={getWorkflowImageFitMode(node)}
          modelId={String(node.data?.modelId || "")}
          mode={redrawMode}
          onClose={closeRedrawPanel}
          onSubmit={submitRedraw}
        />
      ) : null}
      {annotationOpen && isImageResultNode && mediaUrl && !redrawRunning ? (
        <WorkflowImageAnnotationOverlay
          imageUrl={mediaUrl}
          nodeWidth={Number(node.width || TAPNOW_NODE_MIN_SIZE)}
          nodeHeight={Number(node.height || TAPNOW_NODE_MIN_SIZE)}
          fitMode={getWorkflowImageFitMode(node)}
          onClose={() => setAnnotationOpen(false)}
          onSave={({ dataUrl, prompt }) => {
            setAnnotationOpen(false);
            onCreateAnnotatedImageNode?.(node.id, dataUrl, prompt);
          }}
        />
      ) : null}
      {resizeOpen && isImageResultNode && mediaUrl && !redrawRunning ? (
        <WorkflowImageResizePanel
          imageUrl={mediaUrl}
          title={title}
          onCancel={() => setResizeOpen(false)}
          onConfirm={(file) => {
            setResizeOpen(false);
            onMediaFileReplace?.(node.id, file);
          }}
        />
      ) : null}
      {expandOpen && isImageResultNode && mediaUrl && !redrawRunning ? (
        <WorkflowImageExpandPanel
          imageUrl={mediaUrl}
          nodeWidth={Number(node.width || TAPNOW_NODE_MIN_SIZE)}
          nodeHeight={Number(node.height || TAPNOW_NODE_MIN_SIZE)}
          modelId={String(node.data?.modelId || "")}
          onCancel={() => setExpandOpen(false)}
          onConfirm={(request) => {
            setExpandOpen(false);
            onExpandImageNode?.(node.id, request);
          }}
        />
      ) : null}
      {upscaleOpen && isImageResultNode && mediaUrl && !redrawRunning ? (
        <WorkflowImageUpscalePanel
          imageUrl={mediaUrl}
          onCancel={() => setUpscaleOpen(false)}
          onConfirm={(request) => {
            setUpscaleOpen(false);
            onUpscaleImageNode?.(node.id, request);
          }}
        />
      ) : null}
      <div className="absolute inset-0 h-full w-full overflow-visible">
        {panoramaActive ? (
          <WorkflowInlinePanoramaPreview
            imageUrl={mediaUrl}
            initialYaw={panoramaInitialYaw}
            initialPitch={panoramaInitialPitch}
            onExit={exitPanoramaPreview}
            onCaptureImages={(titleText, images) => {
              images.forEach((image) => {
                onCreateAnnotatedImageNode?.(
                  node.id,
                  image.dataUrl,
                  `全景截图：${image.suffix || titleText}`,
                );
              });
            }}
          />
        ) : generationRunning && node.kind === "image" && !mediaUploadState ? (
          <WorkflowImageGenerationPlaceholder
            progress={generationProgress ?? 0}
            label={
              normalizeWorkflowImageGenerationDisplayLabel(node.data?.note) ||
              "图片生成中"
            }
          />
        ) : isOrdinaryVideoNode && generationRunning && !mediaUrl ? (
          <WorkflowVideoGenerationPlaceholder
            title={
              isVideoGeneratorNode
                ? "视频生成中"
                : String(node.data?.note || "视频生成中")
            }
            progress={generationProgress}
          />
        ) : hasImageGeneratorResultStrip ? (
          <WorkflowImageGeneratorResultStrip
            node={node}
            results={workflowImageResults}
            collapsed={imageGeneratorResultsCollapsed}
            onUpdateNode={onUpdateNode}
          />
        ) : hasVideoGeneratorResultStrip ? (
          <WorkflowVideoGeneratorResultStrip
            node={node}
            results={workflowVideoResults}
            collapsed={videoGeneratorResultsCollapsed}
            generationRunning={generationRunning}
            generationProgress={generationProgress}
            selected={selected}
            dragging={dragging}
            onUpdateNode={onUpdateNode}
          />
        ) : isVideoGeneratorNode && generationRunning && mediaUrl ? (
          <div className="absolute inset-0 overflow-hidden rounded-2xl">
            <div className="absolute inset-0 scale-[1.1] blur-[24px]">
              <OrdinaryVideoPlayer
                mediaUrl={mediaUrl}
                posterUrl={String(
                  node.data?.thumbnailUrl ||
                    node.data?.workflowStoryboardVideoFirstFrameUrl ||
                    node.data?.workflowStoryboardVideoTailFrameUrl ||
                    "",
                ).trim()}
                initialDuration={Number(
                  node.data?.workflowMediaDurationSec ||
                    parseWorkflowDurationSeconds(
                      node.data?.videoDuration ||
                        node.data?.workflowStoryboardDuration,
                      0,
                    ),
                )}
                initialVolume={Number(
                  node.data?.workflowMediaPlaybackVolume ?? 0.5,
                )}
                hasAudio={videoHasAudio}
                dragging={true}
                fitMode={
                  node.data?.workflowMediaFrameLocked ? "contain" : "cover"
                }
              />
            </div>
            <WorkflowVideoGenerationPlaceholder
              title={String(node.data?.note || "视频生成中")}
              progress={generationProgress}
              variant="overlay"
            />
          </div>
        ) : isVideoGeneratorNode && generationRunning ? (
          <WorkflowVideoGenerationPlaceholder
            title={String(node.data?.note || "视频生成中")}
            progress={generationProgress}
          />
        ) : isVideoResultNode && mediaUrl ? (
          <OrdinaryVideoPlayer
            mediaUrl={mediaUrl}
            posterUrl={String(
              node.data?.thumbnailUrl ||
                node.data?.workflowStoryboardVideoFirstFrameUrl ||
                node.data?.workflowStoryboardVideoTailFrameUrl ||
                "",
            ).trim()}
            initialDuration={Number(
              node.data?.workflowMediaDurationSec ||
                parseWorkflowDurationSeconds(
                  node.data?.videoDuration ||
                    node.data?.workflowStoryboardDuration,
                  0,
                ),
            )}
            initialVolume={Number(
              node.data?.workflowMediaPlaybackVolume ?? 0.5,
            )}
            hasAudio={videoHasAudio}
            loadingLabel={
              redrawRunning
                ? String(node.data?.note || "裁剪中...")
                : generationRunning
                  ? String(node.data?.note || "视频生成中")
                  : ""
            }
            loadingProgress={generationRunning ? generationProgress : undefined}
            active={selected}
            dragging={dragging}
            fitMode={node.data?.workflowMediaFrameLocked ? "contain" : "cover"}
            onMetadataLoaded={handleVideoMetadataLoaded}
            onVolumeChange={(volume) =>
              onUpdateNode?.(node.id, { workflowMediaPlaybackVolume: volume })
            }
            onCaptureFrame={(dataUrl, label) =>
              onCreateAnnotatedImageNode?.(node.id, dataUrl, "视频" + label)
            }
            onReplaceClick={
              isOrdinaryVideoNode
                ? () => replaceInputRef.current?.click()
                : undefined
            }
          />
        ) : (
          <TapNowNodeBody
            node={node}
            priority={selected || isImageGeneratorResultNode}
            onImageToImageClick={
              isImageGeneratorNode
                ? (event) => {
                    event.stopPropagation();
                    imageGeneratorReferenceInputRef.current?.click();
                  }
                : undefined
            }
            onImageUpscaleClick={
              isImageGeneratorNode
                ? (event) => {
                    event.stopPropagation();
                    onCreateImageUpscalePreset?.(node.id);
                  }
                : undefined
            }
            onVideoStartEndClick={
              isVideoGeneratorNode
                ? (event) => {
                    event.stopPropagation();
                    onRunVideoGeneratorPreset?.(node.id, "start-end-to-video");
                  }
                : undefined
            }
            onVideoFirstFrameClick={
              isVideoGeneratorNode
                ? (event) => {
                    event.stopPropagation();
                    onRunVideoGeneratorPreset?.(
                      node.id,
                      "first-frame-to-video",
                    );
                  }
                : undefined
            }
          />
        )}
        {isImageResultNode &&
        (focusPickActive || focusPickOverlay?.nodeId === node.id) ? (
          <WorkflowFocusPickNodeOverlay
            active={Boolean(focusPickActive)}
            overlay={
              focusPickOverlay?.nodeId === node.id ? focusPickOverlay : null
            }
            onComplete={(rect, displaySize) =>
              onCompleteFocusPick?.(node.id, rect, displaySize)
            }
          />
        ) : null}
        {isImageResultNode && mediaUrl && emotionAdjustMode === "pick" ? (
          <>
            <WorkflowEmotionPickToolbar
              onClose={closeEmotionAdjustMode}
              onManualSelect={() => setEmotionAdjustMode("adjust")}
            />
            <WorkflowEmotionFacePickOverlay
              onSelect={() => setEmotionAdjustMode("adjust")}
            />
          </>
        ) : null}
        {isImageResultNode && mediaUrl && emotionAdjustMode === "adjust" ? (
          <WorkflowEmotionAdjustPanel
            imageUrl={mediaUrl}
            point={emotionPoint}
            initialModelId={String(node.data?.modelId || "")}
            initialWorkflowEndpointMethod={String(
              node.data?.workflowEndpointMethod || "",
            )}
            initialAspectRatio={String(node.data?.aspectRatio || "")}
            initialImageSize={String(node.data?.imageSize || "")}
            initialWorkflowExtraParameters={node.data?.workflowExtraParameters}
            onPointChange={setEmotionPoint}
            onClose={closeEmotionAdjustMode}
            onSubmit={submitEmotionAdjust}
          />
        ) : null}
        {isImageResultNode ||
        isOrdinaryVideoNode ||
        isVideoGeneratorResultNode ? (
          <>
            {showFloatingControls &&
            isImageResultNode &&
            !emotionAdjustMode &&
            !hasImageGeneratorResultStrip &&
            !focusPickActive &&
            !generationRunning &&
            !redrawRunning &&
            (canEnterPanoramaPreview || !panoramaActive) ? (
              <span
                className={`nodrag nopan absolute z-20 flex items-center gap-2 ${panoramaActive ? "right-[3.125rem] top-[calc(0.5rem+1px)]" : "right-2 top-2"}`}
              >
                {!panoramaActive && canEnterPanoramaPreview ? (
                  <button
                    type="button"
                    data-testid="image-node-panorama-preview-entry"
                    className="pointer-events-auto flex size-9 items-center justify-center rounded-lg bg-black/65 text-white transition-colors hover:bg-black/75"
                    aria-label="进入全景预览"
                    title="进入全景预览"
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={(event) => {
                      event.stopPropagation();
                      enterPanoramaPreview();
                    }}
                  >
                    <PanoramaEntryIcon />
                  </button>
                ) : null}
                <button
                  type="button"
                  data-quick-guide-anchor="resource-reupload"
                  className="pointer-events-auto flex size-9 items-center justify-center rounded-lg bg-black/65 text-white transition-colors hover:bg-black/75 disabled:opacity-50"
                  aria-label="替换素材"
                  title="替换素材"
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onClick={(event) => {
                    event.stopPropagation();
                    replaceInputRef.current?.click();
                  }}
                >
                  <WorkflowResourceReuploadIcon />
                </button>
              </span>
            ) : null}
            <input
              ref={replaceInputRef}
              type="file"
              accept={isVideoResultNode ? "video/*" : "image/*"}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onMediaFileReplace?.(node.id, file);
              }}
            />
          </>
        ) : null}
        <WorkflowMediaUploadOverlay
          status={mediaUploadState}
          progress={
            mediaUploadState === "uploading" &&
            Number.isFinite(rawGenerationProgress)
              ? Math.max(0, Math.min(1, rawGenerationProgress))
              : undefined
          }
          message={String(
            node.data?.workflowGenerationError || node.data?.note || "上传失败",
          )}
          hasContent={Boolean(mediaUrl)}
        />
      </div>
      {cropOpen && isImageResultNode && mediaUrl ? (
        <WorkflowImageCropOverlay
          imageUrl={mediaUrl}
          title={title}
          nodeWidth={Number(node.width || TAPNOW_NODE_MIN_SIZE)}
          nodeHeight={Number(node.height || TAPNOW_NODE_MIN_SIZE)}
          onCancel={() => setCropOpen(false)}
          onConfirm={(file) => {
            setCropOpen(false);
            onMediaFileReplace?.(node.id, file);
          }}
        />
      ) : null}
      {videoTrimOpen && isVideoResultNode && mediaUrl ? (
        <WorkflowVideoTrimOverlay
          videoUrl={mediaUrl}
          onCancel={() => setVideoTrimOpen(false)}
          onConfirm={(request) => {
            setVideoTrimOpen(false);
            onTrimVideoNode?.(node.id, request);
          }}
        />
      ) : null}
      {videoCropOpen && isVideoResultNode && mediaUrl ? (
        <WorkflowVideoCropOverlay
          videoUrl={mediaUrl}
          initialSourceWidth={naturalMediaWidth}
          initialSourceHeight={naturalMediaHeight}
          onCancel={() => setVideoCropOpen(false)}
          onConfirm={(request) => {
            setVideoCropOpen(false);
            onCropVideoNode?.(node.id, request);
          }}
        />
      ) : null}
      {showFloatingControls && isVideoUpscaleNode ? (
        <WorkflowVideoUpscalePanel
          node={node}
          onUpdateNode={onUpdateNode}
          onSubmit={(request) => onSubmitVideoUpscaleNode?.(node.id, request)}
        />
      ) : null}
      {showFloatingControls &&
      isImageUpscaleNode &&
      !node.data?.suppressGenerationBar ? (
        <WorkflowImageUpscaleGenerationBar
          node={node}
          upstreamNodes={upstreamNodes}
          projectId={projectId}
          onUpdateNode={onUpdateNode}
          onSubmit={(id, request) => onSubmitImageUpscaleNode?.(id, request)}
        />
      ) : null}
      {showFloatingControls &&
      !isOrdinaryMediaNode &&
      !isVideoUpscaleNode &&
      !isImageUpscaleNode &&
      showGeneratorInputBar &&
      showStoryboardGeneratorInputBar ? (
        <NodeGenerationBar
          kind={node.kind}
          modelId={node.data?.modelId}
          workflowEndpointMethod={node.data?.workflowEndpointMethod}
          selectedOptionId={node.data?.selectedOptionId}
          promptInputDisabled={node.data?.workflowPromptDisabled}
          promptPlaceholderText={node.data?.workflowPromptPlaceholder}
          prompt={prompt}
          onPromptChange={(value) => onUpdateNode?.(node.id, { prompt: value })}
          onModelChange={(value) => onUpdateNode?.(node.id, { modelId: value })}
          aspectRatio={node.data?.aspectRatio}
          imageSize={node.data?.imageSize}
          stylePreset={node.data?.stylePreset}
          videoMethod={node.data?.videoMethod}
          videoDuration={node.data?.videoDuration}
          videoResolution={node.data?.videoResolution}
          generateAudio={node.data?.generateAudio}
          enableWebSearch={node.data?.enableWebSearch}
          generationCount={node.data?.generationCount}
          cameraControl={node.data?.cameraControl}
          videoCameraMotion={node.data?.videoCameraMotion}
          videoCharacterAssets={node.data?.videoCharacterAssets}
          workflowPortraitTextureSettings={
            node.data?.workflowPortraitTextureSettings
          }
          workflowExtraParameters={node.data?.workflowExtraParameters}
          onGenerationSettingsChange={(patch) => onUpdateNode?.(node.id, patch)}
          onRequestGenerationFrame={(nextAspectRatio) =>
            onRequestGenerationFrame?.(node.id, nextAspectRatio)
          }
          projectId={projectId}
          onGeneratedResult={(result) => {
            onUpdateNode?.(node.id, {
              mediaUrl: result.imageUrl,
              mediaRole: "generator",
              workflowMediaUserResized: false,
              prompt: node.data?.prompt || result.prompt || "",
              aspectRatio: result.aspectRatio || node.data?.aspectRatio,
              imageSize: result.imageSize || node.data?.imageSize,
            });
            onRequestImageResultFrame?.(node.id, result.imageUrl);
          }}
          onGenerate={async (promptDraft, settings) => {
            onUpdateNode?.(node.id, {
              ...(typeof promptDraft === "string"
                ? { prompt: promptDraft }
                : {}),
              ...settings,
            });
            const generationStarted = await onGenerateNode?.(
              node.id,
              promptDraft,
              settings,
            );
            if (generationStarted === false) {
              onUpdateNode?.(node.id, { suppressGenerationBar: false });
              return false;
            }
            onUpdateNode?.(node.id, {
              suppressGenerationBar: isMediaGeneratorNode ? false : true,
            });
            return true;
          }}
          referenceImages={referenceImages}
          referenceImageNodeIds={referenceImageNodeIds}
          referenceImageRoles={referenceImageRoles}
          upstreamNodes={upstreamNodes}
          onReferenceFilesUploaded={(files) =>
            onReferenceFilesUploaded?.(node.id, files)
          }
          onStartFocusPick={() => onStartFocusPick?.(node.id)}
          onReferenceRemoved={(index, sourceId) => {
            if (sourceId) {
              onReferenceNodeRemoved?.(node.id, sourceId);
              return;
            }
            const nextReferenceImages = referenceImages.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            const nextReferenceNodeIds = referenceImageNodeIds.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            const nextReferenceRoles = referenceImageRoles.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            onUpdateNode?.(node.id, {
              referenceImages: nextReferenceImages,
              referenceImageNodeIds: nextReferenceNodeIds,
              referenceImageRoles: nextReferenceRoles,
            });
          }}
        />
      ) : null}
      {isImageGeneratorNode ? (
        <input
          ref={imageGeneratorReferenceInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            if (files.length === 0) return;
            onReferenceFilesUploaded?.(node.id, files);
          }}
        />
      ) : null}
    </div>
  );
}
