import { apiClient } from "@/api/client";
import { useModelsStore } from "@/stores/modelsStore";
import { uploadPlatformAssetFile } from "@/workflow/ideart/lib/platform-assets";
import {
  findWorkflowModelFamily,
  groupWorkflowModels,
} from "@/workflow/ideart/lib/wavespeed/workflow-model-family";
import {
  extractWorkflowPredictionUrls,
  runWorkflowPrediction,
} from "@/workflow/ideart/lib/wavespeed/workflow-runtime";
import type { WorkflowExtraParameterValue } from "../libtv-workflow-surface/workflow-extra-parameters";

export type WorkflowImageRuntimeRequest = {
  modelId: string;
  methodId?: string;
  prompt: string;
  sourceImage: string;
  referenceImages?: string[];
  maskImage?: string;
  aspectRatio?: string;
  resolution?: string;
  count?: number;
  enableWebSearch?: boolean;
  extraParameters?: Record<string, WorkflowExtraParameterValue>;
};

export type WorkflowImageHistoryRecoveryRequest = {
  modelId: string;
  prompt?: string;
  startedAt: number;
  expectedCount?: number;
};

export type WorkflowImageHistoryRecoveryResult = {
  taskIds: string[];
  urls: string[];
};

export type WorkflowImagePredictionTaskSource = {
  taskIds?: unknown;
  taskId?: unknown;
  jobId?: unknown;
};

const LOCAL_IMAGE_JOB_PREFIX = "local-image-";

function splitWorkflowImageTaskIds(value: unknown) {
  return String(value || "")
    .trim()
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function resolveWorkflowImagePredictionTaskIds(
  source: WorkflowImagePredictionTaskSource,
) {
  const explicitTaskIds = Array.isArray(source.taskIds)
    ? source.taskIds.flatMap(splitWorkflowImageTaskIds)
    : splitWorkflowImageTaskIds(source.taskIds);
  explicitTaskIds.push(...splitWorkflowImageTaskIds(source.taskId));

  const rawJobId = String(source.jobId || "").trim();
  const isLegacyPredictionJob =
    rawJobId.startsWith(LOCAL_IMAGE_JOB_PREFIX) || rawJobId.includes(",");
  if (isLegacyPredictionJob) {
    const predictionIds = rawJobId.startsWith(LOCAL_IMAGE_JOB_PREFIX)
      ? rawJobId.slice(LOCAL_IMAGE_JOB_PREFIX.length)
      : rawJobId;
    explicitTaskIds.push(...splitWorkflowImageTaskIds(predictionIds));
  }

  return Array.from(new Set(explicitTaskIds));
}

export function isWorkflowImagePredictionJobId(value: unknown) {
  const jobId = String(value || "").trim();
  return jobId.startsWith(LOCAL_IMAGE_JOB_PREFIX) || jobId.includes(",");
}

function mediaExtension(type: string) {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("jpeg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("avif")) return "avif";
  return "png";
}

export async function ensureWorkflowPublicImageUrl(
  value: string,
  name: string,
) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`图片读取失败: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const mimeType = blob.type || "image/png";
  const file = new File([blob], `${name}.${mediaExtension(mimeType)}`, {
    type: mimeType,
  });
  const platformFile = await uploadPlatformAssetFile(file);
  return platformFile.url;
}

function normalizeRecoveryPrompt(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function historyItemPrompt(item: {
  input?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
}) {
  const input = item.input || item.inputs || {};
  return normalizeRecoveryPrompt(
    input.prompt || input.text || input.message || input.description,
  );
}

function recoveryHistoryCreatedAt(value: unknown, startedAt: number) {
  const raw = String(value || "").trim();
  if (!raw) return Number.NaN;
  const candidates = [Date.parse(raw)];
  if (/z$/i.test(raw)) {
    candidates.push(
      Date.parse(raw.replace(/z$/i, "")),
      Date.parse(raw.replace(/z$/i, "+08:00")),
    );
  }
  return candidates
    .filter(Number.isFinite)
    .sort(
      (left, right) => Math.abs(left - startedAt) - Math.abs(right - startedAt),
    )[0];
}

async function resolveWorkflowImageEndpointIds(modelId: string) {
  const store = useModelsStore.getState();
  if (!store.hasFetched || store.lastBaseUrl !== apiClient.getBaseUrl()) {
    await store.fetchModels(false);
  }
  const families = groupWorkflowModels(useModelsStore.getState().models);
  const family = findWorkflowModelFamily(families, modelId);
  return new Set(
    family?.endpoints.map((endpoint) => endpoint.model_id) || [modelId],
  );
}

export async function recoverWorkflowImageRuntimeFromHistory(
  request: WorkflowImageHistoryRecoveryRequest,
): Promise<WorkflowImageHistoryRecoveryResult | null> {
  const startedAt = Number(request.startedAt);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;

  const expectedCount = Math.max(
    1,
    Math.min(8, Math.round(Number(request.expectedCount || 1) || 1)),
  );
  const endpointIds = await resolveWorkflowImageEndpointIds(request.modelId);
  const history = await apiClient.getHistory(1, 100, {
    created_after: new Date(startedAt - 10_000).toISOString(),
  });
  const expectedPrompt = normalizeRecoveryPrompt(request.prompt);
  const candidates = (history.items || [])
    .map((item) => ({
      item,
      createdAt: recoveryHistoryCreatedAt(item.created_at, startedAt),
    }))
    .filter(({ item, createdAt }) => {
      if (item.status !== "completed" || !endpointIds.has(item.model)) {
        return false;
      }
      return (
        Number.isFinite(createdAt) &&
        createdAt >= startedAt - 10_000 &&
        createdAt <= startedAt + 2 * 60 * 60 * 1000
      );
    })
    .sort((left, right) => left.createdAt - right.createdAt);
  if (candidates.length === 0) return null;

  const promptMatches = expectedPrompt
    ? candidates.filter(({ item }) => {
        const actualPrompt = historyItemPrompt(item);
        return Boolean(
          actualPrompt &&
          (actualPrompt.includes(expectedPrompt) ||
            expectedPrompt.includes(actualPrompt)),
        );
      })
    : candidates;
  const firstCandidateAt = candidates[0]?.createdAt;
  const recoverableCandidates =
    promptMatches.length > 0
      ? promptMatches
      : Math.abs(firstCandidateAt - startedAt) <= 30_000
        ? candidates
        : [];

  const taskIds: string[] = [];
  const urls: string[] = [];
  for (const { item } of recoverableCandidates) {
    const itemUrls = extractWorkflowPredictionUrls(item);
    if (itemUrls.length === 0) continue;
    if (item.id) taskIds.push(item.id);
    for (const url of itemUrls) {
      if (!urls.includes(url)) urls.push(url);
    }
    if (urls.length >= expectedCount) break;
  }
  if (urls.length < expectedCount) return null;
  return {
    taskIds: Array.from(new Set(taskIds)),
    urls: urls.slice(0, expectedCount),
  };
}

export async function runWorkflowImageRuntime(
  request: WorkflowImageRuntimeRequest,
) {
  const modelId = String(request.modelId || "").trim();
  if (!modelId) throw new Error("请先选择图片模型");

  const sourceImage = await ensureWorkflowPublicImageUrl(
    request.sourceImage,
    "workflow-source",
  );
  const referenceImages = await Promise.all(
    (request.referenceImages || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value, index) =>
        ensureWorkflowPublicImageUrl(value, `workflow-reference-${index + 1}`),
      ),
  );
  const maskImage = request.maskImage
    ? await ensureWorkflowPublicImageUrl(request.maskImage, "workflow-mask")
    : undefined;

  return runWorkflowPrediction({
    modelId,
    mode: String(request.methodId || "").trim() || undefined,
    prompt: request.prompt,
    aspectRatio: String(request.aspectRatio || "").trim() || undefined,
    resolution: String(request.resolution || "").trim() || undefined,
    count: request.count,
    enableWebSearch: request.enableWebSearch,
    referenceImages: [sourceImage, ...referenceImages].filter(Boolean),
    maskImage,
    extra: request.extraParameters,
  });
}
