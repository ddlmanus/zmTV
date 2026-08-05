import type { Model } from "@/types/model";
import {
  buildNormalizedModelInput,
  extractModelFormFields,
} from "@/lib/modelSchemaRuntime";
import {
  type WorkflowEndpointRoute,
  type WorkflowRouteMediaBinding,
} from "./workflow-model-routing";
import {
  getWorkflowAspectRatioField,
  getWorkflowAudioSwitchField,
  getWorkflowCountField,
  getWorkflowDurationField,
  getWorkflowEnumValues,
  getWorkflowPromptField,
  getWorkflowResolutionField,
  getWorkflowSchemaFields,
  getWorkflowWebSearchField,
  isWorkflowSchemaFieldHidden,
  workflowFieldMediaKinds,
  workflowPropertySupportsValue,
  workflowSchemaKeyAliases,
  type WorkflowMediaKind,
  type WorkflowSchemaField,
} from "./workflow-model-schema";

export type WorkflowRunRequest = {
  prompt?: string;
  modelId: string;
  mode?: string;
  method?: string;
  aspectRatio?: string;
  imageSize?: string;
  resolution?: string;
  duration?: string | number;
  count?: string | number;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
  referenceImages?: string[];
  images?: string[];
  maskImage?: string;
  referenceVideos?: string[];
  referenceVideo?: string;
  audioReferences?: string[];
  extra?: Record<string, unknown>;
};

export type WorkflowEndpointInput = {
  endpoint: Model;
  endpointId: string;
  input: Record<string, unknown>;
  countHandledByEndpoint: boolean;
};

function cleanUrls(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function normalizeDuration(
  value: unknown,
  field: WorkflowSchemaField | undefined,
) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const numeric = Number(raw.replace(/s$/i, ""));
  if (!Number.isFinite(numeric)) return raw;
  if (field?.property.type === "string") {
    const enumMatch = (field.property.enum || []).find(
      (item) => String(item).replace(/s$/i, "") === String(numeric),
    );
    return enumMatch === undefined ? String(numeric) : enumMatch;
  }
  return numeric;
}

function setField(
  input: Record<string, unknown>,
  field: WorkflowSchemaField | undefined,
  value: unknown,
) {
  if (!field || value === undefined || value === null || value === "")
    return false;
  input[field.key] = value;
  return true;
}

function assignSingleMediaBinding(
  input: Record<string, unknown>,
  binding: WorkflowRouteMediaBinding | undefined,
  url: string | undefined,
) {
  if (!binding || !url) return;
  input[binding.field] = binding.array ? [url] : url;
}

function assignMediaBindings(
  input: Record<string, unknown>,
  bindings: WorkflowRouteMediaBinding[],
  urls: string[],
) {
  if (urls.length === 0 || bindings.length === 0) return;
  const available = [...urls];
  const singleBindings = bindings.filter((binding) => !binding.array);
  const arrayBindings = bindings.filter((binding) => binding.array);
  const requiredSingles = singleBindings.filter((binding) => binding.required);

  for (const binding of requiredSingles) {
    const url = available.shift();
    if (!url) break;
    input[binding.field] = url;
  }

  const preferredArray =
    arrayBindings.find((binding) => binding.required) ||
    arrayBindings.find((binding) => binding.role === "reference") ||
    arrayBindings[0];
  if (preferredArray && available.length > 0) {
    if (
      Number.isFinite(preferredArray.maximum) &&
      available.length > Number(preferredArray.maximum)
    ) {
      throw new Error(
        preferredArray.field +
          " 最多支持 " +
          preferredArray.maximum +
          " 个素材",
      );
    }
    input[preferredArray.field] = available.splice(
      0,
      preferredArray.maximum ?? available.length,
    );
  }

  for (const binding of singleBindings) {
    if (input[binding.field] !== undefined) continue;
    const url = available.shift();
    if (!url) break;
    input[binding.field] = url;
  }
}

function routeMediaBindings(
  route: WorkflowEndpointRoute,
  kind: WorkflowMediaKind,
  exclusive = false,
) {
  const configured = Array.isArray(route.config.mediaBindings)
    ? route.config.mediaBindings
    : [];
  return configured.filter((binding): binding is WorkflowRouteMediaBinding => {
    if (!binding || typeof binding !== "object") return false;
    const candidate = binding as Partial<WorkflowRouteMediaBinding>;
    return (
      Array.isArray(candidate.kinds) &&
      candidate.kinds.includes(kind) &&
      (!exclusive || candidate.kinds.length === 1) &&
      candidate.role !== "mask" &&
      typeof candidate.field === "string" &&
      candidate.field.length > 0
    );
  });
}

function applyImageInputs(
  input: Record<string, unknown>,
  route: WorkflowEndpointRoute,
  mode: string,
  urls: string[],
) {
  const bindings = routeMediaBindings(route, "image", true);
  const first =
    bindings.find((binding) => binding.role === "start") ||
    bindings.find((binding) => binding.role === "primary") ||
    bindings.find((binding) => binding.role === "reference");
  const end = bindings.find((binding) => binding.role === "end");

  if (mode === "first_frame") {
    assignSingleMediaBinding(input, first, urls[0]);
    return;
  }
  if (mode === "last_frame") {
    assignSingleMediaBinding(input, end || first, urls[0]);
    return;
  }
  if (mode === "start_end") {
    assignSingleMediaBinding(input, first, urls[0]);
    assignSingleMediaBinding(input, end, urls[1]);
    return;
  }
  assignMediaBindings(input, bindings, urls);
}

function applyMediaInputs(
  input: Record<string, unknown>,
  route: WorkflowEndpointRoute,
  request: WorkflowRunRequest,
  mode: string,
) {
  const imageUrls = cleanUrls([
    ...(request.referenceImages || []),
    ...(request.images || []),
  ]);
  const videoUrls = cleanUrls([
    request.referenceVideo,
    ...(request.referenceVideos || []),
  ]);
  const audioUrls = cleanUrls(request.audioReferences || []);
  applyImageInputs(input, route, mode, imageUrls);
  const maskBinding = (
    Array.isArray(route.config.mediaBindings)
      ? (route.config.mediaBindings as WorkflowRouteMediaBinding[])
      : []
  ).find(
    (binding) =>
      binding?.role === "mask" &&
      Array.isArray(binding.kinds) &&
      binding.kinds.includes("image"),
  );
  assignSingleMediaBinding(
    input,
    maskBinding,
    String(request.maskImage || "").trim() || undefined,
  );
  assignMediaBindings(
    input,
    routeMediaBindings(route, "video", true),
    videoUrls,
  );
  assignMediaBindings(
    input,
    routeMediaBindings(route, "audio", true),
    audioUrls,
  );

  const configured = Array.isArray(route.config.mediaBindings)
    ? (route.config.mediaBindings as WorkflowRouteMediaBinding[])
    : [];
  const mixedBindings = configured.filter(
    (binding) =>
      binding.role !== "mask" &&
      Array.isArray(binding.kinds) &&
      binding.kinds.length > 1,
  );
  const mediaByKind: Record<WorkflowMediaKind, string[]> = {
    image: imageUrls,
    video: videoUrls,
    audio: audioUrls,
  };
  const alreadyAssigned = new Set(
    configured.flatMap((binding) => {
      const value = input[binding.field];
      return Array.isArray(value)
        ? cleanUrls(value)
        : value
          ? [String(value)]
          : [];
    }),
  );
  for (const binding of mixedBindings) {
    const urls = cleanUrls(
      binding.kinds.flatMap((kind) => mediaByKind[kind]),
    ).filter((url) => !alreadyAssigned.has(url));
    assignMediaBindings(input, [binding], urls);
    const assigned = input[binding.field];
    for (const url of Array.isArray(assigned) ? assigned : [assigned]) {
      if (url) alreadyAssigned.add(String(url));
    }
  }
}

function valueFromExtra(
  extra: Record<string, unknown>,
  field: WorkflowSchemaField,
) {
  for (const alias of workflowSchemaKeyAliases(field.key)) {
    if (Object.prototype.hasOwnProperty.call(extra, alias)) return extra[alias];
  }
  return undefined;
}

function applyExtraParameters(
  input: Record<string, unknown>,
  endpoint: Model,
  extra: Record<string, unknown>,
) {
  for (const field of getWorkflowSchemaFields(endpoint)) {
    if (input[field.key] !== undefined || isWorkflowSchemaFieldHidden(field))
      continue;
    const value = valueFromExtra(extra, field);
    if (value === undefined || value === null || value === "") continue;
    input[field.key] = value;
  }
}

function applyDefaults(input: Record<string, unknown>, endpoint: Model) {
  for (const field of getWorkflowSchemaFields(endpoint)) {
    if (
      input[field.key] !== undefined ||
      field.property.default === undefined ||
      isWorkflowSchemaFieldHidden(field)
    ) {
      continue;
    }
    input[field.key] = field.property.default;
  }
}

function validateRequiredFields(
  input: Record<string, unknown>,
  endpoint: Model,
) {
  const missing = getWorkflowSchemaFields(endpoint)
    .filter((field) => field.required && !isWorkflowSchemaFieldHidden(field))
    .filter((field) => {
      const value = input[field.key];
      return (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    })
    .map((field) => field.key);
  if (missing.length > 0) {
    throw new Error("当前模式缺少必填参数：" + missing.join("、"));
  }
}

function validateSetting(
  field: WorkflowSchemaField | undefined,
  value: unknown,
  label: string,
) {
  if (!field || value === undefined || value === null || value === "") return;
  if (!workflowPropertySupportsValue(field.property, value)) {
    throw new Error(label + "不支持当前值：" + String(value));
  }
}

function resolveSupportedSetting(
  field: WorkflowSchemaField | undefined,
  value: unknown,
) {
  if (!field || value === undefined || value === null || value === "") {
    return value;
  }
  if (workflowPropertySupportsValue(field.property, value)) return value;

  const candidates = [
    field.property.default,
    ...getWorkflowEnumValues(field.property),
  ];
  return candidates.find(
    (candidate) =>
      candidate !== undefined &&
      candidate !== null &&
      candidate !== "" &&
      workflowPropertySupportsValue(field.property, candidate),
  );
}

function normalizeWorkflowEndpointInput(
  input: Record<string, unknown>,
  endpoint: Model,
) {
  const fields = extractModelFormFields(endpoint);
  const allowed = new Set(fields.map((field) => field.name));
  const normalized = buildNormalizedModelInput(input, fields);
  return Object.fromEntries(
    Object.entries(normalized).filter(([key]) => allowed.has(key)),
  );
}

export function buildWorkflowEndpointInput(
  route: WorkflowEndpointRoute,
  request: WorkflowRunRequest,
): WorkflowEndpointInput {
  const endpoint = route.endpoint;
  const input: Record<string, unknown> = {};
  const mode = route.mode;
  const promptField = getWorkflowPromptField(endpoint);
  const aspectField = getWorkflowAspectRatioField(endpoint);
  const resolutionField = getWorkflowResolutionField(endpoint);
  const durationField = getWorkflowDurationField(endpoint);
  const countField = getWorkflowCountField(endpoint);
  const audioSwitchField = getWorkflowAudioSwitchField(endpoint);
  const webSearchField = getWorkflowWebSearchField(endpoint);
  const prompt = String(request.prompt || "").trim();
  const requestedResolution = String(
    request.resolution || request.imageSize || "",
  ).trim();
  const aspectRatio = resolveSupportedSetting(aspectField, request.aspectRatio);
  const resolution = resolveSupportedSetting(
    resolutionField,
    requestedResolution,
  );
  const duration = resolveSupportedSetting(
    durationField,
    normalizeDuration(request.duration, durationField),
  );
  const count = Math.max(1, Number(request.count || 1) || 1);
  const endpointHandlesCount = Boolean(
    countField && workflowPropertySupportsValue(countField.property, count),
  );

  validateSetting(aspectField, aspectRatio, "画面比例");
  validateSetting(resolutionField, resolution, "分辨率");
  validateSetting(durationField, duration, "时长");

  if (!setField(input, promptField, prompt) && prompt) input.prompt = prompt;
  setField(input, aspectField, aspectRatio);
  setField(input, resolutionField, resolution);
  setField(input, durationField, duration);
  if (endpointHandlesCount) setField(input, countField, count);
  setField(input, audioSwitchField, request.generateAudio);
  setField(input, webSearchField, request.enableWebSearch);
  applyExtraParameters(input, endpoint, request.extra || {});
  applyMediaInputs(input, route, request, mode);
  applyDefaults(input, endpoint);
  validateRequiredFields(input, endpoint);
  const normalizedInput = normalizeWorkflowEndpointInput(input, endpoint);

  return {
    endpoint,
    endpointId: endpoint.model_id,
    input: normalizedInput,
    countHandledByEndpoint: endpointHandlesCount,
  };
}

export function buildWorkflowEndpointPricingInput(
  endpoint: Model,
  request: WorkflowRunRequest,
) {
  const input: Record<string, unknown> = {};
  const promptField = getWorkflowPromptField(endpoint);
  const aspectField = getWorkflowAspectRatioField(endpoint);
  const resolutionField = getWorkflowResolutionField(endpoint);
  const durationField = getWorkflowDurationField(endpoint);
  const countField = getWorkflowCountField(endpoint);
  const audioSwitchField = getWorkflowAudioSwitchField(endpoint);
  const webSearchField = getWorkflowWebSearchField(endpoint);
  const prompt = String(request.prompt || "").trim();
  const resolution = String(
    request.resolution || request.imageSize || "",
  ).trim();
  const duration = normalizeDuration(request.duration, durationField);

  if (!setField(input, promptField, prompt) && prompt) input.prompt = prompt;
  setField(input, aspectField, request.aspectRatio);
  setField(input, resolutionField, resolution);
  setField(input, durationField, duration);
  if (countField && workflowPropertySupportsValue(countField.property, 1)) {
    setField(input, countField, 1);
  }
  setField(input, audioSwitchField, request.generateAudio);
  setField(input, webSearchField, request.enableWebSearch);
  applyExtraParameters(input, endpoint, request.extra || {});
  applyDefaults(input, endpoint);

  return normalizeWorkflowEndpointInput(input, endpoint);
}

export function getWorkflowRequestMediaCounts(request: WorkflowRunRequest) {
  return {
    imageCount: cleanUrls([
      ...(request.referenceImages || []),
      ...(request.images || []),
    ]).length,
    maskCount: String(request.maskImage || "").trim() ? 1 : 0,
    videoCount: cleanUrls([
      request.referenceVideo,
      ...(request.referenceVideos || []),
    ]).length,
    audioCount: cleanUrls(request.audioReferences || []).length,
  };
}

export function getWorkflowEndpointMediaFields(endpoint: Model) {
  return getWorkflowSchemaFields(endpoint)
    .filter((field) => workflowFieldMediaKinds(field).length > 0)
    .map((field) => field.key);
}
