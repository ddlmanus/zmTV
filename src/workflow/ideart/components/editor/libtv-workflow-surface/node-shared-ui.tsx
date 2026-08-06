"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { NodeToolbar, Position, useStore } from "@xyflow/react";
import {
  ArrowUp,
  Bold,
  Camera,
  ChevronDown,
  CircleHelp,
  Copy,
  Expand,
  Fullscreen,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Minimize2,
  Pilcrow,
  Settings2,
  User,
  Video,
  Volume2,
  X,
} from "lucide-react";
import type {
  LibTvWorkflowImageResult,
  LibTvWorkflowNode,
} from "@/workflow/ideart/lib/libtv/workflow";
import { LibTvPanoramaViewer } from "@/workflow/ideart/components/editor/libtv-panorama-viewer";
import { PanoramaAxisPreview } from "@/workflow/ideart/components/editor/panorama-axis-preview";
import {
  buildLibTvPanoramaFourShots,
  buildLibTvPanoramaTwelveShots,
} from "@/workflow/ideart/lib/libtv/panorama";
import {
  resolveImageDownloadUrl,
  triggerBrowserDownload,
} from "@/workflow/ideart/lib/url/download-url";
import {
  isPersistedWorkflowVideoUrl,
  toVideoDisplayUrl,
} from "../utils/video-proxy";
import { hasRecoverableWorkflowVideoGenerationTask } from "@/workflow/ideart/lib/libtv/workflow";
import {
  WorkflowImageGenerationPlaceholder,
  WorkflowImageLoadingSweep,
  WorkflowVideoGenerationPlaceholder,
} from "./nodes/workflow-node-placeholders";
import { type WorkflowMediaUploadOverlayStatus } from "./nodes/workflow-media-upload-overlay";
import {
  WorkflowExtraParametersPanel,
  normalizeWorkflowExtraParameterDefinitions,
  resolveWorkflowExtraParameterValues,
  type WorkflowExtraParameterValue,
} from "./workflow-extra-parameters";
import { WorkflowAnchoredPopover } from "./workflow-anchored-popover";
import { TapNowNodeIcon, TextLineIcon } from "./nodes/workflow-node-icons";
import {
  clampWorkflowNumber,
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  DownloadIcon,
  ExpandCornersLargeIcon,
  FocusModeIcon,
} from "./workflow-icons";
import {
  WorkflowVideoPlayerPlayIcon,
  WorkflowVideoVolumeControl,
  formatWorkflowVideoPlayerTime,
  getWorkflowImageRenderUrl,
  getWorkflowImageRenderWidthForFrame,
  getWorkflowImageResultDisplayFrameFromItem,
  getWorkflowMediaFitClass,
  getWorkflowVideoPosterUrl,
  isRenderableWorkflowMediaUrl,
  isWorkflowViewportMovingFromElement,
  normalizeWorkflowImageGenerationDisplayLabel,
  updateWorkflowInlineVideoPool,
  workflowInlineVideoPool,
} from "./workflow-media-utils";
import {
  fetchWorkflowModelOptions,
  findWorkflowModelOptionByIdentity,
  getWorkflowManagedExtraParameterValues,
  getWorkflowModelOptionValue,
  resolveWorkflowImageExecutionRoute,
  workflowModelOptionsCache,
  workflowModelOptionsListeners,
} from "./workflow-models";
import {
  getWorkflowImageNonQualityDefinitions,
  getWorkflowImageQualityChoices,
  getWorkflowImageQualityDefinition,
  normalizeGenerationCountOptions,
  normalizeWorkflowRedrawChoicesForMethod,
  pickWorkflowRedrawDefault,
} from "./generation-options";
import {
  ModelPopupList,
  WorkflowChoicePopupList,
  WorkflowModelBadges,
  WorkflowModelIcon,
} from "./generation-popovers";
import { getWorkflowRenderedNodeFrame } from "./workflow-layout";
import {
  isWorkflowImageGeneratorResultNode,
  isWorkflowVideoGeneratorNode,
} from "./workflow-node-kinds";
import {
  enqueueWorkflowInlinePosterCapture,
  getWorkflowInlinePosterCanvasSize,
} from "./workflow-connections";
import type {
  ScriptTryPromptType,
  WorkflowCropRect,
  WorkflowEmotionAdjustmentCreateRequest,
  WorkflowFocusPickOverlay,
} from "./surface-contracts";
import type { WorkflowModelOption } from "./workflow-models";

export const ZMTV_NODE_SURFACE_BACKGROUND =
  "var(--Surface-secondary-background, #262626)";

export const ZMTV_NODE_SURFACE_BORDER = "1px solid rgba(0, 219, 205, 0.24)";

export const ZMTV_NODE_SURFACE_SELECTED_BORDER =
  "1px solid rgba(0, 219, 205, 0.68)";

export const ZMTV_NODE_SURFACE_SELECTED_OUTLINE =
  "1px solid rgba(0, 219, 205, 0.62)";

export const ZMTV_NODE_SURFACE_SELECTED_SHADOW =
  "inset 0 0 0 1px rgba(0, 219, 205, 0.56), 0 0 10px rgba(0, 219, 205, 0.10)";

export const ZMTV_NODE_SURFACE_SHADOW =
  "var(--canvas-shadow-panel, 0 4px 10px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.2))";

export function ZmtvNodeEmptyGlyph() {
  return <div aria-hidden="true" className="h-full w-full" />;
}

export function ImageGeneratorEmptyState(_: {
  onImageToImageClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onUpscaleClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-fg-default">
      <ZmtvNodeEmptyGlyph />
    </div>
  );
}

export function ImageUpscaleEmptyState({ prompt }: { prompt: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-fg-default">
      <div className="mb-4 inline-flex h-14 min-w-14 items-center justify-center rounded-xl border border-border-emphasis bg-bg-surface-secondary px-2 text-[18px] font-bold leading-none text-fg-muted">
        HD
      </div>
      <div className="text-sm font-medium text-fg-muted">
        {prompt || "配置参数生成高清图像"}
      </div>
    </div>
  );
}

export function VideoGeneratorEmptyState(_: {
  onStartEndClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onFirstFrameClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-fg-default">
      <ZmtvNodeEmptyGlyph />
    </div>
  );
}

export function WorkflowFocusPickNodeOverlay({
  active,
  overlay,
  onComplete,
}: {
  active: boolean;
  overlay?: WorkflowFocusPickOverlay | null;
  onComplete?: (
    rect: WorkflowCropRect,
    displaySize: { width: number; height: number },
  ) => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const [draftOverlay, setDraftOverlay] =
    useState<WorkflowFocusPickOverlay | null>(null);
  const draftOverlayRef = useRef<WorkflowFocusPickOverlay | null>(null);
  const displayOverlay = overlay || draftOverlay;
  const left = Math.min(
    clampWorkflowNumber(displayOverlay?.startRelX ?? 0, 0, 1),
    clampWorkflowNumber(displayOverlay?.endRelX ?? 0, 0, 1),
  );
  const top = Math.min(
    clampWorkflowNumber(displayOverlay?.startRelY ?? 0, 0, 1),
    clampWorkflowNumber(displayOverlay?.endRelY ?? 0, 0, 1),
  );
  const width = Math.abs(
    clampWorkflowNumber(displayOverlay?.endRelX ?? 0, 0, 1) -
      clampWorkflowNumber(displayOverlay?.startRelX ?? 0, 0, 1),
  );
  const height = Math.abs(
    clampWorkflowNumber(displayOverlay?.endRelY ?? 0, 0, 1) -
      clampWorkflowNumber(displayOverlay?.startRelY ?? 0, 0, 1),
  );
  const selectionVisible = Boolean(displayOverlay && (width > 0 || height > 0));

  const getRelativePoint = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return {
        relX: clampWorkflowNumber(
          (event.clientX - rect.left) / Math.max(1, rect.width),
          0,
          1,
        ),
        relY: clampWorkflowNumber(
          (event.clientY - rect.top) / Math.max(1, rect.height),
          0,
          1,
        ),
        rect,
      };
    },
    [],
  );

  if (!active && !overlay) return null;

  return (
    <div
      className={`nodrag nopan absolute inset-0 z-40 touch-none select-none overflow-visible rounded-2xl ${active ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
      data-node-focus-surface="true"
      onPointerDownCapture={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!active || overlay?.status === "uploading") return;
        const point = getRelativePoint(event);
        pointerIdRef.current = event.pointerId;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const nextOverlay = {
          nodeId: "",
          startRelX: point.relX,
          startRelY: point.relY,
          endRelX: point.relX,
          endRelY: point.relY,
          status: "selecting",
        } satisfies WorkflowFocusPickOverlay;
        draftOverlayRef.current = nextOverlay;
        setDraftOverlay(nextOverlay);
      }}
      onPointerMoveCapture={(event) => {
        if (
          pointerIdRef.current !== event.pointerId ||
          !active ||
          overlay?.status === "uploading"
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const point = getRelativePoint(event);
        const nextOverlay = draftOverlayRef.current
          ? {
              ...draftOverlayRef.current,
              endRelX: point.relX,
              endRelY: point.relY,
            }
          : null;
        draftOverlayRef.current = nextOverlay;
        setDraftOverlay((current) =>
          current
            ? {
                ...current,
                endRelX: point.relX,
                endRelY: point.relY,
              }
            : current,
        );
      }}
      onPointerUpCapture={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        pointerIdRef.current = null;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        const currentOverlay = draftOverlayRef.current;
        draftOverlayRef.current = null;
        setDraftOverlay(null);
        if (!active || !currentOverlay || overlay?.status === "uploading")
          return;
        const point = getRelativePoint(event);
        const startX = clampWorkflowNumber(currentOverlay.startRelX, 0, 1);
        const startY = clampWorkflowNumber(currentOverlay.startRelY, 0, 1);
        const endX = point.relX;
        const endY = point.relY;
        const minRelX = Math.min(startX, endX);
        const minRelY = Math.min(startY, endY);
        const maxRelX = Math.max(startX, endX);
        const maxRelY = Math.max(startY, endY);
        onComplete?.(
          {
            x: minRelX * point.rect.width,
            y: minRelY * point.rect.height,
            width: (maxRelX - minRelX) * point.rect.width,
            height: (maxRelY - minRelY) * point.rect.height,
          },
          { width: point.rect.width, height: point.rect.height },
        );
      }}
      onPointerCancelCapture={(event) => {
        if (pointerIdRef.current !== event.pointerId) return;
        pointerIdRef.current = null;
        draftOverlayRef.current = null;
        setDraftOverlay(null);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      }}
      onClick={stopWorkflowNodeChromeEvent}
      onDoubleClick={stopWorkflowNodeChromeEvent}
    >
      <div
        className={`absolute inset-0 rounded-2xl bg-black/25 transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
      />
      {selectionVisible ? (
        <>
          <div
            className="pointer-events-none absolute rounded-sm border-2 border-white/90 bg-white/[0.04] shadow-[0_0_0_1px_rgba(0,0,0,0.22),0_14px_34px_rgba(0,0,0,0.32)]"
            style={{
              left: `${left * 100}%`,
              top: `${top * 100}%`,
              width: `${width * 100}%`,
              height: `${height * 100}%`,
            }}
          />
          <div
            className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-full items-center gap-1.5 rounded-full border border-white/10 bg-[#2a2a2a]/96 px-3 py-1.5 text-sm font-medium text-white shadow-[0_12px_26px_rgba(0,0,0,0.38)]"
            style={{
              left: `${(left + width / 2) * 100}%`,
              top: `calc(${top * 100}% - 8px)`,
            }}
          >
            {displayOverlay?.status === "uploading" ? (
              <Loader2 className="size-4 animate-spin text-white/72" />
            ) : (
              <FocusModeIcon />
            )}
            <span>
              {displayOverlay?.status === "uploading"
                ? "上传聚焦图..."
                : displayOverlay?.status === "done"
                  ? "已添加聚焦图"
                  : "聚焦区域"}
            </span>
          </div>
        </>
      ) : active ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#2a2a2a]/86 px-3 py-1.5 text-sm text-white/82 shadow-[0_12px_28px_rgba(0,0,0,0.32)]">
          <FocusModeIcon />
          <span>框选聚焦区域</span>
        </div>
      ) : null}
    </div>
  );
}

export type WorkflowEmotionAdjustMode = "pick" | "adjust";

export type WorkflowEmotionPoint = { x: number; y: number };

export const WORKFLOW_EMOTION_PRESETS: Array<
  WorkflowEmotionPoint & { label: string; imageUrl: string }
> = [
  {
    x: 10,
    y: 10,
    label: "欣然愉悦",
    imageUrl: "/images/libtv/expressions/expression-01.png",
  },
  {
    x: 30,
    y: 10,
    label: "骤然错愕",
    imageUrl: "/images/libtv/expressions/expression-02.png",
  },
  {
    x: 50,
    y: 10,
    label: "惊魂未定",
    imageUrl: "/images/libtv/expressions/expression-03.png",
  },
  {
    x: 70,
    y: 10,
    label: "心跳骤停",
    imageUrl: "/images/libtv/expressions/expression-04.png",
  },
  {
    x: 90,
    y: 10,
    label: "暴怒沉怒",
    imageUrl: "/images/libtv/expressions/expression-05.png",
  },
  {
    x: 10,
    y: 30,
    label: "浅然莞尔",
    imageUrl: "/images/libtv/expressions/expression-06.png",
  },
  {
    x: 30,
    y: 30,
    label: "难以置信",
    imageUrl: "/images/libtv/expressions/expression-07.png",
  },
  {
    x: 50,
    y: 30,
    label: "受惊后退",
    imageUrl: "/images/libtv/expressions/expression-08.png",
  },
  {
    x: 70,
    y: 30,
    label: "强忍悲戚",
    imageUrl: "/images/libtv/expressions/expression-09.png",
  },
  {
    x: 90,
    y: 30,
    label: "隐忍愠怒",
    imageUrl: "/images/libtv/expressions/expression-10.png",
  },
  {
    x: 10,
    y: 50,
    label: "含情凝望",
    imageUrl: "/images/libtv/expressions/expression-11.png",
  },
  {
    x: 30,
    y: 50,
    label: "欲言又止",
    imageUrl: "/images/libtv/expressions/expression-12.png",
  },
  {
    x: 50,
    y: 50,
    label: "淡然自若",
    imageUrl: "/images/libtv/expressions/expression-13.png",
  },
  {
    x: 70,
    y: 50,
    label: "警觉审视",
    imageUrl: "/images/libtv/expressions/expression-14.png",
  },
  {
    x: 90,
    y: 50,
    label: "眉宇凝霜",
    imageUrl: "/images/libtv/expressions/expression-15.png",
  },
  {
    x: 10,
    y: 70,
    label: "满眼宠溺",
    imageUrl: "/images/libtv/expressions/expression-16.png",
  },
  {
    x: 30,
    y: 70,
    label: "万般无奈",
    imageUrl: "/images/libtv/expressions/expression-17.png",
  },
  {
    x: 50,
    y: 70,
    label: "触景伤情",
    imageUrl: "/images/libtv/expressions/expression-18.png",
  },
  {
    x: 70,
    y: 70,
    label: "隐忍心伤",
    imageUrl: "/images/libtv/expressions/expression-19.png",
  },
  {
    x: 90,
    y: 70,
    label: "冷眼漠然",
    imageUrl: "/images/libtv/expressions/expression-20.png",
  },
  {
    x: 10,
    y: 90,
    label: "积郁憋闷",
    imageUrl: "/images/libtv/expressions/expression-21.png",
  },
  {
    x: 30,
    y: 90,
    label: "默然垂泪",
    imageUrl: "/images/libtv/expressions/expression-22.png",
  },
  {
    x: 50,
    y: 90,
    label: "疲惫失神",
    imageUrl: "/images/libtv/expressions/expression-23.png",
  },
  {
    x: 70,
    y: 90,
    label: "哀悼压抑",
    imageUrl: "/images/libtv/expressions/expression-24.png",
  },
  {
    x: 90,
    y: 90,
    label: "疏离冷淡",
    imageUrl: "/images/libtv/expressions/expression-25.png",
  },
];

export function getWorkflowEmotionPreset(point: WorkflowEmotionPoint) {
  const x = clampWorkflowNumber(point.x, 0, 100);
  const y = clampWorkflowNumber(point.y, 0, 100);
  return WORKFLOW_EMOTION_PRESETS.reduce((best, item) => {
    const bestDistance = Math.hypot(best.x - x, best.y - y);
    const itemDistance = Math.hypot(item.x - x, item.y - y);
    return itemDistance < bestDistance ? item : best;
  }, WORKFLOW_EMOTION_PRESETS[12]);
}

export function getWorkflowEmotionLabel(point: WorkflowEmotionPoint) {
  return getWorkflowEmotionPreset(point).label;
}

export function snapWorkflowEmotionPoint(
  point: WorkflowEmotionPoint,
): WorkflowEmotionPoint {
  const values = [10, 30, 50, 70, 90];
  const nearest = (value: number) =>
    values.reduce(
      (best, item) =>
        Math.abs(item - value) < Math.abs(best - value) ? item : best,
      values[0],
    );
  return {
    x: nearest(clampWorkflowNumber(point.x, 0, 100)),
    y: nearest(clampWorkflowNumber(point.y, 0, 100)),
  };
}

export function WorkflowEmotionPickToolbar({
  onClose,
  onManualSelect,
}: {
  onClose: () => void;
  onManualSelect: () => void;
}) {
  return (
    <div
      className="node-float-ui nodrag nopan nowheel pointer-events-auto absolute left-1/2 z-[95] flex origin-bottom cursor-default items-center whitespace-nowrap"
      data-image-editor-toolbar=""
      data-workflow-emotion-toolbar="pick"
      style={{
        top: "calc(-10px * var(--workflow-float-scale, 1))",
        transform:
          "translateX(-50%) translateY(-100%) scale(var(--workflow-float-scale, 1))",
        transformOrigin: "center bottom",
      }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="box-border flex h-11 w-fit items-center justify-center gap-2 rounded-xl p-2 text-canvas-controls-text backdrop-blur-[16px]"
        style={{
          backgroundColor:
            "var(--canvas-controls-bg, var(--panel-background, #262626))",
          border: "0.5px solid var(--canvas-controls-border, #363636)",
          boxShadow:
            "var(--canvas-shadow-dropdown, 0 4px 10px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.2))",
        }}
      >
        <button
          type="button"
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-canvas-controls-text/70 transition-colors hover:bg-canvas-controls-hover hover:text-canvas-controls-text"
          aria-label="取消情绪调节"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X className="size-4" />
        </button>
        <div className="h-5 w-px bg-canvas-controls-border" />
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg text-canvas-controls-text/80">
          <User className="size-4" />
        </span>
        <span className="text-[13px] font-medium leading-none text-canvas-controls-text">
          请选择人物进行操作
        </span>
        <button
          type="button"
          className="flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-[0.5px] border-canvas-controls-border px-3 text-[12px] font-medium text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover"
          onClick={(event) => {
            event.stopPropagation();
            onManualSelect();
          }}
        >
          手动框选
        </button>
      </div>
    </div>
  );
}

export function WorkflowEmotionFacePickOverlay({
  onSelect,
}: {
  onSelect: () => void;
}) {
  return (
    <div
      className="nodrag nopan nowheel absolute inset-0 z-[90] touch-none select-none overflow-hidden rounded-2xl"
      data-workflow-emotion-face-picker="true"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onDoubleClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/35" />
      <button
        type="button"
        className="absolute rounded-[10px] border-2 border-white/85 bg-white/[0.02] shadow-[0_0_0_9999px_rgba(0,0,0,0.10)] transition-colors hover:border-[#CE51FF]"
        aria-label="选择人物"
        style={{
          left: "42%",
          top: "18%",
          width: "16%",
          height: "24%",
          minWidth: 44,
          minHeight: 54,
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      />
    </div>
  );
}

export function WorkflowEmotionAdjustPanel({
  imageUrl,
  point,
  initialModelId,
  initialWorkflowEndpointMethod,
  initialAspectRatio,
  initialImageSize,
  initialWorkflowExtraParameters,
  onPointChange,
  onClose,
  onSubmit,
}: {
  imageUrl: string;
  point: WorkflowEmotionPoint;
  initialModelId?: string;
  initialWorkflowEndpointMethod?: string;
  initialAspectRatio?: string;
  initialImageSize?: string;
  initialWorkflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
  onPointChange: (point: WorkflowEmotionPoint) => void;
  onClose: () => void;
  onSubmit: (request: WorkflowEmotionAdjustmentCreateRequest) => void;
}) {
  const pointerIdRef = useRef<number | null>(null);
  const popupAnchorRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const [activePopup, setActivePopup] = useState<
    "model" | "ratio" | "size" | "quality" | "count" | "advanced" | null
  >(null);
  const [modelOptions, setModelOptions] = useState<WorkflowModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState(
    String(initialModelId || "").trim(),
  );
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(
    String(initialAspectRatio || "").trim(),
  );
  const [selectedImageSize, setSelectedImageSize] = useState(
    String(initialImageSize || "").trim(),
  );
  const [selectedCount, setSelectedCount] = useState(1);
  const [selectedExtraParameters, setSelectedExtraParameters] = useState<
    Record<string, WorkflowExtraParameterValue>
  >(() => ({ ...(initialWorkflowExtraParameters || {}) }));
  const renderUrl = getWorkflowImageRenderUrl(imageUrl);
  const emotionPreset = getWorkflowEmotionPreset(point);
  const previewUrl = getWorkflowImageRenderUrl(emotionPreset.imageUrl);
  const emotionLabel = emotionPreset.label;
  const selectedModel = useMemo(() => {
    if (!modelOptions.length) return null;
    return (
      findWorkflowModelOptionByIdentity(modelOptions, selectedModelId) ||
      modelOptions.find((model) => model.isDefault) ||
      modelOptions[0]
    );
  }, [modelOptions, selectedModelId]);
  const selectedModelValue =
    getWorkflowModelOptionValue(selectedModel) || selectedModelId;
  const modelLabel =
    selectedModel?.name ||
    selectedModelValue ||
    (modelsLoading ? "加载模型..." : "选择图片模型");
  const selectedModelIconUrl = isRenderableWorkflowMediaUrl(
    String(selectedModel?.icon || ""),
  )
    ? String(selectedModel?.icon)
    : "";
  const selectedImageExecutionRoute = useMemo(
    () => resolveWorkflowImageExecutionRoute(selectedModel, true),
    [selectedModel],
  );
  const selectedImageEndpointMethod =
    selectedImageExecutionRoute?.methodId ||
    String(initialWorkflowEndpointMethod || "").trim();
  const aspectOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.aspectRatios,
        [],
        selectedImageEndpointMethod,
      ),
    [selectedImageEndpointMethod, selectedModel?.parameters?.aspectRatios],
  );
  const sizeOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.resolutions,
        [],
        selectedImageEndpointMethod,
      ),
    [selectedImageEndpointMethod, selectedModel?.parameters?.resolutions],
  );
  const countOptions = useMemo(
    () =>
      normalizeGenerationCountOptions(
        "image",
        selectedModel?.parameters?.counts,
        selectedImageEndpointMethod,
      ),
    [selectedImageEndpointMethod, selectedModel?.parameters?.counts],
  );
  const extraParameterDefinitions = useMemo(
    () =>
      normalizeWorkflowExtraParameterDefinitions(
        selectedModel?.parameters?.extraParameters,
        selectedImageEndpointMethod,
      ),
    [selectedImageEndpointMethod, selectedModel?.parameters?.extraParameters],
  );
  const qualityDefinition = useMemo(
    () => getWorkflowImageQualityDefinition(extraParameterDefinitions),
    [extraParameterDefinitions],
  );
  const qualityOptions = useMemo(
    () => getWorkflowImageQualityChoices(qualityDefinition),
    [qualityDefinition],
  );
  const visibleExtraParameterDefinitions = useMemo(
    () => getWorkflowImageNonQualityDefinitions(extraParameterDefinitions),
    [extraParameterDefinitions],
  );
  const resolvedExtraParameters = useMemo(
    () =>
      resolveWorkflowExtraParameterValues(
        extraParameterDefinitions,
        selectedExtraParameters,
        { fillDefaults: true },
      ),
    [extraParameterDefinitions, selectedExtraParameters],
  );
  const selectedQuality = String(
    (qualityDefinition?.type
      ? resolvedExtraParameters[qualityDefinition.type]
      : undefined) ??
      resolvedExtraParameters.quality ??
      resolvedExtraParameters.image_quality ??
      "",
  ).trim();
  const selectedCountValue = pickWorkflowRedrawDefault(
    String(selectedCount || ""),
    selectedModel?.parameters?.counts,
    countOptions,
    countOptions[0]?.value || "",
    selectedImageEndpointMethod,
  );
  const selectedCountNumber = Math.max(
    1,
    Number.parseInt(selectedCountValue || "1", 10) || 1,
  );
  const selectedAspectLabel =
    aspectOptions.find((item) => item.value === selectedAspectRatio)?.label ||
    selectedAspectRatio;
  const selectedSizeLabel =
    sizeOptions.find((item) => item.value === selectedImageSize)?.label ||
    selectedImageSize;
  const selectedQualityLabel =
    qualityOptions.find((item) => item.value === selectedQuality)?.label ||
    selectedQuality;
  const selectedCountLabel =
    countOptions.find((item) => item.value === selectedCountValue)?.label ||
    `${selectedCountNumber}张`;
  const updatePointFromEvent = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      onPointChange(
        snapWorkflowEmotionPoint({
          x: clampWorkflowNumber(
            ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100,
            0,
            100,
          ),
          y: clampWorkflowNumber(
            ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100,
            0,
            100,
          ),
        }),
      );
    },
    [onPointChange],
  );
  const closePopups = useCallback(() => {
    setActivePopup(null);
    popupAnchorRef.current = null;
  }, []);
  const togglePopup = useCallback(
    (popup: typeof activePopup, anchor: HTMLButtonElement) => {
      setActivePopup((current) => {
        const next = current === popup ? null : popup;
        popupAnchorRef.current = next ? anchor : null;
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    if (!activePopup) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (
        !target ||
        popupAnchorRef.current?.contains(target) ||
        popupRef.current?.contains(target)
      )
        return;
      closePopups();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [activePopup, closePopups]);
  useEffect(() => {
    let cancelled = false;
    const applyCached = () => {
      const cached = workflowModelOptionsCache.get("image");
      if (!cancelled && cached) {
        setModelOptions(cached);
        setModelsLoading(false);
        return true;
      }
      return false;
    };
    workflowModelOptionsListeners.add(applyCached);
    if (applyCached()) {
      return () => {
        cancelled = true;
        workflowModelOptionsListeners.delete(applyCached);
      };
    }
    setModelsLoading(true);
    fetchWorkflowModelOptions("image")
      .then((next) => {
        if (!cancelled) setModelOptions(next);
      })
      .catch(() => {
        if (!cancelled) setModelOptions([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
      workflowModelOptionsListeners.delete(applyCached);
    };
  }, []);
  useEffect(() => {
    if (modelOptions.length === 0) return;
    if (findWorkflowModelOptionByIdentity(modelOptions, selectedModelId))
      return;
    const fallback =
      modelOptions.find((model) => model.isDefault) || modelOptions[0];
    setSelectedModelId(getWorkflowModelOptionValue(fallback));
  }, [modelOptions, selectedModelId]);
  useEffect(() => {
    const next = pickWorkflowRedrawDefault(
      selectedAspectRatio,
      selectedModel?.parameters?.aspectRatios,
      aspectOptions,
      aspectOptions[0]?.value || "",
      selectedImageEndpointMethod,
    );
    if (next !== selectedAspectRatio) setSelectedAspectRatio(next);
  }, [
    aspectOptions,
    selectedAspectRatio,
    selectedImageEndpointMethod,
    selectedModel?.parameters?.aspectRatios,
  ]);
  useEffect(() => {
    const next = pickWorkflowRedrawDefault(
      selectedImageSize,
      selectedModel?.parameters?.resolutions,
      sizeOptions,
      sizeOptions[0]?.value || "",
      selectedImageEndpointMethod,
    );
    if (next !== selectedImageSize) setSelectedImageSize(next);
  }, [
    selectedImageEndpointMethod,
    selectedImageSize,
    selectedModel?.parameters?.resolutions,
    sizeOptions,
  ]);
  useEffect(() => {
    if (countOptions.length === 0) {
      if (selectedCount !== 1) setSelectedCount(1);
      return;
    }
    if (selectedCountNumber !== selectedCount)
      setSelectedCount(selectedCountNumber);
  }, [countOptions.length, selectedCount, selectedCountNumber]);
  useEffect(() => {
    setSelectedExtraParameters((current) =>
      resolveWorkflowExtraParameterValues(extraParameterDefinitions, current, {
        fillDefaults: true,
      }),
    );
  }, [extraParameterDefinitions]);
  const dots = useMemo(() => {
    const values = [10, 30, 50, 70, 90];
    return values.flatMap((y) => values.map((x) => ({ x, y })));
  }, []);
  const activeDotKeys = useMemo(() => {
    const keys = new Set<string>();
    dots.forEach((dot) => {
      if (dot.x === emotionPreset.x || dot.y === emotionPreset.y)
        keys.add(`${dot.x}-${dot.y}`);
    });
    return keys;
  }, [dots, emotionPreset.x, emotionPreset.y]);
  const selectedDotKey = `${emotionPreset.x}-${emotionPreset.y}`;
  const showCenterAnchor = selectedDotKey !== "50-50";

  return (
    <div
      className="nodrag nopan nowheel absolute left-1/2 z-[96] w-[580px] -translate-x-1/2 cursor-default overflow-visible text-fg-default"
      data-workflow-emotion-adjust-panel="true"
      style={{
        top: "calc(100% + 12px)",
        pointerEvents: "none",
      }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onDoubleClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="pointer-events-auto w-full">
        <div
          className="border-hair box-border flex w-full min-w-[580px] flex-col items-start justify-end gap-2 overflow-hidden rounded-xl border border-canvas-controls-border px-0 pb-3 pt-0"
          style={{ background: "#212121" }}
        >
          <div className="flex h-14 w-full shrink-0 items-center justify-between border-b border-canvas-controls-border px-3 py-3">
            <div className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover"
                aria-label="关闭"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose();
                }}
              >
                <X className="size-3" />
              </button>
              <span
                className="mx-0.5 h-6 w-[0.5px] shrink-0 bg-[#525252]"
                aria-hidden="true"
              />
              <span className="flex h-8 items-center truncate rounded-lg px-3 text-[13px] font-medium text-fg-default">
                情绪调节
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="flex h-8 max-w-[150px] cursor-pointer items-center justify-center gap-1 rounded-lg bg-transparent px-2 text-[13px] text-fg-default transition-colors hover:bg-canvas-controls-hover"
                aria-haspopup="menu"
                aria-expanded={activePopup === "model"}
                onClick={(event) => {
                  event.stopPropagation();
                  togglePopup("model", event.currentTarget);
                }}
              >
                <WorkflowModelIcon
                  iconUrl={selectedModelIconUrl}
                  name={modelLabel}
                />
                <span
                  className="min-w-0 truncate whitespace-nowrap"
                  title={modelLabel}
                >
                  {modelLabel}
                </span>
                <WorkflowModelBadges model={selectedModel} />
                <ChevronDown className="size-[10px] shrink-0 text-fg-muted" />
              </button>
              {aspectOptions.length > 0 ? (
                <button
                  type="button"
                  className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg bg-transparent px-2 text-[13px] text-fg-default transition-colors hover:bg-canvas-controls-hover"
                  aria-haspopup="menu"
                  aria-expanded={activePopup === "ratio"}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePopup("ratio", event.currentTarget);
                  }}
                >
                  <span className="whitespace-nowrap">
                    {selectedAspectLabel}
                  </span>
                  <ChevronDown className="size-[10px] text-fg-muted" />
                </button>
              ) : null}
              {sizeOptions.length > 0 ? (
                <button
                  type="button"
                  className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg bg-transparent px-2 text-[13px] text-fg-default transition-colors hover:bg-canvas-controls-hover"
                  aria-haspopup="menu"
                  aria-expanded={activePopup === "size"}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePopup("size", event.currentTarget);
                  }}
                >
                  <span className="whitespace-nowrap">{selectedSizeLabel}</span>
                  <ChevronDown className="size-[10px] text-fg-muted" />
                </button>
              ) : null}
              {qualityOptions.length > 0 ? (
                <button
                  type="button"
                  className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg bg-transparent px-2 text-[13px] text-fg-default transition-colors hover:bg-canvas-controls-hover"
                  aria-haspopup="menu"
                  aria-expanded={activePopup === "quality"}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePopup("quality", event.currentTarget);
                  }}
                >
                  <span className="whitespace-nowrap">
                    {selectedQualityLabel}
                  </span>
                  <ChevronDown className="size-[10px] text-fg-muted" />
                </button>
              ) : null}
              {countOptions.length > 0 ? (
                <button
                  type="button"
                  className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg bg-transparent px-2 text-[13px] text-fg-default transition-colors hover:bg-canvas-controls-hover"
                  aria-haspopup="menu"
                  aria-expanded={activePopup === "count"}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePopup("count", event.currentTarget);
                  }}
                >
                  <span className="whitespace-nowrap">
                    {selectedCountLabel}
                  </span>
                  <ChevronDown className="size-[10px] text-fg-muted" />
                </button>
              ) : null}
              {visibleExtraParameterDefinitions.length > 0 ? (
                <button
                  type="button"
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
                  aria-label="更多模型参数"
                  aria-haspopup="dialog"
                  aria-expanded={activePopup === "advanced"}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePopup("advanced", event.currentTarget);
                  }}
                >
                  <Settings2 className="size-4" />
                </button>
              ) : null}
              <div className="flex h-8 items-center gap-2 text-fg-muted [&_button]:size-8 [&_button_svg]:size-4">
                <button
                  type="button"
                  disabled={!selectedModelValue}
                  data-quick-guide-anchor="generator-submit"
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-btn-invert-bg text-btn-invert-text transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="生成情绪调节图"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSubmit({
                      emotionLabel,
                      modelId: selectedModelValue,
                      workflowEndpointMethod:
                        selectedImageEndpointMethod || undefined,
                      aspectRatio: selectedAspectRatio || undefined,
                      imageSize: selectedImageSize || undefined,
                      generationCount:
                        countOptions.length > 0
                          ? selectedCountNumber
                          : undefined,
                      workflowExtraParameters:
                        Object.keys(resolvedExtraParameters).length > 0
                          ? resolvedExtraParameters
                          : undefined,
                    });
                  }}
                >
                  <ArrowUp className="size-3" />
                </button>
              </div>
            </div>
            {activePopup ? (
              <WorkflowAnchoredPopover
                anchorRef={popupAnchorRef}
                popoverRef={popupRef}
                side="bottom"
                align="end"
                gap={6}
                margin={12}
                heightLimit={activePopup === "model" ? 409 : 360}
                ariaLabel={activePopup === "model" ? "图片模型" : "生成参数"}
                testId="workflow-emotion-settings-popover"
                className={
                  activePopup === "model"
                    ? "rounded-2xl border-[0.5px] border-card-border bg-panel-background/95 p-1 text-sm text-fg-default shadow-[0_1px_3px_rgba(0,0,0,0.05),0_20px_25px_-5px_rgba(0,0,0,0.05),0_10px_10px_-5px_rgba(0,0,0,0.04)] backdrop-blur-[32px]"
                    : activePopup === "advanced"
                      ? "w-[min(420px,calc(100vw-24px))] rounded-xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-popover-background)] p-3 text-sm text-fg-default shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl"
                      : "min-w-40 rounded-xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-popover-background)] p-1.5 text-sm text-fg-default shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl"
                }
              >
                {activePopup === "model" ? (
                  <ModelPopupList
                    title="图片模型"
                    models={modelOptions}
                    loading={modelsLoading}
                    selected={selectedModelValue}
                    onSelect={(value) => {
                      setSelectedModelId(value);
                      closePopups();
                    }}
                  />
                ) : activePopup === "ratio" ? (
                  <WorkflowChoicePopupList
                    options={aspectOptions}
                    selected={selectedAspectRatio}
                    onSelect={(value) => {
                      setSelectedAspectRatio(value);
                      closePopups();
                    }}
                  />
                ) : activePopup === "size" ? (
                  <WorkflowChoicePopupList
                    options={sizeOptions}
                    selected={selectedImageSize}
                    onSelect={(value) => {
                      setSelectedImageSize(value);
                      closePopups();
                    }}
                  />
                ) : activePopup === "quality" ? (
                  <WorkflowChoicePopupList
                    options={qualityOptions}
                    selected={selectedQuality}
                    onSelect={(value) => {
                      const qualityKey = qualityDefinition?.type || "quality";
                      setSelectedExtraParameters((current) => ({
                        ...current,
                        [qualityKey]: value,
                      }));
                      closePopups();
                    }}
                  />
                ) : activePopup === "count" ? (
                  <WorkflowChoicePopupList
                    options={countOptions}
                    selected={selectedCountValue}
                    onSelect={(value) => {
                      setSelectedCount(
                        Math.max(1, Number.parseInt(value, 10) || 1),
                      );
                      closePopups();
                    }}
                  />
                ) : (
                  <WorkflowExtraParametersPanel
                    definitions={visibleExtraParameterDefinitions}
                    values={selectedExtraParameters}
                    context={{
                      modelId: selectedModelValue,
                      referenceImageCount: 1,
                      managedValues:
                        getWorkflowManagedExtraParameterValues(selectedModel),
                    }}
                    onChange={(patch) =>
                      setSelectedExtraParameters((current) => ({
                        ...current,
                        ...patch,
                      }))
                    }
                  />
                )}
              </WorkflowAnchoredPopover>
            ) : null}
          </div>
          <div className="flex h-8 w-full shrink-0 flex-wrap items-center gap-2 px-3 py-1">
            <button
              type="button"
              className="group relative flex h-6 items-center gap-1 rounded-lg border-[0.5px] border-stroke-medium bg-panel-background/95 py-1 pl-1 pr-2 text-xs text-fg-default shadow-[0_2px_6px_rgba(0,0,0,0.02)] transition-colors"
            >
              <img
                src={renderUrl}
                alt=""
                draggable={false}
                className="size-4 shrink-0 rounded object-cover"
              />
              <span className="whitespace-nowrap">角色1</span>
              <span
                role="button"
                tabIndex={-1}
                aria-label="删除"
                className="hidden size-4 cursor-pointer items-center justify-center rounded-full text-fg-muted hover:text-fg-default group-hover:flex"
              >
                <X className="size-2.5" />
              </span>
            </button>
            <button
              type="button"
              className="flex h-6 cursor-pointer items-center gap-1 rounded-lg border-[0.5px] border-canvas-controls-border py-1 pl-1 pr-2 text-xs text-fg-muted shadow-[0_2px_6px_rgba(0,0,0,0.02)] transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
              data-testid="portrait-texture-add-role"
              onClick={(event) => {
                event.stopPropagation();
                message.info("手动添加人物 开发中");
              }}
            >
              <svg
                aria-hidden="true"
                role="img"
                className="pointer-events-none size-3.5 shrink-0"
                width="1em"
                height="1em"
                viewBox="0 0 22 22"
              >
                <path
                  d="M4.4502 0C4.61575 0.000105488 4.74993 0.134246 4.75 0.299805V3.25H17.5996C18.2347 3.25 18.75 3.76526 18.75 4.40039V17.25H21.7002C21.8657 17.2501 21.9999 17.3842 22 17.5498V18.4502C21.9999 18.6157 21.8657 18.7499 21.7002 18.75H18.75V21.7002C18.7499 21.8657 18.6157 21.9999 18.4502 22H17.5498C17.3843 21.9999 17.2501 21.8657 17.25 21.7002V18.75H4.40039C3.76528 18.75 3.25003 18.2347 3.25 17.5996V4.75H0.299805C0.134294 4.74989 0.000138403 4.6157 0 4.4502V3.5498C7.25073e-05 3.38425 0.134254 3.25011 0.299805 3.25H3.25V0.299805C3.25007 0.134246 3.38425 0.0001055 3.5498 0H4.4502ZM4.75 17.25H17.25V4.75H4.75V17.25Z"
                  fill="currentColor"
                />
              </svg>
              <span className="whitespace-nowrap">手动添加</span>
            </button>
          </div>
          <div className="flex min-h-[216px] w-full shrink-0 flex-col items-start px-3">
            <div
              className="flex h-[216px] w-full flex-col items-start rounded-[26px] p-2"
              style={{ background: "#262626" }}
            >
              <div className="flex h-[200px] w-full items-center justify-between">
                <div className="relative h-[200px] w-[316px] shrink-0 overflow-hidden rounded-[24px] border border-canvas-controls-border">
                  <img
                    src={previewUrl}
                    alt=""
                    draggable={false}
                    className="size-full object-cover"
                  />
                </div>
                <span
                  className="h-[110px] w-[0.5px] shrink-0 bg-[#525252] opacity-50"
                  aria-hidden="true"
                />
                <div className="size-[200px] shrink-0 transition-opacity">
                  <div className="relative size-full shrink-0 overflow-hidden rounded-[24px] bg-gradient-to-b from-[#646464] to-[#363636]">
                    <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[11px] leading-[17px] text-white/45">
                      激动
                    </span>
                    <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[11px] leading-[17px] text-white/45">
                      平静
                    </span>
                    <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[11px] leading-[15px] text-white/45 [writing-mode:vertical-lr]">
                      亲近
                    </span>
                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[11px] leading-[15px] text-white/45 [writing-mode:vertical-lr]">
                      疏离
                    </span>
                    <div
                      className="relative m-[25px] h-[150px] touch-none cursor-grab active:cursor-grabbing"
                      style={{ touchAction: "none" }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        pointerIdRef.current = event.pointerId;
                        event.currentTarget.setPointerCapture?.(
                          event.pointerId,
                        );
                        updatePointFromEvent(event);
                      }}
                      onPointerMove={(event) => {
                        if (pointerIdRef.current !== event.pointerId) return;
                        event.stopPropagation();
                        updatePointFromEvent(event);
                      }}
                      onPointerUp={(event) => {
                        if (pointerIdRef.current !== event.pointerId) return;
                        event.stopPropagation();
                        pointerIdRef.current = null;
                        event.currentTarget.releasePointerCapture?.(
                          event.pointerId,
                        );
                      }}
                      onPointerCancel={(event) => {
                        if (pointerIdRef.current !== event.pointerId) return;
                        pointerIdRef.current = null;
                      }}
                    >
                      {dots.map((dot) => {
                        const key = `${dot.x}-${dot.y}`;
                        if (
                          key === selectedDotKey ||
                          (key === "50-50" && showCenterAnchor)
                        )
                          return null;
                        const active = activeDotKeys.has(key);
                        return (
                          <span
                            key={key}
                            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                            aria-hidden="true"
                            style={{
                              left: `${dot.x}%`,
                              top: `${dot.y}%`,
                              opacity: active ? 1 : 0.25,
                              transform: `translate(-50%, -50%) scale(${active ? 1.15 : 1})`,
                              transition:
                                "opacity 0.18s ease-out, transform 0.18s ease-out",
                            }}
                          />
                        );
                      })}
                      {showCenterAnchor ? (
                        <span
                          className="pointer-events-none absolute size-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.10]"
                          aria-hidden="true"
                          style={{
                            left: "50%",
                            top: "50%",
                            transition: "transform 0.18s ease-out",
                          }}
                        >
                          <span className="absolute left-1/2 top-1/2 size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.20]" />
                        </span>
                      ) : null}
                      <span
                        className="pointer-events-none absolute size-[18px] rounded-full bg-white will-change-transform"
                        aria-hidden="true"
                        style={{
                          left: `${emotionPreset.x}%`,
                          top: `${emotionPreset.y}%`,
                          transform: "translate(-50%, -50%) scale(1)",
                          transition:
                            "left 0.32s cubic-bezier(0.22, 1, 0.36, 1), top 0.32s cubic-bezier(0.22, 1, 0.36, 1), transform 0.2s ease-out",
                          boxShadow: "rgba(255, 255, 255, 0.4) 0px 0px 4px",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex h-7 w-full items-center gap-2 rounded-lg px-4 pb-0 text-[13px]">
            <span className="shrink-0 text-[13px] font-medium text-[#919191]">
              情绪定位
            </span>
            <span className="flex h-7 min-w-0 items-center truncate rounded-lg px-2 text-fg-default">
              {emotionLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkflowGenerationErrorState({
  error,
  overlay = false,
}: {
  error: string;
  overlay?: boolean;
}) {
  const messageText = String(error || "生成失败").trim() || "生成失败";
  return (
    <div
      role="alert"
      data-testid="canvas-node-generation-error"
      className={`flex max-w-full flex-col items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-center ${overlay ? "pointer-events-none absolute inset-x-3 bottom-3 z-20" : "h-full w-full"}`}
      style={{
        backgroundColor: "var(--canvas-error-bg, rgba(127, 29, 29, 0.78))",
        border:
          "0.5px solid var(--canvas-error-border, rgba(248, 113, 113, 0.42))",
        color: "var(--canvas-error-text, #fecaca)",
      }}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        <CircleHelp className="size-3.5 shrink-0" />
        <span>生成失败</span>
      </span>
      <span
        className="max-w-full truncate text-[11px] opacity-80"
        title={messageText}
      >
        {messageText}
      </span>
    </div>
  );
}

export function WorkflowZoomAwareImage({
  node,
  mediaUrl,
  mediaFitClass,
}: {
  node: LibTvWorkflowNode;
  mediaUrl: string;
  mediaFitClass: string;
}) {
  const frameWidth = useMemo(
    () => Number(getWorkflowRenderedNodeFrame(node).width || 0),
    [node],
  );
  const selectRenderWidth = useCallback(
    (state: { transform: [number, number, number] }) =>
      getWorkflowImageRenderWidthForFrame(frameWidth, state.transform[2]),
    [frameWidth],
  );
  const renderWidth = useStore(selectRenderWidth);
  const imageRenderUrl = useMemo(
    () => getWorkflowImageRenderUrl(mediaUrl, renderWidth),
    [mediaUrl, renderWidth],
  );

  return (
    <img
      src={imageRenderUrl}
      alt=""
      decoding="async"
      loading="lazy"
      draggable={false}
      className={`h-full w-full rounded-2xl ${mediaFitClass}`}
    />
  );
}

export function TapNowNodeBody({
  node,
  priority = false,
  onImageToImageClick,
  onImageUpscaleClick,
  onVideoStartEndClick,
  onVideoFirstFrameClick,
}: {
  node: LibTvWorkflowNode;
  priority?: boolean;
  onImageToImageClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onImageUpscaleClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onVideoStartEndClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onVideoFirstFrameClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const mediaUrl = String(node.data?.mediaUrl || "").trim();
  const mediaUploadState = String(
    node.data?.workflowMediaUploadState || "",
  ) as WorkflowMediaUploadOverlayStatus;
  const generationError = String(
    node.data?.workflowGenerationError || "",
  ).trim();
  const redrawRunning = Boolean(node.data?.workflowRedrawRunning);
  const generationRunning =
    !mediaUploadState &&
    (node.kind === "video"
      ? Boolean(node.data?.workflowGenerationRunning) ||
        hasRecoverableWorkflowVideoGenerationTask(node)
      : Boolean(node.data?.workflowGenerationRunning));
  const mediaFitClass = getWorkflowMediaFitClass(node);
  const rawGenerationProgress = Number(node.data?.workflowGenerationProgress);
  const generationProgress = Number.isFinite(rawGenerationProgress)
    ? Math.max(0, Math.min(1, rawGenerationProgress))
    : undefined;
  const generationNote = String(node.data?.note || "").trim();
  const isUploadRunning = /上传中/.test(generationNote);
  const isVideoGeneratorNode = isWorkflowVideoGeneratorNode(node);
  const imageGenerationLabel =
    normalizeWorkflowImageGenerationDisplayLabel(generationNote);
  const videoGenerationTitle = isUploadRunning
    ? generationNote
    : isVideoGeneratorNode
      ? "视频生成中"
      : generationNote || "视频生成中";
  const isImageUpscaleNode =
    node.kind === "image" &&
    node.data?.mediaRole === "generator" &&
    String(node.data?.selectedOptionId || "") === "image-upscale";
  const looksLikeEmotionAdjustmentNode = /情绪调节/.test(
    String(node.data?.title || node.data?.note || ""),
  );
  const isEmotionAdjustmentGeneratorNode =
    node.kind === "image" &&
    (Boolean(node.data?.workflowEmotionAdjustmentSettings) ||
      looksLikeEmotionAdjustmentNode) &&
    !mediaUrl;

  if (
    mediaUrl &&
    isRenderableWorkflowMediaUrl(mediaUrl) &&
    node.kind === "image"
  ) {
    const useOriginalImageUrl =
      priority || isWorkflowImageGeneratorResultNode(node);
    return (
      <div className="relative h-full w-full overflow-hidden rounded-2xl">
        {generationRunning ? (
          <WorkflowImageGenerationPlaceholder
            progress={generationProgress ?? 0}
            label={imageGenerationLabel || "图片生成中"}
          />
        ) : useOriginalImageUrl ? (
          <img
            src={getWorkflowImageRenderUrl(mediaUrl)}
            alt=""
            decoding="async"
            loading="eager"
            draggable={false}
            className={`h-full w-full rounded-2xl ${mediaFitClass}`}
          />
        ) : (
          <WorkflowZoomAwareImage
            node={node}
            mediaUrl={mediaUrl}
            mediaFitClass={mediaFitClass}
          />
        )}
        {redrawRunning ? <WorkflowImageLoadingSweep /> : null}
        {generationError && !generationRunning ? (
          <WorkflowGenerationErrorState error={generationError} overlay />
        ) : null}
      </div>
    );
  }

  if (
    mediaUrl &&
    isRenderableWorkflowMediaUrl(mediaUrl) &&
    node.kind === "video"
  ) {
    const posterUrl =
      String(
        node.data?.thumbnailUrl ||
          node.data?.workflowStoryboardVideoFirstFrameUrl ||
          node.data?.workflowStoryboardVideoTailFrameUrl ||
          "",
      ).trim() || getWorkflowVideoPosterUrl(mediaUrl);
    return (
      <div className="relative h-full w-full overflow-hidden rounded-2xl">
        {posterUrl ? (
          <img
            src={getWorkflowImageRenderUrl(posterUrl)}
            alt=""
            draggable={false}
            className={`h-full w-full rounded-2xl ${mediaFitClass}`}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-2xl bg-black">
            <TapNowNodeIcon kind="video" size={48} opacity={0.26} />
          </div>
        )}
        {redrawRunning ? (
          <WorkflowVideoGenerationPlaceholder
            title={String(node.data?.note || "裁剪中...")}
          />
        ) : null}
        {generationError && !generationRunning ? (
          <WorkflowGenerationErrorState error={generationError} overlay />
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {generationError && !generationRunning ? (
        <WorkflowGenerationErrorState error={generationError} />
      ) : (generationRunning && node.kind === "image") ||
        isEmotionAdjustmentGeneratorNode ? (
        <WorkflowImageGenerationPlaceholder
          progress={generationProgress ?? 0}
          label={imageGenerationLabel || "情绪调节生成中"}
        />
      ) : generationRunning && node.kind === "video" ? (
        <WorkflowVideoGenerationPlaceholder
          title={videoGenerationTitle}
          progress={generationProgress}
        />
      ) : isImageUpscaleNode ? (
        <ImageUpscaleEmptyState prompt={String(node.data?.prompt || "")} />
      ) : node.kind === "image" && node.data?.mediaRole === "generator" ? (
        <ImageGeneratorEmptyState
          onImageToImageClick={onImageToImageClick}
          onUpscaleClick={onImageUpscaleClick}
        />
      ) : isVideoGeneratorNode ? (
        <VideoGeneratorEmptyState
          onStartEndClick={onVideoStartEndClick}
          onFirstFrameClick={onVideoFirstFrameClick}
        />
      ) : (
        <TapNowNodeIcon kind={node.kind} size={48} opacity={0.2} />
      )}
      {node.kind === "video" &&
      node.data?.componentType === "video-generator" &&
      String(node.data?.videoMethod || "") === "upscale" &&
      !generationRunning ? (
        <span className="absolute bottom-6 left-1/2 w-full -translate-x-1/2 px-6 text-center text-sm text-white/42">
          配置参数生成高清视频
        </span>
      ) : null}
      {redrawRunning && node.kind === "video" ? (
        <WorkflowVideoGenerationPlaceholder
          title={String(node.data?.note || "裁剪中...")}
        />
      ) : null}
    </div>
  );
}

export function WorkflowImageGeneratorResultStrip({
  node,
  results,
  collapsed,
  onUpdateNode,
}: {
  node: LibTvWorkflowNode;
  results: LibTvWorkflowImageResult[];
  collapsed: boolean;
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
}) {
  const mediaUrl = String(node.data?.mediaUrl || "").trim();
  const aspectRatio = String(node.data?.aspectRatio || "16:9");
  const primaryIndex = Math.max(
    0,
    results.findIndex((item) => item.url === mediaUrl),
  );
  const primaryItem = results[primaryIndex] || results[0];
  const orderedResults = (
    primaryItem
      ? [primaryItem, ...results.filter((_, index) => index !== primaryIndex)]
      : results
  ).slice(0, 4);
  const frame = getWorkflowImageResultDisplayFrameFromItem(
    primaryItem,
    aspectRatio,
  );
  const width = Math.max(1, Number(node.width || frame.width));
  const height = Math.max(1, Number(node.height || frame.height));
  const gap = 8;
  const safeTitle = String(node.data?.title || "图片节点").trim() || "图片节点";

  const setPrimary = useCallback(
    (item: LibTvWorkflowImageResult) => {
      if (!item.url) return;
      onUpdateNode?.(node.id, {
        mediaUrl: item.url,
        workflowMediaNaturalWidth: item.width,
        workflowMediaNaturalHeight: item.height,
        workflowImageResultsCollapsed: false,
        workflowMediaUserResized: false,
      });
    },
    [node.id, onUpdateNode],
  );

  const downloadItem = useCallback(
    (item: LibTvWorkflowImageResult, index: number) => {
      const url = String(item.url || "").trim();
      if (!url) return;
      const name = `${safeTitle}-${index + 1}.png`;
      triggerBrowserDownload(resolveImageDownloadUrl(url), name);
    },
    [safeTitle],
  );

  if (!primaryItem?.url) return null;

  if (collapsed) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-xl">
        <img
          src={getWorkflowImageRenderUrl(primaryItem.url)}
          alt=""
          decoding="async"
          loading="eager"
          draggable={false}
          className="h-full w-full rounded-xl object-cover"
        />
        {results.length > 1 ? (
          <button
            type="button"
            className="nodrag nopan pointer-events-auto absolute right-2 top-2 z-20 flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1.5 text-[13px] text-white transition-colors hover:bg-black/78"
            title={`展开 ${results.length} 张图片`}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={(event) => {
              event.stopPropagation();
              onUpdateNode?.(node.id, { workflowImageResultsCollapsed: false });
            }}
          >
            <ExpandCornersLargeIcon />
            <span>{results.length}张</span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-visible rounded-xl">
      <div
        className="absolute inset-0 rounded-xl"
        style={{
          background: "var(--Surface-Panel-background, #171717)",
          border: "1px solid var(--canvas-node-border)",
          transition: "box-shadow 0.2s, border-color 0.15s",
        }}
      />
      {orderedResults.map((item, index) => {
        const isPrimary = item.url === primaryItem.url;
        return (
          <div
            key={`${item.url}-${index}`}
            className="absolute overflow-hidden rounded-xl"
            style={{
              left: index * (width + gap),
              top: 0,
              width,
              height,
              zIndex: isPrimary ? 2 : 1,
              border: "1px solid var(--canvas-node-border)",
              cursor: "pointer",
              background: "var(--Surface-Panel-background, #171717)",
            }}
          >
            <img
              src={getWorkflowImageRenderUrl(item.url)}
              alt={item.title || ""}
              decoding="async"
              loading={index === 0 ? "eager" : "lazy"}
              draggable={false}
              className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-2">
              <button
                type="button"
                data-auth-download-trigger="true"
                className="nodrag nopan pointer-events-auto flex items-center justify-center gap-1 rounded-lg bg-black/65 p-2 text-[13px] text-white transition-colors hover:bg-black/78 disabled:opacity-60"
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onClick={(event) => {
                  event.stopPropagation();
                  downloadItem(item, index);
                }}
              >
                <DownloadIcon />
                <span>下载</span>
              </button>
              {isPrimary ? (
                <button
                  type="button"
                  className="nodrag nopan pointer-events-auto flex items-center justify-center gap-1 rounded-lg bg-black/65 p-2 text-[13px] text-white transition-colors hover:bg-black/78"
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onClick={(event) => {
                    event.stopPropagation();
                    onUpdateNode?.(node.id, {
                      workflowImageResultsCollapsed: true,
                      mediaUrl: item.url,
                    });
                  }}
                >
                  <ExpandCornersLargeIcon />
                  <span>收起</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="nodrag nopan pointer-events-auto flex items-center justify-center rounded-lg bg-black/65 p-2 text-[13px] text-white transition-colors hover:bg-black/78"
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPrimary(item);
                  }}
                >
                  设为主图
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function OrdinaryVideoPlayer({
  mediaUrl,
  posterUrl: posterUrlProp = "",
  initialDuration = 0,
  initialVolume = 0.5,
  hasAudio = true,
  loadingLabel = "",
  loadingProgress,
  onReplaceClick,
  onMetadataLoaded,
  onVolumeChange,
  onCaptureFrame,
  active = false,
  dragging = false,
  fitMode = "cover",
  variant = "canvas",
  disableFrameCapture = false,
}: {
  mediaUrl: string;
  posterUrl?: string;
  initialDuration?: number;
  initialVolume?: number;
  hasAudio?: boolean;
  loadingLabel?: string;
  loadingProgress?: number;
  onReplaceClick?: () => void;
  onMetadataLoaded?: (metadata: {
    width: number;
    height: number;
    duration?: number;
  }) => void;
  onVolumeChange?: (volume: number) => void;
  onCaptureFrame?: (dataUrl: string, label: "首帧" | "尾帧" | "当前帧") => void;
  active?: boolean;
  dragging?: boolean;
  fitMode?: "cover" | "contain";
  variant?: "canvas" | "assetboard";
  disableFrameCapture?: boolean;
}) {
  const safeMediaUrl = isRenderableWorkflowMediaUrl(mediaUrl)
    ? toVideoDisplayUrl(mediaUrl)
    : "";
  const persistedPlaybackUrl = isPersistedWorkflowVideoUrl(mediaUrl);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoPoolTokenRef = useRef(Symbol("workflow-inline-video"));
  const posterProbeTimeRef = useRef(0);
  const posterCaptureCancelRef = useRef<(() => void) | null>(null);
  const posterCapturePendingRef = useRef(false);
  const capturedPosterObjectUrlRef = useRef("");
  const initialDurationRef = useRef(initialDuration);
  const initialVolumeRef = useRef(initialVolume);
  const normalizedInitialDuration =
    Number.isFinite(initialDuration) && initialDuration > 0
      ? initialDuration
      : 0;
  const normalizedInitialVolume = clampWorkflowNumber(initialVolume, 0, 1);
  const [duration, setDuration] = useState(normalizedInitialDuration);
  const [hasLoadedMetadata, setHasLoadedMetadata] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoLeaseGranted, setVideoLeaseGranted] = useState(false);
  const [manualPlaybackActive, setManualPlaybackActive] = useState(false);
  const [volume, setVolume] = useState(normalizedInitialVolume);
  const [muted, setMuted] = useState(normalizedInitialVolume === 0);
  const hoverActivationTimerRef = useRef<number | null>(null);
  const [hoverActive, setHoverActive] = useState(false);
  const [capturedPosterUrl, setCapturedPosterUrl] = useState("");
  const [hasPlayableFrame, setHasPlayableFrame] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [captureMenuOpen, setCaptureMenuOpen] = useState(false);
  const volumePersistTimerRef = useRef<number | null>(null);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = Math.max(
    0,
    Math.min(safeDuration || currentTime || 0, currentTime || 0),
  );
  const progress =
    safeDuration > 0
      ? Math.max(0, Math.min(100, (safeCurrentTime / safeDuration) * 100))
      : 0;
  const isAtEnd = safeDuration > 0 && safeCurrentTime >= safeDuration - 0.05;
  const posterUrl =
    String(posterUrlProp || capturedPosterUrl || "").trim() ||
    (mediaUrl ? getWorkflowVideoPosterUrl(mediaUrl) : "");
  // Only a granted lease mounts a real video element. The global pool releases
  // all active leases synchronously while the canvas is moving, without
  // subscribing every video node to viewport state.
  const playbackActive = active || hoverActive || manualPlaybackActive;
  const manualPlaybackOverrideRef = useRef(false);
  const playbackRequestInFlightRef = useRef(false);
  // A persisted/exported duration only seeds the timeline; it must not claim
  // that a real media frame has decoded.
  const videoReady = hasLoadedMetadata || hasPlayableFrame;
  const videoMounted = Boolean(safeMediaUrl) && videoLeaseGranted;
  const videoControlsReady =
    Boolean(safeMediaUrl) &&
    !loadError &&
    (videoReady || safeDuration > 0 || Boolean(posterUrl));
  const showVideoLayer =
    videoMounted &&
    !dragging &&
    !loadError &&
    (playing || safeCurrentTime > 0 || hasPlayableFrame);
  const showInitialLoading =
    Boolean(safeMediaUrl) && !posterUrl && !hasPlayableFrame && !loadError;
  const fitClassName =
    fitMode === "contain" ? "object-contain" : "object-cover";
  const roundedClassName =
    variant === "assetboard" ? "rounded-[12px]" : "rounded-2xl";
  const requestPlayback = useCallback((video: HTMLVideoElement) => {
    if (
      isWorkflowViewportMovingFromElement(video) ||
      playbackRequestInFlightRef.current ||
      !video.paused
    )
      return;
    playbackRequestInFlightRef.current = true;
    void video
      .play()
      .then(() => {
        manualPlaybackOverrideRef.current = false;
        setPlaying(true);
      })
      .catch(() => {
        // Chrome can reject the first play() while the source is still loading.
        // onCanPlay retries as long as the user did not explicitly pause.
        setPlaying(false);
      })
      .finally(() => {
        playbackRequestInFlightRef.current = false;
      });
  }, []);

  const activateOnHover = useCallback(() => {
    if (hoverActivationTimerRef.current !== null)
      window.clearTimeout(hoverActivationTimerRef.current);
    hoverActivationTimerRef.current = window.setTimeout(() => {
      hoverActivationTimerRef.current = null;
      setHoverActive(true);
    }, 300);
  }, []);

  const deactivateHover = useCallback(() => {
    if (hoverActivationTimerRef.current !== null) {
      window.clearTimeout(hoverActivationTimerRef.current);
      hoverActivationTimerRef.current = null;
    }
    setHoverActive(false);
  }, []);

  useEffect(
    () => () => {
      if (hoverActivationTimerRef.current !== null)
        window.clearTimeout(hoverActivationTimerRef.current);
      if (volumePersistTimerRef.current !== null)
        window.clearTimeout(volumePersistTimerRef.current);
      workflowInlineVideoPool.cancel(videoPoolTokenRef.current, false);
    },
    [],
  );

  useEffect(() => {
    // A source replacement must not leave the old lease occupying a decoder
    // until its fifteen-second timeout.
    workflowInlineVideoPool.cancel(videoPoolTokenRef.current, false);
    posterCaptureCancelRef.current?.();
    posterCaptureCancelRef.current = null;
    posterCapturePendingRef.current = false;
    if (capturedPosterObjectUrlRef.current) {
      URL.revokeObjectURL(capturedPosterObjectUrlRef.current);
      capturedPosterObjectUrlRef.current = "";
    }
    setCurrentTime(0);
    const resetDuration =
      Number.isFinite(initialDurationRef.current) &&
      initialDurationRef.current > 0
        ? initialDurationRef.current
        : 0;
    const resetVolume = clampWorkflowNumber(initialVolumeRef.current, 0, 1);
    setDuration(resetDuration);
    setHasLoadedMetadata(false);
    playbackRequestInFlightRef.current = false;
    setPlaying(false);
    setVideoLeaseGranted(false);
    setManualPlaybackActive(false);
    setCapturedPosterUrl("");
    setVolume(resetVolume);
    setMuted(resetVolume === 0);
    setHasPlayableFrame(false);
    setLoadError(false);
    setCaptureMenuOpen(false);
    posterProbeTimeRef.current = 0;
    return () => {
      posterCaptureCancelRef.current?.();
      posterCaptureCancelRef.current = null;
      posterCapturePendingRef.current = false;
      if (capturedPosterObjectUrlRef.current) {
        URL.revokeObjectURL(capturedPosterObjectUrlRef.current);
        capturedPosterObjectUrlRef.current = "";
      }
    };
  }, [safeMediaUrl]);

  useEffect(() => {
    if (normalizedInitialDuration > 0) setDuration(normalizedInitialDuration);
  }, [normalizedInitialDuration]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = normalizedInitialVolume;
      video.muted = normalizedInitialVolume === 0;
    }
    setVolume(normalizedInitialVolume);
    setMuted(normalizedInitialVolume === 0);
  }, [normalizedInitialVolume]);

  useEffect(() => {
    if (!dragging) return;
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setPlaying(false);
  }, [dragging]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || dragging) return;
    if (playbackActive) {
      if (manualPlaybackOverrideRef.current) return;
      requestPlayback(video);
      return;
    }
    manualPlaybackOverrideRef.current = false;
    video.pause();
    setPlaying(false);
  }, [dragging, playbackActive, requestPlayback, videoMounted]);

  useEffect(() => {
    updateWorkflowInlineVideoPool(
      videoPoolTokenRef.current,
      () => setVideoLeaseGranted(true),
      () => {
        const video = videoRef.current;
        video?.pause();
        setPlaying(false);
        setManualPlaybackActive(false);
        setVideoLeaseGranted(false);
        setHasLoadedMetadata(false);
        setHasPlayableFrame(false);
      },
      () => {
        videoRef.current?.pause();
        setPlaying(false);
      },
      () => {
        const video = videoRef.current;
        if (!video || manualPlaybackOverrideRef.current || !playbackActive)
          return;
        window.requestAnimationFrame(() => {
          if (
            videoRef.current !== video ||
            manualPlaybackOverrideRef.current ||
            !playbackActive
          )
            return;
          requestPlayback(video);
        });
      },
      manualPlaybackActive || (active && playing),
      Boolean(safeMediaUrl) &&
        !dragging &&
        (playbackActive || (!posterUrl && !capturedPosterUrl)),
    );
  }, [
    active,
    capturedPosterUrl,
    dragging,
    manualPlaybackActive,
    playbackActive,
    playing,
    posterUrl,
    requestPlayback,
    safeMediaUrl,
  ]);

  const togglePlayback = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!safeMediaUrl) return;
      const video = videoRef.current;
      if (!video) {
        setManualPlaybackActive(true);
        if (isAtEnd) setCurrentTime(0);
        setPlaying(true);
        return;
      }
      if (video.paused) {
        setManualPlaybackActive(true);
        manualPlaybackOverrideRef.current = false;
        if (isAtEnd || video.ended) {
          video.currentTime = 0;
          setCurrentTime(0);
        }
        setPlaying(true);
        requestPlayback(video);
      } else {
        setManualPlaybackActive(false);
        manualPlaybackOverrideRef.current = true;
        video.pause();
        setPlaying(false);
      }
    },
    [isAtEnd, requestPlayback, safeMediaUrl],
  );

  const seekVideo = useCallback(
    (value: number) => {
      const video = videoRef.current;
      const bounded = Math.max(
        0,
        Math.min(safeDuration || video?.duration || 0, value),
      );
      if (video) video.currentTime = bounded;
      setCurrentTime(bounded);
    },
    [safeDuration],
  );

  const updateVolume = useCallback(
    (value: number) => {
      const nextVolume = clampWorkflowNumber(value, 0, 1);
      const video = videoRef.current;
      if (video) {
        video.volume = nextVolume;
        video.muted = nextVolume === 0;
      }
      setVolume(nextVolume);
      setMuted(nextVolume === 0);
      if (volumePersistTimerRef.current !== null)
        window.clearTimeout(volumePersistTimerRef.current);
      volumePersistTimerRef.current = window.setTimeout(() => {
        volumePersistTimerRef.current = null;
        onVolumeChange?.(nextVolume);
      }, 200);
    },
    [onVolumeChange],
  );

  const toggleMuted = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const video = videoRef.current;
      if (!muted) {
        if (video) video.muted = true;
        setMuted(true);
        onVolumeChange?.(0);
        return;
      }
      const restoredVolume = volume > 0 ? volume : 0.5;
      if (video) {
        video.volume = restoredVolume;
        video.muted = false;
      }
      setVolume(restoredVolume);
      setMuted(false);
      onVolumeChange?.(restoredVolume);
    },
    [muted, onVolumeChange, volume],
  );

  const captureFrameAt = useCallback(
    (event: React.MouseEvent, at: "first" | "last" | "current" = "current") => {
      event.stopPropagation();
      const video = videoRef.current;
      if (!video || !video.videoWidth || !video.videoHeight) return;
      const capture = (sourceVideo: HTMLVideoElement = video) => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = sourceVideo.videoWidth;
          canvas.height = sourceVideo.videoHeight;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/png");
          if (onCaptureFrame) {
            const label =
              at === "first" ? "首帧" : at === "last" ? "尾帧" : "当前帧";
            onCaptureFrame(dataUrl, label);
          } else {
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = "video-frame-" + Date.now() + ".png";
            link.click();
          }
        } catch (error) {
          console.warn("[Workflow video] frame capture failed", error);
        } finally {
          setCaptureMenuOpen(false);
        }
      };
      if (persistedPlaybackUrl) {
        const requestedTime =
          at === "current"
            ? video.currentTime
            : at === "first"
              ? 0
              : Math.max(0, (safeDuration || video.duration || 0) - 0.05);
        void (async () => {
          const proxyVideo = document.createElement("video");
          const waitForVideoEvent = (
            eventName: "loadedmetadata" | "loadeddata" | "seeked",
          ) =>
            new Promise<void>((resolve, reject) => {
              const timeout = window.setTimeout(
                () => reject(new Error("视频截帧读取超时")),
                15_000,
              );
              const cleanup = () => window.clearTimeout(timeout);
              proxyVideo.addEventListener(
                eventName,
                () => {
                  cleanup();
                  resolve();
                },
                { once: true },
              );
              proxyVideo.addEventListener(
                "error",
                () => {
                  cleanup();
                  reject(new Error("视频截帧读取失败"));
                },
                { once: true },
              );
            });
          try {
            proxyVideo.preload = "auto";
            proxyVideo.muted = true;
            proxyVideo.playsInline = true;
            proxyVideo.src = `/api/video-proxy?url=${encodeURIComponent(mediaUrl)}`;
            proxyVideo.load();
            if (proxyVideo.readyState < 1)
              await waitForVideoEvent("loadedmetadata");
            const boundedTime = Math.max(
              0,
              Math.min(
                Number.isFinite(proxyVideo.duration)
                  ? proxyVideo.duration
                  : requestedTime,
                requestedTime,
              ),
            );
            if (Math.abs(proxyVideo.currentTime - boundedTime) >= 0.02) {
              const seeked = waitForVideoEvent("seeked");
              proxyVideo.currentTime = boundedTime;
              await seeked;
            } else if (proxyVideo.readyState < 2) {
              await waitForVideoEvent("loadeddata");
            }
            capture(proxyVideo);
          } catch (error) {
            console.warn(
              "[Workflow video] proxied frame capture failed",
              error,
            );
            setCaptureMenuOpen(false);
          } finally {
            proxyVideo.pause();
            proxyVideo.removeAttribute("src");
            proxyVideo.load();
          }
        })();
        return;
      }
      if (at === "current") {
        capture();
        return;
      }
      const targetTime =
        at === "first"
          ? 0
          : Math.max(0, (safeDuration || video.duration || 0) - 0.05);
      if (Math.abs(video.currentTime - targetTime) < 0.02) {
        capture();
        return;
      }
      video.addEventListener("seeked", () => capture(), { once: true });
      video.currentTime = targetTime;
    },
    [mediaUrl, onCaptureFrame, persistedPlaybackUrl, safeDuration],
  );

  const captureInlinePoster = useCallback(
    (video: HTMLVideoElement) => {
      if (
        posterUrlProp ||
        capturedPosterUrl ||
        capturedPosterObjectUrlRef.current ||
        posterCapturePendingRef.current ||
        !video.videoWidth ||
        !video.videoHeight
      )
        return;
      posterCapturePendingRef.current = true;
      posterProbeTimeRef.current = 0;
      let cancelTask: () => void = () => undefined;
      cancelTask = enqueueWorkflowInlinePosterCapture(async (isCancelled) => {
        let canvas: HTMLCanvasElement | null = null;
        try {
          if (isCancelled() || videoRef.current !== video) return;
          const size = getWorkflowInlinePosterCanvasSize(
            video.videoWidth,
            video.videoHeight,
          );
          canvas = document.createElement("canvas");
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(video, 0, 0, size.width, size.height);
          const blob = await new Promise<Blob | null>((resolve) => {
            canvas?.toBlob(resolve, "image/jpeg", 0.82);
          });
          if (!blob || isCancelled() || videoRef.current !== video) return;
          const nextPosterUrl = URL.createObjectURL(blob);
          if (isCancelled() || videoRef.current !== video) {
            URL.revokeObjectURL(nextPosterUrl);
            return;
          }
          if (capturedPosterObjectUrlRef.current) {
            URL.revokeObjectURL(capturedPosterObjectUrlRef.current);
          }
          capturedPosterObjectUrlRef.current = nextPosterUrl;
          setCapturedPosterUrl(nextPosterUrl);
          if (video.paused && video.currentTime > 0) {
            video.currentTime = 0;
            setCurrentTime(0);
          }
        } catch {
          // Cross-origin videos that cannot be sampled still render through the paused video element.
        } finally {
          if (canvas) {
            canvas.width = 1;
            canvas.height = 1;
          }
          if (posterCaptureCancelRef.current === cancelTask) {
            posterCaptureCancelRef.current = null;
            posterCapturePendingRef.current = false;
          }
        }
      });
      posterCaptureCancelRef.current = cancelTask;
    },
    [capturedPosterUrl, posterUrlProp],
  );

  const scheduleInlinePosterCapture = useCallback(
    (video: HTMLVideoElement) => {
      if (
        posterUrlProp ||
        capturedPosterUrl ||
        playing ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      )
        return;
      const sampleTime = Math.max(0.12, Math.min(0.8, video.duration * 0.08));
      if (Math.abs(video.currentTime - sampleTime) < 0.03) {
        captureInlinePoster(video);
        return;
      }
      posterProbeTimeRef.current = sampleTime;
      try {
        video.currentTime = sampleTime;
      } catch {
        captureInlinePoster(video);
      }
    },
    [captureInlinePoster, capturedPosterUrl, playing, posterUrlProp],
  );

  return (
    <div
      className={`workflow-media-node node-shell nowheel nopan relative h-full w-full overflow-hidden bg-black ${roundedClassName}`}
      onMouseEnter={activateOnHover}
      onMouseLeave={deactivateHover}
    >
      {posterUrl ? (
        <img
          src={getWorkflowImageRenderUrl(posterUrl)}
          alt=""
          draggable={false}
          className={`absolute inset-0 h-full w-full transition-opacity duration-150 ${roundedClassName} ${fitClassName} ${showVideoLayer ? "opacity-0" : "opacity-100"}`}
          data-testid={videoMounted ? undefined : "canvas-node-video-content"}
        />
      ) : null}
      {videoMounted ? (
        <video
          ref={videoRef}
          src={safeMediaUrl || undefined}
          preload={playbackActive ? "auto" : "metadata"}
          playsInline
          crossOrigin={persistedPlaybackUrl ? undefined : "anonymous"}
          muted={muted}
          draggable={false}
          className={`pointer-events-none nowheel absolute inset-0 h-full w-full transition-opacity duration-300 ${roundedClassName} ${fitClassName} ${showVideoLayer ? "opacity-100" : "opacity-0"}`}
          data-testid="canvas-node-video-content"
          onLoadedMetadata={(event) => {
            setLoadError(false);
            setHasLoadedMetadata(true);
            const nextDuration = event.currentTarget.duration;
            const rawMetadataWidth = Math.round(
              event.currentTarget.videoWidth || 0,
            );
            const rawMetadataHeight = Math.round(
              event.currentTarget.videoHeight || 0,
            );
            if (rawMetadataWidth > 0 && rawMetadataHeight > 0) {
              onMetadataLoaded?.({
                width: rawMetadataWidth,
                height: rawMetadataHeight,
                duration: Number.isFinite(nextDuration)
                  ? nextDuration
                  : undefined,
              });
            }
            if (currentTime > 0)
              event.currentTarget.currentTime = Math.min(
                currentTime,
                Number.isFinite(nextDuration) ? nextDuration : currentTime,
              );
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
            setCurrentTime(event.currentTarget.currentTime || currentTime || 0);
            event.currentTarget.volume = volume;
            event.currentTarget.muted = muted;
            if (!posterUrlProp && !capturedPosterUrl && !playing) {
              scheduleInlinePosterCapture(event.currentTarget);
            }
            if (
              !isWorkflowViewportMovingFromElement(event.currentTarget) &&
              playbackActive &&
              !manualPlaybackOverrideRef.current
            )
              requestPlayback(event.currentTarget);
          }}
          onLoadedData={(event) => {
            setHasPlayableFrame(true);
            setLoadError(false);
            if (posterProbeTimeRef.current > 0) return;
            scheduleInlinePosterCapture(event.currentTarget);
          }}
          onCanPlay={(event) => {
            setHasPlayableFrame(true);
            setLoadError(false);
            if (posterProbeTimeRef.current > 0) return;
            scheduleInlinePosterCapture(event.currentTarget);
            if (
              !isWorkflowViewportMovingFromElement(event.currentTarget) &&
              playbackActive &&
              !manualPlaybackOverrideRef.current &&
              event.currentTarget.paused
            )
              requestPlayback(event.currentTarget);
          }}
          onSeeked={(event) => {
            if (posterProbeTimeRef.current > 0 && !playing) {
              captureInlinePoster(event.currentTarget);
            }
          }}
          onTimeUpdate={(event) => {
            if (isWorkflowViewportMovingFromElement(event.currentTarget))
              return;
            setCurrentTime(event.currentTarget.currentTime || 0);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={(event) => {
            event.currentTarget.currentTime = 0;
            setCurrentTime(0);
            setPlaying(false);
            setManualPlaybackActive(false);
          }}
          onError={() => {
            setLoadError(true);
            setPlaying(false);
            setManualPlaybackActive(false);
          }}
        />
      ) : !posterUrl ? (
        <div
          className={`h-full w-full bg-black ${roundedClassName}`}
          data-testid="canvas-node-video-content"
        />
      ) : null}
      {showInitialLoading ? (
        <WorkflowVideoGenerationPlaceholder
          title="视频加载中"
          variant="overlay"
        />
      ) : null}
      {loadError ? (
        <WorkflowVideoGenerationPlaceholder
          title="视频暂时无法预览"
          variant="overlay"
        />
      ) : null}
      {videoControlsReady ? (
        <div
          data-playlist-panel-block-canvas-nav="true"
          className="workflow-media-controls nodrag nopan nowheel absolute bottom-0 left-0 right-0 z-20"
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
        >
          <div
            className={`pointer-events-none absolute bottom-0 left-0 right-0 h-20 ${variant === "assetboard" ? "rounded-b-[12px]" : "rounded-b-2xl"}`}
            style={{
              background:
                "linear-gradient(to bottom, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.5))",
            }}
          />
          <div className="relative flex items-center gap-2 px-3 pb-2.5 pt-8">
            <button
              type="button"
              className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full p-0 text-white transition-colors hover:bg-black/50 disabled:cursor-not-allowed disabled:opacity-45"
              aria-label={playing ? "pause" : "play"}
              disabled={!safeMediaUrl}
              onClick={togglePlayback}
            >
              <WorkflowVideoPlayerPlayIcon playing={playing} />
            </button>
            <span className="shrink-0 text-xs text-white tabular-nums">
              {formatWorkflowVideoPlayerTime(safeCurrentTime)}
            </span>
            <div className="relative flex h-[14px] flex-1 items-center">
              <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/30">
                <div
                  className="absolute left-0 top-0 h-full rounded-full bg-white"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={safeDuration || 0}
                step={0.1}
                value={safeDuration ? safeCurrentTime : 0}
                disabled={!safeDuration}
                aria-label="视频进度"
                className="nodrag nopan nowheel relative z-10 h-[14px] w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed disabled:opacity-45 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.3)] [&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:mt-[-3.5px] [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onChange={(event) =>
                  seekVideo(Number(event.currentTarget.value))
                }
                onClick={stopWorkflowNodeChromeEvent}
              />
            </div>
            <span className="shrink-0 text-xs text-white tabular-nums">
              {safeDuration > 0
                ? formatWorkflowVideoPlayerTime(safeDuration)
                : "--:--"}
            </span>
            {hasAudio ? (
              <WorkflowVideoVolumeControl
                volume={volume}
                muted={muted}
                onVolumeChange={updateVolume}
                onToggleMute={toggleMuted}
              />
            ) : null}
            {!disableFrameCapture ? (
              <div
                className="relative"
                onMouseEnter={() => setCaptureMenuOpen(true)}
                onMouseLeave={() => setCaptureMenuOpen(false)}
              >
                <div
                  className={`absolute bottom-full right-0 z-30 flex justify-end pb-2 transition-opacity ${captureMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
                >
                  <div className="flex flex-col gap-1 overflow-hidden rounded-xl border border-white/10 bg-[rgba(26,26,26,0.95)] p-1 shadow-[0px_4px_10px_rgba(0,0,0,0.25),0px_2px_4px_rgba(0,0,0,0.1)] backdrop-blur-lg">
                    {(
                      [
                        ["first", "截取首帧"],
                        ["last", "截取尾帧"],
                        ["current", "截取当前帧"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className="flex h-8 w-full items-center whitespace-nowrap rounded-lg px-2 text-left text-[13px] text-white/90 transition-colors hover:bg-white/10"
                        onClick={(event) => captureFrameAt(event, value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full p-0 text-white transition-colors hover:bg-black/50 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label="截帧"
                  aria-expanded={captureMenuOpen}
                  disabled={!safeDuration || !videoMounted}
                  onClick={(event) => captureFrameAt(event, "current")}
                >
                  <Camera className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {onReplaceClick ? (
        <button
          type="button"
          className="nodrag nopan nowheel absolute right-2 top-2 z-20 flex size-9 cursor-pointer items-center justify-center rounded-lg bg-black/65 text-white opacity-0 shadow-sm transition-opacity hover:bg-black/75 group-hover:opacity-100"
          aria-label="替换"
          title="替换"
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={(event) => {
            event.stopPropagation();
            onReplaceClick();
          }}
        >
          <WorkflowResourceReuploadIcon />
        </button>
      ) : null}
      {loadingLabel ? (
        <WorkflowVideoGenerationPlaceholder
          title={loadingLabel}
          progress={loadingProgress}
          variant="overlay"
        />
      ) : null}
    </div>
  );
}

export function WorkflowMediaFullscreenPreview({
  kind,
  mediaUrl,
  initialTime = 0,
  initialVolume = 0.5,
  hasAudio = true,
  onTimeUpdate,
  onClose,
}: {
  kind: "image" | "video";
  mediaUrl: string;
  initialTime?: number;
  initialVolume?: number;
  hasAudio?: boolean;
  onTimeUpdate?: (time: number) => void;
  onClose: () => void;
}) {
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const safeUrl =
    kind === "video"
      ? toVideoDisplayUrl(mediaUrl)
      : getWorkflowImageRenderUrl(mediaUrl);
  const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);
  const fullscreenContainerRef = useRef<HTMLDivElement | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(kind === "video");
  const [videoCurrentTime, setVideoCurrentTime] = useState(
    Math.max(0, initialTime),
  );
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(
    clampWorkflowNumber(initialVolume, 0, 1),
  );
  const [videoMuted, setVideoMuted] = useState(false);
  const [videoRate, setVideoRate] = useState(1);
  const [browserFullscreen, setBrowserFullscreen] = useState(false);

  const scheduleChromeHide = useCallback(() => {
    if (kind !== "video") return;
    setChromeHidden(false);
    if (idleTimerRef.current !== null)
      window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      setChromeHidden(true);
    }, 3000);
  }, [kind]);

  useEffect(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
    setVideoCurrentTime(Math.max(0, initialTime));
    setVideoDuration(0);
    setVideoPlaying(kind === "video");
  }, [mediaUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    scheduleChromeHide();
    const handleFullscreenChange = () =>
      setBrowserFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (idleTimerRef.current !== null)
        window.clearTimeout(idleTimerRef.current);
    };
  }, [scheduleChromeHide]);

  const toggleFullscreenVideoPlayback = useCallback(() => {
    const video = fullscreenVideoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => setVideoPlaying(false));
    } else {
      video.pause();
    }
  }, []);

  const seekFullscreenVideo = useCallback(
    (value: number) => {
      const video = fullscreenVideoRef.current;
      if (!video) return;
      const bounded = Math.max(
        0,
        Math.min(videoDuration || video.duration || 0, value),
      );
      video.currentTime = bounded;
      setVideoCurrentTime(bounded);
    },
    [videoDuration],
  );

  const toggleBrowserFullscreen = useCallback(() => {
    const container = fullscreenContainerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void container.requestFullscreen?.();
    }
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="nodrag nopan nowheel fixed inset-0 z-[10000] flex items-center justify-center bg-black/80"
      data-image-preview-overlay=""
      onMouseMove={scheduleChromeHide}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={onClose}
    >
      <div
        ref={fullscreenContainerRef}
        className={
          "relative flex max-h-[90vh] max-w-[85vw] flex-col items-center gap-4 bg-black " +
          (kind === "video" && chromeHidden ? "cursor-none" : "")
        }
        onClick={stopWorkflowNodeChromeEvent}
      >
        <button
          type="button"
          className={
            "absolute -right-3 -top-3 z-30 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white/70 transition-opacity hover:bg-black/80 hover:text-white " +
            (kind === "video" && chromeHidden
              ? "pointer-events-none opacity-0"
              : "opacity-100")
          }
          aria-label="关闭预览"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
        <div className="h-[80vh] w-[85vw] rounded-lg">
          <div
            className="flex h-full w-full cursor-grab items-center justify-center overflow-hidden rounded-lg active:cursor-grabbing"
            style={{ touchAction: "none" }}
            onWheel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const delta = event.deltaY > 0 ? -0.12 : 0.12;
              setTransform((current) => ({
                ...current,
                scale: Math.max(
                  0.25,
                  Math.min(6, Number((current.scale + delta).toFixed(2))),
                ),
              }));
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setTransform({ x: 0, y: 0, scale: 1 });
            }}
            onPointerDown={(event) => {
              if (kind !== "image") return;
              event.preventDefault();
              event.stopPropagation();
              dragStateRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                x: transform.x,
                y: transform.y,
              };
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const state = dragStateRef.current;
              if (!state || state.pointerId !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              setTransform((current) => ({
                ...current,
                x: state.x + event.clientX - state.startX,
                y: state.y + event.clientY - state.startY,
              }));
            }}
            onPointerUp={(event) => {
              if (dragStateRef.current?.pointerId !== event.pointerId) return;
              dragStateRef.current = null;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
            }}
            onPointerCancel={() => {
              dragStateRef.current = null;
            }}
          >
            {kind === "video" ? (
              <div className="relative h-full w-full overflow-hidden rounded-lg bg-black">
                <video
                  ref={fullscreenVideoRef}
                  src={safeUrl || undefined}
                  autoPlay
                  playsInline
                  crossOrigin="anonymous"
                  muted={videoMuted}
                  className="h-full w-full rounded-lg object-contain"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFullscreenVideoPlayback();
                  }}
                  onLoadedMetadata={(event) => {
                    const nextDuration = event.currentTarget.duration;
                    setVideoDuration(
                      Number.isFinite(nextDuration) ? nextDuration : 0,
                    );
                    if (initialTime > 0)
                      event.currentTarget.currentTime = Math.min(
                        initialTime,
                        Number.isFinite(nextDuration)
                          ? nextDuration
                          : initialTime,
                      );
                    event.currentTarget.volume = videoVolume;
                    event.currentTarget.muted = videoMuted;
                  }}
                  onTimeUpdate={(event) => {
                    const nextTime = event.currentTarget.currentTime || 0;
                    setVideoCurrentTime(nextTime);
                    onTimeUpdate?.(nextTime);
                  }}
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)}
                  onEnded={() => setVideoPlaying(false)}
                />
                <div
                  className={
                    "absolute inset-x-0 bottom-0 z-20 flex flex-col gap-0 px-4 pb-3 pt-10 transition-opacity duration-300 " +
                    (chromeHidden
                      ? "pointer-events-none opacity-0"
                      : "opacity-100")
                  }
                  style={{
                    background:
                      "linear-gradient(to bottom, transparent, rgba(0, 0, 0, 0.7))",
                  }}
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onClick={stopWorkflowNodeChromeEvent}
                >
                  <div className="flex w-full items-center gap-3">
                    <button
                      type="button"
                      className="flex size-8 items-center justify-center rounded-full text-white hover:bg-white/20"
                      aria-label={videoPlaying ? "暂停" : "播放"}
                      onClick={toggleFullscreenVideoPlayback}
                    >
                      <WorkflowVideoPlayerPlayIcon playing={videoPlaying} />
                    </button>
                    <span className="text-sm text-white tabular-nums">
                      {formatWorkflowVideoPlayerTime(videoCurrentTime)} /{" "}
                      {videoDuration > 0
                        ? formatWorkflowVideoPlayerTime(videoDuration)
                        : "--:--"}
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                      <button
                        type="button"
                        className="flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-xs text-white hover:bg-white/20"
                        aria-label="播放速度"
                        onClick={() => {
                          const nextRate =
                            videoRate === 1
                              ? 1.5
                              : videoRate === 1.5
                                ? 2
                                : videoRate === 2
                                  ? 0.5
                                  : 1;
                          setVideoRate(nextRate);
                          if (fullscreenVideoRef.current)
                            fullscreenVideoRef.current.playbackRate = nextRate;
                        }}
                      >
                        {videoRate}x
                      </button>
                      {hasAudio ? (
                        <WorkflowVideoVolumeControl
                          volume={videoVolume}
                          muted={videoMuted}
                          onVolumeChange={(nextVolume) => {
                            setVideoVolume(nextVolume);
                            setVideoMuted(nextVolume === 0);
                            if (fullscreenVideoRef.current) {
                              fullscreenVideoRef.current.volume = nextVolume;
                              fullscreenVideoRef.current.muted =
                                nextVolume === 0;
                            }
                          }}
                          onToggleMute={(event) => {
                            event.stopPropagation();
                            setVideoMuted((current) => {
                              const nextMuted = !current;
                              if (fullscreenVideoRef.current)
                                fullscreenVideoRef.current.muted = nextMuted;
                              return nextMuted;
                            });
                          }}
                        />
                      ) : null}
                      <button
                        type="button"
                        className="flex size-8 items-center justify-center rounded-full text-white hover:bg-white/20"
                        aria-label={browserFullscreen ? "退出全屏" : "全屏"}
                        onClick={toggleBrowserFullscreen}
                      >
                        {browserFullscreen ? (
                          <Minimize2 className="size-4" />
                        ) : (
                          <Fullscreen className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={videoDuration || 0}
                    step={0.05}
                    value={
                      videoDuration > 0
                        ? Math.min(videoCurrentTime, videoDuration)
                        : 0
                    }
                    disabled={!videoDuration}
                    aria-label="全屏视频进度"
                    className="h-3 w-full cursor-pointer accent-white"
                    onChange={(event) =>
                      seekFullscreenVideo(Number(event.currentTarget.value))
                    }
                  />
                </div>
              </div>
            ) : (
              <img
                alt=""
                draggable={false}
                className="select-none"
                src={safeUrl}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                  transformOrigin: "center center",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export type WorkflowPanoramaShot = {
  suffix: string;
  yawDeg: number;
  pitchDeg?: number;
};

export type WorkflowPanoramaCaptureResult = WorkflowPanoramaShot & {
  dataUrl: string;
};

export type WorkflowPanoramaCaptureApi = {
  reset: () => void;
  capture: (shots: WorkflowPanoramaShot[]) => WorkflowPanoramaCaptureResult[];
  getViewAngles: () => { yaw: number; pitch: number };
};

export function PanoramaEntryIcon() {
  return (
    <svg
      width="14"
      height="14"
      fill="none"
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M1.48 7.624a.13.13 0 0 1 .198.112.14.14 0 0 1-.045.102c-.299.28-.465.588-.465.912 0 .99 1.543 1.835 3.718 2.174v-.88c0-.192.221-.301.375-.184l1.588 1.222a.35.35 0 0 1-.007.56L5.256 12.8a.233.233 0 0 1-.37-.189v-.565C2.218 11.662.294 10.569.293 9.28c0-.615.438-1.186 1.186-1.656m10.845.112a.13.13 0 0 1 .198-.112c.748.47 1.186 1.041 1.186 1.656 0 1.36-2.14 2.5-5.033 2.824a.2.2 0 0 1-.22-.198v-.716c0-.102.078-.188.18-.2 2.425-.283 4.197-1.179 4.198-2.24 0-.324-.166-.632-.465-.912a.14.14 0 0 1-.044-.102m-1.977-6.355a1.34 1.34 0 0 1 1.254.78q.174.356.174.797v4.294q0 .441-.174.804a1.37 1.37 0 0 1-.496.564 1.35 1.35 0 0 1-.758.21q-.456 0-.779-.21a1.35 1.35 0 0 1-.485-.564 1.9 1.9 0 0 1-.164-.804V2.958q0-.446.169-.803.172-.357.495-.565.323-.21.764-.21M4.622 2.532 3.551 8.75H2.44l1.09-6.229H1.925v-1.06h2.697zm2.073-1.151q.392 0 .665.13.274.128.442.366t.243.575q.08.333.079.744 0 .492-.148 1.062a9 9 0 0 1-.388 1.165q-.238.594-.535 1.175-.298.575-.605 1.09h1.696V8.75H5.238V7.688q.343-.525.664-1.105.323-.58.58-1.166a8 8 0 0 0 .417-1.14q.154-.55.154-1.011 0-.328-.065-.61-.064-.283-.293-.283-.227 0-.292.282a2.7 2.7 0 0 0-.064.61v.506h-1.07v-.505q-.001-.436.073-.784.079-.351.248-.595.169-.247.441-.376.273-.13.664-.13m3.653 1.042a.28.28 0 0 0-.273.168.8.8 0 0 0-.084.367v4.294q0 .213.084.377.084.159.273.16a.29.29 0 0 0 .273-.16.8.8 0 0 0 .084-.377V2.958a.8.8 0 0 0-.084-.377.29.29 0 0 0-.273-.158"
      />
    </svg>
  );
}

export function WorkflowResourceReuploadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 19.8008 19.8006"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.80078 16.9003C1.80087 17.1919 1.91684 17.4714 2.12305 17.6776C2.32932 17.8838 2.60874 17.9999 2.90039 17.9999H16.9004C17.192 17.9999 17.4715 17.8838 17.6777 17.6776C17.8839 17.4714 17.9999 17.1919 18 16.9003V11.9999H19.8008V16.9003C19.8007 17.6693 19.4949 18.4073 18.9512 18.951C18.4073 19.4948 17.6694 19.8006 16.9004 19.8006H2.90039C2.13135 19.8006 1.39345 19.4948 0.849609 18.951C0.305837 18.4073 9.33702e-05 17.6693 0 16.9003V11.9999H1.80078V16.9003ZM9.33203 0.202009C9.68553 -0.086443 10.2076 -0.0660213 10.5371 0.263533L16.1729 5.90025L14.9004 7.17271L10.8008 3.07408V13.8006H9V3.07408L4.90039 7.17271L3.62793 5.90025L9.26367 0.263533L9.33203 0.202009Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PanoramaExitIcon() {
  return (
    <svg
      width="14"
      height="14"
      fill="none"
      viewBox="0 0 14 14"
      className="h-4 w-4 shrink-0 opacity-90"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M5.08.824a.41.41 0 0 1-.412.411H2.08a.845.845 0 0 0-.845.845v9.569c0 .466.379.845.845.845h2.588c.228 0 .412.184.412.412v.411a.41.41 0 0 1-.412.412H2.08a2.08 2.08 0 0 1-2.077-1.973L0 11.65V2.08A2.08 2.08 0 0 1 2.08 0h2.588c.228 0 .412.184.412.412z"
      />
      <path
        fill="currentColor"
        d="M13.82 6.428a.62.62 0 0 1 0 .873l-4.564 4.563a.41.41 0 0 1-.582 0l-.292-.291a.41.41 0 0 1 0-.583l3.508-3.507H4.565a.41.41 0 0 1-.411-.412v-.413c0-.227.184-.412.411-.412h7.325L8.382 2.74a.41.41 0 0 1 0-.583l.292-.291c.16-.161.421-.161.582 0z"
      />
    </svg>
  );
}

export function PanoramaCameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M10.037 1.003c.414.026.795.243 1.026.59L12.002 3h1.8c.847 0 1.533.686 1.533 1.533v8.6l-.008.157a1.534 1.534 0 0 1-1.368 1.37l-.157.007H2.2A1.534 1.534 0 0 1 .676 13.29l-.008-.156v-8.6C.668 3.685 1.354 3 2.201 3h1.8l.937-1.406C5.186 1.223 5.602 1 6.048 1h3.906zM6.047 2.2a.13.13 0 0 0-.11.059L4.94 3.755a1 1 0 0 1-.832.445H2.201a.334.334 0 0 0-.334.333v8.6c0 .185.15.334.334.334h11.6c.184 0 .333-.15.334-.333v-8.6A.334.334 0 0 0 13.8 4.2h-1.906a1 1 0 0 1-.832-.445l-.998-1.496a.13.13 0 0 0-.11-.059zm1.954 3.133A3.334 3.334 0 1 1 8 12 3.334 3.334 0 0 1 8 5.333m0 1.2a2.134 2.134 0 1 0 0 4.268 2.134 2.134 0 0 0 0-4.268"
      />
    </svg>
  );
}

export function PanoramaFourShotIcon() {
  return (
    <svg
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12.666 1.4c1.067 0 1.933.866 1.934 1.933v9.334a1.934 1.934 0 0 1-1.934 1.934H3.332a1.934 1.934 0 0 1-1.934-1.934V3.333c0-1.067.867-1.933 1.934-1.934zM2.6 12.666c0 .405.327.732.732.732h4.066V8.601H2.6zm6 .732h4.066a.73.73 0 0 0 .732-.732V8.601H8.6zM3.332 2.601a.73.73 0 0 0-.732.732v4.066h4.798V2.601zM8.6 7.399h4.798V3.333a.73.73 0 0 0-.732-.732H8.6z"
      />
    </svg>
  );
}

export function PanoramaTwelveShotIcon() {
  return (
    <svg
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12.666 1.4c1.067 0 1.933.866 1.934 1.933v9.334a1.934 1.934 0 0 1-1.934 1.934H3.332a1.934 1.934 0 0 1-1.934-1.934V3.333c0-1.067.867-1.933 1.934-1.934zM2.6 12.666c0 .405.327.732.732.732h2.066v-1.798H2.6zm4 .732h2.798v-1.798H6.6zm4 0h2.066a.73.73 0 0 0 .732-.732v-1.066H10.6zm-8-3h2.798V8.601H2.6zm4 0h2.798V8.601H6.6zm4 0h2.798V8.601H10.6zm-8-3h2.798V5.601H2.6zm4 0h2.798V5.601H6.6zm4 0h2.798V5.601H10.6zM3.332 2.601a.73.73 0 0 0-.732.732v1.066h2.798V2.601zM6.6 4.399h2.798V2.601H6.6zm4 0h2.798V3.333a.73.73 0 0 0-.732-.732H10.6z"
      />
    </svg>
  );
}

export function PanoramaResetIcon() {
  return (
    <svg
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M13.897 9.358c.212.212.572.122.632-.172A6.667 6.667 0 0 0 2.757 3.718c-.12.153-.1.371.037.509l.276.276c.18.18.479.148.636-.052a5.467 5.467 0 0 1 9.612 2.127l-1.523.682zm-6.298 5.131c.22.014.4-.167.4-.388v-.4c0-.22-.18-.398-.4-.414A5.47 5.47 0 0 1 2.687 9.12l1.508-.673-2.1-2.093c-.214-.213-.574-.12-.633.175a6.668 6.668 0 0 0 6.138 7.962m3.292.003a.267.267 0 0 0 .5 0l.607-1.642a.27.27 0 0 1 .157-.158l1.643-.608a.267.267 0 0 0 0-.5l-1.643-.607a.27.27 0 0 1-.157-.158l-.607-1.642a.267.267 0 0 0-.5 0l-.609 1.642a.27.27 0 0 1-.157.158l-1.643.607a.267.267 0 0 0 0 .5l1.643.608c.073.027.13.085.157.158z"
      />
    </svg>
  );
}

export function PanoramaGridIcon() {
  return (
    <svg
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12.266 1.4a.6.6 0 0 1 .6.6v1.134h1.133a.6.6 0 1 1 0 1.199h-1.134v3.066H14a.601.601 0 0 1 0 1.202h-1.134v3.066H14a.6.6 0 1 1 0 1.2h-1.134V14a.6.6 0 1 1-1.199 0v-1.134H8.6V14a.601.601 0 0 1-1.202 0v-1.134H4.332V14a.6.6 0 1 1-1.2 0v-1.134H2a.6.6 0 1 1 0-1.199h1.134V8.601H1.999a.601.601 0 0 1 0-1.202h1.134V4.333H1.999a.6.6 0 1 1 0-1.2h1.134V2a.6.6 0 1 1 1.199 0v1.134h3.066V2A.601.601 0 0 1 8.6 2v1.134h3.066V2a.6.6 0 0 1 .6-.6M4.332 11.666h3.066V8.601H4.332zm4.268 0h3.066V8.601H8.6zM4.332 7.399h3.066V4.333H4.332zm4.268 0h3.066V4.333H8.6z"
      />
    </svg>
  );
}

export function PanoramaFullscreenIcon() {
  return (
    <svg
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M2.633 8c.22 0 .4.18.4.4v3.563L6.445 8.55a.4.4 0 0 1 .566 0l.283.283a.4.4 0 0 1 0 .565L3.96 12.733h3.405c.221 0 .4.18.4.4v.401a.4.4 0 0 1-.4.4H2.632a.8.8 0 0 1-.8-.8V8.4a.4.4 0 0 1 .4-.4zm10.266-5.934a.8.8 0 0 1 .8.801v4.734a.4.4 0 0 1-.4.399h-.4a.4.4 0 0 1-.4-.4V4.159L9.131 7.526a.4.4 0 0 1-.567 0l-.283-.283a.4.4 0 0 1 .001-.565l3.41-3.41H8.164a.4.4 0 0 1-.4-.4v-.401a.4.4 0 0 1 .4-.4z"
      />
    </svg>
  );
}

export function PanoramaToolbarButton({
  label,
  testId,
  onClick,
  children,
}: {
  label: string;
  testId?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-neutral-50 transition-colors hover:bg-white/10 canvas-light:text-canvas-controls-text canvas-light:hover:bg-black/5 disabled:pointer-events-none disabled:opacity-40"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function WorkflowInlinePanoramaPreview({
  imageUrl,
  initialYaw,
  initialPitch,
  onExit,
  onCaptureImages,
}: {
  imageUrl: string;
  initialYaw: number;
  initialPitch: number;
  onExit: (angles: { yaw: number; pitch: number }) => void;
  onCaptureImages?: (
    title: string,
    images: WorkflowPanoramaCaptureResult[],
  ) => void;
}) {
  const captureApiRef = useRef<WorkflowPanoramaCaptureApi | null>(null);
  const [showGuides, setShowGuides] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [currentView, setCurrentView] = useState({
    yaw: Number(initialYaw || 0),
    pitch: Number(initialPitch || 0),
  });

  useEffect(() => {
    setCurrentView({
      yaw: Number(initialYaw || 0),
      pitch: Number(initialPitch || 0),
    });
  }, [imageUrl, initialPitch, initialYaw]);

  useEffect(() => {
    if (!fullscreen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreen]);

  const exit = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      event?.stopPropagation();
      const angles = captureApiRef.current?.getViewAngles() || currentView;
      setFullscreen(false);
      onExit(angles);
    },
    [currentView, onExit],
  );

  const captureShots = useCallback(
    (title: string, shots: WorkflowPanoramaShot[]) => {
      const api = captureApiRef.current;
      if (!api) {
        message.warning("全景还在加载中，请稍后再截图");
        return;
      }
      const images = api.capture(shots);
      if (!images.length) {
        message.warning("没有生成全景截图");
        return;
      }
      onCaptureImages?.(title, images);
      message.success(`已生成 ${images.length} 张全景截图`);
    },
    [onCaptureImages],
  );

  const viewer = (isFullscreen: boolean) => (
    <div
      className={`nodrag nopan nowheel relative h-full min-h-0 w-full overflow-hidden rounded-xl ${isFullscreen ? "bg-[#171717]" : ""}`}
      style={{ touchAction: "none" }}
    >
      <LibTvPanoramaViewer
        imageUrl={imageUrl}
        initialYaw={initialYaw}
        initialPitch={initialPitch}
        showGuides={showGuides}
        className="absolute inset-0 h-full w-full"
        overlayClassName="p-2"
        bottomRight={
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex w-max max-w-[min(92vw,200px)] flex-col items-stretch gap-0.5 rounded-lg border border-white/10 bg-black/50 p-1 shadow-lg backdrop-blur-sm transition-opacity duration-300 opacity-100">
            <div
              className="shrink-0 self-center overflow-hidden rounded-md bg-black/30"
              aria-hidden="true"
              style={{ width: 62, height: 62 }}
            >
              <div className="h-[62px] w-[62px]">
                <PanoramaAxisPreview
                  yaw={currentView.yaw}
                  pitch={currentView.pitch}
                />
              </div>
            </div>
            <div className="w-full px-0.5 text-center font-mono text-[6px] leading-tight text-white/82">
              <div className="whitespace-nowrap">
                横 <span>{Math.round(Number(currentView.yaw || 0))}°</span>
                <span className="mx-0.5 text-white/35">·</span>纵{" "}
                <span>{Math.round(Number(currentView.pitch || 0))}°</span>
              </div>
              <div className="mt-px whitespace-nowrap text-white/72">
                缩放 <span>75°×1.00</span>
              </div>
            </div>
          </div>
        }
        topRight={
          <button
            type="button"
            title="退出全景预览"
            data-testid="image-node-panorama-preview-exit-corner"
            className="nodrag nopan pointer-events-auto flex size-9 items-center justify-center rounded-lg bg-black/65 text-white transition-colors hover:bg-black/75"
            onClick={exit}
          >
            <PanoramaExitIcon />
          </button>
        }
        onViewChange={(angles) => {
          const nextYaw = Number(angles.yaw.toFixed(2));
          const nextPitch = Number(angles.pitch.toFixed(2));
          setCurrentView((current) =>
            current.yaw === nextYaw && current.pitch === nextPitch
              ? current
              : { yaw: nextYaw, pitch: nextPitch },
          );
        }}
        onCaptureApiReady={(api) => {
          captureApiRef.current = api;
        }}
      />
    </div>
  );

  const toolbar = (
    <div
      className="node-floating-ui nodrag nowheel nopan absolute left-1/2 z-20 origin-bottom -translate-x-1/2 transition-[transform,opacity] duration-150 ease-out"
      style={{
        bottom: "calc(100% + calc(32px * var(--workflow-float-scale, 1)))",
        transform: "scale(var(--workflow-float-scale, 1))",
      }}
    >
      <div className="border-hair bg-panel-background border-border-muted nodrag box-border flex w-fit items-center gap-2 rounded-xl p-2 text-white/90 shadow-[0px_4px_10px_0px_rgba(0,0,0,0.12)]">
        <span className="flex">
          <PanoramaToolbarButton
            label="退出全景预览"
            testId="panorama-preview-exit"
            onClick={exit}
          >
            <PanoramaExitIcon />
          </PanoramaToolbarButton>
        </span>
        <div
          className="h-8 w-[0.5px] shrink-0 bg-neutral-600/80 canvas-light:bg-neutral-300"
          aria-hidden="true"
        />
        <div className="flex items-center gap-1">
          <span className="flex">
            <PanoramaToolbarButton
              label="当前视角截图"
              onClick={(event) => {
                event.stopPropagation();
                const view =
                  captureApiRef.current?.getViewAngles() || currentView;
                captureShots("当前视角截图", [
                  {
                    suffix: "当前视角",
                    yawDeg: view.yaw,
                    pitchDeg: view.pitch,
                  },
                ]);
              }}
            >
              <PanoramaCameraIcon />
            </PanoramaToolbarButton>
          </span>
          <span className="flex">
            <PanoramaToolbarButton
              label="4大视角截图"
              onClick={(event) => {
                event.stopPropagation();
                captureShots(
                  "四视角截图",
                  buildLibTvPanoramaFourShots(Number(initialYaw || 0)),
                );
              }}
            >
              <PanoramaFourShotIcon />
            </PanoramaToolbarButton>
          </span>
          <span className="flex">
            <PanoramaToolbarButton
              label="12大视角截图"
              onClick={(event) => {
                event.stopPropagation();
                captureShots(
                  "十二视角截图",
                  buildLibTvPanoramaTwelveShots(Number(initialYaw || 0)),
                );
              }}
            >
              <PanoramaTwelveShotIcon />
            </PanoramaToolbarButton>
          </span>
          <span className="flex">
            <PanoramaToolbarButton
              label="重置视角"
              onClick={(event) => {
                event.stopPropagation();
                captureApiRef.current?.reset();
              }}
            >
              <PanoramaResetIcon />
            </PanoramaToolbarButton>
          </span>
          <span className="flex">
            <PanoramaToolbarButton
              label="构图参考线"
              onClick={(event) => {
                event.stopPropagation();
                setShowGuides((current) => !current);
              }}
            >
              <PanoramaGridIcon />
            </PanoramaToolbarButton>
          </span>
        </div>
        <span className="flex">
          <PanoramaToolbarButton
            label="全屏预览"
            onClick={(event) => {
              event.stopPropagation();
              setFullscreen(true);
            }}
          >
            <PanoramaFullscreenIcon />
          </PanoramaToolbarButton>
        </span>
      </div>
    </div>
  );

  const inlinePreview = (
    <div className="relative h-full w-full">
      {toolbar}
      {viewer(false)}
    </div>
  );

  const fullscreenPreview =
    fullscreen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="nodrag nopan nowheel fixed inset-0 z-[10000] flex items-center justify-center bg-black/82 p-6"
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={stopWorkflowNodeChromeEvent}
          >
            <div className="relative h-[calc(100vh-48px)] w-[calc(100vw-48px)]">
              {toolbar}
              {viewer(true)}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {inlinePreview}
      {fullscreenPreview}
    </>
  );
}

export function TextTryOptionIcon({ id }: { id: string }) {
  if (id === "text-to-video") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17.4004 0C18.836 0.000211016 19.9998 1.16398 20 2.59961V17.4004C19.9998 18.836 18.836 19.9998 17.4004 20H2.59961C1.16398 19.9998 0.000211016 18.836 0 17.4004V2.59961C0.000211016 1.16398 1.16398 0.000211016 2.59961 0H17.4004ZM8.53125 5.96094C7.86529 5.5432 7.00008 6.02151 7 6.80762V13.1992C7 13.9839 7.86223 14.4625 8.52832 14.0479L13.6416 10.8643C14.2689 10.4736 14.2706 9.56066 13.6445 9.16797L8.53125 5.96094Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (id === "image-reverse-prompt") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17.4004 0C18.836 0.000211016 19.9998 1.16398 20 2.59961V17.4004C19.9998 18.836 18.836 19.9998 17.4004 20H2.59961C1.16398 19.9998 0.000211016 18.836 0 17.4004V2.59961C0.000211016 1.16398 1.16398 0 2.59961 0H17.4004ZM8.4248 7.70801C8.23163 7.38605 7.76543 7.38392 7.56934 7.7041L2.3418 16.2393C2.13811 16.5724 2.378 17 2.76855 17H17.3525C17.7602 17 17.996 16.5386 17.7578 16.208L14.4053 11.5625C14.2057 11.286 13.7943 11.286 13.5947 11.5625L12.0342 13.7236L8.4248 7.70801ZM14.5 4C13.6716 4 13 4.67157 13 5.5C13 6.32843 13.6716 7 14.5 7C15.3284 7 16 6.32843 16 5.5C16 4.67157 15.3284 4 14.5 4Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (id === "text-to-music") {
    return <Volume2 className="size-3.5" />;
  }
  return <TextLineIcon className="size-3.5" />;
}

export function ScriptTryIcon({ type }: { type: ScriptTryPromptType }) {
  if (type === "video") {
    return <Video className="size-3.5" />;
  }

  if (type === "character") {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 17.1125 17.083"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8.55624 0C11.3175 0.000197903 13.5562 2.23874 13.5562 5C13.5562 6.83958 12.5613 8.44519 11.0816 9.31348C14.4365 10.3487 16.9255 13.36 17.1119 16.6836C17.124 16.9039 16.9439 17.0829 16.7232 17.083H16.2232C16.0024 17.083 15.8245 16.9039 15.8092 16.6836C15.5763 13.3155 12.4359 10.2336 8.55624 10.2334C4.67659 10.2336 1.53715 13.3155 1.30429 16.6836C1.28895 16.9038 1.11096 17.0829 0.890226 17.083H0.38925C0.168475 17.083 -0.011538 16.904 0.000577867 16.6836C0.187021 13.3607 2.67491 10.3503 6.0289 9.31445C4.54968 8.44606 3.55624 6.83925 3.55624 5C3.55629 2.23874 5.79501 0.000197901 8.55624 0ZM8.55624 1.2998C6.51298 1.3 4.85609 2.95671 4.85605 5C4.85605 7.04333 6.51296 8.7 8.55624 8.7002C10.5995 8.7 12.2564 7.04333 12.2564 5C12.2564 2.95671 10.5995 1.3 8.55624 1.2998Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(0 1.8) scale(0.8)">
        <path
          d="M19.5996 14C19.8205 14 20 14.1795 20 14.4004V15.0996C20 15.3205 19.8205 15.5 19.5996 15.5H0.400391C0.179477 15.5 0 15.3205 0 15.0996V14.4004C0 14.1795 0.179477 14 0.400391 14H19.5996ZM19.5996 7.0791C19.8205 7.0791 20 7.25858 20 7.47949V8.17871C20 8.39962 19.8205 8.5791 19.5996 8.5791H0.400391C0.179477 8.5791 0 8.39962 0 8.17871V7.47949C0 7.25858 0.179477 7.0791 0.400391 7.0791H19.5996ZM19.5996 0C19.8205 0 20 0.179477 20 0.400391V1.09961C20 1.32052 19.8205 1.5 19.5996 1.5H0.400391C0.179477 1.5 0 1.32052 0 1.09961V0.400391C0 0.179477 0.179477 0 0.400391 0H19.5996Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function TextToolbarHeadingOneIcon() {
  return (
    <Heading1 className="pointer-events-none size-3.5" strokeWidth={1.8} />
  );
}

export function TextToolbarHeadingTwoIcon() {
  return (
    <Heading2 className="pointer-events-none size-3.5" strokeWidth={1.8} />
  );
}

export function TextToolbarHeadingThreeIcon() {
  return (
    <Heading3 className="pointer-events-none size-3.5" strokeWidth={1.8} />
  );
}

export function TextToolbarParagraphIcon() {
  return <Pilcrow className="pointer-events-none size-3" strokeWidth={1.8} />;
}

export function TextToolbarBoldIcon() {
  return <Bold className="pointer-events-none size-3" strokeWidth={2} />;
}

export function TextToolbarItalicIcon() {
  return <Italic className="pointer-events-none size-3" strokeWidth={2} />;
}

export function TextToolbarBulletListIcon() {
  return <List className="pointer-events-none size-3.5" strokeWidth={1.8} />;
}

export function TextToolbarOrderedListIcon() {
  return (
    <ListOrdered className="pointer-events-none size-3" strokeWidth={1.8} />
  );
}

export function TextToolbarDividerIcon() {
  return <Minus className="pointer-events-none size-3" strokeWidth={2} />;
}

export function TextToolbarCopyIcon() {
  return <Copy className="pointer-events-none size-3" strokeWidth={1.8} />;
}

export function TextToolbarExpandIcon() {
  return <Expand className="pointer-events-none size-3" strokeWidth={1.8} />;
}

export function TextToolbarButton({
  children,
  active = false,
  title,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  active?: boolean;
  title: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
      className={`flex h-8 w-8 min-w-8 cursor-pointer select-none items-center justify-center rounded-[8px] bg-transparent p-2 text-[13px] transition-colors hover:bg-canvas-controls-hover ${active ? "bg-canvas-controls-active text-canvas-controls-text" : "text-canvas-controls-text opacity-70"} ${className}`}
    >
      {children}
    </button>
  );
}

export const TEXT_TOOLBAR_COLORS = [
  { label: "默认", value: "" },
  { label: "红色", value: "rgb(245, 63, 63)" },
  { label: "橙色", value: "rgb(255, 152, 30)" },
  { label: "黄色", value: "rgb(255, 198, 0)" },
  { label: "绿色", value: "rgb(30, 216, 105)" },
  { label: "青色", value: "rgb(0, 219, 205)" },
  { label: "蓝色", value: "rgb(0, 176, 255)" },
  { label: "紫色", value: "rgb(144, 75, 255)" },
  { label: "玫红", value: "rgb(229, 0, 255)" },
  { label: "灰色", value: "rgb(105, 105, 105)" },
];

export function normalizeToolbarColor(value: string) {
  const color = String(value || "").trim();
  if (!color) return "";
  const rgbMatch = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    const toHex = (part: string) =>
      Math.max(0, Math.min(255, Number(part || 0)))
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toLowerCase();
  }
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color
      .slice(1)
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`.toLowerCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  return color;
}

export function getSelectionToolbarColor(editor: HTMLElement | null) {
  if (!editor || typeof window === "undefined") return "";
  const selection = window.getSelection();
  const anchorNode = selection?.anchorNode;
  if (!anchorNode || !editor.contains(anchorNode)) return "";
  const selectedElement =
    anchorNode.nodeType === Node.ELEMENT_NODE
      ? (anchorNode as Element)
      : anchorNode.parentElement;
  const cssColor = selectedElement
    ? window.getComputedStyle(selectedElement).color
    : "";
  const commandColor =
    typeof document.queryCommandValue === "function"
      ? String(
          document.queryCommandValue("hiliteColor") ||
            document.queryCommandValue("backColor") ||
            "",
        )
      : "";
  const normalizedCommandColor = normalizeToolbarColor(commandColor);
  const normalizedCssColor = normalizeToolbarColor(cssColor);
  return normalizedCommandColor || normalizedCssColor;
}

export function getEditorSelectionRange(editor: HTMLElement | null) {
  if (!editor || typeof window === "undefined") return null;
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;
  return range.cloneRange();
}

export function restoreEditorSelectionRange(range: Range | null) {
  if (!range || typeof window === "undefined") return;
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

export function TextNodeToolbar({
  nodeId,
  editorRef,
  onExpand,
  onEnsureEditing,
  onCommandComplete,
  fullscreen = false,
  showExpand = true,
}: {
  nodeId: string;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onExpand?: () => void;
  onEnsureEditing?: () => void;
  onCommandComplete?: () => void;
  fullscreen?: boolean;
  showExpand?: boolean;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [currentColor, setCurrentColor] = useState("");
  const selectionRangeRef = useRef<Range | null>(null);
  const saveSelectionRange = useCallback(() => {
    const range = getEditorSelectionRange(editorRef.current);
    if (range) selectionRangeRef.current = range;
    return range;
  }, [editorRef]);
  const refreshCurrentColor = useCallback(() => {
    saveSelectionRange();
    const nextColor = getSelectionToolbarColor(editorRef.current);
    setCurrentColor((current) => (current === nextColor ? current : nextColor));
  }, [editorRef, saveSelectionRange]);
  const runCommand = useCallback(
    (command: string, value?: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const commandValue =
        command === "formatBlock" && value
          ? `<${value.replace(/[<>]/g, "")}>`
          : value;
      onEnsureEditing?.();
      editor.setAttribute("contenteditable", "true");
      editor.focus({ preventScroll: true });
      restoreEditorSelectionRange(selectionRangeRef.current);
      document.execCommand(command, false, commandValue);
      saveSelectionRange();
      onCommandComplete?.();
      window.requestAnimationFrame(refreshCurrentColor);
    },
    [
      editorRef,
      onCommandComplete,
      onEnsureEditing,
      refreshCurrentColor,
      saveSelectionRange,
    ],
  );
  const applyColor = useCallback(
    (color: string) => {
      if (color) {
        runCommand("hiliteColor", color);
        if (document.queryCommandValue?.("hiliteColor") === "transparent") {
          runCommand("backColor", color);
        }
      } else {
        runCommand("removeFormat");
      }
      setColorOpen(false);
      setCurrentColor(normalizeToolbarColor(color));
    },
    [runCommand],
  );

  useEffect(() => {
    refreshCurrentColor();
    document.addEventListener("selectionchange", refreshCurrentColor);
    return () => {
      document.removeEventListener("selectionchange", refreshCurrentColor);
    };
  }, [refreshCurrentColor]);

  const toolbarContent = (
    <div
      className="pointer-events-auto relative flex w-fit flex-nowrap items-center justify-between gap-2 whitespace-nowrap rounded-[12px] border-[0.5px] border-[var(--canvas-controls-border)] bg-[var(--canvas-controls-bg)] p-2 text-[var(--canvas-controls-text)] shadow-[0_4px_10px_rgba(0,0,0,0.12),0_2px_4px_rgba(0,0,0,0.2)] backdrop-blur-[16px]"
      data-testid="canvas-node-toolbar"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        saveSelectionRange();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        saveSelectionRange();
      }}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <div className="relative">
        <button
          type="button"
          className={`flex h-8 w-8 min-w-8 cursor-pointer select-none items-center justify-center rounded-[8px] bg-transparent p-2 text-[13px] text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover ${colorOpen ? "bg-canvas-controls-active" : "opacity-70"}`}
          title="背景色"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            saveSelectionRange();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            saveSelectionRange();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            saveSelectionRange();
            setColorOpen((open) => !open);
          }}
        >
          {currentColor ? (
            <div
              className="h-4 w-4 rounded-full"
              style={{ background: currentColor }}
            />
          ) : (
            <div
              className="relative h-4 w-4 rounded-full border-2"
              style={{
                background: "transparent",
                borderColor: "var(--canvas-controls-border)",
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-[1.5px] w-full -translate-x-1/2 -translate-y-1/2 rotate-45 rounded"
                style={{ background: "rgb(255, 59, 48)" }}
              />
            </div>
          )}
        </button>
        {colorOpen ? (
          <div
            className="absolute left-0"
            style={{ top: "calc(100% + 8px)", zIndex: 60 }}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={stopWorkflowNodeChromeEvent}
          >
            <div
              style={{
                padding: 12,
                borderRadius: 12,
                border: "0.5px solid var(--canvas-controls-border)",
                background: "var(--canvas-controls-bg)",
                boxShadow:
                  "rgba(0, 0, 0, 0.12) 0px 4px 10px 0px, rgba(0, 0, 0, 0.2) 0px 2px 4px 0px",
                backdropFilter: "blur(16px)",
                width: "max-content",
              }}
            >
              <div className="grid grid-cols-5 gap-3">
                {TEXT_TOOLBAR_COLORS.map((color) => {
                  const selectedColor = normalizeToolbarColor(currentColor);
                  const normalizedColor = normalizeToolbarColor(color.value);
                  const isSelected = selectedColor === normalizedColor;
                  const isTransparent = !color.value;
                  return (
                    <button
                      key={color.label}
                      type="button"
                      aria-label={
                        isTransparent ? "透明背景" : `背景色 ${color.label}`
                      }
                      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
                      style={{
                        outline: isSelected
                          ? "2px solid var(--border-brand)"
                          : "none",
                        outlineOffset: 2,
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        applyColor(color.value);
                      }}
                    >
                      {isTransparent ? (
                        <div className="relative h-7 w-7 rounded-full border-2 border-canvas-controls-border bg-canvas-controls-hover">
                          <div
                            className="absolute left-1/2 top-1/2 h-[2px] w-full -translate-x-1/2 -translate-y-1/2 rotate-45 rounded"
                            style={{ background: "rgb(255, 59, 48)" }}
                          />
                        </div>
                      ) : (
                        <div
                          className="h-7 w-7 rounded-full"
                          style={{ background: color.value }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="h-4 w-0 flex-shrink-0 border-l-[0.5px] border-[var(--canvas-controls-border)]" />
      <ul className="flex flex-nowrap items-center">
        <TextToolbarButton
          title="标题 1"
          onClick={() => runCommand("formatBlock", "h1")}
        >
          <TextToolbarHeadingOneIcon />
        </TextToolbarButton>
        <TextToolbarButton
          title="标题 2"
          onClick={() => runCommand("formatBlock", "h2")}
        >
          <TextToolbarHeadingTwoIcon />
        </TextToolbarButton>
        <TextToolbarButton
          title="标题 3"
          onClick={() => runCommand("formatBlock", "h3")}
        >
          <TextToolbarHeadingThreeIcon />
        </TextToolbarButton>
        <TextToolbarButton
          title="正文"
          active
          onClick={() => runCommand("formatBlock", "p")}
        >
          <TextToolbarParagraphIcon />
        </TextToolbarButton>
      </ul>
      <div className="h-4 w-0 flex-shrink-0 border-l-[0.5px] border-[var(--canvas-controls-border)]" />
      <ul className="flex flex-nowrap items-center">
        <TextToolbarButton title="粗体" onClick={() => runCommand("bold")}>
          <TextToolbarBoldIcon />
        </TextToolbarButton>
        <TextToolbarButton title="斜体" onClick={() => runCommand("italic")}>
          <TextToolbarItalicIcon />
        </TextToolbarButton>
        <TextToolbarButton
          title="无序列表"
          onClick={() => runCommand("insertUnorderedList")}
        >
          <TextToolbarBulletListIcon />
        </TextToolbarButton>
        <TextToolbarButton
          title="有序列表"
          onClick={() => runCommand("insertOrderedList")}
        >
          <TextToolbarOrderedListIcon />
        </TextToolbarButton>
        <TextToolbarButton
          title="分割线"
          onClick={() => runCommand("insertHorizontalRule")}
        >
          <TextToolbarDividerIcon />
        </TextToolbarButton>
      </ul>
      <div className="h-4 w-0 flex-shrink-0 border-l-[0.5px] border-[var(--canvas-controls-border)]" />
      <ul className="flex flex-nowrap items-center">
        <TextToolbarButton title="复制内容" onClick={() => runCommand("copy")}>
          <TextToolbarCopyIcon />
        </TextToolbarButton>
        {showExpand ? (
          <button
            type="button"
            title="展开编辑"
            className="flex h-8 w-8 min-w-8 cursor-pointer select-none items-center justify-center rounded-[8px] bg-transparent p-2 text-[13px] text-canvas-controls-text opacity-70 transition-colors hover:bg-canvas-controls-hover"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onExpand?.();
            }}
          >
            <TextToolbarExpandIcon />
          </button>
        ) : null}
      </ul>
    </div>
  );

  if (fullscreen) return toolbarContent;

  return (
    <NodeToolbar
      nodeId={nodeId}
      isVisible
      position={Position.Top}
      offset={28}
      align="center"
      className="node-float-ui nodrag nopan nowheel"
    >
      {toolbarContent}
    </NodeToolbar>
  );
}
