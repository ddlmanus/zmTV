"use client";

import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  CircleHelp,
  History,
  Scissors,
  Upload,
} from "lucide-react";
import type {
  LibTvWorkflowNode,
  LibTvWorkflowNodeData,
} from "@/workflow/ideart/lib/libtv/workflow";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import {
  preventWorkflowNodeChromeContextMenu,
  stopWorkflowNodeChromeEvent,
} from "./nodes/workflow-node-utils";
import {
  WORKFLOW_CONTEXT_MENU_MARGIN,
  WORKFLOW_CONTEXT_MENU_WIDTH,
  WORKFLOW_EDGE_CONTEXT_MENU_HEIGHT,
  WORKFLOW_NODE_CONTEXT_MENU_HEIGHT,
  WORKFLOW_PANE_CONTEXT_MENU_HEIGHT,
  WORKFLOW_UNIFIED_HANDLE_MENU_OPTIONS,
  getWorkflowAddOptionKey,
} from "./workflow-connections";
import type {
  WorkflowEdgeContextMenuState,
  WorkflowNodeAddMenuOption,
  WorkflowNodeCommandMenuState,
  WorkflowNodeContextMenuState,
  WorkflowPaneContextMenuState,
} from "./workflow-connections";

export function getWorkflowContextMenuPosition(
  menu: { x: number; y: number },
  estimatedHeight: number,
) {
  if (typeof window === "undefined") {
    return {
      left: menu.x,
      top: menu.y,
      transform: "none",
      maxHeight: estimatedHeight,
    };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxHeight = Math.max(
    160,
    viewportHeight - WORKFLOW_CONTEXT_MENU_MARGIN * 2,
  );
  const placementHeight = Math.max(1, Math.min(estimatedHeight, maxHeight));
  const left = Math.min(
    Math.max(WORKFLOW_CONTEXT_MENU_MARGIN, Number(menu.x || 0)),
    Math.max(
      WORKFLOW_CONTEXT_MENU_MARGIN,
      viewportWidth -
        WORKFLOW_CONTEXT_MENU_WIDTH -
        WORKFLOW_CONTEXT_MENU_MARGIN,
    ),
  );
  const canOpenBelow =
    Number(menu.y || 0) + placementHeight + WORKFLOW_CONTEXT_MENU_MARGIN <=
    viewportHeight;
  const preferredTop = canOpenBelow
    ? Number(menu.y || 0)
    : Number(menu.y || 0) - placementHeight;
  const top = Math.min(
    Math.max(WORKFLOW_CONTEXT_MENU_MARGIN, preferredTop),
    Math.max(
      WORKFLOW_CONTEXT_MENU_MARGIN,
      viewportHeight - placementHeight - WORKFLOW_CONTEXT_MENU_MARGIN,
    ),
  );

  return { left, top, transform: "none", maxHeight };
}

export function useWorkflowContextMenuPosition(
  menu: { x: number; y: number },
  estimatedHeight: number,
) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const positionStyle = getWorkflowContextMenuPosition(
    menu,
    measuredHeight || estimatedHeight,
  );

  useLayoutEffect(() => {
    setMeasuredHeight(null);
  }, [menu.x, menu.y, estimatedHeight]);

  useLayoutEffect(() => {
    const element = menuRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const nextHeight = Math.ceil(rect.height);
    if (nextHeight > 0 && Math.abs(nextHeight - (measuredHeight || 0)) > 1) {
      setMeasuredHeight(nextHeight);
    }
  }, [measuredHeight, menu.x, menu.y, estimatedHeight]);

  return { menuRef, positionStyle };
}

export function WorkflowContextMenuPortal({
  children,
}: {
  children: React.ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="canvas-theme-portal contents">{children}</div>,
    document.body,
  );
}

export function WorkflowNodeContextMenu({
  menu,
  node,
  onClose,
  onSaveToMaterials,
  onCopy,
  onDuplicate,
  onDelete,
  onCopyMedia,
  onSendToChat,
  onCopyToClipboard,
  onCreateSubject,
  onRunSeedanceComplianceCheck,
  onEnterPanoramaPreview,
  onOptimizeWorkflowLayout,
  onCopyTaskId,
  onVerifyGenerationResult,
  onReportIssue,
}: {
  menu: Exclude<WorkflowNodeContextMenuState, null>;
  node?: LibTvWorkflowNode | null;
  onClose: () => void;
  onSaveToMaterials?: (id: string) => void;
  onCopy?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopyMedia?: (id: string) => void;
  onSendToChat?: (id: string) => void;
  onCopyToClipboard?: (id: string) => void;
  onCreateSubject?: (id: string) => void;
  onRunSeedanceComplianceCheck?: (id: string) => void;
  onEnterPanoramaPreview?: (id: string) => void;
  onOptimizeWorkflowLayout?: (id: string) => void;
  onCopyTaskId?: (id: string) => void;
  onVerifyGenerationResult?: (id: string) => void;
  onReportIssue?: (id: string) => void;
}) {
  const runAction = useCallback(
    (action?: (id: string) => void) => {
      if (!action) return;
      action(menu.nodeId);
      onClose();
    },
    [menu.nodeId, onClose],
  );
  const { menuRef, positionStyle } = useWorkflowContextMenuPosition(
    menu,
    WORKFLOW_NODE_CONTEXT_MENU_HEIGHT,
  );
  const nodeData = node?.data as
    | (LibTvWorkflowNodeData & Record<string, unknown>)
    | undefined;
  const mediaUrl = String(
    nodeData?.workflowPlatformFileUrl ||
      nodeData?.mediaUrl ||
      nodeData?.imageUrl ||
      nodeData?.videoUrl ||
      nodeData?.audioUrl ||
      nodeData?.fileUrl ||
      nodeData?.outputUrl ||
      nodeData?.resultUrl ||
      nodeData?.referenceImages?.[0] ||
      "",
  ).trim();
  const canSendMediaToChat =
    /^(?:https?:|data:|blob:|local-asset:|zaomeng-workflow:|\/)/i.test(
      mediaUrl,
    );
  const isImageNode = node?.kind === "image" && Boolean(mediaUrl);
  const isVideoNode = node?.kind === "video" && Boolean(mediaUrl);
  const isAudioNode = node?.kind === "audio" && Boolean(mediaUrl);
  const taskId = String(
    node?.data?.workflowGenerationTaskId ||
      node?.data?.workflowGenerationBackgroundTaskId ||
      node?.data?.workflowGenerationStatusUrl ||
      "",
  ).trim();

  return (
    <div
      ref={menuRef}
      className="tap-command-container pointer-events-auto fixed z-[1000] h-fit max-h-[calc(100vh-24px)] min-w-[196px] origin-top-left animate-in rounded-2xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,#262626)] p-2 text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-xl zoom-in fade-in"
      data-testid="canvas-node-context-menu-container"
      cmdk-root=""
      role="listbox"
      aria-label="节点菜单"
      style={{
        top: positionStyle.top,
        left: positionStyle.left,
        maxHeight: positionStyle.maxHeight,
        maxWidth: "calc(100vw - 20px)",
        transform: positionStyle.transform,
      }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden"
        role="group"
        cmdk-list=""
        style={{ maxHeight: Math.max(120, positionStyle.maxHeight - 16) }}
      >
        {isVideoNode ? (
          <>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-seedance-compliance-item"
              help
              onClick={() => runAction(onRunSeedanceComplianceCheck)}
            >
              Seedance2.0合规校验
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-create-asset-item"
              onClick={() => runAction(onSaveToMaterials)}
            >
              保存到我的资产
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-send-to-chat-item"
              disabled={!canSendMediaToChat}
              onClick={() => runAction(onSendToChat)}
            >
              发送到聊天
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-create-subject-item"
              onClick={() => runAction(onCreateSubject)}
            >
              创建主体
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-optimize-layout-item"
              onClick={() => runAction(onOptimizeWorkflowLayout)}
            >
              优化工作流布局
            </WorkflowContextMenuItem>
            <WorkflowContextMenuSeparator />
          </>
        ) : isImageNode ? (
          <>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-seedance-compliance-item"
              help
              onClick={() => runAction(onRunSeedanceComplianceCheck)}
            >
              Seedance2.0合规校验
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-create-asset-item"
              onClick={() => runAction(onSaveToMaterials)}
            >
              保存到我的资产
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-send-to-chat-item"
              disabled={!canSendMediaToChat}
              onClick={() => runAction(onSendToChat)}
            >
              发送到聊天
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-panorama-item"
              help
              onClick={() => runAction(onEnterPanoramaPreview)}
            >
              进入全景预览
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-create-subject-item"
              onClick={() => runAction(onCreateSubject)}
            >
              创建主体
            </WorkflowContextMenuItem>
            <WorkflowContextMenuSeparator />
          </>
        ) : (
          <>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-create-asset-item"
              onClick={() => runAction(onSaveToMaterials)}
            >
              保存到我的资产
            </WorkflowContextMenuItem>
            {isAudioNode ? (
              <WorkflowContextMenuItem
                testId="canvas-node-context-menu-send-to-chat-item"
                disabled={!canSendMediaToChat}
                onClick={() => runAction(onSendToChat)}
              >
                发送到聊天
              </WorkflowContextMenuItem>
            ) : null}
            <WorkflowContextMenuSeparator />
          </>
        )}

        <WorkflowContextMenuItem
          testId="canvas-node-context-menu-copy-item"
          shortcut="⌘C"
          help
          onClick={() => runAction(onCopy)}
        >
          复制节点
        </WorkflowContextMenuItem>
        {isImageNode ? (
          <WorkflowContextMenuItem
            testId="canvas-node-context-menu-copy-media-item"
            onClick={() => runAction(onCopyMedia)}
          >
            复制图片
          </WorkflowContextMenuItem>
        ) : null}
        <WorkflowContextMenuItem
          testId="canvas-node-context-menu-duplicate-item"
          shortcut="⌘D"
          help
          onClick={() => runAction(onDuplicate)}
        >
          创建副本
        </WorkflowContextMenuItem>
        <WorkflowContextMenuItem
          testId="canvas-node-context-menu-paste-item"
          shortcut="⌘V"
          disabled
        >
          粘贴
        </WorkflowContextMenuItem>
        <WorkflowContextMenuItem
          testId="canvas-node-context-menu-delete-item"
          shortcut="⌘⌫"
          onClick={() => runAction(onDelete)}
        >
          删除
        </WorkflowContextMenuItem>

        <WorkflowContextMenuSeparator />

        <WorkflowContextMenuItem
          testId="canvas-node-context-menu-copy-to-clipboard-item"
          onClick={() => runAction(onCopyToClipboard)}
        >
          复制到剪贴板
        </WorkflowContextMenuItem>
        {isVideoNode ? (
          <>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-copy-task-id-item"
              disabled={!taskId}
              onClick={() => runAction(onCopyTaskId)}
            >
              复制 TaskId
            </WorkflowContextMenuItem>
            <WorkflowContextMenuItem
              testId="canvas-node-context-menu-verify-generation-result-item"
              help
              onClick={() => runAction(onVerifyGenerationResult)}
            >
              核验生成结果
            </WorkflowContextMenuItem>
          </>
        ) : !isImageNode ? (
          <WorkflowContextMenuItem
            testId="canvas-node-context-menu-report-issue-item"
            onClick={() => runAction(onReportIssue)}
          >
            问题反馈
          </WorkflowContextMenuItem>
        ) : null}
      </div>
    </div>
  );
}

export function WorkflowEdgeContextMenu({
  menu,
  onClose,
  onDisconnect,
}: {
  menu: Exclude<WorkflowEdgeContextMenuState, null>;
  onClose: () => void;
  onDisconnect?: (edgeId: string) => void;
}) {
  const { menuRef, positionStyle } = useWorkflowContextMenuPosition(
    menu,
    WORKFLOW_EDGE_CONTEXT_MENU_HEIGHT,
  );
  return (
    <div
      ref={menuRef}
      className="tap-command-container pointer-events-auto fixed z-[1000] min-w-[196px] origin-top-left animate-in rounded-2xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,#262626)] p-2 text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-xl zoom-in fade-in"
      data-testid="canvas-edge-context-menu-container"
      role="menu"
      aria-label="连线菜单"
      style={{
        top: positionStyle.top,
        left: positionStyle.left,
        maxHeight: positionStyle.maxHeight,
        maxWidth: "calc(100vw - 20px)",
        transform: positionStyle.transform,
      }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <button
        type="button"
        role="menuitem"
        className="flex h-8 w-full items-center justify-between rounded-lg px-2 text-left text-[13px] text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"
        onClick={() => {
          onDisconnect?.(menu.edgeId);
          onClose();
        }}
      >
        <span>断开连接</span>
        <Scissors className="size-3.5 opacity-60" />
      </button>
    </div>
  );
}

export function WorkflowContextMenuSeparator() {
  return (
    <div
      className="mx-2 h-px shrink-0 bg-[var(--canvas-controls-border,rgba(255,255,255,0.10))]"
      role="separator"
      cmdk-separator=""
    />
  );
}

export function WorkflowContextMenuItem({
  children,
  shortcut,
  disabled,
  selected,
  help,
  testId,
  onClick,
}: {
  children: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  selected?: boolean;
  help?: boolean;
  testId: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      aria-selected={selected || undefined}
      data-selected={selected || undefined}
      data-testid={testId}
      cmdk-item=""
      disabled={disabled}
      className="relative flex h-8 w-full shrink-0 cursor-pointer select-none items-center justify-between gap-6 rounded-lg bg-transparent px-2 text-left text-[13px] text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] outline-none transition-colors hover:bg-white/[0.08] disabled:cursor-default disabled:pointer-events-none disabled:opacity-30 data-[selected=true]:bg-white/[0.08]"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center">
        <span className="truncate">{children}</span>
        {help ? (
          <CircleHelp className="ml-1 size-3.5 shrink-0 text-current opacity-35" />
        ) : null}
      </span>
      {shortcut ? (
        <span className="shrink-0 whitespace-nowrap text-xs text-current opacity-40">
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

export function WorkflowPaneContextMenu({
  menu,
  onClose,
  onUpload,
  onOpenAddNode,
  onArrangeCanvas,
  onUndo,
  onRedo,
  onPaste,
}: {
  menu: Exclude<WorkflowPaneContextMenuState, null>;
  onClose: () => void;
  onUpload?: () => void;
  onOpenAddNode?: () => void;
  onArrangeCanvas?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPaste?: (position: { x: number; y: number }) => void;
}) {
  const position = useMemo(
    () => ({ x: menu.flowX, y: menu.flowY }),
    [menu.flowX, menu.flowY],
  );
  const runAction = useCallback(
    (action?: () => void) => {
      if (!action) return;
      action();
      onClose();
    },
    [onClose],
  );
  const runPositionAction = useCallback(
    (action?: (position: { x: number; y: number }) => void) => {
      if (!action) return;
      action(position);
      onClose();
    },
    [onClose, position],
  );
  const { menuRef, positionStyle } = useWorkflowContextMenuPosition(
    menu,
    WORKFLOW_PANE_CONTEXT_MENU_HEIGHT,
  );

  return (
    <div
      ref={menuRef}
      className="tap-command-container pointer-events-auto fixed z-[1000] h-fit max-h-[calc(100vh-24px)] min-w-[196px] origin-top-left animate-in rounded-2xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,#262626)] p-2 text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-xl zoom-in fade-in"
      data-testid="canvas-pane-context-menu-container"
      role="listbox"
      aria-label="画布菜单"
      style={{
        top: positionStyle.top,
        left: positionStyle.left,
        maxHeight: positionStyle.maxHeight,
        maxWidth: "calc(100vw - 20px)",
        transform: positionStyle.transform,
      }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden"
        role="group"
        style={{ maxHeight: Math.max(120, positionStyle.maxHeight - 16) }}
      >
        <WorkflowContextMenuItem
          testId="canvas-handle-menu-upload-item"
          onClick={() => runAction(onUpload)}
        >
          上传
        </WorkflowContextMenuItem>
        <WorkflowContextMenuItem
          testId="canvas-pane-context-menu-save-asset-item"
          disabled
        >
          保存到我的资产
        </WorkflowContextMenuItem>
        <WorkflowContextMenuItem
          testId="canvas-pane-context-menu-new-block-item"
          onClick={onOpenAddNode}
        >
          添加节点
        </WorkflowContextMenuItem>
        <WorkflowContextMenuItem
          testId="canvas-pane-context-menu-arrange-item"
          shortcut="⌥⇧F"
          onClick={() => runAction(onArrangeCanvas)}
        >
          整理画布
        </WorkflowContextMenuItem>

        <WorkflowContextMenuSeparator />

        <WorkflowContextMenuItem
          testId="canvas-pane-context-menu-undo-item"
          shortcut="⌘Z"
          onClick={() => runAction(onUndo)}
        >
          撤销
        </WorkflowContextMenuItem>
        <WorkflowContextMenuItem
          testId="canvas-pane-context-menu-redo-item"
          shortcut="⇧⌘Z"
          onClick={() => runAction(onRedo)}
        >
          重做
        </WorkflowContextMenuItem>

        <WorkflowContextMenuSeparator />

        <WorkflowContextMenuItem
          testId="canvas-pane-context-menu-paste-item"
          shortcut="⌘V"
          selected
          onClick={() => runPositionAction(onPaste)}
        >
          粘贴
        </WorkflowContextMenuItem>
      </div>
    </div>
  );
}

export function WorkflowNodeCommandMenu({
  menu,
  onClose,
  onSelect,
  onUpload,
}: {
  menu: Exclude<WorkflowNodeCommandMenuState, null>;
  onClose: () => void;
  onSelect?: (
    kind: LibTvWorkflowNode["kind"],
    position: { x: number; y: number },
  ) => void;
  onUpload?: () => void;
}) {
  const position = useMemo(
    () => ({ x: menu.flowX, y: menu.flowY }),
    [menu.flowX, menu.flowY],
  );
  const positionStyle = getWorkflowContextMenuPosition(menu, 520);
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const handleSelectOption = useCallback(
    (option: WorkflowNodeAddMenuOption) => {
      if (option.disabled || !option.kind) return;
      onSelect?.(option.kind, position);
      onClose();
    },
    [onClose, onSelect, position],
  );
  return (
    <div
      className="tap-command-container pointer-events-auto fixed z-[1000] h-fit max-h-[calc(100vh-24px)] w-[196px] origin-top-left animate-in rounded-2xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,#262626)] p-2 text-[var(--canvas-controls-text,rgba(255,255,255,0.9))] shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-[32px] zoom-in"
      data-command-menu="true"
      data-testid="canvas-handle-menu-command-menu"
      role="listbox"
      aria-label="添加节点"
      style={{
        top: positionStyle.top,
        left: positionStyle.left,
        maxHeight: positionStyle.maxHeight,
        maxWidth: "calc(100vw - 20px)",
        transform: positionStyle.transform,
      }}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
      onContextMenu={preventWorkflowNodeChromeContextMenu}
    >
      <div
        className="flex max-h-[inherit] flex-col gap-1 overflow-y-auto overflow-x-visible"
        data-testid="canvas-handle-menu-command-group"
        role="presentation"
      >
        <h4 className="m-0 flex h-8 items-center px-2 py-0 text-xs font-medium leading-4 opacity-60">
          添加节点
        </h4>
        {WORKFLOW_UNIFIED_HANDLE_MENU_OPTIONS.filter(
          (option) => option.id !== "reference-node",
        ).map((option) => {
          const key = getWorkflowAddOptionKey(option);
          const active = activeSubmenuId === key;
          const hasSubmenu = Boolean(option.submenuOptions?.length);
          const IconNode = option.icon || (
            <TapNowNodeIcon
              kind={option.kind || "text"}
              size={14}
              opacity={1}
            />
          );
          return (
            <div
              key={key}
              className="relative"
              onMouseEnter={() => setActiveSubmenuId(hasSubmenu ? key : null)}
            >
              <button
                type="button"
                role="option"
                aria-disabled={option.disabled || undefined}
                aria-haspopup={hasSubmenu ? "menu" : undefined}
                aria-expanded={hasSubmenu ? active : undefined}
                data-testid={`canvas-handle-menu-${key}-item`}
                disabled={option.disabled}
                className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors duration-200 disabled:cursor-default disabled:opacity-30 ${active ? "bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]" : "hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"}`}
                onClick={() => {
                  if (hasSubmenu) {
                    setActiveSubmenuId((current) =>
                      current === key ? null : key,
                    );
                    return;
                  }
                  handleSelectOption(option);
                }}
              >
                <span className="flex size-[14px] shrink-0 items-center justify-center opacity-90">
                  {IconNode}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-normal leading-normal">
                  <span className="min-w-0 truncate">{option.label}</span>
                  {option.badge ? (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] leading-3 ${option.badgeTone === "new" ? "bg-[#3CB5CC40] font-bold text-[#5DDCFF]" : "bg-[var(--canvas-controls-active,rgba(255,255,255,0.12))] opacity-60"}`}
                    >
                      {option.badge}
                    </span>
                  ) : null}
                </span>
                {hasSubmenu ? (
                  <ChevronDown className="-rotate-90 size-[14px] shrink-0 opacity-60" />
                ) : null}
              </button>
              {hasSubmenu && active ? (
                <div
                  className="absolute left-[calc(100%+8px)] top-0 z-[1010] flex w-[168px] flex-col gap-1 rounded-2xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,#262626)] p-2 shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-[32px]"
                  role="menu"
                >
                  {option.submenuOptions?.map((subOption) => (
                    <button
                      key={getWorkflowAddOptionKey(subOption)}
                      type="button"
                      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors duration-200 hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"
                      onClick={() => handleSelectOption(subOption)}
                    >
                      <span className="flex size-[14px] shrink-0 items-center justify-center opacity-90">
                        {subOption.icon || option.icon || (
                          <TapNowNodeIcon
                            kind={subOption.kind || option.kind || "text"}
                            size={14}
                            opacity={1}
                          />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px] font-normal leading-normal">
                        <span className="min-w-0 truncate">
                          {subOption.label}
                        </span>
                        {subOption.badge ? (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] leading-3 ${subOption.badgeTone === "new" ? "bg-[#3CB5CC40] font-bold text-[#5DDCFF]" : "bg-[var(--canvas-controls-active,rgba(255,255,255,0.12))] opacity-60"}`}
                          >
                            {subOption.badge}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <h4 className="m-0 flex h-8 items-center px-2 text-xs font-medium leading-4 opacity-60">
          添加资源
        </h4>
        <button
          type="button"
          className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors duration-200 hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"
          onClick={() => {
            onUpload?.();
            onClose();
          }}
        >
          <span className="flex size-[14px] shrink-0 items-center justify-center opacity-90">
            <Upload className="size-[14px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-normal leading-normal">
            上传
          </span>
        </button>
        <button
          type="button"
          disabled
          className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left opacity-30"
        >
          <span className="flex size-[14px] shrink-0 items-center justify-center opacity-90">
            <History className="size-[14px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-normal leading-normal">
            从生成历史选择
          </span>
        </button>
      </div>
    </div>
  );
}
