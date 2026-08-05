"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  constrainWorkflowCropRect,
  cropWorkflowImageToFile,
  getWorkflowImageRenderUrl,
  loadWorkflowCropImage,
  makeCenteredWorkflowCropRect,
} from "./workflow-media-utils";
import { AspectRatioIcon } from "./workflow-icons";
import { CANVAS_CONTROLS_MENU_PANEL_STYLE } from "./surface-contracts";
import type {
  WorkflowCropDragMode,
  WorkflowCropDragState,
  WorkflowCropRect,
} from "./surface-contracts";

export const WORKFLOW_CROP_RATIO_OPTIONS: Array<{
  key: string;
  label: string;
  value: number | null;
}> = [
  { key: "original", label: "原图比例", value: null },
  { key: "1:1", label: "1 : 1", value: 1 },
  { key: "4:3", label: "4 : 3", value: 4 / 3 },
  { key: "3:4", label: "3 : 4", value: 3 / 4 },
  { key: "16:9", label: "16 : 9", value: 16 / 9 },
  { key: "9:16", label: "9 : 16", value: 9 / 16 },
  { key: "21:9", label: "21 : 9", value: 21 / 9 },
  { key: "custom", label: "自定义…", value: null },
];

export function getWorkflowCropDisplayRatioValue(
  ratioKey: string,
  bounds: { width: number; height: number },
  naturalSize: { width: number; height: number } | null,
) {
  const displayRatio = bounds.width / bounds.height;
  if (ratioKey === "original") return displayRatio;
  if (ratioKey === "custom") return null;
  const outputRatio =
    WORKFLOW_CROP_RATIO_OPTIONS.find((item) => item.key === ratioKey)?.value ??
    null;
  if (!outputRatio || !naturalSize?.width || !naturalSize.height)
    return outputRatio;
  return (
    (outputRatio * displayRatio) / (naturalSize.width / naturalSize.height)
  );
}

export function WorkflowImageCropOverlay({
  imageUrl,
  title,
  nodeWidth,
  nodeHeight,
  onCancel,
  onConfirm,
}: {
  imageUrl: string;
  title: string;
  nodeWidth: number;
  nodeHeight: number;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [ratioKey, setRatioKey] = useState("original");
  const [ratioOpen, setRatioOpen] = useState(false);
  const [cropRect, setCropRect] = useState<WorkflowCropRect>(() =>
    makeCenteredWorkflowCropRect({ width: nodeWidth, height: nodeHeight }),
  );
  const [dragState, setDragState] = useState<WorkflowCropDragState | null>(
    null,
  );
  const [naturalSize, setNaturalSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [applying, setApplying] = useState(false);
  const renderUrl = getWorkflowImageRenderUrl(imageUrl);
  const bounds = useMemo(
    () => ({ width: Math.max(1, nodeWidth), height: Math.max(1, nodeHeight) }),
    [nodeHeight, nodeWidth],
  );
  const activeRatio = useMemo(
    () => getWorkflowCropDisplayRatioValue(ratioKey, bounds, naturalSize),
    [bounds, naturalSize, ratioKey],
  );

  useEffect(() => {
    let cancelled = false;
    loadWorkflowCropImage(imageUrl)
      .then((image) => {
        if (!cancelled)
          setNaturalSize({
            width: image.naturalWidth,
            height: image.naturalHeight,
          });
      })
      .catch(() => {
        if (!cancelled) setNaturalSize(null);
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    setCropRect(makeCenteredWorkflowCropRect(bounds, activeRatio));
  }, [activeRatio, bounds]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  useEffect(() => {
    if (!dragState) return;
    const handlePointerMove = (event: MouseEvent) => {
      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      const start = dragState.startRect;
      let next: WorkflowCropRect = { ...start };

      if (dragState.mode === "move") {
        next.x = start.x + dx;
        next.y = start.y + dy;
      } else {
        if (dragState.mode.includes("w")) {
          next.x = start.x + dx;
          next.width = start.width - dx;
        }
        if (dragState.mode.includes("e")) {
          next.width = start.width + dx;
        }
        if (dragState.mode.includes("n")) {
          next.y = start.y + dy;
          next.height = start.height - dy;
        }
        if (dragState.mode.includes("s")) {
          next.height = start.height + dy;
        }

        const ratio = activeRatio;
        if (ratio && ratio > 0) {
          const anchorRight = dragState.mode.includes("w");
          const anchorBottom = dragState.mode.includes("n");
          if (Math.abs(dx) > Math.abs(dy)) {
            next.height = next.width / ratio;
          } else {
            next.width = next.height * ratio;
          }
          if (anchorRight) next.x = start.x + start.width - next.width;
          if (anchorBottom) next.y = start.y + start.height - next.height;
        }
      }

      setCropRect(constrainWorkflowCropRect(next, bounds, activeRatio));
    };
    const handlePointerUp = () => setDragState(null);
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", handlePointerUp);
    return () => {
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", handlePointerUp);
    };
  }, [activeRatio, bounds, dragState]);

  const startDrag = useCallback(
    (event: React.MouseEvent, mode: WorkflowCropDragMode) => {
      event.preventDefault();
      event.stopPropagation();
      setRatioOpen(false);
      setDragState({
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startRect: cropRect,
      });
    },
    [cropRect],
  );

  const confirmCrop = useCallback(async () => {
    if (applying) return;
    setApplying(true);
    try {
      const file = await cropWorkflowImageToFile(
        imageUrl,
        cropRect,
        bounds,
        `${String(title || "image").trim() || "image"}-crop.png`,
      );
      onConfirm(file);
    } catch (error) {
      console.error("[Workflow crop] failed", error);
    } finally {
      setApplying(false);
    }
  }, [applying, bounds, cropRect, imageUrl, onConfirm, title]);

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute left-0 top-0 z-[80] flex flex-col items-center"
      style={{ width: nodeWidth, height: nodeHeight }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="relative h-full w-full overflow-visible outline outline-2 outline-primary/30">
        <div className="relative h-full w-full touch-none select-none overflow-hidden rounded-2xl">
          <img
            src={renderUrl}
            alt=""
            className="pointer-events-none absolute left-0 top-0 h-full w-full object-fill brightness-50"
            draggable={false}
          />
          <div
            className="absolute group/crop"
            style={{
              left: cropRect.x,
              top: cropRect.y,
              width: cropRect.width,
              height: cropRect.height,
              boxShadow: "rgba(0,0,0,0.5) 0 0 0 9999px",
            }}
          >
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={renderUrl}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{
                  width: nodeWidth,
                  height: nodeHeight,
                  left: -cropRect.x,
                  top: -cropRect.y,
                }}
              />
            </div>
            <div className="pointer-events-none absolute inset-0 border border-white/50" />
            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/crop:opacity-100">
              <div className="absolute left-0 right-0 top-1/3 h-px bg-white/30" />
              <div className="absolute left-0 right-0 top-2/3 h-px bg-white/30" />
              <div className="absolute bottom-0 left-1/3 top-0 w-px bg-white/30" />
              <div className="absolute bottom-0 left-2/3 top-0 w-px bg-white/30" />
            </div>
            <WorkflowCropCornerHandle position="nw" onMouseDown={startDrag} />
            <WorkflowCropCornerHandle position="ne" onMouseDown={startDrag} />
            <WorkflowCropCornerHandle position="sw" onMouseDown={startDrag} />
            <WorkflowCropCornerHandle position="se" onMouseDown={startDrag} />
            <WorkflowCropEdgeHandle position="n" onMouseDown={startDrag} />
            <WorkflowCropEdgeHandle position="s" onMouseDown={startDrag} />
            <WorkflowCropEdgeHandle position="w" onMouseDown={startDrag} />
            <WorkflowCropEdgeHandle position="e" onMouseDown={startDrag} />
            <div
              className="absolute inset-0 cursor-move"
              onMouseDown={(event) => startDrag(event, "move")}
            />
          </div>
        </div>
      </div>
      <div className="absolute -bottom-16 left-1/2 z-50 w-max -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full border border-white/[0.10] bg-[#202024]/95 p-1 text-white/82 shadow-lg backdrop-blur-xl">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/62 transition-colors hover:bg-white/[0.08] hover:text-red-300"
            aria-label="取消裁剪"
            onClick={onCancel}
          >
            <X className="size-4" />
          </button>
          <div className="h-4 w-px bg-white/[0.12]" />
          <div className="relative">
            <button
              type="button"
              className="flex h-8 items-center gap-1 rounded-full px-3 text-xs text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
              onClick={() => setRatioOpen((open) => !open)}
            >
              <AspectRatioIcon />
              宽高比
            </button>
            {ratioOpen ? (
              <div
                className="absolute bottom-[calc(100%+8px)] left-1/2 w-32 -translate-x-1/2 rounded-md p-1 text-xs text-canvas-controls-text"
                style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
              >
                {WORKFLOW_CROP_RATIO_OPTIONS.map((item) =>
                  item.key === "custom" ? (
                    <React.Fragment key={item.key}>
                      <div className="-mx-1 my-1 h-px bg-white/[0.10]" />
                      <button
                        type="button"
                        className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-canvas-controls-hover ${item.key === ratioKey ? "text-canvas-controls-text" : "text-canvas-controls-text opacity-70"}`}
                        onClick={() => {
                          setRatioKey(item.key);
                          setRatioOpen(false);
                        }}
                      >
                        {item.label}
                      </button>
                    </React.Fragment>
                  ) : (
                    <button
                      key={item.key}
                      type="button"
                      className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-canvas-controls-hover ${item.key === ratioKey ? "text-canvas-controls-text" : "text-canvas-controls-text opacity-70"}`}
                      onClick={() => {
                        setRatioKey(item.key);
                        setRatioOpen(false);
                      }}
                    >
                      {item.label}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>
          <div className="h-4 w-px bg-white/[0.12]" />
          <button
            type="button"
            disabled={applying}
            className="flex h-8 items-center gap-1 rounded-full bg-white px-3 text-xs font-medium text-black transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={confirmCrop}
          >
            <Check className="size-4" />
            {applying ? "裁剪中" : "确认裁剪"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowCropCornerHandle({
  position,
  onMouseDown,
}: {
  position: "nw" | "ne" | "sw" | "se";
  onMouseDown: (event: React.MouseEvent, mode: WorkflowCropDragMode) => void;
}) {
  const isTop = position.includes("n");
  const isLeft = position.includes("w");
  const cursorClass =
    position === "nw"
      ? "cursor-nw-resize"
      : position === "ne"
        ? "cursor-ne-resize"
        : position === "sw"
          ? "cursor-sw-resize"
          : "cursor-se-resize";
  return (
    <div
      className={`absolute z-20 h-6 w-6 ${cursorClass} ${isTop ? "-top-[2px]" : "-bottom-[2px]"} ${isLeft ? "-left-[2px]" : "-right-[2px]"}`}
      onMouseDown={(event) => onMouseDown(event, position)}
    >
      <div
        className={`absolute ${isTop ? "top-0" : "bottom-0"} ${isLeft ? "left-0" : "right-0"} h-[3px] w-full bg-white`}
      />
      <div
        className={`absolute ${isTop ? "top-0" : "bottom-0"} ${isLeft ? "left-0" : "right-0"} h-full w-[3px] bg-white`}
      />
    </div>
  );
}

export function WorkflowCropEdgeHandle({
  position,
  onMouseDown,
}: {
  position: "n" | "s" | "w" | "e";
  onMouseDown: (event: React.MouseEvent, mode: WorkflowCropDragMode) => void;
}) {
  if (position === "n" || position === "s") {
    return (
      <div
        className={`absolute left-6 right-6 z-20 flex h-[12px] ${position === "n" ? "cursor-n-resize -top-[2px] -mt-[5px]" : "cursor-s-resize -bottom-[2px] -mb-[5px]"} items-center justify-center`}
        onMouseDown={(event) => onMouseDown(event, position)}
      >
        <div className="h-[3px] w-8 rounded-full bg-white" />
      </div>
    );
  }
  return (
    <div
      className={`absolute bottom-6 top-6 z-20 flex w-[12px] ${position === "w" ? "cursor-w-resize -left-[2px] -ml-[5px]" : "cursor-e-resize -right-[2px] -mr-[5px]"} items-center justify-center`}
      onMouseDown={(event) => onMouseDown(event, position)}
    >
      <div className="h-8 w-[3px] rounded-full bg-white" />
    </div>
  );
}
