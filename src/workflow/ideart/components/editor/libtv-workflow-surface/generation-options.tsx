"use client";

import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { type WorkflowExtraParameterDefinition } from "./workflow-extra-parameters";
import {
  getWorkflowVideoMethodDefinitions,
  resolveWorkflowModelOptionById,
} from "./workflow-models";
import type { WorkflowRedrawChoice } from "./surface-contracts";

export function normalizeWorkflowRedrawChoices(
  items:
    | Array<{
        id?: string;
        label?: string;
        isDefault?: boolean;
        config?: Record<string, any>;
      }>
    | undefined,
  fallback: WorkflowRedrawChoice[],
): WorkflowRedrawChoice[] {
  const seen = new Set<string>();
  const normalized = (items || [])
    .map((item): WorkflowRedrawChoice | null => {
      const value = String(item?.id || "").trim();
      const label = String(item?.label || item?.id || "").trim();
      return value && label
        ? {
            value,
            label,
            config: item?.config,
            isDefault: Boolean(item?.isDefault),
          }
        : null;
    })
    .filter((item): item is WorkflowRedrawChoice => Boolean(item))
    .filter((item) => {
      const key = item.value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return normalized.length > 0 ? normalized : fallback;
}

export function workflowChoiceSupportsMethod(
  item: { config?: Record<string, any> } | null | undefined,
  method: string,
) {
  const methods =
    Array.isArray(item?.config?.methods) && item.config.methods.length > 0
      ? item.config.methods
      : item?.config?.modes;
  if (!Array.isArray(methods) || methods.length === 0 || !method) return true;
  const normalizedMethod = String(method).trim().toLowerCase();
  return methods.some(
    (candidate) =>
      String(candidate || "")
        .trim()
        .toLowerCase() === normalizedMethod,
  );
}

export function normalizeWorkflowRedrawChoicesForMethod(
  items:
    | Array<{
        id?: string;
        label?: string;
        isDefault?: boolean;
        config?: Record<string, any>;
      }>
    | undefined,
  fallback: WorkflowRedrawChoice[],
  method: string,
) {
  const source = Array.isArray(items) ? items : [];
  const supportedItems = source.filter((item) =>
    workflowChoiceSupportsMethod(item, method),
  );
  // A populated model schema owns its options. Do not inject frontend values
  // when the selected mode intentionally has no compatible choice.
  return normalizeWorkflowRedrawChoices(
    supportedItems,
    source.length === 0 ? fallback : [],
  );
}

export function isWorkflowChoiceDefault(
  item:
    | { isDefault?: boolean; config?: Record<string, any> }
    | null
    | undefined,
  method = "",
) {
  const normalizedMethod = String(method || "")
    .trim()
    .toLowerCase();
  const defaultMethods = Array.isArray(item?.config?.defaultMethods)
    ? item.config.defaultMethods.map((value: unknown) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
    : [];
  return Boolean(
    item?.isDefault ||
    item?.config?.isDefault ||
    (normalizedMethod && defaultMethods.includes(normalizedMethod)),
  );
}

export function isWorkflowImageQualityDefinition(
  definition: WorkflowExtraParameterDefinition | undefined,
) {
  if (!definition) return false;
  const key =
    `${definition.type || ""} ${definition.label || ""}`.toLowerCase();
  return key.includes("quality") || key.includes("画质");
}

export function getWorkflowImageQualityDefinition(
  definitions: WorkflowExtraParameterDefinition[],
) {
  return definitions.find((definition) =>
    isWorkflowImageQualityDefinition(definition),
  );
}

export function getWorkflowImageNonQualityDefinitions(
  definitions: WorkflowExtraParameterDefinition[],
) {
  return definitions.filter(
    (definition) => !isWorkflowImageQualityDefinition(definition),
  );
}

export function getWorkflowImageQualityChoices(
  definition: WorkflowExtraParameterDefinition | undefined,
): WorkflowRedrawChoice[] {
  if (!definition) return [];
  return normalizeWorkflowRedrawChoices(
    (definition.options || []).map((option) => ({
      id: String(option?.id || "").trim(),
      label: String(option?.label || option?.id || "").trim(),
      isDefault: Boolean(option?.isDefault || option?.config?.isDefault),
      config: option?.config,
    })),
    [],
  );
}

export function normalizeGenerationCountOptions(
  kind: LibTvWorkflowNode["kind"],
  items:
    | Array<{
        id?: string;
        label?: string;
        isDefault?: boolean;
        config?: Record<string, any>;
      }>
    | undefined,
  method = "",
): WorkflowRedrawChoice[] {
  const normalized = normalizeWorkflowRedrawChoicesForMethod(items, [], method);
  if (kind !== "image" && kind !== "video") return normalized;
  const suffix = kind === "image" ? "张" : "个";
  return normalized
    .filter((item) => {
      const value = Number.parseInt(item.value, 10);
      return Number.isFinite(value) && value >= 1;
    })
    .map((item) => {
      const value = String(Number.parseInt(item.value, 10));
      return { ...item, value, label: `${value}${suffix}` };
    })
    .sort(
      (a, b) => Number.parseInt(a.value, 10) - Number.parseInt(b.value, 10),
    );
}

export function pickWorkflowRedrawDefault(
  current: string,
  items:
    | Array<{
        id?: string;
        label?: string;
        isDefault?: boolean;
        config?: Record<string, any>;
      }>
    | undefined,
  choices: WorkflowRedrawChoice[],
  fallback: string,
  method = "",
) {
  if (choices.some((item) => item.value === current)) return current;
  const explicitDefault = (items || []).find(
    (item) =>
      isWorkflowChoiceDefault(item, method) &&
      choices.some((choice) => choice.value === String(item?.id || "").trim()),
  );
  const defaultValue = String(explicitDefault?.id || "").trim();
  if (defaultValue && choices.some((item) => item.value === defaultValue))
    return defaultValue;
  return (
    choices.find((item) => item.value === fallback)?.value ||
    choices[0]?.value ||
    fallback
  );
}

export function workflowChoiceValueExists(
  value: string,
  choices: WorkflowRedrawChoice[],
) {
  return choices.some((item) => item.value === value);
}

export function normalizeWorkflowVideoMethodValue(value?: string | null) {
  return String(value || "").trim();
}

export function getWorkflowVideoMethodRouteMode(
  method: WorkflowRedrawChoice | null | undefined,
) {
  return String(method?.config?.routeMode || method?.value || "").trim();
}

export function resolveWorkflowVideoReferenceUiMode(value?: string | null) {
  const normalized = String(normalizeWorkflowVideoMethodValue(value))
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  if (normalized === "start_end") return "start_end";
  if (normalized === "last_frame" || normalized === "tail_frame")
    return "last_frame";
  if (
    normalized === "first_frame" ||
    normalized === "image2video" ||
    normalized === "image-to-video"
  )
    return "first_frame";
  if (
    normalized === "reference" ||
    normalized === "multi_image" ||
    normalized === "multi_reference" ||
    normalized === "omni_reference" ||
    normalized === "keyframes" ||
    normalized === "motion_control"
  )
    return "reference";
  return normalized;
}

export function normalizeWorkflowVideoMethodChoices(
  items:
    | Array<{
        id?: string;
        label?: string;
        isDefault?: boolean;
        config?: Record<string, any>;
      }>
    | undefined,
) {
  const methodMap: Record<string, string> = {
    text2video: "文本视频",
    first_frame: "首帧图生",
    last_frame: "尾帧图生",
    start_end: "首尾帧",
    reference: "多模态参考",
    omni_reference: "多模态参考",
    motion_control: "运动控制",
    drama: "剧情视频",
    drama_clip: "剧情片段",
    edit: "视频编辑",
    "audio-to-video": "音频驱动",
    extend: "延长视频",
    draft_task: "样片转正式",
  };
  return normalizeWorkflowRedrawChoices(items, []).map((item) => {
    const key = getWorkflowVideoMethodRouteMode(item).toLowerCase();
    const rawLabel = String(item.label || "").trim();
    const labelIsRawValue = rawLabel.toLowerCase() === key;
    const label =
      methodMap[key] && (!rawLabel || labelIsRawValue)
        ? methodMap[key]
        : rawLabel || item.value;
    return label !== item.label ? { ...item, label } : item;
  });
}

export type WorkflowVideoInputCounts = {
  images: number;
  videos: number;
  audios: number;
  scriptImages?: number;
};

export function getWorkflowVideoInputFieldCount(
  field: unknown,
  inputCounts: WorkflowVideoInputCounts,
) {
  const normalized = String(field || "")
    .trim()
    .toLowerCase();
  if (!normalized) return 0;
  if (normalized.includes("audio")) return inputCounts.audios;
  if (normalized.includes("video")) return inputCounts.videos;
  if (normalized.includes("image") || normalized.includes("frame")) {
    return inputCounts.images + Number(inputCounts.scriptImages || 0);
  }
  return 0;
}

export function workflowVideoConfigAcceptsInputKind(
  config: Record<string, any>,
  kind: "image" | "video" | "audio",
) {
  const ruleKey =
    kind === "image"
      ? "imageUrls"
      : kind === "video"
        ? "videoUrls"
        : "audioUrls";
  if (config[ruleKey] && typeof config[ruleKey] === "object") return true;
  const sends = Array.isArray(config.sends) ? config.sends : [];
  return sends.some((field: unknown) => {
    const normalized = String(field || "")
      .trim()
      .toLowerCase();
    if (kind === "image")
      return normalized.includes("image") || normalized.includes("frame");
    return normalized.includes(kind);
  });
}

export function getWorkflowVideoMethodAvailability(
  method: WorkflowRedrawChoice,
  inputCounts: WorkflowVideoInputCounts,
) {
  const config = method.config || {};
  const totalInputs =
    inputCounts.images +
    inputCounts.videos +
    inputCounts.audios +
    Number(inputCounts.scriptImages || 0);
  const disallowedFields = Array.isArray(config.disallow)
    ? config.disallow
    : [];
  for (const [kind, count] of [
    ["image", inputCounts.images + Number(inputCounts.scriptImages || 0)],
    ["video", inputCounts.videos],
    ["audio", inputCounts.audios],
  ] as const) {
    const disallowsKind = disallowedFields.some((field: unknown) => {
      const normalized = String(field || "")
        .trim()
        .toLowerCase();
      if (kind === "image")
        return normalized.includes("image") || normalized.includes("frame");
      return normalized.includes(kind);
    });
    if (
      count > 0 &&
      disallowsKind &&
      !workflowVideoConfigAcceptsInputKind(config, kind)
    ) {
      return { disabled: true, reason: "当前已连接素材与该模式不兼容" };
    }
  }
  const requiredFields = Array.isArray(config.required) ? config.required : [];
  const missingRequiredMedia = requiredFields.find((field: unknown) => {
    const normalized = String(field || "")
      .trim()
      .toLowerCase();
    if (!normalized || normalized === "prompt") return false;
    return (
      (normalized.includes("image") ||
        normalized.includes("frame") ||
        normalized.includes("video") ||
        normalized.includes("audio")) &&
      getWorkflowVideoInputFieldCount(field, inputCounts) <= 0
    );
  });
  if (missingRequiredMedia)
    return { disabled: true, reason: "请先连接该模式需要的素材" };

  const requiresAny = Array.isArray(config.requiresAny)
    ? config.requiresAny
    : [];
  if (
    requiresAny.length > 0 &&
    !requiresAny.some(
      (field: unknown) =>
        getWorkflowVideoInputFieldCount(field, inputCounts) > 0,
    )
  ) {
    return { disabled: true, reason: "请先连接至少一种参考素材" };
  }
  for (const [key, count] of [
    ["imageUrls", inputCounts.images + Number(inputCounts.scriptImages || 0)],
    ["videoUrls", inputCounts.videos],
    ["audioUrls", inputCounts.audios],
  ] as const) {
    const rule = config[key];
    if (!rule || typeof rule !== "object") continue;
    const minimum = Number(rule.min);
    const maximum = Number(rule.max);
    if (Number.isFinite(minimum) && count < minimum)
      return { disabled: true, reason: "连接素材数量不足" };
    if (Number.isFinite(maximum) && count > maximum)
      return { disabled: true, reason: "连接素材数量超出该模式限制" };
  }
  if (config.requiresReferenceImages === true && totalInputs === 0) {
    return { disabled: true, reason: "请先连接参考图片" };
  }
  return { disabled: false, reason: "" };
}

export function resolveWorkflowVideoMethod(
  methods: WorkflowRedrawChoice[],
  currentMethod: string,
  inputCounts: WorkflowVideoInputCounts,
) {
  if (methods.length === 0) return "";
  const availableMethods = methods.filter(
    (method) =>
      !getWorkflowVideoMethodAvailability(method, inputCounts).disabled,
  );
  if (availableMethods.length === 0) return "";
  if (workflowChoiceValueExists(currentMethod, availableMethods))
    return currentMethod;
  const inferred = inferWorkflowVideoMethodFromInputs(inputCounts);
  const inferredMethod = availableMethods.find(
    (method) => getWorkflowVideoMethodRouteMode(method) === inferred,
  );
  if (inferredMethod) return inferredMethod.value;
  const compatibleInferred = inferWorkflowVideoMethodFromAvailableMethods(
    availableMethods,
    inputCounts,
  );
  if (compatibleInferred) return compatibleInferred;
  const explicitDefault = availableMethods.find((method) =>
    isWorkflowChoiceDefault(method),
  );
  return explicitDefault?.value || availableMethods[0]?.value || "";
}

export async function resolveWorkflowVideoMethodForModel(
  modelId: string,
  currentMethod: string,
  inputCounts: WorkflowVideoInputCounts,
) {
  const selectedModel = await resolveWorkflowModelOptionById("video", modelId);
  if (!selectedModel) return "";
  const methodOptions = normalizeWorkflowVideoMethodChoices(
    getWorkflowVideoMethodDefinitions(selectedModel.parameters),
  );
  return resolveWorkflowVideoMethod(
    methodOptions,
    normalizeWorkflowVideoMethodValue(currentMethod),
    inputCounts,
  );
}

export function inferWorkflowVideoMethodFromReferences(referenceCount: number) {
  if (referenceCount >= 2) return "start_end";
  if (referenceCount === 1) return "first_frame";
  return "text2video";
}

export function inferWorkflowVideoMethodFromInputs(inputCounts: {
  images: number;
  videos: number;
  audios: number;
  scriptImages?: number;
}) {
  if (Number(inputCounts.scriptImages || 0) > 0) return "reference";
  if (inputCounts.videos > 0 || inputCounts.audios > 0) return "reference";
  if (inputCounts.images >= 2) return "start_end";
  if (inputCounts.images === 1) return "first_frame";
  return "text2video";
}

export function inferWorkflowVideoMethodFromAvailableMethods(
  methods: WorkflowRedrawChoice[],
  inputCounts: {
    images: number;
    videos: number;
    audios: number;
    scriptImages?: number;
  },
) {
  const imageCount = inputCounts.images + Number(inputCounts.scriptImages || 0);
  if (imageCount <= 0 || inputCounts.videos > 0 || inputCounts.audios > 0)
    return "";
  const imageMethods = methods.filter((method) =>
    workflowVideoConfigAcceptsInputKind(method.config || {}, "image"),
  );
  if (imageMethods.length === 0) return "";
  if (imageCount === 1) {
    return (
      imageMethods.find(
        (method) =>
          resolveWorkflowVideoReferenceUiMode(
            getWorkflowVideoMethodRouteMode(method),
          ) === "first_frame",
      )?.value ||
      imageMethods.find((method) => {
        const maximum = Number(method.config?.imageUrls?.max);
        return Number.isFinite(maximum) && maximum === 1;
      })?.value ||
      ""
    );
  }
  return (
    imageMethods.find(
      (method) =>
        resolveWorkflowVideoReferenceUiMode(
          getWorkflowVideoMethodRouteMode(method),
        ) === "start_end",
    )?.value ||
    imageMethods.find(
      (method) =>
        resolveWorkflowVideoReferenceUiMode(
          getWorkflowVideoMethodRouteMode(method),
        ) === "reference",
    )?.value ||
    imageMethods.find((method) => {
      const maximum = Number(method.config?.imageUrls?.max);
      return Number.isFinite(maximum) && maximum >= imageCount;
    })?.value ||
    ""
  );
}
