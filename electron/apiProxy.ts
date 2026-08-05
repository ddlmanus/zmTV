import { ipcMain, net } from "electron";
import {
  API_PROXY_CANCELLED_ERROR_CODE,
  API_PROXY_TIMEOUT_ERROR_CODE,
  type ApiProxyBody,
  type ApiProxyRequest,
  type ApiProxyResponse,
} from "../src/types/apiProxy";

const activeRequests = new Map<string, AbortController>();
const BLOCKED_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "origin",
  "referer",
]);

function normalizeRequestUrl(value: string) {
  const url = new URL(String(value || "").trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("API proxy only supports HTTP(S) URLs without credentials");
  }
  return url.toString();
}

function normalizeRequestHeaders(headers?: Record<string, string>) {
  const normalized = new Headers();
  for (const [name, value] of Object.entries(headers || {})) {
    if (!value || BLOCKED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    normalized.set(name, value);
  }
  return normalized;
}

function byteBody(value: Uint8Array) {
  return Uint8Array.from(value).buffer;
}

function requestBody(body: ApiProxyBody | undefined, headers: Headers) {
  if (!body) return undefined;
  if (body.kind === "text") return body.value;
  if (body.kind === "bytes") return byteBody(body.value);

  headers.delete("content-type");
  const formData = new FormData();
  for (const part of body.parts) {
    if (typeof part.value === "string") {
      formData.append(part.name, part.value);
      continue;
    }
    const blob = new Blob([byteBody(part.value)], {
      type: part.contentType || "application/octet-stream",
    });
    formData.append(part.name, blob, part.fileName || "blob");
  }
  return formData;
}

function responseHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  headers.forEach((value, name) => {
    result[name] = value;
  });
  return result;
}

async function executeApiProxyRequest(
  request: ApiProxyRequest,
): Promise<ApiProxyResponse> {
  const requestId = String(request?.requestId || "").trim();
  if (!requestId) throw new Error("API proxy request ID is required");
  if (activeRequests.has(requestId)) {
    throw new Error("Duplicate API proxy request ID");
  }

  const controller = new AbortController();
  activeRequests.set(requestId, controller);
  const timeoutMs = Number(request.timeoutMs);
  let timedOut = false;
  const timeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : undefined;

  try {
    const headers = normalizeRequestHeaders(request.headers);
    const body = requestBody(request.body, headers);
    const method = String(request.method || "GET")
      .trim()
      .toUpperCase();
    const response = await net.fetch(normalizeRequestUrl(request.url), {
      method,
      headers,
      signal: controller.signal,
      redirect: "follow",
      ...(!["GET", "HEAD"].includes(method) && body !== undefined
        ? { body }
        : {}),
    });
    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders(response.headers),
      data: new Uint8Array(await response.arrayBuffer()),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new Error(
          `${API_PROXY_TIMEOUT_ERROR_CODE}: request exceeded ${timeoutMs} ms`,
        );
      }
      throw new Error(`${API_PROXY_CANCELLED_ERROR_CODE}: request cancelled`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    activeRequests.delete(requestId);
  }
}

export function registerApiProxyHandlers() {
  ipcMain.removeHandler("api-proxy:request");
  ipcMain.removeAllListeners("api-proxy:cancel");

  ipcMain.handle("api-proxy:request", (_event, request: ApiProxyRequest) =>
    executeApiProxyRequest(request),
  );
  ipcMain.on("api-proxy:cancel", (_event, requestId: string) => {
    activeRequests.get(String(requestId || ""))?.abort();
  });
}
