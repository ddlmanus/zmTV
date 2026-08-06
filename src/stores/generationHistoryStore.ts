import { create } from "zustand";
import { persistentStorage } from "@/lib/storage";
import {
  extractOutputUrl,
  is3DUrl,
  isAudioUrl,
  isImageUrl,
  isVideoUrl,
} from "@/lib/mediaUtils";
import type { HistoryItem, PredictionResult } from "@/types/prediction";

export type GenerationHistoryMediaType =
  | "image"
  | "video"
  | "audio"
  | "3d"
  | "avatar"
  | "text"
  | "file";

export type GenerationHistorySource =
  | "playground"
  | "workflow"
  | "free-tool"
  | "api";

export interface LocalGenerationHistoryItem extends HistoryItem {
  source: "local-generation";
  media_type: GenerationHistoryMediaType;
  execution_source?: GenerationHistorySource;
  provider_base_url?: string;
  provider_key?: string;
  updated_at: string;
  error?: string | null;
}

type PersistedGenerationHistory = {
  version: 1;
  items: LocalGenerationHistoryItem[];
};

type GenerationHistoryState = {
  items: LocalGenerationHistoryItem[];
  isLoaded: boolean;
  load: (force?: boolean) => Promise<void>;
  upsert: (item: LocalGenerationHistoryItem) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  clear: () => Promise<void>;
};

export const GENERATION_HISTORY_STORAGE_KEY =
  "zaomeng_generation_history_v1";

const MAX_HISTORY_ITEMS = 1_000;
const LEGACY_PLAYGROUND_SESSION_KEY = "wavespeed_playground_session_v1";

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(value: unknown): HistoryItem["status"] {
  const status = String(value || "").toLowerCase();
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "created") return "created";
  if (status === "pending") return "pending";
  return "processing";
}

function inferMediaType(
  outputs: unknown[] | undefined,
  model: unknown,
): GenerationHistoryMediaType {
  const modelText = String(model || "").toLowerCase();
  if (
    modelText.includes("digital-human") ||
    modelText.includes("digital_human") ||
    modelText.includes("avatar") ||
    modelText.includes("talking") ||
    modelText.includes("lip")
  ) {
    return "avatar";
  }

  for (const output of outputs || []) {
    const url = extractOutputUrl(output);
    if (!url) continue;
    if (isImageUrl(url)) return "image";
    if (isVideoUrl(url)) return "video";
    if (isAudioUrl(url)) return "audio";
    if (is3DUrl(url)) return "3d";
  }

  if (modelText.includes("video")) return "video";
  if (modelText.includes("audio") || modelText.includes("music")) {
    return "audio";
  }
  if (modelText.includes("3d") || modelText.includes("mesh")) return "3d";
  if (modelText.includes("text") || modelText.includes("chat")) return "text";
  return "file";
}

function normalizeHistoryItem(
  item: Partial<LocalGenerationHistoryItem>,
): LocalGenerationHistoryItem | null {
  const id = String(item.id || "").trim();
  const model = String(item.model || "").trim();
  if (!id || !model) return null;
  const outputs = Array.isArray(item.outputs) ? item.outputs : [];
  const createdAt = String(item.created_at || item.updated_at || nowIso());
  return {
    ...item,
    id,
    model,
    status: normalizeStatus(item.status),
    outputs,
    created_at: createdAt,
    inputs: item.inputs || item.input || undefined,
    input: item.input || item.inputs || undefined,
    source: "local-generation",
    media_type: item.media_type || inferMediaType(outputs, model),
    updated_at: String(item.updated_at || createdAt),
    error: item.error ?? null,
  };
}

function parsePersisted(value: unknown): LocalGenerationHistoryItem[] {
  if (!value || typeof value !== "object") return [];
  const items = (value as Partial<PersistedGenerationHistory>).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => normalizeHistoryItem(item))
    .filter((item): item is LocalGenerationHistoryItem => Boolean(item))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, MAX_HISTORY_ITEMS);
}

function parseLegacyPlaygroundSession(value: unknown): LocalGenerationHistoryItem[] {
  if (!value || typeof value !== "object") return [];
  const tabs = (value as { tabs?: unknown }).tabs;
  if (!Array.isArray(tabs)) return [];
  const items: LocalGenerationHistoryItem[] = [];
  for (const tab of tabs) {
    const history = (tab as { generationHistory?: unknown }).generationHistory;
    if (!Array.isArray(history)) continue;
    for (const entry of history) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const prediction =
        record.prediction && typeof record.prediction === "object"
          ? (record.prediction as Partial<PredictionResult>)
          : {};
      const outputs = Array.isArray(record.outputs)
        ? (record.outputs as (string | Record<string, unknown>)[])
        : Array.isArray(prediction.outputs)
          ? prediction.outputs
          : [];
      const id = String(record.id || prediction.id || "").trim();
      const model = String(record.modelId || prediction.model || "").trim();
      if (!id || !model) continue;
      const addedAt = Number(record.addedAt || 0);
      const normalized = normalizeHistoryItem({
        id,
        model,
        status: (record.status || prediction.status || "completed") as
          | "pending"
          | "processing"
          | "completed"
          | "failed"
          | "created",
        outputs,
        inputs:
          record.formValues && typeof record.formValues === "object"
            ? (record.formValues as Record<string, unknown>)
            : undefined,
        input:
          record.formValues && typeof record.formValues === "object"
            ? (record.formValues as Record<string, unknown>)
            : undefined,
        created_at: Number.isFinite(addedAt) && addedAt > 0
          ? new Date(addedAt).toISOString()
          : String(prediction.created_at || nowIso()),
        source: "local-generation",
        media_type: inferMediaType(outputs, model),
        execution_source: "playground",
        updated_at: nowIso(),
        error:
          typeof record.error === "string"
            ? record.error
            : typeof prediction.error === "string"
              ? prediction.error
              : null,
      });
      if (normalized) items.push(normalized);
    }
  }
  return items;
}

function mergeHistoryItems(items: LocalGenerationHistoryItem[]) {
  const byId = new Map<string, LocalGenerationHistoryItem>();
  for (const item of items) {
    const existing = byId.get(item.id);
    byId.set(item.id, {
      ...existing,
      ...item,
      inputs: item.inputs || existing?.inputs,
      input: item.input || existing?.input,
      created_at: existing?.created_at || item.created_at,
      updated_at: item.updated_at || existing?.updated_at || nowIso(),
    });
  }
  return Array.from(byId.values())
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    .slice(0, MAX_HISTORY_ITEMS);
}

async function persistItems(items: LocalGenerationHistoryItem[]) {
  await persistentStorage.set(GENERATION_HISTORY_STORAGE_KEY, {
    version: 1,
    items,
  } satisfies PersistedGenerationHistory);
}

export function createLocalGenerationHistoryId(prefix = "generation") {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now()}_${random}`;
}

export const useGenerationHistoryStore = create<GenerationHistoryState>(
  (set, get) => ({
    items: parsePersisted(
      typeof window === "undefined"
        ? null
        : persistentStorage.getSync(GENERATION_HISTORY_STORAGE_KEY),
    ),
    isLoaded: false,

    load: async (force = false) => {
      if (get().isLoaded && !force) return;
      const [persisted, legacySession] = await Promise.all([
        persistentStorage.get(GENERATION_HISTORY_STORAGE_KEY),
        persistentStorage.get(LEGACY_PLAYGROUND_SESSION_KEY),
      ]);
      const items = mergeHistoryItems([
        ...parsePersisted(persisted),
        ...parseLegacyPlaygroundSession(legacySession),
      ]);
      set({ items, isLoaded: true });
      await persistItems(items);
    },

    upsert: async (item) => {
      await get().load();
      const normalized = normalizeHistoryItem(item);
      if (!normalized) return;
      const existing = get().items.find((row) => row.id === normalized.id);
      const merged = normalizeHistoryItem({
        ...existing,
        ...normalized,
        inputs: normalized.inputs || existing?.inputs,
        input: normalized.input || existing?.input,
        created_at: existing?.created_at || normalized.created_at,
        updated_at: nowIso(),
      });
      if (!merged) return;
      const items = mergeHistoryItems([
        merged,
        ...get().items.filter((row) => row.id !== merged.id),
      ]);
      set({ items, isLoaded: true });
      await persistItems(items);
    },

    remove: async (id) => {
      await get().load();
      const normalizedId = String(id || "").trim();
      const items = get().items.filter((item) => item.id !== normalizedId);
      set({ items });
      await persistItems(items);
    },

    removeMany: async (ids) => {
      await get().load();
      const idSet = new Set(ids.map((id) => String(id || "").trim()));
      const items = get().items.filter((item) => !idSet.has(item.id));
      set({ items });
      await persistItems(items);
    },

    clear: async () => {
      set({ items: [], isLoaded: true });
      await persistItems([]);
    },
  }),
);

export function recordGenerationHistoryFromPrediction(
  prediction: PredictionResult,
  options: {
    model?: string;
    inputs?: Record<string, unknown>;
    source?: GenerationHistorySource;
    providerBaseUrl?: string;
    providerKey?: string;
    mediaType?: GenerationHistoryMediaType;
  } = {},
) {
  const id =
    String(prediction.id || "").trim() || createLocalGenerationHistoryId();
  void useGenerationHistoryStore.getState().upsert({
    id,
    model: String(options.model || prediction.model || "").trim(),
    status: normalizeStatus(prediction.status),
    outputs: Array.isArray(prediction.outputs) ? prediction.outputs : [],
    created_at: String(prediction.created_at || nowIso()),
    execution_time: prediction.timings?.inference,
    has_nsfw_contents: prediction.has_nsfw_contents,
    inputs: options.inputs,
    input: options.inputs,
    source: "local-generation",
    media_type:
      options.mediaType ||
      inferMediaType(
        Array.isArray(prediction.outputs) ? prediction.outputs : [],
        options.model || prediction.model,
      ),
    execution_source: options.source || "api",
    provider_base_url: options.providerBaseUrl,
    provider_key: options.providerKey,
    updated_at: nowIso(),
    error: prediction.error || null,
  });
}

export function recordGenerationHistoryFailure(options: {
  id?: string;
  model: string;
  inputs?: Record<string, unknown>;
  error: string;
  source?: GenerationHistorySource;
  providerBaseUrl?: string;
  providerKey?: string;
}) {
  void useGenerationHistoryStore.getState().upsert({
    id: String(options.id || "").trim() || createLocalGenerationHistoryId(),
    model: options.model,
    status: "failed",
    outputs: [],
    created_at: nowIso(),
    inputs: options.inputs,
    input: options.inputs,
    source: "local-generation",
    media_type: inferMediaType([], options.model),
    execution_source: options.source || "api",
    provider_base_url: options.providerBaseUrl,
    provider_key: options.providerKey,
    updated_at: nowIso(),
    error: options.error,
  });
}
