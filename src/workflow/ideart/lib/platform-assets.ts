import { getStoredApiKeyForService } from "@/stores/apiKeyStore";
import {
  importPlatformMediaUrl,
  uploadPlatformMediaFile,
  type PlatformMediaFile,
} from "@/api/platformMedia";
import {
  normalizeWorkflowCharacterImageClassification,
  WORKFLOW_CHARACTER_IMAGE_CLASSIFICATION_PROMPT,
} from "./character-image-classification";
import { getWorkflowErrorMessage } from "./error-message";

const PLATFORM_API_BASE_URL = "https://api.zaomeng.art/v1";

export type PlatformAssetFile = PlatformMediaFile;

export type PlatformCharacterClassification = {
  file_id: number;
  file_url: string;
  is_character_asset: boolean;
  score: number;
  category: string;
  reason: string;
  model?: string;
};

export type PlatformSeedanceValidation = {
  file_id: number;
  object?: string;
  status: "unverified" | "processing" | "completed" | "failed" | string;
  progress: number;
  file_url: string;
  asset_id?: string;
  asset_url?: string;
  role_url?: string;
  error?: string;
  created_at?: number;
  updated_at?: number;
};

function usesDesktopPlatformProxy() {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}

async function platformHeaders(init?: HeadersInit) {
  const headers = new Headers(init);
  headers.set("Accept", "application/json");
  if (!usesDesktopPlatformProxy()) {
    const apiKey = String(
      (await getStoredApiKeyForService("zaomeng-api")) || "",
    ).trim();
    if (!apiKey) throw new Error("请先在设置中配置造梦 API 开放平台密钥");
    headers.set("Authorization", "Bearer " + apiKey);
  }
  return headers;
}

async function platformFetch(
  proxyPath: string,
  platformPath: string,
  init: RequestInit = {},
) {
  const headers = await platformHeaders(init.headers);
  const response = await fetch(
    usesDesktopPlatformProxy()
      ? proxyPath
      : PLATFORM_API_BASE_URL + platformPath,
    { ...init, headers },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      getWorkflowErrorMessage(
        payload,
        "造梦 API 开放平台请求失败: HTTP " + response.status,
      ),
    );
  }
  return payload;
}

export async function uploadPlatformAssetFile(
  file: File,
  options?: { onProgress?: (progress: number) => void },
) {
  return uploadPlatformMediaFile(file, options);
}

export async function listPlatformAssetFiles(params?: {
  page?: number;
  pageSize?: number;
  assetType?: string;
  validationStatus?: string;
}) {
  const query = new URLSearchParams({
    page: String(params?.page || 1),
    page_size: String(params?.pageSize || 100),
  });
  if (params?.assetType) query.set("asset_type", params.assetType);
  if (params?.validationStatus)
    query.set("validation_status", params.validationStatus);
  const payload = await platformFetch(
    "/api/platform/files?" + query.toString(),
    "/files?" + query.toString(),
  );
  return {
    items: Array.isArray(payload?.data)
      ? (payload.data as PlatformAssetFile[])
      : [],
    total: Number(payload?.total || 0),
  };
}

export async function importPlatformAssetFromUrl(
  url: string,
  filename?: string,
) {
  return importPlatformMediaUrl(url, { filename });
}

function parseJsonObject(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function classifyPlatformCharacterAsset(fileId: number | string) {
  if (usesDesktopPlatformProxy()) {
    return (await platformFetch(
      "/api/platform/files/" +
        encodeURIComponent(String(fileId)) +
        "/classify-character",
      "/files/" + encodeURIComponent(String(fileId)),
      { method: "POST" },
    )) as PlatformCharacterClassification;
  }
  const file = (await platformFetch(
    "",
    "/files/" + encodeURIComponent(String(fileId)),
  )) as PlatformAssetFile;
  const payload = await platformFetch("", "/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5.6-sol",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: WORKFLOW_CHARACTER_IMAGE_CLASSIFICATION_PROMPT,
            },
            { type: "image_url", image_url: { url: file.url } },
          ],
        },
      ],
      max_tokens: 400,
      temperature: 0,
      top_p: 1,
    }),
  });
  const content = String(payload?.choices?.[0]?.message?.content || "");
  const parsed = parseJsonObject(content);
  if (!parsed) throw new Error("人物角色识别模型未返回有效 JSON");
  const classification = normalizeWorkflowCharacterImageClassification(parsed);
  return {
    file_id: Number(file.id),
    file_url: file.url,
    is_character_asset: classification.isCharacterAsset,
    score: classification.score,
    category: classification.category,
    reason: classification.reason,
    model: "openai/gpt-5.6-sol",
  } satisfies PlatformCharacterClassification;
}

export async function startPlatformSeedanceValidation(fileId: number | string) {
  const id = encodeURIComponent(String(fileId));
  return (await platformFetch(
    "/api/platform/files/" + id + "/seedance-validation",
    "/files/" + id + "/seedance-validation",
    { method: "POST" },
  )) as PlatformSeedanceValidation;
}

export async function getPlatformSeedanceValidation(fileId: number | string) {
  const id = encodeURIComponent(String(fileId));
  return (await platformFetch(
    "/api/platform/files/" + id + "/seedance-validation",
    "/files/" + id + "/seedance-validation",
    { cache: "no-store" },
  )) as PlatformSeedanceValidation;
}

export async function waitForPlatformSeedanceValidation(
  fileId: number | string,
  options?: { attempts?: number; intervalMs?: number },
) {
  let current = await startPlatformSeedanceValidation(fileId);
  const attempts = Math.max(1, options?.attempts || 48);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = String(current.status || "").toLowerCase();
    if (status === "completed" && (current.role_url || current.asset_url)) {
      return current;
    }
    if (status === "failed") {
      throw new Error(
        getWorkflowErrorMessage(
          current.error,
          "Seedance2.0 虚拟素材校验未通过",
        ),
      );
    }
    await new Promise((resolve) =>
      window.setTimeout(resolve, options?.intervalMs || 2500),
    );
    current = await getPlatformSeedanceValidation(fileId);
  }
  throw new Error("Seedance2.0 虚拟素材还在处理中，请稍后重试");
}
