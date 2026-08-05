"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  useStore,
  useReactFlow,
  type ConnectionLineComponentProps,
  type Edge,
  type EdgeProps,
  type Node,
} from "@xyflow/react";
import { Scissors } from "lucide-react";
import { canConnectWorkflowNodes } from "./workflow-node-kinds";
import {
  getWorkflowCableColor,
  getWorkflowCablePath,
  getWorkflowCableTone,
} from "./workflow-connections";
import {
  WORKFLOW_CABLE_BASE_WIDTH,
  WORKFLOW_CABLE_HIT_WIDTH,
  WORKFLOW_CABLE_PATH_SAMPLE_COUNT,
} from "./surface-contracts";
import type { WorkflowOverlayNodeData } from "./surface-contracts";
import type { WorkflowEdgeData } from "./workflow-models";

export const WorkflowConnectionLine = memo(function WorkflowConnectionLine({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
  connectionStatus,
  fromNode,
  fromHandle,
  toNode,
}: ConnectionLineComponentProps<Node<WorkflowOverlayNodeData>>) {
  const zoom = useStore((state) => Number(state.transform?.[2] || 1));
  const flow = useReactFlow<Node<WorkflowOverlayNodeData>, Edge>();
  const inverseZoom = 1 / Math.max(zoom, 0.0001);
  const [showInvalidHint, setShowInvalidHint] = useState(false);
  const bodyConnectionValidity = (() => {
    if (toNode || !fromNode) return null;
    const connectionNodeById = fromNode.data.connectionNodeById;
    const startNode = connectionNodeById?.get(fromNode.id);
    if (!startNode) return null;
    const intersectingNodes = flow.getIntersectingNodes({
      x: toX,
      y: toY,
      width: 1,
      height: 1,
    });
    const candidateFlowNode = intersectingNodes
      ?.filter(
        (candidate) =>
          candidate.id !== startNode.id &&
          candidate.data.workflowNode.kind !== "group" &&
          (!startNode.parentId || candidate.id !== startNode.parentId),
      )
      .pop();
    if (!candidateFlowNode) return null;
    if (
      fromNode.data.connectionHandlesDisabled ||
      candidateFlowNode.data.connectionHandlesDisabled
    )
      return false;
    const candidateNode = candidateFlowNode.data.workflowNode;
    const startedFromTarget = fromHandle.type === "target";
    const sourceNode = startedFromTarget ? candidateNode : startNode;
    const targetNode = startedFromTarget ? startNode : candidateNode;
    if (
      fromNode.data.connectionEdgePairs?.has(
        `${sourceNode.id}\u0000${targetNode.id}`,
      )
    )
      return false;
    return canConnectWorkflowNodes(
      sourceNode,
      targetNode,
      Array.from(connectionNodeById?.values() || []),
    );
  })();
  const invalid =
    connectionStatus === "invalid" || bodyConnectionValidity === false;
  const previewSourceNode =
    fromHandle.type === "target" && toNode
      ? toNode.data.workflowNode
      : fromNode?.data.workflowNode;
  const pathD = getWorkflowCablePath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  useEffect(() => {
    setShowInvalidHint(false);
    if (!invalid) return;
    const timer = window.setTimeout(() => setShowInvalidHint(true), 600);
    return () => window.clearTimeout(timer);
  }, [invalid]);

  return (
    <g data-workflow-cable-state={invalid ? "invalid" : "connecting"}>
      <path
        d={pathD}
        fill="none"
        stroke="var(--workflow-cable-outline, rgba(8, 10, 13, 0.82))"
        strokeWidth={6.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={invalid ? 0.5 : 0.78}
        pointerEvents="none"
      />
      <path
        d={pathD}
        fill="none"
        stroke={
          invalid
            ? "var(--workflow-cable-invalid, #e06c68)"
            : getWorkflowCableColor(getWorkflowCableTone(previewSourceNode))
        }
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={invalid ? "6 6" : "none"}
        opacity={invalid ? 0.9 : 1}
        pointerEvents="none"
      />
      {invalid && showInvalidHint ? (
        <foreignObject
          x={toX - 48 * inverseZoom}
          y={toY - 60 * inverseZoom}
          width={96 * inverseZoom}
          height={60 * inverseZoom}
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div
            style={{
              alignItems: "center",
              background: "#2a2a2a",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 9999,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
              color: "#fff",
              display: "inline-flex",
              fontSize: 13,
              height: 32,
              justifyContent: "center",
              lineHeight: 1,
              padding: "0 16px",
              transform: "scale(" + inverseZoom + ")",
              transformOrigin: "top left",
              whiteSpace: "nowrap",
            }}
          >
            无法连接
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
});

export const StudioWorkflowEdge = memo(function StudioWorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
  style: edgeStyle,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const [scissorsVisible, setScissorsVisible] = useState(false);
  const [scissorsExiting, setScissorsExiting] = useState(false);
  const [scissorsPoint, setScissorsPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const edgePathRef = useRef<SVGPathElement | null>(null);
  const hoverLeaveTimerRef = useRef<number | null>(null);
  const hoverActivationTimerRef = useRef<number | null>(null);
  const scissorsExitTimerRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);
  const scissorsVisibleRef = useRef(false);
  const scissorsPointRef = useRef<{ x: number; y: number } | null>(null);
  const edgeData = data as WorkflowEdgeData | undefined;
  const endpointActive = Boolean(edgeData?.active);
  const active = Boolean(selected || hovered || endpointActive);
  const edgeStroke =
    typeof edgeStyle?.stroke === "string"
      ? edgeStyle.stroke
      : getWorkflowCableColor(edgeData?.tone);
  const edgeStrokeWidth = selected
    ? 3
    : active
      ? 2.5
      : WORKFLOW_CABLE_BASE_WIDTH;
  const edgeStrokeOpacity = selected ? 1 : active ? 0.96 : 0.78;
  const edgeOutlineOpacity = selected ? 0.86 : active ? 0.72 : 0.54;
  const edgePath = getWorkflowCablePath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const clearHoverLeaveTimer = useCallback(() => {
    if (hoverLeaveTimerRef.current === null) return;
    window.clearTimeout(hoverLeaveTimerRef.current);
    hoverLeaveTimerRef.current = null;
  }, []);
  const clearHoverActivationTimer = useCallback(() => {
    if (hoverActivationTimerRef.current === null) return;
    window.clearTimeout(hoverActivationTimerRef.current);
    hoverActivationTimerRef.current = null;
  }, []);
  const clearScissorsExitTimer = useCallback(() => {
    if (scissorsExitTimerRef.current === null) return;
    window.clearTimeout(scissorsExitTimerRef.current);
    scissorsExitTimerRef.current = null;
  }, []);
  const updateScissorsPoint = useCallback(
    (event: React.MouseEvent<SVGElement> | React.PointerEvent<SVGElement>) => {
      const path = edgePathRef.current;
      const matrix = path?.getScreenCTM();
      const svg = path?.ownerSVGElement;
      if (!path || !matrix || !svg) return;
      let localPoint: { x: number; y: number };
      try {
        const screenPoint = svg.createSVGPoint();
        screenPoint.x = event.clientX;
        screenPoint.y = event.clientY;
        localPoint = screenPoint.matrixTransform(matrix.inverse());
      } catch {
        return;
      }
      let totalLength = 0;
      try {
        totalLength = path.getTotalLength();
      } catch {
        return;
      }
      if (!Number.isFinite(totalLength) || totalLength <= 0) return;

      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (
        let index = 0;
        index <= WORKFLOW_CABLE_PATH_SAMPLE_COUNT;
        index += 1
      ) {
        const point = path.getPointAtLength(
          (totalLength * index) / WORKFLOW_CABLE_PATH_SAMPLE_COUNT,
        );
        const distance =
          (point.x - localPoint.x) ** 2 + (point.y - localPoint.y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      const coarseRatio = bestIndex / WORKFLOW_CABLE_PATH_SAMPLE_COUNT;
      const refineRadius = 1 / WORKFLOW_CABLE_PATH_SAMPLE_COUNT;
      const refineStart = Math.max(0, coarseRatio - refineRadius);
      const refineEnd = Math.min(1, coarseRatio + refineRadius);
      let bestRatio = coarseRatio;
      for (let index = 0; index <= 10; index += 1) {
        const ratio = refineStart + ((refineEnd - refineStart) * index) / 10;
        const point = path.getPointAtLength(totalLength * ratio);
        const distance =
          (point.x - localPoint.x) ** 2 + (point.y - localPoint.y) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestRatio = ratio;
        }
      }
      const nearest = path.getPointAtLength(totalLength * bestRatio);
      const nextPoint = { x: nearest.x, y: nearest.y };
      if (
        scissorsPointRef.current &&
        Math.abs(scissorsPointRef.current.x - nextPoint.x) < 10
      )
        return;
      scissorsPointRef.current = nextPoint;
      setScissorsPoint(nextPoint);
    },
    [],
  );
  const showEdgeActions = useCallback(
    (event: React.MouseEvent<SVGElement> | React.PointerEvent<SVGElement>) => {
      clearHoverLeaveTimer();
      clearScissorsExitTimer();
      hoveredRef.current = true;
      setHovered(true);
      setScissorsExiting(false);
      updateScissorsPoint(event);
      if (
        !edgeData?.onDisconnectEdge ||
        scissorsVisibleRef.current ||
        hoverActivationTimerRef.current !== null
      )
        return;
      hoverActivationTimerRef.current = window.setTimeout(() => {
        hoverActivationTimerRef.current = null;
        if (!hoveredRef.current || !scissorsPointRef.current) return;
        scissorsVisibleRef.current = true;
        setScissorsVisible(true);
      }, 1000);
    },
    [
      clearHoverLeaveTimer,
      clearScissorsExitTimer,
      edgeData?.onDisconnectEdge,
      updateScissorsPoint,
    ],
  );
  const hideEdgeActionsSoon = useCallback(() => {
    clearHoverLeaveTimer();
    hoverLeaveTimerRef.current = window.setTimeout(() => {
      clearHoverActivationTimer();
      hoveredRef.current = false;
      setHovered(false);
      hoverLeaveTimerRef.current = null;
      if (!scissorsVisibleRef.current) {
        scissorsPointRef.current = null;
        setScissorsPoint(null);
        return;
      }
      setScissorsExiting(true);
      clearScissorsExitTimer();
      scissorsExitTimerRef.current = window.setTimeout(() => {
        scissorsExitTimerRef.current = null;
        scissorsVisibleRef.current = false;
        scissorsPointRef.current = null;
        setScissorsVisible(false);
        setScissorsExiting(false);
        setScissorsPoint(null);
      }, 150);
    }, 120);
  }, [clearHoverActivationTimer, clearHoverLeaveTimer, clearScissorsExitTimer]);
  const keepEdgeActionsOpen = useCallback(() => {
    clearHoverLeaveTimer();
    clearScissorsExitTimer();
    hoveredRef.current = true;
    setHovered(true);
    setScissorsExiting(false);
  }, [clearHoverLeaveTimer, clearScissorsExitTimer]);

  useEffect(
    () => () => {
      clearHoverActivationTimer();
      clearHoverLeaveTimer();
      clearScissorsExitTimer();
    },
    [clearHoverActivationTimer, clearHoverLeaveTimer, clearScissorsExitTimer],
  );

  return (
    <g
      className={`workflow-edge-group ${active ? "workflow-edge-group-active" : ""}`}
      data-workflow-cable-tone={edgeData?.tone || "neutral"}
    >
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={WORKFLOW_CABLE_HIT_WIDTH}
        pointerEvents="all"
        className="react-flow__edge-interaction"
        style={{ cursor: "pointer" }}
        onMouseEnter={showEdgeActions}
        onMouseMove={updateScissorsPoint}
        onMouseLeave={hideEdgeActionsSoon}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="var(--workflow-cable-outline, rgba(8, 10, 13, 0.82))"
        strokeWidth={edgeStrokeWidth + 3}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={edgeOutlineOpacity}
        pointerEvents="none"
        style={{ transition: "opacity 140ms ease, stroke-width 140ms ease" }}
      />
      <path
        ref={edgePathRef}
        id={id}
        d={edgePath}
        fill="none"
        className="react-flow__edge-path"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          stroke: edgeStroke,
          strokeWidth: edgeStrokeWidth,
          strokeOpacity: edgeStrokeOpacity,
          strokeDasharray: "none",
          transition:
            "stroke 140ms ease, stroke-width 140ms ease, stroke-opacity 140ms ease",
          pointerEvents: "none",
        }}
      />
      {selected ? (
        <path
          d={edgePath}
          fill="none"
          stroke="var(--workflow-cable-highlight, rgba(255, 255, 255, 0.88))"
          strokeWidth={0.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.48}
          pointerEvents="none"
        />
      ) : null}
      {scissorsVisible && scissorsPoint && edgeData?.onDisconnectEdge ? (
        <foreignObject
          x={scissorsPoint.x - 24}
          y={scissorsPoint.y - 24}
          width={48}
          height={48}
          style={{ overflow: "visible", pointerEvents: "auto" }}
        >
          <button
            type="button"
            className={
              "nodrag nopan workflow-edge-disconnect-button " +
              (scissorsExiting ? "scissors-exit" : "scissors-enter")
            }
            title="断开连接"
            aria-label="断开连接"
            style={{
              position: "static",
              transform: "none",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseEnter={keepEdgeActionsOpen}
            onMouseLeave={hideEdgeActionsSoon}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              edgeData.onDisconnectEdge?.(id);
            }}
          >
            <Scissors
              size={28}
              strokeWidth={2}
              style={{ pointerEvents: "none", transform: "rotate(-115deg)" }}
            />
          </button>
        </foreignObject>
      ) : null}
    </g>
  );
});

export const WORKFLOW_EDGE_TYPES = Object.freeze({
  studio: StudioWorkflowEdge,
});
