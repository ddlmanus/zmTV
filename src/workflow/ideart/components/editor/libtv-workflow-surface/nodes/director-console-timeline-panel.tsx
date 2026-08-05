"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronRight, Circle, Minus, Minimize2, Pencil, PenTool, Plus, RefreshCw, Square } from "lucide-react"
import type {
  LibTvDirectorConsole3DMotionPathType,
  LibTvDirectorConsole3DMotionPath,
  LibTvDirectorConsole3DObject,
  LibTvDirectorConsole3DState,
  LibTvDirectorConsole3DTimeline,
  LibTvDirectorConsole3DTimelineMotionAction,
  LibTvDirectorConsole3DTimelineTrack,
} from "@/workflow/ideart/lib/libtv/workflow"
import { clampWorkflowNumber } from "./workflow-node-utils"

function TimelinePlayIcon({ playing }: { playing: boolean }) {
  return playing
    ? <span className="flex size-3.5 items-center justify-center gap-[3px]"><span className="h-3 w-[3px] rounded-sm bg-current" /><span className="h-3 w-[3px] rounded-sm bg-current" /></span>
    : <span className="flex size-3.5 items-center justify-center"><span className="ml-0.5 block h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-current" /></span>
}

function MotionPathIcon({ type }: { type: LibTvDirectorConsole3DMotionPathType }) {
  if (type === "circle") return <Circle className="h-4 w-3.5" />
  if (type === "line") return <svg className="h-4 w-3.5" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 8h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
  if (type === "rectangle") return <Square className="h-4 w-3.5" />
  if (type === "pencil") return <Pencil className="size-3.5" />
  return <PenTool className="size-3.5" />
}

const MOTION_PATH_OPTIONS: Array<{ type: LibTvDirectorConsole3DMotionPathType; label: string }> = [
  { type: "circle", label: "圆环路径" },
  { type: "line", label: "直线路径" },
  { type: "rectangle", label: "矩形路径" },
  { type: "pencil", label: "铅笔路径" },
  { type: "pen", label: "钢笔路径" },
]

function PositionDiamond({ active = false }: { active?: boolean }) {
  return <span className={["block size-2 rotate-45 border", active ? "border-[#A8A8A8] bg-[#A8A8A8]" : "border-[#9ba1a4] bg-[#232323]"].join(" ")} />
}

function timelinePropertyKeys(track: LibTvDirectorConsole3DTimelineTrack) {
  return track.targetType === "camera" ? ["position", "rotation", "fov"] : ["position", "rotation", "scale"]
}

function propertyTimes(track: LibTvDirectorConsole3DTimelineTrack, property: string) {
  return [...new Set(track.keyframes.filter((keyframe) => keyframe.property === property || keyframe.property.startsWith(property + ".")).map((keyframe) => Number(keyframe.time.toFixed(4))))].sort((a, b) => a - b)
}

function timelinePropertyLabel(property: string) {
  if (property === "position") return "位置"
  if (property === "rotation") return "旋转"
  if (property === "scale") return "缩放"
  if (property === "fov") return "视野角度"
  return property
}

function timelinePropertySummary(track: LibTvDirectorConsole3DTimelineTrack, state: LibTvDirectorConsole3DState, property: string) {
  const target = track.targetType === "camera" ? state.cameras.find((item) => item.id === track.targetId) : state.objects.find((item) => item.id === track.targetId)
  if (!target) return "0"
  if (property === "fov" && "fov" in target) return Number(target.fov.toFixed(2)).toString()
  const vector = (target as unknown as Record<string, unknown>)[property] as { x: number; y: number; z: number } | undefined
  if (!vector || typeof vector !== "object") return "0,0,0"
  return [vector.x, vector.y, vector.z].map((value) => Number(value.toFixed(2))).join(",")
}

function TrackPropertyLeftRow({ track, state, property, time, onSelectTrack, onTimeChange }: { track: LibTvDirectorConsole3DTimelineTrack; state: LibTvDirectorConsole3DState; property: string; time: number; onSelectTrack: (targetId: string) => void; onTimeChange: (time: number) => void }) {
  const times = propertyTimes(track, property)
  const previous = [...times].reverse().find((value) => value < time - 0.01)
  const next = times.find((value) => value > time + 0.01)
  const current = times.some((value) => Math.abs(value - time) <= 0.01)
  return <div className="grid h-8 grid-cols-[minmax(0,1fr)_154px] items-center bg-[#2A2A2A] pl-7 pr-2 text-[12px]">
    <button type="button" className="text-left text-white/55" onClick={() => onSelectTrack(track.targetId)}>{timelinePropertyLabel(property)}</button>
    <div className="grid grid-cols-[18px_18px_18px_minmax(0,1fr)] items-center gap-1 text-white/48">
      <button type="button" aria-label="上一关键帧" disabled={previous === undefined} className="text-[13px] disabled:opacity-25" onClick={() => previous !== undefined && onTimeChange(previous)}>‹</button>
      <button type="button" aria-label={current ? "当前帧有关键帧" : "当前帧无关键帧"} className="flex size-[18px] items-center justify-center"><PositionDiamond active={current} /></button>
      <button type="button" aria-label="下一关键帧" disabled={next === undefined} className="text-[13px] disabled:opacity-25" onClick={() => next !== undefined && onTimeChange(next)}>›</button>
      <span className="truncate text-right tabular-nums text-white/45">{timelinePropertySummary(track, state, property)}</span>
    </div>
  </div>
}

function TrackLeftRows({
  track,
  state,
  selected,
  drawing,
  time,
  onSelectTrack,
  onToggleExpanded,
  onOpenPathMenu,
  onTimeChange,
}: {
  track: LibTvDirectorConsole3DTimelineTrack
  state: LibTvDirectorConsole3DState
  selected: boolean
  drawing: boolean
  time: number
  onSelectTrack: (targetId: string) => void
  onToggleExpanded: (trackId: string, expanded: boolean) => void
  onOpenPathMenu: (trackId: string, button: HTMLButtonElement) => void
  onTimeChange: (time: number) => void
}) {
  const expanded = track.expanded !== false
  return <>
    <div className={["grid h-8 grid-cols-[16px_minmax(0,1fr)_154px] items-center px-2 text-[12px]", selected ? "bg-[linear-gradient(180deg,#29434B_0%,#263D43_100%)]" : "bg-[#1f1f1f]"].join(" ")}>
      <button type="button" aria-label={expanded ? "收起属性" : "展开属性"} aria-expanded={expanded} className="flex size-4 items-center justify-center text-white/52" onClick={() => onToggleExpanded(track.id, !expanded)}><ChevronRight className={["size-3 transition-transform", expanded ? "rotate-90" : ""].join(" ")} /></button>
      <button type="button" className="min-w-0 truncate text-left font-medium text-[#F7F7F7]" onClick={() => onSelectTrack(track.targetId)}>{track.name}</button>
      <div className="flex justify-end">
        <button type="button" aria-pressed={drawing} className={["flex h-6 w-[86px] items-center justify-center gap-1 text-[13px] leading-[13px] transition-colors", drawing ? "bg-white/[0.035] text-white/38 hover:bg-white/[0.055]" : track.targetType === "object" ? "text-[#5DDCFF] hover:bg-[#23393D]" : "text-white/78 hover:bg-[#23393D]"].join(" ")} style={{ borderRadius: 8 }} onClick={(event) => { onSelectTrack(track.targetId); onOpenPathMenu(track.id, event.currentTarget) }}><Circle className="size-3" />绘制轨迹</button>
      </div>
    </div>
    {expanded ? timelinePropertyKeys(track).map((property) => <TrackPropertyLeftRow key={property} track={track} state={state} property={property} time={time} onSelectTrack={onSelectTrack} onTimeChange={onTimeChange} />) : null}
  </>
}

const TIMELINE_RULER_HEIGHT = 36
const TIMELINE_ROW_HEIGHT = 32
const TIMELINE_INSET = 6

function TimelineCanvas({ timeline, time, activeTargetId, drawingTrackId, width, height, pixelsPerSecond, verticalScrollTop, onTimeChange }: { timeline: LibTvDirectorConsole3DTimeline; time: number; activeTargetId?: string; drawingTrackId: string | null; width: number; height: number; pixelsPerSecond: number; verticalScrollTop: number; onTimeChange: (time: number) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const draggingRef = useRef(false)
  const rows = useMemo(() => {
    let y = 0
    const result: Array<{ track: LibTvDirectorConsole3DTimelineTrack; kind: "track" | "property"; property?: string; y: number }> = []
    timeline.tracks.forEach((track) => {
      result.push({ track, kind: "track", y }); y += TIMELINE_ROW_HEIGHT
      if (track.expanded !== false) {
        timelinePropertyKeys(track).forEach((property) => {
          result.push({ track, kind: "property", property, y })
          y += TIMELINE_ROW_HEIGHT
        })
      }
    })
    return result
  }, [timeline.tracks])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = 2
    const backingWidth = Math.max(1, Math.round(width * dpr))
    const backingHeight = Math.max(1, Math.round(height * dpr))
    if (canvas.width !== backingWidth) canvas.width = backingWidth
    if (canvas.height !== backingHeight) canvas.height = backingHeight
    const cssWidth = String(width) + "px"
    const cssHeight = String(height) + "px"
    if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth
    if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight
    const context = canvas.getContext("2d")
    if (!context) return
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)

    context.fillStyle = "#212121"
    context.fillRect(0, 0, width, TIMELINE_RULER_HEIGHT)
    const tickCount = Math.max(1, Math.ceil(timeline.duration))
    context.font = "12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
    context.textAlign = "center"
    context.textBaseline = "top"
    for (let second = 0; second <= tickCount; second += 1) {
      const x = TIMELINE_INSET + second * pixelsPerSecond
      context.fillStyle = "rgba(255,255,255,0.08)"
      context.fillRect(Math.round(x), 0, 1, TIMELINE_RULER_HEIGHT)
      if (second > 0) {
        context.fillStyle = "rgba(255,255,255,0.60)"
        context.fillText(String(second) + "s", x, 4)
      }
      for (let subdivision = 0; subdivision < 5; subdivision += 1) {
        const minorX = x + subdivision * pixelsPerSecond / 5
        context.fillStyle = subdivision === 0 ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.14)"
        context.fillRect(Math.round(minorX), TIMELINE_RULER_HEIGHT - (subdivision === 0 ? 8 : 4), 1, subdivision === 0 ? 8 : 4)
      }
    }

    context.save()
    context.beginPath()
    context.rect(0, TIMELINE_RULER_HEIGHT, width, Math.max(0, height - TIMELINE_RULER_HEIGHT))
    context.clip()
    rows.forEach((row) => {
      const rowY = TIMELINE_RULER_HEIGHT + row.y - verticalScrollTop
      if (rowY + TIMELINE_ROW_HEIGHT <= TIMELINE_RULER_HEIGHT || rowY >= height) return
      const selected = row.track.targetId === activeTargetId
      const drawing = drawingTrackId === row.track.id || drawingTrackId === row.track.targetId
      context.fillStyle = "#2A2A2A"
      if (row.kind === "track" && selected && !drawing) {
        context.fillStyle = "rgba(45, 174, 204, 0.22)"
      }
      context.fillRect(0, rowY, width, TIMELINE_ROW_HEIGHT)
      context.fillStyle = "rgba(255,255,255,0.035)"
      context.fillRect(0, rowY + TIMELINE_ROW_HEIGHT - 1, width, 1)
      const action = row.track.actions?.[0]
      if (row.kind === "track" && action) {
        const x = TIMELINE_INSET + action.startTime * pixelsPerSecond
        const actionWidth = Math.max(3, Math.min(timeline.duration - action.startTime, action.duration) * pixelsPerSecond)
        context.fillStyle = selected && !drawing ? "rgba(31, 178, 211, 0.72)" : "rgba(255,255,255,0.12)"
        context.fillRect(x, rowY + 2, actionWidth, 28)
        context.fillStyle = selected && !drawing ? "#70D8F1" : "rgba(255,255,255,0.25)"
        context.fillRect(x, rowY + 2, 2, 28)
      }
      if (row.kind === "property" && row.property) {
        if (action && row.property === "position") {
          context.fillStyle = drawing ? "rgba(255,255,255,0.18)" : "rgba(46,143,164,0.8)"
          context.fillRect(0, rowY + 15.5, width, 1)
        }
        propertyTimes(row.track, row.property).forEach((keyTime) => {
          const x = TIMELINE_INSET + keyTime * pixelsPerSecond
          context.save()
          context.translate(x, rowY + 16)
          context.rotate(Math.PI / 4)
          context.fillStyle = "#232323"
          context.strokeStyle = "#6EE7B7"
          context.lineWidth = 1
          context.beginPath()
          context.rect(-4, -4, 8, 8)
          context.fill(); context.stroke(); context.restore()
        })
      }
    })
    context.restore()

    const playheadX = TIMELINE_INSET + time * pixelsPerSecond
    context.fillStyle = "rgba(255,255,255,0.88)"
    context.fillRect(playheadX, 12, 1, Math.max(0, height - 12))
    context.beginPath()
    context.roundRect(playheadX - 5, 3, 10, 12, 3)
    context.fill()
  }, [activeTargetId, drawingTrackId, height, pixelsPerSecond, rows, time, timeline.duration, verticalScrollTop, width])
  const setTimeFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const x = clampWorkflowNumber(event.clientX - rect.left - TIMELINE_INSET, 0, width - TIMELINE_INSET * 2)
    const y = event.clientY - rect.top
    const rowY = y - TIMELINE_RULER_HEIGHT + verticalScrollTop
    const row = y >= TIMELINE_RULER_HEIGHT ? rows.find((item) => rowY >= item.y && rowY < item.y + TIMELINE_ROW_HEIGHT) : undefined
    if (row?.kind === "property" && row.property) {
      const hit = propertyTimes(row.track, row.property).find((keyTime) => Math.abs(keyTime * pixelsPerSecond - x) <= 8)
      if (hit !== undefined) { onTimeChange(hit); return }
    }
    onTimeChange(clampWorkflowNumber(x / pixelsPerSecond, 0, timeline.duration))
  }
  return <canvas ref={canvasRef} role="slider" aria-label="动画时间轴播放头" aria-valuemin={0} aria-valuemax={timeline.duration} aria-valuenow={Number(time.toFixed(2))} tabIndex={0} className="block cursor-ew-resize outline-none" onPointerDown={(event) => { if (event.button !== 0) return; draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); setTimeFromPointer(event) }} onPointerMove={(event) => { if (draggingRef.current) setTimeFromPointer(event) }} onPointerUp={(event) => { draggingRef.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { draggingRef.current = false }} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); onTimeChange(clampWorkflowNumber(time + (event.key === "ArrowRight" ? 0.01 : -0.01), 0, timeline.duration)) }} />
}

export function DirectorTimelinePanel({
  state, timeline, time, playing, minimized, height, drawingTrackId, onHeightChange, onTimeChange, onPlayingChange, onTimelineChange, onAddTrack, onRemoveTrack, onToggleMinimized, onSelectTrack, onCreateMotionPath, onToggleTrackExpanded,
}: {
  state: LibTvDirectorConsole3DState
  timeline: LibTvDirectorConsole3DTimeline
  time: number
  playing: boolean
  minimized: boolean
  height: number
  drawingTrackId: string | null
  onHeightChange: (height: number) => void
  onTimeChange: (time: number) => void
  onPlayingChange: (playing: boolean) => void
  onTimelineChange: (patch: Partial<LibTvDirectorConsole3DTimeline>) => void
  onAddTrack: () => void
  onRemoveTrack: (trackId: string) => void
  onToggleMinimized: () => void
  onToggleDrawing?: (trackId: string) => void
  onSelectTrack: (targetId: string) => void
  onCreateMotionPath: (trackId: string, type: LibTvDirectorConsole3DMotionPathType) => void
  onToggleTrackExpanded: (trackId: string, expanded: boolean) => void
}) {
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [verticalScrollTop, setVerticalScrollTop] = useState(0)
  const [menu, setMenu] = useState<{ trackId: string; left: number; top: number } | null>(null)
  useEffect(() => {
    if (!menu) return
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null) }
    const closeOnPointer = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null) }
    document.addEventListener("keydown", closeOnKey)
    document.addEventListener("pointerdown", closeOnPointer)
    return () => { document.removeEventListener("keydown", closeOnKey); document.removeEventListener("pointerdown", closeOnPointer) }
  }, [menu])
  const activeTargetId = state.activeObjectId || state.activeCameraId
  const activeTrack = timeline.tracks.find((track) => track.targetId === activeTargetId)
  const canAddTrack = Boolean(activeTargetId && !timeline.tracks.some((track) => track.targetId === activeTargetId))
  const pixelsPerSecond = timeline.zoom * 5
  const contentWidth = timeline.duration * pixelsPerSecond + 12
  const displayedTime = timeline.unit === "ms" ? time * 1000 : time
  const displayedDuration = timeline.unit === "ms" ? timeline.duration * 1000 : timeline.duration
  const rowsHeight = useMemo(() => timeline.tracks.reduce((heightSum, track) => heightSum + TIMELINE_ROW_HEIGHT * (1 + (track.expanded !== false ? timelinePropertyKeys(track).length : 0)), 0), [timeline.tracks])
  const canvasHeight = minimized ? TIMELINE_RULER_HEIGHT : height
  const verticalScrollRange = minimized ? 0 : Math.max(0, rowsHeight - Math.max(0, height - TIMELINE_RULER_HEIGHT))
  useEffect(() => {
    const scrollElement = timelineScrollRef.current
    if (!scrollElement) return
    const nextScrollTop = clampWorkflowNumber(verticalScrollTop, 0, verticalScrollRange)
    if (Math.abs(scrollElement.scrollTop - nextScrollTop) > 0.5) scrollElement.scrollTop = nextScrollTop
    if (Math.abs(verticalScrollTop - nextScrollTop) > 0.5) setVerticalScrollTop(nextScrollTop)
  }, [verticalScrollRange, verticalScrollTop])
  const finishResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }
  const openPathMenu = (trackId: string, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect()
    setMenu({ trackId, left: Math.round(rect.left - 39), top: Math.round(Math.max(8, rect.top - 157)) })
  }
  const scrollTimelineVertically = (deltaY: number) => {
    const scrollElement = timelineScrollRef.current
    if (!scrollElement || verticalScrollRange <= 0) return false
    const previous = scrollElement.scrollTop
    scrollElement.scrollTop = clampWorkflowNumber(previous + deltaY, 0, verticalScrollRange)
    return Math.abs(scrollElement.scrollTop - previous) > 0.5
  }
  return <>
    <section className="nodrag nopan nowheel absolute inset-x-0 bottom-0 z-40 min-w-0 overflow-hidden bg-[#212121] text-neutral-50" style={{ height: minimized ? 36 : height, bottom: -1 }} aria-label="动画时间轴面板">
      {!minimized ? <div title="拖拽调整时间轴高度" className="absolute inset-x-0 top-0 z-40 h-2 cursor-ns-resize" onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: height } }} onPointerMove={(event) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; onHeightChange(Math.round(clampWorkflowNumber(drag.startHeight + drag.startY - event.clientY, 96, 520))) }} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={finishResize} /> : null}
      <div ref={timelineScrollRef} className="tiny-scrollbar absolute bottom-0 left-[322px] right-0 top-0 z-10 overflow-auto bg-[#1f1f1f]" onScroll={(event) => { const nextScrollTop = clampWorkflowNumber(event.currentTarget.scrollTop, 0, verticalScrollRange); if (Math.abs(event.currentTarget.scrollTop - nextScrollTop) > 0.5) event.currentTarget.scrollTop = nextScrollTop; setVerticalScrollTop(nextScrollTop) }}>
        <div className="relative" style={{ width: contentWidth, height: canvasHeight + verticalScrollRange }}>
          <div className="sticky top-0" style={{ width: contentWidth, height: canvasHeight }}><TimelineCanvas timeline={timeline} time={time} activeTargetId={activeTargetId} drawingTrackId={drawingTrackId} width={contentWidth} height={canvasHeight} pixelsPerSecond={pixelsPerSecond} verticalScrollTop={verticalScrollTop} onTimeChange={onTimeChange} /></div>
        </div>
      </div>
      <div className="absolute left-0 top-0 z-20 flex h-9 w-[320px] items-center justify-between bg-[#1f1f1f] px-2 py-1 text-[12px] text-white/60">
          <div className="flex items-center">
            <button type="button" aria-label={playing ? "暂停" : "播放"} className="flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-white/80 hover:bg-white/10 hover:text-white" onClick={() => onPlayingChange(!playing)}><TimelinePlayIcon playing={playing} /></button>
            <button type="button" aria-label="自动帧" className={["flex size-6 items-center justify-center rounded-lg", timeline.autoKey ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10"].join(" ")} onClick={() => onTimelineChange({ autoKey: !timeline.autoKey })}><PositionDiamond /></button>
            <button type="button" aria-label="循环播放" className={["flex size-6 items-center justify-center rounded-md", timeline.loop ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10"].join(" ")} onClick={() => onTimelineChange({ loop: !timeline.loop })}><RefreshCw className="size-3.5" /></button>
            <input aria-label="播放头位置" type="text" inputMode="decimal" className="ml-1 h-6 w-[46px] rounded-md bg-white/[0.06] px-1 text-center text-[12px] tabular-nums text-white/75 outline-none" value={displayedTime.toFixed(timeline.unit === "ms" ? 0 : 2)} onChange={(event) => onTimeChange(clampWorkflowNumber(Number(event.target.value) / (timeline.unit === "ms" ? 1000 : 1), 0, timeline.duration))} />
            <span className="px-0.5 text-white/28">/</span>
            <input aria-label="总时长" type="text" inputMode="decimal" className="h-6 w-[46px] rounded-md bg-white/[0.06] px-1 text-center text-[12px] tabular-nums text-white/75 outline-none" value={displayedDuration.toFixed(timeline.unit === "ms" ? 0 : 2)} onChange={(event) => { const duration = clampWorkflowNumber(Number(event.target.value) / (timeline.unit === "ms" ? 1000 : 1), 0.01, 86400); onTimelineChange({ duration }); onTimeChange(Math.min(time, duration)) }} />
            <button type="button" aria-label={timeline.unit === "s" ? "切换时间单位为 ms" : "切换时间单位为 s"} className="ml-0.5 flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[12px] text-white/60 hover:bg-white/10 hover:text-white" onClick={() => onTimelineChange({ unit: timeline.unit === "s" ? "ms" : "s" })}>{timeline.unit}</button>
          </div>
          {activeTrack ? (
            <button type="button" className="flex h-6 w-[88px] items-center gap-0 rounded-md px-1.5 text-[12px] text-white/60 hover:bg-white/10 hover:text-white" onClick={() => onRemoveTrack(activeTrack.id)}><Minus className="size-[18px]" />移除轨道</button>
          ) : (
            <button type="button" disabled={!canAddTrack} className="flex h-6 w-[82px] items-center gap-0 rounded-md px-1.5 text-[12px] text-white/60 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35" onClick={onAddTrack}><Plus className="size-[18px]" />新建轨道</button>
          )}
      </div>
      <div className="absolute right-2 top-1 z-30 flex items-center gap-2 rounded-md bg-[#212121]/90 pl-2"><input aria-label="时间轴缩放" type="range" min={16} max={120} step={1} value={timeline.zoom} className="w-[71px] accent-white" onChange={(event) => onTimelineChange({ zoom: Number(event.target.value) })} /><button type="button" aria-label="时间线最小化" className="flex size-6 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white" onClick={onToggleMinimized}><Minimize2 className="size-3.5" /></button></div>
      {!minimized ? <div className="absolute bottom-0 left-0 top-9 z-20 w-[320px] overflow-hidden bg-[#1f1f1f]" onWheel={(event) => { if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return; if (scrollTimelineVertically(event.deltaY)) event.preventDefault() }}>
        <div className="min-h-full w-full bg-[#1f1f1f] will-change-transform" style={{ height: Math.max(rowsHeight, height - TIMELINE_RULER_HEIGHT), transform: `translate3d(0, -${verticalScrollTop}px, 0)` }}>{timeline.tracks.map((track) => <TrackLeftRows key={track.id} track={track} state={state} selected={activeTargetId === track.targetId} drawing={drawingTrackId === track.id || drawingTrackId === track.targetId} time={time} onSelectTrack={onSelectTrack} onToggleExpanded={onToggleTrackExpanded} onOpenPathMenu={openPathMenu} onTimeChange={onTimeChange} />)}</div>
      </div> : null}
    </section>
    {menu && typeof document !== "undefined" ? createPortal(<div ref={menuRef} className="fixed z-[1700] h-[150px] w-[164px] overflow-hidden border border-white/[0.08] bg-[rgba(37,37,37,0.98)] p-1 text-white shadow-[0_8px_24px_rgba(0,0,0,0.36)] backdrop-blur-[16px]" style={{ left: menu.left, top: menu.top, borderRadius: 8 }} role="menu" aria-label="绘制轨迹">
      {MOTION_PATH_OPTIONS.map((option) => <button key={option.type} type="button" role="menuitem" className="flex h-7 w-[154px] items-center gap-2 px-2 text-[12px] leading-[18.6px] text-white/75 hover:bg-white/10 hover:text-white" style={{ borderRadius: 6 }} onClick={() => { onCreateMotionPath(menu.trackId, option.type); setMenu(null) }}><MotionPathIcon type={option.type} />{option.label}</button>)}
    </div>, document.body) : null}
  </>
}

export function DirectorTimelineTour({ step, onSkip, onNext }: { step: number; onSkip: () => void; onNext: () => void }) {
  const messages = ["请选择一个人物或者摄像机后，可新建轨道", "在属性面板中点击菱形按钮，可记录当前位置关键帧", "拖动播放头预览人物和摄像机运动", "开启自动帧后，修改参数会自动记录关键帧", "完成动画后，可导出当前画面到画布"]
  return <div className="pointer-events-auto fixed bottom-[116px] left-[163px] z-[1700] h-[114px] w-[260px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#242424] p-4 text-white shadow-[0_4px_16px_rgba(0,0,0,0.18)]"><div className="h-[43px] text-[12px] leading-5 text-white/85">{messages[Math.max(0, Math.min(messages.length - 1, step - 1))]}</div><div className="mt-2 flex items-center justify-between"><span className="text-[12px] text-white/65">{step}/5</span><div className="flex items-center gap-2"><button type="button" className="h-8 rounded-lg px-3 text-[12px] text-white/65 hover:bg-white/8 hover:text-white" onClick={onSkip}>跳过</button><button type="button" className="h-8 rounded-lg bg-white/10 px-3 text-[12px] text-white/90 hover:bg-white/14" onClick={onNext}>{step >= 5 ? "完成" : "下一步"}</button></div></div></div>
}

function MotionVectorRow({ label, value, onChange }: { label: string; value: { x: number; y: number; z: number }; onChange: (axis: "x" | "y" | "z", value: number) => void }) {
  return <div className="mt-5"><div className="mb-[5px] text-[13px] text-white/60">{label}</div><div className="grid grid-cols-3 gap-1">{(["x", "y", "z"] as const).map((axis) => <label key={axis} className="flex h-7 items-center bg-white/10 px-2 text-[12px]" style={{ borderRadius: 8 }}><span className="mr-1 text-white/32">{axis.toUpperCase()}</span><input type="text" inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-right tabular-nums text-white/75 outline-none" value={Number(value[axis].toFixed(2))} onChange={(event) => onChange(axis, Number(event.target.value))} /></label>)}</div></div>
}

export function DirectorMotionTrackPanel({ activeName, activeObject, path, action, duration, onPathPatch, onActionChange }: { activeName: string; activeObject?: LibTvDirectorConsole3DObject; path?: LibTvDirectorConsole3DMotionPath; action?: LibTvDirectorConsole3DTimelineMotionAction; duration: number; drawing: boolean; onToggleDrawing: () => void; onPathPatch: (patch: Partial<LibTvDirectorConsole3DMotionPath>) => void; onActionChange: (patch: Partial<LibTvDirectorConsole3DTimelineMotionAction>) => void }) {
  if (!activeObject) return <div className="px-4 py-5 text-[12px] text-white/42">请选择人物后编辑运动轨迹</div>
  const pathPosition = path?.position || activeObject.position
  const pathRotation = path?.rotation || { x: 0, y: 0, z: 0 }
  const pathScale = path?.scale || { x: 1, y: 1, z: 1 }
  const uniformScale = (pathScale.x + pathScale.y + pathScale.z) / 3
  return <div className="min-h-full px-4 pb-5 pt-4">
    <div className="text-[13px] text-white/60">时长</div>
    <div className="mt-3 flex items-center gap-2"><input type="range" min={0.1} max={duration} step={0.1} value={action?.duration || duration} className="min-w-0 flex-1 accent-[#5DDCFF]" onChange={(event) => onActionChange({ duration: Number(event.target.value) })} /><input aria-label="轨迹时长" type="text" inputMode="decimal" className="h-7 w-[70px] bg-white/10 px-2 text-center text-[12px] tabular-nums text-white/75 outline-none" style={{ borderRadius: 8 }} value={Number((action?.duration || duration).toFixed(1))} onChange={(event) => onActionChange({ duration: Number(event.target.value) })} /></div>
    <MotionVectorRow label="位置" value={pathPosition} onChange={(axis, value) => onPathPatch({ position: { ...pathPosition, [axis]: value } })} />
    <MotionVectorRow label="旋转" value={pathRotation} onChange={(axis, value) => onPathPatch({ rotation: { ...pathRotation, [axis]: value } })} />
    <MotionVectorRow label="缩放" value={pathScale} onChange={(axis, value) => onPathPatch({ scale: { ...pathScale, [axis]: value } })} />
    <div className="mt-5"><div className="mb-[5px] text-[13px] text-white/60">统一缩放</div><div className="flex items-center gap-2"><input type="range" min={0.1} max={5} step={0.1} value={uniformScale} className="min-w-0 flex-1 accent-[#5DDCFF]" onChange={(event) => { const value = Number(event.target.value); onPathPatch({ scale: { x: value, y: value, z: value } }) }} /><input type="text" inputMode="decimal" className="h-7 w-[70px] bg-white/10 px-2 text-center text-[12px] text-white/75 outline-none" style={{ borderRadius: 8 }} value={Number(uniformScale.toFixed(1))} onChange={(event) => { const value = Number(event.target.value); onPathPatch({ scale: { x: value, y: value, z: value } }) }} /></div></div>
    <button type="button" role="switch" aria-checked={action?.orientToPath !== false} className="mt-3 flex h-7 w-full items-center justify-between text-[13px] text-white/85" onClick={() => onActionChange({ orientToPath: action?.orientToPath === false })}><span>绑定对象沿路径朝向</span><span className={["relative h-[14px] w-6 rounded-full transition-colors", action?.orientToPath !== false ? "bg-white" : "bg-white/20"].join(" ")}><span className={["absolute top-0.5 size-[10px] rounded-full transition-transform", action?.orientToPath !== false ? "translate-x-3 bg-[#1f1f1f]" : "translate-x-0.5 bg-white"].join(" ")} /></span></button>
    {!action ? <div className="mt-4 text-[12px] leading-5 text-white/38">请在时间轴对应人物轨道上点击“绘制轨迹”创建路径</div> : null}
    <div className="sr-only">{activeName}</div>
  </div>
}
