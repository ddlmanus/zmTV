import { normalizeRenderableImageUrl } from "@/workflow/ideart/lib/url/image-proxy-policy";
import { resolveUnifiedProviderTaskType } from "@/workflow/ideart/lib/utils/video-task-polling";
import {
  buildProviderTaskStatusUrl,
  readProviderKeyFromTaskStatusUrl,
} from "@/workflow/ideart/lib/generation/provider-status-url";
import { getWorkflowErrorMessage } from "@/workflow/ideart/lib/error-message";

export type QuickEditAsyncTask = {
  taskId?: string;
  taskType?: string;
  statusUrl?: string;
  modelId?: string;
  projectId?: string;
  providerKey?: string;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function collectQuickEditTaskImages(payload: any): string[] {
  const images: string[] = [];
  const push = (value: unknown) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) return;
    if (/^(data:image\/|blob:|\/|https?:\/\/)/i.test(normalized)) {
      images.push(normalizeRenderableImageUrl(normalized));
    }
  };
  const visit = (value: unknown, keyHint = "") => {
    if (!value) return;
    if (typeof value === "string") {
      if (/image|url|file|media|result/i.test(keyHint)) push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, keyHint));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(
        ([key, item]) => {
          if (
            /^(url|urls|image|images|image_url|imageUrl|file_url|fileUrl|media_url|mediaUrl|download_url|downloadUrl|output_url|outputUrl|result|task_result|data)$/i.test(
              key,
            )
          ) {
            visit(item, key);
          }
        },
      );
    }
  };
  visit(payload);
  return Array.from(new Set(images.filter(Boolean)));
}

function resolveTaskStatus(payload: any): string {
  return String(
    payload?.data?.task_status ||
      payload?.task_status ||
      payload?.data?.status ||
      payload?.status ||
      payload?.data?.raw?.data?.status ||
      "",
  )
    .trim()
    .toLowerCase();
}

function isFailedTaskStatus(status: string): boolean {
  return [
    "failed",
    "fail",
    "failure",
    "error",
    "cancelled",
    "canceled",
    "expired",
  ].includes(status);
}

export function buildQuickEditTaskStatusUrl(task: QuickEditAsyncTask): string {
  const rawStatusUrl = String(task.statusUrl || "").trim();
  const statusUrlProviderKey = readProviderKeyFromTaskStatusUrl(rawStatusUrl);
  const providerKey = String(
    task.providerKey || statusUrlProviderKey || "",
  ).trim();
  const taskId = String(task.taskId || "").trim();
  const modelId = String(task.modelId || "").trim();
  const taskType =
    resolveUnifiedProviderTaskType({
      taskType: task.taskType,
      modelId,
      providerKey,
      fallback: "image-generation",
    }) || "image-generation";
  return buildProviderTaskStatusUrl({
    taskId,
    taskType,
    statusUrl: rawStatusUrl,
    providerKey,
    modelId,
    projectId: task.projectId,
  });
}

export async function waitForQuickEditImageTask(
  task: QuickEditAsyncTask,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    onProgress?: (message: string) => void;
  } = {},
): Promise<string> {
  const statusUrl = buildQuickEditTaskStatusUrl(task);
  if (!statusUrl) throw new Error("Missing image task status URL");
  const maxAttempts = Math.max(
    1,
    Math.floor(Number(options.maxAttempts || 180)),
  );
  const intervalMs = Math.max(
    800,
    Math.floor(Number(options.intervalMs || 3000)),
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) await delay(intervalMs);
    const response = await fetch(statusUrl, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        getWorkflowErrorMessage(
          payload,
          "图片任务轮询失败: HTTP " + response.status,
        ),
      );
    }

    const images = collectQuickEditTaskImages(payload);
    if (images.length > 0) {
      return images[0];
    }

    const status = resolveTaskStatus(payload);
    const message = String(
      payload?.data?.task_status_msg ||
        payload?.message ||
        payload?.data?.message ||
        "",
    ).trim();
    if (message) options.onProgress?.(message);
    if (isFailedTaskStatus(status)) {
      throw new Error(
        message || getWorkflowErrorMessage(payload, "图片生成任务失败"),
      );
    }
  }

  throw new Error("图片任务轮询超时");
}
