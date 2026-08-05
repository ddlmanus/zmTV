"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { message } from "@/workflow/ideart/shims/antd";
import {
  Aperture,
  Blocks,
  ChevronRight,
  CirclePlus,
  Cuboid,
  FileText,
  History,
  Image as ImageIcon,
  Keyboard,
  LibraryBig,
  ListVideo,
  Music,
  Palette,
  Scissors,
  Upload,
  UserRound,
  Video,
  X,
} from "lucide-react";
import type { LibTvWorkflowNodeKind } from "@/workflow/ideart/lib/libtv/workflow";

function LibTvSidebarAddIcon({ className = "" }: { className?: string }) {
  return (
    <CirclePlus
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.9}
    />
  );
}

function LibTvSidebarSkillIcon({ className = "" }: { className?: string }) {
  return (
    <Blocks
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.9}
    />
  );
}

function LibTvSidebarAssetIcon({ className = "" }: { className?: string }) {
  return (
    <LibraryBig
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.9}
    />
  );
}

function LibTvSidebarCharacterIcon({ className = "" }: { className?: string }) {
  return (
    <UserRound
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.9}
    />
  );
}

function LibTvStyleLibraryIcon({ className = "" }: { className?: string }) {
  return (
    <Palette
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.9}
    />
  );
}

function LibTvEffectLibraryIcon({ className = "" }: { className?: string }) {
  return (
    <Aperture
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.9}
    />
  );
}

function LibTvSidebarHistoryIcon({ className = "" }: { className?: string }) {
  return (
    <History
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.9}
    />
  );
}

function LibTvSidebarKeyboardIcon({ className = "" }: { className?: string }) {
  return (
    <Keyboard
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.9}
    />
  );
}

function WorkflowSidebarButton({
  children,
  title,
  active,
  primary,
  testId,
  dataSidebarButton,
  tooltipDisabled,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  primary?: boolean;
  testId?: string;
  dataSidebarButton?: string;
  tooltipDisabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      data-testid={testId}
      data-sidebar-btn={dataSidebarButton}
      className={`group relative flex size-8 cursor-pointer items-center justify-center overflow-visible rounded-[8px] transition-colors ${primary ? "" : active ? "bg-white/[0.14] canvas-light:bg-[var(--canvas-controls-active,rgba(0,0,0,0.08))]" : "hover:bg-white/[0.10] canvas-light:hover:bg-[var(--canvas-controls-hover,rgba(0,0,0,0.06))]"}`}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {primary ? (
        <span className="flex size-8 items-center justify-center rounded-[8px] bg-white/90 text-[#141414] transition-colors hover:bg-white canvas-light:bg-[var(--btn-invert-bg,#262626)] canvas-light:text-[var(--btn-invert-text,#fff)]">
          {children}
        </span>
      ) : (
        <span className="text-white/84 transition-colors group-hover:text-white canvas-light:text-[var(--canvas-controls-text,#262626)]">
          {children}
        </span>
      )}
      {tooltipDisabled ? null : (
        <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-[120] -translate-x-1/2 whitespace-nowrap rounded-md bg-[#141414]/96 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-[0_10px_24px_rgba(0,0,0,0.35)] group-hover:opacity-100 group-focus-visible:opacity-100">
          {title}
        </span>
      )}
    </button>
  );
}

function WorkflowAssetLibraryMenu({
  onOpenStyleLibrary,
  onOpenEffectLibrary,
}: {
  onOpenStyleLibrary: () => void;
  onOpenEffectLibrary: () => void;
}) {
  const itemClassName =
    "group flex h-[52px] w-full cursor-pointer items-center gap-2 rounded-xl px-2 text-left text-[var(--fg-default,var(--canvas-controls-text,rgba(255,255,255,0.88)))] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]";
  const renderItem = (
    label: string,
    description: string,
    Icon: React.ComponentType<{ className?: string }>,
    onClick: () => void,
  ) => (
    <button type="button" className={itemClassName} onClick={onClick}>
      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-lg transition-colors group-hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]">
        <Icon className="pointer-events-none size-5" />
      </div>
      <div className="flex min-w-0 flex-1 translate-y-2 flex-col transition-transform duration-200 group-hover:translate-y-0">
        <span className="text-[14px] font-medium leading-snug">{label}</span>
        <span className="text-[12px] leading-snug text-[var(--fg-muted,var(--canvas-controls-text-muted,rgba(255,255,255,0.50)))] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {description}
        </span>
      </div>
      <span className="shrink-0 rounded-full bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] px-2 py-1 text-[12px] font-medium leading-none text-[var(--fg-muted,var(--canvas-controls-text-muted,rgba(255,255,255,0.50)))]">
        NEW
      </span>
    </button>
  );

  return (
    <div
      className="absolute bottom-[calc(100%+12px)] left-1/2 z-20 w-[240px] -translate-x-1/2"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="flex flex-col gap-2 rounded-xl p-2"
        style={{
          backgroundColor: "var(--canvas-controls-bg, #262626)",
          border: "0.5px solid var(--canvas-controls-border, #363636)",
          backdropFilter: "blur(12px)",
          boxShadow:
            "rgba(0, 0, 0, 0.25) 0 4px 10px, rgba(0, 0, 0, 0.3) 0 2px 4px",
        }}
      >
        <div className="px-2 py-1 text-[14px] font-medium text-[var(--fg-muted,var(--canvas-controls-text-muted,rgba(255,255,255,0.50)))]">
          素材库
        </div>
        <div className="flex flex-col gap-1">
          {renderItem(
            "风格库",
            "新增风格节点",
            LibTvStyleLibraryIcon,
            onOpenStyleLibrary,
          )}
          {renderItem(
            "特效库",
            "新增特效节点",
            LibTvEffectLibraryIcon,
            onOpenEffectLibrary,
          )}
        </div>
      </div>
    </div>
  );
}

type WorkflowDockAddAction = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  kind?: LibTvWorkflowNodeKind;
  action?: "open-style-library" | "open-effect-library";
  title?: string;
  description?: string;
  badge?: string;
  badgeTone?: "beta" | "new";
  disabled?: boolean;
  submenuOptions?: WorkflowDockAddAction[];
};

export function WorkflowSidebarControls({
  onAddNode,
  onUpload,
  onOpenShortcuts,
  onOpenSkillLibrary,
  onOpenCharacterLibrary,
  onOpenStyleLibrary,
  onOpenEffectLibrary,
  onOpenHistory,
}: {
  onAddNode: (
    kind: LibTvWorkflowNodeKind,
    patch?: { title?: string; note?: string },
  ) => void;
  onUpload: () => void;
  onOpenShortcuts: () => void;
  onOpenSkillLibrary: () => void;
  onOpenCharacterLibrary: () => void;
  onOpenStyleLibrary: () => void;
  onOpenEffectLibrary: () => void;
  onOpenHistory: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null);
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!panelOpen && !assetMenuOpen) return;
    const closeMenus = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target || panelRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-workflow-sidebar]")
      )
        return;
      setPanelOpen(false);
      setActiveSubmenuId(null);
      setAssetMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPanelOpen(false);
      setActiveSubmenuId(null);
      setAssetMenuOpen(false);
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("touchstart", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("touchstart", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [assetMenuOpen, panelOpen]);

  const runAddNode = useCallback(
    (action: WorkflowDockAddAction) => {
      if (action.disabled) {
        message.info("功能开发中");
      } else if (action.action === "open-style-library") {
        onOpenStyleLibrary();
      } else if (action.action === "open-effect-library") {
        onOpenEffectLibrary();
      } else if (action.kind) {
        onAddNode(action.kind, {
          title: action.title,
          note: action.description,
        });
      }
      setPanelOpen(false);
      setActiveSubmenuId(null);
      setAssetMenuOpen(false);
    },
    [onAddNode, onOpenEffectLibrary, onOpenStyleLibrary],
  );

  return (
    <div
      data-workflow-sidebar="true"
      className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 overflow-visible max-[640px]:bottom-[52px]"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div
        data-sidebar-container="true"
        className="relative flex flex-row items-center gap-2 overflow-visible rounded-[12px] bg-[var(--canvas-controls-bg,#262626)] p-2 text-[var(--canvas-controls-text,#fff)]"
        style={{ border: "0.5px solid var(--canvas-node-border,#363636)" }}
      >
        <WorkflowSidebarButton
          title={panelOpen ? "关闭添加节点" : "添加节点"}
          dataSidebarButton="add-node"
          primary
          onClick={() => {
            setAssetMenuOpen(false);
            setPanelOpen((open) => {
              if (open) setActiveSubmenuId(null);
              return !open;
            });
          }}
        >
          {panelOpen ? (
            <X className="size-6" />
          ) : (
            <LibTvSidebarAddIcon className="pointer-events-none size-4 transition-transform duration-200 group-hover:rotate-45" />
          )}
        </WorkflowSidebarButton>
        <WorkflowSidebarButton
          title="技能库"
          dataSidebarButton="open-skill-library"
          onClick={() => {
            setPanelOpen(false);
            setAssetMenuOpen(false);
            onOpenSkillLibrary();
          }}
        >
          <LibTvSidebarSkillIcon className="size-4" />
        </WorkflowSidebarButton>
        <WorkflowSidebarButton
          title="素材库"
          testId="nav-asset-library-button"
          active={assetMenuOpen}
          tooltipDisabled={assetMenuOpen}
          onClick={() => {
            setPanelOpen(false);
            setActiveSubmenuId(null);
            setAssetMenuOpen((open) => !open);
          }}
        >
          <LibTvSidebarAssetIcon className="size-4" />
        </WorkflowSidebarButton>
        {assetMenuOpen ? (
          <WorkflowAssetLibraryMenu
            onOpenStyleLibrary={() => {
              setAssetMenuOpen(false);
              onOpenStyleLibrary();
            }}
            onOpenEffectLibrary={() => {
              setAssetMenuOpen(false);
              onOpenEffectLibrary();
            }}
          />
        ) : null}
        <WorkflowSidebarButton
          title="人物库"
          onClick={() => {
            setPanelOpen(false);
            setAssetMenuOpen(false);
            onOpenCharacterLibrary();
          }}
        >
          <LibTvSidebarCharacterIcon className="size-4" />
        </WorkflowSidebarButton>
        <WorkflowSidebarButton
          title="历史记录"
          onClick={() => {
            setPanelOpen(false);
            setAssetMenuOpen(false);
            onOpenHistory();
          }}
        >
          <LibTvSidebarHistoryIcon className="size-4" />
        </WorkflowSidebarButton>
        <div className="h-5 w-px shrink-0 bg-[var(--canvas-controls-border,#363636)]" />
        <WorkflowSidebarButton
          title="快捷键"
          dataSidebarButton="keyboard"
          onClick={() => {
            setPanelOpen(false);
            setAssetMenuOpen(false);
            onOpenShortcuts();
          }}
        >
          <LibTvSidebarKeyboardIcon className="size-4" />
        </WorkflowSidebarButton>
        {panelOpen ? (
          <div
            ref={panelRef}
            className="absolute bottom-[calc(100%+8px)] left-6 flex max-h-[calc(100vh-160px)] w-[196px] -translate-x-1/2 flex-col gap-1 overflow-visible rounded-2xl border-[0.5px] border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,rgba(36,36,36,0.92))] p-2 text-[var(--canvas-controls-text,rgba(255,255,255,0.88))] shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-[32px]"
            role="menu"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h4 className="m-0 flex h-8 items-center px-2 text-xs font-medium leading-4 opacity-60">
              添加节点
            </h4>
            <div className="flex flex-col gap-1">
              {WORKFLOW_DOCK_ADD_ACTIONS.map((action) => {
                const Icon = action.icon;
                const hasSubmenu = Boolean(action.submenuOptions?.length);
                const active = activeSubmenuId === action.id;
                return (
                  <div
                    key={action.id}
                    className="relative"
                    onMouseEnter={() =>
                      setActiveSubmenuId(hasSubmenu ? action.id : null)
                    }
                  >
                    <button
                      type="button"
                      role="menuitem"
                      aria-haspopup={hasSubmenu ? "menu" : undefined}
                      aria-expanded={hasSubmenu ? active : undefined}
                      className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"
                      onClick={() => {
                        if (hasSubmenu) {
                          setActiveSubmenuId((current) =>
                            current === action.id ? null : action.id,
                          );
                        } else {
                          runAddNode(action);
                        }
                      }}
                    >
                      <Icon className="size-[14px] shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {action.label}
                      </span>
                      {action.badge ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] leading-3 ${action.badgeTone === "new" ? "bg-[#3CB5CC40] font-bold text-[#5DDCFF]" : "bg-[var(--canvas-controls-active,rgba(255,255,255,0.12))] opacity-60"}`}
                        >
                          {action.badge}
                        </span>
                      ) : null}
                      {hasSubmenu ? (
                        <ChevronRight className="size-[14px] shrink-0 opacity-60" />
                      ) : null}
                    </button>
                    {hasSubmenu && active ? (
                      <div className="absolute left-[calc(100%+8px)] top-0 z-[140] flex w-[184px] flex-col gap-1 rounded-2xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-bg,rgba(36,36,36,0.96))] p-2 shadow-[var(--canvas-shadow-menu,0_18px_44px_rgba(0,0,0,0.42))] backdrop-blur-[32px]">
                        {action.submenuOptions?.map((option) => {
                          const OptionIcon = option.icon || action.icon;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              role="menuitem"
                              className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"
                              onClick={() => runAddNode(option)}
                            >
                              <OptionIcon className="size-[14px] shrink-0" />
                              <span className="min-w-0 flex-1 truncate text-[13px]">
                                {option.label}
                              </span>
                              {option.badge ? (
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[10px] leading-3 ${option.badgeTone === "new" ? "bg-[#3CB5CC40] font-bold text-[#5DDCFF]" : "bg-[var(--canvas-controls-active,rgba(255,255,255,0.12))] opacity-60"}`}
                                >
                                  {option.badge}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <h4 className="m-0 flex h-8 items-center px-2 text-xs font-medium leading-4 opacity-60">
              添加资源
            </h4>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"
                onClick={() => {
                  onUpload();
                  setPanelOpen(false);
                }}
              >
                <Upload className="size-[14px]" />
                上传
              </button>
              <button
                type="button"
                className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"
                onClick={() => {
                  setPanelOpen(false);
                  onOpenHistory();
                }}
              >
                <LibTvSidebarAssetIcon className="size-[14px]" />
                从生成历史选择
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PlaylistIcon({ className = "" }: { className?: string }) {
  return (
    <ListVideo
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.8}
    />
  );
}

export function ThreeDWorldIcon({ className = "" }: { className?: string }) {
  return (
    <Cuboid
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.8}
    />
  );
}

function DirectorConsoleIcon({ className = "" }: { className?: string }) {
  return (
    <Blocks
      aria-hidden="true"
      role="img"
      className={className}
      strokeWidth={1.8}
    />
  );
}

const WORKFLOW_DOCK_ADD_ACTIONS: WorkflowDockAddAction[] = [
  {
    id: "text",
    label: "文本生成器",
    icon: FileText,
    kind: "text",
    description: "文案、对白与说明文本",
  },
  {
    id: "image",
    label: "图片生成器",
    icon: ImageIcon,
    kind: "image",
    description: "图片生成与参考图",
  },
  {
    id: "video",
    label: "视频生成器",
    icon: Video,
    kind: "video",
    description: "视频生成与首尾帧",
  },
  {
    id: "video-composition",
    label: "视频合成",
    icon: Scissors,
    kind: "playlist",
    description: "片段编排、时间线、合成导出",
    badge: "Beta",
    badgeTone: "beta",
  },
  {
    id: "threed",
    label: "3D 世界",
    icon: ThreeDWorldIcon,
    kind: "threed",
    description: "生成或查看可漫游 3D 世界",
  },
  {
    id: "director-console-3d",
    label: "3D 导演台",
    icon: DirectorConsoleIcon,
    kind: "director-console-3d",
    description: "在 3D 空间中搭建场景并输出多视角画面",
    badge: "NEW",
    badgeTone: "new",
  },
  {
    id: "audio",
    label: "音频生成器",
    icon: Music,
    kind: "audio",
    description: "音频生成与音频参考",
  },
  {
    id: "script",
    label: "脚本生成器",
    icon: FileText,
    description: "叙事、分镜与镜头说明",
    submenuOptions: [
      {
        id: "script-v2",
        label: "脚本生成器",
        icon: FileText,
        kind: "script-v2",
        title: "脚本生成器",
        description: "叙事、分镜与镜头说明",
        badge: "NEW",
        badgeTone: "new",
      },
      {
        id: "script-legacy",
        label: "脚本生成器（旧版）",
        icon: FileText,
        kind: "script",
        title: "脚本生成器（旧版）",
        description: "旧版脚本生成器",
        badge: "Beta",
        badgeTone: "beta",
      },
    ],
  },
  {
    id: "asset-library",
    label: "素材库",
    icon: LibTvSidebarAssetIcon,
    description: "素材库",
    badge: "NEW",
    badgeTone: "new",
    submenuOptions: [
      {
        id: "style-library",
        label: "风格库",
        icon: LibTvSidebarAssetIcon,
        action: "open-style-library",
        description: "风格广场",
      },
      {
        id: "effect-library",
        label: "特效库",
        icon: LibTvSidebarAssetIcon,
        action: "open-effect-library",
        description: "特效广场",
      },
    ],
  },
];
