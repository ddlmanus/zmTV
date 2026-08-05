import type {
  LibTvWorkflowEdge,
  LibTvWorkflowNode,
  LibTvWorkflowNodeKind,
} from "@/workflow/ideart/lib/libtv/workflow";
import {
  codexWorkflowMediaIdentityKeys,
  codexWorkflowNodeMatchesMediaKind,
  codexWorkflowNodeMediaIdentityKeys,
} from "./codex-generation-node-reuse";

type CodexReference = {
  url?: string;
  path?: string;
  sourceUrl?: string;
  nodeId?: string;
  mediaKind?: string;
};

type ReferenceNodePatch = {
  nodeId: string;
  data: Partial<LibTvWorkflowNode["data"]>;
};

export type CodexReferenceReconciliationPlan = {
  duplicateNodeIds: string[];
  replacementEdges: Array<{ source: string; target: string }>;
  nodePatches: ReferenceNodePatch[];
};

function referenceNodeKind(mediaKind: string): LibTvWorkflowNodeKind | null {
  if (mediaKind === "video") return "video";
  if (mediaKind === "audio") return "audio";
  if (mediaKind === "image") return "image";
  return null;
}

function intersects(left: Set<string>, right: Set<string>) {
  return Array.from(left).some((key) => right.has(key));
}

function uniqueStrings(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

export function buildCodexReferenceReconciliationPlan(params: {
  nodes: LibTvWorkflowNode[];
  edges: LibTvWorkflowEdge[];
  references: CodexReference[];
}): CodexReferenceReconciliationPlan {
  const nodesById = new Map(params.nodes.map((node) => [node.id, node]));
  const replacements = new Map<
    string,
    { nodeId: string; mediaUrl: string; mediaKind: LibTvWorkflowNodeKind }
  >();

  for (const reference of params.references) {
    const canonicalNodeId = String(reference.nodeId || "").trim();
    const canonicalNode = nodesById.get(canonicalNodeId);
    const mediaKind = referenceNodeKind(
      String(reference.mediaKind || "")
        .trim()
        .toLowerCase(),
    );
    if (
      !canonicalNode ||
      !mediaKind ||
      !codexWorkflowNodeMatchesMediaKind(canonicalNode, mediaKind)
    ) {
      continue;
    }
    const referenceUrl = String(
      reference.sourceUrl || reference.url || reference.path || "",
    ).trim();
    const referenceKeys = codexWorkflowMediaIdentityKeys(referenceUrl);
    if (!referenceKeys.size) continue;
    const canonicalMediaUrl = String(canonicalNode.data?.mediaUrl || "").trim();
    for (const node of params.nodes) {
      if (
        node.id === canonicalNode.id ||
        !codexWorkflowNodeMatchesMediaKind(node, mediaKind) ||
        String(node.data?.mediaRole || "").trim() === "generator"
      ) {
        continue;
      }
      if (!intersects(codexWorkflowNodeMediaIdentityKeys(node), referenceKeys))
        continue;
      replacements.set(node.id, {
        nodeId: canonicalNode.id,
        mediaUrl: canonicalMediaUrl || referenceUrl,
        mediaKind,
      });
    }
  }

  if (!replacements.size) {
    return { duplicateNodeIds: [], replacementEdges: [], nodePatches: [] };
  }

  const replacementEdges = params.edges
    .filter(
      (edge) => replacements.has(edge.source) || replacements.has(edge.target),
    )
    .map((edge) => ({
      source: replacements.get(edge.source)?.nodeId || edge.source,
      target: replacements.get(edge.target)?.nodeId || edge.target,
    }))
    .filter((edge) => edge.source !== edge.target)
    .filter(
      (edge, index, edges) =>
        edges.findIndex(
          (candidate) =>
            candidate.source === edge.source &&
            candidate.target === edge.target,
        ) === index,
    );

  const nodePatches = params.nodes.flatMap((node) => {
    if (replacements.has(node.id)) return [];
    const data = node.data || {};
    const nextImageNodeIds = uniqueStrings(
      (Array.isArray(data.referenceImageNodeIds)
        ? data.referenceImageNodeIds
        : []
      ).map((nodeId) => replacements.get(String(nodeId))?.nodeId || nodeId),
    );
    const nextVideoNodeIds = uniqueStrings(
      (Array.isArray(data.referenceVideoNodeIds)
        ? data.referenceVideoNodeIds
        : []
      ).map((nodeId) => replacements.get(String(nodeId))?.nodeId || nodeId),
    );
    const replaceMediaUrl = (value: unknown) => {
      const keys = codexWorkflowMediaIdentityKeys(value);
      const replacement = Array.from(replacements.entries()).find(
        ([duplicateNodeId]) => {
          const duplicateNode = nodesById.get(duplicateNodeId);
          return duplicateNode
            ? intersects(
                codexWorkflowNodeMediaIdentityKeys(duplicateNode),
                keys,
              )
            : false;
        },
      )?.[1];
      return replacement?.mediaUrl || String(value || "").trim();
    };
    const nextImages = uniqueStrings(
      (Array.isArray(data.referenceImages) ? data.referenceImages : []).map(
        replaceMediaUrl,
      ),
    );
    const nextVideos = uniqueStrings(
      (Array.isArray(data.referenceVideos) ? data.referenceVideos : []).map(
        replaceMediaUrl,
      ),
    );
    const changed =
      JSON.stringify(nextImageNodeIds) !==
        JSON.stringify(data.referenceImageNodeIds || []) ||
      JSON.stringify(nextVideoNodeIds) !==
        JSON.stringify(data.referenceVideoNodeIds || []) ||
      JSON.stringify(nextImages) !==
        JSON.stringify(data.referenceImages || []) ||
      JSON.stringify(nextVideos) !== JSON.stringify(data.referenceVideos || []);
    return changed
      ? [
          {
            nodeId: node.id,
            data: {
              referenceImageNodeIds: nextImageNodeIds,
              referenceVideoNodeIds: nextVideoNodeIds,
              referenceImages: nextImages,
              referenceVideos: nextVideos,
            },
          },
        ]
      : [];
  });

  return {
    duplicateNodeIds: Array.from(replacements.keys()),
    replacementEdges,
    nodePatches,
  };
}
