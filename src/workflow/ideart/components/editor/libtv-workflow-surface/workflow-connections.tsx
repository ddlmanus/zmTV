"use client";

import React, { useEffect, useRef } from "react";
import { Position } from "@xyflow/react";
import { Box, Link, Scissors } from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_TAPNOW_VIDEO_HEIGHT,
  LIBTV_TAPNOW_VIDEO_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import { LIBTV_IMAGE_SLASH_PRESETS } from "@/workflow/ideart/lib/libtv/image-presets";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import {
  isWorkflowImageGeneratorNode,
  isWorkflowImageGeneratorResultGroupNode,
  isWorkflowStoryboardImageNode,
  isWorkflowTextGeneratorNode,
  isWorkflowVideoGeneratorNode,
  isWorkflowVideoGeneratorResultNode,
} from "./workflow-node-kinds";
import {
  WORKFLOW_CABLE_COLORS,
  WORKFLOW_MULTI_SELECTION_CONNECTION_EVENT,
  WORKFLOW_VIDEO_UPSCALE_NODE_FRAME,
} from "./surface-contracts";
import {
  getTapNowNodeFrame,
  getWorkflowImageGeneratorFrame,
  getWorkflowImageRenderUrl,
  getWorkflowScriptNodeFrame,
  getWorkflowVideoGeneratorFrame,
  getWorkflowVideoPosterUrl,
  parseWorkflowAspectRatioSize,
  workflowImageDisplayFrameFromRatio,
  workflowOrdinaryImageDisplayFrameFromRatio,
} from "./workflow-media-utils";
import type {
  WorkflowCableTone,
  WorkflowImagePresetOption,
  WorkflowMediaMentionKind,
  WorkflowMediaMentionOption,
  WorkflowModelOption,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";

export function getWorkflowCableDirection(
  position: Position | undefined,
  fallback: Position,
) {
  switch (position || fallback) {
    case Position.Left:
      return { x: -1, y: 0 };
    case Position.Top:
      return { x: 0, y: -1 };
    case Position.Bottom:
      return { x: 0, y: 1 };
    default:
      return { x: 1, y: 0 };
  }
}

export function getWorkflowCablePath({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition = Position.Right,
  targetPosition = Position.Left,
}: {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition?: Position;
  targetPosition?: Position;
}) {
  const sourceDirection = getWorkflowCableDirection(
    sourcePosition,
    Position.Right,
  );
  const targetDirection = getWorkflowCableDirection(
    targetPosition,
    Position.Left,
  );
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const directDistance = Math.hypot(deltaX, deltaY);
  const axisDistance =
    sourceDirection.x === 0 ? Math.abs(deltaY) : Math.abs(deltaX);
  const crossDistance =
    sourceDirection.x === 0 ? Math.abs(deltaX) : Math.abs(deltaY);
  const tangent = Math.max(
    48,
    Math.min(
      280,
      directDistance * 0.24 + axisDistance * 0.2 + crossDistance * 0.1,
    ),
  );
  const sourceControlX = sourceX + sourceDirection.x * tangent;
  const sourceControlY = sourceY + sourceDirection.y * tangent;
  const targetControlX = targetX + targetDirection.x * tangent;
  const targetControlY = targetY + targetDirection.y * tangent;

  return `M ${sourceX},${sourceY} C ${sourceControlX},${sourceControlY} ${targetControlX},${targetControlY} ${targetX},${targetY}`;
}

export function getWorkflowCableTone(
  node: LibTvWorkflowNode | undefined,
): WorkflowCableTone {
  if (isWorkflowImageGeneratorResultGroupNode(node)) return "image";
  switch (node?.kind) {
    case "text":
    case "script":
    case "script-v2":
      return "text";
    case "image":
      return "image";
    case "video":
      return "video";
    case "audio":
    case "playlist":
      return "audio";
    case "threed":
    case "director-console-3d":
      return "spatial";
    default:
      return "neutral";
  }
}

export function getWorkflowCableColor(tone: WorkflowCableTone | undefined) {
  return WORKFLOW_CABLE_COLORS[tone || "neutral"];
}

export type WorkflowMultiSelectionConnectionFeedback =
  | "valid"
  | "invalid"
  | "duplicate"
  | null;

export type WorkflowMultiSelectionConnectionEventDetail = {
  flowRoot: Element | null;
  active: boolean;
  targetId: string | null;
  feedback: WorkflowMultiSelectionConnectionFeedback;
};

export function emitWorkflowMultiSelectionConnection(
  detail: WorkflowMultiSelectionConnectionEventDetail,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<WorkflowMultiSelectionConnectionEventDetail>(
      WORKFLOW_MULTI_SELECTION_CONNECTION_EVENT,
      { detail },
    ),
  );
}

export const WORKFLOW_IMAGE_GROUP_STACK_OFFSET_X = 12;

export const WORKFLOW_IMAGE_GROUP_STACK_OFFSET_Y = 4;

export const WORKFLOW_IMAGE_GROUP_STACK_EXTRA = 18;

export const WORKFLOW_CONTEXT_MENU_WIDTH = 240;

export const WORKFLOW_NODE_CONTEXT_MENU_HEIGHT = 472;

export const WORKFLOW_PANE_CONTEXT_MENU_HEIGHT = 220;

export const WORKFLOW_EDGE_CONTEXT_MENU_HEIGHT = 52;

export const WORKFLOW_CONTEXT_MENU_MARGIN = 12;

export const WORKFLOW_SLASH_MENU_MAX_HEIGHT = 384;

export const WORKFLOW_SLASH_MENU_MARGIN = 8;

export const LIBTV_TEXT_GENERATOR_PROMPT_PLACEHOLDER =
  "写下你想表达的人物、环境或情节起点。例如：一位机械师在雨夜修复一台老相机。";

export const LIBTV_SCRIPT_GENERATOR_PROMPT_PLACEHOLDER =
  "描述故事片段、人物关系或环境变化，为你生成镜头脚本";

export function useLatestWorkflowRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export type WorkflowNodeContextMenuState = {
  nodeId: string;
  x: number;
  y: number;
} | null;

export type WorkflowEdgeContextMenuState = {
  edgeId: string;
  x: number;
  y: number;
} | null;

export type WorkflowPaneContextMenuState = {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
} | null;

export type WorkflowNodeCommandMenuState = {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
} | null;

export type WorkflowNodeAddMenuOption = {
  id?: string;
  kind?: LibTvWorkflowNode["kind"];
  label: string;
  description?: string;
  disabled?: boolean;
  badge?: string;
  badgeTone?: "beta" | "new";
  submenu?: boolean;
  submenuOptions?: WorkflowNodeAddMenuOption[];
  icon?: React.ReactNode;
};

export type WorkflowSelectableAddNodeOption = WorkflowNodeAddMenuOption & {
  kind: LibTvWorkflowNode["kind"];
};

export const SCRIPT_ADD_NODE_SUBMENU_OPTIONS: WorkflowNodeAddMenuOption[] = [
  { kind: "script-v2", label: "脚本生成器", badge: "NEW", badgeTone: "new" },
  {
    kind: "script",
    label: "脚本生成器（旧版）",
    badge: "Beta",
    badgeTone: "beta",
  },
];

export const ADD_NODE_OPTIONS: WorkflowSelectableAddNodeOption[] = [
  { kind: "text", label: "文本生成器", description: "文案、对白与说明文本" },
  { kind: "image", label: "图片生成器" },
  { kind: "video", label: "视频生成器" },
  {
    kind: "playlist",
    label: "视频合成",
    badge: "Beta",
    badgeTone: "beta",
    icon: <Scissors className="size-3.5" />,
  },
  {
    kind: "threed",
    label: "3D 世界",
    description: "生成或查看可漫游 3D 世界",
    icon: <Box className="size-3.5" />,
  },
  {
    kind: "director-console-3d",
    label: "3D 导演台",
    description: "在 3D 空间中搭建场景并输出多视角画面",
    badge: "NEW",
    badgeTone: "new",
    icon: <Box className="size-3.5" />,
  },
  { kind: "audio", label: "音频生成器" },
  {
    kind: "script-v2",
    label: "脚本生成器",
    description: "叙事、分镜与镜头说明",
  },
];

export const TEXT_NODE_ADD_OPTIONS = ADD_NODE_OPTIONS.filter(
  (option) =>
    option.kind === "text" ||
    option.kind === "image" ||
    option.kind === "script-v2",
);

export const TEXT_NODE_REFERENCE_OPTIONS = ADD_NODE_OPTIONS;

export const TEXT_GENERATOR_REFERENCE_OPTIONS: WorkflowNodeAddMenuOption[] = [
  { kind: "text", label: "文本生成器" },
  { kind: "image", label: "图片生成器" },
  { kind: "video", label: "视频生成器" },
  {
    kind: "playlist",
    label: "视频合成",
    badge: "Beta",
    badgeTone: "beta",
    icon: <Scissors className="size-3.5" />,
  },
  { kind: "threed", label: "3D 世界", icon: <Box className="size-3.5" /> },
  {
    kind: "director-console-3d",
    label: "3D 导演台",
    badge: "NEW",
    badgeTone: "new",
    icon: <Box className="size-3.5" />,
  },
  { kind: "audio", label: "音频生成器" },
  { kind: "script-v2", label: "脚本生成器" },
  {
    id: "reference-node",
    label: "参考节点",
    disabled: true,
    icon: <Link className="size-3.5" />,
  },
];

export const TEXT_GENERATOR_CONTEXT_MENU_OPTIONS: WorkflowNodeAddMenuOption[] =
  [
    { kind: "text", label: "文本生成器" },
    { kind: "image", label: "图片生成器" },
    { kind: "video", label: "视频生成器" },
    {
      kind: "playlist",
      label: "视频合成",
      badge: "Beta",
      badgeTone: "beta",
      icon: <Scissors className="size-3.5" />,
    },
    { kind: "threed", label: "3D 世界", icon: <Box className="size-3.5" /> },
    {
      kind: "director-console-3d",
      label: "3D 导演台",
      badge: "NEW",
      badgeTone: "new",
      icon: <Box className="size-3.5" />,
    },
    { kind: "audio", label: "音频生成器" },
    { kind: "script-v2", label: "脚本生成器" },
    {
      id: "reference-node",
      label: "参考节点",
      disabled: true,
      icon: <Link className="size-3.5" />,
    },
  ];

export const IMAGE_NODE_CONTEXT_OPTIONS = ADD_NODE_OPTIONS.filter(
  (option) =>
    option.kind === "text" ||
    option.kind === "image" ||
    option.kind === "script-v2",
);

export const IMAGE_GENERATOR_CONTEXT_OPTIONS = [
  { kind: "image" as const, label: "图片生成器" },
  { kind: "text" as const, label: "文本生成器" },
  { kind: "script-v2" as const, label: "脚本生成器" },
];

export const IMAGE_NODE_OUTPUT_OPTIONS = ADD_NODE_OPTIONS.filter(
  (option) => option.kind !== "audio",
);

export const VIDEO_GENERATOR_CONTEXT_OPTIONS = [
  { kind: "video" as const, label: "视频生成器", description: "普通参考视频" },
  {
    kind: "image" as const,
    label: "图片生成器",
    description: "普通首帧、尾帧或参考图",
  },
  { kind: "text" as const, label: "文本生成器", description: "普通提示文本" },
  {
    kind: "script-v2" as const,
    label: "脚本生成器",
    description: "普通脚本内容",
  },
  { kind: "audio" as const, label: "音频生成器", description: "普通音频文件" },
];

export const VIDEO_NODE_CONTEXT_OPTIONS = ADD_NODE_OPTIONS.filter(
  (option) =>
    option.kind === "text" ||
    option.kind === "image" ||
    option.kind === "audio" ||
    option.kind === "script-v2",
);

export const VIDEO_NODE_OUTPUT_OPTIONS = ADD_NODE_OPTIONS.filter(
  (option) =>
    option.kind === "text" ||
    option.kind === "image" ||
    option.kind === "video" ||
    option.kind === "script-v2",
);

export const SCRIPT_NODE_OUTPUT_OPTIONS = [
  {
    kind: "video" as const,
    label: "视频生成器",
    description: "按脚本分镜生成视频",
  },
  {
    kind: "image" as const,
    label: "图片生成器",
    description: "按脚本分镜生成图片",
  },
  {
    kind: "text" as const,
    label: "文本生成器",
    description: "基于脚本继续扩写",
  },
];

export const WORKFLOW_UNIFIED_HANDLE_MENU_OPTIONS: WorkflowNodeAddMenuOption[] =
  [
    { kind: "text", label: "文本生成器" },
    { kind: "image", label: "图片生成器" },
    { kind: "video", label: "视频生成器" },
    {
      kind: "playlist",
      label: "视频合成",
      badge: "Beta",
      badgeTone: "beta",
      icon: <Scissors className="size-3.5" />,
    },
    { kind: "threed", label: "3D 世界", icon: <Box className="size-3.5" /> },
    {
      kind: "director-console-3d",
      label: "3D 导演台",
      badge: "NEW",
      badgeTone: "new",
      icon: <Box className="size-3.5" />,
    },
    { kind: "audio", label: "音频生成器" },
    { kind: "script-v2", label: "脚本生成器" },
    {
      id: "reference-node",
      label: "参考节点",
      icon: <Link className="size-3.5" />,
    },
  ];

export function getWorkflowAddOptionKey(option: WorkflowNodeAddMenuOption) {
  return option.kind || option.id || option.label;
}

export function getUnifiedWorkflowHandleMenuOptions(
  allowedOptions: WorkflowNodeAddMenuOption[],
) {
  const allowedByKey = new Map<string, WorkflowNodeAddMenuOption>();
  allowedOptions.forEach((option) => {
    allowedByKey.set(getWorkflowAddOptionKey(option), option);
    option.submenuOptions?.forEach((submenuOption) => {
      allowedByKey.set(getWorkflowAddOptionKey(submenuOption), submenuOption);
    });
  });
  const scriptV2Option = allowedByKey.get("script-v2");
  const legacyScriptOption = allowedByKey.get("script");
  if (scriptV2Option && !legacyScriptOption) {
    allowedByKey.set("script", {
      ...SCRIPT_ADD_NODE_SUBMENU_OPTIONS[1],
      disabled: scriptV2Option.disabled,
    });
  } else if (legacyScriptOption && !scriptV2Option) {
    allowedByKey.set("script-v2", {
      ...SCRIPT_ADD_NODE_SUBMENU_OPTIONS[0],
      disabled: legacyScriptOption.disabled,
    });
  }
  return WORKFLOW_UNIFIED_HANDLE_MENU_OPTIONS.map((option) => {
    const allowedOption = allowedByKey.get(getWorkflowAddOptionKey(option));
    const submenuOptions = option.submenuOptions?.map((submenuOption) => {
      const allowedSubmenuOption = allowedByKey.get(
        getWorkflowAddOptionKey(submenuOption),
      );
      return {
        ...submenuOption,
        disabled:
          !allowedSubmenuOption || Boolean(allowedSubmenuOption.disabled),
        description:
          allowedSubmenuOption?.description || submenuOption.description,
      };
    });
    const hasEnabledSubmenuOption = submenuOptions?.some(
      (submenuOption) => !submenuOption.disabled,
    );
    return {
      ...option,
      submenuOptions,
      disabled: submenuOptions?.length
        ? !hasEnabledSubmenuOption
        : !allowedOption || Boolean(allowedOption.disabled),
      description: allowedOption?.description || option.description,
    };
  });
}

export function getWorkflowOutputAddOptionsForNode(
  node: LibTvWorkflowNode | undefined,
  flags?: { hasIncomingTextEdge?: boolean },
) {
  if (!node) return [];
  const handleMenuKind: LibTvWorkflowNode["kind"] =
    isWorkflowImageGeneratorResultGroupNode(node) ? "image" : node.kind;
  const rawOptions = isWorkflowTextGeneratorNode(node)
    ? TEXT_GENERATOR_REFERENCE_OPTIONS
    : node.kind === "text" && flags?.hasIncomingTextEdge
      ? TEXT_NODE_REFERENCE_OPTIONS.filter((option) => option.kind !== "text")
      : node.kind === "text"
        ? TEXT_NODE_REFERENCE_OPTIONS
        : handleMenuKind === "image"
          ? IMAGE_NODE_OUTPUT_OPTIONS
          : handleMenuKind === "video"
            ? VIDEO_NODE_OUTPUT_OPTIONS
            : handleMenuKind === "script" || handleMenuKind === "script-v2"
              ? SCRIPT_NODE_OUTPUT_OPTIONS
              : handleMenuKind === "group"
                ? []
                : ADD_NODE_OPTIONS;
  return getUnifiedWorkflowHandleMenuOptions(rawOptions);
}

export function getWorkflowContextAddOptionsForNode(
  node: LibTvWorkflowNode | undefined,
) {
  if (!node) return [];
  const isImageGeneratorResultGroup =
    isWorkflowImageGeneratorResultGroupNode(node);
  const handleMenuKind: LibTvWorkflowNode["kind"] = isImageGeneratorResultGroup
    ? "image"
    : node.kind;
  const isTextGeneratorNode = isWorkflowTextGeneratorNode(node);
  const baseOptions =
    node.kind === "group" && !isImageGeneratorResultGroup
      ? []
      : isTextGeneratorNode
        ? TEXT_GENERATOR_CONTEXT_MENU_OPTIONS
        : node.kind === "text"
          ? TEXT_NODE_ADD_OPTIONS
          : ADD_NODE_OPTIONS;
  const rawOptions = isWorkflowImageGeneratorNode(node)
    ? IMAGE_GENERATOR_CONTEXT_OPTIONS
    : isWorkflowVideoGeneratorNode(node)
      ? VIDEO_GENERATOR_CONTEXT_OPTIONS
      : handleMenuKind === "image"
        ? IMAGE_NODE_CONTEXT_OPTIONS
        : handleMenuKind === "video"
          ? VIDEO_NODE_CONTEXT_OPTIONS
          : baseOptions;
  return getUnifiedWorkflowHandleMenuOptions(rawOptions).map((option) =>
    option.kind === "text"
      ? { ...option, label: "文本节点", description: "输入提示词或上下文文字" }
      : option,
  );
}

export const WORKFLOW_INLINE_POSTER_MAX_EDGE = 1280;

export type WorkflowInlinePosterCaptureTask = {
  cancelled: boolean;
  run: (isCancelled: () => boolean) => Promise<void>;
};

export const workflowInlinePosterCaptureQueue: WorkflowInlinePosterCaptureTask[] =
  [];

export let workflowInlinePosterCaptureRunning = false;

export function drainWorkflowInlinePosterCaptureQueue() {
  if (workflowInlinePosterCaptureRunning) return;
  const task = workflowInlinePosterCaptureQueue.shift();
  if (!task) return;
  if (task.cancelled) {
    drainWorkflowInlinePosterCaptureQueue();
    return;
  }
  workflowInlinePosterCaptureRunning = true;
  globalThis.setTimeout(() => {
    void task
      .run(() => task.cancelled)
      .catch(() => undefined)
      .finally(() => {
        workflowInlinePosterCaptureRunning = false;
        drainWorkflowInlinePosterCaptureQueue();
      });
  }, 0);
}

export function enqueueWorkflowInlinePosterCapture(
  run: WorkflowInlinePosterCaptureTask["run"],
) {
  const task: WorkflowInlinePosterCaptureTask = { cancelled: false, run };
  workflowInlinePosterCaptureQueue.push(task);
  drainWorkflowInlinePosterCaptureQueue();
  return () => {
    task.cancelled = true;
  };
}

export function getWorkflowInlinePosterCanvasSize(
  videoWidth: number,
  videoHeight: number,
) {
  const width = Math.max(1, Math.round(Number(videoWidth) || 1));
  const height = Math.max(1, Math.round(Number(videoHeight) || 1));
  const scale = Math.min(
    1,
    WORKFLOW_INLINE_POSTER_MAX_EDGE / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export const WORKFLOW_NODE_TITLE_BAR_CLASS =
  "workflow-node-title-bar pointer-events-auto absolute -top-1 left-0 z-[1] flex w-full min-w-0 max-w-[min(622px,calc(100vw-32px))] -translate-y-full items-center gap-1 whitespace-nowrap text-left text-[var(--canvas-controls-icon)]";

export const WORKFLOW_NODE_TITLE_BAR_STYLE = {
  fontSize: 13,
  lineHeight: "18px",
} as const;

export const WORKFLOW_NODE_TITLE_BAR_LARGE_STYLE = {
  fontSize: 14,
  lineHeight: "20px",
} as const;

export const WORKFLOW_REACT_FLOW_PRO_OPTIONS = Object.freeze({
  hideAttribution: true,
});

export const WORKFLOW_IMAGE_SLASH_PRESET_OPTIONS: WorkflowImagePresetOption[] =
  LIBTV_IMAGE_SLASH_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    defaultAspectRatio: preset.defaultAspectRatio,
    defaultImageSize: preset.defaultImageSize,
    forceReferenceImages: preset.forceReferenceImages,
    allowTextOnly: preset.allowTextOnly,
  }));

export const WORKFLOW_IMAGE_PRESET_GROUPS: Array<{
  title: string;
  ids: string[];
}> = [
  {
    title: "分镜叙事",
    ids: [
      "blocking-storyboard",
      "storyboard-sequence",
      "story-twenty-five-grid",
      "story-four-grid",
      "evolve-3-seconds-later",
      "evolve-5-seconds-before",
    ],
  },
  { title: "质感调节", ids: ["cinematic-lighting"] },
  { title: "空间与机位", ids: ["panorama-720", "multi-angle-nine-grid"] },
  {
    title: "设定图",
    ids: [
      "face-three-view",
      "character-design-sheet",
      "character-three-view",
      "scene-design-sheet",
      "product-design-sheet",
    ],
  },
];

export const WORKFLOW_IMAGE_PRESET_GROUP_LOOKUP = new Map(
  WORKFLOW_IMAGE_PRESET_GROUPS.flatMap((group) =>
    group.ids.map((id) => [id, group.title] as const),
  ),
);

export const WORKFLOW_IMAGE_TOOLBAR_PRESET_IDS = [
  "multi-angle-nine-grid",
  "story-four-grid",
  "face-three-view",
  "character-design-sheet",
  "scene-design-sheet",
  "product-design-sheet",
  "story-twenty-five-grid",
  "cinematic-lighting",
  "character-three-view",
] as const;

export const WORKFLOW_IMAGE_TOOLBAR_PRESET_OPTIONS =
  WORKFLOW_IMAGE_TOOLBAR_PRESET_IDS.map((id) =>
    WORKFLOW_IMAGE_SLASH_PRESET_OPTIONS.find((preset) => preset.id === id),
  ).filter((preset): preset is WorkflowImagePresetOption => Boolean(preset));

export function resolveWorkflowGptImage2ModelValue(
  models: WorkflowModelOption[],
) {
  const matched =
    models.find((model) => {
      const id = String(model.id || "")
        .trim()
        .toLowerCase();
      const modelId = String(model.modelId || "")
        .trim()
        .toLowerCase();
      return (
        id === "gpt-image-2" ||
        modelId === "gpt-image-2" ||
        id.startsWith("gpt-image-2@@") ||
        modelId.startsWith("gpt-image-2@@")
      );
    }) ||
    models.find((model) => {
      const identity =
        `${String(model.id || "")} ${String(model.modelId || "")}`.toLowerCase();
      return identity.includes("gpt-image-2");
    });
  return String(matched?.id || matched?.modelId || "gpt-image-2").trim();
}

export function getWorkflowNodeTitleWidth(title: string, minEm = 4) {
  return `${Math.max(minEm, Array.from(String(title || "")).length + 1)}em`;
}

export function getWorkflowScriptNodeTitle(title?: string | null) {
  const normalized = String(title || "").trim();
  if (
    !normalized ||
    normalized === "脚本" ||
    normalized === "脚本生成器" ||
    normalized === "脚本视图"
  )
    return "脚本生成器";
  return normalized;
}

export function isOrdinaryWorkflowVideoNode(
  node: Pick<LibTvWorkflowNode, "kind" | "data">,
) {
  if (node.kind !== "video") return false;
  const looksLikeGenerator =
    node.data?.mediaRole === "generator" ||
    node.data?.componentType === "video-generator" ||
    Boolean(
      String(
        node.data?.workflowGenerationTaskId ||
          node.data?.workflowGenerationTaskType ||
          node.data?.workflowGenerationBackgroundTaskId ||
          "",
      ).trim(),
    ) ||
    Boolean(
      String(node.data?.prompt || "").trim() &&
      String(node.data?.modelId || "").trim(),
    );
  return !looksLikeGenerator;
}

export function isOrdinaryWorkflowImageNode(
  node: Pick<LibTvWorkflowNode, "kind" | "data">,
) {
  return node.kind === "image" && node.data?.mediaRole !== "generator";
}

export function getWorkflowMediaNaturalRatio(
  node: Pick<LibTvWorkflowNode, "width" | "height" | "data">,
) {
  const naturalWidth = Number(node.data?.workflowMediaNaturalWidth || 0);
  const naturalHeight = Number(node.data?.workflowMediaNaturalHeight || 0);
  if (
    Number.isFinite(naturalWidth) &&
    Number.isFinite(naturalHeight) &&
    naturalWidth > 0 &&
    naturalHeight > 0
  ) {
    return naturalWidth / naturalHeight;
  }
  const width = Number(node.width || 0);
  const height = Number(node.height || 0);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return width / height;
  }
  return null;
}

export function getWorkflowVideoResultDisplayFrame(
  node: Pick<LibTvWorkflowNode, "width" | "height" | "data">,
) {
  const naturalWidth = Number(node.data?.workflowMediaNaturalWidth || 0);
  const naturalHeight = Number(node.data?.workflowMediaNaturalHeight || 0);
  if (
    Number.isFinite(naturalWidth) &&
    Number.isFinite(naturalHeight) &&
    naturalWidth > 0 &&
    naturalHeight > 0
  ) {
    return workflowOrdinaryImageDisplayFrameFromRatio(
      naturalWidth,
      naturalHeight,
    );
  }
  const ratioSize = parseWorkflowAspectRatioSize(
    String(node.data?.aspectRatio || ""),
    0,
    0,
  );
  if (ratioSize.width > 0 && ratioSize.height > 0) {
    return workflowOrdinaryImageDisplayFrameFromRatio(
      ratioSize.width,
      ratioSize.height,
    );
  }
  const width = Number(node.width || 0);
  const height = Number(node.height || 0);
  if (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  ) {
    return workflowOrdinaryImageDisplayFrameFromRatio(width, height);
  }
  return workflowOrdinaryImageDisplayFrameFromRatio(
    LIBTV_TAPNOW_VIDEO_WIDTH,
    LIBTV_TAPNOW_VIDEO_HEIGHT,
  );
}

export function getWorkflowNodeMinimumFrame(node: LibTvWorkflowNode) {
  if (
    node.kind === "video" &&
    node.data?.componentType === "video-generator" &&
    String(node.data?.videoMethod || "") === "upscale"
  ) {
    return WORKFLOW_VIDEO_UPSCALE_NODE_FRAME;
  }
  if (isWorkflowStoryboardImageNode(node)) {
    const width = Number(node.width || 0);
    const height = Number(node.height || 0);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return { width, height };
    }
    const ratioSize = parseWorkflowAspectRatioSize(
      String(node.data?.aspectRatio || "16:9"),
      16,
      9,
    );
    return workflowImageDisplayFrameFromRatio(
      ratioSize.width,
      ratioSize.height,
    );
  }
  if (node.kind === "image" && node.data?.mediaRole === "generator") {
    return getWorkflowImageGeneratorFrame(
      String(node.data?.aspectRatio || "1:1"),
    );
  }
  if (isWorkflowVideoGeneratorResultNode(node)) {
    return getWorkflowVideoResultDisplayFrame(node);
  }
  if (isWorkflowVideoGeneratorNode(node)) {
    return getWorkflowVideoGeneratorFrame(
      String(node.data?.aspectRatio || "16:9"),
    );
  }
  if (isOrdinaryWorkflowImageNode(node) || isOrdinaryWorkflowVideoNode(node)) {
    if (node.data?.workflowMediaFrameLocked) {
      return isOrdinaryWorkflowVideoNode(node)
        ? workflowOrdinaryImageDisplayFrameFromRatio(
            LIBTV_TAPNOW_VIDEO_WIDTH,
            LIBTV_TAPNOW_VIDEO_HEIGHT,
          )
        : workflowOrdinaryImageDisplayFrameFromRatio(1, 1);
    }
    const naturalWidth = Number(node.data?.workflowMediaNaturalWidth || 0);
    const naturalHeight = Number(node.data?.workflowMediaNaturalHeight || 0);
    if (naturalWidth > 0 && naturalHeight > 0) {
      return workflowOrdinaryImageDisplayFrameFromRatio(
        naturalWidth,
        naturalHeight,
      );
    }
    const width = Number(node.width || 0);
    const height = Number(node.height || 0);
    if (width > 0 && height > 0) {
      return workflowOrdinaryImageDisplayFrameFromRatio(width, height);
    }
    return isOrdinaryWorkflowVideoNode(node)
      ? workflowOrdinaryImageDisplayFrameFromRatio(
          LIBTV_TAPNOW_VIDEO_WIDTH,
          LIBTV_TAPNOW_VIDEO_HEIGHT,
        )
      : workflowOrdinaryImageDisplayFrameFromRatio(1, 1);
  }
  if (node.kind === "script") return getWorkflowScriptNodeFrame(node);
  return getTapNowNodeFrame(node.kind);
}

export function resolveWorkflowSlashMenuPosition(
  textarea: HTMLTextAreaElement | null,
) {
  if (typeof window === "undefined" || !textarea) return null;
  const rect = textarea.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const edge = WORKFLOW_CONTEXT_MENU_MARGIN;
  const width = Math.max(240, Math.min(rect.width, viewportWidth - edge * 2));
  const left = Math.max(
    edge,
    Math.min(rect.left, viewportWidth - width - edge),
  );
  const availableAbove = rect.top - edge - WORKFLOW_SLASH_MENU_MARGIN;
  const availableBelow =
    viewportHeight - rect.bottom - edge - WORKFLOW_SLASH_MENU_MARGIN;
  const openAbove =
    availableAbove >= Math.min(WORKFLOW_SLASH_MENU_MAX_HEIGHT, availableBelow);
  const maxHeight = Math.max(
    160,
    Math.min(
      WORKFLOW_SLASH_MENU_MAX_HEIGHT,
      openAbove ? availableAbove : availableBelow,
    ),
  );
  return {
    left,
    top: openAbove
      ? Math.max(edge, rect.top - WORKFLOW_SLASH_MENU_MARGIN)
      : Math.min(
          viewportHeight - edge,
          rect.bottom + WORKFLOW_SLASH_MENU_MARGIN,
        ),
    width,
    maxHeight,
    placement: openAbove ? ("top" as const) : ("bottom" as const),
  };
}

export function resolveWorkflowMentionTrigger(text: string, cursor: number) {
  const before = String(text || "").slice(0, Math.max(0, cursor));
  const matched = before.match(/@([\w\u4e00-\u9fa5-]*)$/);
  if (!matched) return null;
  const query = String(matched[1] || "");
  if (query.includes(" ") || query.includes("\n")) return null;
  return {
    query,
    start: before.length - matched[0].length,
    end: before.length,
  };
}

export function insertWorkflowMentionAtCursor(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insertText: string,
) {
  const trigger = resolveWorkflowMentionTrigger(text, selectionStart);
  const replaceStart = trigger ? trigger.start : selectionStart;
  const nextValue = `${text.slice(0, replaceStart)}${insertText} ${text.slice(selectionEnd)}`;
  const nextCursor = replaceStart + insertText.length + 1;
  return { nextValue, nextCursor };
}

export function removeWorkflowSlashCommand(text: string) {
  return String(text || "")
    .replace(/(?:^|\s)\/[\w\u4e00-\u9fa5-]*\s*$/, "")
    .trim();
}

export function getWorkflowMentionKindLabel(kind: WorkflowMediaMentionKind) {
  if (kind === "video") return "视频";
  if (kind === "audio") return "音频";
  return "图片";
}

export function WorkflowMediaMentionPreview({
  item,
}: {
  item: WorkflowMediaMentionOption;
}) {
  const url = String(item.url || "").trim();
  const hasVisualPreview =
    (item.kind === "image" || item.kind === "video") && Boolean(url);
  const videoPosterUrl =
    item.kind === "video" && url ? getWorkflowVideoPosterUrl(url) : "";
  return (
    <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/[0.08] text-white/68">
      {item.kind === "image" && url ? (
        <img
          src={getWorkflowImageRenderUrl(url)}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : item.kind === "video" && videoPosterUrl ? (
        <img
          src={getWorkflowImageRenderUrl(videoPosterUrl)}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      {!hasVisualPreview || (item.kind === "video" && !videoPosterUrl) ? (
        <span className="relative z-10 flex size-full items-center justify-center">
          <TapNowNodeIcon kind={item.kind} size={14} opacity={0.82} />
        </span>
      ) : item.kind === "video" ? (
        <span className="absolute bottom-0.5 right-0.5 z-10 flex size-4 items-center justify-center rounded bg-black/50 text-white/86">
          <TapNowNodeIcon kind={item.kind} size={10} opacity={0.9} />
        </span>
      ) : null}
      {!hasVisualPreview ? null : (
        <span className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-inset ring-white/10" />
      )}
    </span>
  );
}

export function collectWorkflowScriptReferenceMedia(
  scriptNode: WorkflowUpstreamNodeSummary,
) {
  const rows = Array.isArray(scriptNode.scriptResult?.rows)
    ? scriptNode.scriptResult.rows
    : [];
  const items: Array<{
    id: string;
    kind: "image";
    title: string;
    mediaUrl: string;
    sourceId: string;
  }> = [];
  const seen = new Set<string>();
  const push = (
    rowIndex: number,
    key: "referenceImage" | "characterImage1" | "characterImage2",
    value: unknown,
  ) => {
    const mediaUrl = String(value || "").trim();
    if (!mediaUrl || seen.has(mediaUrl)) return;
    seen.add(mediaUrl);
    const shotNumber = String(
      rows[rowIndex]?.shotNumber || rowIndex + 1,
    ).trim();
    const fieldLabel =
      key === "referenceImage"
        ? "视频参考图"
        : key === "characterImage1"
          ? "人物图1"
          : "人物图2";
    items.push({
      id: `${scriptNode.id}:${rowIndex}:${key}`,
      kind: "image",
      title: `分镜${shotNumber} ${fieldLabel}`,
      mediaUrl,
      sourceId: scriptNode.id,
    });
  };
  rows.forEach((row, rowIndex) => {
    push(rowIndex, "referenceImage", row.referenceImage);
    push(rowIndex, "characterImage1", row.characterImage1);
    push(rowIndex, "characterImage2", row.characterImage2);
  });
  return items;
}
