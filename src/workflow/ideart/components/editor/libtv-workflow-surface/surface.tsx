"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Position,
  applyNodeChanges,
  type Connection,
  type ReactFlowInstance,
  type Edge,
  type FinalConnectionState,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodeDrag,
  type Viewport,
} from "@xyflow/react";
import { Loader2 } from "lucide-react";
import type {
  LibTvDirectorConsole3DCapture,
  LibTvWorkflowNode,
} from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_WORKFLOW_VIRTUALIZATION_THRESHOLD,
  LIBTV_WORKFLOW_VIRTUAL_OVERSCAN_PX,
  createLibTvViewportEdgeIndex,
  createLibTvViewportIndex,
} from "@/workflow/ideart/lib/libtv/workflow-viewport-virtualization";
import { resolveLibTvStoryboardVideoMotionPrompt } from "@/workflow/ideart/lib/libtv/script";
import { uploadCanvasNodeFile } from "../libtv-upload-utils";
import { type LibTvDirectorConsole3DVideoExport } from "./nodes/director-console-3d";
import { type ScriptV2CanvasImageAsset } from "./nodes/script-v2-workspace";
import { clampWorkflowNumber } from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  getWorkflowCableColor,
  getWorkflowCablePath,
  getWorkflowCableTone,
  getWorkflowContextAddOptionsForNode,
  getWorkflowOutputAddOptionsForNode,
  useLatestWorkflowRef,
} from "./workflow-connections";
import {
  canConnectWorkflowNodes,
  getWorkflowStandaloneStoryboardImageGridChildIds,
  isWorkflowImageGeneratorResultGroupNode,
  isWorkflowImageGeneratorResultNode,
  isWorkflowImageResultGroupContainer,
  isWorkflowOrdinaryImageNode,
  isWorkflowStoryboardGroupNode,
  isWorkflowVideoAnalysisScriptNode,
  isWorkflowVideoGeneratorNode,
  makeWorkflowUpstreamNodeSummary,
} from "./workflow-node-kinds";
import {
  cropWorkflowImageToFile,
  getWorkflowVideoGeneratorFrame,
  normalizeWorkflowDurationLabel,
  parseWorkflowAspectRatioSize,
  readWorkflowImageUrlSize,
  workflowImageDisplayFrameFromRatio,
} from "./workflow-media-utils";
import {
  findWorkflowNodeIdAtPoint,
  getWorkflowDragPersistNodeIds,
  getWorkflowEdgeIdFromElement,
  getWorkflowGroupMemberBounds,
  getWorkflowImageResultGroupFrame,
  getWorkflowNodeAbsolutePosition,
  getWorkflowNodeIdFromElement,
  getWorkflowRenderedNodeFrame,
  getWorkflowSelectionBounds,
  pointFromConnectionEndEvent,
} from "./workflow-layout";
import {
  LibTvWorkflowSurfaceCanvas,
  resolveLibTvWorkflowVirtualNodeLimit,
} from "./surface-canvas";
import {
  WORKFLOW_MODEL_CATEGORIES,
  fetchWorkflowModelOptionsBootstrap,
  populateWorkflowModelOptionsCache,
  workflowModelOptionsCache,
} from "./workflow-models";
import {
  areWorkflowSelectionIdsEqual,
  getSelectedWorkflowFlowNodeIds,
  stabilizeWorkflowFlowEdges,
  stabilizeWorkflowFlowNodes,
} from "./workflow-equality";
import {
  WORKFLOW_NODE_CLOSE_MENUS_EVENT,
  WORKFLOW_SOURCE_HANDLE_ASSET_UNDER,
  WORKFLOW_SOURCE_HANDLE_RIGHT,
  WORKFLOW_TARGET_HANDLE_LEFT,
  isScriptV2AssetImageNode,
} from "./surface-contracts";
import { FocusModeIcon } from "./workflow-icons";
import {
  WorkflowContextMenuPortal,
  WorkflowEdgeContextMenu,
  WorkflowNodeCommandMenu,
  WorkflowNodeContextMenu,
  WorkflowPaneContextMenu,
} from "./context-menus";
import { NodeAddMenu } from "./node-add-menu";
import type {
  LibTvWorkflowSurfaceProps,
  WorkflowAngleEditCreateRequest,
  WorkflowCropRect,
  WorkflowEmotionAdjustmentCreateRequest,
  WorkflowFocusPickOverlay,
  WorkflowGenerationSubmitSettings,
  WorkflowImageExpandRequest,
  WorkflowImageGridSplitRequest,
  WorkflowImageUpscaleRequest,
  WorkflowOverlayNodeData,
  WorkflowStoryboardGenerateRequest,
  WorkflowStoryboardVideoGenerateRequest,
  WorkflowStoryboardVideoGroupSummary,
  WorkflowVideoCropRequest,
  WorkflowVideoTrimRequest,
  WorkflowVideoUpscaleRequest,
} from "./surface-contracts";
import type {
  WorkflowEdgeContextMenuState,
  WorkflowNodeCommandMenuState,
  WorkflowNodeContextMenuState,
  WorkflowPaneContextMenuState,
} from "./workflow-connections";
import type {
  ScriptInputCreationType,
  ScriptV2AssetImportRequest,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";
import type { LibTvWorkflowCanvasVirtualizationStats } from "./surface-canvas";

export const LibTvWorkflowSurface = memo(function LibTvWorkflowSurface({
  nodes,
  edges,
  selectedIds,
  zoom,
  stagePos,
  tool,
  standalone = false,
  readOnly = false,
  edgesVisible = true,
  snapToGrid = false,
  onSelectNode,
  onMoveNode,
  onMoveNodes,
  onUpdateNode,
  onCreateScriptInputNode,
  onAddLinkedNode,
  onImportScriptV2Assets,
  onRunTextGeneratorPreset,
  onRunVideoGeneratorPreset,
  onRunImageToolbarPreset,
  onCreateAngleEditNode,
  onCreatePortraitTexturePreset,
  onCreateEmotionAdjustmentPreset,
  onReferenceFilesUploaded,
  onCreateImageUpscalePreset,
  onImageUpscalePresetFilesUploaded,
  onReferenceNodeRemoved,
  onConnectNodes,
  onDisconnectEdge,
  onGenerateNode,
  onOpenThreeDWorld,
  onOpenDirectorConsole3D,
  onCreateDirectorConsoleCaptureNode,
  onCreateDirectorConsoleVideoNode,
  onGenerateStoryboard,
  onRegenerateStoryboardImages,
  onGenerateStoryboardVideos,
  onSaveNodeToMaterials,
  onCopyNode,
  onDuplicateNode,
  onDeleteNode,
  onDownloadNode,
  onCopyNodeMedia,
  onSendNodeToChat,
  onCopyNodeToClipboard,
  onCreateSubjectFromNode,
  onRunSeedanceComplianceCheck,
  onEnterPanoramaPreview,
  onOptimizeWorkflowLayout,
  onCopyNodeTaskId,
  onVerifyGenerationResult,
  onReportNodeIssue,
  onCreatePlaylistFromSelection,
  onCreateNodeFromSelection,
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
  onPaneUpload,
  onPaneAddNode,
  onPaneUndo,
  onPaneRedo,
  onPanePaste,
  onPaneFilesDrop,
  onMediaFileReplace,
  onSelectionChange,
  onGroupNodes,
  onUngroupNode,
  onConvertGroupToStoryboard,
  onRunGroup,
  onInit,
  onViewportChange,
  onPaneClick,
  onPaneDoubleClick,
  projectId,
}: LibTvWorkflowSurfaceProps) {
  const interactive = !readOnly && tool === "select";
  const flowRef = useRef<ReactFlowInstance<
    Node<WorkflowOverlayNodeData>,
    Edge
  > | null>(null);
  const draggingNodeIdRef = useRef<string | null>(null);
  const pointerDragPositionPersistSuppressedRef = useRef(false);
  const pointerDragPersistReleaseFrameRef = useRef<number | null>(null);
  const selectionDragStartRef = useRef<{
    draggedNodeId: string;
    dragStartPosition: { x: number; y: number };
    nodePositions: Map<string, { x: number; y: number }>;
  } | null>(null);
  const connectionStartRef = useRef<{
    nodeId: string;
    handleType: "source" | "target";
  } | null>(null);
  const lastSelectionIdsRef = useRef<string[]>(selectedIds);
  const groupDragStartRef = useRef<{
    groupId: string;
    dragNodeId: string;
    dragStartPosition: { x: number; y: number };
    groupStartPosition: { x: number; y: number };
    groupPosition: { x: number; y: number };
    memberPositions: Map<string, { x: number; y: number }>;
  } | null>(null);
  const isBoxSelectingRef = useRef(false);
  const suppressNodeEventsRef = useRef(false);
  const suppressNodeEventsTimeoutRef = useRef<number | null>(null);
  const [nodeEventsSuppressed, setNodeEventsSuppressed] = useState(false);
  const [nodeContextMenu, setNodeContextMenu] =
    useState<WorkflowNodeContextMenuState>(null);
  const [edgeContextMenu, setEdgeContextMenu] =
    useState<WorkflowEdgeContextMenuState>(null);
  const [paneContextMenu, setPaneContextMenu] =
    useState<WorkflowPaneContextMenuState>(null);
  const [nodeCommandMenu, setNodeCommandMenu] =
    useState<WorkflowNodeCommandMenuState>(null);
  const [connectionAddMenu, setConnectionAddMenu] = useState<{
    sourceId: string;
    side: "left" | "right";
    sourceX: number;
    sourceY: number;
    x: number;
    y: number;
    flowX: number;
    flowY: number;
  } | null>(null);
  const [focusPickTargetId, setFocusPickTargetId] = useState<string | null>(
    null,
  );
  const [focusPickOverlay, setFocusPickOverlay] =
    useState<WorkflowFocusPickOverlay | null>(null);
  const [draggingWorkflowNodeId, setDraggingWorkflowNodeId] = useState<
    string | null
  >(null);
  const focusPickTargetIdRef = useLatestWorkflowRef(focusPickTargetId);
  const workflowNodesRef = useLatestWorkflowRef(nodes);
  const onUpdateNodeRef = useLatestWorkflowRef(onUpdateNode);
  const onMoveNodeRef = useLatestWorkflowRef(onMoveNode);
  const onMoveNodesRef = useLatestWorkflowRef(onMoveNodes);
  const onCreateScriptInputNodeRef = useLatestWorkflowRef(
    onCreateScriptInputNode,
  );
  const onAddLinkedNodeRef = useLatestWorkflowRef(onAddLinkedNode);
  const onImportScriptV2AssetsRef = useLatestWorkflowRef(
    onImportScriptV2Assets,
  );
  const onRunTextGeneratorPresetRef = useLatestWorkflowRef(
    onRunTextGeneratorPreset,
  );
  const onRunVideoGeneratorPresetRef = useLatestWorkflowRef(
    onRunVideoGeneratorPreset,
  );
  const onRunImageToolbarPresetRef = useLatestWorkflowRef(
    onRunImageToolbarPreset,
  );
  const onCreateAngleEditNodeRef = useLatestWorkflowRef(onCreateAngleEditNode);
  const onCreatePortraitTexturePresetRef = useLatestWorkflowRef(
    onCreatePortraitTexturePreset,
  );
  const onCreateEmotionAdjustmentPresetRef = useLatestWorkflowRef(
    onCreateEmotionAdjustmentPreset,
  );
  const onReferenceFilesUploadedRef = useLatestWorkflowRef(
    onReferenceFilesUploaded,
  );
  const onCreateImageUpscalePresetRef = useLatestWorkflowRef(
    onCreateImageUpscalePreset,
  );
  const onImageUpscalePresetFilesUploadedRef = useLatestWorkflowRef(
    onImageUpscalePresetFilesUploaded,
  );
  const onReferenceNodeRemovedRef = useLatestWorkflowRef(
    onReferenceNodeRemoved,
  );
  const onMediaFileReplaceRef = useLatestWorkflowRef(onMediaFileReplace);
  const onGenerateNodeRef = useLatestWorkflowRef(onGenerateNode);
  const onOpenThreeDWorldRef = useLatestWorkflowRef(onOpenThreeDWorld);
  const onOpenDirectorConsole3DRef = useLatestWorkflowRef(
    onOpenDirectorConsole3D,
  );
  const onCreateDirectorConsoleCaptureNodeRef = useLatestWorkflowRef(
    onCreateDirectorConsoleCaptureNode,
  );
  const onCreateDirectorConsoleVideoNodeRef = useLatestWorkflowRef(
    onCreateDirectorConsoleVideoNode,
  );
  const onGenerateStoryboardRef = useLatestWorkflowRef(onGenerateStoryboard);
  const onRegenerateStoryboardImagesRef = useLatestWorkflowRef(
    onRegenerateStoryboardImages,
  );
  const onGenerateStoryboardVideosRef = useLatestWorkflowRef(
    onGenerateStoryboardVideos,
  );
  const onConvertGroupToStoryboardRef = useLatestWorkflowRef(
    onConvertGroupToStoryboard,
  );
  const onRunGroupRef = useLatestWorkflowRef(onRunGroup);
  const onDisconnectEdgeRef = useLatestWorkflowRef(onDisconnectEdge);
  const onDeleteNodeRef = useLatestWorkflowRef(onDeleteNode);
  const onUngroupNodeRef = useLatestWorkflowRef(onUngroupNode);
  const onDownloadNodeRef = useLatestWorkflowRef(onDownloadNode);
  const onSaveNodeToMaterialsRef = useLatestWorkflowRef(onSaveNodeToMaterials);
  const onReportNodeIssueRef = useLatestWorkflowRef(onReportNodeIssue);
  const onCreateAnnotatedImageNodeRef = useLatestWorkflowRef(
    onCreateAnnotatedImageNode,
  );
  const onRemoveBackgroundNodeRef = useLatestWorkflowRef(
    onRemoveBackgroundNode,
  );
  const onSplitImageNodeRef = useLatestWorkflowRef(onSplitImageNode);
  const onRotateImageNodeRef = useLatestWorkflowRef(onRotateImageNode);
  const onExpandImageNodeRef = useLatestWorkflowRef(onExpandImageNode);
  const onUpscaleImageNodeRef = useLatestWorkflowRef(onUpscaleImageNode);
  const onSubmitImageUpscaleNodeRef = useLatestWorkflowRef(
    onSubmitImageUpscaleNode,
  );
  const onTrimVideoNodeRef = useLatestWorkflowRef(onTrimVideoNode);
  const onCropVideoNodeRef = useLatestWorkflowRef(onCropVideoNode);
  const onCreateVideoUpscaleNodeRef = useLatestWorkflowRef(
    onCreateVideoUpscaleNode,
  );
  const onSubmitVideoUpscaleNodeRef = useLatestWorkflowRef(
    onSubmitVideoUpscaleNode,
  );
  const onAnalyzeVideoNodeRef = useLatestWorkflowRef(onAnalyzeVideoNode);
  const onSeparateVideoAudioNodeRef = useLatestWorkflowRef(
    onSeparateVideoAudioNode,
  );
  const onRemoveVideoSubtitlesNodeRef = useLatestWorkflowRef(
    onRemoveVideoSubtitlesNode,
  );
  const workflowNodeActions = useMemo(
    () => ({
      onUpdateNode: (id: string, patch: Partial<LibTvWorkflowNode["data"]>) =>
        onUpdateNodeRef.current?.(id, patch),
      onMoveNode: (
        id: string,
        position: Partial<{
          x: number;
          y: number;
          width: number;
          height: number;
        }>,
      ) => onMoveNodeRef.current(id, position),
      onMoveNodes: (
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
      ) => onMoveNodesRef.current?.(patches),
      onCreateScriptInputNode: (
        id: string,
        type: ScriptInputCreationType,
        initialContent?: string,
      ) => onCreateScriptInputNodeRef.current?.(id, type, initialContent),
      onAddLinkedNode: (
        sourceId: string,
        kind: LibTvWorkflowNode["kind"],
        side: "left" | "right",
        position?: { x: number; y: number },
      ) => onAddLinkedNodeRef.current?.(sourceId, kind, side, position),
      onImportScriptV2Assets: (
        sourceId: string,
        request: ScriptV2AssetImportRequest,
      ) => onImportScriptV2AssetsRef.current?.(sourceId, request),
      onRunTextGeneratorPreset: (sourceId: string, optionId: string) =>
        onRunTextGeneratorPresetRef.current?.(sourceId, optionId),
      onRunVideoGeneratorPreset: (sourceId: string, optionId: string) =>
        onRunVideoGeneratorPresetRef.current?.(sourceId, optionId),
      onRunImageToolbarPreset: (sourceId: string, presetId: string) =>
        onRunImageToolbarPresetRef.current?.(sourceId, presetId),
      onCreateAngleEditNode: (
        sourceId: string,
        request: WorkflowAngleEditCreateRequest,
      ) => onCreateAngleEditNodeRef.current?.(sourceId, request),
      onCreatePortraitTexturePreset: (sourceId: string) =>
        onCreatePortraitTexturePresetRef.current?.(sourceId),
      onCreateEmotionAdjustmentPreset: (
        sourceId: string,
        request: WorkflowEmotionAdjustmentCreateRequest,
      ) => onCreateEmotionAdjustmentPresetRef.current?.(sourceId, request),
      onReferenceFilesUploaded: (id: string, files: File[]) =>
        onReferenceFilesUploadedRef.current?.(id, files),
      onCreateImageUpscalePreset: (id: string) =>
        onCreateImageUpscalePresetRef.current?.(id),
      onImageUpscalePresetFilesUploaded: (id: string, files: File[]) =>
        onImageUpscalePresetFilesUploadedRef.current?.(id, files),
      onReferenceNodeRemoved: (id: string, sourceId: string) =>
        onReferenceNodeRemovedRef.current?.(id, sourceId),
      onStartFocusPick: (id: string) => {
        setNodeContextMenu(null);
        setEdgeContextMenu(null);
        setPaneContextMenu(null);
        setNodeCommandMenu(null);
        setFocusPickOverlay(null);
        setFocusPickTargetId(id);
        message.info("已进入聚焦模式，请在画布图片上框选区域");
      },
      onCompleteFocusPick: (
        sourceId: string,
        rect: WorkflowCropRect,
        displaySize: { width: number; height: number },
      ) => {
        const targetId = focusPickTargetIdRef.current;
        if (!targetId) return;
        const sourceNode = workflowNodesRef.current.find(
          (item) => item.id === sourceId,
        );
        const targetNode = workflowNodesRef.current.find(
          (item) => item.id === targetId,
        );
        const mediaUrl = String(sourceNode?.data?.mediaUrl || "").trim();
        if (
          !sourceNode ||
          !isWorkflowOrdinaryImageNode(sourceNode) ||
          !mediaUrl
        ) {
          message.warning("请选择一张普通图片节点");
          return;
        }
        if (
          !targetNode ||
          targetNode.kind !== "image" ||
          targetNode.data?.mediaRole !== "generator"
        ) {
          message.warning("聚焦目标节点不存在");
          setFocusPickTargetId(null);
          setFocusPickOverlay(null);
          return;
        }
        if (rect.width < 12 || rect.height < 12) {
          message.warning("聚焦区域太小，请重新框选");
          setFocusPickOverlay(null);
          return;
        }
        const normalizedRect: WorkflowCropRect = {
          x: Math.max(0, Math.min(displaySize.width - rect.width, rect.x)),
          y: Math.max(0, Math.min(displaySize.height - rect.height, rect.y)),
          width: Math.max(1, Math.min(displaySize.width, rect.width)),
          height: Math.max(1, Math.min(displaySize.height, rect.height)),
        };
        const startRelX = clampWorkflowNumber(
          normalizedRect.x / Math.max(1, displaySize.width),
          0,
          1,
        );
        const startRelY = clampWorkflowNumber(
          normalizedRect.y / Math.max(1, displaySize.height),
          0,
          1,
        );
        const endRelX = clampWorkflowNumber(
          (normalizedRect.x + normalizedRect.width) /
            Math.max(1, displaySize.width),
          0,
          1,
        );
        const endRelY = clampWorkflowNumber(
          (normalizedRect.y + normalizedRect.height) /
            Math.max(1, displaySize.height),
          0,
          1,
        );
        setFocusPickOverlay({
          nodeId: sourceId,
          startRelX,
          startRelY,
          endRelX,
          endRelY,
          status: "uploading",
        });
        void cropWorkflowImageToFile(
          mediaUrl,
          normalizedRect,
          displaySize,
          `workflow-focus-${Date.now()}.png`,
        )
          .then((file) => uploadCanvasNodeFile(file))
          .then(({ libtvUrl, publicUrl }) => {
            const uploadedUrl = String(libtvUrl || publicUrl || "").trim();
            if (!uploadedUrl) throw new Error("聚焦图上传结果为空");
            const latestTargetNode = workflowNodesRef.current.find(
              (item) => item.id === targetId,
            );
            const currentImages = Array.isArray(
              latestTargetNode?.data?.referenceImages,
            )
              ? latestTargetNode.data.referenceImages
              : [];
            const currentNodeIds = Array.isArray(
              latestTargetNode?.data?.referenceImageNodeIds,
            )
              ? latestTargetNode.data.referenceImageNodeIds
              : [];
            const currentRoles = Array.isArray(
              latestTargetNode?.data?.referenceImageRoles,
            )
              ? latestTargetNode.data.referenceImageRoles
              : [];
            const nextImages = [...currentImages];
            const nextNodeIds = [...currentNodeIds];
            const nextRoles = [...currentRoles];
            const existingFocusIndex = nextRoles.findIndex(
              (role) => role === "focus",
            );
            if (existingFocusIndex >= 0) {
              nextImages[existingFocusIndex] = uploadedUrl;
              nextNodeIds[existingFocusIndex] = "";
              nextRoles[existingFocusIndex] = "focus";
            } else {
              nextImages.push(uploadedUrl);
              nextNodeIds.push("");
              nextRoles.push("focus");
            }
            onUpdateNodeRef.current?.(targetId, {
              referenceImages: nextImages.slice(-14),
              referenceImageNodeIds: nextNodeIds.slice(-14),
              referenceImageRoles: nextRoles.slice(-14),
            });
            setFocusPickTargetId(null);
            setFocusPickOverlay((current) =>
              current?.nodeId === sourceId
                ? { ...current, status: "done" }
                : current,
            );
            window.setTimeout(() => {
              setFocusPickOverlay((current) =>
                current?.nodeId === sourceId && current.status === "done"
                  ? null
                  : current,
              );
            }, 1600);
            message.success("已添加聚焦参考图");
          })
          .catch((error) => {
            message.error(
              error instanceof Error ? error.message : "聚焦图上传失败",
            );
            setFocusPickOverlay(null);
          });
      },
      onMediaFileReplace: (id: string, file: File) =>
        onMediaFileReplaceRef.current?.(id, file),
      onGenerateNode: (
        id: string,
        promptDraft?: string,
        settings?: WorkflowGenerationSubmitSettings,
      ) => onGenerateNodeRef.current?.(id, promptDraft, settings),
      onOpenThreeDWorld: (id: string) => onOpenThreeDWorldRef.current?.(id),
      onOpenDirectorConsole3D: (id: string) =>
        onOpenDirectorConsole3DRef.current?.(id),
      onCreateDirectorConsoleCaptureNode: (
        id: string,
        capture: LibTvDirectorConsole3DCapture,
        options?: { batchIndex?: number; batchTotal?: number },
      ) =>
        onCreateDirectorConsoleCaptureNodeRef.current?.(id, capture, options),
      onCreateDirectorConsoleVideoNode: (
        id: string,
        exported: LibTvDirectorConsole3DVideoExport,
      ) => onCreateDirectorConsoleVideoNodeRef.current?.(id, exported),
      onGenerateStoryboard: (
        id: string,
        request: WorkflowStoryboardGenerateRequest,
      ) => onGenerateStoryboardRef.current?.(id, request),
      onRegenerateStoryboardImages: (id: string) =>
        onRegenerateStoryboardImagesRef.current?.(id),
      onGenerateStoryboardVideos: (
        id: string,
        request: WorkflowStoryboardVideoGenerateRequest,
      ) => onGenerateStoryboardVideosRef.current?.(id, request),
      onConvertGroupToStoryboard: (id: string) =>
        onConvertGroupToStoryboardRef.current?.(id),
      onRunGroup: (id: string) => onRunGroupRef.current?.(id),
      onDisconnectEdge: (edgeId: string) =>
        onDisconnectEdgeRef.current?.(edgeId),
      onDeleteNode: (id: string) => onDeleteNodeRef.current?.(id),
      onUngroupNode: (id: string) => onUngroupNodeRef.current?.(id),
      onDownloadNode: (id: string) => onDownloadNodeRef.current?.(id),
      onSaveNodeToMaterials: (id: string) =>
        onSaveNodeToMaterialsRef.current?.(id),
      onReportNodeIssue: (id: string) => onReportNodeIssueRef.current?.(id),
      onCreateAnnotatedImageNode: (
        id: string,
        dataUrl: string,
        prompt: string,
      ) => onCreateAnnotatedImageNodeRef.current?.(id, dataUrl, prompt),
      onRemoveBackgroundNode: (id: string) =>
        onRemoveBackgroundNodeRef.current?.(id),
      onSplitImageNode: (id: string, request: WorkflowImageGridSplitRequest) =>
        onSplitImageNodeRef.current?.(id, request),
      onRotateImageNode: (id: string) => onRotateImageNodeRef.current?.(id),
      onExpandImageNode: (id: string, request: WorkflowImageExpandRequest) =>
        onExpandImageNodeRef.current?.(id, request),
      onUpscaleImageNode: (id: string, request: WorkflowImageUpscaleRequest) =>
        onUpscaleImageNodeRef.current?.(id, request),
      onSubmitImageUpscaleNode: (
        id: string,
        request: WorkflowImageUpscaleRequest,
      ) => onSubmitImageUpscaleNodeRef.current?.(id, request),
      onTrimVideoNode: (id: string, request: WorkflowVideoTrimRequest) =>
        onTrimVideoNodeRef.current?.(id, request),
      onCropVideoNode: (id: string, request: WorkflowVideoCropRequest) =>
        onCropVideoNodeRef.current?.(id, request),
      onCreateVideoUpscaleNode: (id: string) =>
        onCreateVideoUpscaleNodeRef.current?.(id),
      onSubmitVideoUpscaleNode: (
        id: string,
        request: WorkflowVideoUpscaleRequest,
      ) => onSubmitVideoUpscaleNodeRef.current?.(id, request),
      onAnalyzeVideoNode: (id: string) => onAnalyzeVideoNodeRef.current?.(id),
      onSeparateVideoAudioNode: (
        id: string,
        mode: "audio-video" | "voice" | "background",
      ) => onSeparateVideoAudioNodeRef.current?.(id, mode),
      onRemoveVideoSubtitlesNode: (id: string) =>
        onRemoveVideoSubtitlesNodeRef.current?.(id),
      onRequestGenerationFrame: (nodeId: string, nextAspectRatio: string) => {
        const targetNode = workflowNodesRef.current.find(
          (item) => item.id === nodeId,
        );
        if (!targetNode) return;
        const targetFrame = getWorkflowRenderedNodeFrame(targetNode);
        const currentWidth = targetFrame.width;
        const currentHeight = targetFrame.height;
        const ratioSize = parseWorkflowAspectRatioSize(nextAspectRatio);
        const displayFrame =
          targetNode.kind === "video" &&
          isWorkflowVideoGeneratorNode(targetNode)
            ? getWorkflowVideoGeneratorFrame(nextAspectRatio)
            : workflowImageDisplayFrameFromRatio(
                ratioSize.width,
                ratioSize.height,
              );
        const nextFrame = {
          width: displayFrame.width,
          height: displayFrame.height,
          x: Math.round(
            Number(targetNode.x || 0) +
              currentWidth / 2 -
              displayFrame.width / 2,
          ),
          y: Math.round(
            Number(targetNode.y || 0) +
              currentHeight / 2 -
              displayFrame.height / 2,
          ),
        };
        const currentX = Number(targetNode.x || 0);
        const currentY = Number(targetNode.y || 0);
        if (
          Math.round(currentWidth) === nextFrame.width &&
          Math.round(currentHeight) === nextFrame.height &&
          Math.round(currentX) === nextFrame.x &&
          Math.round(currentY) === nextFrame.y
        ) {
          return;
        }
        onMoveNodeRef.current(nodeId, nextFrame);
      },
      onRequestImageResultFrame: (nodeId: string, imageUrl: string) => {
        const targetNode = workflowNodesRef.current.find(
          (item) => item.id === nodeId,
        );
        const normalizedUrl = String(imageUrl || "").trim();
        if (!targetNode || !normalizedUrl) return;
        const targetFrame = getWorkflowRenderedNodeFrame(targetNode);
        const currentWidth = targetFrame.width;
        const currentHeight = targetFrame.height;
        const centerX = Number(targetNode.x || 0) + currentWidth / 2;
        const centerY = Number(targetNode.y || 0) + currentHeight / 2;
        void readWorkflowImageUrlSize(normalizedUrl)
          .then((size) => {
            onUpdateNodeRef.current?.(nodeId, {
              workflowMediaNaturalWidth: size.width,
              workflowMediaNaturalHeight: size.height,
            });
            const latestNode = workflowNodesRef.current.find(
              (item) => item.id === nodeId,
            );
            if (
              latestNode?.data?.workflowMediaUserResized === true ||
              (latestNode?.data as any)?.workflowMediaUserMoved === true
            )
              return;
            const latestMediaUrl = String(
              latestNode?.data?.mediaUrl || "",
            ).trim();
            if (latestMediaUrl && latestMediaUrl !== normalizedUrl) return;
            const latestFrame = latestNode
              ? getWorkflowRenderedNodeFrame(latestNode)
              : targetFrame;
            const latestCenterX = latestNode
              ? Number(latestNode.x || 0) + latestFrame.width / 2
              : centerX;
            const latestCenterY = latestNode
              ? Number(latestNode.y || 0) + latestFrame.height / 2
              : centerY;
            const displayFrame = workflowImageDisplayFrameFromRatio(
              size.width,
              size.height,
            );
            onMoveNodeRef.current(nodeId, {
              width: displayFrame.width,
              height: displayFrame.height,
              x: Math.round(latestCenterX - displayFrame.width / 2),
              y: Math.round(latestCenterY - displayFrame.height / 2),
            });
          })
          .catch(() => undefined);
      },
    }),
    [],
  );
  const nodeKindById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node.kind])),
    [nodes],
  );
  const activeConnectionEdgePairs = useMemo(() => {
    const pairs = new Set<string>();
    for (const edge of edges) {
      pairs.add(`${edge.source}\u0000${edge.target}`);
      pairs.add(`${edge.target}\u0000${edge.source}`);
    }
    return pairs;
  }, [edges]);
  const connectionHandlesDisabledNodeIds = useMemo(
    () => getWorkflowStandaloneStoryboardImageGridChildIds(nodes),
    [nodes],
  );
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeEdgeNodeIds = selectedIdSet;
  const suppressPerNodeFloatingControls = readOnly || selectedIds.length > 1;
  const selectionBounds = useMemo(
    () => getWorkflowSelectionBounds(nodes, selectedIds),
    [nodes, selectedIds],
  );
  const [virtualizationWindow, setVirtualizationWindow] = useState(() => ({
    viewport: {
      x: Number(stagePos?.x ?? 0),
      y: Number(stagePos?.y ?? 0),
      zoom: Number(zoom ?? 1),
    },
    width: 1920,
    height: 1080,
  }));
  const handleVirtualizationWindowChange = useCallback(
    (viewport: Viewport, size: { width: number; height: number }) => {
      const next = {
        viewport: {
          x: Number(viewport.x || 0),
          y: Number(viewport.y || 0),
          zoom: Number(viewport.zoom || 1),
        },
        width: Math.max(1, Number(size.width || 1)),
        height: Math.max(1, Number(size.height || 1)),
      };
      setVirtualizationWindow((current) =>
        Math.abs(current.viewport.x - next.viewport.x) < 0.5 &&
        Math.abs(current.viewport.y - next.viewport.y) < 0.5 &&
        Math.abs(current.viewport.zoom - next.viewport.zoom) < 0.0005 &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next,
      );
    },
    [],
  );
  useEffect(() => {
    const nextViewport = {
      x: Number(stagePos?.x ?? 0),
      y: Number(stagePos?.y ?? 0),
      zoom: Number(zoom ?? 1),
    };
    setVirtualizationWindow((current) =>
      Math.abs(current.viewport.x - nextViewport.x) < 0.5 &&
      Math.abs(current.viewport.y - nextViewport.y) < 0.5 &&
      Math.abs(current.viewport.zoom - nextViewport.zoom) < 0.0005
        ? current
        : { ...current, viewport: nextViewport },
    );
  }, [stagePos?.x, stagePos?.y, zoom]);
  const workflowNodeViewportIndex = useMemo(
    () =>
      createLibTvViewportIndex(nodes, {
        getRect: (node) => {
          const frame = getWorkflowRenderedNodeFrame(node);
          return {
            x: Number(node.x || 0),
            y: Number(node.y || 0),
            width: frame.width,
            height: frame.height,
          };
        },
      }),
    [nodes],
  );
  const workflowVirtualizationForcedIds = useMemo(() => {
    const forced = new Set<string>();
    if (selectedIds.length <= 24) {
      for (const id of selectedIds) {
        const normalizedId = String(id || "").trim();
        if (normalizedId) forced.add(normalizedId);
      }
    }
    for (const id of [focusPickTargetId, draggingWorkflowNodeId]) {
      const normalizedId = String(id || "").trim();
      if (normalizedId) forced.add(normalizedId);
    }
    return forced;
  }, [draggingWorkflowNodeId, focusPickTargetId, selectedIds]);
  const documentVirtualization = useMemo(() => {
    if (
      !standalone ||
      nodes.length <= LIBTV_WORKFLOW_VIRTUALIZATION_THRESHOLD
    ) {
      return {
        enabled: false,
        ids: null as Set<string> | null,
        nodes,
        stats: {
          enabled: false,
          totalCount: nodes.length,
          renderedCount: nodes.length,
          visibleCount: nodes.length,
          capped: false,
        } satisfies LibTvWorkflowCanvasVirtualizationStats,
      };
    }
    const result = workflowNodeViewportIndex.query(
      virtualizationWindow.viewport,
      virtualizationWindow.width,
      virtualizationWindow.height,
      {
        maxNodes: resolveLibTvWorkflowVirtualNodeLimit(
          virtualizationWindow.viewport.zoom,
        ),
        overscanPx: LIBTV_WORKFLOW_VIRTUAL_OVERSCAN_PX,
        forcedIds: workflowVirtualizationForcedIds,
        fallbackId: nodes[0]?.id,
      },
    );
    return {
      enabled: true,
      ids: result.ids,
      nodes: result.nodes,
      stats: {
        enabled: true,
        totalCount: result.totalCount,
        renderedCount: result.nodes.length,
        visibleCount: result.visibleCount,
        capped: result.capped,
      } satisfies LibTvWorkflowCanvasVirtualizationStats,
    };
  }, [
    nodes,
    standalone,
    virtualizationWindow,
    workflowNodeViewportIndex,
    workflowVirtualizationForcedIds,
  ]);
  const workflowNodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const workflowEdgeViewportIndex = useMemo(
    () => createLibTvViewportEdgeIndex(edges),
    [edges],
  );

  useEffect(() => {
    lastSelectionIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    let cancelled = false;
    fetchWorkflowModelOptionsBootstrap()
      .then((payload) => {
        if (cancelled) return;
        const rawModels = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.models)
            ? payload.models
            : [];
        populateWorkflowModelOptionsCache(rawModels);
      })
      .catch(() => {
        if (cancelled) return;
        for (const category of WORKFLOW_MODEL_CATEGORIES) {
          if (!workflowModelOptionsCache.has(category))
            workflowModelOptionsCache.set(category, []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const incomingEdgeNodeIds = useMemo(
    () => new Set(edges.map((edge) => edge.target)),
    [edges],
  );
  const outgoingEdgeNodeIds = useMemo(
    () => new Set(edges.map((edge) => edge.source)),
    [edges],
  );
  const incomingTextEdgeNodeIds = useMemo(() => {
    const nodeIds = new Set<string>();
    for (const edge of edges) {
      if (
        nodeKindById.get(edge.source) === "text" &&
        nodeKindById.get(edge.target) === "text"
      ) {
        nodeIds.add(edge.target);
      }
    }
    return nodeIds;
  }, [edges, nodeKindById]);
  const outgoingTextEdgeNodeIds = useMemo(() => {
    const nodeIds = new Set<string>();
    for (const edge of edges) {
      if (
        nodeKindById.get(edge.source) === "text" &&
        nodeKindById.get(edge.target) === "text"
      ) {
        nodeIds.add(edge.source);
      }
    }
    return nodeIds;
  }, [edges, nodeKindById]);
  const canvasImageAssets = useMemo<ScriptV2CanvasImageAsset[]>(() => {
    return nodes
      .filter((node) => {
        const mediaUrl = String(node.data?.mediaUrl || "").trim();
        if (node.kind !== "image" || !mediaUrl) return false;
        return (
          node.data?.mediaRole !== "generator" ||
          isWorkflowImageGeneratorResultNode(node)
        );
      })
      .map((node, index) => ({
        id: node.id,
        title:
          String(node.data?.title || `图片 ${index + 1}`).trim() ||
          `图片 ${index + 1}`,
        imageUrl: String(node.data?.mediaUrl || "").trim(),
        prompt: String(node.data?.prompt || node.data?.content || "").trim(),
      }));
  }, [nodes]);

  const workflowFlowNodeContext = useMemo(() => {
    const nodeById = workflowNodeById;
    const groupChildrenById = new Map<string, LibTvWorkflowNode[]>();
    const explicitGroupMembersById = new Map<string, LibTvWorkflowNode[]>();
    const explicitGroupIdsByNodeId = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.kind !== "group") continue;
      groupChildrenById.set(node.id, []);
      const memberIds = Array.isArray(node.data?.groupNodeIds)
        ? Array.from(new Set(node.data.groupNodeIds.map(String)))
        : [];
      if (memberIds.length === 0) continue;
      explicitGroupMembersById.set(node.id, []);
      for (const memberId of memberIds) {
        const groupIds = explicitGroupIdsByNodeId.get(memberId) || [];
        groupIds.push(node.id);
        explicitGroupIdsByNodeId.set(memberId, groupIds);
      }
    }
    // Build each group's child list once, preserving the original node order and
    // avoiding a full `nodes.filter(...)` scan for every rendered group.
    for (const node of nodes) {
      const groupIds = explicitGroupIdsByNodeId.get(node.id) || [];
      if (node.parentId && groupChildrenById.has(node.parentId)) {
        groupChildrenById.get(node.parentId)?.push(node);
      }
      for (const groupId of groupIds) {
        explicitGroupMembersById.get(groupId)?.push(node);
        if (groupId === node.parentId) continue;
        groupChildrenById.get(groupId)?.push(node);
      }
    }
    const upstreamNodesByTarget = new Map<
      string,
      WorkflowUpstreamNodeSummary[]
    >();
    for (const edge of edges) {
      const sourceNode = nodeById.get(edge.source);
      if (!sourceNode) continue;
      const targetNode = nodeById.get(edge.target);
      if (
        targetNode?.kind === "image" &&
        String(targetNode.data?.workflowStoryboardSourceNodeId || "").trim()
      ) {
        if (
          !isWorkflowOrdinaryImageNode(sourceNode) &&
          !isWorkflowImageGeneratorResultGroupNode(sourceNode)
        )
          continue;
      }
      const items = upstreamNodesByTarget.get(edge.target) || [];
      items.push(makeWorkflowUpstreamNodeSummary(sourceNode));
      upstreamNodesByTarget.set(edge.target, items);
    }
    const visibleWorkflowNodes = nodes.filter((workflowNode) => {
      if (!workflowNode.parentId) return true;
      const parentNode = nodeById.get(workflowNode.parentId);
      if (!parentNode) return false;
      const parentChildNodes =
        parentNode?.kind === "group"
          ? groupChildrenById.get(parentNode.id) || []
          : [];
      const isParentImageResultGroup = isWorkflowImageResultGroupContainer(
        parentNode,
        parentChildNodes,
      );
      return !isParentImageResultGroup;
    });
    const visibleNodeIds = new Set(visibleWorkflowNodes.map((node) => node.id));
    const originalIndexById = new Map(
      visibleWorkflowNodes.map((node, index) => [node.id, index]),
    );
    const visibleParentDepthById = new Map<string, number>();
    const getVisibleParentDepth = (node: LibTvWorkflowNode) => {
      const cachedDepth = visibleParentDepthById.get(node.id);
      if (cachedDepth !== undefined) return cachedDepth;
      let depth = 0;
      let cursor: LibTvWorkflowNode | undefined = node;
      const seen = new Set<string>();
      const path: string[] = [];
      let cycleDetected = false;
      while (
        cursor?.parentId &&
        visibleNodeIds.has(cursor.parentId) &&
        !seen.has(cursor.id)
      ) {
        const knownDepth = visibleParentDepthById.get(cursor.id);
        if (knownDepth !== undefined) {
          depth += knownDepth;
          cursor = undefined;
          break;
        }
        seen.add(cursor.id);
        path.push(cursor.id);
        depth += 1;
        cursor = nodeById.get(cursor.parentId);
      }
      if (cursor && seen.has(cursor.id)) {
        cycleDetected = true;
      }
      if (!cycleDetected) {
        for (let index = 0; index < path.length; index += 1) {
          visibleParentDepthById.set(path[index], depth - index);
        }
      }
      return depth;
    };
    const storyboardGroupsBySourceId = new Map<
      string,
      Array<{ group: LibTvWorkflowNode; imageChildren: LibTvWorkflowNode[] }>
    >();
    for (const group of nodes) {
      if (
        !isWorkflowStoryboardGroupNode(
          group,
          groupChildrenById.get(group.id) || [],
        )
      )
        continue;
      const imageChildrenBySourceId = new Map<string, LibTvWorkflowNode[]>();
      for (const child of groupChildrenById.get(group.id) || []) {
        if (child.kind !== "image") continue;
        const sourceId = String(
          (child.data as any)?.workflowStoryboardSourceNodeId || "",
        ).trim();
        if (!sourceId) continue;
        const imageChildren = imageChildrenBySourceId.get(sourceId) || [];
        imageChildren.push(child);
        imageChildrenBySourceId.set(sourceId, imageChildren);
      }
      for (const [sourceId, imageChildren] of imageChildrenBySourceId) {
        imageChildren.sort((a, b) => {
          const rowA = Number(a.data?.workflowStoryboardSourceRowIndex);
          const rowB = Number(b.data?.workflowStoryboardSourceRowIndex);
          if (Number.isFinite(rowA) && Number.isFinite(rowB) && rowA !== rowB)
            return rowA - rowB;
          return (
            Number(a.data?.workflowGenerationResultIndex ?? 0) -
            Number(b.data?.workflowGenerationResultIndex ?? 0)
          );
        });
        const groups = storyboardGroupsBySourceId.get(sourceId) || [];
        groups.push({ group, imageChildren });
        storyboardGroupsBySourceId.set(sourceId, groups);
      }
    }
    return {
      nodeById,
      groupChildrenById,
      explicitGroupMembersById,
      upstreamNodesByTarget,
      visibleWorkflowNodes,
      visibleNodeIds,
      originalIndexById,
      getVisibleParentDepth,
      storyboardGroupsBySourceId,
    };
  }, [edges, nodes, workflowNodeById]);

  const externalFlowNodes = useMemo<
    Array<Node<WorkflowOverlayNodeData>>
  >(() => {
    const {
      nodeById,
      groupChildrenById,
      explicitGroupMembersById,
      upstreamNodesByTarget,
      visibleWorkflowNodes,
      visibleNodeIds,
      originalIndexById,
      getVisibleParentDepth,
      storyboardGroupsBySourceId,
    } = workflowFlowNodeContext;
    const viewportWorkflowNodes = documentVirtualization.ids
      ? documentVirtualization.nodes.filter((node) =>
          visibleNodeIds.has(node.id),
        )
      : visibleWorkflowNodes;
    return [...viewportWorkflowNodes]
      .sort((a, b) => {
        const depthDiff = getVisibleParentDepth(a) - getVisibleParentDepth(b);
        if (depthDiff !== 0) return depthDiff;
        return (
          (originalIndexById.get(a.id) ?? 0) -
          (originalIndexById.get(b.id) ?? 0)
        );
      })
      .map((workflowNode) => {
        const childNodes =
          workflowNode.kind === "group"
            ? groupChildrenById.get(workflowNode.id) || []
            : [];
        const storyboardVideoGroups =
          workflowNode.kind === "script-v2"
            ? ((storyboardGroupsBySourceId.get(workflowNode.id) || []).map(
                ({ group, imageChildren }) => {
                  const scriptRows = Array.isArray(
                    workflowNode.data?.scriptResult?.rows,
                  )
                    ? workflowNode.data.scriptResult.rows
                    : [];
                  const items = imageChildren.map((child, index) => {
                    const rowIndexValue = Number(
                      child.data?.workflowStoryboardSourceRowIndex,
                    );
                    const rowIndex = Number.isFinite(rowIndexValue)
                      ? rowIndexValue
                      : index;
                    const row = scriptRows[rowIndex];
                    const prompt = String(
                      (child.data as any)
                        ?.workflowStoryboardVideoMotionPrompt ||
                        resolveLibTvStoryboardVideoMotionPrompt(row as any) ||
                        resolveLibTvStoryboardVideoMotionPrompt(
                          child.data as any,
                        ) ||
                        child.data?.prompt ||
                        "",
                    ).trim();
                    return {
                      id: child.id,
                      rowIndex,
                      label: `镜头 ${rowIndex + 1}`,
                      prompt,
                      duration: (() => {
                        const value = String(
                          (child.data as any)?.workflowStoryboardDuration ||
                            (row as any)?.duration ||
                            (workflowNode.data as any)
                              ?.storyboardVideoDuration ||
                            "",
                        ).trim();
                        return value
                          ? normalizeWorkflowDurationLabel(value)
                          : "";
                      })(),
                    };
                  });
                  return {
                    id: group.id,
                    title: String(
                      group.data?.title ||
                        workflowNode.data?.scriptResult?.title ||
                        workflowNode.data?.title ||
                        "分镜图",
                    ).trim(),
                    items,
                    modelId: String(
                      (group.data as any)?.storyboardVideoModelId ||
                        (workflowNode.data as any)?.storyboardVideoModelId ||
                        "",
                    ),
                    aspectRatio: String(
                      (group.data as any)?.storyboardVideoAspectRatio ||
                        (workflowNode.data as any)
                          ?.storyboardVideoAspectRatio ||
                        "",
                    ),
                    videoResolution: String(
                      (group.data as any)?.storyboardVideoResolution ||
                        (workflowNode.data as any)?.storyboardVideoResolution ||
                        "",
                    ),
                    videoDuration: String(
                      (group.data as any)?.storyboardVideoDuration ||
                        (workflowNode.data as any)?.storyboardVideoDuration ||
                        "",
                    ),
                    videoMethod: String(
                      (group.data as any)?.storyboardVideoMethod ||
                        (workflowNode.data as any)?.storyboardVideoMethod ||
                        "",
                    ),
                    generationCount: (() => {
                      const count = Number(
                        (group.data as any)?.storyboardVideoGenerationCount ||
                          (workflowNode.data as any)
                            ?.storyboardVideoGenerationCount,
                      );
                      return Number.isFinite(count)
                        ? Math.max(1, Math.round(count))
                        : undefined;
                    })(),
                    generateAudio:
                      typeof (group.data as any)
                        ?.storyboardVideoGenerateAudio === "boolean"
                        ? Boolean(
                            (group.data as any).storyboardVideoGenerateAudio,
                          )
                        : undefined,
                    enableWebSearch:
                      typeof (group.data as any)?.storyboardVideoWebSearch ===
                      "boolean"
                        ? Boolean((group.data as any).storyboardVideoWebSearch)
                        : undefined,
                    workflowExtraParameters:
                      ((group.data as any)
                        ?.storyboardVideoExtraParameters as LibTvWorkflowNode["data"]["workflowExtraParameters"]) ||
                      ((workflowNode.data as any)
                        ?.storyboardVideoExtraParameters as LibTvWorkflowNode["data"]["workflowExtraParameters"]),
                  } satisfies WorkflowStoryboardVideoGroupSummary;
                },
              ) as WorkflowStoryboardVideoGroupSummary[])
            : undefined;
        const hasParentedImageResultChildren =
          isWorkflowImageResultGroupContainer(workflowNode, childNodes);
        const hasParentedChildren =
          workflowNode.kind === "group" &&
          childNodes.some((item) => item.parentId === workflowNode.id);
        const x = Number(workflowNode.x || 0);
        const y = Number(workflowNode.y || 0);
        const frame = getWorkflowRenderedNodeFrame(workflowNode);
        const memberBounds =
          workflowNode.kind === "group" &&
          !hasParentedChildren &&
          !hasParentedImageResultChildren
            ? getWorkflowGroupMemberBounds(workflowNode, nodes, {
                nodeById,
                members: explicitGroupMembersById.get(workflowNode.id) || [],
              })
            : null;
        const imageResultGroupFrame = hasParentedImageResultChildren
          ? getWorkflowImageResultGroupFrame(workflowNode, childNodes)
          : null;
        const width =
          memberBounds?.width ?? imageResultGroupFrame?.width ?? frame.width;
        const height =
          memberBounds?.height ?? imageResultGroupFrame?.height ?? frame.height;
        const draggable = interactive && !workflowNode.locked;
        const selected = selectedIdSet.has(workflowNode.id);
        const isVideoAnalysisScript =
          isWorkflowVideoAnalysisScriptNode(workflowNode);
        const renderedParentId =
          workflowNode.parentId && visibleNodeIds.has(workflowNode.parentId)
            ? workflowNode.parentId
            : undefined;

        return {
          id: workflowNode.id,
          type: workflowNode.kind,
          position: { x: memberBounds?.x ?? x, y: memberBounds?.y ?? y },
          width,
          height,
          initialWidth: width,
          initialHeight: height,
          parentId: renderedParentId,
          dragHandle: isVideoAnalysisScript
            ? ".workflow-video-story-drag-handle"
            : ".node-shell",
          zIndex:
            workflowNode.kind === "group" && !hasParentedImageResultChildren
              ? 0
              : selected
                ? 80
                : renderedParentId
                  ? 2
                  : 1,
          draggable,
          selectable: interactive,
          data: {
            interactive,
            isDragging: draggingWorkflowNodeId === workflowNode.id,
            nodeEventsSuppressed:
              workflowNode.kind === "script" ||
              workflowNode.kind === "script-v2"
                ? nodeEventsSuppressed
                : undefined,
            isSelected: selected,
            suppressFloatingControls: suppressPerNodeFloatingControls,
            focusPickActive:
              Boolean(focusPickTargetId) &&
              workflowNode.kind === "image" &&
              (workflowNode.data?.mediaRole !== "generator" ||
                isWorkflowImageGeneratorResultNode(workflowNode)),
            focusPickOverlay:
              focusPickOverlay?.nodeId === workflowNode.id
                ? focusPickOverlay
                : null,
            hasIncomingEdge: incomingEdgeNodeIds.has(workflowNode.id),
            hasOutgoingEdge: outgoingEdgeNodeIds.has(workflowNode.id),
            hasIncomingTextEdge: incomingTextEdgeNodeIds.has(workflowNode.id),
            hasOutgoingTextEdge: outgoingTextEdgeNodeIds.has(workflowNode.id),
            connectionNodeById: nodeById,
            connectionEdgePairs: activeConnectionEdgePairs,
            connectionHandlesDisabled: connectionHandlesDisabledNodeIds.has(
              workflowNode.id,
            ),
            childNodes,
            upstreamNodes: upstreamNodesByTarget.get(workflowNode.id) || [],
            canvasImageAssets:
              workflowNode.kind === "script-v2" ? canvasImageAssets : undefined,
            storyboardVideoGroups,
            ...workflowNodeActions,
            projectId,
            workflowNode,
          },
          selected,
          style: {
            width,
            height,
            background: "transparent",
            border: "none",
          },
        };
      });
  }, [
    activeConnectionEdgePairs,
    canvasImageAssets,
    connectionHandlesDisabledNodeIds,
    documentVirtualization.ids,
    draggingWorkflowNodeId,
    focusPickOverlay,
    focusPickTargetId,
    incomingEdgeNodeIds,
    incomingTextEdgeNodeIds,
    interactive,
    nodeEventsSuppressed,
    nodes,
    outgoingEdgeNodeIds,
    outgoingTextEdgeNodeIds,
    projectId,
    selectedIdSet,
    suppressPerNodeFloatingControls,
    workflowFlowNodeContext,
    workflowNodeActions,
  ]);
  const [dragFlowNodes, setDragFlowNodes] = useState<Array<
    Node<WorkflowOverlayNodeData>
  > | null>(null);
  const stableExternalFlowNodesRef = useRef<
    Array<Node<WorkflowOverlayNodeData>>
  >([]);
  const stableExternalFlowNodes = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- per-surface identity cache avoids cross-canvas reuse and must be available in this render.
    const stableNodes = stabilizeWorkflowFlowNodes(
      stableExternalFlowNodesRef.current,
      externalFlowNodes,
    );
    // eslint-disable-next-line react-hooks/refs -- keep the latest stabilized graph local to this mounted surface instance.
    stableExternalFlowNodesRef.current = stableNodes;
    return stableNodes;
  }, [externalFlowNodes]);
  const flowNodes = dragFlowNodes || stableExternalFlowNodes;
  const flowNodesRef = useRef<Array<Node<WorkflowOverlayNodeData>>>(flowNodes);

  useEffect(() => {
    flowNodesRef.current = flowNodes;
  }, [flowNodes]);

  const externalFlowEdges = useMemo<Edge[]>(() => {
    const activeNodeIds = activeEdgeNodeIds;
    const flowNodeIds = new Set(flowNodes.map((node) => node.id));
    return workflowEdgeViewportIndex.query(flowNodeIds).map((edge) => {
      const active =
        activeNodeIds.has(edge.source) || activeNodeIds.has(edge.target);
      const sourceNode = workflowNodeById.get(edge.source);
      const targetNode = workflowNodeById.get(edge.target);
      const isStoryboardEdge = Boolean(
        (sourceNode?.kind === "script" || sourceNode?.kind === "script-v2") &&
        targetNode?.kind === "group" &&
        String(targetNode.data?.workflowStoryboardSourceNodeId || "").trim() ===
          String(sourceNode?.id || "").trim(),
      );
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: isStoryboardEdge
          ? WORKFLOW_SOURCE_HANDLE_RIGHT
          : isScriptV2AssetImageNode(sourceNode)
            ? WORKFLOW_SOURCE_HANDLE_ASSET_UNDER
            : WORKFLOW_SOURCE_HANDLE_RIGHT,
        targetHandle: WORKFLOW_TARGET_HANDLE_LEFT,
        type: "studio",
        selectable: true,
        focusable: interactive,
        zIndex: 1,
        data: {
          active,
          tone: getWorkflowCableTone(sourceNode),
          onDisconnectEdge: workflowNodeActions.onDisconnectEdge,
        },
      };
    });
  }, [
    activeEdgeNodeIds,
    flowNodes,
    interactive,
    workflowEdgeViewportIndex,
    workflowNodeActions.onDisconnectEdge,
    workflowNodeById,
  ]);
  const stableExternalFlowEdgesRef = useRef<Edge[]>([]);
  const flowEdges = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- per-surface identity cache avoids cross-canvas reuse and must be available in this render.
    const stableEdges = stabilizeWorkflowFlowEdges(
      stableExternalFlowEdgesRef.current,
      externalFlowEdges,
    );
    // eslint-disable-next-line react-hooks/refs -- keep the latest stabilized graph local to this mounted surface instance.
    stableExternalFlowEdgesRef.current = stableEdges;
    return stableEdges;
  }, [externalFlowEdges]);

  const returnToFocusPickTarget = useCallback(() => {
    const targetId = focusPickTargetId;
    if (!targetId) return;
    onSelectNode(targetId);
    void flowRef.current?.fitView({
      nodes: [{ id: targetId }],
      padding: 0.35,
      duration: 360,
      maxZoom: 1,
    });
  }, [focusPickTargetId, onSelectNode]);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node<WorkflowOverlayNodeData>) => {
      if (focusPickTargetId) {
        const workflowNode = node.data?.workflowNode;
        if (!workflowNode || !isWorkflowOrdinaryImageNode(workflowNode)) {
          event.preventDefault();
          event.stopPropagation();
          message.warning("请在普通图片节点上框选聚焦区域");
        }
        return;
      }
      if (
        !interactive ||
        isBoxSelectingRef.current ||
        suppressNodeEventsRef.current
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onSelectNode(node.id);
    },
    [focusPickTargetId, interactive, onSelectNode],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node<WorkflowOverlayNodeData>>[]) => {
      const removedNodeIds = Array.from(
        new Set(
          changes
            .filter((change) => change.type === "remove")
            .map((change) => String(change.id || "").trim())
            .filter(Boolean),
        ),
      );
      if (removedNodeIds.length > 0) {
        removedNodeIds.forEach((nodeId) => onDeleteNode?.(nodeId));
        return;
      }
      const measuredChanges = changes.map((change) =>
        change.type === "dimensions"
          ? { ...change, setAttributes: false }
          : change,
      );
      const hasSelectionChange = measuredChanges.some(
        (change) => change.type === "select",
      );
      const hasNonDimensionChange = measuredChanges.some(
        (change) => change.type !== "dimensions",
      );
      const keyboardPositionNodeIds = Array.from(
        new Set(
          measuredChanges
            .flatMap((change) =>
              change.type === "position" && change.dragging === false
                ? [String(change.id || "").trim()]
                : [],
            )
            .filter(Boolean),
        ),
      );
      const nextNodesFromRef = applyNodeChanges(
        measuredChanges,
        flowNodesRef.current,
      );
      if (
        (draggingNodeIdRef.current || keyboardPositionNodeIds.length > 0) &&
        hasNonDimensionChange
      ) {
        flowNodesRef.current = nextNodesFromRef;
      }
      if (
        interactive &&
        keyboardPositionNodeIds.length > 0 &&
        !pointerDragPositionPersistSuppressedRef.current
      ) {
        const persistNodeIds = new Set(
          getWorkflowDragPersistNodeIds(
            workflowNodesRef.current,
            keyboardPositionNodeIds,
          ),
        );
        const nextNodeById = new Map(
          nextNodesFromRef.map((node) => [node.id, node]),
        );
        const movePatches = keyboardPositionNodeIds.flatMap((nodeId) => {
          if (!persistNodeIds.has(nodeId)) return [];
          const nextNode = nextNodeById.get(nodeId);
          if (!nextNode) return [];
          return [
            {
              id: nodeId,
              position: {
                x: Number(nextNode.position.x || 0),
                y: Number(nextNode.position.y || 0),
              },
              data: { workflowMediaUserMoved: true } as Partial<
                LibTvWorkflowNode["data"]
              >,
            },
          ];
        });
        if (movePatches.length > 0) {
          if (onMoveNodes) onMoveNodes(movePatches);
          else
            movePatches.forEach((patch) => {
              onMoveNode(patch.id, patch.position);
              onUpdateNode?.(patch.id, patch.data);
            });
        }
      }
      if (!interactive || !hasSelectionChange) return;
      const nextIds = getSelectedWorkflowFlowNodeIds(nextNodesFromRef);
      const currentIds = [...lastSelectionIdsRef.current].sort();
      if (areWorkflowSelectionIdsEqual(currentIds, nextIds)) return;
      lastSelectionIdsRef.current = nextIds;
      onSelectionChange?.(nextIds);
    },
    [
      interactive,
      onDeleteNode,
      onMoveNode,
      onMoveNodes,
      onSelectionChange,
      onUpdateNode,
    ],
  );

  const handleRenderNodesChange = useCallback(
    (nextNodes: Array<Node<WorkflowOverlayNodeData>>) => {
      flowNodesRef.current = nextNodes;
    },
    [],
  );

  const getWorkflowGroupDragContext = useCallback(
    (draggedNodeId: string) => {
      const draggedWorkflowNode = nodes.find(
        (item) => item.id === draggedNodeId,
      );
      if (!draggedWorkflowNode) return null;
      const groupNode =
        draggedWorkflowNode.kind === "group"
          ? draggedWorkflowNode
          : nodes.find(
              (item) =>
                item.kind === "group" &&
                Array.isArray(item.data?.groupNodeIds) &&
                item.data.groupNodeIds.includes(draggedNodeId) &&
                !nodes.some((child) => child.parentId === item.id),
            );
      if (
        !groupNode ||
        groupNode.kind !== "group" ||
        !Array.isArray(groupNode.data?.groupNodeIds) ||
        groupNode.data.groupNodeIds.length === 0 ||
        nodes.some((item) => item.parentId === groupNode.id)
      ) {
        return null;
      }
      const memberIds = new Set(groupNode.data.groupNodeIds);
      const memberPositions = new Map(
        nodes
          .filter((item) => memberIds.has(item.id))
          .map((item) => [
            item.id,
            { x: Number(item.x || 0), y: Number(item.y || 0) },
          ]),
      );
      if (memberPositions.size === 0) return null;
      const groupPosition = getWorkflowGroupMemberBounds(groupNode, nodes) || {
        x: Number(groupNode.x || 0),
        y: Number(groupNode.y || 0),
      };
      return {
        groupNode,
        groupPosition: { x: groupPosition.x, y: groupPosition.y },
        memberPositions,
      };
    },
    [nodes],
  );

  const handleNodeDragStart = useCallback<
    OnNodeDrag<Node<WorkflowOverlayNodeData>>
  >(
    (_event, node) => {
      if (isBoxSelectingRef.current || suppressNodeEventsRef.current) return;
      if (pointerDragPersistReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerDragPersistReleaseFrameRef.current);
        pointerDragPersistReleaseFrameRef.current = null;
      }
      pointerDragPositionPersistSuppressedRef.current = true;
      draggingNodeIdRef.current = node.id;
      setDraggingWorkflowNodeId(node.id);
      const visibleFlowNodeIds = new Set(
        flowNodesRef.current.map((item) => item.id),
      );
      const selectedNodeIds = selectedIds.filter((id) =>
        visibleFlowNodeIds.has(id),
      );
      if (selectedNodeIds.length > 1 && selectedNodeIds.includes(node.id)) {
        const nodePositions = new Map<string, { x: number; y: number }>();
        for (const selectedId of selectedNodeIds) {
          const selectedNode = flowNodesRef.current.find(
            (item) => item.id === selectedId,
          );
          if (!selectedNode) continue;
          nodePositions.set(selectedId, {
            x: Number(selectedNode.position.x || 0),
            y: Number(selectedNode.position.y || 0),
          });
        }
        if (nodePositions.size > 0) {
          setDragFlowNodes(flowNodesRef.current);
          selectionDragStartRef.current = {
            draggedNodeId: node.id,
            dragStartPosition: {
              x: Number(node.position.x || 0),
              y: Number(node.position.y || 0),
            },
            nodePositions,
          };
          groupDragStartRef.current = null;
          return;
        }
      }
      const groupDragContext = getWorkflowGroupDragContext(node.id);
      if (!groupDragContext) {
        groupDragStartRef.current = null;
        selectionDragStartRef.current = null;
        return;
      }
      setDragFlowNodes(flowNodesRef.current);
      selectionDragStartRef.current = null;
      groupDragStartRef.current = {
        groupId: groupDragContext.groupNode.id,
        dragNodeId: node.id,
        dragStartPosition: {
          x: Number(node.position.x || 0),
          y: Number(node.position.y || 0),
        },
        groupStartPosition: {
          x: Number(groupDragContext.groupNode.x || 0),
          y: Number(groupDragContext.groupNode.y || 0),
        },
        groupPosition: groupDragContext.groupPosition,
        memberPositions: groupDragContext.memberPositions,
      };
    },
    [getWorkflowGroupDragContext, selectedIds],
  );

  useEffect(() => {
    return () => {
      if (suppressNodeEventsTimeoutRef.current !== null) {
        window.clearTimeout(suppressNodeEventsTimeoutRef.current);
      }
      if (pointerDragPersistReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerDragPersistReleaseFrameRef.current);
      }
    };
  }, []);

  const handleNodeDrag = useCallback<OnNodeDrag<Node<WorkflowOverlayNodeData>>>(
    (_event, node) => {
      if (isBoxSelectingRef.current || suppressNodeEventsRef.current) return;
      const selectionDragStart = selectionDragStartRef.current;
      if (selectionDragStart?.draggedNodeId === node.id) {
        const deltaX =
          Number(node.position.x || 0) - selectionDragStart.dragStartPosition.x;
        const deltaY =
          Number(node.position.y || 0) - selectionDragStart.dragStartPosition.y;
        setDragFlowNodes((currentNodes) => {
          const nextNodes = (currentNodes || flowNodesRef.current).map(
            (currentNode) => {
              const startPosition = selectionDragStart.nodePositions.get(
                currentNode.id,
              );
              if (!startPosition) return currentNode;
              return {
                ...currentNode,
                position: {
                  x: startPosition.x + deltaX,
                  y: startPosition.y + deltaY,
                },
              };
            },
          );
          flowNodesRef.current = nextNodes;
          return nextNodes;
        });
        return;
      }
      const groupDragStart = groupDragStartRef.current;
      if (groupDragStart?.dragNodeId === node.id) {
        const deltaX =
          Number(node.position.x || 0) - groupDragStart.dragStartPosition.x;
        const deltaY =
          Number(node.position.y || 0) - groupDragStart.dragStartPosition.y;
        setDragFlowNodes((currentNodes) => {
          const nextNodes = (currentNodes || flowNodesRef.current).map(
            (currentNode) => {
              if (currentNode.id === groupDragStart.groupId) {
                return {
                  ...currentNode,
                  position: {
                    x: groupDragStart.groupPosition.x + deltaX,
                    y: groupDragStart.groupPosition.y + deltaY,
                  },
                };
              }
              const memberStart = groupDragStart.memberPositions.get(
                currentNode.id,
              );
              if (!memberStart) return currentNode;
              return {
                ...currentNode,
                position: {
                  x: memberStart.x + deltaX,
                  y: memberStart.y + deltaY,
                },
              };
            },
          );
          flowNodesRef.current = nextNodes;
          return nextNodes;
        });
      }
    },
    [],
  );

  const handleNodeDragStop = useCallback<
    OnNodeDrag<Node<WorkflowOverlayNodeData>>
  >(
    (_event, node) => {
      draggingNodeIdRef.current = null;
      setDraggingWorkflowNodeId(null);
      if (pointerDragPersistReleaseFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerDragPersistReleaseFrameRef.current);
      }
      pointerDragPersistReleaseFrameRef.current = window.requestAnimationFrame(
        () => {
          pointerDragPersistReleaseFrameRef.current =
            window.requestAnimationFrame(() => {
              pointerDragPersistReleaseFrameRef.current = null;
              pointerDragPositionPersistSuppressedRef.current = false;
            });
        },
      );
      if (isBoxSelectingRef.current || suppressNodeEventsRef.current) return;
      const selectionDragStart = selectionDragStartRef.current;
      selectionDragStartRef.current = null;
      const groupDragStart = groupDragStartRef.current;
      groupDragStartRef.current = null;
      if (selectionDragStart?.draggedNodeId === node.id) {
        const deltaX =
          Number(node.position.x || 0) - selectionDragStart.dragStartPosition.x;
        const deltaY =
          Number(node.position.y || 0) - selectionDragStart.dragStartPosition.y;
        setDragFlowNodes((currentNodes) => {
          const nextNodes = (currentNodes || flowNodesRef.current).map(
            (currentNode) => {
              const startPosition = selectionDragStart.nodePositions.get(
                currentNode.id,
              );
              if (!startPosition) return currentNode;
              return {
                ...currentNode,
                position: {
                  x: startPosition.x + deltaX,
                  y: startPosition.y + deltaY,
                },
              };
            },
          );
          flowNodesRef.current = nextNodes;
          return nextNodes;
        });
        const persistNodeIds = new Set(
          getWorkflowDragPersistNodeIds(
            workflowNodesRef.current,
            Array.from(selectionDragStart.nodePositions.keys()),
          ),
        );
        const movePatches: Array<{
          id: string;
          position: Partial<{
            x: number;
            y: number;
            width: number;
            height: number;
          }>;
          data?: Partial<LibTvWorkflowNode["data"]>;
        }> = [];
        selectionDragStart.nodePositions.forEach((position, selectedId) => {
          if (!persistNodeIds.has(selectedId)) return;
          movePatches.push({
            id: selectedId,
            position: {
              x: position.x + deltaX,
              y: position.y + deltaY,
            },
            data: { workflowMediaUserMoved: true } as Partial<
              LibTvWorkflowNode["data"]
            >,
          });
        });
        if (onMoveNodes) onMoveNodes(movePatches);
        else
          movePatches.forEach((patch) => {
            onMoveNode(patch.id, patch.position);
            onUpdateNode?.(patch.id, patch.data || {});
          });
        window.requestAnimationFrame(() => {
          if (!draggingNodeIdRef.current) setDragFlowNodes(null);
        });
        return;
      }
      const deltaX =
        Number(node.position.x || 0) -
        Number(groupDragStart?.dragStartPosition.x || 0);
      const deltaY =
        Number(node.position.y || 0) -
        Number(groupDragStart?.dragStartPosition.y || 0);
      if (groupDragStart) {
        setDragFlowNodes((currentNodes) => {
          const nextNodes = (currentNodes || flowNodesRef.current).map(
            (currentNode) =>
              currentNode.id === groupDragStart.groupId
                ? {
                    ...currentNode,
                    position: {
                      x: groupDragStart.groupPosition.x + deltaX,
                      y: groupDragStart.groupPosition.y + deltaY,
                    },
                  }
                : groupDragStart.memberPositions.has(currentNode.id)
                  ? {
                      ...currentNode,
                      position: {
                        x:
                          groupDragStart.memberPositions.get(currentNode.id)!
                            .x + deltaX,
                        y:
                          groupDragStart.memberPositions.get(currentNode.id)!
                            .y + deltaY,
                      },
                    }
                  : currentNode,
          );
          flowNodesRef.current = nextNodes;
          return nextNodes;
        });
        const patch = {
          id: groupDragStart.groupId,
          position: {
            x: groupDragStart.groupPosition.x + deltaX,
            y: groupDragStart.groupPosition.y + deltaY,
          },
          data: { workflowMediaUserMoved: true } as Partial<
            LibTvWorkflowNode["data"]
          >,
        };
        if (onMoveNodes) onMoveNodes([patch]);
        else {
          onMoveNode(patch.id, patch.position);
          onUpdateNode?.(patch.id, patch.data);
        }
      } else {
        const patch = {
          id: node.id,
          position: node.position,
          data: { workflowMediaUserMoved: true } as Partial<
            LibTvWorkflowNode["data"]
          >,
        };
        if (onMoveNodes) onMoveNodes([patch]);
        else {
          onMoveNode(patch.id, patch.position);
          onUpdateNode?.(patch.id, patch.data);
        }
      }
      window.requestAnimationFrame(() => {
        if (!draggingNodeIdRef.current) setDragFlowNodes(null);
      });
    },
    [onMoveNode, onMoveNodes, onUpdateNode],
  );

  const handleSelectionStart = useCallback(
    (event: React.MouseEvent<Element>) => {
      if (!interactive) return;
      if (suppressNodeEventsTimeoutRef.current !== null) {
        window.clearTimeout(suppressNodeEventsTimeoutRef.current);
        suppressNodeEventsTimeoutRef.current = null;
      }
      isBoxSelectingRef.current = true;
      suppressNodeEventsRef.current = true;
      setNodeEventsSuppressed(true);
      window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
      setNodeContextMenu(null);
      setEdgeContextMenu(null);
      setPaneContextMenu(null);
      setNodeCommandMenu(null);
      setConnectionAddMenu(null);
      event.stopPropagation();
    },
    [interactive],
  );

  const handleSelectionEnd = useCallback(
    (event: React.MouseEvent<Element>) => {
      if (!interactive) return;
      isBoxSelectingRef.current = false;
      event.stopPropagation();
      suppressNodeEventsTimeoutRef.current = window.setTimeout(() => {
        suppressNodeEventsTimeoutRef.current = null;
        suppressNodeEventsRef.current = false;
        setNodeEventsSuppressed(false);
      }, 0);
    },
    [interactive],
  );

  useEffect(() => {
    const closeSurfaceMenus = () => {
      setNodeContextMenu(null);
      setEdgeContextMenu(null);
      setPaneContextMenu(null);
      setNodeCommandMenu(null);
      setConnectionAddMenu(null);
    };
    window.addEventListener(WORKFLOW_NODE_CLOSE_MENUS_EVENT, closeSurfaceMenus);
    return () =>
      window.removeEventListener(
        WORKFLOW_NODE_CLOSE_MENUS_EVENT,
        closeSurfaceMenus,
      );
  }, []);

  useEffect(() => {
    const hasOpenOverlay = Boolean(
      nodeContextMenu ||
      edgeContextMenu ||
      paneContextMenu ||
      nodeCommandMenu ||
      connectionAddMenu ||
      focusPickTargetId,
    );
    if (!hasOpenOverlay) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setNodeContextMenu(null);
      setEdgeContextMenu(null);
      setPaneContextMenu(null);
      setNodeCommandMenu(null);
      setConnectionAddMenu(null);
      setFocusPickTargetId(null);
      setFocusPickOverlay(null);
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [
    connectionAddMenu,
    edgeContextMenu,
    focusPickTargetId,
    nodeCommandMenu,
    nodeContextMenu,
    paneContextMenu,
  ]);

  const connectionNodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      const sourceId = String(connection.source || "");
      const targetId = String(connection.target || "");
      if (!sourceId || !targetId || sourceId === targetId) return false;
      if (
        connectionHandlesDisabledNodeIds.has(sourceId) ||
        connectionHandlesDisabledNodeIds.has(targetId)
      )
        return false;
      const sourceNode = connectionNodeById.get(sourceId);
      const targetNode = connectionNodeById.get(targetId);
      if (!canConnectWorkflowNodes(sourceNode, targetNode, nodes)) return false;
      return !activeConnectionEdgePairs.has(`${sourceId}\u0000${targetId}`);
    },
    [
      activeConnectionEdgePairs,
      connectionHandlesDisabledNodeIds,
      connectionNodeById,
      nodes,
    ],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const sourceId = String(connection.source || "");
      const targetId = String(connection.target || "");
      if (!sourceId || !targetId || sourceId === targetId) return;
      if (
        !isValidConnection({
          source: sourceId,
          target: targetId,
          sourceHandle: WORKFLOW_SOURCE_HANDLE_RIGHT,
          targetHandle: WORKFLOW_TARGET_HANDLE_LEFT,
        })
      )
        return;
      setConnectionAddMenu(null);
      onConnectNodes?.(sourceId, targetId);
    },
    [isValidConnection, onConnectNodes],
  );

  const handleConnectStart = useCallback<OnConnectStart>((_event, params) => {
    window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
    setNodeContextMenu(null);
    setEdgeContextMenu(null);
    setPaneContextMenu(null);
    setNodeCommandMenu(null);
    setConnectionAddMenu(null);
    const nodeId = String(params.nodeId || "");
    connectionStartRef.current =
      nodeId &&
      (params.handleType === "source" || params.handleType === "target")
        ? { nodeId, handleType: params.handleType }
        : null;
  }, []);

  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState: FinalConnectionState) => {
      const start = connectionStartRef.current;
      connectionStartRef.current = null;
      const startNodeId = String(
        connectionState.fromNode?.id || start?.nodeId || "",
      );
      if (!startNodeId || connectionState.isValid) return;

      const startedFromTarget = start?.handleType === "target";
      const connectNodePair = (candidateNodeId: string) => {
        const sourceId = startedFromTarget ? candidateNodeId : startNodeId;
        const targetId = startedFromTarget ? startNodeId : candidateNodeId;
        if (!sourceId || !targetId || sourceId === targetId) return false;
        if (
          !isValidConnection({
            source: sourceId,
            target: targetId,
            sourceHandle: WORKFLOW_SOURCE_HANDLE_RIGHT,
            targetHandle: WORKFLOW_TARGET_HANDLE_LEFT,
          })
        )
          return false;
        setConnectionAddMenu(null);
        onConnectNodes?.(sourceId, targetId);
        return true;
      };

      const directTargetId = String(connectionState.toNode?.id || "");
      if (directTargetId && directTargetId !== startNodeId) {
        connectNodePair(directTargetId);
        return;
      }

      const sourceNode = nodes.find((node) => node.id === startNodeId);
      const targetId = findWorkflowNodeIdAtPoint(
        event,
        flowRef.current,
        startNodeId,
        sourceNode?.parentId,
      );
      if (!targetId) {
        const point = pointFromConnectionEndEvent(event);
        if (!point) return;
        const flow = flowRef.current;
        const flowPoint = flow?.screenToFlowPosition?.(point) || point;
        const sourceScreenPoint = (() => {
          if (!sourceNode) return point;
          const nodeById = new Map(nodes.map((node) => [node.id, node]));
          const sourcePosition = getWorkflowNodeAbsolutePosition(
            sourceNode,
            nodeById,
          );
          const sourceFrame =
            sourceNode.kind === "group"
              ? getWorkflowImageResultGroupFrame(sourceNode, nodes) ||
                getWorkflowRenderedNodeFrame(sourceNode)
              : getWorkflowRenderedNodeFrame(sourceNode);
          const sourceFlowPoint = {
            x: startedFromTarget
              ? sourcePosition.x
              : sourcePosition.x + sourceFrame.width,
            y: sourcePosition.y + sourceFrame.height / 2,
          };
          const screenPoint = flow?.flowToScreenPosition?.(sourceFlowPoint);
          if (screenPoint) return screenPoint;
          const viewport = flow?.getViewport?.();
          if (!viewport) return point;
          return {
            x: sourceFlowPoint.x * viewport.zoom + viewport.x,
            y: sourceFlowPoint.y * viewport.zoom + viewport.y,
          };
        })();
        window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
        setNodeContextMenu(null);
        setEdgeContextMenu(null);
        setPaneContextMenu(null);
        setNodeCommandMenu(null);
        setConnectionAddMenu({
          sourceId: startNodeId,
          side: startedFromTarget ? "left" : "right",
          sourceX: sourceScreenPoint.x,
          sourceY: sourceScreenPoint.y,
          x: point.x,
          y: point.y,
          flowX: flowPoint.x,
          flowY: flowPoint.y,
        });
        return;
      }
      connectNodePair(targetId);
    },
    [isValidConnection, nodes, onConnectNodes],
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      if (
        !standalone ||
        isBoxSelectingRef.current ||
        suppressNodeEventsRef.current
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));

      const target = event.target as Element | null;
      const nodeId = getWorkflowNodeIdFromElement(target);
      if (nodeId) {
        onSelectNode(nodeId);
        setNodeContextMenu({
          nodeId,
          x: "clientX" in event ? event.clientX : 0,
          y: "clientY" in event ? event.clientY : 0,
        });
        setEdgeContextMenu(null);
        setPaneContextMenu(null);
        setNodeCommandMenu(null);
        setConnectionAddMenu(null);
        return;
      }
      const edgeId = getWorkflowEdgeIdFromElement(target);
      if (edgeId) {
        setNodeContextMenu(null);
        setEdgeContextMenu({
          edgeId,
          x: "clientX" in event ? event.clientX : 0,
          y: "clientY" in event ? event.clientY : 0,
        });
        setPaneContextMenu(null);
        setNodeCommandMenu(null);
        setConnectionAddMenu(null);
        return;
      }
      setNodeContextMenu(null);
      setEdgeContextMenu(null);
      const clientX = "clientX" in event ? event.clientX : 0;
      const clientY = "clientY" in event ? event.clientY : 0;
      const point = flowRef.current?.screenToFlowPosition({
        x: clientX,
        y: clientY,
      }) || { x: clientX, y: clientY };
      setPaneContextMenu({
        x: clientX,
        y: clientY,
        flowX: point.x,
        flowY: point.y,
      });
      setNodeCommandMenu(null);
      setConnectionAddMenu(null);
    },
    [onSelectNode, standalone],
  );

  const handlePaneClick = useCallback(
    (event: React.MouseEvent<Element>) => {
      if (!interactive) return;
      window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
      setNodeContextMenu(null);
      setEdgeContextMenu(null);
      setPaneContextMenu(null);
      setNodeCommandMenu(null);
      setConnectionAddMenu(null);
      onPaneClick?.(event);
    },
    [interactive, onPaneClick],
  );

  const handlePaneDoubleClick = useCallback(
    (
      event: React.MouseEvent<Element>,
      flowPosition: { x: number; y: number },
    ) => {
      if (!interactive) return;
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
      setNodeContextMenu(null);
      setEdgeContextMenu(null);
      setPaneContextMenu(null);
      setPaneContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowX: flowPosition.x,
        flowY: flowPosition.y,
      });
      setNodeCommandMenu(null);
      setConnectionAddMenu(null);
      onPaneDoubleClick?.(event);
    },
    [interactive, onPaneDoubleClick],
  );

  const openNodeCommandMenuFromPane = useCallback(() => {
    if (!paneContextMenu) return;
    setNodeContextMenu(null);
    setEdgeContextMenu(null);
    setPaneContextMenu(null);
    setNodeCommandMenu({
      x: paneContextMenu.x,
      y: paneContextMenu.y,
      flowX: paneContextMenu.flowX,
      flowY: paneContextMenu.flowY,
    });
  }, [paneContextMenu]);

  const initialViewport = useMemo(
    () => ({
      x: Number(stagePos?.x ?? 0),
      y: Number(stagePos?.y ?? 0),
      zoom: Number(zoom ?? 1),
    }),
    [stagePos?.x, stagePos?.y, zoom],
  );
  const handleInit = useCallback(
    (instance: ReactFlowInstance<Node<WorkflowOverlayNodeData>, Edge>) => {
      flowRef.current = instance;
      onInit?.(instance);
    },
    [onInit],
  );
  const connectionAddMenuSourceNode = connectionAddMenu
    ? connectionNodeById.get(connectionAddMenu.sourceId)
    : undefined;
  const connectionAddMenuOptions = useMemo(() => {
    if (!connectionAddMenuSourceNode) return [];
    if (connectionAddMenu?.side === "left") {
      return getWorkflowContextAddOptionsForNode(connectionAddMenuSourceNode);
    }
    const hasIncomingTextEdge = edges.some((edge) => {
      if (edge.target !== connectionAddMenuSourceNode.id) return false;
      return connectionNodeById.get(edge.source)?.kind === "text";
    });
    return getWorkflowOutputAddOptionsForNode(connectionAddMenuSourceNode, {
      hasIncomingTextEdge,
    });
  }, [
    connectionAddMenu?.side,
    connectionAddMenuSourceNode,
    connectionNodeById,
    edges,
  ]);
  const connectionAddMenuPreviewPath = useMemo(() => {
    if (!connectionAddMenu || !connectionAddMenuSourceNode) return null;
    const start = {
      x: connectionAddMenu.sourceX,
      y: connectionAddMenu.sourceY,
    };
    const end = { x: connectionAddMenu.x, y: connectionAddMenu.y };
    return getWorkflowCablePath({
      sourceX: start.x,
      sourceY: start.y,
      targetX: end.x,
      targetY: end.y,
      sourcePosition:
        connectionAddMenu.side === "left" ? Position.Left : Position.Right,
      targetPosition:
        connectionAddMenu.side === "left" ? Position.Right : Position.Left,
    });
  }, [connectionAddMenu, connectionAddMenuSourceNode]);
  const handleConnectionAddNode = useCallback(
    (kind: LibTvWorkflowNode["kind"]) => {
      if (!connectionAddMenu) return;
      onAddLinkedNode?.(
        connectionAddMenu.sourceId,
        kind,
        connectionAddMenu.side,
        {
          x: connectionAddMenu.flowX,
          y: connectionAddMenu.flowY,
        },
      );
      setConnectionAddMenu(null);
    },
    [connectionAddMenu, onAddLinkedNode],
  );

  useEffect(() => {
    if (!connectionAddMenu) return;
    if (!nodes.some((node) => node.id === connectionAddMenu.sourceId)) {
      setConnectionAddMenu(null);
    }
  }, [connectionAddMenu, nodes]);

  return (
    <div
      className={`libtv-workflow-surface absolute inset-0 ${standalone ? "libtv-workflow-surface--standalone pointer-events-auto z-0" : "libtv-workflow-surface--overlay pointer-events-none z-[133]"}`}
    >
      <LibTvWorkflowSurfaceCanvas
        flowNodes={flowNodes}
        workflowNodes={nodes}
        flowEdges={flowEdges}
        interactive={interactive}
        nodeEventsSuppressed={nodeEventsSuppressed}
        readOnly={readOnly}
        selectionBounds={selectionBounds}
        selectedIds={selectedIds}
        standalone={standalone}
        edgesVisible={edgesVisible}
        snapToGrid={snapToGrid}
        initialViewport={initialViewport}
        onInit={handleInit}
        onNodeClick={handleNodeClick}
        onNodesChange={handleNodesChange}
        onRenderNodesChange={handleRenderNodesChange}
        onNodeDragStart={handleNodeDragStart}
        onNodeDrag={handleNodeDrag}
        onNodeDragStop={handleNodeDragStop}
        onConnect={handleConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        isValidConnection={isValidConnection}
        onSelectionStart={handleSelectionStart}
        onSelectionEnd={handleSelectionEnd}
        onMarqueeSelection={onSelectionChange}
        onSaveNodeToMaterials={onSaveNodeToMaterials}
        onReportNodeIssue={onReportNodeIssue}
        onCreatePlaylistFromSelection={onCreatePlaylistFromSelection}
        onGroupNodes={onGroupNodes}
        onUngroupNode={onUngroupNode}
        onCreateNodeFromSelection={onCreateNodeFromSelection}
        onConvertGroupToStoryboard={onConvertGroupToStoryboard}
        onRunGroup={onRunGroup}
        onViewportChange={onViewportChange}
        onVirtualizationWindowChange={handleVirtualizationWindowChange}
        documentVirtualizationStats={documentVirtualization.stats}
        onPaneClick={standalone ? handlePaneClick : undefined}
        onPaneDoubleClick={handlePaneDoubleClick}
        onPaneFilesDrop={onPaneFilesDrop}
        onContextMenu={standalone ? handleContextMenu : undefined}
      />
      {!readOnly && focusPickTargetId ? (
        <div className="pointer-events-auto absolute left-1/2 top-3 z-[1000] -translate-x-1/2 transition-[top] duration-200 ease-out">
          <div className="flex items-center gap-4 rounded-2xl border border-white/[0.10] bg-[#242424]/94 p-3 text-white shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-md">
            <div className="flex items-center gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] text-white/72">
                {focusPickOverlay?.status === "uploading" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FocusModeIcon />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold leading-[14px] text-white/90">
                  聚焦模式
                </span>
                <span className="text-xs leading-3 text-white/45">
                  {focusPickOverlay?.status === "uploading"
                    ? "正在上传聚焦区域"
                    : "在图片上框选局部元素"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-8 cursor-pointer items-center justify-center rounded-lg bg-white/[0.10] px-3 text-[13px] text-white transition-opacity hover:opacity-80"
                onClick={returnToFocusPickTarget}
              >
                返回节点
              </button>
              <button
                type="button"
                className="flex h-8 cursor-pointer items-center justify-center rounded-lg bg-white px-3 text-[13px] text-neutral-900 transition-opacity hover:opacity-80"
                onClick={() => {
                  setFocusPickTargetId(null);
                  setFocusPickOverlay(null);
                }}
              >
                退出
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!readOnly && nodeContextMenu ? (
        <WorkflowContextMenuPortal>
          <button
            type="button"
            className="fixed inset-0 z-[999] cursor-default"
            aria-label="关闭节点菜单"
            onClick={() => setNodeContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setNodeContextMenu(null);
            }}
          />
          <WorkflowNodeContextMenu
            menu={nodeContextMenu}
            node={
              nodes.find((item) => item.id === nodeContextMenu.nodeId) || null
            }
            onClose={() => setNodeContextMenu(null)}
            onSaveToMaterials={onSaveNodeToMaterials}
            onCopy={onCopyNode}
            onDuplicate={onDuplicateNode}
            onDelete={onDeleteNode}
            onCopyMedia={onCopyNodeMedia}
            onSendToChat={onSendNodeToChat}
            onCopyToClipboard={onCopyNodeToClipboard}
            onCreateSubject={onCreateSubjectFromNode}
            onRunSeedanceComplianceCheck={onRunSeedanceComplianceCheck}
            onEnterPanoramaPreview={onEnterPanoramaPreview}
            onOptimizeWorkflowLayout={onOptimizeWorkflowLayout}
            onCopyTaskId={onCopyNodeTaskId}
            onVerifyGenerationResult={onVerifyGenerationResult}
            onReportIssue={onReportNodeIssue}
          />
        </WorkflowContextMenuPortal>
      ) : null}
      {!readOnly && edgeContextMenu ? (
        <WorkflowContextMenuPortal>
          <button
            type="button"
            className="fixed inset-0 z-[999] cursor-default"
            aria-label="关闭连线菜单"
            onClick={() => setEdgeContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setEdgeContextMenu(null);
            }}
          />
          <WorkflowEdgeContextMenu
            menu={edgeContextMenu}
            onClose={() => setEdgeContextMenu(null)}
            onDisconnect={onDisconnectEdge}
          />
        </WorkflowContextMenuPortal>
      ) : null}
      {!readOnly && paneContextMenu ? (
        <WorkflowContextMenuPortal>
          <button
            type="button"
            className="fixed inset-0 z-[999] cursor-default"
            aria-label="关闭画布菜单"
            onClick={() => setPaneContextMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setPaneContextMenu(null);
            }}
          />
          <WorkflowPaneContextMenu
            menu={paneContextMenu}
            onClose={() => setPaneContextMenu(null)}
            onUpload={onPaneUpload}
            onOpenAddNode={openNodeCommandMenuFromPane}
            onArrangeCanvas={
              onOptimizeWorkflowLayout
                ? () => onOptimizeWorkflowLayout("")
                : undefined
            }
            onUndo={onPaneUndo}
            onRedo={onPaneRedo}
            onPaste={onPanePaste}
          />
        </WorkflowContextMenuPortal>
      ) : null}
      {!readOnly && nodeCommandMenu ? (
        <WorkflowContextMenuPortal>
          <button
            type="button"
            className="fixed inset-0 z-[999] cursor-default"
            aria-label="关闭添加节点菜单"
            onClick={() => setNodeCommandMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setNodeCommandMenu(null);
            }}
          />
          <WorkflowNodeCommandMenu
            menu={nodeCommandMenu}
            onClose={() => setNodeCommandMenu(null)}
            onSelect={onPaneAddNode}
            onUpload={onPaneUpload}
          />
        </WorkflowContextMenuPortal>
      ) : null}
      {!readOnly && connectionAddMenu && connectionAddMenuOptions.length > 0 ? (
        <WorkflowContextMenuPortal>
          {connectionAddMenuPreviewPath ? (
            <svg
              className="canvas-theme-portal pointer-events-none fixed inset-0 z-[1198] h-screen w-screen overflow-visible"
              aria-hidden="true"
            >
              <path
                d={connectionAddMenuPreviewPath}
                fill="none"
                stroke="var(--workflow-cable-outline, rgba(8, 10, 13, 0.82))"
                strokeWidth="5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.72"
              />
              <path
                d={connectionAddMenuPreviewPath}
                fill="none"
                stroke={getWorkflowCableColor(
                  getWorkflowCableTone(connectionAddMenuSourceNode),
                )}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.96"
              />
            </svg>
          ) : null}
          <button
            type="button"
            className="fixed inset-0 z-[1199] cursor-default"
            aria-label="关闭连接新增节点菜单"
            onClick={() => setConnectionAddMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setConnectionAddMenu(null);
            }}
          />
          <NodeAddMenu
            anchor={{ x: connectionAddMenu.x, y: connectionAddMenu.y }}
            title={
              connectionAddMenu.side === "left"
                ? "添加上下文"
                : "引用该节点生成"
            }
            options={connectionAddMenuOptions}
            onSelect={handleConnectionAddNode}
          />
        </WorkflowContextMenuPortal>
      ) : null}
    </div>
  );
});
