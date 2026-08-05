"use client"

import React, { useLayoutEffect, useRef, useState } from "react"
import {
    Command as CommandIconGlyph,
    Delete as DeleteIconGlyph,
    Hand,
    Minus,
    Mouse,
    MousePointerClick,
    Move,
    Plus,
    Touchpad,
    X,
} from "lucide-react"

export function isWorkflowShortcutEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    const editable = target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']")
    return Boolean(editable)
}

type WorkflowShortcutToken =
    | { type: "command" }
    | { type: "key"; label: string }
    | { type: "plus" }
    | { type: "minus" }
    | { type: "delete" }
    | { type: "trackpad-zoom" }
    | { type: "mouse-zoom" }
    | { type: "mouse-left" }
    | { type: "trackpad-pan" }
    | { type: "mouse-pan" }
    | { type: "text"; label: string }

type WorkflowShortcutItem = {
    label: string
    tokens: WorkflowShortcutToken[]
}

type WorkflowShortcutGroup = {
    title: string
    items: WorkflowShortcutItem[]
}

const WORKFLOW_SHORTCUT_GROUPS: WorkflowShortcutGroup[] = [
    {
        title: "创作",
        items: [
            { label: "成组", tokens: [{ type: "command" }, { type: "key", label: "G" }] },
            { label: "合并分镜组", tokens: [{ type: "command" }, { type: "key", label: "⌥" }, { type: "key", label: "G" }] },
            { label: "解组", tokens: [{ type: "command" }, { type: "key", label: "⇧" }, { type: "key", label: "G" }] },
            { label: "连线", tokens: [{ type: "command" }, { type: "key", label: "L" }] },
            { label: "复制节点和连线", tokens: [{ type: "command" }, { type: "key", label: "D" }] },
            { label: "生成", tokens: [{ type: "command" }, { type: "key", label: "Enter" }] },
            { label: "新建节点", tokens: [{ type: "key", label: "Tab" }] },
            { label: "节点复制", tokens: [{ type: "key", label: "Option" }, { type: "text", label: "+拖动节点" }] },
            { label: "创建副本", tokens: [{ type: "command" }, { type: "key", label: "Option" }, { type: "text", label: "+拖动" }] },
        ],
    },
    {
        title: "缩放",
        items: [
            { label: "放大", tokens: [{ type: "command" }, { type: "plus" }] },
            { label: "缩小", tokens: [{ type: "command" }, { type: "minus" }] },
            { label: "适应画布", tokens: [{ type: "command" }, { type: "key", label: "0" }] },
            { label: "触控板", tokens: [{ type: "trackpad-zoom" }] },
            { label: "鼠标", tokens: [{ type: "command" }, { type: "mouse-zoom" }] },
        ],
    },
    {
        title: "移动画布",
        items: [
            { label: "键盘", tokens: [{ type: "key", label: "Space" }, { type: "mouse-left" }] },
            { label: "触控板", tokens: [{ type: "trackpad-pan" }] },
            { label: "鼠标", tokens: [{ type: "mouse-pan" }] },
            { label: "整理画布", tokens: [{ type: "key", label: "⌥" }, { type: "key", label: "⇧" }, { type: "key", label: "F" }] },
        ],
    },
    {
        title: "其他",
        items: [
            { label: "撤销", tokens: [{ type: "command" }, { type: "key", label: "Z" }] },
            { label: "重做", tokens: [{ type: "command" }, { type: "key", label: "⇧" }, { type: "key", label: "Z" }] },
            { label: "删除", tokens: [{ type: "delete" }] },
        ],
    },
]

function WorkflowShortcutKeycap({ children }: { children: React.ReactNode }) {
    return (
        <span
            className="flex h-7 min-w-7 shrink-0 items-center justify-center px-1 font-sans text-sm"
            style={{
                color: "var(--canvas-controls-text, rgba(255,255,255,0.9))",
                borderRadius: 8,
                border: "0.5px solid var(--canvas-controls-border, rgba(255,255,255,0.12))",
            }}
        >
            {children}
        </span>
    )
}

function WorkflowShortcutIconFrame({ children }: { children: React.ReactNode }) {
    return (
        <span
            className="flex shrink-0 items-center justify-center"
            style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "1px solid var(--canvas-controls-border, rgba(255,255,255,0.12))",
            }}
        >
            {children}
        </span>
    )
}

function CommandIcon() {
    return (
        <WorkflowShortcutIconFrame>
            <CommandIconGlyph className="size-4" strokeWidth={1.5} />
        </WorkflowShortcutIconFrame>
    )
}

function PlusIcon() {
    return (
        <WorkflowShortcutIconFrame>
            <Plus className="size-4" strokeWidth={1.8} />
        </WorkflowShortcutIconFrame>
    )
}

function MinusIcon() {
    return (
        <WorkflowShortcutIconFrame>
            <Minus className="size-4" strokeWidth={1.8} />
        </WorkflowShortcutIconFrame>
    )
}

function DeleteIcon() {
    return (
        <WorkflowShortcutIconFrame>
            <DeleteIconGlyph className="size-4" strokeWidth={1.6} />
        </WorkflowShortcutIconFrame>
    )
}

function MouseIcon({ activeLeft = false, pan = false }: { activeLeft?: boolean; pan?: boolean }) {
    const Icon = pan ? Move : activeLeft ? MousePointerClick : Mouse
    return (
        <WorkflowShortcutIconFrame>
            <Icon className={pan ? "size-4 text-[#5DDCFF]" : "size-4"} strokeWidth={1.7} />
        </WorkflowShortcutIconFrame>
    )
}

function TrackpadIcon({ pan = false }: { pan?: boolean }) {
    const Icon = pan ? Hand : Touchpad
    return (
        <WorkflowShortcutIconFrame>
            <Icon className={pan ? "size-4 text-[#5DDCFF]" : "size-4"} strokeWidth={1.7} />
        </WorkflowShortcutIconFrame>
    )
}

function WorkflowShortcutTokenView({ token }: { token: WorkflowShortcutToken }) {
    switch (token.type) {
        case "command":
            return <CommandIcon />
        case "key":
            return <WorkflowShortcutKeycap>{token.label}</WorkflowShortcutKeycap>
        case "plus":
            return <PlusIcon />
        case "minus":
            return <MinusIcon />
        case "delete":
            return <DeleteIcon />
        case "trackpad-zoom":
            return <TrackpadIcon />
        case "trackpad-pan":
            return <TrackpadIcon pan />
        case "mouse-zoom":
            return <MouseIcon />
        case "mouse-left":
            return <MouseIcon activeLeft />
        case "mouse-pan":
            return <MouseIcon pan />
        case "text":
            return <span>{token.label}</span>
        default:
            return null
    }
}

export function WorkflowShortcutPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const [bottom, setBottom] = useState(69)
    const [transformOrigin, setTransformOrigin] = useState("50% 100%")

    useLayoutEffect(() => {
        if (!open) return
        let frame = 0
        const syncPosition = () => {
            const dock = document.querySelector<HTMLElement>("[data-sidebar-container='true']")
            if (!dock) return
            const dockRect = dock.getBoundingClientRect()
            setBottom(Math.round(window.innerHeight - dockRect.top + 8))
            const panel = rootRef.current
            const trigger = dock.querySelector<HTMLElement>('[data-sidebar-btn="keyboard"]')
            if (!panel || !trigger) return
            const triggerRect = trigger.getBoundingClientRect()
            const panelLeft = window.innerWidth / 2 - panel.offsetWidth / 2
            setTransformOrigin(String(triggerRect.left + triggerRect.width / 2 - panelLeft) + "px 100%")
        }
        const scheduleSync = () => {
            window.cancelAnimationFrame(frame)
            frame = window.requestAnimationFrame(syncPosition)
        }
        syncPosition()
        scheduleSync()
        window.addEventListener("resize", scheduleSync)
        return () => {
            window.removeEventListener("resize", scheduleSync)
            window.cancelAnimationFrame(frame)
        }
    }, [open])

    if (!open) return null

    return (
        <div
            ref={rootRef}
            className="absolute left-1/2 z-[300] w-[min(100%,calc(100vw-1.5rem))] max-w-[1152px]"
            style={{ bottom, transform: "translateX(-50%)", transformOrigin }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
        >
            <div
                className="relative box-border rounded-2xl p-4 backdrop-blur-lg md:p-6"
                style={{
                    background: "var(--canvas-panel-background-translucent, rgba(38, 38, 38, 0.95))",
                    border: "0.5px solid var(--canvas-controls-border, #363636)",
                    boxShadow: "var(--canvas-shadow-dropdown, 0 4px 10px rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.3))",
                }}
            >
                <header className="absolute right-3 top-3">
                    <button
                        type="button"
                        className="hover:bg-canvas-controls-hover flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
                        aria-label="关闭快捷键面板"
                        onClick={onClose}
                    >
                        <X aria-hidden="true" className="pointer-events-none size-3.5" strokeWidth={2} />
                    </button>
                </header>
                <div className="flex max-h-[80vh] flex-col gap-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] md:max-h-none md:flex-row md:items-stretch md:gap-5 md:overflow-visible lg:gap-6">
                    {WORKFLOW_SHORTCUT_GROUPS.map((group, groupIndex) => (
                        <React.Fragment key={group.title}>
                            {groupIndex > 0 ? <div className="hidden w-px shrink-0 self-stretch bg-[var(--canvas-controls-border)] md:block" aria-hidden="true" /> : null}
                            <section className="border-canvas-controls-border flex w-full min-w-0 flex-col gap-3 border-b pb-5 last:border-b-0 last:pb-0 md:w-52 md:shrink-0 md:border-b-0 md:pb-0 lg:w-[239px]">
                                <h3 className="text-sm font-medium text-[#09CAF5]">{group.title}</h3>
                                <div className="flex flex-col gap-3">
                                    {group.items.map((item) => (
                                        <div key={`${group.title}-${item.label}`} className="flex w-full flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
                                            <span className="text-left text-sm leading-snug text-[var(--fg-muted)] md:min-w-0 md:flex-1 md:pr-2">{item.label}</span>
                                            <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--canvas-controls-text)] md:shrink-0 md:justify-end">
                                                {item.tokens.map((token, index) => <WorkflowShortcutTokenView key={`${item.label}-${index}`} token={token} />)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
    )
}
