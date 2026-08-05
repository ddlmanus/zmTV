export type WorkflowPredictionMediaKind = "image" | "video" | "audio" | "3d";

const TASK_TYPE_PREFIX = "wavespeed-compatible-";

export function workflowPredictionTaskType(kind: WorkflowPredictionMediaKind) {
  return TASK_TYPE_PREFIX + kind;
}

export function isWorkflowPredictionTaskType(
  value: unknown,
  kind?: WorkflowPredictionMediaKind,
) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized.startsWith(TASK_TYPE_PREFIX)) return false;
  return kind ? normalized === workflowPredictionTaskType(kind) : true;
}

function splitTaskIds(value: unknown) {
  return String(value || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function resolveWorkflowPredictionTaskIds(source: {
  taskIds?: unknown;
  taskId?: unknown;
}) {
  const ids = Array.isArray(source.taskIds)
    ? source.taskIds.flatMap(splitTaskIds)
    : splitTaskIds(source.taskIds);
  ids.push(...splitTaskIds(source.taskId));
  return Array.from(new Set(ids));
}
