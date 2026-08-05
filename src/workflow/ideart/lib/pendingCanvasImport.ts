export type CanvasImportMediaType = "image" | "video" | "audio" | "file";

export interface PendingCanvasImport {
  id: string;
  url: string;
  mediaType: CanvasImportMediaType;
  fileName?: string;
  label?: string;
  category?: string;
  payload?: Record<string, unknown>;
  source?: "generation";
}

export interface PendingCanvasImportGroup {
  id?: string;
  groupName: string;
  groupKind?: "asset-group" | "prompt" | "mixed";
  workflowId?: string;
  workflowName?: string;
  imageGenerationPrompt?: string;
  videoMotionPrompt?: string;
  finalPromptJson?: unknown;
  payload?: Record<string, unknown>;
  items: Array<
    Omit<PendingCanvasImport, "id"> & {
      id?: string;
      category?: string;
      payload?: Record<string, unknown>;
    }
  >;
}

export interface PendingCanvasGroupImport extends PendingCanvasImport {
  group?: PendingCanvasImportGroup;
}

const STORAGE_KEY = "lovartsPendingCanvasImports";
export const CANVAS_IMPORT_EVENT = "lovarts:canvas-import";

function createImportId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readQueue(): PendingCanvasGroupImport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is PendingCanvasGroupImport =>
            item &&
            typeof item === "object" &&
            typeof item.id === "string" &&
            typeof item.url === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingCanvasGroupImport[]) {
  if (typeof window === "undefined") return;
  try {
    if (items.length === 0) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Session storage is best-effort only.
  }
}

export function queueCanvasImport(
  item: Omit<PendingCanvasImport, "id"> & {
    id?: string;
    group?: PendingCanvasImportGroup;
  },
) {
  const next: PendingCanvasGroupImport = {
    ...item,
    id: item.id || createImportId(),
  };
  writeQueue([...readQueue(), next]);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CANVAS_IMPORT_EVENT));
  }
  return next;
}

export function queueCanvasImportGroup(group: PendingCanvasImportGroup) {
  return queueCanvasImport({
    id: group.id,
    url: group.items[0]?.url || "",
    mediaType: group.items[0]?.mediaType || "file",
    fileName: group.items[0]?.fileName,
    label: group.groupName,
    source: "generation",
    group,
  });
}

export function consumeCanvasImports() {
  const items = readQueue();
  writeQueue([]);
  return items;
}
