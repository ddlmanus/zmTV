export type CodexModelCatalogItem = {
  id: string;
  name?: string;
  owned_by?: string;
  supported_endpoint_types?: string[];
  input_modalities?: string[];
  output_modalities?: string[];
};

type CatalogPayload = {
  data?: unknown;
  models?: unknown;
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_CACHE_TTL_MS = 15 * 60 * 1000;

let openRouterCache: {
  expiresAt: number;
  models: CodexModelCatalogItem[];
} | null = null;
let openRouterRequest: Promise<CodexModelCatalogItem[]> | null = null;

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeStringList(item))
      .filter((item, index, values) => values.indexOf(item) === index);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[,|\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function catalogCandidates(payload: CatalogPayload | unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const value = payload as CatalogPayload & { data?: { models?: unknown } };
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.models)) return value.models;
  if (Array.isArray(value.data?.models)) return value.data.models;
  return [];
}

function normalizeCatalogItem(value: unknown): CodexModelCatalogItem | null {
  if (typeof value === "string") {
    const id = value.trim();
    return id ? { id } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const architecture =
    item.architecture && typeof item.architecture === "object"
      ? (item.architecture as Record<string, unknown>)
      : {};
  const id = String(item.id || item.model || item.name || "").trim();
  if (!id) return null;
  const name = String(item.name || item.display_name || "").trim();
  const ownedBy = String(item.owned_by || item.ownedBy || "").trim();
  const endpointTypes = normalizeStringList(
    item.supported_endpoint_types || item.supportedEndpointTypes,
  );
  const inputModalities = normalizeStringList(
    item.input_modalities ||
      item.inputModalities ||
      architecture.input_modalities ||
      architecture.inputModalities,
  );
  const outputModalities = normalizeStringList(
    item.output_modalities ||
      item.outputModalities ||
      architecture.output_modalities ||
      architecture.outputModalities,
  );
  return {
    id,
    ...(name && name !== id ? { name } : {}),
    ...(ownedBy ? { owned_by: ownedBy } : {}),
    ...(endpointTypes.length
      ? { supported_endpoint_types: endpointTypes }
      : {}),
    ...(inputModalities.length ? { input_modalities: inputModalities } : {}),
    ...(outputModalities.length ? { output_modalities: outputModalities } : {}),
  };
}

export function codexModelCatalogItems(payload: unknown) {
  const seen = new Set<string>();
  const result: CodexModelCatalogItem[] = [];
  for (const candidate of catalogCandidates(payload)) {
    const item = normalizeCatalogItem(candidate);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

export function codexModelHasCapabilityMetadata(item: CodexModelCatalogItem) {
  return Boolean(
    item.input_modalities?.length && item.output_modalities?.length,
  );
}

export function isCodexVisionTextModel(item: CodexModelCatalogItem) {
  const input = new Set(item.input_modalities || []);
  const output = new Set(item.output_modalities || []);
  return (
    input.has("text") &&
    input.has("image") &&
    output.size === 1 &&
    output.has("text")
  );
}

function supportsResponses(item: CodexModelCatalogItem) {
  const endpoints = item.supported_endpoint_types || [];
  if (!endpoints.length) return true;
  return endpoints.some((endpoint) =>
    ["openai-response", "openai-response-compact", "responses"].includes(
      endpoint,
    ),
  );
}

function modelKey(value: string) {
  return value.trim().toLowerCase();
}

function modelBaseName(value: string) {
  return modelKey(value).split("/").pop() || "";
}

/**
 * Provider catalogs often omit modality metadata and use unnamespaced IDs.
 * Match those IDs only to a unique, independently published capability record.
 */
export function filterCodexVisionTextModels(
  providerModels: CodexModelCatalogItem[],
  capabilityModels: CodexModelCatalogItem[],
) {
  const exact = new Map(
    capabilityModels.map((item) => [modelKey(item.id), item]),
  );
  const byBaseName = new Map<string, CodexModelCatalogItem[]>();
  for (const item of capabilityModels) {
    const baseName = modelBaseName(item.id);
    if (!baseName) continue;
    const matches = byBaseName.get(baseName) || [];
    matches.push(item);
    byBaseName.set(baseName, matches);
  }

  return providerModels.filter((providerModel) => {
    if (!supportsResponses(providerModel)) return false;
    const directMetadata = codexModelHasCapabilityMetadata(providerModel)
      ? providerModel
      : null;
    const matchedMetadata =
      directMetadata ||
      exact.get(modelKey(providerModel.id)) ||
      (providerModel.id.includes("/")
        ? undefined
        : byBaseName.get(modelBaseName(providerModel.id))?.length === 1
          ? byBaseName.get(modelBaseName(providerModel.id))?.[0]
          : undefined);
    return Boolean(matchedMetadata && isCodexVisionTextModel(matchedMetadata));
  });
}

async function loadOpenRouterVisionTextModels(fetchFn: FetchLike) {
  if (openRouterCache && openRouterCache.expiresAt > Date.now()) {
    return openRouterCache.models;
  }
  if (openRouterRequest) return openRouterRequest;

  openRouterRequest = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetchFn(OPENROUTER_MODELS_URL, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const models = codexModelCatalogItems(payload).filter(
        isCodexVisionTextModel,
      );
      if (!models.length) throw new Error("没有可用的视觉文本模型元数据");
      openRouterCache = {
        expiresAt: Date.now() + OPENROUTER_CACHE_TTL_MS,
        models,
      };
      return models;
    } catch (error) {
      if (openRouterCache?.models.length) return openRouterCache.models;
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`模型能力元数据加载失败：${detail}`);
    } finally {
      clearTimeout(timer);
      openRouterRequest = null;
    }
  })();
  return openRouterRequest;
}

export async function filterCodexModelsByCapabilities(
  providerModels: CodexModelCatalogItem[],
  fetchFn: FetchLike = fetch,
) {
  const directModels = providerModels.filter(
    (item) =>
      supportsResponses(item) &&
      codexModelHasCapabilityMetadata(item) &&
      isCodexVisionTextModel(item),
  );
  const hasUnverifiedModels = providerModels.some(
    (item) => !codexModelHasCapabilityMetadata(item),
  );
  if (!hasUnverifiedModels) return directModels;
  const remoteModels = await loadOpenRouterVisionTextModels(fetchFn);
  return filterCodexVisionTextModels(providerModels, remoteModels);
}

export function resolveCodexModelId(
  configuredModel: string,
  availableModels: CodexModelCatalogItem[],
) {
  const raw = modelKey(configuredModel);
  if (!raw) return "";
  const exact = availableModels.find((item) => modelKey(item.id) === raw);
  if (exact) return exact.id;
  const baseName = modelBaseName(raw);
  const matches = availableModels.filter(
    (item) => modelBaseName(item.id) === baseName,
  );
  return matches.length === 1 ? matches[0].id : "";
}
