"use client"

import React, { useMemo, useState } from "react"
import { Box, ChevronDown, Component, FileText, FolderOpen, Image as ImageIcon, LocateFixed, Music, Search, Video } from "lucide-react"
import type { LibTvWorkflowNode, LibTvWorkflowNodeKind } from "@/workflow/ideart/lib/libtv/workflow"

function LibTvDrawerLogoIcon({ className = "" }: { className?: string }) {
    return <Component aria-hidden="true" role="img" className={`h-5 w-[26px] ${className}`} strokeWidth={1.8} />
}

function LibTvChevronDownIcon({ className = "" }: { className?: string }) {
    return <ChevronDown aria-hidden="true" role="img" className={className || "size-3"} strokeWidth={2} />
}

function LibTvSearchIcon({ className = "" }: { className?: string }) {
    return <Search aria-hidden="true" role="img" className={className || "size-3.5"} strokeWidth={1.8} />
}

function LibTvLocateIcon({ className = "" }: { className?: string }) {
    return <LocateFixed aria-hidden="true" role="img" className={className || "size-3.5"} strokeWidth={1.8} />
}

function LibTvFolderEmptyIcon() {
    return (
        <span className="flex h-[74px] w-[88px] items-center justify-center rounded-2xl bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]" aria-hidden="true">
            <FolderOpen className="size-11 text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.45))]" strokeWidth={1.5} />
        </span>
    )
}

function LibTvGenericNodeIcon({ kind }: { kind: LibTvWorkflowNodeKind }) {
    const Icon = kind === "image"
        ? ImageIcon
        : kind === "video"
            ? Video
            : kind === "audio"
                ? Music
                : kind === "text" || kind === "script" || kind === "script-v2"
                    ? FileText
                    : Box
    return <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
}

type WorkflowCanvasAssetDrawerTab = "canvas" | "assets"

type WorkflowCanvasAssetItem = {
    id: string
    nodeId: string
    title: string
    kind: LibTvWorkflowNodeKind
    section: WorkflowCanvasAssetSectionId
    statusLabel?: string
    metaLabel?: string
    url?: string
}

type WorkflowCanvasAssetSectionId = "key" | "text" | "image" | "video" | "audio"

const WORKFLOW_CANVAS_ASSET_SECTIONS: Array<{ id: WorkflowCanvasAssetSectionId; label: string }> = [
    { id: "key", label: "关键元素" },
    { id: "text", label: "文本" },
    { id: "image", label: "图片" },
    { id: "video", label: "视频" },
    { id: "audio", label: "音频" },
]

function getWorkflowNodeTitle(node: LibTvWorkflowNode) {
    return String(node.data?.title || node.data?.caption || node.kind || "未命名节点").trim()
}

function workflowCanvasAssetStatus(node: LibTvWorkflowNode, url?: string) {
    const error = String(node.data?.workflowGenerationError || "").trim()
    if (error) return "生成失败"
    if (node.data?.workflowGenerationRunning) return "生成中"
    if (url) return ""
    if (node.data?.mediaRole === "generator" || String(node.data?.componentType || "").includes("generator")) return "待确认后生成"
    return ""
}

function workflowCanvasAssetMeta(node: LibTvWorkflowNode) {
    const parts = [
        String(node.data?.modelId || "").trim(),
        String(node.data?.imageSize || node.data?.videoResolution || "").trim(),
        String(node.data?.videoDuration || "").trim(),
    ].filter(Boolean)
    return parts.slice(0, 3).join(" · ")
}

function workflowCanvasAssetSection(node: LibTvWorkflowNode): WorkflowCanvasAssetSectionId | null {
    if (node.kind === "audio") return "audio"
    if (node.kind === "video") return "video"
    if (node.kind === "text" || node.kind === "script" || node.kind === "script-v2") return "text"
    if (node.kind !== "image") return null
    const assetKind = String(
        node.data?.workflowScriptV2AssetKind
        || node.data?.mediaRole
        || "",
    ).trim()
    const title = getWorkflowNodeTitle(node)
    if (/角色|人物|主角|配角|场景|道具|产品|包装|logo|Logo|锚点|关键元素/.test(`${assetKind} ${title}`)) return "key"
    return "image"
}

function workflowCanvasAssetUrl(node: LibTvWorkflowNode) {
    return String(node.data?.mediaUrl || node.data?.thumbnailUrl || "").trim()
}

function isWorkflowCanvasAssetNode(node: LibTvWorkflowNode) {
    return Boolean(workflowCanvasAssetSection(node))
}

function collectWorkflowCanvasAssets(nodes: LibTvWorkflowNode[]): WorkflowCanvasAssetItem[] {
    const items: WorkflowCanvasAssetItem[] = []
    nodes.forEach((node) => {
        if (node.kind === "group") return
        const title = getWorkflowNodeTitle(node)
        const mediaUrl = workflowCanvasAssetUrl(node)
        const section = workflowCanvasAssetSection(node)
        if (section && isWorkflowCanvasAssetNode(node)) {
            items.push({
                id: `${node.id}:asset`,
                nodeId: node.id,
                title,
                kind: node.kind,
                section,
                statusLabel: workflowCanvasAssetStatus(node, mediaUrl),
                metaLabel: workflowCanvasAssetMeta(node),
                url: mediaUrl || undefined,
            })
        }
        if (mediaUrl) {
            return
        }
        const refs = Array.isArray(node.data?.referenceImages) ? node.data.referenceImages : []
        refs.forEach((url, index) => {
            const safeUrl = String(url || "").trim()
            if (safeUrl) items.push({
                id: `${node.id}:ref:${index}`,
                nodeId: node.id,
                title: `${title} 参考图 ${index + 1}`,
                kind: "image",
                section: "image",
                statusLabel: "",
                metaLabel: "参考图",
                url: safeUrl,
            })
        })
    })
    return items
}

export function WorkflowCanvasAssetDrawer({
    open,
    projectName,
    nodes,
    defaultTab = "assets",
    onClose,
    onLocateNode,
}: {
    open: boolean
    projectName: string
    nodes: LibTvWorkflowNode[]
    defaultTab?: WorkflowCanvasAssetDrawerTab
    onClose: () => void
    onLocateNode: (nodeId: string) => void
}) {
    const [activeTab, setActiveTab] = useState<WorkflowCanvasAssetDrawerTab>(defaultTab)
    const [search, setSearch] = useState("")
    const assets = useMemo(() => collectWorkflowCanvasAssets(nodes), [nodes])
    const normalizedSearch = search.trim().toLowerCase()
    const visibleNodes = useMemo(() => nodes.filter((node) => {
        if (!normalizedSearch) return true
        return getWorkflowNodeTitle(node).toLowerCase().includes(normalizedSearch)
    }), [nodes, normalizedSearch])
    const visibleAssets = useMemo(() => assets.filter((asset) => {
        if (!normalizedSearch) return true
        return asset.title.toLowerCase().includes(normalizedSearch)
    }), [assets, normalizedSearch])

    if (!open) return null

    return (
        <section
            className="fixed bottom-0 left-0 top-0 z-[260] w-[336px] overflow-hidden border-r border-[var(--border-muted,rgba(255,255,255,0.08))] bg-[var(--Surface-Panel-background,var(--canvas-bg,#141414))] text-[var(--canvas-controls-text,rgba(255,255,255,0.88))] shadow-none backdrop-blur-[32px]"
            role="dialog"
            aria-modal="true"
            aria-label="画布资产管理"
        >
            <div className="relative flex h-full min-h-0 flex-col">
                <div className="shrink-0 px-2 pb-1 pt-4">
                    <div className="flex items-center gap-0.5">
                        <button type="button" className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]" aria-label="项目菜单">
                            <LibTvDrawerLogoIcon className="text-[var(--canvas-controls-text)]" />
                            <LibTvChevronDownIcon className="text-[var(--canvas-controls-icon,rgba(255,255,255,0.68))]" />
                        </button>
                    </div>
                    <div className="mb-2 mt-1 flex min-w-0 items-center gap-0.5 px-1">
                        <input
                            readOnly
                            value={projectName || "未命名项目"}
                            className="min-w-0 shrink cursor-text truncate rounded-lg border-0 bg-transparent py-0 text-[13px] font-normal leading-normal outline-none"
                            style={{ color: "var(--canvas-controls-text)", fieldSizing: "content" as React.CSSProperties["fieldSizing"] }}
                            aria-label="项目名称"
                        />
                        <div className="mx-0.5 h-[14px] w-px shrink-0" style={{ backgroundColor: "var(--canvas-controls-border)" }} aria-hidden="true" />
                        <button type="button" className="flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]" onClick={() => undefined}>
                            <span className="min-w-0 max-w-[120px] truncate text-[13px] font-normal">{projectName || "画布 1"}</span>
                            <LibTvChevronDownIcon className="text-[var(--canvas-controls-icon,rgba(255,255,255,0.68))]" />
                        </button>
                    </div>
                </div>
                <div className="flex h-[50px] shrink-0 items-center justify-between border-y border-[var(--border-muted,rgba(255,255,255,0.08))] px-2">
                    <div className="flex items-center gap-2">
                        {(["canvas", "assets"] as const).map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                className={`rounded-lg px-2 py-1 text-[14px] transition-colors ${activeTab === tab ? "bg-[var(--canvas-controls-active,rgba(255,255,255,0.12))] font-medium text-[var(--canvas-controls-text)]" : "text-[var(--canvas-controls-text)]/90 hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]"}`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab === "canvas" ? "画布" : "资产"}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]" aria-label="收起资产管理" onClick={onClose}>
                        <LibTvLocateIcon className="rotate-180 text-[var(--canvas-controls-icon,rgba(255,255,255,0.68))]" />
                    </button>
                </div>
                <div className="flex shrink-0 flex-col gap-2 px-2 py-3 backdrop-blur-[20px]">
                    <div className="flex h-10 items-center gap-2 rounded-xl border border-[var(--canvas-controls-focus,#0690ae)] bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))] px-3">
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="请输入搜索内容"
                            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.45))]"
                            style={{ color: "var(--canvas-controls-text)" }}
                        />
                        <LibTvSearchIcon className="shrink-0 text-[var(--canvas-controls-icon,rgba(255,255,255,0.68))]" />
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    {activeTab === "canvas" ? (
                        <WorkflowCanvasNodeList nodes={visibleNodes} onLocateNode={onLocateNode} />
                    ) : (
                        <WorkflowCanvasAssetList assets={visibleAssets} onLocateNode={onLocateNode} />
                    )}
                </div>
                <div className="flex shrink-0 items-center justify-between border-t border-[var(--border-muted,rgba(255,255,255,0.08))] px-3 pb-3 pt-2">
                    <button type="button" className="flex size-8 items-center justify-center rounded-lg bg-transparent transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]" aria-label="收起节点侧栏" onClick={onClose}>
                        <span className="text-[18px] leading-none text-[var(--canvas-controls-icon,rgba(255,255,255,0.68))]">‹</span>
                    </button>
                    <span className="text-xs" style={{ color: "var(--canvas-controls-text-muted, rgba(255,255,255,0.5))" }}>共 {nodes.length} 节点</span>
                </div>
            </div>
        </section>
    )
}

function WorkflowCanvasNodeList({ nodes, onLocateNode }: { nodes: LibTvWorkflowNode[]; onLocateNode: (nodeId: string) => void }) {
    if (nodes.length === 0) {
        return <WorkflowCanvasAssetEmpty label="暂无画布元素" />
    }
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex min-h-7 items-center pl-2 text-[13px] font-medium text-[var(--color-neutral-500,rgba(255,255,255,0.48))]">画布元素</div>
            {nodes.map((node) => (
                <WorkflowCanvasRow
                    key={node.id}
                    title={getWorkflowNodeTitle(node)}
                    kind={node.kind}
                    previewUrl={node.data?.mediaUrl || node.data?.thumbnailUrl}
                    onLocate={() => onLocateNode(node.id)}
                />
            ))}
        </div>
    )
}

function WorkflowCanvasAssetList({ assets, onLocateNode }: { assets: WorkflowCanvasAssetItem[]; onLocateNode: (nodeId: string) => void }) {
    if (assets.length === 0) {
        return <WorkflowCanvasAssetEmpty label="暂无资产" />
    }
    return (
        <div className="flex flex-col gap-3">
            {WORKFLOW_CANVAS_ASSET_SECTIONS.map((section) => {
                const sectionAssets = assets.filter((asset) => asset.section === section.id)
                if (sectionAssets.length === 0) return null
                return (
                    <section key={section.id} className="flex flex-col gap-0.5" aria-label={section.label}>
                        <div className="flex min-h-7 items-center pl-2 text-[13px] font-medium text-[var(--color-neutral-500,rgba(255,255,255,0.48))]">{section.label}</div>
                        {sectionAssets.map((asset) => (
                            <WorkflowCanvasRow
                                key={asset.id}
                                title={asset.title}
                                kind={asset.kind}
                                previewUrl={asset.url}
                                statusLabel={asset.statusLabel}
                                metaLabel={asset.metaLabel}
                                onLocate={() => onLocateNode(asset.nodeId)}
                            />
                        ))}
                    </section>
                )
            })}
        </div>
    )
}

function WorkflowCanvasAssetEmpty({ label }: { label: string }) {
    return (
        <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-4 text-[var(--canvas-controls-text,rgba(255,255,255,0.82))]">
            <LibTvFolderEmptyIcon />
            <div className="text-[14px]">{label}</div>
        </div>
    )
}

function WorkflowCanvasRow({
    title,
    kind,
    previewUrl,
    statusLabel,
    metaLabel,
    onLocate,
}: {
    title: string
    kind: LibTvWorkflowNodeKind
    previewUrl?: string
    statusLabel?: string
    metaLabel?: string
    onLocate: () => void
}) {
    const subtitle = statusLabel || metaLabel || ""
    return (
        <div className="group/node relative flex h-10 w-full items-center gap-0.5 rounded-lg py-1 pl-0 pr-2 text-[13px] transition-colors hover:bg-[var(--canvas-controls-hover,rgba(255,255,255,0.08))]">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-0.5 rounded-lg py-0 pl-0 pr-0 text-left text-[13px] transition-colors hover:bg-transparent focus-visible:outline-none" title={title} aria-label={`定位到节点 ${title}`} onClick={onLocate}>
                <span className="w-3 shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--color-neutral-700,rgba(255,255,255,0.16))] text-[var(--figma-text-secondary,rgba(255,255,255,0.55))]">
                        {previewUrl ? <img src={previewUrl} alt="" className="size-full object-cover" /> : <LibTvGenericNodeIcon kind={kind} />}
                    </span>
                    <span className="min-w-0 flex-1 text-[var(--canvas-controls-text)]">
                        <span className="block truncate leading-normal">{title}</span>
                        {subtitle ? <span className="block truncate text-[11px] leading-normal text-[var(--canvas-controls-text-muted,rgba(255,255,255,0.45))]">{subtitle}</span> : null}
                    </span>
                </span>
            </button>
            <button type="button" aria-label={`定位到节点 ${title}`} className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--fg-muted,rgba(255,255,255,0.45))] opacity-0 transition-opacity hover:bg-[var(--canvas-controls-active,rgba(255,255,255,0.12))] hover:text-[var(--canvas-controls-text)] group-hover/node:opacity-100" onClick={onLocate}>
                <LibTvLocateIcon />
            </button>
        </div>
    )
}
