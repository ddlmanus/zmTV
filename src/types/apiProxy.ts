export const API_PROXY_TIMEOUT_ERROR_CODE = "API_PROXY_TIMEOUT";
export const API_PROXY_CANCELLED_ERROR_CODE = "API_PROXY_CANCELLED";

export type ApiProxyBody =
  | { kind: "text"; value: string }
  | { kind: "bytes"; value: Uint8Array }
  | { kind: "multipart"; parts: ApiProxyMultipartPart[] };

export interface ApiProxyMultipartPart {
  name: string;
  value: string | Uint8Array;
  fileName?: string;
  contentType?: string;
}

export interface ApiProxyRequest {
  requestId: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: ApiProxyBody;
  timeoutMs?: number;
}

export interface ApiProxyResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: Uint8Array;
}
