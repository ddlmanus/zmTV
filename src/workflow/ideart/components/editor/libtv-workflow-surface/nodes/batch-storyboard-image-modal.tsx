"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Filter,
  Image as ImageIcon,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import {
  WorkflowExtraParametersPanel,
  type WorkflowExtraParameterDefinition,
  type WorkflowExtraParameterValue,
} from "../workflow-extra-parameters";
import {
  BatchStoryboardConfigChip,
  BatchStoryboardImageSettings,
  BatchStoryboardModelList,
  type BatchStoryboardChoice,
  type BatchStoryboardModelOption,
} from "./batch-storyboard-controls";

export type BatchStoryboardImageRow = {
  rowIndex: number;
  label: string;
  prompt: string;
};

type ActivePopup = "model" | "settings" | "advanced" | null;

export function BatchStoryboardImageModal({
  open,
  nodeId,
  rows,
  models,
  modelsLoading,
  selectedModel,
  selectedModelValue,
  endpointModeLabel,
  aspectOptions,
  sizeOptions,
  qualityOptions,
  countOptions,
  selectedAspect,
  selectedSize,
  selectedQuality,
  selectedCount,
  supportsWebSearch,
  webSearchEnabled,
  extraParameterDefinitions,
  extraParameters,
  managedValues,
  referenceImageCount,
  onModelChange,
  onAspectChange,
  onSizeChange,
  onQualityChange,
  onCountChange,
  onWebSearchChange,
  onExtraParametersChange,
  onClose,
  onConfirm,
}: {
  open: boolean;
  nodeId: string;
  rows: BatchStoryboardImageRow[];
  models: BatchStoryboardModelOption[];
  modelsLoading: boolean;
  selectedModel: BatchStoryboardModelOption | null;
  selectedModelValue: string;
  endpointModeLabel?: string;
  aspectOptions: BatchStoryboardChoice[];
  sizeOptions: BatchStoryboardChoice[];
  qualityOptions: BatchStoryboardChoice[];
  countOptions: BatchStoryboardChoice[];
  selectedAspect: string;
  selectedSize: string;
  selectedQuality: string;
  selectedCount: string;
  supportsWebSearch: boolean;
  webSearchEnabled: boolean;
  extraParameterDefinitions: WorkflowExtraParameterDefinition[];
  extraParameters?: Record<string, WorkflowExtraParameterValue>;
  managedValues?: Record<string, WorkflowExtraParameterValue>;
  referenceImageCount: number;
  onModelChange: (value: string) => void;
  onAspectChange: (value: string) => void;
  onSizeChange: (value: string) => void;
  onQualityChange: (value: string) => void;
  onCountChange: (value: string) => void;
  onWebSearchChange: (value: boolean) => void;
  onExtraParametersChange: (
    value: Record<string, WorkflowExtraParameterValue> | undefined,
  ) => void;
  onClose: () => void;
  onConfirm: (rowIndexes: number[]) => void;
}) {
  const [selectedRows, setSelectedRows] = useState<Set<number>>(
    () => new Set(rows.map((row) => row.rowIndex)),
  );
  const [expandedRows, setExpandedRows] = useState<Set<number>>(
    () => new Set(),
  );
  const [activePopup, setActivePopup] = useState<ActivePopup>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedRows(new Set(rows.map((row) => row.rowIndex)));
    setExpandedRows(new Set());
    setActivePopup(null);
  }, [open, rows]);

  const settingsLabel = useMemo(
    () =>
      [
        sizeOptions.find((item) => item.value === selectedSize)?.label ||
          selectedSize,
        qualityOptions.find((item) => item.value === selectedQuality)?.label ||
          selectedQuality,
        aspectOptions.find((item) => item.value === selectedAspect)?.label ||
          selectedAspect,
        countOptions.length > 0
          ? countOptions.find((item) => item.value === selectedCount)?.label ||
            selectedCount
          : "",
      ]
        .filter(Boolean)
        .join(" · ") || "生成参数",
    [
      aspectOptions,
      countOptions,
      qualityOptions,
      selectedAspect,
      selectedCount,
      selectedQuality,
      selectedSize,
      sizeOptions,
    ],
  );

  if (!open) return null;

  const selectedCountRows = selectedRows.size;
  const allSelected = rows.length > 0 && selectedCountRows === rows.length;
  const closePopup = () => setActivePopup(null);

  return createPortal(
    <div
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/55 px-5 text-white"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return;
        onClose();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <section
        className="nodrag nopan nowheel flex w-[min(1088px,calc(100vw-96px))] max-w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#181818] shadow-[0_24px_80px_rgba(0,0,0,0.56)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`scriptv2-batch-storyboard-title-${nodeId}`}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-[64px] shrink-0 items-center justify-between bg-[#181818] px-6">
          <h2
            id={`scriptv2-batch-storyboard-title-${nodeId}`}
            className="text-[18px] font-medium text-white"
          >
            分镜批量生图
          </h2>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="关闭"
            onClick={onClose}
          >
            <X className="size-5" strokeWidth={1.8} />
          </button>
        </header>
        <div className="flex min-h-0 flex-col p-4">
          <div className="mb-3 rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-5 text-white/65">
            会优先使用已生成的角色、场景和道具参考图，让画面更贴合分镜内容
          </div>
          <div className="tiny-scrollbar max-h-[320px] overflow-y-auto rounded-lg border border-[#363636]">
            {rows.map((row) => {
              const selected = selectedRows.has(row.rowIndex);
              const expanded = expandedRows.has(row.rowIndex);
              return (
                <div
                  key={row.rowIndex}
                  className="border-b border-[#363636] px-3 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-4">
                    <label className="flex shrink-0 cursor-pointer items-center gap-2">
                      <input
                        aria-label={`选择${row.label}`}
                        className="nodrag h-3.5 w-3.5 cursor-pointer accent-white"
                        type="checkbox"
                        checked={selected}
                        onChange={(event) => {
                          setSelectedRows((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(row.rowIndex);
                            else next.delete(row.rowIndex);
                            return next;
                          });
                        }}
                      />
                      <span className="whitespace-nowrap text-xs text-white">
                        {row.label}
                      </span>
                    </label>
                    <span
                      className={`min-w-0 flex-1 text-xs leading-5 text-[#919191] ${expanded ? "" : "line-clamp-1"}`}
                      title={row.prompt}
                    >
                      {row.prompt || "暂无分镜提示词"}
                    </span>
                    <button
                      type="button"
                      aria-label={`${row.label}详情`}
                      aria-expanded={expanded}
                      className="shrink-0 cursor-pointer text-xs text-[#919191] transition-colors hover:text-[#F7F7F7]"
                      onClick={() => {
                        setExpandedRows((current) => {
                          const next = new Set(current);
                          if (next.has(row.rowIndex)) next.delete(row.rowIndex);
                          else next.add(row.rowIndex);
                          return next;
                        });
                      }}
                    >
                      详情
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  className="nodrag h-3.5 w-3.5 cursor-pointer accent-white"
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) =>
                    setSelectedRows(
                      event.target.checked
                        ? new Set(rows.map((row) => row.rowIndex))
                        : new Set(),
                    )
                  }
                />
                <span className="text-[11px] text-white/65">
                  已选 {selectedCountRows}/{rows.length}
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <BatchStoryboardConfigChip
                  icon={
                    selectedModel?.iconUrl ? (
                      <img
                        src={selectedModel.iconUrl}
                        alt=""
                        className="size-4 object-contain"
                      />
                    ) : (
                      <Sparkles className="size-4" strokeWidth={1.7} />
                    )
                  }
                  label={selectedModel?.name || "选择图片模型"}
                  open={activePopup === "model"}
                  variant="model"
                  onClick={() =>
                    setActivePopup((current) =>
                      current === "model" ? null : "model",
                    )
                  }
                  onClose={closePopup}
                >
                  <BatchStoryboardModelList
                    title="图片模型"
                    options={models}
                    loading={modelsLoading}
                    selected={selectedModelValue}
                    onSelect={(value) => {
                      onModelChange(value);
                      closePopup();
                    }}
                  />
                </BatchStoryboardConfigChip>
                {endpointModeLabel ? (
                  <span
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-[#F7F7F7]"
                    title={endpointModeLabel}
                  >
                    <ImageIcon className="size-4" />
                    <span>{endpointModeLabel}</span>
                  </span>
                ) : null}
                {aspectOptions.length > 0 ||
                sizeOptions.length > 0 ||
                qualityOptions.length > 0 ||
                countOptions.length > 0 ? (
                  <BatchStoryboardConfigChip
                    icon={<Settings2 className="size-4" />}
                    label={settingsLabel}
                    open={activePopup === "settings"}
                    variant="settings"
                    onClick={() =>
                      setActivePopup((current) =>
                        current === "settings" ? null : "settings",
                      )
                    }
                    onClose={closePopup}
                  >
                    <BatchStoryboardImageSettings
                      aspectOptions={aspectOptions}
                      sizeOptions={sizeOptions}
                      qualityOptions={qualityOptions}
                      countOptions={countOptions}
                      selectedAspect={selectedAspect}
                      selectedSize={selectedSize}
                      selectedQuality={selectedQuality}
                      selectedCount={selectedCount}
                      onAspectSelect={onAspectChange}
                      onSizeSelect={onSizeChange}
                      onQualitySelect={onQualityChange}
                      onCountSelect={onCountChange}
                    />
                  </BatchStoryboardConfigChip>
                ) : null}
                {supportsWebSearch || extraParameterDefinitions.length > 0 ? (
                  <BatchStoryboardConfigChip
                    icon={<Filter className="size-4" />}
                    label="更多参数"
                    open={activePopup === "advanced"}
                    variant="advanced"
                    onClick={() =>
                      setActivePopup((current) =>
                        current === "advanced" ? null : "advanced",
                      )
                    }
                    onClose={closePopup}
                  >
                    <div className="w-[min(420px,calc(100vw-24px))] p-3 text-fg-default">
                      {supportsWebSearch ? (
                        <div className="flex items-center justify-between text-[13px]">
                          <span>联网搜索</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={webSearchEnabled}
                            className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${webSearchEnabled ? "bg-[var(--btn-invert-bg)]" : "bg-canvas-controls-active"}`}
                            onClick={() => onWebSearchChange(!webSearchEnabled)}
                          >
                            <span
                              className={`block size-4 rounded-full shadow transition-transform ${webSearchEnabled ? "translate-x-4 bg-[var(--btn-invert-text)]" : "translate-x-0.5 bg-fg-muted"}`}
                            />
                          </button>
                        </div>
                      ) : null}
                      {extraParameterDefinitions.length > 0 ? (
                        <WorkflowExtraParametersPanel
                          definitions={extraParameterDefinitions}
                          values={extraParameters}
                          context={{
                            modelId: selectedModelValue,
                            referenceImageCount,
                            managedValues,
                          }}
                          onChange={(patch) =>
                            onExtraParametersChange({
                              ...(extraParameters || {}),
                              ...patch,
                            })
                          }
                        />
                      ) : null}
                    </div>
                  </BatchStoryboardConfigChip>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#F7F7F7] px-4 text-[13px] font-normal text-[#171717] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={selectedCountRows === 0 || !selectedModelValue}
              onClick={() =>
                onConfirm(
                  rows
                    .map((row) => row.rowIndex)
                    .filter((rowIndex) => selectedRows.has(rowIndex)),
                )
              }
            >
              确认并创建生成器组 ({selectedCountRows})
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
