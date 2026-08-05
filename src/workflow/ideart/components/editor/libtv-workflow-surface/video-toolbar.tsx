"use client";

import React, { useState } from "react";
import { Settings2, Upload } from "lucide-react";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import { CANVAS_CONTROLS_MENU_PANEL_STYLE } from "./surface-contracts";
import type { OrdinaryImageToolbarAction } from "./surface-contracts";

export function VideoToolbarCropIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none shrink-0"
      width="14"
      height="14"
      viewBox="0 0 20 20"
    >
      <path
        d="M1.39941 14.5C1.62033 14.5 1.7998 14.6795 1.7998 14.9004V16.9199C1.7999 17.6268 2.37315 18.2001 3.08008 18.2002H5.09961C5.32052 18.2002 5.5 18.3797 5.5 18.6006V19.5996C5.5 19.8205 5.32052 20 5.09961 20H3.08008C1.4321 19.9999 0.0863324 18.7056 0.00390625 17.0781L0 16.9199V14.9004C0 14.6795 0.179477 14.5 0.400391 14.5H1.39941ZM12.0996 18.2002C12.3205 18.2002 12.5 18.3797 12.5 18.6006V19.5996C12.5 19.8205 12.3205 20 12.0996 20H7.90039C7.67948 20 7.5 19.8205 7.5 19.5996V18.6006C7.5 18.3797 7.67948 18.2002 7.90039 18.2002H12.0996ZM19.5996 14.5C19.8205 14.5 20 14.6795 20 14.9004V16.9199L19.9961 17.0781C19.9163 18.6532 18.6532 19.9163 17.0781 19.9961L16.9199 20H14.9004C14.6795 20 14.5 19.8205 14.5 19.5996V18.6006C14.5 18.3797 14.6795 18.2002 14.9004 18.2002H16.9199C17.6268 18.2001 18.2001 17.6268 18.2002 16.9199V14.9004C18.2002 14.6795 18.3797 14.5 18.6006 14.5H19.5996ZM1.39941 7.5C1.62033 7.5 1.7998 7.67948 1.7998 7.90039V12.0996C1.7998 12.3205 1.62033 12.5 1.39941 12.5H0.400391C0.179477 12.5 0 12.3205 0 12.0996V7.90039C0 7.67948 0.179477 7.5 0.400391 7.5H1.39941ZM19.5996 7.5C19.8205 7.5 20 7.67948 20 7.90039V12.0996C20 12.3205 19.8205 12.5 19.5996 12.5H18.6006C18.3797 12.5 18.2002 12.3205 18.2002 12.0996V7.90039C18.2002 7.67948 18.3797 7.5 18.6006 7.5H19.5996ZM5.09961 0C5.32052 0 5.5 0.179477 5.5 0.400391V1.39941C5.5 1.62033 5.32052 1.7998 5.09961 1.7998H3.08008C2.37315 1.7999 1.7999 2.37315 1.7998 3.08008V5.09961C1.7998 5.32052 1.62033 5.5 1.39941 5.5H0.400391C0.179477 5.5 0 5.32052 0 5.09961V3.08008C9.28948e-05 1.37904 1.37904 9.27337e-05 3.08008 0H5.09961ZM17.0781 0.00390625C18.7056 0.0863325 19.9999 1.4321 20 3.08008V5.09961C20 5.32052 19.8205 5.5 19.5996 5.5H18.6006C18.3797 5.5 18.2002 5.32052 18.2002 5.09961V3.08008C18.2001 2.37315 17.6268 1.7999 16.9199 1.7998H14.9004C14.6795 1.7998 14.5 1.62033 14.5 1.39941V0.400391C14.5 0.179477 14.6795 0 14.9004 0H16.9199L17.0781 0.00390625ZM12.0996 0C12.3205 0 12.5 0.179477 12.5 0.400391V1.39941C12.5 1.62033 12.3205 1.7998 12.0996 1.7998H7.90039C7.67948 1.7998 7.5 1.62033 7.5 1.39941V0.400391C7.5 0.179477 7.67948 0 7.90039 0H12.0996Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function VideoToolbarHdIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="16"
      height="16"
      viewBox="0 0 20 20"
    >
      <path
        d="M16.7529 0C18.5461 0 20 1.45394 20 3.24707V16.7529C20 18.5461 18.5461 20 16.7529 20H3.24707L3.08008 19.9961C1.3644 19.9093 0 18.4902 0 16.7529V3.24707C0 1.50983 1.3644 0.0906556 3.08008 0.00390625L3.24707 0H16.7529ZM3.24707 1.5C2.28236 1.5 1.5 2.28237 1.5 3.24707V16.7529C1.5 17.7176 2.28237 18.5 3.24707 18.5H16.7529C17.7176 18.5 18.5 17.7176 18.5 16.7529V3.24707C18.5 2.28236 17.7176 1.5 16.7529 1.5H3.24707ZM5.12109 9.25H7.91797V6.0752H9.41797V14.0752H7.91797V10.75H5.12109V14.0752H3.62109V6.0752H5.12109V9.25ZM13.2764 6.08008C14.7763 6.13536 17.0439 6.68501 17.0439 10.124C17.0438 13.5634 14.7109 14.0269 13.2637 14.0713L12.9873 14.0752H10.9941V6.0752H12.9873L13.2764 6.08008ZM12.4941 12.5752H12.9873C13.637 12.5752 14.2822 12.4963 14.7412 12.207C15.0683 12.0007 15.5439 11.5403 15.5439 10.124C15.5439 8.68966 15.0717 8.19497 14.7373 7.97168C14.2874 7.67149 13.6456 7.57521 12.9873 7.5752H12.4941V12.5752Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function VideoToolbarAnalyzeIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="16"
      height="16"
      viewBox="0 0 19.8008 19.8008"
    >
      <path
        d="M16.9004 0C18.502 0 19.8008 1.29877 19.8008 2.90039V16.9004C19.8008 18.502 18.502 19.8008 16.9004 19.8008H2.90039C1.29877 19.8008 0 18.502 0 16.9004V2.90039C0 1.29876 1.29876 0 2.90039 0H16.9004ZM2.90039 1.80078C2.29288 1.80078 1.80078 2.29288 1.80078 2.90039V9H9V1.80078H2.90039ZM16.9004 1.80078C17.5079 1.80078 18 2.29288 18 2.90039V9H9V1.80078H16.9004ZM1.80078 16.9004C1.80078 17.5079 2.29288 18 2.90039 18H9V9H1.80078V16.9004ZM18 16.9004C18 17.5079 17.5079 18 16.9004 18H9V9H18V16.9004Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function VideoToolbarChevronIcon({
  className = "",
}: { className?: string } = {}) {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className={`pointer-events-none shrink-0 opacity-60 ${className}`}
      width="12"
      height="12"
      viewBox="0 0 16 16"
    >
      <g transform="translate(4.3472 5.8234)">
        <path
          d="M6.19819 0.117182C6.3544 -0.039028 6.60839 -0.039028 6.7646 0.117182L7.18843 0.54101C7.34464 0.69722 7.34464 0.951206 7.18843 1.10742L4.14741 4.14843C3.87403 4.42145 3.43043 4.42165 3.15718 4.14843L0.117137 1.10742C-0.039034 0.9512 -0.039057 0.697203 0.117137 0.54101L0.540965 0.117182C0.697193 -0.0390471 0.951169 -0.039074 1.10737 0.117182L3.65229 2.66308L6.19819 0.117182Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

export function VideoToolbarDownloadIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4"
      width="16"
      height="16"
      viewBox="0 0 19.8008 19.9004"
    >
      <path
        d="M1.80078 17C1.80078 17.2917 1.91676 17.5711 2.12305 17.7773C2.32934 17.9836 2.60865 18.0996 2.90039 18.0996H16.9004C17.1921 18.0996 17.4714 17.9836 17.6777 17.7773C17.884 17.5711 18 17.2917 18 17V13H19.8008V17C19.8008 17.7691 19.495 18.5069 18.9512 19.0508C18.4073 19.5946 17.6695 19.9004 16.9004 19.9004H2.90039C2.13126 19.9004 1.39346 19.5946 0.849609 19.0508C0.305754 18.5069 0 17.7691 0 17V13H1.80078V17ZM10.8008 11.8262L14.2637 8.36328L15.5371 9.63672L10.5371 14.6367C10.1856 14.9882 9.61514 14.9882 9.26367 14.6367L4.26367 9.63672L5.53711 8.36328L9 11.8262V0H10.8008V11.8262Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function VideoToolbarExpandIcon() {
  return (
    <svg
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0"
      width="16"
      height="16"
      viewBox="0 0 17.8008 17.8008"
    >
      <path
        d="M1.40039 8.90039C1.62129 8.90039 1.80076 9.07988 1.80078 9.30078V14.8447L7.0625 9.58301C7.21875 9.42676 7.47271 9.4267 7.62891 9.58301L8.33594 10.29C8.49204 10.4463 8.4921 10.7003 8.33594 10.8564L3.19141 16H8.5C8.7209 16 8.90037 16.1795 8.90039 16.4004V17.4014C8.9003 17.6222 8.72086 17.8008 8.5 17.8008H0.799805C0.358011 17.8007 0 17.4428 0 17.001V9.30078C1.9471e-05 9.08004 0.178725 8.90064 0.399414 8.90039H1.40039ZM17.001 0C17.4427 0.000171625 17.8008 0.359059 17.8008 0.800781V8.50098C17.8007 8.72182 17.6213 8.90039 17.4004 8.90039H16.3994C16.1788 8.90014 16.0001 8.72166 16 8.50098V3.13672L10.8066 8.33105C10.6504 8.48728 10.3964 8.48728 10.2402 8.33105L9.5332 7.62305C9.37729 7.46686 9.37722 7.21375 9.5332 7.05762L14.7891 1.80078H9.2998C9.07916 1.80053 8.90048 1.62205 8.90039 1.40137V0.400391C8.90041 0.179648 9.07912 0.000250219 9.2998 0H17.001Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function VideoToolbarButton({
  label,
  icon,
  active,
  menu,
  compact = false,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  menu?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup={menu ? "menu" : undefined}
      aria-expanded={menu ? active : undefined}
      style={{ lineHeight: "20.15px" }}
      className={`flex h-8 items-center justify-center gap-1 rounded-lg text-[13px] leading-none text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover disabled:pointer-events-none disabled:opacity-50 ${compact ? "shrink-0 px-2" : "px-3 py-2"} ${active ? "bg-canvas-controls-active" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <span
        className={`pointer-events-none inline-flex shrink-0 items-center justify-center ${compact ? "h-3.5 w-3.5 [&_svg]:h-3.5 [&_svg]:w-3.5" : "h-4 w-4 [&_svg]:h-4 [&_svg]:w-4"}`}
      >
        {icon}
      </span>
      <span className="pointer-events-none whitespace-nowrap">{label}</span>
      {menu ? <VideoToolbarChevronIcon /> : null}
    </button>
  );
}

export function VideoToolbarIconButton({
  label,
  icon,
  disabled,
  authDownloadTrigger = false,
  compact = false,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  authDownloadTrigger?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      data-auth-download-trigger={authDownloadTrigger ? "true" : undefined}
      className={`flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-lg text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover disabled:pointer-events-none disabled:opacity-50 ${compact ? "[&_svg]:h-3.5 [&_svg]:w-3.5" : "[&_svg]:h-4 [&_svg]:w-4"}`}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onClick?.();
      }}
    >
      {icon}
    </button>
  );
}

export function VideoToolbarMenu({
  items,
  onAction,
}: {
  items: Array<{ action: OrdinaryImageToolbarAction; label: string }>;
  onAction: (action: OrdinaryImageToolbarAction) => void;
}) {
  return (
    <div
      className="nodrag nopan nowheel absolute left-0 top-[calc(100%+10px)] z-[90] min-w-[148px] rounded-xl p-1 text-canvas-controls-text"
      style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
      role="menu"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      {items.map((item) => (
        <button
          key={`${item.action}-${item.label}`}
          type="button"
          role="menuitem"
          className="flex h-10 w-full items-center rounded-lg px-3 text-left text-[13px] leading-none text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover"
          onClick={(event) => {
            event.stopPropagation();
            onAction(item.action);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function VideoToolbarAudioSeparationMenu({
  onAction,
}: {
  onAction: (action: OrdinaryImageToolbarAction) => void;
}) {
  const [activePanel, setActivePanel] = useState<"vocal" | null>(null);
  const panelStyle: React.CSSProperties = {
    ...CANVAS_CONTROLS_MENU_PANEL_STYLE,
    minWidth: 184,
    padding: 8,
    borderRadius: 14,
  };
  const itemClass =
    "flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-[13px] leading-none text-canvas-controls-text transition-colors hover:bg-canvas-controls-hover";
  const activeItemClass = `${itemClass} bg-canvas-controls-active`;

  return (
    <div
      className="nodrag nopan nowheel absolute left-0 top-[calc(100%+10px)] z-[90] flex items-start gap-2 text-canvas-controls-text"
      role="menu"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div className="relative" style={panelStyle}>
        <button
          type="button"
          role="menuitem"
          className={activePanel === "vocal" ? activeItemClass : itemClass}
          onMouseEnter={() => setActivePanel("vocal")}
          onFocus={() => setActivePanel("vocal")}
          onClick={(event) => {
            event.stopPropagation();
            setActivePanel("vocal");
          }}
        >
          <span>人声分离</span>
          <VideoToolbarChevronIcon className="-rotate-90 opacity-80" />
        </button>
        <button
          type="button"
          role="menuitem"
          className={itemClass}
          onMouseEnter={() => setActivePanel(null)}
          onFocus={() => setActivePanel(null)}
          onClick={(event) => {
            event.stopPropagation();
            setActivePanel(null);
            onAction("split-2");
          }}
        >
          音视频分离
        </button>
      </div>
      {activePanel === "vocal" ? (
        <div className="relative" style={{ ...panelStyle, minWidth: 176 }}>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={(event) => {
              event.stopPropagation();
              onAction("vocal-separate");
            }}
          >
            仅保留人声
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={(event) => {
              event.stopPropagation();
              onAction("separate-av");
            }}
          >
            仅保留背景音
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function OrdinaryImageMoreMenu({
  items,
  onAction,
  includeUtilityItems = true,
}: {
  items: Array<{
    action: OrdinaryImageToolbarAction;
    label: string;
    icon: React.ReactNode;
    dot?: boolean;
  }>;
  onAction: (action: OrdinaryImageToolbarAction) => void;
  includeUtilityItems?: boolean;
}) {
  return (
    <div
      className="nodrag nopan nowheel absolute left-0 top-[calc(100%+8px)] z-50 min-w-[168px] rounded-xl px-1 py-1 text-canvas-controls-text"
      style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
      role="menu"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] font-medium leading-5 text-canvas-controls-text outline-none transition-colors hover:bg-canvas-controls-hover"
          onClick={(event) => {
            event.stopPropagation();
            onAction(item.action);
          }}
        >
          <span className="relative inline-flex shrink-0">
            {item.icon}
            {item.dot ? (
              <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary" />
            ) : null}
          </span>
          {item.label}
        </button>
      ))}
      {includeUtilityItems ? (
        <>
          <div className="my-0.5 h-px bg-white/[0.08]" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] font-medium leading-5 text-canvas-controls-text opacity-70 outline-none transition-colors hover:bg-canvas-controls-hover hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onAction("replace");
            }}
          >
            <Upload className="size-4" />
            替换图片
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[12px] font-medium leading-5 text-canvas-controls-text opacity-70 outline-none transition-colors hover:bg-canvas-controls-hover hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onAction("report");
            }}
          >
            <Settings2 className="size-4" />
            问题反馈
          </button>
        </>
      ) : null}
    </div>
  );
}
