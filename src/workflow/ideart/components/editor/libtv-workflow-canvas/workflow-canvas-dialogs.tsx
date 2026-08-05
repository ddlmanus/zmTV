"use client"

import { useEffect, useState } from "react"
import { message } from "@/workflow/ideart/shims/antd"
import { Check, ChevronRight, Heart, Info, Volume2, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { uploadCanvasNodeFile } from "../libtv-upload-utils"
import {
    WorkflowSelect,
    WorkflowSelectContent,
    WorkflowSelectItem,
    WorkflowSelectTrigger,
    WorkflowSelectValue,
} from "../workflow-select"
import { PlaylistIcon, ThreeDWorldIcon } from "./workflow-canvas-controls"

type WorkflowNotificationArticle = {
    id: string
    title: string
    excerpt: string
    content?: string
    publishedAt: string | null
}

function formatWorkflowNotificationDate(input?: string | null) {
    if (!input) return "-"
    const date = new Date(input)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).replace(/\//g, "-")
}

export function WorkflowNotificationDialog({
    open,
    onClose,
}: {
    open: boolean
    onClose: () => void
}) {
    const [articles, setArticles] = useState<WorkflowNotificationArticle[]>([])
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) return
        setArticles([])
        setLoading(false)
    }, [open])

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
            <DialogContent
                overlayClassName="backdrop-blur-[6px] !bg-black/58"
                closeClassName="right-6 top-[22px] text-white/48 hover:bg-white/10 hover:text-white"
                className="!left-1/2 !top-1/2 !block h-[609px] w-[min(92vw,800px)] max-w-none !translate-x-[-50%] !translate-y-[-50%] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1c1c1c] p-0 text-white shadow-[0_4px_24px_rgba(0,0,0,0.45)]"
            >
                <DialogTitle className="flex h-[60px] items-center border-b border-white/[0.08] px-6 text-[16px] font-semibold leading-none text-white">通知</DialogTitle>
                <DialogDescription className="sr-only">官方通知和收到的喜欢</DialogDescription>
                <div className="flex h-[calc(100%-60px)]">
                    <div className="flex w-[200px] shrink-0 flex-col justify-between bg-[#1c1c1c] p-4 text-sm text-white">
                        <div className="flex flex-col gap-4">
                            <button type="button" className="flex w-full items-center gap-2 rounded-lg bg-[#333333] px-4 py-2 text-left text-white">
                                <Volume2 className="size-3" />
                                <span>官方通知</span>
                            </button>
                            <button type="button" className="flex w-full cursor-default items-center gap-2 rounded-lg px-4 py-2 text-left text-white/70">
                                <Heart className="size-3" />
                                <span>收到的喜欢</span>
                            </button>
                        </div>
                        <button type="button" className="flex cursor-pointer items-center gap-2 text-xs text-[#888888] transition-colors hover:text-[#bbbbbb]">
                            <Check className="size-3" />
                            <span>一键已读</span>
                        </button>
                    </div>
                    <div className="h-full flex-1 overflow-hidden bg-[#141414]">
                        <div className="tiny-scrollbar flex h-full flex-col gap-2 overflow-y-auto px-4 py-4">
                            {loading ? (
                                <div className="rounded-lg border border-white/[0.06] bg-[#2a2a2a] p-4 text-xs text-white/52">加载中...</div>
                            ) : articles.length > 0 ? articles.map((article) => {
                                const expanded = expandedId === article.id
                                const body = String(article.content || article.excerpt || "").trim()
                                return (
                                    <article key={article.id} className="flex flex-col gap-2 rounded-lg border border-white/[0.06] bg-[#2a2a2a] p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0 truncate text-xs font-semibold text-white">
                                                {article.title}
                                            </div>
                                            <button
                                                type="button"
                                                className="flex shrink-0 cursor-pointer items-center gap-1 text-xs font-normal text-[#888888] transition-colors hover:text-white"
                                                onClick={() => setExpandedId((current) => current === article.id ? null : article.id)}
                                            >
                                                <span>{expanded ? "收起" : "展开"}</span>
                                                <ChevronRight className={`size-3 transition-transform ${expanded ? "-rotate-90" : "rotate-90"}`} />
                                            </button>
                                        </div>
                                        <div className="text-xs text-[#666666]">{formatWorkflowNotificationDate(article.publishedAt)}</div>
                                        {expanded && body ? (
                                            <div className="mt-2 whitespace-pre-wrap border-t border-white/[0.08] pt-3 text-sm leading-7 text-white/62">
                                                {body}
                                            </div>
                                        ) : null}
                                    </article>
                                )
                            }) : (
                                <div className="rounded-lg border border-white/[0.06] bg-[#2a2a2a] p-4 text-xs text-white/52">暂无官方通知</div>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export function WorkflowPublishDialog({
    open,
    projectName,
    publicUrl,
    publishing,
    onClose,
    onPublish,
}: {
    open: boolean
    projectName: string
    publicUrl: string
    publishing: boolean
    onClose: () => void
    onPublish: (payload: {
        title: string
        description: string
        coverUrl: string
        videoUrl: string
        socialUrl: string
        activityTag: string
        contestTrack: string
        publicCanvas: boolean
    }) => void
}) {
    const [title, setTitle] = useState(projectName || "未命名")
    const [description, setDescription] = useState("")
    const [coverUrl, setCoverUrl] = useState("")
    const [videoUrl, setVideoUrl] = useState("")
    const [coverName, setCoverName] = useState("")
    const [videoName, setVideoName] = useState("")
    const [uploadingSlot, setUploadingSlot] = useState<"video" | "cover" | null>(null)
    const [socialUrl, setSocialUrl] = useState("")
    const [activityTag, setActivityTag] = useState("不参与")
    const [contestTrack, setContestTrack] = useState("")
    const [publicCanvas, setPublicCanvas] = useState(true)

    useEffect(() => {
        if (!open) return
        setTitle(projectName || "未命名")
    }, [open, projectName])

    const uploadPublishFile = async (file: File, slot: "video" | "cover") => {
        setUploadingSlot(slot)
        try {
            const { publicUrl, libtvUrl } = await uploadCanvasNodeFile(file)
            const uploadedUrl = libtvUrl || publicUrl
            if (slot === "video") {
                setVideoUrl(uploadedUrl)
                setVideoName(file.name)
            } else {
                setCoverUrl(uploadedUrl)
                setCoverName(file.name)
            }
            message.success(slot === "video" ? "视频已上传" : "封面已上传")
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败")
        } finally {
            setUploadingSlot(null)
        }
    }

    const copyPublicUrl = async () => {
        const absoluteUrl = publicUrl.startsWith("http")
            ? publicUrl
            : `${window.location.origin}${publicUrl}`
        try {
            await navigator.clipboard.writeText(absoluteUrl)
            message.success("公开链接已复制")
        } catch {
            window.prompt("复制公开链接", absoluteUrl)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
            <DialogContent
                overlayClassName="backdrop-blur-[5px] !bg-black/52"
                closeClassName="right-4 top-4 z-[2] rounded-full text-white/80 hover:bg-black/35 hover:text-white"
                className="!left-1/2 !top-1/2 !block max-h-[min(90dvh,880px)] w-[min(92vw,503px)] max-w-none !translate-x-[-50%] !translate-y-[-50%] overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#242424] p-0 text-white shadow-[0_24px_70px_rgba(0,0,0,0.42)]"
            >
                <DialogTitle className="sr-only">发布作品到 Lovarts</DialogTitle>
                <DialogDescription className="sr-only">发布作品并公开画布，允许其他用户复制整个工作流项目。</DialogDescription>
                <div className="tiny-scrollbar max-h-[min(90dvh,880px)] overflow-y-auto p-4">
                    <div
                        className="absolute left-0 top-0 -z-0 h-[214px] w-full bg-cover bg-center bg-no-repeat"
                        style={{
                            backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.25) 70%, #242424 100%), url('/images/libtv/dialog-hero-bg.png')",
                        }}
                    />
                    <div className="relative z-[1] flex flex-col gap-4">
                        <div className="mt-3 flex max-w-[420px] flex-col gap-2">
                            <p className="text-[16px] font-medium text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]">发布作品到 Lovarts</p>
                            <p className="text-[14px] leading-normal text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]">
                                作品将展示到 Lovarts Show；公开画布后，其他用户可以复制整个项目到自己的工作区继续使用。
                            </p>
                        </div>

                        <div className="mt-6 flex gap-3">
                            <label className="relative flex-1 cursor-pointer">
                                <input
                                    type="file"
                                    accept="video/*"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0]
                                        event.target.value = ""
                                        if (file) void uploadPublishFile(file, "video")
                                    }}
                                />
                                <div className="relative flex h-[120px] flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-white/10 text-center text-sm text-white/65 transition-colors hover:bg-white/15">
                                    {videoUrl ? (
                                        <>
                                            <video src={videoUrl} className="absolute inset-0 h-full w-full object-cover opacity-65" muted playsInline />
                                            <div className="absolute inset-0 bg-black/35" />
                                            <span className="relative z-[1] max-w-[82%] truncate text-white">{videoName || "已选择视频"}</span>
                                            <span className="relative z-[1] text-xs text-white/60">点击更换视频</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-[24px] text-white/85">+</span>
                                            <span>{uploadingSlot === "video" ? "上传中..." : "选择视频"}</span>
                                        </>
                                    )}
                                </div>
                            </label>
                            <label className="relative flex-1 cursor-pointer">
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(event) => {
                                        const file = event.target.files?.[0]
                                        event.target.value = ""
                                        if (file) void uploadPublishFile(file, "cover")
                                    }}
                                />
                                <div className="relative flex h-[120px] flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-white/10 text-center text-sm text-white/65 transition-colors hover:bg-white/15">
                                    {coverUrl ? (
                                        <>
                                            <img src={coverUrl} alt="封面预览" className="absolute inset-0 h-full w-full object-cover" />
                                            <div className="absolute inset-0 bg-black/25" />
                                            <span className="relative z-[1] max-w-[82%] truncate text-white">{coverName || "已选择封面"}</span>
                                            <span className="relative z-[1] text-xs text-white/60">点击更换封面</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-[24px] text-white/85">+</span>
                                            <span>{uploadingSlot === "cover" ? "上传中..." : "选择封面"}</span>
                                            <span className="text-xs text-white/35">建议上传横版图片</span>
                                        </>
                                    )}
                                </div>
                            </label>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-white">作品名称 <span className="text-red-500">*</span></label>
                            <input
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                maxLength={120}
                                placeholder="请输入作品名称"
                                className="h-10 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#478EFF]"
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-white">作品描述</label>
                            <textarea
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                maxLength={500}
                                placeholder="请输入作品描述"
                                className="h-[79px] w-full resize-none rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#478EFF]"
                            />
                        </div>
                        <div className="flex gap-3">
                            <div className="flex flex-1 flex-col gap-2">
                                <label className="text-sm font-medium text-white">活动标签</label>
                                <WorkflowSelect
                                    value={activityTag}
                                    onValueChange={setActivityTag}
                                >
                                    <WorkflowSelectTrigger className="w-full border-white/10 focus:border-[#478EFF]" aria-label="活动标签">
                                        <WorkflowSelectValue />
                                    </WorkflowSelectTrigger>
                                    <WorkflowSelectContent>
                                        <WorkflowSelectItem value="不参与">不参与</WorkflowSelectItem>
                                        <WorkflowSelectItem value="Lovarts Show">Lovarts Show</WorkflowSelectItem>
                                    </WorkflowSelectContent>
                                </WorkflowSelect>
                            </div>
                            <div className="flex flex-1 flex-col gap-2">
                                <label className="text-sm font-medium text-white">参赛赛道</label>
                                <input
                                    value={contestTrack}
                                    onChange={(event) => setContestTrack(event.target.value)}
                                    placeholder="请选择参赛单元"
                                    className="h-8 rounded-lg border border-white/10 bg-transparent px-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-[#478EFF]"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-white">社媒链接 <Info className="size-3 text-white/55" /></label>
                            <input
                                value={socialUrl}
                                onChange={(event) => setSocialUrl(event.target.value)}
                                placeholder="请添加您在社媒发布该作品的链接"
                                className="h-10 w-full rounded-lg border border-white/10 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#478EFF]"
                            />
                        </div>

                        {publicUrl ? (
                            <div className="rounded-lg border border-[#478EFF]/35 bg-[#478EFF]/10 p-3">
                                <div className="text-xs font-medium text-white">公开画布链接</div>
                                <div className="mt-2 flex gap-2">
                                    <input readOnly value={publicUrl} className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white/70 outline-none" />
                                    <button type="button" onClick={copyPublicUrl} className="h-8 rounded-md bg-[#478EFF] px-3 text-xs text-white hover:bg-[#2563EB]">复制</button>
                                </div>
                            </div>
                        ) : null}

                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-[13px] text-white">
                                <span>公开画布</span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={publicCanvas}
                                    onClick={() => setPublicCanvas((value) => !value)}
                                    className={`relative h-[18px] w-[34px] overflow-hidden rounded-full p-0 transition-colors ${publicCanvas ? "bg-[#478EFF]" : "bg-white/20"}`}
                                >
                                    <span className={`absolute top-[2px] size-[14px] rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-[left] ${publicCanvas ? "left-[18px]" : "left-[2px]"}`} />
                                </button>
                            </label>
                            <button
                                type="button"
                                disabled={!title.trim() || publishing}
                                onClick={() => onPublish({ title, description, coverUrl, videoUrl, socialUrl, activityTag, contestTrack, publicCanvas })}
                                className="cursor-pointer rounded-lg bg-[#478EFF] px-3 py-2 text-[13px] text-white transition-colors hover:bg-[#2563EB] disabled:cursor-not-allowed disabled:opacity-55"
                            >
                                {publishing ? "发布中..." : "发布并投稿"}
                            </button>
                        </div>
                        <label className="-mt-1 flex cursor-pointer items-center gap-1 text-[10px] text-white/60">
                            <input type="checkbox" checked readOnly className="size-3 accent-[#888]" />
                            <span>点击发布即代表同意《Lovarts 创作许可服务协议》</span>
                        </label>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export type PendingPlaylistCreation = {
    patch?: { title?: string; note?: string; x?: number; y?: number; linkFromNodeId?: string | null; linkToNodeId?: string | null }
} | null

export type PendingThreeDCreation = PendingPlaylistCreation

export function PlaylistIntroDialog({
    open,
    dontShowAgain,
    onDontShowAgainChange,
    onClose,
    onContinue,
}: {
    open: boolean
    dontShowAgain: boolean
    onDontShowAgainChange: (checked: boolean) => void
    onClose: () => void
    onContinue: () => void
}) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30" role="presentation" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="playlist-dialog-title"
                className="w-[564px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[20px] border border-white/10 bg-[#2f2f2f] text-white shadow-[0_14px_32px_rgba(0,0,0,0.32)]"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="flex shrink-0 items-center gap-2 px-4 py-3">
                    <span className="flex shrink-0 text-white/90"><PlaylistIcon className="size-4" /></span>
                    <h2 id="playlist-dialog-title" className="min-w-0 flex-1 truncate text-base font-semibold leading-6 text-white/90">播放列表</h2>
                    <button type="button" className="shrink-0 text-white/52 transition-colors hover:text-white/88" aria-label="关闭" onClick={onClose}>
                        <X className="size-4" />
                    </button>
                </div>
                <div className="max-h-[calc(100vh-10rem)] min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <div className="flex flex-col gap-2 pb-1">
                        <div className="px-4 pb-0">
                            <div className="rounded-[16px] bg-[#1f1f1f] p-6" role="note">
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-semibold leading-5 text-[#d36a6a]">协作提示</p>
                                    <p className="text-sm leading-5 text-white/55">多人同时在同一条播放列表上操作时，时间线编辑可能互相覆盖，导致进度或改动丢失。请避免多人同时编辑同一播放列表。</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-4 pb-0">
                            <div className="rounded-[16px] bg-[#1f1f1f] p-6">
                                <p className="mb-4 text-sm font-semibold leading-5 text-white/90">使用方法</p>
                                <div className="flex flex-col gap-6">
                                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                        <PlaylistIntroStep
                                            imageUrl="/images/libtv/toolbox-guide.png"
                                            title="从左下角添加"
                                            description="打开「添加」→「工具」→「播放列表」，在画布上放置新的播放列表节点。"
                                        />
                                        <PlaylistIntroStep
                                            imageUrl="/images/libtv/toolbox-product-preset.png"
                                            title="从多选工具栏"
                                            description="选中两个及以上视频节点后，在上方浮动工具栏中点击「创建播放列表」。"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-3">
                                        <div className="flex min-h-[220px] w-full items-center justify-center overflow-hidden rounded-[11px] border border-white/10 bg-[#2a2a2a] sm:min-h-[260px]">
                                            <img src="/images/libtv/dialog-hero-bg.png" alt="使用说明" className="h-auto max-h-[min(42vh,400px)] w-full object-contain object-center" />
                                        </div>
                                        <p className="text-xs font-semibold leading-4 text-white/80">使用说明</p>
                                        <p className="text-xs leading-[1.3] text-white/40">向列表添加片段、在时间线上调整顺序，使用切割与裁剪，最后可导出或合并回画布。</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-[#2f2f2f] p-4">
                    <button type="button" className="flex cursor-pointer items-center gap-2 text-sm text-white/40" onClick={() => onDontShowAgainChange(!dontShowAgain)}>
                        <span className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${dontShowAgain ? "border-[#1fa2dc] bg-[#1fa2dc] text-white" : "border-white/10 bg-transparent text-transparent"}`}>
                            <Check className="size-3" />
                        </span>
                        <span>不再提示</span>
                    </button>
                    <button type="button" className="rounded-[8px] bg-white px-3 py-1.5 text-sm font-medium text-[#0f0f0f] transition-opacity hover:opacity-90" onClick={onContinue}>
                        继续
                    </button>
                </div>
            </div>
        </div>
    )
}

function PlaylistIntroStep({
    imageUrl,
    title,
    description,
}: {
    imageUrl: string
    title: string
    description: string
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex h-[220px] w-full items-center justify-center overflow-hidden rounded-[11px] border border-white/10 bg-[#2a2a2a] sm:h-[248px]">
                <img src={imageUrl} alt={title} className="max-h-full w-full object-contain object-center" />
            </div>
            <p className="text-xs font-semibold leading-4 text-white/80">{title}</p>
            <p className="text-xs leading-[1.3] text-white/40">{description}</p>
        </div>
    )
}

export function ThreeDIntroDialog({
    open,
    dontShowAgain,
    onDontShowAgainChange,
    onClose,
    onContinue,
}: {
    open: boolean
    dontShowAgain: boolean
    onDontShowAgainChange: (checked: boolean) => void
    onClose: () => void
    onContinue: () => void
}) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30" role="presentation" onMouseDown={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="threed-dialog-title"
                className="w-[640px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[20px] border border-white/10 bg-[#2f2f2f] text-white shadow-[0_14px_32px_rgba(0,0,0,0.32)]"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="flex shrink-0 items-center gap-2 px-4 py-3">
                    <span className="flex shrink-0 text-white/90"><ThreeDWorldIcon className="size-4" /></span>
                    <h2 id="threed-dialog-title" className="min-w-0 flex-1 truncate text-base font-semibold leading-6 text-white/90">创建 3D 世界</h2>
                    <button type="button" className="shrink-0 text-white/52 transition-colors hover:text-white/88" aria-label="关闭" onClick={onClose}>
                        <X className="size-4" />
                    </button>
                </div>
                <div className="max-h-[calc(100vh-10rem)] min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <div className="flex flex-col gap-2 pb-1">
                        <div className="px-4 pb-0">
                            <div className="rounded-[16px] bg-[#1f1f1f] p-6" role="note">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <p className="text-sm font-semibold leading-5 text-white/80">创建可进入探索的 3D 场景</p>
                                    <p className="text-sm leading-5 text-white/55">用提示词、图片、360 全景图或视频生成可进入查看和编辑的 3D 世界。输入中如果存在人物或距离镜头太近的物体，可能会影响生成质量。</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-4 pb-0">
                            <div className="rounded-[16px] bg-[#1f1f1f] p-6">
                                <p className="mb-4 text-sm font-semibold leading-5 text-white/90">如何创建 3D 世界</p>
                                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                                    <ThreeDIntroStep imageUrl="/images/libtv/starter-story-script.png" title="创建 3D 世界节点" description="可以创建空白节点开始写提示词，也可以先选中图片或视频，让它们自动连接到新的 3D 世界节点。" />
                                    <ThreeDIntroStep imageUrl="/images/zmtv/characters/20260725/moonfang-half-spirit/character-sheet.png" title="支持的输入类型" description="3D 世界支持提示词、1-8 张图片，或 1 个视频作为输入。" />
                                    <ThreeDIntroStep imageUrl="/images/libtv/starter-first-frame-video.png" title="使用全景图输入" description="使用 360 等距柱状全景图时，选择全景图输入，3D 世界会以全景图内容为主要依据生成。" />
                                    <ThreeDIntroStep imageUrl="/images/libtv/starter-audio-video.png" title="进入并编辑世界" description="生成完成后，进入查看器探索场景、随意拍摄、编辑世界，并迭代新的 3D 世界版本。" />
                                </div>
                            </div>
                        </div>
                        <div className="px-4 pb-0">
                            <div className="rounded-[16px] bg-[#1f1f1f] p-6" role="note">
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-semibold leading-5 text-[#d36a6a]">协作提示</p>
                                    <p className="text-sm leading-5 text-white/55">多人同时编辑同一个 3D 世界时，版本切换、场景编辑或重新生成可能互相覆盖。建议一次只由一人编辑同一个 3D 世界。</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center justify-between border-t border-white/10 bg-[#2f2f2f] p-4">
                    <button type="button" className="flex cursor-pointer items-center gap-2 text-sm text-white/40" onClick={() => onDontShowAgainChange(!dontShowAgain)}>
                        <span className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${dontShowAgain ? "border-[#1fa2dc] bg-[#1fa2dc] text-white" : "border-white/10 bg-transparent text-transparent"}`}>
                            <Check className="size-3" />
                        </span>
                        <span>不再提示</span>
                    </button>
                    <button type="button" className="rounded-[8px] bg-white px-3 py-1.5 text-sm font-medium text-[#0f0f0f] transition-opacity hover:opacity-90" onClick={onContinue}>
                        继续
                    </button>
                </div>
            </div>
        </div>
    )
}

function ThreeDIntroStep({
    imageUrl,
    title,
    description,
}: {
    imageUrl: string
    title: string
    description: string
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex aspect-[3/2] w-full items-center justify-center overflow-hidden rounded-[11px] border border-white/10 bg-[#2a2a2a]">
                <img src={imageUrl} alt={title} className="max-h-full w-full object-contain object-center" />
            </div>
            <p className="text-xs font-semibold leading-4 text-white/80">{title}</p>
            <p className="text-xs leading-[1.3] text-white/40">{description}</p>
        </div>
    )
}
