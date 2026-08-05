"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import type { WorkflowNodeAddMenuOption } from "./workflow-connections";

export function NodeAddMenu({
  anchor,
  title,
  options,
  onSelect,
}: {
  anchor: { x: number; y: number };
  title?: string;
  options: WorkflowNodeAddMenuOption[];
  onSelect: (kind: LibTvWorkflowNode["kind"]) => void;
}) {
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null);
  const menuWidth = 196;
  const submenuWidth = 272;
  const expandedOption = options.find(
    (option) => (option.id || option.kind || option.label) === openSubmenuKey,
  );
  const expandedOptionIndex = options.findIndex(
    (option) => (option.id || option.kind || option.label) === openSubmenuKey,
  );
  const estimatedHeight = Math.min(
    420,
    16 + options.length * 36 + (title ? 32 : 0),
  );
  const flipX = anchor.x + menuWidth + 20 > window.innerWidth;
  const flipY = anchor.y + estimatedHeight + 20 > window.innerHeight;
  const menuLeft = flipX
    ? Math.max(10, anchor.x - menuWidth)
    : Math.min(anchor.x, window.innerWidth - menuWidth - 10);
  const menuTop = flipY
    ? Math.max(10, anchor.y - estimatedHeight)
    : Math.min(anchor.y, window.innerHeight - estimatedHeight - 10);
  const submenuHeight = expandedOption?.submenuOptions?.length
    ? expandedOption.submenuOptions.length * 36 + 16
    : 0;
  const submenuLeft = flipX
    ? Math.max(10, menuLeft - submenuWidth - 8)
    : Math.min(menuLeft + menuWidth + 8, window.innerWidth - submenuWidth - 10);
  const submenuTop = Math.min(
    Math.max(
      10,
      menuTop + (title ? 40 : 8) + Math.max(0, expandedOptionIndex) * 36,
    ),
    window.innerHeight - submenuHeight - 10,
  );

  return createPortal(
    <div className="canvas-theme-portal contents">
      <div
        className="nodrag nopan nowheel fixed z-[1200] flex max-h-[calc(100vh-20px)] w-[196px] max-w-[calc(100vw-20px)] flex-col gap-1 overflow-y-auto rounded-2xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,#262626)] p-2 text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-[32px]"
        style={{ left: menuLeft, top: menuTop }}
        onPointerDown={stopWorkflowNodeChromeEvent}
        onMouseDown={stopWorkflowNodeChromeEvent}
        onClick={stopWorkflowNodeChromeEvent}
        onContextMenu={preventWorkflowNodeChromeContextMenu}
      >
        {title ? (
          <h4 className="m-0 flex h-8 items-center px-2 py-0 text-xs font-medium leading-4 opacity-60">
            {title}
          </h4>
        ) : null}
        {options.map((option) => {
          const optionKey = option.id || option.kind || option.label;
          const hasSubmenu = Boolean(
            option.submenu && option.submenuOptions?.length,
          );
          const isSubmenuOpen = openSubmenuKey === optionKey;
          const disabled = option.disabled || (!option.kind && !hasSubmenu);
          return (
            <button
              key={optionKey}
              type="button"
              disabled={disabled}
              className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors duration-200 ${isSubmenuOpen ? "bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]" : ""} ${disabled ? "cursor-not-allowed opacity-30" : "cursor-pointer text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"}`}
              onMouseEnter={() => {
                if (!disabled && hasSubmenu) setOpenSubmenuKey(optionKey);
              }}
              onClick={() => {
                if (disabled) return;
                if (hasSubmenu) {
                  setOpenSubmenuKey(optionKey);
                  return;
                }
                if (option.kind) onSelect(option.kind);
              }}
            >
              <span className="flex size-[14px] shrink-0 items-center justify-center">
                {option.icon ||
                  (option.kind ? (
                    <TapNowNodeIcon kind={option.kind} size={14} opacity={1} />
                  ) : null)}
              </span>
              <span className="flex min-w-0 flex-1 flex-row items-center gap-1.5 text-[13px] font-normal leading-normal">
                <span className="min-w-0 truncate">{option.label}</span>
                {option.badge ? (
                  <span
                    className={
                      option.badgeTone === "new"
                        ? "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase leading-3 bg-[#3CB5CC40] text-[#5DDCFF]"
                        : "shrink-0 rounded bg-white/[0.12] px-1.5 py-0.5 text-[10px] leading-3 opacity-60"
                    }
                  >
                    {option.badge}
                  </span>
                ) : null}
              </span>
              {hasSubmenu ? (
                <ChevronDown
                  className={`size-3.5 shrink-0 opacity-60 transition-transform ${isSubmenuOpen ? "rotate-0" : "-rotate-90"}`}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {expandedOption?.submenuOptions?.length ? (
        <div
          className="nodrag nopan nowheel fixed z-[1201] flex w-[272px] max-w-[calc(100vw-20px)] flex-col gap-1 rounded-2xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,#262626)] p-2 text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-[32px]"
          style={{ left: submenuLeft, top: submenuTop }}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
          onContextMenu={preventWorkflowNodeChromeContextMenu}
        >
          {expandedOption.submenuOptions.map((submenuOption) => (
            <button
              key={
                submenuOption.id || submenuOption.kind || submenuOption.label
              }
              type="button"
              disabled={submenuOption.disabled || !submenuOption.kind}
              className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors duration-200 ${submenuOption.disabled || !submenuOption.kind ? "cursor-not-allowed opacity-30" : "cursor-pointer hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"}`}
              onClick={() => {
                if (!submenuOption.kind || submenuOption.disabled) return;
                onSelect(submenuOption.kind);
              }}
            >
              <span className="flex size-[14px] shrink-0 items-center justify-center">
                {submenuOption.icon ||
                  (submenuOption.kind ? (
                    <TapNowNodeIcon
                      kind={submenuOption.kind}
                      size={14}
                      opacity={1}
                    />
                  ) : null)}
              </span>
              <span className="flex min-w-0 flex-1 flex-row items-center gap-1.5 text-[13px] font-normal leading-normal">
                <span className="min-w-0 truncate">{submenuOption.label}</span>
                {submenuOption.badge ? (
                  <span
                    className={
                      submenuOption.badgeTone === "new"
                        ? "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase leading-3 bg-[#3CB5CC40] text-[#5DDCFF]"
                        : "shrink-0 rounded bg-white/[0.12] px-1.5 py-0.5 text-[10px] leading-3 opacity-60"
                    }
                  >
                    {submenuOption.badge}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
