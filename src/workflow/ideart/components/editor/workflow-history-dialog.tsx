"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { message } from "@/workflow/ideart/shims/antd"
import { ArrowUpDown, ListChecks, Minus, Music, Plus, Trash2, X } from "lucide-react"
import { ColorfulLoader } from "@/workflow/ideart/components/ui/colorful-loader"
import { sortGeneratedFilesForDisplay } from "@/workflow/ideart/lib/generated-file-order"

export type WorkflowHistoryFileType = "image" | "video" | "audio"

export type WorkflowHistoryFile = {
    id: string
    fileType: WorkflowHistoryFileType | string
    fileUrl: string
    fileName?: string | null
    fileSize?: number | null
    width?: number | null
    height?: number | null
    duration?: number | null
    thumbnail?: string | null
    prompt?: string | null
    model?: string | null
    agent?: string | null
    metadata?: Record<string, unknown> | null
    createdAt?: string | Date | null
}

function formatWorkflowHistoryDate(input?: string | Date | null) {
    if (!input) return "未知日期"
    const date = input instanceof Date ? input : new Date(String(input))
    if (Number.isNaN(date.getTime())) return "未知日期"
    return date.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).replace(/\//g, "-")
}

function resolveWorkflowHistoryPreview(file: WorkflowHistoryFile) {
    const thumbnail = String(file.thumbnail || "").trim()
    const fileUrl = String(file.fileUrl || "").trim()
    return thumbnail || fileUrl
}

function groupWorkflowHistoryByDate(files: WorkflowHistoryFile[]) {
    const groups = new Map<string, WorkflowHistoryFile[]>()
    files.forEach((file) => {
        const key = formatWorkflowHistoryDate(file.createdAt)
        const current = groups.get(key) || []
        current.push(file)
        groups.set(key, current)
    })
    return Array.from(groups.entries()).map(([date, items]) => ({ date, items }))
}

export function WorkflowHistoryDialog({
    open,
    projectId: _projectId,
    canvasId: _canvasId,
    onClose,
    onUseFile,
}: {
    open: boolean
    projectId: string | null | undefined
    canvasId?: string | null
    onClose: () => void
    onUseFile: (file: WorkflowHistoryFile) => void
}) {
    const [files, setFiles] = useState<WorkflowHistoryFile[]>([])
    const [activeTab, setActiveTab] = useState<WorkflowHistoryFileType>("image")
    const [loading, setLoading] = useState(false)
    const [zoom, setZoom] = useState(1)
    const [newestFirst, setNewestFirst] = useState(true)

    const loadFiles = useCallback(async () => {
        if (!open) return
        setLoading(true)
        try {
            const response = await fetch("/api/files?limit=500", {
                cache: "no-store",
                credentials: "include",
            })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error || "历史记录加载失败")
            setFiles(Array.isArray(data) ? sortGeneratedFilesForDisplay(data) : [])
        } catch (error) {
            setFiles([])
            message.error(error instanceof Error ? error.message : "历史记录加载失败")
        } finally {
            setLoading(false)
        }
    }, [open])

    useEffect(() => {
        void loadFiles()
    }, [loadFiles])

    const counts = useMemo(() => ({
        image: files.filter((file) => String(file.fileType || "").toLowerCase() === "image").length,
        video: files.filter((file) => String(file.fileType || "").toLowerCase() === "video").length,
        audio: files.filter((file) => String(file.fileType || "").toLowerCase() === "audio").length,
    }), [files])

    const visibleFiles = useMemo(() => {
        const filtered = files.filter((file) => String(file.fileType || "").toLowerCase() === activeTab)
        return [...filtered].sort((a, b) => {
            const aTime = new Date(String(a.createdAt || "")).getTime() || 0
            const bTime = new Date(String(b.createdAt || "")).getTime() || 0
            return newestFirst ? bTime - aTime : aTime - bTime
        })
    }, [activeTab, files, newestFirst])

    const groupedFiles = useMemo(() => groupWorkflowHistoryByDate(visibleFiles), [visibleFiles])
    const tileSize = Math.round(144 * zoom)
    const zoomLabel = `${Math.round(zoom * 100)}%`

    const deleteFile = useCallback(async (file: WorkflowHistoryFile) => {
        const fileId = String(file.id || "").trim()
        if (!fileId) return
        try {
            const response = await fetch(`/api/files?fileId=${encodeURIComponent(fileId)}`, {
                method: "DELETE",
                credentials: "include",
            })
            const data = await response.json().catch(() => null)
            if (!response.ok) throw new Error(data?.error || "删除失败")
            setFiles((current) => current.filter((item) => item.id !== fileId))
            message.success("已删除")
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除失败")
        }
    }, [])

    const tabs: Array<{ key: WorkflowHistoryFileType; label: string; count: number }> = [
        { key: "image", label: "图片历史", count: counts.image },
        { key: "video", label: "视频历史", count: counts.video },
        { key: "audio", label: "音频历史", count: counts.audio },
    ]

    if (!open) return null

    return (
        <div className="pointer-events-none fixed inset-0 z-[2147483300] flex items-center justify-center">
            <div className="pointer-events-auto absolute inset-0 bg-black/42 backdrop-blur-[3px]" onClick={onClose} />
            <div
                className="pointer-events-auto relative flex h-[calc(100vh-160px)] w-[min(90vw,1600px)] max-w-[min(90vw,1600px)] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#262626] text-white shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-6">
                        <span className="text-base font-medium text-white">历史资产</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-[#171717]">
                            <button
                                type="button"
                                className="flex size-7 cursor-pointer items-center justify-center rounded text-white transition-colors disabled:cursor-default disabled:opacity-30"
                                disabled={zoom <= 0.76}
                                onClick={() => setZoom((current) => Math.max(0.75, Number((current - 0.1).toFixed(2))))}
                            >
                                <Minus className="size-3" />
                            </button>
                            <span className="w-10 text-center text-[13px] text-white">{zoomLabel}</span>
                            <button
                                type="button"
                                className="flex size-7 cursor-pointer items-center justify-center rounded text-white transition-colors disabled:cursor-default disabled:opacity-30"
                                disabled={zoom >= 1.34}
                                onClick={() => setZoom((current) => Math.min(1.35, Number((current + 0.1).toFixed(2))))}
                            >
                                <Plus className="size-3" />
                            </button>
                        </div>
                        <button type="button" className="flex size-7 cursor-pointer items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white" onClick={onClose}>
                            <X className="size-5" />
                        </button>
                    </div>
                </div>
                <div className="h-px shrink-0 bg-white/[0.08]" />
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 p-4 pb-0">
                    <div className="flex items-center gap-6">
                        {tabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                className={`flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-[13px] transition-colors ${activeTab === tab.key ? "font-medium text-white opacity-100" : "text-white opacity-40 hover:opacity-60"}`}
                                onClick={() => setActiveTab(tab.key)}
                            >
                                {tab.label}({tab.count})
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border-none bg-transparent px-2 text-[13px] text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white"
                            title={newestFirst ? "当前：最新优先" : "当前：最旧优先"}
                            onClick={() => setNewestFirst((current) => !current)}
                        >
                            <ArrowUpDown className="size-3.5" />
                            {newestFirst ? "时间降序" : "时间升序"}
                        </button>
                        <div className="h-4 w-px bg-white/[0.08]" />
                        <button type="button" className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border-none bg-transparent px-2 text-[13px] text-white/80 transition-colors hover:bg-white/[0.08] hover:text-white">
                            <ListChecks className="size-3.5" />
                            批量操作
                        </button>
                    </div>
                </div>
                <div className="tiny-scrollbar flex-1 overflow-y-auto px-5 py-4">
                    {loading ? (
                        <div className="flex h-full items-center justify-center text-sm text-white/50">
                            <ColorfulLoader className="mr-2 size-4" thickness={2} />
                            加载历史记录...
                        </div>
                    ) : groupedFiles.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-white/42">暂无{tabs.find((tab) => tab.key === activeTab)?.label}</div>
                    ) : (
                        groupedFiles.map((group) => (
                            <div key={group.date} className="mb-6">
                                <div className="mb-3 flex items-center gap-2">
                                    <h4 className="mb-0 text-sm font-medium text-white">{group.date}</h4>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    {group.items.map((file) => {
                                        const preview = resolveWorkflowHistoryPreview(file)
                                        const name = String(file.fileName || file.prompt || file.id || "").trim()
                                        return (
                                            <div key={file.id} className="group cursor-pointer" style={{ width: tileSize }}>
                                                <div
                                                    className="relative box-border overflow-hidden rounded-lg border border-white/[0.05] bg-white/[0.06]"
                                                    style={{ width: tileSize, height: tileSize }}
                                                    onDoubleClick={() => onUseFile(file)}
                                                    title={name}
                                                >
                                                    {activeTab === "video" && preview ? (
                                                        <video src={preview} className="absolute inset-0 size-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-105" muted playsInline preload="metadata" />
                                                    ) : activeTab === "audio" ? (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-[#1f1f1f] text-white/60">
                                                            <Music className="size-8 text-white/35" />
                                                            <span className="max-w-[80%] truncate text-xs">{name || "音频"}</span>
                                                        </div>
                                                    ) : preview ? (
                                                        <img src={preview} alt={name || "历史记录"} className="absolute inset-0 size-full rounded-lg object-cover transition-transform duration-200 group-hover:scale-105" />
                                                    ) : (
                                                        <div className="absolute inset-0 flex items-center justify-center rounded-lg text-xs text-white/40">{activeTab}</div>
                                                    )}
                                                    <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-black/65 opacity-0 backdrop-blur-[2px] transition-opacity duration-150 group-hover:opacity-100">
                                                        <button
                                                            type="button"
                                                            className="absolute right-1.5 top-1.5 z-10 flex size-6 cursor-pointer items-center justify-center rounded-md border-none bg-black/50 text-white/70 transition-colors hover:bg-black/70 hover:text-white"
                                                            onClick={(event) => {
                                                                event.stopPropagation()
                                                                void deleteFile(file)
                                                            }}
                                                        >
                                                            <Trash2 className="size-3" />
                                                        </button>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                className="flex h-7 cursor-pointer items-center justify-center rounded-lg border-none px-1.5 text-[13px] text-white transition-colors hover:text-white/80"
                                                                onClick={(event) => {
                                                                    event.stopPropagation()
                                                                    window.open(file.fileUrl, "_blank", "noopener,noreferrer")
                                                                }}
                                                            >
                                                                查看
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="flex h-7 cursor-pointer items-center justify-center rounded-lg border-none px-1.5 text-[13px] text-white transition-colors hover:text-white/80"
                                                                onClick={(event) => {
                                                                    event.stopPropagation()
                                                                    onUseFile(file)
                                                                }}
                                                            >
                                                                使用
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}
