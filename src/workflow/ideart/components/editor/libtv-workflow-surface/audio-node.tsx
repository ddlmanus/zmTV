"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  Check,
  Download,
  List,
  Mic,
  Pause,
  Play,
  Upload,
  X,
} from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  resolveImageDownloadUrl,
  triggerBrowserDownload,
} from "@/workflow/ideart/lib/url/download-url";
import {
  estimateFixedGenerationPoints,
  formatBillingPoints,
} from "@/workflow/ideart/lib/models/billing-estimate";
import { WorkflowAudioGenerationPlaceholder } from "./nodes/workflow-node-placeholders";
import { WorkflowAnchoredPopover } from "./workflow-anchored-popover";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  CANVAS_CONTROLS_MENU_PANEL_STYLE,
  TAPNOW_NODE_MIN_SIZE,
  TAPNOW_NODE_PANEL_BACKGROUND,
} from "./surface-contracts";
import {
  WORKFLOW_NODE_TITLE_BAR_CLASS,
  WORKFLOW_NODE_TITLE_BAR_LARGE_STYLE,
  getWorkflowNodeTitleWidth,
} from "./workflow-connections";
import {
  isRenderableWorkflowMediaUrl,
  isWorkflowViewportMovingFromElement,
} from "./workflow-media-utils";
import {
  fetchWorkflowModelOptions,
  findWorkflowModelOptionByIdentity,
  getWorkflowModelOptionValue,
  normalizeWorkflowModelIdentity,
  workflowModelOptionsCache,
  workflowModelOptionsListeners,
} from "./workflow-models";
import {
  normalizeWorkflowRedrawChoices,
  normalizeWorkflowRedrawChoicesForMethod,
  pickWorkflowRedrawDefault,
} from "./generation-options";
import {
  AdaptiveAudioIcon,
  ExpandCornersIcon,
  SparklesTokenIcon,
} from "./workflow-icons";
import { ModelPopupList, WorkflowModelIcon } from "./generation-popovers";
import type {
  WorkflowModelOption,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";
import type { WorkflowGenerateNodeHandler } from "./surface-contracts";

export function TapNowAudioNode({
  node,
  selected,
  showFloatingControls,
  upstreamNodes: _upstreamNodes,
  onUpdateNode,
  onMediaFileReplace,
  onGenerateNode,
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
  onMediaFileReplace?: (id: string, file: File) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
}) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioExtraParametersRef = useRef<
    Record<string, string | number | boolean>
  >({});
  const [title, setTitle] = useState(String(node.data?.title || "Audio"));
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const prompt = String(node.data?.prompt || "");
  const lyrics = String(node.data?.lyrics || "");
  const audioExtraParameters = node.data?.workflowExtraParameters || {};
  const audioMode = String(audioExtraParameters.audioMode || "music");
  const audioDuration = String(audioExtraParameters.audioDuration || "auto");
  const mediaUrl = String(node.data?.mediaUrl || "").trim();
  const isOrdinaryAudioNode = node.data?.mediaRole === "ordinary";
  const generationRunning = Boolean(node.data?.workflowGenerationRunning);
  const generationProgressRaw = Number(node.data?.workflowGenerationProgress);
  const generationProgress = Number.isFinite(generationProgressRaw)
    ? Math.max(0, Math.min(0.99, generationProgressRaw))
    : undefined;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = Math.max(
    0,
    Math.min(safeDuration || currentTime || 0, currentTime || 0),
  );
  const progress =
    safeDuration > 0
      ? Math.max(0, Math.min(1, safeCurrentTime / safeDuration))
      : 0;

  useEffect(() => {
    audioExtraParametersRef.current = audioExtraParameters;
  }, [audioExtraParameters]);

  const updateAudioExtraParameter = useCallback(
    (key: "audioMode" | "audioDuration", value: string) => {
      const next = {
        ...audioExtraParametersRef.current,
        [key]: value,
      };
      audioExtraParametersRef.current = next;
      onUpdateNode?.(node.id, { workflowExtraParameters: next });
    },
    [node.id, onUpdateNode],
  );

  const formatAudioTime = useCallback((value: number) => {
    const total = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    setTitle(String(node.data?.title || "Audio"));
  }, [node.data?.title]);

  useEffect(() => {
    if (!isOrdinaryAudioNode) return;
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [isOrdinaryAudioNode, mediaUrl]);

  useEffect(() => {
    if (!isOrdinaryAudioNode || !mediaUrl) {
      setWaveform([]);
      return;
    }
    let cancelled = false;
    const fallback = Array.from(
      { length: 54 },
      (_, index) => 0.22 + ((index * 17) % 58) / 100,
    );
    const isLocalDecodableAudio =
      mediaUrl.startsWith("blob:") ||
      mediaUrl.startsWith("data:") ||
      mediaUrl.startsWith("/") ||
      !/^https?:\/\//i.test(mediaUrl);
    if (!isLocalDecodableAudio) {
      setWaveform(fallback);
      return () => {
        cancelled = true;
      };
    }
    let mediaOrigin = "";
    try {
      mediaOrigin = new URL(mediaUrl, window.location.href).origin;
    } catch {
      mediaOrigin = "";
    }
    if (mediaOrigin && mediaOrigin !== window.location.origin) {
      setWaveform(fallback);
      return () => {
        cancelled = true;
      };
    }
    fetch(mediaUrl)
      .then((response) =>
        response.ok
          ? response.arrayBuffer()
          : Promise.reject(new Error("audio fetch failed")),
      )
      .then((buffer) => {
        const audioWindow = window as Window &
          typeof globalThis & { webkitAudioContext?: typeof AudioContext };
        const AudioContextCtor =
          audioWindow.AudioContext || audioWindow.webkitAudioContext;
        if (!AudioContextCtor) throw new Error("audio context unavailable");
        const context = new AudioContextCtor();
        return context.decodeAudioData(buffer.slice(0)).finally(() => {
          void context.close();
        });
      })
      .then((audioBuffer) => {
        if (cancelled) return;
        const channelData = audioBuffer.getChannelData(0);
        const bars = 54;
        const blockSize = Math.max(1, Math.floor(channelData.length / bars));
        const values = Array.from({ length: bars }, (_, index) => {
          let sum = 0;
          const start = index * blockSize;
          const end = Math.min(channelData.length, start + blockSize);
          for (let i = start; i < end; i += 1)
            sum += Math.abs(channelData[i] || 0);
          return Math.min(
            1,
            Math.max(0.08, (sum / Math.max(1, end - start)) * 4),
          );
        });
        setWaveform(values);
      })
      .catch(() => {
        if (!cancelled) setWaveform(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [isOrdinaryAudioNode, mediaUrl]);

  useEffect(() => {
    if (!isOrdinaryAudioNode) return;
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const values =
      waveform.length > 0
        ? waveform
        : Array.from(
            { length: 54 },
            (_, index) => 0.22 + ((index * 17) % 58) / 100,
          );
    const gap = 7 * dpr;
    const barWidth = Math.max(
      3 * dpr,
      (width - gap * (values.length - 1)) / values.length,
    );
    const centerY = height / 2;
    const activeX = width * progress;
    values.forEach((value, index) => {
      const barHeight = Math.max(14 * dpr, value * height * 0.72);
      const x = index * (barWidth + gap);
      const y = centerY - barHeight / 2;
      context.fillStyle =
        x <= activeX ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.36)";
      context.beginPath();
      const radius = Math.min(barWidth / 2, 5 * dpr);
      context.roundRect(x, y, barWidth, barHeight, radius);
      context.fill();
    });
  }, [isOrdinaryAudioNode, progress, waveform]);

  const toggleAudioPlayback = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const audio = audioRef.current;
      if (!audio || !mediaUrl) return;
      if (audio.paused) {
        void audio
          .play()
          .then(() => setPlaying(true))
          .catch(() => setPlaying(false));
      } else {
        audio.pause();
        setPlaying(false);
      }
    },
    [mediaUrl],
  );

  const downloadAudio = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!mediaUrl) return;
      const safeTitle =
        String(title || node.data?.title || "audio")
          .trim()
          .replace(/[\\/:*?"<>|]+/g, "-") || "audio";
      triggerBrowserDownload(
        resolveImageDownloadUrl(mediaUrl),
        `${safeTitle}.mp3`,
      );
    },
    [mediaUrl, node.data?.title, title],
  );

  const toggleLyrics = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setLyricsOpen((open) => !open);
  }, []);

  return (
    <div
      className="group node-shell relative h-full w-full overflow-visible rounded-2xl bg-[var(--Surface-secondary-background)] text-fg-default"
      data-testid={`canvas-node-audio-${node.id}`}
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
      <div
        className={WORKFLOW_NODE_TITLE_BAR_CLASS}
        style={WORKFLOW_NODE_TITLE_BAR_LARGE_STYLE}
      >
        <span
          className="flex shrink-0 items-center text-fg-muted"
          style={{ width: 15.2, height: 15.2 }}
        >
          <TapNowNodeIcon kind="audio" size={15.2} />
        </span>
        <div
          className="relative min-w-0 max-w-full shrink"
          style={{ width: getWorkflowNodeTitleWidth(title || "Audio") }}
        >
          <span
            className="pointer-events-none invisible inline-block select-none whitespace-pre align-top"
            aria-hidden="true"
            style={{ fontSize: 15.2, lineHeight: "22.8px" }}
          >
            {title || "Audio"}
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
              onUpdateNode?.(node.id, { title: title.trim() || "Audio" })
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
      </div>

      {generationRunning && !mediaUrl ? (
        <div
          className="workflow-media-node relative flex h-full w-full cursor-default flex-col overflow-hidden rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-media-background)]"
          data-testid="canvas-node-audio-generating"
        >
          <WorkflowAudioGenerationPlaceholder
            title={String(node.data?.note || "音频生成中...")}
            progress={generationProgress}
          />
        </div>
      ) : isOrdinaryAudioNode ? (
        <div
          className="workflow-media-node relative flex h-full w-full cursor-default flex-col overflow-hidden rounded-2xl border border-[var(--canvas-node-border)] bg-[var(--workflow-node-media-background)]"
          data-testid="canvas-node-audio-content"
        >
          {showFloatingControls ? (
            <div
              className="node-float-ui nodrag nopan nowheel pointer-events-auto absolute left-1/2 top-2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full p-1 text-canvas-controls-text"
              style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
              data-testid="canvas-node-audio-toolbar"
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
            >
              <button
                type="button"
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs transition-colors hover:bg-canvas-controls-hover"
                aria-label="下载音频"
                onClick={downloadAudio}
              >
                <Download className="size-4" />
                <span>下载</span>
              </button>
              <button
                type="button"
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs transition-colors hover:bg-canvas-controls-hover"
                aria-label="查看歌词"
                onClick={toggleLyrics}
              >
                <List className="size-4" />
                <span>歌词</span>
              </button>
              <button
                type="button"
                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs transition-colors hover:bg-canvas-controls-hover"
                aria-label="替换音频"
                onClick={(event) => {
                  event.stopPropagation();
                  uploadInputRef.current?.click();
                }}
              >
                <Upload className="size-4" />
                <span>替换</span>
              </button>
            </div>
          ) : null}
          {lyricsOpen ? (
            <div
              className="node-float-ui nodrag nopan nowheel pointer-events-auto absolute left-1/2 top-14 z-40 flex max-h-[220px] w-[min(520px,calc(100%-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl text-canvas-controls-text"
              style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
              data-testid="canvas-node-audio-lyrics-panel"
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
            >
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-muted px-3">
                <span className="text-sm font-medium text-fg-default">
                  歌词
                </span>
                <button
                  type="button"
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
                  aria-label="关闭歌词"
                  onClick={(event) => {
                    event.stopPropagation();
                    setLyricsOpen(false);
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 overflow-y-auto whitespace-pre-wrap px-4 py-3 text-sm leading-6 text-fg-muted">
                {lyrics.trim() || "暂无歌词"}
              </div>
            </div>
          ) : null}
          <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center cursor-grab">
            <div
              className="pointer-events-none absolute inset-0 z-20"
              style={{ background: "var(--workflow-audio-edge-fade)" }}
            />
            <div className="relative z-10 h-[120px] w-full cursor-grab touch-none select-none overflow-visible px-4">
              <canvas
                ref={waveformCanvasRef}
                className="pointer-events-none block h-full w-full"
                style={{ filter: "var(--workflow-node-waveform-filter)" }}
              />
              <div
                className="pointer-events-none absolute inset-y-[10%] z-30 flex -translate-x-1/2 flex-col items-center px-1"
                style={{ left: `${progress * 100}%` }}
              >
                <svg
                  width="10"
                  height="6"
                  viewBox="0 0 10 6"
                  className="shrink-0"
                >
                  <path d="M0 0h10L5 6z" fill="#38bdf8" />
                </svg>
                <div className="w-0.5 flex-1 rounded-full bg-[#38bdf8]" />
                <div className="absolute left-1/2 top-full mt-1 hidden -translate-x-1/2 flex-col items-center">
                  <svg
                    width="8"
                    height="4"
                    viewBox="0 0 8 4"
                    className="-mb-px"
                  >
                    <path d="M0 4L4 0l4 4z" fill="#38bdf8" />
                  </svg>
                  <span className="whitespace-nowrap rounded-md bg-[#38bdf8] px-2 py-0.5 text-xs font-medium text-white">
                    {formatAudioTime(safeCurrentTime)}/
                    {formatAudioTime(safeDuration)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center justify-end gap-2 pb-4 pt-2">
            <div className="flex items-center justify-center gap-5">
              <span className="inline-flex w-12 justify-end text-xs font-medium tabular-nums text-fg-muted">
                {formatAudioTime(safeCurrentTime)}
              </span>
              <button
                type="button"
                className="nodrag nopan nowheel group relative flex size-[36px] cursor-pointer items-center justify-center rounded-full bg-[var(--btn-invert-bg)] text-[var(--btn-invert-text)] transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                aria-label={playing ? "pause" : "play"}
                disabled={!mediaUrl}
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onClick={toggleAudioPlayback}
              >
                {playing ? (
                  <Pause className="size-4 fill-current" />
                ) : (
                  <Play className="ml-0.5 size-4 fill-current" />
                )}
              </button>
              <span className="inline-flex w-12 justify-start text-xs font-medium tabular-nums text-fg-muted">
                {safeDuration ? formatAudioTime(safeDuration) : "--:--"}
              </span>
            </div>
          </div>
          <audio
            ref={audioRef}
            src={mediaUrl || undefined}
            preload="metadata"
            className="hidden"
            onLoadedMetadata={(event) => {
              const nextDuration = event.currentTarget.duration;
              setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
            }}
            onTimeUpdate={(event) => {
              if (isWorkflowViewportMovingFromElement(event.currentTarget))
                return;
              setCurrentTime(event.currentTarget.currentTime || 0);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <TapNowNodeIcon kind="audio" size={48} opacity={0.2} />
        </div>
      )}

      {showFloatingControls ? (
        <>
          {!isOrdinaryAudioNode && !generationRunning ? (
            <button
              type="button"
              className="node-float-ui nodrag nopan pointer-events-auto absolute left-1/2 z-20 flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-canvas-controls-text"
              style={{
                ...CANVAS_CONTROLS_MENU_PANEL_STYLE,
                bottom: "calc(100% + 24px)",
                transform:
                  "translateX(-50%) scale(var(--workflow-float-scale, 1))",
                transformOrigin: "center bottom",
              }}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={(event) => {
                event.stopPropagation();
                uploadInputRef.current?.click();
              }}
            >
              <Upload className="size-4" />
              <span className="text-sm">上传</span>
            </button>
          ) : null}
          <input
            ref={uploadInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onMediaFileReplace?.(node.id, file);
            }}
          />
          {!isOrdinaryAudioNode &&
          !generationRunning &&
          !node.data?.suppressGenerationBar ? (
            <AudioGenerationBar
              prompt={prompt}
              lyrics={lyrics}
              modelId={String(node.data?.modelId || "")}
              audioMode={audioMode}
              audioDuration={audioDuration}
              onPromptChange={(value) =>
                onUpdateNode?.(node.id, { prompt: value })
              }
              onLyricsChange={(value) =>
                onUpdateNode?.(node.id, { lyrics: value })
              }
              onModelChange={(value) =>
                onUpdateNode?.(node.id, { modelId: value })
              }
              onAudioModeChange={(value) =>
                updateAudioExtraParameter("audioMode", value)
              }
              onAudioDurationChange={(value) =>
                updateAudioExtraParameter("audioDuration", value)
              }
              onGenerate={(promptDraft) => {
                onUpdateNode?.(node.id, {
                  ...(typeof promptDraft === "string"
                    ? { prompt: promptDraft }
                    : {}),
                  suppressGenerationBar: true,
                });
                onGenerateNode?.(node.id, promptDraft);
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function AudioGenerationBar({
  prompt,
  lyrics,
  modelId,
  audioMode,
  audioDuration,
  onPromptChange,
  onLyricsChange,
  onModelChange,
  onAudioModeChange,
  onAudioDurationChange,
  onGenerate,
  embedded = false,
}: {
  prompt: string;
  lyrics: string;
  modelId?: string;
  audioMode?: string;
  audioDuration?: string;
  onPromptChange: (value: string) => void;
  onLyricsChange: (value: string) => void;
  onModelChange?: (value: string) => void;
  onAudioModeChange?: (value: string) => void;
  onAudioDurationChange?: (value: string) => void;
  onGenerate?: (promptDraft?: string) => void;
  /** Layout-only switch for projected views such as the storyboard. */
  embedded?: boolean;
}) {
  const modelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const modelPopoverRef = useRef<HTMLDivElement | null>(null);
  const audioModeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const audioModePopoverRef = useRef<HTMLDivElement | null>(null);
  const [modelOptions, setModelOptions] = useState<WorkflowModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [lyricsExpanded, setLyricsExpanded] = useState(Boolean(lyrics.trim()));
  const [audioModeMenuOpen, setAudioModeMenuOpen] = useState(false);
  const [audioDurationMenuOpen, setAudioDurationMenuOpen] = useState(false);
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
  const selectedModelIconUrl = isRenderableWorkflowMediaUrl(
    String(selectedModel?.icon || ""),
  )
    ? String(selectedModel?.icon)
    : "";
  const audioModeOptions = useMemo(() => {
    const modes = selectedModel?.parameters?.modes?.length
      ? selectedModel.parameters.modes
      : selectedModel?.parameters?.methods;
    return normalizeWorkflowRedrawChoices(modes, []);
  }, [selectedModel]);
  const selectedAudioMode =
    audioModeOptions.find((option) => option.value === audioMode) ||
    audioModeOptions[0];
  const selectedAudioModeValue = selectedAudioMode?.value || "";
  const audioDurationOptions = useMemo(
    () =>
      normalizeWorkflowRedrawChoicesForMethod(
        selectedModel?.parameters?.durations,
        [],
        selectedAudioModeValue,
      ),
    [selectedAudioModeValue, selectedModel?.parameters?.durations],
  );
  const selectedAudioDuration =
    audioDurationOptions.find((option) => option.value === audioDuration) ||
    audioDurationOptions[0];
  const tokenCostLabel = formatBillingPoints(
    selectedModel
      ? estimateFixedGenerationPoints(selectedModel, 1).totalPoints
      : null,
  );
  const canGenerate = Boolean(selectedModelValue) && prompt.trim().length > 0;

  useEffect(() => {
    let cancelled = false;
    const applyCached = () => {
      const cached = workflowModelOptionsCache.get("audio");
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
    fetchWorkflowModelOptions("audio")
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
    if (!modelId && selectedModelValue) onModelChange?.(selectedModelValue);
  }, [modelId, onModelChange, selectedModelValue]);

  useEffect(() => {
    if (selectedAudioMode && selectedAudioMode.value !== audioMode) {
      onAudioModeChange?.(selectedAudioMode.value);
    }
  }, [audioMode, onAudioModeChange, selectedAudioMode]);

  useEffect(() => {
    if (lyrics.trim()) setLyricsExpanded(true);
  }, [lyrics]);

  const commitAudioModel = useCallback(
    (value: string) => {
      const nextModel = findWorkflowModelOptionByIdentity(modelOptions, value);
      const nextValue =
        getWorkflowModelOptionValue(nextModel) ||
        normalizeWorkflowModelIdentity(value);
      if (!nextValue) return;
      const nextModes = normalizeWorkflowRedrawChoices(
        nextModel?.parameters?.modes?.length
          ? nextModel.parameters.modes
          : nextModel?.parameters?.methods,
        [],
      );
      const nextMode = pickWorkflowRedrawDefault(
        "",
        nextModel?.parameters?.modes?.length
          ? nextModel.parameters.modes
          : nextModel?.parameters?.methods,
        nextModes,
        nextModes[0]?.value || "",
      );
      const nextDurations = normalizeWorkflowRedrawChoicesForMethod(
        nextModel?.parameters?.durations,
        [],
        nextMode,
      );
      const nextDuration = pickWorkflowRedrawDefault(
        "",
        nextModel?.parameters?.durations,
        nextDurations,
        nextDurations[0]?.value || "",
        nextMode,
      );
      onModelChange?.(nextValue);
      if (nextMode) onAudioModeChange?.(nextMode);
      if (nextDuration) onAudioDurationChange?.(nextDuration);
      setModelMenuOpen(false);
    },
    [modelOptions, onAudioDurationChange, onAudioModeChange, onModelChange],
  );

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

  useEffect(() => {
    if (!audioModeMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (
        !target ||
        audioModeTriggerRef.current?.contains(target) ||
        audioModePopoverRef.current?.contains(target)
      ) {
        return;
      }
      setAudioModeMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [audioModeMenuOpen]);

  return (
    <div
      className={
        embedded
          ? "workflow-audio-generation-bar nodrag nopan nowheel pointer-events-auto relative z-20 w-full"
          : "node-float-ui nodrag nopan nowheel pointer-events-auto absolute left-1/2 z-20 w-full min-w-[640px] max-w-[650px]"
      }
      style={
        embedded
          ? undefined
          : {
              bottom: "calc(-12px * var(--workflow-float-scale, 1))",
              transform:
                "translateX(-50%) translateY(100%) scale(var(--workflow-float-scale, 1))",
              transformOrigin: "center top",
            }
      }
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className={`relative w-full rounded-[20px] border border-[var(--canvas-node-border)] bg-[var(--Surface-secondary-background)] text-fg-default shadow-[var(--canvas-shadow-menu)] ${embedded ? "" : "mt-2"}`}
      >
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            className={`shrink-0 cursor-pointer rounded-md p-1 text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default ${lyricsExpanded ? "bg-canvas-controls-active text-fg-default" : ""}`}
            aria-label={lyricsExpanded ? "收起歌词" : "展开歌词"}
            aria-expanded={lyricsExpanded}
            data-testid="canvas-node-audio-expand-btn"
            onClick={(event) => {
              event.stopPropagation();
              setLyricsExpanded((expanded) => !expanded);
            }}
          >
            <ExpandCornersIcon />
          </button>
        </div>
        <div className="relative flex flex-1 justify-between">
          <div
            className="flex-1 pb-2 pl-3 pr-10 pt-3"
            style={{ minHeight: 92, maxHeight: 120 }}
          >
            <div className="relative h-full w-full">
              {!prompt.trim() ? (
                <div className="pointer-events-none absolute inset-0 box-border h-full w-full overflow-y-auto whitespace-pre-wrap bg-transparent p-0 text-sm text-fg-subtle">
                  描述你想要生成的任何内容
                </div>
              ) : null}
              <textarea
                placeholder="描述你想要生成的任何内容"
                spellCheck={false}
                className="absolute inset-0 box-border h-full w-full resize-none whitespace-pre-wrap border-none bg-transparent p-0 text-sm text-fg-default outline-none placeholder:text-transparent"
                data-testid="canvas-node-audio-prompt-textarea"
                value={prompt}
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onClick={stopWorkflowNodeChromeEvent}
                onKeyDown={stopWorkflowNodeChromeEvent}
                onChange={(event) => onPromptChange(event.target.value)}
              />
            </div>
          </div>
        </div>
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${lyricsExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
          aria-hidden={!lyricsExpanded}
          data-testid="canvas-node-audio-lyrics-section"
        >
          <div
            className={`min-h-0 overflow-hidden transition-opacity duration-200 ${lyricsExpanded ? "opacity-100" : "opacity-0"}`}
          >
            <div className="mx-3 border-t border-border-muted" />
            <div className="relative flex flex-1 justify-between">
              <div
                className="flex-1 px-3 pt-4"
                style={{ minHeight: 66, maxHeight: 100 }}
              >
                <div className="relative h-full w-full">
                  {!lyrics.trim() ? (
                    <div className="pointer-events-none absolute inset-0 box-border h-full w-full overflow-y-auto whitespace-pre-wrap bg-transparent p-0 text-sm text-fg-subtle">
                      在此输入或粘贴歌词...
                    </div>
                  ) : null}
                  <textarea
                    placeholder="在此输入或粘贴歌词..."
                    spellCheck={false}
                    className="absolute inset-0 box-border h-full w-full resize-none whitespace-pre-wrap border-none bg-transparent p-0 text-sm text-fg-default outline-none placeholder:text-transparent"
                    data-testid="canvas-node-audio-lyrics-textarea"
                    value={lyrics}
                    tabIndex={lyricsExpanded ? 0 : -1}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onClick={stopWorkflowNodeChromeEvent}
                    onKeyDown={stopWorkflowNodeChromeEvent}
                    onChange={(event) => onLyricsChange(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex h-14 items-center justify-between p-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              ref={modelTriggerRef}
              className="inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-normal transition-colors hover:bg-canvas-controls-hover"
              data-testid="canvas-node-audio-model-select"
              title={selectedModel?.name || "选择音频模型"}
              onClick={(event) => {
                event.stopPropagation();
                setAudioModeMenuOpen(false);
                setAudioDurationMenuOpen(false);
                setModelMenuOpen((open) => !open);
              }}
            >
              <WorkflowModelIcon
                iconUrl={selectedModelIconUrl}
                name={selectedModel?.name}
              />
              <span
                className="max-w-[168px] truncate whitespace-nowrap"
                title={selectedModel?.name || "选择音频模型"}
              >
                {modelsLoading
                  ? "加载模型..."
                  : selectedModel?.name || "选择音频模型"}
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
                ariaLabel="音频模型"
                testId="workflow-audio-model-popover"
                className="rounded-2xl border-[0.5px] border-card-border bg-panel-background/95 p-1 text-sm text-fg-default shadow-[0_1px_3px_rgba(0,0,0,0.05),0_20px_25px_-5px_rgba(0,0,0,0.05),0_10px_10px_-5px_rgba(0,0,0,0.04)] backdrop-blur-[32px]"
              >
                <ModelPopupList
                  title="音频模型"
                  models={modelOptions}
                  loading={modelsLoading}
                  selected={selectedModelValue}
                  onSelect={commitAudioModel}
                />
              </WorkflowAnchoredPopover>
            ) : null}
            {audioModeOptions.length > 0 ? (
              <>
                <span className="h-4 w-px bg-border-muted" />
                <button
                  type="button"
                  ref={audioModeTriggerRef}
                  className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-normal transition-colors hover:bg-canvas-controls-hover ${audioModeMenuOpen ? "bg-canvas-controls-active" : ""}`}
                  data-testid="canvas-node-audio-scene-select"
                  aria-haspopup="listbox"
                  aria-expanded={audioModeMenuOpen}
                  onClick={(event) => {
                    event.stopPropagation();
                    setModelMenuOpen(false);
                    setAudioDurationMenuOpen(false);
                    setAudioModeMenuOpen((open) => !open);
                  }}
                >
                  <TapNowNodeIcon kind="audio" size={16} />
                  <span className="whitespace-nowrap">
                    {selectedAudioMode?.label}
                  </span>
                </button>
                {audioModeMenuOpen ? (
                  <WorkflowAnchoredPopover
                    anchorRef={audioModeTriggerRef}
                    popoverRef={audioModePopoverRef}
                    side="top"
                    align="start"
                    gap={6}
                    margin={12}
                    heightLimit={280}
                    role="listbox"
                    ariaLabel="音频生成模式"
                    testId="canvas-node-audio-scene-menu"
                    className="min-w-40 max-w-[min(280px,calc(100vw-24px))] rounded-xl border border-border-muted bg-[var(--workflow-node-popover-background,var(--Surface-secondary-background))] p-1.5 text-sm text-canvas-controls-text shadow-[var(--canvas-shadow-menu)] backdrop-blur-xl"
                  >
                    {audioModeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={
                          option.value === selectedAudioMode?.value
                        }
                        className={`flex h-9 w-full items-center justify-between rounded-lg px-3 text-left transition-colors hover:bg-canvas-controls-hover ${option.value === selectedAudioMode?.value ? "bg-canvas-controls-active text-fg-default" : "text-fg-muted"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onAudioModeChange?.(option.value);
                          setAudioModeMenuOpen(false);
                        }}
                      >
                        <span>{option.label}</span>
                        {option.value === selectedAudioMode?.value ? (
                          <Check className="size-3.5" />
                        ) : null}
                      </button>
                    ))}
                  </WorkflowAnchoredPopover>
                ) : null}
              </>
            ) : null}
            {audioDurationOptions.length > 0 ? (
              <>
                <span className="h-4 w-px bg-border-muted" />
                <button
                  type="button"
                  className={`inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-sm font-normal transition-colors hover:bg-canvas-controls-hover ${audioDurationMenuOpen ? "bg-canvas-controls-active" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={audioDurationMenuOpen}
                  data-testid="canvas-node-audio-duration-select"
                  onClick={(event) => {
                    event.stopPropagation();
                    setModelMenuOpen(false);
                    setAudioModeMenuOpen(false);
                    setAudioDurationMenuOpen((open) => !open);
                  }}
                >
                  <AdaptiveAudioIcon />
                  <span>{selectedAudioDuration?.label}</span>
                </button>
                {audioDurationMenuOpen ? (
                  <div
                    className="absolute bottom-14 left-[258px] z-30 min-w-40 rounded-xl p-1.5 text-sm text-canvas-controls-text"
                    style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
                    role="listbox"
                    aria-label="音频时长"
                    data-testid="canvas-node-audio-duration-menu"
                  >
                    {audioDurationOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={
                          option.value === selectedAudioDuration?.value
                        }
                        className={`flex h-9 w-full items-center justify-between rounded-lg px-3 text-left transition-colors hover:bg-canvas-controls-hover ${option.value === selectedAudioDuration?.value ? "bg-canvas-controls-active text-fg-default" : "text-fg-muted"}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          onAudioDurationChange?.(option.value);
                          setAudioDurationMenuOpen(false);
                        }}
                      >
                        <span>{option.label}</span>
                        {option.value === selectedAudioDuration?.value ? (
                          <Check className="size-3.5" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              className="flex shrink-0 items-center justify-center rounded-lg px-2.5 py-2.5 text-fg-default transition-colors hover:bg-canvas-controls-hover"
              aria-label="语音输入"
            >
              <Mic className="size-4" />
            </button>
            <div className="h-4 w-px shrink-0 bg-border-muted" />
            <div
              className="ml-2 flex items-center gap-1 rounded-full border border-border-muted p-1"
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
                data-testid="canvas-node-audio-generate-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  onGenerate?.(prompt);
                }}
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
