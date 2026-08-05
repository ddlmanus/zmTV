"use client";

import { useCallback, useEffect, useState } from "react";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  loadWorkflowCropImage,
  resizeWorkflowImageToFile,
} from "./workflow-media-utils";

export function WorkflowResizeLockIcon({ locked }: { locked: boolean }) {
  if (locked) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[18px] w-[18px]"
      >
        <path d="M5 11m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
        <path d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
        <path d="M8 11v-4a4 4 0 0 1 8 0v4" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M5 11m0 2a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z" />
      <path d="M12 16m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M8 11v-5a4 4 0 0 1 8 0" />
    </svg>
  );
}

export function WorkflowImageResizePanel({
  imageUrl,
  title,
  onCancel,
  onConfirm,
}: {
  imageUrl: string;
  title: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [widthInput, setWidthInput] = useState("");
  const [heightInput, setHeightInput] = useState("");
  const [ratioLocked, setRatioLocked] = useState(false);
  const [applying, setApplying] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const aspectRatio =
    naturalSize?.width && naturalSize?.height
      ? naturalSize.width / naturalSize.height
      : 1;
  const normalizedWidth = Math.max(
    1,
    Math.min(20000, Math.round(Number(widthInput) || 0)),
  );
  const normalizedHeight = Math.max(
    1,
    Math.min(20000, Math.round(Number(heightInput) || 0)),
  );
  const canApply = normalizedWidth > 0 && normalizedHeight > 0 && !applying;

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
        setWidthInput(String(next.width));
        setHeightInput(String(next.height));
      })
      .catch((error) => {
        if (!cancelled)
          setErrorMessage(
            error instanceof Error ? error.message : "读取原图像素失败",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const updateWidth = useCallback(
    (value: string) => {
      const clean = value.replace(/[^\d]/g, "").slice(0, 5);
      setWidthInput(clean);
      if (ratioLocked && clean) {
        setHeightInput(
          String(
            Math.max(
              1,
              Math.min(20000, Math.round(Number(clean) / aspectRatio)),
            ),
          ),
        );
      }
    },
    [aspectRatio, ratioLocked],
  );

  const updateHeight = useCallback(
    (value: string) => {
      const clean = value.replace(/[^\d]/g, "").slice(0, 5);
      setHeightInput(clean);
      if (ratioLocked && clean) {
        setWidthInput(
          String(
            Math.max(
              1,
              Math.min(20000, Math.round(Number(clean) * aspectRatio)),
            ),
          ),
        );
      }
    },
    [aspectRatio, ratioLocked],
  );

  const applyResize = useCallback(async () => {
    if (!canApply) return;
    setApplying(true);
    setErrorMessage("");
    try {
      const file = await resizeWorkflowImageToFile(
        imageUrl,
        normalizedWidth,
        normalizedHeight,
        `${String(title || "image").trim() || "image"}-resize.png`,
      );
      onConfirm(file);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "调整像素失败");
    } finally {
      setApplying(false);
    }
  }, [canApply, imageUrl, normalizedHeight, normalizedWidth, onConfirm, title]);

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute left-1/2 top-full z-50 mt-3 w-[360px] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#1F1F1F] p-4 text-white shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-sm font-semibold text-white/90">调整像素</p>
        <span className="text-xs font-normal text-white/55">
          原像素：
          {naturalSize
            ? `${naturalSize.width}*${naturalSize.height}像素`
            : "读取中..."}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <div className="space-y-2">
          <label
            className="text-xs font-medium text-white/70"
            htmlFor="workflow-resize-width"
          >
            宽度（px）
          </label>
          <input
            id="workflow-resize-width"
            type="number"
            min={1}
            max={20000}
            value={widthInput}
            onChange={(event) => updateWidth(event.target.value)}
            className="flex h-9 w-full appearance-none rounded-md border border-white/10 bg-transparent px-3 py-1 text-sm text-white shadow-sm outline-none transition-colors placeholder:text-white/35 focus:border-white/30 focus:ring-1 focus:ring-white/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
        <button
          type="button"
          className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
          aria-label="锁定宽高比"
          onClick={() => setRatioLocked((current) => !current)}
        >
          <WorkflowResizeLockIcon locked={ratioLocked} />
        </button>
        <div className="space-y-2">
          <label
            className="text-xs font-medium text-white/70"
            htmlFor="workflow-resize-height"
          >
            高度（px）
          </label>
          <input
            id="workflow-resize-height"
            type="number"
            min={1}
            max={20000}
            value={heightInput}
            onChange={(event) => updateHeight(event.target.value)}
            className="flex h-9 w-full appearance-none rounded-md border border-white/10 bg-transparent px-3 py-1 text-sm text-white shadow-sm outline-none transition-colors placeholder:text-white/35 focus:border-white/30 focus:ring-1 focus:ring-white/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
      </div>
      {errorMessage ? (
        <div className="mt-2 text-xs text-red-300">{errorMessage}</div>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="flex h-10 cursor-pointer items-center justify-center rounded-md border border-white/10 bg-white/[0.06] px-3 py-1 text-xs text-white/80 transition-colors hover:bg-white/[0.10] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={applying}
          onClick={onCancel}
        >
          取消
        </button>
        <button
          type="button"
          className="flex h-10 cursor-pointer items-center justify-center rounded-md bg-white/[0.12] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canApply}
          onClick={() => {
            void applyResize();
          }}
        >
          {applying ? "调整中" : "调整"}
        </button>
      </div>
    </div>
  );
}
