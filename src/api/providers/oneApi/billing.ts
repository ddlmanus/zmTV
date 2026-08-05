import type { AxiosInstance } from "axios";
import { getOneApiCatalogState } from "./registry";

interface ProviderPricingParameter {
  name: string;
  type?: string;
  default?: unknown;
  options?: unknown[];
  minimum?: number;
  min_items?: number;
}

interface ProviderPricingScenario {
  values: Record<string, unknown>;
  price: number;
}

interface ProviderPricingProfile {
  parameters?: ProviderPricingParameter[];
  scenarios?: ProviderPricingScenario[];
  calculation_available?: boolean;
}

interface ProviderCatalogItemResponse {
  success: boolean;
  message?: string;
  data?: {
    model_id: string;
    base_price?: number;
    discount_rate?: number;
    promotion_discount_rate?: number;
    pricing_profile?: ProviderPricingProfile;
  };
}

interface BillingSubscriptionResponse {
  hard_limit_usd?: number;
  system_hard_limit_usd?: number;
  balance?: number;
  remaining?: number;
  error?: { message?: string };
}

interface BillingUsageResponse {
  total_usage?: number;
  error?: { message?: string };
}

export interface OneApiPricingResult {
  price: number;
  discountedPrice: number;
  discountRate?: number;
}

const pricingProfilePromises = new Map<
  string,
  Promise<ProviderCatalogItemResponse>
>();
const UNLIMITED_QUOTA_SENTINEL = 100_000_000;

function providerError(message: unknown, fallback: string) {
  return new Error(String(message || fallback));
}

function encodeModelPath(modelId: string) {
  return modelId.split("/").map(encodeURIComponent).join("/");
}

async function getPricingProfile(
  client: AxiosInstance,
  baseUrl: string,
  modelId: string,
) {
  const key = `${baseUrl}:${modelId}`;
  let request = pricingProfilePromises.get(key);
  if (!request) {
    request = client
      .get<ProviderCatalogItemResponse>(
        `/api/provider-models/${encodeModelPath(modelId)}`,
      )
      .then((response) => response.data)
      .catch((error) => {
        pricingProfilePromises.delete(key);
        throw error;
      });
    pricingProfilePromises.set(key, request);
  }
  return request;
}

function defaultPricingValue(parameter: ProviderPricingParameter) {
  if (parameter.default !== undefined) return parameter.default;
  if (parameter.options?.length) return parameter.options[0];
  if (parameter.type === "boolean") return false;
  if (parameter.type === "integer" || parameter.type === "number") {
    return parameter.minimum ?? 1;
  }
  if (parameter.type === "array") return parameter.min_items ?? 0;
  return undefined;
}

function normalizePricingValue(
  value: unknown,
  parameter: ProviderPricingParameter | undefined,
) {
  if (parameter?.type === "array") {
    return Array.isArray(value) ? value.length : Number(value || 0);
  }
  if (parameter?.type === "integer" || parameter?.type === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  return value;
}

function pricingValuesEqual(left: unknown, right: unknown) {
  if (typeof left === "string" && typeof right === "string") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return Object.is(left, right);
}

export async function calculateOneApiPricing(
  client: AxiosInstance,
  baseUrl: string,
  modelId: string,
  inputs: Record<string, unknown>,
): Promise<OneApiPricingResult> {
  const catalog = getOneApiCatalogState(baseUrl);
  if (!catalog?.enhanced) {
    const pricing = catalog?.pricing.get(modelId);
    if (pricing?.quotaType === 0) {
      throw new Error("该模型按实际用量计费，生成前无法计算固定价格");
    }
    const price = Number(pricing?.basePrice);
    if (!Number.isFinite(price)) {
      throw new Error("当前 One API 没有公开该模型的可计算价格");
    }
    return {
      price,
      discountedPrice: price,
      discountRate: pricing?.discountRate,
    };
  }

  const response = await getPricingProfile(client, baseUrl, modelId);
  const item = response.data;
  if (!response.success || !item) {
    throw providerError(response.message, "One API 模型价格加载失败");
  }

  const profile = item.pricing_profile;
  const parameters = new Map(
    (profile?.parameters || []).map((parameter) => [parameter.name, parameter]),
  );
  const scenario = profile?.calculation_available
    ? profile.scenarios?.find((candidate) =>
        Object.entries(candidate.values).every(([name, expected]) => {
          const parameter = parameters.get(name);
          const rawActual =
            inputs[name] === undefined
              ? parameter
                ? defaultPricingValue(parameter)
                : undefined
              : inputs[name];
          return pricingValuesEqual(
            normalizePricingValue(rawActual, parameter),
            normalizePricingValue(expected, parameter),
          );
        }),
      )
    : undefined;
  const price = Number(scenario?.price ?? item.base_price);
  if (!Number.isFinite(price)) {
    throw new Error("One API 返回了无效的模型价格");
  }
  return {
    price,
    discountedPrice: price,
    discountRate:
      item.promotion_discount_rate ?? item.discount_rate ?? undefined,
  };
}

async function getBillingPair(client: AxiosInstance, prefix: string) {
  const [subscriptionResponse, usageResponse] = await Promise.all([
    client.get<BillingSubscriptionResponse>(
      `${prefix}/dashboard/billing/subscription`,
    ),
    client.get<BillingUsageResponse>(`${prefix}/dashboard/billing/usage`),
  ]);
  return {
    subscription: subscriptionResponse.data,
    usage: usageResponse.data,
  };
}

export async function getOneApiBalance(client: AxiosInstance): Promise<number> {
  let pair: Awaited<ReturnType<typeof getBillingPair>>;
  try {
    pair = await getBillingPair(client, "/v1");
  } catch {
    pair = await getBillingPair(client, "");
  }
  const { subscription, usage } = pair;
  if (subscription.error) {
    throw providerError(subscription.error.message, "One API 余额加载失败");
  }
  if (usage.error) {
    throw providerError(usage.error.message, "One API 用量加载失败");
  }
  const directBalance = Number(subscription.balance ?? subscription.remaining);
  if (Number.isFinite(directBalance)) {
    return directBalance >= UNLIMITED_QUOTA_SENTINEL
      ? Number.POSITIVE_INFINITY
      : Math.max(0, directBalance);
  }

  const total = Number(
    subscription.hard_limit_usd ?? subscription.system_hard_limit_usd,
  );
  const spent = Number(usage.total_usage || 0) / 100;
  if (!Number.isFinite(total) || !Number.isFinite(spent)) {
    throw new Error("One API 返回了无效的余额数据");
  }
  if (total >= UNLIMITED_QUOTA_SENTINEL) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, total - spent);
}
