import type { Model } from "@/types/model";

export type OneApiExecutionKind =
  | "predictions"
  | "image"
  | "video"
  | "audio"
  | "chat"
  | "responses"
  | "unsupported";

export type OneApiMediaKind = "image" | "video" | "audio" | "text";

export interface OneApiExecutionRoute {
  kind: OneApiExecutionKind;
  submitPath: string;
  statusPath?: string;
  endpointType?: string;
  mediaKind?: OneApiMediaKind;
  payloadFormat?: "json" | "multipart";
}

export interface OneApiPricingEntry {
  basePrice?: number;
  discountRate?: number;
  quotaType?: number;
}

export interface OneApiCatalogState {
  enhanced: boolean;
  models: Model[];
  routes: Map<string, OneApiExecutionRoute>;
  pricing: Map<string, OneApiPricingEntry>;
}

export interface OneApiCatalogResult extends OneApiCatalogState {}
