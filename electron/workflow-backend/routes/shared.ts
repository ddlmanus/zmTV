import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkflowBackendContext } from "../context";

export function text(value: unknown, maxLength = 10_000) {
  return String(value || "").trim().slice(0, maxLength);
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function now() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return prefix + "_" + randomUUID();
}

export function mediaTypeFromName(value: string) {
  const ext = path.extname(value).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(ext))
    return "image";
  if ([".mp4", ".mov", ".m4v", ".webm", ".mkv"].includes(ext))
    return "video";
  if ([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"].includes(ext))
    return "audio";
  if ([".glb", ".gltf", ".obj", ".fbx", ".usdz", ".splat"].includes(ext))
    return "3d";
  return "file";
}

export function contentTypeFromName(value: string) {
  const ext = path.extname(value).toLowerCase();
  const known: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".json": "application/json",
  };
  return known[ext] || "application/octet-stream";
}

export function workflowFileUrl(id: string) {
  return "zaomeng-workflow://local/api/workflow-backend/files/" +
    encodeURIComponent(id);
}

export type StoredWorkflowFile = {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type StoredWorkflowFiles = { items: StoredWorkflowFile[] };

export function fileStore(context: WorkflowBackendContext) {
  return context.store.read<StoredWorkflowFiles>("files", { items: [] });
}

export function saveWorkflowBuffer(
  context: WorkflowBackendContext,
  input: { buffer: Buffer; name: string; mimeType?: string },
) {
  const id = newId("file");
  const safeName =
    path.basename(text(input.name, 180)).replace(/[^a-zA-Z0-9._-]+/g, "_") ||
    id + ".bin";
  const directory = path.join(context.runtimeRoot, "files");
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, id + "_" + safeName);
  fs.writeFileSync(target, input.buffer);
  const item: StoredWorkflowFile = {
    id,
    path: target,
    name: safeName,
    mimeType: input.mimeType || contentTypeFromName(safeName),
    size: input.buffer.length,
    createdAt: now(),
  };
  const store = fileStore(context);
  store.items.unshift(item);
  context.store.write("files", store);
  return { ...item, url: workflowFileUrl(id) };
}

export function unwrapWorkflowProxyUrl(value: unknown) {
  const raw = text(value, 20_000);
  if (!raw) return "";
  try {
    const url = new URL(raw, "http://workflow.local");
    if (
      ["/api/image-proxy", "/api/image-proxy/proxy", "/api/video-proxy"].includes(
        url.pathname,
      )
    ) {
      return text(url.searchParams.get("url"), 20_000) || raw;
    }
  } catch {
    return raw;
  }
  return raw;
}
