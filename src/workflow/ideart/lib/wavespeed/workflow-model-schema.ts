import { getModelRequestSchema } from "@/lib/modelSchemaRuntime";
import type { Model, ModelSchema, SchemaProperty } from "@/types/model";

export type WorkflowMediaKind = "image" | "video" | "audio";

export type WorkflowSchemaProperty = SchemaProperty & {
  disabled?: boolean;
  minLength?: number;
  maxLength?: number;
  multipleOf?: number;
  "x-ui-component-props"?: {
    accept?: string;
  };
};

export type WorkflowRequestSchema = Omit<ModelSchema, "properties"> & {
  properties: Record<string, WorkflowSchemaProperty>;
  "x-order-properties"?: string[];
};

export type WorkflowSchemaField = {
  key: string;
  property: WorkflowSchemaProperty;
  required: boolean;
};

const PROMPT_FIELDS = [
  "prompt",
  "positive_prompt",
  "image_prompt",
  "video_prompt",
  "text_prompt",
  "edit_instruction",
  "instruction",
  "message",
  "text",
  "input",
  "content",
];
const ASPECT_RATIO_FIELDS = ["aspect_ratio", "aspectratio", "ratio"];
const AMBIGUOUS_SIZE_FIELDS = ["size", "resolution_ratio"];
const RESOLUTION_FIELDS = [
  "resolution",
  "image_size",
  "imagesize",
  "target_resolution",
];
const DURATION_FIELDS = [
  "duration",
  "duration_seconds",
  "durationseconds",
  "video_duration",
  "length",
];
const COUNT_FIELDS = [
  "count",
  "n",
  "num_images",
  "numimages",
  "num_outputs",
  "numoutputs",
  "num_videos",
  "numvideos",
  "num_samples",
  "numsamples",
  "image_count",
  "imagecount",
  "video_count",
  "videocount",
  "output_count",
  "outputcount",
  "sample_count",
  "samplecount",
  "number_of_images",
  "numberofimages",
  "number_of_videos",
  "numberofvideos",
  "number_of_outputs",
  "numberofoutputs",
  "batch_size",
  "batchsize",
];
const AUDIO_SWITCH_FIELDS = [
  "generate_audio",
  "generateaudioswitch",
  "generate_audio_switch",
  "audio_enabled",
  "audioenabled",
  "enable_audio",
  "sound",
  "sound_effect_switch",
  "soundeffectswitch",
  "save_audio",
];
const WEB_SEARCH_FIELDS = ["enable_web_search", "enablewebsearch"];

const API_ONLY_FIELDS = new Set(["enable_sync_mode", "enable_base64_output"]);

function normalizeKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getWorkflowRequestSchema(model: Model): WorkflowRequestSchema {
  const schema = getModelRequestSchema(model);
  if (schema) return schema as WorkflowRequestSchema;
  return { type: "object", properties: {}, required: [] };
}

export function getWorkflowSchemaFields(model: Model): WorkflowSchemaField[] {
  const schema = getWorkflowRequestSchema(model);
  const required = new Set((schema.required || []).map(normalizeKey));
  const orderedKeys = [
    ...(schema["x-order-properties"] || []),
    ...Object.keys(schema.properties),
  ];
  const seen = new Set<string>();
  return orderedKeys.flatMap((key) => {
    if (!key || seen.has(key) || !schema.properties[key]) return [];
    seen.add(key);
    return [
      {
        key,
        property: schema.properties[key],
        required: required.has(normalizeKey(key)),
      },
    ];
  });
}

export function getWorkflowEnumValues(
  property: WorkflowSchemaProperty | undefined,
): Array<string | number | boolean> {
  const values: unknown[] =
    property?.enum ||
    property?.["x-enum"] ||
    property?.items?.enum ||
    property?.items?.["x-enum"] ||
    [];
  return Array.isArray(values)
    ? values.filter(
        (value): value is string | number | boolean =>
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean",
      )
    : [];
}

export function getWorkflowNumericValues(
  property: WorkflowSchemaProperty | undefined,
  maxEnumeratedValues = 24,
): number[] {
  const enumValues = getWorkflowEnumValues(property)
    .map(Number)
    .filter(Number.isFinite);
  if (enumValues.length > 0) return Array.from(new Set(enumValues));

  const minimum = Number(property?.minimum);
  const maximum = Number(property?.maximum);
  const defaultValue = Number(property?.default);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    return Number.isFinite(defaultValue) ? [defaultValue] : [];
  }
  const step = Math.max(
    0.0001,
    Number(property?.step || property?.multipleOf || 1),
  );
  const count = Math.floor((maximum - minimum) / step) + 1;
  if (count > 0 && count <= maxEnumeratedValues) {
    return Array.from({ length: count }, (_, index) => minimum + index * step);
  }
  return Array.from(
    new Set(
      [minimum, defaultValue, maximum].filter((value) =>
        Number.isFinite(value),
      ),
    ),
  );
}

export function getWorkflowField(
  model: Model,
  candidates: string[],
): WorkflowSchemaField | undefined {
  const normalizedCandidates = new Set(candidates.map(normalizeKey));
  return getWorkflowSchemaFields(model).find((field) =>
    normalizedCandidates.has(normalizeKey(field.key)),
  );
}

export function getWorkflowPromptField(model: Model) {
  return getWorkflowField(model, PROMPT_FIELDS);
}

export function getWorkflowAspectRatioField(model: Model) {
  const explicit = getWorkflowField(model, ASPECT_RATIO_FIELDS);
  if (explicit) return explicit;
  return getWorkflowSchemaFields(model).find((field) => {
    return (
      AMBIGUOUS_SIZE_FIELDS.includes(normalizeKey(field.key)) &&
      workflowFieldLooksLikeAspectRatio(field)
    );
  });
}

export function getWorkflowResolutionField(model: Model) {
  const explicit = getWorkflowField(model, RESOLUTION_FIELDS);
  if (explicit) return explicit;
  return getWorkflowSchemaFields(model).find((field) => {
    return (
      AMBIGUOUS_SIZE_FIELDS.includes(normalizeKey(field.key)) &&
      !workflowFieldLooksLikeAspectRatio(field)
    );
  });
}

export function getWorkflowDurationField(model: Model) {
  return getWorkflowField(model, DURATION_FIELDS);
}

export function getWorkflowCountField(model: Model) {
  return getWorkflowField(model, COUNT_FIELDS);
}

export function getWorkflowAudioSwitchField(model: Model) {
  return getWorkflowField(model, AUDIO_SWITCH_FIELDS);
}

export function getWorkflowWebSearchField(model: Model) {
  return getWorkflowField(model, WEB_SEARCH_FIELDS);
}

function workflowFieldLooksLikeAspectRatio(field: WorkflowSchemaField) {
  const values = [
    ...getWorkflowEnumValues(field.property),
    field.property.default,
  ]
    .map((value) =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  if (values.length === 0) return false;
  const configurableValues = values.filter(
    (value) => !["auto", "original", "source", "adaptive"].includes(value),
  );
  return (
    configurableValues.length > 0 &&
    configurableValues.every((value) =>
      /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value),
    )
  );
}

export function isWorkflowSchemaFieldHidden(field: WorkflowSchemaField) {
  return (
    field.property["x-hidden"] === true ||
    field.property.disabled === true ||
    API_ONLY_FIELDS.has(normalizeKey(field.key))
  );
}

function isMediaValueProperty(property: WorkflowSchemaProperty) {
  return (
    property.type === "string" ||
    property.type === "array" ||
    property.type === "object"
  );
}

const MEDIA_KIND_ORDER: WorkflowMediaKind[] = ["image", "video", "audio"];

function uniqueMediaKinds(kinds: WorkflowMediaKind[]) {
  const available = new Set(kinds);
  return MEDIA_KIND_ORDER.filter((kind) => available.has(kind));
}

function mediaKindsFromFieldName(value: unknown) {
  const key = normalizeKey(value);
  const kinds: WorkflowMediaKind[] = [];
  if (
    /(?:^|_)(?:image|images|frame|frames|photo|photos|picture|pictures|mask|masks)(?:_url|_urls)?$/.test(
      key,
    )
  ) {
    kinds.push("image");
  }
  if (
    /(?:^|_)(?:video|videos|movie|movies|clip|clips)(?:_url|_urls)?$/.test(key)
  ) {
    kinds.push("video");
  }
  if (
    /(?:^|_)(?:audio|audios|voice|voices|speech|music|song|instrumental)(?:_url|_urls)?$/.test(
      key,
    )
  ) {
    kinds.push("audio");
  }
  return uniqueMediaKinds(kinds);
}

function mediaKindsFromAccept(value: unknown) {
  const accept = String(value || "").toLowerCase();
  const kinds: WorkflowMediaKind[] = [];
  if (
    /image\//.test(accept) ||
    /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)(?:\b|$)/.test(accept)
  ) {
    kinds.push("image");
  }
  if (
    /video\//.test(accept) ||
    /\.(?:avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)(?:\b|$)/.test(accept)
  ) {
    kinds.push("video");
  }
  if (
    /audio\//.test(accept) ||
    /\.(?:aac|flac|m4a|mp3|ogg|opus|wav)(?:\b|$)/.test(accept)
  ) {
    kinds.push("audio");
  }
  return uniqueMediaKinds(kinds);
}

function mediaKindsFromDescription(value: unknown) {
  const hints = normalizeKey(value);
  const kinds: WorkflowMediaKind[] = [];
  if (/(^|_)(image|images|frame|frames|photo|picture|mask)(_|$)/.test(hints)) {
    kinds.push("image");
  }
  if (/(^|_)(video|videos|movie|clip)(_|$)/.test(hints)) {
    kinds.push("video");
  }
  if (/(^|_)(audio|audios|voice|voices|speech|music)(_|$)/.test(hints)) {
    kinds.push("audio");
  }
  return uniqueMediaKinds(kinds);
}

function isWorkflowUploadField(field: WorkflowSchemaField) {
  const component = normalizeKey(field.property["x-ui-component"]);
  return component.includes("upload") || component.includes("uploader");
}

export function workflowFieldMediaKinds(
  field: WorkflowSchemaField,
): WorkflowMediaKind[] {
  if (!isMediaValueProperty(field.property)) return [];

  const fieldKinds = mediaKindsFromFieldName(field.key);
  const acceptValue = [
    field.property["x-accept"],
    field.property["x-ui-component-props"]?.accept,
  ]
    .filter(Boolean)
    .join(",");
  const acceptKinds = mediaKindsFromAccept(acceptValue);
  const wildcardKinds = mediaKindsFromAccept(
    (acceptValue.match(/(?:image|video|audio)\/\*/gi) || []).join(","),
  );

  if (acceptValue) {
    if (acceptKinds.length === 0) return [];
    if (
      fieldKinds.length === 1 &&
      acceptKinds.includes(fieldKinds[0]) &&
      wildcardKinds.length < 2
    ) {
      return fieldKinds;
    }
    return acceptKinds;
  }

  if (fieldKinds.length > 0) return fieldKinds;
  if (!isWorkflowUploadField(field)) return [];

  const itemDescription = (
    field.property.items as { description?: string } | undefined
  )?.description;
  return mediaKindsFromDescription(
    [field.property.title, field.property.description, itemDescription]
      .filter(Boolean)
      .join(" "),
  );
}

export function workflowFieldMediaKind(
  field: WorkflowSchemaField,
): WorkflowMediaKind | null {
  return workflowFieldMediaKinds(field)[0] || null;
}

export function getWorkflowMediaFields(model: Model, kind?: WorkflowMediaKind) {
  return getWorkflowSchemaFields(model).filter((field) => {
    const mediaKinds = workflowFieldMediaKinds(field);
    return mediaKinds.length > 0 && (!kind || mediaKinds.includes(kind));
  });
}

export function workflowMediaFieldRole(field: WorkflowSchemaField) {
  const key = normalizeKey(field.key);
  if (/(^|_)(last|end|tail)(_|$)/.test(key)) return "end";
  if (/(^|_)(first|start)(_|$)/.test(key)) return "start";
  if (/(^|_)mask(_|$)/.test(key)) return "mask";
  if (/(^|_)(reference|references|ref)(_|$)/.test(key)) return "reference";
  return "primary";
}

export function workflowMediaFieldLimits(field: WorkflowSchemaField) {
  const isArray = field.property.type === "array";
  const minimum = Number(
    isArray
      ? (field.property.minItems ?? (field.required ? 1 : 0))
      : field.required
        ? 1
        : 0,
  );
  const maximum = Number(
    isArray ? (field.property.maxItems ?? Number.POSITIVE_INFINITY) : 1,
  );
  return {
    minimum: Number.isFinite(minimum) ? Math.max(0, minimum) : 0,
    maximum: Number.isFinite(maximum)
      ? Math.max(1, maximum)
      : Number.POSITIVE_INFINITY,
    isArray,
  };
}

export function workflowPropertySupportsValue(
  property: WorkflowSchemaProperty | undefined,
  value: unknown,
) {
  if (value === undefined || value === null || value === "") return true;
  const enumValues = getWorkflowEnumValues(property).map((item) =>
    String(item).toLowerCase(),
  );
  if (enumValues.length > 0)
    return enumValues.includes(String(value).toLowerCase());
  const numeric = Number(String(value).replace(/s$/i, ""));
  if (!Number.isFinite(numeric)) return true;
  const minimum = Number(property?.minimum);
  const maximum = Number(property?.maximum);
  if (Number.isFinite(minimum) && numeric < minimum) return false;
  if (Number.isFinite(maximum) && numeric > maximum) return false;
  return true;
}

export function isWorkflowManagedSchemaField(field: WorkflowSchemaField) {
  const key = normalizeKey(field.key);
  return (
    PROMPT_FIELDS.includes(key) ||
    ASPECT_RATIO_FIELDS.includes(key) ||
    AMBIGUOUS_SIZE_FIELDS.includes(key) ||
    RESOLUTION_FIELDS.includes(key) ||
    DURATION_FIELDS.includes(key) ||
    COUNT_FIELDS.includes(key) ||
    AUDIO_SWITCH_FIELDS.includes(key) ||
    WEB_SEARCH_FIELDS.includes(key) ||
    workflowFieldMediaKinds(field).length > 0 ||
    isWorkflowSchemaFieldHidden(field)
  );
}

export function formatWorkflowSchemaFieldLabel(field: WorkflowSchemaField) {
  const configured = String(field.property.title || "").trim();
  if (configured) return configured;
  const labels: Record<string, string> = {
    negative_prompt: "反向提示词",
    quality: "质量",
    image_quality: "质量",
    seed: "随机种子",
    output_format: "输出格式",
    enable_prompt_expansion: "提示词增强",
    guidance_scale: "引导强度",
    num_inference_steps: "推理步数",
    strength: "重绘强度",
    style: "风格",
    shot_type: "镜头类型",
    camera_fixed: "固定摄像机",
    movement_amplitude: "运动幅度",
    keep_original_sound: "保留原声",
  };
  const key = normalizeKey(field.key);
  return (
    labels[key] ||
    key
      .split("_")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function workflowSchemaKeyAliases(key: string) {
  const normalized = normalizeKey(key);
  const camel = normalized.replace(/_([a-z0-9])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
  return Array.from(new Set([key, normalized, camel]));
}
