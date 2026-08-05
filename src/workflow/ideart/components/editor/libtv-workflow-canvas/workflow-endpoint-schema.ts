export type WorkflowEndpointChoice = {
  id?: string;
  isDefault?: boolean;
  config?: Record<string, any>;
};

export type WorkflowEndpointModel = {
  parameters?: {
    aspectRatios?: WorkflowEndpointChoice[];
    resolutions?: WorkflowEndpointChoice[];
    durations?: WorkflowEndpointChoice[];
    counts?: WorkflowEndpointChoice[];
    methods?: WorkflowEndpointChoice[];
    modes?: WorkflowEndpointChoice[];
    supportsSound?: boolean;
    defaultSound?: boolean;
    supportsWebSearch?: boolean;
    defaultWebSearch?: boolean;
    executionContract?: Record<string, any>;
  };
};

export type WorkflowVideoEndpointSelection = {
  methodId: string;
  routeMode: string;
  aspectRatio?: string;
  resolution?: string;
  duration?: string;
  generationCount?: number;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
};

function normalizeEndpointValue(value: unknown) {
  return String(value || "").trim();
}

function getChoiceMethods(choice: WorkflowEndpointChoice) {
  const methods = Array.isArray(choice.config?.methods)
    ? choice.config?.methods
    : choice.config?.modes;
  return Array.isArray(methods)
    ? methods.map(normalizeEndpointValue).filter(Boolean)
    : [];
}

function choiceSupportsMethod(
  choice: WorkflowEndpointChoice,
  methodId: string,
) {
  const methods = getChoiceMethods(choice);
  if (methods.length === 0 || !methodId) return true;
  const normalizedMethod = methodId.toLowerCase();
  return methods.some((method) => method.toLowerCase() === normalizedMethod);
}

function choiceIsDefault(choice: WorkflowEndpointChoice, methodId: string) {
  if (choice.isDefault || choice.config?.isDefault === true) return true;
  const defaultMethods = Array.isArray(choice.config?.defaultMethods)
    ? choice.config.defaultMethods.map(normalizeEndpointValue)
    : [];
  const normalizedMethod = methodId.toLowerCase();
  return defaultMethods.some(
    (method: string) => method.toLowerCase() === normalizedMethod,
  );
}

export function resolveWorkflowEndpointChoice(
  value: unknown,
  choices: WorkflowEndpointChoice[] | undefined,
  methodId: string,
) {
  const supportedChoices = (choices || []).filter(
    (choice) =>
      normalizeEndpointValue(choice.id) &&
      choiceSupportsMethod(choice, methodId),
  );
  if (supportedChoices.length === 0) return undefined;

  const selectedValue = normalizeEndpointValue(value);
  const selectedChoice = supportedChoices.find(
    (choice) => normalizeEndpointValue(choice.id) === selectedValue,
  );
  const resolvedChoice =
    selectedChoice ||
    supportedChoices.find((choice) => choiceIsDefault(choice, methodId)) ||
    supportedChoices[0];
  return normalizeEndpointValue(resolvedChoice?.id) || undefined;
}

function getWorkflowEndpointMethodChoice(
  model: WorkflowEndpointModel | null | undefined,
  methodId: string,
) {
  const parameters = model?.parameters;
  const choices = Array.isArray(parameters?.methods)
    ? parameters.methods
    : parameters?.modes;
  return (choices || []).find(
    (choice) => normalizeEndpointValue(choice.id) === methodId,
  );
}

function getWorkflowEndpointRoute(
  model: WorkflowEndpointModel | null | undefined,
  methodId: string,
) {
  const routes = model?.parameters?.executionContract?.routes;
  if (!Array.isArray(routes)) return null;
  return (
    routes.find(
      (route: any) => normalizeEndpointValue(route?.methodId) === methodId,
    ) || null
  );
}

function resolveEndpointToggle(
  value: unknown,
  supported: boolean,
  defaultValue: unknown,
) {
  if (!supported) return undefined;
  return typeof value === "boolean" ? value : defaultValue === true;
}

export function resolveWorkflowVideoEndpointSelection(params: {
  model: WorkflowEndpointModel | null | undefined;
  methodId: string;
  aspectRatio?: unknown;
  resolution?: unknown;
  duration?: unknown;
  generationCount?: unknown;
  generateAudio?: unknown;
  enableWebSearch?: unknown;
}): WorkflowVideoEndpointSelection {
  const methodId = normalizeEndpointValue(params.methodId);
  const parameters = params.model?.parameters;
  const methodChoice = getWorkflowEndpointMethodChoice(params.model, methodId);
  const route = getWorkflowEndpointRoute(params.model, methodId);
  const config = {
    ...(route?.config && typeof route.config === "object" ? route.config : {}),
    ...(methodChoice?.config && typeof methodChoice.config === "object"
      ? methodChoice.config
      : {}),
  };
  const routeMode =
    normalizeEndpointValue(config.routeMode) ||
    normalizeEndpointValue(route?.mode) ||
    normalizeEndpointValue(methodId.split("::")[0]);
  const countValue = resolveWorkflowEndpointChoice(
    params.generationCount,
    parameters?.counts,
    methodId,
  );
  const parsedCount = Number.parseInt(countValue || "", 10);
  const hasEndpointConfig = Boolean(methodChoice || route);
  const supportsSound = hasEndpointConfig
    ? config.supportsSound === true
    : parameters?.supportsSound === true;
  const supportsWebSearch = hasEndpointConfig
    ? config.supportsWebSearch === true
    : parameters?.supportsWebSearch === true;
  return {
    methodId,
    routeMode,
    aspectRatio: resolveWorkflowEndpointChoice(
      params.aspectRatio,
      parameters?.aspectRatios,
      methodId,
    ),
    resolution: resolveWorkflowEndpointChoice(
      params.resolution,
      parameters?.resolutions,
      methodId,
    ),
    duration: resolveWorkflowEndpointChoice(
      params.duration,
      parameters?.durations,
      methodId,
    ),
    generationCount:
      Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : undefined,
    generateAudio: resolveEndpointToggle(
      params.generateAudio,
      supportsSound,
      config.defaultSound ?? parameters?.defaultSound,
    ),
    enableWebSearch: resolveEndpointToggle(
      params.enableWebSearch,
      supportsWebSearch,
      config.defaultWebSearch ?? parameters?.defaultWebSearch,
    ),
  };
}
