"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReactFlow, type Edge, type Node } from "@xyflow/react";
import {
  ArrowUp,
  Box,
  Check,
  ChevronDown,
  CircleHelp,
  Loader2,
  Settings2,
  X,
} from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import {
  GEMINI_ASPECT_RATIO_ORDER,
  getClosestGeminiAspectRatio,
  getGeminiResolution,
  isGeminiAspectRatioKey,
  type GeminiAspectRatioKey,
} from "@/workflow/ideart/lib/models/gemini-image-config";
import { WorkflowExtraParametersPanel } from "./workflow-extra-parameters";
import { WorkflowAnchoredPopover } from "./workflow-anchored-popover";
import {
  getWorkflowImageToolModelValue,
  useWorkflowImageToolSettings,
} from "./nodes/workflow-image-tool-settings";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import { AspectRatioIcon } from "./workflow-icons";
import { CANVAS_CONTROLS_MENU_PANEL_STYLE } from "./surface-contracts";
import {
  getWorkflowImageRenderUrl,
  loadWorkflowCropImage,
  parseWorkflowDurationSeconds,
} from "./workflow-media-utils";
import { fetchWorkflowModelOptions } from "./workflow-models";
import { WorkflowModelIcon } from "./generation-popovers";
import { WorkflowCropCornerHandle, WorkflowCropEdgeHandle } from "./image-crop";
import type {
  WorkflowCropDragMode,
  WorkflowCropDragState,
  WorkflowCropRect,
  WorkflowImageExpandRequest,
  WorkflowImageUpscaleRequest,
  WorkflowOverlayNodeData,
  WorkflowUpscaleImageSizeKey,
  WorkflowVideoUpscaleRequest,
} from "./surface-contracts";
import type {
  WorkflowModelOption,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";

export type WorkflowSelectOption = {
  key: string;
  label: string;
  description?: string;
};

export const WORKFLOW_UPSCALE_SIZE_OPTIONS: Array<
  WorkflowSelectOption & { value: WorkflowUpscaleImageSizeKey; cost: number }
> = [
  { key: "1K", value: "1K", label: "1K", cost: 2 },
  { key: "2K", value: "2K", label: "2K", cost: 4 },
  { key: "4K", value: "4K", label: "4K", cost: 8 },
  { key: "8K", value: "8K", label: "8K", cost: 16 },
];

export const WORKFLOW_EXPAND_SCALE_OPTIONS: Array<
  WorkflowSelectOption & { multiplier: number }
> = [
  { key: "1x", label: "1x", multiplier: 1 },
  { key: "1.5x", label: "1.5x", multiplier: 1.5 },
  { key: "2x", label: "2x", multiplier: 2 },
];

export const WORKFLOW_EXPAND_PRESET_OPTIONS: Array<
  WorkflowSelectOption & {
    defaultRatioKey: string;
    defaultScaleKey: string;
    prompt: string;
  }
> = [
  {
    key: "general",
    label: "通用",
    defaultRatioKey: "original",
    defaultScaleKey: "1.5x",
    prompt:
      "保持原图主体和文字完全不变，自然延展四周背景与环境，补全边缘细节，适合通用画面扩展。",
  },
  {
    key: "instagram",
    label: "Instagram",
    defaultRatioKey: "4:5",
    defaultScaleKey: "1x",
    prompt:
      "保持原图主体、品牌元素和文字完全不变，为 Instagram 帖子扩展画面。优先生成更适合竖版内容的留白与上下安全区，边缘延展自然，方便后续排版。",
  },
  {
    key: "facebook",
    label: "Facebook",
    defaultRatioKey: "1:1",
    defaultScaleKey: "1x",
    prompt:
      "保持原图主体和文字不变，为 Facebook 内容扩展为更适合信息流展示的画幅。保留中心主体，四周做自然背景延展，避免额外新物体抢占注意力。",
  },
  {
    key: "tiktok",
    label: "TikTok",
    defaultRatioKey: "9:16",
    defaultScaleKey: "1.5x",
    prompt:
      "保持原图主体、风格和文字完全不变，为 TikTok 竖屏封面或短视频首帧扩展画面。扩展上下区域，确保主体位于安全区内，背景延展自然干净。",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    defaultRatioKey: "4:3",
    defaultScaleKey: "1x",
    prompt:
      "保持原图主体和文字完全不变，为 LinkedIn 专业内容扩展画面。整体更克制、整洁、专业，增加适度留白，背景延展自然且不过度花哨。",
  },
  {
    key: "twitter",
    label: "Twitter",
    defaultRatioKey: "16:9",
    defaultScaleKey: "1x",
    prompt:
      "保持原图主体和文字完全不变，为 Twitter/X 横向分享图扩展画面。优先扩展左右区域，保证主体清晰集中，背景延展简洁自然。",
  },
];

export const WORKFLOW_EXPAND_RATIO_OPTIONS: Array<
  WorkflowSelectOption & { ratio: number | null }
> = [
  { key: "original", label: "原图比例", ratio: null },
  { key: "1:1", label: "1 : 1", ratio: 1 },
  { key: "4:3", label: "4 : 3", ratio: 4 / 3 },
  { key: "3:4", label: "3 : 4", ratio: 3 / 4 },
  { key: "16:9", label: "16 : 9", ratio: 16 / 9 },
  { key: "9:16", label: "9 : 16", ratio: 9 / 16 },
  { key: "21:9", label: "21 : 9", ratio: 21 / 9 },
  { key: "custom", label: "自定义…", ratio: null },
];

export function getWorkflowUpscaleTargetSize(
  aspectRatio: GeminiAspectRatioKey,
  size: WorkflowUpscaleImageSizeKey,
) {
  if (size === "8K") {
    const base = getGeminiResolution(aspectRatio, "4K");
    return { width: base.width * 2, height: base.height * 2 };
  }
  return getGeminiResolution(aspectRatio, size);
}

export function getWorkflowExpandPresetByRatio(ratioKey: string) {
  return WORKFLOW_EXPAND_PRESET_OPTIONS.find(
    (option) => option.defaultRatioKey === ratioKey,
  );
}

export function calculateWorkflowExpandTarget(
  source: { width: number; height: number },
  ratioKey: string,
  multiplier: number,
) {
  const sourceWidth = Math.max(1, Math.round(source.width || 1));
  const sourceHeight = Math.max(1, Math.round(source.height || 1));
  const safeMultiplier = Math.max(1, Number(multiplier || 1));
  const ratioOption = WORKFLOW_EXPAND_RATIO_OPTIONS.find(
    (option) => option.key === ratioKey,
  );
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = ratioOption?.ratio || sourceRatio;
  let width = sourceWidth;
  let height = sourceHeight;
  if (targetRatio > sourceRatio) {
    width = Math.round(sourceHeight * targetRatio);
  } else {
    height = Math.round(sourceWidth / targetRatio);
  }
  width = Math.max(sourceWidth, width);
  height = Math.max(sourceHeight, height);
  return {
    width: Math.max(1, Math.round(width * safeMultiplier)),
    height: Math.max(1, Math.round(height * safeMultiplier)),
    expandFactor: Math.max(width / sourceWidth, height / sourceHeight),
  };
}

export function getWorkflowExpandDisplayRatioValue(
  ratioKey: string,
  bounds: { width: number; height: number },
  naturalSize: { width: number; height: number } | null,
) {
  const displayRatio = bounds.width / bounds.height;
  if (ratioKey === "original") return displayRatio;
  if (ratioKey === "custom") return null;
  const configuredRatio = WORKFLOW_EXPAND_RATIO_OPTIONS.find(
    (item) => item.key === ratioKey,
  )?.ratio;
  const matchedRatio = String(ratioKey || "")
    .trim()
    .replace(/\s+/g, "")
    .match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  const parsedRatio = matchedRatio
    ? Number(matchedRatio[1]) / Number(matchedRatio[2])
    : null;
  const outputRatio = configuredRatio || parsedRatio;
  if (!outputRatio || !naturalSize?.width || !naturalSize.height)
    return outputRatio;
  return (
    (outputRatio * displayRatio) / (naturalSize.width / naturalSize.height)
  );
}

export function getWorkflowImageResolutionMaxSide(
  value: string,
  config?: Record<string, any>,
) {
  const configured = Number(
    config?.maxSide ||
      config?.max_side ||
      config?.width ||
      config?.height ||
      config?.size,
  );
  if (Number.isFinite(configured) && configured > 0) return configured;
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  const dimensions = normalized.match(/^(\d{3,5})[x×](\d{3,5})$/);
  if (dimensions) {
    return Math.max(Number(dimensions[1]), Number(dimensions[2]));
  }
  const kilo = normalized.match(/^(\d+(?:\.\d+)?)k$/);
  if (kilo) return Math.max(1, Math.round(Number(kilo[1]) * 1024));
  const progressive = normalized.match(/^(\d{3,4})p$/);
  if (progressive) {
    const height = Number(progressive[1]);
    return height >= 2160
      ? 4096
      : height >= 1440
        ? 2560
        : height >= 1080
          ? 1920
          : height;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric >= 256 ? numeric : null;
}

export function makeCenteredWorkflowExpandRect(
  bounds: { width: number; height: number },
  multiplier = 1.5,
  ratio: number | null = null,
) {
  const safeMultiplier = Math.max(1, Number(multiplier || 1));
  const sourceRatio = bounds.width / bounds.height;
  const targetRatio = ratio && ratio > 0 ? ratio : sourceRatio;
  let width = bounds.width * safeMultiplier;
  let height = bounds.height * safeMultiplier;
  if (targetRatio > width / height) {
    width = height * targetRatio;
  } else {
    height = width / targetRatio;
  }
  width = Math.max(bounds.width, width);
  height = Math.max(bounds.height, height);
  return {
    x: (bounds.width - width) / 2,
    y: (bounds.height - height) / 2,
    width,
    height,
  };
}

export function constrainWorkflowExpandRect(
  rect: WorkflowCropRect,
  bounds: { width: number; height: number },
  ratio: number | null = null,
) {
  const maxMultiplier = 4;
  const minWidth = bounds.width;
  const minHeight = bounds.height;
  let width = Math.max(
    minWidth,
    Math.min(bounds.width * maxMultiplier, rect.width),
  );
  let height = Math.max(
    minHeight,
    Math.min(bounds.height * maxMultiplier, rect.height),
  );

  if (ratio && ratio > 0) {
    if (width / height > ratio) {
      height = width / ratio;
    } else {
      width = height * ratio;
    }
    width = Math.max(minWidth, Math.min(bounds.width * maxMultiplier, width));
    height = Math.max(
      minHeight,
      Math.min(bounds.height * maxMultiplier, height),
    );
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
  }

  const minX = bounds.width - width;
  const maxX = 0;
  const minY = bounds.height - height;
  const maxY = 0;
  const x = Math.max(minX, Math.min(maxX, rect.x));
  const y = Math.max(minY, Math.min(maxY, rect.y));
  return { x, y, width, height };
}

export function fitWorkflowExpandTargetToSize(
  target: { width: number; height: number },
  maxSide: number,
  source: { width: number; height: number },
) {
  const safeMaxSide = Math.max(1, Number(maxSide || 1));
  const sourceWidth = Math.max(1, Math.round(source.width || 1));
  const sourceHeight = Math.max(1, Math.round(source.height || 1));
  const width = Math.max(sourceWidth, Math.round(target.width || sourceWidth));
  const height = Math.max(
    sourceHeight,
    Math.round(target.height || sourceHeight),
  );
  const longest = Math.max(width, height);
  if (longest <= safeMaxSide) return { width, height };
  const scale = safeMaxSide / longest;
  return {
    width: Math.max(sourceWidth, Math.round(width * scale)),
    height: Math.max(sourceHeight, Math.round(height * scale)),
  };
}

export function WorkflowDropdown({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label?: string;
  value: string;
  options: WorkflowSelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.key === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof globalThis.Node && ref.current?.contains(target))
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg bg-white/[0.07] px-3 text-[13px] text-white/88 transition-colors hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {label ? <span className="text-white/38">{label}</span> : null}
        <span className="whitespace-nowrap">{selected?.label || value}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          className={`shrink-0 text-white/54 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M4 6.4L8 10.4L12 6.4"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-[60] max-h-72 min-w-full overflow-y-auto rounded-xl border border-white/10 bg-[#252529] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.42)]">
          {options.map((option) => {
            const active = option.key === value;
            return (
              <button
                key={option.key}
                type="button"
                className={`flex h-8 w-full min-w-24 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 text-left text-[13px] transition-colors hover:bg-white/[0.08] ${active ? "text-white" : "text-white/66"}`}
                onClick={() => {
                  onChange(option.key);
                  setOpen(false);
                }}
              >
                <span className="whitespace-nowrap">{option.label}</span>
                {active ? <Check className="size-3.5" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowExpandToolbarMenu({
  open,
  icon,
  label,
  value,
  options,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  icon?: React.ReactNode;
  label: string;
  value: string;
  options: WorkflowSelectOption[];
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg bg-transparent px-3 py-1 text-[13px] leading-normal text-white/82 transition-colors hover:bg-white/[0.08] hover:text-white"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        {icon ? <span className="shrink-0 opacity-70">{icon}</span> : null}
        <span className="max-w-40 truncate whitespace-nowrap" title={label}>
          {label}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          className={`shrink-0 text-white/54 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M4 6.4L8 10.4L12 6.4"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute bottom-[calc(100%+8px)] left-1/2 z-[70] max-h-72 min-w-32 max-w-64 -translate-x-1/2 overflow-y-auto rounded-md p-1 text-xs text-canvas-controls-text"
          style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
        >
          {options.map((option) =>
            option.key === "custom" ? (
              <React.Fragment key={option.key}>
                <div className="-mx-1 my-1 h-px bg-white/[0.10]" />
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-canvas-controls-hover ${option.key === value ? "text-canvas-controls-text" : "text-canvas-controls-text opacity-70"}`}
                  onClick={() => onChange(option.key)}
                >
                  <span className="max-w-56 truncate" title={option.label}>
                    {option.label}
                  </span>
                  {option.key === value ? <Check className="size-3" /> : null}
                </button>
              </React.Fragment>
            ) : (
              <button
                key={option.key}
                type="button"
                className={`flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-canvas-controls-hover ${option.key === value ? "text-canvas-controls-text" : "text-canvas-controls-text opacity-70"}`}
                onClick={() => onChange(option.key)}
              >
                <span className="max-w-56 truncate" title={option.label}>
                  {option.label}
                </span>
                {option.key === value ? <Check className="size-3" /> : null}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowImageUpscalePanel({
  imageUrl,
  onCancel,
  onConfirm,
}: {
  imageUrl: string;
  onCancel: () => void;
  onConfirm: (request: WorkflowImageUpscaleRequest) => void;
}) {
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [size, setSize] = useState<WorkflowUpscaleImageSizeKey>("2K");
  const [aspectRatio, setAspectRatio] = useState<GeminiAspectRatioKey>("1:1");
  const selectedSize =
    WORKFLOW_UPSCALE_SIZE_OPTIONS.find((option) => option.value === size) ||
    WORKFLOW_UPSCALE_SIZE_OPTIONS[1];
  const targetSize = getWorkflowUpscaleTargetSize(aspectRatio, size);

  useEffect(() => {
    let cancelled = false;
    loadWorkflowCropImage(imageUrl)
      .then((image) => {
        if (cancelled) return;
        const next = {
          width: Math.max(
            1,
            Math.round(image.naturalWidth || image.width || 1),
          ),
          height: Math.max(
            1,
            Math.round(image.naturalHeight || image.height || 1),
          ),
        };
        setNaturalSize(next);
        setAspectRatio(getClosestGeminiAspectRatio(next.width, next.height));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute left-1/2 top-full z-50 mt-3 w-max -translate-x-1/2 rounded-2xl border border-white/10 bg-[#1F1F1F] p-2 text-white shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="flex h-9 items-center gap-1">
        <div className="flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-white/88">
          <span className="flex h-4 w-4 items-center justify-center rounded-[4px] border border-white/18 text-[8px] font-black">
            HD
          </span>
          <span>高清放大</span>
        </div>
        <WorkflowDropdown
          value={size}
          options={WORKFLOW_UPSCALE_SIZE_OPTIONS}
          onChange={(value) => setSize(value as WorkflowUpscaleImageSizeKey)}
        />
        <WorkflowDropdown
          value={aspectRatio}
          options={GEMINI_ASPECT_RATIO_ORDER.map((ratio) => ({
            key: ratio,
            label: ratio,
          }))}
          onChange={(value) => {
            if (isGeminiAspectRatioKey(value)) setAspectRatio(value);
          }}
        />
        <div className="mx-1 h-6 w-px bg-white/10" />
        <div className="flex items-center gap-2 px-2 text-[11px] text-white/62">
          <span>
            W <b className="font-semibold text-white/86">{targetSize.width}</b>
          </span>
          <span>
            H <b className="font-semibold text-white/86">{targetSize.height}</b>
          </span>
        </div>
        <button
          type="button"
          className="flex h-8 cursor-pointer items-center justify-center rounded-lg px-3 text-[13px] text-white/48 transition-colors hover:bg-white/[0.08] hover:text-white/82"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          className="flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-3 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!naturalSize}
          onClick={() =>
            onConfirm({
              imageSize: size,
              aspectRatio,
              targetWidth: targetSize.width,
              targetHeight: targetSize.height,
              cost: selectedSize.cost,
            })
          }
        >
          生成
        </button>
      </div>
    </div>
  );
}

export function isWorkflowImageUpscaleModel(model: WorkflowModelOption) {
  const haystack = [
    model.id,
    model.modelId,
    model.name,
    model.provider,
    model.description,
    model.descriptionKey,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /upscale|enhance|高清|放大|超分|topaz/.test(haystack);
}

export const WORKFLOW_IMAGE_UPSCALE_DEFAULT_TARGET_RESOLUTION_OPTIONS = [
  { key: "2k", label: "2K" },
  { key: "4k", label: "4K" },
  { key: "8k", label: "8K" },
];

export const WORKFLOW_IMAGE_UPSCALE_DEFAULT_OUTPUT_FORMAT_OPTIONS = [
  { key: "jpeg", label: "JPEG" },
  { key: "png", label: "PNG" },
  { key: "webp", label: "WEBP" },
];

export const WORKFLOW_IMAGE_UPSCALE_FALLBACK_MODEL: WorkflowModelOption = {
  id: "wavespeed-ai/image-upscaler",
  modelId: "wavespeed-ai/image-upscaler",
  name: "WaveSpeed Image Upscaler",
  category: "image",
  provider: "wavespeed",
  isDefault: true,
  parameters: {
    extraParameters: [
      {
        type: "target_resolution",
        label: "目标分辨率",
        control: "select",
        defaultValue: "4k",
        options: WORKFLOW_IMAGE_UPSCALE_DEFAULT_TARGET_RESOLUTION_OPTIONS.map(
          (item) => ({
            id: item.key,
            label: item.label,
            isDefault: item.key === "4k",
          }),
        ),
      },
      {
        type: "output_format",
        label: "输出格式",
        control: "select",
        defaultValue: "jpeg",
        options: WORKFLOW_IMAGE_UPSCALE_DEFAULT_OUTPUT_FORMAT_OPTIONS.map(
          (item) => ({
            id: item.key,
            label: item.label,
            isDefault: item.key === "jpeg",
          }),
        ),
      },
    ],
  },
};

export function getWorkflowModelExtraParameter(
  model: WorkflowModelOption,
  type: string,
) {
  const normalizedType = String(type || "")
    .trim()
    .toLowerCase();
  return (model.parameters?.extraParameters || []).find((item) => {
    const itemType = String(item.type || "")
      .trim()
      .toLowerCase();
    return (
      itemType === normalizedType ||
      itemType.replace(/-/g, "_") === normalizedType ||
      itemType.replace(/_/g, "-") === normalizedType
    );
  });
}

export function getWorkflowModelExtraSelectOptions(
  model: WorkflowModelOption,
  type: string,
  fallback: Array<{ key: string; label: string }>,
) {
  const parameter = getWorkflowModelExtraParameter(model, type);
  const options = (parameter?.options || [])
    .map((item) => ({
      key: String(item.id || "").trim(),
      label: String(item.label || item.id || "").trim(),
      isDefault: Boolean(item.isDefault || item.config?.isDefault),
    }))
    .filter((item) => item.key && item.label);
  return options.length > 0 ? options : fallback;
}

export function getWorkflowModelExtraDefault(
  model: WorkflowModelOption,
  type: string,
  fallback: string,
) {
  const parameter = getWorkflowModelExtraParameter(model, type);
  const defaultOption = (parameter?.options || []).find((item) =>
    Boolean(item.isDefault || item.config?.isDefault),
  );
  return String(
    parameter?.defaultValue || defaultOption?.id || fallback || "",
  ).trim();
}

export function normalizeWorkflowUpscaleImageSize(
  targetResolution: string,
): WorkflowUpscaleImageSizeKey {
  const normalized = String(targetResolution || "")
    .trim()
    .toUpperCase();
  if (normalized === "8K") return "8K";
  if (normalized === "4K") return "4K";
  if (normalized === "2K") return "2K";
  return "4K";
}

export function WorkflowImageUpscaleGenerationBar({
  node,
  upstreamNodes,
  projectId,
  onUpdateNode,
  onSubmit,
}: {
  node: LibTvWorkflowNode;
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
  projectId?: string;
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onSubmit?: (id: string, request: WorkflowImageUpscaleRequest) => void;
}) {
  const flow = useReactFlow<Node<WorkflowOverlayNodeData>, Edge>();
  const barRef = useRef<HTMLDivElement | null>(null);
  const [modelOptions, setModelOptions] = useState<WorkflowModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [targetResolutionMenuOpen, setTargetResolutionMenuOpen] =
    useState(false);
  const [outputFormatMenuOpen, setOutputFormatMenuOpen] = useState(false);
  const sourceImage = useMemo(
    () =>
      (upstreamNodes || []).find(
        (item) => item.kind === "image" && item.mediaUrl,
      ),
    [upstreamNodes],
  );
  const fallbackModelId = String(node.data?.modelId || "").trim();
  const selectedModelId =
    fallbackModelId ||
    modelOptions.find((item) => item.isDefault)?.id ||
    modelOptions[0]?.id ||
    WORKFLOW_IMAGE_UPSCALE_FALLBACK_MODEL.id;
  const selectedModel =
    modelOptions.find(
      (item) => item.id === selectedModelId || item.modelId === selectedModelId,
    ) || WORKFLOW_IMAGE_UPSCALE_FALLBACK_MODEL;
  const targetResolutionOptions = getWorkflowModelExtraSelectOptions(
    selectedModel,
    "target_resolution",
    WORKFLOW_IMAGE_UPSCALE_DEFAULT_TARGET_RESOLUTION_OPTIONS,
  );
  const outputFormatOptions = getWorkflowModelExtraSelectOptions(
    selectedModel,
    "output_format",
    WORKFLOW_IMAGE_UPSCALE_DEFAULT_OUTPUT_FORMAT_OPTIONS,
  );
  const defaultTargetResolution = getWorkflowModelExtraDefault(
    selectedModel,
    "target_resolution",
    "4k",
  );
  const defaultOutputFormat = getWorkflowModelExtraDefault(
    selectedModel,
    "output_format",
    "jpeg",
  );
  const selectedTargetResolution = targetResolutionOptions.some(
    (item) => item.key === node.data?.imageUpscaleTargetResolution,
  )
    ? String(node.data?.imageUpscaleTargetResolution)
    : targetResolutionOptions.some(
          (item) => item.key === defaultTargetResolution,
        )
      ? defaultTargetResolution
      : targetResolutionOptions[0]?.key || "4k";
  const selectedOutputFormat = outputFormatOptions.some(
    (item) => item.key === node.data?.imageUpscaleOutputFormat,
  )
    ? String(node.data?.imageUpscaleOutputFormat)
    : outputFormatOptions.some((item) => item.key === defaultOutputFormat)
      ? defaultOutputFormat
      : outputFormatOptions[0]?.key || "jpeg";
  const running = Boolean(
    node.data?.workflowGenerationRunning || node.data?.workflowRedrawRunning,
  );
  const canSubmit = Boolean(sourceImage?.mediaUrl && projectId && !running);

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    fetchWorkflowModelOptions("image")
      .then((models) => {
        if (cancelled) return;
        const upscaleModels = models.filter(isWorkflowImageUpscaleModel);
        setModelOptions(
          upscaleModels.length > 0
            ? upscaleModels
            : [WORKFLOW_IMAGE_UPSCALE_FALLBACK_MODEL],
        );
      })
      .catch(() => {
        if (!cancelled)
          setModelOptions([WORKFLOW_IMAGE_UPSCALE_FALLBACK_MODEL]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const barElement = barRef.current;
    if (!barElement) return;
    const frame = requestAnimationFrame(() => {
      const nodeElement = barElement.closest(
        ".react-flow__node",
      ) as HTMLElement | null;
      const flowElement = barElement.closest(
        ".react-flow",
      ) as HTMLElement | null;
      if (!nodeElement || !flowElement) return;
      const nodeRect = nodeElement.getBoundingClientRect();
      const barRect = barElement.getBoundingClientRect();
      const flowRect = flowElement.getBoundingClientRect();
      const bounds = {
        left: Math.min(nodeRect.left, barRect.left),
        top: Math.min(nodeRect.top, barRect.top),
        right: Math.max(nodeRect.right, barRect.right),
        bottom: Math.max(nodeRect.bottom, barRect.bottom),
      };
      const margin = 28;
      const visible =
        bounds.left >= flowRect.left + margin &&
        bounds.top >= flowRect.top + margin &&
        bounds.right <= flowRect.right - margin &&
        bounds.bottom <= flowRect.bottom - margin;
      if (visible) return;
      const topLeft = flow.screenToFlowPosition({
        x: bounds.left - margin,
        y: bounds.top - margin,
      });
      const bottomRight = flow.screenToFlowPosition({
        x: bounds.right + margin,
        y: bounds.bottom + margin,
      });
      void flow.fitBounds(
        {
          x: topLeft.x,
          y: topLeft.y,
          width: Math.max(1, bottomRight.x - topLeft.x),
          height: Math.max(1, bottomRight.y - topLeft.y),
        },
        { padding: 0.08, duration: 360 },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [flow]);

  const commitModel = useCallback(
    (modelId: string) => {
      const nextModel =
        modelOptions.find(
          (item) => item.id === modelId || item.modelId === modelId,
        ) || WORKFLOW_IMAGE_UPSCALE_FALLBACK_MODEL;
      onUpdateNode?.(node.id, {
        modelId,
        imageUpscaleTargetResolution: getWorkflowModelExtraDefault(
          nextModel,
          "target_resolution",
          "4k",
        ),
        imageUpscaleOutputFormat: getWorkflowModelExtraDefault(
          nextModel,
          "output_format",
          "jpeg",
        ),
      });
      setModelMenuOpen(false);
    },
    [modelOptions, node.id, onUpdateNode],
  );

  const commitTargetResolution = useCallback(
    (targetResolution: string) => {
      onUpdateNode?.(node.id, {
        imageUpscaleTargetResolution: targetResolution,
        imageSize: normalizeWorkflowUpscaleImageSize(targetResolution),
      });
      setTargetResolutionMenuOpen(false);
    },
    [node.id, onUpdateNode],
  );

  const commitOutputFormat = useCallback(
    (outputFormat: string) => {
      onUpdateNode?.(node.id, { imageUpscaleOutputFormat: outputFormat });
      setOutputFormatMenuOpen(false);
    },
    [node.id, onUpdateNode],
  );

  const submit = useCallback(() => {
    if (!canSubmit) {
      message.warning(
        !sourceImage?.mediaUrl
          ? "请先连接参考图片"
          : "项目未初始化，无法创建高清任务",
      );
      return;
    }
    const sourceWidth = Number(
      sourceImage?.mediaUrl
        ? node.width || LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH
        : LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
    );
    const sourceHeight = Number(
      sourceImage?.mediaUrl
        ? node.height || LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT
        : LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
    );
    onSubmit?.(node.id, {
      imageSize: normalizeWorkflowUpscaleImageSize(selectedTargetResolution),
      aspectRatio: "1:1",
      targetWidth: sourceWidth,
      targetHeight: sourceHeight,
      cost: Number(selectedModel.cost || 15),
      modelId: selectedModel.modelId || selectedModel.id,
      targetResolution: selectedTargetResolution,
      outputFormat: selectedOutputFormat,
    });
  }, [
    canSubmit,
    node.height,
    node.id,
    node.width,
    onSubmit,
    selectedModel.cost,
    selectedModel.id,
    selectedModel.modelId,
    selectedOutputFormat,
    selectedTargetResolution,
    sourceImage?.mediaUrl,
  ]);

  return (
    <div
      ref={barRef}
      data-canvas-generator-root=""
      className="node-floating-ui nodrag nowheel nopan pointer-events-auto absolute -bottom-4 left-1/2 z-20 w-full min-w-[420px] max-w-[430px] -translate-x-1/2 translate-y-full cursor-default text-white"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="relative flex w-full flex-col gap-3 overflow-visible rounded-xl border border-white/[0.10] bg-[#242424] px-2 pb-2 pt-3 shadow-[0_4px_10px_rgba(0,0,0,0.20)]">
        <div className="px-2">
          <span className="text-sm font-medium text-white/90">高清放大</span>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex h-8 items-center gap-4">
            <div className="flex w-[120px] shrink-0 items-center gap-1 px-2">
              <span className="text-[13px] text-white/86">模型选择</span>
            </div>
            <WorkflowImageUpscaleSelect
              open={modelMenuOpen}
              disabled={modelsLoading || running}
              onOpenChange={setModelMenuOpen}
              onSelect={commitModel}
              value={selectedModelId}
              options={modelOptions.map((item) => ({
                key: item.id,
                label: item.name,
                iconUrl: item.icon,
              }))}
              placeholder={modelsLoading ? "加载模型..." : "选择模型"}
            />
          </div>
          <div className="flex h-8 items-center gap-4">
            <div className="flex w-[120px] shrink-0 items-center gap-1 px-2">
              <span className="text-[13px] text-white/86">目标分辨率</span>
            </div>
            <WorkflowImageUpscaleSelect
              open={targetResolutionMenuOpen}
              disabled={running}
              onOpenChange={setTargetResolutionMenuOpen}
              onSelect={commitTargetResolution}
              value={selectedTargetResolution}
              options={targetResolutionOptions}
              placeholder="4K"
            />
          </div>
          <div className="flex h-8 items-center gap-4">
            <div className="flex w-[120px] shrink-0 items-center gap-1 px-2">
              <span className="text-[13px] text-white/86">输出格式</span>
            </div>
            <WorkflowImageUpscaleSelect
              open={outputFormatMenuOpen}
              disabled={running}
              onOpenChange={setOutputFormatMenuOpen}
              onSelect={commitOutputFormat}
              value={selectedOutputFormat}
              options={outputFormatOptions}
              placeholder="JPEG"
            />
          </div>
          <div className="flex justify-end">
            <div className="flex h-8 items-center gap-2 text-white/55">
              <button
                type="button"
                disabled={!canSubmit}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="生成高清图像"
                onClick={submit}
              >
                {running ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowImageUpscaleSelect({
  open,
  value,
  options,
  placeholder,
  disabled,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  value: string;
  options: Array<{ key: string; label: string; iconUrl?: string }>;
  placeholder: string;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.key === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof globalThis.Node &&
        (ref.current?.contains(target) || popoverRef.current?.contains(target))
      )
        return;
      onOpenChange(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onOpenChange, open]);

  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        className="flex h-8 w-full cursor-pointer items-center justify-between overflow-hidden rounded-lg border border-white/[0.12] px-2 py-1 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.iconUrl ? (
            <WorkflowModelIcon
              iconUrl={selected.iconUrl}
              name={selected.label}
            />
          ) : (
            <Box className="size-4 shrink-0 text-white/72" />
          )}
          <span
            className="truncate text-[13px] text-white/86"
            title={selected?.label || placeholder}
          >
            {selected?.label || placeholder}
          </span>
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-white/42 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <WorkflowAnchoredPopover
          anchorRef={triggerRef}
          popoverRef={popoverRef}
          side="bottom"
          align="end"
          gap={6}
          margin={12}
          heightLimit={256}
          role="listbox"
          ariaLabel={placeholder}
          className="min-w-[240px] max-w-[min(360px,calc(100vw-24px))] rounded-xl border border-white/10 bg-[#252529] p-1 text-white shadow-[0_12px_32px_rgba(0,0,0,0.42)]"
        >
          {options.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`flex h-8 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[13px] transition-colors hover:bg-white/[0.08] ${item.key === value ? "text-white" : "text-white/66"}`}
              onClick={() => onSelect(item.key)}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.iconUrl ? (
                  <WorkflowModelIcon iconUrl={item.iconUrl} name={item.label} />
                ) : (
                  <Box className="size-4 shrink-0" />
                )}
                <span className="truncate" title={item.label}>
                  {item.label}
                </span>
              </span>
              {item.key === value ? <Check className="size-3.5" /> : null}
            </button>
          ))}
        </WorkflowAnchoredPopover>
      ) : null}
    </div>
  );
}

export const WORKFLOW_VIDEO_UPSCALE_MODEL_OPTIONS = [
  {
    value: "wavespeed-ai/video-upscaler-pro",
    label: "video-upscaler-pro",
    iconUrl: "/images/libtv/camera-body-generic.png",
  },
] as const;

export const WORKFLOW_VIDEO_UPSCALE_RESOLUTION_OPTIONS: WorkflowVideoUpscaleRequest["resolution"][] =
  ["1080P", "2K", "4K"];

export function WorkflowVideoUpscalePanel({
  node,
  onUpdateNode,
  onSubmit,
}: {
  node: LibTvWorkflowNode;
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onSubmit?: (request: WorkflowVideoUpscaleRequest) => void;
}) {
  const sourceUrl = String(
    node.data?.videoUpscaleSourceUrl || node.data?.mediaUrl || "",
  ).trim();
  const requestedModelId = String(node.data?.videoUpscaleModelId || "").trim();
  const rawResolution = String(node.data?.videoUpscaleResolution || "1080P")
    .trim()
    .toUpperCase();
  const resolution = (
    WORKFLOW_VIDEO_UPSCALE_RESOLUTION_OPTIONS.includes(
      rawResolution as WorkflowVideoUpscaleRequest["resolution"],
    )
      ? rawResolution
      : "1080P"
  ) as WorkflowVideoUpscaleRequest["resolution"];
  const running = Boolean(
    node.data?.workflowGenerationRunning || node.data?.workflowRedrawRunning,
  );
  const progress = Number(node.data?.workflowGenerationProgress);
  const progressLabel = Number.isFinite(progress)
    ? `${Math.max(1, Math.min(99, Math.round(progress * 100)))}%`
    : "";
  const selectedModel =
    WORKFLOW_VIDEO_UPSCALE_MODEL_OPTIONS.find(
      (item) => item.value === requestedModelId,
    ) || WORKFLOW_VIDEO_UPSCALE_MODEL_OPTIONS[0];
  const modelId = selectedModel.value;

  const patch = useCallback(
    (next: Partial<LibTvWorkflowNode["data"]>) => {
      onUpdateNode?.(node.id, next);
    },
    [node.id, onUpdateNode],
  );

  return (
    <div
      className="node-float-ui node-float-ui-visible workflow-generation-bar nodrag nopan nowheel pointer-events-auto absolute -bottom-2 left-1/2 z-20 w-[420px] max-w-[420px] cursor-default text-white"
      data-canvas-generator-root=""
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
      style={
        {
          "--float-y": "100%",
          "--float-offset": "-12px",
          transformOrigin: "top center",
        } as React.CSSProperties
      }
    >
      <div className="mt-2 w-full">
        <div className="relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-white/[0.10] bg-[#202024]/95 px-2 pb-2 pt-3 shadow-[0_12px_34px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="px-2">
            <span className="text-sm font-medium text-white/90">视频高清</span>
          </div>
          <div className="flex flex-col gap-2">
            <WorkflowVideoUpscaleRow label="模型选择">
              <button
                type="button"
                className="flex h-8 flex-1 cursor-default items-center justify-between overflow-hidden rounded-lg border border-white/[0.12] px-2 py-1 text-left transition-colors hover:bg-white/[0.06]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <img
                    alt=""
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded object-contain"
                    src={selectedModel.iconUrl}
                  />
                  <span className="truncate text-[13px] text-white/88">
                    {selectedModel.label}
                  </span>
                </span>
                <ChevronDown className="size-3.5 shrink-0 text-white/42" />
              </button>
            </WorkflowVideoUpscaleRow>

            <WorkflowVideoUpscaleRow label="分辨率">
              <div className="flex flex-1 items-center gap-1">
                {WORKFLOW_VIDEO_UPSCALE_RESOLUTION_OPTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`flex h-8 flex-1 items-center justify-center rounded-lg border text-[13px] transition-colors ${item === resolution ? "border-white/[0.18] bg-white/[0.12] text-white" : "border-white/[0.10] bg-transparent text-white/58 hover:bg-white/[0.06] hover:text-white/82"}`}
                    onClick={() =>
                      patch({
                        videoUpscaleResolution: item,
                        title: `高清（${item}）`,
                      })
                    }
                  >
                    {item}
                  </button>
                ))}
              </div>
            </WorkflowVideoUpscaleRow>

            {node.data?.workflowGenerationError ? (
              <div className="px-2 text-[12px] leading-5 text-red-300">
                {String(node.data.workflowGenerationError)}
              </div>
            ) : node.data?.note ? (
              <div className="px-2 text-[12px] leading-5 text-white/48">
                {String(node.data.note)}
              </div>
            ) : null}

            <div className="flex justify-end">
              <div className="flex h-8 items-center gap-2 text-white/58">
                {running && progressLabel ? (
                  <span className="text-[12px] tabular-nums">
                    {progressLabel}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white text-black transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={running || !sourceUrl}
                  aria-label="生成高清视频"
                  onClick={() => {
                    if (!sourceUrl) {
                      message.warning("缺少输入视频");
                      return;
                    }
                    onSubmit?.({
                      sourceUrl,
                      modelId,
                      resolution,
                      durationSeconds: parseWorkflowDurationSeconds(
                        node.data?.videoDuration ||
                          node.data?.workflowStoryboardDuration,
                        5,
                      ),
                    });
                  }}
                >
                  {running ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <ArrowUp className="size-3" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowVideoUpscaleRow({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-8 items-center gap-4">
      <div className="flex w-[120px] shrink-0 items-center gap-1 px-2">
        <span className="text-[13px] text-white/82">{label}</span>
        {help ? (
          <span className="cursor-help text-white/42" title={help}>
            <CircleHelp className="size-3" />
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function WorkflowImageExpandPanel({
  imageUrl,
  nodeWidth,
  nodeHeight,
  modelId,
  onCancel,
  onConfirm,
}: {
  imageUrl: string;
  nodeWidth: number;
  nodeHeight: number;
  modelId?: string;
  onCancel: () => void;
  onConfirm: (request: WorkflowImageExpandRequest) => void;
}) {
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [scaleKey, setScaleKey] = useState("1x");
  const [menuOpen, setMenuOpen] = useState<
    | "model"
    | "ratio"
    | "size"
    | "scale"
    | "quality"
    | "count"
    | "advanced"
    | null
  >(null);
  const imageSettings = useWorkflowImageToolSettings({
    initialModelId: modelId,
  });
  const bounds = useMemo(
    () => ({ width: Math.max(1, nodeWidth), height: Math.max(1, nodeHeight) }),
    [nodeHeight, nodeWidth],
  );
  const [expandRect, setExpandRect] = useState<WorkflowCropRect>(() =>
    makeCenteredWorkflowExpandRect(bounds, 1.5),
  );
  const [dragState, setDragState] = useState<WorkflowCropDragState | null>(
    null,
  );
  const selectedScale =
    WORKFLOW_EXPAND_SCALE_OPTIONS.find((option) => option.key === scaleKey) ||
    WORKFLOW_EXPAND_SCALE_OPTIONS[0];
  const selectedPreset = WORKFLOW_EXPAND_PRESET_OPTIONS[0];
  const modelOptions = useMemo<WorkflowSelectOption[]>(
    () =>
      imageSettings.models.map((model) => ({
        key: getWorkflowImageToolModelValue(model),
        label: model.name,
      })),
    [imageSettings.models],
  );
  const ratioOptions = useMemo<WorkflowSelectOption[]>(
    () =>
      imageSettings.aspectOptions.map((option) => ({
        key: option.value,
        label: option.label,
      })),
    [imageSettings.aspectOptions],
  );
  const resolutionOptions = useMemo<WorkflowSelectOption[]>(
    () =>
      imageSettings.resolutionOptions.map((option) => ({
        key: option.value,
        label: option.label,
      })),
    [imageSettings.resolutionOptions],
  );
  const qualityOptions = useMemo<WorkflowSelectOption[]>(
    () =>
      imageSettings.qualityOptions.map((option) => ({
        key: option.value,
        label: option.label,
      })),
    [imageSettings.qualityOptions],
  );
  const countOptions = useMemo<WorkflowSelectOption[]>(
    () =>
      imageSettings.countOptions.map((option) => ({
        key: option.value,
        label: option.label,
      })),
    [imageSettings.countOptions],
  );
  const selectedModelLabel =
    imageSettings.selectedModel?.name ||
    (imageSettings.modelsLoading ? "加载模型..." : "选择模型");
  const selectedRatioLabel =
    ratioOptions.find((option) => option.key === imageSettings.aspectRatio)
      ?.label || imageSettings.aspectRatio;
  const selectedResolutionChoice = imageSettings.resolutionOptions.find(
    (option) => option.value === imageSettings.resolution,
  );
  const selectedResolutionLabel =
    selectedResolutionChoice?.label || imageSettings.resolution;
  const selectedQualityLabel =
    qualityOptions.find((option) => option.key === imageSettings.quality)
      ?.label || imageSettings.quality;
  const selectedCountLabel =
    countOptions.find((option) => option.key === imageSettings.count)?.label ||
    `${imageSettings.count || 1}张`;
  const selectedCount = Math.max(
    1,
    Number.parseInt(imageSettings.count || "1", 10) || 1,
  );
  const resolutionMaxSide = getWorkflowImageResolutionMaxSide(
    imageSettings.resolution,
    selectedResolutionChoice?.config,
  );
  const activeRatio = useMemo(
    () =>
      getWorkflowExpandDisplayRatioValue(
        imageSettings.aspectRatio,
        bounds,
        naturalSize,
      ),
    [bounds, imageSettings.aspectRatio, naturalSize],
  );
  const renderUrl = getWorkflowImageRenderUrl(imageUrl);
  const rawTarget = naturalSize
    ? {
        width: naturalSize.width * (expandRect.width / bounds.width),
        height: naturalSize.height * (expandRect.height / bounds.height),
      }
    : { width: 0, height: 0 };
  const target = naturalSize
    ? resolutionMaxSide
      ? fitWorkflowExpandTargetToSize(rawTarget, resolutionMaxSide, naturalSize)
      : {
          width: Math.max(naturalSize.width, Math.round(rawTarget.width)),
          height: Math.max(naturalSize.height, Math.round(rawTarget.height)),
        }
    : { width: 0, height: 0 };
  const expandFactor = naturalSize
    ? Math.max(
        target.width / naturalSize.width,
        target.height / naturalSize.height,
      )
    : 1;
  const hasAdvancedParameters =
    imageSettings.supportsWebSearch ||
    imageSettings.advancedDefinitions.length > 0;
  const canRun =
    Boolean(naturalSize) &&
    Boolean(imageSettings.selectedModel && imageSettings.route) &&
    (target.width > (naturalSize?.width || 0) ||
      target.height > (naturalSize?.height || 0));

  useEffect(() => {
    let cancelled = false;
    loadWorkflowCropImage(imageUrl)
      .then((image) => {
        if (cancelled) return;
        setNaturalSize({
          width: Math.max(
            1,
            Math.round(image.naturalWidth || image.width || 1),
          ),
          height: Math.max(
            1,
            Math.round(image.naturalHeight || image.height || 1),
          ),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    setExpandRect(makeCenteredWorkflowExpandRect(bounds, 1.5, activeRatio));
  }, [activeRatio, bounds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleRatioChange = useCallback(
    (key: string) => {
      imageSettings.setAspectRatio(key);
      setMenuOpen(null);
    },
    [imageSettings.setAspectRatio],
  );

  useEffect(() => {
    if (!dragState) return;
    const handlePointerMove = (event: MouseEvent) => {
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      const start = dragState.startRect;
      let next: WorkflowCropRect = { ...start };

      if (dragState.mode === "move") {
        next.x = start.x + dx;
        next.y = start.y + dy;
      } else {
        if (dragState.mode.includes("w")) {
          next.x = start.x + dx;
          next.width = start.width - dx;
        }
        if (dragState.mode.includes("e")) next.width = start.width + dx;
        if (dragState.mode.includes("n")) {
          next.y = start.y + dy;
          next.height = start.height - dy;
        }
        if (dragState.mode.includes("s")) next.height = start.height + dy;

        if (activeRatio && activeRatio > 0) {
          const anchorRight = dragState.mode.includes("w");
          const anchorBottom = dragState.mode.includes("n");
          if (Math.abs(dx) > Math.abs(dy)) {
            next.height = next.width / activeRatio;
          } else {
            next.width = next.height * activeRatio;
          }
          if (anchorRight) next.x = start.x + start.width - next.width;
          if (anchorBottom) next.y = start.y + start.height - next.height;
        }
      }

      setExpandRect(constrainWorkflowExpandRect(next, bounds, activeRatio));
    };
    const handlePointerUp = () => setDragState(null);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [activeRatio, bounds, dragState]);

  const startDrag = useCallback(
    (event: React.MouseEvent, mode: WorkflowCropDragMode) => {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(null);
      setDragState({
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startRect: expandRect,
      });
    },
    [expandRect],
  );

  const resetByScale = useCallback(
    (key: string) => {
      const nextScale =
        WORKFLOW_EXPAND_SCALE_OPTIONS.find((option) => option.key === key) ||
        WORKFLOW_EXPAND_SCALE_OPTIONS[0];
      setScaleKey(key);
      setMenuOpen(null);
      setExpandRect(
        makeCenteredWorkflowExpandRect(
          bounds,
          Math.max(1.5, nextScale.multiplier),
          activeRatio,
        ),
      );
    },
    [activeRatio, bounds],
  );

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute left-0 top-0 z-[90] text-white"
      style={{ width: nodeWidth, height: nodeHeight }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="absolute group/expand"
        style={{
          left: expandRect.x,
          top: expandRect.y,
          width: expandRect.width,
          height: expandRect.height,
        }}
      >
        <div className="pointer-events-none absolute inset-0 bg-black/80 backdrop-blur-md" />
        <div className="pointer-events-none absolute inset-0">
          <img
            src={renderUrl}
            alt=""
            draggable={false}
            className="absolute max-w-none select-none"
            style={{
              width: nodeWidth,
              height: nodeHeight,
              left: -expandRect.x,
              top: -expandRect.y,
            }}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 border border-white/50" />
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/expand:opacity-100">
          <div className="absolute left-0 right-0 top-1/3 h-px bg-white/30" />
          <div className="absolute left-0 right-0 top-2/3 h-px bg-white/30" />
          <div className="absolute bottom-0 left-1/3 top-0 w-px bg-white/30" />
          <div className="absolute bottom-0 left-2/3 top-0 w-px bg-white/30" />
        </div>
        <WorkflowCropCornerHandle position="nw" onMouseDown={startDrag} />
        <WorkflowCropCornerHandle position="ne" onMouseDown={startDrag} />
        <WorkflowCropCornerHandle position="sw" onMouseDown={startDrag} />
        <WorkflowCropCornerHandle position="se" onMouseDown={startDrag} />
        <WorkflowCropEdgeHandle position="n" onMouseDown={startDrag} />
        <WorkflowCropEdgeHandle position="s" onMouseDown={startDrag} />
        <WorkflowCropEdgeHandle position="w" onMouseDown={startDrag} />
        <WorkflowCropEdgeHandle position="e" onMouseDown={startDrag} />
        <div
          className="absolute inset-0 cursor-move"
          onMouseDown={(event) => startDrag(event, "move")}
        />
      </div>
      <div className="absolute left-1/2 top-full z-50 mt-3 w-max max-w-[calc(100vw-24px)] -translate-x-1/2">
        <div className="flex max-w-full flex-col rounded-xl border border-white/[0.10] bg-[#202024]/95 p-2 text-white/82 shadow-lg backdrop-blur-xl">
          <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/62 transition-colors hover:bg-white/[0.08] hover:text-red-300"
              aria-label="取消扩图"
              onClick={onCancel}
            >
              <X className="size-4" />
            </button>
            <div className="h-6 w-px bg-white/[0.12]" />
            {ratioOptions.length > 0 ? (
              <WorkflowExpandToolbarMenu
                open={menuOpen === "ratio"}
                icon={<AspectRatioIcon />}
                label={selectedRatioLabel}
                options={ratioOptions}
                value={imageSettings.aspectRatio}
                onOpenChange={(open) => setMenuOpen(open ? "ratio" : null)}
                onChange={handleRatioChange}
              />
            ) : null}
            <span className="whitespace-nowrap px-2 text-[13px] text-white/50">
              拖拽外框进行扩图
            </span>
            <div className="h-6 w-px bg-white/[0.12]" />
            {resolutionOptions.length > 0 ? (
              <WorkflowExpandToolbarMenu
                open={menuOpen === "size"}
                label={selectedResolutionLabel}
                options={resolutionOptions}
                value={imageSettings.resolution}
                onOpenChange={(open) => setMenuOpen(open ? "size" : null)}
                onChange={(value) => {
                  imageSettings.setResolution(value);
                  setMenuOpen(null);
                }}
              />
            ) : null}
            <WorkflowExpandToolbarMenu
              open={menuOpen === "scale"}
              label={selectedScale.label}
              options={WORKFLOW_EXPAND_SCALE_OPTIONS}
              value={scaleKey}
              onOpenChange={(open) => setMenuOpen(open ? "scale" : null)}
              onChange={resetByScale}
            />
            {modelOptions.length > 0 ? (
              <WorkflowExpandToolbarMenu
                open={menuOpen === "model"}
                label={selectedModelLabel}
                options={modelOptions}
                value={imageSettings.modelId}
                onOpenChange={(open) => setMenuOpen(open ? "model" : null)}
                onChange={(value) => {
                  imageSettings.setModelId(value);
                  setMenuOpen(null);
                }}
              />
            ) : (
              <button
                type="button"
                disabled
                className="flex h-8 max-w-40 cursor-not-allowed items-center justify-center truncate rounded-lg bg-transparent px-3 text-[13px] font-medium text-white/62 disabled:opacity-70"
                title={selectedModelLabel}
              >
                {selectedModelLabel}
              </button>
            )}
            {qualityOptions.length > 0 ? (
              <WorkflowExpandToolbarMenu
                open={menuOpen === "quality"}
                label={selectedQualityLabel}
                options={qualityOptions}
                value={imageSettings.quality}
                onOpenChange={(open) => setMenuOpen(open ? "quality" : null)}
                onChange={(value) => {
                  imageSettings.setQuality(value);
                  setMenuOpen(null);
                }}
              />
            ) : null}
            {countOptions.length > 0 ? (
              <WorkflowExpandToolbarMenu
                open={menuOpen === "count"}
                label={selectedCountLabel}
                options={countOptions}
                value={imageSettings.count}
                onOpenChange={(open) => setMenuOpen(open ? "count" : null)}
                onChange={(value) => {
                  imageSettings.setCount(value);
                  setMenuOpen(null);
                }}
              />
            ) : null}
            {hasAdvancedParameters ? (
              <div className="relative">
                <button
                  type="button"
                  className={`flex size-8 items-center justify-center rounded-lg text-white/62 transition-colors hover:bg-white/[0.08] hover:text-white ${menuOpen === "advanced" ? "bg-white/[0.10] text-white" : ""}`}
                  aria-label="更多参数"
                  aria-expanded={menuOpen === "advanced"}
                  onClick={() =>
                    setMenuOpen((current) =>
                      current === "advanced" ? null : "advanced",
                    )
                  }
                >
                  <Settings2 className="size-4" />
                </button>
                {menuOpen === "advanced" ? (
                  <div
                    className="absolute bottom-[calc(100%+8px)] right-0 z-[80] w-[360px] max-w-[calc(100vw-24px)] rounded-xl border border-white/[0.10] bg-[#252529] p-3 text-sm text-white/82 shadow-[0_12px_32px_rgba(0,0,0,0.42)]"
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onClick={stopWorkflowNodeChromeEvent}
                  >
                    {imageSettings.supportsWebSearch ? (
                      <div className="flex items-center justify-between pb-2">
                        <span>联网搜索</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={imageSettings.enableWebSearch === true}
                          className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${imageSettings.enableWebSearch ? "bg-white" : "bg-white/[0.14]"}`}
                          onClick={() =>
                            imageSettings.setEnableWebSearch(
                              !imageSettings.enableWebSearch,
                            )
                          }
                        >
                          <span
                            className={`block size-4 rounded-full transition-transform ${imageSettings.enableWebSearch ? "translate-x-4 bg-black" : "translate-x-0.5 bg-white/60"}`}
                          />
                        </button>
                      </div>
                    ) : null}
                    {imageSettings.advancedDefinitions.length > 0 ? (
                      <WorkflowExtraParametersPanel
                        definitions={imageSettings.advancedDefinitions}
                        values={imageSettings.extraParameters}
                        context={{
                          modelId: imageSettings.modelId,
                          prompt: selectedPreset.prompt,
                          referenceImageCount: 1,
                        }}
                        onChange={(patch) =>
                          imageSettings.setExtraParameters((current) => ({
                            ...current,
                            ...patch,
                          }))
                        }
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex h-8 min-w-16 items-center gap-2 text-white/62">
              <button
                type="button"
                disabled={!canRun}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white text-black shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="生成扩图"
                onClick={() =>
                  onConfirm({
                    scaleMultiplier: selectedScale.multiplier,
                    presetKey: selectedPreset.key,
                    presetLabel: selectedPreset.label,
                    prompt: selectedPreset.prompt,
                    expandFactor,
                    expandRatioKey: imageSettings.aspectRatio,
                    targetWidth: target.width,
                    targetHeight: target.height,
                    modelId: imageSettings.modelId,
                    workflowEndpointMethod: imageSettings.methodId || undefined,
                    aspectRatio: imageSettings.aspectRatio || undefined,
                    resolution: imageSettings.resolution || undefined,
                    generationCount:
                      countOptions.length > 0 ? selectedCount : undefined,
                    enableWebSearch: imageSettings.enableWebSearch,
                    workflowExtraParameters:
                      Object.keys(imageSettings.extraParameters).length > 0
                        ? imageSettings.extraParameters
                        : undefined,
                  })
                }
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
            <span className="sr-only">
              {naturalSize
                ? `${naturalSize.width}x${naturalSize.height} -> ${target.width}x${target.height}`
                : "读取中"}
            </span>
          </div>
          {imageSettings.modelsError ? (
            <div className="px-2 pt-1 text-xs text-red-300">
              {imageSettings.modelsError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
