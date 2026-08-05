import { useEffect, useMemo, useState } from "react";
import stableStringify from "json-stable-stringify";
import { apiClient } from "@/api/client";
import { useApiKeyStore } from "@/stores/apiKeyStore";
import { useModelsStore } from "@/stores/modelsStore";
import { buildWorkflowEndpointPricingInput } from "@/workflow/ideart/lib/wavespeed/workflow-request-builder";

const PRICING_DEBOUNCE_MS = 250;
const PRICING_CACHE_TTL_MS = 5 * 60 * 1000;

type CachedWorkflowPrice = {
  unitPrice: number;
  expiresAt: number;
};

const workflowPricingCache = new Map<string, CachedWorkflowPrice>();

export interface WorkflowDynamicPricingSelection {
  enabled: boolean;
  endpointId?: string;
  prompt?: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: string | number;
  quantity?: number;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
  extra?: Record<string, unknown>;
  fallbackPrice: number;
}

function normalizeQuantity(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.max(1, Math.floor(parsed))
    : 1;
}

export function useWorkflowDynamicPricing(
  selection: WorkflowDynamicPricingSelection,
) {
  const apiKey = useApiKeyStore((state) => state.apiKey);
  const models = useModelsStore((state) => state.models);
  const endpointId = String(selection.endpointId || "").trim();
  const quantity = normalizeQuantity(selection.quantity);
  const endpoint = useMemo(
    () => models.find((model) => model.model_id === endpointId) || null,
    [endpointId, models],
  );
  const pricingInput = useMemo(
    () =>
      endpoint
        ? buildWorkflowEndpointPricingInput(endpoint, {
            modelId: endpointId,
            prompt: selection.prompt,
            aspectRatio: selection.aspectRatio,
            resolution: selection.resolution,
            duration: selection.duration,
            count: 1,
            generateAudio: selection.generateAudio,
            enableWebSearch: selection.enableWebSearch,
            extra: selection.extra,
          })
        : null,
    [
      endpoint,
      endpointId,
      selection.aspectRatio,
      selection.duration,
      selection.enableWebSearch,
      selection.extra,
      selection.generateAudio,
      selection.prompt,
      selection.resolution,
    ],
  );
  const pricingKey = useMemo(
    () =>
      endpointId && pricingInput
        ? stableStringify({
            baseUrl: apiClient.getBaseUrl(),
            endpointId,
            input: pricingInput,
          }) || ""
        : "",
    [endpointId, pricingInput],
  );
  const [price, setPrice] = useState(selection.fallbackPrice);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fallbackPrice = Math.max(0, Number(selection.fallbackPrice) || 0);
    if (
      !selection.enabled ||
      !apiKey ||
      !endpointId ||
      !pricingInput ||
      !pricingKey
    ) {
      setPrice(fallbackPrice);
      setIsLoading(false);
      return;
    }

    const cached = workflowPricingCache.get(pricingKey);
    if (cached && cached.expiresAt > Date.now()) {
      setPrice(cached.unitPrice * quantity);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setPrice(fallbackPrice);
    setIsLoading(true);
    const timer = window.setTimeout(() => {
      void apiClient
        .calculatePricing(endpointId, pricingInput)
        .then((result) => {
          if (cancelled) return;
          const unitPrice = Number(result.discountedPrice ?? result.price);
          if (!Number.isFinite(unitPrice) || unitPrice < 0) return;
          workflowPricingCache.set(pricingKey, {
            unitPrice,
            expiresAt: Date.now() + PRICING_CACHE_TTL_MS,
          });
          setPrice(unitPrice * quantity);
        })
        .catch(() => {
          if (!cancelled) setPrice(fallbackPrice);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, PRICING_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    apiKey,
    endpointId,
    pricingInput,
    pricingKey,
    quantity,
    selection.enabled,
    selection.fallbackPrice,
  ]);

  return { price, isLoading };
}
