import { runWorkflowPrediction } from "@/workflow/ideart/lib/wavespeed/workflow-runtime";
import type {
  LibTvWorkflowEdge,
  LibTvWorkflowNode,
} from "@/workflow/ideart/lib/libtv/workflow";
import { workflowPredictionTaskType } from "./workflow-prediction-task";

export type WorkflowAudioRuntimePayload = Record<string, unknown> & {
  modelId: string;
  mode?: string;
  prompt?: string;
  count?: string | number;
  referenceImages?: string[];
  referenceVideos?: string[];
  audioReferences?: string[];
  signal?: AbortSignal;
};

function compactMediaUrls(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
}

export function buildWorkflowAudioRuntimeContext(
  sourceNode: LibTvWorkflowNode,
  nodes: LibTvWorkflowNode[],
  edges: LibTvWorkflowEdge[],
) {
  const upstreamNodes = edges
    .filter((edge) => edge.target === sourceNode.id)
    .map((edge) => nodes.find((node) => node.id === edge.source))
    .filter((node): node is LibTvWorkflowNode => Boolean(node));
  const textBlocks: string[] = [];
  const referenceImages: string[] = [];
  const referenceVideos: string[] = [];
  const audioReferences: string[] = [];

  for (const node of upstreamNodes) {
    const text = String(node.data?.prompt || node.data?.content || "").trim();
    if (
      text &&
      (node.kind === "text" ||
        node.kind === "script" ||
        node.kind === "script-v2")
    ) {
      textBlocks.push(text);
    }
    const mediaUrl = String(node.data?.mediaUrl || "").trim();
    if (!mediaUrl) continue;
    if (node.kind === "image") referenceImages.push(mediaUrl);
    if (node.kind === "video") referenceVideos.push(mediaUrl);
    if (node.kind === "audio") audioReferences.push(mediaUrl);
  }

  return {
    textBlocks: Array.from(new Set(textBlocks)),
    referenceImages: compactMediaUrls([
      referenceImages,
      sourceNode.data?.referenceImages,
    ]),
    referenceVideos: compactMediaUrls([referenceVideos]),
    audioReferences: compactMediaUrls([audioReferences]),
  };
}

export async function runWorkflowAudioRuntime(
  payload: WorkflowAudioRuntimePayload,
  onEvent?: (event: Record<string, unknown>) => void,
) {
  const modelId = String(payload.modelId || "").trim();
  if (!modelId) throw new Error("请先选择音频模型");

  const submittedTaskIds: string[] = [];
  const taskType = workflowPredictionTaskType("audio");
  const prediction = await runWorkflowPrediction(
    {
      modelId,
      mode: String(payload.mode || "").trim() || undefined,
      prompt: String(payload.prompt || "").trim(),
      count: payload.count,
      referenceImages: compactMediaUrls([payload.referenceImages]),
      referenceVideos: compactMediaUrls([payload.referenceVideos]),
      audioReferences: compactMediaUrls([payload.audioReferences]),
      extra: payload,
    },
    {
      signal: payload.signal,
      onSubmitted: (task) => {
        if (task.id && !submittedTaskIds.includes(task.id)) {
          submittedTaskIds.push(task.id);
        }
        onEvent?.({
          type: "submitted",
          status: "running",
          taskId: task.id,
          taskIds: [...submittedTaskIds],
          taskType,
          baseUrl: task.baseUrl,
          endpointId: task.endpointId,
          mode: task.mode,
          index: task.index,
          total: task.total,
        });
      },
      onCompleted: (task) => {
        onEvent?.({
          type: "progress",
          status: "running",
          taskId: task.id,
          taskIds: [...submittedTaskIds],
          taskType,
          baseUrl: task.baseUrl,
          endpointId: task.endpointId,
          mode: task.mode,
          index: task.index,
          total: task.total,
          audios: task.urls,
          progress: Math.min(0.98, (task.index + 1) / task.total),
        });
      },
    },
  );

  const event = {
    type: "result",
    status: "completed",
    taskId: submittedTaskIds[submittedTaskIds.length - 1] || prediction.id,
    taskIds: submittedTaskIds,
    taskType,
    baseUrl: prediction.baseUrl,
    endpointId: prediction.endpointId,
    mode: prediction.mode,
    audios: prediction.urls,
    result: {
      audios: prediction.urls,
      prediction: prediction.result,
    },
  };
  onEvent?.(event);
  return event;
}
