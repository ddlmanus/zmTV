"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LibraryBig,
  Magnet,
  Map as MapIcon,
  Minus,
  Plus,
  Scan,
  Workflow,
} from "lucide-react";
import type {
  LibTvWorkflowNode,
  LibTvWorkflowNodeKind,
} from "@/workflow/ideart/lib/libtv/workflow";
import { WORKFLOW_VIEWPORT_LIVE_EVENT } from "../libtv-workflow-surface/surface-contracts";

type WorkflowViewport = { x: number; y: number; zoom: number };
type MiniMapNode = {
  id: string;
  screen: { x: number; y: number; width: number; height: number };
};

const iconButtonClassName =
  "relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[6px] text-[var(--canvas-controls-icon,rgba(255,255,255,0.72))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] hover:text-[var(--canvas-controls-text,#fff)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]";

export function WorkflowBottomControls({
  nodes,
  zoom,
  onFitView,
  onZoomTo,
  onOpenAssetLibrary,
  viewport,
  viewportSize,
  edgesVisible,
  snapToGrid,
  onToggleEdgesVisible,
  onToggleSnapToGrid,
  getNodeFrame,
}: {
  nodes: LibTvWorkflowNode[];
  zoom: number;
  onFitView: () => void;
  onZoomTo: (zoom: number) => void;
  onOpenAssetLibrary: () => void;
  viewport: WorkflowViewport;
  viewportSize?: { width: number; height: number };
  edgesVisible: boolean;
  snapToGrid: boolean;
  onToggleEdgesVisible: () => void;
  onToggleSnapToGrid: () => void;
  getNodeFrame: (kind: LibTvWorkflowNodeKind) => {
    width: number;
    height: number;
  };
}) {
  const [miniMapOpen, setMiniMapOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [zoomInput, setZoomInput] = useState("");
  const [liveViewport, setLiveViewport] = useState(viewport);
  const liveViewportRef = useRef(viewport);
  const liveViewportFrameRef = useRef<number | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const safeZoom = Math.max(0.15, Math.min(8, Number(zoom || 1)));
  const zoomPercent = Math.round(safeZoom * 100);

  useEffect(() => {
    liveViewportRef.current = viewport;
    setLiveViewport(viewport);
  }, [viewport]);

  useEffect(() => {
    if (!miniMapOpen) return;

    const queueLiveViewport = (
      detail: Partial<WorkflowViewport> | undefined,
    ) => {
      if (
        !detail ||
        !Number.isFinite(Number(detail.x)) ||
        !Number.isFinite(Number(detail.y))
      )
        return;
      liveViewportRef.current = {
        x: Number(detail.x),
        y: Number(detail.y),
        zoom: Number.isFinite(Number(detail.zoom))
          ? Number(detail.zoom)
          : liveViewportRef.current.zoom,
      };
      if (liveViewportFrameRef.current !== null) return;
      liveViewportFrameRef.current = window.requestAnimationFrame(() => {
        liveViewportFrameRef.current = null;
        setLiveViewport(liveViewportRef.current);
      });
    };

    const handleLiveViewport = (event: Event) => {
      queueLiveViewport(
        (event as CustomEvent<Partial<WorkflowViewport>>).detail,
      );
    };
    const viewportElement = document.querySelector<HTMLElement>(
      ".libtv-workflow-surface--standalone .react-flow__viewport",
    );
    const readViewportTransform = () => {
      if (!viewportElement) return;
      const transform = window.getComputedStyle(viewportElement).transform;
      const matrixMatch = transform.match(/^matrix\(([^)]+)\)$/);
      if (matrixMatch) {
        const values = matrixMatch[1]
          .split(",")
          .map((value) => Number.parseFloat(value.trim()));
        if (values.length === 6 && values.every(Number.isFinite)) {
          queueLiveViewport({ x: values[4], y: values[5], zoom: values[0] });
          return;
        }
      }
      const inlineMatch = viewportElement.style.transform.match(
        /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\((-?[\d.]+)\)/,
      );
      if (inlineMatch) {
        queueLiveViewport({
          x: Number.parseFloat(inlineMatch[1]),
          y: Number.parseFloat(inlineMatch[2]),
          zoom: Number.parseFloat(inlineMatch[3]),
        });
      }
    };
    const observer =
      viewportElement && typeof MutationObserver !== "undefined"
        ? new MutationObserver(readViewportTransform)
        : null;
    if (viewportElement) {
      observer?.observe(viewportElement, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }
    readViewportTransform();
    window.addEventListener(WORKFLOW_VIEWPORT_LIVE_EVENT, handleLiveViewport);
    return () => {
      window.removeEventListener(
        WORKFLOW_VIEWPORT_LIVE_EVENT,
        handleLiveViewport,
      );
      observer?.disconnect();
      if (liveViewportFrameRef.current !== null) {
        window.cancelAnimationFrame(liveViewportFrameRef.current);
        liveViewportFrameRef.current = null;
      }
    };
  }, [miniMapOpen]);

  const miniMap = useMemo(() => {
    const width = 150;
    const height = 110;
    if (!miniMapOpen) {
      return {
        width,
        height,
        bounds: { x: 0, y: 0, width: 1, height: 1 },
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        nodes: [] as MiniMapNode[],
      };
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const absolutePositionById = new Map<string, { x: number; y: number }>();
    const resolveAbsolutePosition = (node: LibTvWorkflowNode) => {
      const cached = absolutePositionById.get(node.id);
      if (cached) return cached;
      const chain: LibTvWorkflowNode[] = [];
      const seen = new Set<string>();
      let cursor: LibTvWorkflowNode | undefined = node;
      let base = { x: 0, y: 0 };
      while (cursor && !seen.has(cursor.id)) {
        const known = absolutePositionById.get(cursor.id);
        if (known) {
          base = known;
          break;
        }
        seen.add(cursor.id);
        chain.push(cursor);
        cursor = cursor.parentId ? nodeById.get(cursor.parentId) : undefined;
      }
      for (let index = chain.length - 1; index >= 0; index -= 1) {
        const item = chain[index];
        base = {
          x: base.x + Number(item.x || 0),
          y: base.y + Number(item.y || 0),
        };
        absolutePositionById.set(item.id, base);
      }
      return (
        absolutePositionById.get(node.id) || {
          x: Number(node.x || 0),
          y: Number(node.y || 0),
        }
      );
    };
    const nodeRects = nodes.map((node) => {
      const frame = getNodeFrame(node.kind);
      const position = resolveAbsolutePosition(node);
      return {
        id: node.id,
        x: position.x,
        y: position.y,
        width: Math.max(1, Number(node.width || frame.width)),
        height: Math.max(1, Number(node.height || frame.height)),
      };
    });
    const rawBounds =
      nodeRects.length > 0
        ? nodeRects
        : [{ id: "__empty", x: 0, y: 0, width: 1, height: 1 }];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    rawBounds.forEach((rect) => {
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    });
    const padding = 80;
    const bounds = {
      x: minX - padding,
      y: minY - padding,
      width: Math.max(1, maxX - minX + padding * 2),
      height: Math.max(1, maxY - minY + padding * 2),
    };
    const scale = Math.min(width / bounds.width, height / bounds.height);
    const offsetX = (width - bounds.width * scale) / 2;
    const offsetY = (height - bounds.height * scale) / 2;
    const project = (rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => ({
      x: (rect.x - bounds.x) * scale + offsetX,
      y: (rect.y - bounds.y) * scale + offsetY,
      width: rect.width * scale,
      height: rect.height * scale,
    });

    let projectedNodes: MiniMapNode[];
    if (nodeRects.length <= 2_000) {
      projectedNodes = nodeRects.map((rect) => ({
        id: rect.id,
        screen: project(rect),
      }));
    } else {
      const columns = 50;
      const rows = 36;
      const buckets = new Set<string>();
      projectedNodes = [];
      nodeRects.forEach((rect) => {
        const screen = project(rect);
        const column = Math.max(
          0,
          Math.min(columns - 1, Math.floor((screen.x / width) * columns)),
        );
        const row = Math.max(
          0,
          Math.min(rows - 1, Math.floor((screen.y / height) * rows)),
        );
        const id = `${column}:${row}`;
        if (buckets.has(id)) return;
        buckets.add(id);
        projectedNodes.push({
          id: `bucket-${id}`,
          screen: {
            x: column * (width / columns),
            y: row * (height / rows),
            width: Math.max(2, width / columns),
            height: Math.max(2, height / rows),
          },
        });
      });
    }

    return {
      width,
      height,
      bounds,
      scale,
      offsetX,
      offsetY,
      nodes: projectedNodes,
    };
  }, [getNodeFrame, miniMapOpen, nodes]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    setZoomInput(String(zoomPercent));
  }, [zoomMenuOpen, zoomPercent]);

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || controlsRef.current?.contains(target)) return;
      setZoomMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [zoomMenuOpen]);

  const applyZoomPercent = (value: number) => {
    const safePercent = Math.max(15, Math.min(800, Math.round(value)));
    onZoomTo(safePercent / 100);
    setZoomInput(String(safePercent));
    setZoomMenuOpen(false);
  };
  const commitZoomInput = () => {
    const nextPercent = Number.parseFloat(zoomInput.replace("%", ""));
    if (!Number.isFinite(nextPercent)) {
      setZoomInput(String(zoomPercent));
      return;
    }
    applyZoomPercent(nextPercent);
  };
  const miniMapViewportRect = useMemo(() => {
    const scale = Math.max(0.0001, miniMap.scale);
    const liveZoom = Math.max(
      0.15,
      Math.min(8, Number(liveViewport.zoom || safeZoom)),
    );
    const viewportWidth = Math.max(1, Number(viewportSize?.width || 1470));
    const viewportHeight = Math.max(1, Number(viewportSize?.height || 685));
    const rawLeft =
      (-Number(liveViewport.x || 0) / liveZoom - miniMap.bounds.x) * scale +
      miniMap.offsetX;
    const rawTop =
      (-Number(liveViewport.y || 0) / liveZoom - miniMap.bounds.y) * scale +
      miniMap.offsetY;
    const rawRight = rawLeft + (viewportWidth / liveZoom) * scale;
    const rawBottom = rawTop + (viewportHeight / liveZoom) * scale;
    const x = Math.max(0, Math.min(miniMap.width, rawLeft));
    const y = Math.max(0, Math.min(miniMap.height, rawTop));
    const right = Math.max(0, Math.min(miniMap.width, rawRight));
    const bottom = Math.max(0, Math.min(miniMap.height, rawBottom));
    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    };
  }, [liveViewport, miniMap, safeZoom, viewportSize]);
  const zoomMenuItemClassName =
    "flex h-9 w-full items-center justify-between rounded-[6px] px-2.5 text-left text-[13px] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]";

  return (
    <div
      ref={controlsRef}
      data-workflow-bottom-controls="true"
      className="absolute bottom-3 left-3 z-40 flex max-w-[calc(100%-24px)] items-center gap-1 rounded-[8px] border border-[var(--canvas-controls-border,#363636)] bg-[var(--canvas-controls-bg,#262626)] p-1 text-[var(--canvas-controls-text,#f7f7f7)] shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.68))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] hover:text-[var(--canvas-controls-text,#fff)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]"
        title="资产管理"
        onClick={() => {
          setMiniMapOpen(false);
          setZoomMenuOpen(false);
          onOpenAssetLibrary();
        }}
      >
        <LibraryBig aria-hidden="true" className="size-3.5" />
        <span className="whitespace-nowrap">资产管理</span>
      </button>
      <div className="h-4 w-px shrink-0 bg-[var(--canvas-controls-border,#363636)]" />
      <button
        type="button"
        className={iconButtonClassName}
        title="整理画布（Option+Shift+F）"
        aria-label="整理画布"
        onClick={() => {
          setMiniMapOpen(false);
          setZoomMenuOpen(false);
          onFitView();
        }}
      >
        <Scan aria-hidden="true" className="size-3.5" />
      </button>
      <div className="relative shrink-0">
        {miniMapOpen ? (
          <div className="absolute bottom-[calc(100%+9px)] left-0 overflow-hidden rounded-[8px] border border-[var(--canvas-controls-border,#363636)] bg-[var(--canvas-minimap-bg,rgba(31,31,31,0.96))] shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
            <svg
              width={miniMap.width}
              height={miniMap.height}
              viewBox={`0 0 ${miniMap.width} ${miniMap.height}`}
              role="img"
              aria-label="画布小地图"
            >
              {miniMap.nodes.map((node) => (
                <rect
                  key={node.id}
                  x={node.screen.x}
                  y={node.screen.y}
                  width={Math.max(2, node.screen.width)}
                  height={Math.max(2, node.screen.height)}
                  rx={2}
                  fill="var(--canvas-minimap-node,rgb(92,92,92))"
                />
              ))}
              <rect
                x={miniMapViewportRect.x}
                y={miniMapViewportRect.y}
                width={miniMapViewportRect.width}
                height={miniMapViewportRect.height}
                fill="rgba(255,255,255,0.04)"
                stroke="var(--canvas-minimap-mask-stroke,rgba(255,255,255,0.5))"
                strokeWidth={1}
                pointerEvents="none"
              />
            </svg>
          </div>
        ) : null}
        <button
          type="button"
          className={`${iconButtonClassName} ${miniMapOpen ? "bg-[var(--canvas-controls-active,rgba(255,255,255,0.12))] text-[var(--canvas-controls-text,#fff)]" : ""}`}
          title={miniMapOpen ? "关闭小地图" : "打开小地图"}
          aria-label="切换小地图"
          aria-pressed={miniMapOpen}
          onClick={() => {
            setZoomMenuOpen(false);
            setMiniMapOpen((open) => !open);
          }}
        >
          <MapIcon aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <button
        type="button"
        className={iconButtonClassName}
        title={edgesVisible ? "隐藏节点连线" : "显示节点连线"}
        aria-label={edgesVisible ? "隐藏节点连线" : "显示节点连线"}
        aria-pressed={edgesVisible}
        onClick={onToggleEdgesVisible}
      >
        <Workflow aria-hidden="true" className="size-3.5" />
        {!edgesVisible ? (
          <span className="pointer-events-none absolute h-px w-[18px] rotate-45 bg-current opacity-70" />
        ) : null}
      </button>
      <button
        type="button"
        className={iconButtonClassName}
        title={snapToGrid ? "关闭网格吸附" : "开启网格吸附"}
        aria-label={snapToGrid ? "关闭网格吸附" : "开启网格吸附"}
        aria-pressed={snapToGrid}
        onClick={onToggleSnapToGrid}
      >
        <Magnet aria-hidden="true" className="size-3.5" />
        {!snapToGrid ? (
          <span className="pointer-events-none absolute h-px w-[18px] rotate-45 bg-current opacity-70" />
        ) : null}
      </button>
      <div className="h-4 w-px shrink-0 bg-[var(--canvas-controls-border,#363636)]" />
      <div className="relative shrink-0">
        {zoomMenuOpen ? (
          <div
            className="absolute bottom-[calc(100%+9px)] right-0 w-[188px] rounded-[8px] border border-[var(--canvas-controls-border,#363636)] bg-[var(--canvas-controls-bg,#262626)] p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)]"
            role="menu"
            aria-label="缩放选项"
          >
            <div className="mb-1 flex h-8 items-center rounded-[6px] bg-[var(--canvas-controls-hover,rgba(255,255,255,0.06))] px-2 focus-within:ring-2 focus-within:ring-[#4b9ca9]">
              <input
                inputMode="decimal"
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none"
                aria-label="缩放比例"
                value={zoomInput}
                onChange={(event) =>
                  setZoomInput(event.target.value.replace(/[^\d.]/g, ""))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitZoomInput();
                  }
                }}
                onBlur={commitZoomInput}
              />
              <span className="text-[12px] opacity-60">%</span>
            </div>
            <button
              type="button"
              role="menuitem"
              className={zoomMenuItemClassName}
              onClick={() => applyZoomPercent(safeZoom * 1.2 * 100)}
            >
              <span className="flex items-center gap-2">
                <Plus className="size-3.5" />
                放大
              </span>
              <span className="text-xs opacity-40">⌘ +</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={zoomMenuItemClassName}
              onClick={() => applyZoomPercent((safeZoom / 1.2) * 100)}
            >
              <span className="flex items-center gap-2">
                <Minus className="size-3.5" />
                缩小
              </span>
              <span className="text-xs opacity-40">⌘ -</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className={zoomMenuItemClassName}
              onClick={() => {
                onFitView();
                setZoomMenuOpen(false);
              }}
            >
              <span className="flex items-center gap-2">
                <Scan className="size-3.5" />
                适合屏幕
              </span>
              <span className="text-xs opacity-40">⌘ 0</span>
            </button>
            <div className="my-1 h-px bg-[var(--canvas-controls-border,#363636)]" />
            {[50, 100, 800].map((percent) => (
              <button
                key={percent}
                type="button"
                role="menuitem"
                className={zoomMenuItemClassName}
                onClick={() => applyZoomPercent(percent)}
              >
                缩放至 {percent}%
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className="flex h-7 min-w-[50px] items-center justify-center rounded-[6px] px-2 text-[12px] font-medium tabular-nums text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.68))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] hover:text-[var(--canvas-controls-text,#fff)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]"
          aria-label="缩放选项"
          aria-haspopup="menu"
          aria-expanded={zoomMenuOpen}
          onClick={() => {
            setMiniMapOpen(false);
            setZoomMenuOpen((open) => !open);
          }}
        >
          {zoomPercent}%
        </button>
      </div>
    </div>
  );
}
