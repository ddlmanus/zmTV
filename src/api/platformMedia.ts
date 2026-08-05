import { workflowFetch } from "@/workflow/backend/client";

const PLATFORM_API_BASE_URL = "https://api.zaomeng.art/v1";
const API_KEYS_STORAGE_KEY = "wavespeed_api_keys_v2";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
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
  "model/gltf-binary": "glb",
  "model/gltf+json": "gltf",
  "application/octet-stream": "bin",
};

export type PlatformMediaFile = {
  id: number;
  object?: string;
  filename: string;
  bytes: number;
  mime_type: string;
  asset_type: "image" | "video" | "audio" | string;
  url: string;
  validation_status?: string;
  validation_progress?: number;
  asset_id?: string;
  asset_url?: string;
  role_url?: string;
  error?: string;
  created_at?: number;
  updated_at?: number;
};

type PlatformMediaOptions = {
  filename?: string;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

const persistedMedia = new Map<string, Promise<PlatformMediaFile>>();

function usesDesktopPlatformProxy() {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}

function browserPlatformApiKey() {
  if (typeof localStorage === "undefined") return "";
  try {
    const keys = JSON.parse(
      localStorage.getItem(API_KEYS_STORAGE_KEY) || "{}",
    ) as Record<string, unknown>;
    return String(keys["zaomeng-api"] || "").trim();
  } catch {
    return "";
  }
}

function extractPlatformError(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as Record<string, unknown>;
  for (const candidate of [
    value.error,
    value.message,
    value.detail,
    value.msg,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === "object") {
      const nested: string = extractPlatformError(candidate, "");
      if (nested) return nested;
    }
  }
  return fallback;
}

function normalizedMimeType(value: string) {
  return value.split(";", 1)[0].trim().toLowerCase();
}

function normalizeUploadFile(file: File) {
  const mimeType = normalizedMimeType(file.type || "");
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension || extension === "bin") return file;

  const originalName = String(file.name || "").trim() || "desktop-upload";
  const currentExtension = originalName.match(/\.([a-z0-9]{1,10})$/i)?.[1];
  const accepted =
    extension === "jpg" ? new Set(["jpg", "jpeg"]) : new Set([extension]);
  if (currentExtension && accepted.has(currentExtension.toLowerCase())) {
    return file;
  }

  const stem = originalName.replace(/\.[a-z0-9]{1,10}$/i, "").trim();
  return new File([file], `${stem || "desktop-upload"}.${extension}`, {
    type: mimeType,
    lastModified: file.lastModified || Date.now(),
  });
}

async function platformFetch(
  proxyPath: string,
  platformPath: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (!usesDesktopPlatformProxy()) {
    const apiKey = browserPlatformApiKey();
    if (!apiKey) throw new Error("请先在设置中配置造梦 API 开放平台密钥");
    headers.set("Authorization", "Bearer " + apiKey);
  }

  const response = await workflowFetch(
    usesDesktopPlatformProxy()
      ? proxyPath
      : PLATFORM_API_BASE_URL + platformPath,
    { ...init, headers },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      extractPlatformError(
        payload,
        "造梦 API 开放平台请求失败: HTTP " + response.status,
      ),
    );
  }
  return payload;
}

function validatePlatformFile(payload: unknown): PlatformMediaFile {
  const file = payload as PlatformMediaFile;
  if (!file?.id || !String(file.url || "").trim()) {
    throw new Error("造梦 API 开放平台没有返回文件 ID 或公网地址");
  }
  return file;
}

export function isPlatformMediaReference(value: unknown) {
  const url = String(value || "").trim();
  return /^(?:https?:|data:|blob:|local-asset:|zaomeng-workflow:)/i.test(url);
}

export async function uploadPlatformMediaFile(
  file: File,
  options: PlatformMediaOptions = {},
) {
  if (options.signal?.aborted) {
    throw new DOMException("Cancelled", "AbortError");
  }
  options.onProgress?.(0.05);
  const normalizedFile = normalizeUploadFile(file);
  const form = new FormData();
  form.append("file", normalizedFile, normalizedFile.name);
  const uploaded = validatePlatformFile(
    await platformFetch("/api/platform/files", "/files", {
      method: "POST",
      body: form,
      signal: options.signal,
    }),
  );
  options.onProgress?.(1);
  const resolved = Promise.resolve(uploaded);
  persistedMedia.set(uploaded.url, resolved);
  return uploaded;
}

function filenameFromUrl(url: string, fallback = "generated-media") {
  try {
    const candidate = decodeURIComponent(
      new URL(url).pathname.split("/").filter(Boolean).pop() || "",
    ).trim();
    return candidate || fallback;
  } catch {
    return fallback;
  }
}

export async function importPlatformMediaUrl(
  sourceUrl: string,
  options: PlatformMediaOptions = {},
) {
  const url = String(sourceUrl || "").trim();
  if (!url) throw new Error("素材地址为空");
  if (usesDesktopPlatformProxy() && /^https?:\/\//i.test(url)) {
    return validatePlatformFile(
      await platformFetch("/api/platform/files/import", "/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          filename: options.filename || filenameFromUrl(url),
        }),
        signal: options.signal,
      }),
    );
  }

  const response = await workflowFetch(url, {
    signal: options.signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("读取待上传素材失败: HTTP " + response.status);
  }
  const blob = await response.blob();
  return uploadPlatformMediaFile(
    new File(
      [blob],
      options.filename || filenameFromUrl(url, "generated-media"),
      { type: blob.type || "application/octet-stream" },
    ),
    options,
  );
}

export function persistPlatformMediaUrl(
  sourceUrl: string,
  options: PlatformMediaOptions = {},
) {
  const url = String(sourceUrl || "").trim();
  if (!isPlatformMediaReference(url)) {
    return Promise.reject(new Error("生成结果不是可上传的媒体地址"));
  }
  const existing = persistedMedia.get(url);
  if (existing) return existing;

  const pending = importPlatformMediaUrl(url, options)
    .then((file) => {
      const resolved = Promise.resolve(file);
      persistedMedia.set(url, resolved);
      persistedMedia.set(file.url, resolved);
      return file;
    })
    .catch((error) => {
      persistedMedia.delete(url);
      throw error;
    });
  persistedMedia.set(url, pending);
  return pending;
}

export async function persistPlatformMediaUrls(
  urls: string[],
  options: Omit<PlatformMediaOptions, "filename"> & {
    filename?: (url: string, index: number) => string | undefined;
  } = {},
) {
  return Promise.all(
    urls.map((url, index) =>
      persistPlatformMediaUrl(url, {
        signal: options.signal,
        onProgress: options.onProgress,
        filename: options.filename?.(url, index),
      }),
    ),
  );
}
