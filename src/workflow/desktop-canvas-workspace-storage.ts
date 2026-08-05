import {
  buildCanvasProjectContentDocument,
  normalizeCanvasProjectContent,
  normalizeLibTvProjectCanvases,
  type LibTvProjectCanvas,
} from "@/workflow/ideart/lib/canvas-project-content";
import {
  EMPTY_LIBTV_WORKFLOW_STATE,
  normalizeLibTvWorkflowState,
} from "@/workflow/ideart/lib/libtv/workflow";

export const DESKTOP_CANVAS_WORKSPACE_STORAGE_KEY =
  "zaomeng_ideart_workflow_canvas_v1";

export type DesktopCanvasWorkspace = {
  canvases: LibTvProjectCanvas[];
  activeCanvasId: string;
};

type CanvasWorkspaceStorage = Pick<Storage, "getItem" | "setItem">;

function getWorkspaceStorage(storage?: CanvasWorkspaceStorage) {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

function createEmptyWorkspace(): DesktopCanvasWorkspace {
  const workflow = normalizeLibTvWorkflowState({
    ...EMPTY_LIBTV_WORKFLOW_STATE,
    enabled: true,
  });
  const canvases = normalizeLibTvProjectCanvases(undefined, workflow);
  return {
    canvases,
    activeCanvasId: canvases[0]?.id || "default",
  };
}

function isLegacyWorkflowState(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.nodes) && Array.isArray(record.edges);
}

export function readDesktopCanvasWorkspace(
  storage?: CanvasWorkspaceStorage,
): DesktopCanvasWorkspace {
  const target = getWorkspaceStorage(storage);
  if (!target) return createEmptyWorkspace();

  try {
    const raw = target.getItem(DESKTOP_CANVAS_WORKSPACE_STORAGE_KEY);
    if (!raw) return createEmptyWorkspace();
    const parsed: unknown = JSON.parse(raw);

    if (isLegacyWorkflowState(parsed)) {
      const canvases = normalizeLibTvProjectCanvases(undefined, parsed);
      return {
        canvases,
        activeCanvasId: canvases[0]?.id || "default",
      };
    }

    const content = normalizeCanvasProjectContent(parsed);
    const canvases = normalizeLibTvProjectCanvases(
      content.libtvCanvases,
      content.libtvWorkflow,
    );
    const requestedActiveCanvasId = String(
      content.activeLibTvCanvasId || "",
    ).trim();
    const activeCanvas =
      canvases.find((canvas) => canvas.id === requestedActiveCanvasId) ||
      canvases[0];
    return {
      canvases,
      activeCanvasId: activeCanvas?.id || "default",
    };
  } catch {
    return createEmptyWorkspace();
  }
}

export function writeDesktopCanvasWorkspace(
  canvases: LibTvProjectCanvas[],
  activeCanvasId: string,
  storage?: CanvasWorkspaceStorage,
) {
  const target = getWorkspaceStorage(storage);
  if (!target) return;

  target.setItem(
    DESKTOP_CANVAS_WORKSPACE_STORAGE_KEY,
    JSON.stringify(
      buildDesktopCanvasWorkspaceDocument(canvases, activeCanvasId),
    ),
  );
}

export function buildDesktopCanvasWorkspaceDocument(
  canvases: LibTvProjectCanvas[],
  activeCanvasId: string,
) {
  const normalizedCanvases = normalizeLibTvProjectCanvases(canvases);
  const requestedActiveId = String(activeCanvasId || "").trim();
  const activeCanvas =
    normalizedCanvases.find((canvas) => canvas.id === requestedActiveId) ||
    normalizedCanvases[0];
  const content = buildCanvasProjectContentDocument({
    layers: [],
    libtvWorkflow:
      activeCanvas?.libtvWorkflow ||
      normalizeLibTvWorkflowState(EMPTY_LIBTV_WORKFLOW_STATE),
    libtvCanvases: normalizedCanvases,
    activeLibTvCanvasId: activeCanvas?.id || "default",
    projectMaterials: [],
  });

  return content;
}
