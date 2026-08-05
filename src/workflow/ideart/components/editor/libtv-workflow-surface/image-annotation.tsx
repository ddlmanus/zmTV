"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  buildWorkflowAnnotatedImageDataUrl,
  drawWorkflowAnnotationItems,
  getWorkflowAnnotationPoint,
  getWorkflowImageContentFrame,
  useWorkflowImageNaturalSize,
} from "./workflow-media-utils";
import {
  WorkflowRedrawCurveIcon,
  WorkflowRedrawToolbarButton,
} from "./image-redraw";
import type {
  WorkflowAnnotationItem,
  WorkflowAnnotationPoint,
  WorkflowAnnotationSaveRequest,
  WorkflowAnnotationTextItem,
  WorkflowAnnotationTool,
} from "./surface-contracts";
import type { WorkflowImageFitMode } from "./workflow-media-utils";

export function WorkflowAnnotationToolIcon({
  tool,
}: {
  tool: WorkflowAnnotationTool;
}) {
  if (tool === "rect") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="none"
        viewBox="0 0 16 16"
        className="h-4 w-4 opacity-60"
      >
        <path
          fill="currentColor"
          d="M2.133 10.999c.22 0 .4.18.4.4v1.213c0 .472.382.854.854.854H4.6c.22 0 .4.18.4.4v.4a.4.4 0 0 1-.4.4H3.387a2.054 2.054 0 0 1-2.051-1.948l-.003-.106V11.4c0-.22.18-.4.4-.4zm7.134 2.467c.22 0 .4.18.4.4v.4a.4.4 0 0 1-.4.4H6.733a.4.4 0 0 1-.4-.4v-.4c0-.22.18-.4.4-.4zm5-2.467c.22 0 .4.18.4.4v1.213l-.003.106a2.054 2.054 0 0 1-1.945 1.945l-.106.003H11.4a.4.4 0 0 1-.4-.4v-.4c0-.22.18-.4.4-.4h1.213a.854.854 0 0 0 .854-.854V11.4c0-.22.18-.4.4-.4zM2.133 6.332c.22 0 .4.18.4.4v2.534a.4.4 0 0 1-.4.4h-.4a.4.4 0 0 1-.4-.4V6.732c0-.22.18-.4.4-.4zm12.134 0c.22 0 .4.18.4.4v2.534a.4.4 0 0 1-.4.4h-.4a.4.4 0 0 1-.4-.4V6.732c0-.22.18-.4.4-.4zm-9.667-5c.22 0 .4.18.4.4v.4a.4.4 0 0 1-.4.4H3.387a.854.854 0 0 0-.854.854v1.213a.4.4 0 0 1-.4.4h-.4a.4.4 0 0 1-.4-.4V3.386c0-1.134.92-2.054 2.054-2.054zm8.119.003a2.054 2.054 0 0 1 1.948 2.05V4.6a.4.4 0 0 1-.4.4h-.4a.4.4 0 0 1-.4-.4V3.386a.854.854 0 0 0-.854-.854H11.4a.4.4 0 0 1-.4-.4v-.4c0-.22.18-.4.4-.4h1.213zm-3.452-.003c.22 0 .4.18.4.4v.4a.4.4 0 0 1-.4.4H6.733a.4.4 0 0 1-.4-.4v-.4c0-.22.18-.4.4-.4z"
        />
      </svg>
    );
  }
  if (tool === "eraser") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="none"
        viewBox="0 0 16 16"
        className="h-4 w-4 opacity-60"
      >
        <path
          fill="currentColor"
          d="M7.607 1.622c.84-.84 2.201-.84 3.041 0l3.383 3.382c.84.84.84 2.203 0 3.042l-5.934 5.935h6.936a.3.3 0 0 1 .3.3v.4a.3.3 0 0 1-.3.3H6.358a2.15 2.15 0 0 1-1.68-.624l-3.382-3.383a2.15 2.15 0 0 1-.077-2.96l.077-.08zM2.003 8.64a1.15 1.15 0 0 0 0 1.627l3.382 3.383c.205.205.469.315.737.333v-.002h.197c.253-.026.5-.136.694-.33l1.308-1.309-5.01-5.01zM9.94 2.33a1.15 1.15 0 0 0-1.627 0L4.018 6.626l5.01 5.01 4.297-4.297a1.15 1.15 0 0 0-.001-1.628z"
        />
      </svg>
    );
  }
  if (tool === "text") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        fill="none"
        viewBox="0 0 20 20"
        className="h-4 w-4 opacity-60"
      >
        <path
          fill="currentColor"
          d="M15.5 2.5a2 2 0 0 1 2 2v3h-1.3v-3a.7.7 0 0 0-.7-.7h-4.85v12.4H15v1.3H5v-1.3h4.35V3.8H4.5a.7.7 0 0 0-.7.7v3H2.5v-3a2 2 0 0 1 2-2z"
        />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      fill="none"
      viewBox="0 0 16 16"
      className="h-4 w-4 opacity-60"
    >
      <path
        fill="currentColor"
        d="M9.287 2.31a3.083 3.083 0 0 1 4.47-.144l.114.119a3.023 3.023 0 0 1-.28 4.333l-5.527 4.719a3.35 3.35 0 0 1-.985 2.086l-.132.117c-1.45 1.173-5.59 1.067-5.61 1.066-.001-.033-.213-4.497 1.094-5.794a3.4 3.4 0 0 1 1.954-.96zm-3.01 7.296c-.795-.788-2.135-.8-2.994.051-.102.1-.266.378-.413.92-.139.509-.226 1.115-.278 1.72-.033.389-.048.764-.056 1.093.319-.014.68-.038 1.053-.077.598-.062 1.199-.16 1.704-.305.537-.154.823-.321.934-.431.859-.852.846-2.182.05-2.97m6.628-6.595a1.87 1.87 0 0 0-2.713.087l-4.326 4.89c.463.152.898.409 1.264.773.341.338.588.735.745 1.158l4.928-4.207c.82-.7.866-1.943.102-2.701"
      />
    </svg>
  );
}

export function WorkflowAnnotationModeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      fill="none"
      viewBox="0 0 14 14"
      className="h-4 w-4 shrink-0 opacity-60"
    >
      <path
        fill="currentColor"
        d="M5.08.824a.41.41 0 0 1-.412.411H2.08a.845.845 0 0 0-.845.845v9.569c0 .466.379.845.845.845h2.588c.228 0 .412.184.412.412v.411a.41.41 0 0 1-.412.412H2.08a2.08 2.08 0 0 1-2.077-1.973L0 11.65V2.08A2.08 2.08 0 0 1 2.08 0h2.588c.228 0 .412.184.412.412z"
      />
      <path
        fill="currentColor"
        d="M13.82 6.428a.62.62 0 0 1 0 .873l-4.564 4.563a.41.41 0 0 1-.582 0l-.292-.291a.41.41 0 0 1 0-.583l3.508-3.507H4.565a.41.41 0 0 1-.411-.412v-.413c0-.227.184-.412.411-.412h7.325L8.382 2.74a.41.41 0 0 1 0-.583l.292-.291c.16-.161.421-.161.582 0z"
      />
    </svg>
  );
}

export function WorkflowAnnotationUndoIcon({
  direction,
}: {
  direction: "back" | "forward";
}) {
  if (direction === "forward") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="14"
        fill="none"
        viewBox="8.6 9.4 14.8 13.4"
        className="h-4 w-4 opacity-60"
      >
        <path
          fill="currentColor"
          d="m17.771 10.34 3.218 3.217h-7.767a4.555 4.555 0 0 0 0 9.11h2.806v-1.2h-2.806a3.355 3.355 0 0 1 0-6.71h7.767l-3.218 3.218.85.85 4.667-4.667L18.62 9.49z"
        />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="14"
      fill="none"
      viewBox="0 0 15 14"
      className="h-4 w-4 opacity-60"
    >
      <path
        fill="currentColor"
        d="M5.66.871 2.358 4.173h7.969a4.673 4.673 0 0 1 0 9.346H7.449v-1.231h2.878a3.442 3.442 0 0 0 0-6.883h-7.97l3.303 3.3-.871.872L0 4.789 4.789 0z"
      />
    </svg>
  );
}

export function WorkflowImageAnnotationOverlay({
  imageUrl,
  nodeWidth,
  nodeHeight,
  fitMode,
  onClose,
  onSave,
}: {
  imageUrl: string;
  nodeWidth: number;
  nodeHeight: number;
  fitMode: WorkflowImageFitMode;
  onClose: () => void;
  onSave: (request: WorkflowAnnotationSaveRequest) => void;
}) {
  const nodeBounds = useMemo(
    () => ({ width: Math.max(1, nodeWidth), height: Math.max(1, nodeHeight) }),
    [nodeHeight, nodeWidth],
  );
  const naturalSize = useWorkflowImageNaturalSize(imageUrl);
  const contentFrame = useMemo(
    () => getWorkflowImageContentFrame(nodeBounds, naturalSize, fitMode),
    [fitMode, naturalSize, nodeBounds],
  );
  const bounds = useMemo(
    () => ({
      width: Math.max(1, contentFrame.width),
      height: Math.max(1, contentFrame.height),
    }),
    [contentFrame.height, contentFrame.width],
  );
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<WorkflowAnnotationTool>("brush");
  const [color, setColor] = useState("#ff0000");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [items, setItems] = useState<WorkflowAnnotationItem[]>([]);
  const [redoStack, setRedoStack] = useState<WorkflowAnnotationItem[]>([]);
  const [activeItem, setActiveItem] = useState<WorkflowAnnotationItem | null>(
    null,
  );
  const [textDraft, setTextDraft] = useState<{
    x: number;
    y: number;
    value: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [colorOpen, setColorOpen] = useState(false);
  const rectStartRef = useRef<WorkflowAnnotationPoint | null>(null);
  const oldCanvasVars = {
    "--canvas-controls-border": "rgba(255,255,255,0.12)",
    "--canvas-controls-hover": "rgba(255,255,255,0.08)",
    "--canvas-controls-active": "rgba(255,255,255,0.10)",
  } as React.CSSProperties;
  const colors = [
    "#facc15",
    "#f97316",
    "#ec4899",
    "#ff0000",
    "#8b5cf6",
    "#3b82f6",
    "#ffffff",
  ];

  const paintItems = useCallback(
    (
      nextItems: WorkflowAnnotationItem[],
      active: WorkflowAnnotationItem | null = null,
    ) => {
      const canvas = annotationCanvasRef.current;
      if (!canvas) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${bounds.width}px`;
        canvas.style.height = `${bounds.height}px`;
      }
      drawWorkflowAnnotationItems(
        canvas,
        active ? [...nextItems, active] : nextItems,
        bounds,
        {
          scaleX: ratio,
          scaleY: ratio,
        },
      );
    },
    [bounds],
  );

  useEffect(() => {
    paintItems(items, activeItem);
  }, [activeItem, items, paintItems]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (textDraft) {
          setTextDraft(null);
        } else {
          onClose();
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          setRedoStack((current) => {
            const [next, ...rest] = current;
            if (!next) return current;
            setItems((existing) => [...existing, next]);
            return rest;
          });
        } else {
          setItems((current) => {
            const nextItems = current.slice(0, -1);
            const removed = current[current.length - 1];
            if (removed) setRedoStack((existing) => [removed, ...existing]);
            return nextItems;
          });
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, textDraft]);

  const commitTextDraft = useCallback(() => {
    setTextDraft((current) => {
      const value = String(current?.value || "").trim();
      if (!current || !value) return null;
      const item: WorkflowAnnotationTextItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        tool: "text",
        color,
        strokeWidth,
        point: { x: current.x, y: current.y },
        text: value,
      };
      setItems((existing) => [...existing, item]);
      setRedoStack([]);
      setErrorMessage("");
      return null;
    });
  }, [color, strokeWidth]);

  const commitItem = useCallback((item: WorkflowAnnotationItem | null) => {
    if (!item) return;
    if (item.tool === "rect" && (item.rect.width < 2 || item.rect.height < 2))
      return;
    if (
      (item.tool === "brush" || item.tool === "eraser") &&
      item.points.length === 0
    )
      return;
    setItems((current) => [...current, item]);
    setRedoStack([]);
    setActiveItem(null);
    setErrorMessage("");
  }, []);

  const startDraw = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      commitTextDraft();
      const point = getWorkflowAnnotationPoint(event, bounds);
      if (tool === "text") {
        setTextDraft({ x: point.x, y: point.y, value: "" });
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      if (tool === "rect") {
        rectStartRef.current = point;
        setActiveItem({
          id,
          tool: "rect",
          color,
          strokeWidth,
          rect: { x: point.x, y: point.y, width: 1, height: 1 },
        });
      } else {
        rectStartRef.current = null;
        setActiveItem({
          id,
          tool,
          color,
          strokeWidth:
            tool === "eraser" ? Math.max(8, strokeWidth * 4) : strokeWidth,
          points: [point],
        });
      }
    },
    [bounds, color, commitTextDraft, strokeWidth, tool],
  );

  const moveDraw = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activeItem) return;
      event.preventDefault();
      event.stopPropagation();
      const point = getWorkflowAnnotationPoint(event, bounds);
      setActiveItem((current) => {
        if (!current) return null;
        if (current.tool === "rect") {
          const start = rectStartRef.current || {
            x: current.rect.x,
            y: current.rect.y,
          };
          return {
            ...current,
            rect: {
              x: Math.min(start.x, point.x),
              y: Math.min(start.y, point.y),
              width: Math.max(1, Math.abs(point.x - start.x)),
              height: Math.max(1, Math.abs(point.y - start.y)),
            },
          };
        }
        if (current.tool === "brush" || current.tool === "eraser") {
          return { ...current, points: [...current.points, point] };
        }
        return current;
      });
    },
    [activeItem, bounds],
  );

  const endDraw = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setActiveItem((current) => {
        commitItem(current);
        return null;
      });
      rectStartRef.current = null;
    },
    [commitItem],
  );

  const undo = useCallback(() => {
    if (textDraft) {
      setTextDraft(null);
      return;
    }
    setItems((current) => {
      const nextItems = current.slice(0, -1);
      const removed = current[current.length - 1];
      if (removed) setRedoStack((existing) => [removed, ...existing]);
      return nextItems;
    });
    setActiveItem(null);
  }, [textDraft]);

  const redo = useCallback(() => {
    setRedoStack((current) => {
      const [nextItem, ...rest] = current;
      if (!nextItem) return current;
      setItems((existing) => [...existing, nextItem]);
      return rest;
    });
  }, []);

  const save = useCallback(async () => {
    const finalItems =
      textDraft && textDraft.value.trim()
        ? [
            ...items,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              tool: "text" as const,
              color,
              strokeWidth,
              point: { x: textDraft.x, y: textDraft.y },
              text: textDraft.value.trim(),
            },
          ]
        : items;
    if (finalItems.length === 0) {
      setErrorMessage("请先添加标注");
      return;
    }
    setIsSaving(true);
    setErrorMessage("");
    try {
      const dataUrl = await buildWorkflowAnnotatedImageDataUrl({
        imageUrl,
        items: finalItems,
        displaySize: bounds,
      });
      setTextDraft(null);
      onSave({ dataUrl, prompt: "标注协作图" });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "标注图保存失败",
      );
    } finally {
      setIsSaving(false);
    }
  }, [bounds, color, imageUrl, items, onSave, strokeWidth, textDraft]);

  const toolItems: Array<{ value: WorkflowAnnotationTool; label: string }> = [
    { value: "brush", label: "画笔" },
    { value: "rect", label: "框选" },
    { value: "eraser", label: "橡皮擦" },
    { value: "text", label: "文字" },
  ];

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto absolute left-0 top-0 z-[90] flex flex-col items-center overflow-visible"
      style={{ width: nodeBounds.width, height: nodeBounds.height }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="absolute left-1/2 top-0 z-[1001] w-max -translate-x-1/2"
        style={oldCanvasVars}
      >
        <div className="relative overflow-visible">
          <div className="[&>*:first-child]:absolute [&>*:first-child]:bottom-full [&>*:first-child]:left-1/2 [&>*:first-child]:mb-2.5 [&>*:first-child]:w-max [&>*:first-child]:-translate-x-1/2 [&>*:not(:first-child)]:!mt-0">
            <div
              className="flex w-fit items-center gap-2 rounded-xl p-2 shadow-md"
              style={{
                backgroundColor:
                  "var(--canvas-controls-bg, var(--panel-background, #262626))",
                border: "0.5px solid var(--canvas-controls-border, #363636)",
                color: "var(--canvas-controls-text, #fff)",
              }}
            >
              <WorkflowRedrawToolbarButton label="标注" onClick={onClose}>
                <WorkflowAnnotationModeIcon />
              </WorkflowRedrawToolbarButton>
              <div className="h-6 w-px shrink-0 bg-canvas-controls-border" />
              {toolItems.map((item) => (
                <WorkflowRedrawToolbarButton
                  key={item.value}
                  active={tool === item.value}
                  onClick={() => setTool(item.value)}
                >
                  <WorkflowAnnotationToolIcon tool={item.value} />
                </WorkflowRedrawToolbarButton>
              ))}
              <div className="h-6 w-px shrink-0 bg-canvas-controls-border" />
              <div className="relative">
                {colorOpen ? (
                  <div
                    className="absolute left-1/2 top-full z-[1100] mt-2 flex -translate-x-1/2 flex-col items-center gap-4 rounded-2xl px-4 py-5 shadow-[0_16px_36px_rgba(0,0,0,0.22)] backdrop-blur"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--canvas-controls-bg, #262626) 95%, transparent)",
                      border:
                        "0.5px solid var(--canvas-controls-border, #363636)",
                    }}
                  >
                    {colors.map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-label={item}
                        className="flex size-6 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110"
                        onClick={() => {
                          setColor(item);
                          setColorOpen(false);
                        }}
                      >
                        <span
                          className="size-6 rounded-full border border-white/[0.18]"
                          style={{
                            backgroundColor: item,
                            boxShadow:
                              color === item
                                ? "0 0 0 3px rgba(255,255,255,0.75)"
                                : undefined,
                          }}
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={`inline-flex h-8 w-8 min-w-8 cursor-pointer items-center justify-center rounded-lg p-2 text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover active:bg-canvas-controls-active ${colorOpen ? "bg-canvas-controls-active" : ""}`}
                  aria-label="标注颜色"
                  aria-expanded={colorOpen}
                  onClick={() => setColorOpen((current) => !current)}
                >
                  <span
                    className="h-4 w-4 rounded-full border border-white/[0.20]"
                    style={{ backgroundColor: color }}
                  />
                </button>
              </div>
              <div className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border-0 bg-transparent px-3 py-2 text-neutral-400">
                <WorkflowRedrawCurveIcon size={strokeWidth} />
                <div className="relative flex h-3 w-16 shrink-0 items-center">
                  <div className="pointer-events-none absolute inset-x-0 h-1 rounded-full bg-neutral-600" />
                  <div
                    className="pointer-events-none absolute left-0 h-1 rounded-full bg-[#60a5fa]"
                    style={{ width: `${((strokeWidth - 1) / 39) * 64}px` }}
                  />
                  <div
                    className="pointer-events-none absolute top-0 h-3 w-3 rounded-full border border-neutral-100 bg-white"
                    style={{ left: `${((strokeWidth - 1) / 39) * 52}px` }}
                  />
                  <input
                    aria-label="线宽"
                    min={1}
                    max={40}
                    step={1}
                    className="absolute inset-0 h-3 w-full cursor-pointer appearance-none bg-transparent opacity-0"
                    type="range"
                    value={strokeWidth}
                    onChange={(event) =>
                      setStrokeWidth(Number(event.target.value))
                    }
                  />
                </div>
              </div>
              <div className="h-6 w-px shrink-0 bg-canvas-controls-border" />
              <WorkflowRedrawToolbarButton
                disabled={items.length === 0 && !textDraft}
                onClick={undo}
              >
                <WorkflowAnnotationUndoIcon direction="back" />
              </WorkflowRedrawToolbarButton>
              <WorkflowRedrawToolbarButton
                disabled={redoStack.length === 0}
                onClick={redo}
              >
                <WorkflowAnnotationUndoIcon direction="forward" />
              </WorkflowRedrawToolbarButton>
              <div className="h-6 w-px shrink-0 bg-canvas-controls-border" />
              <button
                type="button"
                disabled={isSaving}
                className="h-8 cursor-pointer rounded-lg bg-white px-4 text-[13px] font-medium text-neutral-950 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => {
                  void save();
                }}
              >
                {isSaving ? "保存中" : "保存"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        <div
          className="absolute cursor-crosshair touch-none select-none"
          style={{
            left: contentFrame.left,
            top: contentFrame.top,
            width: contentFrame.width,
            height: contentFrame.height,
          }}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={endDraw}
          onPointerCancel={endDraw}
        >
          <canvas
            ref={annotationCanvasRef}
            className="pointer-events-none block h-full w-full"
          />
          {textDraft ? (
            <input
              autoFocus
              value={textDraft.value}
              placeholder="输入标注文字"
              className="absolute rounded-md border border-white/[0.12] bg-[#202024]/95 px-2 py-1 text-sm text-white shadow-md outline-none placeholder:text-white/45"
              style={{
                left: `${(textDraft.x / bounds.width) * 100}%`,
                top: `${(textDraft.y / bounds.height) * 100}%`,
                transform: "translate(6px, -50%)",
              }}
              onChange={(event) =>
                setTextDraft((current) =>
                  current ? { ...current, value: event.target.value } : current,
                )
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") commitTextDraft();
                if (event.key === "Escape") setTextDraft(null);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            />
          ) : null}
        </div>
      </div>
      {errorMessage ? (
        <div className="absolute left-1/2 top-full z-[1001] mt-3 -translate-x-1/2 rounded-lg border border-red-400/20 bg-[#202024]/95 px-3 py-2 text-xs text-red-200 shadow-md backdrop-blur">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
