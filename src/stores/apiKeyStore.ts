import { create } from "zustand";
import {
  apiClient,
  classifyApiCredentialValidationError,
  normalizeApiBaseUrl,
  type ApiCredentialValidationErrorKind,
  type ApiServiceId,
} from "@/api/client";
import { useModelsStore } from "@/stores/modelsStore";
import { useApiServiceStore } from "@/stores/apiServiceStore";

const API_KEY_STORAGE_KEY = "wavespeed_api_key";
const API_KEYS_STORAGE_KEY = "wavespeed_api_keys_v2";

interface ApiKeyState {
  apiKey: string;
  isLoading: boolean;
  isValidating: boolean;
  isValidated: boolean;
  validationError: string | null;
  validationErrorKind: ApiCredentialValidationErrorKind | null;
  hasAttemptedLoad: boolean;
  isPromptOpen: boolean;
  setApiKey: (apiKey: string) => Promise<boolean>;
  loadApiKey: (force?: boolean) => Promise<void>;
  validateApiKey: () => Promise<boolean>;
  requestApiKey: () => Promise<boolean>;
  resolveApiKeyPrompt: (result: boolean) => void;
}

let pendingApiKeyPrompt: Promise<boolean> | null = null;
let resolvePendingApiKeyPrompt: ((result: boolean) => void) | null = null;

// Helper to save API key (electron-store or localStorage fallback)
async function saveApiKey(
  credentialScope: string,
  apiKey: string,
): Promise<void> {
  if (window.electronAPI) {
    await window.electronAPI.setApiKey(apiKey, credentialScope);
  } else {
    const keys = readBrowserApiKeys();
    keys[credentialScope] = apiKey;
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
  }
}

// Helper to load API key (electron-store or localStorage fallback)
async function loadStoredApiKey(
  credentialScope: string,
): Promise<string | null> {
  if (window.electronAPI) {
    return await window.electronAPI.getApiKey(credentialScope);
  }
  const keys = readBrowserApiKeys();
  if (keys[credentialScope] !== undefined) return keys[credentialScope] || null;
  const legacyKey = localStorage.getItem(API_KEY_STORAGE_KEY);
  if (legacyKey && Object.keys(keys).length === 0) {
    keys[credentialScope] = legacyKey;
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
    return legacyKey;
  }
  return null;
}

export async function getStoredApiKeyForService(
  serviceId: ApiServiceId,
  baseUrl?: string,
): Promise<string | null> {
  return loadStoredApiKey(getApiCredentialScope(serviceId, baseUrl));
}

export function getApiCredentialScope(
  serviceId: ApiServiceId,
  baseUrl?: string,
) {
  if (serviceId !== "one-api") return serviceId;
  const normalized = normalizeApiBaseUrl(baseUrl);
  return normalized ? `one-api:${normalized}` : "one-api";
}

function readBrowserApiKeys(): Record<string, string> {
  try {
    const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const useApiKeyStore = create<ApiKeyState>((set, get) => ({
  apiKey: "",
  isLoading: false,
  isValidating: false,
  isValidated: false,
  validationError: null,
  validationErrorKind: null,
  hasAttemptedLoad: false,
  isPromptOpen: false,

  setApiKey: async (apiKey: string) => {
    const service = useApiServiceStore.getState();
    const credentialScope = getApiCredentialScope(
      service.serviceId,
      service.baseUrl,
    );
    const previousKey = get().apiKey;
    apiClient.setApiKey(apiKey);
    set({
      apiKey,
      isValidated: false,
      validationError: null,
      validationErrorKind: null,
    });

    if (!apiKey) {
      await saveApiKey(credentialScope, "");
      return false;
    }

    // Only persist a key after the API has accepted it.
    const isValid = await get().validateApiKey();
    if (isValid) {
      await saveApiKey(credentialScope, apiKey);
      await useModelsStore.getState().fetchModels(true);
    } else {
      apiClient.setApiKey(previousKey);
      set({ apiKey: previousKey, isValidated: false });
    }
    return isValid;
  },

  loadApiKey: async (force?: boolean) => {
    if (get().hasAttemptedLoad && !force) return;
    set({ isLoading: true, hasAttemptedLoad: true });
    try {
      await useApiServiceStore.getState().loadServiceConfig();
      const service = useApiServiceStore.getState();
      const storedKey = await loadStoredApiKey(
        getApiCredentialScope(service.serviceId, service.baseUrl),
      );
      if (storedKey) {
        apiClient.setApiKey(storedKey);
        set({
          apiKey: storedKey,
          isValidated: false,
          validationError: null,
          validationErrorKind: null,
        });
        // Validate first; App will fetch models once after validation succeeds.
        get().validateApiKey(); // intentionally not awaited
      } else {
        apiClient.setApiKey("");
        set({
          apiKey: "",
          isValidated: false,
          isValidating: false,
          validationError: null,
          validationErrorKind: null,
        });
      }
    } catch (error) {
      console.error("Failed to load API key:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  validateApiKey: async () => {
    const { apiKey } = get();
    if (!apiKey) {
      set({
        isValidated: false,
        isValidating: false,
        validationError: "请输入 API Key",
        validationErrorKind: "credentials",
      });
      return false;
    }

    set({ isValidating: true });
    try {
      await apiClient.validateCredential();
      set({
        isValidated: true,
        isValidating: false,
        validationError: null,
        validationErrorKind: null,
      });
      get().resolveApiKeyPrompt(true);
      return true;
    } catch (error) {
      set({
        isValidated: false,
        isValidating: false,
        validationError:
          error instanceof Error ? error.message : "API Key 验证失败",
        validationErrorKind: classifyApiCredentialValidationError(error),
      });
      if (pendingApiKeyPrompt) set({ isPromptOpen: true });
      return false;
    }
  },

  requestApiKey: () => {
    if (get().isValidated) return Promise.resolve(true);
    if (pendingApiKeyPrompt) return pendingApiKeyPrompt;

    pendingApiKeyPrompt = new Promise<boolean>((resolve) => {
      resolvePendingApiKeyPrompt = resolve;
    });
    set({ isPromptOpen: !get().isValidating });
    return pendingApiKeyPrompt;
  },

  resolveApiKeyPrompt: (result: boolean) => {
    set({ isPromptOpen: false });
    const resolve = resolvePendingApiKeyPrompt;
    pendingApiKeyPrompt = null;
    resolvePendingApiKeyPrompt = null;
    resolve?.(result);
  },
}));
