import { useEffect } from "react";
import type { DynamicModel } from "@/workflow/ideart/lib/hooks/useModels";
import {
  getWorkflowPredictionTask,
  loadWorkflowModels,
  runWorkflowPrediction,
} from "@/workflow/ideart/lib/wavespeed/workflow-runtime";
import type {
  WorkflowPlatformMediaBody,
  WorkflowPlatformMediaRequest,
  WorkflowPlatformMediaResponse,
  WorkflowPlatformMediaResult,
} from "@/types/workflowBackend";

type MediaKind = WorkflowPlatformMediaResult["type"];
type ModelCategory = "image" | "video" | "audio" | "3d" | "avatar";

function text(value: unknown) {
  return String(value || "").trim();
}

function stringList(...values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flatMap((value) =>
          Array.isArray(value) ? value : value ? [value] : [],
        )
        .map(text)
        .filter(Boolean),
    ),
  );
}

function mediaKind(body: WorkflowPlatformMediaBody): MediaKind {
  const value = text(
    body.output_type || body.outputType || body.type,
  ).toLowerCase();
  if (value === "video") return "video";
  if (
    ["avatar", "digital-human", "digital_human", "digital human"].includes(
      value,
    )
  )
    return "video";
  if (value === "audio") return "audio";
  if (
    [
      "3d",
      "three-d",
      "threed",
      "model",
      "glb",
      "gltf",
      "mesh",
      "world",
    ].includes(value)
  )
    return "3d";
  return "image";
}

function requestedModelCategory(
  body: WorkflowPlatformMediaBody,
  kind: MediaKind,
): ModelCategory {
  const record = body as Record<string, unknown>;
  const signals = [
    body.output_type,
    body.outputType,
    body.type,
    record.category,
    record.workspace,
    record.media_type,
    record.mediaType,
  ]
    .map((value) => text(value).toLowerCase())
    .join(" ");
  if (/avatar|digital[-_ ]?human|数字人/.test(signals)) return "avatar";
  return kind;
}

function modelMatchesCategory(model: DynamicModel, expected: ModelCategory) {
  const actual = text(model.category).toLowerCase();
  if (expected === "3d") return actual === "3d" || actual === "three-d";
  return actual === expected;
}

function modelIdentityMatches(model: DynamicModel, requested: string) {
  const normalized = requested.toLowerCase().split("@@")[0];
  return [model.id, model.runtimeId, model.modelId]
    .map((value) => text(value).toLowerCase().split("@@")[0])
    .some((value) => value === normalized);
}

function selectedModel(
  models: DynamicModel[],
  category: ModelCategory,
  requested: string,
) {
  if (requested) {
    return models.find((model) => modelIdentityMatches(model, requested));
  }
  const candidates = models.filter((model) =>
    modelMatchesCategory(model, category),
  );
  return candidates.find((model) => model.isDefault) || candidates[0];
}

function defaultChoice(choices?: Array<{ id: string; isDefault?: boolean }>) {
  return (
    choices?.find((choice) => choice.isDefault)?.id || choices?.[0]?.id || ""
  );
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function predictionStatus(value: unknown) {
  const normalized = text(value).toLowerCase();
  if (["completed", "succeeded", "success", "succeed"].includes(normalized))
    return "completed" as const;
  if (["failed", "error", "cancelled", "canceled"].includes(normalized))
    return "failed" as const;
  if (["queued", "created", "pending"].includes(normalized))
    return "queued" as const;
  return "processing" as const;
}

async function queryPlatformMediaTask(
  body: WorkflowPlatformMediaBody,
): Promise<WorkflowPlatformMediaResult> {
  const record = body as Record<string, unknown>;
  const taskId = text(record.taskId || record.task_id || record.id);
  const task = await getWorkflowPredictionTask(taskId, {
    baseUrl: text(record.baseUrl || record.base_url) || undefined,
  });
  const status = predictionStatus(task.result.status);
  const rawResult = task.result as unknown as Record<string, unknown>;
  return {
    ok: status !== "failed",
    type: mediaKind(body),
    status,
    taskId,
    baseUrl: task.baseUrl,
    model: text(task.result.model),
    error: text(task.result.error),
    progress: Number.isFinite(Number(rawResult.progress))
      ? Number(rawResult.progress)
      : undefined,
    outputs: task.urls.map((url) => ({ url, viewUrl: url })),
  };
}

async function runPlatformMedia(
  request: WorkflowPlatformMediaRequest,
): Promise<WorkflowPlatformMediaResult> {
  const body = request.body || {};
  const operation = text(body.operation).toLowerCase();
  if (operation === "status" || operation === "query-task") {
    return queryPlatformMediaTask(body);
  }
  const kind = mediaKind(body);
  const models = await loadWorkflowModels(false);
  const requestedModel = text(body.model || body.model_id || body.modelId);
  const category = requestedModelCategory(body, kind);
  const model = selectedModel(models, category, requestedModel);
  if (requestedModel && !model) {
    throw new Error("当前供应商中找不到指定模型：" + requestedModel);
  }
  if (!model)
    throw new Error(
      "当前供应商没有可用的" +
        (category === "avatar" ? "数字人" : kind) +
        "模型",
    );

  const record = body as Record<string, unknown>;
  const method =
    text(record.workflowEndpointMethod || record.method || record.mode) ||
    defaultChoice(model.parameters?.methods || model.parameters?.modes);
  const aspectRatio =
    text(record.aspect_ratio || record.aspectRatio) ||
    defaultChoice(model.parameters?.aspectRatios);
  const resolution =
    text(
      record.resolution || record.image_size || record.imageSize || record.size,
    ) || defaultChoice(model.parameters?.resolutions);
  const duration =
    text(record.duration) || defaultChoice(model.parameters?.durations);
  const references = stringList(
    record.reference_images,
    record.referenceImages,
    record.image_urls,
    record.imageUrls,
    record.images,
    record.image,
    record.image_url,
    record.imageUrl,
  );
  const videoReferences = stringList(
    record.reference_videos,
    record.referenceVideos,
    record.video_urls,
    record.videoUrls,
    record.videos,
  );
  const audioReferences = stringList(
    record.reference_audios,
    record.referenceAudios,
    record.audio_urls,
    record.audioUrls,
    record.audios,
  );
  const rawExtra =
    record.workflowExtraParameters ||
    record.extraParameters ||
    record.extra ||
    record.options;
  const extra: Record<string, unknown> =
    rawExtra && typeof rawExtra === "object" && !Array.isArray(rawExtra)
      ? { ...(rawExtra as Record<string, unknown>) }
      : {};
  for (const key of [
    "quality",
    "style",
    "seed",
    "negative_prompt",
    "guidance_scale",
    "steps",
    "strength",
    "controls",
  ]) {
    if (extra[key] === undefined && record[key] !== undefined) {
      extra[key] = record[key];
    }
  }
  const count = Math.max(
    1,
    Math.min(
      8,
      numberValue(
        body.count || record.n || record.generationCount || record.num_outputs,
        1,
      ),
    ),
  );
  const maskImage = text(
    record.mask_image || record.maskImage || record.maskData || record.mask,
  );

  const prediction = await runWorkflowPrediction({
    prompt: text(body.prompt),
    modelId: model.runtimeId || model.id || requestedModel,
    mode: method,
    method,
    aspectRatio,
    resolution,
    imageSize: text(record.image_size || record.imageSize || record.size),
    duration,
    count,
    generateAudio:
      record.generate_audio === true ||
      record.generateAudio === true ||
      record.sound === true,
    enableWebSearch:
      record.enable_web_search === true || record.enableWebSearch === true,
    referenceImages: references,
    referenceVideos: videoReferences,
    audioReferences,
    maskImage: maskImage || undefined,
    extra,
  });

  return {
    ok: true,
    type: kind,
    status: "completed",
    taskId: prediction.id,
    baseUrl: prediction.baseUrl,
    model: prediction.endpointId,
    mode: prediction.mode,
    parameters: { aspectRatio, resolution, duration, count },
    outputs: prediction.urls.map((url) => ({ url, viewUrl: url })),
  };
}

export function useWorkflowPlatformMediaListener() {
  useEffect(() => {
    const api = window.electronAPI;
    if (
      !api?.onWorkflowPlatformMediaRequest ||
      !api.resolveWorkflowPlatformMediaRequest
    ) {
      return;
    }
    return api.onWorkflowPlatformMediaRequest((request) => {
      void runPlatformMedia(request)
        .then((result) => {
          const response: WorkflowPlatformMediaResponse = { ok: true, result };
          api.resolveWorkflowPlatformMediaRequest?.(
            request.requestId,
            response,
          );
        })
        .catch((error) => {
          const response: WorkflowPlatformMediaResponse = {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
          api.resolveWorkflowPlatformMediaRequest?.(
            request.requestId,
            response,
          );
        });
    });
  }, []);
}
