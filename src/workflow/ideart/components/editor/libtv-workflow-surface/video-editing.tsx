"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, Keyboard, Sparkles, X } from "lucide-react";
import { toVideoDisplayUrl } from "../utils/video-proxy";
import {
  clampWorkflowNumber,
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  getWorkflowVideoPosterUrl,
  isRenderableWorkflowMediaUrl,
} from "./workflow-media-utils";
import type {
  WorkflowCropRect,
  WorkflowVideoCropRequest,
  WorkflowVideoTrimRequest,
} from "./surface-contracts";

export function WorkflowVideoCropOverlay({
  videoUrl,
  initialSourceWidth,
  initialSourceHeight,
  onCancel,
  onConfirm,
}: {
  videoUrl: string;
  initialSourceWidth?: number;
  initialSourceHeight?: number;
  onCancel: () => void;
  onConfirm: (request: WorkflowVideoCropRequest) => void;
}) {
  type CropHandle = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
  const safeVideoUrl = isRenderableWorkflowMediaUrl(videoUrl)
    ? toVideoDisplayUrl(videoUrl)
    : "";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    mode: CropHandle;
    startClientX: number;
    startClientY: number;
    startRect: WorkflowCropRect;
  } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [sourceSize, setSourceSize] = useState({
    width: Math.max(0, Math.round(Number(initialSourceWidth || 0))),
    height: Math.max(0, Math.round(Number(initialSourceHeight || 0))),
  });
  const [cropRect, setCropRect] = useState<WorkflowCropRect>({
    x: 10,
    y: 10,
    width: 80,
    height: 80,
  });

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setContainerSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const displayRect = useMemo(() => {
    const containerWidth = Math.max(1, containerSize.width);
    const containerHeight = Math.max(1, containerSize.height);
    const sourceWidth = Math.max(1, sourceSize.width || containerWidth);
    const sourceHeight = Math.max(1, sourceSize.height || containerHeight);
    const sourceRatio = sourceWidth / sourceHeight;
    const containerRatio = containerWidth / containerHeight;
    if (sourceRatio >= containerRatio) {
      const width = containerWidth;
      const height = width / sourceRatio;
      return { left: 0, top: (containerHeight - height) / 2, width, height };
    }
    const height = containerHeight;
    const width = height * sourceRatio;
    return { left: (containerWidth - width) / 2, top: 0, width, height };
  }, [
    containerSize.height,
    containerSize.width,
    sourceSize.height,
    sourceSize.width,
  ]);

  const cropPixelRect = useMemo(() => {
    const sourceWidth = Math.max(
      1,
      sourceSize.width || Math.round(displayRect.width),
    );
    const sourceHeight = Math.max(
      1,
      sourceSize.height || Math.round(displayRect.height),
    );
    return {
      x: Math.max(0, Math.round((cropRect.x / 100) * sourceWidth)),
      y: Math.max(0, Math.round((cropRect.y / 100) * sourceHeight)),
      width: Math.max(2, Math.round((cropRect.width / 100) * sourceWidth)),
      height: Math.max(2, Math.round((cropRect.height / 100) * sourceHeight)),
      sourceWidth,
      sourceHeight,
    };
  }, [
    cropRect.height,
    cropRect.width,
    cropRect.x,
    cropRect.y,
    displayRect.height,
    displayRect.width,
    sourceSize.height,
    sourceSize.width,
  ]);

  const clampCropRect = useCallback(
    (rect: WorkflowCropRect) => {
      const minWidth = Math.min(
        100,
        Math.max(3, (24 / Math.max(1, displayRect.width)) * 100),
      );
      const minHeight = Math.min(
        100,
        Math.max(3, (24 / Math.max(1, displayRect.height)) * 100),
      );
      const width = clampWorkflowNumber(rect.width, minWidth, 100);
      const height = clampWorkflowNumber(rect.height, minHeight, 100);
      return {
        x: clampWorkflowNumber(rect.x, 0, 100 - width),
        y: clampWorkflowNumber(rect.y, 0, 100 - height),
        width,
        height,
      };
    },
    [displayRect.height, displayRect.width],
  );

  const beginDrag = useCallback(
    (mode: CropHandle, event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragStateRef.current = {
        mode,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: cropRect,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [cropRect],
  );

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state) return;
      event.preventDefault();
      const dx =
        ((event.clientX - state.startClientX) /
          Math.max(1, displayRect.width)) *
        100;
      const dy =
        ((event.clientY - state.startClientY) /
          Math.max(1, displayRect.height)) *
        100;
      const start = state.startRect;
      const right = start.x + start.width;
      const bottom = start.y + start.height;
      let next = { ...start };
      if (state.mode === "move") {
        next = { ...start, x: start.x + dx, y: start.y + dy };
      } else {
        if (state.mode.includes("w")) {
          const nextX = Math.min(right - 3, start.x + dx);
          next.x = nextX;
          next.width = right - nextX;
        }
        if (state.mode.includes("e")) {
          next.width = start.width + dx;
        }
        if (state.mode.includes("n")) {
          const nextY = Math.min(bottom - 3, start.y + dy);
          next.y = nextY;
          next.height = bottom - nextY;
        }
        if (state.mode.includes("s")) {
          next.height = start.height + dy;
        }
      }
      setCropRect(clampCropRect(next));
    };
    const handleUp = () => {
      dragStateRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [clampCropRect, displayRect.height, displayRect.width]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const confirmCrop = useCallback(() => {
    if (!safeVideoUrl) return;
    onConfirm({
      sourceUrl: videoUrl,
      cropX: cropPixelRect.x,
      cropY: cropPixelRect.y,
      cropWidth: cropPixelRect.width,
      cropHeight: cropPixelRect.height,
      sourceWidth: cropPixelRect.sourceWidth,
      sourceHeight: cropPixelRect.sourceHeight,
    });
  }, [
    cropPixelRect.height,
    cropPixelRect.sourceHeight,
    cropPixelRect.sourceWidth,
    cropPixelRect.width,
    cropPixelRect.x,
    cropPixelRect.y,
    onConfirm,
    safeVideoUrl,
    videoUrl,
  ]);

  const handleClassName =
    "absolute z-[3] size-3 rounded-full border border-black/45 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.45)]";
  const cropStyle: React.CSSProperties = {
    left: `${displayRect.left + (cropRect.x / 100) * displayRect.width}px`,
    top: `${displayRect.top + (cropRect.y / 100) * displayRect.height}px`,
    width: `${(cropRect.width / 100) * displayRect.width}px`,
    height: `${(cropRect.height / 100) * displayRect.height}px`,
  };

  return (
    <div
      ref={containerRef}
      className="nodrag nopan nowheel pointer-events-auto absolute inset-0 z-[90] overflow-visible rounded-2xl"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <video
        src={safeVideoUrl || undefined}
        preload="metadata"
        muted
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl object-contain"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          const width = Math.max(0, Math.round(Number(video.videoWidth || 0)));
          const height = Math.max(
            0,
            Math.round(Number(video.videoHeight || 0)),
          );
          if (width > 0 && height > 0) setSourceSize({ width, height });
        }}
      />
      <div
        data-video-crop-rect="true"
        className="absolute z-[2] cursor-move border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_0_0_9999px_rgba(0,0,0,0.45)]"
        style={cropStyle}
        onPointerDown={(event) => beginDrag("move", event)}
      >
        <div className="pointer-events-none absolute left-1/3 top-0 h-full w-px bg-white/45" />
        <div className="pointer-events-none absolute left-2/3 top-0 h-full w-px bg-white/45" />
        <div className="pointer-events-none absolute left-0 top-1/3 h-px w-full bg-white/45" />
        <div className="pointer-events-none absolute left-0 top-2/3 h-px w-full bg-white/45" />
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/65 px-2 py-0.5 text-[11px] tabular-nums text-white">
          {cropPixelRect.width} x {cropPixelRect.height}
        </span>
        <button
          type="button"
          aria-label="resize-nw"
          className={`${handleClassName} -left-1.5 -top-1.5 cursor-nwse-resize`}
          onPointerDown={(event) => beginDrag("nw", event)}
        />
        <button
          type="button"
          aria-label="resize-n"
          className={`${handleClassName} left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize`}
          onPointerDown={(event) => beginDrag("n", event)}
        />
        <button
          type="button"
          aria-label="resize-ne"
          className={`${handleClassName} -right-1.5 -top-1.5 cursor-nesw-resize`}
          onPointerDown={(event) => beginDrag("ne", event)}
        />
        <button
          type="button"
          aria-label="resize-e"
          className={`${handleClassName} -right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize`}
          onPointerDown={(event) => beginDrag("e", event)}
        />
        <button
          type="button"
          aria-label="resize-se"
          className={`${handleClassName} -bottom-1.5 -right-1.5 cursor-nwse-resize`}
          onPointerDown={(event) => beginDrag("se", event)}
        />
        <button
          type="button"
          aria-label="resize-s"
          className={`${handleClassName} -bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize`}
          onPointerDown={(event) => beginDrag("s", event)}
        />
        <button
          type="button"
          aria-label="resize-sw"
          className={`${handleClassName} -bottom-1.5 -left-1.5 cursor-nesw-resize`}
          onPointerDown={(event) => beginDrag("sw", event)}
        />
        <button
          type="button"
          aria-label="resize-w"
          className={`${handleClassName} -left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize`}
          onPointerDown={(event) => beginDrag("w", event)}
        />
      </div>
      <div
        className="node-floating-ui nodrag nowheel nopan absolute -bottom-4 left-1/2 z-30 w-max -translate-x-1/2 translate-y-full origin-top transition-[transform,opacity] duration-150 ease-out"
        style={{ transform: "scale(var(--workflow-float-scale, 1))" }}
      >
        <div
          data-video-crop-control="true"
          className="border-border-muted bg-panel-background border-hair nodrag pointer-events-auto flex min-w-[244px] items-center justify-between gap-8 rounded-xl p-2 shadow-[0px_4px_10px_0px_rgba(0,0,0,0.12)]"
        >
          <div className="flex h-8 shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="退出裁剪"
              title="退出裁剪"
              className="text-fg-muted hover:bg-canvas-controls-hover hover:text-canvas-controls-text flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onCancel}
            >
              <VideoCropCloseIcon />
            </button>
            <span className="text-canvas-controls-text flex h-8 shrink-0 items-center whitespace-nowrap px-1 text-[13px] tabular-nums">
              {cropPixelRect.width} x {cropPixelRect.height}
            </span>
          </div>
          <button
            type="button"
            aria-label="生成裁剪"
            title="生成裁剪"
            className="bg-btn-invert-bg flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={confirmCrop}
          >
            <VideoCropGenerateIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export function VideoCropCloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      aria-hidden="true"
      role="img"
      className="pointer-events-none"
      width="14"
      height="14"
      viewBox="0 0 17.1864 17.1854"
    >
      <path
        d="M15.7959 0.117157C15.9521 -0.0390524 16.2051 -0.0390524 16.3613 0.117157L17.0693 0.824189C17.2254 0.980406 17.2255 1.23442 17.0693 1.39059L9.86618 8.59274L17.0693 15.7949C17.2254 15.9511 17.2255 16.2051 17.0693 16.3613L16.3613 17.0683C16.2051 17.2245 15.9521 17.2244 15.7959 17.0683L8.59274 9.86618L1.39059 17.0683C1.23442 17.2245 0.981382 17.2244 0.825165 17.0683L0.117157 16.3613C-0.0390524 16.2051 -0.0390524 15.9511 0.117157 15.7949L7.31931 8.59274L0.117157 1.39059C-0.0390524 1.23439 -0.0390524 0.980398 0.117157 0.824189L0.825165 0.117157C0.981375 -0.0390524 1.23439 -0.0390524 1.39059 0.117157L8.59274 7.31931L15.7959 0.117157Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function VideoCropGenerateIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      aria-hidden="true"
      role="img"
      className="pointer-events-none text-btn-invert-text size-3"
      width="1em"
      height="1em"
      viewBox="0 0 18 18"
    >
      <path
        d="M8.29289 0.292893C8.68342 -0.0976311 9.31658 -0.0976311 9.70711 0.292893L17.7071 8.29289C18.0976 8.68342 18.0976 9.31658 17.7071 9.70711C17.3166 10.0976 16.6834 10.0976 16.2929 9.70711L10 3.41421V17C10 17.5523 9.55229 18 9 18C8.44772 18 8 17.5523 8 17V3.41421L1.70711 9.70711C1.31658 10.0976 0.683418 10.0976 0.292893 9.70711C-0.0976311 9.31658 -0.0976311 8.68342 0.292893 8.29289L8.29289 0.292893Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WorkflowVideoTrimOverlay({
  videoUrl,
  onCancel,
  onConfirm,
}: {
  videoUrl: string;
  onCancel: () => void;
  onConfirm: (request: WorkflowVideoTrimRequest) => void;
}) {
  const safeVideoUrl = isRenderableWorkflowMediaUrl(videoUrl)
    ? toVideoDisplayUrl(videoUrl)
    : "";
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [startRatio, setStartRatio] = useState(0.28);
  const [endRatio, setEndRatio] = useState(0.72);
  const [dragMode, setDragMode] = useState<"start" | "end" | "range" | null>(
    null,
  );
  const trackRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const startSeconds = safeDuration ? startRatio * safeDuration : 0;
  const endSeconds = safeDuration ? endRatio * safeDuration : 0;
  const clipSeconds = Math.max(0, endSeconds - startSeconds);
  const currentRatio = safeDuration
    ? Math.max(0, Math.min(1, currentTime / safeDuration))
    : 0;

  const updateFromPointer = useCallback(
    (clientX: number, mode: "start" | "end" | "range") => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)),
      );
      const minSpan = safeDuration
        ? Math.min(0.96, Math.max(0.02, Math.min(1, 0.3 / safeDuration)))
        : 0.03;
      if (mode === "start") {
        setStartRatio(Math.min(ratio, endRatio - minSpan));
        return;
      }
      if (mode === "end") {
        setEndRatio(Math.max(ratio, startRatio + minSpan));
        return;
      }
      const span = endRatio - startRatio;
      const nextStart = Math.max(0, Math.min(1 - span, ratio - span / 2));
      setStartRatio(nextStart);
      setEndRatio(nextStart + span);
    },
    [endRatio, safeDuration, startRatio],
  );

  useEffect(() => {
    const video = previewRef.current;
    if (!video || !safeDuration) return;
    video.currentTime = startSeconds;
    setCurrentTime(startSeconds);
  }, [safeDuration, startSeconds]);

  useEffect(() => {
    if (!dragMode) return;
    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      updateFromPointer(event.clientX, dragMode);
    };
    const handleUp = () => setDragMode(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragMode, updateFromPointer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -0.01 : 0.01;
      const span = endRatio - startRatio;
      const nextStart = Math.max(0, Math.min(1 - span, startRatio + delta));
      setStartRatio(nextStart);
      setEndRatio(nextStart + span);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [endRatio, onCancel, startRatio]);

  const confirmTrim = useCallback(() => {
    if (!safeVideoUrl || !safeDuration || clipSeconds <= 0.05) return;
    onConfirm({
      sourceUrl: videoUrl,
      startSeconds,
      endSeconds,
      durationSeconds: clipSeconds,
    });
  }, [
    clipSeconds,
    endSeconds,
    onConfirm,
    safeDuration,
    safeVideoUrl,
    startSeconds,
    videoUrl,
  ]);

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute inset-0 z-[90]"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <video
        ref={previewRef}
        src={safeVideoUrl || undefined}
        preload="metadata"
        muted
        playsInline
        className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl object-contain brightness-75"
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onTimeUpdate={(event) => {
          const nextTime = event.currentTarget.currentTime || 0;
          setCurrentTime(nextTime);
          if (safeDuration && nextTime >= endSeconds) {
            event.currentTarget.pause();
            event.currentTarget.currentTime = startSeconds;
          }
        }}
      />
      <div className="absolute bottom-[-98px] left-1/2 flex w-[min(640px,max(480px,calc(100vw-80px)))] -translate-x-1/2 flex-col items-center gap-2">
        <div className="relative flex w-full items-center gap-2">
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/90 transition hover:bg-white/20"
            title="退出裁剪"
            aria-label="退出裁剪"
            onClick={onCancel}
          >
            <X className="size-3.5" />
          </button>
          <div
            ref={trackRef}
            className="relative h-11 flex-1 touch-none select-none overflow-hidden rounded-xl border border-white/15 bg-black/50"
            onPointerDown={(event) => {
              event.preventDefault();
              setDragMode("range");
              updateFromPointer(event.clientX, "range");
            }}
          >
            <div className="absolute inset-0 flex">
              {Array.from({ length: 8 }, (_, index) => (
                <div
                  key={index}
                  className="min-w-0 flex-1 bg-cover bg-center opacity-75"
                  style={{
                    backgroundImage: `url("${getWorkflowVideoPosterUrl(videoUrl)}")`,
                  }}
                />
              ))}
            </div>
            <div
              className="absolute inset-y-0 z-10 border-2 border-white"
              style={{
                left: `${startRatio * 100}%`,
                right: `${(1 - endRatio) * 100}%`,
                borderRadius: 4,
              }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 rounded-l-xl bg-black/55"
              style={{
                left: 0,
                right: `calc(${(1 - startRatio) * 100}% - 2px)`,
              }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 rounded-r-xl bg-black/55"
              style={{ left: `${endRatio * 100}%`, right: 0 }}
            />
            <div
              className="pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${((startRatio + endRatio) / 2) * 100}%` }}
            >
              <div className="whitespace-nowrap rounded-md bg-black/70 px-2.5 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-sm">
                {clipSeconds.toFixed(2)}s
              </div>
            </div>
            <div
              className="absolute top-0 z-30 h-full w-5 cursor-col-resize touch-none"
              style={{
                left: `clamp(0px, ${startRatio * 100}% - 16px, 100% - 20px)`,
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragMode("start");
              }}
            >
              <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(0,0,0,0.3)]" />
            </div>
            <div
              className="absolute top-0 z-30 h-full w-5 cursor-col-resize touch-none"
              style={{
                left: `clamp(0px, ${endRatio * 100}% - 4px, 100% - 20px)`,
              }}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDragMode("end");
              }}
            >
              <div className="absolute left-1/2 top-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(0,0,0,0.3)]" />
            </div>
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_4px_rgba(255,255,255,0.5)]"
              style={{ left: `${currentRatio * 100}%` }}
            />
          </div>
          <button
            type="button"
            disabled={!safeDuration}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-white/85 disabled:cursor-not-allowed disabled:opacity-50"
            title="确认裁剪"
            aria-label="确认裁剪"
            onClick={confirmTrim}
          >
            <Check className="size-3.5" />
          </button>
        </div>
        <div className="flex w-full items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-white/80 backdrop-blur-sm">
            <kbd className="rounded bg-white/15 px-1 py-0.5 font-mono text-[9px] text-white/90">
              Arrow Left / Arrow Right
            </kbd>
            <span>移动选区</span>
            <Keyboard className="ml-1 size-3 opacity-60" />
          </div>
          <button
            type="button"
            className="ml-auto flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] text-white/90 backdrop-blur-sm transition hover:bg-white/20"
            onClick={() => {
              const span = 3 / Math.max(3, safeDuration || 3);
              const center = Math.max(
                span / 2,
                Math.min(1 - span / 2, currentRatio || 0.5),
              );
              setStartRatio(Math.max(0, center - span / 2));
              setEndRatio(Math.min(1, center + span / 2));
            }}
          >
            <Sparkles className="size-3" />
            智能剪辑
          </button>
        </div>
      </div>
    </div>
  );
}
