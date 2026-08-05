"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { type Viewport } from "@xyflow/react";
import { Volume2, VolumeX } from "lucide-react";
import type {
  LibTvWorkflowImageResult,
  LibTvWorkflowNode,
} from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT,
  LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH,
} from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_VIDEO_PLAYBACK_LEASE_LIMIT,
  LIBTV_VIDEO_PLAYBACK_LEASE_MS,
  createLibTvVideoPlaybackInteractionScheduler,
  createLibTvVideoPlaybackLeasePool,
} from "@/workflow/ideart/lib/libtv/video-playback-lease";
import {
  LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
  LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
  LIBTV_TAPNOW_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_GENERATOR_WIDTH,
  LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
  LIBTV_TAPNOW_SCRIPT_HEIGHT,
  LIBTV_TAPNOW_SCRIPT_WIDTH,
  LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
  LIBTV_TAPNOW_VIDEO_HEIGHT,
  LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT,
  LIBTV_TAPNOW_VIDEO_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import { type WorkflowExtraParameterValue } from "./workflow-extra-parameters";
import { toDesktopRemoteImageUrl } from "@/workflow/ideart/lib/url/image-proxy-policy";
import {
  clampWorkflowNumber,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { ensureWorkflowPublicImageUrl } from "../libtv-workflow-canvas/workflow-image-runtime";
import { workflowFetch } from "@/workflow/backend/client";
import {
  WORKFLOW_NODE_CLOSE_MENUS_EVENT,
  WORKFLOW_ORDINARY_MEDIA_MAX_LONG_SIDE,
  WORKFLOW_ORDINARY_MEDIA_SHORT_SIDE,
  WORKFLOW_VIEWPORT_LIVE_EVENT,
} from "./surface-contracts";
import { WORKFLOW_IMAGE_GENERATION_ESTIMATED_MS } from "./workflow-models";
import type {
  WorkflowAnnotationItem,
  WorkflowAnnotationPoint,
  WorkflowCropRect,
  WorkflowRedrawMode,
  WorkflowRedrawOperation,
  WorkflowRedrawPoint,
} from "./surface-contracts";

export function formatWorkflowMediaTime(value: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatWorkflowVideoPlayerTime(value: number) {
  if (!Number.isFinite(value)) return "--:--";
  const total = value > 0 ? Math.max(1, Math.floor(value)) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function WorkflowVideoVolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: {
  volume: number;
  muted: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: (event: React.MouseEvent) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const shownVolume = muted ? 0 : clampWorkflowNumber(volume, 0, 1);
  const updateFromClientY = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      onVolumeChange(
        clampWorkflowNumber((rect.bottom - clientY) / rect.height, 0, 1),
      );
    },
    [onVolumeChange],
  );

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (event: MouseEvent) =>
      updateFromClientY(event.clientY);
    const handleMouseUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, updateFromClientY]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className="absolute bottom-full left-1/2 flex -translate-x-1/2 flex-col items-center pb-2 transition-all duration-200"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      >
        <div className="flex flex-col items-center rounded-lg bg-black/75 px-[5px] py-1.5">
          <span className="mb-1 text-[10px] tabular-nums text-white">
            {Math.round(shownVolume * 100)}
          </span>
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="视频音量"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(shownVolume * 100)}
            className="nodrag nopan nowheel relative flex h-20 w-4 cursor-pointer justify-center outline-none"
            onMouseDown={(event) => {
              event.stopPropagation();
              setDragging(true);
              updateFromClientY(event.clientY);
            }}
            onClick={stopWorkflowNodeChromeEvent}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
              event.preventDefault();
              event.stopPropagation();
              onVolumeChange(
                clampWorkflowNumber(
                  shownVolume + (event.key === "ArrowUp" ? 0.05 : -0.05),
                  0,
                  1,
                ),
              );
            }}
          >
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-white/30" />
            <div
              className="pointer-events-none absolute bottom-0 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-white"
              style={{ height: `${shownVolume * 100}%` }}
            />
            <div
              className="pointer-events-none absolute left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
              style={{ bottom: `${shownVolume * 100}%` }}
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-black/50"
        aria-label={muted || volume === 0 ? "unmute" : "mute"}
        onClick={onToggleMute}
      >
        {muted || volume === 0 ? (
          <VolumeX className="size-3.5" />
        ) : (
          <Volume2 className="size-3.5" />
        )}
      </button>
    </div>
  );
}

export function WorkflowVideoPlayerPlayIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 16 16" fill="none">
      <rect
        x="3.5"
        y="2.5"
        width="3"
        height="11"
        rx="0.6"
        fill="currentColor"
      />
      <rect
        x="9.5"
        y="2.5"
        width="3"
        height="11"
        rx="0.6"
        fill="currentColor"
      />
    </svg>
  ) : (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 16 16" fill="none">
      <path
        d="M4.667 2.642c0-.819.93-1.291 1.591-.807l7.31 5.36a1 1 0 0 1 0 1.613l-7.31 5.361c-.66.484-1.591.012-1.591-.807V2.642Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const WORKFLOW_INLINE_VIDEO_POOL_LIMIT =
  LIBTV_VIDEO_PLAYBACK_LEASE_LIMIT;

export const WORKFLOW_INLINE_VIDEO_LEASE_MS = LIBTV_VIDEO_PLAYBACK_LEASE_MS;

export const workflowInlineVideoPool =
  createLibTvVideoPlaybackLeasePool<symbol>({
    limit: WORKFLOW_INLINE_VIDEO_POOL_LIMIT,
    leaseMs: WORKFLOW_INLINE_VIDEO_LEASE_MS,
  });

export const workflowInlineVideoInteractionScheduler =
  createLibTvVideoPlaybackInteractionScheduler({
    onPause: () => {
      workflowInlineVideoPool.suspendGrants();
      workflowInlineVideoPool.pausePlayback();
    },
    onRelease: () => workflowInlineVideoPool.pauseAll(),
    onResume: () => {
      workflowInlineVideoPool.resume();
      workflowInlineVideoPool.resumeGrants();
      workflowInlineVideoPool.resumePlayback();
    },
  });

export function updateWorkflowInlineVideoPool(
  token: symbol,
  grant: () => void,
  release: () => void,
  pausePlayback: () => void,
  resumePlayback: () => void,
  pinned: boolean,
  request: boolean,
) {
  if (!request) {
    workflowInlineVideoPool.cancel(token);
    return;
  }
  workflowInlineVideoPool.request(token, {
    onGrant: grant,
    onRelease: release,
    onPausePlayback: pausePlayback,
    onResumePlayback: resumePlayback,
    pinned,
  });
}

export function isWorkflowViewportMovingFromElement(element: Element | null) {
  return element?.closest("[data-viewport-moving='true']") !== null;
}

export function emitWorkflowViewportMoving(moving: boolean) {
  if (moving) {
    workflowInlineVideoInteractionScheduler.start();
  } else workflowInlineVideoInteractionScheduler.end();
  if (typeof window === "undefined") return;
  if (moving) window.dispatchEvent(new Event(WORKFLOW_NODE_CLOSE_MENUS_EVENT));
}

export function emitWorkflowViewportLive(viewport: Viewport) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(WORKFLOW_VIEWPORT_LIVE_EVENT, {
      detail: {
        x: Number(viewport.x || 0),
        y: Number(viewport.y || 0),
        zoom: Number(viewport.zoom || 1),
      },
    }),
  );
}

export const WORKFLOW_VIDEO_POSTER_WIDTH_TIERS = [
  100, 200, 400, 800, 1600,
] as const;

export function getWorkflowVideoPosterTier(targetWidth = 400) {
  const normalized = Math.max(1, Number(targetWidth) || 400);
  return (
    WORKFLOW_VIDEO_POSTER_WIDTH_TIERS.find((tier) => tier >= normalized) ||
    WORKFLOW_VIDEO_POSTER_WIDTH_TIERS[
      WORKFLOW_VIDEO_POSTER_WIDTH_TIERS.length - 1
    ]
  );
}

export function getWorkflowVideoPosterUrl(value: string, targetWidth = 400) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (
      /\.oss-[a-z0-9-]+\.aliyuncs\.com$/i.test(hostname) ||
      hostname === "libtv-res.liblib.art" ||
      hostname.endsWith(".liblib.cloud")
    ) {
      const tier = getWorkflowVideoPosterTier(targetWidth);
      return `${url}${url.includes("?") ? "&" : "?"}x-oss-process=video/snapshot,t_0,f_jpg,w_${tier},m_fast,ar_auto`;
    }
  } catch {
    return "";
  }
  return "";
}

export function getWorkflowImageRenderUrl(src: string, renderWidth?: number) {
  const value = String(src || "").trim();
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  const desktopUrl = toDesktopRemoteImageUrl(value);
  if (desktopUrl) return desktopUrl;
  const requestedWidth = Number(renderWidth);
  const width =
    Number.isFinite(requestedWidth) && requestedWidth > 0
      ? Math.max(16, Math.min(4096, Math.floor(requestedWidth)))
      : 0;
  const withProxyWidth = (proxyUrl: string) => {
    try {
      const parsed = new URL(
        proxyUrl,
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost",
      );
      if (parsed.pathname !== "/api/image-proxy") return proxyUrl;
      if (width) parsed.searchParams.set("w", String(width));
      else parsed.searchParams.delete("w");
      return `${parsed.pathname}?${parsed.searchParams.toString()}`;
    } catch {
      return proxyUrl;
    }
  };
  if (value.startsWith("/api/image-proxy?")) {
    try {
      const parsed = new URL(
        value,
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost",
      );
      return parsed.searchParams.get("url") ? withProxyWidth(value) : "";
    } catch {
      return "";
    }
  }
  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (parsed.pathname === "/api/image-proxy") {
        return parsed.searchParams.get("url")
          ? withProxyWidth(`${parsed.pathname}${parsed.search}`)
          : "";
      }
    } catch {
      return "";
    }
    return withProxyWidth(`/api/image-proxy?url=${encodeURIComponent(value)}`);
  }
  return value;
}

// Keep resize gestures from producing a new proxy URL on every pointer move;
// a 128px bucket is visually equivalent for a CSS-scaled canvas image while
// still allowing large nodes to request an appropriately sized preview.
export function getWorkflowImageRenderWidthForFrame(
  frameWidth: number,
  surfaceZoom = 1,
) {
  const width = Number(frameWidth || 0);
  if (!Number.isFinite(width) || width <= 0) return undefined;
  const zoom = Number.isFinite(Number(surfaceZoom))
    ? Math.max(0.15, Math.min(8, Number(surfaceZoom)))
    : 1;
  const rawDpr =
    typeof window !== "undefined" ? Number(window.devicePixelRatio) : 1;
  const dpr = Number.isFinite(rawDpr) && rawDpr > 0 ? rawDpr : 1;
  const targetWidth = width * zoom * dpr;
  return Math.max(128, Math.min(4096, Math.ceil(targetWidth / 128) * 128));
}

export function guessWorkflowImageFilename(
  url: string,
  mimeType: string,
  fallbackIndex = 0,
) {
  const normalizedMime = String(mimeType || "")
    .trim()
    .toLowerCase();
  const ext = normalizedMime.includes("png")
    ? "png"
    : normalizedMime.includes("webp")
      ? "webp"
      : normalizedMime.includes("gif")
        ? "gif"
        : normalizedMime.includes("bmp")
          ? "bmp"
          : normalizedMime.includes("svg")
            ? "svg"
            : normalizedMime.includes("jpeg") || normalizedMime.includes("jpg")
              ? "jpg"
              : "png";
  const base =
    String(url || "")
      .trim()
      .split("?")[0]
      ?.split("#")[0] || "";
  const tail = base.split("/").filter(Boolean).pop() || "";
  if (tail && /\.[a-z0-9]{2,5}$/i.test(tail)) return tail;
  return `workflow-reference-${fallbackIndex + 1}.${ext}`;
}

export async function convertWorkflowImageUrlToFile(
  url: string,
  fallbackIndex = 0,
) {
  const normalizedUrl = String(url || "").trim();
  if (!normalizedUrl) return null;
  const response = await fetch(
    getWorkflowImageRenderUrl(normalizedUrl) || normalizedUrl,
    {
      credentials: normalizedUrl.startsWith("/") ? "include" : "same-origin",
    },
  );
  if (!response.ok) {
    throw new Error(`参考图读取失败: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const mimeType = String(blob.type || "image/png").trim() || "image/png";
  if (!mimeType.startsWith("image/")) return null;
  return new File(
    [blob],
    guessWorkflowImageFilename(normalizedUrl, mimeType, fallbackIndex),
    { type: mimeType },
  );
}

export function normalizeWorkflowImageGenerationDisplayLabel(value: unknown) {
  const label = String(value || "").trim();
  if (!label) return "图片生成中";
  const lowerLabel = label.toLowerCase();
  if (
    label === "生成中" ||
    label === "生成中..." ||
    /^生成中\s*\d+%?\.{0,3}$/i.test(label) ||
    label === "等待生成" ||
    label === "任务已创建" ||
    label.includes("图片生成") ||
    label.includes("任务已") ||
    label.includes("提交") ||
    label.includes("排队") ||
    /^image generation\b/i.test(label) ||
    lowerLabel.includes("image generation") ||
    lowerLabel.includes("task submitted") ||
    lowerLabel.includes("submitted") ||
    lowerLabel.includes("queued") ||
    lowerLabel.includes("queue") ||
    lowerLabel.includes("pending")
  ) {
    return "图片生成中";
  }
  return label.slice(0, 80);
}

export function resolveWorkflowEstimatedImageGenerationProgress(
  startedAt: unknown,
  backendProgress: unknown,
  now = Date.now(),
) {
  const normalizedBackendProgress = Number.isFinite(Number(backendProgress))
    ? Math.max(0, Math.min(0.99, Number(backendProgress)))
    : undefined;
  const normalizedStartedAt = Number(startedAt);
  if (!Number.isFinite(normalizedStartedAt) || normalizedStartedAt <= 0)
    return normalizedBackendProgress;
  const elapsed = Math.max(0, now - normalizedStartedAt);
  const estimatedProgress = Math.max(
    0.03,
    Math.min(0.96, elapsed / WORKFLOW_IMAGE_GENERATION_ESTIMATED_MS),
  );
  return normalizedBackendProgress === undefined
    ? estimatedProgress
    : Math.max(normalizedBackendProgress, estimatedProgress);
}

export function getWorkflowMediaFitClass(
  node: Pick<LibTvWorkflowNode, "data">,
) {
  return node.data?.workflowMediaFrameLocked ||
    String((node.data as any)?.workflowScriptV2AssetKind || "").trim()
    ? "object-contain"
    : "object-cover";
}

export type WorkflowImageFitMode = "cover" | "contain";

export function getWorkflowImageFitMode(
  node: Pick<LibTvWorkflowNode, "data">,
): WorkflowImageFitMode {
  return getWorkflowMediaFitClass(node).includes("contain")
    ? "contain"
    : "cover";
}

export function getWorkflowImageContentFrame(
  container: { width: number; height: number },
  naturalSize: { width: number; height: number } | null,
  fitMode: WorkflowImageFitMode,
) {
  const containerWidth = Math.max(1, Number(container.width || 1));
  const containerHeight = Math.max(1, Number(container.height || 1));
  const naturalWidth = Math.max(
    1,
    Number(naturalSize?.width || containerWidth),
  );
  const naturalHeight = Math.max(
    1,
    Number(naturalSize?.height || containerHeight),
  );
  const imageRatio = naturalWidth / naturalHeight;
  const containerRatio = containerWidth / containerHeight;
  const useFullWidth =
    fitMode === "contain"
      ? imageRatio >= containerRatio
      : imageRatio <= containerRatio;
  if (useFullWidth) {
    const width = containerWidth;
    const height = width / imageRatio;
    return { left: 0, top: (containerHeight - height) / 2, width, height };
  }
  const height = containerHeight;
  const width = height * imageRatio;
  return { left: (containerWidth - width) / 2, top: 0, width, height };
}

export function useWorkflowImageNaturalSize(imageUrl: string) {
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadWorkflowCropImage(imageUrl)
      .then((image) => {
        if (cancelled) return;
        const width = Math.max(
          1,
          Math.round(image.naturalWidth || image.width || 1),
        );
        const height = Math.max(
          1,
          Math.round(image.naturalHeight || image.height || 1),
        );
        setNaturalSize({ width, height });
      })
      .catch(() => {
        if (!cancelled) setNaturalSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);
  return naturalSize;
}

export function constrainWorkflowCropRect(
  rect: WorkflowCropRect,
  bounds: { width: number; height: number },
  ratio: number | null = null,
) {
  const minSize = 40;
  let width = Math.max(minSize, Math.min(bounds.width, rect.width));
  let height = Math.max(minSize, Math.min(bounds.height, rect.height));

  if (ratio && ratio > 0) {
    if (width / height > ratio) {
      width = height * ratio;
    } else {
      height = width / ratio;
    }
    width = Math.max(minSize, Math.min(bounds.width, width));
    height = Math.max(minSize, Math.min(bounds.height, height));
  }

  const x = Math.max(0, Math.min(bounds.width - width, rect.x));
  const y = Math.max(0, Math.min(bounds.height - height, rect.y));
  return { x, y, width, height };
}

export function makeCenteredWorkflowCropRect(
  bounds: { width: number; height: number },
  ratio: number | null = null,
  insetRatio = 0.1,
) {
  const insetX = bounds.width * insetRatio;
  const insetY = bounds.height * insetRatio;
  const available = {
    width: Math.max(40, bounds.width - insetX * 2),
    height: Math.max(40, bounds.height - insetY * 2),
  };
  let width = available.width;
  let height = available.height;
  if (ratio && ratio > 0) {
    height = width / ratio;
    if (height > available.height) {
      height = available.height;
      width = height * ratio;
    }
  }
  return {
    x: (bounds.width - width) / 2,
    y: (bounds.height - height) / 2,
    width,
    height,
  };
}

export function loadWorkflowCropImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = getWorkflowImageRenderUrl(src);
  });
}

export async function cropWorkflowImageToFile(
  src: string,
  rect: WorkflowCropRect,
  displaySize: { width: number; height: number },
  name = "cropped-image.png",
) {
  const image = await loadWorkflowCropImage(src);
  const scaleX = image.naturalWidth / displaySize.width;
  const scaleY = image.naturalHeight / displaySize.height;
  const sourceX = Math.max(0, Math.round(rect.x * scaleX));
  const sourceY = Math.max(0, Math.round(rect.y * scaleY));
  const sourceW = Math.max(1, Math.round(rect.width * scaleX));
  const sourceH = Math.max(1, Math.round(rect.height * scaleY));
  const canvas = document.createElement("canvas");
  canvas.width = sourceW;
  canvas.height = sourceH;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建裁剪画布");
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    0,
    0,
    sourceW,
    sourceH,
  );
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("裁剪失败"))),
      "image/png",
    );
  });
  return new File([blob], name, { type: "image/png" });
}

export async function resizeWorkflowImageToFile(
  src: string,
  width: number,
  height: number,
  name = "resized-image.png",
) {
  const image = await loadWorkflowCropImage(src);
  const outputWidth = Math.max(1, Math.min(20000, Math.round(width)));
  const outputHeight = Math.max(1, Math.min(20000, Math.round(height)));
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建调整像素画布");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, outputWidth, outputHeight);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("调整像素失败"))),
      "image/png",
    );
  });
  return new File([blob], name, { type: "image/png" });
}

export function getWorkflowRedrawPoint(
  event: React.PointerEvent<HTMLElement>,
  bounds: { width: number; height: number },
): WorkflowRedrawPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const relativeX =
    rect.width > 0
      ? ((event.clientX - rect.left) / rect.width) * bounds.width
      : event.clientX - rect.left;
  const relativeY =
    rect.height > 0
      ? ((event.clientY - rect.top) / rect.height) * bounds.height
      : event.clientY - rect.top;
  return {
    x: Math.max(0, Math.min(bounds.width, relativeX)),
    y: Math.max(0, Math.min(bounds.height, relativeY)),
  };
}

export function drawWorkflowRedrawOperations(
  canvas: HTMLCanvasElement,
  operations: WorkflowRedrawOperation[],
  _displaySize: { width: number; height: number },
  options: {
    scaleX?: number;
    scaleY?: number;
    visual?: boolean;
  } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? 1;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const operation of operations) {
    if (operation.tool === "rect") {
      const rect = operation.rect;
      context.globalCompositeOperation = "source-over";
      context.fillStyle = options.visual
        ? "rgba(255, 255, 255, 0.36)"
        : "#ffffff";
      context.fillRect(
        rect.x * scaleX,
        rect.y * scaleY,
        rect.width * scaleX,
        rect.height * scaleY,
      );
      continue;
    }

    if (operation.points.length === 0) continue;
    context.globalCompositeOperation =
      operation.tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = options.visual
      ? "rgba(255, 255, 255, 0.62)"
      : "#ffffff";
    context.lineWidth = Math.max(1, operation.size * ((scaleX + scaleY) / 2));
    context.beginPath();
    const [first, ...rest] = operation.points;
    context.moveTo(first.x * scaleX, first.y * scaleY);
    if (rest.length === 0) {
      context.lineTo(first.x * scaleX + 0.01, first.y * scaleY + 0.01);
    } else {
      for (const point of rest) {
        context.lineTo(point.x * scaleX, point.y * scaleY);
      }
    }
    context.stroke();
  }

  context.globalCompositeOperation = "source-over";
}

export function createWorkflowRedrawCheckerPattern(
  context: CanvasRenderingContext2D,
  cellSize = 10,
) {
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = cellSize * 2;
  patternCanvas.height = cellSize * 2;
  const patternContext = patternCanvas.getContext("2d");
  if (!patternContext) return null;
  patternContext.fillStyle = "rgba(245,245,245,0.68)";
  patternContext.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
  patternContext.fillStyle = "rgba(125,125,125,0.42)";
  patternContext.fillRect(0, 0, cellSize, cellSize);
  patternContext.fillRect(cellSize, cellSize, cellSize, cellSize);
  return context.createPattern(patternCanvas, "repeat");
}

export function drawWorkflowRedrawPreview(
  canvas: HTMLCanvasElement,
  operations: WorkflowRedrawOperation[],
  displaySize: { width: number; height: number },
  options: {
    scaleX: number;
    scaleY: number;
  },
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (operations.length === 0) return;

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  drawWorkflowRedrawOperations(maskCanvas, operations, displaySize, options);

  const pattern = createWorkflowRedrawCheckerPattern(context);
  context.save();
  context.fillStyle = pattern || "rgba(245,245,245,0.62)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(maskCanvas, 0, 0);
  context.restore();
}

export function getWorkflowAnnotationPoint(
  event: React.PointerEvent<HTMLElement>,
  bounds: { width: number; height: number },
): WorkflowAnnotationPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const relativeX =
    rect.width > 0
      ? ((event.clientX - rect.left) / rect.width) * bounds.width
      : event.clientX - rect.left;
  const relativeY =
    rect.height > 0
      ? ((event.clientY - rect.top) / rect.height) * bounds.height
      : event.clientY - rect.top;
  return {
    x: Math.max(0, Math.min(bounds.width, relativeX)),
    y: Math.max(0, Math.min(bounds.height, relativeY)),
  };
}

export function drawWorkflowAnnotationItems(
  canvas: HTMLCanvasElement,
  items: WorkflowAnnotationItem[],
  _displaySize: { width: number; height: number },
  options: {
    scaleX?: number;
    scaleY?: number;
  } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? 1;
  const scale = (scaleX + scaleY) / 2;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const item of items) {
    context.save();
    if (item.tool === "eraser") {
      context.globalCompositeOperation = "destination-out";
      context.strokeStyle = "#000000";
      context.lineWidth = Math.max(1, item.strokeWidth * scale);
      if (item.points.length > 0) {
        context.beginPath();
        const [first, ...rest] = item.points;
        context.moveTo(first.x * scaleX, first.y * scaleY);
        if (rest.length === 0) {
          context.lineTo(first.x * scaleX + 0.01, first.y * scaleY + 0.01);
        } else {
          for (const point of rest)
            context.lineTo(point.x * scaleX, point.y * scaleY);
        }
        context.stroke();
      }
      context.restore();
      continue;
    }

    context.globalCompositeOperation = "source-over";
    context.strokeStyle = item.color;
    context.fillStyle = item.color;
    context.lineWidth = Math.max(1, item.strokeWidth * scale);

    if (item.tool === "brush") {
      if (item.points.length > 0) {
        context.beginPath();
        const [first, ...rest] = item.points;
        context.moveTo(first.x * scaleX, first.y * scaleY);
        if (rest.length === 0) {
          context.lineTo(first.x * scaleX + 0.01, first.y * scaleY + 0.01);
        } else {
          for (const point of rest)
            context.lineTo(point.x * scaleX, point.y * scaleY);
        }
        context.stroke();
      }
    } else if (item.tool === "rect") {
      const rect = item.rect;
      const rectStrokeWidth = Math.max(2, item.strokeWidth * 0.5) * scale;
      context.save();
      context.strokeStyle = item.color;
      context.lineWidth = rectStrokeWidth;
      context.lineCap = "butt";
      context.lineJoin = "miter";
      context.setLineDash([]);
      context.strokeRect(
        rect.x * scaleX,
        rect.y * scaleY,
        rect.width * scaleX,
        rect.height * scaleY,
      );
      context.restore();
    } else if (item.tool === "text") {
      context.font = `${Math.max(12, 16 * scale)}px sans-serif`;
      context.textBaseline = "top";
      context.fillText(
        item.text,
        item.point.x * scaleX + 8 * scale,
        item.point.y * scaleY - 8 * scale,
      );
    }

    context.restore();
  }

  context.globalCompositeOperation = "source-over";
}

export async function buildWorkflowAnnotatedImageDataUrl(params: {
  imageUrl: string;
  items: WorkflowAnnotationItem[];
  displaySize: { width: number; height: number };
}) {
  const image = await loadWorkflowCropImage(params.imageUrl);
  const naturalWidth = Math.max(
    1,
    Math.round(image.naturalWidth || params.displaySize.width),
  );
  const naturalHeight = Math.max(
    1,
    Math.round(image.naturalHeight || params.displaySize.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = naturalWidth;
  canvas.height = naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建标注画布");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, naturalWidth, naturalHeight);
  context.drawImage(image, 0, 0, naturalWidth, naturalHeight);
  const annotationCanvas = document.createElement("canvas");
  annotationCanvas.width = naturalWidth;
  annotationCanvas.height = naturalHeight;
  drawWorkflowAnnotationItems(
    annotationCanvas,
    params.items,
    params.displaySize,
    {
      scaleX: naturalWidth / params.displaySize.width,
      scaleY: naturalHeight / params.displaySize.height,
    },
  );
  context.drawImage(annotationCanvas, 0, 0);
  return canvas.toDataURL("image/png");
}

export function getWorkflowRedrawCanvasAlphaBounds(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const width = canvas.width;
  const height = canvas.height;
  const pixels = context.getImageData(0, 0, width, height).data;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3];
      if (alpha <= 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
}

export async function buildWorkflowRedrawMaskData(
  operations: WorkflowRedrawOperation[],
  displaySize: { width: number; height: number },
  naturalSize: { width: number; height: number },
) {
  const alphaMaskCanvas = document.createElement("canvas");
  alphaMaskCanvas.width = Math.max(1, Math.round(naturalSize.width));
  alphaMaskCanvas.height = Math.max(1, Math.round(naturalSize.height));
  drawWorkflowRedrawOperations(alphaMaskCanvas, operations, displaySize, {
    scaleX: alphaMaskCanvas.width / displaySize.width,
    scaleY: alphaMaskCanvas.height / displaySize.height,
  });
  const bounds = getWorkflowRedrawCanvasAlphaBounds(alphaMaskCanvas);

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = alphaMaskCanvas.width;
  exportCanvas.height = alphaMaskCanvas.height;
  const exportContext = exportCanvas.getContext("2d");
  if (!exportContext) throw new Error("无法创建蒙版画布");
  exportContext.fillStyle = "#000000";
  exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  exportContext.drawImage(alphaMaskCanvas, 0, 0);

  return {
    maskData: exportCanvas.toDataURL("image/png"),
    maskWidth: exportCanvas.width,
    maskHeight: exportCanvas.height,
    bounds,
  };
}

export async function runWorkflowRedrawGeneration(params: {
  mode: WorkflowRedrawMode;
  imageUrl: string;
  prompt: string;
  operations: WorkflowRedrawOperation[];
  displaySize: { width: number; height: number };
  modelId: string;
  workflowEndpointMethod?: string;
  referenceImages?: string[];
  aspectRatio?: string;
  size?: string;
  count?: number;
  enableWebSearch?: boolean;
  workflowExtraParameters?: Record<string, WorkflowExtraParameterValue>;
}) {
  const image = await loadWorkflowCropImage(params.imageUrl);
  const naturalSize = {
    width: image.naturalWidth || params.displaySize.width,
    height: image.naturalHeight || params.displaySize.height,
  };
  const { maskData, maskWidth, maskHeight, bounds } =
    await buildWorkflowRedrawMaskData(
      params.operations,
      params.displaySize,
      naturalSize,
    );
  if (!bounds) throw new Error("请先绘制需要重绘的区域");
  const [imageUrl, publicMask, referenceImages] = await Promise.all([
    ensureWorkflowPublicImageUrl(params.imageUrl, "workflow-redraw-source"),
    ensureWorkflowPublicImageUrl(maskData, "workflow-redraw-mask"),
    Promise.all(
      (params.referenceImages || []).map((value, index) =>
        ensureWorkflowPublicImageUrl(
          value,
          `workflow-redraw-reference-${index + 1}`,
        ),
      ),
    ),
  ]);
  const endpoint =
    params.mode === "erase" ? "/api/erase" : "/api/annotation-edit";
  const body =
    params.mode === "erase"
      ? {
          imageUrl,
          maskData: publicMask,
          prompt: params.prompt,
          modelId: params.modelId,
          workflowEndpointMethod: params.workflowEndpointMethod,
          aspectRatio: params.aspectRatio,
          size: params.size,
          count: params.count,
          enableWebSearch: params.enableWebSearch,
          workflowExtraParameters: params.workflowExtraParameters,
        }
      : {
          imageUrl,
          prompt: params.prompt,
          tasks: [
            {
              regionIndex: 1,
              instruction: params.prompt,
              maskData: publicMask,
              maskWidth,
              maskHeight,
              bounds,
              kind: "inpaint",
            },
          ],
          referenceImages,
          modelId: params.modelId,
          workflowEndpointMethod: params.workflowEndpointMethod,
          aspectRatio: params.aspectRatio,
          size: params.size,
          count: params.count,
          enableWebSearch: params.enableWebSearch,
          workflowExtraParameters: params.workflowExtraParameters,
          workflowRedraw: {
            model: params.modelId,
            aspectRatio: params.aspectRatio,
            size: params.size,
            count: params.count,
          },
        };
  const response = await workflowFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    success?: boolean;
    url?: string;
    urls?: string[];
    error?: string;
  } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(String(payload?.error || "图片编辑失败"));
  }
  const urls = Array.from(
    new Set(
      [...(Array.isArray(payload.urls) ? payload.urls : []), payload.url]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  if (!urls.length) throw new Error("图片编辑任务未返回图片");
  return urls;
}

export function getTapNowNodeFrame(kind: LibTvWorkflowNode["kind"]) {
  if (kind === "text")
    return {
      width: LIBTV_TAPNOW_TEXT_GENERATOR_WIDTH,
      height: LIBTV_TAPNOW_TEXT_GENERATOR_HEIGHT,
    };
  if (kind === "video")
    return {
      width: LIBTV_TAPNOW_VIDEO_WIDTH,
      height: LIBTV_TAPNOW_VIDEO_HEIGHT,
    };
  if (kind === "audio")
    return {
      width: LIBTV_TAPNOW_VIDEO_WIDTH,
      height: LIBTV_TAPNOW_VIDEO_HEIGHT,
    };
  if (kind === "playlist") return { width: 350, height: 350 };
  if (kind === "threed")
    return { width: 375, height: LIBTV_TAPNOW_VIDEO_HEIGHT };
  if (kind === "director-console-3d")
    return {
      width: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
      height: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
    };
  if (kind === "script" || kind === "script-v2")
    return {
      width: LIBTV_TAPNOW_SCRIPT_WIDTH,
      height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
    };
  if (kind === "image")
    return {
      width: LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH,
      height: LIBTV_TAPNOW_IMAGE_GENERATOR_HEIGHT,
    };
  return {
    width: LIBTV_TAPNOW_GENERATOR_WIDTH,
    height: LIBTV_TAPNOW_GENERATOR_HEIGHT,
  };
}

export function getWorkflowVideoGeneratorFrame(aspectRatio?: string) {
  const ratioSize = parseWorkflowAspectRatioSize(
    String(aspectRatio || "16:9"),
    16,
    9,
  );
  const ratio = Math.max(
    0.001,
    ratioSize.width / Math.max(1, ratioSize.height),
  );
  const baseHeight = LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT;
  if (ratio >= 1) {
    return {
      width: Math.max(baseHeight, Math.round(baseHeight * ratio)),
      height: baseHeight,
    };
  }
  return {
    width: baseHeight,
    height: Math.max(baseHeight, Math.round(baseHeight / ratio)),
  };
}

export function getWorkflowImageGeneratorFrame(aspectRatio?: string) {
  const ratioSize = parseWorkflowAspectRatioSize(
    String(aspectRatio || "1:1"),
    1,
    1,
  );
  return workflowImageDisplayFrameFromRatio(ratioSize.width, ratioSize.height);
}

export function getWorkflowImageGenerationPlaceholderDisplayFrame(
  aspectRatio?: string,
  count = 1,
) {
  const cell = getWorkflowImageGeneratorFrame(aspectRatio);
  const safeCount = Math.max(1, Math.min(8, Math.round(Number(count || 1))));
  if (safeCount <= 1) return cell;
  const gap = 8;
  const columns = Math.min(2, safeCount);
  const rows = Math.ceil(safeCount / columns);
  return {
    width: columns * cell.width + Math.max(0, columns - 1) * gap,
    height: rows * cell.height + Math.max(0, rows - 1) * gap,
  };
}

export function getWorkflowScriptNodeFrame(node: LibTvWorkflowNode) {
  const isScriptDocument =
    node.kind === "script" &&
    (node.data?.componentType === "script-document" ||
      Boolean(node.data?.scriptResult?.rows?.length));
  if (isScriptDocument)
    return {
      width: LIBTV_WORKFLOW_SCRIPT_DOCUMENT_WIDTH,
      height: LIBTV_WORKFLOW_SCRIPT_DOCUMENT_HEIGHT,
    };
  return {
    width: LIBTV_TAPNOW_SCRIPT_WIDTH,
    height: LIBTV_TAPNOW_SCRIPT_HEIGHT,
  };
}

export function workflowImageDisplayFrameFromRatio(
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, Math.round(Number(width || 1)));
  const safeHeight = Math.max(1, Math.round(Number(height || 1)));
  const ratio = safeWidth / safeHeight;
  const baseSize = LIBTV_TAPNOW_IMAGE_GENERATOR_WIDTH;
  const baseHeight = LIBTV_TAPNOW_VIDEO_GENERATOR_HEIGHT;
  if (ratio >= 1) {
    return {
      width: Math.max(baseSize, Math.round(baseHeight * ratio)),
      height: baseHeight,
    };
  }
  return {
    width: baseSize,
    height: Math.max(baseSize, Math.round(baseSize / ratio)),
  };
}

export function workflowOrdinaryImageDisplayFrameFromRatio(
  width: number,
  height: number,
) {
  const safeWidth = Math.max(1, Math.round(Number(width || 1)));
  const safeHeight = Math.max(1, Math.round(Number(height || 1)));
  if (safeWidth >= safeHeight) {
    return {
      width: Math.min(
        Math.round(
          (safeWidth / safeHeight) * WORKFLOW_ORDINARY_MEDIA_SHORT_SIDE,
        ),
        WORKFLOW_ORDINARY_MEDIA_MAX_LONG_SIDE,
      ),
      height: WORKFLOW_ORDINARY_MEDIA_SHORT_SIDE,
    };
  }
  return {
    width: WORKFLOW_ORDINARY_MEDIA_SHORT_SIDE,
    height: Math.min(
      Math.round((safeHeight / safeWidth) * WORKFLOW_ORDINARY_MEDIA_SHORT_SIDE),
      WORKFLOW_ORDINARY_MEDIA_MAX_LONG_SIDE,
    ),
  };
}

export function parseWorkflowAspectRatioSize(
  value: string,
  fallbackWidth = LIBTV_TAPNOW_GENERATOR_WIDTH,
  fallbackHeight = LIBTV_TAPNOW_GENERATOR_HEIGHT,
) {
  const normalized = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  const matched = normalized.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!matched) return { width: fallbackWidth, height: fallbackHeight };
  const width = Number(matched[1]);
  const height = Number(matched[2]);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: fallbackWidth, height: fallbackHeight };
  }
  return { width, height };
}

export function getWorkflowImageGeneratorResultDisplayFrame(
  child: Pick<LibTvWorkflowNode, "width" | "height" | "data"> | undefined,
  aspectRatio?: string,
) {
  const ratioFallback = parseWorkflowAspectRatioSize(
    String(aspectRatio || "16:9"),
    16,
    9,
  );
  const naturalWidth = Math.max(
    0,
    Math.round(Number(child?.data?.workflowMediaNaturalWidth || 0)),
  );
  const naturalHeight = Math.max(
    0,
    Math.round(Number(child?.data?.workflowMediaNaturalHeight || 0)),
  );
  const width = naturalWidth > 0 ? naturalWidth : ratioFallback.width;
  const height = naturalHeight > 0 ? naturalHeight : ratioFallback.height;
  return workflowImageDisplayFrameFromRatio(width, height);
}

export function getWorkflowImageResultDisplayFrameFromItem(
  item: LibTvWorkflowImageResult | undefined,
  aspectRatio?: string,
) {
  const ratioFallback = parseWorkflowAspectRatioSize(
    String(aspectRatio || "16:9"),
    16,
    9,
  );
  const width =
    Number(item?.width || 0) > 0 ? Number(item?.width) : ratioFallback.width;
  const height =
    Number(item?.height || 0) > 0 ? Number(item?.height) : ratioFallback.height;
  return workflowImageDisplayFrameFromRatio(width, height);
}

export function getWorkflowImageResultStripFrame(node: LibTvWorkflowNode) {
  const rawResults = Array.isArray(node.data?.workflowImageResults)
    ? node.data.workflowImageResults
    : [];
  const normalizedResults = rawResults
    .map((item) => ({
      url: String(item?.url || "").trim(),
      width:
        Number.isFinite(Number(item?.width)) && Number(item?.width) > 0
          ? Math.round(Number(item.width))
          : undefined,
      height:
        Number.isFinite(Number(item?.height)) && Number(item?.height) > 0
          ? Math.round(Number(item.height))
          : undefined,
      title:
        typeof item?.title === "string"
          ? item.title.trim() || undefined
          : undefined,
    }))
    .filter((item) => Boolean(item.url));
  const mediaUrl = String(node.data?.mediaUrl || "").trim();
  const naturalMediaWidth = Math.max(
    0,
    Math.round(Number(node.data?.workflowMediaNaturalWidth || 0)),
  );
  const naturalMediaHeight = Math.max(
    0,
    Math.round(Number(node.data?.workflowMediaNaturalHeight || 0)),
  );
  if (mediaUrl && !normalizedResults.some((item) => item.url === mediaUrl)) {
    normalizedResults.unshift({
      url: mediaUrl,
      width: naturalMediaWidth || undefined,
      height: naturalMediaHeight || undefined,
      title:
        typeof node.data?.title === "string"
          ? node.data.title.trim() || undefined
          : undefined,
    });
  }
  const results = normalizedResults.slice(0, 8);
  if (results.length === 0) return null;
  const primaryIndex = Math.max(
    0,
    results.findIndex((item) => item.url === mediaUrl),
  );
  const primaryItem = results[primaryIndex] || results[0];
  const frame = getWorkflowImageResultDisplayFrameFromItem(
    primaryItem,
    String(node.data?.aspectRatio || "16:9"),
  );
  const width = Math.max(1, Number(node.width || frame.width));
  const height = Math.max(1, Number(node.height || frame.height));
  if (results.length <= 1 || node.data?.workflowImageResultsCollapsed) {
    return { width, height };
  }
  const gap = 8;
  return {
    width: results.length * width + Math.max(0, results.length - 1) * gap,
    height,
  };
}

export function parseWorkflowDurationSeconds(
  value: unknown,
  fallbackSeconds = 5,
) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return value;
  const raw = String(value || "").trim();
  if (!raw) return fallbackSeconds;
  const colonParts =
    raw
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter((item) => Number.isFinite(item)) || [];
  if (raw.includes(":") && colonParts.length >= 2) {
    const parts = colonParts.slice(-3);
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return seconds > 0 ? seconds : fallbackSeconds;
  }
  const hours = Number(
    raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours|小时)/i)?.[1] || 0,
  );
  const minutes = Number(
    raw.match(
      /(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes|分钟|分)/i,
    )?.[1] || 0,
  );
  const seconds = Number(
    raw.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds|秒)/i)?.[1] || 0,
  );
  const composed = hours * 3600 + minutes * 60 + seconds;
  if (composed > 0) return composed;
  const first = Number(raw.match(/\d+(?:\.\d+)?/)?.[0] || 0);
  return first > 0 ? first : fallbackSeconds;
}

export function normalizeWorkflowDurationLabel(
  value: unknown,
  fallbackSeconds = 5,
) {
  const seconds = Math.max(
    1,
    Math.round(parseWorkflowDurationSeconds(value, fallbackSeconds)),
  );
  return `${seconds}s`;
}

export function readWorkflowImageUrlSize(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: Math.max(1, Math.round(image.naturalWidth || image.width || 1)),
        height: Math.max(
          1,
          Math.round(image.naturalHeight || image.height || 1),
        ),
      });
    };
    image.onerror = () => reject(new Error("image size unavailable"));
    image.src = url;
  });
}

export function isRenderableWorkflowMediaUrl(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return false;
  if (trimmed === "Image" || trimmed === "Video" || trimmed === "Audio")
    return false;
  if (/^(https?:|blob:|data:)/i.test(trimmed)) return true;
  if (trimmed.startsWith("/")) return true;
  return false;
}
