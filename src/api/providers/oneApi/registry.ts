import type { OneApiCatalogState } from "./types";

const catalogStates = new Map<string, OneApiCatalogState>();

function normalizeBaseUrl(baseUrl: string) {
  return String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
}

export function registerOneApiCatalogState(
  baseUrl: string,
  state: OneApiCatalogState,
) {
  catalogStates.set(normalizeBaseUrl(baseUrl), state);
}

export function getOneApiCatalogState(baseUrl: string) {
  return catalogStates.get(normalizeBaseUrl(baseUrl));
}
