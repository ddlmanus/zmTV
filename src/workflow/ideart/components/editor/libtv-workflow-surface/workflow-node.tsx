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
  Handle,
  Position,
  useStore,
  useStoreApi,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { LIBTV_VIDEO_NODE_SNAPSHOT_WIDTH } from "@/workflow/ideart/lib/libtv/video-node-lod";
import {
  TAPNOW_NODE_ICON_META,
  TapNowNodeIcon,
} from "./nodes/workflow-node-icons";
import { TapNowDirectorConsole3DNode } from "./nodes/director-console-3d";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  canConnectWorkflowNodes,
  isWorkflowImageGeneratorNode,
  isWorkflowImageGeneratorResultGroupNode,
  isWorkflowTextGeneratorNode,
  isWorkflowVideoAnalysisScriptNode,
  isWorkflowVideoGeneratorNode,
  isWorkflowVideoGeneratorResultNode,
} from "./workflow-node-kinds";
import {
  getWorkflowImageRenderUrl,
  getWorkflowMediaFitClass,
  getWorkflowVideoPosterUrl,
} from "./workflow-media-utils";
import {
  INVISIBLE_HANDLE_STYLE,
  TAPNOW_NODE_MIN_SIZE,
  TAPNOW_NODE_PANEL_BACKGROUND,
  WORKFLOW_HANDLE_HIT_AREA_STYLE,
  WORKFLOW_MULTI_SELECTION_CONNECTION_EVENT,
  WORKFLOW_NODE_CLOSE_MENUS_EVENT,
  WORKFLOW_SOURCE_HANDLE_ASSET_UNDER,
  WORKFLOW_SOURCE_HANDLE_RIGHT,
  WORKFLOW_TARGET_HANDLE_LEFT,
  isScriptV2AssetImageNode,
} from "./surface-contracts";
import {
  TapNowNodeBody,
  ZMTV_NODE_SURFACE_BACKGROUND,
  ZMTV_NODE_SURFACE_BORDER,
  ZMTV_NODE_SURFACE_SHADOW,
} from "./node-shared-ui";
import {
  ADD_NODE_OPTIONS,
  IMAGE_GENERATOR_CONTEXT_OPTIONS,
  IMAGE_NODE_CONTEXT_OPTIONS,
  TEXT_GENERATOR_CONTEXT_MENU_OPTIONS,
  TEXT_NODE_ADD_OPTIONS,
  VIDEO_GENERATOR_CONTEXT_OPTIONS,
  VIDEO_NODE_CONTEXT_OPTIONS,
  WORKFLOW_NODE_TITLE_BAR_CLASS,
  WORKFLOW_NODE_TITLE_BAR_LARGE_STYLE,
  WORKFLOW_NODE_TITLE_BAR_STYLE,
  getUnifiedWorkflowHandleMenuOptions,
  getWorkflowMediaNaturalRatio,
  getWorkflowNodeMinimumFrame,
  getWorkflowOutputAddOptionsForNode,
  isOrdinaryWorkflowImageNode,
  isOrdinaryWorkflowVideoNode,
} from "./workflow-connections";
import { TapNowHandleVisual, TapNowTextNode } from "./text-node";
import { TapNowMediaNode } from "./media-node";
import { TapNowAudioNode } from "./audio-node";
import { TapNowPlaylistNode } from "./playlist-node";
import { TapNowScriptNode } from "./script-node";
import { TapNowScriptV2Node } from "./script-v2-node";
import { TapNowGroupNode } from "./group-node";
import { TapNowThreeDNode } from "./three-d-node";
import { NodeAddMenu } from "./node-add-menu";
import type { WorkflowOverlayNodeData } from "./surface-contracts";
import type {
  WorkflowMultiSelectionConnectionEventDetail,
  WorkflowMultiSelectionConnectionFeedback,
} from "./workflow-connections";

export const WorkflowVideoNodeLodSnapshot = memo(
  function WorkflowVideoNodeLodSnapshot({ node }: { node: LibTvWorkflowNode }) {
    const meta = TAPNOW_NODE_ICON_META.video;
    const mediaUrl = String(node.data?.mediaUrl || "").trim();
    const title = String(node.data?.title || meta.label).trim() || meta.label;
    const isGeneratorNode = isWorkflowVideoGeneratorNode(node);
    const isGeneratorResultNode = isGeneratorNode && Boolean(mediaUrl);
    const isOrdinaryNode = !isGeneratorNode;
    const rawResults = Array.isArray(node.data?.workflowVideoResults)
      ? node.data.workflowVideoResults
      : [];
    const resultUrls = new Set(
      rawResults.map((item) => String(item?.url || "").trim()).filter(Boolean),
    );
    if (mediaUrl) resultUrls.add(mediaUrl);
    const hasResultStrip = resultUrls.size > 1;
    const naturalWidth = Math.max(
      0,
      Math.round(Number(node.data?.workflowMediaNaturalWidth || 0)),
    );
    const naturalHeight = Math.max(
      0,
      Math.round(Number(node.data?.workflowMediaNaturalHeight || 0)),
    );
    const naturalSizeLabel =
      naturalWidth > 0 && naturalHeight > 0
        ? naturalWidth + " × " + naturalHeight
        : "";
    // Ordinary video snapshots use the same node-scaled title row as ordinary
    // image nodes. Generator result cards keep the regular workflow title bar.
    const useFloatingTitle = isOrdinaryNode;
    const posterUrl =
      String(
        node.data?.thumbnailUrl ||
          node.data?.workflowStoryboardVideoFirstFrameUrl ||
          node.data?.workflowStoryboardVideoTailFrameUrl ||
          "",
      ).trim() ||
      (mediaUrl
        ? getWorkflowVideoPosterUrl(mediaUrl, LIBTV_VIDEO_NODE_SNAPSHOT_WIDTH)
        : "");
    const snapshotUrl = posterUrl
      ? getWorkflowImageRenderUrl(posterUrl, LIBTV_VIDEO_NODE_SNAPSHOT_WIDTH)
      : "";

    return (
      <div
        className={
          "group node-shell relative overflow-visible " +
          (isGeneratorNode ? "rounded-xl" : "rounded-2xl") +
          " bg-[var(--Surface-secondary-background)] text-fg-default"
        }
        data-testid={"canvas-node-video-" + node.id}
        data-video-lod-mode="snapshot"
        style={{
          width: "100%",
          height: "100%",
          minWidth: isOrdinaryNode ? undefined : TAPNOW_NODE_MIN_SIZE,
          minHeight: isOrdinaryNode ? undefined : TAPNOW_NODE_MIN_SIZE,
          background:
            hasResultStrip || isOrdinaryNode
              ? "transparent"
              : ZMTV_NODE_SURFACE_BACKGROUND,
          border: hasResultStrip
            ? undefined
            : isGeneratorNode
              ? ZMTV_NODE_SURFACE_BORDER
              : undefined,
          color: "var(--fg-default, rgba(255,255,255,0.9))",
          boxShadow: hasResultStrip
            ? "none"
            : isGeneratorNode
              ? ZMTV_NODE_SURFACE_SHADOW
              : "var(--workflow-node-shadow)",
        }}
      >
        <div
          className={
            useFloatingTitle
              ? "node-floating-ui pointer-events-none absolute left-0 flex w-full min-w-0 items-center gap-1 bg-transparent text-[var(--canvas-controls-icon)]"
              : WORKFLOW_NODE_TITLE_BAR_CLASS
          }
          style={{
            ...(useFloatingTitle
              ? WORKFLOW_NODE_TITLE_BAR_LARGE_STYLE
              : WORKFLOW_NODE_TITLE_BAR_STYLE),
            ...(isGeneratorNode ? { width: "100%", maxWidth: "100%" } : {}),
            ...(useFloatingTitle
              ? {
                  top: -28,
                  height: 24,
                  fontSize: 13,
                  lineHeight: "24px",
                  background: "transparent",
                  boxShadow: "none",
                  backdropFilter: "none",
                }
              : {}),
          }}
        >
          <span
            className="flex shrink-0 items-center"
            style={{
              width: useFloatingTitle ? 14 : 12,
              height: useFloatingTitle ? 14 : 12,
            }}
          >
            <TapNowNodeIcon kind="video" size={useFloatingTitle ? 14 : 12} />
          </span>
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {(useFloatingTitle || isGeneratorResultNode) && naturalSizeLabel ? (
            <span
              className="shrink-0 whitespace-nowrap text-[11px] tabular-nums opacity-80"
              title={naturalSizeLabel}
            >
              {naturalSizeLabel}
            </span>
          ) : null}
        </div>
        <div className="absolute inset-0 h-full w-full overflow-hidden rounded-2xl">
          {mediaUrl ? (
            snapshotUrl ? (
              <img
                src={snapshotUrl}
                alt=""
                decoding="async"
                loading="lazy"
                draggable={false}
                data-testid="canvas-node-video-snapshot"
                data-snapshot-width={LIBTV_VIDEO_NODE_SNAPSHOT_WIDTH}
                className={
                  "h-full w-full rounded-2xl " + getWorkflowMediaFitClass(node)
                }
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center rounded-2xl bg-black"
                data-testid="canvas-node-video-snapshot"
                data-snapshot-width={LIBTV_VIDEO_NODE_SNAPSHOT_WIDTH}
              >
                <TapNowNodeIcon kind="video" size={48} opacity={0.26} />
              </div>
            )
          ) : (
            <TapNowNodeBody node={node} />
          )}
        </div>
      </div>
    );
  },
);

export const WorkflowOverlayNode = memo(function WorkflowOverlayNode({
  data,
  selected,
  dragging,
}: NodeProps<Node<WorkflowOverlayNodeData>>) {
  const node = data.workflowNode;
  const meta = TAPNOW_NODE_ICON_META[node.kind] || TAPNOW_NODE_ICON_META.text;
  const flowStore = useStoreApi<Node<WorkflowOverlayNodeData>, Edge>();
  const overlayNodeRef = useRef<HTMLDivElement | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const resizePreviewFrameRef = useRef<number | null>(null);
  const isSelected = Boolean(selected || data.isSelected);
  const showFloatingControls = isSelected && !data.suppressFloatingControls;
  const connectionInteraction = useStore(
    (state) => {
      const connection = state.connection;
      if (!connection.inProgress) {
        return {
          inProgress: false,
          startNodeId: "",
          targetNodeId: "",
          isValid: null as boolean | null,
          hasConnectionWithStart: false,
        };
      }
      const startNodeId = String(connection.fromNode?.id || "");
      const existingConnections = state.connectionLookup.get(node.id);
      let hasConnectionWithStart = false;
      if (existingConnections && existingConnections.size > 0) {
        for (const existingConnection of existingConnections.values()) {
          if (
            existingConnection.source === startNodeId ||
            existingConnection.target === startNodeId
          ) {
            hasConnectionWithStart = true;
            break;
          }
        }
      }
      return {
        inProgress: true,
        startNodeId,
        targetNodeId: String(connection.toNode?.id || ""),
        isValid: connection.isValid,
        hasConnectionWithStart,
      };
    },
    (current, next) =>
      current.inProgress === next.inProgress &&
      current.startNodeId === next.startNodeId &&
      current.targetNodeId === next.targetNodeId &&
      current.isValid === next.isValid &&
      current.hasConnectionWithStart === next.hasConnectionWithStart,
  );
  const connectionInProgress = connectionInteraction.inProgress;
  const connectionStartNodeId = connectionInteraction.startNodeId;
  const connectionTargetNodeId = connectionInteraction.targetNodeId;
  const connectionIsValid = connectionInteraction.isValid;
  const hasConnectionWithStart = connectionInteraction.hasConnectionWithStart;
  const [
    multiSelectionConnectionFeedback,
    setMultiSelectionConnectionFeedback,
  ] = useState<WorkflowMultiSelectionConnectionFeedback>(null);
  const [connectionNodeHovered, setConnectionNodeHovered] = useState(false);
  const isConnectionHovered =
    connectionNodeHovered || connectionTargetNodeId === node.id;
  const bodyConnectionValidity = useMemo(() => {
    if (
      !connectionInProgress ||
      !connectionNodeHovered ||
      connectionTargetNodeId === node.id
    )
      return null;
    if (data.connectionHandlesDisabled) return false;
    const connectionNodeById = data.connectionNodeById;
    const startNode = connectionNodeById?.get(connectionStartNodeId);
    const startedFromTarget =
      flowStore.getState().connection.fromHandle?.type === "target";
    const sourceNode = startedFromTarget ? node : startNode;
    const targetNode = startedFromTarget ? startNode : node;
    if (!sourceNode || !targetNode || sourceNode.id === targetNode.id)
      return false;
    if (data.connectionEdgePairs?.has(`${sourceNode.id}\u0000${targetNode.id}`))
      return false;
    return canConnectWorkflowNodes(
      sourceNode,
      targetNode,
      connectionNodeById ? Array.from(connectionNodeById.values()) : [],
    );
  }, [
    connectionInProgress,
    connectionNodeHovered,
    connectionStartNodeId,
    connectionTargetNodeId,
    data.connectionEdgePairs,
    data.connectionHandlesDisabled,
    data.connectionNodeById,
    flowStore,
    node,
  ]);
  const isConnectionCandidate =
    connectionInProgress &&
    isConnectionHovered &&
    connectionStartNodeId !== node.id &&
    !hasConnectionWithStart;
  const resolvedConnectionValidity =
    connectionTargetNodeId === node.id
      ? connectionIsValid
      : bodyConnectionValidity;
  const isConnectionInvalid =
    (isConnectionCandidate && resolvedConnectionValidity === false) ||
    multiSelectionConnectionFeedback === "invalid";
  const isConnectionTarget =
    (isConnectionCandidate && resolvedConnectionValidity === true) ||
    multiSelectionConnectionFeedback === "valid";
  const isConnectionBlocked =
    (connectionInProgress &&
      isConnectionHovered &&
      (connectionStartNodeId === node.id || hasConnectionWithStart)) ||
    multiSelectionConnectionFeedback === "duplicate";
  const canTrackConnectionTilt = isConnectionTarget;
  const [addMenu, setAddMenu] = useState<{
    side: "left" | "right";
    x: number;
    y: number;
  } | null>(null);
  const [hoveredHandleSide, setHoveredHandleSide] = useState<
    "left" | "right" | null
  >(null);
  const leftHandleVisualRef = useRef<HTMLButtonElement | null>(null);
  const rightHandleVisualRef = useRef<HTMLButtonElement | null>(null);
  const handleVisualResetTimersRef = useRef<
    Record<"left" | "right", number | null>
  >({ left: null, right: null });
  const [isResizing, setIsResizing] = useState(false);
  const [connectionTilt, setConnectionTilt] = useState({ x: 0, y: 0 });
  const [connectionTiltReturning, setConnectionTiltReturning] = useState(false);
  const connectionTiltFrameRef = useRef<number | null>(null);
  const connectionTiltPointerRef = useRef<{
    element: HTMLElement;
    clientX: number;
    clientY: number;
  } | null>(null);
  const connectionTiltReturnTimerRef = useRef<number | null>(null);
  const resizeStateRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startWidth: number;
    startHeight: number;
    minWidth: number;
    minHeight: number;
    aspectRatio: number | null;
    latestWidth: number;
    latestHeight: number;
    nodeElement: HTMLElement | null;
  } | null>(null);
  const isImageGeneratorResultGroup =
    isWorkflowImageGeneratorResultGroupNode(node);
  const handleMenuKind: LibTvWorkflowNode["kind"] = isImageGeneratorResultGroup
    ? "image"
    : node.kind;
  const linkedStoryboardGroup =
    node.kind === "group" &&
    Boolean(
      String((node.data as any)?.workflowStoryboardSourceNodeId || "").trim(),
    );
  const groupCanShowConnectionHandle =
    isImageGeneratorResultGroup || linkedStoryboardGroup;
  const resourceNodeTargetDisabled =
    (node.kind === "text" && node.data?.componentType === "text-editor") ||
    ((node.kind === "image" ||
      node.kind === "video" ||
      node.kind === "audio") &&
      node.data?.mediaRole === "ordinary");
  const localMediaSourceDisabled =
    (node.kind === "image" || node.kind === "video") &&
    /^(?:blob:|data:)/i.test(String(node.data?.mediaUrl || "").trim());
  const connectionHandlesDisabled = data.connectionHandlesDisabled === true;
  const hideLeftAddHandle =
    connectionHandlesDisabled ||
    (node.kind === "group" && !groupCanShowConnectionHandle) ||
    resourceNodeTargetDisabled;
  const hideRightAddHandle =
    connectionHandlesDisabled ||
    (node.kind === "group" && !groupCanShowConnectionHandle) ||
    localMediaSourceDisabled;
  const canReceiveDraggedConnection = !hideLeftAddHandle;
  const canStartDraggedConnection = !hideRightAddHandle;
  const useAssetUnderSourceHandle = isScriptV2AssetImageNode(node);
  const canResizeNode = Boolean(
    data.interactive &&
    !node.locked &&
    !isWorkflowVideoAnalysisScriptNode(node) &&
    node.kind !== "playlist" &&
    node.kind !== "group" &&
    node.kind !== "director-console-3d",
  );
  const isTextGeneratorNode = isWorkflowTextGeneratorNode(node);
  const leftAddNodeOptions =
    node.kind === "group" && !isImageGeneratorResultGroup
      ? []
      : isTextGeneratorNode
        ? TEXT_GENERATOR_CONTEXT_MENU_OPTIONS
        : node.kind === "text"
          ? TEXT_NODE_ADD_OPTIONS
          : ADD_NODE_OPTIONS;
  const rawLeftAddNodeOptions = isWorkflowImageGeneratorNode(node)
    ? IMAGE_GENERATOR_CONTEXT_OPTIONS
    : isWorkflowVideoGeneratorNode(node)
      ? VIDEO_GENERATOR_CONTEXT_OPTIONS
      : handleMenuKind === "image"
        ? IMAGE_NODE_CONTEXT_OPTIONS
        : handleMenuKind === "video"
          ? VIDEO_NODE_CONTEXT_OPTIONS
          : leftAddNodeOptions;
  const resolvedLeftAddNodeOptions = getUnifiedWorkflowHandleMenuOptions(
    rawLeftAddNodeOptions,
  );
  const rightAddNodeOptions = getWorkflowOutputAddOptionsForNode(node, {
    hasIncomingTextEdge: data.hasIncomingTextEdge,
  });
  const leftAddMenuTitle = "添加上下文";
  const rightAddMenuTitle = "引用该节点生成";

  useEffect(() => {
    setAddMenu(null);
  }, [node.id]);

  useEffect(() => {
    const handleMultiSelectionConnection = (event: Event) => {
      const detail = (
        event as CustomEvent<WorkflowMultiSelectionConnectionEventDetail>
      ).detail;
      if (!detail) return;
      const ownFlowRoot =
        overlayNodeRef.current?.closest(".react-flow") || null;
      if (detail.flowRoot !== ownFlowRoot) return;
      const nextFeedback =
        detail.active && detail.targetId === node.id ? detail.feedback : null;
      setMultiSelectionConnectionFeedback((current) =>
        current === nextFeedback ? current : nextFeedback,
      );
    };
    window.addEventListener(
      WORKFLOW_MULTI_SELECTION_CONNECTION_EVENT,
      handleMultiSelectionConnection,
    );
    return () =>
      window.removeEventListener(
        WORKFLOW_MULTI_SELECTION_CONNECTION_EVENT,
        handleMultiSelectionConnection,
      );
  }, [node.id]);

  useEffect(
    () => () => {
      if (resizePreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(resizePreviewFrameRef.current);
        resizePreviewFrameRef.current = null;
      }
      for (const side of ["left", "right"] as const) {
        const timer = handleVisualResetTimersRef.current[side];
        if (timer !== null) window.clearTimeout(timer);
      }
      if (connectionTiltFrameRef.current !== null)
        window.cancelAnimationFrame(connectionTiltFrameRef.current);
      if (connectionTiltReturnTimerRef.current !== null)
        window.clearTimeout(connectionTiltReturnTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        updateNodeInternals(node.id);
      });
    });
    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [
    data.videoLodMode,
    node.data?.componentType,
    node.data?.mediaRole,
    node.data?.mediaUrl,
    node.data?.workflowGenerationBackgroundTaskId,
    node.data?.workflowGenerationRunning,
    node.data?.workflowGenerationStartedAt,
    node.data?.workflowGenerationStatusUrl,
    node.data?.workflowGenerationTaskId,
    node.data?.workflowGenerationTaskType,
    node.data?.workflowMediaNaturalHeight,
    node.data?.workflowMediaNaturalWidth,
    node.data?.workflowRedrawRunning,
    node.height,
    node.id,
    node.kind,
    node.width,
    updateNodeInternals,
  ]);

  useEffect(() => {
    if (canTrackConnectionTilt) return;
    if (connectionTiltFrameRef.current !== null) {
      window.cancelAnimationFrame(connectionTiltFrameRef.current);
      connectionTiltFrameRef.current = null;
    }
    connectionTiltPointerRef.current = null;
    if (connectionTilt.x === 0 && connectionTilt.y === 0) return;
    setConnectionTiltReturning(true);
    if (connectionTiltReturnTimerRef.current !== null)
      window.clearTimeout(connectionTiltReturnTimerRef.current);
    connectionTiltReturnTimerRef.current = window.setTimeout(() => {
      connectionTiltReturnTimerRef.current = null;
      setConnectionTiltReturning(false);
    }, 400);
    setConnectionTilt({ x: 0, y: 0 });
  }, [canTrackConnectionTilt, connectionTilt.x, connectionTilt.y]);

  const handleConnectionTiltMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (
        !canTrackConnectionTilt ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      )
        return;
      connectionTiltPointerRef.current = {
        element: event.currentTarget,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      if (connectionTiltFrameRef.current !== null) return;
      connectionTiltFrameRef.current = window.requestAnimationFrame(() => {
        connectionTiltFrameRef.current = null;
        const pointer = connectionTiltPointerRef.current;
        if (!pointer) return;
        const bounds = pointer.element.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const normalizedX =
          (pointer.clientX - (bounds.left + bounds.width / 2)) /
          (bounds.width / 2);
        const normalizedY =
          (pointer.clientY - (bounds.top + bounds.height / 2)) /
          (bounds.height / 2);
        setConnectionTiltReturning(false);
        setConnectionTilt({
          x: Math.max(-8, Math.min(8, -8 * normalizedY)),
          y: Math.max(-8, Math.min(8, 8 * normalizedX)),
        });
      });
    },
    [canTrackConnectionTilt],
  );

  const hasConnectionTilt = connectionTilt.x !== 0 || connectionTilt.y !== 0;
  const connectionTiltStyle: React.CSSProperties =
    canTrackConnectionTilt || hasConnectionTilt || connectionTiltReturning
      ? {
          transform:
            "perspective(800px) rotateX(" +
            connectionTilt.x +
            "deg) rotateY(" +
            connectionTilt.y +
            "deg)",
          transformOrigin: "center center",
          transition:
            "transform " +
            (canTrackConnectionTilt ? "80ms ease-out" : "400ms ease-out"),
        }
      : {};

  const resetHandleVisual = useCallback((side: "left" | "right") => {
    const element =
      side === "left"
        ? leftHandleVisualRef.current
        : rightHandleVisualRef.current;
    if (!element) return;
    const currentTimer = handleVisualResetTimersRef.current[side];
    if (currentTimer !== null) window.clearTimeout(currentTimer);
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    element.style.transition = reduceMotion
      ? "none"
      : "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease";
    element.style.transform = `translate(${side === "left" ? 25 : -25}px, 0px) scale(1)`;
    handleVisualResetTimersRef.current[side] = reduceMotion
      ? null
      : window.setTimeout(() => {
          if (element.isConnected) element.style.transition = "";
          handleVisualResetTimersRef.current[side] = null;
        }, 450);
  }, []);

  const moveHandleVisual = useCallback(
    (event: React.MouseEvent<HTMLDivElement>, side: "left" | "right") => {
      const element =
        side === "left"
          ? leftHandleVisualRef.current
          : rightHandleVisualRef.current;
      if (!element) return;
      const currentTimer = handleVisualResetTimersRef.current[side];
      if (currentTimer !== null) {
        window.clearTimeout(currentTimer);
        handleVisualResetTimersRef.current[side] = null;
      }
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        resetHandleVisual(side);
        return;
      }
      const bounds = event.currentTarget.getBoundingClientRect();
      const deltaX = event.clientX - (bounds.left + bounds.width / 2);
      const deltaY = event.clientY - (bounds.top + bounds.height / 2);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const clampScale = distance > 30 ? 30 / distance : 1;
      element.style.transition = "transform 80ms ease-out";
      element.style.transform = `translate(${deltaX * clampScale}px, ${deltaY * clampScale}px) scale(1.1)`;
    },
    [resetHandleVisual],
  );

  useEffect(() => {
    const closeMenus = () =>
      setAddMenu((current) => (current === null ? current : null));
    window.addEventListener(WORKFLOW_NODE_CLOSE_MENUS_EVENT, closeMenus);
    return () =>
      window.removeEventListener(WORKFLOW_NODE_CLOSE_MENUS_EVENT, closeMenus);
  }, []);

  const openAddMenu = useCallback(
    (
      event: React.PointerEvent<Element> | React.MouseEvent<Element>,
      side: "left" | "right",
    ) => {
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
      const bounds =
        event.currentTarget instanceof Element
          ? event.currentTarget.getBoundingClientRect()
          : null;
      const x =
        Number.isFinite(event.clientX) && event.clientX > 0
          ? event.clientX
          : bounds
            ? bounds.left + bounds.width / 2
            : 0;
      const y =
        Number.isFinite(event.clientY) && event.clientY > 0
          ? event.clientY
          : bounds
            ? bounds.top + bounds.height / 2
            : 0;
      setAddMenu((current) => (current?.side === side ? null : { side, x, y }));
    },
    [],
  );

  const handleAddNode = useCallback(
    (kind: LibTvWorkflowNode["kind"]) => {
      data.onAddLinkedNode?.(node.id, kind, addMenu?.side || "right");
      setAddMenu(null);
    },
    [addMenu?.side, data, node.id],
  );

  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (!canResizeNode) return;
      event.preventDefault();
      event.stopPropagation();
      window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
      const minimumFrame = getWorkflowNodeMinimumFrame(node);
      const resizableMediaResult =
        isOrdinaryWorkflowImageNode(node) ||
        isOrdinaryWorkflowVideoNode(node) ||
        isWorkflowVideoGeneratorResultNode(node);
      const aspectRatio = resizableMediaResult
        ? getWorkflowMediaNaturalRatio(node)
        : null;
      resizeStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startWidth: Math.max(
          minimumFrame.width,
          Number(node.width || minimumFrame.width),
        ),
        startHeight: Math.max(
          minimumFrame.height,
          Number(node.height || minimumFrame.height),
        ),
        minWidth: resizableMediaResult
          ? 120
          : Math.max(120, minimumFrame.width),
        minHeight: resizableMediaResult
          ? 120
          : Math.max(120, minimumFrame.height),
        aspectRatio:
          aspectRatio && Number.isFinite(aspectRatio) && aspectRatio > 0
            ? aspectRatio
            : null,
        latestWidth: Math.max(
          minimumFrame.width,
          Number(node.width || minimumFrame.width),
        ),
        latestHeight: Math.max(
          minimumFrame.height,
          Number(node.height || minimumFrame.height),
        ),
        nodeElement: event.currentTarget.closest(
          ".react-flow__node",
        ) as HTMLElement | null,
      };
      setIsResizing(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [canResizeNode, node],
  );

  const handleResizePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = resizeStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const safeZoom = Math.max(
        0.1,
        Number(flowStore.getState().transform[2] || 1),
      );
      let nextWidth = Math.max(
        state.minWidth,
        Math.round(
          state.startWidth + (event.clientX - state.startClientX) / safeZoom,
        ),
      );
      let nextHeight = Math.max(
        state.minHeight,
        Math.round(
          state.startHeight + (event.clientY - state.startClientY) / safeZoom,
        ),
      );
      if (state.aspectRatio) {
        const ratio = Math.max(0.001, state.aspectRatio);
        const deltaWidth = (event.clientX - state.startClientX) / safeZoom;
        const deltaWidthFromHeight =
          ((event.clientY - state.startClientY) / safeZoom) * ratio;
        const projectedDeltaWidth =
          Math.abs(deltaWidthFromHeight) > Math.abs(deltaWidth)
            ? deltaWidthFromHeight
            : deltaWidth;
        nextWidth = Math.max(
          state.minWidth,
          Math.round(state.startWidth + projectedDeltaWidth),
          Math.round(state.minHeight * ratio),
        );
        nextHeight = Math.max(state.minHeight, Math.round(nextWidth / ratio));
      }
      state.latestWidth = nextWidth;
      state.latestHeight = nextHeight;
      if (state.nodeElement) {
        state.nodeElement.style.width = `${nextWidth}px`;
        state.nodeElement.style.height = `${nextHeight}px`;
      }
      if (resizePreviewFrameRef.current === null) {
        resizePreviewFrameRef.current = window.requestAnimationFrame(() => {
          resizePreviewFrameRef.current = null;
          updateNodeInternals(node.id);
        });
      }
    },
    [flowStore, node.id, updateNodeInternals],
  );

  const handleResizePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = resizeStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const cancelled = event.type === "pointercancel";
      if (cancelled && state.nodeElement) {
        state.nodeElement.style.width = `${state.startWidth}px`;
        state.nodeElement.style.height = `${state.startHeight}px`;
      } else if (!cancelled) {
        const mediaData =
          isOrdinaryWorkflowImageNode(node) ||
          isOrdinaryWorkflowVideoNode(node) ||
          isWorkflowVideoGeneratorResultNode(node)
            ? ({ workflowMediaUserResized: true } as Partial<
                LibTvWorkflowNode["data"]
              >)
            : undefined;
        const patch = {
          id: node.id,
          position: { width: state.latestWidth, height: state.latestHeight },
          data: mediaData,
        };
        if (data.onMoveNodes) data.onMoveNodes([patch]);
        else {
          data.onMoveNode?.(patch.id, patch.position);
          if (mediaData) data.onUpdateNode?.(patch.id, mediaData);
        }
      }
      resizeStateRef.current = null;
      setIsResizing(false);
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    [data, node],
  );

  return (
    <div
      ref={overlayNodeRef}
      className={`libtv-workflow-overlay-node group ${isResizing ? "workflow-node-resizing" : ""}`}
      style={{
        width: "100%",
        height: "100%",
        pointerEvents: data.interactive ? "auto" : "none",
        ...connectionTiltStyle,
      }}
      data-connection-target={isConnectionTarget ? "true" : undefined}
      data-connection-invalid={isConnectionInvalid ? "true" : undefined}
      data-connection-blocked={isConnectionBlocked ? "true" : undefined}
      onMouseEnter={() => setConnectionNodeHovered(true)}
      onMouseLeave={() => setConnectionNodeHovered(false)}
      onMouseMove={handleConnectionTiltMove}
    >
      {isConnectionInvalid ? (
        <>
          <div
            className="node-glow-invalid-pulse pointer-events-none absolute inset-0 z-[50] rounded-xl"
            aria-hidden="true"
          />
        </>
      ) : isConnectionTarget ? (
        <>
          <div
            className="node-glow-ambient pointer-events-none absolute -inset-1 z-[49] rounded-2xl"
            aria-hidden="true"
          />
          <div
            className="node-glow-diffuse pointer-events-none absolute -inset-0.5 z-[49] rounded-[14px]"
            aria-hidden="true"
          />
          <div
            className="node-glow-border pointer-events-none absolute inset-0 z-[50] rounded-xl"
            aria-hidden="true"
          />
        </>
      ) : null}
      {isConnectionBlocked || isConnectionInvalid ? (
        <div
          className="workflow-node-connection-frost absolute inset-0 z-[50] rounded-xl"
          aria-hidden="true"
        />
      ) : null}
      {node.kind === "text" ? (
        <TapNowTextNode
          node={node}
          selected={isSelected}
          showFloatingControls={showFloatingControls}
          dragging={Boolean(dragging || data.isDragging)}
          onUpdateNode={data.onUpdateNode}
          onReferenceFilesUploaded={data.onReferenceFilesUploaded}
          onImageUpscalePresetFilesUploaded={
            data.onImageUpscalePresetFilesUploaded
          }
          onReferenceNodeRemoved={data.onReferenceNodeRemoved}
          onGenerateNode={data.onGenerateNode}
          onRequestGenerationFrame={data.onRequestGenerationFrame}
          onRequestImageResultFrame={data.onRequestImageResultFrame}
          onGeneratedResult={(result) => {
            data.onUpdateNode?.(node.id, {
              mediaUrl: result.imageUrl,
              mediaRole: "ordinary",
              workflowMediaUserResized: false,
              prompt: result.prompt || node.data?.prompt || "",
              aspectRatio: result.aspectRatio || node.data?.aspectRatio,
              imageSize: result.imageSize || node.data?.imageSize,
            });
            data.onRequestImageResultFrame?.(node.id, result.imageUrl);
          }}
          onOpenAddMenu={openAddMenu}
          onRunTextGeneratorPreset={data.onRunTextGeneratorPreset}
          upstreamNodes={data.upstreamNodes}
          projectId={data.projectId}
        />
      ) : node.kind === "video" && data.videoLodMode === "snapshot" ? (
        <WorkflowVideoNodeLodSnapshot node={node} />
      ) : node.kind === "image" || node.kind === "video" ? (
        <TapNowMediaNode
          node={node}
          selected={isSelected}
          showFloatingControls={showFloatingControls}
          dragging={Boolean(dragging || data.isDragging)}
          upstreamNodes={data.upstreamNodes}
          focusPickActive={data.focusPickActive}
          focusPickOverlay={data.focusPickOverlay}
          onUpdateNode={data.onUpdateNode}
          onReferenceFilesUploaded={data.onReferenceFilesUploaded}
          onCreateImageUpscalePreset={data.onCreateImageUpscalePreset}
          onRunVideoGeneratorPreset={data.onRunVideoGeneratorPreset}
          onRunImageToolbarPreset={data.onRunImageToolbarPreset}
          onCreateAngleEditNode={data.onCreateAngleEditNode}
          onCreatePortraitTexturePreset={data.onCreatePortraitTexturePreset}
          onCreateEmotionAdjustmentPreset={data.onCreateEmotionAdjustmentPreset}
          onReferenceNodeRemoved={data.onReferenceNodeRemoved}
          onStartFocusPick={data.onStartFocusPick}
          onCompleteFocusPick={data.onCompleteFocusPick}
          onMediaFileReplace={data.onMediaFileReplace}
          onMoveNode={data.onMoveNode}
          onGenerateNode={data.onGenerateNode}
          onRequestGenerationFrame={data.onRequestGenerationFrame}
          onRequestImageResultFrame={data.onRequestImageResultFrame}
          onDownloadNode={data.onDownloadNode}
          onSaveNodeToMaterials={data.onSaveNodeToMaterials}
          onReportNodeIssue={data.onReportNodeIssue}
          onCreateAnnotatedImageNode={data.onCreateAnnotatedImageNode}
          onRemoveBackgroundNode={data.onRemoveBackgroundNode}
          onExpandImageNode={data.onExpandImageNode}
          onUpscaleImageNode={data.onUpscaleImageNode}
          onSubmitImageUpscaleNode={data.onSubmitImageUpscaleNode}
          onTrimVideoNode={data.onTrimVideoNode}
          onCropVideoNode={data.onCropVideoNode}
          onCreateVideoUpscaleNode={data.onCreateVideoUpscaleNode}
          onSubmitVideoUpscaleNode={data.onSubmitVideoUpscaleNode}
          onAnalyzeVideoNode={data.onAnalyzeVideoNode}
          onSeparateVideoAudioNode={data.onSeparateVideoAudioNode}
          onRemoveVideoSubtitlesNode={data.onRemoveVideoSubtitlesNode}
          projectId={data.projectId}
        />
      ) : node.kind === "audio" ? (
        <TapNowAudioNode
          node={node}
          selected={isSelected}
          showFloatingControls={showFloatingControls}
          dragging={Boolean(dragging || data.isDragging)}
          upstreamNodes={data.upstreamNodes}
          onUpdateNode={data.onUpdateNode}
          onMediaFileReplace={data.onMediaFileReplace}
          onGenerateNode={data.onGenerateNode}
        />
      ) : node.kind === "playlist" ? (
        <TapNowPlaylistNode
          node={node}
          selected={isSelected}
          onUpdateNode={data.onUpdateNode}
        />
      ) : node.kind === "script" ? (
        <TapNowScriptNode
          node={node}
          selected={isSelected}
          showFloatingControls={showFloatingControls}
          dragging={Boolean(dragging || data.isDragging)}
          nodeEventsSuppressed={Boolean(data.nodeEventsSuppressed)}
          onUpdateNode={data.onUpdateNode}
          onCreateScriptInputNode={data.onCreateScriptInputNode}
          onReferenceFilesUploaded={data.onReferenceFilesUploaded}
          onReferenceNodeRemoved={data.onReferenceNodeRemoved}
          onGenerateNode={data.onGenerateNode}
          onGenerateStoryboard={data.onGenerateStoryboard}
          onRequestGenerationFrame={data.onRequestGenerationFrame}
          onRequestImageResultFrame={data.onRequestImageResultFrame}
          upstreamNodes={data.upstreamNodes}
          projectId={data.projectId}
        />
      ) : node.kind === "script-v2" ? (
        <TapNowScriptV2Node
          node={node}
          selected={isSelected}
          showFloatingControls={showFloatingControls}
          dragging={Boolean(dragging || data.isDragging)}
          nodeEventsSuppressed={Boolean(data.nodeEventsSuppressed)}
          onUpdateNode={data.onUpdateNode}
          onImportScriptV2Assets={data.onImportScriptV2Assets}
          onCreateScriptInputNode={data.onCreateScriptInputNode}
          onGenerateNode={data.onGenerateNode}
          onGenerateStoryboard={data.onGenerateStoryboard}
          onGenerateStoryboardVideos={data.onGenerateStoryboardVideos}
          upstreamNodes={data.upstreamNodes}
          storyboardVideoGroups={data.storyboardVideoGroups}
          canvasImageAssets={data.canvasImageAssets}
          projectId={data.projectId}
        />
      ) : node.kind === "group" ? (
        <TapNowGroupNode
          node={node}
          selected={isSelected}
          showFloatingControls={showFloatingControls}
          childNodes={data.childNodes}
          onUpdateNode={data.onUpdateNode}
          onMoveNode={data.onMoveNode}
          onGenerateNode={data.onGenerateNode}
          onRegenerateStoryboardImages={data.onRegenerateStoryboardImages}
          onUngroupNode={data.onUngroupNode}
          onGenerateStoryboardVideos={data.onGenerateStoryboardVideos}
          onConvertGroupToStoryboard={data.onConvertGroupToStoryboard}
          onRunGroup={data.onRunGroup}
          onDownloadNode={data.onDownloadNode}
          onSaveNodeToMaterials={data.onSaveNodeToMaterials}
          onRunImageToolbarPreset={data.onRunImageToolbarPreset}
          onCreateImageUpscalePreset={data.onCreateImageUpscalePreset}
          onRemoveBackgroundNode={data.onRemoveBackgroundNode}
          onReportNodeIssue={data.onReportNodeIssue}
          projectId={data.projectId}
          upstreamNodes={data.upstreamNodes}
        />
      ) : node.kind === "director-console-3d" ? (
        <TapNowDirectorConsole3DNode
          node={node}
          selected={isSelected}
          upstreamNodes={data.upstreamNodes}
          onUpdateNode={data.onUpdateNode}
          onOpenDirectorConsole3D={data.onOpenDirectorConsole3D}
          onCreateDirectorConsoleCaptureNode={
            data.onCreateDirectorConsoleCaptureNode
          }
          onCreateDirectorConsoleVideoNode={
            data.onCreateDirectorConsoleVideoNode
          }
          projectId={data.projectId}
        />
      ) : node.kind === "threed" ? (
        <TapNowThreeDNode
          node={node}
          selected={isSelected}
          showFloatingControls={showFloatingControls}
          dragging={Boolean(dragging || data.isDragging)}
          upstreamNodes={data.upstreamNodes}
          onUpdateNode={data.onUpdateNode}
          onReferenceFilesUploaded={data.onReferenceFilesUploaded}
          onReferenceNodeRemoved={data.onReferenceNodeRemoved}
          onGenerateNode={data.onGenerateNode}
          onOpenThreeDWorld={data.onOpenThreeDWorld}
        />
      ) : (
        <div
          className="relative overflow-visible rounded-2xl bg-[var(--Surface-secondary-background)] text-fg-default"
          data-testid={`canvas-node-${node.kind}-${node.id}`}
          style={{
            width: "100%",
            height: "100%",
            minWidth: TAPNOW_NODE_MIN_SIZE,
            minHeight: TAPNOW_NODE_MIN_SIZE,
            background: TAPNOW_NODE_PANEL_BACKGROUND,
            color: "var(--fg-default, rgba(255,255,255,0.9))",
            boxShadow: isSelected
              ? "var(--workflow-node-shadow-selected)"
              : "var(--workflow-node-shadow)",
          }}
        >
          <div
            className={WORKFLOW_NODE_TITLE_BAR_CLASS}
            style={WORKFLOW_NODE_TITLE_BAR_STYLE}
          >
            <span
              className="flex shrink-0 items-center text-fg-muted"
              style={{ width: 12, height: 12 }}
            >
              <TapNowNodeIcon kind={node.kind} size={12} />
            </span>
            <span className="min-w-0 truncate">
              {String(node.data?.title || meta.label).trim() || meta.label}
            </span>
          </div>
          <TapNowNodeBody node={node} priority={isSelected} />
        </div>
      )}
      <TapNowHandleVisual
        side="left"
        visible={
          (node.kind !== "group" &&
            !connectionInProgress &&
            connectionNodeHovered) ||
          hoveredHandleSide === "left" ||
          isSelected
        }
        hidden={hideLeftAddHandle}
        active={addMenu?.side === "left"}
        visualRef={leftHandleVisualRef}
        onHoverChange={(hovered) =>
          setHoveredHandleSide((current) =>
            hovered ? "left" : current === "left" ? null : current,
          )
        }
        onOpen={(event) => openAddMenu(event, "left")}
      />
      <TapNowHandleVisual
        side="right"
        visible={
          (node.kind !== "group" &&
            !connectionInProgress &&
            connectionNodeHovered) ||
          hoveredHandleSide === "right" ||
          isSelected
        }
        hidden={hideRightAddHandle}
        active={addMenu?.side === "right"}
        visualRef={rightHandleVisualRef}
        onHoverChange={(hovered) =>
          setHoveredHandleSide((current) =>
            hovered ? "right" : current === "right" ? null : current,
          )
        }
        onOpen={(event) => openAddMenu(event, "right")}
      />
      {addMenu?.side === "left" && !hideLeftAddHandle ? (
        <NodeAddMenu
          anchor={addMenu}
          title={leftAddMenuTitle}
          options={resolvedLeftAddNodeOptions}
          onSelect={handleAddNode}
        />
      ) : null}
      {addMenu?.side === "right" && !hideRightAddHandle ? (
        <NodeAddMenu
          anchor={addMenu}
          title={rightAddMenuTitle}
          options={rightAddNodeOptions}
          onSelect={handleAddNode}
        />
      ) : null}
      {canResizeNode ? (
        <button
          type="button"
          aria-label="调整组件大小"
          title="调整组件大小"
          data-testid="canvas-node-resize-handle"
          className={`nodrag nopan nowheel absolute bottom-0 right-0 z-30 flex h-8 w-8 touch-none cursor-nwse-resize items-center justify-center rounded-lg text-fg-disabled transition-[opacity,color,outline-color] hover:text-fg-muted focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--border-brand)] ${isResizing || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7 1L1 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M7 5L5 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
      <Handle
        id={WORKFLOW_TARGET_HANDLE_LEFT}
        type="target"
        position={Position.Left}
        className="nodrag nopan"
        style={{
          ...INVISIBLE_HANDLE_STYLE,
          left: 0,
          transform: "translateY(-50%)",
          pointerEvents: canReceiveDraggedConnection ? "auto" : "none",
        }}
        isConnectable={canReceiveDraggedConnection}
        isConnectableStart={canReceiveDraggedConnection}
        onClick={(event) => {
          if (hideLeftAddHandle) return;
          openAddMenu(event, "left");
        }}
      >
        <div
          data-workflow-handle-hit-area="left"
          style={{ ...WORKFLOW_HANDLE_HIT_AREA_STYLE, right: 0 }}
          onMouseEnter={() =>
            setHoveredHandleSide(hideLeftAddHandle ? null : "left")
          }
          onMouseMove={(event) => moveHandleVisual(event, "left")}
          onMouseLeave={() => {
            setHoveredHandleSide((current) =>
              current === "left" ? null : current,
            );
            resetHandleVisual("left");
          }}
        />
      </Handle>
      <Handle
        id={WORKFLOW_SOURCE_HANDLE_RIGHT}
        type="source"
        position={Position.Right}
        className="nodrag nopan"
        style={{
          ...INVISIBLE_HANDLE_STYLE,
          right: 0,
          transform: "translateY(-50%)",
          pointerEvents: canStartDraggedConnection ? "auto" : "none",
        }}
        isConnectable={canStartDraggedConnection}
        isConnectableEnd={canStartDraggedConnection}
        onClick={(event) => {
          if (hideRightAddHandle) return;
          openAddMenu(event, "right");
        }}
      >
        <div
          data-workflow-handle-hit-area="right"
          style={{ ...WORKFLOW_HANDLE_HIT_AREA_STYLE, left: 0 }}
          onMouseEnter={() =>
            setHoveredHandleSide(hideRightAddHandle ? null : "right")
          }
          onMouseMove={(event) => moveHandleVisual(event, "right")}
          onMouseLeave={() => {
            setHoveredHandleSide((current) =>
              current === "right" ? null : current,
            );
            resetHandleVisual("right");
          }}
        />
      </Handle>
      {useAssetUnderSourceHandle ? (
        <Handle
          id={WORKFLOW_SOURCE_HANDLE_ASSET_UNDER}
          type="source"
          position={Position.Bottom}
          className="nodrag nopan"
          style={{
            ...INVISIBLE_HANDLE_STYLE,
            top: "auto",
            left: "auto",
            right: 18,
            bottom: -10,
            transform: "translate(50%, 50%)",
            pointerEvents: "none",
          }}
          isConnectable={false}
          isConnectableEnd={false}
        />
      ) : null}
    </div>
  );
});

export const WORKFLOW_NODE_TYPES = Object.freeze({
  text: WorkflowOverlayNode,
  image: WorkflowOverlayNode,
  video: WorkflowOverlayNode,
  audio: WorkflowOverlayNode,
  playlist: WorkflowOverlayNode,
  threed: WorkflowOverlayNode,
  "director-console-3d": WorkflowOverlayNode,
  script: WorkflowOverlayNode,
  "script-v2": WorkflowOverlayNode,
  group: WorkflowOverlayNode,
});
