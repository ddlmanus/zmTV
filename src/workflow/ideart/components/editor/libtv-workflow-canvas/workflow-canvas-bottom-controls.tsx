"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

export function WorkflowBottomControls({
  zoom,
  onFitView,
  onZoomTo,
}: {
  zoom: number;
  onFitView: () => void;
  onZoomTo: (zoom: number) => void;
}) {
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [zoomInput, setZoomInput] = useState("");
  const zoomControlRef = useRef<HTMLDivElement | null>(null);
  const safeZoom = Math.max(0.15, Math.min(8, Number(zoom || 1)));
  const zoomLabel = `${Math.round(safeZoom * 100)}%`;
  const zoomPercent = Math.round(safeZoom * 100);

  const getSteppedZoom = (direction: 1 | -1) => {
    const nextZoom = safeZoom * (direction > 0 ? 1.2 : 1 / 1.2);
    return Math.max(0.15, Math.min(8, nextZoom));
  };

  useEffect(() => {
    if (!zoomMenuOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || zoomControlRef.current?.contains(target)) return;
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
    const nextPercent = Number.parseFloat(
      String(zoomInput || "").replace("%", ""),
    );
    if (!Number.isFinite(nextPercent)) {
      setZoomInput(String(zoomPercent));
      return;
    }
    applyZoomPercent(nextPercent);
  };

  const zoomMenuItemClassName =
    "flex h-[36.15px] w-full cursor-pointer items-center justify-between rounded-[8px] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]";

  return (
    <div
      ref={zoomControlRef}
      data-workflow-zoom-control="true"
      className="absolute bottom-3 left-3 z-40 flex h-9 items-center rounded-[6px] border border-[var(--canvas-controls-border,#363636)] bg-[var(--canvas-controls-bg,#262626)] p-0.5 text-[var(--canvas-controls-text,#f7f7f7)] shadow-[0_8px_24px_rgba(0,0,0,0.24)]"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title="缩小画布"
        aria-label="缩小画布"
        className="flex size-8 items-center justify-center rounded-[5px] text-[var(--canvas-controls-icon,rgba(255,255,255,0.72))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] hover:text-[var(--canvas-controls-text,#fff)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]"
        onClick={() => onZoomTo(Math.max(0.15, safeZoom / 1.2))}
      >
        <Minus aria-hidden="true" className="size-4" strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label="当前缩放比例"
        aria-haspopup="menu"
        aria-expanded={zoomMenuOpen}
        className="flex h-8 min-w-[50px] items-center justify-center border-x border-[var(--canvas-controls-border,#363636)] px-2 text-[12px] font-medium tabular-nums text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.62))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] hover:text-[var(--canvas-controls-text,#fff)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]"
        onClick={() => {
          if (!zoomMenuOpen) setZoomInput(String(zoomPercent));
          setZoomMenuOpen((open) => !open);
        }}
      >
        {zoomLabel}
      </button>
      <button
        type="button"
        title="放大画布"
        aria-label="放大画布"
        className="flex size-8 items-center justify-center rounded-[5px] text-[var(--canvas-controls-icon,rgba(255,255,255,0.72))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] hover:text-[var(--canvas-controls-text,#fff)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]"
        onClick={() => onZoomTo(Math.min(8, safeZoom * 1.2))}
      >
        <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
      </button>
      {zoomMenuOpen ? (
        <div
          className="absolute bottom-[calc(100%+10px)] left-8 w-[186.61px] -translate-x-8 rounded-[12px] border-[0.5px] p-1.5 text-[var(--canvas-controls-text,rgba(255,255,255,0.86))] shadow-[var(--canvas-shadow-menu,0_8px_32px_#00000026,0_2px_8px_#0000001a)] backdrop-blur-[16px]"
          style={{
            backgroundColor:
              "var(--canvas-controls-bg, var(--canvas-bg, #242424))",
            borderColor:
              "var(--canvas-controls-border, rgba(255,255,255,0.10))",
          }}
          role="menu"
          aria-label="缩放选项"
          data-testid="workflow-zoom-menu"
        >
          <div className="px-0 py-[3px]">
            <div
              className="flex h-8 items-center overflow-hidden rounded-[8px] border px-2 focus-within:border-[var(--canvas-controls-focus,#0690ae)]"
              style={{
                backgroundColor:
                  "var(--canvas-controls-hover, rgba(0,0,0,0.08))",
                borderColor: "transparent",
              }}
            >
              <input
                inputMode="numeric"
                className="min-w-0 flex-1 border-none bg-transparent text-[13px] outline-none"
                aria-label="缩放比例"
                type="text"
                value={zoomInput}
                style={{ color: "var(--canvas-controls-text)" }}
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
              <span className="shrink-0 text-[12px] text-[var(--canvas-controls-text-secondary,#919191)]">
                %
              </span>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            className={zoomMenuItemClassName}
            onClick={() => applyZoomPercent(getSteppedZoom(1) * 100)}
          >
            <span>放大</span>
            <span className="flex items-center gap-1 text-xs opacity-40">
              <span>⌘</span>
              <span className="inline-block w-[10px] text-center">+</span>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={zoomMenuItemClassName}
            onClick={() => applyZoomPercent(getSteppedZoom(-1) * 100)}
          >
            <span>缩小</span>
            <span className="flex items-center gap-1 text-xs opacity-40">
              <span>⌘</span>
              <span className="inline-block w-[10px] text-center">-</span>
            </span>
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
            <span>适合屏幕</span>
            <span className="flex items-center gap-1 text-xs opacity-40">
              <span>⌘</span>
              <span className="inline-block w-[10px] text-center">0</span>
            </span>
          </button>
          <div className="m-1 h-px bg-[var(--canvas-controls-border,rgba(255,255,255,0.10))]" />
          <button
            type="button"
            role="menuitem"
            className={zoomMenuItemClassName}
            onClick={() => applyZoomPercent(50)}
          >
            <span>缩放至50%</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={zoomMenuItemClassName}
            onClick={() => applyZoomPercent(100)}
          >
            <span>缩放至100%</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className={zoomMenuItemClassName}
            onClick={() => applyZoomPercent(800)}
          >
            <span>缩放至800%</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
