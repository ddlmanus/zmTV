"use client"

import React from "react"
import { BadgePlus, Clapperboard, FileText, Music, UserRoundCog } from "lucide-react"

export type WorkflowEmptyStarterId = "story-script" | "character-three-view" | "first-frame-video" | "audio-video"

const WORKFLOW_EMPTY_STARTER_CARDS: Array<{
    id: WorkflowEmptyStarterId
    label: string
    icon: React.ComponentType<{ className?: string }>
}> = [
    {
        id: "story-script",
        label: "脚本生成器",
        icon: StoryScriptStarterIcon,
    },
    {
        id: "character-three-view",
        label: "人物设定图",
        icon: CharacterStarterIcon,
    },
    {
        id: "first-frame-video",
        label: "视频生成器",
        icon: FirstFrameStarterIcon,
    },
    {
        id: "audio-video",
        label: "音频生成器",
        icon: AudioStarterIcon,
    },
]

function StoryScriptStarterIcon({ className = "" }: { className?: string }) {
    return <FileText aria-hidden="true" role="img" className={className || "size-5"} strokeWidth={1.8} />
}

function CharacterStarterIcon({ className = "" }: { className?: string }) {
    return <UserRoundCog aria-hidden="true" role="img" className={className || "size-5"} strokeWidth={1.8} />
}

function FirstFrameStarterIcon({ className = "" }: { className?: string }) {
    return <Clapperboard aria-hidden="true" role="img" className={className || "size-5"} strokeWidth={1.8} />
}

function AudioStarterIcon({ className = "" }: { className?: string }) {
    return <Music aria-hidden="true" role="img" className={className || "size-5"} strokeWidth={1.8} />
}

export function WorkflowEmptyState({ onCreateStarter }: { onCreateStarter: (starterId: WorkflowEmptyStarterId) => void }) {
    const hintIcon = <BadgePlus className="size-5 shrink-0" strokeWidth={1.8} />

    return (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <section className="pointer-events-auto w-[min(500px,calc(100vw-120px))] max-[640px]:w-[calc(100vw-92px)]" data-testid="canvas-placeholder-container">
                <div className="mb-5 flex items-center justify-between border-b border-[var(--canvas-controls-border,#363636)] pb-3">
                    <div className="flex items-center gap-2 text-[var(--canvas-controls-text,rgba(255,255,255,0.88))]">
                        {hintIcon}
                        <h2 className="m-0 text-[15px] font-semibold leading-5">创建起点</h2>
                    </div>
                    <span className="text-[11px] tabular-nums text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]">04 TEMPLATES</span>
                </div>
                <div className="grid grid-cols-2 gap-2 max-[640px]:grid-cols-1">
                    {WORKFLOW_EMPTY_STARTER_CARDS.map((card, index) => {
                        const Icon = card.icon
                        return (
                            <button
                                key={card.id}
                                type="button"
                                className="group flex h-16 min-w-0 cursor-pointer items-center gap-3 rounded-[6px] border border-[var(--canvas-controls-border,#363636)] bg-[var(--panel-background,#262626)] px-3 text-left transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:border-[#4b9ca9] hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4b9ca9]"
                                onClick={() => onCreateStarter(card.id)}
                            >
                                <span className="flex size-8 shrink-0 items-center justify-center rounded-[5px] bg-[#4b9ca9]/15 text-[#6fc5d2]">
                                    <Icon className="pointer-events-none size-[17px]" />
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--canvas-controls-text,rgba(255,255,255,0.88))]">{card.label}</span>
                                <span className="text-[11px] tabular-nums text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]">0{index + 1}</span>
                            </button>
                        )
                    })}
                </div>
            </section>
        </div>
    )
}
