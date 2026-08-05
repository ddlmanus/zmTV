"use client"

import { useEffect, useMemo, useState } from "react"
import { message } from "@/workflow/ideart/shims/antd"
import { ChevronDown, Expand, Heart, MoreHorizontal, MousePointer2, Search, X } from "lucide-react"

export type WorkflowAssetMarketplaceType = "style" | "effect"

type SkillLibraryItem = {
    id: string
    title: string
    slug: string
    categorySlug: string
    shortDescription?: string
    description?: string
    coverImageUrl?: string
    hoverImageUrl?: string
    tags?: string[]
    isFavorited?: boolean
    lastUsedAt?: string | null
    usageCount?: number
}

type SkillLibraryCategory = {
    name: string
    slug: string
}

type WorkflowAssetMarketplaceDialogProps = {
    open: boolean
    type: WorkflowAssetMarketplaceType
    onClose: () => void
    onApply: (item: SkillLibraryItem) => void
}

const STYLE_CATEGORY_SLUG = "style-library"
const EFFECT_CATEGORY_SLUG = "effect-library"
const STYLE_FILTERS = ["推荐", "Midjourney", "摄影写真", "电商营销", "动漫游戏", "风格插画", "平面设计", "建筑及室内设计", "创意玩法", "文创周边", "小说推文"]
const EFFECT_FILTERS = ["推荐"]

function getMarketplaceCopy(type: WorkflowAssetMarketplaceType) {
    if (type === "effect") {
        return {
            categorySlug: EFFECT_CATEGORY_SLUG,
            primaryTab: "特效广场",
            searchPlaceholder: "搜索特效名称、作者",
            emptyText: "暂无特效素材",
            filters: EFFECT_FILTERS,
            aspectRatio: "1 / 1",
        }
    }
    return {
        categorySlug: STYLE_CATEGORY_SLUG,
        primaryTab: "风格广场",
        searchPlaceholder: "搜索风格名称、作者",
        emptyText: "暂无风格素材",
        filters: STYLE_FILTERS,
        aspectRatio: "0.747899 / 1",
    }
}

function CommercialIcon({ className = "" }: { className?: string }) {
    return (
        <svg viewBox="0 0 22 22" className={className} aria-hidden="true">
            <path d="M11 0C17.0751 0 21.9999 4.92498 22 11C22 17.0751 17.0751 22 11 22C4.92487 22 0 17.0751 0 11C0.000131941 4.92498 4.92495 0 11 0ZM11 1.7998C5.91906 1.7998 1.79994 5.91909 1.7998 11C1.7998 16.081 5.91898 20.2002 11 20.2002C16.081 20.2002 20.2002 16.081 20.2002 11C20.2001 5.91909 16.0809 1.7998 11 1.7998ZM16.5195 8.35059L9.88281 14.9863L5.74609 10.8506L7.01953 9.57715L9.88281 12.4404L15.2461 7.07715L16.5195 8.35059Z" fill="currentColor" />
        </svg>
    )
}

function normalizeItemAuthor(item: SkillLibraryItem) {
    const authorTag = item.tags?.find((tag) => tag.startsWith("作者:"))
    if (authorTag) return authorTag.replace(/^作者:/, "").trim()
    return item.shortDescription || "LibTV"
}

function matchesFilter(item: SkillLibraryItem, filter: string) {
    if (filter === "推荐") return true
    return item.tags?.some((tag) => tag === filter) ?? false
}

export function WorkflowAssetMarketplaceDialog({ open, type, onClose, onApply }: WorkflowAssetMarketplaceDialogProps) {
    const copy = useMemo(() => getMarketplaceCopy(type), [type])
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [keyword, setKeyword] = useState("")
    const [activeFilter, setActiveFilter] = useState("推荐")
    const [activeTab, setActiveTab] = useState<"market" | "favorite" | "recent">("market")
    const [items, setItems] = useState<SkillLibraryItem[]>([])
    const [categories, setCategories] = useState<SkillLibraryCategory[]>([])
    const [page, setPage] = useState(1)
    const [pageSize] = useState(48)
    const [hasMore, setHasMore] = useState(false)
    const [totalCount, setTotalCount] = useState(0)

    useEffect(() => {
        if (!open) return
        setActiveFilter("推荐")
        setActiveTab("market")
        setPage(1)
        setHasMore(false)
        setTotalCount(0)
        setItems([])
    }, [open, type])

    useEffect(() => {
        if (!open) return
        let cancelled = false
        const load = async () => {
            setLoading(true)
            const qs = new URLSearchParams()
            if (keyword.trim()) qs.set("keyword", keyword.trim())
            if (activeTab === "favorite" || activeTab === "recent") {
                qs.set("tab", activeTab)
            } else {
                qs.set("categorySlug", copy.categorySlug)
            }
            qs.set("page", "1")
            qs.set("pageSize", String(pageSize))
            try {
                const response = await fetch(`/api/skill-library?${qs.toString()}`, { credentials: "include" })
                const data = await response.json().catch(() => ({}))
                if (cancelled) return
                if (!response.ok) {
                    message.error(data?.error || "素材库加载失败")
                    return
                }
                setCategories(Array.isArray(data.categories) ? data.categories : [])
                setItems(Array.isArray(data.list) ? data.list : [])
                setPage(Number(data.page || 1))
                setHasMore(Boolean(data.hasMore))
                setTotalCount(Number(data.total || 0))
            } catch (error) {
                if (!cancelled) message.error(error instanceof Error ? error.message : "素材库加载失败")
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        const timer = window.setTimeout(load, keyword.trim() ? 180 : 0)
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [activeTab, copy.categorySlug, keyword, open, pageSize])

    useEffect(() => {
        if (!open) return
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [onClose, open])

    const filteredItems = useMemo(() => {
        return items.filter((item) => matchesFilter(item, activeFilter))
    }, [activeFilter, items])

    const toggleFavorite = async (item: SkillLibraryItem) => {
        setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, isFavorited: !candidate.isFavorited } : candidate))
        try {
            await fetch("/api/skill-library", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "toggle_favorite", itemId: item.id, favorited: !item.isFavorited }),
            })
        } catch {
            message.error("收藏失败")
        }
    }

    const loadMore = async () => {
        if (!open || loading || loadingMore || !hasMore) return
        setLoadingMore(true)
        const nextPage = page + 1
        const qs = new URLSearchParams()
        if (keyword.trim()) qs.set("keyword", keyword.trim())
        if (activeTab === "favorite" || activeTab === "recent") {
            qs.set("tab", activeTab)
        } else {
            qs.set("categorySlug", copy.categorySlug)
        }
        qs.set("page", String(nextPage))
        qs.set("pageSize", String(pageSize))
        try {
            const response = await fetch(`/api/skill-library?${qs.toString()}`, { credentials: "include" })
            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                message.error(data?.error || "素材库加载失败")
                return
            }
            setItems((current) => [...current, ...(Array.isArray(data.list) ? data.list : [])])
            setPage(Number(data.page || nextPage))
            setHasMore(Boolean(data.hasMore))
            setTotalCount(Number(data.total || totalCount))
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材库加载失败")
        } finally {
        setLoadingMore(false)
    }
    }

    const useItem = async (item: SkillLibraryItem) => {
        const url = String(item.coverImageUrl || item.hoverImageUrl || "").trim()
        if (!url) {
            message.error("该素材没有可用图片")
            return
        }
        onClose()
        window.setTimeout(() => {
            setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, lastUsedAt: new Date().toISOString(), usageCount: Number(candidate.usageCount || 0) + 1 } : candidate))
            void fetch("/api/skill-library", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "record_recent", itemId: item.id }),
            }).catch(() => {
                // 最近使用失败不影响前台选择。
            })
            onApply(item)
            message.success(`已选择「${item.title}」`)
        }, 0)
    }

    if (!open) return null

    const currentCategory = categories.find((category) => category.slug === copy.categorySlug)

    return (
        <div className="fixed inset-0 z-[700]" role="presentation">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="absolute inset-x-[100px] top-[5dvh] z-[701] mx-auto max-w-[1600px]">
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-label={currentCategory?.name || copy.primaryTab}
                    className="flex overflow-hidden rounded-xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.12))] bg-[var(--canvas-controls-bg,rgba(36,36,36,0.94))] shadow-[var(--canvas-shadow-dropdown,0_24px_80px_rgba(0,0,0,0.46))] backdrop-blur-xl"
                    style={{ height: "min(calc(100vh - 160px), 1200px)" }}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex min-h-0 flex-1 flex-col gap-3 py-3 pb-4">
                        <div className="flex h-10 shrink-0 items-center gap-4 px-4">
                            <div className="flex flex-1 items-center gap-4">
                                <div className="flex h-10 shrink-0 items-center gap-1 rounded-xl border border-[var(--canvas-controls-border,rgba(255,255,255,0.10))] bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] p-1">
                                    {[
                                        ["market", copy.primaryTab],
                                        ["favorite", "我的收藏"],
                                        ["recent", "最近使用"],
                                    ].map(([tab, label]) => (
                                        <button
                                            key={tab}
                                            type="button"
                                            className={`flex h-8 min-w-12 items-center justify-center whitespace-nowrap rounded-lg px-4 text-[15px] transition-colors ${activeTab === tab ? "bg-[var(--btn-ghost-hover,rgba(255,255,255,0.10))] text-[#F7F7F7]" : "text-[#919191] hover:bg-[var(--btn-ghost-hover,rgba(255,255,255,0.08))]"}`}
                                            onClick={() => setActiveTab(tab as "market" | "favorite" | "recent")}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex h-10 w-[336px] shrink-0 items-center gap-1 overflow-hidden rounded-lg border border-transparent bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] py-2 pl-4 pr-2 transition-colors focus-within:border-[#07b8dd]">
                                    <input
                                        value={keyword}
                                        onChange={(event) => setKeyword(event.target.value)}
                                        placeholder={copy.searchPlaceholder}
                                        className="min-w-0 flex-1 bg-transparent text-[13px] text-[#F7F7F7] outline-none placeholder:text-[#919191]"
                                    />
                                    <button type="button" aria-label="search" className="flex size-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--btn-ghost-hover,rgba(255,255,255,0.08))]">
                                        <Search className="size-3.5 text-[#919191]" />
                                    </button>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-4">
                                <button type="button" aria-label="minimize" className="flex size-10 items-center justify-center rounded-lg text-[#F7F7F7] hover:bg-[var(--btn-ghost-hover,rgba(255,255,255,0.08))]" onClick={onClose}>
                                    <Expand className="size-3.5 rotate-180" />
                                </button>
                                <button type="button" aria-label="close" className="flex size-10 items-center justify-center rounded-lg text-[#F7F7F7] hover:bg-[var(--btn-ghost-hover,rgba(255,255,255,0.08))]" onClick={onClose}>
                                    <X className="size-3.5" />
                                </button>
                            </div>
                        </div>
                        <div className="h-px shrink-0 bg-[var(--canvas-controls-border,rgba(255,255,255,0.10))]" />
                        <div className="flex shrink-0 items-center gap-6 px-4">
                            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {copy.filters.map((filter) => (
                                    <button
                                        key={filter}
                                        type="button"
                                        className={`flex h-7 min-w-12 shrink-0 items-center justify-center rounded-lg px-3 py-1 text-[13px] transition-colors ${activeFilter === filter ? "bg-white/10 text-[#F7F7F7]" : "text-[#919191] hover:bg-[var(--btn-ghost-hover,rgba(255,255,255,0.08))]"}`}
                                        onClick={() => setActiveFilter(filter)}
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                {type === "style" ? (
                                    <label className="flex cursor-pointer items-center gap-1 text-xs text-[#919191]">
                                        <input type="checkbox" className="size-3 accent-[#07b8dd]" />
                                        仅看可商用
                                    </label>
                                ) : null}
                                <button type="button" className="flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-lg bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] px-2 py-1 text-[13px] text-[#F7F7F7] transition-colors hover:bg-[var(--btn-ghost-hover,rgba(255,255,255,0.08))]">
                                    <span>全部</span>
                                    <ChevronDown className="size-3 text-[#919191]" />
                                </button>
                            </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4">
                            {loading ? (
                                <div className="grid grid-cols-6 gap-x-3 gap-y-4 pb-4">
                                    {Array.from({ length: 12 }).map((_item, index) => (
                                        <div key={index} className="flex flex-col gap-2 rounded-xl p-1">
                                            <div className="animate-pulse rounded-lg bg-white/[0.06]" style={{ aspectRatio: copy.aspectRatio }} />
                                            <div className="h-4 animate-pulse rounded bg-white/[0.06]" />
                                            <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.06]" />
                                        </div>
                                    ))}
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="flex h-full min-h-[320px] items-center justify-center text-[13px] text-[#919191]">{copy.emptyText}</div>
                            ) : (
                                <div className="grid grid-cols-6 gap-x-3 gap-y-4 pb-4">
                                    {filteredItems.map((item) => (
                                        <div key={item.id || item.slug} className="group relative flex w-full cursor-pointer flex-col gap-2 rounded-xl p-1 transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]" onClick={() => useItem(item)}>
                                            <div className="relative flex flex-col items-start justify-between overflow-hidden rounded-lg border border-transparent bg-white/[0.06]" style={{ aspectRatio: copy.aspectRatio }}>
                                                {item.coverImageUrl ? (
                                                    <img alt={item.title} className="absolute inset-0 size-full object-cover transition-opacity duration-200" src={item.coverImageUrl} loading="lazy" decoding="async" />
                                                ) : null}
                                                <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                                                <div className="relative flex w-full items-center justify-between p-2">
                                                    <button type="button" className="flex size-6 items-center justify-center rounded-lg bg-[rgba(31,31,31,0.2)] text-white backdrop-blur-[2px] transition-colors group-hover:bg-black/65" onClick={(event) => event.stopPropagation()}>
                                                        <MoreHorizontal className="size-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label="收藏"
                                                        className={`flex size-6 items-center justify-center rounded-lg bg-black/65 opacity-0 transition-[background-color,opacity] hover:bg-black/80 group-hover:opacity-100 ${item.isFavorited ? "!opacity-100 text-[#ff5d8f]" : "text-white"}`}
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            void toggleFavorite(item)
                                                        }}
                                                    >
                                                        <Heart className={`size-3.5 ${item.isFavorited ? "fill-current" : ""}`} />
                                                    </button>
                                                </div>
                                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                                            </div>
                                            <div className="flex w-full flex-col gap-1 px-1">
                                                <div className="flex w-full items-center gap-2">
                                                    <p className="min-w-0 flex-1 truncate text-[14px] font-medium leading-none text-[#F7F7F7]">{item.title}</p>
                                                    <div className="flex shrink-0 items-center gap-1 text-[#919191]">
                                                        <CommercialIcon className="size-3" />
                                                        <span className="text-[12px]">商用</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex min-w-0 flex-1 items-center gap-1">
                                                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] text-white/70">{normalizeItemAuthor(item).slice(0, 1)}</span>
                                                        <span className="min-w-0 flex-1 truncate text-[12px] text-[#A8A8A8]">{normalizeItemAuthor(item)}</span>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-1 text-[#919191]">
                                                        <MousePointer2 className="size-3" />
                                                        <span className="text-[12px]">{Number(item.usageCount || 0)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!loading && filteredItems.length > 0 && hasMore ? (
                                <div className="py-4 text-center">
                                    <button
                                        type="button"
                                        onClick={() => void loadMore()}
                                        className="rounded-lg border border-[var(--canvas-controls-border,rgba(255,255,255,0.12))] bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] px-4 py-2 text-[12px] text-[#F7F7F7] transition-colors hover:opacity-90"
                                    >
                                        {loadingMore ? "加载中..." : `加载更多 (${Math.max(0, totalCount - items.length)})`}
                                    </button>
                                </div>
                            ) : null}
                            {!loading && filteredItems.length > 0 && !hasMore ? <div className="py-4 text-center text-[12px] text-[#919191]">已加载全部</div> : null}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
