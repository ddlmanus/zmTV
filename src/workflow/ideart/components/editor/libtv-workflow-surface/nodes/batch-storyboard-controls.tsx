"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { WorkflowAnchoredPopover } from "../workflow-anchored-popover";

export type BatchStoryboardChoice = {
  value: string;
  label: string;
};

export type BatchStoryboardModelOption = {
  value: string;
  name: string;
  description?: string;
  iconUrl?: string;
  isPro?: boolean;
  isFree?: boolean;
};

export function BatchStoryboardConfigChip({
  icon,
  label,
  open,
  variant = "choice",
  onClick,
  onClose,
  children,
}: {
  icon: ReactNode;
  label: string;
  open: boolean;
  variant?: "model" | "choice" | "settings" | "advanced";
  onClick: () => void;
  onClose: () => void;
  children: ReactNode;
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
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose, open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
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
          heightLimit={variant === "model" ? 409 : 520}
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

function ModelIcon({ option }: { option: BatchStoryboardModelOption }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [option.iconUrl]);

  return option.iconUrl && !failed ? (
    <img
      src={option.iconUrl}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      className="size-4 shrink-0 object-contain"
      onError={() => setFailed(true)}
    />
  ) : (
    <Sparkles className="size-4" strokeWidth={1.7} />
  );
}

function ModelBadges({ option }: { option: BatchStoryboardModelOption }) {
  if (!option.isPro && !option.isFree) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {option.isPro ? (
        <span className="inline-flex h-4 items-center rounded-[5px] bg-[#FFC65D]/15 px-1.5 text-[10px] font-semibold leading-4 text-[#FFC65D]">
          VIP
        </span>
      ) : null}
      {option.isFree ? (
        <span className="inline-flex h-4 items-center rounded-[5px] bg-[#16A34A]/15 px-1.5 text-[10px] font-semibold leading-4 text-[#22C55E]">
          免费
        </span>
      ) : null}
    </span>
  );
}

export function BatchStoryboardModelList({
  title,
  options,
  loading,
  selected,
  onSelect,
}: {
  title: string;
  options: BatchStoryboardModelOption[];
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
  }, [loading, options.length, selected]);

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
      ) : options.length > 0 ? (
        options.map((option) => {
          const checked = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={checked}
              data-selected={checked}
              title={option.name}
              className={
                "group flex h-[52px] min-h-[52px] w-full min-w-0 items-center gap-1 rounded-xl p-2 text-left text-fg-default transition-colors duration-200 hover:bg-canvas-controls-hover " +
                (checked ? "bg-canvas-controls-active" : "")
              }
              onClick={() => onSelect(option.value)}
            >
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-bg-surface-secondary text-fg-default">
                <ModelIcon option={option} />
              </span>
              <span className="h-full min-w-0 flex-1 overflow-hidden pr-1">
                <span
                  className={
                    "flex h-full min-w-0 flex-col justify-start transition-transform duration-200 group-hover:translate-y-0 " +
                    (checked || !option.description
                      ? "translate-y-0"
                      : "translate-y-2")
                  }
                >
                  <span className="flex min-w-0 items-center gap-1 text-[14px] font-medium leading-5">
                    <span className="min-w-0 truncate" title={option.name}>
                      {option.name}
                    </span>
                    <ModelBadges option={option} />
                  </span>
                  {option.description ? (
                    <span
                      className={
                        "block min-w-0 truncate text-[12px] leading-4 text-fg-muted transition-opacity duration-200 group-hover:opacity-100 " +
                        (checked ? "opacity-100" : "opacity-0")
                      }
                      title={option.description}
                    >
                      {option.description}
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

function AspectRatioGlyph({ value }: { value: string }) {
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
                : normalized.includes("2:3") || normalized.includes("3:4")
                  ? { width: 9, height: 12 }
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

export function BatchStoryboardImageSettings({
  aspectOptions,
  sizeOptions,
  qualityOptions,
  countOptions,
  selectedAspect,
  selectedSize,
  selectedQuality,
  selectedCount,
  onAspectSelect,
  onSizeSelect,
  onQualitySelect,
  onCountSelect,
}: {
  aspectOptions: BatchStoryboardChoice[];
  sizeOptions: BatchStoryboardChoice[];
  qualityOptions: BatchStoryboardChoice[];
  countOptions: BatchStoryboardChoice[];
  selectedAspect: string;
  selectedSize: string;
  selectedQuality: string;
  selectedCount: string;
  onAspectSelect: (value: string) => void;
  onSizeSelect: (value: string) => void;
  onQualitySelect: (value: string) => void;
  onCountSelect: (value: string) => void;
}) {
  const pillButtonClass = (selected: boolean) =>
    `flex h-8 flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-solid px-2 text-[13px] transition-colors duration-200 ${
      selected
        ? "border-border-emphasis bg-canvas-controls-active text-fg-default"
        : "border-border-muted bg-transparent text-fg-muted hover:bg-canvas-controls-hover hover:text-fg-default"
    }`;
  const ratioCardClass = (selected: boolean) =>
    `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-lg border border-solid px-1 py-2 transition-colors duration-200 ${
      selected
        ? "border-border-emphasis bg-canvas-controls-active text-fg-default"
        : "border-border-muted bg-transparent text-fg-muted hover:bg-canvas-controls-hover hover:text-fg-default"
    }`;

  const sections = [
    sizeOptions.length,
    qualityOptions.length,
    aspectOptions.length,
    countOptions.length,
  ].some(Boolean);

  return (
    <div className="flex w-[380px] flex-col gap-2 rounded-2xl p-3">
      {sizeOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-fg-muted">分辨率</div>
          <div className="flex flex-wrap gap-2">
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
      {qualityOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-fg-muted">质量</div>
          <div className="grid grid-cols-3 gap-2">
            {qualityOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={pillButtonClass(item.value === selectedQuality)}
                onClick={() => onQualitySelect(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {aspectOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-fg-muted">比例</div>
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
      {countOptions.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium text-fg-muted">生成数量</div>
          <div className="flex flex-wrap gap-2">
            {countOptions.map((item) => (
              <button
                key={item.value}
                type="button"
                className={pillButtonClass(item.value === selectedCount)}
                onClick={() => onCountSelect(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {!sections ? (
        <div className="px-2 py-3 text-xs text-fg-muted">
          当前 endpoint 没有可选的比例、尺寸、质量或数量参数
        </div>
      ) : null}
    </div>
  );
}

export function BatchStoryboardChoiceList({
  options,
  selected,
  onSelect,
}: {
  options: BatchStoryboardChoice[];
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
