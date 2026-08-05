"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { NodeToolbar, Position } from "@xyflow/react";
import {
  ArrowUp,
  ArrowRightToLine,
  Plus,
  Play,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  formatBillingPoints,
  isFreeBillingModel,
} from "@/workflow/ideart/lib/models/billing-estimate";
import { WorkflowThreeDGenerationPlaceholder } from "./nodes/workflow-node-placeholders";
import {
  WorkflowExtraParametersPanel,
  getWorkflowExtraParameterDefaults,
  normalizeWorkflowExtraParameterDefinitions,
  resolveWorkflowExtraParameterValues,
} from "./workflow-extra-parameters";
import { WorkflowAnchoredPopover } from "./workflow-anchored-popover";
import { WorldNodeIcon } from "./nodes/workflow-node-icons";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  TAPNOW_NODE_MIN_SIZE,
  TAPNOW_NODE_PANEL_BACKGROUND,
} from "./surface-contracts";
import {
  WORKFLOW_NODE_TITLE_BAR_CLASS,
  WORKFLOW_NODE_TITLE_BAR_LARGE_STYLE,
  getWorkflowNodeTitleWidth,
} from "./workflow-connections";
import {
  isWorkflowChoiceDefault,
  normalizeWorkflowRedrawChoices,
  workflowChoiceValueExists,
} from "./generation-options";
import {
  fetchWorkflowModelOptions,
  findWorkflowModelOptionByIdentity,
  getWorkflowModelOptionValue,
  normalizeWorkflowModelIdentity,
  workflowModelOptionsCache,
} from "./workflow-models";
import { isRenderableWorkflowMediaUrl } from "./workflow-media-utils";
import {
  ExpandCornersIcon,
  MarbleModelIcon,
  MicrophoneIcon,
  SparklesTokenIcon,
} from "./workflow-icons";
import { ModelPopupList, WorkflowModelIcon } from "./generation-popovers";
import type {
  ThreeDReferenceCard,
  WorkflowModelOption,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";
import type {
  WorkflowGenerateNodeHandler,
  WorkflowGenerationSubmitSettings,
} from "./surface-contracts";

export function TapNowThreeDNode({
  node,
  selected,
  showFloatingControls,
  upstreamNodes = [],
  onUpdateNode,
  onReferenceFilesUploaded,
  onReferenceNodeRemoved,
  onGenerateNode,
  onOpenThreeDWorld,
}: {
  node: LibTvWorkflowNode;
  selected: boolean;
  showFloatingControls: boolean;
  dragging: boolean;
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onReferenceFilesUploaded?: (id: string, files: File[]) => void;
  onReferenceNodeRemoved?: (id: string, sourceId: string) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
  onOpenThreeDWorld?: (id: string) => void;
}) {
  const [title, setTitle] = useState(String(node.data?.title || "3D World"));
  const prompt = String(node.data?.prompt || "");
  const running = Boolean(node.data?.workflowGenerationRunning);
  const progress = Number(node.data?.workflowGenerationProgress);
  const progressValue = Number.isFinite(progress)
    ? Math.max(0, Math.min(0.99, progress))
    : undefined;
  const thumbnailUrl = String(
    node.data?.thumbnailUrl || node.data?.panoUrl || "",
  ).trim();
  const worldUrl = String(
    node.data?.worldUrl || node.data?.worldMarbleUrl || "",
  ).trim();
  const modelUrl = String(
    node.data?.colliderMeshUrl ||
      node.data?.splatUrl ||
      node.data?.mediaUrl ||
      "",
  ).trim();
  const caption = String(node.data?.caption || "").trim();
  const referenceImages = Array.isArray(node.data?.referenceImages)
    ? node.data.referenceImages
    : [];
  const referenceImageNodeIds = Array.isArray(node.data?.referenceImageNodeIds)
    ? node.data.referenceImageNodeIds
    : [];
  const referenceCards = useMemo<ThreeDReferenceCard[]>(() => {
    const cards: ThreeDReferenceCard[] = [];
    const seen = new Set<string>();
    const pushCard = (card: ThreeDReferenceCard) => {
      const dedupeKey = String(
        card.sourceId || card.mediaUrl || card.key || "",
      ).trim();
      if (dedupeKey && seen.has(dedupeKey)) return;
      if (dedupeKey) seen.add(dedupeKey);
      cards.push(card);
    };
    referenceImages.forEach((url, index) => {
      const mediaUrl = String(url || "").trim();
      if (!mediaUrl) return;
      const sourceId = String(referenceImageNodeIds[index] || "").trim();
      const upstream = sourceId
        ? upstreamNodes.find((item) => item.id === sourceId)
        : undefined;
      pushCard({
        key: `image-${sourceId || "manual"}-${index}-${mediaUrl}`,
        kind: "image",
        title: upstream?.title || `参考图 ${index + 1}`,
        mediaUrl,
        sourceId,
        referenceIndex: index,
      });
    });
    upstreamNodes
      .filter((item) => item.kind === "image" && item.mediaRole === "ordinary")
      .forEach((item, index) => {
        const mediaUrl = String(item.mediaUrl || "").trim();
        if (!mediaUrl) return;
        pushCard({
          key: `upstream-image-${item.id}-${index}`,
          kind: "image",
          title: item.title || `参考图 ${index + 1}`,
          mediaUrl,
          sourceId: item.id,
        });
      });
    upstreamNodes
      .filter((item) => item.kind === "video" && item.mediaRole === "ordinary")
      .forEach((item, index) => {
        pushCard({
          key: `video-${item.id}-${index}`,
          kind: "video",
          title: item.title || `参考视频 ${index + 1}`,
          mediaUrl: item.mediaUrl,
          sourceId: item.id,
        });
      });
    return cards;
  }, [referenceImageNodeIds, referenceImages, upstreamNodes]);
  const hasReferenceInput = referenceCards.length > 0;
  const hasResult = Boolean(worldUrl || modelUrl || thumbnailUrl);

  useEffect(() => {
    setTitle(String(node.data?.title || "3D World"));
  }, [node.data?.title]);

  return (
    <div
      className="group node-shell relative h-full w-full overflow-visible rounded-2xl bg-[var(--Surface-secondary-background)] text-fg-default"
      data-testid={`canvas-node-threed-${node.id}`}
      style={{
        minWidth: TAPNOW_NODE_MIN_SIZE,
        minHeight: TAPNOW_NODE_MIN_SIZE,
        background: TAPNOW_NODE_PANEL_BACKGROUND,
        color: "var(--fg-default, rgba(255,255,255,0.9))",
        boxShadow: selected
          ? "var(--workflow-node-shadow-selected)"
          : "var(--workflow-node-shadow)",
      }}
    >
      {hasResult && !running ? (
        <NodeToolbar
          nodeId={node.id}
          isVisible={selected}
          position={Position.Top}
          offset={12}
          align="center"
          className="node-float-ui nodrag nopan nowheel"
        >
          <div
            className="pointer-events-auto flex h-12 w-fit flex-nowrap items-center justify-between gap-1 whitespace-nowrap rounded-full border border-[var(--canvas-controls-border)] bg-[var(--canvas-controls-bg)] p-1 text-canvas-controls-text shadow-[var(--canvas-shadow-menu)] backdrop-blur-lg"
            data-testid="canvas-node-toolbar"
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={stopWorkflowNodeChromeEvent}
          >
            <ul className="flex flex-nowrap items-center gap-[2px]">
              <li className="flex h-10 w-fit items-center justify-center rounded-full">
                <button
                  type="button"
                  className="group/button relative z-0 flex h-10 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-transparent px-3 py-1 text-xs text-nowrap transition-all duration-200 hover:bg-canvas-controls-hover focus-visible:outline-none"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenThreeDWorld?.(node.id);
                  }}
                >
                  <span
                    className="pointer-events-none absolute inset-0 z-[-1] rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/button:opacity-100"
                    style={{
                      background:
                        "radial-gradient(200% 140% at 50% 40.25%, rgb(26,26,26) 16%, rgb(101,103,102) 85%)",
                    }}
                  />
                  <ArrowRightToLine className="size-5" />
                  <span>进入 3D 世界</span>
                </button>
              </li>
            </ul>
          </div>
        </NodeToolbar>
      ) : null}
      <div
        className={WORKFLOW_NODE_TITLE_BAR_CLASS}
        style={WORKFLOW_NODE_TITLE_BAR_LARGE_STYLE}
      >
        <span
          className="flex shrink-0 items-center text-fg-muted"
          style={{ width: 15.2, height: 15.2 }}
        >
          <WorldNodeIcon size={15.2} />
        </span>
        <div
          className="relative min-w-0 max-w-full shrink"
          style={{ width: getWorkflowNodeTitleWidth(title || "3D World") }}
        >
          <span
            className="pointer-events-none invisible inline-block select-none whitespace-pre align-top"
            aria-hidden="true"
            style={{ fontSize: 15.2, lineHeight: "22.8px" }}
          >
            {title || "3D World"}
          </span>
          <input
            placeholder="请输入标题"
            className="nodrag nopan nowheel absolute inset-0 box-border h-auto w-full border-none bg-transparent p-0 text-inherit outline-none"
            data-testid="canvas-node-title"
            value={title}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={stopWorkflowNodeChromeEvent}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() =>
              onUpdateNode?.(node.id, { title: title.trim() || "3D World" })
            }
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            style={{ fontSize: 15.2, lineHeight: "22.8px", minWidth: 0 }}
          />
        </div>
        <span
          className="inline-flex shrink-0 items-center rounded-full border border-border-muted bg-canvas-controls-hover px-1.5 py-1 text-[10px] font-medium leading-none text-fg-muted"
          style={{
            fontSize: 11.4,
            lineHeight: 1.2,
            padding: "2.3px 7.6px",
            borderRadius: 15.2,
          }}
        >
          Beta
        </span>
      </div>

      <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
        {thumbnailUrl ? (
          <>
            <img
              src={thumbnailUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="absolute left-0 top-0 h-[400%] w-[400%] max-w-none object-cover blur-[4px] brightness-[1.8]"
              style={{
                transformOrigin: "0 0",
                transform: "translate(-36%, -34%) scale(1)",
              }}
            />
            <div
              className="absolute overflow-hidden rounded-[inherit]"
              style={{ inset: 2 }}
            >
              <img
                src={thumbnailUrl}
                alt={title || "3D World"}
                draggable={false}
                className="absolute max-w-none object-cover"
                style={{
                  left: -2,
                  top: -2,
                  width: "calc(400% + 16px)",
                  height: "calc(400% + 16px)",
                  transformOrigin: "0 0",
                  transform: "translate(-36%, -34%) scale(1)",
                }}
              />
              <div className="absolute inset-0 rounded-[inherit] backdrop-blur-[4px] backdrop-brightness-[0.8]" />
            </div>
          </>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: "var(--workflow-threed-empty-background)" }}
          >
            <WorldNodeIcon className="opacity-22" size={54} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/18 via-transparent to-black/8" />
        {running ? (
          <WorkflowThreeDGenerationPlaceholder progress={progressValue} />
        ) : null}
        {hasResult && !running ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-200 opacity-60"
            title={caption || undefined}
          >
            <WorldNodeIcon
              className="text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
              size={48}
            />
          </div>
        ) : !running ? (
          <div className="absolute inset-x-4 bottom-4 z-10 text-center text-xs leading-5 text-fg-muted">
            输入提示词，或连接图片/视频生成 3D 世界
          </div>
        ) : null}
      </div>

      {showFloatingControls && !running && !node.data?.suppressGenerationBar ? (
        <ThreeDGenerationBar
          prompt={prompt}
          modelId={String(node.data?.modelId || "")}
          workflowExtraParameters={node.data?.workflowExtraParameters}
          running={running}
          hasReferenceInput={hasReferenceInput}
          referenceCards={referenceCards}
          onPromptChange={(value) => onUpdateNode?.(node.id, { prompt: value })}
          onModelChange={(value) => onUpdateNode?.(node.id, { modelId: value })}
          onGenerationSettingsChange={(patch) => onUpdateNode?.(node.id, patch)}
          onReferenceFilesUploaded={(files) =>
            onReferenceFilesUploaded?.(node.id, files)
          }
          onReferenceRemoved={(card) => {
            if (card.sourceId) {
              onReferenceNodeRemoved?.(node.id, card.sourceId);
              return;
            }
            if (typeof card.referenceIndex === "number") {
              onUpdateNode?.(node.id, {
                referenceImages: referenceImages.filter(
                  (_, index) => index !== card.referenceIndex,
                ),
                referenceImageNodeIds: referenceImageNodeIds.filter(
                  (_, index) => index !== card.referenceIndex,
                ),
              });
            }
          }}
          onGenerate={(promptDraft, settings) =>
            onGenerateNode?.(node.id, promptDraft, settings)
          }
        />
      ) : null}
    </div>
  );
}

export function resolveWorkflowThreeDMode(
  items:
    | Array<{
        id?: string;
        label?: string;
        isDefault?: boolean;
        config?: Record<string, any>;
      }>
    | undefined,
  current: string,
  hasReferenceInput: boolean,
) {
  const options = normalizeWorkflowRedrawChoices(items, []);
  if (options.length === 0) return "";
  const compatible = options.filter(
    (option) =>
      !(option.config?.requiresReferenceImages === true && !hasReferenceInput),
  );
  const candidates = compatible.length > 0 ? compatible : options;
  if (workflowChoiceValueExists(current, candidates)) return current;
  const autoMatch = candidates.find((option) => {
    const rule = String(option.config?.autoSelectWhen || "")
      .trim()
      .toLowerCase();
    return hasReferenceInput
      ? rule === "has-reference-image"
      : rule === "no-reference";
  });
  return (
    autoMatch?.value ||
    candidates.find((option) => isWorkflowChoiceDefault(option))?.value ||
    candidates[0]?.value ||
    ""
  );
}

export function ThreeDGenerationBar({
  prompt,
  modelId,
  workflowExtraParameters,
  running,
  hasReferenceInput,
  referenceCards = [],
  onPromptChange,
  onModelChange,
  onGenerationSettingsChange,
  onReferenceFilesUploaded,
  onReferenceRemoved,
  onGenerate,
}: {
  prompt: string;
  modelId?: string;
  workflowExtraParameters?: LibTvWorkflowNode["data"]["workflowExtraParameters"];
  running?: boolean;
  hasReferenceInput?: boolean;
  referenceCards?: ThreeDReferenceCard[];
  onPromptChange: (value: string) => void;
  onModelChange?: (value: string) => void;
  onGenerationSettingsChange?: (
    patch: Partial<WorkflowGenerationSubmitSettings>,
  ) => void;
  onReferenceFilesUploaded?: (files: File[]) => void;
  onReferenceRemoved?: (card: ThreeDReferenceCard) => void;
  onGenerate?: (
    promptDraft?: string,
    settings?: WorkflowGenerationSubmitSettings,
  ) => void;
}) {
  const [draftPrompt, setDraftPrompt] = useState(prompt);
  const [modelOptions, setModelOptions] = useState<WorkflowModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modelPopoverRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const resolvedModels = modelOptions;
  const selectedModel =
    findWorkflowModelOptionByIdentity(resolvedModels, modelId) ||
    resolvedModels.find((model) => model.isDefault) ||
    resolvedModels[0] ||
    null;
  const selectedModelValue =
    getWorkflowModelOptionValue(selectedModel) || modelId || "";
  const selectedModelIconUrl = isRenderableWorkflowMediaUrl(
    String(selectedModel?.icon || ""),
  )
    ? String(selectedModel?.icon)
    : "";
  const selectedThreeDMode = useMemo(
    () =>
      resolveWorkflowThreeDMode(
        selectedModel?.parameters?.modes,
        String(workflowExtraParameters?.mode || ""),
        Boolean(hasReferenceInput),
      ),
    [
      hasReferenceInput,
      selectedModel?.parameters?.modes,
      workflowExtraParameters?.mode,
    ],
  );
  const extraParameterDefinitions = useMemo(
    () =>
      normalizeWorkflowExtraParameterDefinitions(
        selectedModel?.parameters?.extraParameters,
        selectedThreeDMode,
      ),
    [selectedModel?.parameters?.extraParameters, selectedThreeDMode],
  );
  const threeDParameterDefinitions = useMemo(
    () => [
      ...(selectedModel?.parameters?.modes?.length
        ? [
            {
              type: "mode",
              label: "模式",
              control: "select" as const,
              defaultValue: selectedThreeDMode,
              options: selectedModel.parameters.modes,
            },
          ]
        : []),
      ...extraParameterDefinitions,
    ],
    [
      extraParameterDefinitions,
      selectedModel?.parameters?.modes,
      selectedThreeDMode,
    ],
  );
  const resolvedExtraParameters = useMemo(
    () =>
      resolveWorkflowExtraParameterValues(
        threeDParameterDefinitions,
        workflowExtraParameters,
      ),
    [threeDParameterDefinitions, workflowExtraParameters],
  );
  const selectedModelCost = selectedModel
    ? isFreeBillingModel(selectedModel)
      ? 0
      : Number(selectedModel.cost)
    : null;
  const tokenCostLabel = formatBillingPoints(
    typeof selectedModelCost === "number" && Number.isFinite(selectedModelCost)
      ? selectedModelCost
      : null,
  );
  const canGenerate =
    Boolean(selectedModelValue) &&
    (draftPrompt.trim().length > 0 || Boolean(hasReferenceInput)) &&
    !running;

  useEffect(() => {
    setDraftPrompt((current) => (current === prompt ? current : prompt));
  }, [prompt]);

  useEffect(() => {
    let cancelled = false;
    const cached = workflowModelOptionsCache.get("3d");
    if (cached) {
      setModelOptions(cached);
      return;
    }
    setModelsLoading(true);
    fetchWorkflowModelOptions("3d")
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
    };
  }, []);

  useEffect(() => {
    if (modelId || !selectedModelValue) return;
    const defaults = getWorkflowExtraParameterDefaults(
      threeDParameterDefinitions,
    );
    if (onGenerationSettingsChange) {
      onGenerationSettingsChange({
        modelId: selectedModelValue,
        workflowExtraParameters:
          Object.keys(defaults).length > 0 ? defaults : undefined,
      });
    } else {
      onModelChange?.(selectedModelValue);
    }
  }, [
    modelId,
    onGenerationSettingsChange,
    onModelChange,
    selectedModelValue,
    threeDParameterDefinitions,
  ]);

  useEffect(() => {
    if (!selectedModel) return;
    if (
      JSON.stringify(workflowExtraParameters || {}) ===
      JSON.stringify(resolvedExtraParameters)
    )
      return;
    onGenerationSettingsChange?.({
      workflowExtraParameters:
        Object.keys(resolvedExtraParameters).length > 0
          ? resolvedExtraParameters
          : undefined,
    });
  }, [
    onGenerationSettingsChange,
    resolvedExtraParameters,
    selectedModel,
    workflowExtraParameters,
  ]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (
        !target ||
        modelTriggerRef.current?.contains(target) ||
        modelPopoverRef.current?.contains(target)
      )
        return;
      setModelMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [modelMenuOpen]);

  const commitModel = useCallback(
    (value: string) => {
      const nextModel = findWorkflowModelOptionByIdentity(
        resolvedModels,
        value,
      );
      const nextValue =
        getWorkflowModelOptionValue(nextModel) ||
        normalizeWorkflowModelIdentity(value);
      if (!nextValue) return;
      const nextMode = resolveWorkflowThreeDMode(
        nextModel?.parameters?.modes,
        "",
        Boolean(hasReferenceInput),
      );
      const nextDefinitions = normalizeWorkflowExtraParameterDefinitions(
        nextModel?.parameters?.extraParameters,
        nextMode,
      );
      const defaults = getWorkflowExtraParameterDefaults([
        ...(nextModel?.parameters?.modes?.length
          ? [
              {
                type: "mode",
                label: "模式",
                control: "select" as const,
                defaultValue: nextMode,
                options: nextModel.parameters.modes,
              },
            ]
          : []),
        ...nextDefinitions,
      ]);
      if (onGenerationSettingsChange) {
        onGenerationSettingsChange({
          modelId: nextValue,
          workflowExtraParameters:
            Object.keys(defaults).length > 0 ? defaults : undefined,
        });
      } else {
        onModelChange?.(nextValue);
      }
      setModelMenuOpen(false);
    },
    [
      hasReferenceInput,
      onGenerationSettingsChange,
      onModelChange,
      resolvedModels,
    ],
  );

  const commitPrompt = useCallback(
    (value: string) => {
      setDraftPrompt(value);
      onPromptChange(value);
    },
    [onPromptChange],
  );

  const toggleInputExpanded = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setModelMenuOpen(false);
      setInputExpanded((current) => !current);
      window.requestAnimationFrame(() => promptTextareaRef.current?.focus());
    },
    [],
  );

  const handleReferenceFilesChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      event.currentTarget.value = "";
      if (files.length > 0) onReferenceFilesUploaded?.(files);
    },
    [onReferenceFilesUploaded],
  );

  const renderReferenceCard = useCallback(
    (card: ThreeDReferenceCard) => {
      const mediaUrl = String(card.mediaUrl || "").trim();
      return (
        <button
          key={card.key}
          type="button"
          className="group/ref relative flex h-[38px] min-w-[104px] max-w-[148px] shrink-0 items-center gap-2 overflow-hidden rounded-[10px] border border-border-muted bg-canvas-controls-hover px-2 pr-6 text-left text-fg-muted transition-all hover:border-border-emphasis hover:bg-canvas-controls-active hover:text-fg-default"
          title={card.title}
          onClick={stopWorkflowNodeChromeEvent}
        >
          <span className="relative flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-black/24 text-white/64">
            {card.kind === "image" && mediaUrl ? (
              <img
                src={mediaUrl}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : card.kind === "video" ? (
              <Play className="size-3.5" />
            ) : (
              <Upload className="size-3.5" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-medium leading-4">
              {card.kind === "video" ? "参考视频" : "参考图"}
            </span>
            <span className="block truncate text-[11px] leading-3 text-fg-subtle">
              {card.title}
            </span>
          </span>
          <span
            role="button"
            tabIndex={0}
            className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-black text-white opacity-0 transition-opacity group-hover/ref:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onReferenceRemoved?.(card);
            }}
          >
            <X className="size-3" />
          </span>
        </button>
      );
    },
    [onReferenceRemoved],
  );

  return (
    <div
      className="node-float-ui nodrag nopan nowheel pointer-events-auto absolute left-1/2 z-20 w-full min-w-[640px] max-w-[650px]"
      data-canvas-generator-root=""
      data-testid="canvas-node-generation-input-bar"
      style={{
        bottom: "calc(-12px * var(--workflow-float-scale, 1))",
        transform:
          "translateX(-50%) translateY(100%) scale(var(--workflow-float-scale, 1))",
        transformOrigin: "center top",
      }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="relative mt-2 w-full rounded-[20px] border border-[var(--canvas-node-border)] bg-[var(--Surface-secondary-background)] text-fg-default shadow-[var(--canvas-shadow-menu)]">
        <div className="flex min-w-0 items-center gap-2 px-3 pb-2 pt-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*"
                multiple
                onChange={handleReferenceFilesChange}
              />
              <button
                type="button"
                className="flex size-[38px] shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-canvas-controls-hover transition-all hover:bg-canvas-controls-active"
                data-state="closed"
                aria-label="添加输入"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <Plus className="size-4 text-fg-muted" />
              </button>
            </div>
            {referenceCards.length > 0 ? (
              <>
                <div className="h-4 w-px shrink-0 bg-border-muted" />
                <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                  {referenceCards.map(renderReferenceCard)}
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 cursor-pointer p-1 text-fg-muted transition-colors hover:text-fg-default"
            data-testid="canvas-node-generation-input-bar-maximize-button"
            aria-pressed={inputExpanded}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={toggleInputExpanded}
          >
            <ExpandCornersIcon />
          </button>
        </div>
        <div
          className="relative flex flex-1 justify-between px-3"
          data-testid="canvas-node-prompt-textarea"
        >
          <textarea
            ref={promptTextareaRef}
            placeholder="想象一个 3D 世界..."
            className={`${inputExpanded ? "h-[320px] max-h-[420px] min-h-[320px]" : "h-20 max-h-[120px] min-h-20"} w-full resize-none overflow-y-auto border-0 bg-transparent px-0 py-3 text-sm text-fg-default transition-[height] duration-200 ease-out placeholder:text-fg-subtle focus:outline-none focus:ring-0`}
            rows={1}
            value={draftPrompt}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={stopWorkflowNodeChromeEvent}
            onKeyDown={stopWorkflowNodeChromeEvent}
            onChange={(event) => commitPrompt(event.target.value)}
          />
        </div>
        <div
          className="flex h-14 w-full items-center justify-between p-2"
          data-testid="canvas-node-generation-action-bar"
        >
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              ref={modelTriggerRef}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-fg-default transition-colors hover:bg-canvas-controls-hover"
              data-testid="canvas-node-threed-model-select"
              title={selectedModel?.name || "选择 3D 模型"}
              onClick={(event) => {
                event.stopPropagation();
                setModelMenuOpen((open) => !open);
              }}
            >
              {selectedModelIconUrl ? (
                <WorkflowModelIcon
                  iconUrl={selectedModelIconUrl}
                  name={selectedModel?.name}
                />
              ) : (
                <MarbleModelIcon />
              )}
              <span
                className="max-w-[160px] truncate"
                title={selectedModel?.name || "选择 3D 模型"}
              >
                {modelsLoading
                  ? "加载模型..."
                  : selectedModel?.name || "选择 3D 模型"}
              </span>
            </button>
            {modelMenuOpen ? (
              <WorkflowAnchoredPopover
                anchorRef={modelTriggerRef}
                popoverRef={modelPopoverRef}
                side="top"
                align="start"
                gap={0}
                margin={12}
                heightLimit={409}
                ariaLabel="3D 世界模型"
                testId="workflow-threed-model-popover"
                className="rounded-2xl border-[0.5px] border-card-border bg-panel-background/95 p-1 text-sm text-fg-default shadow-[0_1px_3px_rgba(0,0,0,0.05),0_20px_25px_-5px_rgba(0,0,0,0.05),0_10px_10px_-5px_rgba(0,0,0,0.04)] backdrop-blur-[32px]"
              >
                <ModelPopupList
                  title="3D 世界模型"
                  models={resolvedModels}
                  loading={modelsLoading}
                  selected={selectedModelValue}
                  onSelect={commitModel}
                />
              </WorkflowAnchoredPopover>
            ) : null}
          </div>
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              className="flex shrink-0 items-center justify-center rounded-lg px-2.5 py-2.5 text-fg-default transition-colors hover:bg-canvas-controls-hover"
              aria-label="语音输入"
            >
              <MicrophoneIcon />
            </button>
            <div className="h-4 w-px shrink-0 bg-border-muted" />
            <div
              className="flex items-center gap-1 rounded-full border border-border-muted p-1"
              style={{
                backdropFilter: "blur(10px)",
                background: "var(--workflow-token-pill-background)",
              }}
            >
              <div className="flex items-center pl-1 text-sm font-medium text-fg-default">
                <SparklesTokenIcon />
                <span className="inline-flex min-w-6 justify-center text-[12px] tabular-nums">
                  {tokenCostLabel}
                </span>
              </div>
              <button
                type="button"
                disabled={!canGenerate}
                className="flex h-[26px] w-[26px] cursor-pointer items-center justify-center rounded-full bg-[var(--btn-invert-bg)] text-sm font-medium text-[var(--btn-invert-text)] transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Generate"
                data-testid="canvas-node-generate-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  const submitSettings: WorkflowGenerationSubmitSettings = {
                    modelId: selectedModelValue,
                    workflowExtraParameters:
                      Object.keys(resolvedExtraParameters).length > 0
                        ? { ...resolvedExtraParameters }
                        : undefined,
                  };
                  onGenerationSettingsChange?.(submitSettings);
                  onGenerate?.(draftPrompt, submitSettings);
                }}
              >
                {running ? (
                  <RefreshCw className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
            </div>
          </div>
        </div>
        {threeDParameterDefinitions.length > 0 ? (
          <div className="border-t border-border-muted bg-[var(--workflow-node-control-background)] px-3 pb-3">
            <WorkflowExtraParametersPanel
              definitions={threeDParameterDefinitions}
              values={resolvedExtraParameters}
              disabled={running}
              onChange={(patch) =>
                onGenerationSettingsChange?.({
                  workflowExtraParameters: {
                    ...resolvedExtraParameters,
                    ...patch,
                  },
                })
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
