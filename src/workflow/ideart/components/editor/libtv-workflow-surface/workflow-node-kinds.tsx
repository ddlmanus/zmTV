"use client";

import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { TAPNOW_NODE_ICON_META } from "./nodes/workflow-node-icons";
import { getWorkflowSurfaceSeedanceAssetUrl } from "./workflow-models";
import type { WorkflowUpstreamNodeSummary } from "./workflow-models";

export function isWorkflowVideoAnalysisScriptNode(
  node: Pick<LibTvWorkflowNode, "kind" | "data"> | undefined,
) {
  return Boolean(
    node?.kind === "script" &&
    String(node.data?.selectedOptionId || "") === "video-analysis",
  );
}

export function isWorkflowTextGeneratorNode(
  node: LibTvWorkflowNode | undefined,
) {
  return node?.kind === "text" && node.data?.componentType !== "text-editor";
}

export function isWorkflowPlainTextContextNode(
  node: LibTvWorkflowNode | undefined,
) {
  return node?.kind === "text" && node.data?.componentType === "text-editor";
}

export function isWorkflowPlainMediaContextNode(
  node: LibTvWorkflowNode | undefined,
) {
  return (
    ((node?.kind === "image" || node?.kind === "video") &&
      node.data?.mediaRole === "ordinary") ||
    isWorkflowImageGeneratorResultNode(node) ||
    isWorkflowImageGeneratorResultGroupNode(node) ||
    isWorkflowVideoGeneratorResultNode(node)
  );
}

export function isWorkflowImageGeneratorNode(
  node: LibTvWorkflowNode | undefined,
) {
  return node?.kind === "image" && node.data?.mediaRole === "generator";
}

export function isWorkflowStoryboardImageNode(
  node: LibTvWorkflowNode | undefined,
) {
  return Boolean(
    node?.kind === "image" &&
    (Number.isFinite(Number(node?.data?.workflowStoryboardSourceRowIndex)) ||
      String((node?.data as any)?.workflowStoryboardSourceNodeId || "").trim()),
  );
}

export function isWorkflowStoryboardImageGeneratorNode(
  node: LibTvWorkflowNode | undefined,
) {
  return (
    isWorkflowStoryboardImageNode(node) && isWorkflowImageGeneratorNode(node)
  );
}

export function isWorkflowStoryboardGroupNode(
  node: LibTvWorkflowNode | undefined,
  allNodes: LibTvWorkflowNode[] = [],
) {
  if (node?.kind !== "group") return false;
  const title = String(node.data?.title || "").trim();
  if (
    node.data?.workflowStoryboardPending === true ||
    Array.isArray((node.data as any)?.workflowStoryboardRowIndexes) ||
    String((node.data as any)?.workflowStoryboardSourceNodeId || "").trim() ||
    title.includes("分镜")
  ) {
    return true;
  }
  const groupNodeIds = Array.isArray(node.data?.groupNodeIds)
    ? new Set(node.data.groupNodeIds)
    : null;
  return allNodes.some(
    (child) =>
      (child.parentId === node.id || Boolean(groupNodeIds?.has(child.id))) &&
      (Number.isFinite(Number(child.data?.workflowStoryboardSourceRowIndex)) ||
        Boolean(
          String(
            (child.data as any)?.workflowStoryboardSourceNodeId || "",
          ).trim(),
        )),
  );
}

export function getWorkflowStandaloneStoryboardImageGridChildIds(
  nodes: LibTvWorkflowNode[],
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const childIdsByGroupId = new Map<string, Set<string>>();
  for (const node of nodes) {
    if (node.kind !== "group") continue;
    childIdsByGroupId.set(
      node.id,
      new Set(
        Array.isArray(node.data?.groupNodeIds)
          ? node.data.groupNodeIds
              .map((id) => String(id || "").trim())
              .filter(Boolean)
          : [],
      ),
    );
  }
  for (const node of nodes) {
    if (!node.parentId) continue;
    childIdsByGroupId.get(node.parentId)?.add(node.id);
  }

  const childIds = new Set<string>();
  for (const [groupId, memberIds] of childIdsByGroupId) {
    const group = nodeById.get(groupId);
    if (
      !group ||
      String((group.data as any)?.workflowStoryboardSourceNodeId || "").trim()
    )
      continue;
    const members = Array.from(memberIds, (id) => nodeById.get(id)).filter(
      (node): node is LibTvWorkflowNode => Boolean(node),
    );
    const isStandaloneStoryboardImageGrid =
      members.length > 0 &&
      members.every(
        (member) =>
          member.kind === "image" &&
          Number.isFinite(
            Number(member.data?.workflowStoryboardSourceRowIndex),
          ) &&
          !String(
            (member.data as any)?.workflowStoryboardSourceNodeId || "",
          ).trim(),
      );
    if (!isStandaloneStoryboardImageGrid) continue;
    for (const member of members) childIds.add(member.id);
  }
  return childIds;
}

export function isWorkflowImageGeneratorResultNode(
  node: LibTvWorkflowNode | undefined,
) {
  return (
    isWorkflowImageGeneratorNode(node) &&
    Boolean(String(node?.data?.mediaUrl || "").trim())
  );
}

export function isWorkflowImageGeneratorResultGroupNode(
  node: LibTvWorkflowNode | undefined,
) {
  if (node?.kind !== "group" || !String(node.data?.mediaUrl || "").trim())
    return false;
  const title = String(node.data?.title || "").trim();
  if (title.includes("分镜")) return false;
  return (
    String(node.data?.componentType || "") === "image-generator" ||
    Boolean(node.data?.workflowGenerationJobId) ||
    Boolean(node.data?.generationCount) ||
    Boolean(node.data?.prompt) ||
    title.includes("图片生成器") ||
    title.includes("图片节点")
  );
}

export function isWorkflowImageResultGroupContainer(
  group: LibTvWorkflowNode | undefined,
  childNodes: LibTvWorkflowNode[],
) {
  if (group?.kind !== "group") return false;
  const imageChildren = childNodes.filter(
    (child) =>
      child.kind === "image" && String(child.data?.mediaUrl || "").trim(),
  );
  if (imageChildren.length === 0) return false;
  const hasStoryboardImageMetadata = imageChildren.some(
    (child) =>
      Number.isFinite(Number(child.data?.workflowStoryboardSourceRowIndex)) ||
      String((child.data as any)?.workflowStoryboardSourceNodeId || "").trim(),
  );
  if (hasStoryboardImageMetadata) return false;
  return (
    String(group.data?.componentType || "") === "image-generator" ||
    Boolean(group.data?.workflowGenerationJobId) ||
    Boolean(group.data?.prompt) ||
    Boolean(group.data?.generationCount) ||
    String(group.data?.title || "").includes("图片生成器")
  );
}

export function isWorkflowVideoGeneratorNode(
  node: LibTvWorkflowNode | undefined,
) {
  if (node?.kind !== "video") return false;
  return (
    node.data?.mediaRole === "generator" ||
    node.data?.componentType === "video-generator" ||
    Boolean(
      String(
        node.data?.workflowGenerationTaskId ||
          node.data?.workflowGenerationTaskType ||
          node.data?.workflowGenerationBackgroundTaskId ||
          "",
      ).trim(),
    ) ||
    Boolean(
      String(node.data?.prompt || "").trim() &&
      String(node.data?.modelId || "").trim(),
    )
  );
}

export function isWorkflowVideoGeneratorResultNode(
  node: LibTvWorkflowNode | undefined,
) {
  return (
    isWorkflowVideoGeneratorNode(node) &&
    Boolean(String(node?.data?.mediaUrl || "").trim())
  );
}

export function isWorkflowOrdinaryImageNode(
  node: LibTvWorkflowNode | undefined,
) {
  return (
    node?.kind === "image" &&
    (node.data?.mediaRole === "ordinary" ||
      isWorkflowImageGeneratorResultNode(node))
  );
}

export function isWorkflowOrdinaryVideoNode(
  node: LibTvWorkflowNode | undefined,
) {
  return (
    node?.kind === "video" &&
    node.data?.mediaRole === "ordinary" &&
    node.data?.componentType !== "video-generator"
  );
}

export function isWorkflowPlainAudioContextNode(
  node: LibTvWorkflowNode | undefined,
) {
  return node?.kind === "audio" && node.data?.mediaRole === "ordinary";
}

export function isWorkflowVideoGeneratorContextNode(
  node: LibTvWorkflowNode | undefined,
) {
  return (
    isWorkflowOrdinaryImageNode(node) ||
    isWorkflowImageGeneratorResultGroupNode(node) ||
    isWorkflowOrdinaryVideoNode(node) ||
    isWorkflowVideoGeneratorResultNode(node) ||
    isWorkflowStoryboardImageNode(node) ||
    isWorkflowPlainAudioContextNode(node) ||
    node?.kind === "script" ||
    node?.kind === "script-v2"
  );
}

export function canConnectWorkflowNodes(
  sourceNode: LibTvWorkflowNode | undefined,
  targetNode: LibTvWorkflowNode | undefined,
  allNodes: LibTvWorkflowNode[] = [],
) {
  const sourceKind = sourceNode?.kind;
  const targetKind = targetNode?.kind;
  if (!sourceKind || !targetKind) return false;
  const sourceIsImageResultGroup =
    isWorkflowImageGeneratorResultGroupNode(sourceNode);
  const targetIsImageResultGroup =
    isWorkflowImageGeneratorResultGroupNode(targetNode);
  const sourceIsStoryboardGroup = isWorkflowStoryboardGroupNode(
    sourceNode,
    allNodes,
  );
  const targetIsStoryboardImage = isWorkflowStoryboardImageNode(targetNode);
  const targetIsStoryboardGroup = isWorkflowStoryboardGroupNode(
    targetNode,
    allNodes,
  );
  const sourceActsAsImage = sourceKind === "image" || sourceIsImageResultGroup;
  const sourceIsScript = sourceKind === "script" || sourceKind === "script-v2";
  const targetIsScript = targetKind === "script" || targetKind === "script-v2";
  if (
    (sourceKind === "script-v2" && targetIsStoryboardGroup) ||
    (targetKind === "script-v2" && sourceIsStoryboardGroup)
  )
    return false;
  if (sourceKind === "group" && !sourceIsImageResultGroup) return false;
  if (targetKind === "group" && !targetIsImageResultGroup) {
    return targetIsStoryboardGroup && sourceIsScript;
  }
  if (targetIsStoryboardImage) {
    return (
      isWorkflowOrdinaryImageNode(sourceNode) ||
      sourceIsImageResultGroup ||
      sourceKind === "script"
    );
  }
  if (isWorkflowImageGeneratorNode(targetNode) || targetIsImageResultGroup) {
    return (
      isWorkflowOrdinaryImageNode(sourceNode) ||
      sourceIsImageResultGroup ||
      isWorkflowPlainTextContextNode(sourceNode) ||
      sourceIsScript
    );
  }
  if (isWorkflowVideoGeneratorNode(targetNode)) {
    return isWorkflowVideoGeneratorContextNode(sourceNode);
  }
  if (isWorkflowTextGeneratorNode(targetNode)) {
    return (
      isWorkflowPlainTextContextNode(sourceNode) ||
      isWorkflowPlainMediaContextNode(sourceNode)
    );
  }
  if (sourceActsAsImage && (targetKind === "image" || targetKind === "video"))
    return true;
  if (
    sourceKind === "text" &&
    (targetKind === "image" || targetKind === "video" || targetIsScript)
  )
    return true;
  if (
    sourceIsScript &&
    (targetKind === "image" || targetKind === "video" || targetKind === "text")
  )
    return true;
  if (sourceKind === "audio" && targetKind === "video") return true;
  if (
    (sourceKind === "video" || sourceKind === "audio") &&
    targetKind === "playlist"
  )
    return true;
  if (
    (sourceKind === "text" || sourceActsAsImage || sourceKind === "video") &&
    (targetKind === "threed" || targetKind === "director-console-3d")
  )
    return true;
  if (
    sourceKind === "threed" &&
    (targetKind === "image" ||
      targetKind === "video" ||
      targetKind === "threed")
  )
    return true;
  if (
    sourceKind === "director-console-3d" &&
    (targetKind === "image" ||
      targetKind === "video" ||
      targetKind === "director-console-3d")
  )
    return true;
  if (
    sourceKind === "video" &&
    (targetKind === "image" ||
      targetKind === "video" ||
      targetKind === "text" ||
      targetIsScript)
  )
    return true;
  return false;
}

export function makeWorkflowUpstreamNodeSummary(
  node: LibTvWorkflowNode,
): WorkflowUpstreamNodeSummary {
  if (isWorkflowImageGeneratorResultNode(node)) {
    return {
      id: node.id,
      kind: "image",
      title: String(node.data?.title || "图片").trim() || "图片",
      mediaUrl: String(node.data?.mediaUrl || "").trim(),
      mediaRole: "ordinary",
      componentType: "image-generator",
      workflowSeedanceAssetCategory: node.data?.workflowSeedanceAssetCategory,
      workflowSeedanceAssetUrl:
        getWorkflowSurfaceSeedanceAssetUrl(node) || undefined,
    };
  }
  if (isWorkflowImageGeneratorResultGroupNode(node)) {
    return {
      id: node.id,
      kind: "image",
      title: String(node.data?.title || "图片").trim() || "图片",
      mediaUrl: String(node.data?.mediaUrl || "").trim(),
      mediaRole: "ordinary",
      componentType: "image-generator",
      workflowSeedanceAssetCategory: node.data?.workflowSeedanceAssetCategory,
      workflowSeedanceAssetUrl:
        getWorkflowSurfaceSeedanceAssetUrl(node) || undefined,
    };
  }
  return {
    id: node.id,
    kind: node.kind,
    title:
      String(
        node.data?.title ||
          TAPNOW_NODE_ICON_META[node.kind]?.label ||
          node.kind,
      ).trim() || node.kind,
    mediaUrl:
      typeof node.data?.mediaUrl === "string" ? node.data.mediaUrl : undefined,
    mediaRole:
      typeof node.data?.mediaRole === "string"
        ? node.data.mediaRole
        : undefined,
    componentType:
      typeof node.data?.componentType === "string"
        ? node.data.componentType
        : undefined,
    workflowSeedanceAssetCategory: node.data?.workflowSeedanceAssetCategory,
    workflowSeedanceAssetUrl:
      getWorkflowSurfaceSeedanceAssetUrl(node) || undefined,
    scriptResult:
      node.kind === "script" || node.kind === "script-v2"
        ? node.data?.scriptResult || null
        : undefined,
  };
}
