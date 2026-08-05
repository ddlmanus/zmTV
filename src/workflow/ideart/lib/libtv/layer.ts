import type { CanvasLayer, LibTvComponentType, LibTvNodeKind } from "@/workflow/ideart/lib/store/canvas-store"
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow"
import { LIBTV_PANORAMA_MODEL_OPTION_ID, LIBTV_PANORAMA_MODEL_OPTION_LABEL } from "@/workflow/ideart/lib/libtv/panorama"
import { LIBTV_SCRIPT_NODE_OPTIONS } from "@/workflow/ideart/lib/libtv/skill-capabilities"

type LibTvComponentConfig = {
  kind: LibTvNodeKind
  type: CanvasLayer["type"]
  width: number
  height: number
  name: string
  optionId: string
  optionLabel: string
}

export const LIBTV_TAPNOW_NODE_MIN_SIZE = 250
export const LIBTV_TAPNOW_GENERATOR_WIDTH = 250
export const LIBTV_TAPNOW_GENERATOR_HEIGHT = 250
export const LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH = 350
export const LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT = 350
export const LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH = 350
export const LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT = 350
export const LIBTV_TAPNOW_VIDEO_WIDTH = 444
export const LIBTV_TAPNOW_VIDEO_HEIGHT = 250
export const LIBTV_TAPNOW_VIDEO_GENERATOR_WIDTH = 622
export const LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT = 350
export const LIBTV_TAPNOW_AUDIO_HEIGHT = 148
export const LIBTV_TAPNOW_PLAYLIST_WIDTH = 960
export const LIBTV_TAPNOW_PLAYLIST_HEIGHT = 150
export const LIBTV_TAPNOW_THREED_WIDTH = 375
export const LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH = LIBTV_TAPNOW_VIDEO_WIDTH
export const LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT = LIBTV_TAPNOW_VIDEO_HEIGHT
export const LIBTV_TAPNOW_SCRIPT_WIDTH = 350
export const LIBTV_TAPNOW_SCRIPT_HEIGHT = 350

export const LIBTV_NODE_TOOL_TO_KIND: Record<string, LibTvNodeKind> = {
  "zmtv-text": "text",
  "zmtv-image": "image",
  "zmtv-video": "video",
  "zmtv-audio": "audio",
  "zmtv-script": "script",
  "libtv-text": "text",
  "libtv-image": "image",
  "libtv-video": "video",
  "libtv-audio": "audio",
  "libtv-script": "script",
}

export const LIBTV_NODE_OPTIONS: Record<LibTvNodeKind, Array<{ id: string; label: string }>> = {
  text: [
    { id: "custom", label: "文本输入" },
    { id: "text-to-video", label: "视频方案" },
    { id: "image-reverse-prompt", label: "图片解析" },
    { id: "text-to-music", label: "音乐方案" },
  ],
  image: [
    { id: "reference-image", label: "参考图片" },
    { id: "style-image", label: "风格图片" },
    { id: LIBTV_PANORAMA_MODEL_OPTION_ID, label: LIBTV_PANORAMA_MODEL_OPTION_LABEL },
  ],
  video: [
    { id: "start-end-to-video", label: "双帧视频" },
    { id: "first-frame-to-video", label: "单帧视频" },
    { id: "audio-to-video", label: "音频驱动" },
  ],
  audio: [
    { id: "music-inspiration", label: "音乐灵感" },
    { id: "audio-to-video", label: "音频驱动" },
  ],
  playlist: [],
  threed: [],
  "director-console-3d": [],
  script: LIBTV_SCRIPT_NODE_OPTIONS,
  "script-v2": LIBTV_SCRIPT_NODE_OPTIONS,
}

export function isLibTvTool(tool: string): tool is keyof typeof LIBTV_NODE_TOOL_TO_KIND {
  return tool in LIBTV_NODE_TOOL_TO_KIND
}

export function isLibTvLayer(layer: CanvasLayer | null | undefined): layer is CanvasLayer & { libtvNodeKind: LibTvNodeKind } {
  return Boolean(layer?.libtvNodeKind)
}

const LIBTV_COMPONENT_CONFIG: Record<LibTvComponentType, LibTvComponentConfig> = {
  "text-generator": {
    kind: "text",
    type: "gen_frame",
    width: LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
    height: LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
    name: "文本生成器",
    optionId: "",
    optionLabel: "",
  },
  "text-editor": {
    kind: "text",
    type: "gen_frame",
    width: LIBTV_TAPNOW_VIDEO_WIDTH,
    height: LIBTV_TAPNOW_VIDEO_HEIGHT,
    name: "文本生成器",
    optionId: "custom",
    optionLabel: "文本输入",
  },
  "image-generator": {
    kind: "image",
    type: "gen_frame",
    width: LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
    height: LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
    name: "图片生成器",
    optionId: "",
    optionLabel: "",
  },
  "storyboard-image": {
    kind: "image",
    type: "image",
    width: LIBTV_TAPNOW_VIDEO_WIDTH,
    height: LIBTV_TAPNOW_VIDEO_HEIGHT,
    name: "分镜图",
    optionId: "custom",
    optionLabel: "分镜图",
  },
  "image-asset": {
    kind: "image",
    type: "image",
    width: LIBTV_TAPNOW_GENERATOR_WIDTH,
    height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
    name: "图片生成器",
    optionId: "reference-image",
    optionLabel: "参考图片",
  },
  "image-reverse-prompt": {
    kind: "image",
    type: "image",
    width: LIBTV_TAPNOW_GENERATOR_WIDTH,
    height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
    name: "图片生成器",
    optionId: "reverse-prompt-image",
    optionLabel: "图片反推素材",
  },
  "video-generator": {
    kind: "video",
    type: "gen_frame",
    width: LIBTV_TAPNOW_VIDEO_GENERATOR_WIDTH,
    height: LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT,
    name: "视频生成器",
    optionId: "",
    optionLabel: "",
  },
  "video-asset": {
    kind: "video",
    type: "video",
    width: LIBTV_TAPNOW_VIDEO_WIDTH,
    height: LIBTV_TAPNOW_VIDEO_HEIGHT,
    name: "视频生成器",
    optionId: "",
    optionLabel: "",
  },
  "audio-generator": {
    kind: "audio",
    type: "gen_frame",
    width: LIBTV_TAPNOW_GENERATOR_WIDTH,
    height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
    name: "音频生成器",
    optionId: "",
    optionLabel: "",
  },
  "audio-asset": {
    kind: "audio",
    type: "gen_frame",
    width: LIBTV_TAPNOW_VIDEO_WIDTH,
    height: LIBTV_TAPNOW_AUDIO_HEIGHT,
    name: "音频生成器",
    optionId: "",
    optionLabel: "",
  },
  playlist: {
    kind: "playlist",
    type: "gen_frame",
    width: LIBTV_TAPNOW_PLAYLIST_WIDTH,
    height: LIBTV_TAPNOW_PLAYLIST_HEIGHT,
    name: "视频合成",
    optionId: "",
    optionLabel: "",
  },
  threed: {
    kind: "threed",
    type: "gen_frame",
    width: LIBTV_TAPNOW_THREED_WIDTH,
    height: LIBTV_TAPNOW_VIDEO_HEIGHT,
    name: "3D 世界",
    optionId: "",
    optionLabel: "",
  },
  "director-console-3d": {
    kind: "director-console-3d",
    type: "gen_frame",
    width: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
    height: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
    name: "3D 导演台",
    optionId: "",
    optionLabel: "",
  },
  "script-generator": {
    kind: "script",
    type: "gen_frame",
    width: LIBTV_TAPNOW_SCRIPT_WIDTH,
    height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
    name: "脚本生成器",
    optionId: "",
    optionLabel: "",
  },
  "script-v2-generator": {
    kind: "script-v2",
    type: "gen_frame",
    width: LIBTV_TAPNOW_SCRIPT_WIDTH,
    height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
    name: "脚本生成器",
    optionId: "",
    optionLabel: "",
  },
  "script-document": {
    kind: "script",
    type: "gen_frame",
    width: 800,
    height: 400,
    name: "脚本生成器",
    optionId: "",
    optionLabel: "",
  },
}

export function getLibTvNodeKindFromComponentType(componentType: LibTvComponentType): LibTvNodeKind {
  return LIBTV_COMPONENT_CONFIG[componentType].kind
}

export function getLibTvComponentConfig(componentType: LibTvComponentType): LibTvComponentConfig {
  return LIBTV_COMPONENT_CONFIG[componentType]
}

export function createLibTvLayerDraft(args: {
  componentType: LibTvComponentType
  x: number
  y: number
  width?: number
  height?: number
  name?: string
  patch?: Partial<Omit<CanvasLayer, "id" | "visible" | "locked">>
}): Omit<CanvasLayer, "id" | "visible" | "locked"> {
  const config = getLibTvComponentConfig(args.componentType)
  return {
    type: config.type,
    name: String(args.name || config.name),
    x: Number(args.x || 0),
    y: Number(args.y || 0),
    width: Number(args.width || config.width),
    height: Number(args.height || config.height),
    fill: "rgba(59, 130, 246, 0.05)",
    stroke: "#3B82F6",
    strokeWidth: 1,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    genWorkflow: "default",
    libtvNodeKind: config.kind,
    libtvComponentType: args.componentType,
    libtvOptionId: config.optionId,
    libtvOptionLabel: config.optionLabel,
    libtvPrompt: "",
    libtvMediaUrl: "",
    libtvCharacterKeys: [],
    libtvSceneKey: "",
    libtvNote: "",
    libtvTextEditorMode: false,
    libtvTextRichContent: "",
    libtvTextStatus: "idle",
    libtvTextError: "",
    ...(args.patch || {}),
  }
}

export function getLibTvComponentType(layer: CanvasLayer | null | undefined): LibTvComponentType | null {
  if (!layer?.libtvNodeKind) return null

  const explicitType = String(layer.libtvComponentType || "").trim()
  if (explicitType) return explicitType as LibTvComponentType

  return null
}

export function getLibTvImageRole(layer: CanvasLayer | null | undefined): "generator" | "asset" | "reverse-prompt" | null {
  if (layer?.libtvNodeKind !== "image") return null

  const componentType = getLibTvComponentType(layer)
  if (componentType === "image-generator") return "generator"
  if (componentType === "image-asset") return "asset"
  if (componentType === "image-reverse-prompt") return "reverse-prompt"
  return null
}

export function isLibTvImageGeneratorLayer(layer: CanvasLayer | null | undefined) {
  return getLibTvImageRole(layer) === "generator"
}

export function isLibTvImageAssetLayer(layer: CanvasLayer | null | undefined) {
  return getLibTvImageRole(layer) === "asset"
}

export function isLibTvReversePromptImageLayer(layer: CanvasLayer | null | undefined) {
  return getLibTvImageRole(layer) === "reverse-prompt"
}

export function getLibTvDefaultNodeConfig(kind: LibTvNodeKind) {
  switch (kind) {
    case "text":
      return {
        width: LIBTV_TAPNOW_GENERATOR_WIDTH,
        height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
        name: "Text",
        optionId: "",
        optionLabel: "",
      }
    case "image":
      return {
        width: LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
        height: LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
        name: "Image",
        optionId: "",
        optionLabel: "",
      }
    case "video":
      return {
        width: LIBTV_TAPNOW_VIDEO_WIDTH,
        height: LIBTV_TAPNOW_VIDEO_HEIGHT,
        name: "Video",
        optionId: "",
        optionLabel: "",
      }
    case "audio":
      return {
        width: LIBTV_TAPNOW_GENERATOR_WIDTH,
        height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
        name: "Audio",
        optionId: "",
        optionLabel: "",
      }
    case "playlist":
      return {
        width: LIBTV_TAPNOW_PLAYLIST_WIDTH,
        height: LIBTV_TAPNOW_PLAYLIST_HEIGHT,
        name: "Playlist",
        optionId: "",
        optionLabel: "",
      }
    case "threed":
      return {
        width: LIBTV_TAPNOW_THREED_WIDTH,
        height: LIBTV_TAPNOW_VIDEO_HEIGHT,
        name: "3D World",
        optionId: "",
        optionLabel: "",
      }
    case "director-console-3d":
      return {
        width: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
        height: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
        name: "3D 导演台",
        optionId: "",
        optionLabel: "",
      }
    case "script":
      return {
        width: LIBTV_TAPNOW_SCRIPT_WIDTH,
        height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
        name: "Script",
        optionId: "",
        optionLabel: "",
      }
    default:
      return {
        width: 1024,
        height: 720,
        name: "ZMTV 节点",
        optionId: "custom",
        optionLabel: "文本输入",
      }
  }
}

export function getLibTvNodeOptions(kind: LibTvNodeKind) {
  return LIBTV_NODE_OPTIONS[kind] || []
}

export function canvasLayerToLibTvWorkflowNode(layer: CanvasLayer): LibTvWorkflowNode | null {
  if (!isLibTvLayer(layer)) return null
  const resolvedMediaUrl = layer.libtvNodeKind === "image"
    ? String(layer.genResultImage || layer.src || layer.libtvMediaUrl || "")
    : String(layer.src || layer.libtvMediaUrl || "")
  return {
    id: layer.id,
    kind: layer.libtvNodeKind,
    x: Number(layer.x || 0),
    y: Number(layer.y || 0),
    width: Number(layer.width || 1024),
    height: Number(layer.height || 720),
    locked: Boolean(layer.locked),
    data: {
      title: String(layer.name || "ZMTV 节点"),
      content: String(layer.libtvTextRichContent || layer.libtvPrompt || ""),
      componentType: getLibTvComponentType(layer) || undefined,
      mediaUrl: resolvedMediaUrl,
      selectedOptionId: String(layer.libtvOptionId || ""),
      options: getLibTvNodeOptions(layer.libtvNodeKind),
      note: String(layer.libtvNote || ""),
    },
  }
}
