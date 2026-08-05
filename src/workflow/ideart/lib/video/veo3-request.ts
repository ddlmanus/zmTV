type Veo3RequestInput = {
  modelId?: string | null;
  method?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  duration?: string | number | null;
  imageUrls?: Array<string | null | undefined>;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  generateAudio?: boolean;
  enableGif?: boolean;
  officialFallback?: boolean;
  enhancePrompt?: boolean;
  promptOptimizer?: boolean;
  personGeneration?: string | null;
  resizeMode?: string | null;
};

function normalizeModelIdentity(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/@@[a-z0-9_-]+$/, "")
    .replace(/@[a-z0-9_-]+$/, "")
    .replace(/^veo-3\.1-/, "veo3.1-");
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

function normalizeAspectRatio(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  if (normalized === "16:9" || normalized === "9:16") return normalized;
  return undefined;
}

function normalizeResolution(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "720p" || normalized === "720") return "720p";
  if (normalized === "1080p" || normalized === "1080") return "1080p";
  if (normalized === "4k" || normalized === "2160p" || normalized === "2160")
    return "4k";
  return undefined;
}

function normalizeGenerationType(method?: string | null, imageCount = 0) {
  const normalized = String(method || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "start_end" ||
    normalized === "start-end" ||
    normalized === "frame" ||
    normalized === "keyframe"
  )
    return "frame";
  if (normalized === "reference" || normalized === "edit") return "reference";
  if (imageCount === 2) return "frame";
  if (imageCount === 3) return "reference";
  return undefined;
}

function normalizeOfficialDuration(value?: string | number | null) {
  const numeric = Number(value);
  if (numeric === 4 || numeric === 6 || numeric === 8) return numeric;
  return undefined;
}

function normalizeDuration(value?: string | number | null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}

function normalizePersonGeneration(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "allow_all" ||
    normalized === "allow_adult" ||
    normalized === "dont_allow"
  )
    return normalized;
  return undefined;
}

function normalizeResizeMode(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "crop" || normalized === "pad") return normalized;
  return undefined;
}

export function isApimartVeo3VideoModelId(modelId?: string | null) {
  const normalized = normalizeModelIdentity(modelId);
  return (
    normalized === "veo3.1-fast" ||
    normalized === "veo3.1-quality" ||
    normalized === "veo3.1-lite" ||
    normalized === "veo3.1-fast-official" ||
    normalized === "veo3.1-quality-official"
  );
}

export function buildVeo3VideoRequestPatch(
  input: Veo3RequestInput,
): Record<string, unknown> {
  const modelId = normalizeModelIdentity(input.modelId);
  if (!isApimartVeo3VideoModelId(modelId)) return {};

  const firstFrame = String(input.firstFrameUrl || "").trim();
  const lastFrame = String(input.lastFrameUrl || "").trim();
  const imageUrls = normalizeUrls(
    [
      ...(firstFrame ? [firstFrame] : []),
      ...(input.imageUrls || []),
      ...(lastFrame ? [lastFrame] : []),
    ],
    3,
  );
  const isLite = modelId === "veo3.1-lite";
  const isOfficial = modelId.endsWith("-official");
  const patch: Record<string, unknown> = {
    images: undefined,
    referenceVideo: undefined,
    referenceVideos: undefined,
    audioReferences: undefined,
    video_url: undefined,
    videoUrl: undefined,
    video_urls: undefined,
    videoUrls: undefined,
    audio_urls: undefined,
    audioUrls: undefined,
    video_list: undefined,
    videoList: undefined,
    image_with_roles: undefined,
    imageWithRoles: undefined,
    imageTail: undefined,
    audioEnabled: undefined,
    duration: isOfficial
      ? normalizeOfficialDuration(input.duration)
      : normalizeDuration(input.duration),
    aspect_ratio: normalizeAspectRatio(input.aspectRatio),
    resolution:
      normalizeResolution(input.resolution) || input.resolution || undefined,
  };

  if (typeof input.enableGif === "boolean") {
    patch.enable_gif = input.enableGif;
    patch.enableGif = input.enableGif;
  }

  if (isOfficial) {
    if (imageUrls[0]) {
      patch.first_frame_image = imageUrls[0];
      patch.firstFrameImage = imageUrls[0];
    }
    if (imageUrls[1]) {
      patch.last_frame_image = imageUrls[1];
      patch.lastFrameImage = imageUrls[1];
      patch.end_frame_image = imageUrls[1];
      patch.endFrameImage = imageUrls[1];
    }
    if (typeof input.generateAudio === "boolean") {
      patch.generate_audio = input.generateAudio;
      patch.generateAudio = input.generateAudio;
    }
    const enhancePrompt =
      typeof input.enhancePrompt === "boolean"
        ? input.enhancePrompt
        : input.promptOptimizer;
    if (typeof enhancePrompt === "boolean") {
      patch.enhance_prompt = enhancePrompt;
      patch.enhancePrompt = enhancePrompt;
    }
    const personGeneration = normalizePersonGeneration(input.personGeneration);
    if (personGeneration) {
      patch.person_generation = personGeneration;
      patch.personGeneration = personGeneration;
    }
    const resizeMode = normalizeResizeMode(input.resizeMode);
    if (resizeMode) {
      patch.resize_mode = resizeMode;
      patch.resizeMode = resizeMode;
    }
    return patch;
  }

  if (isLite) return patch;

  if (imageUrls.length > 0) {
    patch.image_urls = imageUrls;
    patch.imageUrls = imageUrls;
  }
  const generationType = normalizeGenerationType(
    input.method,
    imageUrls.length,
  );
  if (
    generationType &&
    !(modelId === "veo3.1-quality" && generationType === "reference")
  ) {
    patch.generation_type = generationType;
    patch.generationType = generationType;
  }
  if (typeof input.officialFallback === "boolean") {
    patch.official_fallback = input.officialFallback;
    patch.officialFallback = input.officialFallback;
  }

  return patch;
}
