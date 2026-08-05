export function normalizeWorkflowSourceImageSize(
  width: unknown,
  height: unknown,
) {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (
    !Number.isFinite(numericWidth) ||
    !Number.isFinite(numericHeight) ||
    numericWidth <= 0 ||
    numericHeight <= 0
  ) {
    return "";
  }

  const maxSide = Math.max(numericWidth, numericHeight);
  const targetMaxSide = Math.max(1024, Math.min(2048, maxSide));
  const scale = targetMaxSide / maxSide;
  const toStep = (value: number) => {
    const rounded = Math.round((value * scale) / 16) * 16;
    return Math.max(384, Math.min(2048, rounded));
  };

  return `${toStep(numericWidth)}*${toStep(numericHeight)}`;
}
