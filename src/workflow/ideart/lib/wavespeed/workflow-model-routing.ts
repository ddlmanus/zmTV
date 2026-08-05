import type { Model } from "@/types/model";
import {
  getWorkflowModelCategory,
  type WorkflowModelFamily,
} from "./workflow-model-family";
import {
  getWorkflowAspectRatioField,
  getWorkflowAudioSwitchField,
  getWorkflowDurationField,
  getWorkflowEnumValues,
  getWorkflowMediaFields,
  getWorkflowResolutionField,
  getWorkflowSchemaFields,
  getWorkflowWebSearchField,
  workflowFieldMediaKinds,
  workflowMediaFieldLimits,
  workflowMediaFieldRole,
  workflowPropertySupportsValue,
  type WorkflowMediaKind,
  type WorkflowSchemaField,
} from "./workflow-model-schema";

export type WorkflowRouteMode =
  | "text-to-image"
  | "image-to-image"
  | "audio"
  | "3d"
  | "text2video"
  | "first_frame"
  | "last_frame"
  | "start_end"
  | "reference"
  | "omni_reference"
  | "edit"
  | "extend"
  | "motion_control"
  | "audio-to-video"
  | "drama"
  | "drama_clip"
  | "effect";

export type WorkflowEndpointRoute = {
  mode: WorkflowRouteMode;
  label: string;
  endpoint: Model;
  config: Record<string, unknown>;
};

export type WorkflowRouteMediaBinding = {
  field: string;
  kinds: WorkflowMediaKind[];
  role: ReturnType<typeof workflowMediaFieldRole>;
  required: boolean;
  array: boolean;
  minimum: number;
  maximum?: number;
};

export type WorkflowRoutingRequest = {
  modelId: string;
  mode?: string;
  aspectRatio?: string;
  imageSize?: string;
  resolution?: string;
  duration?: string | number;
  imageCount?: number;
  maskCount?: number;
  videoCount?: number;
  audioCount?: number;
};

const VIDEO_MODE_LABELS: Partial<Record<WorkflowRouteMode, string>> = {
  text2video: "文生视频",
  first_frame: "首帧图生",
  last_frame: "尾帧图生",
  start_end: "首尾帧",
  reference: "多图参考",
  omni_reference: "多模态参考",
  edit: "视频编辑",
  extend: "视频延长",
  motion_control: "运动控制",
  "audio-to-video": "音频驱动",
  drama: "剧情视频",
  drama_clip: "剧情片段",
  effect: "视频特效",
};

const VIDEO_MODE_ORDER: WorkflowRouteMode[] = [
  "text2video",
  "first_frame",
  "last_frame",
  "start_end",
  "reference",
  "omni_reference",
  "edit",
  "extend",
  "motion_control",
  "audio-to-video",
  "drama",
  "drama_clip",
  "effect",
];

function normalizeKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeWorkflowRouteMode(value: unknown): string {
  const normalized = normalizeKey(value);
  const aliases: Record<string, WorkflowRouteMode> = {
    text_to_video: "text2video",
    text2video: "text2video",
    t2v: "text2video",
    image_to_video: "first_frame",
    image2video: "first_frame",
    i2v: "first_frame",
    first_frame: "first_frame",
    firstframe: "first_frame",
    tail_frame: "last_frame",
    last_frame: "last_frame",
    end_frame: "last_frame",
    start_end: "start_end",
    start_end_frame: "start_end",
    first_last_frame: "start_end",
    multi_image: "reference",
    multi_reference: "reference",
    keyframes: "reference",
    reference: "reference",
    reference_to_video: "reference",
    omni: "omni_reference",
    omni_reference: "omni_reference",
    multimodal_reference: "omni_reference",
    video_edit: "edit",
    edit_video: "edit",
    edit: "edit",
    continuation: "extend",
    continue: "extend",
    video_extend: "extend",
    extend: "extend",
    motion: "motion_control",
    motion_control: "motion_control",
    audio2video: "audio-to-video",
    audio_to_video: "audio-to-video",
    drama: "drama",
    drama_clip: "drama_clip",
    effect: "effect",
    effects: "effect",
  };
  return aliases[normalized] || String(value || "").trim();
}

const WORKFLOW_ROUTE_METHOD_SEPARATOR = "::";

export function getWorkflowRouteMethodId(route: WorkflowEndpointRoute) {
  return `${route.mode}${WORKFLOW_ROUTE_METHOD_SEPARATOR}${route.endpoint.model_id}`;
}

export function parseWorkflowRouteMethodId(value: unknown) {
  const raw = String(value || "").trim();
  const separator = raw.indexOf(WORKFLOW_ROUTE_METHOD_SEPARATOR);
  if (separator <= 0) return null;
  const mode = normalizeWorkflowRouteMode(raw.slice(0, separator));
  const endpointId = raw.slice(
    separator + WORKFLOW_ROUTE_METHOD_SEPARATOR.length,
  );
  if (!mode || !endpointId) return null;
  return { mode, endpointId };
}

export function getWorkflowRouteModeFromMethodId(value: unknown) {
  return (
    parseWorkflowRouteMethodId(value)?.mode || normalizeWorkflowRouteMode(value)
  );
}

function fieldsForKinds(model: Model, kinds: WorkflowMediaKind[]) {
  const allowed = new Set(kinds);
  return getWorkflowMediaFields(model).filter((field) => {
    return workflowFieldMediaKinds(field).some((kind) => allowed.has(kind));
  });
}

function uniqueFields(fields: WorkflowSchemaField[]) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    if (seen.has(field.key)) return false;
    seen.add(field.key);
    return true;
  });
}

function summarizeKind(fields: WorkflowSchemaField[], kind: WorkflowMediaKind) {
  const matching = fields.filter((field) =>
    workflowFieldMediaKinds(field).includes(kind),
  );
  if (matching.length === 0) return null;
  const limits = matching.map(workflowMediaFieldLimits);
  const requiredMinimum = matching
    .filter(
      (field) => field.required && workflowFieldMediaKinds(field).length === 1,
    )
    .reduce((total, field) => {
      const limit = workflowMediaFieldLimits(field);
      return total + Math.max(1, limit.minimum);
    }, 0);
  const maximum = Math.max(...limits.map((limit) => limit.maximum));
  return {
    min: requiredMinimum,
    max: Number.isFinite(maximum) ? maximum : undefined,
  };
}

function firstDefault(
  model: Model,
  kind: "aspect" | "resolution" | "duration",
) {
  const field =
    kind === "aspect"
      ? getWorkflowAspectRatioField(model)
      : kind === "resolution"
        ? getWorkflowResolutionField(model)
        : getWorkflowDurationField(model);
  const configured = field?.property.default;
  if (configured !== undefined && configured !== null && configured !== "") {
    return String(configured);
  }
  const first = getWorkflowEnumValues(field?.property)[0];
  return first === undefined ? "" : String(first);
}

function routeConfig(
  endpoint: Model,
  mode: WorkflowRouteMode,
  routeFields: WorkflowSchemaField[],
) {
  const fields = uniqueFields(routeFields);
  const allMediaFields = getWorkflowMediaFields(endpoint);
  const required = fields
    .filter((field) => field.required)
    .map((field) => field.key);
  const sends = fields.map((field) => field.key);
  const audioSwitchField = getWorkflowAudioSwitchField(endpoint);
  const webSearchField = getWorkflowWebSearchField(endpoint);
  const mediaBindings = fields.flatMap((field) => {
    const kinds = workflowFieldMediaKinds(field);
    if (kinds.length === 0) return [];
    const limits = workflowMediaFieldLimits(field);
    return [
      {
        field: field.key,
        kinds,
        role: workflowMediaFieldRole(field),
        required: field.required,
        array: limits.isArray,
        minimum: limits.minimum,
        maximum: Number.isFinite(limits.maximum) ? limits.maximum : undefined,
      } satisfies WorkflowRouteMediaBinding,
    ];
  });
  const config: Record<string, unknown> = {
    endpointId: endpoint.model_id,
    endpointIds: [endpoint.model_id],
    basePrice: endpoint.base_price,
    required,
    sends,
    mediaBindings,
    supportsSound: Boolean(audioSwitchField),
    defaultSound: audioSwitchField?.property.default === true,
    supportsWebSearch: Boolean(webSearchField),
    defaultWebSearch: webSearchField?.property.default === true,
    defaults: {
      aspectRatio: firstDefault(endpoint, "aspect") || undefined,
      resolution: firstDefault(endpoint, "resolution") || undefined,
      duration: firstDefault(endpoint, "duration") || undefined,
    },
  };

  for (const kind of ["image", "video", "audio"] as const) {
    const summaryFields =
      kind === "image"
        ? fields.filter((field) => workflowMediaFieldRole(field) !== "mask")
        : fields;
    const summary = summarizeKind(summaryFields, kind);
    if (summary) {
      config[kind + "Urls"] = summary;
    }
  }

  if (mode === "text2video") {
    config.disallow = allMediaFields.map((field) => field.key);
  }
  if (mode === "first_frame" || mode === "last_frame") {
    config.imageUrls = { min: 1, max: 1 };
  }
  if (mode === "start_end") {
    config.imageUrls = { min: 2, max: 2 };
  }
  if (mode === "reference" || mode === "omni_reference") {
    const mediaFields = fields.map((field) => field.key);
    config.requiresAny = mediaFields;
  }
  return config;
}

function createRoute(
  endpoint: Model,
  mode: WorkflowRouteMode,
  fields: WorkflowSchemaField[],
): WorkflowEndpointRoute {
  return {
    mode,
    label: VIDEO_MODE_LABELS[mode] || mode,
    endpoint,
    config: routeConfig(endpoint, mode, fields),
  };
}

function hasMultipleMediaKinds(fields: WorkflowSchemaField[]) {
  return new Set(fields.flatMap(workflowFieldMediaKinds)).size > 1;
}

function hasMultiImageField(fields: WorkflowSchemaField[]) {
  return fields.some((field) => {
    if (!workflowFieldMediaKinds(field).includes("image")) return false;
    const limits = workflowMediaFieldLimits(field);
    return limits.isArray && limits.maximum > 1;
  });
}

function getImageEndpointRoutes(endpoint: Model): WorkflowEndpointRoute[] {
  const type = String(endpoint.type || "").toLowerCase();
  const imageFields = getWorkflowMediaFields(endpoint, "image");
  if (
    type === "text-to-image" &&
    imageFields.every((field) => !field.required)
  ) {
    return [createRoute(endpoint, "text-to-image", [])];
  }
  if (type === "image-to-image" || imageFields.length > 0) {
    return [createRoute(endpoint, "image-to-image", imageFields)];
  }
  return [createRoute(endpoint, "text-to-image", [])];
}

function getVideoEndpointRoutes(endpoint: Model): WorkflowEndpointRoute[] {
  const type = String(endpoint.type || "").toLowerCase();
  const id = endpoint.model_id.toLowerCase();
  const isTextToVideo =
    type === "text-to-video" ||
    /(?:text-to-video|(?:^|[/_-])t2v(?:[/_.-]|$))/.test(id);
  const isImageToVideo =
    type === "image-to-video" ||
    /(?:image-to-video|(?:^|[/_-])i2v(?:[/_.-]|$))/.test(id);
  const isVideoToVideo =
    type === "video-to-video" ||
    /(?:video-to-video|(?:^|[/_-])v2v(?:[/_.-]|$))/.test(id);
  const mediaFields = getWorkflowMediaFields(endpoint);
  const imageFields = mediaFields.filter(
    (field) =>
      workflowFieldMediaKinds(field).includes("image") &&
      workflowMediaFieldRole(field) !== "mask",
  );
  const videoFields = getWorkflowMediaFields(endpoint, "video");
  const audioFields = getWorkflowMediaFields(endpoint, "audio");
  const firstFields = imageFields.filter(
    (field) => workflowMediaFieldRole(field) !== "end",
  );
  const endFields = imageFields.filter(
    (field) => workflowMediaFieldRole(field) === "end",
  );
  const routes: WorkflowEndpointRoute[] = [];

  if (/drama-clip/.test(id)) {
    return [createRoute(endpoint, "drama_clip", mediaFields)];
  }
  if (/\/drama(?:$|\/)/.test(id)) {
    return [createRoute(endpoint, "drama", mediaFields)];
  }
  if (type === "motion-control") {
    return [createRoute(endpoint, "motion_control", mediaFields)];
  }
  if (type === "audio-to-video") {
    return [
      createRoute(
        endpoint,
        "audio-to-video",
        audioFields.length > 0 ? audioFields : mediaFields,
      ),
    ];
  }
  if (
    type === "video-extend" ||
    /(?:video-extend|extend-video|\/extend$)/.test(id)
  ) {
    return [
      createRoute(
        endpoint,
        "extend",
        videoFields.length > 0 ? videoFields : mediaFields,
      ),
    ];
  }
  if (isVideoToVideo) {
    return [createRoute(endpoint, "edit", mediaFields)];
  }
  if (type === "video-effects") {
    return [createRoute(endpoint, "effect", mediaFields)];
  }
  if (isTextToVideo) {
    routes.push(createRoute(endpoint, "text2video", []));
    if (mediaFields.length > 0) {
      const mode = hasMultipleMediaKinds(mediaFields)
        ? "omni_reference"
        : "reference";
      routes.push(createRoute(endpoint, mode, mediaFields));
    }
    return routes;
  }
  if (isImageToVideo || imageFields.length > 0) {
    const dedicatedStartEnd =
      /(?:start-end|transition|pikaframes|flf2v|start_end)/.test(id) ||
      (firstFields.some((field) => field.required) &&
        endFields.some((field) => field.required));
    const dedicatedReference =
      /(?:reference-to-video|multi-i2v|multi_image|\/reference)/.test(id) ||
      hasMultiImageField(imageFields);

    if (dedicatedStartEnd) {
      routes.push(
        createRoute(endpoint, "start_end", [...firstFields, ...endFields]),
      );
    } else if (dedicatedReference) {
      const routeFields = fieldsForKinds(endpoint, ["image", "video", "audio"]);
      const mode = hasMultipleMediaKinds(routeFields)
        ? "omni_reference"
        : "reference";
      routes.push(createRoute(endpoint, mode, routeFields));
    } else {
      routes.push(createRoute(endpoint, "first_frame", firstFields));
      if (endFields.length > 0) {
        routes.push(
          createRoute(endpoint, "start_end", [...firstFields, ...endFields]),
        );
      }
    }

    const optionalReferenceFields = [...videoFields, ...audioFields];
    if (optionalReferenceFields.length > 0) {
      routes.push(createRoute(endpoint, "omni_reference", mediaFields));
    }
    return routes;
  }

  return [createRoute(endpoint, "effect", mediaFields)];
}

export function getWorkflowEndpointRoutes(
  endpoint: Model,
): WorkflowEndpointRoute[] {
  const category = getWorkflowModelCategory(endpoint);
  if (category === "video" || category === "avatar") {
    return getVideoEndpointRoutes(endpoint);
  }
  if (category === "audio" || category === "3d") {
    return [createRoute(endpoint, category, getWorkflowMediaFields(endpoint))];
  }
  return getImageEndpointRoutes(endpoint);
}

export function getWorkflowFamilyRoutes(family: WorkflowModelFamily) {
  const routes = family.endpoints.flatMap(getWorkflowEndpointRoutes);
  const dedicatedReferenceEndpoints = new Set(
    family.endpoints
      .filter((endpoint) =>
        /(?:reference-to-video|multi-image|multi_i2v|\/reference(?:$|\/))/i.test(
          endpoint.model_id,
        ),
      )
      .map((endpoint) => endpoint.model_id),
  );
  if (dedicatedReferenceEndpoints.size === 0) return routes;

  return routes.filter(
    (route) =>
      (route.mode !== "reference" && route.mode !== "omni_reference") ||
      dedicatedReferenceEndpoints.has(route.endpoint.model_id),
  );
}

export function getWorkflowVideoModeOrder(mode: string) {
  const index = VIDEO_MODE_ORDER.indexOf(mode as WorkflowRouteMode);
  return index < 0 ? VIDEO_MODE_ORDER.length : index;
}

function inferredMode(
  family: WorkflowModelFamily,
  request: WorkflowRoutingRequest,
) {
  const images = Math.max(0, Number(request.imageCount || 0));
  const videos = Math.max(0, Number(request.videoCount || 0));
  const audios = Math.max(0, Number(request.audioCount || 0));
  if (family.category === "image")
    return images > 0 ? "image-to-image" : "text-to-image";
  if (family.category === "audio") return "audio";
  if (family.category === "3d") return "3d";
  if (request.mode) return normalizeWorkflowRouteMode(request.mode);
  if (videos > 0) return "edit";
  if (audios > 0) return "audio-to-video";
  if (images >= 2) return "start_end";
  if (images === 1) return "first_frame";
  return "text2video";
}

function routeAcceptsMedia(
  route: WorkflowEndpointRoute,
  request: WorkflowRoutingRequest,
) {
  const counts: Record<WorkflowMediaKind, number> = {
    image: Math.max(0, Number(request.imageCount || 0)),
    video: Math.max(0, Number(request.videoCount || 0)),
    audio: Math.max(0, Number(request.audioCount || 0)),
  };
  const maskCount = Math.max(0, Number(request.maskCount || 0));
  const mediaBindings = Array.isArray(route.config.mediaBindings)
    ? (route.config.mediaBindings as WorkflowRouteMediaBinding[])
    : [];
  for (const binding of mediaBindings) {
    if (!binding.required || !Array.isArray(binding.kinds)) continue;
    const available =
      binding.role === "mask"
        ? maskCount
        : binding.kinds.reduce((total, kind) => total + counts[kind], 0);
    if (available < Math.max(1, Number(binding.minimum || 0))) return false;
    if (
      Number.isFinite(Number(binding.maximum)) &&
      available > Number(binding.maximum)
    ) {
      return false;
    }
  }
  for (const kind of ["image", "video", "audio"] as const) {
    const rule = route.config[kind + "Urls"] as
      | { min?: number; max?: number }
      | undefined;
    if (!rule) continue;
    if (Number.isFinite(Number(rule.min)) && counts[kind] < Number(rule.min))
      return false;
    if (Number.isFinite(Number(rule.max)) && counts[kind] > Number(rule.max))
      return false;
  }
  if (route.mode === "text2video") {
    return counts.image + counts.video + counts.audio === 0;
  }
  return true;
}

function normalizeDurationValue(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return undefined;
  const numeric = Number(raw.replace(/s$/i, ""));
  return Number.isFinite(numeric) ? numeric : raw;
}

function routeSettingsScore(
  route: WorkflowEndpointRoute,
  request: WorkflowRoutingRequest,
) {
  let score = Number(route.endpoint.sort_order || 0) / 1_000_000;
  const requestedResolution = String(
    request.resolution || request.imageSize || "",
  ).trim();
  const requestedAspectRatio = String(request.aspectRatio || "").trim();
  const requestedDuration = normalizeDurationValue(request.duration);
  const settings: Array<{
    field: ReturnType<typeof getWorkflowResolutionField>;
    value: unknown;
    weight: number;
  }> = [
    {
      field: getWorkflowResolutionField(route.endpoint),
      value: requestedResolution,
      weight: 60,
    },
    {
      field: getWorkflowAspectRatioField(route.endpoint),
      value: requestedAspectRatio,
      weight: 20,
    },
    {
      field: getWorkflowDurationField(route.endpoint),
      value: requestedDuration,
      weight: 40,
    },
  ];
  for (const setting of settings) {
    if (
      setting.value === undefined ||
      setting.value === null ||
      setting.value === ""
    )
      continue;
    if (setting.field) {
      score += workflowPropertySupportsValue(
        setting.field.property,
        setting.value,
      )
        ? setting.weight
        : -1000;
    } else if (
      route.endpoint.model_id
        .toLowerCase()
        .includes(String(setting.value).toLowerCase())
    ) {
      score += setting.weight / 2;
    }
  }
  return score;
}

export function resolveWorkflowEndpointRoute(
  family: WorkflowModelFamily,
  request: WorkflowRoutingRequest,
) {
  const routes = getWorkflowFamilyRoutes(family);
  const selectedMethod = parseWorkflowRouteMethodId(request.mode);
  if (selectedMethod) {
    const exactRoute = routes.find(
      (route) =>
        route.endpoint.model_id === selectedMethod.endpointId &&
        route.mode === selectedMethod.mode,
    );
    if (exactRoute) {
      if (routeAcceptsMedia(exactRoute, request)) return exactRoute;

      // Persisted nodes can retain an edit/reference mode after their
      // references were removed. Re-infer from the media currently connected
      // to the node so a text-only run does not inherit an image-to-image
      // endpoint from an earlier state.
    }

    // A model change can leave the previous endpoint method on persisted nodes,
    // or the saved mode can no longer accept the currently connected media.
    // Re-infer from the current catalog instead of routing with stale state.
    request = { ...request, mode: undefined };
  }

  const desiredMode = inferredMode(family, request);
  const requestedEndpointId = String(request.modelId || "")
    .split("@@")[0]
    .trim();
  const explicitlySelectedRoutes = requestedEndpointId
    ? routes.filter((route) => route.endpoint.model_id === requestedEndpointId)
    : [];
  const selectableRoutes =
    explicitlySelectedRoutes.length > 0 ? explicitlySelectedRoutes : routes;
  let candidates = selectableRoutes.filter(
    (route) => route.mode === desiredMode,
  );
  if (candidates.length === 0 && desiredMode === "reference") {
    candidates = selectableRoutes.filter(
      (route) => route.mode === "omni_reference",
    );
  }
  if (candidates.length === 0 && desiredMode === "omni_reference") {
    candidates = selectableRoutes.filter((route) => route.mode === "reference");
  }
  candidates = candidates.filter((route) => routeAcceptsMedia(route, request));
  if (candidates.length === 0) {
    const available = Array.from(
      new Set(selectableRoutes.map((route) => route.mode)),
    ).join("、");
    throw new Error(
      (explicitlySelectedRoutes.length > 0
        ? "当前选择的模型 endpoint 不支持所选生成模式或连接的素材数量，支持模式："
        : "当前模型不支持所选生成模式或连接的素材数量，支持模式：") +
        (available || "无"),
    );
  }
  return [...candidates].sort(
    (a, b) => routeSettingsScore(b, request) - routeSettingsScore(a, request),
  )[0];
}

export function getWorkflowRouteRequiredMedia(route: WorkflowEndpointRoute) {
  return getWorkflowSchemaFields(route.endpoint)
    .filter(
      (field) => field.required && workflowFieldMediaKinds(field).length > 0,
    )
    .map((field) => field.key);
}
