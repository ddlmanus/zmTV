function errorRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getWorkflowErrorMessage(
  value: unknown,
  fallback = "请求失败",
): string {
  if (value instanceof Error && value.message.trim())
    return value.message.trim();
  if (typeof value === "string" && value.trim()) return value.trim();

  const root = errorRecord(value);
  if (root) {
    for (const candidate of [
      root.message,
      root.error,
      errorRecord(root.error)?.message,
      root.detail,
      errorRecord(root.detail)?.message,
      errorRecord(root.data)?.message,
      errorRecord(errorRecord(root.data)?.error)?.message,
    ]) {
      const message = getWorkflowErrorMessage(candidate, "");
      if (message) return message;
    }
  }

  return fallback;
}
