"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightToLine,
  Check,
  ChevronDown,
  Filter,
  Folder,
  Grid2X2,
  History,
  ImageIcon,
  Loader2,
  Pilcrow,
  Plus,
  Play,
  Search,
  Settings2,
  Sparkles,
  Upload,
  User,
  Video,
  Volume2,
  X,
} from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { uploadCanvasNodeFile } from "../libtv-upload-utils";
import { waitForPlatformSeedanceValidation } from "@/workflow/ideart/lib/platform-assets";
import { getWorkflowErrorMessage } from "@/workflow/ideart/lib/error-message";
import { saveSeedanceCharacterLibraryAsset } from "@/workflow/ideart/lib/seedance-character-library";
import {
  WorkflowExtraParametersPanel,
  normalizeWorkflowExtraParameterDefinitions,
  resolveWorkflowExtraParameterValues,
} from "./workflow-extra-parameters";
import { WorkflowAnchoredPopover } from "./workflow-anchored-popover";
import { WorkflowImagePresetGlyph } from "./workflow-image-preset-icons";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  fetchWorkflowModelOptions,
  findWorkflowModelOptionByIdentity,
  getWorkflowManagedExtraParameterValues,
  getWorkflowModelOptionValue,
  getWorkflowVideoMethodDefinitions,
  isWorkflowModelFree,
  normalizeWorkflowModelIdentity,
  workflowModelOptionMatches,
} from "./workflow-models";
import {
  isRenderableWorkflowMediaUrl,
  normalizeWorkflowDurationLabel,
  parseWorkflowDurationSeconds,
} from "./workflow-media-utils";
import { SparkleModelIcon } from "./workflow-icons";
import {
  getWorkflowImageNonQualityDefinitions,
  getWorkflowImageQualityChoices,
  getWorkflowImageQualityDefinition,
  getWorkflowVideoMethodAvailability,
  normalizeGenerationCountOptions,
  normalizeWorkflowRedrawChoicesForMethod,
  normalizeWorkflowVideoMethodChoices,
  normalizeWorkflowVideoMethodValue,
  pickWorkflowRedrawDefault,
  resolveWorkflowVideoMethod,
} from "./generation-options";
import { WORKFLOW_IMAGE_SLASH_PRESET_OPTIONS } from "./workflow-connections";
import type {
  BatchStoryboardVideoItem,
  WorkflowRedrawChoice,
} from "./surface-contracts";
import type {
  WorkflowImagePresetOption,
  WorkflowModelOption,
  WorkflowStyleGalleryItem,
} from "./workflow-models";
import type { WorkflowVideoInputCounts } from "./generation-options";

export function GenerationPopupList({
  title,
  items,
  selected,
  onSelect,
}: {
  title: string;
  items: string[];
  selected: string;
  onSelect: (item: string) => void;
}) {
  return (
    <div
      className="flex flex-col gap-1"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <div className="px-2 py-1 text-xs text-fg-muted">{title}</div>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          className={`flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-fg-default transition-colors hover:bg-canvas-controls-hover ${selected === item ? "bg-canvas-controls-active" : ""}`}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(item);
          }}
        >
          <span>{item}</span>
          {selected === item ? <span className="text-fg-muted">✓</span> : null}
        </button>
      ))}
    </div>
  );
}

export function WorkflowVideoMethodIcon({ value }: { value: string }) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "text2video" ||
    normalized === "text-to-video" ||
    normalized === "text_to_video"
  ) {
    return <Pilcrow className="size-4" />;
  }
  if (normalized === "first_frame" || normalized === "image_reference") {
    return <ImageIcon className="size-4" />;
  }
  if (normalized === "start_end") return <Grid2X2 className="size-4" />;
  if (
    normalized === "edit" ||
    normalized === "extend" ||
    normalized === "draft_task"
  ) {
    return <Video className="size-4" />;
  }
  if (normalized.includes("audio")) return <Volume2 className="size-4" />;
  return <Sparkles className="size-4" />;
}

export function VideoModePopup({
  items,
  selected,
  availability,
  onSelect,
}: {
  items: WorkflowRedrawChoice[];
  selected: string;
  availability: Map<string, { disabled: boolean; reason: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <div
      className="flex w-[196px] flex-col gap-1 p-2"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <div className="flex h-8 items-center px-2 text-xs font-medium text-fg-muted opacity-80">
        视频生成模式
      </div>
      {items.map((item) => {
        const active = item.value === selected;
        const state = availability.get(item.value) || {
          disabled: false,
          reason: "",
        };
        return (
          <button
            key={item.value}
            type="button"
            disabled={state.disabled}
            title={state.reason || item.label}
            className={`flex h-8 w-full shrink-0 items-center gap-2 rounded-lg px-2 text-left transition-colors duration-200 ${
              state.disabled
                ? "cursor-not-allowed text-fg-disabled opacity-40"
                : active
                  ? "bg-canvas-controls-active text-fg-default"
                  : "cursor-pointer text-fg-default hover:bg-canvas-controls-hover"
            }`}
            onClick={(event) => {
              event.stopPropagation();
              if (!state.disabled) onSelect(item.value);
            }}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              <WorkflowVideoMethodIcon value={item.value} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-normal leading-normal">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const PORTRAIT_TEXTURE_DEFAULT_SETTINGS: Required<
  NonNullable<LibTvWorkflowNode["data"]["workflowPortraitTextureSettings"]>
> = {
  sceneFusion: "自然融合",
  lightingFusion: "自然匹配",
  skin: "自然肤质",
  texture: "自然纹理",
  sharpness: "标准清晰",
};

export const PORTRAIT_TEXTURE_SETTING_GROUPS: Array<{
  key: keyof typeof PORTRAIT_TEXTURE_DEFAULT_SETTINGS;
  label: string;
  options: string[];
}> = [
  {
    key: "sceneFusion",
    label: "人景融合",
    options: ["轻度对齐", "自然融合", "深度融合"],
  },
  {
    key: "lightingFusion",
    label: "光影融合",
    options: ["柔和补光", "自然匹配", "氛围强化"],
  },
  { key: "skin", label: "皮肤", options: ["清透修饰", "自然肤质", "真实肌理"] },
  {
    key: "texture",
    label: "纹理",
    options: ["柔和纹理", "自然纹理", "颗粒质感"],
  },
  {
    key: "sharpness",
    label: "锐度",
    options: ["柔焦", "标准清晰", "高清锐化"],
  },
];

export function resolvePortraitTextureSettings(
  value?: LibTvWorkflowNode["data"]["workflowPortraitTextureSettings"],
) {
  return {
    ...PORTRAIT_TEXTURE_DEFAULT_SETTINGS,
    ...(value || {}),
  };
}

export function PortraitTextureSettingsPopup({
  value,
  onChange,
}: {
  value?: LibTvWorkflowNode["data"]["workflowPortraitTextureSettings"];
  onChange: (
    next: LibTvWorkflowNode["data"]["workflowPortraitTextureSettings"],
  ) => void;
}) {
  const selected = resolvePortraitTextureSettings(value);
  return (
    <div
      className="tiny-scrollbar flex max-h-[524px] flex-col gap-2 overflow-y-auto"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      {PORTRAIT_TEXTURE_SETTING_GROUPS.map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <span className="text-sm font-medium text-fg-muted">
            {group.label}
          </span>
          <div className="flex gap-2">
            {group.options.map((option) => {
              const active = selected[group.key] === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={`flex h-8 min-w-[80px] flex-1 items-center justify-center rounded-lg border-[0.5px] px-3 text-xs transition-colors ${
                    active
                      ? "border-stroke-medium bg-canvas-controls-active text-fg-default"
                      : "border-card-border bg-transparent text-fg-default hover:bg-canvas-controls-hover"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange({ ...selected, [group.key]: option });
                  }}
                >
                  <span className="truncate">{option}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WorkflowImagePresetMentionBadge({
  preset,
  onOpenPortraitTextureSettings,
}: {
  preset: WorkflowImagePresetOption;
  onOpenPortraitTextureSettings?: (anchor: HTMLButtonElement) => void;
}) {
  const isPortraitTexturePreset = preset.id === "portrait_texture_adjustment";
  return (
    <span className="pointer-events-auto inline-flex h-6 max-w-[220px] shrink-0 select-none items-center gap-1 whitespace-nowrap rounded-lg border border-canvas-controls-border bg-transparent px-1 align-middle text-sm text-canvas-controls-text">
      <span
        className={`inline-flex size-4 shrink-0 items-center justify-center rounded text-white ${isPortraitTexturePreset ? "bg-[#CE51FF]" : "bg-[#CE51FF]"}`}
      >
        <WorkflowImagePresetShortcutIcon
          presetId={preset.id}
          className="size-3"
        />
      </span>
      <span className="max-w-[135px] overflow-hidden text-ellipsis">
        {preset.label}
      </span>
      {isPortraitTexturePreset && onOpenPortraitTextureSettings ? (
        <button
          type="button"
          data-slash-portrait-trigger="1"
          className="inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
          aria-label="人像质感调节设置"
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={(event) => {
            event.stopPropagation();
            onOpenPortraitTextureSettings(event.currentTarget);
          }}
        >
          <PortraitTextureTriggerIcon />
        </button>
      ) : null}
    </span>
  );
}

export function PortraitTextureTriggerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8.42517 7.63379C9.53314 7.63382 10.4603 8.40578 10.6986 9.44141H12.6996C12.854 9.44165 12.9789 9.56719 12.9789 9.72168V10.2119C12.9789 10.3664 12.854 10.4919 12.6996 10.4922H10.6986C10.4602 11.5277 9.53306 12.2998 8.42517 12.2998C7.31736 12.2998 6.39118 11.5276 6.15271 10.4922H1.30115C1.14651 10.4922 1.02087 10.3666 1.02087 10.2119V9.72168C1.02087 9.56704 1.14651 9.44141 1.30115 9.44141H6.15173C6.39004 8.40578 7.31721 7.63383 8.42517 7.63379ZM8.42517 8.68359C7.71646 8.68365 7.14198 9.25808 7.14197 9.9668C7.14204 10.6755 7.7165 11.2499 8.42517 11.25C9.13386 11.25 9.7083 10.6755 9.70837 9.9668C9.70836 9.25807 9.1339 8.68363 8.42517 8.68359ZM5.66345 1.72266C6.77134 1.72277 7.69859 2.49568 7.93689 3.53125H12.6996C12.8539 3.53149 12.9788 3.65617 12.9789 3.81055V4.30078C12.9789 4.45527 12.854 4.58082 12.6996 4.58105H7.93689C7.69859 5.61662 6.77134 6.38953 5.66345 6.38965C4.55549 6.3896 3.62832 5.61668 3.39001 4.58105H1.30115C1.14651 4.58105 1.02087 4.45542 1.02087 4.30078V3.81055C1.021 3.65602 1.14659 3.53125 1.30115 3.53125H3.39001C3.62832 2.49563 4.55549 1.7227 5.66345 1.72266ZM5.66345 2.77246C4.95485 2.77251 4.38044 3.34709 4.38025 4.05566C4.38025 4.7644 4.95473 5.33979 5.66345 5.33984C6.3721 5.33971 6.94666 4.76435 6.94666 4.05566C6.94647 3.34714 6.37199 2.7726 5.66345 2.77246Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WorkflowImagePresetShortcutPopup({
  groups,
  runningId,
  selectedId,
  onSelect,
}: {
  groups: Array<{ title: string; items: WorkflowImagePresetOption[] }>;
  runningId: string | null;
  selectedId?: string;
  onSelect: (preset: WorkflowImagePresetOption) => void;
}) {
  return (
    <div
      className="tiny-scrollbar flex h-[536px] max-h-[calc(100vh-120px)] flex-col flex-wrap gap-2 overflow-y-auto"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      {groups.map((group) => (
        <div key={group.title} className="flex w-[342px] flex-col gap-1">
          <div className="px-2 py-1">
            <span className="text-sm font-medium text-fg-muted">
              {group.title}
            </span>
          </div>
          {group.items.map((item) => {
            const disabled = Boolean(runningId);
            const running = runningId === item.id;
            const selected = selectedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-disabled={disabled}
                disabled={disabled}
                className={`group flex h-[52px] w-full items-center gap-2 rounded-xl p-2 text-left text-fg-default transition-colors duration-200 hover:bg-canvas-controls-hover disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent ${selected ? "bg-canvas-controls-active" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect(item);
                }}
              >
                <span className="relative flex size-[34px] shrink-0 items-center justify-center rounded-[6px] border border-canvas-controls-border bg-canvas-controls-hover text-fg-default">
                  {running ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <WorkflowImagePresetShortcutIcon presetId={item.id} />
                  )}
                </span>
                <span
                  className={`flex h-full min-w-0 flex-col justify-start transition-transform duration-200 group-hover:translate-y-0 ${selected ? "" : "translate-y-2"}`}
                >
                  <span className="truncate text-sm font-medium text-fg-default">
                    {item.label}
                  </span>
                  <span
                    className={`mt-0.5 truncate text-xs leading-4 text-fg-muted transition-opacity duration-200 group-hover:opacity-100 ${selected ? "opacity-100" : "opacity-0"}`}
                  >
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function WorkflowImagePresetShortcutIcon({
  presetId,
  className = "size-4",
}: {
  presetId: string;
  className?: string;
}) {
  return <WorkflowImagePresetGlyph presetId={presetId} className={className} />;
}

export function LegacyModelPopupList({
  title,
  models,
  loading,
  selected,
  onSelect,
}: {
  title: string;
  models: WorkflowModelOption[];
  loading: boolean;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (loading) return;
    const frame = window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>('[data-selected="true"]')
        ?.scrollIntoView({ block: "center", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, models.length, selected]);

  return (
    <div
      ref={listRef}
      className="tiny-scrollbar flex h-[400px] w-[360px] max-w-full flex-col gap-1 overflow-y-auto"
      role="listbox"
      aria-label={title}
      data-testid="workflow-model-list"
    >
      {loading ? (
        <div className="flex min-h-[52px] items-center px-2.5 py-2 text-fg-muted">
          加载中...
        </div>
      ) : models.length > 0 ? (
        models.map((model) => {
          const value = getWorkflowModelOptionValue(model);
          const checked = workflowModelOptionMatches(model, selected);
          const iconUrl = isRenderableWorkflowMediaUrl(String(model.icon || ""))
            ? String(model.icon)
            : "";
          return (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={checked}
              data-selected={checked}
              className={`flex min-w-0 items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-canvas-controls-hover ${checked ? "bg-canvas-controls-hover" : ""}`}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(value);
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt=""
                    className="size-4 shrink-0 rounded-sm"
                  />
                ) : (
                  <SparkleModelIcon />
                )}
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{model.name}</span>
                    <WorkflowModelBadges model={model} />
                  </span>
                  {model.description || model.descriptionKey ? (
                    <span
                      className="block truncate text-xs text-fg-muted"
                      title={model.description || model.descriptionKey}
                    >
                      {model.description || model.descriptionKey}
                    </span>
                  ) : null}
                </span>
              </span>
              {checked ? (
                <span className="shrink-0 text-fg-default">✓</span>
              ) : null}
            </button>
          );
        })
      ) : (
        <div className="flex min-h-[52px] items-center px-2.5 py-2 text-fg-muted">
          暂无可用模型
        </div>
      )}
    </div>
  );
}

export function ModelPopupList({
  title,
  models,
  loading,
  selected,
  onSelect,
}: {
  title: string;
  models: WorkflowModelOption[];
  loading: boolean;
  selected: string;
  onSelect: (value: string) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (loading) return;
    const frame = window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>('[data-selected="true"]')
        ?.scrollIntoView({ block: "center", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, models.length, selected]);

  return (
    <div
      ref={listRef}
      className="tiny-scrollbar flex h-[400px] w-[360px] max-w-full flex-col gap-1 overflow-y-auto"
      role="listbox"
      aria-label={title}
      data-testid="workflow-model-list"
    >
      {loading ? (
        <div className="flex min-h-[52px] items-center px-2.5 py-2 text-fg-muted">
          加载中...
        </div>
      ) : models.length > 0 ? (
        models.map((model) => {
          const value = getWorkflowModelOptionValue(model);
          const checked = workflowModelOptionMatches(model, selected);
          const iconUrl = isRenderableWorkflowMediaUrl(String(model.icon || ""))
            ? String(model.icon)
            : "";
          const description = String(
            model.description || model.descriptionKey || "",
          ).trim();
          return (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={checked}
              data-selected={checked}
              title={model.name}
              className={
                "group flex h-[52px] min-h-[52px] w-full min-w-0 items-center gap-1 rounded-xl p-2 text-left text-fg-default transition-colors duration-200 hover:bg-canvas-controls-hover " +
                (checked ? "bg-canvas-controls-active" : "")
              }
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={(event) => {
                event.stopPropagation();
                onSelect(value);
              }}
            >
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-bg-surface-secondary text-fg-default">
                <WorkflowModelIcon iconUrl={iconUrl} name={model.name} />
              </span>
              <span className="h-full min-w-0 flex-1 overflow-hidden pr-1">
                <span
                  className={
                    "flex h-full min-w-0 flex-col justify-start transition-transform duration-200 group-hover:translate-y-0 " +
                    (checked || !description
                      ? "translate-y-0"
                      : "translate-y-2")
                  }
                >
                  <span className="flex min-w-0 items-center gap-1 text-[14px] font-medium leading-5">
                    <span className="min-w-0 truncate" title={model.name}>
                      {model.name}
                    </span>
                    <WorkflowModelBadges model={model} />
                  </span>
                  {description ? (
                    <span
                      className={
                        "block min-w-0 truncate text-[12px] leading-4 text-fg-muted transition-opacity duration-200 group-hover:opacity-100 " +
                        (checked ? "opacity-100" : "opacity-0")
                      }
                      title={description}
                    >
                      {description}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          );
        })
      ) : (
        <div className="flex min-h-[52px] items-center px-2.5 py-2 text-fg-muted">
          暂无可用模型
        </div>
      )}
    </div>
  );
}

export function WorkflowModelIcon({
  iconUrl,
  name,
  className = "size-4",
}: {
  iconUrl?: string;
  name?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [iconUrl]);

  if (iconUrl && !failed) {
    return (
      <img
        src={iconUrl}
        alt=""
        title={name}
        draggable={false}
        loading="lazy"
        decoding="async"
        className={className + " shrink-0 object-contain"}
        onError={() => setFailed(true)}
      />
    );
  }

  return <SparkleModelIcon />;
}

export type BatchStoryboardVideoPopup =
  | "model"
  | "mode"
  | "settings"
  | "advanced"
  | null;

export function BatchStoryboardVideoModal({
  open,
  title: _title,
  items,
  modelId,
  aspectRatio,
  videoResolution,
  videoDuration,
  videoMethod,
  generationCount,
  generateAudio,
  enableWebSearch,
  workflowExtraParameters,
  onModelChange,
  onAspectRatioChange,
  onVideoResolutionChange,
  onVideoDurationChange,
  onVideoMethodChange,
  onGenerationCountChange,
  onGenerateAudioChange,
  onEnableWebSearchChange,
  onWorkflowExtraParametersChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  items: BatchStoryboardVideoItem[];
  modelId: string;
  aspectRatio?: string;
  videoResolution?: string;
  videoDuration?: string;
  videoMethod?: string;
  generationCount?: number;
  generateAudio?: boolean;
  enableWebSearch?: boolean;
  workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
  onModelChange: (value: string) => void;
  onAspectRatioChange: (value: string) => void;
  onVideoResolutionChange: (value: string) => void;
  onVideoDurationChange: (value: string) => void;
  onVideoMethodChange: (value: string) => void;
  onGenerationCountChange: (value: number | undefined) => void;
  onGenerateAudioChange: (value: boolean | undefined) => void;
  onEnableWebSearchChange: (value: boolean | undefined) => void;
  onWorkflowExtraParametersChange: (
    value: LibTvWorkflowNode["data"]["workflowExtraParameters"],
  ) => void;
  onClose: () => void;
  onConfirm: (request: {
    rowIndexes: number[];
    rowDurations: Record<number, string>;
    modelId: string;
    aspectRatio?: string;
    videoResolution?: string;
    videoDuration?: string;
    videoMethod?: string;
    generationCount?: number;
    generateAudio?: boolean;
    enableWebSearch?: boolean;
    workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
  }) => void;
}) {
  const [modelOptions, setModelOptions] = useState<WorkflowModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(
    () => new Set(items.map((item) => item.rowIndex)),
  );
  const [expandedRows, setExpandedRows] = useState<Set<number>>(
    () => new Set(),
  );
  const [durations, setDurations] = useState<Record<number, string>>({});
  const [activePopup, setActivePopup] =
    useState<BatchStoryboardVideoPopup>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedRows(new Set(items.map((item) => item.rowIndex)));
    setExpandedRows(new Set());
  }, [items, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setModelsLoading(true);
    fetchWorkflowModelOptions("video")
      .then((models) => {
        if (cancelled) return;
        setModelOptions(models);
        const fallback = models.find((model) => model.isDefault) || models[0];
        const value = getWorkflowModelOptionValue(fallback);
        if (!modelId && value) onModelChange(value);
      })
      .catch(() => {
        if (!cancelled) setModelOptions([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelId, onModelChange, open]);

  const selectedModel = useMemo(() => {
    if (!modelOptions.length) return null;
    return (
      findWorkflowModelOptionByIdentity(modelOptions, modelId) ||
      modelOptions.find((model) => model.isDefault) ||
      modelOptions[0]
    );
  }, [modelId, modelOptions]);
  const selectedModelValue =
    getWorkflowModelOptionValue(selectedModel) || modelId || "";
  const selectedModelLabel = selectedModel?.name || "选择视频模型";
  const selectedModelIcon = isRenderableWorkflowMediaUrl(
    String(selectedModel?.icon || ""),
  )
    ? String(selectedModel?.icon)
    : "";
  const methodOptions = useMemo(
    () =>
      normalizeWorkflowVideoMethodChoices(
        getWorkflowVideoMethodDefinitions(selectedModel?.parameters),
      ),
    [selectedModel?.parameters?.methods, selectedModel?.parameters?.modes],
  );
  const videoInputCounts = useMemo<WorkflowVideoInputCounts>(
    () => ({ images: 1, videos: 0, audios: 0, scriptImages: 0 }),
    [],
  );
  const selectedVideoMethod = useMemo(
    () =>
      resolveWorkflowVideoMethod(
        methodOptions,
        normalizeWorkflowVideoMethodValue(videoMethod),
        videoInputCounts,
      ),
    [methodOptions, videoInputCounts, videoMethod],
  );
  const selectedVideoMethodOption = useMemo(
    () =>
      methodOptions.find((method) => method.value === selectedVideoMethod) ||
      null,
    [methodOptions, selectedVideoMethod],
  );
  const methodAvailability = useMemo(
    () =>
      new Map(
        methodOptions.map((method) => [
          method.value,
          getWorkflowVideoMethodAvailability(method, videoInputCounts),
        ]),
      ),
    [methodOptions, videoInputCounts],
  );
  const ratioOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.aspectRatios,
        [],
        selectedVideoMethod,
      ),
    [selectedModel?.parameters?.aspectRatios, selectedVideoMethod],
  );
  const resolutionOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.resolutions,
        [],
        selectedVideoMethod,
      ),
    [selectedModel?.parameters?.resolutions, selectedVideoMethod],
  );
  const durationOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.durations,
        [],
        selectedVideoMethod,
      ),
    [selectedModel?.parameters?.durations, selectedVideoMethod],
  );
  const countOptions = useMemo(
    () =>
      normalizeGenerationCountOptions(
        "video",
        selectedModel?.parameters?.counts,
        selectedVideoMethod,
      ),
    [selectedModel?.parameters?.counts, selectedVideoMethod],
  );
  const extraParameterDefinitions = useMemo(
    () =>
      normalizeWorkflowExtraParameterDefinitions(
        selectedModel?.parameters?.extraParameters,
        selectedVideoMethod,
      ),
    [selectedModel?.parameters?.extraParameters, selectedVideoMethod],
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
        workflowExtraParameters,
        { fillDefaults: true },
      ),
    [extraParameterDefinitions, workflowExtraParameters],
  );
  const selectedQuality = String(
    (qualityDefinition?.type
      ? resolvedExtraParameters[qualityDefinition.type]
      : undefined) ??
      resolvedExtraParameters.quality ??
      resolvedExtraParameters.video_quality ??
      "",
  ).trim();
  const selectedQualityLabel =
    qualityOptions.find((item) => item.value === selectedQuality)?.label ||
    selectedQuality;
  const selectedAspectRatio = pickWorkflowRedrawDefault(
    aspectRatio || "",
    selectedModel?.parameters?.aspectRatios,
    ratioOptions,
    ratioOptions[0]?.value || "",
    selectedVideoMethod,
  );
  const selectedAspectLabel =
    ratioOptions.find((item) => item.value === selectedAspectRatio)?.label ||
    selectedAspectRatio;
  const selectedResolution = pickWorkflowRedrawDefault(
    videoResolution || "",
    selectedModel?.parameters?.resolutions,
    resolutionOptions,
    resolutionOptions[0]?.value || "",
    selectedVideoMethod,
  );
  const selectedResolutionLabel =
    resolutionOptions.find((item) => item.value === selectedResolution)
      ?.label || selectedResolution;
  const selectedDuration = pickWorkflowRedrawDefault(
    videoDuration || "",
    selectedModel?.parameters?.durations,
    durationOptions,
    durationOptions[0]?.value || "",
    selectedVideoMethod,
  );
  const selectedDurationLabel =
    durationOptions.find((item) => item.value === selectedDuration)?.label ||
    selectedDuration;
  const selectedGenerationCount = pickWorkflowRedrawDefault(
    String(generationCount || ""),
    selectedModel?.parameters?.counts,
    countOptions,
    countOptions[0]?.value || "",
    selectedVideoMethod,
  );
  const selectedGenerationCountNumber = Math.max(
    1,
    Number.parseInt(selectedGenerationCount || "1", 10) || 1,
  );
  const supportsAudio =
    selectedVideoMethodOption?.config?.supportsSound === true;
  const selectedGenerateAudio = supportsAudio
    ? typeof generateAudio === "boolean"
      ? generateAudio
      : selectedVideoMethodOption?.config?.defaultSound === true
    : false;
  const supportsWebSearch =
    selectedVideoMethodOption?.config?.supportsWebSearch === true;
  const selectedWebSearch = supportsWebSearch
    ? typeof enableWebSearch === "boolean"
      ? enableWebSearch
      : selectedVideoMethodOption?.config?.defaultWebSearch === true
    : false;
  const selectedVideoMethodLabel =
    selectedVideoMethodOption?.label || methodOptions[0]?.label || "生成模式";
  const settingsLabel =
    [
      selectedAspectLabel,
      selectedResolutionLabel,
      qualityOptions.length > 0 ? selectedQualityLabel : "",
      selectedDurationLabel,
      countOptions.length > 0 ? `${selectedGenerationCountNumber}个` : "",
    ]
      .filter(Boolean)
      .join(" · ") || "生成参数";
  const allSelected = items.length > 0 && selectedRows.size === items.length;
  const selectedCount = selectedRows.size;
  const commitBatchModel = useCallback(
    (value: string) => {
      const nextModel = findWorkflowModelOptionByIdentity(modelOptions, value);
      const nextValue =
        getWorkflowModelOptionValue(nextModel) ||
        normalizeWorkflowModelIdentity(value);
      if (!nextValue) return;
      onModelChange(nextValue);
      setActivePopup(null);
    },
    [modelOptions, onModelChange],
  );

  useEffect(() => {
    if (!open) return;
    if (selectedModelValue && selectedModelValue !== modelId)
      onModelChange(selectedModelValue);
    if (selectedVideoMethod !== String(videoMethod || ""))
      onVideoMethodChange(selectedVideoMethod);
    if (selectedAspectRatio !== String(aspectRatio || ""))
      onAspectRatioChange(selectedAspectRatio);
    if (selectedResolution !== String(videoResolution || ""))
      onVideoResolutionChange(selectedResolution);
    if (selectedDuration !== String(videoDuration || ""))
      onVideoDurationChange(selectedDuration);
    if (
      countOptions.length > 0 &&
      selectedGenerationCountNumber !== Number(generationCount || 0)
    )
      onGenerationCountChange(selectedGenerationCountNumber);
    if (countOptions.length === 0 && generationCount !== undefined)
      onGenerationCountChange(undefined);
    if (supportsAudio && selectedGenerateAudio !== generateAudio)
      onGenerateAudioChange(selectedGenerateAudio);
    if (!supportsAudio && typeof generateAudio === "boolean")
      onGenerateAudioChange(undefined);
    if (supportsWebSearch && selectedWebSearch !== enableWebSearch)
      onEnableWebSearchChange(selectedWebSearch);
    if (!supportsWebSearch && typeof enableWebSearch === "boolean")
      onEnableWebSearchChange(undefined);
    if (
      JSON.stringify(resolvedExtraParameters) !==
      JSON.stringify(workflowExtraParameters || {})
    )
      onWorkflowExtraParametersChange(
        Object.keys(resolvedExtraParameters).length > 0
          ? resolvedExtraParameters
          : undefined,
      );
  }, [
    aspectRatio,
    countOptions.length,
    enableWebSearch,
    generateAudio,
    generationCount,
    modelId,
    onAspectRatioChange,
    onEnableWebSearchChange,
    onGenerateAudioChange,
    onGenerationCountChange,
    onModelChange,
    onVideoResolutionChange,
    onVideoDurationChange,
    onVideoMethodChange,
    onWorkflowExtraParametersChange,
    open,
    resolvedExtraParameters,
    selectedAspectRatio,
    selectedDuration,
    selectedGenerateAudio,
    selectedGenerationCountNumber,
    selectedModelValue,
    selectedResolution,
    selectedVideoMethod,
    selectedWebSearch,
    supportsAudio,
    supportsWebSearch,
    videoDuration,
    videoMethod,
    videoResolution,
    workflowExtraParameters,
  ]);

  useEffect(() => {
    if (!open) return;
    setDurations((current) => {
      const next = Object.fromEntries(
        items.map((item) => {
          const raw = String(current[item.rowIndex] || item.duration || "");
          const rawSeconds = Number(raw.replace(/[^\d.]/g, ""));
          const matching = durationOptions.find((option) => {
            const optionSeconds = Number(
              String(option.value || option.label || "").replace(/[^\d.]/g, ""),
            );
            return (
              Number.isFinite(rawSeconds) &&
              Number.isFinite(optionSeconds) &&
              rawSeconds === optionSeconds
            );
          });
          return [
            item.rowIndex,
            matching?.value ||
              selectedDuration ||
              (raw ? normalizeWorkflowDurationLabel(raw) : ""),
          ];
        }),
      );
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [durationOptions, items, open, selectedDuration]);

  if (!open) return null;

  const toggleRow = (rowIndex: number, checked: boolean) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (checked) next.add(rowIndex);
      else next.delete(rowIndex);
      return next;
    });
  };
  const submit = () => {
    const rowIndexes = items
      .map((item) => item.rowIndex)
      .filter((rowIndex) => selectedRows.has(rowIndex));
    const rowDurations: Record<number, string> = {};
    for (const rowIndex of rowIndexes) {
      const rowDuration = String(durations[rowIndex] || "").trim();
      if (rowDuration) rowDurations[rowIndex] = rowDuration;
    }
    onConfirm({
      rowIndexes,
      rowDurations,
      modelId: selectedModelValue,
      aspectRatio: selectedAspectRatio || undefined,
      videoResolution: selectedResolution || undefined,
      videoDuration: selectedDuration || undefined,
      videoMethod: selectedVideoMethod || undefined,
      generationCount:
        countOptions.length > 0 ? selectedGenerationCountNumber : undefined,
      generateAudio: supportsAudio ? selectedGenerateAudio : undefined,
      enableWebSearch: supportsWebSearch ? selectedWebSearch : undefined,
      workflowExtraParameters:
        Object.keys(resolvedExtraParameters).length > 0
          ? resolvedExtraParameters
          : undefined,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/70 px-4 py-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="批量生视频"
        className="flex w-[min(1116px,calc(100vw-96px))] max-w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#181818] text-white shadow-[0_26px_80px_rgba(0,0,0,0.62)]"
        onPointerDown={stopWorkflowNodeChromeEvent}
        onMouseDown={stopWorkflowNodeChromeEvent}
        onClick={stopWorkflowNodeChromeEvent}
        onContextMenu={preventWorkflowNodeChromeContextMenu}
      >
        <header className="flex h-[64px] shrink-0 items-center justify-between bg-[#181818] px-4">
          <h2 className="text-[16px] font-medium leading-none text-white">
            批量生视频
          </h2>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-white/62 transition-colors hover:bg-white/[0.06] hover:text-white"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-6" />
          </button>
        </header>
        <div className="flex min-h-0 flex-col p-4">
          <div className="mb-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/65">
            会优先使用已生成的角色、场景和道具参考图，让视频更贴合分镜内容
          </div>
          <div className="mb-3 text-[11px] leading-5 text-white/50">
            每镜时长为本次生成临时值，不写回脚本表格。
          </div>
          <div className="mb-3 max-h-[320px] min-h-0 overflow-y-auto pr-1">
            {items.map((item) => {
              const checked = selectedRows.has(item.rowIndex);
              const expanded = expandedRows.has(item.rowIndex);
              const rowDurationValue = String(
                durations[item.rowIndex] || selectedDuration || item.duration,
              ).trim();
              const rowDurationIndex = Math.max(
                0,
                durationOptions.findIndex(
                  (option) => option.value === rowDurationValue,
                ),
              );
              const rowDurationLabel =
                durationOptions.find(
                  (option) => option.value === rowDurationValue,
                )?.label || rowDurationValue;
              const cycleRowDuration = (direction: -1 | 1) => {
                if (durationOptions.length === 0) return;
                const nextIndex =
                  (rowDurationIndex + direction + durationOptions.length) %
                  durationOptions.length;
                setDurations((current) => ({
                  ...current,
                  [item.rowIndex]: durationOptions[nextIndex].value,
                }));
              };
              return (
                <div
                  key={item.id}
                  className={`mb-1 rounded-md border px-3 py-2 ${checked ? "border-white/10" : "border-white/10 opacity-55"}`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      className="nodrag mt-0.5 h-3.5 w-3.5 accent-white"
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        toggleRow(item.rowIndex, event.target.checked)
                      }
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 cursor-pointer overflow-hidden text-left"
                      onClick={() => {
                        setExpandedRows((current) => {
                          const next = new Set(current);
                          if (next.has(item.rowIndex))
                            next.delete(item.rowIndex);
                          else next.add(item.rowIndex);
                          return next;
                        });
                      }}
                    >
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-white/85">
                          {item.label}
                        </span>
                        <ChevronDown
                          className={`size-3 text-white/40 transition-transform ${expanded ? "rotate-180" : ""}`}
                        />
                      </div>
                      <div
                        className={`${expanded ? "line-clamp-none" : "truncate"} mt-0.5 text-[11px] leading-4 text-white/50`}
                        title={item.prompt}
                      >
                        {item.prompt || "暂无视频运动提示词"}
                      </div>
                    </button>
                    {durationOptions.length > 0 ? (
                      <div className="relative h-8 w-[80px] shrink-0 self-start rounded-md border border-white/10 bg-white/[0.04]">
                        <span className="flex h-full items-center px-3 pr-7 text-xs text-white">
                          {rowDurationLabel}
                        </span>
                        <div className="absolute inset-y-0 right-0 flex w-6 flex-col border-l border-white/10">
                          <button
                            type="button"
                            className="flex min-h-0 flex-1 items-center justify-center text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                            aria-label="增加时长"
                            onClick={() => cycleRowDuration(1)}
                          >
                            <ChevronDown className="size-2.5 rotate-180" />
                          </button>
                          <button
                            type="button"
                            className="flex min-h-0 flex-1 items-center justify-center border-t border-white/10 text-white/35 transition-colors hover:bg-white/[0.06] hover:text-white/70"
                            aria-label="减少时长"
                            onClick={() => cycleRowDuration(-1)}
                          >
                            <ChevronDown className="size-2.5" />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex shrink-0 items-center justify-between gap-3">
            <div
              className="flex min-w-0 flex-1 flex-wrap items-center gap-3"
              data-testid="batch-video-footer-controls"
            >
              <div
                className="flex items-center gap-4"
                data-testid="batch-video-footer-left"
              >
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    className="nodrag h-3.5 w-3.5 accent-white"
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelectedRows(
                        event.target.checked
                          ? new Set(items.map((item) => item.rowIndex))
                          : new Set(),
                      )
                    }
                  />
                  <span className="text-[11px] text-white/65">
                    已选 {selectedCount}/{items.length}
                  </span>
                </label>
              </div>
              <div
                className="flex flex-wrap items-center gap-2"
                data-testid="batch-video-generator-config"
              >
                <BatchVideoConfigChip
                  icon={
                    <WorkflowModelIcon
                      iconUrl={selectedModelIcon}
                      name={selectedModelLabel}
                    />
                  }
                  label={selectedModelLabel}
                  open={activePopup === "model"}
                  variant="model"
                  onClick={() =>
                    setActivePopup((current) =>
                      current === "model" ? null : "model",
                    )
                  }
                  onClose={() => setActivePopup(null)}
                >
                  <ModelPopupList
                    title="视频模型"
                    models={modelOptions}
                    loading={modelsLoading}
                    selected={selectedModelValue}
                    onSelect={commitBatchModel}
                  />
                </BatchVideoConfigChip>
                {methodOptions.length > 0 ? (
                  <BatchVideoConfigChip
                    icon={<Video className="size-4" />}
                    label={selectedVideoMethodLabel}
                    open={activePopup === "mode"}
                    onClick={() =>
                      setActivePopup((current) =>
                        current === "mode" ? null : "mode",
                      )
                    }
                    onClose={() => setActivePopup(null)}
                  >
                    <VideoModePopup
                      items={methodOptions}
                      selected={selectedVideoMethod}
                      availability={methodAvailability}
                      onSelect={(value) => {
                        if (methodAvailability.get(value)?.disabled) return;
                        onVideoMethodChange(value);
                        setActivePopup(null);
                      }}
                    />
                  </BatchVideoConfigChip>
                ) : null}
                {ratioOptions.length > 0 ||
                resolutionOptions.length > 0 ||
                qualityOptions.length > 0 ||
                durationOptions.length > 0 ||
                countOptions.length > 0 ||
                supportsAudio ? (
                  <BatchVideoConfigChip
                    icon={<Settings2 className="size-4" />}
                    label={settingsLabel}
                    open={activePopup === "settings"}
                    variant="settings"
                    onClick={() =>
                      setActivePopup((current) =>
                        current === "settings" ? null : "settings",
                      )
                    }
                    onClose={() => setActivePopup(null)}
                  >
                    <VideoSettingsPopup
                      aspectOptions={ratioOptions}
                      resolutionOptions={resolutionOptions}
                      qualityOptions={qualityOptions}
                      durationOptions={durationOptions}
                      countOptions={countOptions}
                      selectedAspect={selectedAspectRatio}
                      selectedResolution={selectedResolution}
                      selectedQuality={selectedQuality}
                      selectedDuration={selectedDuration}
                      selectedCount={selectedGenerationCount}
                      supportsAudio={supportsAudio}
                      audioEnabled={selectedGenerateAudio}
                      onAspectSelect={onAspectRatioChange}
                      onResolutionSelect={onVideoResolutionChange}
                      onQualitySelect={(value) => {
                        const qualityKey = qualityDefinition?.type || "quality";
                        onWorkflowExtraParametersChange({
                          ...(workflowExtraParameters || {}),
                          [qualityKey]: value,
                        });
                      }}
                      onDurationSelect={onVideoDurationChange}
                      onCountSelect={(value) =>
                        onGenerationCountChange(
                          Math.max(1, Number.parseInt(value, 10) || 1),
                        )
                      }
                      onAudioEnabledChange={onGenerateAudioChange}
                    />
                  </BatchVideoConfigChip>
                ) : null}
                {supportsWebSearch ||
                visibleExtraParameterDefinitions.length > 0 ? (
                  <BatchVideoConfigChip
                    icon={<Filter className="size-4" />}
                    label="更多参数"
                    open={activePopup === "advanced"}
                    variant="advanced"
                    onClick={() =>
                      setActivePopup((current) =>
                        current === "advanced" ? null : "advanced",
                      )
                    }
                    onClose={() => setActivePopup(null)}
                  >
                    <div className="w-[min(420px,calc(100vw-24px))] p-3 text-fg-default">
                      {supportsWebSearch ? (
                        <div className="flex items-center justify-between text-[13px]">
                          <span>联网搜索</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={selectedWebSearch}
                            className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${selectedWebSearch ? "bg-[var(--btn-invert-bg)]" : "bg-canvas-controls-active"}`}
                            onClick={() =>
                              onEnableWebSearchChange(!selectedWebSearch)
                            }
                          >
                            <span
                              className={`block size-4 rounded-full shadow transition-transform ${selectedWebSearch ? "translate-x-4 bg-[var(--btn-invert-text)]" : "translate-x-0.5 bg-fg-muted"}`}
                            />
                          </button>
                        </div>
                      ) : null}
                      {visibleExtraParameterDefinitions.length > 0 ? (
                        <WorkflowExtraParametersPanel
                          definitions={visibleExtraParameterDefinitions}
                          values={workflowExtraParameters}
                          context={{
                            modelId: selectedModelValue,
                            referenceImageCount: 1,
                            managedValues:
                              getWorkflowManagedExtraParameterValues(
                                selectedModel,
                              ),
                          }}
                          onChange={(patch) =>
                            onWorkflowExtraParametersChange({
                              ...(workflowExtraParameters || {}),
                              ...patch,
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </BatchVideoConfigChip>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                className="flex h-8 shrink-0 items-center justify-center rounded-lg bg-[#F7F7F7] px-3 text-[13px] font-normal text-[#171717] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={selectedCount <= 0 || !selectedModelValue}
                onClick={submit}
              >
                确认并创建视频生成器组 ({selectedCount})
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function BatchVideoConfigChip({
  icon,
  label,
  open,
  variant = "choice",
  onClick,
  onClose,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  variant?: "model" | "choice" | "settings" | "advanced";
  onClick: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (
        !target ||
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      )
        return;
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose, open]);

  return (
    <div className="relative">
      <button
        type="button"
        ref={triggerRef}
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] text-[#F7F7F7] transition-colors hover:bg-white/[0.06]"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={onClick}
      >
        <span className="inline-flex shrink-0 items-center">{icon}</span>
        <span
          className="max-w-[220px] truncate whitespace-nowrap"
          title={label}
        >
          {label}
        </span>
        <ChevronDown className="size-3 opacity-60" />
      </button>
      {open ? (
        <WorkflowAnchoredPopover
          anchorRef={triggerRef}
          popoverRef={popoverRef}
          side="top"
          align="start"
          gap={8}
          margin={12}
          heightLimit={
            variant === "model" ? 409 : variant === "choice" ? 320 : 520
          }
          ariaLabel={label}
          className={
            variant === "model"
              ? "rounded-2xl border-[0.5px] border-card-border bg-panel-background/95 p-1 text-sm text-fg-default shadow-[0_1px_3px_rgba(0,0,0,0.05),0_20px_25px_-5px_rgba(0,0,0,0.05),0_10px_10px_-5px_rgba(0,0,0,0.04)] backdrop-blur-[32px]"
              : variant === "settings" || variant === "advanced"
                ? "rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-popover-background)] p-0 text-sm text-canvas-controls-text shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl"
                : "min-w-56 rounded-xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-popover-background)] p-1.5 text-sm text-canvas-controls-text shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl"
          }
        >
          {children}
        </WorkflowAnchoredPopover>
      ) : null}
    </div>
  );
}

export function WorkflowChoicePopupList({
  options,
  selected,
  onSelect,
}: {
  options: WorkflowRedrawChoice[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex max-h-64 min-w-40 flex-col gap-1 overflow-y-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-fg-default transition-colors hover:bg-canvas-controls-hover ${selected === option.value ? "bg-canvas-controls-active" : ""}`}
          onClick={() => onSelect(option.value)}
        >
          <span>{option.label}</span>
          {selected === option.value ? (
            <Check className="size-4 text-fg-muted" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function WorkflowModelVipBadge() {
  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0 text-[#FFC65D]"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.1899 1.33301C12.8863 1.33301 13.5192 1.7394 13.8081 2.37305L15.5063 6.09961C15.805 6.75485 15.6789 7.52587 15.187 8.05176L9.29833 14.3457C8.59577 15.0966 7.40421 15.0966 6.70165 14.3457L0.812977 8.05176C0.321145 7.52588 0.194974 6.75481 0.493641 6.09961L2.19286 2.37305C2.48181 1.7396 3.11378 1.33304 3.81005 1.33301H12.1899ZM6.46727 5.9707L4.66649 5.96582L7.78661 9.08691C7.88578 9.18601 8.04635 9.18557 8.14501 9.08691L11.2593 5.97363C11.2658 5.96705 11.2685 5.96408 11.2593 5.96387H9.45946L8.0747 7.34863C8.01256 7.41052 7.9115 7.40994 7.84911 7.34766L6.46044 5.95996C6.46157 5.9615 6.46912 5.97036 6.46727 5.9707Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WorkflowModelFreeBadge() {
  return (
    <span className="inline-flex h-4 shrink-0 items-center rounded-[5px] bg-[#16A34A]/15 px-1.5 text-[10px] font-semibold leading-4 text-[#22C55E]">
      免费
    </span>
  );
}

export function WorkflowModelBadges({
  model,
}: {
  model: WorkflowModelOption | null | undefined;
}) {
  const free = isWorkflowModelFree(model);
  if (!model?.isPro && !free) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {model?.isPro ? <WorkflowModelVipBadge /> : null}
      {free ? <WorkflowModelFreeBadge /> : null}
    </span>
  );
}

export type WorkflowVideoCharacterAsset = NonNullable<
  LibTvWorkflowNode["data"]["videoCharacterAssets"]
>[number];

export type VideoCharacterLibraryTab = "real" | "image" | "video" | "audio";

export function getWorkflowVideoCharacterAssetUrl(
  asset: WorkflowVideoCharacterAsset,
) {
  const metadata = asset.metadata || {};
  const assetId = String(
    (asset as any).assetId || metadata.assetId || metadata.asset_id || "",
  ).trim();
  return String(
    asset.assetUrl ||
      metadata.assetUrl ||
      metadata.asset_url ||
      metadata.groupAssetUrl ||
      metadata.group_asset_url ||
      (assetId ? `asset://${assetId.replace(/^asset:\/\//i, "")}` : "") ||
      asset.referenceImageUrl ||
      asset.previewUrl ||
      "",
  ).trim();
}

export function getWorkflowVideoCharacterPreviewUrl(
  asset: WorkflowVideoCharacterAsset,
) {
  return String(asset.previewUrl || asset.referenceImageUrl || "").trim();
}

export async function submitSeedanceVirtualCharacterAsset(params: {
  fileId: number | string;
  name: string;
  modelId?: string;
  assetType?: "Image" | "Video" | "Audio";
}) {
  const assetType = params.assetType || "Image";
  const validation = await waitForPlatformSeedanceValidation(params.fileId);
  const assetId = String(validation.asset_id || "").trim();
  const assetUrl = String(
    validation.role_url || validation.asset_url || "",
  ).trim();
  if (!assetId || !assetUrl) throw new Error("Seedance2.0 未返回可用素材");
  return {
    fileId: Number(validation.file_id || params.fileId),
    fileUrl: String(validation.file_url || "").trim(),
    assetId,
    assetUrl,
    assetType,
    status: "Active",
  };
}

export function mapWorkflowCharacterLibraryItem(
  item: any,
): WorkflowVideoCharacterAsset {
  const metadata =
    item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const assetId = String(
    item?.assetId ||
      item?.asset_id ||
      metadata.assetId ||
      metadata.asset_id ||
      "",
  ).trim();
  const assetUrl = String(
    item?.assetUrl ||
      item?.asset_url ||
      metadata.assetUrl ||
      metadata.asset_url ||
      metadata.groupAssetUrl ||
      metadata.group_asset_url ||
      (assetId ? `asset://${assetId.replace(/^asset:\/\//i, "")}` : "") ||
      "",
  ).trim();
  return {
    id:
      String(item?.id || item?.characterKey || assetUrl || "").trim() ||
      undefined,
    name: String(item?.name || item?.variantLabel || "真人素材").trim(),
    assetUrl: assetUrl || undefined,
    previewUrl:
      String(
        metadata.previewUrl ||
          metadata.preview_url ||
          item?.referenceImageUrl ||
          "",
      ).trim() || undefined,
    referenceImageUrl:
      String(item?.referenceImageUrl || "").trim() || undefined,
    source: String(item?.source || "").trim() || undefined,
    metadata,
  };
}

export function VideoCharacterAssetLibraryPopup({
  projectId,
  modelId,
  selectedAssets,
  onClose,
  onConfirm,
}: {
  projectId?: string;
  modelId?: string;
  selectedAssets?: LibTvWorkflowNode["data"]["videoCharacterAssets"];
  onClose: () => void;
  onConfirm: (assets: WorkflowVideoCharacterAsset[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<VideoCharacterLibraryTab>("real");
  const [activeFolderView, setActiveFolderView] = useState<
    "root" | "folder" | "history"
  >("root");
  const [items, setItems] = useState<WorkflowVideoCharacterAsset[]>([]);
  const [selected, setSelected] = useState<WorkflowVideoCharacterAsset[]>(() =>
    (selectedAssets || []).slice(0, 9),
  );
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const selectedKeys = useMemo(
    () =>
      new Set(
        selected
          .map((item) => getWorkflowVideoCharacterAssetUrl(item) || item.id)
          .filter(Boolean),
      ),
    [selected],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = projectId
        ? "?projectId=" + encodeURIComponent(projectId)
        : "?scope=user";
      const res = await fetch("/api/libtv/assets/characters" + query, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(getWorkflowErrorMessage(json, "人物库加载失败"));
      const nextItems = (Array.isArray(json?.items) ? json.items : [])
        .map(mapWorkflowCharacterLibraryItem)
        .filter(
          (item: WorkflowVideoCharacterAsset) =>
            !item.metadata?.pendingAssetUpload &&
            Boolean(getWorkflowVideoCharacterAssetUrl(item) || item.id),
        );
      setItems(nextItems);
    } catch (err: any) {
      const messageText = getWorkflowErrorMessage(err, "人物库加载失败");
      setError(messageText);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (activeTab !== "real") setActiveFolderView("root");
  }, [activeTab]);

  const toggleAsset = useCallback((asset: WorkflowVideoCharacterAsset) => {
    const key = getWorkflowVideoCharacterAssetUrl(asset) || asset.id;
    if (!key) return;
    setSelected((current) => {
      if (
        current.some(
          (item) =>
            (getWorkflowVideoCharacterAssetUrl(item) || item.id) === key,
        )
      ) {
        return current.filter(
          (item) =>
            (getWorkflowVideoCharacterAssetUrl(item) || item.id) !== key,
        );
      }
      if (current.length >= 9) {
        message.warning("最多选择 9 个真人素材");
        return current;
      }
      return [...current, asset];
    });
  }, []);

  const openLocalUpload = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  const handleUploadAsset = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setUploading(true);
      try {
        const { publicUrl, fileId } = await uploadCanvasNodeFile(file);
        message.loading({
          content: "正在提交 Seedance2.0 虚拟素材校验...",
          key: "seedance-character-upload",
          duration: 0,
        });
        const seedanceAsset = await submitSeedanceVirtualCharacterAsset({
          fileId,
          name: file.name.replace(/\.[^.]+$/, "") || "虚拟素材",
          modelId,
          assetType: "Image",
        });
        const assetKeyBase = "seedance-virtual-" + seedanceAsset.assetId;
        const storedAsset = await saveSeedanceCharacterLibraryAsset({
          projectId,
          name: file.name.replace(/\.[^.]+$/, "") || "虚拟素材",
          assetId: seedanceAsset.assetId,
          assetUrl: seedanceAsset.assetUrl,
          referenceImageUrl: publicUrl,
          assetType: seedanceAsset.assetType,
          modelId,
          platformFileId: seedanceAsset.fileId,
        });
        const savedAsset = mapWorkflowCharacterLibraryItem(
          storedAsset || {
            name: file.name,
            characterKey: assetKeyBase,
            personaKey: assetKeyBase,
            variantLabel: "虚拟素材",
            source: "seedance-virtual-avatar",
            assetUrl: seedanceAsset.assetUrl,
            referenceImageUrl: publicUrl,
            metadata: {
              platformFileId: seedanceAsset.fileId,
              validationStatus: "completed",
              assetId: seedanceAsset.assetId,
              assetUrl: seedanceAsset.assetUrl,
              originalUrl: publicUrl,
              assetType: seedanceAsset.assetType,
            },
          },
        );
        setSelected((current) =>
          current.some(
            (item) =>
              (getWorkflowVideoCharacterAssetUrl(item) || item.id) ===
              (getWorkflowVideoCharacterAssetUrl(savedAsset) || savedAsset.id),
          )
            ? current
            : [...current, savedAsset].slice(0, 9),
        );
        await loadItems();
        setActiveFolderView("history");
        message.success({
          content: "Seedance2.0 虚拟素材校验通过，已加入合规素材库",
          key: "seedance-character-upload",
        });
      } catch (err: any) {
        message.error({
          content: getWorkflowErrorMessage(err, "上传失败"),
          key: "seedance-character-upload",
        });
      } finally {
        setUploading(false);
      }
    },
    [loadItems, modelId, projectId],
  );

  return (
    <div
      data-seedance-avatar-library-popup="true"
      className="nodrag nopan nowheel fixed inset-0 z-[1400] flex items-center justify-center bg-black/58 p-6 text-white"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onDoubleClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="absolute inset-0 cursor-default"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative z-10 flex h-[min(680px,78vh)] w-[min(1080px,88vw)] flex-col overflow-hidden rounded-xl border border-white/[0.10] bg-[#181818] shadow-[0_26px_80px_rgba(0,0,0,0.62)]">
        <div className="flex h-13 shrink-0 items-center justify-between border-b border-white/[0.08] px-4">
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-medium text-white/92">
              Seedance2.0合规素材库
            </span>
            <span className="text-xs text-white/38">
              已选 {selected.length}/9 张
            </span>
          </div>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-white/52 transition-colors hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-white/[0.06] px-4">
          {(
            [
              ["real", "真人人像", "NEW"],
              ["image", "图片", ""],
              ["video", "视频", ""],
              ["audio", "音频", ""],
            ] as const
          ).map(([tab, label, badge]) => (
            <button
              key={tab}
              type="button"
              className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors ${
                activeTab === tab
                  ? "bg-white/[0.10] text-white"
                  : "text-white/48 hover:bg-white/[0.06] hover:text-white/72"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              <span>{label}</span>
              {badge ? (
                <span className="rounded bg-[#FF5D5D] px-1 text-[9px] font-semibold leading-4 text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {activeTab === "real" ? (
            activeFolderView === "root" ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] content-start gap-3">
                <button
                  type="button"
                  className="flex h-[150px] flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-white/[0.18] bg-white/[0.03] text-white/70 transition-colors hover:border-white/[0.32] hover:bg-white/[0.07] hover:text-white"
                  onClick={() => setAuthOpen(true)}
                >
                  <span className="flex size-11 items-center justify-center rounded-full bg-white/[0.08]">
                    <Plus className="size-5" />
                  </span>
                  <span className="text-[13px]">录入新的真人</span>
                </button>
                <button
                  type="button"
                  className="flex h-[150px] flex-col items-center justify-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#222] text-white/64 transition-colors hover:border-white/[0.20] hover:bg-white/[0.06] hover:text-white"
                  onClick={() => setActiveFolderView("folder")}
                >
                  <Folder className="size-10 text-white/38" />
                  <span className="max-w-full truncate px-4 text-center text-[13px]">
                    默认人像文件夹
                  </span>
                </button>
                {loading ? (
                  <div className="flex h-[150px] items-center justify-center rounded-lg border border-white/[0.08] bg-[#222] text-white/45">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    加载中
                  </div>
                ) : null}
                {!loading && error ? (
                  <div className="flex h-[150px] items-center justify-center rounded-lg border border-white/[0.08] bg-[#222] px-4 text-center text-sm text-[#ff8b8b]">
                    {error}
                  </div>
                ) : null}
                {!loading && !error
                  ? items.map((asset) => {
                      const key =
                        getWorkflowVideoCharacterAssetUrl(asset) ||
                        asset.id ||
                        asset.name ||
                        "";
                      const checked = selectedKeys.has(key);
                      const previewUrl =
                        getWorkflowVideoCharacterPreviewUrl(asset);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`group relative flex h-[150px] flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                            checked
                              ? "border-white/42 bg-white/[0.10]"
                              : "border-white/[0.08] bg-[#222] hover:border-white/[0.20]"
                          }`}
                          onClick={() => toggleAsset(asset)}
                        >
                          <div className="flex min-h-0 flex-1 items-center justify-center bg-[#2a2a2a]">
                            {previewUrl ? (
                              <img
                                src={previewUrl}
                                alt=""
                                draggable={false}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <User className="size-11 text-white/28" />
                            )}
                          </div>
                          <div className="flex h-9 items-center justify-between gap-2 px-2.5">
                            <span className="min-w-0 truncate text-[13px] text-white/82">
                              {asset.name || "真人素材"}
                            </span>
                            {checked ? (
                              <Check className="size-4 shrink-0 text-white" />
                            ) : null}
                          </div>
                        </button>
                      );
                    })
                  : null}
              </div>
            ) : activeFolderView === "folder" ? (
              <div className="flex h-full min-h-[360px] flex-col gap-4">
                <div className="flex items-center gap-2 text-[12px] text-white/56">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-white/72 transition-colors hover:text-white"
                    onClick={() => setActiveFolderView("root")}
                  >
                    <ArrowRightToLine className="size-3.5 rotate-180" />
                    <span>返回</span>
                  </button>
                  <span>/</span>
                  <span className="text-white/90">默认人像文件夹</span>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  <div
                    role="presentation"
                    className="relative flex aspect-square w-full max-w-[680px] flex-col items-center justify-center rounded-lg border border-white/[0.08] bg-[#222] p-6"
                  >
                    <div className="flex w-full max-w-[360px] flex-col gap-2 px-8">
                      <button
                        type="button"
                        className="flex h-8 w-full items-center justify-center rounded-lg border-none bg-white/[0.10] px-3 text-[13px] text-white transition-colors hover:bg-white/[0.15] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={uploading}
                        onClick={openLocalUpload}
                      >
                        {uploading ? (
                          <Loader2 className="mr-2 size-3.5 animate-spin" />
                        ) : (
                          <Upload className="mr-2 size-3.5" />
                        )}
                        <span>本地上传</span>
                      </button>
                      <button
                        type="button"
                        className="flex h-8 w-full items-center justify-center rounded-lg border-none bg-white/[0.10] px-3 text-[13px] text-white transition-colors hover:bg-white/[0.15]"
                        onClick={() => setActiveFolderView("history")}
                      >
                        <History className="mr-2 size-3.5" />
                        <span>历史资产选择</span>
                      </button>
                    </div>
                    <span className="absolute bottom-3 text-center text-[12px] text-white/42">
                      请上传&lt;30M的图片
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[360px] flex-col gap-4">
                <div className="flex items-center gap-2 text-[12px] text-white/56">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-white/72 transition-colors hover:text-white"
                    onClick={() => setActiveFolderView("folder")}
                  >
                    <ArrowRightToLine className="size-3.5 rotate-180" />
                    <span>返回</span>
                  </button>
                  <span>/</span>
                  <span className="text-white/90">默认人像文件夹</span>
                </div>
                {loading ? (
                  <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-white/[0.08] bg-[#222] text-white/45">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    加载中
                  </div>
                ) : !error && items.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] content-start gap-3">
                    {items.map((asset) => {
                      const key =
                        getWorkflowVideoCharacterAssetUrl(asset) ||
                        asset.id ||
                        asset.name ||
                        "";
                      const checked = selectedKeys.has(key);
                      const previewUrl =
                        getWorkflowVideoCharacterPreviewUrl(asset);
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`group relative flex h-[150px] flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                            checked
                              ? "border-white/42 bg-white/[0.10]"
                              : "border-white/[0.08] bg-[#222] hover:border-white/[0.20]"
                          }`}
                          onClick={() => toggleAsset(asset)}
                        >
                          <div className="flex min-h-0 flex-1 items-center justify-center bg-[#2a2a2a]">
                            {previewUrl ? (
                              <img
                                src={previewUrl}
                                alt=""
                                draggable={false}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <User className="size-11 text-white/28" />
                            )}
                          </div>
                          <div className="flex h-9 items-center justify-between gap-2 px-2.5">
                            <span className="min-w-0 truncate text-[13px] text-white/82">
                              {asset.name || "真人素材"}
                            </span>
                            {checked ? (
                              <Check className="size-4 shrink-0 text-white" />
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-white/[0.08] bg-[#222] text-sm text-white/36">
                    暂无可用素材
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-white/36">
              暂无素材
            </div>
          )}
        </div>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadAsset}
        />
        <div className="flex h-13 shrink-0 items-center justify-between border-t border-white/[0.08] px-4">
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-white/52 transition-colors hover:bg-white/[0.06] hover:text-white/80"
            onClick={loadItems}
          >
            刷新
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 rounded-lg px-4 text-sm text-white/58 transition-colors hover:bg-white/[0.06] hover:text-white/82"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="h-8 rounded-lg bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-white/82"
              onClick={() => onConfirm(selected)}
            >
              确定
            </button>
          </div>
        </div>
      </div>
      {authOpen ? (
        <VideoRealAvatarAuthDialog
          projectId={projectId}
          modelId={modelId}
          onClose={() => setAuthOpen(false)}
          onSaved={async (asset) => {
            setAuthOpen(false);
            await loadItems();
            if (asset)
              setSelected((current) =>
                current.some(
                  (item) =>
                    (getWorkflowVideoCharacterAssetUrl(item) || item.id) ===
                    (getWorkflowVideoCharacterAssetUrl(asset) || asset.id),
                )
                  ? current
                  : [...current, asset].slice(0, 9),
              );
          }}
        />
      ) : null}
    </div>
  );
}

export function VideoRealAvatarAuthDialog({
  projectId,
  modelId,
  onClose,
  onSaved,
}: {
  projectId?: string;
  modelId?: string;
  onClose: () => void;
  onSaved: (asset?: WorkflowVideoCharacterAsset) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [h5Link, setH5Link] = useState("");
  const [bytedToken, setBytedToken] = useState("");
  const [error, setError] = useState("");
  const qrUrl = h5Link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(h5Link)}`
    : "";

  const pollAuthSession = useCallback(
    async (nextTaskId: string, providerKey: string) => {
      for (let index = 0; index < 30; index += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        const res = await fetch(
          `/api/seedance/avatar?taskId=${encodeURIComponent(nextTaskId)}&modelId=${encodeURIComponent(modelId || "volcengine-doubao-video")}&provider=${encodeURIComponent(providerKey)}`,
          {
            credentials: "include",
            cache: "no-store",
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || "认证会话查询失败");
        if (json?.h5Link) setH5Link(String(json.h5Link));
        if (json?.bytedToken) setBytedToken(String(json.bytedToken));
        if (json?.h5Link && json?.bytedToken) return;
      }
    },
    [modelId],
  );

  const createSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/seedance/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "real",
          operation: "create_session",
          modelId: modelId || "volcengine-doubao-video",
          callback_url:
            typeof window !== "undefined" ? window.location.origin : "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || "创建真人认证会话失败");
      const nextTaskId = String(json?.taskId || "").trim();
      const providerKey = String(json?.provider || "").trim();
      setTaskId(nextTaskId);
      if (json?.h5Link) setH5Link(String(json.h5Link));
      if (json?.bytedToken) setBytedToken(String(json.bytedToken));
      if (nextTaskId && (!json?.h5Link || !json?.bytedToken)) {
        if (!providerKey)
          throw new Error("认证会话缺少 provider，无法确定查询供应商");
        await pollAuthSession(nextTaskId, providerKey);
      }
    } catch (err: any) {
      setError(String(err?.message || "创建真人认证会话失败"));
    } finally {
      setLoading(false);
    }
  }, [modelId, pollAuthSession]);

  useEffect(() => {
    createSession();
  }, [createSession]);

  const queryAuth = useCallback(async () => {
    const token = bytedToken.trim();
    if (!token) {
      setError("请先等待二维码加载完成");
      return;
    }
    setQuerying(true);
    setError("");
    try {
      const res = await fetch("/api/seedance/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "real",
          operation: "query_auth",
          modelId: modelId || "volcengine-doubao-video",
          byted_token: token,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok)
        throw new Error(json?.error || "查询真人认证结果失败");
      const groupId = String(json?.groupId || "").trim();
      if (!groupId) throw new Error("未获取到真人素材组 ID，请确认授权已完成");
      const saveRes = await fetch("/api/libtv/assets/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId: projectId || undefined,
          scope: projectId ? undefined : "user",
          asset: {
            name: "真人人像",
            characterKey: `real-avatar-${groupId}`,
            personaKey: `real-avatar-${groupId}`,
            variantLabel: "真人认证",
            source: "seedance-real-avatar",
            referenceImageUrl: "",
            metadata: {
              groupId,
              bytedToken: token,
              taskId,
              mode: "real",
              pendingAssetUpload: true,
            },
          },
        }),
      });
      const saveJson = await saveRes.json().catch(() => ({}));
      if (!saveRes.ok || !saveJson?.success)
        throw new Error(saveJson?.error || "保存真人素材失败");
      message.success("真人认证已完成，请上传素材并等待 Active 后使用");
      onSaved(undefined);
    } catch (err: any) {
      setError(String(err?.message || "查询真人认证结果失败"));
    } finally {
      setQuerying(false);
    }
  }, [bytedToken, modelId, onSaved, projectId, taskId]);

  return (
    <div
      data-seedance-avatar-auth-dialog="true"
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/52 p-6"
    >
      <div className="flex w-[520px] flex-col overflow-hidden rounded-xl border border-white/[0.10] bg-[#202020] shadow-[0_24px_70px_rgba(0,0,0,0.62)]">
        <div className="flex h-12 items-center justify-between border-b border-white/[0.08] px-4">
          <span className="text-sm font-medium text-white/90">
            扫码授权人像资产
          </span>
          <button
            type="button"
            className="flex size-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col items-center gap-4 px-6 py-7">
          <div className="flex size-[280px] items-center justify-center rounded-xl bg-white p-3">
            {loading && !qrUrl ? (
              <Loader2 className="size-7 animate-spin text-black/55" />
            ) : qrUrl ? (
              <img src={qrUrl} alt="真人素材授权二维码" className="size-full" />
            ) : (
              <span className="text-sm text-black/55">二维码加载失败</span>
            )}
          </div>
          <div className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/62">
            使用手机扫码完成真人授权。授权完成后点击“我已完成授权”，系统会保存为
            Seedance2.0 可用的人像资产。
          </div>
          {h5Link ? (
            <button
              type="button"
              className="max-w-full truncate text-xs text-white/45 hover:text-white/72"
              onClick={() =>
                navigator.clipboard?.writeText(h5Link).catch(() => undefined)
              }
            >
              复制授权链接
            </button>
          ) : null}
          {error ? (
            <div className="w-full text-center text-xs text-[#ff8b8b]">
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex h-14 items-center justify-between border-t border-white/[0.08] px-4">
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-white/55 hover:bg-white/[0.06] hover:text-white/82"
            disabled={loading}
            onClick={createSession}
          >
            重新生成
          </button>
          <button
            type="button"
            className="h-8 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-white/82 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={querying || loading || !bytedToken}
            onClick={queryAuth}
          >
            {querying ? "查询中..." : "我已完成授权"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type WorkflowVideoCameraMotionPreset = NonNullable<
  LibTvWorkflowNode["data"]["videoCameraMotion"]
>;

export const WORKFLOW_VIDEO_CAMERA_MOTION_PRESETS: Array<WorkflowVideoCameraMotionPreset> =
  [
    {
      id: "static",
      label: "固定镜头",
      prompt:
        "固定机位，构图稳定不漂移，主体始终落在视觉焦点内，用人物动作和环境细节推进节奏。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "follow",
      label: "跟随拍摄",
      prompt:
        "镜头贴身跟随主体同步移动，速度平稳，持续锁定主体脸部或上半身，让背景产生自然纵深位移。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "orbit-rise",
      label: "盘旋抬升",
      prompt:
        "镜头绕主体半环至一周盘旋并缓慢抬升，主体始终居中偏前，边绕边揭示周围空间与高度落差。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "orbit-down",
      label: "盘旋下降",
      prompt:
        "镜头围绕主体平滑盘旋后逐步下压，先给空间建立感，再把视线收回主体动作和落点。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "tilt-up",
      label: "镜头上摇",
      prompt:
        "机位保持原地，上摇镜头从主体延展到上方景物或天空，节奏由近到远，形成向上揭示的空间感。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "tilt-down",
      label: "镜头下摇",
      prompt:
        "镜头由高处平顺下摇回主体或地面动作，先建立高度关系，再落到关键动作和情绪信息。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "pan-left",
      label: "镜头左摇",
      prompt:
        "镜头向左平移或摇摄，横向展开场景信息，主体保持在构图三分线附近，带出前景与背景的层次关系。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "pan-right",
      label: "镜头右摇",
      prompt:
        "镜头向右平移或摇摄，画面信息沿运动方向依次展开，主体稳定可辨，空间关系逐格揭示。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "pedestal-up",
      label: "镜头上升",
      prompt:
        "摄影机保持朝向稳定并整体垂直上升，从低位逐步揭示主体上方空间与环境层次。",
    },
    {
      id: "pedestal-down",
      label: "镜头下降",
      prompt:
        "摄影机保持朝向稳定并整体垂直下降，从高位缓慢落回主体与地面细节。",
    },
    {
      id: "truck-left",
      label: "镜头左移",
      prompt:
        "摄影机沿水平轨道向左平稳移动，保持主体清晰，并利用前后景视差展开空间。",
    },
    {
      id: "truck-right",
      label: "镜头右移",
      prompt:
        "摄影机沿水平轨道向右平稳移动，保持主体清晰，并利用前后景视差展开空间。",
    },
    {
      id: "truck-in",
      label: "镜头前推",
      prompt:
        "镜头沿主体正前方持续推进，速度克制，景别从中景过渡到近景，把注意力压向关键表情或动作瞬间。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "pull-back",
      label: "镜头后移",
      prompt:
        "镜头从主体附近缓慢后撤，逐步拉开空间尺度，让人物状态与环境关系一起进入画面。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "zoom-in",
      label: "变焦推进",
      prompt:
        "变焦由松到紧压向主体，机位尽量稳定，背景透视保持克制，把视觉焦点快速收束到关键细节。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "zoom-out",
      label: "变焦拉远",
      prompt:
        "从近景开始变焦拉远，主体逐渐融入环境，画面信息层级由人物扩展到完整场域与氛围。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "dolly-zoom",
      label: "柯克变焦",
      prompt:
        "摄影机推拉与镜头变焦反向同步，让主体尺寸基本稳定、背景透视明显压缩或拉伸，制造强烈空间错觉。",
    },
    {
      id: "orbit",
      label: "环绕拍摄",
      prompt:
        "镜头围绕主体平滑环绕，主体保持清晰锁定，前景与背景形成明显视差，用空间旋转强化张力。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "roll",
      label: "滚筒旋转",
      prompt:
        "镜头围绕视轴做轻微到中等幅度旋转，主体仍保持可辨识，利用失衡感增强情绪冲击与临场感。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "pov",
      label: "第一视角",
      prompt:
        "使用第一人称主观视角推进，镜头带有人体真实位移和视线惯性，让观众直接代入主体所见所感。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "drone",
      label: "无人机",
      prompt:
        "无人机镜头平滑飞行掠过场景，兼顾航线感和主体锁定，从开阔空间中稳定带出核心目标。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "aerial",
      label: "高空航拍",
      prompt:
        "高机位俯瞰大场景，镜头运动干净稳定，强调地形尺度、路径关系和主体在环境中的位置变化。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
    {
      id: "handheld",
      label: "手持拍摄",
      prompt:
        "手持镜头保留轻微呼吸感和自然晃动，主体始终可辨，运动节奏贴近现场纪实与临场情绪。",
      previewUrl: "/videos/libtv/motion-preview.mp4",
    },
  ];

export const WORKFLOW_STYLE_GALLERY_CATEGORIES = [
  "推荐",
  "Midjourney",
  "摄影写真",
  "电商营销",
  "动漫游戏",
  "风格插画",
  "平面设计",
  "建筑及室内设计",
  "创意玩法",
  "文创周边",
  "小说推文",
];

export const WORKFLOW_STYLE_GALLERY_ITEMS: WorkflowStyleGalleryItem[] = [
  {
    id: "auto",
    title: "自动",
    author: "Lovarts",
    category: "推荐",
    uses: "默认",
    imageUrl: "/images/libtv/style-gallery/style-01.png",
    avatarUrl: "/images/libtv/style-gallery/style-01.png",
  },
  {
    id: "低饱和铅笔水彩复古风格",
    title: "一键生成低饱和铅笔水彩复古风格",
    author: "曦邬桉",
    category: "风格插画",
    uses: "1300",
    imageUrl: "/images/libtv/style-gallery/style-02.png",
    avatarUrl: "/images/libtv/style-gallery/style-02.png",
  },
  {
    id: "童真手绘粗糙蜡笔风格",
    title: "一键生成童真手绘粗糙蜡笔风格",
    author: "曦邬桉",
    category: "风格插画",
    uses: "3000",
    imageUrl: "/images/libtv/style-gallery/style-03.png",
    avatarUrl: "/images/libtv/style-gallery/style-03.png",
  },
  {
    id: "治愈森林小白熊",
    title: "治愈森林小白熊",
    author: "木白",
    category: "动漫游戏",
    uses: "433",
    imageUrl: "/images/libtv/style-gallery/style-04.png",
    avatarUrl: "/images/libtv/style-gallery/style-04.png",
  },
  {
    id: "田园古风游戏场景",
    title: "田园古风游戏场景",
    author: "图像爱好者",
    category: "动漫游戏",
    uses: "950",
    imageUrl: "/images/libtv/style-gallery/style-05.png",
    avatarUrl: "/images/libtv/style-gallery/style-05.png",
  },
  {
    id: "线稿淡彩插画",
    title: "线稿淡彩插画",
    author: "CheerGo",
    category: "风格插画",
    uses: "5500",
    imageUrl: "/images/libtv/style-gallery/style-06.png",
    avatarUrl: "/images/libtv/style-gallery/style-06.png",
  },
  {
    id: "治愈系奇幻风格绘本插画",
    title: "治愈系奇幻风格绘本插画",
    author: "sonnet",
    category: "风格插画",
    uses: "1000",
    imageUrl: "/images/libtv/style-gallery/style-07.png",
    avatarUrl: "/images/libtv/style-gallery/style-07.png",
  },
  {
    id: "日系清新水彩治愈插画",
    title: "日系清新水彩治愈插画",
    author: "塔塔呀",
    category: "风格插画",
    uses: "3300",
    imageUrl: "/images/libtv/style-gallery/style-08.png",
    avatarUrl: "/images/libtv/style-gallery/style-08.png",
  },
  {
    id: "新国风意境风景插画",
    title: "一键生成新国风意境风景插画",
    author: "曦邬桉",
    category: "平面设计",
    uses: "8900",
    imageUrl: "/images/libtv/style-gallery/style-09.png",
    avatarUrl: "/images/libtv/style-gallery/style-09.png",
  },
  {
    id: "游戏场景",
    title: "游戏场景",
    author: "Devilworld",
    category: "动漫游戏",
    uses: "3100",
    imageUrl: "/images/libtv/style-gallery/style-10.png",
    avatarUrl: "/images/libtv/style-gallery/style-10.png",
  },
  {
    id: "清新写实的水彩风景风格",
    title: "清新写实的水彩风景风格",
    author: "CheerGo",
    category: "摄影写真",
    uses: "5400",
    imageUrl: "/images/libtv/style-gallery/style-11.png",
    avatarUrl: "/images/libtv/style-gallery/style-11.png",
  },
  {
    id: "一键转多角度工业设计线稿",
    title: "一键转多角度工业设计线稿",
    author: "粿条",
    category: "电商营销",
    uses: "2200",
    imageUrl: "/images/libtv/style-gallery/style-12.png",
    avatarUrl: "/images/libtv/style-gallery/style-12.png",
  },
];

export function VideoCameraMotionPopup({
  selectedId,
  onSelect,
  onClear,
  onClose,
}: {
  selectedId?: string;
  onSelect: (preset: WorkflowVideoCameraMotionPreset) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"preset" | "custom" | "favorites">("preset");
  return (
    <div className="flex h-[420px] w-[721px] flex-col rounded-xl border border-white/[0.10] bg-[#2A2A2A] text-white/86">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/[0.10] px-4">
        <div className="flex items-center gap-4">
          {[
            ["preset", "预设"],
            ["custom", "自定义"],
            ["favorites", "我的收藏"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`text-sm transition-colors ${tab === value ? "font-medium text-white" : "text-white/48 hover:text-white/78"}`}
              onClick={() => setTab(value as typeof tab)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {selectedId ? (
            <button
              type="button"
              className="rounded-lg px-2 py-1 text-xs text-white/48 transition-colors hover:bg-white/[0.08] hover:text-white"
              onClick={onClear}
            >
              清除
            </button>
          ) : null}
          <button
            type="button"
            className="flex size-6 items-center justify-center rounded-lg text-white/48 transition-colors hover:bg-white/[0.08] hover:text-white"
            onClick={onClose}
            aria-label="关闭运镜选择"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {tab === "preset" ? (
        <div className="scrollbar-hidden grid min-h-0 flex-1 grid-cols-4 content-start gap-2 overflow-y-auto p-3">
          {WORKFLOW_VIDEO_CAMERA_MOTION_PRESETS.map((preset) => (
            <VideoCameraMotionPresetCard
              key={preset.id}
              preset={preset}
              selected={preset.id === selectedId}
              onSelect={() => onSelect(preset)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-white/40">
          {tab === "custom" ? "自定义运镜稍后开放" : "暂无收藏运镜"}
        </div>
      )}
    </div>
  );
}

export function VideoCameraMotionPresetCard({
  preset,
  selected,
  onSelect,
}: {
  preset: WorkflowVideoCameraMotionPreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewUrl = String(preset.previewUrl || "").trim();
  const snapshotUrl = previewUrl
    ? `${previewUrl}?x-oss-process=video/snapshot,t_0,f_jpg,w_400,m_fast,ar_auto`
    : "";
  return (
    <button
      type="button"
      className="group flex w-[168px] shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded text-left"
      onClick={onSelect}
      onMouseEnter={() => {
        const video = videoRef.current;
        if (!video) return;
        video.play().catch(() => undefined);
      }}
      onMouseLeave={() => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.currentTime = 0;
      }}
    >
      <span
        className={`relative h-[94.5px] w-[168px] overflow-hidden rounded-[3px] bg-[#3A3A3A] ring-offset-1 ring-offset-[#2A2A2A] ${selected ? "ring-2 ring-white/70" : "ring-0"}`}
      >
        {snapshotUrl ? (
          <img
            alt={preset.label || ""}
            className="size-full object-cover"
            loading="lazy"
            src={snapshotUrl}
          />
        ) : null}
        {previewUrl ? (
          <video
            ref={videoRef}
            className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-200 group-hover:opacity-100"
            src={previewUrl}
            loop
            muted
            playsInline
            preload="none"
            disablePictureInPicture
            disableRemotePlayback
            crossOrigin="anonymous"
          />
        ) : null}
      </span>
      <span
        className={`h-[17px] w-full truncate text-center text-xs ${selected ? "text-white" : "text-white/78"}`}
      >
        {preset.label}
      </span>
    </button>
  );
}

export function WorkflowStyleGalleryPopup({
  selected,
  onClose,
  onSelect,
}: {
  selected: string;
  onClose: () => void;
  onSelect: (item: WorkflowStyleGalleryItem) => void;
}) {
  const [tab, setTab] = useState<"square" | "favorites" | "recent">("square");
  const [category, setCategory] = useState("推荐");
  const [sortOpen, setSortOpen] = useState(false);
  const [sort, setSort] = useState("推荐");
  const [query, setQuery] = useState("");
  const selectedLabel = selected === "自动" ? "auto" : selected;
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return WORKFLOW_STYLE_GALLERY_ITEMS.filter((item) => {
      if (tab === "favorites")
        return [
          "低饱和铅笔水彩复古风格",
          "线稿淡彩插画",
          "治愈森林小白熊",
        ].includes(item.id);
      if (tab === "recent")
        return ["auto", "童真手绘粗糙蜡笔风格", "田园古风游戏场景"].includes(
          item.id,
        );
      if (category !== "推荐" && item.category !== category) return false;
      if (!normalizedQuery) return true;
      return `${item.title} ${item.author} ${item.category}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [category, query, tab]);

  return (
    <div
      className="nodrag nopan nowheel fixed inset-0 z-[1400] bg-black/16"
      onMouseDown={stopWorkflowNodeChromeEvent}
      onPointerDown={stopWorkflowNodeChromeEvent}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="关闭风格选择"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        className="absolute left-1/2 top-[clamp(72px,18vh,280px)] flex w-[min(1600px,calc(100vw-96px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#232323]/94 text-white shadow-[0_22px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl"
        style={{ height: "min(calc(100vh - 160px), 1200px)" }}
        onClick={stopWorkflowNodeChromeEvent}
      >
        <div className="relative flex items-center gap-4 px-4 pb-3 pt-4">
          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.06] p-1 shadow-[0_12px_34px_rgba(0,0,0,0.24)]">
            {[
              ["square", "广场"],
              ["favorites", "我的收藏"],
              ["recent", "最近使用"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`flex h-8 min-w-[76px] items-center justify-center rounded-lg px-3 py-2 text-[13px] transition-colors ${tab === value ? "bg-white/[0.12] text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]" : "text-white/52 hover:bg-white/[0.08] hover:text-white/78"}`}
                onClick={() => setTab(value as typeof tab)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex h-10 w-[336px] shrink-0 items-center overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.06] py-2 pl-4 pr-1">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索模型名称、作者、标签"
              className="min-w-0 flex-1 bg-transparent text-sm text-white/88 outline-none placeholder:text-white/34"
            />
            <button
              type="button"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.10]"
              aria-label="搜索"
            >
              <Search className="size-4 text-white/76" />
            </button>
          </div>
          <button
            type="button"
            className="absolute right-4 top-4 flex size-6 shrink-0 items-center justify-center rounded-lg text-white/48 transition-colors hover:bg-white/[0.06] hover:text-white/84"
            onClick={onClose}
            aria-label="关闭"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 pb-3">
          <div className="group relative flex min-w-0 flex-1 items-center">
            <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-3 overflow-x-auto scroll-smooth">
              {WORKFLOW_STYLE_GALLERY_CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`h-8 min-w-12 shrink-0 whitespace-nowrap rounded-lg px-3 py-1 text-[13px] transition-colors ${category === item ? "bg-white/[0.12] font-medium text-white" : "text-white/52 hover:bg-white/[0.08] hover:text-white/78"}`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-8 items-center rounded-lg border border-white/[0.08] bg-white/[0.06] pl-3 pr-2">
              <span className="whitespace-nowrap text-[13px] text-white/84">
                Lib Navo Pro
              </span>
            </div>
            <div className="relative">
              <button
                type="button"
                className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.06] px-2.5 text-[13px] transition-colors hover:bg-white/[0.10]"
                onClick={() => setSortOpen((current) => !current)}
              >
                <span className="whitespace-nowrap text-white/84">{sort}</span>
                <ChevronDown
                  className={`size-3.5 text-white/52 transition-transform ${sortOpen ? "rotate-180" : ""}`}
                />
              </button>
              {sortOpen ? (
                <div className="absolute right-0 top-full z-10 mt-2 w-28 overflow-hidden rounded-xl border border-white/[0.08] bg-[#2A2A2A] p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.34)]">
                  {["推荐", "最新", "最热"].map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`block w-full rounded-lg px-3 py-2 text-left text-[13px] ${sort === item ? "bg-white/10 text-white" : "text-white/62 hover:bg-white/[0.08] hover:text-white"}`}
                      onClick={() => {
                        setSort(item);
                        setSortOpen(false);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="tiny-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-1">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`group relative flex cursor-pointer flex-col gap-2 rounded-lg border p-1 text-left transition-all hover:rounded-xl hover:bg-white/[0.06] ${selectedLabel === item.id || selected === item.title ? "border-white/48 bg-white/[0.06]" : "border-transparent"}`}
                onClick={() => onSelect(item)}
              >
                <div className="relative aspect-[196/261] w-full overflow-hidden rounded-lg bg-white/[0.06]">
                  <img
                    alt={item.title}
                    className="absolute inset-0 size-full object-cover transition-opacity duration-200"
                    decoding="async"
                    src={item.imageUrl}
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-2">
                    <Play className="size-3 text-white" />
                    <span className="text-xs text-white">{item.uses}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 px-1">
                  <p className="w-full truncate text-sm font-medium text-white/90">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-1">
                    <img
                      alt=""
                      className="size-4 shrink-0 rounded-full object-cover"
                      src={item.avatarUrl}
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-white/48">
                      {item.author}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export type CameraControlValue = {
  camera: string;
  lens: string;
  focalLength: string;
  aperture: string;
};

export type CameraControlOption = {
  value: string;
  label: string;
  image?: string;
};

export const CAMERA_CONTROL_CAMERAS: CameraControlOption[] = [
  {
    value: "Sony Venice",
    label: "Sony Venice",
    image: "/images/libtv/camera-body-generic.png",
  },
  {
    value: "Arri Alexa 35",
    label: "Arri Alexa 35",
    image: "/images/libtv/camera-body-generic.png",
  },
  {
    value: "Arri Alexa 65",
    label: "Arri Alexa 65",
    image: "/images/libtv/camera-body-generic.png",
  },
  {
    value: "Red V-Raptor",
    label: "Red V-Raptor",
    image: "/images/libtv/camera-body-generic.png",
  },
  {
    value: "Panavision DXL2",
    label: "Panavision DXL2",
    image: "/images/libtv/camera-body-generic.png",
  },
  {
    value: "Arricam LT",
    label: "Arricam LT",
    image: "/images/libtv/camera-body-generic.png",
  },
  {
    value: "ArriFlex 435",
    label: "ArriFlex 435",
    image: "/images/libtv/camera-body-generic.png",
  },
  {
    value: "IMAX Keighley",
    label: "IMAX Keighley",
    image: "/images/libtv/camera-body-generic.png",
  },
  {
    value: "IMAX Film Camera",
    label: "IMAX Film Camera",
    image: "/images/libtv/camera-body-generic.png",
  },
];

export const CAMERA_CONTROL_LENSES: CameraControlOption[] = [
  {
    value: "Zeiss Ultra Prime",
    label: "Zeiss Ultra Prime",
    image: "/images/libtv/lens-generic.png",
  },
  {
    value: "Cooke SF 1.8x",
    label: "Cooke SF 1.8x",
    image: "/images/libtv/lens-generic.png",
  },
  {
    value: "Canon K-35",
    label: "Canon K-35",
    image: "/images/libtv/lens-generic.png",
  },
  {
    value: "Cooke S4",
    label: "Cooke S4",
    image: "/images/libtv/lens-generic.png",
  },
  {
    value: "Cooke Panchro",
    label: "Cooke Panchro",
    image: "/images/libtv/lens-generic.png",
  },
  {
    value: "Arri Signature Prime",
    label: "Arri Signature Prime",
    image: "/images/libtv/lens-generic.png",
  },
  { value: "Helios", label: "Helios", image: "/images/libtv/lens-generic.png" },
  {
    value: "Panavision C-series",
    label: "Panavision C-series",
    image: "/images/libtv/lens-generic.png",
  },
  {
    value: "Panavision Primo",
    label: "Panavision Primo",
    image: "/images/libtv/lens-generic.png",
  },
  {
    value: "Hawk Class X",
    label: "Hawk Class X",
    image: "/images/libtv/lens-generic.png",
  },
];

export const CAMERA_CONTROL_FOCALS: CameraControlOption[] = [
  "8mm",
  "14mm",
  "24mm",
  "35mm",
  "50mm",
  "75mm",
  "125mm",
].map((item) => ({ value: item, label: item }));

export const CAMERA_CONTROL_APERTURES: CameraControlOption[] = [
  {
    value: "ƒ/1.4",
    label: "ƒ/1.4",
    image: "/images/libtv/aperture-generic.png",
  },
  { value: "ƒ/4", label: "ƒ/4", image: "/images/libtv/aperture-generic.png" },
  { value: "ƒ/11", label: "ƒ/11", image: "/images/libtv/aperture-generic.png" },
];

export function getWorkflowGeneratorControlsForCodex() {
  return {
    image: {
      presets: WORKFLOW_IMAGE_SLASH_PRESET_OPTIONS.map((item) => ({ ...item })),
      styles: WORKFLOW_STYLE_GALLERY_ITEMS.map((item) => ({
        id: item.id,
        label: item.title,
        category: item.category,
      })),
      cameraControl: {
        dataField: "cameraControl",
        cameras: CAMERA_CONTROL_CAMERAS.map(({ value, label }) => ({
          value,
          label,
        })),
        lenses: CAMERA_CONTROL_LENSES.map(({ value, label }) => ({
          value,
          label,
        })),
        focalLengths: CAMERA_CONTROL_FOCALS.map(({ value, label }) => ({
          value,
          label,
        })),
        apertures: CAMERA_CONTROL_APERTURES.map(({ value, label }) => ({
          value,
          label,
        })),
      },
      commonDataFields: [
        "modelId",
        "workflowEndpointMethod",
        "prompt",
        "selectedOptionId",
        "stylePreset",
        "cameraControl",
        "aspectRatio",
        "imageSize",
        "generationCount",
        "workflowExtraParameters",
      ],
    },
    video: {
      cameraMotion: WORKFLOW_VIDEO_CAMERA_MOTION_PRESETS.map((item) => ({
        id: item.id,
        label: item.label,
        prompt: item.prompt,
      })),
      commonDataFields: [
        "modelId",
        "prompt",
        "videoMethod",
        "videoDuration",
        "videoResolution",
        "videoCameraMotion",
        "aspectRatio",
        "generationCount",
        "generateAudio",
        "workflowExtraParameters",
      ],
    },
    sendButton: {
      command: "run",
      behavior:
        "Invokes the native generator send action with the node's current model, prompt, references and parameters; provider request, polling and durable media persistence stay in the native canvas pipeline.",
    },
    executionRules: {
      inspectBeforeRun:
        "Read the selected model's parameters.executionContract and only set supported values.",
      references:
        "Reuse and connect existing canvas material nodes. Do not duplicate an existing material node solely to supply a generator reference.",
      providerPayload:
        "Do not call a supplier directly. The native run command translates node fields and workflowExtraParameters through the selected provider adapter.",
      completion:
        "Treat the node as complete only after the native run returns a durable mediaUrl; task ids and transient URLs are not final output.",
    },
  };
}

export function CameraControlPopup({
  value,
  onSave,
  onClose,
}: {
  value: CameraControlValue;
  onSave: (value: CameraControlValue) => void;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const update = useCallback((patch: Partial<CameraControlValue>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  return (
    <div className="flex flex-col rounded-xl bg-panel-background text-fg-default shadow-[0px_4px_10px_rgba(0,0,0,0.12),0px_2px_4px_rgba(0,0,0,0.2)] backdrop-blur-2xl">
      <div className="border-border-muted flex h-12 items-center justify-between border-b px-4">
        <span className="text-fg-default text-sm font-medium">摄像机</span>
        <button
          type="button"
          className="text-fg-muted hover:text-fg-default flex size-6 items-center justify-center rounded-lg transition-colors"
          onClick={onClose}
        >
          <CameraControlCloseIcon />
        </button>
      </div>
      <div className="flex items-start justify-center gap-1 px-6 py-5">
        <CameraControlDivider />
        <CameraControlWheel
          label="相机"
          options={CAMERA_CONTROL_CAMERAS}
          value={draft.camera}
          onChange={(camera) => update({ camera })}
        />
        <CameraControlDivider />
        <CameraControlWheel
          label="镜头"
          options={CAMERA_CONTROL_LENSES}
          value={draft.lens}
          onChange={(lens) => update({ lens })}
        />
        <CameraControlDivider />
        <CameraControlWheel
          label="焦距"
          options={CAMERA_CONTROL_FOCALS}
          value={draft.focalLength}
          onChange={(focalLength) => update({ focalLength })}
          textOnly
          footer="mm"
        />
        <CameraControlDivider />
        <CameraControlWheel
          label="光圈"
          options={CAMERA_CONTROL_APERTURES}
          value={draft.aperture}
          onChange={(aperture) => update({ aperture })}
          footer={draft.aperture}
        />
        <CameraControlDivider />
      </div>
      <div className="flex items-center justify-end px-4 pb-4">
        <button
          type="button"
          className="bg-btn-invert-bg hover:bg-btn-invert-bg-hover active:bg-btn-invert-bg-active text-btn-invert-text h-8 w-[50px] rounded-lg text-[13px] transition-colors"
          onClick={() => onSave(draft)}
        >
          使用
        </button>
      </div>
    </div>
  );
}

export function CameraControlWheel({
  label,
  options,
  value,
  onChange,
  textOnly,
  footer,
}: {
  label: string;
  options: CameraControlOption[];
  value: string;
  onChange: (value: string) => void;
  textOnly?: boolean;
  footer?: string;
}) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((item) => item.value === value),
  );
  const selected = options[selectedIndex] || options[0];
  const selectOffset = useCallback(
    (delta: number) => {
      if (options.length === 0) return;
      const nextIndex =
        (selectedIndex + delta + options.length) % options.length;
      onChange(options[nextIndex].value);
    },
    [onChange, options, selectedIndex],
  );

  return (
    <div className="flex w-[120px] flex-col items-center">
      <div className="flex h-5 w-full items-center justify-center">
        <button
          type="button"
          aria-disabled="false"
          className="text-fg-muted hover:text-fg-default flex size-5 cursor-pointer items-center justify-center transition-colors"
          aria-label="上一个"
          onClick={() => selectOffset(-1)}
        >
          <CameraControlChevron className="rotate-180" />
        </button>
      </div>
      <div className="relative w-full" style={{ height: 156 }}>
        <div
          className="border-hair border-border-default pointer-events-none absolute inset-x-4 z-20 rounded-xl"
          style={{
            top: 30,
            height: 96,
            background:
              "radial-gradient(rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)",
          }}
        >
          <span className="text-fg-muted mt-2 block text-center text-[11px]">
            {label}
          </span>
        </div>
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="flex flex-col items-center transition-transform duration-300 ease-out"
            style={{ transform: `translateY(${30 - selectedIndex * 96}px)` }}
          >
            {options.map((item, index) => {
              const active = index === selectedIndex;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`flex w-full shrink-0 cursor-pointer flex-col items-center ${textOnly ? "justify-center pt-4" : "justify-end pb-4"}`}
                  style={{ height: 96 }}
                  onClick={() => onChange(item.value)}
                >
                  {textOnly ? (
                    <span
                      className={`text-fg-default font-semibold transition-all duration-200 ${active ? "text-2xl opacity-100" : "text-xl opacity-50"}`}
                    >
                      {item.label.replace("mm", "")}
                    </span>
                  ) : (
                    <CameraControlPreview option={item} active={active} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex h-5 w-full items-center justify-center">
        <button
          type="button"
          aria-disabled="false"
          className="text-fg-muted hover:text-fg-default flex size-5 cursor-pointer items-center justify-center transition-colors"
          aria-label="下一个"
          onClick={() => selectOffset(1)}
        >
          <CameraControlChevron />
        </button>
      </div>
      <span className="text-fg-muted mt-2 w-full truncate text-center text-[11px]">
        {footer || selected?.label || value}
      </span>
    </div>
  );
}

export function CameraControlPreview({
  option,
  active,
}: {
  option: CameraControlOption;
  active: boolean;
}) {
  if (option.image) {
    return (
      <img
        alt={option.label}
        className={`rounded object-cover transition-all duration-200 ${active ? "size-12 opacity-100" : "size-10 opacity-50"}`}
        loading="lazy"
        src={option.image}
      />
    );
  }
  return (
    <span
      className={`text-fg-default font-semibold transition-all duration-200 ${active ? "text-2xl opacity-100" : "text-xl opacity-50"}`}
    >
      {option.label}
    </span>
  );
}

export function CameraControlChevron({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className={`pointer-events-none size-3.5 ${className}`}
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
    >
      <g transform="translate(4.3472 5.8234)">
        <path
          d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function CameraControlCloseIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none size-3.5"
      width="1.01em"
      height="1em"
      viewBox="0 0 17.1864 17.1854"
    >
      <path
        d="M15.7959 0.117157C15.9521 -0.0390524 16.2051 -0.0390524 16.3613 0.117157L17.0693 0.824189C17.2254 0.980406 17.2255 1.23442 17.0693 1.39059L9.86618 8.59274L17.0693 15.7949C17.2254 15.9511 17.2255 16.2051 17.0693 16.3613L16.3613 17.0683C16.2051 17.2245 15.9521 17.2244 15.7959 17.0683L8.59274 9.86618L1.39059 17.0683C1.23442 17.2245 0.981382 17.2244 0.825165 17.0683L0.117157 16.3613C-0.0390524 16.2051 -0.0390524 15.9511 0.117157 15.7949L7.31931 8.59274L0.117157 1.39059C-0.0390524 1.23439 -0.0390524 0.980398 0.117157 0.824189L0.825165 0.117157C0.981375 -0.0390524 1.23439 -0.0390524 1.39059 0.117157L8.59274 7.31931L15.7959 0.117157Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function CameraControlDivider() {
  return (
    <div className="flex h-14 w-4 items-center justify-center self-center">
      <div className="bg-canvas-controls-border h-full w-px" />
    </div>
  );
}

export function ImageSizePopup({
  aspectOptions,
  sizeOptions,
  qualityOptions,
  countOptions,
  selectedAspect,
  selectedSize,
  selectedQuality,
  selectedCount,
  countLocked = false,
  onAspectSelect,
  onSizeSelect,
  onQualitySelect,
  onCountSelect,
}: {
  aspectOptions: WorkflowRedrawChoice[];
  sizeOptions: WorkflowRedrawChoice[];
  qualityOptions?: WorkflowRedrawChoice[];
  countOptions: WorkflowRedrawChoice[];
  selectedAspect: string;
  selectedSize: string;
  selectedQuality?: string;
  selectedCount: string;
  countLocked?: boolean;
  onAspectSelect: (value: string) => void;
  onSizeSelect: (value: string) => void;
  onQualitySelect?: (value: string) => void;
  onCountSelect: (value: string) => void;
}) {
  const showSizeOptions = sizeOptions.length > 0;
  const showQualityOptions = Boolean(
    qualityOptions && qualityOptions.length > 0,
  );
  const showAspectOptions = aspectOptions.length > 0;
  const showCountOptions = countOptions.length > 0;
  const pillButtonClass = (selected: boolean) =>
    `border border-solid flex flex-1 items-center justify-center whitespace-nowrap rounded-lg px-2 text-[13px] transition-colors duration-200 h-8 ${
      selected
        ? "border-border-emphasis bg-canvas-controls-active text-fg-default"
        : "border-border-muted bg-transparent text-fg-muted hover:bg-canvas-controls-hover hover:text-fg-default"
    }`;
  const ratioCardClass = (selected: boolean) =>
    `border border-solid flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 transition-colors duration-200 ${
      selected
        ? "border-border-emphasis bg-canvas-controls-active text-fg-default"
        : "border-border-muted bg-transparent text-fg-muted hover:bg-canvas-controls-hover hover:text-fg-default"
    }`;
  return (
    <div className="flex w-[380px] flex-col gap-2 rounded-2xl p-3">
      {showSizeOptions ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>分辨率</span>
          </div>
          <div className="flex gap-2">
            {sizeOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={pillButtonClass(item.value === selectedSize)}
                onClick={() => onSizeSelect(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showQualityOptions ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>质量</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(qualityOptions || []).map((item) => (
              <button
                key={item.value}
                type="button"
                className={pillButtonClass(item.value === selectedQuality)}
                onClick={() => onQualitySelect?.(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showAspectOptions ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>比例</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {aspectOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={ratioCardClass(item.value === selectedAspect)}
                onClick={() => onAspectSelect(item.value)}
              >
                <AspectRatioGlyph value={item.label || item.value} />
                <span className="text-xs">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showCountOptions ? (
        <div className="shrink-0">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
              <span>生成数量</span>
            </div>
            <div className="flex gap-2">
              {countOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`${pillButtonClass(item.label === selectedCount)} ${countLocked ? "cursor-not-allowed opacity-70" : ""}`}
                  disabled={countLocked}
                  onClick={() => onCountSelect(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {!showSizeOptions &&
      !showQualityOptions &&
      !showAspectOptions &&
      !showCountOptions ? (
        <div className="px-2 py-3 text-xs text-fg-muted">
          当前模型没有可选的比例、尺寸、质量或数量参数
        </div>
      ) : null}
    </div>
  );
}

export function VideoSettingsPopup({
  aspectOptions,
  resolutionOptions,
  qualityOptions,
  durationOptions,
  countOptions,
  selectedAspect,
  selectedResolution,
  selectedQuality,
  selectedDuration,
  selectedCount,
  supportsAudio,
  audioEnabled,
  onAspectSelect,
  onResolutionSelect,
  onQualitySelect,
  onDurationSelect,
  onCountSelect,
  onAudioEnabledChange,
}: {
  aspectOptions: WorkflowRedrawChoice[];
  resolutionOptions: WorkflowRedrawChoice[];
  qualityOptions: WorkflowRedrawChoice[];
  durationOptions: WorkflowRedrawChoice[];
  countOptions: WorkflowRedrawChoice[];
  selectedAspect: string;
  selectedResolution: string;
  selectedQuality: string;
  selectedDuration: string;
  selectedCount: string;
  supportsAudio: boolean;
  audioEnabled: boolean;
  onAspectSelect: (value: string) => void;
  onResolutionSelect: (value: string) => void;
  onQualitySelect: (value: string) => void;
  onDurationSelect: (value: string) => void;
  onCountSelect: (value: string) => void;
  onAudioEnabledChange: (value: boolean) => void;
}) {
  const durationMarks = useMemo(() => {
    const seen = new Set<number>();
    return durationOptions
      .map((item) => ({
        seconds: Math.max(
          1,
          Math.round(parseWorkflowDurationSeconds(item.value || item.label, 5)),
        ),
        value: item.value,
        label: item.label,
      }))
      .filter((item) => {
        if (seen.has(item.seconds)) return false;
        seen.add(item.seconds);
        return true;
      })
      .sort((a, b) => a.seconds - b.seconds);
  }, [durationOptions]);
  const fallbackDurationSeconds = Math.max(
    1,
    Math.round(parseWorkflowDurationSeconds(selectedDuration, 5)),
  );
  const selectedDurationSeconds =
    durationMarks.find((item) => item.value === selectedDuration)?.seconds ||
    fallbackDurationSeconds;
  const durationLabel =
    durationOptions.find((item) => item.value === selectedDuration)?.label ||
    `${selectedDurationSeconds}s`;
  const optionButtonClass = (active: boolean) =>
    `flex h-8 min-w-0 items-center justify-center rounded-lg border border-solid px-2 text-[13px] transition-colors duration-200 ${active ? "border-border-emphasis bg-canvas-controls-active text-fg-default" : "border-border-muted bg-transparent text-fg-muted hover:bg-canvas-controls-hover hover:text-fg-default"}`;
  return (
    <div className="flex w-[340px] flex-col gap-2 rounded-2xl p-3">
      {aspectOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>比例</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {aspectOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border border-solid px-1 py-2 transition-colors duration-200 ${item.value === selectedAspect ? "border-border-emphasis bg-canvas-controls-active text-fg-default" : "border-border-muted bg-transparent text-fg-muted hover:bg-canvas-controls-hover hover:text-fg-default"}`}
                onClick={() => onAspectSelect(item.value)}
              >
                <AspectRatioGlyph value={item.value} />
                <span className="text-xs leading-none">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {resolutionOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>清晰度</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {resolutionOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={optionButtonClass(item.value === selectedResolution)}
                onClick={() => onResolutionSelect(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {qualityOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>质量</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {qualityOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={optionButtonClass(item.value === selectedQuality)}
                onClick={() => onQualitySelect(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {durationOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>视频时长</span>
          </div>
          {durationMarks.length > 1 ? (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(54px,1fr))] gap-2">
              {durationMarks.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={optionButtonClass(item.value === selectedDuration)}
                  onClick={() => onDurationSelect(item.value)}
                >
                  {item.label || `${item.seconds}s`}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className={optionButtonClass(true)}
              onClick={() =>
                durationMarks[0]?.value &&
                onDurationSelect(durationMarks[0].value)
              }
            >
              {durationLabel}
            </button>
          )}
          <span className="sr-only">{durationLabel}</span>
        </div>
      ) : null}
      {supportsAudio ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>生成音频</span>
            <Volume2 className="size-3" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={optionButtonClass(audioEnabled)}
              onClick={() => onAudioEnabledChange(true)}
            >
              开启
            </button>
            <button
              type="button"
              className={optionButtonClass(!audioEnabled)}
              onClick={() => onAudioEnabledChange(false)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
      {countOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-fg-muted">
            <span>生成数量</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {countOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={optionButtonClass(item.value === selectedCount)}
                onClick={() => onCountSelect(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AspectRatioGlyph({ value }: { value: string }) {
  const normalized = String(value || "").toLowerCase();
  const dimensions = normalized.includes("21:9")
    ? { width: 16, height: 7 }
    : normalized.includes("16:9")
      ? { width: 16, height: 9 }
      : normalized.includes("9:16")
        ? { width: 9, height: 16 }
        : normalized.includes("4:5")
          ? { width: 10, height: 12 }
          : normalized.includes("5:4")
            ? { width: 12, height: 10 }
            : normalized.includes("4:3")
              ? { width: 12, height: 9 }
              : normalized.includes("3:2")
                ? { width: 12, height: 8 }
                : normalized.includes("2:3")
                  ? { width: 9, height: 12 }
                  : normalized.includes("3:4")
                    ? { width: 9, height: 12 }
                    : normalized.includes("1:1")
                      ? { width: 12, height: 12 }
                      : { width: 12, height: 12 };
  return (
    <span
      className="flex size-[17px] items-center justify-center"
      aria-hidden="true"
    >
      <span
        className="flex-none rounded-[2px] border-[1.5px] border-current"
        style={dimensions}
      />
    </span>
  );
}
