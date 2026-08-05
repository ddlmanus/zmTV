import { useEffect, useMemo, useState } from "react";
import {
  preloadModels,
  type DynamicModel,
} from "@/workflow/ideart/lib/hooks/useModels";
import {
  normalizeWorkflowExtraParameterDefinitions,
  resolveWorkflowExtraParameterValues,
  type WorkflowExtraParameterDefinition,
  type WorkflowExtraParameterValue,
} from "../workflow-extra-parameters";

export type WorkflowImageToolChoice = {
  value: string;
  label: string;
  config?: Record<string, any>;
  isDefault?: boolean;
};

export type WorkflowImageToolRoute = {
  methodId: string;
  mode: string;
  endpointId: string;
  config: Record<string, any>;
};

export type WorkflowImageToolModel = DynamicModel & {
  parameters?: DynamicModel["parameters"] & {
    executionContract?: { routes?: WorkflowImageToolRoute[] };
  };
};

type WorkflowImageToolSettingsOptions = {
  initialModelId?: string;
  initialAspectRatio?: string;
  initialResolution?: string;
  initialCount?: number;
  initialExtraParameters?: Record<string, WorkflowExtraParameterValue>;
  initialWebSearch?: boolean;
  requireMask?: boolean;
};

function normalizeValue(value: unknown) {
  return String(value || "").trim();
}

export function getWorkflowImageToolModelValue(
  model: WorkflowImageToolModel | null | undefined,
) {
  return (
    normalizeValue(model?.runtimeId) ||
    normalizeValue(model?.id) ||
    normalizeValue(model?.modelId)
  );
}

function workflowImageToolModelMatches(
  model: WorkflowImageToolModel,
  value: unknown,
) {
  const target = normalizeValue(value).toLowerCase();
  if (!target) return false;
  return [model.runtimeId, model.id, model.modelId].some(
    (candidate) => normalizeValue(candidate).toLowerCase() === target,
  );
}

function getWorkflowImageToolRoutes(model: WorkflowImageToolModel | null) {
  const routes = model?.parameters?.executionContract?.routes;
  return Array.isArray(routes)
    ? routes.filter((route): route is WorkflowImageToolRoute =>
        Boolean(
          normalizeValue(route?.methodId) &&
          normalizeValue(route?.mode) &&
          normalizeValue(route?.endpointId),
        ),
      )
    : [];
}

export function workflowImageToolRouteSupportsMask(
  route: WorkflowImageToolRoute | null | undefined,
) {
  const bindings = Array.isArray(route?.config?.mediaBindings)
    ? route?.config?.mediaBindings
    : [];
  return bindings.some(
    (binding: any) =>
      String(binding?.role || "").toLowerCase() === "mask" &&
      Array.isArray(binding?.kinds) &&
      binding.kinds.includes("image"),
  );
}

function workflowImageToolRouteRequiresMask(
  route: WorkflowImageToolRoute | null | undefined,
) {
  const bindings = Array.isArray(route?.config?.mediaBindings)
    ? route?.config?.mediaBindings
    : [];
  return bindings.some(
    (binding: any) =>
      binding?.required === true &&
      String(binding?.role || "").toLowerCase() === "mask" &&
      Array.isArray(binding?.kinds) &&
      binding.kinds.includes("image"),
  );
}

export function resolveWorkflowImageToolRoute(
  model: WorkflowImageToolModel | null,
  requireMask = false,
) {
  const routes = getWorkflowImageToolRoutes(model).filter(
    (route) => route.mode === "image-to-image",
  );
  if (routes.length === 0) return null;
  const maskRoute = routes.find(workflowImageToolRouteSupportsMask);
  if (requireMask) return maskRoute || null;
  return (
    routes.find((route) => !workflowImageToolRouteRequiresMask(route)) || null
  );
}

function workflowImageToolReferenceLimit(route: WorkflowImageToolRoute | null) {
  const configuredMaximum = Number(route?.config?.imageUrls?.max);
  if (Number.isFinite(configuredMaximum)) {
    return Math.max(0, Math.floor(configuredMaximum) - 1);
  }
  const bindings = Array.isArray(route?.config?.mediaBindings)
    ? route.config.mediaBindings
    : [];
  const imageBindings = bindings.filter(
    (binding: any) =>
      String(binding?.role || "").toLowerCase() !== "mask" &&
      Array.isArray(binding?.kinds) &&
      binding.kinds.includes("image"),
  );
  if (imageBindings.length === 0) return 0;
  if (
    imageBindings.some(
      (binding: any) =>
        binding?.array === true && !Number.isFinite(Number(binding?.maximum)),
    )
  ) {
    return 5;
  }
  const totalMaximum = imageBindings.reduce((total: number, binding: any) => {
    const maximum = Number(binding?.maximum);
    return total + (Number.isFinite(maximum) ? Math.max(0, maximum) : 1);
  }, 0);
  return Math.max(0, Math.floor(totalMaximum) - 1);
}

function choiceSupportsMethod(
  choice: { config?: Record<string, any> },
  methodId: string,
) {
  const methods = Array.isArray(choice.config?.methods)
    ? choice.config?.methods
    : choice.config?.modes;
  if (!Array.isArray(methods) || methods.length === 0 || !methodId) return true;
  const normalizedMethod = methodId.toLowerCase();
  return methods.some(
    (method: unknown) =>
      normalizeValue(method).toLowerCase() === normalizedMethod,
  );
}

function normalizeChoices(
  items:
    | Array<{
        id?: string;
        label?: string;
        isDefault?: boolean;
        config?: Record<string, any>;
      }>
    | undefined,
  methodId: string,
  labelSuffix = "",
) {
  const seen = new Set<string>();
  return (items || [])
    .filter((item) => choiceSupportsMethod(item, methodId))
    .flatMap((item): WorkflowImageToolChoice[] => {
      const value = normalizeValue(item.id);
      if (!value || seen.has(value.toLowerCase())) return [];
      seen.add(value.toLowerCase());
      const label = normalizeValue(item.label || value);
      return [
        {
          value,
          label: labelSuffix ? `${label}${labelSuffix}` : label,
          config: item.config,
          isDefault: Boolean(item.isDefault || item.config?.isDefault),
        },
      ];
    });
}

function isDefaultChoice(item: WorkflowImageToolChoice, methodId: string) {
  if (item.isDefault || item.config?.isDefault === true) return true;
  const defaultMethods = Array.isArray(item.config?.defaultMethods)
    ? item.config.defaultMethods
    : [];
  return defaultMethods.some(
    (method: unknown) =>
      normalizeValue(method).toLowerCase() === methodId.toLowerCase(),
  );
}

function resolveChoice(
  current: unknown,
  choices: WorkflowImageToolChoice[],
  methodId: string,
) {
  const selected = normalizeValue(current);
  if (choices.some((choice) => choice.value === selected)) return selected;
  return (
    choices.find((choice) => isDefaultChoice(choice, methodId))?.value ||
    choices[0]?.value ||
    ""
  );
}

function isQualityDefinition(definition: WorkflowExtraParameterDefinition) {
  const identity = `${definition.type} ${definition.label}`.toLowerCase();
  return identity.includes("quality") || identity.includes("画质");
}

function qualityChoices(
  definition: WorkflowExtraParameterDefinition | undefined,
) {
  return (definition?.options || []).flatMap(
    (option): WorkflowImageToolChoice[] => {
      const value = normalizeValue(option.id);
      if (!value) return [];
      return [
        {
          value,
          label: normalizeValue(option.label || value),
          config: option.config,
          isDefault: Boolean(option.isDefault || option.config?.isDefault),
        },
      ];
    },
  );
}

export function useWorkflowImageToolSettings(
  options: WorkflowImageToolSettingsOptions = {},
) {
  const [models, setModels] = useState<WorkflowImageToolModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState("");
  const [modelId, setModelId] = useState(
    normalizeValue(options.initialModelId),
  );
  const [aspectRatio, setAspectRatio] = useState(
    normalizeValue(options.initialAspectRatio),
  );
  const [resolution, setResolution] = useState(
    normalizeValue(options.initialResolution),
  );
  const [count, setCount] = useState(
    options.initialCount ? String(Math.max(1, options.initialCount)) : "",
  );
  const [extraParameters, setExtraParameters] = useState<
    Record<string, WorkflowExtraParameterValue>
  >(() => ({ ...(options.initialExtraParameters || {}) }));
  const [enableWebSearch, setEnableWebSearch] = useState<boolean | undefined>(
    options.initialWebSearch,
  );

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    setModelsError("");
    preloadModels()
      .then((catalog) => {
        if (cancelled) return;
        const imageModels = (catalog as WorkflowImageToolModel[]).filter(
          (model) =>
            String(model.category || "").toLowerCase() === "image" &&
            Boolean(
              resolveWorkflowImageToolRoute(
                model,
                Boolean(options.requireMask),
              ),
            ),
        );
        setModels(imageModels);
        if (imageModels.length === 0) {
          setModelsError(
            options.requireMask
              ? "当前模型目录没有支持蒙版重绘的图片模型"
              : "当前模型目录没有支持图生图的图片模型",
          );
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setModelsError(
            error instanceof Error ? error.message : "图片模型加载失败",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [options.requireMask]);

  const selectedModel = useMemo(
    () =>
      models.find((model) => workflowImageToolModelMatches(model, modelId)) ||
      models.find((model) => model.isDefault) ||
      models[0] ||
      null,
    [modelId, models],
  );
  const selectedModelValue = getWorkflowImageToolModelValue(selectedModel);
  const route = useMemo(
    () =>
      resolveWorkflowImageToolRoute(
        selectedModel,
        Boolean(options.requireMask),
      ),
    [options.requireMask, selectedModel],
  );
  const methodId = normalizeValue(route?.methodId);
  const aspectOptions = useMemo(
    () => normalizeChoices(selectedModel?.parameters?.aspectRatios, methodId),
    [methodId, selectedModel?.parameters?.aspectRatios],
  );
  const resolutionOptions = useMemo(
    () => normalizeChoices(selectedModel?.parameters?.resolutions, methodId),
    [methodId, selectedModel?.parameters?.resolutions],
  );
  const countOptions = useMemo(
    () =>
      normalizeChoices(selectedModel?.parameters?.counts, methodId, "张").sort(
        (a, b) => Number(a.value) - Number(b.value),
      ),
    [methodId, selectedModel?.parameters?.counts],
  );
  const extraParameterDefinitions = useMemo(
    () =>
      normalizeWorkflowExtraParameterDefinitions(
        selectedModel?.parameters?.extraParameters,
        methodId,
      ),
    [methodId, selectedModel?.parameters?.extraParameters],
  );
  const qualityDefinition = useMemo(
    () => extraParameterDefinitions.find(isQualityDefinition),
    [extraParameterDefinitions],
  );
  const qualityOptions = useMemo(
    () => qualityChoices(qualityDefinition),
    [qualityDefinition],
  );
  const advancedDefinitions = useMemo(
    () =>
      extraParameterDefinitions.filter((item) => !isQualityDefinition(item)),
    [extraParameterDefinitions],
  );
  const supportsWebSearch = route?.config?.supportsWebSearch === true;
  const maxReferenceImages = useMemo(
    () => workflowImageToolReferenceLimit(route),
    [route],
  );

  useEffect(() => {
    if (!selectedModelValue || selectedModelValue === modelId) return;
    setModelId(selectedModelValue);
  }, [modelId, selectedModelValue]);

  useEffect(() => {
    setAspectRatio((current) =>
      resolveChoice(current, aspectOptions, methodId),
    );
    setResolution((current) =>
      resolveChoice(current, resolutionOptions, methodId),
    );
    setCount((current) => resolveChoice(current, countOptions, methodId));
  }, [aspectOptions, countOptions, methodId, resolutionOptions]);

  useEffect(() => {
    setExtraParameters((current) => {
      const next = resolveWorkflowExtraParameterValues(
        extraParameterDefinitions,
        current,
        { fillDefaults: true },
      );
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [extraParameterDefinitions]);

  useEffect(() => {
    if (!supportsWebSearch) {
      setEnableWebSearch(undefined);
      return;
    }
    setEnableWebSearch((current) =>
      typeof current === "boolean"
        ? current
        : route?.config?.defaultWebSearch === true,
    );
  }, [route?.config?.defaultWebSearch, supportsWebSearch]);

  const quality = qualityDefinition
    ? normalizeValue(extraParameters[qualityDefinition.type])
    : "";
  const setQuality = (value: string) => {
    if (!qualityDefinition) return;
    setExtraParameters((current) => ({
      ...current,
      [qualityDefinition.type]: value,
    }));
  };

  return {
    models,
    modelsLoading,
    modelsError,
    modelId: selectedModelValue || modelId,
    setModelId,
    selectedModel,
    route,
    methodId,
    aspectOptions,
    aspectRatio,
    setAspectRatio,
    resolutionOptions,
    resolution,
    setResolution,
    countOptions,
    count,
    setCount,
    qualityDefinition,
    qualityOptions,
    quality,
    setQuality,
    advancedDefinitions,
    extraParameters,
    setExtraParameters,
    supportsWebSearch,
    maxReferenceImages,
    enableWebSearch,
    setEnableWebSearch,
  };
}
