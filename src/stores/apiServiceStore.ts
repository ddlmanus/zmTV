import { create } from "zustand";
import {
  ZAOMENG_OPEN_API_BASE_URL,
  apiClient,
  type ApiServiceId,
} from "@/api/client";
import { useModelsStore } from "@/stores/modelsStore";

const SERVICE_STORAGE_KEY = "wavespeed_api_service_config";

export interface ApiServiceConfig {
  serviceId: ApiServiceId;
  customBaseUrl: string;
}

interface ApiServiceState extends ApiServiceConfig {
  baseUrl: string;
  isLoading: boolean;
  hasLoaded: boolean;
  loadServiceConfig: (force?: boolean) => Promise<void>;
  setServiceConfig: (config: Partial<ApiServiceConfig>) => Promise<void>;
  resolveBaseUrl: (config?: Partial<ApiServiceConfig>) => string;
}

const DEFAULT_SERVICE_CONFIG: ApiServiceConfig = {
  serviceId: "zaomeng-api",
  customBaseUrl: "",
};

function normalizeBaseUrl(value?: string | null): string {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "");
}

function resolveBaseUrlFromConfig(_config: Partial<ApiServiceConfig>): string {
  return ZAOMENG_OPEN_API_BASE_URL;
}

function normalizeStoredConfig(
  _config: Partial<ApiServiceConfig>,
): ApiServiceConfig {
  return { ...DEFAULT_SERVICE_CONFIG };
}

async function loadStoredConfig(): Promise<ApiServiceConfig> {
  if (window.electronAPI?.getSettings) {
    const settings = await window.electronAPI.getSettings();
    const config = normalizeStoredConfig({
      serviceId: settings.apiServiceId as ApiServiceId | undefined,
      customBaseUrl: String(settings.customApiBaseUrl || ""),
    });
    const storedBaseUrl = normalizeBaseUrl(settings.apiBaseUrl);
    if (
      storedBaseUrl !== resolveBaseUrlFromConfig(config) ||
      config.serviceId !== settings.apiServiceId ||
      config.customBaseUrl !== String(settings.customApiBaseUrl || "")
    ) {
      await saveStoredConfig(config);
    }
    localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(config));
    return config;
  }

  try {
    const raw = localStorage.getItem(SERVICE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const config = normalizeStoredConfig({
      serviceId: parsed.serviceId as ApiServiceId | undefined,
      customBaseUrl: String(parsed.customBaseUrl || ""),
    });
    if (
      config.serviceId !== parsed.serviceId ||
      config.customBaseUrl !== String(parsed.customBaseUrl || "")
    ) {
      localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(config));
    }
    return config;
  } catch {
    return DEFAULT_SERVICE_CONFIG;
  }
}

async function saveStoredConfig(config: ApiServiceConfig): Promise<void> {
  if (window.electronAPI?.setSettings) {
    await window.electronAPI.setSettings({
      apiServiceId: config.serviceId,
      customApiBaseUrl: config.customBaseUrl,
      apiBaseUrl: resolveBaseUrlFromConfig(config),
    });
    return;
  }
  localStorage.setItem(SERVICE_STORAGE_KEY, JSON.stringify(config));
}

export const useApiServiceStore = create<ApiServiceState>((set, get) => ({
  ...DEFAULT_SERVICE_CONFIG,
  baseUrl: ZAOMENG_OPEN_API_BASE_URL,
  isLoading: false,
  hasLoaded: false,

  resolveBaseUrl: (config = {}) =>
    resolveBaseUrlFromConfig({
      serviceId: config.serviceId || get().serviceId,
      customBaseUrl:
        config.customBaseUrl === undefined
          ? get().customBaseUrl
          : config.customBaseUrl,
    }),

  loadServiceConfig: async (force?: boolean) => {
    if (get().hasLoaded && !force) return;
    set({ isLoading: true, hasLoaded: true });
    try {
      const stored = await loadStoredConfig();
      const next = normalizeStoredConfig(stored);
      const baseUrl = resolveBaseUrlFromConfig(next);
      apiClient.setBaseUrl(baseUrl);
      useModelsStore.getState().loadCachedModelsForCurrentService();
      set({ ...next, baseUrl });
    } finally {
      set({ isLoading: false });
    }
  },

  setServiceConfig: async (_config) => {
    const next = { ...DEFAULT_SERVICE_CONFIG };
    const baseUrl = resolveBaseUrlFromConfig(next);
    apiClient.setBaseUrl(baseUrl);
    useModelsStore.getState().loadCachedModelsForCurrentService();
    await saveStoredConfig(next);
    set({ ...next, baseUrl, hasLoaded: true });
  },
}));
