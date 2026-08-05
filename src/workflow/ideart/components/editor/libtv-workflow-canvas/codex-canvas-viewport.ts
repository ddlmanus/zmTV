type WorkflowCanvasFrame = {
  id?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type WorkflowViewportController = {
  setViewport: (
    viewport: { x: number; y: number; zoom: number },
    options?: { duration?: number },
  ) => Promise<boolean> | void;
};

export function getCodexCanvasReservedRight(container: HTMLElement | null) {
  if (!container || typeof document === "undefined") return 0;
  const panel = document.querySelector<HTMLElement>(
    ".zaomeng-codex-inline-panel",
  );
  if (!panel) return 0;
  const containerRect = container.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const overlapsVertically =
    panelRect.bottom > containerRect.top &&
    panelRect.top < containerRect.bottom;
  if (!overlapsVertically || panelRect.left >= containerRect.right) return 0;
  return Math.max(
    0,
    Math.min(containerRect.width, containerRect.right - panelRect.left),
  );
}

export function focusCodexCanvasFrames(params: {
  flow: WorkflowViewportController | null;
  container: HTMLElement | null;
  frames: WorkflowCanvasFrame[];
  duration?: number;
  maxZoom?: number;
}) {
  const { flow, container } = params;
  const frames = params.frames.filter(
    (frame) =>
      Number.isFinite(frame.x) &&
      Number.isFinite(frame.y) &&
      Number.isFinite(frame.width) &&
      Number.isFinite(frame.height) &&
      frame.width > 0 &&
      frame.height > 0,
  );
  if (!flow || !container || !frames.length) return;
  const rect = container.getBoundingClientRect();
  const reserveRight = getCodexCanvasReservedRight(container);
  const paddingLeft = 56;
  const paddingRight = 56;
  const paddingTop = 96;
  const paddingBottom = 104;
  const usableWidth = Math.max(
    260,
    rect.width - reserveRight - paddingLeft - paddingRight,
  );
  const usableHeight = Math.max(260, rect.height - paddingTop - paddingBottom);
  const left = Math.min(...frames.map((frame) => frame.x));
  const top = Math.min(...frames.map((frame) => frame.y));
  const right = Math.max(...frames.map((frame) => frame.x + frame.width));
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
  const worldWidth = Math.max(1, right - left);
  const worldHeight = Math.max(1, bottom - top);
  const zoom = Math.max(
    0.08,
    Math.min(
      Math.max(0.08, Number(params.maxZoom ?? 1)),
      usableWidth / worldWidth,
      usableHeight / worldHeight,
    ),
  );
  const x = paddingLeft + (usableWidth - worldWidth * zoom) / 2 - left * zoom;
  const y = paddingTop + (usableHeight - worldHeight * zoom) / 2 - top * zoom;
  void flow.setViewport(
    { x: Math.round(x), y: Math.round(y), zoom },
    { duration: Math.max(0, Number(params.duration ?? 420)) },
  );
}
