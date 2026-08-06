import axios, { AxiosInstance, AxiosError } from "axios";
import type { Model, ModelsResponse } from "@/types/model";
import type {
  PredictionResult,
  PredictionResponse,
  HistoryResponse,
} from "@/types/prediction";
import {
  isPlatformMediaReference,
  persistPlatformMediaUrl,
  uploadPlatformMediaFile,
} from "@/api/platformMedia";
import {
  calculateOneApiPricing,
  getOneApiBalance,
  getOneApiPrediction,
  listOneApiModels,
  runOneApiPrediction,
  validateOneApiCredential,
} from "@/api/providers/oneApi";
import { createElectronProxyAdapter } from "@/api/electronProxyAdapter";
import {
  recordGenerationHistoryFailure,
  recordGenerationHistoryFromPrediction,
} from "@/stores/generationHistoryStore";
import packageJson from "../../package.json";

export const IDEART_API_BASE_URL_STORAGE_KEY = "ideart_gateway_base_url";
export const IDEART_PRODUCTION_API_BASE_URL = "https://zaomeng.art";
export const OFFICIAL_WAVESPEED_API_BASE_URL = "https://api.wavespeed.ai";
export const ZAOMENG_OPEN_API_BASE_URL = "https://api.zaomeng.art";
export const DEFAULT_API_BASE_URL = ZAOMENG_OPEN_API_BASE_URL;
export type ApiServiceId =
  | "wavespeed"
  | "ideart-production"
  | "zaomeng-api"
  | "one-api";

export const API_SERVICE_PRESETS: Record<
  ApiServiceId,
  { id: ApiServiceId; name: string; baseUrl: string }
> = {
  wavespeed: {
    id: "wavespeed",
    name: "WaveSpeed 官方",
    baseUrl: OFFICIAL_WAVESPEED_API_BASE_URL,
  },
  "ideart-production": {
    id: "ideart-production",
    name: "zaomeng.art",
    baseUrl: IDEART_PRODUCTION_API_BASE_URL,
  },
  "zaomeng-api": {
    id: "zaomeng-api",
    name: "造梦 API 开放平台",
    baseUrl: ZAOMENG_OPEN_API_BASE_URL,
  },
  "one-api": {
    id: "one-api",
    name: "One API / New API",
    baseUrl: "",
  },
};

export function normalizeApiBaseUrl(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

export function normalizeOneApiBaseUrl(value: unknown) {
  const normalized = normalizeApiBaseUrl(value);
  if (!normalized) return "";
  const url = new URL(normalized);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("One API Base URL 只支持 http:// 或 https://");
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
  return normalizeApiBaseUrl(url.toString());
}

export function resolveApiServiceIdForBaseUrl(
  baseUrl: unknown,
): ApiServiceId | null {
  const normalized = normalizeApiBaseUrl(baseUrl);
  if (!normalized) return null;
  const preset = Object.values(API_SERVICE_PRESETS).find(
    (service) =>
      service.baseUrl && normalizeApiBaseUrl(service.baseUrl) === normalized,
  );
  if (preset) return preset.id;
  try {
    return normalizeOneApiBaseUrl(normalized) ? "one-api" : null;
  } catch {
    return null;
  }
}
const WEB_BASE_URL = "https://wavespeed.ai";
const WEB_CENTER_URL = `${WEB_BASE_URL}/center`;
const PRICE_SCALE = 1_000_000;
const ZAOMENG_MODEL_PRICE_MULTIPLIER = 7;

// Get app version from package.json
const version = packageJson.version;

// Detect operating system - works in Electron, browser, and Node.js
function getOperatingSystem(): string {
  // Try Node.js/Electron process.platform first (most reliable)
  if (typeof process !== "undefined" && process.platform) {
    return process.platform; // 'darwin', 'win32', 'linux', etc.
  }

  // Fall back to user agent parsing (browser environment)
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    const userAgent = navigator.userAgent.toLowerCase();

    if (userAgent.includes("mac os x") || userAgent.includes("macintosh")) {
      return "darwin";
    } else if (
      userAgent.includes("windows") ||
      userAgent.includes("win64") ||
      userAgent.includes("win32")
    ) {
      return "win32";
    } else if (userAgent.includes("android")) {
      return "android";
    } else if (
      userAgent.includes("iphone") ||
      userAgent.includes("ipad") ||
      userAgent.includes("ipod")
    ) {
      return "ios";
    } else if (userAgent.includes("cros")) {
      return "chromeos";
    } else if (userAgent.includes("linux")) {
      return "linux";
    } else if (userAgent.includes("freebsd")) {
      return "freebsd";
    }
  }

  return "unknown";
}

// Custom error class with detailed information
export class APIError extends Error {
  code?: number;
  status?: number;
  details?: unknown;

  constructor(
    message: string,
    options?: { code?: number; status?: number; details?: unknown },
  ) {
    super(message);
    this.name = "APIError";
    this.code = options?.code;
    this.status = options?.status;
    this.details = options?.details;
  }
}

export type ApiCredentialValidationErrorKind =
  | "credentials"
  | "connection"
  | "service";

export function classifyApiCredentialValidationError(
  error: unknown,
): ApiCredentialValidationErrorKind {
  const status =
    error instanceof APIError
      ? error.status
      : axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
  if (status === 401 || status === 403) return "credentials";
  if (status === undefined) return "connection";
  return "service";
}

// Extract detailed error message from various error formats
function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const response = error.response;
    const status = response?.status;
    const statusText = response?.statusText;

    // Handle timeout errors
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      return `Request timed out. The server may be experiencing high load.`;
    }

    // Handle network errors
    if (error.code === "ERR_NETWORK") {
      return `Network error: Unable to connect to the server. Please check your internet connection.`;
    }

    if (response?.data) {
      const data = response.data as Record<string, unknown>;
      // Try various error message formats
      if (typeof data.message === "string") {
        return `${status ? `[${status}] ` : ""}${data.message}`;
      }
      if (typeof data.error === "string") {
        return `${status ? `[${status}] ` : ""}${data.error}`;
      }
      if (
        data.error &&
        typeof data.error === "object" &&
        typeof (data.error as { message?: unknown }).message === "string"
      ) {
        return `${status ? `[${status}] ` : ""}${(data.error as { message: string }).message}`;
      }
      if (typeof data.detail === "string") {
        return `${status ? `[${status}] ` : ""}${data.detail}`;
      }
      if (Array.isArray(data.detail)) {
        const details = data.detail
          .map(
            (d: { msg?: string; message?: string }) =>
              d.msg || d.message || JSON.stringify(d),
          )
          .join("; ");
        return `${status ? `[${status}] ` : ""}${details}`;
      }
      if (data.errors && Array.isArray(data.errors)) {
        const errors = data.errors
          .map((e: { message?: string }) => e.message || JSON.stringify(e))
          .join("; ");
        return `${status ? `[${status}] ` : ""}${errors}`;
      }
      // Fallback to stringified response with status
      return `${status ? `[${status}${statusText ? " " + statusText : ""}] ` : ""}${JSON.stringify(data)}`;
    }

    // HTTP status without response body
    if (status) {
      return `HTTP ${status}${statusText ? ": " + statusText : ""}`;
    }

    if (error.message) return error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function createAPIError(error: unknown, fallbackMessage: string): APIError {
  const message = extractErrorMessage(error) || fallbackMessage;
  const axiosError = error instanceof AxiosError ? error : null;
  return new APIError(message, {
    code: axiosError?.response?.data?.code,
    status: axiosError?.response?.status,
    details: axiosError?.response?.data,
  });
}

export interface RunOptions {
  timeout?: number;
  pollInterval?: number;
  enableSyncMode?: boolean;
  signal?: AbortSignal;
  onSubmitted?: (prediction: PredictionResult) => void;
}

export type WaitForResultOptions = Pick<
  RunOptions,
  "timeout" | "pollInterval" | "signal"
>;

export interface HistoryFilters {
  model?: string;
  status?: "completed" | "failed" | "processing" | "created";
  created_after?: string;
  created_before?: string;
}

export interface PricingResult {
  price: number;
  discountedPrice: number;
  discountRate?: number;
}

export interface BalanceTransaction {
  id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  currency: string;
  type: string;
  source: string;
  reference_id: string | null;
  model_id: string | null;
  description: string | null;
  created_at: string;
}

export interface BalanceTransactionsResult {
  items: BalanceTransaction[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface PricingPayload {
  unit_price?: number;
  base_price?: number;
  price?: number;
  discounted_price?: number;
  discount_rate?: number;
}

function extractOutputUrl(output: unknown): string | null {
  if (typeof output === "string") return output.trim() || null;
  if (!output || typeof output !== "object") return null;

  const record = output as Record<string, unknown>;
  const directOutputKeys = [
    "url",
    "download_url",
    "file_url",
    "image_url",
    "video_url",
    "audio_url",
    "output_url",
    "output",
    "image",
    "video",
    "audio",
    "file",
  ];
  const modelOutputKeys = [
    "model_url",
    "modelUrl",
    "model_file",
    "modelFile",
    "glb_url",
    "gltf_url",
    "mesh_url",
    "pbr_model",
    "base_model",
    "glb",
    "gltf",
    "world_url",
    "worldUrl",
    "world_marble_url",
    "worldMarbleUrl",
    "splat_url",
    "splatUrl",
    "spz_url",
    "spzUrl",
    "model",
  ];

  for (const key of modelOutputKeys) {
    const value = record[key];
    if (typeof value === "string" && looksLikeFileReference(value)) {
      return value.trim();
    }
    if (value && typeof value === "object") {
      const nested = extractOutputUrl(value);
      if (nested) return nested;
    }
  }

  for (const key of directOutputKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = extractOutputUrl(value);
      if (nested) return nested;
    }
  }

  return null;
}

function looksLikeFileReference(value: string): boolean {
  const str = value.trim();
  return (
    /^https?:\/\//i.test(str) ||
    /^local-asset:\/\//i.test(str) ||
    /\.(?:glb|gltf)(?:[?#].*)?$/i.test(str)
  );
}

function normalizePredictionStatus(value: unknown): PredictionResult["status"] {
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

export class WaveSpeedClient {
  private client: AxiosInstance;
  private webClient: AxiosInstance;
  private apiKey: string = "";
  private baseUrl: string = DEFAULT_API_BASE_URL;
  private promotionRatesPromises = new Map<
    string,
    Promise<Map<string, number>>
  >();

  constructor(clientName?: string) {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60 second timeout for connection and read
      maxBodyLength: Infinity, // Allow large file uploads
      maxContentLength: Infinity, // Allow large response content
      headers: {
        "Content-Type": "application/json",
        "X-Client-Name":
          clientName ??
          (() => {
            const os = getOperatingSystem();
            return os === "android" || os === "ios"
              ? "wavespeed-mobile"
              : "wavespeed-desktop";
          })(),
        "X-Client-Version": version,
        "X-Client-OS": getOperatingSystem(),
      },
    });
    this.client.defaults.adapter = createElectronProxyAdapter(() =>
      this.usesOneApiProtocol(),
    );

    this.webClient = axios.create({
      baseURL: WEB_CENTER_URL,
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.request.use((config) => {
      const key = this.getApiKey();
      if (key) {
        config.headers.Authorization = `Bearer ${key}`;
      }
      config.baseURL = this.getBaseUrl();
      return config;
    });
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  setBaseUrl(baseUrl?: string | null) {
    const normalized = normalizeApiBaseUrl(baseUrl);
    this.baseUrl = normalized || DEFAULT_API_BASE_URL;
    this.client.defaults.baseURL = this.baseUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private isOfficialWaveSpeedBaseUrl(): boolean {
    const baseUrl = this.getBaseUrl();
    try {
      return new URL(baseUrl).hostname === "api.wavespeed.ai";
    } catch {
      return baseUrl.replace(/\/+$/, "") === OFFICIAL_WAVESPEED_API_BASE_URL;
    }
  }

  private usesOneApiProtocol(): boolean {
    return (
      !this.isOfficialWaveSpeedBaseUrl() && !this.isZaomengProductionBaseUrl()
    );
  }

  private resolveOutputUrl(url: string): string {
    try {
      return new URL(url, this.getBaseUrl()).toString();
    } catch {
      return url;
    }
  }

  private normalizePredictionResult<T extends PredictionResult>(result: T): T {
    const outputs = result.outputs;
    return {
      ...result,
      status: normalizePredictionStatus(result.status),
      ...(Array.isArray(outputs)
        ? {
            outputs: outputs.map((output) => {
              const url = extractOutputUrl(output);
              return url ? this.resolveOutputUrl(url) : output;
            }),
          }
        : {}),
    };
  }

  private async persistCompletedPrediction<T extends PredictionResult>(
    result: T,
    signal?: AbortSignal,
  ): Promise<T> {
    if (result.status !== "completed" || !Array.isArray(result.outputs)) {
      return result;
    }

    const outputs = await Promise.all(
      result.outputs.map(async (output, index) => {
        const sourceUrl = extractOutputUrl(output);
        if (!sourceUrl || !isPlatformMediaReference(sourceUrl)) return output;

        const modelName = String(result.model || "generated-media")
          .replace(/[^a-z0-9._-]+/gi, "-")
          .replace(/^-+|-+$/g, "");
        const taskId = String(result.id || "result")
          .replace(/[^a-z0-9._-]+/gi, "-")
          .replace(/^-+|-+$/g, "");
        const platformFile = await persistPlatformMediaUrl(sourceUrl, {
          signal,
          filename: `${modelName || "generated-media"}_${taskId || "result"}_${index + 1}`,
        });

        if (typeof output === "string") return platformFile.url;
        return {
          ...output,
          url: platformFile.url,
          file_url: platformFile.url,
          platform_file_id: platformFile.id,
        };
      }),
    );

    return { ...result, outputs };
  }

  async listModels(): Promise<Model[]> {
    try {
      if (this.usesOneApiProtocol()) {
        const catalog = await listOneApiModels(
          this.client,
          this.getBaseUrl(),
          !!this.getApiKey(),
        );
        return catalog.models;
      }
      const response = await this.client.get<ModelsResponse>("/api/v3/models");
      if (response.data.code !== 200) {
        throw new APIError(response.data.message || "Failed to fetch models", {
          code: response.data.code,
          details: response.data,
        });
      }
      return response.data.data.map((model) => ({
        ...model,
        base_price:
          typeof model.base_price === "number"
            ? this.normalizePrice(model.base_price)
            : model.base_price,
      }));
    } catch (error) {
      throw createAPIError(error, "Failed to fetch models");
    }
  }

  async runPrediction(
    model: string,
    input: Record<string, unknown>,
    options?: { timeout?: number; signal?: AbortSignal },
  ): Promise<PredictionResult> {
    try {
      if (this.usesOneApiProtocol()) {
        return this.normalizePredictionResult(
          await runOneApiPrediction(
            this.client,
            this.getBaseUrl(),
            model,
            input,
            options,
          ),
        );
      }
      const response = await this.client.post<PredictionResponse>(
        `/api/v3/${model}`,
        input,
        {
          timeout: options?.timeout,
          ...(options?.signal && { signal: options.signal }),
        },
      );
      if (response.data.code !== 200) {
        throw new APIError(
          response.data.message || "Failed to run prediction",
          {
            code: response.data.code,
            details: response.data,
          },
        );
      }
      return this.normalizePredictionResult(response.data.data);
    } catch (error) {
      throw createAPIError(error, "Failed to run prediction");
    }
  }

  async getResult(
    requestId: string,
    options?: { signal?: AbortSignal },
  ): Promise<PredictionResult> {
    try {
      if (this.usesOneApiProtocol()) {
        return this.normalizePredictionResult(
          await getOneApiPrediction(this.client, requestId, options),
        );
      }
      const response = await this.client.get<PredictionResponse>(
        `/api/v3/predictions/${requestId}/result`,
        {
          ...(options?.signal && { signal: options.signal }),
        },
      );
      if (response.data.code !== 200) {
        throw new APIError(response.data.message || "Failed to get result", {
          code: response.data.code,
          details: response.data,
        });
      }
      return this.normalizePredictionResult(response.data.data);
    } catch (error) {
      // Re-throw AxiosError directly so the polling loop in run() can detect
      // connection errors and retry instead of aborting the entire prediction.
      if (error instanceof AxiosError) throw error;
      throw createAPIError(error, "Failed to get result");
    }
  }

  // Get prediction details including inputs (if available from API)
  async getPredictionDetails(
    predictionId: string,
  ): Promise<PredictionResult & { input?: Record<string, unknown> }> {
    try {
      if (this.usesOneApiProtocol()) {
        return (await getOneApiPrediction(
          this.client,
          predictionId,
        )) as PredictionResult & { input?: Record<string, unknown> };
      }
      const response = await this.client.get<PredictionResponse>(
        `/api/v3/predictions/${predictionId}/result`,
      );
      if (response.data.code !== 200) {
        throw new APIError(
          response.data.message || "Failed to get prediction details",
          {
            code: response.data.code,
            details: response.data,
          },
        );
      }
      // The API might return 'input' field with the original inputs
      return this.normalizePredictionResult(
        response.data.data as PredictionResult & {
          input?: Record<string, unknown>;
        },
      );
    } catch (error) {
      throw createAPIError(error, "Failed to get prediction details");
    }
  }

  // Check if error is a connection/network error that should be retried
  private isConnectionError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      // Timeout errors
      if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
        return true;
      }
      // Network errors
      if (
        error.code === "ERR_NETWORK" ||
        error.code === "ECONNREFUSED" ||
        error.code === "ENOTFOUND"
      ) {
        return true;
      }
    }
    return false;
  }

  async run(
    model: string,
    input: Record<string, unknown>,
    options: RunOptions = {},
  ): Promise<PredictionResult> {
    const { enableSyncMode = false, signal } = options;
    let submittedPrediction: PredictionResult | null = null;

    const throwIfAborted = (): void => {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    };

    try {
      const historyContext = {
        model,
        inputs: input,
        source: "api" as const,
        providerBaseUrl: this.getBaseUrl(),
        providerKey: resolveApiServiceIdForBaseUrl(this.getBaseUrl()) || undefined,
      };

      // If sync mode is enabled, add it to input and wait for response (use longer timeout)
      if (enableSyncMode) {
        const result = await this.runPrediction(
          model,
          { ...input, enable_sync_mode: true },
          {
            ...(this.usesOneApiProtocol() ? {} : { timeout: 120000 }),
            signal,
          },
        );
        submittedPrediction = result;
        options.onSubmitted?.(result);
        const completed = await this.persistCompletedPrediction(result, signal);
        recordGenerationHistoryFromPrediction(completed, historyContext);
        return completed;
      }

      throwIfAborted();
      // Submit prediction
      const prediction = await this.runPrediction(model, input, { signal });
      submittedPrediction = prediction;
      const requestId = prediction.id;

      if (!requestId) {
        throw new Error("No request ID in response");
      }
      options.onSubmitted?.(prediction);
      recordGenerationHistoryFromPrediction(prediction, historyContext);

      if (prediction.status === "completed") {
        const completed = await this.persistCompletedPrediction(
          prediction,
          signal,
        );
        recordGenerationHistoryFromPrediction(completed, historyContext);
        return completed;
      }
      if (prediction.status === "failed") {
        throw new APIError(prediction.error || "Prediction failed", {
          details: prediction,
        });
      }

      const completed = await this.waitForResult(requestId, options);
      recordGenerationHistoryFromPrediction(completed, historyContext);
      return completed;
    } catch (error) {
      const isAbort =
        signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError");
      if (!isAbort) {
        recordGenerationHistoryFailure({
          id: submittedPrediction?.id,
          model,
          inputs: input,
          error: error instanceof Error ? error.message : String(error),
          source: "api",
          providerBaseUrl: this.getBaseUrl(),
          providerKey: resolveApiServiceIdForBaseUrl(this.getBaseUrl()) || undefined,
        });
      }
      throw error;
    }
  }

  async waitForResult(
    requestId: string,
    options: WaitForResultOptions = {},
  ): Promise<PredictionResult> {
    const { timeout = 36000000, pollInterval = 1000, signal } = options;
    const normalizedRequestId = String(requestId || "").trim();
    if (!normalizedRequestId) throw new Error("No request ID in response");

    const throwIfAborted = (): void => {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    };

    // Poll for result with unlimited retry on connection errors
    const startTime = Date.now();
    let consecutiveErrors = 0;
    while (true) {
      throwIfAborted();
      if (Date.now() - startTime > timeout) {
        throw new Error("Prediction timed out");
      }

      try {
        const result = await this.getResult(normalizedRequestId, { signal });
        consecutiveErrors = 0; // reset on success

        if (result.status === "completed") {
          const completed = await this.persistCompletedPrediction(
            result,
            signal,
          );
          recordGenerationHistoryFromPrediction(completed, {
            model: completed.model,
            source: "api",
            providerBaseUrl: this.getBaseUrl(),
            providerKey:
              resolveApiServiceIdForBaseUrl(this.getBaseUrl()) || undefined,
          });
          return completed;
        }

        if (result.status === "failed") {
          throw new APIError(result.error || "Prediction failed", {
            details: result,
          });
        }
      } catch (error) {
        if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
        // Retry with exponential backoff on connection errors (unlimited retries)
        if (this.isConnectionError(error)) {
          consecutiveErrors++;
          const backoff = Math.min(
            1000 * Math.pow(2, consecutiveErrors - 1),
            10000,
          );
          console.warn(
            `Connection error during polling (attempt ${consecutiveErrors}), retrying in ${backoff}ms...`,
            error instanceof Error ? error.message : "request failed",
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }
        // Re-throw non-connection errors
        throw error;
      }

      // Wait before next poll (abort-aware when signal provided)
      throwIfAborted();
      if (signal) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, pollInterval);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(t);
              reject(new DOMException("Cancelled", "AbortError"));
            },
            { once: true },
          );
        });
      } else {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }
  }

  async getHistory(
    page: number = 1,
    pageSize: number = 20,
    filters?: HistoryFilters,
  ): Promise<HistoryResponse["data"]> {
    if (this.usesOneApiProtocol()) {
      return { page, total: 0, items: [] };
    }
    try {
      const body: Record<string, unknown> = {
        page,
        page_size: pageSize,
        include_inputs: true,
      };

      if (filters?.created_after) body.created_after = filters.created_after;
      if (filters?.created_before) body.created_before = filters.created_before;
      if (
        this.isOfficialWaveSpeedBaseUrl() &&
        !filters?.created_after &&
        !filters?.created_before
      ) {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        body.created_after = oneDayAgo.toISOString();
        body.created_before = now.toISOString();
      }

      if (filters?.model) body.model = filters.model;
      if (filters?.status) body.status = filters.status;

      const response = await this.client.post<HistoryResponse>(
        "/api/v3/predictions",
        body,
      );
      if (response.data.code !== 200) {
        throw new APIError(response.data.message || "Failed to fetch history", {
          code: response.data.code,
          details: response.data,
        });
      }
      return {
        ...response.data.data,
        items: (response.data.data.items || []).map((item) =>
          this.normalizePredictionResult(item),
        ),
      };
    } catch (error) {
      throw createAPIError(error, "Failed to fetch history");
    }
  }

  async deletePrediction(predictionId: string): Promise<void> {
    await this.deletePredictions([predictionId]);
  }

  async deletePredictions(predictionIds: string[]): Promise<void> {
    if (this.usesOneApiProtocol()) {
      throw new APIError("当前 One API 暂不支持删除远程任务记录");
    }
    try {
      const response = await this.client.post<{
        code: number;
        message: string;
        data?: unknown;
      }>("/api/v3/predictions/delete", {
        ids: predictionIds,
      });

      if (response.data.code !== 200) {
        throw new APIError(
          response.data.message || "Failed to delete prediction",
          {
            code: response.data.code,
            details: response.data,
          },
        );
      }
    } catch (error) {
      throw createAPIError(error, "Failed to delete prediction");
    }
  }

  async uploadFile(
    file: File,
    signal?: AbortSignal,
    onUploadProgress?: (progress: number) => void,
  ): Promise<string> {
    try {
      const uploaded = await uploadPlatformMediaFile(file, {
        signal,
        onProgress: onUploadProgress
          ? (progress) => onUploadProgress(Math.round(progress * 100))
          : undefined,
      });
      return uploaded.url;
    } catch (error) {
      // Check if this is a cancellation error
      if (
        axios.isCancel(error) ||
        (error instanceof Error &&
          ["AbortError", "CanceledError"].includes(error.name))
      ) {
        throw new APIError("Upload cancelled", { code: 0 });
      }
      throw createAPIError(error, "Failed to upload file");
    }
  }

  async optimizePrompt(input: Record<string, unknown>): Promise<string> {
    try {
      const result = await this.run(
        "wavespeed-ai/prompt-optimizer",
        { ...input, enable_sync_mode: true },
        { enableSyncMode: true },
      );

      if (result.outputs && result.outputs.length > 0) {
        const output = result.outputs[0];
        // Prompt optimizer always returns a string
        return typeof output === "string" ? output : JSON.stringify(output);
      }

      throw new APIError("No optimized prompt returned");
    } catch (error) {
      throw createAPIError(error, "Failed to optimize prompt");
    }
  }

  async calculatePricing(
    modelId: string,
    inputs: Record<string, unknown>,
  ): Promise<PricingResult> {
    if (this.usesOneApiProtocol()) {
      try {
        return await calculateOneApiPricing(
          this.client,
          this.getBaseUrl(),
          modelId,
          inputs,
        );
      } catch (error) {
        throw createAPIError(error, "Failed to calculate pricing");
      }
    }
    const useOfficialPricing = this.isOfficialWaveSpeedBaseUrl();
    const promotionRatePromise = useOfficialPricing
      ? this.getPromotionDiscountRate(modelId)
      : Promise.resolve(undefined);

    if (useOfficialPricing) {
      try {
        const response = await this.webClient.post<{
          code: number;
          message: string;
          data: PricingPayload;
        }>("/default/api/v1/model_product/calculate", {
          model_uuid: modelId,
          inputs,
        });

        if (response.data.code !== 200) {
          throw new APIError(
            response.data.message || "Failed to calculate pricing",
            {
              code: response.data.code,
              details: response.data,
            },
          );
        }

        const pricing = this.normalizePricingResult(response.data.data);
        const promotionRate = await promotionRatePromise;
        if (
          typeof promotionRate === "number" &&
          promotionRate > 0 &&
          promotionRate < 100 &&
          pricing.discountedPrice >= pricing.price
        ) {
          return {
            price: pricing.price,
            discountedPrice: pricing.price * (promotionRate / 100),
            discountRate: promotionRate,
          };
        }

        return pricing;
      } catch (error) {
        console.warn(
          "[pricing] Official web pricing failed; falling back to API v3 pricing",
          error,
        );
      }
    }

    try {
      const response = await this.client.post<{
        code: number;
        message: string;
        data: PricingPayload;
      }>("/api/v3/model/pricing", {
        model_id: modelId,
        inputs,
      });

      if (response.data.code !== 200) {
        throw new APIError(
          response.data.message || "Failed to calculate pricing",
          {
            code: response.data.code,
            details: response.data,
          },
        );
      }

      const pricing = this.normalizePricingResult(response.data.data);
      const promotionRate = await promotionRatePromise;
      if (
        typeof promotionRate === "number" &&
        promotionRate > 0 &&
        promotionRate < 100 &&
        pricing.discountedPrice >= pricing.price
      ) {
        return {
          price: pricing.price,
          discountedPrice: pricing.price * (promotionRate / 100),
          discountRate: promotionRate,
        };
      }

      return pricing;
    } catch (error) {
      throw createAPIError(error, "Failed to calculate pricing");
    }
  }

  private normalizePricingResult(data: PricingPayload): PricingResult {
    let discountedPrice = data.discounted_price ?? data.unit_price;
    let price = data.price ?? data.unit_price ?? data.discounted_price;

    if (
      data.discounted_price === undefined &&
      data.price === undefined &&
      typeof data.unit_price === "number" &&
      typeof data.discount_rate === "number" &&
      data.discount_rate > 0 &&
      data.discount_rate < 100
    ) {
      discountedPrice = data.unit_price;
      price = (data.unit_price * 100) / data.discount_rate;
    }

    if (typeof price !== "number" || typeof discountedPrice !== "number") {
      throw new APIError("Invalid pricing response", { details: data });
    }

    return {
      price: this.normalizePrice(price),
      discountedPrice: this.normalizePrice(discountedPrice),
      discountRate: data.discount_rate,
    };
  }

  private normalizePrice(value: number): number {
    const normalized =
      Math.abs(value) >= PRICE_SCALE / 100 ? value / PRICE_SCALE : value;
    return this.isZaomengProductionBaseUrl()
      ? normalized / ZAOMENG_MODEL_PRICE_MULTIPLIER
      : normalized;
  }

  private isZaomengProductionBaseUrl(): boolean {
    try {
      return (
        new URL(this.getBaseUrl()).hostname ===
        new URL(IDEART_PRODUCTION_API_BASE_URL).hostname
      );
    } catch {
      return (
        this.getBaseUrl().replace(/\/+$/, "") === IDEART_PRODUCTION_API_BASE_URL
      );
    }
  }

  private async getPromotionDiscountRate(
    modelId: string,
  ): Promise<number | undefined> {
    const rates = await this.getPromotionRates(modelId);
    return rates.get(modelId);
  }

  private async getPromotionRates(
    modelId: string,
  ): Promise<Map<string, number>> {
    if (!this.promotionRatesPromises.has(modelId)) {
      const promise = this.fetchPromotionRates(modelId).catch((error) => {
        console.warn("[pricing] Failed to load official promotions", error);
        return new Map<string, number>();
      });
      this.promotionRatesPromises.set(modelId, promise);
    }

    return this.promotionRatesPromises.get(modelId)!;
  }

  private async fetchPromotionRates(
    modelId: string,
  ): Promise<Map<string, number>> {
    const html = await this.fetchOfficialModelsHtml(modelId);
    const rates = new Map<string, number>();
    const marker = "initialPromotions";
    const markerIndex = html.indexOf(marker);
    if (markerIndex === -1) return rates;

    const slice = html.slice(markerIndex, markerIndex + 200_000);
    const patterns = [
      /\\"model_uuid\\":\\"(.*?)\\",\\"discount_rate\\":(\d+)/g,
      /"model_uuid":"(.*?)","discount_rate":(\d+)/g,
    ];

    for (const pattern of patterns) {
      for (const match of slice.matchAll(pattern)) {
        const modelUuid = this.decodeHtmlJsonValue(match[1]);
        const discountRate = Number(match[2]);
        if (modelUuid && discountRate > 0 && discountRate < 100) {
          rates.set(modelUuid, discountRate);
        }
      }
    }

    return rates;
  }

  private async fetchOfficialModelsHtml(modelId: string): Promise<string> {
    if (
      typeof window !== "undefined" &&
      window.electronAPI?.fetchOfficialModelsHtml
    ) {
      return window.electronAPI.fetchOfficialModelsHtml(modelId);
    }

    const response = await axios.get<string>(
      `${WEB_BASE_URL}/models/${modelId}`,
      {
        timeout: 30000,
        headers: { Accept: "text/html" },
      },
    );
    return response.data;
  }

  private decodeHtmlJsonValue(value: string): string {
    return value
      .replace(/\\u002F/g, "/")
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }

  async getBalance(): Promise<number> {
    try {
      if (this.usesOneApiProtocol()) {
        return await getOneApiBalance(this.client);
      }
      const response = await this.client.get<{
        code: number;
        message: string;
        data: { balance: number };
      }>("/api/v3/balance");

      if (response.data.code !== 200) {
        throw new APIError(response.data.message || "Failed to fetch balance", {
          code: response.data.code,
          details: response.data,
        });
      }

      return response.data.data.balance;
    } catch (error) {
      throw createAPIError(error, "Failed to fetch balance");
    }
  }

  async getBalanceTransactions(
    page = 1,
    pageSize = 20,
  ): Promise<BalanceTransactionsResult> {
    if (this.usesOneApiProtocol()) {
      return { items: [], total: 0, page, page_size: pageSize, total_pages: 0 };
    }
    try {
      const response = await this.client.get<{
        code: number;
        message: string;
        data: BalanceTransactionsResult;
      }>("/api/v3/balance/transactions", {
        params: { page, page_size: pageSize },
      });

      if (response.data.code !== 200) {
        throw new APIError(
          response.data.message || "Failed to fetch balance transactions",
          {
            code: response.data.code,
            details: response.data,
          },
        );
      }

      return response.data.data;
    } catch (error) {
      throw createAPIError(error, "Failed to fetch balance transactions");
    }
  }

  async validateCredential(): Promise<void> {
    try {
      if (this.usesOneApiProtocol()) {
        await validateOneApiCredential(this.client);
        return;
      }
      await this.getBalance();
    } catch (error) {
      if (error instanceof APIError) throw error;
      throw createAPIError(error, "API credential validation failed");
    }
  }

  supportsBalanceTransactions(): boolean {
    return !this.usesOneApiProtocol();
  }

  supportsFileUpload(): boolean {
    return !this.usesOneApiProtocol();
  }
}

export const apiClient = new WaveSpeedClient();

export function createApiClient(options: {
  baseUrl: string;
  apiKey: string;
  clientName?: string;
}) {
  const client = new WaveSpeedClient(
    options.clientName || "wavespeed-desktop-workflow-resume",
  );
  client.setBaseUrl(options.baseUrl);
  client.setApiKey(options.apiKey);
  return client;
}

/** Dedicated client for workflow — reports as "wavespeed-desktop-workflow". API key auto-syncs from apiClient. */
class WorkflowClient extends WaveSpeedClient {
  constructor() {
    super("wavespeed-desktop-workflow");
  }
  /** Always delegate to apiClient so key stays in sync automatically. */
  override getApiKey(): string {
    return apiClient.getApiKey();
  }
  /** Always follow the active desktop gateway base URL. */
  override getBaseUrl(): string {
    return apiClient.getBaseUrl();
  }
}
export const workflowClient = new WorkflowClient();

export default apiClient;
