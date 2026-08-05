import { apiClient, OFFICIAL_WAVESPEED_API_BASE_URL } from "@/api/client";
import {
  findCuratedGeneratorProduct,
  isCuratedGeneratorModel,
} from "@/lib/curatedGeneratorCatalog";
import type { Model } from "@/types/model";

export type WorkflowModelCategory =
  | "image"
  | "video"
  | "avatar"
  | "audio"
  | "3d"
  | "chat";

export type WorkflowModelFamily = {
  key: string;
  runtimeId: string;
  providerKey: "wavespeed" | "zaomeng";
  category: WorkflowModelCategory;
  name: string;
  description?: string;
  endpoints: Model[];
  representative: Model;
  sortOrder: number;
};

type EndpointTail = {
  isMode: boolean;
};

const IMAGE_MODE_TAIL =
  /^(?:(?:text-to-image|image-to-image|edit|sequential|multi|text-to-vector|generate-transparent)(?:-[a-z0-9.-]+)?)$/i;
const VIDEO_MODE_TAIL =
  /^(?:(?:text-to-video|image-to-video|reference-to-video|start-end-to-video|first-frame-to-video|last-frame-to-video|video-edit|edit-video|video-reframing|video-extend|extend-video|transition|start-end-frame|control|motion-control|audio-to-video|drama|drama-clip|effect|effects)(?:-[a-z0-9.-]+)?|i2v(?:-[a-z0-9.-]+)?|t2v(?:-[a-z0-9.-]+)?|v2v(?:-[a-z0-9.-]+)?)$/i;
function endpointTailInfo(
  tail: string,
  category: WorkflowModelCategory,
): EndpointTail {
  const value = String(tail || "")
    .trim()
    .toLowerCase();
  const isMode =
    category === "image"
      ? IMAGE_MODE_TAIL.test(value)
      : category === "video" || category === "avatar"
        ? VIDEO_MODE_TAIL.test(value)
        : false;
  return { isMode };
}

function normalizeKlingFamilySegment(value: string) {
  const normalized = value
    .replace(/-(?:4k|std|standard|pro|master)$/i, "")
    .replace(/-(?:4k|std|standard|pro|master)(?=-)/i, "");
  return /kling/i.test(value) ? normalized : value;
}

function appendFamilyVariant(base: string, variant: string) {
  if (!variant || base.toLowerCase().endsWith(`-${variant}`)) return base;
  return `${base}-${variant}`;
}

function getTwoSegmentVideoFamily(provider: string, segment: string) {
  const lower = segment.toLowerCase();

  const vidu = lower.match(
    /^(?:text|image|reference|start-end)-to-video(?:-(.+))?$/,
  );
  if (provider.toLowerCase() === "vidu" && vidu) {
    return `${provider}/video-${vidu[1] || "classic"}`;
  }

  const compactMode = lower.match(
    /^(.*?)-(?:t2v|i2v)(?:-(480p|720p|1080p|2k|4k|standard|std|pro|master))?(?:-(ultra-fast|fast))?$/,
  );
  if (compactMode?.[1]) {
    const base = normalizeKlingFamilySegment(compactMode[1]);
    return `${provider}/${appendFamilyVariant(base, compactMode[3] || "")}`;
  }

  const pika = lower.match(/^(v\d+(?:\.\d+)?)-(?:t2v|i2v|pikaframes)$/);
  if (provider.toLowerCase() === "pika" && pika) {
    return `${provider}/${pika[1]}`;
  }

  const luma = lower.match(/^(ray-[\d.]+(?:-flash)?)-(?:t2v|i2v)$/);
  if (provider.toLowerCase() === "luma" && luma) {
    return `${provider}/${luma[1]}`;
  }

  const pixverse = lower.match(
    /^(pixverse-v[\d.]+)-(?:t2v|i2v|transition|effects)(?:-(fast))?$/,
  );
  if (provider.toLowerCase() === "pixverse" && pixverse) {
    return `${provider}/${appendFamilyVariant(pixverse[1], pixverse[2] || "")}`;
  }

  return "";
}

function getTwoSegmentImageFamily(provider: string, segment: string) {
  const lower = segment.toLowerCase();
  const mode = lower.match(/^(.*?)-(?:modify|edit)(?:-(ultra|fast|multi))?$/);
  if (!mode?.[1]) return "";
  return `${provider}/${appendFamilyVariant(mode[1], mode[2] || "")}`;
}

export function getWorkflowModelCategory(model: Model): WorkflowModelCategory {
  const type = String(model.type || "")
    .trim()
    .toLowerCase();
  const modelId = String(model.model_id || "").toLowerCase();
  const identity = `${type} ${modelId} ${model.name}`.toLowerCase();
  if (type === "digital-human" || isCuratedGeneratorModel("avatar", modelId)) {
    return "avatar";
  }
  if (
    type === "llm" ||
    type === "image-to-text" ||
    type === "video-to-text" ||
    type === "speech-to-text" ||
    type === "content-moderation" ||
    type === "training" ||
    type.includes("text-to-text") ||
    type.includes("chat")
  ) {
    return "chat";
  }
  if (type.includes("3d") || /\b(mesh|gltf|glb|splat)\b/.test(identity)) {
    return "3d";
  }
  if (
    type === "audio-to-video" ||
    type === "motion-control" ||
    type === "video-dubbing" ||
    type.includes("video") ||
    identity.includes("video") ||
    (type === "lora-support" &&
      /(?:^|[/_-])(?:t2v|i2v|v2v)(?:[/_.-]|$)/.test(modelId))
  ) {
    return "video";
  }
  if (type.includes("audio") || /\b(music|voice|speech|tts)\b/.test(identity)) {
    return "audio";
  }
  return "image";
}

export function getWorkflowFamilyKey(model: Model) {
  const modelId = String(model.model_id || "").trim();
  const parts = modelId.split("/").filter(Boolean);
  if (parts.length < 2) return modelId;
  const category = getWorkflowModelCategory(model);
  const provider = parts[0];
  let familySegment = parts[1];

  if (category === "audio") {
    const curatedProduct = findCuratedGeneratorProduct("audio", modelId);
    if (curatedProduct) return `${provider}/${curatedProduct.key}`;
  }

  if (category === "avatar") {
    const curatedProduct = findCuratedGeneratorProduct("avatar", modelId);
    if (curatedProduct) return `${provider}/${curatedProduct.key}`;
  }

  if (parts.length >= 3) {
    const tailInfo = endpointTailInfo(parts.slice(2).join("/"), category);
    if (tailInfo.isMode) {
      return `${provider}/${familySegment}`;
    }
    return modelId;
  }

  if (category === "video" || category === "avatar") {
    const compactFamily = getTwoSegmentVideoFamily(provider, familySegment);
    return compactFamily || modelId;
  }
  if (category === "image") {
    const compactFamily = getTwoSegmentImageFamily(provider, familySegment);
    return compactFamily || modelId;
  }
  return modelId;
}

export function getWorkflowGatewayProviderKey(): "wavespeed" | "zaomeng" {
  return apiClient.getBaseUrl() === OFFICIAL_WAVESPEED_API_BASE_URL
    ? "wavespeed"
    : "zaomeng";
}

function formatToken(value: string) {
  const lower = value.toLowerCase();
  if (["ai", "api", "gpt", "sd", "xl", "hd", "uhd", "3d"].includes(lower)) {
    return lower.toUpperCase();
  }
  if (/^v\d/.test(lower)) return `V${value.slice(1)}`;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatFamilyName(key: string) {
  const slug = key.split("/").slice(1).join(" ") || key;
  const special: Array<[RegExp, string]> = [
    [/^gpt-image-2$/i, "GPT Image 2"],
    [/^gpt-image-1\.5$/i, "GPT Image 1.5"],
    [/^seedance-2\.0$/i, "Seedance 2.0"],
    [/^seedance-2\.0-(.+)$/i, "Seedance 2.0 $1"],
    [/^seedance-v1\.5-pro$/i, "Seedance 1.5 Pro"],
    [/^nano-banana-2$/i, "Nano Banana 2"],
    [/^nano-banana-pro$/i, "Nano Banana Pro"],
    [/^nano-banana$/i, "Nano Banana"],
    [/^kling-v3\.0$/i, "Kling 3.0"],
    [/^kling-video-o3$/i, "Kling O3"],
  ];
  for (const [pattern, label] of special) {
    const match = slug.match(pattern);
    if (!match) continue;
    return label.replace("$1", match[1] ? formatToken(match[1]) : "").trim();
  }
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(formatToken)
    .join(" ");
}

function representativeRank(model: Model, category: WorkflowModelCategory) {
  const type = String(model.type || "").toLowerCase();
  const id = model.model_id.toLowerCase();
  if (category === "image") {
    if (type === "text-to-image" && !/(ultra|fast|utility|vector)/.test(id))
      return 0;
    if (type === "image-to-image" && !/(ultra|fast|sequential)/.test(id))
      return 1;
  }
  if (category === "video" || category === "avatar") {
    if (type === "text-to-video" && !/(turbo|spicy|flash)/.test(id)) return 0;
    if (type === "image-to-video" && !/(turbo|spicy|flash)/.test(id)) return 1;
    if (type === "video-to-video") return 2;
    if (type === "video-extend") return 3;
  }
  return 10;
}

function pickRepresentative(
  endpoints: Model[],
  category: WorkflowModelCategory,
) {
  return [...endpoints].sort((a, b) => {
    const rank =
      representativeRank(a, category) - representativeRank(b, category);
    if (rank !== 0) return rank;
    const sortOrder = Number(b.sort_order || 0) - Number(a.sort_order || 0);
    if (sortOrder !== 0) return sortOrder;
    return a.model_id.localeCompare(b.model_id);
  })[0];
}

export function groupWorkflowModels(models: Model[]): WorkflowModelFamily[] {
  const providerKey = getWorkflowGatewayProviderKey();
  const byFamily = new Map<string, Model[]>();
  for (const model of models) {
    const category = getWorkflowModelCategory(model);
    const key = `${category}:${getWorkflowFamilyKey(model)}`;
    const current = byFamily.get(key) || [];
    current.push(model);
    byFamily.set(key, current);
  }

  return Array.from(byFamily.entries())
    .map(([compoundKey, endpoints]) => {
      const separator = compoundKey.indexOf(":");
      const category = compoundKey.slice(0, separator) as WorkflowModelCategory;
      const key = compoundKey.slice(separator + 1);
      const representative = pickRepresentative(endpoints, category);
      const curatedProduct =
        category === "audio" || category === "avatar"
          ? findCuratedGeneratorProduct(category, endpoints[0]?.model_id)
          : undefined;
      const sortOrder = Math.max(
        ...endpoints.map((model) => Number(model.sort_order || 0)),
      );
      return {
        key,
        runtimeId: `${key}@@${providerKey}`,
        providerKey,
        category,
        name: curatedProduct?.name || formatFamilyName(key),
        description: representative.description,
        endpoints: [...endpoints].sort((a, b) =>
          a.model_id.localeCompare(b.model_id),
        ),
        representative,
        sortOrder,
      } satisfies WorkflowModelFamily;
    })
    .sort((a, b) => {
      const category = a.category.localeCompare(b.category);
      if (category !== 0) return category;
      const order = b.sortOrder - a.sortOrder;
      if (order !== 0) return order;
      return a.name.localeCompare(b.name);
    });
}

export function findWorkflowModelFamily(
  families: WorkflowModelFamily[],
  identity: string,
) {
  const raw = String(identity || "").trim();
  const modelId = raw.includes("@@") ? raw.split("@@")[0] : raw;
  return families.find(
    (family) =>
      family.runtimeId === raw ||
      family.key === raw ||
      family.key === modelId ||
      family.endpoints.some((endpoint) => endpoint.model_id === modelId),
  );
}
