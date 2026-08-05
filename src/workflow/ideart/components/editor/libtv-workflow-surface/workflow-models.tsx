"use client";

import React from "react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { preloadModels } from "@/workflow/ideart/lib/hooks/useModels";
import {
  estimateFixedGenerationPoints,
  isFreeBillingModel,
  parseBillingNumber,
} from "@/workflow/ideart/lib/models/billing-estimate";
import {
  type LibTvScriptV2AssetItem,
  type LibTvScriptV2AssetKind,
  type LibTvStoryboardScriptResult,
  type LibTvStoryboardScriptRow,
} from "@/workflow/ideart/lib/libtv/script";
import { type WorkflowExtraParameterValue } from "./workflow-extra-parameters";

export const SEEDANCE_AVATAR_POPUP_SELECTOR =
  '[data-seedance-avatar-library-popup="true"], [data-seedance-avatar-auth-dialog="true"]';

export function WorkflowHoverTooltip({
  content,
  children,
  side = "top",
}: {
  content?: string;
  children: React.ReactNode;
  side?: "top" | "bottom";
}) {
  if (!content?.trim()) return <>{children}</>;
  return (
    <div className="group relative flex shrink-0">
      {children}
      <div
        className={`pointer-events-none absolute left-1/2 z-[1400] -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#111]/92 px-2 py-1 text-[11px] leading-none text-white opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.32)] transition-opacity duration-75 group-hover:opacity-100 ${
          side === "top" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

export function getWorkflowSurfaceSeedanceAssetUrl(
  node:
    | Pick<LibTvWorkflowNode, "data">
    | WorkflowUpstreamNodeSummary
    | undefined,
) {
  if (!node) return "";
  const data = "data" in node ? node.data : node;
  if (data?.workflowSeedanceAssetCategory !== "character") return "";
  const assetUrl = String(data.workflowSeedanceAssetUrl || "").trim();
  if (/^asset:\/\//i.test(assetUrl)) return assetUrl;
  const assetId = String((data as any)?.workflowSeedanceAssetId || "").trim();
  return assetId ? `asset://${assetId.replace(/^asset:\/\//i, "")}` : "";
}

export type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
};

export type WorkflowCableTone =
  | "neutral"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "spatial";

export type WorkflowEdgeData = {
  active?: boolean;
  tone?: WorkflowCableTone;
  onDisconnectEdge?: (edgeId: string) => void;
};

export type ScriptInputCreationType = "story" | "video" | "character";

export type ScriptV2AssetImportRequest = {
  title: string;
  rows: LibTvStoryboardScriptRow[];
  assetsByKind: Record<LibTvScriptV2AssetKind, LibTvScriptV2AssetItem[]>;
};

export type WorkflowUpstreamNodeSummary = {
  id: string;
  kind: LibTvWorkflowNode["kind"];
  title: string;
  mediaUrl?: string;
  mediaRole?: string;
  componentType?: string;
  workflowSeedanceAssetCategory?: "character" | "non_character";
  workflowSeedanceAssetUrl?: string;
  scriptResult?: LibTvStoryboardScriptResult | null;
};

export type WorkflowModelChoice = {
  id?: string;
  label?: string;
  isDefault?: boolean;
  badge?: string;
  config?: any;
};

export type WorkflowModelOption = {
  id: string;
  modelId: string;
  runtimeId?: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
  descriptionKey?: string;
  provider?: string;
  providerKey?: string;
  cost?: number;
  billing?: {
    isFree?: boolean | string | number | null;
    defaultResolution?: string | null;
    defaultQuality?: string | null;
    resolutionRates?: Record<string, unknown> | null;
    qualityResolutionRates?: Record<
      string,
      Record<string, unknown> | unknown
    > | null;
  };
  isPro?: boolean;
  parameters?: {
    aspectRatios?: WorkflowModelChoice[];
    resolutions?: WorkflowModelChoice[];
    durations?: WorkflowModelChoice[];
    counts?: WorkflowModelChoice[];
    modes?: WorkflowModelChoice[];
    methods?: WorkflowModelChoice[];
    modelFamily?: string;
    defaultVersion?: string;
    defaultNiji?: boolean;
    bodyOverridesPrompt?: boolean;
    extraParameters?: Array<{
      type: string;
      label: string;
      control?: "select" | "boolean" | "text" | "number";
      placeholder?: string;
      defaultValue?: string | number | boolean;
      config?: any;
      options?: WorkflowModelChoice[];
    }>;
    supportsFirstFrame?: boolean;
    supportsEndFrame?: boolean;
    supportsMotionControl?: boolean;
    supportsAudio?: boolean;
    supportsCameraControl?: boolean;
    supportsStyles?: boolean;
    supportsExtend?: boolean;
    supportsReferenceImages?: boolean;
    supportsVideoEdit?: boolean;
    supportsAssetLibrary?: boolean;
    supportsVoiceLibrary?: boolean;
    supportsSound?: boolean;
    defaultSound?: boolean;
    supportsReferenceAudio?: boolean;
    supportsWebSearch?: boolean;
    defaultWebSearch?: boolean;
    supportsImageInput?: boolean;
    supportsPromptMentions?: boolean;
    supportsReferenceVideo?: boolean;
    supportsVideoInput?: boolean;
    supportsAssetUrls?: boolean;
    supportsPanoInput?: boolean;
    supportsSubjectReference?: boolean;
    isViduQ3Family?: boolean;
    multiShot?: boolean;
    maxReferenceImages?: number;
    maxReferenceVideos?: number;
    supportsAudioSetting?: boolean;
    supportsGoogleSearch?: boolean;
    defaultGoogleSearch?: boolean;
    supportsGoogleImageSearch?: boolean;
    defaultGoogleImageSearch?: boolean;
    supportsOfficialFallback?: boolean;
    defaultOfficialFallback?: boolean;
    supportsReturnLastFrame?: boolean;
    defaultReturnLastFrame?: boolean;
    executionContract?: Record<string, any>;
  };
  isDefault?: boolean;
};

export function getWorkflowVideoMethodDefinitions(
  parameters: WorkflowModelOption["parameters"] | null | undefined,
) {
  if (workflowModelSupportsChoices(parameters?.methods))
    return parameters?.methods;
  return workflowModelSupportsChoices(parameters?.modes)
    ? parameters?.modes
    : undefined;
}

export function workflowModelSupportsChoices(
  items:
    | Array<{
        id?: string;
        label?: string;
        isDefault?: boolean;
        config?: Record<string, any>;
      }>
    | undefined,
) {
  return (
    Array.isArray(items) &&
    items.some((item) => String(item?.id || "").trim().length > 0)
  );
}

export function normalizeWorkflowModelIdentity(value: unknown) {
  return String(value || "").trim();
}

export function getWorkflowModelRuntimeAlias(
  model: WorkflowModelOption | null | undefined,
) {
  const modelId = normalizeWorkflowModelIdentity(model?.modelId);
  const providerKey = normalizeWorkflowModelIdentity(model?.providerKey);
  return modelId && providerKey ? modelId + "@@" + providerKey : "";
}

export function getWorkflowModelOptionValue(
  model: WorkflowModelOption | null | undefined,
) {
  return (
    normalizeWorkflowModelIdentity(model?.runtimeId) ||
    normalizeWorkflowModelIdentity(model?.id) ||
    getWorkflowModelRuntimeAlias(model) ||
    normalizeWorkflowModelIdentity(model?.modelId)
  );
}

export function getWorkflowAudioEndpointRuntimeId(
  model: WorkflowModelOption | null | undefined,
  mode: unknown,
) {
  const choices =
    model?.parameters?.modes?.length
      ? model.parameters.modes
      : model?.parameters?.methods;
  if (!Array.isArray(choices) || choices.length === 0) {
    return getWorkflowModelOptionValue(model);
  }
  const target = normalizeWorkflowModelIdentity(mode).toLowerCase();
  const choice =
    choices.find((item) => String(item?.id || "").trim().toLowerCase() === target) ||
    choices.find((item) => item?.isDefault || item?.config?.isDefault) ||
    choices[0];
  const endpointId = normalizeWorkflowModelIdentity(
    choice?.config?.endpointId || choice?.id,
  );
  if (!endpointId) return getWorkflowModelOptionValue(model);
  if (endpointId.includes("@@")) return endpointId;
  const providerKey = normalizeWorkflowModelIdentity(model?.providerKey);
  return providerKey ? `${endpointId}@@${providerKey}` : endpointId;
}

export async function resolveWorkflowAudioEndpointRuntimeId(
  modelId: string,
  mode: unknown,
) {
  const model = await resolveWorkflowModelOptionById("audio", modelId);
  return getWorkflowAudioEndpointRuntimeId(model, mode) || modelId;
}

export type WorkflowModelExecutionRoute = {
  methodId: string;
  mode: string;
  endpointId: string;
  config: Record<string, any>;
};

export function getWorkflowModelExecutionRoutes(
  model: WorkflowModelOption | null | undefined,
): WorkflowModelExecutionRoute[] {
  const routes = model?.parameters?.executionContract?.routes;
  if (!Array.isArray(routes)) return [];
  return routes.flatMap((route: any) => {
    const methodId = String(route?.methodId || "").trim();
    const mode = String(route?.mode || "").trim();
    const endpointId = String(route?.endpointId || "").trim();
    if (!methodId || !mode || !endpointId) return [];
    return [
      {
        methodId,
        mode,
        endpointId,
        config:
          route?.config && typeof route.config === "object" ? route.config : {},
      },
    ];
  });
}

export function resolveWorkflowImageExecutionRoute(
  model: WorkflowModelOption | null | undefined,
  hasReferenceImage: boolean,
) {
  const routes = getWorkflowModelExecutionRoutes(model);
  if (routes.length === 0) return null;
  const desiredMode = hasReferenceImage ? "image-to-image" : "text-to-image";
  return (
    routes.find((route) => route.mode === desiredMode) ||
    routes.find((route) => route.mode === "text-to-image") ||
    routes[0]
  );
}

export async function resolveWorkflowImageMethodForModel(
  modelId: string,
  hasReferenceImage: boolean,
) {
  const selectedModel = await resolveWorkflowModelOptionById("image", modelId);
  return (
    resolveWorkflowImageExecutionRoute(selectedModel, hasReferenceImage)
      ?.methodId || ""
  );
}

export function workflowModelHasExplicitBillingValue(
  model: WorkflowModelOption | null | undefined,
) {
  if (!model) return false;
  if (Number.isFinite(Number(model.cost))) return true;
  const rates = model.billing?.resolutionRates;
  if (
    rates &&
    typeof rates === "object" &&
    Object.values(rates).some((value) => parseBillingNumber(value) !== null)
  )
    return true;
  const matrix = model.billing?.qualityResolutionRates;
  return Boolean(
    matrix &&
    typeof matrix === "object" &&
    Object.values(matrix).some(
      (rates) =>
        rates &&
        typeof rates === "object" &&
        Object.values(rates as Record<string, unknown>).some(
          (value) => parseBillingNumber(value) !== null,
        ),
    ),
  );
}

export function isWorkflowModelFree(
  model: WorkflowModelOption | null | undefined,
) {
  if (!model) return false;
  if (isFreeBillingModel(model)) return true;
  if (!workflowModelHasExplicitBillingValue(model)) return false;
  return estimateFixedGenerationPoints(model, 1).totalPoints <= 0;
}

export function getWorkflowManagedExtraParameterValues(
  model: WorkflowModelOption | null | undefined,
) {
  const managed: Record<string, WorkflowExtraParameterValue> = {};
  const version = String(model?.parameters?.defaultVersion || "").trim();
  if (version) managed.version = version;
  if (
    typeof model?.parameters?.defaultNiji === "boolean" &&
    (version || model.parameters.defaultNiji === true)
  ) {
    managed.niji = model.parameters.defaultNiji;
  }
  return managed;
}

export function workflowModelOptionMatches(
  model: WorkflowModelOption | null | undefined,
  value: unknown,
) {
  const target = normalizeWorkflowModelIdentity(value).toLowerCase();
  if (!target) return false;
  return [
    model?.runtimeId,
    model?.id,
    getWorkflowModelRuntimeAlias(model),
  ].some(
    (candidate) =>
      normalizeWorkflowModelIdentity(candidate).toLowerCase() === target,
  );
}

export function findWorkflowModelOptionByIdentity(
  models: WorkflowModelOption[],
  value: unknown,
) {
  const target = normalizeWorkflowModelIdentity(value).toLowerCase();
  if (!target) return null;

  const exact = models.find((model) =>
    workflowModelOptionMatches(model, target),
  );
  if (exact) return exact;
  // A namespaced runtime id is already supplier-specific. Never fall back to a
  // same-name model under another supplier when that exact option is absent.
  if (target.includes("@@")) return null;

  const canonicalMatches = models.filter(
    (model) =>
      normalizeWorkflowModelIdentity(model?.modelId).toLowerCase() === target,
  );
  if (canonicalMatches.length <= 1) return canonicalMatches[0] || null;
  return null;
}

export type WorkflowMediaMentionKind = "image" | "video" | "audio";

export type WorkflowMediaMentionOption = {
  id: string;
  kind: WorkflowMediaMentionKind;
  label: string;
  insertText: string;
  title: string;
  url: string;
};

export type WorkflowVideoReferenceCard = {
  key: string;
  label: string;
  kind: "image" | "video" | "audio";
  item?: {
    id: string;
    kind: "image" | "video" | "audio";
    title: string;
    mediaUrl?: string;
    sourceId?: string;
    seedanceAssetUrl?: string;
  };
  accept: "image" | "video" | "image-video" | "any";
  removable?: boolean;
  readonly?: boolean;
};

export type ThreeDReferenceCard = {
  key: string;
  kind: "image" | "video";
  title: string;
  mediaUrl?: string;
  sourceId?: string;
  referenceIndex?: number;
};

export type WorkflowStyleGalleryItem = {
  id: string;
  title: string;
  author: string;
  imageUrl: string;
  avatarUrl: string;
  category: string;
  uses: string;
};

export const workflowModelOptionsCache = new Map<
  string,
  WorkflowModelOption[]
>();

export const workflowModelOptionsInFlight = new Map<
  string,
  Promise<WorkflowModelOption[]>
>();

export const WORKFLOW_MODEL_CATEGORIES = [
  "image",
  "video",
  "avatar",
  "chat",
  "3d",
  "audio",
] as const;

export const workflowModelOptionsListeners = new Set<() => void>();

export const WORKFLOW_IMAGE_GENERATION_ESTIMATED_MS = 2 * 60 * 1000;

export type WorkflowImagePresetOption = {
  id: string;
  label: string;
  description: string;
  defaultAspectRatio?: string;
  defaultImageSize?: string;
  forceReferenceImages?: boolean;
  allowTextOnly?: boolean;
};

export type WorkflowImagePresetResult = {
  imageUrl: string;
  prompt?: string;
  aspectRatio?: string;
  imageSize?: string;
};

export async function fetchWorkflowModelOptions(category: string) {
  const normalizedCategory = String(category || "")
    .trim()
    .toLowerCase();
  if (!normalizedCategory) return [];
  const cached = workflowModelOptionsCache.get(normalizedCategory);
  if (cached) return cached;
  const inFlight = workflowModelOptionsInFlight.get(normalizedCategory);
  if (inFlight) return inFlight;

  const request = fetchWorkflowModelOptionsBootstrap()
    .then((payload) => {
      const rawModels = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.models)
          ? payload.models
          : [];
      populateWorkflowModelOptionsCache(rawModels);
      return workflowModelOptionsCache.get(normalizedCategory) || [];
    })
    .finally(() => {
      workflowModelOptionsInFlight.delete(normalizedCategory);
    });
  workflowModelOptionsInFlight.set(normalizedCategory, request);
  return request;
}

export async function resolveWorkflowModelOptionById(
  category: string,
  modelId: string,
): Promise<WorkflowModelOption | null> {
  const normalizedCategory = String(category || "")
    .trim()
    .toLowerCase();
  const normalizedModelId = String(modelId || "").trim();
  if (!normalizedCategory || !normalizedModelId) return null;
  const options = await fetchWorkflowModelOptions(normalizedCategory);
  return findWorkflowModelOptionByIdentity(options, normalizedModelId);
}

export let workflowModelOptionsBootstrapInFlight: Promise<any> | null = null;

export function fetchWorkflowModelOptionsBootstrap() {
  if (!workflowModelOptionsBootstrapInFlight) {
    workflowModelOptionsBootstrapInFlight = preloadModels()
      .then((models) => ({ models }))
      .finally(() => {
        workflowModelOptionsBootstrapInFlight = null;
      });
  }
  return workflowModelOptionsBootstrapInFlight;
}

export function normalizeWorkflowModelOption(
  model: any,
): WorkflowModelOption | null {
  const id = String(
    model?.runtimeId || model?.id || model?.modelId || "",
  ).trim();
  const name = String(model?.name || model?.modelId || model?.id || "").trim();
  if (!id || !name) return null;
  const badge = String(model?.badge || model?.tag || model?.label || "")
    .trim()
    .toUpperCase();
  const isPro = Boolean(
    model?.isPro ||
    model?.is_pro ||
    model?.proOnly ||
    model?.isVip ||
    model?.isVIP ||
    model?.vip ||
    badge === "PRO" ||
    badge === "VIP",
  );
  return {
    id,
    runtimeId: String(model?.runtimeId || model?.id || "").trim() || undefined,
    modelId: String(model?.modelId || model?.id || "").trim(),
    name,
    category: String(model?.category || "").toLowerCase(),
    icon: typeof model?.icon === "string" ? model.icon : undefined,
    description:
      typeof model?.description === "string" ? model.description : undefined,
    descriptionKey:
      typeof model?.descriptionKey === "string"
        ? model.descriptionKey
        : undefined,
    provider: typeof model?.provider === "string" ? model.provider : undefined,
    providerKey:
      typeof model?.providerKey === "string" ? model.providerKey : undefined,
    cost: Number.isFinite(Number(model?.cost)) ? Number(model.cost) : undefined,
    billing:
      model?.billing && typeof model.billing === "object"
        ? {
            isFree: model.billing.isFree ?? undefined,
            defaultResolution:
              typeof model.billing.defaultResolution === "string"
                ? model.billing.defaultResolution
                : undefined,
            defaultQuality:
              typeof model.billing.defaultQuality === "string"
                ? model.billing.defaultQuality
                : undefined,
            resolutionRates:
              model.billing.resolutionRates &&
              typeof model.billing.resolutionRates === "object"
                ? model.billing.resolutionRates
                : undefined,
            qualityResolutionRates:
              model.billing.qualityResolutionRates &&
              typeof model.billing.qualityResolutionRates === "object"
                ? model.billing.qualityResolutionRates
                : undefined,
          }
        : undefined,
    isPro,
    parameters:
      model?.parameters && typeof model.parameters === "object"
        ? {
            ...model.parameters,
            aspectRatios: Array.isArray(model.parameters.aspectRatios)
              ? model.parameters.aspectRatios
              : undefined,
            resolutions: Array.isArray(model.parameters.resolutions)
              ? model.parameters.resolutions
              : undefined,
            durations: Array.isArray(model.parameters.durations)
              ? model.parameters.durations
              : undefined,
            counts: Array.isArray(model.parameters.counts)
              ? model.parameters.counts
              : undefined,
            modes: Array.isArray(model.parameters.modes)
              ? model.parameters.modes
              : undefined,
            methods: Array.isArray(model.parameters.methods)
              ? model.parameters.methods
              : undefined,
            modelFamily:
              typeof model.parameters.modelFamily === "string"
                ? model.parameters.modelFamily
                : undefined,
            extraParameters: Array.isArray(model.parameters.extraParameters)
              ? model.parameters.extraParameters
              : undefined,
            supportsFirstFrame:
              typeof model.parameters.supportsFirstFrame === "boolean"
                ? model.parameters.supportsFirstFrame
                : undefined,
            supportsEndFrame:
              typeof model.parameters.supportsEndFrame === "boolean"
                ? model.parameters.supportsEndFrame
                : undefined,
            supportsMotionControl:
              typeof model.parameters.supportsMotionControl === "boolean"
                ? model.parameters.supportsMotionControl
                : undefined,
            supportsAudio:
              typeof model.parameters.supportsAudio === "boolean"
                ? model.parameters.supportsAudio
                : undefined,
            supportsCameraControl:
              typeof model.parameters.supportsCameraControl === "boolean"
                ? model.parameters.supportsCameraControl
                : undefined,
            supportsStyles:
              typeof model.parameters.supportsStyles === "boolean"
                ? model.parameters.supportsStyles
                : undefined,
            supportsExtend:
              typeof model.parameters.supportsExtend === "boolean"
                ? model.parameters.supportsExtend
                : undefined,
            supportsReferenceImages:
              typeof model.parameters.supportsReferenceImages === "boolean"
                ? model.parameters.supportsReferenceImages
                : undefined,
            supportsVideoEdit:
              typeof model.parameters.supportsVideoEdit === "boolean"
                ? model.parameters.supportsVideoEdit
                : undefined,
            supportsAssetLibrary:
              typeof model.parameters.supportsAssetLibrary === "boolean"
                ? model.parameters.supportsAssetLibrary
                : undefined,
            supportsVoiceLibrary:
              typeof model.parameters.supportsVoiceLibrary === "boolean"
                ? model.parameters.supportsVoiceLibrary
                : undefined,
            supportsSound:
              typeof model.parameters.supportsSound === "boolean"
                ? model.parameters.supportsSound
                : undefined,
            defaultSound:
              typeof model.parameters.defaultSound === "boolean"
                ? model.parameters.defaultSound
                : undefined,
            supportsReferenceAudio:
              typeof model.parameters.supportsReferenceAudio === "boolean"
                ? model.parameters.supportsReferenceAudio
                : undefined,
            supportsWebSearch:
              typeof model.parameters.supportsWebSearch === "boolean"
                ? model.parameters.supportsWebSearch
                : undefined,
            defaultWebSearch:
              typeof model.parameters.defaultWebSearch === "boolean"
                ? model.parameters.defaultWebSearch
                : undefined,
            supportsPromptMentions:
              typeof model.parameters.supportsPromptMentions === "boolean"
                ? model.parameters.supportsPromptMentions
                : undefined,
            supportsReferenceVideo:
              typeof model.parameters.supportsReferenceVideo === "boolean"
                ? model.parameters.supportsReferenceVideo
                : undefined,
            supportsImageInput:
              typeof model.parameters.supportsImageInput === "boolean"
                ? model.parameters.supportsImageInput
                : undefined,
            supportsVideoInput:
              typeof model.parameters.supportsVideoInput === "boolean"
                ? model.parameters.supportsVideoInput
                : undefined,
            supportsAssetUrls:
              typeof model.parameters.supportsAssetUrls === "boolean"
                ? model.parameters.supportsAssetUrls
                : undefined,
            supportsPanoInput:
              typeof model.parameters.supportsPanoInput === "boolean"
                ? model.parameters.supportsPanoInput
                : undefined,
            supportsSubjectReference:
              typeof model.parameters.supportsSubjectReference === "boolean"
                ? model.parameters.supportsSubjectReference
                : undefined,
            isViduQ3Family:
              typeof model.parameters.isViduQ3Family === "boolean"
                ? model.parameters.isViduQ3Family
                : undefined,
            multiShot:
              typeof model.parameters.multiShot === "boolean"
                ? model.parameters.multiShot
                : undefined,
            maxReferenceImages: Number.isFinite(
              Number(model.parameters.maxReferenceImages),
            )
              ? Number(model.parameters.maxReferenceImages)
              : undefined,
            maxReferenceVideos: Number.isFinite(
              Number(model.parameters.maxReferenceVideos),
            )
              ? Number(model.parameters.maxReferenceVideos)
              : undefined,
            supportsAudioSetting:
              typeof model.parameters.supportsAudioSetting === "boolean"
                ? model.parameters.supportsAudioSetting
                : undefined,
            supportsGoogleSearch:
              typeof model.parameters.supportsGoogleSearch === "boolean"
                ? model.parameters.supportsGoogleSearch
                : undefined,
            defaultGoogleSearch:
              typeof model.parameters.defaultGoogleSearch === "boolean"
                ? model.parameters.defaultGoogleSearch
                : undefined,
            supportsGoogleImageSearch:
              typeof model.parameters.supportsGoogleImageSearch === "boolean"
                ? model.parameters.supportsGoogleImageSearch
                : undefined,
            defaultGoogleImageSearch:
              typeof model.parameters.defaultGoogleImageSearch === "boolean"
                ? model.parameters.defaultGoogleImageSearch
                : undefined,
            supportsOfficialFallback:
              typeof model.parameters.supportsOfficialFallback === "boolean"
                ? model.parameters.supportsOfficialFallback
                : undefined,
            defaultOfficialFallback:
              typeof model.parameters.defaultOfficialFallback === "boolean"
                ? model.parameters.defaultOfficialFallback
                : undefined,
            defaultVersion:
              typeof model.parameters.defaultVersion === "string"
                ? model.parameters.defaultVersion
                : undefined,
            defaultNiji:
              typeof model.parameters.defaultNiji === "boolean"
                ? model.parameters.defaultNiji
                : undefined,
            bodyOverridesPrompt:
              typeof model.parameters.bodyOverridesPrompt === "boolean"
                ? model.parameters.bodyOverridesPrompt
                : undefined,
            supportsReturnLastFrame:
              typeof model.parameters.supportsReturnLastFrame === "boolean"
                ? model.parameters.supportsReturnLastFrame
                : undefined,
            defaultReturnLastFrame:
              typeof model.parameters.defaultReturnLastFrame === "boolean"
                ? model.parameters.defaultReturnLastFrame
                : undefined,
            executionContract:
              model.parameters.executionContract &&
              typeof model.parameters.executionContract === "object"
                ? model.parameters.executionContract
                : undefined,
          }
        : undefined,
    isDefault: Boolean(model?.isDefault),
  };
}

export function populateWorkflowModelOptionsCache(rawModels: any[]) {
  const grouped = new Map<string, WorkflowModelOption[]>();
  for (const rawModel of rawModels) {
    const model = normalizeWorkflowModelOption(rawModel);
    if (!model) continue;
    const category = String(model.category || "")
      .trim()
      .toLowerCase();
    if (!category) continue;
    grouped.set(category, [...(grouped.get(category) || []), model]);
  }
  for (const category of WORKFLOW_MODEL_CATEGORIES) {
    workflowModelOptionsCache.set(category, grouped.get(category) || []);
  }
  workflowModelOptionsListeners.forEach((listener) => listener());
}
