import type { Model } from "@/types/model";
import { findCuratedGeneratorProduct } from "@/lib/curatedGeneratorCatalog";
import type { DynamicModel } from "@/workflow/ideart/lib/hooks/useModels";
import type { WorkflowModelFamily } from "./workflow-model-family";
import {
  getWorkflowFamilyRoutes,
  getWorkflowRouteMethodId,
  getWorkflowVideoModeOrder,
  type WorkflowEndpointRoute,
} from "./workflow-model-routing";
import {
  formatWorkflowSchemaFieldLabel,
  getWorkflowAspectRatioField,
  getWorkflowAudioSwitchField,
  getWorkflowCountField,
  getWorkflowDurationField,
  getWorkflowEnumValues,
  getWorkflowMediaFields,
  getWorkflowNumericValues,
  getWorkflowResolutionField,
  getWorkflowSchemaFields,
  getWorkflowWebSearchField,
  isWorkflowManagedSchemaField,
  isWorkflowSchemaFieldHidden,
  workflowMediaFieldLimits,
  type WorkflowSchemaField,
} from "./workflow-model-schema";

type WorkflowChoice = {
  id: string;
  label: string;
  isDefault?: boolean;
  config?: Record<string, unknown>;
};

type ChoiceKind = "aspect" | "resolution" | "duration" | "count";

const FIXED_GENERATION_COUNTS = ["1", "2", "4"] as const;
const STANDARD_VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

function normalizeChoiceValue(value: unknown) {
  return String(value ?? "").trim();
}

function choiceLabel(kind: ChoiceKind, value: string) {
  if (kind === "duration" && /^\d+(?:\.\d+)?$/.test(value)) return value + "s";
  return value;
}

function endpointModes(
  family: WorkflowModelFamily,
  routes: WorkflowEndpointRoute[],
  endpoint: Model,
) {
  return Array.from(
    new Set(
      routes
        .filter((route) => route.endpoint.model_id === endpoint.model_id)
        .map((route) =>
          family.category === "video" || family.category === "avatar"
            ? route.mode
            : family.category === "audio"
              ? endpoint.model_id
              : getWorkflowRouteMethodId(route),
        ),
    ),
  );
}

function fieldForChoice(endpoint: Model, kind: ChoiceKind) {
  if (kind === "aspect") return getWorkflowAspectRatioField(endpoint);
  if (kind === "resolution") return getWorkflowResolutionField(endpoint);
  if (kind === "duration") return getWorkflowDurationField(endpoint);
  return getWorkflowCountField(endpoint);
}

function valuesForField(
  field: WorkflowSchemaField | undefined,
  kind: ChoiceKind,
) {
  if (!field) return [];
  const enumValues = getWorkflowEnumValues(field.property);
  if (enumValues.length > 0)
    return enumValues.map(normalizeChoiceValue).filter(Boolean);
  if (kind === "duration" || kind === "count") {
    return getWorkflowNumericValues(
      field.property,
      kind === "duration" ? 20 : 16,
    )
      .map(normalizeChoiceValue)
      .filter(Boolean);
  }
  const configured = normalizeChoiceValue(field.property.default);
  return configured ? [configured] : [];
}

function mergeChoice(
  target: Map<string, WorkflowChoice>,
  next: WorkflowChoice,
  methods: string[],
  defaultForMethods: string[],
) {
  const key = next.id.toLowerCase();
  const current = target.get(key);
  const currentMethods = Array.isArray(current?.config?.methods)
    ? (current?.config?.methods as string[])
    : [];
  const currentDefaultMethods = Array.isArray(current?.config?.defaultMethods)
    ? (current?.config?.defaultMethods as string[])
    : [];
  const currentEndpointIds = Array.isArray(current?.config?.endpointIds)
    ? (current.config.endpointIds as string[])
    : [];
  const nextEndpointIds = Array.isArray(next.config?.endpointIds)
    ? (next.config.endpointIds as string[])
    : [];
  target.set(key, {
    ...(current || next),
    isDefault: Boolean(current?.isDefault || next.isDefault),
    config: {
      ...(current?.config || {}),
      ...(next.config || {}),
      endpointIds: Array.from(
        new Set([...currentEndpointIds, ...nextEndpointIds]),
      ),
      methods: Array.from(new Set([...currentMethods, ...methods])),
      defaultMethods: Array.from(
        new Set([...currentDefaultMethods, ...defaultForMethods]),
      ),
    },
  });
}

function familyChoices(
  family: WorkflowModelFamily,
  routes: WorkflowEndpointRoute[],
  kind: ChoiceKind,
) {
  const choices = new Map<string, WorkflowChoice>();
  for (const endpoint of family.endpoints) {
    const field = fieldForChoice(endpoint, kind);
    if (field && isWorkflowSchemaFieldHidden(field)) continue;
    const methods =
      family.category === "video" ||
      family.category === "avatar" ||
      family.category === "image" ||
      family.category === "audio"
        ? endpointModes(family, routes, endpoint)
        : [];
    const values = valuesForField(field, kind);
    const defaultValue = normalizeChoiceValue(
      field?.property.default,
    ).toLowerCase();
    for (const value of values) {
      const isDefault = Boolean(
        defaultValue && value.toLowerCase() === defaultValue,
      );
      mergeChoice(
        choices,
        {
          id: value,
          label: choiceLabel(kind, value),
          isDefault,
          config: { endpointIds: [endpoint.model_id] },
        },
        methods,
        isDefault ? methods : [],
      );
    }
  }
  return Array.from(choices.values());
}

function choiceSupportsMethod(choice: WorkflowChoice, method: string) {
  const methods = Array.isArray(choice.config?.methods)
    ? (choice.config?.methods as string[])
    : [];
  return methods.length === 0 || methods.includes(method);
}

function familyAspectChoices(
  family: WorkflowModelFamily,
  routes: WorkflowEndpointRoute[],
) {
  const schemaChoices = familyChoices(family, routes, "aspect");
  if (family.category !== "video") return schemaChoices;

  const methods = Array.from(new Set(routes.map((route) => route.mode)));
  const fallbackChoices: WorkflowChoice[] =
    schemaChoices.length > 0
      ? schemaChoices
      : STANDARD_VIDEO_ASPECT_RATIOS.map((ratio) => ({
          id: ratio,
          label: ratio,
          isDefault: ratio === "16:9",
          config: { uiOnly: true },
        }));
  const defaultChoice =
    fallbackChoices.find((choice) => choice.isDefault) ||
    fallbackChoices.find((choice) => choice.id === "16:9") ||
    fallbackChoices[0];
  const choices = new Map(
    schemaChoices.map((choice) => [choice.id.toLowerCase(), choice]),
  );

  for (const method of methods) {
    if (schemaChoices.some((choice) => choiceSupportsMethod(choice, method))) {
      continue;
    }
    for (const choice of fallbackChoices) {
      mergeChoice(
        choices,
        {
          ...choice,
          config: {
            ...(choice.config || {}),
            uiOnly: true,
          },
        },
        [method],
        choice.id === defaultChoice?.id ? [method] : [],
      );
    }
  }

  return Array.from(choices.values());
}

function fixedGenerationCounts(family: WorkflowModelFamily) {
  if (family.category !== "image" && family.category !== "video") {
    return undefined;
  }
  return FIXED_GENERATION_COUNTS.map((count) => ({
    id: count,
    label: count,
    isDefault: count === "1",
  }));
}

function audioModeLabel(endpoint: Model) {
  const id = endpoint.model_id.toLowerCase();
  if (id.includes("voice-clone") || id.includes("clone")) return "音色克隆";
  if (id.includes("voice-design")) return "音色设计";
  if (id.includes("generate-song")) return "歌曲生成";
  if (id.includes("generate-bgm")) return "背景音乐";
  if (id.includes("music-cover") || id.includes("cover")) return "音乐翻唱";
  if (id.includes("music") || id.includes("ace-step")) return "音乐生成";
  if (id.includes("-turbo")) return "极速";
  if (id.includes("-hd")) return "高清";
  if (
    id.includes("text-to-speech") ||
    id.includes("eleven-v3") ||
    id.includes("multilingual")
  ) {
    return "文字转语音";
  }
  return endpoint.type?.toLowerCase().includes("music")
    ? "音乐生成"
    : "语音生成";
}

function familyAudioMethods(family: WorkflowModelFamily) {
  const curatedProduct = findCuratedGeneratorProduct(
    "audio",
    family.endpoints[0]?.model_id,
  );
  const endpoints = [...family.endpoints].sort((a, b) => {
    const aRank = curatedProduct?.endpoints.indexOf(a.model_id) ?? -1;
    const bRank = curatedProduct?.endpoints.indexOf(b.model_id) ?? -1;
    if (aRank >= 0 && bRank >= 0 && aRank !== bRank) return aRank - bRank;
    if (aRank >= 0) return -1;
    if (bRank >= 0) return 1;
    return a.model_id.localeCompare(b.model_id);
  });
  const defaultEndpoint = endpoints[0];
  return endpoints.map((endpoint) => ({
    id: endpoint.model_id,
    label: audioModeLabel(endpoint),
    isDefault: endpoint.model_id === defaultEndpoint?.model_id,
    config: {
      endpointId: endpoint.model_id,
      endpointIds: [endpoint.model_id],
      routeMode: "audio",
      isDefault: endpoint.model_id === defaultEndpoint?.model_id,
    },
  }));
}

function familyMethods(
  family: WorkflowModelFamily,
  routes: WorkflowEndpointRoute[],
) {
  if (family.category === "audio") return familyAudioMethods(family);
  if (family.category !== "video" && family.category !== "avatar")
    return undefined;
  const uniqueRoutes = new Map<string, WorkflowEndpointRoute>();
  for (const route of routes) {
    uniqueRoutes.set(getWorkflowRouteMethodId(route), route);
  }
  const routeList = Array.from(uniqueRoutes.values());
  const routesByMode = new Map<string, WorkflowEndpointRoute[]>();
  for (const route of routeList) {
    routesByMode.set(route.mode, [
      ...(routesByMode.get(route.mode) || []),
      route,
    ]);
  }
  const defaultRoute = [...routeList].sort(
    (a, b) =>
      getWorkflowVideoModeOrder(a.mode) - getWorkflowVideoModeOrder(b.mode) ||
      Number(b.endpoint.sort_order || 0) - Number(a.endpoint.sort_order || 0) ||
      a.endpoint.model_id.localeCompare(b.endpoint.model_id),
  )[0];
  return Array.from(routesByMode.entries())
    .map(([mode, modeRoutes]) => {
      const route = [...modeRoutes].sort(
        (a, b) =>
          Number(b.endpoint.sort_order || 0) -
            Number(a.endpoint.sort_order || 0) ||
          a.endpoint.model_id.localeCompare(b.endpoint.model_id),
      )[0];
      const endpointIds = modeRoutes.map((item) => item.endpoint.model_id);
      const isDefault = modeRoutes.some((item) => item === defaultRoute);
      return {
        id: mode,
        label: route.label,
        isDefault,
        config: {
          ...route.config,
          routeMode: route.mode,
          endpointId: route.endpoint.model_id,
          endpointIds,
          routeAlternatives: modeRoutes.map((item) => ({
            endpointId: item.endpoint.model_id,
            config: item.config,
          })),
          isDefault,
        },
      };
    })
    .sort(
      (a, b) =>
        getWorkflowVideoModeOrder(String(a.config.routeMode)) -
          getWorkflowVideoModeOrder(String(b.config.routeMode)) ||
        a.label.localeCompare(b.label),
    );
}

function extraControl(field: WorkflowSchemaField) {
  if (getWorkflowEnumValues(field.property).length > 0)
    return "select" as const;
  if (field.property.type === "boolean") return "boolean" as const;
  if (field.property.type === "number" || field.property.type === "integer") {
    return "number" as const;
  }
  return "text" as const;
}

function familyExtraParameters(
  family: WorkflowModelFamily,
  routes: WorkflowEndpointRoute[],
) {
  const definitions = new Map<string, any>();
  for (const endpoint of family.endpoints) {
    const methods =
      family.category === "video" ||
      family.category === "avatar" ||
      family.category === "image" ||
      family.category === "audio"
        ? endpointModes(family, routes, endpoint)
        : [];
    for (const field of getWorkflowSchemaFields(endpoint)) {
      if (isWorkflowManagedSchemaField(field)) continue;
      const values = getWorkflowEnumValues(field.property).map(
        normalizeChoiceValue,
      );
      const definitionKey = JSON.stringify({
        key: field.key,
        type: field.property.type,
        values,
        defaultValue: field.property.default,
        minimum: field.property.minimum,
        maximum: field.property.maximum,
        step: field.property.step,
        required: field.required,
      });
      const current = definitions.get(definitionKey);
      const supportedMethods = Array.from(
        new Set([...(current?.config?.methods || []), ...methods]),
      );
      const options = values.map((value) => ({
        id: value,
        label: value,
        isDefault: normalizeChoiceValue(field.property.default) === value,
        config: {
          methods: supportedMethods,
        },
      }));
      definitions.set(definitionKey, {
        type: field.key,
        label: formatWorkflowSchemaFieldLabel(field),
        control: extraControl(field),
        placeholder: field.property["x-placeholder"],
        defaultValue: field.property.default,
        config: {
          methods: supportedMethods,
          min: field.property.minimum,
          max: field.property.maximum,
          step: field.property.step,
          required: field.required,
        },
        options,
      });
    }
  }
  return Array.from(definitions.values());
}

function inferModelFamily(family: WorkflowModelFamily) {
  const id = family.key.toLowerCase();
  if (id.includes("kling")) return "kling";
  if (id.includes("vidu")) return "vidu";
  if (id.includes("veo")) return "veo";
  if (id.includes("hailuo") || id.includes("minimax")) return "hailuo";
  if (id.includes("seedance") || id.includes("doubao")) return "doubao";
  if (id.includes("jimeng")) return "jimeng";
  return "generic";
}

function maximumMediaItems(
  family: WorkflowModelFamily,
  kind: "image" | "video",
) {
  const maximums = family.endpoints.flatMap((endpoint) =>
    getWorkflowMediaFields(endpoint, kind).map(
      (field) => workflowMediaFieldLimits(field).maximum,
    ),
  );
  const finite = maximums.filter(Number.isFinite);
  return finite.length > 0 ? Math.max(...finite) : undefined;
}

function defaultSound(family: WorkflowModelFamily) {
  const fields = family.endpoints
    .map(getWorkflowAudioSwitchField)
    .filter(Boolean) as WorkflowSchemaField[];
  if (fields.length === 0) return undefined;
  return fields.some((field) => field.property.default === true);
}

export function mapWorkflowFamilyToDynamicModel(
  family: WorkflowModelFamily,
  isDefault = false,
): DynamicModel {
  const routes = getWorkflowFamilyRoutes(family);
  const methods = familyMethods(family, routes);
  const aspectRatios = familyAspectChoices(family, routes);
  const resolutions = familyChoices(family, routes, "resolution");
  const durations = familyChoices(family, routes, "duration");
  const counts =
    fixedGenerationCounts(family) || familyChoices(family, routes, "count");
  const supportsSound = family.endpoints.some((endpoint) =>
    Boolean(getWorkflowAudioSwitchField(endpoint)),
  );
  const supportsWebSearch = family.endpoints.some((endpoint) =>
    Boolean(getWorkflowWebSearchField(endpoint)),
  );
  const basePrice = Number(family.representative.base_price);
  const cost = Number.isFinite(basePrice) ? basePrice : undefined;
  const routeModes = new Set(routes.map((route) => route.mode));
  const supportsReferenceImages = family.endpoints.some(
    (endpoint) => getWorkflowMediaFields(endpoint, "image").length > 0,
  );
  const supportsReferenceVideo = family.endpoints.some(
    (endpoint) => getWorkflowMediaFields(endpoint, "video").length > 0,
  );
  const supportsReferenceAudio = family.endpoints.some(
    (endpoint) => getWorkflowMediaFields(endpoint, "audio").length > 0,
  );

  return {
    id: family.runtimeId,
    runtimeId: family.runtimeId,
    modelId: family.key,
    name: family.name,
    category: family.category,
    provider: family.providerKey,
    providerKey: family.providerKey,
    providerLabel:
      family.providerKey === "wavespeed" ? "WaveSpeed" : "zaomeng.art",
    description: family.description,
    cost,
    imageCost: family.category === "image" ? cost : undefined,
    videoCost:
      family.category === "video" || family.category === "avatar"
        ? cost
        : undefined,
    threeDCost: family.category === "3d" ? cost : undefined,
    isDefault,
    parameters: {
      aspectRatios: aspectRatios.length > 0 ? aspectRatios : undefined,
      resolutions: resolutions.length > 0 ? resolutions : undefined,
      durations: durations.length > 0 ? durations : undefined,
      counts: counts.length > 0 ? counts : undefined,
      methods,
      modelFamily: inferModelFamily(family),
      extraParameters: familyExtraParameters(family, routes),
      supportsFirstFrame: routeModes.has("first_frame"),
      supportsEndFrame:
        routeModes.has("start_end") || routeModes.has("last_frame"),
      supportsMotionControl: routeModes.has("motion_control"),
      supportsAudio: supportsReferenceAudio,
      supportsExtend: routeModes.has("extend"),
      supportsReferenceImages,
      supportsVideoEdit: routeModes.has("edit"),
      supportsSound,
      defaultSound: supportsSound ? defaultSound(family) === true : undefined,
      supportsReferenceAudio,
      supportsWebSearch,
      defaultWebSearch: false,
      supportsReferenceVideo,
      supportsVideoInput: supportsReferenceVideo,
      maxReferenceImages: maximumMediaItems(family, "image"),
      maxReferenceVideos: maximumMediaItems(family, "video"),
      executionContract: {
        execution: "wavespeed-family-route",
        familyId: family.key,
        routes: routes.map((route) => ({
          methodId: getWorkflowRouteMethodId(route),
          mode: route.mode,
          endpointId: route.endpoint.model_id,
          config: route.config,
        })),
      },
    },
  } as DynamicModel;
}
