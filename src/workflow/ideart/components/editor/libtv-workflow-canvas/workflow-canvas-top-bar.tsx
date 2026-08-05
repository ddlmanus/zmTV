"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

type WorkflowCanvasSummary = {
  id: string;
  name: string;
};

type WorkflowTopBarProps = {
  workflowCanvases?: WorkflowCanvasSummary[];
  activeWorkflowCanvasId?: string;
  onCreateWorkflowCanvas?: () => void;
  onSwitchWorkflowCanvas?: (canvasId: string) => void;
  [key: string]: unknown;
};

export function WorkflowTopBar({
  workflowCanvases,
  activeWorkflowCanvasId,
  onCreateWorkflowCanvas,
  onSwitchWorkflowCanvas,
}: WorkflowTopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canvases = useMemo(() => {
    const normalized = (workflowCanvases || [])
      .map((canvas, index) => ({
        id: String(canvas.id || "").trim() || `canvas-${index + 1}`,
        name: String(canvas.name || "").trim() || `画布 ${index + 1}`,
      }))
      .filter((canvas) => canvas.id);
    return normalized.length > 0
      ? normalized
      : [{ id: "default", name: "画布 1" }];
  }, [workflowCanvases]);
  const activeCanvas =
    canvases.find((canvas) => canvas.id === activeWorkflowCanvasId) ||
    canvases[0];

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div
      ref={menuRef}
      className="pointer-events-auto absolute left-3 top-3 z-50"
      data-workflow-canvas-picker="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex h-10 items-center rounded-[10px] border border-[var(--canvas-controls-border,#363636)] bg-[var(--canvas-controls-bg,rgba(38,38,38,0.96))] p-1 text-[var(--canvas-controls-text,#fff)] shadow-[0_8px_24px_rgba(0,0,0,0.24)] backdrop-blur-[16px]">
        <button
          type="button"
          aria-label="切换画布"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-8 min-w-[112px] max-w-[220px] items-center gap-2 rounded-[7px] px-2.5 text-left transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {activeCanvas.name}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-3.5 shrink-0 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.62))] transition-transform ${menuOpen ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        </button>
        <div className="mx-1 h-5 w-px bg-[var(--canvas-controls-border,#363636)]" />
        <button
          type="button"
          title="新建画布"
          aria-label="新建画布"
          className="flex size-8 items-center justify-center rounded-[7px] text-[var(--canvas-controls-icon,rgba(255,255,255,0.78))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] hover:text-[var(--canvas-controls-text,#fff)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]"
          onClick={() => {
            setMenuOpen(false);
            onCreateWorkflowCanvas?.();
          }}
        >
          <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
        </button>
      </div>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="画布列表"
          className="absolute left-0 top-[calc(100%+8px)] w-[220px] overflow-hidden rounded-[10px] border border-[var(--canvas-controls-border,#363636)] bg-[var(--canvas-controls-bg,rgba(38,38,38,0.98))] p-1.5 text-[var(--canvas-controls-text,#fff)] shadow-[0_16px_40px_rgba(0,0,0,0.36)] backdrop-blur-[16px]"
        >
          <div className="flex h-7 items-center px-2 text-[11px] font-medium text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.52))]">
            画布
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {canvases.map((canvas) => {
              const selected = canvas.id === activeCanvas.id;
              return (
                <button
                  key={canvas.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className={`flex h-9 w-full items-center gap-2 rounded-[7px] px-2.5 text-left text-[13px] transition-colors ${selected ? "bg-[var(--canvas-controls-active,rgba(255,255,255,0.12))]" : "hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"}`}
                  onClick={() => {
                    setMenuOpen(false);
                    if (!selected) onSwitchWorkflowCanvas?.(canvas.id);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{canvas.name}</span>
                  {selected ? (
                    <Check
                      aria-hidden="true"
                      className="size-4 shrink-0"
                      strokeWidth={2}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
