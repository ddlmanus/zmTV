import axios, {
  AxiosError,
  AxiosHeaders,
  CanceledError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import type {
  ApiProxyBody,
  ApiProxyMultipartPart,
  ApiProxyRequest,
} from "@/types/apiProxy";
import {
  API_PROXY_CANCELLED_ERROR_CODE,
  API_PROXY_TIMEOUT_ERROR_CODE,
} from "@/types/apiProxy";

const fallbackAdapter = axios.getAdapter(axios.defaults.adapter);

function electronProxyBridge() {
  if (typeof window === "undefined") return undefined;
  const bridge = window.electronAPI;
  return bridge?.apiProxyRequest ? bridge : undefined;
}

function requestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `api-proxy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requestHeaders(config: InternalAxiosRequestConfig) {
  const result: Record<string, string> = {};
  const headers = AxiosHeaders.from(config.headers).toJSON();
  for (const [name, value] of Object.entries(headers)) {
    if (value === null || value === undefined) continue;
    result[name] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return result;
}

function removeContentType(headers: Record<string, string>) {
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() === "content-type") delete headers[name];
  }
}

function bytesFromView(value: ArrayBufferView) {
  return new Uint8Array(
    value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
  );
}

async function multipartBody(data: FormData) {
  const parts: ApiProxyMultipartPart[] = [];
  for (const [name, value] of data.entries()) {
    if (typeof value === "string") {
      parts.push({ name, value });
      continue;
    }
    parts.push({
      name,
      value: new Uint8Array(await value.arrayBuffer()),
      fileName: value.name || "blob",
      contentType: value.type || "application/octet-stream",
    });
  }
  return { kind: "multipart", parts } as const;
}

async function requestBody(
  data: unknown,
  headers: Record<string, string>,
): Promise<ApiProxyBody | undefined> {
  if (data === undefined || data === null) return undefined;
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    removeContentType(headers);
    return multipartBody(data);
  }
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    if (
      data.type &&
      !Object.keys(headers).some(
        (name) => name.toLowerCase() === "content-type",
      )
    ) {
      headers["Content-Type"] = data.type;
    }
    return {
      kind: "bytes",
      value: new Uint8Array(await data.arrayBuffer()),
    };
  }
  if (data instanceof ArrayBuffer) {
    return { kind: "bytes", value: new Uint8Array(data) };
  }
  if (ArrayBuffer.isView(data)) {
    return { kind: "bytes", value: bytesFromView(data) };
  }
  if (data instanceof URLSearchParams) {
    return { kind: "text", value: data.toString() };
  }
  if (typeof data === "string") return { kind: "text", value: data };
  return { kind: "text", value: JSON.stringify(data) };
}

function responseData(
  value: Uint8Array,
  responseType: InternalAxiosRequestConfig["responseType"],
  contentType: string,
) {
  const bytes = Uint8Array.from(value);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  if (responseType === "arraybuffer") return buffer;
  if (responseType === "blob") {
    return new Blob([buffer], {
      type: contentType || "application/octet-stream",
    });
  }
  return new TextDecoder().decode(bytes);
}

function failedStatusCode(status: number) {
  return status >= 500
    ? AxiosError.ERR_BAD_RESPONSE
    : AxiosError.ERR_BAD_REQUEST;
}

export function createElectronProxyAdapter(
  shouldProxy: () => boolean,
): AxiosAdapter {
  return async (config) => {
    const bridge = electronProxyBridge();
    if (!bridge || !shouldProxy()) return fallbackAdapter(config);

    if (config.signal?.aborted) throw new CanceledError();
    const id = requestId();
    const headers = requestHeaders(config);
    const payload: ApiProxyRequest = {
      requestId: id,
      url: axios.getUri(config),
      method: String(config.method || "GET").toUpperCase(),
      headers,
      body: await requestBody(config.data, headers),
      timeoutMs: Number(config.timeout) || undefined,
    };
    const request = { requestId: id, proxied: true };
    const cancel = () => bridge.cancelApiProxyRequest?.(id);
    config.signal?.addEventListener?.("abort", cancel, { once: true });

    try {
      const proxied = await bridge.apiProxyRequest!(payload);
      if (config.signal?.aborted) throw new CanceledError();
      const response: AxiosResponse = {
        data: responseData(
          proxied.data,
          config.responseType,
          proxied.headers["content-type"] || "",
        ),
        status: proxied.status,
        statusText: proxied.statusText,
        headers: AxiosHeaders.from(proxied.headers),
        config,
        request,
      };
      if (!config.validateStatus || config.validateStatus(response.status)) {
        return response;
      }
      throw new AxiosError(
        `Request failed with status code ${response.status}`,
        failedStatusCode(response.status),
        config,
        response.request,
        response,
      );
    } catch (error) {
      if (error instanceof CanceledError || axios.isAxiosError(error))
        throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (
        config.signal?.aborted ||
        message.includes(API_PROXY_CANCELLED_ERROR_CODE)
      ) {
        throw new CanceledError();
      }
      if (message.includes(API_PROXY_TIMEOUT_ERROR_CODE)) {
        throw new AxiosError(
          `timeout of ${Number(config.timeout) || 0}ms exceeded`,
          AxiosError.ECONNABORTED,
          config,
          request,
        );
      }
      throw new AxiosError(message, AxiosError.ERR_NETWORK, config, request);
    } finally {
      config.signal?.removeEventListener?.("abort", cancel);
    }
  };
}
