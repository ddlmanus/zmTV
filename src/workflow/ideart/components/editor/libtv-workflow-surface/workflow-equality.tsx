"use client";

import { type Edge, type Node, type NodeChange } from "@xyflow/react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { stabilizeControlledItems } from "./stabilize-controlled-items";
import { type ScriptV2CanvasImageAsset } from "./nodes/script-v2-workspace";
import type {
  WorkflowOverlayNodeData,
  WorkflowStoryboardVideoGroupSummary,
} from "./surface-contracts";
import type { WorkflowUpstreamNodeSummary } from "./workflow-models";

export function normalizeWorkflowNodeChanges(
  changes: NodeChange<Node<WorkflowOverlayNodeData>>[],
) {
  return changes.map((change) =>
    change.type === "dimensions" ? { ...change, setAttributes: false } : change,
  );
}

export function areWorkflowUpstreamNodeSummariesEqual(
  current: WorkflowUpstreamNodeSummary[] | undefined,
  next: WorkflowUpstreamNodeSummary[] | undefined,
) {
  const currentItems = current || [];
  const nextItems = next || [];
  if (currentItems.length !== nextItems.length) return false;
  return currentItems.every((item, index) => {
    const nextItem = nextItems[index];
    return (
      item.id === nextItem.id &&
      item.kind === nextItem.kind &&
      item.title === nextItem.title &&
      item.mediaUrl === nextItem.mediaUrl &&
      item.mediaRole === nextItem.mediaRole &&
      item.componentType === nextItem.componentType &&
      item.workflowSeedanceAssetCategory ===
        nextItem.workflowSeedanceAssetCategory &&
      item.workflowSeedanceAssetUrl === nextItem.workflowSeedanceAssetUrl &&
      item.scriptResult === nextItem.scriptResult
    );
  });
}

export function areWorkflowChildNodesEqual(
  current: LibTvWorkflowNode[] | undefined,
  next: LibTvWorkflowNode[] | undefined,
) {
  const currentItems = current || [];
  const nextItems = next || [];
  if (currentItems.length !== nextItems.length) return false;
  return currentItems.every((item, index) => {
    const nextItem = nextItems[index];
    return item === nextItem;
  });
}

export function areScriptV2CanvasImageAssetsEqual(
  current: ScriptV2CanvasImageAsset[] | undefined,
  next: ScriptV2CanvasImageAsset[] | undefined,
) {
  const currentItems = current || [];
  const nextItems = next || [];
  if (currentItems.length !== nextItems.length) return false;
  return currentItems.every((item, index) => {
    const nextItem = nextItems[index];
    return (
      item.id === nextItem.id &&
      item.title === nextItem.title &&
      item.imageUrl === nextItem.imageUrl &&
      item.prompt === nextItem.prompt
    );
  });
}

export function areWorkflowStoryboardVideoGroupsEqual(
  current: WorkflowStoryboardVideoGroupSummary[] | undefined,
  next: WorkflowStoryboardVideoGroupSummary[] | undefined,
) {
  const currentGroups = current || [];
  const nextGroups = next || [];
  if (currentGroups.length !== nextGroups.length) return false;
  return currentGroups.every((group, index) => {
    const nextGroup = nextGroups[index];
    if (
      group.id !== nextGroup.id ||
      group.title !== nextGroup.title ||
      group.modelId !== nextGroup.modelId ||
      group.aspectRatio !== nextGroup.aspectRatio ||
      group.videoResolution !== nextGroup.videoResolution ||
      group.videoDuration !== nextGroup.videoDuration ||
      group.videoMethod !== nextGroup.videoMethod ||
      group.generateAudio !== nextGroup.generateAudio ||
      group.enableWebSearch !== nextGroup.enableWebSearch ||
      group.items.length !== nextGroup.items.length
    )
      return false;
    return group.items.every((item, itemIndex) => {
      const nextItem = nextGroup.items[itemIndex];
      return (
        item.id === nextItem.id &&
        item.rowIndex === nextItem.rowIndex &&
        item.label === nextItem.label &&
        item.prompt === nextItem.prompt &&
        item.duration === nextItem.duration
      );
    });
  });
}

export function areWorkflowFlowNodeDataEqual(
  currentData: WorkflowOverlayNodeData,
  nextData: WorkflowOverlayNodeData,
) {
  return (
    currentData.interactive === nextData.interactive &&
    currentData.isDragging === nextData.isDragging &&
    currentData.isViewportMoving === nextData.isViewportMoving &&
    currentData.nodeEventsSuppressed === nextData.nodeEventsSuppressed &&
    currentData.suppressFloatingControls ===
      nextData.suppressFloatingControls &&
    currentData.focusPickActive === nextData.focusPickActive &&
    currentData.focusPickOverlay === nextData.focusPickOverlay &&
    currentData.hasIncomingEdge === nextData.hasIncomingEdge &&
    currentData.hasOutgoingEdge === nextData.hasOutgoingEdge &&
    currentData.hasIncomingTextEdge === nextData.hasIncomingTextEdge &&
    currentData.hasOutgoingTextEdge === nextData.hasOutgoingTextEdge &&
    currentData.videoLodMode === nextData.videoLodMode &&
    currentData.projectId === nextData.projectId &&
    currentData.workflowNode === nextData.workflowNode &&
    areWorkflowChildNodesEqual(currentData.childNodes, nextData.childNodes) &&
    areWorkflowUpstreamNodeSummariesEqual(
      currentData.upstreamNodes,
      nextData.upstreamNodes,
    ) &&
    areScriptV2CanvasImageAssetsEqual(
      currentData.canvasImageAssets,
      nextData.canvasImageAssets,
    ) &&
    areWorkflowStoryboardVideoGroupsEqual(
      currentData.storyboardVideoGroups,
      nextData.storyboardVideoGroups,
    )
  );
}

export function areWorkflowFlowNodesEqual(
  currentNode: Node<WorkflowOverlayNodeData>,
  nextNode: Node<WorkflowOverlayNodeData>,
) {
  return (
    currentNode.id === nextNode.id &&
    currentNode.type === nextNode.type &&
    currentNode.parentId === nextNode.parentId &&
    currentNode.dragHandle === nextNode.dragHandle &&
    currentNode.position.x === nextNode.position.x &&
    currentNode.position.y === nextNode.position.y &&
    currentNode.width === nextNode.width &&
    currentNode.height === nextNode.height &&
    currentNode.initialWidth === nextNode.initialWidth &&
    currentNode.initialHeight === nextNode.initialHeight &&
    currentNode.draggable === nextNode.draggable &&
    currentNode.selectable === nextNode.selectable &&
    currentNode.selected === nextNode.selected &&
    currentNode.zIndex === nextNode.zIndex &&
    currentNode.style?.width === nextNode.style?.width &&
    currentNode.style?.height === nextNode.style?.height &&
    areWorkflowFlowNodeDataEqual(currentNode.data, nextNode.data)
  );
}

export function areWorkflowFlowNodeArraysEqual(
  currentNodes: Array<Node<WorkflowOverlayNodeData>>,
  nextNodes: Array<Node<WorkflowOverlayNodeData>>,
) {
  if (currentNodes.length !== nextNodes.length) return false;
  return currentNodes.every((node, index) =>
    areWorkflowFlowNodesEqual(node, nextNodes[index]),
  );
}

export function getWorkflowRenderNodeMeasuredValue(
  node: Node<WorkflowOverlayNodeData>,
  key: "width" | "height",
) {
  const measured = (
    node as Node<WorkflowOverlayNodeData> & {
      measured?: { width?: number; height?: number };
    }
  ).measured;
  return measured?.[key];
}

export function areWorkflowRenderNodesEqual(
  currentNode: Node<WorkflowOverlayNodeData>,
  nextNode: Node<WorkflowOverlayNodeData>,
) {
  return (
    areWorkflowFlowNodesEqual(currentNode, nextNode) &&
    currentNode.dragging === nextNode.dragging &&
    currentNode.resizing === nextNode.resizing &&
    getWorkflowRenderNodeMeasuredValue(currentNode, "width") ===
      getWorkflowRenderNodeMeasuredValue(nextNode, "width") &&
    getWorkflowRenderNodeMeasuredValue(currentNode, "height") ===
      getWorkflowRenderNodeMeasuredValue(nextNode, "height")
  );
}

export function areWorkflowRenderNodeArraysEqual(
  currentNodes: Array<Node<WorkflowOverlayNodeData>>,
  nextNodes: Array<Node<WorkflowOverlayNodeData>>,
) {
  if (currentNodes.length !== nextNodes.length) return false;
  return currentNodes.every((node, index) =>
    areWorkflowRenderNodesEqual(node, nextNodes[index]),
  );
}

export function areWorkflowRenderNodeArraysExternallyEqual(
  currentNodes: Array<Node<WorkflowOverlayNodeData>>,
  nextNodes: Array<Node<WorkflowOverlayNodeData>>,
) {
  if (currentNodes.length !== nextNodes.length) return false;
  return currentNodes.every((node, index) =>
    areWorkflowFlowNodesEqual(node, nextNodes[index]),
  );
}

export function stabilizeWorkflowFlowNodes(
  currentNodes: Array<Node<WorkflowOverlayNodeData>>,
  nextNodes: Array<Node<WorkflowOverlayNodeData>>,
) {
  return stabilizeControlledItems(
    currentNodes,
    nextNodes,
    areWorkflowFlowNodesEqual,
  );
}

export function stabilizeWorkflowRenderNodes(
  currentNodes: Array<Node<WorkflowOverlayNodeData>>,
  nextNodes: Array<Node<WorkflowOverlayNodeData>>,
) {
  return stabilizeControlledItems(
    currentNodes,
    nextNodes,
    areWorkflowRenderNodesEqual,
  );
}

export function areWorkflowFlowEdgesEqual(currentEdge: Edge, nextEdge: Edge) {
  const currentData = currentEdge.data as any;
  const nextData = nextEdge.data as any;
  return (
    currentEdge.id === nextEdge.id &&
    currentEdge.source === nextEdge.source &&
    currentEdge.target === nextEdge.target &&
    currentEdge.sourceHandle === nextEdge.sourceHandle &&
    currentEdge.targetHandle === nextEdge.targetHandle &&
    currentEdge.type === nextEdge.type &&
    currentEdge.selectable === nextEdge.selectable &&
    currentEdge.focusable === nextEdge.focusable &&
    currentEdge.zIndex === nextEdge.zIndex &&
    currentData?.active === nextData?.active &&
    currentData?.onDisconnectEdge === nextData?.onDisconnectEdge
  );
}

export function areWorkflowFlowEdgeArraysEqual(
  currentEdges: Edge[],
  nextEdges: Edge[],
) {
  if (currentEdges.length !== nextEdges.length) return false;
  return currentEdges.every((edge, index) =>
    areWorkflowFlowEdgesEqual(edge, nextEdges[index]),
  );
}

export function stabilizeWorkflowFlowEdges(
  currentEdges: Edge[],
  nextEdges: Edge[],
) {
  return stabilizeControlledItems(
    currentEdges,
    nextEdges,
    areWorkflowFlowEdgesEqual,
  );
}

export function areWorkflowSelectionIdsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

export function getSelectedWorkflowFlowNodeIds(
  nodes: Array<Node<WorkflowOverlayNodeData>>,
) {
  return Array.from(
    new Set(nodes.filter((node) => node.selected).map((node) => node.id)),
  ).sort();
}
