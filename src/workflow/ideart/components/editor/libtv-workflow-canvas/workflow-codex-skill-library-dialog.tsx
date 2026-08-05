"use client"

import { useEffect, useMemo, useState } from "react"
import { workflowFetch as fetch } from "@/workflow/backend/client"
import { createPortal } from "react-dom"
import Image from "@/workflow/ideart/shims/next-image"
import {
    Blocks,
    Plus,
    RefreshCw,
    Search,
    Sparkles,
    X,
} from "lucide-react"
import {
    codexSkillCoverUrl,
    codexSkillDisplayDescription,
    codexSkillDisplayName,
    isCodexSkillCreator,
    isFrontEndSelectableCodexSkill,
    isOfficialCodexSkill,
} from "@/workflow/ideart/lib/codex/skill-visibility"

export type WorkflowCodexSkill = {
    id: string
    name: string
    description: string
    path: string
    scope: string
}

type WorkflowCodexSkillLibraryDialogProps = {
    open: boolean
    onClose: () => void
    onUseSkill: (skill: WorkflowCodexSkill) => void
    onCreateSkill: (skillCreator: WorkflowCodexSkill) => void
}

function normalizeSkills(value: unknown): WorkflowCodexSkill[] {
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    return value.flatMap((entry) => {
        const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : null
        const id = String(item?.id || "").trim()
        const name = String(item?.name || id).trim()
        const path = String(item?.path || "").trim()
        if (!id || !name || seen.has(id)) return []
        seen.add(id)
        return [{
            id,
            name,
            description: String(item?.description || "").trim() || "Codex 可按需读取并执行这个 Skill。",
            path,
            scope: String(item?.scope || "user").trim() || "user",
        }]
    })
}

function WorkflowCodexSkillCard({
    skill,
    onUseSkill,
}: {
    skill: WorkflowCodexSkill
    onUseSkill: (skill: WorkflowCodexSkill) => void
}) {
    const coverImageUrl = codexSkillCoverUrl(skill)
    const [coverAvailable, setCoverAvailable] = useState(true)
    const displayName = codexSkillDisplayName(skill)
    const displayDescription = codexSkillDisplayDescription(skill)
    const official = isOfficialCodexSkill(skill)

    return (
        <button
            type="button"
            className="group flex min-w-0 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67b9c7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#262626]"
            onClick={() => onUseSkill({ ...skill, name: displayName, description: displayDescription })}
        >
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/[0.08] bg-[radial-gradient(circle_at_28%_22%,rgba(99,207,221,0.2),transparent_38%),linear-gradient(145deg,#293237,#202326)]">
                {coverImageUrl && coverAvailable ? (
                    <Image
                        src={coverImageUrl}
                        alt={`${displayName}技能封面`}
                        fill
                        sizes="(min-width: 1536px) 260px, (min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        unoptimized
                        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                        draggable={false}
                        onError={() => setCoverAvailable(false)}
                    />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-[#111517]/70 via-transparent to-white/[0.025]" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col px-1 pb-1 pt-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <h3 className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[var(--canvas-controls-text,#f7f7f7)]">
                        {displayName}
                    </h3>
                    <span className="shrink-0 text-[11px] leading-5 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]">{official ? "官方技能" : "我的技能"}</span>
                </div>
                <p className="mt-1 line-clamp-2 min-h-10 text-[13px] leading-5 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]">
                    {displayDescription}
                </p>
                <span className="mt-2 inline-flex h-7 w-fit items-center rounded-lg bg-white/[0.07] px-2.5 text-[12px] font-medium text-white/82 opacity-0 transition-[opacity,transform,background-color] duration-150 group-hover:translate-y-0 group-hover:bg-white/[0.11] group-hover:opacity-100 group-focus-visible:opacity-100">
                    在 Codex 中使用
                </span>
            </div>
        </button>
    )
}

export function WorkflowCodexSkillLibraryDialog({
    open,
    onClose,
    onUseSkill,
    onCreateSkill,
}: WorkflowCodexSkillLibraryDialogProps) {
    const [skills, setSkills] = useState<WorkflowCodexSkill[]>([])
    const [activeTab, setActiveTab] = useState<"system" | "user">("system")
    const [keyword, setKeyword] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
        if (!open) return
        let cancelled = false
        setLoading(true)
        setError("")
        fetch("/api/codex/skills", {
            credentials: "include",
            cache: "no-store",
        })
            .then(async (response) => {
                const payload = await response.json().catch(() => null)
                if (!response.ok) {
                    throw new Error(String(payload?.error?.message || payload?.error || "Codex 技能加载失败"))
                }
                return normalizeSkills(payload?.skills)
            })
            .then((nextSkills) => {
                if (cancelled) return
                setSkills(nextSkills)
            })
            .catch((cause) => {
                if (cancelled) return
                setError(cause instanceof Error ? cause.message : "Codex 技能加载失败")
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, reloadKey])

    useEffect(() => {
        if (!open) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = "hidden"
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose()
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => {
            document.body.style.overflow = previousOverflow
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [onClose, open])

    const skillCreator = useMemo(() => skills.find(isCodexSkillCreator) || null, [skills])
    const selectableSkills = useMemo(() => skills.filter(isFrontEndSelectableCodexSkill), [skills])
    const systemSkills = useMemo(() => selectableSkills.filter(isOfficialCodexSkill), [selectableSkills])
    const userSkills = useMemo(() => selectableSkills.filter((skill) => !isOfficialCodexSkill(skill)), [selectableSkills])
    const visibleSkills = useMemo(() => {
        const source = activeTab === "system" ? systemSkills : userSkills
        const query = keyword.trim().toLowerCase()
        if (!query) return source
        return source.filter((skill) => `${skill.id} ${skill.name} ${codexSkillDisplayName(skill)} ${skill.description} ${codexSkillDisplayDescription(skill)}`.toLowerCase().includes(query))
    }, [activeTab, keyword, systemSkills, userSkills])

    if (!open || typeof document === "undefined") return null

    return createPortal(
        <>
            <div className="fixed inset-0 z-[299] bg-black/72 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="workflow-codex-skill-library-title"
                className="fixed left-1/2 top-1/2 z-[300] flex max-h-[calc(100dvh-48px)] w-[min(1480px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--canvas-controls-border,#3a3a3a)] bg-[var(--canvas-controls-bg,#2b2b2b)] text-[var(--canvas-controls-text,#f7f7f7)] shadow-[0_28px_90px_rgba(0,0,0,0.45)]"
                style={{ height: "min(860px, calc(100dvh - 48px))" }}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onContextMenu={(event) => event.stopPropagation()}
            >
                <header className="flex min-h-20 shrink-0 items-center justify-between gap-5 border-b border-[var(--canvas-controls-border,#3a3a3a)] px-6 max-sm:min-h-16 max-sm:px-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5">
                            <Sparkles className="size-5 shrink-0 text-[#76c4d0]" strokeWidth={1.8} />
                            <h2 id="workflow-codex-skill-library-title" className="truncate text-[18px] font-semibold">Codex 技能库</h2>
                        </div>
                        <p className="mt-1 truncate text-[12px] text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))] max-sm:hidden">
                            这里展示当前账号中 Codex 可以读取和执行的 Skill
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                        <label className="relative block max-sm:hidden">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]" strokeWidth={1.8} />
                            <input
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                placeholder="搜索技能"
                                aria-label="搜索 Codex 技能"
                                className="h-9 w-56 rounded-lg border border-[var(--canvas-controls-border,#3a3a3a)] bg-white/[0.05] pl-9 pr-3 text-[13px] text-[var(--canvas-controls-text,#f7f7f7)] outline-none placeholder:text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))] focus:border-[#67b9c7] focus:ring-1 focus:ring-[#67b9c7]"
                            />
                        </label>
                        <button
                            type="button"
                            aria-label="关闭技能库"
                            className="flex size-9 items-center justify-center rounded-lg text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.6))] transition-colors hover:bg-white/[0.08] hover:text-[var(--canvas-controls-text,#f7f7f7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67b9c7]"
                            onClick={onClose}
                        >
                            <X className="size-5" strokeWidth={1.8} />
                        </button>
                    </div>
                </header>

                <div className="flex shrink-0 items-center justify-between gap-4 px-6 py-4 max-sm:flex-col max-sm:items-stretch max-sm:px-4 max-sm:py-3">
                    <div className="flex w-fit rounded-xl border border-[var(--canvas-controls-border,#3a3a3a)] bg-white/[0.035] p-1">
                        {([
                            { id: "system", label: "官方技能", count: systemSkills.length },
                            { id: "user", label: "我的技能", count: userSkills.length },
                        ] as const).map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`h-8 rounded-lg px-4 text-[13px] font-medium transition-colors ${activeTab === tab.id ? "bg-white/[0.11] text-[var(--canvas-controls-text,#f7f7f7)] shadow-sm" : "text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.55))] hover:text-[var(--canvas-controls-text,#f7f7f7)]"}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label} <span className="ml-1 tabular-nums opacity-60">{tab.count}</span>
                            </button>
                        ))}
                    </div>
                    <label className="relative hidden max-sm:block">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]" strokeWidth={1.8} />
                        <input
                            value={keyword}
                            onChange={(event) => setKeyword(event.target.value)}
                            placeholder="搜索技能"
                            aria-label="搜索 Codex 技能"
                            className="h-9 w-full rounded-lg border border-[var(--canvas-controls-border,#3a3a3a)] bg-white/[0.05] pl-9 pr-3 text-[13px] outline-none placeholder:text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))] focus:border-[#67b9c7] focus:ring-1 focus:ring-[#67b9c7]"
                        />
                    </label>
                    <span className="text-[12px] text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))] max-sm:hidden">
                        选择一个技能后，导演 Agent 会带着它开始对话
                    </span>
                </div>

                <div className="tiny-scrollbar min-h-0 flex-1 overflow-y-auto px-6 pb-6 max-sm:px-4 max-sm:pb-4">
                    {loading ? (
                        <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {Array.from({ length: 10 }).map((_item, index) => (
                                <div key={index} className="animate-pulse">
                                    <div className="aspect-[16/9] rounded-xl bg-white/[0.06]" />
                                    <div className="mt-3 h-4 w-2/3 rounded bg-white/[0.06]" />
                                    <div className="mt-2 h-3.5 w-full rounded bg-white/[0.045]" />
                                    <div className="mt-1.5 h-3.5 w-4/5 rounded bg-white/[0.045]" />
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                            <div className="flex size-12 items-center justify-center rounded-xl bg-white/[0.06] text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.55))]">
                                <RefreshCw className="size-5" strokeWidth={1.7} />
                            </div>
                            <p className="mt-4 text-[14px] font-medium">技能库加载失败</p>
                            <p className="mt-1 max-w-md text-[12px] leading-5 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]">{error}</p>
                            <button type="button" className="mt-4 h-8 rounded-lg bg-white/[0.09] px-3 text-[13px] hover:bg-white/[0.13]" onClick={() => setReloadKey((value) => value + 1)}>
                                重新加载
                            </button>
                        </div>
                    ) : visibleSkills.length === 0 && keyword.trim() ? (
                        <div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
                            <div className="flex size-12 items-center justify-center rounded-xl bg-white/[0.06] text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.55))]">
                                <Blocks className="size-5" strokeWidth={1.7} />
                            </div>
                            <p className="mt-4 text-[14px] font-medium">没有匹配的技能</p>
                            <p className="mt-1 text-[12px] leading-5 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]">
                                换一个关键词继续查找
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                            {!keyword.trim() ? (
                                <button
                                    type="button"
                                    className="group flex min-w-0 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#67b9c7] focus-visible:ring-offset-2 focus-visible:ring-offset-[#262626] disabled:cursor-wait disabled:opacity-55"
                                    onClick={() => skillCreator && onCreateSkill(skillCreator)}
                                    disabled={!skillCreator}
                                >
                                    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-dashed border-[#75cad6]/45 bg-[radial-gradient(circle_at_50%_42%,rgba(103,185,199,0.26),transparent_34%),linear-gradient(145deg,#263438,#202729)] transition-colors group-hover:border-[#75cad6]/75">
                                        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:24px_24px]" />
                                        <div className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/10 bg-[#1d2528]/80 text-[#9ee4ed] shadow-[0_12px_38px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm transition-transform duration-200 group-hover:scale-105">
                                            <Plus className="size-7" strokeWidth={1.6} />
                                        </div>
                                    </div>
                                    <div className="px-1 pb-1 pt-3">
                                        <h3 className="text-[15px] font-semibold leading-5 text-[var(--canvas-controls-text,#f7f7f7)]">添加技能</h3>
                                        <p className="mt-1 line-clamp-2 min-h-10 text-[13px] leading-5 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.5))]">调用 Codex 官方 Skill Creator，引导你创建并验证专业技能。</p>
                                        <span className="mt-2 inline-flex h-7 items-center rounded-lg bg-[#67b9c7]/12 px-2.5 text-[12px] font-medium text-[#9ee4ed]">使用 Skill Creator</span>
                                    </div>
                                </button>
                            ) : null}
                            {visibleSkills.map((skill) => (
                                <WorkflowCodexSkillCard key={skill.id} skill={skill} onUseSkill={onUseSkill} />
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </>,
        document.body
    )
}
