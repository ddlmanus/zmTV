"use client";

import {
  type ReactFlowInstance,
  type Edge,
  type Node,
  type Viewport,
} from "@xyflow/react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  WORKFLOW_TEXT_NODE_DEFAULT_FRAME,
  WORKFLOW_TEXT_NODE_MIN_FRAME,
  WORKFLOW_VIDEO_UPSCALE_NODE_FRAME,
} from "./surface-contracts";
import {
  isWorkflowImageGeneratorNode,
  isWorkflowImageGeneratorResultNode,
  isWorkflowImageResultGroupContainer,
  isWorkflowStoryboardImageNode,
  isWorkflowVideoAnalysisScriptNode,
  isWorkflowVideoGeneratorNode,
  isWorkflowVideoGeneratorResultNode,
} from "./workflow-node-kinds";
import {
  getTapNowNodeFrame,
  getWorkflowImageGenerationPlaceholderDisplayFrame,
  getWorkflowImageGeneratorResultDisplayFrame,
  getWorkflowImageResultStripFrame,
  getWorkflowScriptNodeFrame,
} from "./workflow-media-utils";
import {
  WORKFLOW_IMAGE_GROUP_STACK_EXTRA,
  getWorkflowNodeMinimumFrame,
  isOrdinaryWorkflowImageNode,
  isOrdinaryWorkflowVideoNode,
} from "./workflow-connections";
import type { WorkflowOverlayNodeData } from "./surface-contracts";

export function getWorkflowNodeAbsolutePosition(
  node: Pick<LibTvWorkflowNode, "id" | "x" | "y" | "parentId">,
  nodeById: Map<string, LibTvWorkflowNode>,
  seen = new Set<string>(),
): { x: number; y: number } {
  const x = Number(node.x || 0);
  const y = Number(node.y || 0);
  const parentId = typeof node.parentId === "string" ? node.parentId : "";
  if (!parentId || seen.has(node.id)) return { x, y };
  const parent = nodeById.get(parentId);
  if (!parent) return { x, y };
  seen.add(node.id);
  const parentPosition = getWorkflowNodeAbsolutePosition(
    parent,
    nodeById,
    seen,
  );
  return {
    x: parentPosition.x + x,
    y: parentPosition.y + y,
  };
}

export function getFlowNodeAbsolutePosition(
  node: Node<WorkflowOverlayNodeData>,
  nodeById: Map<string, Node<WorkflowOverlayNodeData>>,
  seen = new Set<string>(),
): { x: number; y: number } {
  const x = Number(node.position.x || 0);
  const y = Number(node.position.y || 0);
  const parentId = typeof node.parentId === "string" ? node.parentId : "";
  if (!parentId || seen.has(node.id)) return { x, y };
  const parent = nodeById.get(parentId);
  if (!parent) return { x, y };
  seen.add(node.id);
  const parentPosition = getFlowNodeAbsolutePosition(parent, nodeById, seen);
  return {
    x: parentPosition.x + x,
    y: parentPosition.y + y,
  };
}

export function pointFromConnectionEndEvent(event: MouseEvent | TouchEvent) {
  if ("changedTouches" in event && event.changedTouches.length > 0) {
    return {
      x: event.changedTouches[0].clientX,
      y: event.changedTouches[0].clientY,
    };
  }
  if ("clientX" in event && "clientY" in event) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }
  return null;
}

export function getWorkflowNodeIdFromElement(element: Element | null) {
  const nodeElement = element?.closest?.(
    ".react-flow__node[data-id]",
  ) as HTMLElement | null;
  return String(nodeElement?.dataset.id || "").trim();
}

export function getWorkflowEdgeIdFromElement(element: Element | null) {
  const edgeElement = element?.closest?.(
    ".react-flow__edge",
  ) as HTMLElement | null;
  if (!edgeElement) return "";
  const dataId = String(edgeElement.dataset.id || "").trim();
  if (dataId) return dataId;
  return String(edgeElement.querySelector<SVGElement>("[id]")?.id || "").trim();
}

export function findWorkflowNodeIdAtPoint(
  event: MouseEvent | TouchEvent,
  flow: ReactFlowInstance<Node<WorkflowOverlayNodeData>, Edge> | null,
  startNodeId: string,
  startParentId?: string,
) {
  const point = pointFromConnectionEndEvent(event);
  if (!point) return "";

  const flowPoint = flow?.screenToFlowPosition?.(point);
  if (!flowPoint) return "";

  const isEligibleCandidate = (node: Node<WorkflowOverlayNodeData>) =>
    node.id !== startNodeId &&
    node.data.workflowNode.kind !== "group" &&
    (!startParentId || node.id !== startParentId);
  const intersectingNodes = flow?.getIntersectingNodes?.({
    x: flowPoint.x,
    y: flowPoint.y,
    width: 1,
    height: 1,
  });
  const intersectedNode = intersectingNodes?.filter(isEligibleCandidate).pop();
  return intersectedNode?.id || "";
}

export function getWorkflowSelectionBounds(
  nodes: LibTvWorkflowNode[],
  selectedIds: string[],
) {
  const selectedIdSet = new Set(selectedIds);
  const selectedNodes = nodes.filter((node) => selectedIdSet.has(node.id));
  if (selectedNodes.length === 0) return null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const positions = selectedNodes.map((node) => ({
    node,
    position: getWorkflowNodeAbsolutePosition(node, nodeById),
    frame:
      node.kind === "group"
        ? getWorkflowImageResultGroupFrame(node, nodes) ||
          getWorkflowRenderedNodeFrame(node)
        : getWorkflowRenderedNodeFrame(node),
  }));
  const minX = Math.min(...positions.map(({ position }) => position.x));
  const minY = Math.min(...positions.map(({ position }) => position.y));
  const maxX = Math.max(
    ...positions.map(({ position, frame }) => position.x + frame.width),
  );
  const maxY = Math.max(
    ...positions.map(({ position, frame }) => position.y + frame.height),
  );
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function getWorkflowRenderedNodeFrame(node: LibTvWorkflowNode) {
  if (node.kind === "text" && node.data?.componentType === "text-editor") {
    return {
      width: Math.max(
        WORKFLOW_TEXT_NODE_MIN_FRAME.width,
        Number(node.width || WORKFLOW_TEXT_NODE_DEFAULT_FRAME.width),
      ),
      height: Math.max(
        WORKFLOW_TEXT_NODE_MIN_FRAME.height,
        Number(node.height || WORKFLOW_TEXT_NODE_DEFAULT_FRAME.height),
      ),
    };
  }
  if (
    node.kind === "video" &&
    node.data?.componentType === "video-generator" &&
    String(node.data?.videoMethod || "") === "upscale"
  ) {
    return WORKFLOW_VIDEO_UPSCALE_NODE_FRAME;
  }
  if (isWorkflowImageGeneratorResultNode(node)) {
    const stripFrame = getWorkflowImageResultStripFrame(node);
    if (stripFrame) return stripFrame;
  }
  if (isWorkflowVideoGeneratorResultNode(node)) {
    const frame = getWorkflowNodeMinimumFrame(node);
    if (
      node.data?.workflowMediaUserResized !== true &&
      node.data?.workflowMediaFrameLocked !== true
    ) {
      return frame;
    }
    return {
      width: Math.max(1, Number(node.width || frame.width)),
      height: Math.max(1, Number(node.height || frame.height)),
    };
  }
  if (
    isWorkflowImageGeneratorNode(node) ||
    isWorkflowVideoGeneratorNode(node)
  ) {
    const frame = getWorkflowNodeMinimumFrame(node);
    if (isWorkflowStoryboardImageNode(node)) return frame;
    if (
      isWorkflowImageGeneratorNode(node) &&
      node.data?.workflowGenerationRunning
    ) {
      return frame;
    }
    if (
      isWorkflowVideoGeneratorNode(node) &&
      node.data?.workflowMediaUserResized !== true
    ) {
      return frame;
    }
    return {
      width: Math.max(frame.width, Number(node.width || frame.width)),
      height: Math.max(frame.height, Number(node.height || frame.height)),
    };
  }
  if (isOrdinaryWorkflowImageNode(node) || isOrdinaryWorkflowVideoNode(node)) {
    const frame = getWorkflowNodeMinimumFrame(node);
    return {
      width: Math.max(1, Number(node.width || frame.width)),
      height: Math.max(1, Number(node.height || frame.height)),
    };
  }
  if (node.kind === "script") {
    const frame = getWorkflowScriptNodeFrame(node);
    if (isWorkflowVideoAnalysisScriptNode(node)) return frame;
    return {
      width: Math.max(frame.width, Number(node.width || frame.width)),
      height: Math.max(frame.height, Number(node.height || frame.height)),
    };
  }
  const frame = getTapNowNodeFrame(node.kind);
  return {
    width: Math.max(frame.width, Number(node.width || frame.width)),
    height: Math.max(frame.height, Number(node.height || frame.height)),
  };
}

export function getWorkflowImageResultGroupFrame(
  group: LibTvWorkflowNode,
  childNodes: LibTvWorkflowNode[],
) {
  if (group.kind !== "group") return null;
  const imageChildren = childNodes
    .filter(
      (child) =>
        child.kind === "image" && String(child.data?.mediaUrl || "").trim(),
    )
    .sort(
      (a, b) =>
        Number(a.data?.workflowGenerationResultIndex ?? 0) -
        Number(b.data?.workflowGenerationResultIndex ?? 0),
    );
  if (imageChildren.length === 0) return null;
  if (!isWorkflowImageResultGroupContainer(group, childNodes)) return null;
  const isImageGeneratorResultGroup =
    String(group.data?.componentType || "") === "image-generator" ||
    Boolean(group.data?.workflowGenerationJobId) ||
    Boolean(group.data?.prompt) ||
    Boolean(group.data?.generationCount) ||
    String(group.data?.title || "").includes("图片生成器");
  if (group.data?.workflowGenerationRunning && isImageGeneratorResultGroup) {
    return getWorkflowImageGenerationPlaceholderDisplayFrame(
      String(group.data?.aspectRatio || "16:9"),
      1,
    );
  }
  if (!group.data?.groupCollapsed && isImageGeneratorResultGroup) {
    const gap = 8;
    const columns = Math.min(2, Math.max(1, imageChildren.length));
    const aspectRatio = String(group.data?.aspectRatio || "16:9");
    const frames = imageChildren.map((child, index) => {
      const frame = getWorkflowImageGeneratorResultDisplayFrame(
        child,
        aspectRatio,
      );
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        right: column * (frame.width + gap) + frame.width,
        bottom: row * (frame.height + gap) + frame.height,
      };
    });
    return {
      width: Math.max(1, Math.max(...frames.map((frame) => frame.right))),
      height: Math.max(1, Math.max(...frames.map((frame) => frame.bottom))),
    };
  }
  const groupFrame = getWorkflowRenderedNodeFrame(group);
  if (!group.data?.groupCollapsed) return groupFrame;
  const primaryImageChild =
    imageChildren.find(
      (child) =>
        String(child.data?.mediaUrl || "").trim() ===
        String(group.data?.mediaUrl || "").trim(),
    ) || imageChildren[0];
  const primaryFrame = getWorkflowRenderedNodeFrame(primaryImageChild);
  return {
    width: Math.max(
      1,
      Math.round(primaryFrame.width + WORKFLOW_IMAGE_GROUP_STACK_EXTRA),
    ),
    height: Math.max(
      1,
      Math.round(primaryFrame.height + WORKFLOW_IMAGE_GROUP_STACK_EXTRA),
    ),
  };
}

export function getWorkflowGroupMemberBounds(
  group: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  indexed?: {
    nodeById?: Map<string, LibTvWorkflowNode>;
    members?: LibTvWorkflowNode[];
  },
) {
  if (group.kind !== "group") return null;
  const memberIds = new Set(
    Array.isArray(group.data?.groupNodeIds) ? group.data.groupNodeIds : [],
  );
  if (memberIds.size === 0) return null;
  const nodeById =
    indexed?.nodeById || new Map(nodes.map((node) => [node.id, node]));
  const members =
    indexed?.members || nodes.filter((node) => memberIds.has(node.id));
  if (members.length === 0) return null;
  const positions = members.map((node) => ({
    node,
    position: getWorkflowNodeAbsolutePosition(node, nodeById),
    frame: getWorkflowRenderedNodeFrame(node),
  }));
  const minX = Math.min(...positions.map(({ position }) => position.x));
  const minY = Math.min(...positions.map(({ position }) => position.y));
  const maxX = Math.max(
    ...positions.map(({ position, frame }) => position.x + frame.width),
  );
  const maxY = Math.max(
    ...positions.map(({ position, frame }) => position.y + frame.height),
  );
  const padding = 44;
  return {
    x: Math.round(minX - padding),
    y: Math.round(minY - padding),
    width: Math.round(maxX - minX + padding * 2),
    height: Math.round(maxY - minY + padding * 2),
  };
}

export function getWorkflowDragPersistNodeIds(
  nodes: LibTvWorkflowNode[],
  selectedIds: string[],
) {
  const selectedIdSet = new Set(selectedIds);
  const selectedGroupIds = new Set(
    nodes
      .filter((node) => node.kind === "group" && selectedIdSet.has(node.id))
      .map((node) => node.id),
  );
  if (selectedGroupIds.size === 0) return selectedIds;

  return selectedIds.filter((id) => {
    const node = nodes.find((item) => item.id === id);
    if (!node) return false;
    if (node.parentId && selectedGroupIds.has(node.parentId)) return false;
    const coveredByGroupNodeIds = nodes.some(
      (groupNode) =>
        groupNode.kind === "group" &&
        selectedGroupIds.has(groupNode.id) &&
        Array.isArray(groupNode.data?.groupNodeIds) &&
        groupNode.data.groupNodeIds.includes(id),
    );
    return !coveredByGroupNodeIds;
  });
}

export function isAnyWorkflowNodeVisible(
  viewport: Viewport,
  flowWrapper: HTMLElement | null,
  nodes: Array<Node<WorkflowOverlayNodeData>>,
) {
  if (nodes.length === 0) return true;
  const width = Math.max(1, Number(flowWrapper?.clientWidth || 1));
  const height = Math.max(1, Number(flowWrapper?.clientHeight || 1));
  const zoom = Math.max(0.0001, Number(viewport.zoom || 1));
  const visibleLeft = -Number(viewport.x || 0) / zoom;
  const visibleTop = -Number(viewport.y || 0) / zoom;
  const visibleRight = visibleLeft + width / zoom;
  const visibleBottom = visibleTop + height / zoom;
  const padding = 24 / zoom;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes.some((node) => {
    const nodeWidth = Math.max(1, Number(node.style?.width || node.width || 1));
    const nodeHeight = Math.max(
      1,
      Number(node.style?.height || node.height || 1),
    );
    const nodePosition = getFlowNodeAbsolutePosition(node, nodeById);
    const nodeLeft = nodePosition.x;
    const nodeTop = nodePosition.y;
    const nodeRight = nodeLeft + nodeWidth;
    const nodeBottom = nodeTop + nodeHeight;
    return (
      nodeRight >= visibleLeft + padding &&
      nodeLeft <= visibleRight - padding &&
      nodeBottom >= visibleTop + padding &&
      nodeTop <= visibleBottom - padding
    );
  });
}
