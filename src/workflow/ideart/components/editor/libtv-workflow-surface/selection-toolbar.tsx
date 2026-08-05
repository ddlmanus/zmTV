"use client";

import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Position,
  useStore,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  CANVAS_CONTROLS_MENU_PANEL_STYLE,
  WORKFLOW_GROUP_DEFAULT_BACKGROUND,
  WORKFLOW_NODE_CLOSE_MENUS_EVENT,
  WORKFLOW_SELECTION_BUTTON_HOVER_CONIC,
  WORKFLOW_SELECTION_BUTTON_HOVER_RADIAL,
  WORKFLOW_SOURCE_HANDLE_RIGHT,
  WORKFLOW_TARGET_HANDLE_LEFT,
} from "./surface-contracts";
import {
  canConnectWorkflowNodes,
  isWorkflowImageGeneratorResultGroupNode,
} from "./workflow-node-kinds";
import {
  emitWorkflowMultiSelectionConnection,
  getWorkflowCableColor,
  getWorkflowCablePath,
  getWorkflowCableTone,
} from "./workflow-connections";
import {
  getFlowNodeAbsolutePosition,
  getWorkflowNodeIdFromElement,
} from "./workflow-layout";
import { isRenderableWorkflowMediaUrl } from "./workflow-media-utils";
import type { WorkflowOverlayNodeData } from "./surface-contracts";
import type { WorkflowMultiSelectionConnectionFeedback } from "./workflow-connections";
import type { WorkflowCableTone } from "./workflow-models";

export function WorkflowSelectionActionButton({
  icon,
  label,
  disabled,
  onClick,
  innerRef,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  innerRef?: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <button
      ref={innerRef}
      className="z-0 group/button relative flex h-10 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full bg-transparent px-3 py-1 text-xs transition-all duration-200 [transition-timing-function:cubic-bezier(0.25,0.8,0.25,1)] disabled:cursor-not-allowed disabled:opacity-50"
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <div className="pointer-events-none absolute inset-0 z-[-1] overflow-hidden rounded-[inherit] opacity-0 transition-opacity [transition-duration:400ms] [transition-timing-function:cubic-bezier(0.25,0.8,0.25,1)] group-hover/button:opacity-100">
        <div className="absolute inset-[-100%] flex items-center justify-center">
          <div
            className="h-full w-full"
            style={{
              background: WORKFLOW_SELECTION_BUTTON_HOVER_CONIC,
              transform: "scale(1.1, 0.7)",
            }}
          />
        </div>
        <div
          className="absolute inset-[1px] rounded-[inherit]"
          style={{ background: WORKFLOW_SELECTION_BUTTON_HOVER_RADIAL }}
        />
      </div>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function SelectionSaveMaterialIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <g transform="translate(1.875, 2.5)">
        <path
          d="M13.125 8.75C13.4702 8.75 13.75 9.02982 13.75 9.375V11.25H15.625C15.9702 11.25 16.25 11.5298 16.25 11.875C16.25 12.2202 15.9702 12.5 15.625 12.5H13.75V14.375C13.75 14.7202 13.4702 15 13.125 15C12.7798 15 12.5 14.7202 12.5 14.375V12.5H10.625C10.2798 12.5 10 12.2202 10 11.875C10 11.5298 10.2798 11.25 10.625 11.25H12.5V9.375C12.5 9.02982 12.7798 8.75 13.125 8.75ZM5.07227 0C5.42186 5.64257e-05 5.7672 0.0857785 6.07617 0.249023C6.38274 0.411105 6.64563 0.645746 6.83984 0.932617L7.44727 1.81445L7.45117 1.82031C7.53039 1.93827 7.63968 2.03669 7.76953 2.10449C7.89943 2.17229 8.04582 2.20748 8.19434 2.20605H14.125C14.6845 2.2061 15.2237 2.42395 15.623 2.81543C16.0228 3.20739 16.25 3.74203 16.25 4.30176V7.14453C16.2499 7.48963 15.9701 7.76953 15.625 7.76953C15.2799 7.76953 15.0001 7.48963 15 7.14453V4.30176C15 4.08162 14.9107 3.86754 14.748 3.70801C14.5849 3.54811 14.3609 3.4561 14.125 3.45605L8.2002 3.45508C7.84934 3.45745 7.50239 3.37514 7.19141 3.21289C6.88055 3.05059 6.6143 2.81357 6.41797 2.52344L5.81055 1.64062L5.77539 1.59277C5.70051 1.495 5.60435 1.41281 5.49219 1.35352C5.37996 1.29422 5.25484 1.25975 5.12695 1.25195L5.07227 1.25H2.125C1.88908 1.25004 1.6651 1.34204 1.50195 1.50195C1.3392 1.66152 1.25001 1.87549 1.25 2.0957V11.6543C1.25001 11.8745 1.3392 12.0885 1.50195 12.248C1.6651 12.408 1.88908 12.5 2.125 12.5H7.29199C7.63702 12.5002 7.91699 12.7799 7.91699 13.125C7.91699 13.4701 7.63702 13.7498 7.29199 13.75H2.125C1.56554 13.75 1.02631 13.532 0.626953 13.1406C0.227209 12.7486 1.28854e-05 12.214 0 11.6543V2.0957C1.29392e-05 1.53596 0.227208 1.00135 0.626953 0.609375C1.02631 0.217974 1.56554 4.22131e-05 2.125 0H5.07227Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function SelectionPlaylistIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.1045 2.8125C16.2548 2.81268 17.1873 3.74517 17.1875 4.89551V15.1045C17.1873 16.2548 16.2548 17.1873 15.1045 17.1875H4.89551C3.74517 17.1873 2.81268 16.2548 2.8125 15.1045V4.89551C2.81268 3.74517 3.74517 2.81268 4.89551 2.8125H15.1045ZM4.0625 15.1045C4.06268 15.5645 4.43553 15.9373 4.89551 15.9375H5.72949V13.9062H4.0625V15.1045ZM6.97949 15.9375H13.0205V10.625H6.97949V15.9375ZM14.2705 15.9375H15.1045C15.5645 15.9373 15.9373 15.5645 15.9375 15.1045V13.9062H14.2705V15.9375ZM4.0625 12.6562H5.72949V10.625H4.0625V12.6562ZM14.2705 12.6562H15.9375V10.625H14.2705V12.6562ZM4.0625 9.375H5.72949V7.34375H4.0625V9.375ZM6.97949 9.375H13.0205V4.0625H6.97949V9.375ZM14.2705 9.375H15.9375V7.34375H14.2705V9.375ZM4.89551 4.0625C4.43553 4.06268 4.06268 4.43553 4.0625 4.89551V6.09375H5.72949V4.0625H4.89551ZM14.2705 6.09375H15.9375V4.89551C15.9373 4.43553 15.5645 4.06268 15.1045 4.0625H14.2705V6.09375Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SelectionFoldersIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M9 3h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
      <path d="M17 16v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2" />
    </svg>
  );
}

export function SelectionBugIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M9 9v-1a3 3 0 0 1 6 0v1" />
      <path d="M8 9h8a6 6 0 0 1 1 3v3a5 5 0 0 1 -10 0v-3a6 6 0 0 1 1 -3" />
      <path d="M3 13l4 0" />
      <path d="M17 13l4 0" />
      <path d="M12 20l0 -6" />
      <path d="M4 19l3.35 -2" />
      <path d="M20 19l-3.35 -2" />
      <path d="M4 7l3.75 2.4" />
      <path d="M20 7l-3.75 2.4" />
    </svg>
  );
}

export function SelectionConnectionHandleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="9.35" fill="var(--canvas-handle-bg)" />
      <circle
        cx="10"
        cy="10"
        r="9.35"
        stroke="var(--canvas-handle-icon)"
        strokeWidth="1.2"
      />
      <path
        d="M10 6.5v7M6.5 10h7"
        stroke="var(--canvas-handle-icon)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function isWorkflowReferenceSelectionNode(node: LibTvWorkflowNode) {
  return (
    String((node as LibTvWorkflowNode & { kind?: string }).kind || "") ===
      "reference" || String(node.data?.componentType || "") === "reference-node"
  );
}

export function canStartWorkflowMultiSelectionConnection(
  node: LibTvWorkflowNode,
) {
  if (isWorkflowReferenceSelectionNode(node)) return false;
  if (node.kind === "group")
    return isWorkflowImageGeneratorResultGroupNode(node);
  if (
    (node.kind === "image" || node.kind === "video") &&
    /^(?:blob:|data:)/i.test(String(node.data?.mediaUrl || "").trim())
  )
    return false;
  return true;
}

export function getWorkflowMultiSelectionConnectionEdgePairs(
  edges: ReadonlyArray<Pick<Edge, "source" | "target">>,
) {
  const pairs = new Set<string>();
  for (const edge of edges) {
    pairs.add(edge.source + "\u0000" + edge.target);
    pairs.add(edge.target + "\u0000" + edge.source);
  }
  return pairs;
}

export function getWorkflowMultiSelectionConnectionEdgePairsForFlow(
  flowNodes: Array<Node<WorkflowOverlayNodeData>>,
  flowEdges: Edge[],
) {
  return (
    flowNodes[0]?.data.connectionEdgePairs ||
    getWorkflowMultiSelectionConnectionEdgePairs(flowEdges)
  );
}

export function resolveWorkflowMultiSelectionConnectionFeedback(
  sourceNodes: LibTvWorkflowNode[],
  targetNode: LibTvWorkflowNode | undefined,
  allNodes: LibTvWorkflowNode[],
  edgePairs: ReadonlySet<string>,
): WorkflowMultiSelectionConnectionFeedback {
  if (
    !targetNode ||
    targetNode.kind === "group" ||
    sourceNodes.some((node) => node.id === targetNode.id)
  ) {
    return "invalid";
  }
  const disconnectedSources = sourceNodes.filter(
    (sourceNode) => !edgePairs.has(sourceNode.id + "\u0000" + targetNode.id),
  );
  if (disconnectedSources.length === 0) return "duplicate";
  return disconnectedSources.every((sourceNode) =>
    canConnectWorkflowNodes(sourceNode, targetNode, allNodes),
  )
    ? "valid"
    : "invalid";
}

export const WorkflowMultiSelectionConnectionCurve = memo(
  function WorkflowMultiSelectionConnectionCurve({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    zoom,
    tone,
  }: {
    id: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    zoom: number;
    tone: WorkflowCableTone;
  }) {
    const pathD = getWorkflowCablePath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    return (
      <g data-workflow-cable-preview={id}>
        <path
          d={pathD}
          fill="none"
          stroke="var(--workflow-cable-outline, rgba(8, 10, 13, 0.82))"
          strokeWidth={5 * zoom}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.72}
          pointerEvents="none"
        />
        <path
          d={pathD}
          fill="none"
          stroke={getWorkflowCableColor(tone)}
          strokeWidth={2.5 * zoom}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.96}
          pointerEvents="none"
        />
      </g>
    );
  },
);

export const WorkflowMultiSelectionConnectionLines = memo(
  function WorkflowMultiSelectionConnectionLines({
    sourceNodeIds,
    cursorPosition,
  }: {
    sourceNodeIds: string[];
    cursorPosition: { x: number; y: number };
  }) {
    const flow = useReactFlow<Node<WorkflowOverlayNodeData>, Edge>();
    const zoom = useStore((state) =>
      Math.max(0.0001, Number(state.transform?.[2] || 1)),
    );
    const flowNodes = flow.getNodes();
    const flowNodeById = new Map(flowNodes.map((node) => [node.id, node]));
    const sourcePositions = sourceNodeIds.flatMap((id) => {
      const flowNode = flowNodeById.get(id);
      if (!flowNode) return [];
      const position = getFlowNodeAbsolutePosition(flowNode, flowNodeById);
      const measuredWidth = Number(flowNode.measured?.width);
      const measuredHeight = Number(flowNode.measured?.height);
      const fallbackWidth = Number(
        flowNode.width || flowNode.style?.width || 1,
      );
      const fallbackHeight = Number(
        flowNode.height || flowNode.style?.height || 1,
      );
      const width =
        Number.isFinite(measuredWidth) && measuredWidth > 0
          ? measuredWidth
          : Number.isFinite(fallbackWidth) && fallbackWidth > 0
            ? fallbackWidth
            : 1;
      const height =
        Number.isFinite(measuredHeight) && measuredHeight > 0
          ? measuredHeight
          : Number.isFinite(fallbackHeight) && fallbackHeight > 0
            ? fallbackHeight
            : 1;
      const screenPosition = flow.flowToScreenPosition({
        x: position.x + width,
        y: position.y + height / 2,
      });
      return [
        {
          id,
          x: screenPosition.x,
          y: screenPosition.y,
          tone: getWorkflowCableTone(flowNode.data.workflowNode),
        },
      ];
    });

    if (typeof document === "undefined") return null;
    return createPortal(
      <svg
        className="canvas-theme-portal pointer-events-none fixed inset-0 z-[9998] h-screen w-screen overflow-visible"
        aria-hidden="true"
      >
        <g>
          {sourcePositions.map((source) => (
            <WorkflowMultiSelectionConnectionCurve
              key={source.id}
              id={source.id}
              sourceX={source.x}
              sourceY={source.y}
              targetX={cursorPosition.x}
              targetY={cursorPosition.y}
              zoom={zoom}
              tone={source.tone}
            />
          ))}
        </g>
      </svg>,
      document.body,
    );
  },
);

export function WorkflowMultiSelectionToolbar({
  bounds,
  selectedIds,
  selectedNodes,
  onSaveNodeToMaterials,
  onReportNodeIssue,
  onCreatePlaylistFromSelection,
  onGroupNodes,
  onUngroupNode,
  onCreateNodeFromSelection,
  onConnect,
}: {
  bounds: { x: number; y: number; width: number; height: number };
  selectedIds: string[];
  selectedNodes: LibTvWorkflowNode[];
  onSaveNodeToMaterials?: (id: string) => void;
  onReportNodeIssue?: (id: string) => void;
  onCreatePlaylistFromSelection?: (ids: string[]) => void;
  onGroupNodes?: (
    ids: string[],
    options?: { backgroundColor?: string; mode?: "normal" | "storyboard" },
  ) => void;
  onUngroupNode?: (id: string) => void;
  onCreateNodeFromSelection?: (
    kind: LibTvWorkflowNode["kind"],
    ids: string[],
  ) => void;
  onConnect?: (connection: Connection) => void;
}) {
  const flow = useReactFlow<Node<WorkflowOverlayNodeData>, Edge>();
  const transform = useStore((state) => state.transform);
  const [viewportX, viewportY, viewportZoom] = transform;
  const screenLeft = viewportX + (bounds.x + bounds.width / 2) * viewportZoom;
  const screenTop = viewportY + (bounds.y - 18) * viewportZoom;
  const selectionLeft = viewportX + bounds.x * viewportZoom;
  const selectionTop = viewportY + bounds.y * viewportZoom;
  const selectionWidth = bounds.width * viewportZoom;
  const selectionHeight = bounds.height * viewportZoom;
  const selectionHandleSize = 80 * viewportZoom;
  const selectionHandleVisualSize = 24 * viewportZoom;
  const selectionHandleIconSize = 14 * viewportZoom;
  const selectionHandleTranslateX = -23 * viewportZoom;
  const selectionHandleMagneticRadius = 28 * viewportZoom;
  const selectedVideoIds = selectedNodes
    .filter(
      (node) =>
        node.kind === "video" &&
        isRenderableWorkflowMediaUrl(String(node.data?.mediaUrl || "")),
    )
    .map((node) => node.id);
  const selectedMaterialNodes = selectedNodes.filter(
    (node) =>
      (node.kind === "image" &&
        node.data?.mediaRole === "ordinary" &&
        String(node.data?.mediaUrl || "").trim()) ||
      (node.kind === "video" &&
        node.data?.mediaRole === "ordinary" &&
        String(node.data?.mediaUrl || "").trim()) ||
      (node.kind === "audio" &&
        node.data?.mediaRole === "ordinary" &&
        String(node.data?.mediaUrl || "").trim()) ||
      isWorkflowImageGeneratorResultGroupNode(node),
  );
  const selectedGroupIds = selectedNodes
    .filter((node) => node.kind === "group")
    .map((node) => node.id);
  const canCreatePlaylist = selectedVideoIds.length >= 2;
  const canCreateReferenceSelection =
    selectedMaterialNodes.length > 0 &&
    selectedMaterialNodes.length === selectedIds.length;
  const selectionSourceNodes = useMemo(
    () =>
      selectedNodes.filter(
        (node) =>
          !flow.getNode(node.id)?.data.connectionHandlesDisabled &&
          canStartWorkflowMultiSelectionConnection(node),
      ),
    [flow, selectedNodes],
  );
  const selectionSourceIds = useMemo(
    () => selectionSourceNodes.map((node) => node.id),
    [selectionSourceNodes],
  );
  const [selectionConnectionMenuOpen, setSelectionConnectionMenuOpen] =
    useState(false);
  const [selectionConnectionDragging, setSelectionConnectionDragging] =
    useState(false);
  const [selectionConnectionCursor, setSelectionConnectionCursor] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectionConnectionMenuAnchor, setSelectionConnectionMenuAnchor] =
    useState<{ x: number; y: number } | null>(null);
  const selectionSourceNodesRef = useRef(selectionSourceNodes);
  const selectionSourceIdsRef = useRef(selectionSourceIds);
  const onConnectRef = useRef(onConnect);
  const selectionHandleRef = useRef<HTMLDivElement | null>(null);
  const selectionHandleVisualRef = useRef<HTMLDivElement | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement | null>(null);
  const selectionHandleResetTimerRef = useRef<number | null>(null);
  const selectionConnectionStartRef = useRef<{
    time: number;
    x: number;
    y: number;
  } | null>(null);
  const selectionConnectionDraggingRef = useRef(false);
  const selectionConnectionTargetIdRef = useRef<string | null>(null);
  const selectionConnectionFlowRootRef = useRef<Element | null>(null);
  useLayoutEffect(() => {
    selectionSourceNodesRef.current = selectionSourceNodes;
    selectionSourceIdsRef.current = selectionSourceIds;
    onConnectRef.current = onConnect;
  }, [onConnect, selectionSourceIds, selectionSourceNodes]);

  const emitSelectionConnectionFeedback = useCallback(
    (
      active: boolean,
      targetId: string | null,
      feedback: WorkflowMultiSelectionConnectionFeedback,
    ) => {
      emitWorkflowMultiSelectionConnection({
        flowRoot: selectionConnectionFlowRootRef.current,
        active,
        targetId,
        feedback,
      });
    },
    [],
  );

  const resetSelectionHandleVisual = useCallback(() => {
    const element = selectionHandleVisualRef.current;
    if (!element) return;
    if (selectionHandleResetTimerRef.current !== null) {
      window.clearTimeout(selectionHandleResetTimerRef.current);
      selectionHandleResetTimerRef.current = null;
    }
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    element.style.transition = reduceMotion
      ? "none"
      : "transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)";
    element.style.transform =
      "translate(" + selectionHandleTranslateX + "px, 0px) scale(1)";
    if (!reduceMotion) {
      selectionHandleResetTimerRef.current = window.setTimeout(() => {
        selectionHandleResetTimerRef.current = null;
        if (element.isConnected) element.style.transition = "";
      }, 450);
    }
  }, [selectionHandleTranslateX]);

  const resolveTargetAtScreenPoint = useCallback(
    (point: { x: number; y: number }) => {
      const elementTargetId = getWorkflowNodeIdFromElement(
        document.elementFromPoint(point.x, point.y),
      );
      if (elementTargetId) return elementTargetId;
      const flowPoint = flow.screenToFlowPosition(point);
      return (
        flow
          .getIntersectingNodes({
            x: flowPoint.x,
            y: flowPoint.y,
            width: 1,
            height: 1,
          })
          .pop()?.id || ""
      );
    },
    [flow],
  );

  const resolveTargetFeedback = useCallback(
    (targetId: string) => {
      const flowNodes = flow.getNodes();
      const targetFlowNode = flowNodes.find((node) => node.id === targetId);
      if (targetFlowNode?.data.connectionHandlesDisabled)
        return "invalid" as const;
      const targetNode = targetFlowNode?.data.workflowNode;
      const allNodes = flowNodes.map((node) => node.data.workflowNode);
      return resolveWorkflowMultiSelectionConnectionFeedback(
        selectionSourceNodesRef.current,
        targetNode,
        allNodes,
        getWorkflowMultiSelectionConnectionEdgePairsForFlow(
          flowNodes,
          flow.getEdges(),
        ),
      );
    },
    [flow],
  );

  const tryConnectSelectionAtScreenPoint = useCallback(
    (point: { x: number; y: number }) => {
      const flowPoint = flow.screenToFlowPosition(point);
      const sourceIds = new Set(selectionSourceIdsRef.current);
      const targetFlowNode = flow
        .getIntersectingNodes({
          x: flowPoint.x,
          y: flowPoint.y,
          width: 1,
          height: 1,
        })
        .filter(
          (candidate) =>
            !sourceIds.has(candidate.id) &&
            candidate.data.workflowNode.kind !== "group",
        )
        .pop();
      if (!targetFlowNode) return false;
      const flowNodes = flow.getNodes();
      if (targetFlowNode.data.connectionHandlesDisabled) return false;
      const targetNode = targetFlowNode.data.workflowNode;
      const allNodes = flowNodes.map((node) => node.data.workflowNode);
      const edgePairs = getWorkflowMultiSelectionConnectionEdgePairsForFlow(
        flowNodes,
        flow.getEdges(),
      );
      const feedback = resolveWorkflowMultiSelectionConnectionFeedback(
        selectionSourceNodesRef.current,
        targetNode,
        allNodes,
        edgePairs,
      );
      if (feedback !== "valid") return false;
      const disconnectedSources = selectionSourceNodesRef.current.filter(
        (sourceNode) =>
          !edgePairs.has(sourceNode.id + "\u0000" + targetNode.id),
      );
      if (disconnectedSources.length === 0 || !onConnectRef.current)
        return false;
      disconnectedSources.forEach((sourceNode) => {
        onConnectRef.current?.({
          source: sourceNode.id,
          sourceHandle: WORKFLOW_SOURCE_HANDLE_RIGHT,
          target: targetNode.id,
          targetHandle: WORKFLOW_TARGET_HANDLE_LEFT,
        });
      });
      return true;
    },
    [flow],
  );

  const finishSelectionConnectionDrag = useCallback(
    (point: { x: number; y: number }, cancelled = false) => {
      selectionConnectionDraggingRef.current = false;
      selectionConnectionTargetIdRef.current = null;
      setSelectionConnectionDragging(false);
      setSelectionConnectionCursor(null);
      resetSelectionHandleVisual();
      emitSelectionConnectionFeedback(false, null, null);
      if (cancelled) return;
      const connected = tryConnectSelectionAtScreenPoint(point);
      if (connected) {
        setSelectionConnectionMenuOpen(false);
        setSelectionConnectionMenuAnchor(null);
        return;
      }
      setSelectionConnectionMenuAnchor(flow.screenToFlowPosition(point));
      setSelectionConnectionMenuOpen(true);
    },
    [
      emitSelectionConnectionFeedback,
      flow,
      resetSelectionHandleVisual,
      tryConnectSelectionAtScreenPoint,
    ],
  );

  const handleSelectionConnectionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || selectionSourceNodesRef.current.length === 0)
        return;
      event.preventDefault();
      event.stopPropagation();
      selectionConnectionStartRef.current = {
        time: Date.now(),
        x: event.clientX,
        y: event.clientY,
      };
      selectionConnectionDraggingRef.current = false;
      selectionConnectionFlowRootRef.current =
        event.currentTarget.closest(".react-flow");
    },
    [],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const start = selectionConnectionStartRef.current;
      if (!start) return;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (!selectionConnectionDraggingRef.current && distance >= 10) {
        selectionConnectionDraggingRef.current = true;
        setSelectionConnectionDragging(true);
        setSelectionConnectionMenuOpen(false);
        setSelectionConnectionMenuAnchor(null);
        resetSelectionHandleVisual();
        window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
        emitSelectionConnectionFeedback(true, null, null);
      }
      if (!selectionConnectionDraggingRef.current) return;
      const point = { x: event.clientX, y: event.clientY };
      setSelectionConnectionCursor(point);
      const targetId = resolveTargetAtScreenPoint(point) || null;
      if (targetId === selectionConnectionTargetIdRef.current) return;
      selectionConnectionTargetIdRef.current = targetId;
      emitSelectionConnectionFeedback(
        true,
        targetId,
        targetId ? resolveTargetFeedback(targetId) : null,
      );
    };
    const handlePointerUp = (event: PointerEvent) => {
      const start = selectionConnectionStartRef.current;
      selectionConnectionStartRef.current = null;
      if (!start) return;
      const point = { x: event.clientX, y: event.clientY };
      if (selectionConnectionDraggingRef.current) {
        finishSelectionConnectionDrag(point);
        return;
      }
      const deltaX = point.x - start.x;
      const deltaY = point.y - start.y;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (Date.now() - start.time < 300 && distance < 10) {
        setSelectionConnectionMenuAnchor(null);
        setSelectionConnectionMenuOpen((current) => !current);
      }
    };
    const handlePointerCancel = () => {
      selectionConnectionStartRef.current = null;
      if (selectionConnectionDraggingRef.current) {
        finishSelectionConnectionDrag({ x: 0, y: 0 }, true);
      }
    };
    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerCancel);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerCancel);
      if (selectionConnectionDraggingRef.current) {
        selectionConnectionDraggingRef.current = false;
        emitSelectionConnectionFeedback(false, null, null);
      }
    };
  }, [
    emitSelectionConnectionFeedback,
    finishSelectionConnectionDrag,
    resetSelectionHandleVisual,
    resolveTargetAtScreenPoint,
    resolveTargetFeedback,
  ]);

  useLayoutEffect(() => {
    if (!selectionConnectionDraggingRef.current) resetSelectionHandleVisual();
  }, [resetSelectionHandleVisual]);

  useEffect(
    () => () => {
      if (selectionHandleResetTimerRef.current !== null) {
        window.clearTimeout(selectionHandleResetTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectionConnectionMenuOpen) return;
    const closeOnOutsidePress = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof globalThis.Node)) return;
      if (
        selectionMenuRef.current?.contains(target) ||
        selectionHandleRef.current?.contains(target)
      )
        return;
      setSelectionConnectionMenuOpen(false);
      setSelectionConnectionMenuAnchor(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectionConnectionMenuOpen(false);
      setSelectionConnectionMenuAnchor(null);
    };
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectionConnectionMenuOpen]);

  const handleSelectionHandleMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const element = selectionHandleVisualRef.current;
      if (!element || selectionConnectionDraggingRef.current) return;
      if (selectionHandleResetTimerRef.current !== null) {
        window.clearTimeout(selectionHandleResetTimerRef.current);
        selectionHandleResetTimerRef.current = null;
      }
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        return;
      const rect = event.currentTarget.getBoundingClientRect();
      const deltaX = event.clientX - (rect.left + rect.width / 2);
      const deltaY = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      const clampScale =
        distance > selectionHandleMagneticRadius
          ? selectionHandleMagneticRadius / distance
          : 1;
      element.style.transition = "transform 80ms ease-out";
      element.style.transform =
        "translate(" +
        deltaX * clampScale +
        "px, " +
        deltaY * clampScale +
        "px) scale(1.1)";
    },
    [selectionHandleMagneticRadius],
  );

  const createNodeFromSelection = useCallback(
    (kind: LibTvWorkflowNode["kind"], event: React.SyntheticEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (selectionSourceIds.length === 0) return;
      setSelectionConnectionMenuOpen(false);
      setSelectionConnectionMenuAnchor(null);
      onCreateNodeFromSelection?.(kind, selectionSourceIds);
    },
    [onCreateNodeFromSelection, selectionSourceIds],
  );
  const runForSelected = useCallback(
    (handler?: (id: string) => void) => {
      if (!handler) return;
      selectedIds.forEach((id) => handler(id));
    },
    [selectedIds],
  );
  const groupSelected = useCallback(() => {
    onGroupNodes?.(selectedIds, {
      backgroundColor: WORKFLOW_GROUP_DEFAULT_BACKGROUND,
      mode: "normal",
    });
  }, [onGroupNodes, selectedIds]);
  const ungroupSelected = useCallback(() => {
    if (selectedGroupIds.length === 0) return;
    selectedGroupIds.forEach((id) => onUngroupNode?.(id));
  }, [onUngroupNode, selectedGroupIds]);
  const selectionConnectionMenuLeft = selectionConnectionMenuAnchor
    ? viewportX + selectionConnectionMenuAnchor.x * viewportZoom + 12
    : selectionLeft + selectionWidth + 20;
  const selectionConnectionMenuTop = selectionConnectionMenuAnchor
    ? viewportY + selectionConnectionMenuAnchor.y * viewportZoom
    : selectionTop + selectionHeight / 2;
  const selectionConnectionLineCursor =
    selectionConnectionDragging && selectionConnectionCursor
      ? selectionConnectionCursor
      : selectionConnectionMenuOpen && selectionConnectionMenuAnchor
        ? flow.flowToScreenPosition(selectionConnectionMenuAnchor)
        : null;
  const selectionConnectionUi =
    selectionSourceNodes.length > 0 ? (
      <>
        <div
          ref={selectionHandleRef}
          className="nodrag nopan nowheel pointer-events-auto absolute z-[9999] flex items-center justify-center"
          style={{
            left: selectionLeft + selectionWidth,
            top: selectionTop + selectionHeight / 2,
            width: selectionHandleSize,
            height: selectionHandleSize,
            transform: "translateY(-50%)",
            cursor: selectionConnectionDragging ? "grabbing" : "crosshair",
            touchAction: "none",
          }}
          onPointerDown={handleSelectionConnectionPointerDown}
          onMouseMove={handleSelectionHandleMove}
          onMouseLeave={resetSelectionHandleVisual}
          onClick={stopWorkflowNodeChromeEvent}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          <div
            ref={selectionHandleVisualRef}
            style={{
              width: selectionHandleVisualSize,
              height: selectionHandleVisualSize,
              flexShrink: 0,
              transform:
                "translate(" + selectionHandleTranslateX + "px, 0px) scale(1)",
            }}
          >
            <button
              type="button"
              className="flex h-full w-full items-center justify-center rounded-full border border-canvas-controls-border bg-canvas-controls-bg text-canvas-controls-text shadow-md transition-colors hover:bg-canvas-controls-hover canvas-light:bg-transparent canvas-light:shadow-none"
              title="拖拽连线或点击选择节点类型"
              aria-label="拖拽连线或点击选择节点类型"
              style={{ cursor: "inherit", touchAction: "none" }}
            >
              <svg
                width={selectionHandleIconSize}
                height={selectionHandleIconSize}
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <line
                  x1="7"
                  y1="2"
                  x2="7"
                  y2="12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <line
                  x1="2"
                  y1="7"
                  x2="12"
                  y2="7"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {selectionConnectionLineCursor ? (
          <WorkflowMultiSelectionConnectionLines
            sourceNodeIds={selectionSourceIds}
            cursorPosition={selectionConnectionLineCursor}
          />
        ) : null}

        {selectionConnectionMenuOpen ? (
          <div
            ref={selectionMenuRef}
            className="nodrag nopan nowheel pointer-events-auto absolute z-[10000] flex w-[196px] flex-col gap-1 rounded-2xl p-2 text-canvas-controls-text backdrop-blur-[32px]"
            style={{
              ...CANVAS_CONTROLS_MENU_PANEL_STYLE,
              left: selectionConnectionMenuLeft,
              top: selectionConnectionMenuTop,
              transform: "translateY(-50%)",
            }}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={stopWorkflowNodeChromeEvent}
            onContextMenu={preventWorkflowNodeChromeContextMenu}
          >
            <h4 className="m-0 flex min-h-8 items-center px-2 py-1 text-xs font-medium leading-4 opacity-60">
              引用选中的 {selectionSourceNodes.length} 个节点生成
            </h4>
            {[
              { kind: "text" as const, label: "文本生成器" },
              { kind: "image" as const, label: "图片生成器" },
              { kind: "video" as const, label: "视频生成器" },
              { kind: "playlist" as const, label: "视频合成" },
              { kind: "script-v2" as const, label: "脚本生成器" },
            ].map((option) => (
              <button
                key={option.kind}
                type="button"
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[13px] font-normal leading-normal text-canvas-controls-text transition-colors duration-200 hover:bg-canvas-controls-hover"
                onClick={(event) => createNodeFromSelection(option.kind, event)}
              >
                <span className="flex size-[14px] shrink-0 items-center justify-center">
                  <TapNowNodeIcon kind={option.kind} size={14} opacity={0.86} />
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </>
    ) : null;
  if (canCreateReferenceSelection) {
    return (
      <>
        <div
          className="nodrag nopan nowheel pointer-events-none absolute z-[1200]"
          style={{
            left: selectionLeft,
            top: selectionTop,
            width: selectionWidth,
            height: selectionHeight,
          }}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          <div
            className="absolute inset-0 rounded-lg border border-dashed"
            style={{
              background: "var(--canvas-selection-bg, rgba(255,255,255,0.06))",
              borderColor: "rgba(0, 219, 205, 0.62)",
              pointerEvents: "auto",
              cursor: "grab",
              borderWidth: 0.75,
            }}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={stopWorkflowNodeChromeEvent}
          />
          <div
            className="absolute left-0"
            style={{
              pointerEvents: "auto",
              cursor: "grab",
              zIndex: 1,
              top: -6,
              width: "100%",
              height: 12,
            }}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
          />
          <div
            className="absolute top-0"
            style={{
              pointerEvents: "auto",
              cursor: "grab",
              zIndex: 1,
              left: "calc(100% - 6px)",
              width: 12,
              height: "calc(50% - 32px)",
            }}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
          />
          <div
            className="absolute bottom-0"
            style={{
              pointerEvents: "auto",
              cursor: "grab",
              zIndex: 1,
              left: "calc(100% - 6px)",
              width: 12,
              height: "calc(50% - 32px)",
            }}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
          />
          <div
            className="absolute left-0"
            style={{
              pointerEvents: "auto",
              cursor: "grab",
              zIndex: 1,
              top: "calc(100% - 6px)",
              width: "100%",
              height: 12,
            }}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
          />
          <div
            className="absolute top-0"
            style={{
              pointerEvents: "auto",
              cursor: "grab",
              zIndex: 1,
              left: -6,
              width: 12,
              height: "100%",
            }}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
          />
        </div>

        <div
          className="nodrag nopan nowheel pointer-events-auto absolute z-[1201]"
          style={{
            left: screenLeft,
            top: screenTop,
            transform: "translate(-50%, -100%) translateY(-14px)",
          }}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          <div className="flex w-fit max-w-[calc(100vw-32px)] items-center gap-1 overflow-x-auto rounded-full border border-white/[0.12] bg-[#202024]/80 p-1 text-white/90 shadow-[0_18px_44px_rgba(0,0,0,0.30)] backdrop-blur-lg">
            <WorkflowSelectionActionButton
              icon={<SelectionSaveMaterialIcon />}
              label="保存到素材库"
              onClick={() => runForSelected(onSaveNodeToMaterials)}
            />
            <WorkflowSelectionActionButton
              icon={<SelectionFoldersIcon />}
              label={selectedGroupIds.length > 0 ? "解组" : "打组"}
              onClick={
                selectedGroupIds.length > 0 ? ungroupSelected : groupSelected
              }
            />
            <WorkflowSelectionActionButton
              icon={<SelectionBugIcon />}
              label="反馈"
              onClick={() => runForSelected(onReportNodeIssue)}
            />
          </div>
        </div>

        {selectionConnectionUi}
      </>
    );
  }

  return (
    <>
      <div
        className="nodrag nopan nowheel pointer-events-auto absolute z-[1200]"
        style={{
          left: screenLeft,
          top: screenTop,
          transform: "translate(-50%, -100%)",
        }}
        onPointerDown={stopWorkflowNodeChromeEvent}
        onMouseDown={stopWorkflowNodeChromeEvent}
        onClick={stopWorkflowNodeChromeEvent}
        onContextMenu={preventWorkflowNodeChromeContextMenu}
      >
        <div className="relative" style={{ transform: "translateY(-14px)" }}>
          <div className="flex w-fit max-w-[calc(100vw-32px)] items-center gap-1 overflow-x-auto rounded-full border border-white/[0.12] bg-[#202024]/80 p-1 text-white/90 shadow-[0_18px_44px_rgba(0,0,0,0.30)] backdrop-blur-lg">
            <WorkflowSelectionActionButton
              icon={<SelectionSaveMaterialIcon />}
              label="保存到素材库"
              onClick={() => runForSelected(onSaveNodeToMaterials)}
            />
            <WorkflowSelectionActionButton
              icon={<SelectionPlaylistIcon />}
              label={
                <span className="inline-flex items-center gap-1">
                  创建播放列表
                  <span className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-white/[0.12] px-1.5 py-1 text-[10px] font-medium leading-none text-white/90 transition-colors">
                    Beta
                  </span>
                </span>
              }
              disabled={!canCreatePlaylist}
              onClick={() => {
                if (!canCreatePlaylist) {
                  message.warning("请选择至少 2 个视频节点");
                  return;
                }
                onCreatePlaylistFromSelection?.(selectedVideoIds);
              }}
            />
            <WorkflowSelectionActionButton
              icon={<SelectionFoldersIcon />}
              label={selectedGroupIds.length > 0 ? "解组" : "打组"}
              onClick={
                selectedGroupIds.length > 0 ? ungroupSelected : groupSelected
              }
            />
            <WorkflowSelectionActionButton
              icon={<SelectionBugIcon />}
              label="反馈问题"
              onClick={() => runForSelected(onReportNodeIssue)}
            />
          </div>
        </div>
      </div>
      {selectionConnectionUi}
    </>
  );
}
