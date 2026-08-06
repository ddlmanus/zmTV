"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  LibTvWorkflowNode,
  LibTvWorkflowVideoResult,
} from "@/workflow/ideart/lib/libtv/workflow";
import { triggerBrowserDownload } from "@/workflow/ideart/lib/url/download-url";
import {
  LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import { WorkflowVideoGenerationPlaceholder } from "./nodes/workflow-node-placeholders";
import { TextLineIcon } from "./nodes/workflow-node-icons";
import { stopWorkflowNodeChromeEvent } from "./nodes/workflow-node-utils";
import {
  getWorkflowImageRenderUrl,
  parseWorkflowAspectRatioSize,
  workflowOrdinaryImageDisplayFrameFromRatio,
} from "./workflow-media-utils";
import {
  OrdinaryVideoPlayer,
  TextNodeToolbar,
  WorkflowGenerationErrorState,
  ZMTV_NODE_SURFACE_BACKGROUND,
  ZMTV_NODE_SURFACE_BORDER,
  ZMTV_NODE_SURFACE_SELECTED_BORDER,
  ZMTV_NODE_SURFACE_SELECTED_SHADOW,
  ZMTV_NODE_SURFACE_SHADOW,
  ZmtvNodeEmptyGlyph,
} from "./node-shared-ui";
import { DownloadIcon, ExpandCornersLargeIcon } from "./workflow-icons";
import {
  WORKFLOW_NODE_TITLE_BAR_STYLE,
  getWorkflowNodeTitleWidth,
} from "./workflow-connections";
import { NodeGenerationBar } from "./generation-composer";
import type {
  WorkflowGenerateNodeHandler,
} from "./surface-contracts";
import type {
  WorkflowImagePresetResult,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";

export function WorkflowVideoGeneratorResultStrip({
  node,
  results,
  collapsed,
  generationRunning,
  generationProgress,
  selected = false,
  dragging = false,
  onUpdateNode,
}: {
  node: LibTvWorkflowNode;
  results: LibTvWorkflowVideoResult[];
  collapsed: boolean;
  generationRunning?: boolean;
  generationProgress?: number;
  selected?: boolean;
  dragging?: boolean;
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
  const ratioSize = parseWorkflowAspectRatioSize(aspectRatio, 16, 9);
  const frame = workflowOrdinaryImageDisplayFrameFromRatio(
    ratioSize.width,
    ratioSize.height,
  );
  const width = Math.max(1, Number(node.width || frame.width));
  const height = Math.max(1, Number(node.height || frame.height));
  const gap = 8;
  const safeTitle = String(node.data?.title || "视频节点").trim() || "视频节点";

  const setPrimary = useCallback(
    (item: LibTvWorkflowVideoResult) => {
      if (!item.url) return;
      onUpdateNode?.(node.id, {
        mediaUrl: item.url,
        thumbnailUrl: item.thumbnailUrl,
        workflowMediaNaturalWidth: item.width,
        workflowMediaNaturalHeight: item.height,
        workflowVideoResultsCollapsed: false,
        workflowMediaUserResized: false,
      });
    },
    [node.id, onUpdateNode],
  );

  const downloadItem = useCallback(
    (item: LibTvWorkflowVideoResult, index: number) => {
      const url = String(item.url || "").trim();
      if (!url) return;
      const name = `${safeTitle}-${index + 1}.mp4`;
      triggerBrowserDownload(url, name);
    },
    [safeTitle],
  );

  if (!primaryItem?.url) return null;

  if (collapsed) {
    return (
      <div className="relative h-full w-full overflow-visible rounded-xl">
        {orderedResults
          .slice()
          .reverse()
          .map((item, reverseIndex) => {
            const stackIndex = orderedResults.length - reverseIndex - 1;
            const isPrimary = stackIndex === 0;
            return (
              <div
                key={item.url + "-" + stackIndex}
                className="absolute inset-0 overflow-hidden rounded-xl"
                style={{
                  left: 12 * stackIndex,
                  top: 4 * stackIndex,
                  transform:
                    "rotate(" +
                    2.5 * stackIndex +
                    "deg) scale(" +
                    (1 - 0.035 * stackIndex) +
                    ")",
                  transformOrigin: "center center",
                  zIndex: orderedResults.length - stackIndex,
                  border: "1px solid var(--canvas-node-border)",
                  background: "var(--Surface-Panel-background, #171717)",
                  pointerEvents: isPrimary ? "auto" : "none",
                }}
              >
                {isPrimary ? (
                  <>
                    <div
                      className="absolute inset-0 transition-transform duration-300"
                      style={{
                        filter: generationRunning ? "blur(24px)" : undefined,
                        transform: generationRunning ? "scale(1.1)" : undefined,
                      }}
                    >
                      <OrdinaryVideoPlayer
                        mediaUrl={primaryItem.url}
                        posterUrl={String(
                          primaryItem.thumbnailUrl ||
                            node.data?.thumbnailUrl ||
                            "",
                        ).trim()}
                        initialDuration={Number(
                          primaryItem.duration ||
                            node.data?.workflowMediaDurationSec ||
                            0,
                        )}
                        initialVolume={Number(
                          node.data?.workflowMediaPlaybackVolume ?? 0.5,
                        )}
                        hasAudio={node.data?.workflowMediaHasAudio !== false}
                        active={selected && !generationRunning}
                        dragging={dragging || Boolean(generationRunning)}
                        fitMode={
                          node.data?.workflowMediaFrameLocked
                            ? "contain"
                            : "cover"
                        }
                        onVolumeChange={(volume) =>
                          onUpdateNode?.(node.id, {
                            workflowMediaPlaybackVolume: volume,
                          })
                        }
                      />
                    </div>
                    {generationRunning ? (
                      <WorkflowVideoGenerationPlaceholder
                        title={String(node.data?.note || "视频生成中")}
                        progress={generationProgress}
                        variant="overlay"
                      />
                    ) : null}
                  </>
                ) : item.thumbnailUrl ? (
                  <img
                    src={getWorkflowImageRenderUrl(item.thumbnailUrl)}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-black" />
                )}
              </div>
            );
          })}
        {results.length > 1 ? (
          <button
            type="button"
            className="nodrag nopan pointer-events-auto absolute right-2 top-2 z-20 flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1.5 text-[13px] text-white transition-colors hover:bg-black/78"
            title={`展开 ${results.length} 个视频`}
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={(event) => {
              event.stopPropagation();
              onUpdateNode?.(node.id, { workflowVideoResultsCollapsed: false });
            }}
          >
            <ExpandCornersLargeIcon />
            <span>{results.length}个</span>
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
        const resultCount = orderedResults.length;
        const columns = resultCount <= 2 ? resultCount : 2;
        const resultWidth =
          resultCount <= 2 ? width : Math.max(1, Math.round((width - gap) / 2));
        const resultHeight =
          resultCount <= 2
            ? height
            : Math.max(1, Math.round((height - gap) / 2));
        const column = resultCount <= 2 ? index : index % columns;
        const row = resultCount <= 2 ? 0 : Math.floor(index / columns);
        return (
          <div
            key={`${item.url}-${index}`}
            className="absolute overflow-hidden rounded-xl"
            style={{
              left: column * (resultWidth + gap),
              top: row * (resultHeight + gap),
              width: resultWidth,
              height: resultHeight,
              zIndex: isPrimary ? 2 : 1,
              border: "1px solid var(--canvas-node-border)",
              background: "var(--Surface-Panel-background, #171717)",
            }}
          >
            <OrdinaryVideoPlayer
              mediaUrl={item.url}
              posterUrl={String(item.thumbnailUrl || "").trim()}
              initialDuration={Number(
                item.duration || node.data?.workflowMediaDurationSec || 0,
              )}
              initialVolume={Number(
                node.data?.workflowMediaPlaybackVolume ?? 0.5,
              )}
              hasAudio={node.data?.workflowMediaHasAudio !== false}
              loadingLabel={
                generationRunning && !item.url
                  ? String(node.data?.note || "视频生成中")
                  : ""
              }
              loadingProgress={
                generationRunning && !item.url ? generationProgress : undefined
              }
              active={selected && isPrimary}
              dragging={dragging}
              fitMode={
                node.data?.workflowMediaFrameLocked ? "contain" : "cover"
              }
              onVolumeChange={(volume) =>
                onUpdateNode?.(node.id, { workflowMediaPlaybackVolume: volume })
              }
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
                      workflowVideoResultsCollapsed: true,
                      mediaUrl: item.url,
                      thumbnailUrl: item.thumbnailUrl,
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
                  设为主视频
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TapNowHandleVisual({
  side,
  visible,
  hidden,
  active,
  visualRef,
  onOpen,
  onHoverChange,
}: {
  side: "left" | "right";
  visible: boolean;
  hidden?: boolean;
  active?: boolean;
  visualRef?: React.RefObject<HTMLButtonElement>;
  onOpen?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const isVisible = visible || active;
  const handleTransform = `translate(${side === "left" ? "25px" : "-25px"}, 0px) scale(1)`;
  return (
    <div
      className={`nodrag nopan pointer-events-none absolute top-1/2 z-[80] flex h-20 w-20 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full ${side === "left" ? "right-full" : "left-full"}`}
      onPointerEnter={() => onHoverChange?.(true)}
      onPointerLeave={() => onHoverChange?.(false)}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        if (hidden) return;
        onOpen?.(event);
      }}
    >
      <button
        ref={visualRef}
        type="button"
        aria-label={side === "left" ? "添加左侧节点" : "添加右侧节点"}
        className={`node-handle-plus ${hidden ? "node-handle-plus-force-hidden" : ""} ${isVisible ? "node-handle-plus-visible" : ""} flex size-5 shrink-0 cursor-crosshair items-center justify-center`}
        style={{ transform: handleTransform }}
        tabIndex={-1}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="9.35" fill="var(--canvas-handle-bg)" />
          <circle
            cx="10"
            cy="10"
            r="9.35"
            stroke="var(--canvas-handle-icon)"
            strokeWidth="1.2"
          />
          <path
            d="M10 6.5v7M6.5 10h7"
            stroke="var(--canvas-handle-icon)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function sanitizeTextNodeHtml(html: string) {
  if (typeof window === "undefined") return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content
    .querySelectorAll("script,style,iframe,object,embed")
    .forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith("on") ||
        name === "style" ||
        name === "color" ||
        name === "bgcolor" ||
        name === "face" ||
        name === "class"
      ) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  return template.innerHTML;
}

export function plainTextToTextNodeHtml(text: string) {
  const lines = String(text || "").split(/\r?\n/);
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  return lines.map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`).join("");
}

export function createWorkflowTextEditorInitialContent(text: string) {
  return plainTextToTextNodeHtml(text);
}

export function escapeWorkflowTextHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderWorkflowMarkdownInline(value: string) {
  return escapeWorkflowTextHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function createWorkflowMarkdownTextContent(text: string) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const blocks: string[] = [];
  let listItems: string[] = [];
  let quoteLines: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      `<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`,
    );
    listItems = [];
  };
  const flushQuote = () => {
    if (!quoteLines.length) return;
    blocks.push(
      `<blockquote>${quoteLines.map((item) => `<p>${item}</p>`).join("")}</blockquote>`,
    );
    quoteLines = [];
  };
  const flushStructured = () => {
    flushList();
    flushQuote();
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushStructured();
      continue;
    }
    if (/^---+$/.test(line)) {
      flushStructured();
      blocks.push("<hr>");
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushStructured();
      const level = Math.min(3, heading[1].length);
      blocks.push(
        `<h${level}>${renderWorkflowMarkdownInline(heading[2])}</h${level}>`,
      );
      continue;
    }
    const list = /^(?:[-*•]|\d+\.)\s+(.+)$/.exec(line);
    if (list) {
      flushQuote();
      listItems.push(renderWorkflowMarkdownInline(list[1]));
      continue;
    }
    const quote = /^>\s?(.+)$/.exec(line);
    if (quote) {
      flushList();
      quoteLines.push(renderWorkflowMarkdownInline(quote[1]));
      continue;
    }
    flushStructured();
    blocks.push(`<p>${renderWorkflowMarkdownInline(line)}</p>`);
  }
  flushStructured();
  return sanitizeTextNodeHtml(blocks.join(""));
}

export function WorkflowTextGeneratingPlaceholder({
  progress,
}: {
  progress?: number;
}) {
  const progressPercent = Number.isFinite(Number(progress))
    ? Math.max(2, Math.min(99, Math.round(Number(progress) * 100)))
    : 2;
  const lineWidths = ["72%", "92%", "86%", "94%", "78%", "88%", "64%"];

  return (
    <div
      className="workflow-text-generating-placeholder pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] px-5 pb-5 pt-12"
      data-testid="canvas-node-text-generating-placeholder"
    >
      <div className="absolute inset-0 bg-[#202020]" />
      <div className="absolute inset-x-5 top-9 h-px bg-white/[0.06]" />
      <div className="relative z-10 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] font-medium leading-none text-white/72">
          <span className="workflow-text-generating-dot size-1.5 rounded-full bg-white/70" />
          <span>正在生成文本</span>
        </div>
        <span className="text-[12px] font-medium leading-none text-white/42 tabular-nums">
          {progressPercent}%
        </span>
      </div>
      <div className="relative z-10 mb-5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-white/50 transition-[width] duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
        <div className="workflow-text-generating-sweep absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      </div>
      <div className="relative z-10 flex flex-col gap-2.5">
        {lineWidths.map((width, index) => (
          <div
            key={`${width}-${index}`}
            className="h-3 rounded-full bg-white/[0.075]"
            style={{ width }}
          />
        ))}
      </div>
    </div>
  );
}

export function TapNowTextNode({
  node,
  selected,
  showFloatingControls,
  dragging,
  onUpdateNode,
  onReferenceFilesUploaded,
  onReferenceNodeRemoved,
  onGenerateNode,
  onRequestGenerationFrame,
  onRequestImageResultFrame,
  onGeneratedResult,
  upstreamNodes,
  projectId,
}: {
  node: LibTvWorkflowNode;
  selected: boolean;
  showFloatingControls: boolean;
  dragging: boolean;
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onReferenceFilesUploaded?: (id: string, files: File[]) => void;
  onImageUpscalePresetFilesUploaded?: (id: string, files: File[]) => void;
  onReferenceNodeRemoved?: (id: string, sourceId: string) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
  onRequestGenerationFrame?: (id: string, aspectRatio: string) => void;
  onRequestImageResultFrame?: (id: string, imageUrl: string) => void;
  onGeneratedResult?: (result: WorkflowImagePresetResult) => void;
  onOpenAddMenu?: (event: React.MouseEvent, side: "left" | "right") => void;
  onRunTextGeneratorPreset?: (id: string, optionId: string) => void;
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
  projectId?: string;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isTextEditor = node.data?.componentType === "text-editor";
  const storedTitle = String(node.data?.title || "Text");
  const displayTitle =
    isTextEditor && /^文本生成器\d*$/.test(storedTitle)
      ? storedTitle.replace(/^文本生成器/, "文本节点")
      : storedTitle;
  const [title, setTitle] = useState(displayTitle);
  const content = String(node.data?.content || "");
  const prompt = String(node.data?.prompt || "");
  const generationError = String(
    node.data?.workflowGenerationError || "",
  ).trim();
  const referenceImages = Array.isArray(node.data?.referenceImages)
    ? node.data.referenceImages
    : [];
  const referenceImageNodeIds = Array.isArray(node.data?.referenceImageNodeIds)
    ? node.data.referenceImageNodeIds
    : [];
  const referenceImageRoles = Array.isArray(node.data?.referenceImageRoles)
    ? node.data.referenceImageRoles
    : [];
  const isGenerating =
    !isTextEditor &&
    (Boolean(node.data?.workflowGenerationRunning) ||
      String(node.data?.note || "").trim() === "生成中...");
  const showGeneratingPlaceholder = isGenerating && !content;
  const generationProgress = Number(node.data?.workflowGenerationProgress);
  const showTextGeneratorEmptyState =
    !isTextEditor &&
    !content &&
    !editing &&
    !showGeneratingPlaceholder &&
    !generationError;

  useEffect(() => {
    setTitle(displayTitle);
  }, [displayTitle]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    editor.innerHTML = content ? sanitizeTextNodeHtml(content) : "";
  }, [content]);

  const commitContent = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    onUpdateNode?.(node.id, {
      content: sanitizeTextNodeHtml(editor.innerHTML),
    });
  }, [node.id, onUpdateNode]);

  useEffect(() => {
    if (!expanded) return;
    const editor = editorRef.current;
    if (editor) {
      editor.innerHTML = content ? sanitizeTextNodeHtml(content) : "";
      editor.focus({ preventScroll: true });
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setExpanded(false);
      commitContent();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [commitContent, content, expanded]);

  const titleFontSize = 12;
  const titleLineHeight = 18;
  const textNodeTitle = title || "Text";
  const textNodeTitleWidth = isTextEditor
    ? Math.min(350, Math.max(64, Number(node.width || 350)))
    : getWorkflowNodeTitleWidth(textNodeTitle);
  return (
    <div
      className="node-shell relative overflow-visible text-fg-default"
      data-testid={`canvas-node-text-${node.id}`}
      style={{
        width: "100%",
        height: "100%",
        minWidth: isTextEditor ? 240 : LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
        minHeight: isTextEditor ? 160 : LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
        color: "var(--fg-default, rgba(255,255,255,0.9))",
      }}
    >
      {isTextEditor ? null : (
        <div
          className={`canvas-text-title-drag-handle absolute inset-x-0 -top-8 h-8 ${editing ? "cursor-text" : "cursor-grab"}`}
        />
      )}
      <div
        className="workflow-node-title-bar node-floating-ui pointer-events-auto absolute left-0 z-[1] flex min-w-0 items-center gap-1 whitespace-nowrap text-left text-fg-muted"
        style={{
          ...WORKFLOW_NODE_TITLE_BAR_STYLE,
          top: -28,
          height: 24,
          width: textNodeTitleWidth,
          maxWidth: textNodeTitleWidth,
        }}
      >
        <span
          className="flex shrink-0 items-center text-fg-muted"
          style={{ width: 12, height: 12 }}
        >
          <TextLineIcon className="size-3" />
        </span>
        <div
          className="relative min-w-0 flex-1 text-fg-muted"
          style={{ maxWidth: isTextEditor ? 330 : undefined }}
        >
          <span
            className="pointer-events-none invisible inline-block select-none whitespace-pre align-top"
            aria-hidden="true"
            style={{
              fontSize: titleFontSize,
              lineHeight: `${titleLineHeight}px`,
            }}
          >
            {textNodeTitle}
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
              onUpdateNode?.(node.id, { title: title.trim() || "Text" })
            }
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            style={{
              fontSize: titleFontSize,
              lineHeight: `${titleLineHeight}px`,
              minWidth: 0,
            }}
          />
        </div>
      </div>

      {isTextEditor && editing && !isGenerating ? (
        <TextNodeToolbar
          nodeId={node.id}
          editorRef={editorRef}
          onExpand={() => setExpanded(true)}
          onEnsureEditing={() => setEditing(true)}
          onCommandComplete={commitContent}
        />
      ) : null}

      <div
        className={`group relative flex h-full w-full flex-col overflow-y-auto rounded-[12px] ${editing ? "nodrag nopan nowheel cursor-text select-text" : "cursor-grab select-none"}`}
        data-testid="canvas-node-text-content"
        style={{
          background: isTextEditor
            ? "var(--Surface-Panel-background, #171717)"
            : ZMTV_NODE_SURFACE_BACKGROUND,
          border: selected
            ? ZMTV_NODE_SURFACE_SELECTED_BORDER
            : ZMTV_NODE_SURFACE_BORDER,
          boxShadow: selected
            ? ZMTV_NODE_SURFACE_SELECTED_SHADOW
            : ZMTV_NODE_SURFACE_SHADOW,
          backdropFilter: "blur(1.5px)",
          padding:
            isTextEditor || editing || content
              ? isTextEditor
                ? "12px 4px 12px 16px"
                : "20px 24px"
              : 0,
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(255, 255, 255, 0.125) transparent",
          userSelect: editing ? "text" : "none",
          WebkitUserSelect: editing ? "text" : "none",
        }}
        onPointerDown={(event) => {
          if (editing) event.stopPropagation();
        }}
        onMouseDown={(event) => {
          if (editing) event.stopPropagation();
        }}
        onClick={(event) => {
          if (editing) event.stopPropagation();
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          setEditing(true);
          requestAnimationFrame(() => editorRef.current?.focus());
        }}
      >
        {showTextGeneratorEmptyState ? (
          <div className="flex h-full flex-col items-center justify-center px-6">
            <ZmtvNodeEmptyGlyph />
          </div>
        ) : null}
        {generationError && !isGenerating ? (
          <WorkflowGenerationErrorState error={generationError} />
        ) : null}
        {showGeneratingPlaceholder ? (
          <WorkflowTextGeneratingPlaceholder progress={generationProgress} />
        ) : null}
        {!showTextGeneratorEmptyState ? (
          <div
            className={
              isTextEditor
                ? `tiny-scrollbar h-full overflow-y-auto pr-3 ${editing ? "nodrag nowheel" : ""}`
                : "h-full w-full"
            }
          >
            <div
              ref={editorRef}
              contentEditable={editing}
              suppressContentEditableWarning
              translate="no"
              className={`tiptap ProseMirror canvas-text-markdown max-w-none text-sm focus:outline-none ${!content ? "is-editor-empty" : ""} ${editing ? "nodrag nopan nowheel cursor-text select-text" : "pointer-events-none cursor-grab select-none"}`}
              data-placeholder={editing ? "输入内容…" : "双击输入文本…"}
              style={{
                userSelect: editing ? "text" : "none",
                WebkitUserSelect: editing ? "text" : "none",
                caretColor: editing
                  ? "var(--fg-default, rgba(255,255,255,0.9))"
                  : "transparent",
              }}
              onPointerDown={(event) => {
                if (editing) event.stopPropagation();
              }}
              onMouseDown={(event) => {
                if (editing) event.stopPropagation();
              }}
              onClick={(event) => {
                if (editing) event.stopPropagation();
              }}
              onMouseUp={() => {
                document.dispatchEvent(new Event("selectionchange"));
              }}
              onSelect={() => {
                document.dispatchEvent(new Event("selectionchange"));
              }}
              onKeyUp={() => {
                document.dispatchEvent(new Event("selectionchange"));
              }}
              onKeyDown={(event) => {
                if (editing) event.stopPropagation();
              }}
              onBlur={() => {
                setEditing(false);
                commitContent();
              }}
              onInput={() => {
                document.dispatchEvent(new Event("selectionchange"));
                commitContent();
              }}
            />
          </div>
        ) : null}
      </div>

      {showFloatingControls &&
      !dragging &&
      !isTextEditor &&
      !node.data?.suppressGenerationBar ? (
        <NodeGenerationBar
          kind={node.kind}
          modelId={node.data?.modelId}
          workflowEndpointMethod={node.data?.workflowEndpointMethod}
          selectedOptionId={node.data?.selectedOptionId}
          promptInputDisabled={node.data?.workflowPromptDisabled}
          promptPlaceholderText={node.data?.workflowPromptPlaceholder}
          prompt={prompt}
          onPromptChange={(value) => onUpdateNode?.(node.id, { prompt: value })}
          onModelChange={(value) => onUpdateNode?.(node.id, { modelId: value })}
          aspectRatio={node.data?.aspectRatio}
          imageSize={node.data?.imageSize}
          stylePreset={node.data?.stylePreset}
          videoMethod={node.data?.videoMethod}
          videoDuration={node.data?.videoDuration}
          videoResolution={node.data?.videoResolution}
          generateAudio={node.data?.generateAudio}
          enableWebSearch={node.data?.enableWebSearch}
          generationCount={node.data?.generationCount}
          cameraControl={node.data?.cameraControl}
          videoCameraMotion={node.data?.videoCameraMotion}
          videoCharacterAssets={node.data?.videoCharacterAssets}
          workflowPortraitTextureSettings={
            node.data?.workflowPortraitTextureSettings
          }
          workflowExtraParameters={node.data?.workflowExtraParameters}
          onGenerationSettingsChange={(patch) => onUpdateNode?.(node.id, patch)}
          onRequestGenerationFrame={(nextAspectRatio) =>
            onRequestGenerationFrame?.(node.id, nextAspectRatio)
          }
          projectId={projectId}
          onGeneratedResult={(result) => {
            onGeneratedResult?.(result);
            onRequestImageResultFrame?.(node.id, result.imageUrl);
          }}
          onGenerate={async (promptDraft, settings) => {
            onUpdateNode?.(node.id, {
              ...(typeof promptDraft === "string"
                ? { prompt: promptDraft }
                : {}),
              ...settings,
            });
            const generationStarted = await onGenerateNode?.(
              node.id,
              promptDraft,
              settings,
            );
            if (generationStarted === false) {
              onUpdateNode?.(node.id, { suppressGenerationBar: false });
              return false;
            }
            onUpdateNode?.(node.id, { suppressGenerationBar: true });
            return true;
          }}
          referenceImages={referenceImages}
          referenceImageNodeIds={referenceImageNodeIds}
          referenceImageRoles={referenceImageRoles}
          upstreamNodes={upstreamNodes}
          onReferenceFilesUploaded={(files) =>
            onReferenceFilesUploaded?.(node.id, files)
          }
          onReferenceRemoved={(index, sourceId) => {
            if (sourceId) {
              onReferenceNodeRemoved?.(node.id, sourceId);
              return;
            }
            const nextReferenceImages = referenceImages.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            const nextReferenceNodeIds = referenceImageNodeIds.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            const nextReferenceRoles = referenceImageRoles.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            onUpdateNode?.(node.id, {
              referenceImages: nextReferenceImages,
              referenceImageNodeIds: nextReferenceNodeIds,
              referenceImageRoles: nextReferenceRoles,
            });
          }}
        />
      ) : null}
      {expanded ? (
        <div
          className="nodrag nopan fixed inset-0 flex flex-col"
          style={{
            zIndex: 400,
            background: "rgba(10, 10, 10, 0.95)",
            backdropFilter: "blur(8px)",
          }}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
        >
          <div
            className="flex shrink-0 items-center justify-between border-b border-solid border-white/[0.08] px-6 opacity-100 transition-opacity duration-300"
            style={{ height: 56 }}
          >
            <div className="flex items-center gap-3">
              <span className="text-base font-medium text-white/90">
                {title || "Text"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                title="关闭 (ESC)"
                onClick={() => {
                  setExpanded(false);
                  commitContent();
                }}
              >
                <X className="pointer-events-none size-3" strokeWidth={2} />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="mx-auto flex h-full max-w-3xl flex-col">
              <div className="sticky top-0 z-10 flex justify-center bg-[rgba(10,10,10,0.95)] pb-4">
                <div className="flex items-center">
                  <TextNodeToolbar
                    nodeId={`${node.id}-fullscreen`}
                    editorRef={editorRef}
                    fullscreen
                    showExpand={false}
                    onEnsureEditing={() => setEditing(true)}
                    onCommandComplete={commitContent}
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <div className="tiptap-editor-wrapper">
                  <div>
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      translate="no"
                      className="tiptap ProseMirror markdown-content outline-none min-h-[100px] text-sm"
                      tabIndex={0}
                      style={{
                        color: "var(--fg-default)",
                        caretColor: "var(--fg-default)",
                      }}
                      onMouseUp={() =>
                        document.dispatchEvent(new Event("selectionchange"))
                      }
                      onSelect={() =>
                        document.dispatchEvent(new Event("selectionchange"))
                      }
                      onKeyUp={() =>
                        document.dispatchEvent(new Event("selectionchange"))
                      }
                      onKeyDown={stopWorkflowNodeChromeEvent}
                      onInput={(event) => {
                        document.dispatchEvent(new Event("selectionchange"));
                        onUpdateNode?.(node.id, {
                          content: sanitizeTextNodeHtml(
                            event.currentTarget.innerHTML,
                          ),
                        });
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
