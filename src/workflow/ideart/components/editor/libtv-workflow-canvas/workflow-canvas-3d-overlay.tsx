"use client"

import React, { useCallback, useRef, useState } from "react"
import { message } from "@/workflow/ideart/shims/antd"
import { ColorfulLoader } from "@/workflow/ideart/components/ui/colorful-loader"
import {
    ArrowDownToLine,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Camera,
    ChevronLeft,
    ChevronRight,
    Clapperboard,
    Crosshair,
    Download,
    FileOutput,
    HelpCircle,
    ImagePlus,
    Images,
    Info,
    Keyboard,
    Maximize,
    MousePointer2,
    PenLine,
    Redo2,
    RotateCcw,
    SquareDashedMousePointer,
    Trash2,
    Undo2,
    X,
} from "lucide-react"
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow"
import {
    WorldLabsMarbleViewer,
    type WorldLabsMarbleCameraState,
    type WorldLabsMarbleViewerHandle,
    type WorldLabsMarbleViewState,
} from "../worldlabs-marble-viewer"
import { cropWorkflowImageDataUrl, cropWorkflowImageDataUrlByRect, dataUrlToWorkflowFile } from "./workflow-canvas-media-utils"

type ThreeDWorldTool = "camera" | "scene" | null

type ThreeDWorldCapturedPhoto = {
    id: string
    dataUrl: string
    width: number
    height: number
    cameraState: WorldLabsMarbleCameraState
    sequence: number
    createdAt: number
}

type ThreeDSceneRegion = {
    id: string
    rect: { x: number; y: number; width: number; height: number }
    dataUrl: string
    createdAt: number
}

export type ThreeDWorldEditSubmitPayload = {
    prompt: string
    maskData: string
    maskBounds: { x: number; y: number; width: number; height: number }
    regionCount: number
}

const WORLD_EDIT_PANO_MASK_WIDTH = 2048
const WORLD_EDIT_PANO_MASK_HEIGHT = 1024

export function ThreeDWorldOverlay({
    node,
    onClose,
    onDownload,
    onAddCapturedImages,
    onSubmitWorldEdit,
}: {
    node: LibTvWorkflowNode
    onClose: () => void
    onDownload?: (id: string) => void
    onAddCapturedImages?: (files: File[]) => Promise<void>
    onSubmitWorldEdit?: (node: LibTvWorkflowNode, payload: ThreeDWorldEditSubmitPayload) => Promise<void>
}) {
    const [helpOpen, setHelpOpen] = useState(false)
    const [editGuideOpen, setEditGuideOpen] = useState(false)
    const [activeTool, setActiveTool] = useState<ThreeDWorldTool>(null)
    const [capturedPhotos, setCapturedPhotos] = useState<ThreeDWorldCapturedPhoto[]>([])
    const [capturedGalleryOpen, setCapturedGalleryOpen] = useState(false)
    const [capturedGalleryIndex, setCapturedGalleryIndex] = useState(0)
    const [capturing, setCapturing] = useState(false)
    const [addingCaptured, setAddingCaptured] = useState(false)
    const [scenePrompt, setScenePrompt] = useState("")
    const [sceneTool, setSceneTool] = useState<"hand" | "rect">("hand")
    const [sceneRegions, setSceneRegions] = useState<ThreeDSceneRegion[]>([])
    const [drawingRegion, setDrawingRegion] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)
    const [submittingSceneEdit, setSubmittingSceneEdit] = useState(false)
    const overlayRootRef = useRef<HTMLDivElement | null>(null)
    const viewerRef = useRef<WorldLabsMarbleViewerHandle | null>(null)
    const [viewState, setViewState] = useState<WorldLabsMarbleViewState>({ yaw: 0, zoom: 2 })
    const spzUrls = node.data?.spzUrls && typeof node.data.spzUrls === "object" ? node.data.spzUrls : undefined
    const splatUrl = String(node.data?.splatUrl || "").trim()
    const colliderMeshUrl = String(node.data?.colliderMeshUrl || "").trim()
    const marbleUrl = String(node.data?.worldUrl || node.data?.worldMarbleUrl || "").trim()
    const panoUrl = String(node.data?.panoUrl || node.data?.thumbnailUrl || node.data?.mediaUrl || "").trim()
    const downloadUrl = String(node.data?.colliderMeshUrl || node.data?.splatUrl || node.data?.worldUrl || node.data?.worldMarbleUrl || "").trim()

    const rotateView = (delta: number) => viewerRef.current?.rotateYaw(delta)
    const zoomView = (delta: number) => viewerRef.current?.zoomBy(delta)
    const resetView = () => viewerRef.current?.resetCamera()
    const cameraUiActive = activeTool === "camera"
    const sceneUiActive = activeTool === "scene"
    const currentPhoto = capturedPhotos[capturedGalleryIndex] || null
    const activeDrawingRect = drawingRegion
        ? {
            x: Math.min(drawingRegion.startX, drawingRegion.currentX),
            y: Math.min(drawingRegion.startY, drawingRegion.currentY),
            width: Math.abs(drawingRegion.currentX - drawingRegion.startX),
            height: Math.abs(drawingRegion.currentY - drawingRegion.startY),
        }
        : null
    const hasSceneRegion = sceneRegions.length > 0

    const toggleTool = (tool: Exclude<ThreeDWorldTool, null>) => {
        setActiveTool((current) => current === tool ? null : tool)
        setHelpOpen(false)
        setEditGuideOpen(tool === "scene")
    }

    const handleCapturePhoto = useCallback(async () => {
        if (capturing) return
        const capture = viewerRef.current?.captureFrame()
        if (!capture) {
            message.warning("当前 3D 画面还不能截图")
            return
        }
        setCapturing(true)
        try {
            const cropped = await cropWorkflowImageDataUrl(capture.dataUrl, 16 / 9)
            const nextPhoto: ThreeDWorldCapturedPhoto = {
                id: `world-capture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                dataUrl: cropped.dataUrl,
                width: cropped.width,
                height: cropped.height,
                cameraState: capture.cameraState,
                sequence: capturedPhotos.length,
                createdAt: Date.now(),
            }
            setCapturedPhotos((items) => [...items, nextPhoto])
            setCapturedGalleryIndex(capturedPhotos.length)
        } catch (error: any) {
            message.error(String(error?.message || "截图失败"))
        } finally {
            window.setTimeout(() => setCapturing(false), 180)
        }
    }, [capturedPhotos.length, capturing])

    const addCapturedPhotosToCanvas = useCallback(async (photos: ThreeDWorldCapturedPhoto[]) => {
        if (!onAddCapturedImages || photos.length === 0) return
        setAddingCaptured(true)
        try {
            const files = await Promise.all(photos.map((photo, index) => dataUrlToWorkflowFile(photo.dataUrl, `3d-world-shot-${photo.sequence + 1 || index + 1}.jpg`)))
            await onAddCapturedImages(files)
            message.success(photos.length > 1 ? `已添加 ${photos.length} 张机位图到画布` : "已添加机位图到画布")
        } catch (error: any) {
            message.error(String(error?.message || "添加到画布失败"))
        } finally {
            setAddingCaptured(false)
        }
    }, [onAddCapturedImages])

    const deleteCapturedPhoto = useCallback((photoId: string) => {
        setCapturedPhotos((items) => {
            const next = items.filter((item) => item.id !== photoId)
            setCapturedGalleryIndex((index) => Math.max(0, Math.min(index, next.length - 1)))
            if (next.length === 0) setCapturedGalleryOpen(false)
            return next
        })
    }, [])

    const downloadCapturedPhoto = useCallback((photo: ThreeDWorldCapturedPhoto) => {
        const link = document.createElement("a")
        link.href = photo.dataUrl
        link.download = `3d-world-shot-${photo.sequence + 1}.jpg`
        link.click()
    }, [])

    const restoreCapturedCamera = useCallback((photo: ThreeDWorldCapturedPhoto) => {
        viewerRef.current?.setCameraState(photo.cameraState)
        setCapturedGalleryOpen(false)
        setActiveTool("camera")
    }, [])

    const clearSceneRegions = useCallback(() => {
        setSceneRegions([])
        setDrawingRegion(null)
    }, [])

    const finishSceneRegion = useCallback(async (rect: { x: number; y: number; width: number; height: number }) => {
        const root = overlayRootRef.current
        const capture = viewerRef.current?.captureFrame()
        if (!root || !capture || rect.width < 8 || rect.height < 8) return
        const viewport = root.getBoundingClientRect()
        try {
            const dataUrl = await cropWorkflowImageDataUrlByRect(capture.dataUrl, rect, {
                width: viewport.width,
                height: viewport.height,
            })
            setSceneRegions((items) => [
                ...items,
                {
                    id: `scene-region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    rect,
                    dataUrl,
                    createdAt: Date.now(),
                },
            ])
        } catch (error: any) {
            message.error(String(error?.message || "框选区域截图失败"))
        }
    }, [])

    const handleSceneRegionPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!sceneUiActive || sceneTool !== "rect") return
        const root = overlayRootRef.current
        if (!root) return
        const rect = root.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        setDrawingRegion({ startX: x, startY: y, currentX: x, currentY: y })
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
        event.stopPropagation()
    }, [sceneTool, sceneUiActive])

    const handleSceneRegionPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!drawingRegion) return
        const root = overlayRootRef.current
        if (!root) return
        const rect = root.getBoundingClientRect()
        setDrawingRegion((current) => current ? {
            ...current,
            currentX: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
            currentY: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
        } : null)
        event.preventDefault()
        event.stopPropagation()
    }, [drawingRegion])

    const handleSceneRegionPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (!drawingRegion) return
        const root = overlayRootRef.current
        if (!root) return
        const rootRect = root.getBoundingClientRect()
        const endX = Math.max(0, Math.min(rootRect.width, event.clientX - rootRect.left))
        const endY = Math.max(0, Math.min(rootRect.height, event.clientY - rootRect.top))
        const rect = {
            x: Math.min(drawingRegion.startX, endX),
            y: Math.min(drawingRegion.startY, endY),
            width: Math.abs(endX - drawingRegion.startX),
            height: Math.abs(endY - drawingRegion.startY),
        }
        setDrawingRegion(null)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        event.preventDefault()
        event.stopPropagation()
        if (rect.width >= 12 && rect.height >= 12) void finishSceneRegion(rect)
    }, [drawingRegion, finishSceneRegion])

    const buildSceneEditPanoMask = useCallback(() => {
        const root = overlayRootRef.current
        const cameraState = viewerRef.current?.getCameraState()
        if (!root || !cameraState) throw new Error("当前 3D 相机状态不可用")
        const viewport = root.getBoundingClientRect()
        const viewportWidth = Math.max(1, viewport.width)
        const viewportHeight = Math.max(1, viewport.height)
        const canvas = document.createElement("canvas")
        canvas.width = WORLD_EDIT_PANO_MASK_WIDTH
        canvas.height = WORLD_EDIT_PANO_MASK_HEIGHT
        const context = canvas.getContext("2d")
        if (!context) throw new Error("无法创建全景 mask")
        context.fillStyle = "black"
        context.fillRect(0, 0, canvas.width, canvas.height)

        if (sceneRegions.length === 0) {
            context.fillStyle = "white"
            context.fillRect(0, 0, canvas.width, canvas.height)
            return {
                maskData: canvas.toDataURL("image/png"),
                maskBounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
                regionCount: 0,
            }
        }

        const hFov = cameraState.fov * Math.PI / 180
        const vFov = 2 * Math.atan(Math.tan(hFov / 2) / (viewportWidth / viewportHeight))
        const yaw = cameraState.yaw
        const pitch = cameraState.pitch
        let minX = canvas.width
        let minY = canvas.height
        let maxX = 0
        let maxY = 0

        context.fillStyle = "white"
        for (const region of sceneRegions) {
            const samplesX = Math.max(12, Math.min(140, Math.ceil(region.rect.width / 8)))
            const samplesY = Math.max(12, Math.min(140, Math.ceil(region.rect.height / 8)))
            const markWidth = Math.max(3, Math.ceil(canvas.width / viewportWidth * (region.rect.width / samplesX) * 1.8))
            const markHeight = Math.max(3, Math.ceil(canvas.height / viewportHeight * (region.rect.height / samplesY) * 1.8))
            for (let yIndex = 0; yIndex <= samplesY; yIndex += 1) {
                for (let xIndex = 0; xIndex <= samplesX; xIndex += 1) {
                    const screenX = region.rect.x + (region.rect.width * xIndex) / samplesX
                    const screenY = region.rect.y + (region.rect.height * yIndex) / samplesY
                    const nx = (screenX / viewportWidth - 0.5) * 2
                    const ny = (0.5 - screenY / viewportHeight) * 2
                    const localYaw = Math.atan(nx * Math.tan(hFov / 2))
                    const localPitch = Math.atan(ny * Math.tan(vFov / 2))
                    const sphericalYaw = yaw + localYaw
                    const sphericalPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + localPitch))
                    const u = ((sphericalYaw / (Math.PI * 2)) % 1 + 1) % 1
                    const v = 0.5 - sphericalPitch / Math.PI
                    const px = Math.round(u * canvas.width)
                    const py = Math.round(Math.max(0, Math.min(1, v)) * canvas.height)
                    minX = Math.min(minX, px)
                    minY = Math.min(minY, py)
                    maxX = Math.max(maxX, px)
                    maxY = Math.max(maxY, py)
                    context.fillRect(
                        Math.max(0, px - Math.floor(markWidth / 2)),
                        Math.max(0, py - Math.floor(markHeight / 2)),
                        Math.min(canvas.width, markWidth),
                        Math.min(canvas.height, markHeight),
                    )
                }
            }
        }
        const pad = 16
        const maskBounds = {
            x: Math.max(0, Math.round(minX - pad)),
            y: Math.max(0, Math.round(minY - pad)),
            width: Math.max(1, Math.min(canvas.width, Math.round(maxX - minX + pad * 2))),
            height: Math.max(1, Math.min(canvas.height, Math.round(maxY - minY + pad * 2))),
        }
        return {
            maskData: canvas.toDataURL("image/png"),
            maskBounds,
            regionCount: sceneRegions.length,
        }
    }, [sceneRegions])

    const submitSceneEdit = useCallback(() => {
        const prompt = scenePrompt.trim()
        if (!prompt && sceneRegions.length === 0) {
            message.warning("先描述想怎么修改这个 3D 场景")
            return
        }
        if (!panoUrl) {
            message.warning("当前 3D 世界没有可编辑的全景图")
            return
        }
        if (!onSubmitWorldEdit) {
            message.warning("当前页面未接入 3D 世界编辑任务")
            return
        }
        void (async () => {
            setSubmittingSceneEdit(true)
            try {
                const mask = buildSceneEditPanoMask()
                await onSubmitWorldEdit(node, {
                    prompt: prompt || "按标注区域自然修改场景内容",
                    ...mask,
                })
                clearSceneRegions()
                setScenePrompt("")
            } catch (error: any) {
                message.error(String(error?.message || "场景编辑任务提交失败"))
            } finally {
                setSubmittingSceneEdit(false)
            }
        })()
    }, [buildSceneEditPanoMask, clearSceneRegions, node, onSubmitWorldEdit, panoUrl, scenePrompt, sceneRegions.length])

    return (
        <div className="absolute inset-0 z-[100] opacity-100">
            <div ref={overlayRootRef} className="absolute inset-0 overflow-hidden bg-black text-white [&_button]:cursor-pointer">
                <WorldLabsMarbleViewer
                    ref={viewerRef}
                    splatUrl={splatUrl}
                    spzUrls={spzUrls}
                    colliderMeshUrl={colliderMeshUrl}
                    marbleUrl={marbleUrl}
                    previewImageUrl={panoUrl}
                    className="absolute inset-0"
                    onViewChange={setViewState}
                />

                <div className={`pointer-events-none absolute inset-0 z-[35] flex items-center justify-center transition-opacity duration-300 ${cameraUiActive ? "opacity-100" : "opacity-0"}`}>
                    <div className="relative w-[min(78vw,calc((100vh-172px)*1.777))] max-w-[1280px] rounded-[16px] border-2 border-white/60" style={{ aspectRatio: "16 / 9", boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)" }}>
                        <div className="absolute left-0 right-0 top-1/3 h-px bg-white/20" />
                        <div className="absolute left-0 right-0 top-2/3 h-px bg-white/20" />
                        <div className="absolute bottom-0 left-1/3 top-0 w-px bg-white/20" />
                        <div className="absolute bottom-0 left-2/3 top-0 w-px bg-white/20" />
                    </div>
                </div>
                <div className={`pointer-events-none absolute inset-0 z-[34] transition-opacity duration-300 ${cameraUiActive ? "opacity-100" : "opacity-0"}`} style={{ background: "radial-gradient(ellipse at center, transparent 25%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.7) 80%, #000 100%)" }} />

                {sceneUiActive ? (
                    <div
                        className={`absolute inset-0 z-[36] ${sceneTool === "rect" ? "pointer-events-auto cursor-crosshair" : "pointer-events-none"}`}
                        onPointerDown={handleSceneRegionPointerDown}
                        onPointerMove={handleSceneRegionPointerMove}
                        onPointerUp={handleSceneRegionPointerUp}
                        onPointerCancel={handleSceneRegionPointerUp}
                    >
                        {sceneRegions.map((region, index) => (
                            <div
                                key={region.id}
                                className="pointer-events-auto absolute border-2 border-[#42ff23] bg-[#42ff23]/10"
                                style={{
                                    left: region.rect.x,
                                    top: region.rect.y,
                                    width: region.rect.width,
                                    height: region.rect.height,
                                }}
                            >
                                <button type="button" className="absolute left-1/2 top-1/2 flex h-[26px] min-w-[52px] -translate-x-1/2 -translate-y-1/2 items-center overflow-hidden rounded-full bg-zinc-950/45 text-white shadow-[0_2px_8px_rgba(0,0,0,0.32)] backdrop-blur-md transition-transform hover:scale-105" onClick={(event) => { event.stopPropagation(); setSceneRegions((items) => items.filter((item) => item.id !== region.id)) }}>
                                    <span className="flex h-full min-w-[26px] items-center justify-center px-2 text-[13px] font-semibold leading-none text-white">{index + 1}</span>
                                    <span className="flex h-full w-[26px] items-center justify-center border-l border-white/10 text-white/70 transition-colors hover:bg-white/12 hover:text-white"><X className="size-3" /></span>
                                </button>
                            </div>
                        ))}
                        {activeDrawingRect && activeDrawingRect.width > 2 && activeDrawingRect.height > 2 ? (
                            <div
                                className="pointer-events-none absolute border-2 border-[#42ff23] bg-[#42ff23]/10"
                                style={{
                                    left: activeDrawingRect.x,
                                    top: activeDrawingRect.y,
                                    width: activeDrawingRect.width,
                                    height: activeDrawingRect.height,
                                }}
                            />
                        ) : null}
                    </div>
                ) : null}

                <button type="button" className="pointer-events-auto absolute left-4 top-4 z-[62] flex items-center gap-1.5 rounded-full border border-white/10 bg-[rgba(38,38,38,0.55)] py-2 pl-2.5 pr-3.5 text-sm text-white/60 backdrop-blur-[10px] transition-colors hover:bg-[rgba(52,52,52,0.68)] hover:text-white" onClick={onClose}>
                    <X className="size-4" />
                    <span>退出</span>
                </button>

                <div className="absolute right-4 top-4 z-[60] flex flex-col items-end gap-3">
                    <div className="relative h-[172px] w-[250px] overflow-hidden rounded-[24px] border border-white/14 bg-[rgba(0,0,0,0.3)] shadow-[0_20px_52px_rgba(2,6,12,0.18)] backdrop-blur-[24px]">
                        {panoUrl ? <img src={panoUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-65" /> : null}
                        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "rgba(2,6,12,0.24) 0 22px 54px, rgba(255,255,255,0.12) 0 1px 0 inset, rgba(255,255,255,0.06) 0 0 0 1px inset" }} />
                        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 560 420" style={{ overflow: "visible" }}>
                            <defs>
                                <linearGradient id="workflow-world-minimap-fov-gradient" x1="0.5" y1="1" x2="0.5" y2="0">
                                    <stop offset="0%" stopColor="#7bd8ff" stopOpacity="0.5" />
                                    <stop offset="58%" stopColor="#7bd8ff" stopOpacity="0.22" />
                                    <stop offset="100%" stopColor="#7bd8ff" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <line x1="280" y1="12" x2="280" y2="408" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 7" />
                            <line x1="12" y1="210" x2="548" y2="210" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 7" />
                            <g transform="translate(280,210)">
                                <g transform={`rotate(${viewState.yaw})`}>
                                    <path fill="url(#workflow-world-minimap-fov-gradient)" d="M 0 0 L -79.144 -50.717 A 94 94 0 0 1 79.144 -50.717 Z" />
                                </g>
                                <circle cx="0" cy="0" r="11" fill="rgba(8,13,18,0.84)" stroke="rgba(123,216,255,0.86)" strokeWidth="1.3" />
                                <circle cx="0" cy="0" r="6" fill="#eefaff" />
                            </g>
                        </svg>
                        <div className="pointer-events-auto absolute inset-x-2 bottom-2 flex items-center justify-center gap-2">
                            <div className="relative inline-flex items-center gap-[2px] rounded-[16px] bg-[rgba(38,38,38,0.5)] p-[2px] [box-shadow:inset_0_0.5px_0_0_rgba(255,255,255,0.16)] backdrop-blur-[56px]">
                                <button type="button" className="inline-flex size-7 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5" aria-label="左旋" onClick={() => rotateView(-18)}><RotateCcw className="size-3.5" /></button>
                                <button type="button" className="inline-flex size-7 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5" aria-label="右旋" onClick={() => rotateView(18)}><RotateCcw className="size-3.5 -scale-x-100" /></button>
                                <span className="h-[14px] w-px rounded-[99px] bg-white/15" />
                                <button type="button" className="inline-flex size-7 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5" aria-label="缩小" onClick={() => zoomView(-1)}>-</button>
                                <span className="inline-flex h-7 min-w-[34px] items-center justify-center px-1 text-[11px] font-medium tabular-nums text-white/88">{viewState.zoom.toFixed(1)}x</span>
                                <button type="button" className="inline-flex size-7 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5" aria-label="放大" onClick={() => zoomView(1)}>+</button>
                                <span className="h-[14px] w-px rounded-[99px] bg-white/15" />
                                <button type="button" className="inline-flex size-7 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5" aria-label="重置视图" onClick={resetView}><ArrowDownToLine className="size-3.5" /></button>
                            </div>
                            <div className="relative inline-flex items-center rounded-[16px] bg-[rgba(38,38,38,0.5)] p-[2px] [box-shadow:inset_0_0.5px_0_0_rgba(255,255,255,0.16)] backdrop-blur-[56px]">
                                <button type="button" className="inline-flex size-7 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5" aria-label="展开小地图"><Maximize className="size-3.5" /></button>
                            </div>
                        </div>
                    </div>
                    <div className="pointer-events-none flex w-[250px] items-center justify-between">
                        <button type="button" className="pointer-events-auto flex h-8 w-fit max-w-[340px] items-center gap-1.5 rounded-full border border-white/10 bg-[rgba(38,38,38,0.55)] px-3 text-[12px] text-white/88 backdrop-blur-[10px] transition-colors hover:bg-[rgba(52,52,52,0.68)] hover:text-white">
                            <span className="shrink-0 text-white/55">当前版本：</span>
                            <span className="truncate font-medium text-white">v1</span>
                        </button>
                        <div className="pointer-events-auto flex items-center gap-1">
                            <button type="button" className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-[rgba(38,38,38,0.55)] text-white/88 backdrop-blur-[10px] transition-colors hover:bg-[rgba(52,52,52,0.68)] hover:text-white" aria-label="导出"><FileOutput className="size-4" /></button>
                            <button type="button" className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-[rgba(38,38,38,0.55)] text-white/88 backdrop-blur-[10px] transition-colors hover:bg-[rgba(52,52,52,0.68)] hover:text-white disabled:opacity-45" aria-label="下载 SPZ" disabled={!downloadUrl} onClick={() => onDownload?.(node.id)}><Download className="size-4" /></button>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-4 left-8 z-40 flex items-center gap-2">
                    <button type="button" className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-[rgba(38,38,38,0.55)] text-[#ccc] backdrop-blur-[10px] transition-colors hover:bg-[rgba(58,58,58,0.65)] hover:text-white" aria-label="快捷键指引" onClick={() => { setHelpOpen((open) => !open); setEditGuideOpen(false) }}><Keyboard className="size-4" /></button>
                    <button type="button" className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-[rgba(38,38,38,0.55)] text-[#ccc] backdrop-blur-[10px] transition-colors hover:bg-[rgba(58,58,58,0.65)] hover:text-white" aria-label="查看编辑指引" onClick={() => { setEditGuideOpen((open) => !open); setHelpOpen(false) }}><HelpCircle className="size-5" /></button>
                    <button type="button" className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-[rgba(38,38,38,0.55)] text-[#ccc] backdrop-blur-[10px] transition-colors hover:bg-[rgba(58,58,58,0.65)] hover:text-white" aria-label="重置相机" onClick={resetView}><Crosshair className="size-4" /></button>
                </div>

                {helpOpen ? <ThreeDShortcutGuide onClose={() => setHelpOpen(false)} /> : null}
                {editGuideOpen ? <ThreeDEditGuide onClose={() => setEditGuideOpen(false)} /> : null}

                {capturedGalleryOpen && currentPhoto ? (
                    <div className="absolute inset-0 z-[70] overflow-hidden">
                        <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-[32px]" aria-label="关闭机位图库" onClick={() => setCapturedGalleryOpen(false)} />
                        <div className="pointer-events-none absolute inset-0 flex min-h-0 flex-col items-center justify-center gap-3 px-6 py-6">
                            <div className="pointer-events-auto flex shrink-0 items-center gap-2">
                                <GalleryButton disabled={addingCaptured || capturedPhotos.length === 0 || !onAddCapturedImages} onClick={() => { void addCapturedPhotosToCanvas(capturedPhotos) }}>
                                    {addingCaptured ? <ColorfulLoader className="size-3.5" thickness={2} /> : <Images className="size-3.5" />}
                                    <span>全部应用到画布</span>
                                </GalleryButton>
                                <div className="inline-flex h-8 items-center gap-1 rounded-full border border-white/10 bg-[rgba(38,38,38,0.66)] px-1.5 text-white/70 backdrop-blur-[18px]">
                                    <button type="button" className="flex size-6 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-35" aria-label="上一张" disabled={capturedGalleryIndex <= 0} onClick={() => setCapturedGalleryIndex((index) => Math.max(0, index - 1))}><ChevronLeft className="size-3.5" /></button>
                                    <span className="min-w-[42px] text-center text-[11px] tabular-nums text-white/60">{capturedGalleryIndex + 1} / {capturedPhotos.length}</span>
                                    <button type="button" className="flex size-6 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-35" aria-label="下一张" disabled={capturedGalleryIndex >= capturedPhotos.length - 1} onClick={() => setCapturedGalleryIndex((index) => Math.min(capturedPhotos.length - 1, index + 1))}><ChevronRight className="size-3.5" /></button>
                                    <span className="mx-1 h-4 w-px bg-white/12" />
                                    <button type="button" className="flex size-6 items-center justify-center rounded-full hover:bg-white/10" aria-label="下载" onClick={() => downloadCapturedPhoto(currentPhoto)}><Download className="size-3.5" /></button>
                                    <button type="button" className="flex size-6 items-center justify-center rounded-full hover:bg-red-500/15 hover:text-red-300" aria-label="删除" onClick={() => deleteCapturedPhoto(currentPhoto.id)}><Trash2 className="size-3.5" /></button>
                                </div>
                                <GalleryButton disabled={addingCaptured || !onAddCapturedImages} onClick={() => { void addCapturedPhotosToCanvas([currentPhoto]) }}>
                                    {addingCaptured ? <ColorfulLoader className="size-3.5" thickness={2} /> : <ImagePlus className="size-3.5" />}
                                    <span>添加到画布</span>
                                </GalleryButton>
                                <GalleryButton onClick={() => restoreCapturedCamera(currentPhoto)}>
                                    <Camera className="size-3.5" />
                                    <span>返回拍摄机位</span>
                                </GalleryButton>
                                <button type="button" className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-[rgba(38,38,38,0.66)] text-white/70 backdrop-blur-[18px] transition-colors hover:bg-[rgba(58,58,58,0.72)] hover:text-white" aria-label="关闭" onClick={() => setCapturedGalleryOpen(false)}><X className="size-3.5" /></button>
                            </div>
                            <img src={currentPhoto.dataUrl} alt="" width={currentPhoto.width} height={currentPhoto.height} className="pointer-events-auto block w-auto border border-white/8 shadow-[0_32px_80px_rgba(0,0,0,0.5)]" style={{ maxWidth: "calc(100vw - 48px)", maxHeight: "calc(100vh - 12rem)" }} />
                            <div className="pointer-events-auto flex max-w-full shrink-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                {capturedPhotos.map((photo, index) => (
                                    <button key={photo.id} type="button" className={`relative h-[72px] shrink-0 overflow-hidden rounded-[4px] outline-none transition-[opacity,box-shadow] duration-200 ${index === capturedGalleryIndex ? "border-2 border-white opacity-100" : "opacity-55 hover:opacity-85"}`} style={{ width: 128 }} onClick={() => setCapturedGalleryIndex(index)}>
                                        <img src={photo.dataUrl} alt="" className="h-full w-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 grid justify-items-center gap-2 px-6 pb-4">
                    {sceneUiActive ? (
                        <>
                            <div className="pointer-events-none flex flex-col items-center gap-1.5" aria-live="polite" />
                            <div className="pointer-events-auto flex max-w-[min(988px,calc(100vw-48px))] items-center gap-2 overflow-x-auto overflow-y-visible py-1 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <div className="group/tile relative h-11 w-[227px] shrink-0 overflow-hidden rounded-full border border-white/12 bg-[rgba(38,38,38,0.5)] shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_4px_6px_-1px_rgba(0,0,0,0.10),inset_0_0.5px_0_0_rgba(255,255,255,0.12)] backdrop-blur-[28px]">
                                    <div className="absolute left-0 top-0 opacity-100">
                                        <div className="flex w-max max-w-[min(420px,calc(100vw-48px))] items-center gap-3 overflow-hidden p-1 pl-3">
                                            <div className="flex min-w-0 items-center gap-3 overflow-hidden">
                                                <span className="shrink-0 select-none text-[14px] font-semibold leading-none tracking-[0.01em] text-white/88">第二步：更新世界</span>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1.5 pr-[1px]">
                                                <ThreeDPriceSubmit price={160} disabled={submittingSceneEdit} loading={submittingSceneEdit} onClick={submitSceneEdit} ariaLabel="生成新 3D 世界" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="pointer-events-auto relative flex w-full max-w-[494px] flex-col gap-[6px] rounded-[24px] bg-[rgba(38,38,38,0.5)] text-[#CCCCCC] shadow-[0_4px_16px_0_rgba(0,0,0,0.16),inset_0_0.5px_0_rgba(255,255,255,0.16)] backdrop-blur-[56px]">
                                <div className="flex items-center justify-between gap-3 px-3 pt-3">
                                    <div className="relative inline-flex items-center gap-[2px] rounded-[16px] bg-white/10 p-[2px] shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.16)] backdrop-blur-[28px]">
                                        <button type="button" className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5 ${sceneTool === "hand" ? "bg-[rgba(38,38,38,0.4)] shadow-[0_4px_16px_0_rgba(0,0,0,0.16),inset_0_0.5px_0_rgba(255,255,255,0.16)] backdrop-blur-[28px]" : ""}`} aria-label="拖拽 / 指针" onClick={() => setSceneTool("hand")}><MousePointer2 className="size-3.5" strokeWidth={1.75} /></button>
                                    </div>
                                    <div className="relative inline-flex items-center gap-[2px] rounded-[16px] bg-white/10 p-[2px] shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.16)] backdrop-blur-[28px]">
                                        <button type="button" className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5 ${sceneTool === "rect" ? "bg-[rgba(38,38,38,0.4)] shadow-[0_4px_16px_0_rgba(0,0,0,0.16),inset_0_0.5px_0_rgba(255,255,255,0.16)] backdrop-blur-[28px]" : ""}`} aria-label="框选" onClick={() => setSceneTool("rect")}><SquareDashedMousePointer className="size-4" /></button>
                                        <span aria-hidden="true" className="h-[14px] w-px shrink-0 rounded-[99px] bg-white/15" />
                                        <button type="button" disabled className="relative inline-flex h-7 w-7 shrink-0 cursor-not-allowed items-center justify-center rounded-[21px] text-white/88 opacity-30 transition-colors hover:bg-transparent" aria-label="撤销"><Undo2 className="size-4" /></button>
                                        <button type="button" disabled className="relative inline-flex h-7 w-7 shrink-0 cursor-not-allowed items-center justify-center rounded-[21px] text-white/88 opacity-30 transition-colors hover:bg-transparent" aria-label="重做"><Redo2 className="size-4" /></button>
                                        <span aria-hidden="true" className="h-[14px] w-px shrink-0 rounded-[99px] bg-white/15" />
                                        <button type="button" className="relative inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-[21px] px-3 text-white/88 transition-colors hover:bg-white/5" aria-label="清除全部" onClick={clearSceneRegions}><Trash2 className="size-4" strokeWidth={1.75} /><span className="text-xs font-medium">全部</span></button>
                                    </div>
                                    <div className="relative inline-flex items-center gap-[2px] rounded-[16px] bg-white/10 p-[2px] shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.16)] backdrop-blur-[28px]">
                                        <button type="button" className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[21px] text-white/88 transition-colors hover:bg-white/5" aria-label="关闭" onClick={() => setActiveTool(null)}><X className="size-4" /></button>
                                    </div>
                                </div>
                                <div className="px-3 pb-2">
                                    <div className="max-h-[140px] min-h-7 overflow-y-auto text-sm leading-5 text-white">
                                        {sceneRegions.length > 0 ? (
                                            <div className="mb-2 flex flex-wrap gap-2">
                                                {sceneRegions.map((region, index) => (
                                                    <button key={region.id} type="button" className="group/region inline-flex items-center gap-1.5 rounded-[8px] bg-black/20 p-1 pr-2 text-xs font-medium text-white/82 ring-1 ring-white/10 transition-colors hover:bg-black/28" onClick={() => setSceneRegions((items) => items.filter((item) => item.id !== region.id))}>
                                                        <img src={region.dataUrl} alt="" className="h-9 w-14 rounded-[4px] object-cover" />
                                                        <span className="inline-flex size-4 items-center justify-center rounded-full bg-[#42ff23] text-[11px] font-semibold text-black">{index + 1}</span>
                                                        <span>标注区域</span>
                                                        <X className="size-3 text-white/48 group-hover/region:text-white/86" />
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                        <textarea
                                            value={scenePrompt}
                                            onChange={(event) => setScenePrompt(event.target.value)}
                                            placeholder="第一步：移动到目标位置后，描述想怎么修改整张全景图"
                                            rows={hasSceneRegion ? 2 : 3}
                                            className="min-h-7 w-full resize-none bg-transparent px-0 py-1 text-sm leading-5 text-white caret-white outline-none placeholder:text-white/40"
                                        />
                                    </div>
                                </div>
                                <div className="flex min-h-8 items-center justify-between gap-3 px-3 pb-3">
                                    <span className="flex h-8 min-w-0 items-center gap-1.5 truncate text-xs leading-none text-white/35">
                                        <Info className="size-[13px] shrink-0 text-white/30" strokeWidth={1.8} />
                                        {hasSceneRegion ? "按当前视角修改标注区域" : "将修改整张全景图"}
                                    </span>
                                    <div className="shrink-0">
                                        <ThreeDPriceSubmit price={hasSceneRegion ? 15 : 26} disabled={submittingSceneEdit || (!scenePrompt.trim() && !hasSceneRegion)} loading={submittingSceneEdit} onClick={submitSceneEdit} ariaLabel="Generate" />
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : null}
                    {cameraUiActive ? (
                        <div className="pointer-events-auto relative w-fit max-w-[calc(100vw-48px)]">
                            <div aria-hidden="true" className="pointer-events-none absolute -inset-6 rounded-[28px] bg-black/10 backdrop-blur-[17.5px]" style={{ maskImage: "linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent), linear-gradient(transparent, black 40px, black calc(100% - 40px), transparent)", maskComposite: "source-in", WebkitMaskImage: "linear-gradient(to right, transparent, black 40px, black calc(100% - 40px), transparent), linear-gradient(transparent, black 40px, black calc(100% - 40px), transparent)", WebkitMaskComposite: "source-in" }} />
                            <div className="relative w-fit max-w-full">
                                <div className="relative">
                                    {capturedPhotos.length > 0 ? (
                                        <>
                                            <div aria-hidden="true" className="pointer-events-none absolute h-[80px] w-[120px]" style={{ right: "100%", top: "50%", transform: "translateY(-50%)" }} />
                                            <button type="button" className="absolute h-[80px] w-[120px] overflow-visible" title="分镜" aria-label="分镜" style={{ right: "100%", top: "50%", transform: "translateY(-50%)" }} onClick={() => setCapturedGalleryOpen(true)}>
                                                <div className="relative h-full w-full overflow-visible">
                                                    {capturedPhotos.slice(-3).map((photo, index, items) => (
                                                        <div key={photo.id} className="absolute" style={{ left: 20 + index * 4, top: 18 + index * 2, width: 80, height: 45, transform: "translate3d(0px, 0px, 0px)", transition: "transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 300ms ease-out", opacity: 1, zIndex: 20 + index, willChange: "transform" }}>
                                                            <div className="h-full w-full overflow-hidden rounded-[2px] border-[2px] transition-[border-color,background-color,box-shadow] duration-150 ease-out" style={{ borderColor: index === items.length - 1 ? "rgb(221, 221, 221)" : "rgba(221,221,221,0.7)", backgroundColor: "rgb(221, 221, 221)", boxShadow: "rgba(0, 0, 0, 0.14) 0px 2px 6px, rgba(0, 0, 0, 0.28) 0px 12px 24px" }}>
                                                                <img src={photo.dataUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </button>
                                        </>
                                    ) : null}
                                    <div role="toolbar" aria-label="相机工具栏" className="flex w-fit items-center gap-1.5 rounded-full bg-[rgba(38,38,38,0.5)] px-1.5 py-1 shadow-[0_4px_16px_rgba(0,0,0,0.16),inset_0_0.5px_0_rgba(255,255,255,0.16)] backdrop-blur-[28px]">
                                        <div className="relative shrink-0">
                                            <button type="button" className="flex h-9 w-24 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-45" aria-haspopup="listbox" aria-expanded="false" aria-label="画面比例">
                                                <svg width="24" height="24" fill="none" className="shrink-0 opacity-75">
                                                    <rect x="2" y="6.5" width="20" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                                                </svg>
                                                <span className="tabular-nums">16:9</span>
                                            </button>
                                        </div>
                                        <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-white/15" />
                                        <ThreeDFocalLengthRuler />
                                        <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-white/15" />
                                        <button type="button" className="flex h-9 items-center justify-center rounded-full px-3 text-white/85 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-45" aria-label="拍摄" onClick={() => { void handleCapturePhoto() }} disabled={capturing}>
                                            {capturing ? <ColorfulLoader className="size-5" thickness={2} /> : <Camera className="size-5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                    <div className="pointer-events-auto">
                        <div className="flex items-center gap-1.5 rounded-full bg-[rgba(38,38,38,0.5)] p-1 shadow-[0_4px_8px_rgba(0,0,0,0.04),inset_0_0.5px_0_rgba(255,255,255,0.12)] backdrop-blur-[28px]">
                            <button type="button" className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${cameraUiActive ? "bg-white text-black" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`} onClick={() => toggleTool("camera")}><Clapperboard className="size-5" /><span>机位</span></button>
                            <button type="button" className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${sceneUiActive ? "bg-white text-black" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`} onClick={() => toggleTool("scene")}><PenLine className="size-5" /><span>场景</span></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function ThreeDShortcutGuide({ onClose }: { onClose: () => void }) {
    return (
        <div role="dialog" aria-hidden="false" className="absolute bottom-16 left-8 z-40 w-[297px] overflow-hidden rounded-[16px] bg-[#262626]/50 p-5 text-[#CCCCCC] opacity-100 backdrop-blur-[28px]">
            <button type="button" aria-label="关闭" className="absolute right-5 top-5 text-[#CCCCCC] transition-colors hover:text-white" onClick={onClose}><X className="size-5" /></button>
            <div className="flex flex-col gap-4">
                <section className="flex flex-col gap-4">
                    <h3 className="text-lg font-semibold leading-7 text-white/35">移动</h3>
                    <div className="flex flex-col gap-3">
                        <ShortcutRow label="水平移动" keys={["W", "A", "S", "D"]} />
                        <ShortcutRow label="上下移动" keys={["E", "Q"]} />
                        <ShortcutRow label="加速" keys={["Shift"]} />
                    </div>
                </section>
                <div className="h-px w-full bg-white/10" />
                <section className="flex flex-col gap-4">
                    <h3 className="text-lg font-semibold leading-7 text-white/35">转向</h3>
                    <ShortcutRow label="移动视角" keys={["右键拖拽", "中键拖拽"]} />
                    <div className="flex justify-end gap-2 text-[#CCCCCC]">
                        <ShortcutIcon><ArrowLeft className="size-3.5" /></ShortcutIcon>
                        <ShortcutIcon><ArrowRight className="size-3.5" /></ShortcutIcon>
                    </div>
                </section>
                <div className="h-px w-full bg-white/10" />
                <section className="flex flex-col gap-4">
                    <h3 className="text-lg font-semibold leading-7 text-white/35">相机</h3>
                    <ShortcutRow label="调整焦距" keys={["[", "]"]} />
                    <ShortcutRow label="回到原点" keys={["0"]} />
                </section>
            </div>
        </div>
    )
}

function GalleryButton({
    children,
    disabled,
    onClick,
}: {
    children: React.ReactNode
    disabled?: boolean
    onClick?: () => void
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-[rgba(38,38,38,0.66)] px-3 text-[12px] font-medium leading-none text-white/76 backdrop-blur-[18px] transition-colors hover:bg-[rgba(58,58,58,0.72)] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
            {children}
        </button>
    )
}

function ThreeDFocalLengthRuler() {
    const majorTicks = [0, 42, 70, 96, 122, 160, 193, 267]
    const minorTicks = Array.from({ length: 64 }, (_, index) => 4 + index * 8.35)
    return (
        <div className="relative shrink-0 overflow-hidden rounded-full bg-[#030303]" role="group" aria-label="焦距">
            <div className="flex items-center gap-0">
                <div className="relative h-10 w-[132px] cursor-ew-resize select-none overflow-hidden touch-none">
                    <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: 70, maskImage: "linear-gradient(to right, transparent 0px, black 14px, black calc(100% - 14px), transparent 100%)", WebkitMaskImage: "linear-gradient(to right, transparent 0px, black 14px, black calc(100% - 14px), transparent 100%)" }}>
                        <div className="absolute left-0 top-4 h-2" style={{ width: 534, transform: "translateX(-115px)" }}>
                            {majorTicks.map((left) => (
                                <button key={`major-${left}`} type="button" className="pointer-events-none absolute top-0" style={{ left, height: 8 }}>
                                    <span className="block rounded-full" style={{ width: 2, height: 8, marginTop: 0, backgroundColor: "rgba(255, 255, 255, 0.35)" }} />
                                </button>
                            ))}
                            {minorTicks.map((left) => (
                                <span key={`minor-${left.toFixed(2)}`} className="absolute rounded-full" style={{ width: 2, height: 5, left, top: 1.5, backgroundColor: "rgba(255, 255, 255, 0.22)" }} />
                            ))}
                        </div>
                    </div>
                    <div className="pointer-events-none absolute z-20 rounded-full bg-[#fbbf24]" style={{ width: 2, height: 12, left: 34, top: 14 }} />
                    <div className="pointer-events-none absolute right-0 top-1/2 w-14 -translate-y-1/2 pr-2 text-center text-xs font-medium tabular-nums text-white/85">24mm</div>
                </div>
            </div>
        </div>
    )
}

function ThreeDPriceSubmit({
    price,
    disabled,
    loading,
    onClick,
    ariaLabel,
}: {
    price: number
    disabled?: boolean
    loading?: boolean
    onClick?: () => void
    ariaLabel: string
}) {
    return (
        <div className="flex items-center gap-1 rounded-full border border-white/10 p-1" style={{ backdropFilter: "blur(10px)", background: "rgba(255, 255, 255, 0.1)" }}>
            <div className="box-border flex items-center pl-1 text-sm font-medium text-[#CCCCCC]">
                <TapPriceIcon />
                <span className="relative inline-flex min-w-6 justify-center tabular-nums text-[12px]">
                    <span className="inline-flex w-full justify-center whitespace-nowrap">${price}</span>
                </span>
            </div>
            <button type="button" disabled={disabled} className="flex aspect-square h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-sm font-medium text-black transition-all hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50" aria-label={ariaLabel} onClick={onClick}>
                {loading ? <ColorfulLoader className="size-4" thickness={2} /> : <ArrowUp className="size-4" />}
            </button>
        </div>
    )
}

function TapPriceIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ stroke: "rgb(204, 204, 204)" }} aria-hidden="true">
            <path d="M11.2077 11.0832C13.7219 11.0832 15.7601 9.04507 15.7601 6.53088C15.7601 4.01668 13.7219 1.97852 11.2077 1.97852C8.6935 1.97852 6.65533 4.01668 6.65533 6.53088C6.65533 9.04507 8.6935 11.0832 11.2077 11.0832Z" strokeWidth="2" />
            <path d="M2.05883 7.07063C2.40649 5.06634 4.30083 3.70985 6.31403 4.03225C8.31238 4.35169 9.68225 6.2074 9.41481 8.20129C9.41481 8.34911 9.51357 8.81255 9.57973 9.03629C9.77436 9.69448 10.1844 10.6335 11.015 11.721C12.2615 13.3554 11.948 15.691 10.3152 16.9375C8.68085 18.1841 6.34524 17.8721 5.09869 16.2378C2.41541 12.7239 1.71413 9.22201 2.0514 7.11817L2.05883 7.07063Z" strokeWidth="2" />
            <path d="M8.52786 8.98262L7.26662 12.7829C6.82516 14.1131 7.54561 15.5493 8.87578 15.9907L12.6761 17.252C14.0062 17.6934 15.4424 16.973 15.8839 15.6428L17.1451 11.8425C17.5866 10.5124 16.8662 9.07616 15.536 8.6347L11.7357 7.37346C10.4055 6.932 8.96932 7.65244 8.52786 8.98262Z" strokeWidth="2" />
        </svg>
    )
}

function ThreeDEditGuide({ onClose }: { onClose: () => void }) {
    return (
        <div role="dialog" aria-hidden="false" aria-label="编辑 3D 世界" className="absolute bottom-16 left-8 z-40 w-[320px] overflow-hidden rounded-[16px] bg-[#262626]/50 p-5 text-[#CCCCCC] opacity-100 backdrop-blur-[28px]">
            <button type="button" aria-label="关闭" className="absolute right-5 top-5 text-[#CCCCCC] transition-colors hover:text-white" onClick={onClose}><X className="size-5" /></button>
            <div className="flex flex-col gap-5">
                <h3 className="pr-8 text-lg font-semibold leading-7 text-white/35">编辑 3D 世界</h3>
                <ol className="flex flex-col gap-6">
                    <GuideStep index={1} title="选择位置并描述修改">先移动到合适的位置，再告诉 TapNow 你想修改什么。可以使用工具框选区域，也可以直接描述全局修改；生成后会先看到预览。</GuideStep>
                    <GuideStep index={2} title="生成 3D 世界版本">预览满意后，可以提交给模型重新生成一次世界，将全景图的修改变为 3D 世界的更新。你可以在小地图下方切换不同的世界版本。</GuideStep>
                </ol>
            </div>
        </div>
    )
}

function ShortcutIcon({ children }: { children: React.ReactNode }) {
    return <span className="inline-flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded-[4px] border border-white/10 px-1.5 py-[3px] text-sm font-semibold leading-5 text-[#CCCCCC]">{children}</span>
}

function ShortcutRow({ label, keys }: { label: string; keys: string[] }) {
    return (
        <div className="flex min-h-7 items-center justify-between gap-4">
            <span className="shrink-0 text-sm font-semibold leading-7 text-[#CCCCCC]">{label}</span>
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
                {keys.map((key) => <ShortcutIcon key={`${label}-${key}`}>{key}</ShortcutIcon>)}
            </div>
        </div>
    )
}

function GuideStep({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
    return (
        <li className="flex flex-col gap-2">
            <div className="flex items-baseline gap-3">
                <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-xs font-semibold leading-5 text-[#CCCCCC]">{index}</span>
                <h4 className="text-base font-semibold leading-6 text-[#CCCCCC]">{title}</h4>
            </div>
            <p className="text-pretty text-base leading-6 text-[#AFAFAF]">{children}</p>
        </li>
    )
}
