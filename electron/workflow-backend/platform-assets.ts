import type { WorkflowBackendContext } from "./context";
import { list, record, text } from "./routes/shared";
import {
  normalizeWorkflowCharacterImageClassification,
  WORKFLOW_CHARACTER_IMAGE_CLASSIFICATION_PROMPT,
} from "../../src/workflow/ideart/lib/character-image-classification";
import { getWorkflowErrorMessage } from "../../src/workflow/ideart/lib/error-message";

const PLATFORM_UPLOAD_EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/x-m4v": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

function normalizePlatformUploadFilename(filename: string, mimeType: string) {
  const extension =
    PLATFORM_UPLOAD_EXTENSION_BY_MIME[
      String(mimeType || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase()
    ];
  const originalName = String(filename || "").trim() || "workflow-upload";
  if (!extension) return originalName;

  const currentExtension = originalName.match(/\.([a-z0-9]{1,10})$/i)?.[1];
  const acceptedExtensions =
    extension === "jpg" ? new Set(["jpg", "jpeg"]) : new Set([extension]);
  if (
    currentExtension &&
    acceptedExtensions.has(currentExtension.toLowerCase())
  ) {
    return originalName;
  }
  return `${originalName.replace(/\.[a-z0-9]{1,10}$/i, "").trim() || "workflow-upload"}.${extension}`;
}

function platformEndpoint(context: WorkflowBackendContext, pathname: string) {
  const provider = context.getPlatformProviderConfig();
  const baseUrl = String(provider.baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const apiKey = String(provider.apiKey || "").trim();
  if (!baseUrl || !apiKey) {
    throw new Error("请先在设置中配置造梦 API 开放平台密钥");
  }
  return { provider, url: baseUrl + pathname };
}

function platformError(payload: unknown, status: number) {
  return getWorkflowErrorMessage(
    payload,
    "造梦 API 开放平台请求失败: HTTP " + status,
  ).slice(0, 2_000);
}

export async function platformJson(
  context: WorkflowBackendContext,
  pathname: string,
  init: RequestInit = {},
) {
  const endpoint = platformEndpoint(context, pathname);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", "Bearer " + endpoint.provider.apiKey);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const response = await context.fetchRemote(endpoint.url, {
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      platformError(payload, response.status),
    ) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function uploadPlatformFile(
  context: WorkflowBackendContext,
  file: Blob,
  filename: string,
) {
  const form = new FormData();
  form.append(
    "file",
    file,
    normalizePlatformUploadFilename(filename, file.type),
  );
  return platformJson(context, "/files", { method: "POST", body: form });
}

export async function importPlatformFile(
  context: WorkflowBackendContext,
  sourceUrl: string,
  filename: string,
) {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("素材地址无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只支持导入 HTTP 或 HTTPS 素材");
  }
  const response = await context.fetchRemote(parsed.toString(), {
    headers: { Accept: "image/*,video/*,audio/*,*/*;q=0.5" },
  });
  if (!response.ok) {
    throw new Error("读取远程素材失败: HTTP " + response.status);
  }
  const blob = await response.blob();
  const fallbackName =
    parsed.pathname.split("/").filter(Boolean).pop() || "workflow-import";
  return uploadPlatformFile(context, blob, filename || fallbackName);
}

function chatText(payload: unknown) {
  const root = record(payload);
  const choice = record(list(root.choices)[0]);
  const message = record(choice.message);
  const content = message.content;
  if (typeof content === "string") return content.trim();
  return list(content)
    .map((item) => text(record(item).text || record(item).content, 20_000))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseJsonObject(value: string) {
  const cleaned = value
    .replace(/^\s*(?:json)?\s*/i, "")
    .replace(/\s*\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return record(JSON.parse(cleaned.slice(start, end + 1)));
  } catch {
    return null;
  }
}

export async function classifyPlatformCharacterFile(
  context: WorkflowBackendContext,
  fileId: string,
) {
  const file = record(
    await platformJson(context, "/files/" + encodeURIComponent(fileId)),
  );
  const imageUrl = text(file.url, 20_000);
  if (
    !imageUrl ||
    !String(file.mime_type || "")
      .toLowerCase()
      .startsWith("image/")
  ) {
    throw new Error("当前平台文件不是可识别的图片");
  }
  const provider = context.getPlatformProviderConfig();
  const model = String(provider.model || "").trim();
  if (!model) throw new Error("造梦 API 开放平台未配置多模态文本模型");
  const response = await platformJson(context, "/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: WORKFLOW_CHARACTER_IMAGE_CLASSIFICATION_PROMPT,
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0,
      top_p: 1,
    }),
  });
  const parsed = parseJsonObject(chatText(response));
  if (!parsed) throw new Error("人物角色识别模型未返回有效 JSON");
  const classification = normalizeWorkflowCharacterImageClassification(parsed);
  return {
    file_id: Number(file.id || fileId),
    file_url: imageUrl,
    is_character_asset: classification.isCharacterAsset,
    score: classification.score,
    category: classification.category,
    reason: classification.reason,
    model,
  };
}
