import {
  apiClient,
  createApiClient,
  resolveApiServiceIdForBaseUrl,
} from "@/api/client";
import { getStoredApiKeyForService } from "@/stores/apiKeyStore";
import {
  recordGenerationHistoryFromPrediction,
  type GenerationHistoryMediaType,
} from "@/stores/generationHistoryStore";
import { useModelsStore } from "@/stores/modelsStore";
import type { Model } from "@/types/model";
import type { PredictionResult } from "@/types/prediction";
import type { WaveSpeedClient } from "@/api/client";
import type { DynamicModel } from "@/workflow/ideart/lib/hooks/useModels";
import { workflowFetch } from "@/workflow/backend/client";
import { mapWorkflowFamilyToDynamicModel } from "./workflow-model-adapter";
import {
  findWorkflowModelFamily,
  groupWorkflowModels,
} from "./workflow-model-family";
import { resolveWorkflowEndpointRoute } from "./workflow-model-routing";
import {
  buildWorkflowEndpointInput,
  getWorkflowRequestMediaCounts,
  type WorkflowRunRequest,
} from "./workflow-request-builder";

export type { WorkflowRunRequest } from "./workflow-request-builder";

export type WorkflowPredictionTaskEvent = {
  id: string;
  baseUrl: string;
  endpointId: string;
  mode: string;
  index: number;
  total: number;
  prediction: PredictionResult;
  urls: string[];
};

export type WorkflowPredictionLifecycle = {
  signal?: AbortSignal;
  onSubmitted?: (event: WorkflowPredictionTaskEvent) => void;
  onCompleted?: (event: WorkflowPredictionTaskEvent) => void;
};

export type WorkflowPredictionResumeOptions = Pick<
  WorkflowPredictionLifecycle,
  "signal" | "onCompleted"
> & {
  baseUrl?: string;
};

function normalizeWorkflowBaseUrl(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function workflowHistoryMediaType(value: unknown): GenerationHistoryMediaType {
  const category = String(value || "").toLowerCase();
  if (category.includes("digital")) return "avatar";
  if (category.includes("video")) return "video";
  if (category.includes("audio")) return "audio";
  if (category.includes("3d")) return "3d";
  if (category.includes("image")) return "image";
  return "file";
}

async function createWorkflowPredictionClient(baseUrl?: string) {
  const currentBaseUrl = normalizeWorkflowBaseUrl(apiClient.getBaseUrl());
  const requestedBaseUrl = normalizeWorkflowBaseUrl(baseUrl) || currentBaseUrl;
  let apiKey = apiClient.getApiKey();

  if (requestedBaseUrl !== currentBaseUrl) {
    const serviceId = resolveApiServiceIdForBaseUrl(requestedBaseUrl);
    if (!serviceId) {
      throw new Error("任务所属 API 地址已不可用，请切换回提交任务时的供应商");
    }
    apiKey = String(
      (await getStoredApiKeyForService(serviceId, requestedBaseUrl)) || "",
    ).trim();
    if (!apiKey) {
      throw new Error("缺少任务所属供应商的 API Key，无法继续查询任务");
    }
  }

  return {
    baseUrl: requestedBaseUrl,
    client: createApiClient({
      baseUrl: requestedBaseUrl,
      apiKey,
    }),
  };
}

async function ensureWorkflowCatalog(force = false) {
  const store = useModelsStore.getState();
  if (
    force ||
    !store.hasFetched ||
    store.lastBaseUrl !== apiClient.getBaseUrl()
  ) {
    await store.fetchModels(force);
  }
  return useModelsStore.getState().models;
}

function workflowReferenceFilename(
  url: string,
  mimeType: string,
  index: number,
) {
  const path = url.split(/[?#]/, 1)[0] || "";
  const candidate = decodeURIComponent(path.split("/").pop() || "").trim();
  if (candidate && /\.[a-z0-9]{2,8}$/i.test(candidate)) return candidate;
  const extension =
    mimeType.split("/")[1]?.replace(/[^a-z0-9]+/gi, "") || "bin";
  return "workflow-reference-" + (index + 1) + "." + extension;
}

function blobDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("读取本地素材失败"));
    reader.readAsDataURL(blob);
  });
}

async function providerReferenceUrl(
  client: WaveSpeedClient,
  value: string,
  index: number,
) {
  const url = String(value || "").trim();
  if (!url || /^https?:\/\//i.test(url)) return url;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("本地参考素材读取失败: HTTP " + response.status);
  }
  const blob = await response.blob();
  if (blob.size <= 0) throw new Error("本地参考素材为空");
  if (blob.size > 256 * 1024 * 1024) {
    throw new Error("本地参考素材超过 256MB，无法提交给当前供应商");
  }
  if (!client.supportsFileUpload()) return blobDataUrl(blob);
  const file = new File(
    [blob],
    workflowReferenceFilename(url, blob.type, index),
    { type: blob.type || "application/octet-stream" },
  );
  return client.uploadFile(file);
}

async function materializeWorkflowReferences(
  request: WorkflowRunRequest,
  client: WaveSpeedClient,
) {
  let index = 0;
  const convert = async (values: string[] | undefined) =>
    Promise.all(
      (values || []).map((value) =>
        providerReferenceUrl(client, value, index++),
      ),
    );
  return {
    ...request,
    referenceImages: await convert(request.referenceImages),
    images: await convert(request.images),
    referenceVideos: await convert(request.referenceVideos),
    referenceVideo: request.referenceVideo
      ? await providerReferenceUrl(client, request.referenceVideo, index++)
      : undefined,
    audioReferences: await convert(request.audioReferences),
    maskImage: request.maskImage
      ? await providerReferenceUrl(client, request.maskImage, index++)
      : undefined,
  };
}

export const mapWaveSpeedModelToWorkflowModel = (
  model: Model,
): DynamicModel => {
  const family = groupWorkflowModels([model])[0];
  return mapWorkflowFamilyToDynamicModel(family, false);
};

export async function loadWorkflowModels(
  force = false,
): Promise<DynamicModel[]> {
  const models = await ensureWorkflowCatalog(force);
  const families = groupWorkflowModels(models);
  const defaultCategories = new Set<string>();
  return families.map((family) => {
    const isDefault = !defaultCategories.has(family.category);
    defaultCategories.add(family.category);
    return mapWorkflowFamilyToDynamicModel(family, isDefault);
  });
}

export function extractWorkflowPredictionUrls(
  result: PredictionResult,
): string[] {
  const outputs = Array.isArray(result.outputs) ? result.outputs : [];
  return outputs
    .map((output) => {
      if (typeof output === "string") return output.trim();
      if (!output || typeof output !== "object") return "";
      const record = output as Record<string, unknown>;
      return String(
        record.url ||
          record.download_url ||
          record.image_url ||
          record.video_url ||
          record.audio_url ||
          record.model_url ||
          record.glb_url ||
          record.gltf_url ||
          record.mesh_url ||
          record.world_url ||
          record.splat_url ||
          record.file_url ||
          "",
      ).trim();
    })
    .filter(Boolean);
}

function aggregatePredictionResults(
  results: PredictionResult[],
  urls: string[],
) {
  const first = results[0];
  if (!first) throw new Error("任务没有返回结果");
  if (results.length === 1) return first;
  return {
    ...first,
    id: results
      .map((result) => result.id)
      .filter(Boolean)
      .join(","),
    outputs: urls,
  } as PredictionResult;
}

async function persistWorkflowPrediction(params: {
  urls: string[];
  category: string;
  taskIds: string[];
  baseUrl: string;
  endpointId: string;
  mode: string;
}) {
  if (typeof window === "undefined" || !window.electronAPI) return;
  try {
    const response = await workflowFetch(
      "/api/workflow/persist-generated-media",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: params.urls,
          fileType: params.category,
          projectId: "zaomeng-desktop-workflow",
          providerTaskIds: params.taskIds,
          providerBaseUrl: params.baseUrl,
          providerKey:
            resolveApiServiceIdForBaseUrl(params.baseUrl) || "current-provider",
          model: params.endpointId,
          platformPersisted: true,
          metadata: { mode: params.mode },
        }),
      },
    );
    if (!response.ok) {
      throw new Error("HTTP " + response.status);
    }
  } catch (error) {
    console.warn("[workflow] Failed to persist generated media:", error);
  }
}

export async function runWorkflowPrediction(
  request: WorkflowRunRequest,
  lifecycle: WorkflowPredictionLifecycle = {},
): Promise<{
  id: string;
  baseUrl: string;
  endpointId: string;
  mode: string;
  urls: string[];
  result: PredictionResult;
}> {
  const models = await ensureWorkflowCatalog(false);
  const execution = await createWorkflowPredictionClient();
  request = await materializeWorkflowReferences(request, execution.client);
  const families = groupWorkflowModels(models);
  const family = findWorkflowModelFamily(families, request.modelId);
  if (!family) throw new Error("找不到当前工作流模型，请重新选择模型");

  const mediaCounts = getWorkflowRequestMediaCounts(request);
  const route = resolveWorkflowEndpointRoute(family, {
    modelId: request.modelId,
    mode: request.mode || request.method,
    aspectRatio: request.aspectRatio,
    imageSize: request.imageSize,
    resolution: request.resolution,
    duration: request.duration,
    ...mediaCounts,
  });
  const endpointRequest = buildWorkflowEndpointInput(route, request);
  const requestedCount = Math.max(
    1,
    Math.min(8, Number(request.count || 1) || 1),
  );
  const runCount = endpointRequest.countHandledByEndpoint ? 1 : requestedCount;
  const results = await Promise.all(
    Array.from({ length: runCount }, async (_, index) => {
      const result = await execution.client.run(
        endpointRequest.endpointId,
        endpointRequest.input,
        {
          enableSyncMode: false,
          signal: lifecycle.signal,
          onSubmitted: (prediction) => {
            lifecycle.onSubmitted?.({
              id: String(prediction.id || "").trim(),
              baseUrl: execution.baseUrl,
              endpointId: endpointRequest.endpointId,
              mode: route.mode,
              index,
              total: runCount,
              prediction,
              urls: extractWorkflowPredictionUrls(prediction),
            });
          },
        },
      );
      lifecycle.onCompleted?.({
        id: String(result.id || "").trim(),
        baseUrl: execution.baseUrl,
        endpointId: endpointRequest.endpointId,
        mode: route.mode,
        index,
        total: runCount,
        prediction: result,
        urls: extractWorkflowPredictionUrls(result),
      });
      return result;
    }),
  );
  const urls: string[] = [];
  for (const result of results) {
    for (const url of extractWorkflowPredictionUrls(result)) {
      if (!urls.includes(url)) urls.push(url);
    }
  }

  if (urls.length === 0) throw new Error("任务完成但未返回输出");
  const result = aggregatePredictionResults(results, urls);
  await persistWorkflowPrediction({
    urls,
    category: String(family.category || "file"),
    taskIds: results
      .map((item) => String(item.id || "").trim())
      .filter(Boolean),
    baseUrl: execution.baseUrl,
    endpointId: endpointRequest.endpointId,
    mode: route.mode,
  });
  recordGenerationHistoryFromPrediction(result, {
    model: endpointRequest.endpointId,
    inputs: endpointRequest.input,
    source: "workflow",
    providerBaseUrl: execution.baseUrl,
    providerKey: resolveApiServiceIdForBaseUrl(execution.baseUrl) || undefined,
    mediaType: workflowHistoryMediaType(family.category),
  });
  return {
    id: String(result.id || results[0]?.id || ""),
    baseUrl: execution.baseUrl,
    endpointId: endpointRequest.endpointId,
    mode: route.mode,
    urls,
    result,
  };
}

export async function resumeWorkflowPredictionTasks(
  taskIds: string[],
  lifecycle: WorkflowPredictionResumeOptions = {},
): Promise<{
  ids: string[];
  baseUrl: string;
  urls: string[];
  results: PredictionResult[];
}> {
  const ids = Array.from(
    new Set(taskIds.map((id) => String(id || "").trim()).filter(Boolean)),
  );
  if (ids.length === 0) throw new Error("没有可恢复的生成任务");
  const execution = await createWorkflowPredictionClient(lifecycle.baseUrl);

  const results = await Promise.all(
    ids.map(async (id, index) => {
      const result = await execution.client.waitForResult(id, {
        signal: lifecycle.signal,
      });
      lifecycle.onCompleted?.({
        id,
        baseUrl: execution.baseUrl,
        endpointId: String(result.model || "").trim(),
        mode: "",
        index,
        total: ids.length,
        prediction: result,
        urls: extractWorkflowPredictionUrls(result),
      });
      return result;
    }),
  );
  const urls: string[] = [];
  for (const result of results) {
    for (const url of extractWorkflowPredictionUrls(result)) {
      if (!urls.includes(url)) urls.push(url);
    }
  }
  if (urls.length === 0) throw new Error("任务完成但未返回输出");
  for (const result of results) {
    recordGenerationHistoryFromPrediction(result, {
      model: result.model,
      source: "workflow",
      providerBaseUrl: execution.baseUrl,
      providerKey: resolveApiServiceIdForBaseUrl(execution.baseUrl) || undefined,
    });
  }
  return { ids, baseUrl: execution.baseUrl, urls, results };
}

export async function getWorkflowPredictionTask(
  taskId: string,
  options: { baseUrl?: string; signal?: AbortSignal } = {},
) {
  const id = String(taskId || "").trim();
  if (!id) throw new Error("缺少生成任务 ID");
  const execution = await createWorkflowPredictionClient(options.baseUrl);
  const result = await execution.client.getResult(id, {
    signal: options.signal,
  });
  return {
    id,
    baseUrl: execution.baseUrl,
    result,
    urls: extractWorkflowPredictionUrls(result),
  };
}
