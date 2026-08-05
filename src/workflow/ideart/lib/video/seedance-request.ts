type SeedanceImageRole = "first_frame" | "last_frame" | "reference_image";

type SeedanceVideoRequestInput = {
  modelId?: string | null;
  method?: string | null;
  imageUrls?: Array<string | null | undefined>;
  characterAssetUrls?: Array<string | null | undefined>;
  videoUrls?: Array<string | null | undefined>;
  audioUrls?: Array<string | null | undefined>;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
  returnLastFrame?: boolean;
};

const SEEDANCE_METHODS = new Set([
  "text2video",
  "text2video_turbo",
  "first_frame",
  "first_frame_turbo",
  "first_frame_spicy",
  "start_end",
  "reference",
  "edit",
  "edit_turbo",
  "extend",
  "audio_video",
  "web_search_enhanced",
]);

const SEEDANCE_REFERENCE_METHOD_ALIASES = new Set([
  "all_reference",
  "all-reference",
  "omni_reference",
  "omni-reference",
  "multimodal_reference",
  "multimodal-reference",
  "multi_modal_reference",
  "multi-modal-reference",
  "image_reference",
  "reference_image",
]);

function normalizeModelIdentity(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/@@[a-z0-9_-]+$/, "")
    .replace(/@[a-z0-9_-]+$/, "");
}

function normalizeMethod(value?: string | null) {
  const method = String(value || "")
    .trim()
    .toLowerCase();
  if (method === "audio-to-video") return "audio_video";
  if (SEEDANCE_REFERENCE_METHOD_ALIASES.has(method)) return "reference";
  if (SEEDANCE_METHODS.has(method)) return method;
  return "";
}

function normalizeUrls(
  values: Array<string | null | undefined> | undefined,
  maxItems: number,
) {
  const urls = (values || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(urls)).slice(0, maxItems);
}

function isAssetUrl(value: string) {
  return /^asset:\/\//i.test(value.trim());
}

export function isSeedanceVideoModelId(modelId?: string | null) {
  const identity = normalizeModelIdentity(modelId);
  return (
    identity.includes("seedance") || identity.startsWith("doubao-seedance-")
  );
}

export function isSeedanceFaceVideoModelId(modelId?: string | null) {
  const identity = normalizeModelIdentity(modelId);
  return isSeedanceVideoModelId(identity) && identity.includes("face");
}

export function buildSeedanceVideoRequestPatch(
  input: SeedanceVideoRequestInput,
): Record<string, unknown> {
  if (!isSeedanceVideoModelId(input.modelId)) return {};

  const method = normalizeMethod(input.method);
  const firstFrame = String(input.firstFrameUrl || "").trim();
  const lastFrame = String(input.lastFrameUrl || "").trim();
  const imageUrls = normalizeUrls(
    [...(firstFrame ? [firstFrame] : []), ...(input.imageUrls || [])],
    9,
  );
  const characterAssetUrls = normalizeUrls(input.characterAssetUrls, 9).filter(
    isAssetUrl,
  );
  const videoUrls = normalizeUrls(input.videoUrls, 3);
  const audioUrls = normalizeUrls(input.audioUrls, 3);
  const hasMedia =
    imageUrls.length > 0 ||
    characterAssetUrls.length > 0 ||
    videoUrls.length > 0 ||
    audioUrls.length > 0;

  if (
    audioUrls.length > 0 &&
    imageUrls.length === 0 &&
    characterAssetUrls.length === 0 &&
    videoUrls.length === 0
  ) {
    throw new Error(
      "Seedance 2.0 的 audio_urls 必须配合参考图片或参考视频使用，不能单独音频生视频",
    );
  }

  if (
    (method === "start_end" ||
      method === "first_frame" ||
      method === "first_frame_turbo" ||
      method === "first_frame_spicy") &&
    (videoUrls.length > 0 || audioUrls.length > 0)
  ) {
    throw new Error(
      "Seedance 2.0 首尾帧模式不支持同时传 video_urls 或 audio_urls",
    );
  }

  const patch: Record<string, unknown> = {
    images: undefined,
    referenceVideo: undefined,
    referenceVideos: undefined,
    audioReferences: undefined,
    first_frame_image: undefined,
    video_url: undefined,
    motionRefVideo: undefined,
    extensions: undefined,
    editSource: undefined,
  };
  if (typeof input.generateAudio === "boolean") {
    patch.generateAudio = input.generateAudio;
  }
  if (typeof input.enableWebSearch === "boolean") {
    patch.webSearch = input.enableWebSearch;
    patch.web_search = input.enableWebSearch;
  }
  if (input.enableWebSearch === true) {
    patch.tools = [{ type: "web_search" }];
  }
  if (typeof input.returnLastFrame === "boolean") {
    patch.returnLastFrame = input.returnLastFrame;
  }

  if (method === "start_end") {
    const roles: Array<{ url: string; role: SeedanceImageRole }> = [];
    const resolvedFirstFrame = firstFrame || imageUrls[0] || "";
    const resolvedLastFrame =
      lastFrame || imageUrls.find((url) => url !== resolvedFirstFrame) || "";
    if (resolvedFirstFrame)
      roles.push({ url: resolvedFirstFrame, role: "first_frame" });
    if (resolvedLastFrame)
      roles.push({ url: resolvedLastFrame, role: "last_frame" });
    patch.method = "start_end";
    if (roles.length > 0) patch.image_with_roles = roles;
    return patch;
  }

  if (!hasMedia) {
    patch.method =
      method === "web_search_enhanced" ||
      method === "text2video_turbo" ||
      method === "audio_video"
        ? method
        : "text2video";
    return patch;
  }

  const canUseSimpleFirstFrame =
    (method === "first_frame" ||
      method === "first_frame_turbo" ||
      method === "first_frame_spicy") &&
    imageUrls.length > 0 &&
    characterAssetUrls.length === 0 &&
    !imageUrls.some(isAssetUrl) &&
    videoUrls.length === 0 &&
    audioUrls.length === 0;

  if (canUseSimpleFirstFrame) {
    patch.method = method;
    patch.image_urls = imageUrls.slice(0, 1);
    return patch;
  }

  if ((method === "edit" || method === "edit_turbo") && videoUrls.length > 0) {
    patch.method = method;
    patch.video_urls = videoUrls.slice(0, 1);
    patch.referenceVideo = videoUrls[0];
    if (imageUrls.length > 0) patch.image_urls = imageUrls;
    if (audioUrls.length > 0) patch.audio_urls = audioUrls;
    return patch;
  }

  if (method === "extend" && videoUrls.length > 0) {
    patch.method = "extend";
    patch.video_urls = videoUrls.slice(0, 1);
    patch.referenceVideo = videoUrls[0];
    if (imageUrls.length > 0) patch.image_urls = imageUrls.slice(0, 1);
    return patch;
  }

  patch.method = "reference";

  const assetImageUrls = Array.from(
    new Set([...characterAssetUrls, ...imageUrls.filter(isAssetUrl)]),
  );
  const ordinaryImageUrls = imageUrls.filter((url) => !isAssetUrl(url));
  if (assetImageUrls.length > 0 && ordinaryImageUrls.length > 0) {
    patch.image_urls = Array.from(
      new Set([...ordinaryImageUrls, ...assetImageUrls]),
    ).slice(0, 9);
    return {
      ...patch,
      ...(videoUrls.length > 0 ? { video_urls: videoUrls } : {}),
      ...(audioUrls.length > 0 ? { audio_urls: audioUrls } : {}),
    };
  }
  const shouldUseRoleImages =
    assetImageUrls.length > 0 || isSeedanceFaceVideoModelId(input.modelId);
  if (
    shouldUseRoleImages &&
    (assetImageUrls.length > 0 || imageUrls.length > 0)
  ) {
    patch.image_with_roles = [
      ...assetImageUrls.map((url) => ({
        url,
        role: "reference_image" as const,
      })),
      ...(isSeedanceFaceVideoModelId(input.modelId)
        ? ordinaryImageUrls.map((url) => ({
            url,
            role: "reference_image" as const,
          }))
        : []),
    ];
    if (
      !isSeedanceFaceVideoModelId(input.modelId) &&
      ordinaryImageUrls.length > 0
    ) {
      patch.image_urls = ordinaryImageUrls;
    }
  } else if (ordinaryImageUrls.length > 0) {
    patch.image_urls = ordinaryImageUrls;
  }

  if (videoUrls.length > 0) patch.video_urls = videoUrls;
  if (audioUrls.length > 0) patch.audio_urls = audioUrls;

  return patch;
}
