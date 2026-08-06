import axios, { type AxiosInstance } from "axios";
import type { PredictionResult } from "@/types/prediction";
import { getOneApiCatalogState } from "./registry";
import type { OneApiExecutionRoute } from "./types";

const DEFAULT_ONE_API_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

const VIDEO_TASK_PREFIX = "oneapi-video:";
const VIDEO_TASK_ROUTE_SEPARATOR = "::";
let syntheticId = 0;

interface PredictionEnvelope {
  code?: number;
  success?: boolean;
  message?: string;
  error?: string | { message?: string };
  data?: PredictionResult;
}

function providerError(message: unknown, fallback: string) {
  if (message && typeof message === "object") {
    return new Error(
      String((message as { message?: unknown }).message || fallback),
    );
  }
  return new Error(String(message || fallback));
}

function normalizeStatus(value: unknown): PredictionResult["status"] {
  const status = String(value || "")
    .trim()
    .toLowerCase();
  if (
    ["completed", "complete", "succeeded", "success", "done"].includes(status)
  ) {
    return "completed";
  }
  if (
    ["failed", "fail", "failure", "error", "cancelled", "canceled"].includes(
      status,
    )
  ) {
    return "failed";
  }
  if (["pending", "queued", "submitted", "waiting"].includes(status)) {
    return "pending";
  }
  if (["created", "create"].includes(status)) return "created";
  return "processing";
}

function nextSyntheticId(kind: string) {
  syntheticId += 1;
  return `oneapi-${kind}-${Date.now()}-${syntheticId}`;
}

function readEnhancedPrediction(
  envelope: PredictionEnvelope,
  fallback: string,
): PredictionResult {
  if (
    (envelope.code !== undefined && envelope.code !== 200) ||
    !envelope.data
  ) {
    throw providerError(envelope.message || envelope.error, fallback);
  }
  return {
    ...envelope.data,
    status: normalizeStatus(envelope.data.status),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function unwrapOneApiData(value: unknown): unknown {
  const record = asRecord(value);
  if (!record || record.data === undefined) return value;
  return record.data;
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  const data = unwrapOneApiData(value);
  if (Array.isArray(data)) {
    for (const item of data) {
      const record = asRecord(item);
      if (record) return record;
    }
    return null;
  }
  return asRecord(data);
}

function stringFromRecord(
  record: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function extractTaskId(value: unknown): string {
  const topLevel = asRecord(value);
  const topLevelId = stringFromRecord(topLevel, ["id", "task_id", "taskId"]);
  if (topLevelId) return topLevelId;

  const record = firstRecord(value);
  return stringFromRecord(record, ["id", "task_id", "taskId"]);
}

function extractStatus(value: unknown): unknown {
  return (
    asRecord(value)?.status ??
    firstRecord(value)?.status ??
    asRecord(firstRecord(value)?.data)?.status
  );
}

function extractError(value: unknown): unknown {
  return asRecord(value)?.error ?? firstRecord(value)?.error;
}

function toDataUrl(base64: string, mimeType: string) {
  const value = base64.trim();
  return value.startsWith("data:") ? value : `data:${mimeType};base64,${value}`;
}

function collectMediaOutputs(value: unknown, outputs: string[], depth = 0) {
  if (depth > 7 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectMediaOutputs(item, outputs, depth + 1);
    return;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (/^(?:https?:|data:|blob:|\/)/i.test(text) && !outputs.includes(text)) {
      outputs.push(text);
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;

  const directKeys = [
    "url",
    "image_url",
    "video_url",
    "audio_url",
    "file_url",
    "download_url",
    "output_url",
  ];
  for (const key of directKeys) {
    collectMediaOutputs(record[key], outputs, depth + 1);
  }
  const base64 = record.b64_json || record.base64 || record.image_base64;
  if (typeof base64 === "string" && base64.trim()) {
    const dataUrl = toDataUrl(base64, "image/png");
    if (!outputs.includes(dataUrl)) outputs.push(dataUrl);
  }
  for (const [key, nested] of Object.entries(record)) {
    if (
      directKeys.includes(key) ||
      ["b64_json", "base64", "image_base64"].includes(key)
    ) {
      continue;
    }
    if (nested && typeof nested === "object") {
      collectMediaOutputs(nested, outputs, depth + 1);
    }
  }
}

function textOutput(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  for (const choice of choices) {
    const choiceRecord = asRecord(choice);
    const message = asRecord(choiceRecord?.message);
    const content = message?.content ?? choiceRecord?.text;
    if (typeof content === "string" && content.trim()) return content;
    if (Array.isArray(content)) {
      const text = content
        .map((part) => asRecord(part)?.text)
        .filter((part): part is string => typeof part === "string")
        .join("\n")
        .trim();
      if (text) return text;
    }
  }
  const output = Array.isArray(payload.output) ? payload.output : [];
  const text = output
    .flatMap((item) => {
      const content = asRecord(item)?.content;
      return Array.isArray(content) ? content : [];
    })
    .map((part) => asRecord(part)?.text)
    .filter((part): part is string => typeof part === "string")
    .join("\n")
    .trim();
  return text || JSON.stringify(payload);
}

function isUnsupportedRouteError(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  return [404, 405, 501].includes(Number(error.response?.status));
}

function routeForModel(baseUrl: string, model: string) {
  return getOneApiCatalogState(baseUrl)?.routes.get(model);
}

function dataUrlFile(value: string, field: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) return null;
  const mimeType = match[1] || "application/octet-stream";
  const bytes = match[2]
    ? Uint8Array.from(atob(match[3]), (character) => character.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(match[3]));
  const extension =
    mimeType.split("/")[1]?.replace(/[^a-z0-9]+/gi, "") || "bin";
  return new File([bytes], field + "." + extension, { type: mimeType });
}

async function formDataPayload(model: string, input: Record<string, unknown>) {
  const body = new FormData();
  body.append("model", model);
  const normalized = { ...input };
  if (normalized.seconds === undefined && normalized.duration !== undefined) {
    normalized.seconds = normalized.duration;
    delete normalized.duration;
  }
  if (
    normalized.input_reference === undefined &&
    normalized.image !== undefined
  ) {
    normalized.input_reference = normalized.image;
    delete normalized.image;
  }
  for (const [key, value] of Object.entries(normalized)) {
    if (value === undefined || value === null || value === "") continue;
    if (value instanceof Blob) {
      body.append(key, value);
    } else if (typeof value === "string" && value.startsWith("data:")) {
      const file = dataUrlFile(value, key);
      if (file) body.append(key, file, file.name);
      else body.append(key, value);
    } else if (typeof value === "object") {
      body.append(key, JSON.stringify(value));
    } else {
      body.append(key, String(value));
    }
  }
  return body;
}

function arrayBufferToDataUrl(data: ArrayBuffer, mimeType: string) {
  const bytes = new Uint8Array(data);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function runStandardImage(
  client: AxiosInstance,
  route: OneApiExecutionRoute,
  model: string,
  input: Record<string, unknown>,
  options?: { timeout?: number; signal?: AbortSignal },
) {
  const response = await client.post<Record<string, unknown>>(
    route.submitPath,
    { model, ...input },
    { timeout: options?.timeout, signal: options?.signal },
  );
  const outputs: string[] = [];
  collectMediaOutputs(
    response.data.data ?? response.data.output ?? response.data,
    outputs,
  );
  if (outputs.length === 0) {
    throw providerError(
      response.data.error,
      "One API 图片接口没有返回可展示结果",
    );
  }
  return {
    id: String(response.data.id || nextSyntheticId("image")),
    model,
    status: "completed" as const,
    outputs,
  };
}

async function runStandardAudio(
  client: AxiosInstance,
  route: OneApiExecutionRoute,
  model: string,
  input: Record<string, unknown>,
  options?: { timeout?: number; signal?: AbortSignal },
) {
  const payload: Record<string, unknown> = { model, ...input };
  if (payload.input === undefined && typeof payload.prompt === "string") {
    payload.input = payload.prompt;
    delete payload.prompt;
  }
  const response = await client.post<ArrayBuffer>(route.submitPath, payload, {
    timeout: options?.timeout,
    signal: options?.signal,
    responseType: "arraybuffer",
  });
  const mimeType = String(
    response.headers["content-type"] || "audio/mpeg",
  ).split(";")[0];
  return {
    id: nextSyntheticId("audio"),
    model,
    status: "completed" as const,
    outputs: [arrayBufferToDataUrl(response.data, mimeType)],
  };
}

async function runStandardText(
  client: AxiosInstance,
  route: OneApiExecutionRoute,
  model: string,
  input: Record<string, unknown>,
  options?: { timeout?: number; signal?: AbortSignal },
) {
  let payload: Record<string, unknown>;
  if (route.kind === "responses") {
    payload = { model, ...input };
    if (payload.input === undefined && payload.prompt !== undefined) {
      payload.input = payload.prompt;
      delete payload.prompt;
    }
  } else {
    const { prompt, system, messages, ...rest } = input;
    payload = {
      model,
      ...rest,
      messages: Array.isArray(messages)
        ? messages
        : [
            ...(typeof system === "string" && system.trim()
              ? [{ role: "system", content: system }]
              : []),
            { role: "user", content: String(prompt ?? input.input ?? "") },
          ],
    };
  }
  const response = await client.post<Record<string, unknown>>(
    route.submitPath,
    payload,
    { timeout: options?.timeout, signal: options?.signal },
  );
  return {
    id: String(response.data.id || nextSyntheticId("text")),
    model,
    status: "completed" as const,
    outputs: [textOutput(response.data)],
  };
}

async function runStandardVideo(
  client: AxiosInstance,
  route: OneApiExecutionRoute,
  model: string,
  input: Record<string, unknown>,
  options?: { timeout?: number; signal?: AbortSignal },
) {
  const useJsonPayload =
    route.payloadFormat === "json" ||
    route.submitPath.replace(/\/+$/, "").endsWith("/generations");
  const payload = useJsonPayload
    ? { model, ...input }
    : await formDataPayload(model, input);
  const response = await client.post<Record<string, unknown>>(
    route.submitPath,
    payload,
    {
      timeout: options?.timeout,
      signal: options?.signal,
      ...(useJsonPayload
        ? {}
        : { headers: { "Content-Type": "multipart/form-data" } }),
    },
  );
  const rawId = extractTaskId(response.data);
  if (!rawId)
    throw providerError(response.data.error, "One API 视频接口没有返回任务 ID");
  const outputs: string[] = [];
  collectMediaOutputs(response.data, outputs);
  return {
    id: `${VIDEO_TASK_PREFIX}${encodeURIComponent(rawId)}${VIDEO_TASK_ROUTE_SEPARATOR}${encodeURIComponent(route.statusPath || "/v1/videos/{task_id}")}`,
    model,
    status: normalizeStatus(extractStatus(response.data) || "queued"),
    ...(outputs.length > 0 && { outputs }),
  };
}

async function runStandardPrediction(
  client: AxiosInstance,
  route: OneApiExecutionRoute,
  model: string,
  input: Record<string, unknown>,
  options?: { timeout?: number; signal?: AbortSignal },
) {
  if (route.kind === "image")
    return runStandardImage(client, route, model, input, options);
  if (route.kind === "video")
    return runStandardVideo(client, route, model, input, options);
  if (route.kind === "audio")
    return runStandardAudio(client, route, model, input, options);
  return runStandardText(client, route, model, input, options);
}

export async function runOneApiPrediction(
  client: AxiosInstance,
  baseUrl: string,
  model: string,
  input: Record<string, unknown>,
  options?: { timeout?: number; signal?: AbortSignal },
): Promise<PredictionResult> {
  const route = routeForModel(baseUrl, model);
  const requestOptions = {
    ...options,
    timeout: options?.timeout ?? DEFAULT_ONE_API_GENERATION_TIMEOUT_MS,
  };
  if (route?.kind === "unsupported") {
    const endpoint = route.endpointType
      ? '"' +
        route.endpointType +
        '"' +
        (route.submitPath ? " (" + route.submitPath + ")" : "")
      : route.submitPath || "未知端点";
    throw new Error(
      "模型 " +
        model +
        " 使用 New API 自定义端点 " +
        endpoint +
        "。该服务未提供通用请求参数和任务查询协议，桌面端不会把它错误提交到聊天接口。",
    );
  }
  if (route && route.kind !== "predictions") {
    return runStandardPrediction(client, route, model, input, requestOptions);
  }

  try {
    const response = await client.post<PredictionEnvelope>(
      "/v1/predictions",
      { model, input },
      { timeout: requestOptions.timeout, signal: requestOptions.signal },
    );
    return readEnhancedPrediction(response.data, "One API 任务提交失败");
  } catch (error) {
    if (route?.kind === "predictions" || !isUnsupportedRouteError(error)) {
      throw error;
    }
    return runStandardText(
      client,
      { kind: "chat", submitPath: "/v1/chat/completions" },
      model,
      input,
      requestOptions,
    );
  }
}

function parseVideoTaskId(requestId: string) {
  if (!requestId.startsWith(VIDEO_TASK_PREFIX)) return null;
  const encoded = requestId.slice(VIDEO_TASK_PREFIX.length);
  const [rawId, statusPath] = encoded.split(VIDEO_TASK_ROUTE_SEPARATOR, 2);
  return {
    rawId: decodeURIComponent(rawId),
    statusPath: statusPath ? decodeURIComponent(statusPath) : "",
  };
}

async function getStandardVideoPrediction(
  client: AxiosInstance,
  requestId: string,
  rawId: string,
  statusPath?: string,
  options?: { signal?: AbortSignal },
): Promise<PredictionResult> {
  const path = (statusPath || "/v1/videos/{task_id}").replace(
    "{task_id}",
    encodeURIComponent(rawId),
  );
  const response = await client.get<Record<string, unknown>>(path, {
    signal: options?.signal,
  });
  const status = normalizeStatus(extractStatus(response.data));
  const outputs: string[] = [];
  collectMediaOutputs(response.data, outputs);
  if (status === "completed" && outputs.length === 0) {
    outputs.push(`/v1/videos/${encodeURIComponent(rawId)}/content`);
  }
  const error = extractError(response.data);
  return {
    id: requestId,
    model: stringFromRecord(firstRecord(response.data), ["model"]),
    status,
    ...(outputs.length > 0 && { outputs }),
    ...(error
      ? {
          error:
            typeof error === "string"
              ? error
              : String(asRecord(error)?.message || "视频生成失败"),
        }
      : {}),
  };
}

export async function getOneApiPrediction(
  client: AxiosInstance,
  requestId: string,
  options?: { signal?: AbortSignal },
): Promise<PredictionResult> {
  const videoTask = parseVideoTaskId(requestId);
  if (videoTask) {
    return getStandardVideoPrediction(
      client,
      requestId,
      videoTask.rawId,
      videoTask.statusPath,
      options,
    );
  }
  const response = await client.get<PredictionEnvelope>(
    `/v1/predictions/${encodeURIComponent(requestId)}`,
    { signal: options?.signal },
  );
  return readEnhancedPrediction(response.data, "One API 任务查询失败");
}
