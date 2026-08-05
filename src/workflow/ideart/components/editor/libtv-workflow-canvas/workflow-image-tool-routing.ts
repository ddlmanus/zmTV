import {
  fetchWorkflowModelOptions,
  getWorkflowModelExecutionRoutes,
  getWorkflowModelOptionValue,
  resolveWorkflowModelOptionById,
  type WorkflowModelOption,
} from "../libtv-workflow-surface/workflow-models";

function imageEditRoute(model: WorkflowModelOption | null | undefined) {
  return getWorkflowModelExecutionRoutes(model).find((route) => {
    if (route.mode !== "image-to-image") return false;
    const bindings = Array.isArray(route.config?.mediaBindings)
      ? route.config.mediaBindings
      : [];
    return !bindings.some(
      (binding: any) =>
        binding?.required === true &&
        String(binding?.role || "").toLowerCase() === "mask",
    );
  });
}

export async function resolveWorkflowImageToolRoute(preferredModelId?: string) {
  const preferredId = String(preferredModelId || "").trim();
  if (preferredId) {
    const preferred = await resolveWorkflowModelOptionById(
      "image",
      preferredId,
    );
    const route = imageEditRoute(preferred);
    if (preferred && route) {
      return {
        modelId: getWorkflowModelOptionValue(preferred),
        methodId: route.methodId,
        model: preferred,
      };
    }
  }

  const models = await fetchWorkflowModelOptions("image");
  const ordered = [
    ...models.filter((model) => model.isDefault),
    ...models.filter((model) => !model.isDefault),
  ];
  for (const model of ordered) {
    const route = imageEditRoute(model);
    const modelId = getWorkflowModelOptionValue(model);
    if (route && modelId) return { modelId, methodId: route.methodId, model };
  }
  throw new Error("当前供应商没有支持图生图的图片模型");
}
