// Web mock implementation of electronAPI.
// Provides Electron API-compatible interfaces in browser environments.

import type {
  CanvasAssetGroupInput,
  DownloadResult,
  ElectronAPI,
} from "@/types/electron";
import type { ApiServiceId } from "@/api/client";

// Check whether we are running in a browser environment.
const isBrowser = typeof window !== "undefined" && !window.electronAPI;

// Use localStorage for API key persistence.
const API_KEY_STORAGE_KEY = "wavespeed_api_key";
const API_KEYS_STORAGE_KEY = "wavespeed_api_keys_v2";
const SETTINGS_STORAGE_KEY = "wavespeed_settings";
const ASSETS_METADATA_STORAGE_KEY = "wavespeed_assets_metadata";
const ASSETS_SETTINGS_STORAGE_KEY = "wavespeed_assets_settings";
const CANVAS_ASSET_GROUPS_STORAGE_KEY = "wavespeed_canvas_asset_groups";

type StoredCanvasAssetGroup = {
  id: string;
  createdAt: number;
  group: CanvasAssetGroupInput;
  items: NonNullable<CanvasAssetGroupInput["items"]>;
};

function readCanvasAssetGroups(): StoredCanvasAssetGroup[] {
  try {
    const value = localStorage.getItem(CANVAS_ASSET_GROUPS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCanvasAssetGroups(groups: StoredCanvasAssetGroup[]) {
  localStorage.setItem(CANVAS_ASSET_GROUPS_STORAGE_KEY, JSON.stringify(groups));
}

// Default settings.
const DEFAULT_SETTINGS = {
  theme: "system" as const,
  defaultPollInterval: 2000,
  defaultTimeout: 30000,
  updateChannel: "stable" as const,
  autoCheckUpdate: false,
  language: "auto",
  apiServiceId: "zaomeng-api" as ApiServiceId,
  apiBaseUrl: "https://api.zaomeng.art",
  customApiBaseUrl: "",
};

function normalizeApiSettings(
  settings: Record<string, unknown>,
): typeof DEFAULT_SETTINGS {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    apiServiceId: DEFAULT_SETTINGS.apiServiceId,
    apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
    customApiBaseUrl: "",
  };
}

function activeCredentialScope() {
  return DEFAULT_SETTINGS.apiServiceId;
}

// Web implementation of electronAPI.
export const electronAPIWeb: ElectronAPI = {
  // API key management
  getApiKey: async (credentialScope?: string): Promise<string> => {
    void credentialScope;
    const targetScope = activeCredentialScope();
    try {
      const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
      const keys = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (targetScope && keys[targetScope] !== undefined) {
        return keys[targetScope] || "";
      }
    } catch {
      // Ignore malformed browser storage.
    }
    return "";
  },

  setApiKey: async (
    apiKey: string,
    credentialScope?: string,
  ): Promise<boolean> => {
    try {
      void credentialScope;
      const targetScope = activeCredentialScope();
      const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
      const keys = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (targetScope) keys[targetScope] = apiKey;
      localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
      if (targetScope === activeCredentialScope()) {
        localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
      }
      return true;
    } catch {
      return false;
    }
  },

  saveFileSilent: async (): Promise<DownloadResult> => {
    return { success: false };
  },

  updateTitlebarTheme: async (): Promise<void> => {},

  // Settings management
  getSettings: async () => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const normalized = normalizeApiSettings({
          ...DEFAULT_SETTINGS,
          ...JSON.parse(stored),
        });
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
        return normalized;
      }
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  },

  setSettings: async (settings: Record<string, unknown>): Promise<boolean> => {
    try {
      const current = await electronAPIWeb.getSettings();
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(normalizeApiSettings({ ...current, ...settings })),
      );
      return true;
    } catch {
      return false;
    }
  },

  clearAllData: async (): Promise<boolean> => {
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      localStorage.removeItem(API_KEYS_STORAGE_KEY);
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
      localStorage.removeItem(ASSETS_METADATA_STORAGE_KEY);
      localStorage.removeItem(ASSETS_SETTINGS_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  },

  // File download (browser-based)
  downloadFile: async (url: string, defaultFilename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = defaultFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },

  openExternal: async (url: string): Promise<void> => {
    window.open(url, "_blank", "noopener,noreferrer");
  },

  fetchOfficialModelsHtml: async (modelId: string): Promise<string> => {
    const response = await fetch(
      `https://wavespeed.ai/models/${encodeURI(modelId)}`,
      {
        headers: { Accept: "text/html" },
      },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch official models page: ${response.status}`,
      );
    }
    return response.text();
  },

  // App information
  getAppVersion: async (): Promise<string> => {
    return "1.0.0-web";
  },

  getLogFilePath: async (): Promise<string> => {
    return "";
  },

  openLogDirectory: async () => {
    return { success: false, path: "" };
  },

  // Update-related APIs (not supported in web version)
  checkForUpdates: async () => {
    return {
      status: "not-available",
      message: "Updates are not available in web version",
    };
  },

  downloadUpdate: async () => {
    return {
      status: "not-available",
      message: "Updates are not available in web version",
    };
  },

  installUpdate: (): void => {
    // no-op
  },

  setUpdateChannel: async (): Promise<boolean> => {
    return false;
  },

  onUpdateStatus: () => {
    return () => {
      // no-op
    };
  },

  // Asset management (using IndexedDB or localStorage)
  getAssetsSettings: async () => {
    try {
      const stored = localStorage.getItem(ASSETS_SETTINGS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return {
      autoSaveAssets: false,
      assetsDirectory: "",
    };
  },

  setAssetsSettings: async (
    settings: Partial<{ autoSaveAssets: boolean; assetsDirectory: string }>,
  ): Promise<boolean> => {
    try {
      const current = await electronAPIWeb.getAssetsSettings();
      localStorage.setItem(
        ASSETS_SETTINGS_STORAGE_KEY,
        JSON.stringify({ ...current, ...settings }),
      );
      return true;
    } catch {
      return false;
    }
  },

  getDefaultAssetsDirectory: async (): Promise<string> => {
    return "";
  },

  getZImageOutputPath: async (): Promise<string> => {
    return "";
  },

  selectDirectory: async () => {
    return {
      success: false,
      canceled: true,
      error: "Directory selection not available in web version",
    };
  },

  saveAsset: async () => {
    return {
      success: false,
      error: "Asset saving not available in web version",
    };
  },

  deleteAsset: async () => {
    return {
      success: false,
      error: "Asset deletion not available in web version",
    };
  },

  deleteAssetsBulk: async () => {
    return { success: false, deleted: 0 };
  },

  getAssetsMetadata: async () => {
    try {
      const stored = localStorage.getItem(ASSETS_METADATA_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    return [];
  },

  saveAssetsMetadata: async (metadata: unknown[]): Promise<boolean> => {
    try {
      localStorage.setItem(
        ASSETS_METADATA_STORAGE_KEY,
        JSON.stringify(metadata),
      );
      return true;
    } catch {
      return false;
    }
  },

  saveCanvasAssetGroup: async (payload: CanvasAssetGroupInput) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next: StoredCanvasAssetGroup = {
      id,
      createdAt: Date.now(),
      group: payload,
      items: payload.items || [],
    };
    writeCanvasAssetGroups([next, ...readCanvasAssetGroups()]);
    return { id };
  },

  getCanvasAssetGroup: async (id: string) => {
    const entry = readCanvasAssetGroups().find((group) => group.id === id);
    return entry ? { group: entry.group, items: entry.items } : null;
  },

  listCanvasAssetGroups: async (limit = 50) => {
    return readCanvasAssetGroups().slice(0, Math.max(0, limit));
  },

  openFileLocation: async () => {
    return {
      success: false,
      error: "File location not available in web version",
    };
  },

  checkFileExists: async (): Promise<boolean> => {
    return false;
  },

  openAssetsFolder: async () => {
    return {
      success: false,
      error: "Assets folder not available in web version",
    };
  },

  scanAssetsDirectory: async () => {
    return [];
  },

  // Stable Diffusion APIs (not supported in web version)
  sdGetBinaryPath: async () => {
    return {
      success: false,
      error: "Stable Diffusion not available in web version",
    };
  },

  sdCheckAuxiliaryModels: async () => {
    return {
      success: false,
      llmExists: false,
      vaeExists: false,
      llmPath: "",
      vaePath: "",
      error: "Not available in web version",
    };
  },

  sdListAuxiliaryModels: async () => {
    return { success: false, error: "Not available in web version" };
  },

  sdDeleteAuxiliaryModel: async () => {
    return { success: false, error: "Not available in web version" };
  },

  sdGenerateImage: async () => {
    return {
      success: false,
      error: "Stable Diffusion not available in web version",
    };
  },

  sdCancelGeneration: async () => {
    return { success: false, error: "Not available in web version" };
  },

  sdSaveModelFromCache: async () => {
    return { success: false, error: "Not available in web version" };
  },

  sdListModels: async () => {
    return {
      success: false,
      error: "Stable Diffusion not available in web version",
    };
  },

  sdDeleteModel: async () => {
    return { success: false, error: "Not available in web version" };
  },

  sdDeleteBinary: async () => {
    return { success: false, error: "Not available in web version" };
  },

  getFileSize: async (): Promise<number> => {
    return 0;
  },

  sdGetSystemInfo: async () => {
    return {
      platform: "web",
      arch: "unknown",
      acceleration: "webgpu",
      supported: false,
    };
  },

  sdGetGpuVramMb: async () => {
    return {
      success: false,
      vramMb: null,
      error: "Not available in web version",
    };
  },

  onSdProgress: () => {
    return () => {
      // no-op
    };
  },

  onSdLog: () => {
    return () => {
      // no-op
    };
  },

  onSdDownloadProgress: () => {
    return () => {
      // no-op
    };
  },

  onSdBinaryDownloadProgress: () => {
    return () => {
      // no-op
    };
  },

  onSdLlmDownloadProgress: () => {
    return () => {
      // no-op
    };
  },

  onSdVaeDownloadProgress: () => {
    return () => {
      // no-op
    };
  },

  // File operations (not supported in web version)
  fileGetSize: async () => {
    return { success: false, error: "Not available in web version" };
  },

  fileAppendChunk: async () => {
    return { success: false, error: "Not available in web version" };
  },

  fileRename: async () => {
    return { success: false, error: "Not available in web version" };
  },

  fileDelete: async () => {
    return { success: false, error: "Not available in web version" };
  },

  // Stable Diffusion download path helpers
  sdGetBinaryDownloadPath: async () => {
    return { success: false, error: "Not available in web version" };
  },

  sdGetAuxiliaryModelDownloadPath: async () => {
    return { success: false, error: "Not available in web version" };
  },

  sdGetModelsDir: async () => {
    return { success: false, error: "Not available in web version" };
  },

  sdExtractBinary: async () => {
    return { success: false, error: "Not available in web version" };
  },

  // Persistent key-value state (localStorage in web — same keys as persistentStorage)
  getState: async (key: string): Promise<unknown> => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  setState: async (key: string, value: unknown): Promise<boolean> => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  removeState: async (key: string): Promise<boolean> => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },

  // Assets event listener (no-op in web — browser-side saves directly to store)
  onAssetsNewAsset: () => {
    return () => {
      /* no-op */
    };
  },

  // Prediction inputs listener (no-op in web — browser-side saves directly to store)
  onSavePredictionInputs: () => {
    return () => {
      /* no-op */
    };
  },
};

// Inject electronAPI when running in a browser environment.
if (isBrowser) {
  (window as Window & { electronAPI: ElectronAPI }).electronAPI =
    electronAPIWeb;
  // Keep the browser tab title aligned with the desktop product name.
  document.title = "造梦影视与设计平台";
}
