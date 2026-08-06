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
import {
  Background,
  BackgroundVariant,
  PanOnScrollMode,
  Panel,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type ReactFlowInstance,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type OnConnectEnd,
  type OnConnectStart,
  type OnNodeDrag,
  type Viewport,
} from "@xyflow/react";
import { X } from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { hasRecoverableWorkflowVideoGenerationTask } from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_NODE_LOD_INTERACTION_PAUSE_MS,
  advanceLibTvMountedNodeIds,
  createLibTvInitialMountedNodeIds,
  hasPendingLibTvNodeMounts,
  resolveLibTvLowDetailMode,
  resolveLibTvVideoNodeLodMode,
  synchronizeLibTvMountedNodeIds,
  type LibTvNodeLodCandidate,
} from "@/workflow/ideart/lib/libtv/video-node-lod";
import {
  LIBTV_WORKFLOW_VIRTUALIZATION_THRESHOLD,
  LIBTV_WORKFLOW_VIRTUAL_NODE_LIMIT,
  LIBTV_WORKFLOW_VIRTUAL_OVERSCAN_PX,
  createLibTvViewportEdgeIndex,
  createLibTvViewportIndex,
  type LibTvViewportQueryResult,
} from "@/workflow/ideart/lib/libtv/workflow-viewport-virtualization";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { WORKFLOW_NODE_TYPES } from "./workflow-node";
import { WORKFLOW_EDGE_TYPES, WorkflowConnectionLine } from "./workflow-edges";
import {
  areWorkflowFlowEdgeArraysEqual,
  areWorkflowRenderNodeArraysExternallyEqual,
  normalizeWorkflowNodeChanges,
  stabilizeWorkflowRenderNodes,
} from "./workflow-equality";
import {
  getFlowNodeAbsolutePosition,
  isAnyWorkflowNodeVisible,
} from "./workflow-layout";
import {
  emitWorkflowViewportLive,
  emitWorkflowViewportMoving,
} from "./workflow-media-utils";
import {
  WorkflowFloatScaleSync,
  resolveWorkflowFloatScale,
} from "./workflow-float-scale";
import {
  EMPTY_WORKFLOW_EDGES,
  WORKFLOW_PAN_MOUSE_BUTTONS,
  WORKFLOW_SNAP_GRID,
} from "./surface-contracts";
import { WORKFLOW_REACT_FLOW_PRO_OPTIONS } from "./workflow-connections";
import { WorkflowMultiSelectionToolbar } from "./selection-toolbar";
import type { WorkflowOverlayNodeData } from "./surface-contracts";

export type LibTvWorkflowCanvasVirtualizationStats = {
  enabled: boolean;
  totalCount: number;
  renderedCount: number;
  visibleCount: number;
  capped: boolean;
};

export function resolveLibTvWorkflowVirtualNodeLimit(zoom: number) {
  const normalizedZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 1;
  if (normalizedZoom < 0.23) return 180;
  if (normalizedZoom < 0.5) return 320;
  return LIBTV_WORKFLOW_VIRTUAL_NODE_LIMIT;
}

export const LibTvWorkflowSurfaceCanvas = memo(
  function LibTvWorkflowSurfaceCanvas({
    flowNodes,
    workflowNodes,
    flowEdges,
    interactive,
    nodeEventsSuppressed,
    readOnly,
    selectionBounds,
    selectedIds,
    standalone,
    edgesVisible = true,
    snapToGrid = false,
    initialViewport,
    onInit,
    onNodeClick,
    onNodesChange,
    onRenderNodesChange,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    onNodeHoverChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    isValidConnection,
    onPaneClick,
    onPaneDoubleClick,
    onPaneFilesDrop,
    onContextMenu,
    onSelectionStart,
    onSelectionEnd,
    onMarqueeSelection,
    onSaveNodeToMaterials,
    onReportNodeIssue,
    onCreatePlaylistFromSelection,
    onGroupNodes,
    onUngroupNode,
    onCreateNodeFromSelection,
    onViewportChange,
    onVirtualizationWindowChange,
    documentVirtualizationStats,
  }: {
    flowNodes: Array<Node<WorkflowOverlayNodeData>>;
    workflowNodes: LibTvWorkflowNode[];
    flowEdges: Edge[];
    interactive: boolean;
    nodeEventsSuppressed: boolean;
    readOnly: boolean;
    selectionBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null;
    selectedIds: string[];
    standalone: boolean;
    edgesVisible?: boolean;
    snapToGrid?: boolean;
    initialViewport: { x: number; y: number; zoom: number };
    onInit: (
      instance: ReactFlowInstance<Node<WorkflowOverlayNodeData>, Edge>,
    ) => void;
    onNodeClick: (
      _event: React.MouseEvent,
      node: Node<WorkflowOverlayNodeData>,
    ) => void;
    onNodesChange: (
      changes: NodeChange<Node<WorkflowOverlayNodeData>>[],
    ) => void;
    onRenderNodesChange?: (nodes: Array<Node<WorkflowOverlayNodeData>>) => void;
    onNodeDragStart: OnNodeDrag<Node<WorkflowOverlayNodeData>>;
    onNodeDrag: OnNodeDrag<Node<WorkflowOverlayNodeData>>;
    onNodeDragStop: OnNodeDrag<Node<WorkflowOverlayNodeData>>;
    onNodeHoverChange?: (id: string | null) => void;
    onConnect?: (connection: Connection) => void;
    onConnectStart?: OnConnectStart;
    onConnectEnd?: OnConnectEnd;
    isValidConnection?: IsValidConnection;
    onPaneClick?: (event: React.MouseEvent<Element>) => void;
    onPaneDoubleClick?: (
      event: React.MouseEvent<Element>,
      flowPosition: { x: number; y: number },
    ) => void;
    onPaneFilesDrop?: (
      files: File[],
      position: { x: number; y: number },
    ) => void;
    onContextMenu?: (event: MouseEvent | React.MouseEvent) => void;
    onSelectionStart?: (event: React.MouseEvent<Element>) => void;
    onSelectionEnd?: (event: React.MouseEvent<Element>) => void;
    onMarqueeSelection?: (ids: string[]) => void;
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
    onConvertGroupToStoryboard?: (id: string) => void;
    onRunGroup?: (id: string) => void;
    onViewportChange?: (viewport: Viewport) => void;
    onVirtualizationWindowChange?: (
      viewport: Viewport,
      size: { width: number; height: number },
    ) => void;
    documentVirtualizationStats?: LibTvWorkflowCanvasVirtualizationStats;
  }) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const flowRef = useRef<ReactFlowInstance<
      Node<WorkflowOverlayNodeData>,
      Edge
    > | null>(null);
    const stableNodeTypes = WORKFLOW_NODE_TYPES;
    const stableEdgeTypes = WORKFLOW_EDGE_TYPES;
    const nodeViewportIndex = useMemo(
      () => createLibTvViewportIndex(flowNodes),
      [flowNodes],
    );
    const edgeViewportIndex = useMemo(
      () => createLibTvViewportEdgeIndex(flowEdges),
      [flowEdges],
    );
    const virtualizationEnabled =
      standalone && flowNodes.length > LIBTV_WORKFLOW_VIRTUALIZATION_THRESHOLD;
    const virtualizationForcedIds = useMemo(() => {
      const forced = new Set<string>();
      // A small selection must remain addressable even when "locate node" jumps
      // from a drawer to an item outside the current viewport. Huge marquee
      // selections stay virtualized so selection itself cannot mount 100k nodes.
      if (selectedIds.length <= 24) {
        for (const id of selectedIds) {
          const normalizedId = String(id || "").trim();
          if (normalizedId) forced.add(normalizedId);
        }
      }
      return forced;
    }, [selectedIds]);
    const resolveVirtualizedGraph = useCallback(
      (viewport: Viewport, width: number, height: number) => {
        if (!virtualizationEnabled) {
          return {
            nodes: flowNodes,
            edges: flowEdges,
            stats: {
              enabled: false,
              totalCount: flowNodes.length,
              renderedCount: flowNodes.length,
              visibleCount: flowNodes.length,
              capped: false,
            } satisfies LibTvWorkflowCanvasVirtualizationStats,
          };
        }
        const result: LibTvViewportQueryResult<Node<WorkflowOverlayNodeData>> =
          nodeViewportIndex.query(viewport, width, height, {
            maxNodes: resolveLibTvWorkflowVirtualNodeLimit(viewport.zoom),
            overscanPx: LIBTV_WORKFLOW_VIRTUAL_OVERSCAN_PX,
            forcedIds: virtualizationForcedIds,
            fallbackId: flowNodes[0]?.id,
          });
        return {
          nodes: result.nodes,
          edges: edgeViewportIndex.query(result.ids),
          stats: {
            enabled: true,
            totalCount: result.totalCount,
            renderedCount: result.nodes.length,
            visibleCount: result.visibleCount,
            capped: result.capped,
          } satisfies LibTvWorkflowCanvasVirtualizationStats,
        };
      },
      [
        edgeViewportIndex,
        flowEdges,
        flowNodes,
        nodeViewportIndex,
        virtualizationEnabled,
        virtualizationForcedIds,
      ],
    );
    const initialVirtualizedGraph = useMemo(
      () => resolveVirtualizedGraph(initialViewport, 1920, 1080),
      [initialViewport, resolveVirtualizedGraph],
    );
    const [renderNodes, setRenderNodes] = useState<
      Array<Node<WorkflowOverlayNodeData>>
    >(initialVirtualizedGraph.nodes);
    const [renderEdges, setRenderEdges] = useState<Edge[]>(
      initialVirtualizedGraph.edges,
    );
    const [virtualizationStats, setVirtualizationStats] =
      useState<LibTvWorkflowCanvasVirtualizationStats>(
        initialVirtualizedGraph.stats,
      );
    const displayedVirtualizationStats = documentVirtualizationStats?.enabled
      ? documentVirtualizationStats
      : virtualizationStats;
    const renderNodesRef = useRef<Array<Node<WorkflowOverlayNodeData>>>(
      initialVirtualizedGraph.nodes,
    );
    const renderEdgesRef = useRef<Edge[]>(initialVirtualizedGraph.edges);
    const latestFlowNodesRef =
      useRef<Array<Node<WorkflowOverlayNodeData>>>(flowNodes);
    const latestFlowEdgesRef = useRef<Edge[]>(flowEdges);
    const renderDragActiveRef = useRef(false);
    const [showEmptyViewportHint, setShowEmptyViewportHint] = useState(false);
    const [viewportMoving, setViewportMoving] = useState(false);
    const viewportMovingTimeoutRef = useRef<number | null>(null);
    const viewportRef = useRef<Viewport | null>(null);
    const liveVirtualizationFrameRef = useRef<number | null>(null);
    const liveVirtualizationViewportRef = useRef<Viewport | null>(null);
    const lastLiveVirtualizationAtRef = useRef(0);
    const lastViewportChangeZoomRef = useRef<number | null>(null);
    const selectionStartPointRef = useRef<{ x: number; y: number } | null>(
      null,
    );
    const pendingRenderNodeChangeBatchesRef = useRef<
      Array<NodeChange<Node<WorkflowOverlayNodeData>>[]>
    >([]);
    const pendingRenderNodeFrameRef = useRef<number | null>(null);
    const lodCandidates = useMemo<LibTvNodeLodCandidate[]>(
      () =>
        renderNodes.map((flowNode) => {
          const workflowNode = flowNode.data.workflowNode;
          const generating = Boolean(
            workflowNode.data?.workflowGenerationRunning ||
            workflowNode.data?.workflowRedrawRunning ||
            (workflowNode.kind === "video" &&
              hasRecoverableWorkflowVideoGenerationTask(workflowNode)),
          );
          return {
            id: flowNode.id,
            selected: Boolean(flowNode.selected || flowNode.data.isSelected),
            generating,
            failed: Boolean(
              String(
                workflowNode.data?.workflowGenerationError ||
                  workflowNode.data?.workflowRedrawError ||
                  "",
              ).trim(),
            ),
          };
        }),
      [renderNodes],
    );
    const lodCandidatesRef = useRef<LibTvNodeLodCandidate[]>(lodCandidates);
    const [mountedNodeIds, setMountedNodeIds] = useState<ReadonlySet<string>>(
      () => createLibTvInitialMountedNodeIds(lodCandidates),
    );
    const mountedNodeIdsRef = useRef<ReadonlySet<string>>(mountedNodeIds);
    const progressiveMountPausedUntilRef = useRef(0);
    const [lowDetailMode, setLowDetailMode] = useState(() =>
      resolveLibTvLowDetailMode(false, initialViewport.zoom),
    );

    const pauseProgressiveNodeMounts = useCallback(() => {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      progressiveMountPausedUntilRef.current = Math.max(
        progressiveMountPausedUntilRef.current,
        now + LIBTV_NODE_LOD_INTERACTION_PAUSE_MS,
      );
    }, []);

    const updateLowDetailMode = useCallback((zoom: number) => {
      setLowDetailMode((current) => {
        const next = resolveLibTvLowDetailMode(current, zoom);
        return next === current ? current : next;
      });
    }, []);

    useLayoutEffect(() => {
      lodCandidatesRef.current = lodCandidates;
      const synchronized = synchronizeLibTvMountedNodeIds(
        mountedNodeIdsRef.current,
        lodCandidates,
      );
      if (synchronized === mountedNodeIdsRef.current) return;
      mountedNodeIdsRef.current = synchronized;
      setMountedNodeIds(synchronized);
    }, [lodCandidates]);

    useEffect(() => {
      if (
        !hasPendingLibTvNodeMounts(
          mountedNodeIdsRef.current,
          lodCandidatesRef.current,
        )
      )
        return;
      let cancelled = false;
      let frame: number | null = null;
      const mountNextFrame = (now: number) => {
        if (cancelled) return;
        const current = mountedNodeIdsRef.current;
        const next = advanceLibTvMountedNodeIds(
          current,
          lodCandidatesRef.current,
          {
            now,
            pausedUntil: progressiveMountPausedUntilRef.current,
          },
        );
        if (next !== current) {
          mountedNodeIdsRef.current = next;
          setMountedNodeIds(next);
        }
        if (hasPendingLibTvNodeMounts(next, lodCandidatesRef.current)) {
          frame = window.requestAnimationFrame(mountNextFrame);
        }
      };
      frame = window.requestAnimationFrame(mountNextFrame);
      return () => {
        cancelled = true;
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }, [lodCandidates]);

    const lodCandidateById = useMemo(
      () =>
        new Map(lodCandidates.map((candidate) => [candidate.id, candidate])),
      [lodCandidates],
    );
    const lodRenderNodes = useMemo<Array<Node<WorkflowOverlayNodeData>>>(() => {
      let changed = false;
      const nextNodes = renderNodes.map((flowNode) => {
        const baseFlowNode =
          flowNode.data.isViewportMoving === viewportMoving
            ? flowNode
            : {
                ...flowNode,
                data: {
                  ...flowNode.data,
                  isViewportMoving: viewportMoving,
                },
              };
        if (baseFlowNode !== flowNode) changed = true;
        if (baseFlowNode.data.workflowNode.kind === "director-console-3d") {
          return baseFlowNode;
        }
        if (baseFlowNode.data.workflowNode.kind !== "video") return baseFlowNode;
        const candidate = lodCandidateById.get(baseFlowNode.id) || {
          id: baseFlowNode.id,
        };
        const videoLodMode = resolveLibTvVideoNodeLodMode(
          candidate,
          mountedNodeIds,
          lowDetailMode,
        );
        if (baseFlowNode.data.videoLodMode === videoLodMode) {
          return baseFlowNode;
        }
        changed = true;
        return {
          ...baseFlowNode,
          data: {
            ...baseFlowNode.data,
            videoLodMode,
          },
        };
      });
      return changed ? nextNodes : renderNodes;
    }, [
      lodCandidateById,
      lowDetailMode,
      mountedNodeIds,
      renderNodes,
      viewportMoving,
    ]);
    const stableReactFlowNodesRef =
      useRef<Array<Node<WorkflowOverlayNodeData>>>(lodRenderNodes);
    const reactFlowNodes = useMemo(() => {
      // React Flow's controlled StoreUpdater keys off the array reference. Keep it
      // stable across parent renders and Fast Refresh unless node semantics changed.
      // eslint-disable-next-line react-hooks/refs -- this is a render-local identity cache, not rendered state.
      const stableNodes = stabilizeWorkflowRenderNodes(
        stableReactFlowNodesRef.current,
        lodRenderNodes,
      );
      // eslint-disable-next-line react-hooks/refs -- publish the stabilized array for the next comparison.
      stableReactFlowNodesRef.current = stableNodes;
      return stableNodes;
    }, [lodRenderNodes]);

    useLayoutEffect(() => {
      latestFlowNodesRef.current = flowNodes;
      latestFlowEdgesRef.current = flowEdges;
    }, [flowEdges, flowNodes]);

    const applyVirtualizedGraph = useCallback(
      (viewport?: Viewport) => {
        const nextViewport =
          viewport ||
          viewportRef.current ||
          flowRef.current?.getViewport() ||
          initialViewport;
        const width = Math.max(
          1,
          Number(wrapperRef.current?.clientWidth || 1920),
        );
        const height = Math.max(
          1,
          Number(wrapperRef.current?.clientHeight || 1080),
        );
        const nextGraph = resolveVirtualizedGraph(nextViewport, width, height);
        const currentNodes = renderNodesRef.current;
        const nextNodes = areWorkflowRenderNodeArraysExternallyEqual(
          currentNodes,
          nextGraph.nodes,
        )
          ? currentNodes
          : nextGraph.nodes;
        const currentEdges = renderEdgesRef.current;
        const nextEdges = areWorkflowFlowEdgeArraysEqual(
          currentEdges,
          nextGraph.edges,
        )
          ? currentEdges
          : nextGraph.edges;
        renderNodesRef.current = nextNodes;
        renderEdgesRef.current = nextEdges;
        setRenderNodes(nextNodes);
        setRenderEdges(nextEdges);
        setVirtualizationStats((current) =>
          current.enabled === nextGraph.stats.enabled &&
          current.totalCount === nextGraph.stats.totalCount &&
          current.renderedCount === nextGraph.stats.renderedCount &&
          current.visibleCount === nextGraph.stats.visibleCount &&
          current.capped === nextGraph.stats.capped
            ? current
            : nextGraph.stats,
        );
        onRenderNodesChange?.(nextNodes);
        return nextGraph;
      },
      [initialViewport, onRenderNodesChange, resolveVirtualizedGraph],
    );

    const flushPendingRenderNodeChanges = useCallback(() => {
      if (pendingRenderNodeFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingRenderNodeFrameRef.current);
        pendingRenderNodeFrameRef.current = null;
      }
      const batches = pendingRenderNodeChangeBatchesRef.current;
      if (batches.length === 0) return;
      pendingRenderNodeChangeBatchesRef.current = [];
      const combinedChanges = batches.flat();
      setRenderNodes((currentNodes) => {
        let nextNodes = currentNodes;
        for (const batch of batches) {
          nextNodes = applyNodeChanges(batch, nextNodes);
        }
        renderNodesRef.current = nextNodes;
        onRenderNodesChange?.(nextNodes);
        return nextNodes;
      });
      onNodesChange(combinedChanges);
    }, [onNodesChange, onRenderNodesChange]);

    const scheduleRenderNodeChangeFlush = useCallback(() => {
      if (pendingRenderNodeFrameRef.current !== null) return;
      pendingRenderNodeFrameRef.current = window.requestAnimationFrame(() => {
        flushPendingRenderNodeChanges();
      });
    }, [flushPendingRenderNodeChanges]);

    useEffect(() => {
      if (renderDragActiveRef.current) return;
      pendingRenderNodeChangeBatchesRef.current = [];
      if (pendingRenderNodeFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingRenderNodeFrameRef.current);
        pendingRenderNodeFrameRef.current = null;
      }
      applyVirtualizedGraph();
    }, [applyVirtualizedGraph, flowEdges, flowNodes]);

    const handleRenderNodesChange = useCallback(
      (changes: NodeChange<Node<WorkflowOverlayNodeData>>[]) => {
        const normalizedChanges = normalizeWorkflowNodeChanges(changes);
        pendingRenderNodeChangeBatchesRef.current.push(normalizedChanges);
        scheduleRenderNodeChangeFlush();
      },
      [scheduleRenderNodeChangeFlush],
    );

    const handleRenderEdgesChange = useCallback(
      (changes: EdgeChange<Edge>[]) => {
        const persistentChanges = changes.filter(
          (change) => change.type !== "remove",
        );
        if (persistentChanges.length === 0) {
          const latestFlowEdges = latestFlowEdgesRef.current;
          setRenderEdges((currentEdges) => {
            if (areWorkflowFlowEdgeArraysEqual(currentEdges, latestFlowEdges)) {
              renderEdgesRef.current = currentEdges;
              return currentEdges;
            }
            renderEdgesRef.current = latestFlowEdges;
            return latestFlowEdges;
          });
          return;
        }
        setRenderEdges((currentEdges) => {
          const nextEdges = applyEdgeChanges(persistentChanges, currentEdges);
          renderEdgesRef.current = nextEdges;
          return nextEdges;
        });
      },
      [],
    );

    const updateEmptyViewportHint = useCallback(
      (viewport?: Viewport) => {
        if (!standalone) {
          setShowEmptyViewportHint(false);
          return;
        }
        const nextViewport =
          viewport || viewportRef.current || flowRef.current?.getViewport();
        if (!nextViewport) return;
        const hasVisibleNode = isAnyWorkflowNodeVisible(
          nextViewport,
          wrapperRef.current,
          renderNodesRef.current,
        );
        setShowEmptyViewportHint((current) =>
          current === !hasVisibleNode ? current : !hasVisibleNode,
        );
      },
      [standalone],
    );

    const updateViewportState = useCallback(
      (viewport?: Viewport, checkVisibility = true) => {
        if (!standalone) {
          setShowEmptyViewportHint(false);
          return;
        }
        const flow = flowRef.current;
        const nextViewport = viewport || flow?.getViewport();
        if (!nextViewport) return;
        viewportRef.current = nextViewport;
        const nextZoom = Number(nextViewport.zoom || 1);
        if (
          checkVisibility ||
          lastViewportChangeZoomRef.current === null ||
          Math.abs(lastViewportChangeZoomRef.current - nextZoom) > 0.001
        ) {
          lastViewportChangeZoomRef.current = nextZoom;
          onViewportChange?.(nextViewport);
        }
        if (!checkVisibility) return;
        updateEmptyViewportHint(nextViewport);
      },
      [onViewportChange, standalone, updateEmptyViewportHint],
    );

    const clearViewportMovingState = useCallback(() => {
      if (viewportMovingTimeoutRef.current !== null) {
        window.clearTimeout(viewportMovingTimeoutRef.current);
        viewportMovingTimeoutRef.current = null;
      }
      setViewportMoving(false);
      if (wrapperRef.current?.dataset.viewportMoving === "true") {
        wrapperRef.current.removeAttribute("data-viewport-moving");
        wrapperRef.current.classList.remove("canvas-interacting");
      }
    }, []);

    const handleNodeDragStartForCanvas = useCallback<
      OnNodeDrag<Node<WorkflowOverlayNodeData>>
    >(
      (event, node, nodes) => {
        pauseProgressiveNodeMounts();
        if (
          standalone &&
          wrapperRef.current?.dataset.viewportMoving !== "true"
        ) {
          setViewportMoving(true);
          wrapperRef.current?.setAttribute("data-viewport-moving", "true");
          wrapperRef.current?.classList.add("canvas-interacting");
          emitWorkflowViewportMoving(true);
        }
        renderDragActiveRef.current = true;
        onNodeDragStart(event, node, nodes);
      },
      [onNodeDragStart, pauseProgressiveNodeMounts, standalone],
    );

    const handleNodeDragForCanvas = useCallback<
      OnNodeDrag<Node<WorkflowOverlayNodeData>>
    >(
      (event, node, nodes) => {
        pauseProgressiveNodeMounts();
        onNodeDrag(event, node, nodes);
      },
      [onNodeDrag, pauseProgressiveNodeMounts],
    );

    const handleNodeDragStopForCanvas = useCallback<
      OnNodeDrag<Node<WorkflowOverlayNodeData>>
    >(
      (event, node, nodes) => {
        pauseProgressiveNodeMounts();
        onNodeDragStop(event, node, nodes);
        if (viewportMovingTimeoutRef.current !== null)
          window.clearTimeout(viewportMovingTimeoutRef.current);
        viewportMovingTimeoutRef.current = window.setTimeout(() => {
          viewportMovingTimeoutRef.current = null;
          clearViewportMovingState();
        }, 200);
        emitWorkflowViewportMoving(false);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const latestFlowNodes = latestFlowNodesRef.current;
            const latestFlowEdges = latestFlowEdgesRef.current;
            renderDragActiveRef.current = false;
            // The parent may briefly expose the drag snapshot here. Keep the
            // ReactFlow store virtualized until its canonical graph arrives.
            if (latestFlowNodes.length > 0 || latestFlowEdges.length > 0)
              applyVirtualizedGraph();
          });
        });
      },
      [
        applyVirtualizedGraph,
        clearViewportMovingState,
        onNodeDragStop,
        pauseProgressiveNodeMounts,
      ],
    );

    const handleViewportMoveStart = useCallback(
      (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
        pauseProgressiveNodeMounts();
        updateLowDetailMode(viewport.zoom);
        viewportRef.current = viewport;
        if (!standalone || renderDragActiveRef.current) return;
        if (viewportMovingTimeoutRef.current !== null) {
          window.clearTimeout(viewportMovingTimeoutRef.current);
          viewportMovingTimeoutRef.current = null;
        }
        if (wrapperRef.current?.dataset.viewportMoving !== "true") {
          setViewportMoving(true);
          wrapperRef.current?.setAttribute("data-viewport-moving", "true");
          wrapperRef.current?.classList.add("canvas-interacting");
          emitWorkflowViewportMoving(true);
        }
      },
      [pauseProgressiveNodeMounts, standalone, updateLowDetailMode],
    );

    const handleViewportMove = useCallback(
      (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
        viewportRef.current = viewport;
        liveVirtualizationViewportRef.current = viewport;
        if (
          renderDragActiveRef.current ||
          !(documentVirtualizationStats?.enabled || virtualizationEnabled)
        )
          return;
        if (liveVirtualizationFrameRef.current !== null) return;
        liveVirtualizationFrameRef.current = window.requestAnimationFrame(
          (now) => {
            liveVirtualizationFrameRef.current = null;
            if (now - lastLiveVirtualizationAtRef.current < 80) return;
            const liveViewport = liveVirtualizationViewportRef.current;
            if (!liveViewport) return;
            lastLiveVirtualizationAtRef.current = now;
            applyVirtualizedGraph(liveViewport);
            onVirtualizationWindowChange?.(liveViewport, {
              width: Math.max(
                1,
                Number(wrapperRef.current?.clientWidth || 1920),
              ),
              height: Math.max(
                1,
                Number(wrapperRef.current?.clientHeight || 1080),
              ),
            });
          },
        );
      },
      [
        applyVirtualizedGraph,
        documentVirtualizationStats?.enabled,
        onVirtualizationWindowChange,
        virtualizationEnabled,
      ],
    );

    const handleViewportMoveEnd = useCallback(
      (_event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
        pauseProgressiveNodeMounts();
        updateLowDetailMode(viewport.zoom);
        viewportRef.current = viewport;
        emitWorkflowViewportLive(viewport);
        if (viewportMovingTimeoutRef.current !== null) {
          window.clearTimeout(viewportMovingTimeoutRef.current);
          viewportMovingTimeoutRef.current = null;
        }
        viewportMovingTimeoutRef.current = window.setTimeout(() => {
          viewportMovingTimeoutRef.current = null;
          clearViewportMovingState();
        }, 200);
        emitWorkflowViewportMoving(false);
        applyVirtualizedGraph(viewport);
        onVirtualizationWindowChange?.(viewport, {
          width: Math.max(1, Number(wrapperRef.current?.clientWidth || 1920)),
          height: Math.max(1, Number(wrapperRef.current?.clientHeight || 1080)),
        });
        updateViewportState(viewport, true);
      },
      [
        applyVirtualizedGraph,
        clearViewportMovingState,
        onVirtualizationWindowChange,
        pauseProgressiveNodeMounts,
        updateLowDetailMode,
        updateViewportState,
      ],
    );

    const resolveIntersectingSelectionNodeIds = useCallback(
      (start: { x: number; y: number }, end: { x: number; y: number }) => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return [];
        const selectionLeft = Math.min(start.x, end.x);
        const selectionTop = Math.min(start.y, end.y);
        const selectionRight = Math.max(start.x, end.x);
        const selectionBottom = Math.max(start.y, end.y);
        if (
          selectionRight - selectionLeft < 4 ||
          selectionBottom - selectionTop < 4
        )
          return [];
        const viewport = viewportRef.current || flowRef.current?.getViewport();
        if (!viewport) return [];
        const wrapperRect = wrapper.getBoundingClientRect();
        const zoom = Math.max(0.0001, Number(viewport.zoom || 1));
        const flowLeft =
          (selectionLeft - wrapperRect.left - Number(viewport.x || 0)) / zoom;
        const flowTop =
          (selectionTop - wrapperRect.top - Number(viewport.y || 0)) / zoom;
        const flowRight =
          (selectionRight - wrapperRect.left - Number(viewport.x || 0)) / zoom;
        const flowBottom =
          (selectionBottom - wrapperRect.top - Number(viewport.y || 0)) / zoom;
        const nodeById = new Map(
          renderNodesRef.current.map((node) => [node.id, node]),
        );

        return renderNodesRef.current.flatMap((node) => {
          const position = getFlowNodeAbsolutePosition(node, nodeById);
          const width = Math.max(
            1,
            Number(
              node.style?.width || node.measured?.width || node.width || 1,
            ),
          );
          const height = Math.max(
            1,
            Number(
              node.style?.height || node.measured?.height || node.height || 1,
            ),
          );
          const intersects =
            position.x + width >= flowLeft &&
            position.x <= flowRight &&
            position.y + height >= flowTop &&
            position.y <= flowBottom;
          return intersects ? [node.id] : [];
        });
      },
      [],
    );

    const handleReactFlowSelectionStart = useCallback(
      (event: React.MouseEvent<Element>) => {
        selectionStartPointRef.current = { x: event.clientX, y: event.clientY };
        onSelectionStart?.(event);
      },
      [onSelectionStart],
    );

    const handleReactFlowSelectionEnd = useCallback(
      (event: React.MouseEvent<Element>) => {
        const start = selectionStartPointRef.current;
        const end = { x: event.clientX, y: event.clientY };
        selectionStartPointRef.current = null;
        onSelectionEnd?.(event);
        if (!start || !onMarqueeSelection) return;
        window.requestAnimationFrame(() => {
          const ids = resolveIntersectingSelectionNodeIds(start, end);
          onMarqueeSelection(ids);
        });
      },
      [onMarqueeSelection, onSelectionEnd, resolveIntersectingSelectionNodeIds],
    );

    const returnToContentNodes = useCallback(
      (event?: React.MouseEvent<HTMLButtonElement>) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (renderNodesRef.current.length === 0) return;
        void flowRef.current?.fitView({
          nodes: renderNodesRef.current.map((node) => ({ id: node.id })),
          padding: 0.28,
          duration: 420,
          minZoom: 0.15,
          maxZoom: 1,
        });
        window.setTimeout(() => updateViewportState(), 460);
      },
      [updateViewportState],
    );

    useEffect(() => {
      updateViewportState();
    }, [updateViewportState]);

    useEffect(() => {
      let retryFrame: number | null = null;
      const frame = window.requestAnimationFrame(() => {
        if (renderDragActiveRef.current) {
          retryFrame = window.requestAnimationFrame(() =>
            updateEmptyViewportHint(),
          );
          return;
        }
        updateEmptyViewportHint();
      });
      return () => {
        window.cancelAnimationFrame(frame);
        if (retryFrame !== null) window.cancelAnimationFrame(retryFrame);
      };
    }, [flowNodes, updateEmptyViewportHint]);

    useEffect(() => {
      const wrapper = wrapperRef.current;
      if (!standalone || !wrapper || typeof ResizeObserver === "undefined")
        return;
      let frame: number | null = null;
      const observer = new ResizeObserver(() => {
        if (frame !== null) return;
        frame = window.requestAnimationFrame(() => {
          frame = null;
          const viewport =
            viewportRef.current || flowRef.current?.getViewport();
          if (viewport) {
            applyVirtualizedGraph(viewport);
            onVirtualizationWindowChange?.(viewport, {
              width: Math.max(1, Number(wrapper.clientWidth || 1920)),
              height: Math.max(1, Number(wrapper.clientHeight || 1080)),
            });
          }
          updateEmptyViewportHint();
        });
      });
      observer.observe(wrapper);
      return () => {
        observer.disconnect();
        if (frame !== null) window.cancelAnimationFrame(frame);
      };
    }, [
      applyVirtualizedGraph,
      onVirtualizationWindowChange,
      standalone,
      updateEmptyViewportHint,
    ]);

    useEffect(() => {
      const clear = () => {
        if (wrapperRef.current?.dataset.viewportMoving !== "true") return;
        if (viewportMovingTimeoutRef.current !== null)
          window.clearTimeout(viewportMovingTimeoutRef.current);
        viewportMovingTimeoutRef.current = window.setTimeout(() => {
          viewportMovingTimeoutRef.current = null;
          clearViewportMovingState();
        }, 200);
        emitWorkflowViewportMoving(false);
      };
      const clearWhenHidden = () => {
        if (document.visibilityState !== "hidden") return;
        clearViewportMovingState();
        emitWorkflowViewportMoving(false);
      };
      window.addEventListener("pointerup", clear);
      window.addEventListener("mouseup", clear);
      window.addEventListener("touchend", clear);
      window.addEventListener("touchcancel", clear);
      window.addEventListener("dragend", clear);
      window.addEventListener("drop", clear);
      window.addEventListener("blur", clear);
      document.addEventListener("visibilitychange", clearWhenHidden);
      return () => {
        window.removeEventListener("pointerup", clear);
        window.removeEventListener("mouseup", clear);
        window.removeEventListener("touchend", clear);
        window.removeEventListener("touchcancel", clear);
        window.removeEventListener("dragend", clear);
        window.removeEventListener("drop", clear);
        window.removeEventListener("blur", clear);
        document.removeEventListener("visibilitychange", clearWhenHidden);
      };
    }, [clearViewportMovingState]);

    useEffect(
      () => () => {
        if (liveVirtualizationFrameRef.current !== null) {
          window.cancelAnimationFrame(liveVirtualizationFrameRef.current);
          liveVirtualizationFrameRef.current = null;
        }
      },
      [],
    );

    useEffect(() => {
      return () => {
        if (pendingRenderNodeFrameRef.current !== null) {
          window.cancelAnimationFrame(pendingRenderNodeFrameRef.current);
          pendingRenderNodeFrameRef.current = null;
        }
        pendingRenderNodeChangeBatchesRef.current = [];
        if (viewportMovingTimeoutRef.current !== null) {
          window.clearTimeout(viewportMovingTimeoutRef.current);
        }
        wrapperRef.current?.removeAttribute("data-viewport-moving");
        wrapperRef.current?.classList.remove("canvas-interacting");
        emitWorkflowViewportMoving(false);
      };
    }, []);

    const suppressNodeEventCapture = useCallback(
      (event: React.SyntheticEvent) => {
        if (!nodeEventsSuppressed) return;
        const target = event.target as Element | null;
        if (
          !target?.closest(
            ".react-flow__node, .react-flow__edge, .node-float-ui, .node-floating-ui",
          )
        )
          return;
        event.preventDefault();
        event.stopPropagation();
      },
      [nodeEventsSuppressed],
    );

    const hasDraggedFiles = useCallback((dataTransfer: DataTransfer | null) => {
      if (!dataTransfer) return false;
      if (Array.from(dataTransfer.types || []).includes("Files")) return true;
      return Array.from(dataTransfer.items || []).some(
        (item) => item.kind === "file",
      );
    }, []);

    const handleDragOver = useCallback(
      (event: React.DragEvent<HTMLDivElement>) => {
        if (!standalone || !interactive || !hasDraggedFiles(event.dataTransfer))
          return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      },
      [hasDraggedFiles, interactive, standalone],
    );

    const handleDrop = useCallback(
      (event: React.DragEvent<HTMLDivElement>) => {
        if (!standalone || !interactive || !hasDraggedFiles(event.dataTransfer))
          return;
        const files = Array.from(event.dataTransfer.files || []).filter(
          Boolean,
        );
        if (files.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const point = flowRef.current?.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        }) || { x: event.clientX, y: event.clientY };
        onPaneFilesDrop?.(files, point);
      },
      [hasDraggedFiles, interactive, onPaneFilesDrop, standalone],
    );

    const handleWrapperContextMenu = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (!standalone || !interactive || event.defaultPrevented) return;
        const target = event.target as Element | null;
        if (!target?.closest(".react-flow")) return;
        if (target.closest(".react-flow__node, .react-flow__edge")) return;
        onContextMenu?.(event);
      },
      [interactive, onContextMenu, standalone],
    );

    return (
      <div
        ref={wrapperRef}
        className="absolute inset-0"
        style={
          {
            "--workflow-float-scale": resolveWorkflowFloatScale(
              initialViewport.zoom,
            ),
            contain: "paint",
          } as React.CSSProperties
        }
        data-node-events-suppressed={nodeEventsSuppressed ? "true" : undefined}
        onClickCapture={suppressNodeEventCapture}
        onDoubleClickCapture={suppressNodeEventCapture}
        onContextMenuCapture={suppressNodeEventCapture}
        onContextMenu={handleWrapperContextMenu}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDoubleClick={(event) => {
          const target = event.target as Element | null;
          if (!target?.closest(".react-flow__pane")) return;
          if (
            target.closest(
              ".react-flow__node, .react-flow__edge, .nodrag, .nopan",
            )
          )
            return;
          const point = flowRef.current?.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          }) || { x: event.clientX, y: event.clientY };
          onPaneDoubleClick?.(event, point);
        }}
      >
        <ReactFlow
          nodes={reactFlowNodes}
          edges={edgesVisible ? renderEdges : EMPTY_WORKFLOW_EDGES}
          nodeTypes={stableNodeTypes}
          edgeTypes={stableEdgeTypes}
          defaultViewport={initialViewport}
          fitView={false}
          onlyRenderVisibleElements={standalone}
          minZoom={0.15}
          maxZoom={8}
          panOnDrag={
            standalone && interactive ? WORKFLOW_PAN_MOUSE_BUTTONS : standalone
          }
          panActivationKeyCode="Space"
          panOnScroll={standalone}
          panOnScrollMode={PanOnScrollMode.Free}
          panOnScrollSpeed={1}
          zoomOnScroll={standalone}
          zoomOnPinch={standalone}
          zoomOnDoubleClick={false}
          preventScrolling={standalone}
          nodesDraggable={interactive}
          nodesConnectable={interactive}
          connectOnClick={false}
          connectionDragThreshold={1}
          connectionRadius={80}
          connectionLineComponent={WorkflowConnectionLine}
          elementsSelectable={interactive}
          nodesFocusable={interactive}
          edgesFocusable={interactive}
          deleteKeyCode={null}
          elevateEdgesOnSelect={false}
          elevateNodesOnSelect={false}
          selectNodesOnDrag={standalone && interactive}
          selectionOnDrag={standalone && interactive}
          selectionMode={SelectionMode.Partial}
          selectionKeyCode="Shift"
          nodeDragThreshold={1}
          snapToGrid={snapToGrid}
          snapGrid={WORKFLOW_SNAP_GRID}
          autoPanOnNodeDrag
          autoPanOnConnect
          autoPanOnNodeFocus={false}
          autoPanSpeed={15}
          noDragClassName="nodrag"
          noWheelClassName="nowheel"
          noPanClassName="nopan"
          proOptions={WORKFLOW_REACT_FLOW_PRO_OPTIONS}
          style={
            {
              "--xy-background-color": "var(--canvas-bg)",
              "--xy-background-pattern-color": "var(--canvas-bg-dot)",
              pointerEvents: standalone ? "auto" : "none",
            } as React.CSSProperties
          }
          onInit={(instance) => {
            flowRef.current = instance;
            onInit(instance);
            const currentViewport = instance.getViewport();
            viewportRef.current = currentViewport;
            updateLowDetailMode(currentViewport.zoom);
            requestAnimationFrame(() => {
              const viewport = instance.getViewport();
              applyVirtualizedGraph(viewport);
              onVirtualizationWindowChange?.(viewport, {
                width: Math.max(
                  1,
                  Number(wrapperRef.current?.clientWidth || 1920),
                ),
                height: Math.max(
                  1,
                  Number(wrapperRef.current?.clientHeight || 1080),
                ),
              });
              updateViewportState(viewport);
            });
          }}
          onNodeClick={onNodeClick}
          onNodesChange={handleRenderNodesChange}
          onEdgesChange={handleRenderEdgesChange}
          onNodeDragStart={handleNodeDragStartForCanvas}
          onNodeDrag={handleNodeDragForCanvas}
          onNodeDragStop={handleNodeDragStopForCanvas}
          onNodeMouseEnter={(_event, node) => onNodeHoverChange?.(node.id)}
          onNodeMouseLeave={() => onNodeHoverChange?.(null)}
          onMoveStart={handleViewportMoveStart}
          onMove={handleViewportMove}
          onMoveEnd={handleViewportMoveEnd}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          isValidConnection={isValidConnection}
          onSelectionStart={handleReactFlowSelectionStart}
          onSelectionEnd={handleReactFlowSelectionEnd}
          onPaneClick={onPaneClick}
          onPaneContextMenu={onContextMenu}
          onNodeContextMenu={onContextMenu}
          onEdgeContextMenu={onContextMenu}
        >
          <WorkflowFloatScaleSync
            surfaceRef={wrapperRef}
            onZoomChange={updateLowDetailMode}
          />
          {standalone ? (
            <Background
              color="var(--canvas-bg-dot)"
              gap={16}
              size={1}
              variant={BackgroundVariant.Dots}
              offset={9}
            />
          ) : null}
          {displayedVirtualizationStats.enabled &&
          displayedVirtualizationStats.capped ? (
            <Panel position="top-left" className="pointer-events-none !m-3">
              <div className="rounded-full border border-canvas-controls-border bg-canvas-controls-bg/90 px-3 py-1.5 text-[11px] text-canvas-controls-text shadow-sm backdrop-blur-md">
                大画布模式 · 当前加载{" "}
                {displayedVirtualizationStats.renderedCount.toLocaleString()} /{" "}
                {displayedVirtualizationStats.totalCount.toLocaleString()}{" "}
                个节点，放大可查看附近素材
              </div>
            </Panel>
          ) : null}
          {showEmptyViewportHint ? (
            <div
              className="pointer-events-none absolute left-0 right-0 z-50 flex justify-center px-3"
              style={{
                bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              <div
                className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full px-3 py-2 md:gap-3 md:px-4 md:py-2.5 max-[640px]:gap-3 max-[640px]:rounded-2xl max-[640px]:px-4 max-[640px]:py-3"
                style={{
                  backgroundColor: "var(--canvas-controls-bg)",
                  border: "0.5px solid var(--canvas-controls-border)",
                  backdropFilter: "blur(8px)",
                  boxShadow: "var(--canvas-shadow-panel)",
                  opacity: 1,
                  transform: "none",
                }}
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onClick={stopWorkflowNodeChromeEvent}
                onContextMenu={preventWorkflowNodeChromeContextMenu}
              >
                <span className="text-canvas-controls-text min-w-0 shrink truncate whitespace-nowrap text-[13px] max-[640px]:hidden">
                  当前视窗没有节点，可点击按钮快速回到内容区域
                </span>
                <span className="text-canvas-controls-text hidden h-5 w-[104px] shrink-0 items-center whitespace-nowrap text-[13px] leading-5 max-[640px]:flex">
                  当前视窗没有节点
                </span>
                <button
                  type="button"
                  className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-90 md:px-4 max-[640px]:rounded-lg"
                  style={{
                    backgroundColor: "var(--btn-invert-bg)",
                    color: "var(--btn-invert-text)",
                  }}
                  onClick={returnToContentNodes}
                >
                  <span className="max-[640px]:hidden">回到节点</span>
                  <span className="hidden max-[640px]:inline">返回节点</span>
                </button>
                <button
                  type="button"
                  aria-label="关闭空视窗提示"
                  className="hidden size-6 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[var(--canvas-controls-icon,rgba(255,255,255,0.72))] transition-colors hover:bg-canvas-controls-hover max-[640px]:flex"
                  onClick={() => setShowEmptyViewportHint(false)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ) : null}
          {!readOnly &&
          standalone &&
          !nodeEventsSuppressed &&
          selectionBounds &&
          selectedIds.length > 1 ? (
            <WorkflowMultiSelectionToolbar
              bounds={selectionBounds}
              selectedIds={selectedIds}
              selectedNodes={workflowNodes.filter((node) =>
                selectedIds.includes(node.id),
              )}
              onSaveNodeToMaterials={onSaveNodeToMaterials}
              onReportNodeIssue={onReportNodeIssue}
              onCreatePlaylistFromSelection={onCreatePlaylistFromSelection}
              onGroupNodes={onGroupNodes}
              onUngroupNode={onUngroupNode}
              onCreateNodeFromSelection={onCreateNodeFromSelection}
              onConnect={onConnect}
            />
          ) : null}
        </ReactFlow>
      </div>
    );
  },
);
