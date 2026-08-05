import { runWorkflowPrediction } from "@/workflow/ideart/lib/wavespeed/workflow-runtime";
import { workflowPredictionTaskType } from "./workflow-prediction-task";

export type WorkflowThreeDRuntimePayload = Record<string, unknown> & {
  modelId: string;
  mode?: string;
  prompt?: string;
  count?: string | number;
  referenceImages?: string[];
  referenceVideos?: string[];
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

const THREE_D_MODEL_EXTENSIONS = new Set([
  "glb",
  "gltf",
  "fbx",
  "obj",
  "usdz",
  "ply",
  "stl",
]);
const THREE_D_SPLAT_EXTENSIONS = new Set(["spz", "splat"]);
const THREE_D_PREVIEW_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "webp",
]);

function assetExtension(value: string) {
  const raw = String(value || "").split(/[?#]/, 1)[0] || "";
  let clean = raw;
  try {
    clean = decodeURIComponent(raw);
  } catch {
    // Signed provider URLs can contain a literal percent sign.
  }
  return clean.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "";
}

export function resolveWorkflowThreeDAssets(values: unknown[]) {
  const assets = compactMediaUrls(values);
  const modelUrl = assets.find((url) =>
    THREE_D_MODEL_EXTENSIONS.has(assetExtension(url)),
  );
  const splatUrl = assets.find((url) =>
    THREE_D_SPLAT_EXTENSIONS.has(assetExtension(url)),
  );
  const thumbnailUrl = assets.find((url) =>
    THREE_D_PREVIEW_EXTENSIONS.has(assetExtension(url)),
  );
  const worldUrl = assets.find((url) => {
    if (url === modelUrl || url === splatUrl || url === thumbnailUrl)
      return false;
    const normalized = url.toLowerCase();
    return (
      /(?:world|marble|scene|panorama|pano)/.test(normalized) ||
      !assetExtension(url)
    );
  });
  return {
    assets,
    modelUrl,
    splatUrl,
    thumbnailUrl,
    worldUrl,
    primaryUrl:
      modelUrl || splatUrl || worldUrl || thumbnailUrl || assets[0] || "",
  };
}

export async function runWorkflowThreeDRuntime(
  payload: WorkflowThreeDRuntimePayload,
  onEvent?: (event: Record<string, unknown>) => void,
) {
  const modelId = String(payload.modelId || "").trim();
  if (!modelId) throw new Error("请先选择 3D 模型");

  const submittedTaskIds: string[] = [];
  const taskType = workflowPredictionTaskType("3d");
  const prediction = await runWorkflowPrediction(
    {
      modelId,
      mode: String(payload.mode || "").trim() || undefined,
      prompt: String(payload.prompt || "").trim(),
      count: payload.count,
      referenceImages: compactMediaUrls([payload.referenceImages]),
      referenceVideos: compactMediaUrls([payload.referenceVideos]),
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
          assets: task.urls,
          progress: Math.min(0.98, (task.index + 1) / task.total),
        });
      },
    },
  );
  const resolvedAssets = resolveWorkflowThreeDAssets(prediction.urls);

  const event = {
    type: "result",
    status: "completed",
    taskId: submittedTaskIds[submittedTaskIds.length - 1] || prediction.id,
    taskIds: submittedTaskIds,
    taskType,
    baseUrl: prediction.baseUrl,
    endpointId: prediction.endpointId,
    mode: prediction.mode,
    assets: resolvedAssets.assets,
    modelUrl: resolvedAssets.modelUrl,
    splatUrl: resolvedAssets.splatUrl,
    thumbnailUrl: resolvedAssets.thumbnailUrl,
    worldUrl: resolvedAssets.worldUrl,
    result: {
      assets: resolvedAssets.assets,
      modelUrl: resolvedAssets.modelUrl,
      splatUrl: resolvedAssets.splatUrl,
      thumbnailUrl: resolvedAssets.thumbnailUrl,
      worldUrl: resolvedAssets.worldUrl,
      prediction: prediction.result,
    },
  };
  onEvent?.(event);
  return event;
}
