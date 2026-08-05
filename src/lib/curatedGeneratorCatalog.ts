export type CuratedGeneratorWorkspace = "avatar" | "audio";

export interface CuratedGeneratorProduct {
  key: string;
  name: string;
  endpoints: readonly string[];
}

export const AVATAR_GENERATOR_PRODUCTS: readonly CuratedGeneratorProduct[] = [
  {
    key: "infinitetalk",
    name: "InfiniteTalk",
    endpoints: [
      "wavespeed-ai/infinitetalk",
      "wavespeed-ai/infinitetalk/video-to-video",
    ],
  },
  {
    key: "longcat-avatar-1.5",
    name: "LongCat Avatar 1.5",
    endpoints: [
      "wavespeed-ai/longcat-avatar-1.5",
      "wavespeed-ai/longcat-avatar-1.5/multi",
    ],
  },
  {
    key: "scail-2",
    name: "SCAIL-2",
    endpoints: ["wavespeed-ai/scail-2"],
  },
  {
    key: "wan-2.2-animate",
    name: "WAN 2.2 Animate",
    endpoints: ["wavespeed-ai/wan-2.2/animate"],
  },
  {
    key: "kling-3.0-motion-control",
    name: "Kling 3.0 Motion Control",
    endpoints: [
      "kwaivgi/kling-v3.0-std/motion-control",
      "kwaivgi/kling-v3.0-pro/motion-control",
    ],
  },
  {
    key: "kling-2.6-motion-control",
    name: "Kling 2.6 Motion Control",
    endpoints: [
      "kwaivgi/kling-v2.6-std/motion-control",
      "kwaivgi/kling-v2.6-pro/motion-control",
    ],
  },
  {
    key: "pixverse-motion-mimic",
    name: "PixVerse Motion Mimic",
    endpoints: ["pixverse/motion-control/mimic"],
  },
  {
    key: "steady-dancer",
    name: "SteadyDancer",
    endpoints: ["wavespeed-ai/steady-dancer"],
  },
  {
    key: "face-swapper",
    name: "Face Swapper",
    endpoints: ["wavespeed-ai/image-face-swap", "wavespeed-ai/video-face-swap"],
  },
];

export const AUDIO_GENERATOR_PRODUCTS: readonly CuratedGeneratorProduct[] = [
  {
    key: "qwen3-tts",
    name: "Qwen3 TTS",
    endpoints: [
      "wavespeed-ai/qwen3-tts/text-to-speech",
      "wavespeed-ai/qwen3-tts/voice-clone",
      "wavespeed-ai/qwen3-tts/voice-design",
    ],
  },
  {
    key: "omnivoice",
    name: "OmniVoice",
    endpoints: [
      "wavespeed-ai/omnivoice/text-to-speech",
      "wavespeed-ai/omnivoice/voice-clone",
    ],
  },
  {
    key: "elevenlabs-v3",
    name: "ElevenLabs v3",
    endpoints: ["elevenlabs/eleven-v3"],
  },
  {
    key: "elevenlabs-multilingual",
    name: "ElevenLabs Multilingual",
    endpoints: ["elevenlabs/multilingual-v2"],
  },
  {
    key: "minimax-speech-2.6",
    name: "MiniMax Speech 2.6",
    endpoints: ["minimax/speech-2.6-turbo", "minimax/speech-2.6-hd"],
  },
  {
    key: "minimax-speech-2.5",
    name: "MiniMax Speech 2.5",
    endpoints: [
      "minimax/speech-2.5-turbo-preview",
      "minimax/speech-2.5-hd-preview",
    ],
  },
  {
    key: "mureka-v9",
    name: "Mureka V9",
    endpoints: [
      "mureka-ai/mureka-v9/generate-song",
      "mureka-ai/mureka-v9/generate-bgm",
    ],
  },
  {
    key: "elevenlabs-music",
    name: "ElevenLabs Music",
    endpoints: ["elevenlabs/music"],
  },
  {
    key: "minimax-music-2.5",
    name: "MiniMax Music 2.5",
    endpoints: ["minimax/music-2.5"],
  },
  {
    key: "minimax-music-cover",
    name: "MiniMax Music Cover",
    endpoints: ["minimax/music-cover"],
  },
  {
    key: "ace-step-1.5",
    name: "ACE-Step 1.5",
    endpoints: ["wavespeed-ai/ace-step-1.5"],
  },
];

const PRODUCTS_BY_WORKSPACE = {
  avatar: AVATAR_GENERATOR_PRODUCTS,
  audio: AUDIO_GENERATOR_PRODUCTS,
} as const;

const PRODUCT_BY_ENDPOINT = Object.fromEntries(
  Object.entries(PRODUCTS_BY_WORKSPACE).map(([workspace, products]) => [
    workspace,
    new Map(
      products.flatMap((product) =>
        product.endpoints.map((endpoint) => [endpoint.toLowerCase(), product]),
      ),
    ),
  ]),
) as Record<CuratedGeneratorWorkspace, Map<string, CuratedGeneratorProduct>>;

export function findCuratedGeneratorProduct(
  workspace: CuratedGeneratorWorkspace,
  modelId: string | undefined | null,
): CuratedGeneratorProduct | undefined {
  if (!modelId) return undefined;
  return PRODUCT_BY_ENDPOINT[workspace].get(modelId.toLowerCase());
}

export function isCuratedGeneratorModel(
  workspace: CuratedGeneratorWorkspace,
  modelId: string | undefined | null,
): boolean {
  return Boolean(findCuratedGeneratorProduct(workspace, modelId));
}

export function getCuratedGeneratorProductRank(
  workspace: CuratedGeneratorWorkspace,
  modelId: string | undefined | null,
): number {
  const product = findCuratedGeneratorProduct(workspace, modelId);
  if (!product) return Number.MAX_SAFE_INTEGER;
  return PRODUCTS_BY_WORKSPACE[workspace].indexOf(product);
}
