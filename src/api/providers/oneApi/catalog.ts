import axios, { type AxiosInstance } from "axios";
import type { Model, ModelSchema, SchemaProperty } from "@/types/model";
import { registerOneApiCatalogState } from "./registry";
import type {
  OneApiCatalogResult,
  OneApiExecutionKind,
  OneApiExecutionRoute,
  OneApiMediaKind,
  OneApiPricingEntry,
} from "./types";

const CATALOG_PAGE_SIZE = 100;
const enhancedCatalogSupport = new Map<string, boolean>();

interface OpenAIModelItem {
  id?: string;
  name?: string;
  description?: string;
  owned_by?: string;
  type?: string;
  model_type?: string;
  capability_type?: string;
  supported_endpoint_types?: string[] | string;
  base_price?: number;
  model_price?: number;
  discount_rate?: number;
  promotion_discount_rate?: number;
}

interface OpenAIModelListResponse {
  data?: OpenAIModelItem[];
  error?: { message?: string };
  message?: string;
}

interface ProviderCatalogEndpoint {
  type?: string;
  method?: string;
  server?: string;
  api_path?: string;
  request_schema?: ModelSchema;
}

interface ProviderCatalogItem {
  public_protocol?: string;
  execution_mode?: string;
  create_endpoint?: string;
  status_endpoint?: string;
  model_id: string;
  name?: string;
  model_type?: string;
  capability_type?: string;
  description?: string;
  base_price?: number;
  discount_rate?: number;
  promotion_discount_rate?: number;
  api_endpoints?: ProviderCatalogEndpoint[];
}

interface ProviderCatalogPageResponse {
  success: boolean;
  message?: string;
  data?: {
    page: number;
    page_size: number;
    total: number;
    items: ProviderCatalogItem[];
  };
}

interface StandardPricingItem {
  model_name?: string;
  description?: string;
  tags?: string | string[];
  model_type?: string;
  type?: string | number;
  available?: boolean;
  model_price?: number;
  quota_type?: number;
  sort_order?: number;
  supported_endpoint_types?: string[] | string;
}

interface StandardEndpointInfo {
  path?: string;
  method?: string;
}

interface StandardPricingResponse {
  success?: boolean;
  message?: string;
  data?: StandardPricingItem[];
  supported_endpoint?: Record<string, StandardEndpointInfo>;
}

function providerError(message: unknown, fallback: string) {
  return new Error(String(message || fallback));
}

function requestSchema(
  properties: Record<string, SchemaProperty>,
  required: string[],
  order: string[],
): ModelSchema {
  return {
    type: "object",
    properties,
    required,
    "x-order-properties": order,
  };
}

const STANDARD_SCHEMAS: Record<
  "image" | "video" | "audio" | "chat" | "responses",
  ModelSchema
> = {
  image: requestSchema(
    {
      prompt: {
        type: "string",
        title: "提示词",
        description: "描述需要生成的画面",
      },
      size: {
        type: "string",
        title: "图片尺寸",
        enum: ["1024x1024", "1536x1024", "1024x1536"],
        default: "1024x1024",
      },
      quality: {
        type: "string",
        title: "质量",
        enum: ["auto", "standard", "hd"],
        default: "auto",
      },
      n: {
        type: "integer",
        title: "生成数量",
        minimum: 1,
        maximum: 4,
        default: 1,
      },
      response_format: {
        type: "string",
        title: "返回格式",
        enum: ["url", "b64_json"],
        default: "url",
        "x-hidden": true,
      },
    },
    ["prompt"],
    ["prompt", "size", "quality", "n", "response_format"],
  ),
  video: requestSchema(
    {
      prompt: {
        type: "string",
        title: "提示词",
        description: "描述需要生成的视频",
      },
      input_reference: {
        type: "string",
        title: "参考图片",
        "x-ui-component": "uploader",
        "x-accept": "image/*",
      },
      seconds: {
        type: "string",
        title: "时长",
        enum: ["4", "8", "12"],
        default: "8",
      },
      size: {
        type: "string",
        title: "视频尺寸",
        enum: ["1280x720", "720x1280", "1024x1024"],
        default: "1280x720",
      },
    },
    ["prompt"],
    ["prompt", "input_reference", "seconds", "size"],
  ),
  audio: requestSchema(
    {
      input: {
        type: "string",
        title: "文本",
        description: "需要转换为语音的文本",
      },
      voice: {
        type: "string",
        title: "音色",
        default: "alloy",
      },
      response_format: {
        type: "string",
        title: "音频格式",
        enum: ["mp3", "wav", "opus", "aac", "flac"],
        default: "mp3",
      },
      speed: {
        type: "number",
        title: "语速",
        minimum: 0.25,
        maximum: 4,
        step: 0.05,
        default: 1,
      },
    },
    ["input", "voice"],
    ["input", "voice", "response_format", "speed"],
  ),
  chat: requestSchema(
    {
      prompt: {
        type: "string",
        title: "提示词",
        description: "输入需要模型处理的内容",
      },
      system: {
        type: "string",
        title: "系统提示词",
      },
      temperature: {
        type: "number",
        title: "随机性",
        minimum: 0,
        maximum: 2,
        step: 0.1,
        default: 1,
      },
    },
    ["prompt"],
    ["prompt", "system", "temperature"],
  ),
  responses: requestSchema(
    {
      input: {
        type: "string",
        title: "输入",
        description: "输入需要模型处理的内容",
      },
      instructions: {
        type: "string",
        title: "系统指令",
      },
    },
    ["input"],
    ["input", "instructions"],
  ),
};

function normalizeEndpointTypes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEndpointPath(value: unknown) {
  const path = String(value || "").trim();
  if (!path) return "";
  return path.startsWith("/") ? path : "/" + path;
}

function endpointInfoForType(
  endpointType: string,
  endpointMap: Map<string, StandardEndpointInfo>,
) {
  const direct = endpointMap.get(endpointType);
  if (direct) return direct;
  const normalizedType = endpointType.toLowerCase();
  return [...endpointMap.entries()].find(
    ([name]) => name.toLowerCase() === normalizedType,
  )?.[1];
}

function fallbackPathForEndpointType(endpointType: string) {
  switch (endpointType.toLowerCase()) {
    case "image-generation":
    case "images-generations":
    case "images":
      return "/v1/images/generations";
    case "openai-video":
    case "openai_video":
    case "videos-generations":
    case "videos/generations":
      return "/v1/videos/generations";
    case "video":
      return "/v1/videos";
    case "audio-speech":
    case "speech":
    case "text-to-speech":
      return "/v1/audio/speech";
    case "openai-response":
      return "/v1/responses";
    case "openai":
      return "/v1/chat/completions";
    default:
      return "";
  }
}

function executionKindForPath(path: string): OneApiExecutionKind {
  const normalized = path.replace(/\/+$/, "").toLowerCase();
  if (normalized === "/v1/images/generations") return "image";
  if (normalized === "/v1/videos") return "video";
  if (normalized === "/v1/videos/generations") return "video";
  if (normalized === "/v1/audio/speech") return "audio";
  if (normalized === "/v1/responses") return "responses";
  if (normalized === "/v1/chat/completions") return "chat";
  return "unsupported";
}

function videoRouteOptionsForSubmitPath(submitPath: string) {
  if (submitPath.endsWith("/generations")) {
    return {
      statusPath: "/v1/videos/generations/{task_id}",
      payloadFormat: "json" as const,
    };
  }
  return {
    statusPath: "/v1/videos/{task_id}",
    payloadFormat: "multipart" as const,
  };
}

function mediaKindForPricingItem(
  item: StandardPricingItem | undefined,
): OneApiMediaKind {
  const modelType = String(item?.model_type ?? item?.type ?? "").toLowerCase();
  const tags = Array.isArray(item?.tags)
    ? item.tags.join(",").toLowerCase()
    : String(item?.tags || "").toLowerCase();
  const metadata = [modelType, tags].join(" ");

  if (/音频|语音|音乐|audio|speech|voice|tts|music/.test(metadata)) {
    return "audio";
  }
  if (/图像|图片|绘画|image/.test(metadata)) return "image";
  if (/音视频|视频|video/.test(metadata)) return "video";
  return "text";
}

function routeForEndpointType(
  endpointType: string,
  endpointMap: Map<string, StandardEndpointInfo>,
  mediaKind: OneApiMediaKind,
): OneApiExecutionRoute {
  const endpointInfo = endpointInfoForType(endpointType, endpointMap);
  const submitPath =
    normalizeEndpointPath(endpointInfo?.path) ||
    fallbackPathForEndpointType(endpointType);
  const kind = submitPath ? executionKindForPath(submitPath) : "unsupported";
  return {
    kind,
    submitPath,
    ...(kind === "video" ? videoRouteOptionsForSubmitPath(submitPath) : {}),
    endpointType,
    mediaKind,
  };
}

function routeRank(route: OneApiExecutionRoute, mediaKind: OneApiMediaKind) {
  const matchingKind =
    route.kind === mediaKind ||
    (mediaKind === "text" && ["chat", "responses"].includes(route.kind));
  if (matchingKind) return 0;
  if (route.kind === "unsupported") return 20;
  return 40;
}

function chooseStandardRoute(
  endpointTypes: string[],
  endpointMap: Map<string, StandardEndpointInfo>,
  pricingItem: StandardPricingItem | undefined,
): OneApiExecutionRoute {
  const mediaKind = mediaKindForPricingItem(pricingItem);
  const routes = endpointTypes.map((endpointType) =>
    routeForEndpointType(endpointType, endpointMap, mediaKind),
  );
  routes.sort((left, right) => {
    const rankDifference =
      routeRank(left, mediaKind) - routeRank(right, mediaKind);
    if (rankDifference !== 0) return rankDifference;
    if (left.kind === "responses" && right.kind === "chat") return 1;
    if (left.kind === "chat" && right.kind === "responses") return -1;
    return 0;
  });
  if (routes[0]) return routes[0];
  if (mediaKind === "text") {
    return routeForEndpointType("openai", endpointMap, mediaKind);
  }
  return {
    kind: "unsupported",
    submitPath: "",
    endpointType: "未公开端点",
    mediaKind,
  };
}

function modelTypeForRoute(
  route: OneApiExecutionRoute,
  pricingItem: StandardPricingItem | undefined,
) {
  const mediaKind = route.mediaKind || mediaKindForPricingItem(pricingItem);
  if (mediaKind === "image") return "text-to-image";
  if (mediaKind === "video") return "text-to-video";
  if (mediaKind === "audio") return "text-to-audio";
  return "text-to-text";
}

function apiSchemaForRoute(route: OneApiExecutionRoute) {
  if (route.kind === "predictions") return undefined;
  const schemaKind =
    route.kind === "unsupported"
      ? route.mediaKind === "image"
        ? "image"
        : route.mediaKind === "video"
          ? "video"
          : route.mediaKind === "audio"
            ? "audio"
            : "chat"
      : route.kind;
  return {
    api_schemas: [
      {
        type: "model_run",
        method: "POST",
        api_path: route.submitPath,
        request_schema: STANDARD_SCHEMAS[schemaKind],
      },
    ],
  };
}

async function getAvailableModels(client: AxiosInstance) {
  const response = await client.get<OpenAIModelListResponse>("/v1/models");
  if (!Array.isArray(response.data.data)) {
    throw providerError(
      response.data.error?.message || response.data.message,
      "One API 没有返回可用模型列表",
    );
  }
  return response.data.data.filter((item) => String(item.id || "").trim());
}

async function getCatalogPage(client: AxiosInstance, page: number) {
  const response = await client.get<ProviderCatalogPageResponse>(
    "/api/provider-models",
    { params: { p: page, page_size: CATALOG_PAGE_SIZE } },
  );
  if (!response.data.success || !response.data.data) {
    throw providerError(response.data.message, "One API 增强模型目录加载失败");
  }
  return response.data.data;
}

async function getProviderCatalog(client: AxiosInstance) {
  const firstPage = await getCatalogPage(client, 1);
  const pageCount = Math.ceil(firstPage.total / firstPage.page_size);
  if (pageCount <= 1) return firstPage.items;

  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      getCatalogPage(client, index + 2),
    ),
  );
  return [...firstPage.items, ...remainingPages.flatMap((page) => page.items)];
}

async function getStandardPricing(client: AxiosInstance) {
  try {
    const response = await client.get<StandardPricingResponse>("/api/pricing");
    if (!response.data.success || !Array.isArray(response.data.data)) {
      return {
        items: new Map<string, StandardPricingItem>(),
        endpoints: new Map<string, StandardEndpointInfo>(),
      };
    }
    return {
      items: new Map(
        response.data.data
          .filter((item) => String(item.model_name || "").trim())
          .map((item) => [String(item.model_name), item]),
      ),
      endpoints: new Map(
        Object.entries(response.data.supported_endpoint || {}),
      ),
    };
  } catch {
    return {
      items: new Map<string, StandardPricingItem>(),
      endpoints: new Map<string, StandardEndpointInfo>(),
    };
  }
}

function enhancedModel(item: ProviderCatalogItem, sortOrder: number): Model {
  const apiSchemas = (item.api_endpoints || []).map((endpoint) => ({
    type: endpoint.type,
    method: endpoint.method,
    server: endpoint.server,
    api_path: endpoint.api_path,
    request_schema: endpoint.request_schema,
  }));
  const requestSchema = apiSchemas.find(
    (endpoint) => endpoint.request_schema?.properties,
  )?.request_schema;
  return {
    model_id: item.model_id,
    name: item.name || item.model_id,
    description: item.description,
    type: item.capability_type || item.model_type?.toLowerCase() || "unknown",
    model_type: item.model_type,
    capability_type: item.capability_type,
    base_price: item.base_price,
    discount_rate: item.discount_rate,
    promotion_discount_rate: item.promotion_discount_rate,
    sort_order: sortOrder,
    api_endpoints: item.api_endpoints,
    api_schema: {
      api_schemas: apiSchemas,
      ...(requestSchema
        ? {
            components: {
              schemas: {
                Request: requestSchema,
              },
            },
          }
        : {}),
    },
  };
}

function enhancedRouteForCatalogItem(
  item: ProviderCatalogItem,
): OneApiExecutionRoute {
  const endpoint = item.api_endpoints?.[0];
  const protocol = String(item.public_protocol || endpoint?.type || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  const submitPath =
    normalizeEndpointPath(item.create_endpoint) ||
    normalizeEndpointPath(endpoint?.api_path);
  const endpointType = endpoint?.type || item.public_protocol;
  const looksLikeVideo =
    protocol === "openai-video" ||
    /\/v1\/videos(?:\/generations)?$/i.test(submitPath) ||
    String(endpointType || "").toLowerCase() === "openai_video";
  if (looksLikeVideo) {
    const videoSubmitPath = submitPath || "/v1/videos/generations";
    const videoOptions = videoRouteOptionsForSubmitPath(videoSubmitPath);
    return {
      kind: "video",
      submitPath: videoSubmitPath,
      statusPath:
        normalizeEndpointPath(item.status_endpoint) || videoOptions.statusPath,
      endpointType,
      mediaKind: "video",
      payloadFormat: videoOptions.payloadFormat,
    };
  }
  return { kind: "predictions", submitPath: "/v1/predictions" };
}

function standardModel(
  item: OpenAIModelItem,
  pricingItem: StandardPricingItem | undefined,
  endpointMap: Map<string, StandardEndpointInfo>,
  sortOrder: number,
) {
  const modelId = String(item.id || "").trim();
  const endpointTypes = normalizeEndpointTypes(
    item.supported_endpoint_types || pricingItem?.supported_endpoint_types,
  );
  const route = chooseStandardRoute(endpointTypes, endpointMap, pricingItem);
  const fixedPrice = Number(
    item.base_price ?? item.model_price ?? pricingItem?.model_price,
  );
  const basePrice =
    pricingItem?.quota_type !== 0 && Number.isFinite(fixedPrice)
      ? fixedPrice
      : undefined;
  const model: Model = {
    model_id: modelId,
    name: item.name || modelId,
    description: item.description || pricingItem?.description,
    type: modelTypeForRoute(route, pricingItem),
    model_type: item.model_type || pricingItem?.model_type,
    capability_type: item.capability_type,
    base_price: basePrice,
    discount_rate: item.discount_rate,
    promotion_discount_rate: item.promotion_discount_rate,
    sort_order: pricingItem?.sort_order ?? sortOrder,
    api_schema: apiSchemaForRoute(route),
  };
  return { model, route, basePrice };
}

function isAbortError(error: unknown) {
  return (
    axios.isCancel(error) ||
    (error instanceof Error &&
      ["AbortError", "CanceledError"].includes(error.name))
  );
}

function enhancedCatalogKey(baseUrl: string) {
  return String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "")
    .toLowerCase();
}

function isUnsupportedEnhancedCatalog(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  return [404, 405].includes(Number(error.response?.status));
}

export async function listOneApiModels(
  client: AxiosInstance,
  baseUrl: string,
  hasApiKey: boolean,
): Promise<OneApiCatalogResult> {
  const availableModels = hasApiKey ? await getAvailableModels(client) : [];
  const availableIds = new Set(
    availableModels.map((model) => String(model.id || "").trim()),
  );
  const supportKey = enhancedCatalogKey(baseUrl);

  if (enhancedCatalogSupport.get(supportKey) !== false) {
    try {
      const catalog = await getProviderCatalog(client);
      enhancedCatalogSupport.set(supportKey, true);
      const filtered = catalog.filter(
        (item) => !hasApiKey || availableIds.has(item.model_id),
      );
      const models = filtered.map((item, index) =>
        enhancedModel(item, filtered.length - index),
      );
      const routes = new Map<string, OneApiExecutionRoute>(
        filtered.map((item) => [
          item.model_id,
          enhancedRouteForCatalogItem(item),
        ]),
      );
      const pricing = new Map<string, OneApiPricingEntry>(
        models.map((model) => [
          model.model_id,
          {
            basePrice: model.base_price,
            discountRate:
              model.promotion_discount_rate ?? model.discount_rate ?? undefined,
          },
        ]),
      );
      const result = { enhanced: true, models, routes, pricing };
      registerOneApiCatalogState(baseUrl, result);
      return result;
    } catch (error) {
      if (isAbortError(error)) throw error;
      if (isUnsupportedEnhancedCatalog(error)) {
        enhancedCatalogSupport.set(supportKey, false);
      } else if (hasApiKey) {
        const diagnostic = axios.isAxiosError(error)
          ? `HTTP ${error.response?.status || "request failed"}`
          : error instanceof Error
            ? error.message
            : "request failed";
        console.info(
          `[one-api] Enhanced model catalog unavailable (${diagnostic}); using standard catalog`,
        );
      }
    }
  }

  const standardCatalog = await getStandardPricing(client);
  const standardPricing = standardCatalog.items;
  const catalogModels = hasApiKey
    ? availableModels
    : [...standardPricing.values()]
        .filter((item) => item.available !== false)
        .map((item) => ({
          id: item.model_name,
          name: item.model_name,
          description: item.description,
          model_type: item.model_type,
          type: item.type === undefined ? undefined : String(item.type),
          supported_endpoint_types: item.supported_endpoint_types,
          model_price: item.model_price,
        }));
  if (catalogModels.length === 0) {
    throw new Error(
      hasApiKey
        ? "One API 没有返回可用模型"
        : "该 One API 未公开模型目录，请先保存 API 密钥后重试",
    );
  }
  const routes = new Map<string, OneApiExecutionRoute>();
  const pricing = new Map<string, OneApiPricingEntry>();
  const models: Model[] = [];
  catalogModels.forEach((item, index) => {
    const modelId = String(item.id || "").trim();
    const pricingItem = standardPricing.get(modelId);
    const mapped = standardModel(
      item,
      pricingItem,
      standardCatalog.endpoints,
      catalogModels.length - index,
    );
    if (mapped.model.type === "text-to-text") return;
    routes.set(modelId, mapped.route);
    pricing.set(modelId, {
      basePrice: mapped.basePrice,
      discountRate:
        mapped.model.promotion_discount_rate ??
        mapped.model.discount_rate ??
        undefined,
      quotaType: pricingItem?.quota_type,
    });
    models.push(mapped.model);
  });
  if (models.length === 0) {
    throw new Error("该 One API 没有返回可用于图片、视频或音频的模型");
  }
  const result = { enhanced: false, models, routes, pricing };
  registerOneApiCatalogState(baseUrl, result);
  return result;
}

export async function validateOneApiCredential(client: AxiosInstance) {
  await getAvailableModels(client);
}
