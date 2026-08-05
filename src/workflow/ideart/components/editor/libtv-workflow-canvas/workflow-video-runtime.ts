import { runWorkflowPrediction } from "@/workflow/ideart/lib/wavespeed/workflow-runtime";
import { workflowPredictionTaskType } from "./workflow-prediction-task";

type WorkflowVideoRuntimePayload = Record<string, any> & {
  message?: string;
  prompt?: string;
  modelId?: string;
  workflowEndpointMethod?: string;
  method?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: string | number;
  count?: string | number;
  generateAudio?: boolean;
  audioEnabled?: boolean;
  enableWebSearch?: boolean;
  images?: string[];
  referenceImages?: string[];
  referenceVideo?: string;
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

/**
 * Runs every migrated workflow video surface through the current model catalog.
 * The callback shape mirrors the former streaming endpoint so the canvas can
 * keep its existing progress and result rendering without provider branches.
 */
export async function runWorkflowVideoRuntime(
  payload: WorkflowVideoRuntimePayload,
  onEvent?: (event: Record<string, any>) => void,
) {
  const modelId = String(payload.modelId || "").trim();
  if (!modelId) throw new Error("请先选择视频模型");

  const referenceImages = compactMediaUrls([
    payload.images,
    payload.referenceImages,
  ]);
  const referenceVideos = compactMediaUrls([
    payload.referenceVideo,
    payload.referenceVideos,
  ]);
  const audioReferences = compactMediaUrls([payload.audioReferences]);
  const enableWebSearch =
    typeof payload.enableWebSearch === "boolean"
      ? payload.enableWebSearch
      : Array.isArray(payload.tools) &&
        payload.tools.some(
          (tool: any) =>
            String(tool?.type || "")
              .trim()
              .toLowerCase() === "web_search",
        );

  onEvent?.({
    type: "progress",
    status: "running",
    content: "正在提交视频生成任务",
  });

  const submittedTaskIds: string[] = [];
  const taskType = workflowPredictionTaskType("video");
  const prediction = await runWorkflowPrediction(
    {
      modelId,
      mode:
        String(payload.workflowEndpointMethod || payload.method || "").trim() ||
        undefined,
      prompt: String(payload.message || payload.prompt || "").trim(),
      aspectRatio: String(payload.aspectRatio || "").trim() || undefined,
      resolution: String(payload.resolution || "").trim() || undefined,
      duration:
        payload.duration === undefined || payload.duration === null
          ? undefined
          : payload.duration,
      count: payload.count,
      generateAudio:
        typeof payload.generateAudio === "boolean"
          ? payload.generateAudio
          : typeof payload.audioEnabled === "boolean"
            ? payload.audioEnabled
            : undefined,
      enableWebSearch,
      referenceImages,
      referenceVideo: referenceVideos[0],
      referenceVideos: referenceVideos.slice(1),
      audioReferences,
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
          content: "视频任务已提交",
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
          content: "视频生成中",
          taskId: task.id,
          taskIds: [...submittedTaskIds],
          taskType,
          baseUrl: task.baseUrl,
          endpointId: task.endpointId,
          mode: task.mode,
          index: task.index,
          total: task.total,
          videos: task.urls,
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
    videos: prediction.urls,
    result: {
      videos: prediction.urls,
      prediction: prediction.result,
    },
  };
  onEvent?.(event);
  return event;
}
