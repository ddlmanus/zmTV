"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { clone as cloneSkeletonObject } from "three/examples/jsm/utils/SkeletonUtils.js"
import { Box, Camera, Check, ChevronDown, CircleHelp, Clapperboard, Eye, EyeOff, Folder, FolderDown, Fullscreen, Grid2X2, ImageIcon, ImagePlus, Keyboard, ListChecks, Minimize2, MousePointer2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Redo2, RefreshCw, ScanLine, Search, Share2, SlidersHorizontal, Sparkles, Trash2, Undo2, Upload, User, Users, Video, WandSparkles, X } from "lucide-react"
import { message } from "@/workflow/ideart/shims/antd"
import { ColorfulLoader } from "@/workflow/ideart/components/ui/colorful-loader"
import type {
  LibTvDirectorConsole3DCamera,
  LibTvDirectorConsole3DCapture,
  LibTvDirectorConsole3DCharacterDetection,
  LibTvDirectorConsole3DDetectedCharacter,
  LibTvDirectorConsole3DDirective,
  LibTvDirectorConsole3DJointAngles,
  LibTvDirectorConsole3DMotionPath,
  LibTvDirectorConsole3DMotionPathType,
  LibTvDirectorConsole3DObject,
  LibTvDirectorConsole3DPanoramaAnchor,
  LibTvDirectorConsole3DPanoramaBinding,
  LibTvDirectorConsole3DPrimitive,
  LibTvDirectorConsole3DState,
  LibTvDirectorConsole3DTimeline,
  LibTvDirectorConsole3DTimelineMotionAction,
  LibTvDirectorConsole3DTimelineTrack,
  LibTvDirectorConsole3DVector3,
  LibTvWorkflowNode,
} from "@/workflow/ideart/lib/libtv/workflow"
import {
  LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT,
  LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer"
import { LibTvTransformControls } from "@/workflow/ideart/lib/libtv/director-console/transform-controls"
import {
  applyDirectorTimelineStateAtTime as applyPersistedDirectorTimelineStateAtTime,
  createDirectorConsoleMotionPath,
  createDirectorConsoleMotionPathAction,
  createDirectorConsoleDefaultTimeline,
  getDirectorConsoleMotionPathCenter,
  normalizeDirectorConsoleTimeline as normalizePersistedDirectorTimeline,
  sampleDirectorConsoleMotionPath,
} from "@/workflow/ideart/lib/libtv/director-console-timeline"
import { uploadCanvasNodeFile } from "../../libtv-upload-utils"
import { WorkflowHistoryDialog, type WorkflowHistoryFile } from "../../workflow-history-dialog"
import {
  WorkflowSelect,
  WorkflowSelectContent,
  WorkflowSelectGroup,
  WorkflowSelectItem,
  WorkflowSelectLabel,
  WorkflowSelectTrigger,
  WorkflowSelectValue,
} from "../../workflow-select"
import { TapNowNodeIcon } from "./workflow-node-icons"
import { clampWorkflowNumber, stopWorkflowNodeChromeEvent } from "./workflow-node-utils"
import { DirectorMotionTrackPanel, DirectorTimelinePanel, DirectorTimelineTour } from "./director-console-timeline-panel"

type DirectorConsoleUpstreamNode = {
  id: string
  kind: LibTvWorkflowNode["kind"]
  title?: string
  mediaUrl?: string
  mediaRole?: string
}

type DirectorConnectedPanoramaSource = {
  url: string
  nodeId?: string
}

export type LibTvDirectorConsole3DVideoExport = {
  videoBlob: Blob
  fileName: string
  duration: number
  aspectRatio: number
  width: number
  height: number
  mimeType: string
  cameraId?: string
}

const ZMTV_DIRECTOR_NODE_SURFACE_BACKGROUND = "var(--Surface-secondary-background, #262626)"
const ZMTV_DIRECTOR_NODE_SURFACE_BORDER = "1px solid rgba(0, 219, 205, 0.24)"
const ZMTV_DIRECTOR_NODE_SURFACE_SELECTED_SHADOW = "inset 0 0 0 1px rgba(0, 219, 205, 0.56), 0 0 10px rgba(0, 219, 205, 0.10)"
const ZMTV_DIRECTOR_NODE_SURFACE_SHADOW = "var(--canvas-shadow-panel, 0 4px 10px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.2))"
const DIRECTOR_STAGE_VIEWPORT_BACKGROUND = "#252a28"
const DIRECTOR_STAGE_GROUND_COLOR = 0x202523
const DIRECTOR_STAGE_GROUND_OPACITY = 0.98
const DIRECTOR_LEFT_RAIL_WIDTH = 72
const DIRECTOR_LEFT_DRAWER_WIDTH = 248

const DIRECTOR_CHARACTER_BODY_OPTIONS = [
  { id: "mannequin", label: "男性", menuLabel: "男性素体" },
  { id: "female", label: "女性", menuLabel: "女性素体" },
  { id: "broad", label: "宽厚", menuLabel: "宽厚素体" },
  { id: "muscular", label: "健壮", menuLabel: "健壮素体" },
  { id: "slim", label: "纤细", menuLabel: "纤细素体" },
  { id: "teen", label: "少年", menuLabel: "少年素体" },
  { id: "child", label: "儿童", menuLabel: "儿童素体" },
  { id: "chibi", label: "二头身", menuLabel: "二头身" },
] as const

type DirectorCharacterBodyType = typeof DIRECTOR_CHARACTER_BODY_OPTIONS[number]["id"]

function normalizeDirectorCharacterBodyType(value: unknown): DirectorCharacterBodyType | undefined {
  const normalized = String(value || "")
  return DIRECTOR_CHARACTER_BODY_OPTIONS.some((option) => option.id === normalized)
    ? normalized as DirectorCharacterBodyType
    : undefined
}

function getDirectorCharacterBodyOption(value: unknown) {
  const normalized = normalizeDirectorCharacterBodyType(value)
  return DIRECTOR_CHARACTER_BODY_OPTIONS.find((option) => option.id === normalized) || DIRECTOR_CHARACTER_BODY_OPTIONS[0]
}

function DirectorSceneCameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <rect x="1.75" y="4" width="7.5" height="6" rx="1.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="m9.25 5.6 3-1.8v6.4l-3-1.8V5.6Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}

function DirectorSceneCharacterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      <circle cx="7" cy="3.1" r="1.55" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M4.35 12.2V8.3c0-1.2.9-2.15 2.1-2.15h1.1c1.2 0 2.1.95 2.1 2.15v3.9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
      <path d="M5.5 8.9h3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}

function DirectorCameraSwitchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

function DirectorAiImportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M15.8252 12.0723C16.2157 11.6818 16.8497 11.6817 17.2402 12.0723L19.7266 14.5596C19.8825 14.7158 19.8826 14.9689 19.7266 15.125L19.2305 15.6201C19.0743 15.7763 18.8212 15.7763 18.665 15.6201L17.2822 14.2373V18.1289C17.2821 18.3497 17.1026 18.5283 16.8818 18.5283H16.1816C15.9608 18.5283 15.7814 18.3497 15.7812 18.1289V14.2373L14.4004 15.6191C14.2442 15.7753 13.9902 15.7753 13.834 15.6191L13.3398 15.124C13.1836 14.9678 13.1837 14.7148 13.3398 14.5586L15.8252 12.0723ZM15.8105 1.66797C17.2037 1.66811 18.334 2.79823 18.334 4.19141V10.1699C18.3338 10.3907 18.1544 10.5693 17.9336 10.5693H17.2334C17.0127 10.5691 16.8341 10.3906 16.834 10.1699V4.19141C16.834 3.62665 16.3753 3.16811 15.8105 3.16797H4.18945C3.62473 3.16811 3.16699 3.62665 3.16699 4.19141V8.41992H3.25586C8.27204 8.42027 12.3387 12.4877 12.3389 17.5039V17.8369C12.3389 18.1131 12.115 18.3369 11.8389 18.3369H10.8389V18.335H4.18945L4.05957 18.332C2.72698 18.2643 1.66729 17.1619 1.66699 15.8125V4.19141C1.66699 2.84179 2.72679 1.73961 4.05957 1.67188L4.18945 1.66797H15.8105ZM3.16699 15.8125C3.1673 16.377 3.62492 16.8348 4.18945 16.835H10.8076C10.4688 12.9606 7.21815 9.92123 3.25586 9.9209H3.16699V15.8125ZM13.0361 5.36035C14.0089 5.36053 14.7985 6.14933 14.7988 7.12207C14.7988 8.09512 14.0091 8.88459 13.0361 8.88477C12.0632 8.88454 11.2734 8.09509 11.2734 7.12207C11.2738 6.14936 12.0634 5.36058 13.0361 5.36035Z" fill="currentColor" />
    </svg>
  )
}

export function TapNowDirectorConsole3DNode({
  node,
  selected,
  upstreamNodes = [],
  onUpdateNode,
  onOpenDirectorConsole3D,
  onCreateDirectorConsoleCaptureNode,
  onCreateDirectorConsoleVideoNode,
  projectId,
}: {
  node: LibTvWorkflowNode
  selected: boolean
  upstreamNodes?: DirectorConsoleUpstreamNode[]
  onUpdateNode?: (id: string, patch: Partial<LibTvWorkflowNode["data"]>) => void
  onOpenDirectorConsole3D?: (id: string) => void
  onCreateDirectorConsoleCaptureNode?: (id: string, capture: LibTvDirectorConsole3DCapture, options?: { batchIndex?: number; batchTotal?: number }) => void
  onCreateDirectorConsoleVideoNode?: (id: string, exported: LibTvDirectorConsole3DVideoExport) => Promise<void> | void
  projectId?: string
}) {
  const [title, setTitle] = useState(String(node.data?.title || "3D 导演台"))
  const [consoleOpen, setConsoleOpen] = useState(false)
  const previewImageUrl = String(node.data?.previewImageUrl || "").trim()

  useEffect(() => {
    setTitle(String(node.data?.title || "3D 导演台"))
  }, [node.data?.title])

  useEffect(() => {
    setConsoleOpen(false)
  }, [node.id])

  const commitTitle = useCallback(() => {
    onUpdateNode?.(node.id, { title: title.trim() || "3D 导演台" })
  }, [node.id, onUpdateNode, title])
  const handleUpdateDirectorConsoleState = useCallback((state: LibTvDirectorConsole3DState) => {
    const serializedState = serializeDirectorConsoleState(state)
    onUpdateNode?.(node.id, { directorConsole3D: serializedState, compositionData: serializedState })
  }, [node.id, onUpdateNode])
  const handleOpenDirectorConsole = useCallback(() => {
    onOpenDirectorConsole3D?.(node.id)
    setConsoleOpen(true)
  }, [node.id, onOpenDirectorConsole3D])
  const handleUpdateDirectorPreview = useCallback((previewUrl: string) => {
    const nextPreviewUrl = String(previewUrl || "").trim()
    if (!nextPreviewUrl) return
    onUpdateNode?.(node.id, { previewImageUrl: nextPreviewUrl })
  }, [node.id, onUpdateNode])
  const handlePanoramaEditApplied = useCallback((nextUrl: string, sourceNodeId?: string) => {
    const editedUrl = String(nextUrl || "").trim()
    if (!editedUrl) return
    if (sourceNodeId) onUpdateNode?.(sourceNodeId, { mediaUrl: editedUrl })
    onUpdateNode?.(node.id, {
      panoramaUrl: editedUrl,
      panoramaSource: sourceNodeId ? "connected" : "director",
      panoramaNodeId: sourceNodeId,
    })
  }, [node.id, onUpdateNode])
  return (
    <div
      className="group node-shell relative h-full w-full overflow-visible text-fg-default"
      data-testid={`canvas-node-director-console-3d-${node.id}`}
      style={{ minWidth: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH, minHeight: LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_HEIGHT }}
    >
      <div
        className="workflow-node-title-bar node-floating-ui absolute left-0 origin-bottom-left text-fg-muted"
        style={{
          top: -28,
          zIndex: 10,
          width: Math.max(0, Number(node.width || LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH) - 9.5),
          maxWidth: Math.max(0, Number(node.width || LIBTV_TAPNOW_DIRECTOR_CONSOLE_3D_WIDTH) - 9.5),
          height: 24,
        }}
      >
        <div className="flex h-6 w-full min-w-0 cursor-pointer items-center gap-1">
          <span className="flex shrink-0 items-center">
            <TapNowNodeIcon kind="director-console-3d" size={14} opacity={0.9} />
          </span>
          <div className="relative min-w-0 flex-1" style={{ height: 18 }}>
            <span className="pointer-events-none invisible block truncate text-[13px] leading-[18px]" aria-hidden="true">
              {title || "3D 导演台"}
            </span>
            <input
              className="nodrag nopan nowheel absolute inset-0 h-[18px] w-full cursor-text truncate border-0 bg-transparent p-0 text-[13px] leading-[18px] text-fg-muted outline-none"
              value={title}
              title={title || "3D 导演台"}
              placeholder="3D 导演台"
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === "Enter") {
                  event.preventDefault()
                  event.currentTarget.blur()
                }
              }}
            />
          </div>
        </div>
      </div>

      <div
        className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-xl"
        style={{
          background: ZMTV_DIRECTOR_NODE_SURFACE_BACKGROUND,
          border: ZMTV_DIRECTOR_NODE_SURFACE_BORDER,
          borderRadius: 12,
          backdropFilter: "blur(1.5px)",
          boxShadow: selected ? ZMTV_DIRECTOR_NODE_SURFACE_SELECTED_SHADOW : ZMTV_DIRECTOR_NODE_SURFACE_SHADOW,
        }}
      >
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 px-8 py-8">
          {previewImageUrl ? (
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <img src={previewImageUrl} alt="构图预览" className="h-full w-full object-cover" draggable={false} />
            </div>
          ) : (
            <>
              <div className="relative z-10 flex flex-col items-center gap-4 text-center">
                <div className="flex h-[66px] w-[66px] items-center justify-center" aria-hidden="true">
                  <span className="text-white/25 canvas-light:text-neutral-400">
                    <TapNowNodeIcon kind="director-console-3d" size={36} opacity={1} />
                  </span>
                </div>
                <p className="text-center text-[13px] font-normal leading-[18px] text-white/85 canvas-light:text-neutral-600">
                  在 3D 空间中搭建场景并输出多视角画面
                </p>
              </div>
              <button
                type="button"
                className="nodrag relative z-10 flex h-8 min-w-12 items-center justify-center rounded-lg border border-white/8 bg-white/10 px-3 py-1 text-[13px] font-normal leading-[18px] text-white/85 transition-[background,opacity,transform] hover:bg-white/15 canvas-light:border-neutral-200 canvas-light:bg-neutral-100 canvas-light:text-neutral-800 canvas-light:hover:bg-neutral-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                onPointerDown={stopWorkflowNodeChromeEvent}
                onMouseDown={stopWorkflowNodeChromeEvent}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleOpenDirectorConsole()
                }}
              >
                打开 3D 导演台
              </button>
            </>
          )}
          {previewImageUrl ? (
            <button
              type="button"
              className="nodrag absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
              style={{ background: "rgba(109,91,208,0.75)", boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleOpenDirectorConsole()
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              进入编辑
            </button>
          ) : null}
        </div>
      </div>
      {consoleOpen ? (
        <DirectorConsole3DOverlay
          key={node.id}
          node={node}
          upstreamNodes={upstreamNodes}
          projectId={projectId}
          onClose={() => setConsoleOpen(false)}
          onUpdateState={handleUpdateDirectorConsoleState}
          onUpdatePreview={handleUpdateDirectorPreview}
          onPanoramaEditApplied={handlePanoramaEditApplied}
          onCreateCaptureNode={(capture, options) => onCreateDirectorConsoleCaptureNode?.(node.id, capture, options)}
          onCreateVideoNode={(exported) => onCreateDirectorConsoleVideoNode?.(node.id, exported)}
        />
      ) : null}
    </div>
  )
}

const DIRECTOR_CONSOLE_DEFAULT_STATE: LibTvDirectorConsole3DState = {
  objects: [
    {
      id: "role-a",
      name: "人物A",
      kind: "character",
      primitive: "box",
      color: "#4F8EF7",
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: getDirectorCharacterPresetScaleVector("mannequin"),
      uniformScale: 1,
      shadowEnabled: false,
      panoramaGroundSnapEnabled: false,
      visible: true,
      locked: false,
      pose: "stand",
      bodyType: "mannequin",
    },
  ],
  cameras: [
    {
	      id: "camera-1",
      name: "机位1",
      position: { x: 0, y: 2.2, z: 10 },
      target: { x: 0, y: 1.2, z: 0 },
      rotation: { x: 5.71, y: 180, z: 0 },
      fov: 50,
	      aspectRatio: "Auto",
      visible: true,
      captures: [],
    },
  ],
  selectedObjectIds: [],
  directives: [],
  activeObjectId: "camera-1",
  activeCameraId: "camera-1",
  backgroundColor: DIRECTOR_STAGE_VIEWPORT_BACKGROUND,
  skyColor: DIRECTOR_STAGE_VIEWPORT_BACKGROUND,
  sceneScale: 3,
  scenePosition: { x: 0, y: 0, z: 0 },
  sceneRotation: { x: 0, y: 0, z: 0 },
  panoramaRotation: 0,
  panoramaRadius: 60,
  screenPlacementEnabled: false,
  screenPlacementDepth: 10,
  gaussianGroundSnapEnabled: false,
  showCharacterLabels: true,
  groundVisible: true,
	  groundOpacity: DIRECTOR_STAGE_GROUND_OPACITY,
  groundHeight: 0,
  gridSnap: false,
  transformMode: "translate",
  timeline: createDirectorConsoleDefaultTimeline(),
}

const DIRECTOR_SCENE_CAMERA_POSITION: LibTvDirectorConsole3DVector3 = { x: 0, y: 2.2, z: 10 }
const DIRECTOR_SCENE_CAMERA_TARGET: LibTvDirectorConsole3DVector3 = { x: 0, y: 1.2, z: 0 }
const DIRECTOR_SCENE_OBJECT_SPAWN_POSITION: LibTvDirectorConsole3DVector3 = { x: 0, y: 0, z: 0 }
const DIRECTOR_CHARACTER_COLORS = ["#4F8EF7", "#E35B4F", "#24C978", "#F5B84B", "#B579FF", "#5FE8FF"]

type DirectorSceneTreeItem = {
  id: string
  name: string
  type: "group" | "camera" | LibTvDirectorConsole3DObject["kind"]
  visible: boolean
  locked: boolean
  objectIds: string[]
  depth?: number
  parentGroupId?: string
}

type DirectorSceneTreeContextMenu = {
  item: DirectorSceneTreeItem
  x: number
  y: number
} | null

function directorCharacterAssetUrl(filename: string) {
  return `/assets/3d-characters/${encodeURIComponent(filename)}`
}

function getDirectorConsoleImageRenderUrl(src: string) {
  const value = String(src || "").trim()
  if (!value) return ""
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("/api/image-proxy?")) return value
  if (/^https?:\/\//i.test(value)) return `/api/image-proxy?url=${encodeURIComponent(value)}`
  return value
}

function getDirectorConsoleModelLoadUrl(src: string) {
  const value = String(src || "").trim()
  if (!value) return ""
  if (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("/api/image-proxy?")) return value
  if (/^https?:\/\//i.test(value)) return `/api/image-proxy?proxyOnly=1&url=${encodeURIComponent(value)}`
  return value
}

function cloneDirectorConsoleVector(value: Partial<LibTvDirectorConsole3DVector3> | undefined, fallback: LibTvDirectorConsole3DVector3): LibTvDirectorConsole3DVector3 {
  return {
    x: Number.isFinite(Number(value?.x)) ? Number(value?.x) : fallback.x,
    y: Number.isFinite(Number(value?.y)) ? Number(value?.y) : fallback.y,
    z: Number.isFinite(Number(value?.z)) ? Number(value?.z) : fallback.z,
  }
}

function getDirectorEnvironmentFingerprint(value: string | undefined) {
  const source = String(value || "").trim()
  if (!source) return ""
  const sampled = source.length <= 8192 ? source : `${source.slice(0, 4096)}${source.slice(-4096)}`
  let hash = 2166136261
  for (let index = 0; index < sampled.length; index += 1) {
    hash ^= sampled.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `image-${source.length.toString(36)}-${(hash >>> 0).toString(36)}`
}

function normalizeDirectorCharacterDetection(
  value: unknown,
  objectIds: Set<string>,
): LibTvDirectorConsole3DCharacterDetection | undefined {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<LibTvDirectorConsole3DCharacterDetection>
    : null
  const sourceFingerprint = String(raw?.sourceFingerprint || "").trim().slice(0, 120)
  if (!raw || !sourceFingerprint) return undefined
  const status = raw.status === "pending" || raw.status === "failed" ? raw.status : "succeeded"
  const projection = raw.projection === "flat" || raw.projection === "equirectangular" ? raw.projection : undefined
  const detections = Array.isArray(raw.detections)
    ? raw.detections.map((item, index) => {
      const rect = normalizeDirectorDirectiveRect(item?.bbox)
      const footPoint = item?.footPoint && typeof item.footPoint === "object" ? item.footPoint : { x: rect.x + rect.width / 2, y: rect.y + rect.height }
      const facing = item?.facing === "away" || item?.facing === "left" || item?.facing === "right" ? item.facing : "camera"
      return {
        id: String(item?.id || `person-${index + 1}`).slice(0, 80),
        label: typeof item?.label === "string" ? item.label.slice(0, 60) : undefined,
        bbox: rect,
        footPoint: {
          x: clampWorkflowNumber(Number(footPoint.x), rect.x, rect.x + rect.width),
          y: clampWorkflowNumber(Number(footPoint.y), rect.y, Math.min(1, rect.y + rect.height + 0.03)),
        },
        bodyType: normalizeDirectorCharacterBodyType(item?.bodyType) || "mannequin",
        poseId: typeof item?.poseId === "string" ? item.poseId.slice(0, 48) : "stand",
        facing,
        confidence: clampWorkflowNumber(Number(item?.confidence ?? 0.8), 0, 1),
      } satisfies LibTvDirectorConsole3DDetectedCharacter
    }).slice(0, 40)
    : []
  return {
    sourceFingerprint,
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl.slice(0, 4000) : undefined,
    status,
    projection,
    detections,
    characterObjectIds: Array.isArray(raw.characterObjectIds)
      ? Array.from(new Set(raw.characterObjectIds.map(String).filter((id) => objectIds.has(id)))).slice(0, 40)
      : [],
    modelId: typeof raw.modelId === "string" ? raw.modelId.slice(0, 160) : undefined,
    error: typeof raw.error === "string" ? raw.error.slice(0, 500) : undefined,
    detectedAt: Number.isFinite(Number(raw.detectedAt)) ? Number(raw.detectedAt) : undefined,
  }
}

function getDirectorCameraRotationFromTarget(
  position: LibTvDirectorConsole3DVector3,
  target: LibTvDirectorConsole3DVector3,
): LibTvDirectorConsole3DVector3 {
  const dx = target.x - position.x
  const dy = target.y - position.y
  const dz = target.z - position.z
  const horizontalDistance = Math.max(0.0001, Math.hypot(dx, dz))
  return {
    x: Number(THREE.MathUtils.radToDeg(Math.atan2(-dy, horizontalDistance)).toFixed(2)),
    y: Number(THREE.MathUtils.radToDeg(Math.atan2(dx, dz)).toFixed(2)),
    z: 0,
  }
}

function getDirectorCameraTargetFromRotation(
  position: LibTvDirectorConsole3DVector3,
  rotation: LibTvDirectorConsole3DVector3,
  currentTarget: LibTvDirectorConsole3DVector3,
): LibTvDirectorConsole3DVector3 {
  const distance = Math.max(
    0.1,
    Math.hypot(currentTarget.x - position.x, currentTarget.y - position.y, currentTarget.z - position.z),
  )
  const pitch = THREE.MathUtils.degToRad(-rotation.x)
  const yaw = THREE.MathUtils.degToRad(rotation.y)
  const cosPitch = Math.cos(pitch)
  return {
    x: Number((position.x + Math.sin(yaw) * cosPitch * distance).toFixed(3)),
    y: Number((position.y + Math.sin(pitch) * distance).toFixed(3)),
    z: Number((position.z + Math.cos(yaw) * cosPitch * distance).toFixed(3)),
  }
}

function applyDirectorCameraPatch(
  camera: LibTvDirectorConsole3DCamera,
  patch: Partial<LibTvDirectorConsole3DCamera>,
): LibTvDirectorConsole3DCamera {
  const position = cloneDirectorConsoleVector(patch.position || camera.position, DIRECTOR_SCENE_CAMERA_POSITION)
  let target = cloneDirectorConsoleVector(patch.target || camera.target, DIRECTOR_SCENE_CAMERA_TARGET)
  let rotation = cloneDirectorConsoleVector(
    patch.rotation || camera.rotation,
    getDirectorCameraRotationFromTarget(position, target),
  )
  if (patch.rotation) target = getDirectorCameraTargetFromRotation(position, rotation, target)
  else if (patch.position || patch.target) rotation = getDirectorCameraRotationFromTarget(position, target)
  return { ...camera, ...patch, position, target, rotation }
}

type DirectorResolvedJointAngles = {
  root: { height: number; pitch: number; roll: number }
  body: { bend: number; turn: number; tilt: number }
  torso: { bend: number; turn: number; tilt: number }
  head: { nod: number; turn: number; tilt: number }
  l_arm: { raise: number; straddle: number; turn: number }
  r_arm: { raise: number; straddle: number; turn: number }
  l_elbow: { bend: number }
  r_elbow: { bend: number }
  l_wrist: { bend: number; turn: number; tilt: number }
  r_wrist: { bend: number; turn: number; tilt: number }
  l_leg: { raise: number; straddle: number; turn: number }
  r_leg: { raise: number; straddle: number; turn: number }
  l_knee: { bend: number }
  r_knee: { bend: number }
  l_ankle: { bend: number; turn: number; tilt: number }
  r_ankle: { bend: number; turn: number; tilt: number }
}

function cloneDirectorJointAngles(value: LibTvDirectorConsole3DJointAngles): DirectorResolvedJointAngles {
  return {
    root: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.root, ...value.root },
    body: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.body, ...value.body },
    torso: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.torso, ...value.torso },
    head: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.head, ...value.head },
    l_arm: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.l_arm, ...value.l_arm },
    r_arm: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.r_arm, ...value.r_arm },
    l_elbow: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.l_elbow, ...value.l_elbow },
    r_elbow: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.r_elbow, ...value.r_elbow },
    l_wrist: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.l_wrist, ...value.l_wrist },
    r_wrist: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.r_wrist, ...value.r_wrist },
    l_leg: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.l_leg, ...value.l_leg },
    r_leg: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.r_leg, ...value.r_leg },
    l_knee: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.l_knee, ...value.l_knee },
    r_knee: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.r_knee, ...value.r_knee },
    l_ankle: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.l_ankle, ...value.l_ankle },
    r_ankle: { ...DIRECTOR_DEFAULT_JOINT_ANGLES.r_ankle, ...value.r_ankle },
  }
}

function normalizeDirectorJointAngles(value: unknown): DirectorResolvedJointAngles | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return cloneDirectorJointAngles(value as LibTvDirectorConsole3DJointAngles)
}

function getDirectorPosePreset(poseId: string | undefined) {
  return DIRECTOR_POSE_PRESETS.find((pose) => pose.id === poseId) || DIRECTOR_POSE_PRESETS[0]
}

function areDirectorJointAnglesEqual(a: LibTvDirectorConsole3DJointAngles, b: LibTvDirectorConsole3DJointAngles) {
  return JSON.stringify(cloneDirectorJointAngles(a)) === JSON.stringify(cloneDirectorJointAngles(b))
}

function isDirectorLegacySpreadStandPose(value: LibTvDirectorConsole3DJointAngles) {
  const angles = cloneDirectorJointAngles(value)
  const legacyStraddle = (angles.l_arm.straddle === 7 && angles.r_arm.straddle === 7)
    || (angles.l_arm.straddle === 12 && angles.r_arm.straddle === 14)
  return legacyStraddle
    && angles.l_arm.raise === -5
    && angles.r_arm.raise === -5
    && angles.l_arm.turn === 0
    && angles.r_arm.turn === 0
    && angles.l_elbow.bend === 15
    && angles.r_elbow.bend === 15
}

function normalizeDirectorObjectJointAngles(object: Partial<LibTvDirectorConsole3DObject> | undefined): DirectorResolvedJointAngles | undefined {
  const jointAngles = normalizeDirectorJointAngles(object?.jointAngles)
  if (!jointAngles) return undefined
  if (object?.pose === "stand" && (
    areDirectorJointAnglesEqual(jointAngles, DIRECTOR_DEFAULT_JOINT_ANGLES)
    || isDirectorLegacySpreadStandPose(jointAngles)
  )) {
    return cloneDirectorJointAngles(getDirectorPosePreset("stand").jointAngles)
  }
  return jointAngles
}

function getDirectorCharacterPresetScaleVector(bodyType: string | undefined): LibTvDirectorConsole3DVector3 {
  const scale = getDirectorCharacterModelPreset(bodyType).scale
  return { x: scale, y: scale, z: scale }
}

function normalizeDirectorObjectScale(object: Partial<LibTvDirectorConsole3DObject> | undefined): LibTvDirectorConsole3DVector3 {
  const scale = cloneDirectorConsoleVector(object?.scale, { x: 1, y: 1, z: 1 })
  const isBuiltInCharacter = object?.kind === "character" && !object.modelUrl
  const isLegacyUnitScale = scale.x === 1 && scale.y === 1 && scale.z === 1
  if (isBuiltInCharacter && (!object?.scale || isLegacyUnitScale)) return getDirectorCharacterPresetScaleVector(object.bodyType)
  return scale
}

function normalizeDirectorConsoleState(value: unknown): LibTvDirectorConsole3DState {
  const raw = value && typeof value === "object" ? value as Partial<LibTvDirectorConsole3DState> : {}
  const fallback = DIRECTOR_CONSOLE_DEFAULT_STATE
  const hasExplicitDirectorConsoleState = Boolean(value && typeof value === "object" && !Array.isArray(value) && (
    "objects" in raw || "cameras" in raw || "directives" in raw || "environmentUrl" in raw || "environmentProjection" in raw || "backgroundColor" in raw
  ))
  const isEmptyDirectorConsoleState = (!Array.isArray(raw.objects) || raw.objects.length === 0)
    && (!Array.isArray(raw.cameras) || raw.cameras.length === 0)
    && typeof raw.activeObjectId !== "string"
    && typeof raw.activeCameraId !== "string"
  if (isEmptyDirectorConsoleState) {
    if (!hasExplicitDirectorConsoleState) return cloneDirectorConsoleStateForHistory(DIRECTOR_CONSOLE_DEFAULT_STATE)
    return {
      ...cloneDirectorConsoleStateForHistory(DIRECTOR_CONSOLE_DEFAULT_STATE),
      objects: [],
      cameras: [],
      selectedObjectIds: [],
      activeGroupId: undefined,
      activeObjectId: undefined,
      activeCameraId: undefined,
    }
  }
  const looksLikeOldSingleRoleDefault = Array.isArray(raw.objects)
    && raw.objects.length === 1
    && raw.objects[0]?.id === "role-a"
    && (raw.objects[0]?.name === "人物A" || raw.objects[0]?.name === "角色A")
    && (raw.objects[0]?.kind === "character" || !raw.objects[0]?.kind)
    && (!raw.objects[0]?.position || (
      Number(raw.objects[0]?.position?.x || 0) === 0
      && Number(raw.objects[0]?.position?.y || 0) === 0
      && Number(raw.objects[0]?.position?.z || 0) === 0
    ))
    && Array.isArray(raw.cameras)
    && raw.cameras.length === 1
    && raw.cameras[0]?.id === "camera-1"
    && !raw.objectGroups?.length
    && !raw.directives?.length
    && !raw.characterDetection
    && !raw.environmentUrl
  if (looksLikeOldSingleRoleDefault) {
    return cloneDirectorConsoleStateForHistory(DIRECTOR_CONSOLE_DEFAULT_STATE)
  }
	  const objects = Array.isArray(raw.objects)
	    ? raw.objects.map((object, index) => ({
	      id: String(object?.id || `object-${index + 1}`),
	      name: String(object?.name || `元素${index + 1}`),
	      kind: object?.kind === "character" || object?.kind === "primitive" || object?.kind === "crowd" || object?.kind === "uploaded" ? object.kind : "primitive",
      primitive: object?.primitive === "sphere" || object?.primitive === "cylinder" || object?.primitive === "torus" || object?.primitive === "cone" || object?.primitive === "pyramid" || object?.primitive === "plane" || object?.primitive === "box" ? object.primitive : "box",
      color: String(object?.color || "#8fb8ff"),
      position: cloneDirectorConsoleVector(object?.position, { x: 0, y: 0, z: 0 }),
      rotation: cloneDirectorConsoleVector(object?.rotation, { x: 0, y: 0, z: 0 }),
      scale: normalizeDirectorObjectScale(object),
      uniformScale: Number.isFinite(Number(object?.uniformScale))
        ? clampWorkflowNumber(Number(object?.uniformScale), 0.05, 10)
        : object?.kind === "character" ? 1 : undefined,
      shadowEnabled: object?.kind === "character" ? object.shadowEnabled === true : undefined,
      panoramaGroundSnapEnabled: object?.kind === "character" ? object.panoramaGroundSnapEnabled === true : undefined,
      panoramaBinding: normalizeDirectorPanoramaBinding(object?.panoramaBinding),
      visible: object?.visible !== false,
      locked: Boolean(object?.locked),
      groupId: typeof object?.groupId === "string" ? object.groupId : undefined,
      pose: typeof object?.pose === "string" ? object.pose : undefined,
      jointAngles: normalizeDirectorObjectJointAngles(object),
      bodyType: typeof object?.bodyType === "string" ? object.bodyType : undefined,
      crowdCount: Number.isFinite(Number(object?.crowdCount)) ? Math.max(1, Math.min(80, Math.round(Number(object?.crowdCount)))) : undefined,
      crowdRows: Number.isFinite(Number(object?.crowdRows)) ? Math.max(1, Math.min(12, Math.round(Number(object?.crowdRows)))) : undefined,
      crowdCols: Number.isFinite(Number(object?.crowdCols)) ? Math.max(1, Math.min(12, Math.round(Number(object?.crowdCols)))) : undefined,
      crowdSpacing: Number.isFinite(Number(object?.crowdSpacing)) ? clampWorkflowNumber(Number(object?.crowdSpacing), 0.2, 4) : undefined,
      modelUrl: typeof object?.modelUrl === "string" ? object.modelUrl : undefined,
      parentObjectId: typeof object?.parentObjectId === "string" ? object.parentObjectId : undefined,
      attachBone: object?.attachBone === "leftHand" || object?.attachBone === "rightHand" ? object.attachBone : undefined,
    }))
    : fallback.objects.map((object) => ({
      ...object,
      position: cloneDirectorConsoleVector(object.position, { x: 0, y: 0, z: 0 }),
      rotation: cloneDirectorConsoleVector(object.rotation, { x: 0, y: 0, z: 0 }),
      scale: cloneDirectorConsoleVector(object.scale, { x: 1, y: 1, z: 1 }),
	      jointAngles: object.jointAngles ? cloneDirectorJointAngles(object.jointAngles) : undefined,
	      panoramaBinding: normalizeDirectorPanoramaBinding(object.panoramaBinding),
	    }))
	  const cameras = Array.isArray(raw.cameras)
	    ? raw.cameras.map((camera, index) => ({
	      id: String(camera?.id || `camera-${index + 1}`),
	      name: String(camera?.name || `机位${index + 1}`),
	      position: cloneDirectorConsoleVector(camera?.position, DIRECTOR_SCENE_CAMERA_POSITION),
      target: cloneDirectorConsoleVector(camera?.target, DIRECTOR_SCENE_CAMERA_TARGET),
      rotation: cloneDirectorConsoleVector(
        camera?.rotation,
        getDirectorCameraRotationFromTarget(
          cloneDirectorConsoleVector(camera?.position, DIRECTOR_SCENE_CAMERA_POSITION),
          cloneDirectorConsoleVector(camera?.target, DIRECTOR_SCENE_CAMERA_TARGET),
        ),
      ),
      targetObjectId: typeof camera?.targetObjectId === "string" ? camera.targetObjectId : undefined,
      fov: clampWorkflowNumber(Number(camera?.fov || 50), 15, 90),
      aspectRatio: typeof camera?.aspectRatio === "string" ? camera.aspectRatio : "16:9",
      visible: camera?.visible !== false,
      locked: Boolean(camera?.locked),
      captures: Array.isArray(camera?.captures) ? camera.captures.slice(0, 40) : [],
    }))
    : fallback.cameras.map((camera) => ({
      ...camera,
      position: cloneDirectorConsoleVector(camera.position, DIRECTOR_SCENE_CAMERA_POSITION),
      target: cloneDirectorConsoleVector(camera.target, DIRECTOR_SCENE_CAMERA_TARGET),
      rotation: cloneDirectorConsoleVector(camera.rotation, getDirectorCameraRotationFromTarget(camera.position, camera.target)),
      captures: Array.isArray(camera.captures) ? camera.captures.slice(0, 40) : [],
    }))
  const objectIds = new Set(objects.map((object) => object.id))
  const directives = Array.isArray(raw.directives)
    ? raw.directives
      .map((directive, index) => {
        const rect = normalizeDirectorDirectiveRect(directive?.rect)
        const status = directive?.status === "planning" || directive?.status === "applied" || directive?.status === "error"
          ? directive.status
          : "draft"
        const facing = directive?.facing === "camera" || directive?.facing === "away" || directive?.facing === "left" || directive?.facing === "right"
          ? directive.facing
          : "keep"
        const action = directive?.action === "add" || directive?.action === "edit" || directive?.action === "remove" || directive?.action === "panorama"
          ? directive.action
          : "character"
        const panoramaOperation = directive?.panoramaOperation === "add" || directive?.panoramaOperation === "remove"
          ? directive.panoramaOperation
          : "edit"
        const targetObjectId = objectIds.has(String(directive?.targetObjectId || "")) ? String(directive?.targetObjectId) : undefined
        const targetObjectIds = Array.from(new Set([
          ...(Array.isArray(directive?.targetObjectIds) ? directive.targetObjectIds.map(String) : []),
          ...(targetObjectId ? [targetObjectId] : []),
        ].filter((id) => objectIds.has(id))))
        const targetCharacterPreset = action !== "character" || targetObjectId
          ? undefined
          : normalizeDirectorCharacterBodyType(directive?.targetCharacterPreset) || "mannequin"
        const generationStatus = directive?.generationStatus === "submitting"
          || directive?.generationStatus === "processing"
          || directive?.generationStatus === "succeeded"
          || directive?.generationStatus === "failed"
          ? directive.generationStatus
          : "idle"
        return {
          id: String(directive?.id || `directive-${index + 1}`),
          name: String(directive?.name || `调度 ${index + 1}`).slice(0, 40),
          rect,
          panoramaAnchor: normalizeDirectorPanoramaAnchor(directive?.panoramaAnchor),
          panoramaBinding: normalizeDirectorPanoramaBinding(directive?.panoramaBinding),
          prompt: String(directive?.prompt || "").slice(0, 2000),
          action,
          panoramaOperation: action === "panorama" ? panoramaOperation : undefined,
          targetObjectId,
          targetObjectIds,
          targetCharacterPreset,
          attachmentMode: directive?.attachmentMode === "none" || directive?.attachmentMode === "leftHand" || directive?.attachmentMode === "rightHand"
            ? directive.attachmentMode
            : "auto",
          attachmentCharacterId: objectIds.has(String(directive?.attachmentCharacterId || ""))
            ? String(directive.attachmentCharacterId)
            : undefined,
          referenceImageUrl: typeof directive?.referenceImageUrl === "string" ? directive.referenceImageUrl : undefined,
          generationStatus,
          generationTaskId: typeof directive?.generationTaskId === "string" ? directive.generationTaskId : undefined,
          generationModelRuntimeId: typeof directive?.generationModelRuntimeId === "string" ? directive.generationModelRuntimeId : undefined,
          generatedModelUrl: typeof directive?.generatedModelUrl === "string" ? directive.generatedModelUrl : undefined,
          generationError: typeof directive?.generationError === "string" ? directive.generationError.slice(0, 500) : undefined,
          status,
          poseId: typeof directive?.poseId === "string" ? directive.poseId : undefined,
          facing,
          position: directive?.position ? cloneDirectorConsoleVector(directive.position, { x: 0, y: 0, z: 0 }) : undefined,
          summary: typeof directive?.summary === "string" ? directive.summary.slice(0, 240) : undefined,
          createdAt: Number.isFinite(Number(directive?.createdAt)) ? Number(directive?.createdAt) : undefined,
        } satisfies LibTvDirectorConsole3DDirective
      })
      .slice(0, 32)
    : []
  const objectGroups = Array.isArray(raw.objectGroups)
    ? raw.objectGroups
      .map((group, index) => ({
        id: String(group?.id || `group-${index + 1}`),
        name: String(group?.name || `人物组${index + 1}`),
        objectIds: Array.isArray(group?.objectIds) ? group.objectIds.map(String).filter((id) => objectIds.has(id)) : [],
      }))
      .filter((group) => group.objectIds.length > 1)
    : []
  const selectedObjectIds = Array.isArray(raw.selectedObjectIds) ? raw.selectedObjectIds.map(String).filter((id) => objectIds.has(id)) : []
  const activeCameraId = cameras.some((camera) => camera.id === raw.activeCameraId) ? raw.activeCameraId : cameras[0]?.id
  const rawActiveObjectId = typeof raw.activeObjectId === "string" ? raw.activeObjectId : undefined
  const isLegacyDefaultCharacterSelection = rawActiveObjectId === "role-a"
    && selectedObjectIds.length === 1
    && selectedObjectIds[0] === "role-a"
    && objects.some((object) => object.id === "role-a")
    && cameras.some((camera) => camera.id === "camera-1")
  const rawActiveIsValid = !isLegacyDefaultCharacterSelection && Boolean(rawActiveObjectId && (
    objects.some((object) => object.id === rawActiveObjectId)
      || cameras.some((camera) => camera.id === rawActiveObjectId)
  ))
  const activeObjectId = rawActiveIsValid ? rawActiveObjectId : undefined
  const resolvedActiveObjectId = activeObjectId
  const activeIsObject = Boolean(activeObjectId && objectIds.has(activeObjectId))
  const normalizedSelectedObjectIds = activeIsObject
    ? (selectedObjectIds.length > 0 ? selectedObjectIds : activeObjectId ? [activeObjectId] : [])
    : []
  const characterDetection = normalizeDirectorCharacterDetection(raw.characterDetection, objectIds)
  const timeline = normalizePersistedDirectorTimeline(raw.timeline || raw, { objects, cameras })
  const rawBackgroundColor = typeof raw.backgroundColor === "string" ? raw.backgroundColor : DIRECTOR_STAGE_VIEWPORT_BACKGROUND
  const rawSkyColor = typeof raw.skyColor === "string" ? raw.skyColor : rawBackgroundColor
  const migrateViewportColor = (color: string) => color.toLowerCase() === "#060608" || color.toLowerCase() === "#393939"
    ? DIRECTOR_STAGE_VIEWPORT_BACKGROUND
    : color
  const rawGroundOpacity = Number(raw.groundOpacity ?? fallback.groundOpacity ?? DIRECTOR_STAGE_GROUND_OPACITY)
  const groundOpacity = rawGroundOpacity === 0.4 || rawGroundOpacity === 0.56 || rawGroundOpacity === 0.96
    ? DIRECTOR_STAGE_GROUND_OPACITY
    : clampWorkflowNumber(rawGroundOpacity, 0, 1)
  return {
    objects,
    cameras,
    directives,
    objectGroups,
    selectedObjectIds: normalizedSelectedObjectIds,
    activeGroupId: objectGroups.some((group) => group.id === raw.activeGroupId) ? raw.activeGroupId : undefined,
    activeObjectId: resolvedActiveObjectId,
    activeCameraId,
    backgroundColor: migrateViewportColor(rawBackgroundColor),
    environmentUrl: typeof raw.environmentUrl === "string" ? raw.environmentUrl : undefined,
    environmentSourceUrl: typeof raw.environmentSourceUrl === "string" ? raw.environmentSourceUrl : undefined,
    environmentProjection: raw.environmentProjection === "flat" || raw.environmentProjection === "equirectangular" ? raw.environmentProjection : undefined,
    characterDetection,
    gridSnap: Boolean(raw.gridSnap),
    sceneScale: clampWorkflowNumber(Number(raw.sceneScale ?? fallback.sceneScale ?? 3), 0.1, 10),
    scenePosition: cloneDirectorConsoleVector(raw.scenePosition, fallback.scenePosition || { x: 0, y: 0, z: 0 }),
    sceneRotation: cloneDirectorConsoleVector(raw.sceneRotation, fallback.sceneRotation || { x: 0, y: 0, z: 0 }),
    skyColor: migrateViewportColor(rawSkyColor),
    panoramaRotation: clampWorkflowNumber(Number(raw.panoramaRotation ?? fallback.panoramaRotation ?? 0), 0, 360),
    panoramaRadius: clampWorkflowNumber(Number(raw.panoramaRadius || fallback.panoramaRadius || 60), 10, 500),
    screenPlacementEnabled: false,
    screenPlacementDepth: clampWorkflowNumber(Number(raw.screenPlacementDepth ?? fallback.screenPlacementDepth ?? 10), 1, 80),
    gaussianGroundSnapEnabled: raw.gaussianGroundSnapEnabled === true,
    showCharacterLabels: raw.showCharacterLabels !== false,
    groundVisible: raw.groundVisible !== false,
    groundOpacity,
    groundHeight: clampWorkflowNumber(Number(raw.groundHeight ?? fallback.groundHeight ?? 0), -2, 2),
    transformMode: raw.transformMode === "rotate" || raw.transformMode === "scale" || raw.transformMode === "translate" ? raw.transformMode : "translate",
    timeline,
  }
}

function normalizeDirectorDirectiveRect(value: Partial<LibTvDirectorConsole3DDirective["rect"]> | undefined): LibTvDirectorConsole3DDirective["rect"] {
  const x = clampWorkflowNumber(Number(value?.x ?? 0), 0, 0.98)
  const y = clampWorkflowNumber(Number(value?.y ?? 0), 0, 0.98)
  const width = clampWorkflowNumber(Number(value?.width ?? 0.2), 0.02, 1 - x)
  const height = clampWorkflowNumber(Number(value?.height ?? 0.2), 0.02, 1 - y)
  return { x, y, width, height }
}

function normalizeDirectorPanoramaAnchor(value: unknown): LibTvDirectorConsole3DPanoramaAnchor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = value as Partial<LibTvDirectorConsole3DPanoramaAnchor>
  if (raw.projection !== "equirectangular" || !Array.isArray(raw.points)) return undefined
  const points = raw.points
    .map((point) => ({ u: Number(point?.u), v: Number(point?.v) }))
    .filter((point) => Number.isFinite(point.u) && Number.isFinite(point.v))
    .map((point) => ({
      u: clampWorkflowNumber(point.u, -4, 4),
      v: clampWorkflowNumber(point.v, 0, 1),
    }))
    .slice(0, 128)
  return points.length >= 4 ? { projection: "equirectangular", points } : undefined
}

function normalizeDirectorPanoramaBinding(value: unknown): LibTvDirectorConsole3DPanoramaBinding | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = value as Partial<LibTvDirectorConsole3DPanoramaBinding>
  const environmentFingerprint = String(raw.environmentFingerprint || "").trim().slice(0, 120)
  const u = Number(raw.u)
  const v = Number(raw.v)
  const depth = Number(raw.depth)
  const rotationOffsetY = Number(raw.rotationOffsetY)
  if (
    raw.projection !== "equirectangular"
    || !environmentFingerprint
    || !Number.isFinite(u)
    || !Number.isFinite(v)
    || !Number.isFinite(depth)
    || depth <= 0
    || !Number.isFinite(rotationOffsetY)
  ) return undefined
  return {
    projection: "equirectangular",
    environmentFingerprint,
    u: Number(THREE.MathUtils.euclideanModulo(u, 1).toFixed(6)),
    v: Number(clampWorkflowNumber(v, 0, 1).toFixed(6)),
    depth: Number(clampWorkflowNumber(depth, 0.1, 1500).toFixed(4)),
    rotationOffsetY: Number((THREE.MathUtils.euclideanModulo(rotationOffsetY + 180, 360) - 180).toFixed(2)),
    sourceDirectiveId: typeof raw.sourceDirectiveId === "string" ? raw.sourceDirectiveId.trim().slice(0, 120) || undefined : undefined,
  }
}

function applyDirectorObjectStatePatch(
  object: LibTvDirectorConsole3DObject,
  patch: Partial<LibTvDirectorConsole3DObject>,
) {
  const hasExplicitBinding = Object.prototype.hasOwnProperty.call(patch, "panoramaBinding")
  let panoramaBinding = hasExplicitBinding ? patch.panoramaBinding : object.panoramaBinding
  if (!hasExplicitBinding && patch.position) {
    panoramaBinding = undefined
  } else if (!hasExplicitBinding && panoramaBinding && patch.rotation && Number.isFinite(Number(patch.rotation.y))) {
    const deltaY = Number(patch.rotation.y) - Number(object.rotation.y)
    panoramaBinding = {
      ...panoramaBinding,
      rotationOffsetY: Number((THREE.MathUtils.euclideanModulo(panoramaBinding.rotationOffsetY + deltaY + 180, 360) - 180).toFixed(2)),
    }
  }
  return { ...object, ...patch, panoramaBinding }
}

function directorConsoleId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createDirectorStagingCharacter(index: number, bodyType: DirectorCharacterBodyType): LibTvDirectorConsole3DObject {
  const option = getDirectorCharacterBodyOption(bodyType)
  return {
    id: directorConsoleId("character"),
    name: `${option.label}角色${index}`,
    kind: "character",
    primitive: "box",
    color: DIRECTOR_CHARACTER_COLORS[(index - 1) % DIRECTOR_CHARACTER_COLORS.length],
    position: { ...DIRECTOR_SCENE_OBJECT_SPAWN_POSITION },
    rotation: { x: 0, y: 0, z: 0 },
    scale: getDirectorCharacterPresetScaleVector(option.id),
    uniformScale: 1,
    shadowEnabled: false,
    panoramaGroundSnapEnabled: false,
    visible: true,
    locked: false,
    pose: "stand",
    jointAngles: cloneDirectorJointAngles(getDirectorPosePreset("stand").jointAngles),
    bodyType: option.id,
  }
}

function isDirectorUntouchedStarterCharacter(state: LibTvDirectorConsole3DState, object: LibTvDirectorConsole3DObject) {
  return state.objects.length === 1
    && object.id === "role-a"
    && object.kind === "character"
    && object.position.x === 0
    && object.position.y === 0
    && object.position.z === 0
    && object.rotation.x === 0
    && object.rotation.y === 0
    && object.rotation.z === 0
    && Number(object.uniformScale ?? 1) === 1
    && (!object.pose || object.pose === "stand")
}

function directorCharacterLetterName(index: number) {
  let value = Math.max(0, Math.floor(index))
  let label = ""
  do {
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26) - 1
  } while (value >= 0)
  return label
}

function cloneDirectorConsoleStateForHistory(state: LibTvDirectorConsole3DState): LibTvDirectorConsole3DState {
  return JSON.parse(JSON.stringify(state)) as LibTvDirectorConsole3DState
}

function clearDirectorConsoleSelection(state: LibTvDirectorConsole3DState): LibTvDirectorConsole3DState {
  return {
    ...state,
    selectedObjectIds: [],
    activeGroupId: undefined,
    activeObjectId: undefined,
  }
}

function normalizeDirectorConsoleStateForOpen(value: unknown): LibTvDirectorConsole3DState {
  const state = normalizeDirectorConsoleState(value)
  const activeCameraId = state.cameras.some((camera) => camera.id === state.activeObjectId)
    ? state.activeObjectId
    : state.cameras.some((camera) => camera.id === state.activeCameraId)
      ? state.activeCameraId
      : state.cameras[0]?.id
  if (!activeCameraId) return clearDirectorConsoleSelection(state)
  return {
    ...state,
    selectedObjectIds: [],
    activeGroupId: undefined,
    activeObjectId: activeCameraId,
    activeCameraId,
  }
}

function getDirectorConnectedPanoramaSource(
  node: LibTvWorkflowNode,
  upstreamNodes: DirectorConsoleUpstreamNode[] = [],
): DirectorConnectedPanoramaSource | null {
  const referenceImages = Array.isArray(node.data?.referenceImages) ? node.data.referenceImages : []
  const referenceNodeIds = Array.isArray(node.data?.referenceImageNodeIds) ? node.data.referenceImageNodeIds : []
  const upstreamImages = upstreamNodes.filter((item) => item.kind === "image" && String(item.mediaUrl || "").trim())
  const preferredNodeIds = [node.data?.panoramaNodeId, ...referenceNodeIds]
    .map((id) => String(id || "").trim())
    .filter(Boolean)
  for (const preferredNodeId of preferredNodeIds) {
    const upstreamImage = upstreamImages.find((item) => item.id === preferredNodeId)
    const upstreamUrl = String(upstreamImage?.mediaUrl || "").trim()
    if (upstreamImage && upstreamUrl) return { url: upstreamUrl, nodeId: upstreamImage.id }
  }
  const upstreamImage = upstreamImages[0]
  const upstreamUrl = String(upstreamImage?.mediaUrl || "").trim()
  if (upstreamImage && upstreamUrl) return { url: upstreamUrl, nodeId: upstreamImage.id }
  const referenceUrl = referenceImages.map((url) => String(url || "").trim()).find(Boolean)
  if (referenceUrl) return { url: referenceUrl }
  const explicitPanoramaUrl = String(node.data?.panoramaUrl || "").trim()
  if (explicitPanoramaUrl) return { url: explicitPanoramaUrl }
  const stateUrl = String(node.data?.directorConsole3D?.environmentUrl || node.data?.compositionData?.environmentUrl || "").trim()
  return stateUrl ? { url: stateUrl } : null
}

function getDirectorConnectedPanoramaUrl(node: LibTvWorkflowNode, upstreamNodes: DirectorConsoleUpstreamNode[] = []) {
  return getDirectorConnectedPanoramaSource(node, upstreamNodes)?.url || ""
}

function directorPanoramaUsesConnectedSource(
  state: LibTvDirectorConsole3DState,
  source: DirectorConnectedPanoramaSource | null,
) {
  if (!source?.nodeId) return false
  const sourceUrl = String(source.url || "").trim()
  const environmentUrl = String(state.environmentUrl || "").trim()
  const environmentSourceUrl = String(state.environmentSourceUrl || "").trim()
  return Boolean(sourceUrl && (environmentUrl === sourceUrl || environmentSourceUrl === sourceUrl))
}

function applyConnectedPanoramaToDirectorState(state: LibTvDirectorConsole3DState, panoramaUrl: string) {
  const connectedUrl = String(panoramaUrl || "").trim()
  if (!connectedUrl) return state
  const currentUrl = String(state.environmentUrl || "").trim()
  const currentSourceUrl = String(state.environmentSourceUrl || "").trim()
  if (!currentUrl) return { ...state, environmentUrl: connectedUrl, environmentSourceUrl: connectedUrl }
  if (currentUrl === connectedUrl) {
    return currentSourceUrl === connectedUrl ? state : { ...state, environmentSourceUrl: connectedUrl }
  }
  if (currentSourceUrl && currentUrl === currentSourceUrl) {
    return { ...state, environmentUrl: connectedUrl, environmentSourceUrl: connectedUrl }
  }
  return state
}

function normalizeDirectorConsoleStateForOpenWithPanorama(value: unknown, panoramaUrl: string): LibTvDirectorConsole3DState {
  return applyConnectedPanoramaToDirectorState(normalizeDirectorConsoleStateForOpen(value), panoramaUrl)
}

function serializeDirectorConsoleState(state: LibTvDirectorConsole3DState): LibTvDirectorConsole3DState {
  return clearDirectorConsoleSelection(compactDirectorConsoleGroups(state))
}

function getDirectorTimelineTargetValue(state: LibTvDirectorConsole3DState, targetId: string, property: string) {
  const target = state.objects.find((object) => object.id === targetId) || state.cameras.find((camera) => camera.id === targetId)
  if (!target) return undefined
  if (property === "fov" && "fov" in target) return Number(target.fov)
  const [field, axis] = property.split(".")
  const vector = (target as unknown as Record<string, unknown>)[field]
  if (!vector || typeof vector !== "object" || !axis) return undefined
  const value = Number((vector as Record<string, unknown>)[axis])
  return Number.isFinite(value) ? value : undefined
}

function compactDirectorConsoleGroups(state: LibTvDirectorConsole3DState): LibTvDirectorConsole3DState {
  const objectIds = new Set(state.objects.map((object) => object.id))
  const objects = state.objects.map((object) => (
    object.parentObjectId && !objectIds.has(object.parentObjectId)
      ? { ...object, parentObjectId: undefined, attachBone: undefined }
      : object
  ))
  const objectGroups = (state.objectGroups || [])
    .map((group) => ({ ...group, objectIds: group.objectIds.filter((id) => objectIds.has(id)) }))
    .filter((group) => group.objectIds.length > 1)
  const selectedObjectIds = (state.selectedObjectIds || []).filter((id) => objectIds.has(id))
  const directives = (state.directives || []).map((directive) => ({
    ...directive,
    targetObjectId: directive.targetObjectId && objectIds.has(directive.targetObjectId) ? directive.targetObjectId : undefined,
    targetObjectIds: (directive.targetObjectIds || []).filter((id) => objectIds.has(id)),
  }))
  const activeObjectId = state.activeObjectId && (
    objectIds.has(state.activeObjectId) || state.cameras.some((camera) => camera.id === state.activeObjectId)
  ) ? state.activeObjectId : undefined
  return {
    ...state,
    objects,
    directives,
    objectGroups,
    selectedObjectIds,
    activeObjectId,
    activeGroupId: objectGroups.some((group) => group.id === state.activeGroupId) ? state.activeGroupId : undefined,
  }
}

function getDirectorConsoleSelectedObjectIds(state: LibTvDirectorConsole3DState) {
  const selected = (state.selectedObjectIds || []).filter((id) => state.objects.some((object) => object.id === id))
  if (selected.length > 0) return selected
  return state.activeObjectId && state.objects.some((object) => object.id === state.activeObjectId) ? [state.activeObjectId] : []
}

function parseDirectorAspectRatio(value: string | undefined, fallbackRatio = 16 / 9) {
  const normalized = String(value || "16:9").replace(/\s+/g, "")
  if (normalized.toLowerCase() === "auto") {
    const ratio = Number.isFinite(fallbackRatio) && fallbackRatio > 0 ? fallbackRatio : 16 / 9
    return { label: "Auto", ratio, width: ratio, height: 1 }
  }
  const [rawW, rawH] = normalized.split(":")
  const parsedWidth = Number(rawW || 16)
  const parsedHeight = Number(rawH || 9)
  const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 16
  const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 9
  return { label: `${width}:${height}`, ratio: width / height, width, height }
}

const DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO = 16 / 9
const DIRECTOR_ANIMATION_VIDEO_FPS = 30
const DIRECTOR_ANIMATION_VIDEO_SHORT_EDGE = 720
const DIRECTOR_ANIMATION_VIDEO_MAX_DURATION = 10
const DIRECTOR_ANIMATION_VIDEO_PRESET_SIZES = [
  { aspectRatio: 16 / 9, width: 1280, height: 720 },
  { aspectRatio: 9 / 16, width: 720, height: 1280 },
  { aspectRatio: 1, width: 1080, height: 1080 },
  { aspectRatio: 4 / 3, width: 1440, height: 1080 },
] as const

type DirectorCanvasCaptureTrack = MediaStreamTrack & {
  requestFrame?: () => void
}

function getDirectorAnimationVideoSize(aspectRatio: number) {
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO
  const preset = DIRECTOR_ANIMATION_VIDEO_PRESET_SIZES.find((item) => Math.abs(item.aspectRatio - ratio) < 0.001)
  if (preset) return { aspectRatio: ratio, width: preset.width, height: preset.height }
  const roundEven = (value: number) => Math.max(2, 2 * Math.round(value / 2))
  return ratio >= 1
    ? { aspectRatio: ratio, width: roundEven(DIRECTOR_ANIMATION_VIDEO_SHORT_EDGE * ratio), height: DIRECTOR_ANIMATION_VIDEO_SHORT_EDGE }
    : { aspectRatio: ratio, width: DIRECTOR_ANIMATION_VIDEO_SHORT_EDGE, height: roundEven(DIRECTOR_ANIMATION_VIDEO_SHORT_EDGE / ratio) }
}

function waitForDirectorAnimationFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

async function waitForDirectorAnimationReady() {
  await waitForDirectorAnimationFrame()
  await waitForDirectorAnimationFrame()
}

async function waitForDirectorAnimationDeadline(deadline: number) {
  while (performance.now() < deadline) await waitForDirectorAnimationFrame()
}

function drawDirectorAnimationVideoFrame(
  sourceCanvas: HTMLCanvasElement,
  outputCanvas: HTMLCanvasElement,
  outputContext: CanvasRenderingContext2D,
  aspectRatio: number,
) {
  const sourceWidth = sourceCanvas.width
  const sourceHeight = sourceCanvas.height
  if (sourceWidth <= 0 || sourceHeight <= 0) return false
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO
  let sourceX = 0
  let sourceY = 0
  let cropWidth = sourceWidth
  let cropHeight = sourceHeight
  const sourceRatio = sourceWidth / sourceHeight
  if (sourceRatio > ratio) {
    cropWidth = sourceHeight * ratio
    sourceX = (sourceWidth - cropWidth) / 2
  } else if (sourceRatio < ratio) {
    cropHeight = sourceWidth / ratio
    sourceY = (sourceHeight - cropHeight) / 2
  }
  outputContext.fillStyle = "#060608"
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height)
  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = "high"
  outputContext.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  )
  return true
}

function getDirectorContainedViewport(width: number, height: number, aspectRatio: number) {
  const safeWidth = Math.max(1, Math.round(width))
  const safeHeight = Math.max(1, Math.round(height))
  const safeRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO
  const currentRatio = safeWidth / safeHeight
  if (currentRatio > safeRatio) {
    const viewportWidth = Math.max(1, Math.round(safeHeight * safeRatio))
    return {
      x: Math.floor((safeWidth - viewportWidth) / 2),
      y: 0,
      width: viewportWidth,
      height: safeHeight,
    }
  }
  const viewportHeight = Math.max(1, Math.round(safeWidth / safeRatio))
  return {
    x: 0,
    y: Math.floor((safeHeight - viewportHeight) / 2),
    width: safeWidth,
    height: viewportHeight,
  }
}

function renderDirectorSceneContained(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  aspectRatio: number,
) {
  const viewport = getDirectorContainedViewport(width, height, aspectRatio)
  renderer.setScissorTest(false)
  renderer.setViewport(0, 0, width, height)
  renderer.clear(true, true, true)
  renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height)
  renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height)
  renderer.setScissorTest(true)
  syncDirectorSkinnedMeshesBeforeRender(scene)
  renderer.render(scene, camera)
  renderer.setScissorTest(false)
  renderer.setViewport(0, 0, width, height)
}

function captureDirectorSceneDataUrl(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  const renderTarget = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
  })
  renderTarget.samples = 4
  renderTarget.texture.colorSpace = THREE.SRGBColorSpace
  const previousTarget = renderer.getRenderTarget()
  const previousViewport = renderer.getViewport(new THREE.Vector4())
  const previousScissor = renderer.getScissor(new THREE.Vector4())
  const previousScissorTest = renderer.getScissorTest()
  const pixels = new Uint8Array(width * height * 4)
  try {
    renderer.setRenderTarget(renderTarget)
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, width, height)
    syncDirectorSkinnedMeshesBeforeRender(scene)
    renderer.render(scene, camera)
    renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels)
  } finally {
    renderer.setRenderTarget(previousTarget)
    renderer.setViewport(previousViewport)
    renderer.setScissor(previousScissor)
    renderer.setScissorTest(previousScissorTest)
    renderTarget.dispose()
  }
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return ""
  const imageData = context.createImageData(width, height)
  const rowSize = width * 4
  for (let row = 0; row < height; row += 1) {
    const sourceStart = (height - row - 1) * rowSize
    imageData.data.set(pixels.subarray(sourceStart, sourceStart + rowSize), row * rowSize)
  }
  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL("image/png")
}

function syncDirectorSkinnedMeshesBeforeRender(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true)
  root.traverse((child) => {
    const mesh = child as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh || !mesh.skeleton?.bones?.length) return
    mesh.updateWorldMatrix(true, false)
    mesh.skeleton.bones.forEach((bone) => bone.updateWorldMatrix(true, false))
    if (mesh.bindMode === THREE.AttachedBindMode) mesh.bindMatrixInverse.copy(mesh.matrixWorld).invert()
    mesh.skeleton.update()
  })
}

const DIRECTOR_DEFAULT_JOINT_ANGLES: DirectorResolvedJointAngles = {
  root: { height: 0, pitch: 0, roll: 0 },
  body: { bend: 0, turn: 0, tilt: 0 },
  torso: { bend: 2, turn: 0, tilt: 0 },
  head: { nod: -10, turn: 0, tilt: 0 },
  l_arm: { raise: 0, straddle: -35, turn: 0 },
  r_arm: { raise: 0, straddle: -35, turn: 0 },
  l_elbow: { bend: 5 },
  r_elbow: { bend: 5 },
  l_wrist: { bend: 0, turn: 0, tilt: 0 },
  r_wrist: { bend: 0, turn: 0, tilt: 0 },
  l_leg: { raise: 0, straddle: 0, turn: 0 },
  r_leg: { raise: 0, straddle: 0, turn: 0 },
  l_knee: { bend: 0 },
  r_knee: { bend: 0 },
  l_ankle: { bend: 0, turn: 0, tilt: 0 },
  r_ankle: { bend: 0, turn: 0, tilt: 0 },
}

const DIRECTOR_POSE_PRESETS: Array<{ id: string; label: string; icon: string; jointAngles: LibTvDirectorConsole3DJointAngles }> = [
  { id: "stand", label: "站立", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 2, turn: 0, tilt: 0 }, head: { nod: -10, turn: 0, tilt: 0 }, l_arm: { raise: 0, straddle: -35, turn: 0 }, r_arm: { raise: 0, straddle: -35, turn: 0 }, l_elbow: { bend: 5 }, r_elbow: { bend: 5 }, l_leg: { raise: 0, straddle: 0, turn: 0 }, r_leg: { raise: 0, straddle: 0, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "stand_relaxed", label: "自然站", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 2 }, torso: { bend: 1, turn: -3, tilt: -2 }, head: { nod: -6, turn: 4, tilt: 1 }, l_arm: { raise: -6, straddle: 4, turn: -6 }, r_arm: { raise: 2, straddle: 6, turn: 4 }, l_elbow: { bend: 12 }, r_elbow: { bend: 9 }, l_leg: { raise: 0, straddle: 7, turn: -3 }, r_leg: { raise: 0, straddle: 5, turn: 4 }, l_knee: { bend: 5 }, r_knee: { bend: 0 } } },
  { id: "hands_front", label: "双手前握", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 3, turn: 0, tilt: 0 }, head: { nod: -7, turn: 0, tilt: 0 }, l_arm: { raise: 24, straddle: -27, turn: 18 }, r_arm: { raise: 24, straddle: -27, turn: -18 }, l_elbow: { bend: 76 }, r_elbow: { bend: 76 }, l_wrist: { bend: 8, turn: 20, tilt: 8 }, r_wrist: { bend: 8, turn: -20, tilt: -8 }, l_leg: { raise: 0, straddle: 3, turn: 0 }, r_leg: { raise: 0, straddle: 3, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "hands_pockets", label: "双手插兜", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 1 }, torso: { bend: 2, turn: -2, tilt: -1 }, head: { nod: -6, turn: 3, tilt: 0 }, l_arm: { raise: 0, straddle: -34, turn: 16 }, r_arm: { raise: 0, straddle: -34, turn: -16 }, l_elbow: { bend: 32 }, r_elbow: { bend: 32 }, l_wrist: { bend: 14, turn: 18, tilt: 6 }, r_wrist: { bend: 14, turn: -18, tilt: -6 }, l_leg: { raise: 0, straddle: 5, turn: -2 }, r_leg: { raise: 0, straddle: 5, turn: 3 }, l_knee: { bend: 4 }, r_knee: { bend: 0 } } },
  { id: "tpose", label: "T型", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 0, turn: 0, tilt: 0 }, head: { nod: 0, turn: 0, tilt: 0 }, l_arm: { raise: 16, straddle: 60, turn: 40 }, r_arm: { raise: 22, straddle: 54, turn: 41 }, l_elbow: { bend: 0 }, r_elbow: { bend: 0 }, l_leg: { raise: 0, straddle: 0, turn: 0 }, r_leg: { raise: 0, straddle: 0, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "walk", label: "行走", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 3, turn: 5, tilt: 0 }, head: { nod: -5, turn: 0, tilt: 0 }, l_arm: { raise: 40, straddle: 9, turn: 0 }, r_arm: { raise: -8, straddle: 27, turn: -4 }, l_elbow: { bend: 37 }, r_elbow: { bend: 26 }, l_leg: { raise: -10, straddle: 0, turn: 0 }, r_leg: { raise: 36, straddle: -2, turn: 0 }, l_knee: { bend: 22 }, r_knee: { bend: 41 } } },
  { id: "run", label: "跑步", icon: "姿", jointAngles: { body: { bend: -2, turn: 0, tilt: 0 }, torso: { bend: 3, turn: 5, tilt: 0 }, head: { nod: -10, turn: 0, tilt: 0 }, l_arm: { raise: -26, straddle: 23, turn: 14 }, r_arm: { raise: 23, straddle: 14, turn: 19 }, l_elbow: { bend: 60 }, r_elbow: { bend: 89 }, l_leg: { raise: 50, straddle: 0, turn: 0 }, r_leg: { raise: -20, straddle: 0, turn: 0 }, l_knee: { bend: 18 }, r_knee: { bend: 36 } } },
  { id: "sit", label: "坐姿", icon: "姿", jointAngles: { body: { bend: -5, turn: 0, tilt: 0 }, torso: { bend: 5, turn: 0, tilt: 0 }, head: { nod: -5, turn: 0, tilt: 0 }, l_arm: { raise: 0, straddle: 8, turn: 6 }, r_arm: { raise: 0, straddle: 15, turn: 16 }, l_elbow: { bend: 80 }, r_elbow: { bend: 80 }, l_leg: { raise: 90, straddle: 5, turn: 0 }, r_leg: { raise: 90, straddle: 5, turn: 0 }, l_knee: { bend: 90 }, r_knee: { bend: 90 } } },
  { id: "sit_ground", label: "席地坐", icon: "姿", jointAngles: { root: { height: -0.78, pitch: 0, roll: 0 }, body: { bend: -5, turn: -8, tilt: 0 }, torso: { bend: 9, turn: 7, tilt: 0 }, head: { nod: -3, turn: -6, tilt: 0 }, l_arm: { raise: -14, straddle: -30, turn: -8 }, r_arm: { raise: 32, straddle: -6, turn: -10 }, l_elbow: { bend: 7 }, r_elbow: { bend: 62 }, l_wrist: { bend: 26, turn: 0, tilt: -8 }, r_wrist: { bend: 14, turn: 4, tilt: 0 }, l_leg: { raise: 90, straddle: 30, turn: 28 }, r_leg: { raise: 94, straddle: 34, turn: -24 }, l_knee: { bend: 108 }, r_knee: { bend: 78 }, l_ankle: { bend: -18, turn: 10, tilt: 8 }, r_ankle: { bend: -12, turn: -10, tilt: -6 } } },
  { id: "sit_recline", label: "侧撑坐", icon: "姿", jointAngles: { root: { height: -0.78, pitch: 0, roll: -8 }, body: { bend: -12, turn: -16, tilt: -15 }, torso: { bend: -18, turn: 12, tilt: -20 }, head: { nod: 5, turn: 14, tilt: 7 }, l_arm: { raise: -16, straddle: -38, turn: -10 }, r_arm: { raise: 24, straddle: -2, turn: 12 }, l_elbow: { bend: 4 }, r_elbow: { bend: 54 }, l_wrist: { bend: 30, turn: 0, tilt: -10 }, r_wrist: { bend: 10, turn: 6, tilt: 0 }, l_leg: { raise: 88, straddle: 38, turn: 22 }, r_leg: { raise: 92, straddle: 30, turn: -18 }, l_knee: { bend: 18 }, r_knee: { bend: 96 }, l_ankle: { bend: -10, turn: 8, tilt: 0 }, r_ankle: { bend: -8, turn: -6, tilt: 0 } } },
  { id: "cross_legged", label: "盘腿坐", icon: "姿", jointAngles: { root: { height: -0.62, pitch: 0, roll: 0 }, body: { bend: -4, turn: 0, tilt: 0 }, torso: { bend: 8, turn: 0, tilt: 0 }, head: { nod: -4, turn: 0, tilt: 0 }, l_arm: { raise: 22, straddle: 12, turn: 8 }, r_arm: { raise: 22, straddle: 12, turn: -8 }, l_elbow: { bend: 54 }, r_elbow: { bend: 54 }, l_wrist: { bend: 10, turn: 0, tilt: 0 }, r_wrist: { bend: 10, turn: 0, tilt: 0 }, l_leg: { raise: 64, straddle: 42, turn: 34 }, r_leg: { raise: 64, straddle: 42, turn: -34 }, l_knee: { bend: 128 }, r_knee: { bend: 128 }, l_ankle: { bend: -15, turn: 18, tilt: 8 }, r_ankle: { bend: -15, turn: -18, tilt: -8 } } },
  { id: "crouch", label: "蹲下", icon: "姿", jointAngles: { body: { bend: -3, turn: 0, tilt: 0 }, torso: { bend: 45, turn: 0, tilt: 0 }, head: { nod: -15, turn: 0, tilt: 0 }, l_arm: { raise: 39, straddle: 8, turn: 26 }, r_arm: { raise: 20, straddle: 15, turn: 30 }, l_elbow: { bend: 87 }, r_elbow: { bend: 100 }, l_leg: { raise: 100, straddle: 15, turn: 16 }, r_leg: { raise: 90, straddle: 15, turn: 16 }, l_knee: { bend: 104 }, r_knee: { bend: 97 } } },
  { id: "one_knee", label: "单膝跪", icon: "姿", jointAngles: { body: { bend: -11, turn: 0, tilt: 0 }, torso: { bend: 21, turn: 0, tilt: 0 }, head: { nod: -5, turn: 0, tilt: 0 }, l_arm: { raise: 41, straddle: -4, turn: -24 }, r_arm: { raise: 0, straddle: 16, turn: 0 }, l_elbow: { bend: 71 }, r_elbow: { bend: 16 }, l_leg: { raise: 90, straddle: 0, turn: 4 }, r_leg: { raise: 27, straddle: 0, turn: 0 }, l_knee: { bend: 74 }, r_knee: { bend: 89 } } },
  { id: "two_knees", label: "双膝跪", icon: "姿", jointAngles: { body: { bend: 8, turn: 0, tilt: 0 }, torso: { bend: 6, turn: 0, tilt: 0 }, head: { nod: -5, turn: 0, tilt: 0 }, l_arm: { raise: -5, straddle: 7, turn: 0 }, r_arm: { raise: -5, straddle: 10, turn: 0 }, l_elbow: { bend: 15 }, r_elbow: { bend: 15 }, l_leg: { raise: -10, straddle: 0, turn: 0 }, r_leg: { raise: -9, straddle: 0, turn: 0 }, l_knee: { bend: 108 }, r_knee: { bend: 104 } } },
  { id: "hands_hips", label: "叉腰", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 0, turn: 0, tilt: 0 }, head: { nod: -5, turn: 0, tilt: 0 }, l_arm: { raise: 15, straddle: 31, turn: -9 }, r_arm: { raise: 21, straddle: 31, turn: 3 }, l_elbow: { bend: 80 }, r_elbow: { bend: 80 }, l_leg: { raise: 0, straddle: 10, turn: 0 }, r_leg: { raise: 0, straddle: 10, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "lean", label: "倚靠", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: -5 }, torso: { bend: -3, turn: 5, tilt: -5 }, head: { nod: -10, turn: 10, tilt: -5 }, l_arm: { raise: -5, straddle: 13, turn: 0 }, r_arm: { raise: -10, straddle: 16, turn: 0 }, l_elbow: { bend: 15 }, r_elbow: { bend: 20 }, l_leg: { raise: 0, straddle: 5, turn: 0 }, r_leg: { raise: 20, straddle: 0, turn: 10 }, l_knee: { bend: 0 }, r_knee: { bend: 40 } } },
  { id: "bow", label: "鞠躬", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 45, turn: 0, tilt: 0 }, head: { nod: 20, turn: 0, tilt: 0 }, l_arm: { raise: 13, straddle: -7, turn: 0 }, r_arm: { raise: 3, straddle: -5, turn: 10 }, l_elbow: { bend: 5 }, r_elbow: { bend: 5 }, l_leg: { raise: 0, straddle: 0, turn: 0 }, r_leg: { raise: 0, straddle: 0, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "think", label: "思考", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 5, turn: -5, tilt: 0 }, head: { nod: 10, turn: -10, tilt: 5 }, l_arm: { raise: 5, straddle: 7, turn: 0 }, r_arm: { raise: 87, straddle: -10, turn: 90 }, l_elbow: { bend: 67 }, r_elbow: { bend: 122 }, l_leg: { raise: 0, straddle: 0, turn: 0 }, r_leg: { raise: 0, straddle: 0, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "point", label: "指向", icon: "姿", jointAngles: { body: { bend: 0, turn: -8, tilt: 0 }, torso: { bend: 2, turn: -14, tilt: 0 }, head: { nod: -5, turn: -18, tilt: 0 }, l_arm: { raise: 4, straddle: 5, turn: 0 }, r_arm: { raise: 82, straddle: 2, turn: 8 }, l_elbow: { bend: 18 }, r_elbow: { bend: 8 }, r_wrist: { bend: 0, turn: -8, tilt: 0 }, l_leg: { raise: 0, straddle: 5, turn: 0 }, r_leg: { raise: 0, straddle: 5, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 3 } } },
  { id: "hold_object", label: "双手持物", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 6, turn: 0, tilt: 0 }, head: { nod: 7, turn: 0, tilt: 0 }, l_arm: { raise: 56, straddle: -10, turn: 8 }, r_arm: { raise: 56, straddle: -10, turn: -8 }, l_elbow: { bend: 88 }, r_elbow: { bend: 88 }, l_wrist: { bend: 6, turn: 18, tilt: 0 }, r_wrist: { bend: 6, turn: -18, tilt: 0 }, l_leg: { raise: 0, straddle: 5, turn: 0 }, r_leg: { raise: 0, straddle: 5, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "read", label: "阅读", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 9, turn: 0, tilt: 0 }, head: { nod: 18, turn: 0, tilt: 0 }, l_arm: { raise: 48, straddle: -8, turn: 12 }, r_arm: { raise: 48, straddle: -8, turn: -12 }, l_elbow: { bend: 102 }, r_elbow: { bend: 102 }, l_wrist: { bend: 12, turn: 16, tilt: 0 }, r_wrist: { bend: 12, turn: -16, tilt: 0 }, l_leg: { raise: 0, straddle: 4, turn: 0 }, r_leg: { raise: 0, straddle: 4, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "phone_call", label: "接电话", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 2, turn: -4, tilt: 0 }, head: { nod: -4, turn: 8, tilt: 6 }, l_arm: { raise: 2, straddle: 5, turn: 0 }, r_arm: { raise: 78, straddle: -8, turn: 70 }, l_elbow: { bend: 12 }, r_elbow: { bend: 128 }, r_wrist: { bend: 12, turn: -22, tilt: 18 }, l_leg: { raise: 0, straddle: 5, turn: 0 }, r_leg: { raise: 0, straddle: 5, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 4 } } },
  { id: "photo", label: "拍照", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 4, turn: 0, tilt: 0 }, head: { nod: -2, turn: 0, tilt: 0 }, l_arm: { raise: 78, straddle: -12, turn: 12 }, r_arm: { raise: 82, straddle: -12, turn: -12 }, l_elbow: { bend: 108 }, r_elbow: { bend: 108 }, l_wrist: { bend: 3, turn: 12, tilt: 0 }, r_wrist: { bend: 3, turn: -12, tilt: 0 }, l_leg: { raise: 0, straddle: 5, turn: 0 }, r_leg: { raise: 0, straddle: 5, turn: 0 }, l_knee: { bend: 2 }, r_knee: { bend: 0 } } },
  { id: "hands_back", label: "双手背后", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: -3, turn: 0, tilt: 0 }, head: { nod: -7, turn: 5, tilt: 0 }, l_arm: { raise: -28, straddle: -14, turn: -28 }, r_arm: { raise: -28, straddle: -14, turn: 28 }, l_elbow: { bend: 84 }, r_elbow: { bend: 84 }, l_wrist: { bend: -10, turn: 20, tilt: 0 }, r_wrist: { bend: -10, turn: -20, tilt: 0 }, l_leg: { raise: 0, straddle: 4, turn: 0 }, r_leg: { raise: 0, straddle: 4, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "clap", label: "鼓掌", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 3, turn: 0, tilt: 0 }, head: { nod: -5, turn: 0, tilt: 0 }, l_arm: { raise: 72, straddle: -18, turn: 24 }, r_arm: { raise: 72, straddle: -18, turn: -24 }, l_elbow: { bend: 92 }, r_elbow: { bend: 92 }, l_wrist: { bend: 0, turn: 24, tilt: 0 }, r_wrist: { bend: 0, turn: -24, tilt: 0 }, l_leg: { raise: 0, straddle: 6, turn: 0 }, r_leg: { raise: 0, straddle: 6, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "cheer", label: "欢呼", icon: "姿", jointAngles: { body: { bend: -3, turn: 0, tilt: 0 }, torso: { bend: -8, turn: 0, tilt: 0 }, head: { nod: -18, turn: 0, tilt: 0 }, l_arm: { raise: 148, straddle: 18, turn: 6 }, r_arm: { raise: 148, straddle: 18, turn: -6 }, l_elbow: { bend: 18 }, r_elbow: { bend: 18 }, l_wrist: { bend: -8, turn: 0, tilt: -8 }, r_wrist: { bend: -8, turn: 0, tilt: 8 }, l_leg: { raise: 0, straddle: 12, turn: 0 }, r_leg: { raise: 0, straddle: 12, turn: 0 }, l_knee: { bend: 6 }, r_knee: { bend: 6 } } },
  { id: "look_back", label: "回头", icon: "姿", jointAngles: { body: { bend: 0, turn: 18, tilt: 0 }, torso: { bend: 1, turn: 34, tilt: 0 }, head: { nod: -6, turn: 72, tilt: 2 }, l_arm: { raise: -4, straddle: 5, turn: 0 }, r_arm: { raise: 4, straddle: 6, turn: 0 }, l_elbow: { bend: 10 }, r_elbow: { bend: 12 }, l_leg: { raise: 0, straddle: 5, turn: 0 }, r_leg: { raise: 0, straddle: 5, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 3 } } },
  { id: "fight", label: "格斗", icon: "姿", jointAngles: { body: { bend: 5, turn: 15, tilt: 0 }, torso: { bend: 8, turn: 10, tilt: 0 }, head: { nod: -5, turn: -15, tilt: 0 }, l_arm: { raise: 60, straddle: 30, turn: 0 }, r_arm: { raise: 40, straddle: 25, turn: 0 }, l_elbow: { bend: 110 }, r_elbow: { bend: 100 }, l_leg: { raise: 10, straddle: 15, turn: 10 }, r_leg: { raise: -5, straddle: 15, turn: -10 }, l_knee: { bend: 25 }, r_knee: { bend: 30 } } },
  { id: "kick", label: "踢球", icon: "姿", jointAngles: { body: { bend: -4, turn: -7, tilt: -1 }, torso: { bend: -5, turn: -10, tilt: 5 }, head: { nod: 5, turn: -10, tilt: 0 }, l_arm: { raise: -20, straddle: 30, turn: 0 }, r_arm: { raise: 20, straddle: 25, turn: 0 }, l_elbow: { bend: 40 }, r_elbow: { bend: 35 }, l_leg: { raise: -10, straddle: 0, turn: 0 }, r_leg: { raise: 80, straddle: 0, turn: 0 }, l_knee: { bend: 10 }, r_knee: { bend: 20 } } },
  { id: "throw", label: "投掷", icon: "姿", jointAngles: { body: { bend: 5, turn: -2, tilt: 0 }, torso: { bend: 4, turn: 15, tilt: -5 }, head: { nod: -5, turn: -15, tilt: 0 }, l_arm: { raise: 7, straddle: 17, turn: 0 }, r_arm: { raise: 77, straddle: 0, turn: 90 }, l_elbow: { bend: 88 }, r_elbow: { bend: 96 }, l_leg: { raise: 15, straddle: 5, turn: 0 }, r_leg: { raise: -10, straddle: 5, turn: 0 }, l_knee: { bend: 26 }, r_knee: { bend: 36 } } },
  { id: "push", label: "推进", icon: "姿", jointAngles: { body: { bend: -1, turn: 0, tilt: 0 }, torso: { bend: 19, turn: 0, tilt: 0 }, head: { nod: -5, turn: 0, tilt: 0 }, l_arm: { raise: 100, straddle: 6, turn: 5 }, r_arm: { raise: 101, straddle: 11, turn: 0 }, l_elbow: { bend: 14 }, r_elbow: { bend: 0 }, l_leg: { raise: 41, straddle: 0, turn: 0 }, r_leg: { raise: -15, straddle: 0, turn: 0 }, l_knee: { bend: 35 }, r_knee: { bend: 10 } } },
  { id: "wave", label: "招手", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 2, turn: -10, tilt: 0 }, head: { nod: -5, turn: 15, tilt: 5 }, l_arm: { raise: 0, straddle: 6, turn: 0 }, r_arm: { raise: 62, straddle: -10, turn: 90 }, l_elbow: { bend: 62 }, r_elbow: { bend: 94 }, l_leg: { raise: 0, straddle: 0, turn: 0 }, r_leg: { raise: 0, straddle: 0, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "stretch", label: "伸手", icon: "姿", jointAngles: { body: { bend: -5, turn: 0, tilt: 0 }, torso: { bend: -16, turn: 0, tilt: 3 }, head: { nod: -25, turn: 0, tilt: 0 }, l_arm: { raise: 115, straddle: -10, turn: 10 }, r_arm: { raise: 133, straddle: -10, turn: -10 }, l_elbow: { bend: 59 }, r_elbow: { bend: 53 }, l_leg: { raise: 0, straddle: 10, turn: 0 }, r_leg: { raise: 0, straddle: 10, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "arms_crossed", label: "抱臂", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 0, turn: 2, tilt: 0 }, head: { nod: -8, turn: 0, tilt: 0 }, l_arm: { raise: 7, straddle: 22, turn: 17 }, r_arm: { raise: 8, straddle: 22, turn: 39 }, l_elbow: { bend: 107 }, r_elbow: { bend: 107 }, l_leg: { raise: 0, straddle: 5, turn: 0 }, r_leg: { raise: 0, straddle: 5, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
  { id: "phone", label: "看手机", icon: "姿", jointAngles: { body: { bend: 0, turn: 0, tilt: 0 }, torso: { bend: 5, turn: 0, tilt: 0 }, head: { nod: 17, turn: 0, tilt: 0 }, l_arm: { raise: 55, straddle: -10, turn: -4 }, r_arm: { raise: 24, straddle: -10, turn: -13 }, l_elbow: { bend: 89 }, r_elbow: { bend: 43 }, l_leg: { raise: 0, straddle: 5, turn: 0 }, r_leg: { raise: 0, straddle: 5, turn: 0 }, l_knee: { bend: 0 }, r_knee: { bend: 0 } } },
]

type DirectorDockPanel = "panorama" | "cast" | "cameras" | null
type DirectorRightPanelMode = "directives" | "precision"
type DirectorDirectiveFacing = NonNullable<LibTvDirectorConsole3DDirective["facing"]>

type DirectorDirectivePlan = {
  poseId: string
  facing: DirectorDirectiveFacing
  scale: number
  summary: string
  source?: "ai" | "rules"
}

type DirectorAssetApiResponse = {
  success?: boolean
  status?: "processing" | "succeeded" | "failed"
  taskId?: string
  modelRuntimeId?: string
  modelUrl?: string
  progress?: number
  message?: string
}

type DirectorCharacterDetectionApiResponse = {
  ok?: boolean
  source?: "ai"
  modelId?: string
  geometryRefined?: boolean
  geometryModelId?: string
  projection?: "flat" | "equirectangular"
  characters?: LibTvDirectorConsole3DDetectedCharacter[]
  error?: string
}

type DirectorDetectedCharacterPlacement = {
  position: LibTvDirectorConsole3DVector3
  uniformScale: number
  rotationY: number
}

type DirectorAssetLayoutPlan = {
  attachment: {
    enabled: boolean
    targetCharacterId?: string
    attachBone?: "leftHand" | "rightHand"
  }
  targetLongestDimensionMeters: number
  gripOffset: LibTvDirectorConsole3DVector3
  rotation: LibTvDirectorConsole3DVector3
  poseId: string
  summary: string
  source?: "ai" | "fallback"
}

type DirectorPanoramaMaskResult = {
  maskData: string
  width: number
  height: number
} | {
  error: string
}

const DIRECTOR_DIRECTIVE_ACTION_LABELS: Record<NonNullable<LibTvDirectorConsole3DDirective["action"]>, string> = {
  character: "角色调度",
  add: "新增对象",
  edit: "修改对象",
  remove: "移除对象",
  panorama: "编辑全景",
}

function getDirectorDirectiveAction(directive: LibTvDirectorConsole3DDirective | null | undefined) {
  return directive?.action === "add" || directive?.action === "edit" || directive?.action === "remove" || directive?.action === "panorama"
    ? directive.action
    : "character"
}

function getDirectorGeneratedObjectName(prompt: string) {
  const normalized = String(prompt || "")
    .replace(/^(请|帮我|在这里|在框选区域|框选区域内|新增|添加|生成|放置|创建)+/g, "")
    .replace(/[，。,.！!？?].*$/g, "")
    .trim()
  const heldObject = normalized.match(/(?:拿着|手持|握着|举着|持有|装备)([^，。,.！!？?]{1,24})/)?.[1]?.trim()
  return (heldObject || normalized || "AI 生成对象").slice(0, 24)
}

function buildDirectorAssetGenerationPrompt(prompt: string) {
  const normalized = String(prompt || "").trim()
  return [
    `用户完整要求：${normalized || "根据参考图生成对应物体"}`,
    "从完整要求中识别需要新增或替换的单个独立3D物体，并只生成这个物体；保留用户描述的造型、结构、材质、状态和配件关系。",
    "不要生成角色、场景、地面、文字或展示底座。物体需要完整、居中、拓扑干净，使用真实比例和PBR材质，适合直接放入影视预演场景。",
  ].join("\n")
}

function inferDirectorAttachment(prompt: string): { attachBone: "leftHand" | "rightHand" } | null {
  if (!/(拿着|手持|握着|举着|持有|装备|递给|抓着)/.test(prompt)) return null
  return { attachBone: /左手|左边手/.test(prompt) ? "leftHand" : "rightHand" }
}

function getDirectorFallbackAssetLayout(
  prompt: string,
  characters: LibTvDirectorConsole3DObject[],
  preferredCharacters: LibTvDirectorConsole3DObject[],
  attachmentMode: LibTvDirectorConsole3DDirective["attachmentMode"] = "auto",
  attachmentCharacterId?: string,
): DirectorAssetLayoutPlan {
  const inferred = attachmentMode === "auto" ? inferDirectorAttachment(prompt) : null
  const explicitBone = attachmentMode === "leftHand" || attachmentMode === "rightHand" ? attachmentMode : undefined
  const targetCharacter = characters.find((character) => character.id === attachmentCharacterId)
    || preferredCharacters.find((character) => characters.some((candidate) => candidate.id === character.id))
    || characters[0]
  const attachBone = explicitBone || inferred?.attachBone
  const attachmentEnabled = attachmentMode !== "none" && Boolean(targetCharacter && attachBone)
  const targetLongestDimensionMeters = attachmentEnabled ? 0.36 : 1.2
  return {
    attachment: {
      enabled: attachmentEnabled,
      targetCharacterId: attachmentEnabled ? targetCharacter?.id : undefined,
      attachBone: attachmentEnabled ? attachBone : undefined,
    },
    targetLongestDimensionMeters,
    gripOffset: { x: 0, y: Number((-targetLongestDimensionMeters / 2).toFixed(3)), z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    poseId: attachmentEnabled ? "stretch" : "stand",
    summary: attachmentEnabled ? "将按模型包围盒和角色手部尺度自动适配。" : "将按框选区域的投影尺寸自动适配。",
    source: "fallback",
  }
}

function waitForDirectorAssetPoll(delayMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delayMs))
}

const DIRECTOR_LOCAL_POSE_RULES: Array<{ pattern: RegExp; poseId: string }> = [
  { pattern: /席地|坐在地上|地上坐/, poseId: "sit_ground" },
  { pattern: /侧撑|斜靠坐|半躺|后仰坐/, poseId: "sit_recline" },
  { pattern: /盘腿/, poseId: "cross_legged" },
  { pattern: /插兜|手插(?:在)?(?:裤兜|口袋)|手放(?:在)?(?:裤兜|口袋)/, poseId: "hands_pockets" },
  { pattern: /双手前握|双手交握|手放身前/, poseId: "hands_front" },
  { pattern: /自然站|放松站/, poseId: "stand_relaxed" },
  { pattern: /接电话|打电话|通话/, poseId: "phone_call" },
  { pattern: /拍照|照相|摄影/, poseId: "photo" },
  { pattern: /看书|读书|阅读/, poseId: "read" },
  { pattern: /双手持|端着|双手拿|抱着物体/, poseId: "hold_object" },
  { pattern: /指向|指着|指路/, poseId: "point" },
  { pattern: /背手|双手背后/, poseId: "hands_back" },
  { pattern: /鼓掌|拍手/, poseId: "clap" },
  { pattern: /欢呼|庆祝|双手举起/, poseId: "cheer" },
  { pattern: /回头|回望|向后看/, poseId: "look_back" },
  { pattern: /看手机|刷手机|拿手机/, poseId: "phone" },
  { pattern: /抱臂|双臂交叉/, poseId: "arms_crossed" },
  { pattern: /招手|挥手|打招呼/, poseId: "wave" },
  { pattern: /叉腰/, poseId: "hands_hips" },
  { pattern: /思考|沉思|疑惑/, poseId: "think" },
  { pattern: /坐|坐下|坐着/, poseId: "sit" },
  { pattern: /蹲|蹲下/, poseId: "crouch" },
  { pattern: /单膝|跪一条腿/, poseId: "one_knee" },
  { pattern: /双膝|跪下/, poseId: "two_knees" },
  { pattern: /跑|冲刺|奔跑/, poseId: "run" },
  { pattern: /走|行走|走向/, poseId: "walk" },
  { pattern: /格斗|打架|防守|拳击/, poseId: "fight" },
  { pattern: /踢|踢球/, poseId: "kick" },
  { pattern: /投掷|扔|抛/, poseId: "throw" },
  { pattern: /推|推进|推开/, poseId: "push" },
  { pattern: /伸手|够取|拿取/, poseId: "stretch" },
  { pattern: /倚靠|靠着|靠墙/, poseId: "lean" },
  { pattern: /鞠躬|致谢/, poseId: "bow" },
]

function inferDirectorDirectivePlan(prompt: string): DirectorDirectivePlan {
  const normalized = String(prompt || "").trim()
  const poseId = DIRECTOR_LOCAL_POSE_RULES.find((rule) => rule.pattern.test(normalized))?.poseId || "stand"
  const facing: DirectorDirectiveFacing = /背对|背向/.test(normalized)
    ? "away"
    : /面向左|朝左|看左/.test(normalized)
      ? "left"
      : /面向右|朝右|看右/.test(normalized)
        ? "right"
        : /面向镜头|看镜头|正对镜头|朝向镜头/.test(normalized)
          ? "camera"
          : "keep"
  const scale = /远处|背景|远景/.test(normalized) ? 0.9 : /近处|前景|近景/.test(normalized) ? 1.08 : 1
  const poseLabel = getDirectorPosePreset(poseId).label
  return {
    poseId,
    facing,
    scale,
    summary: `已定位到标注区域，并采用“${poseLabel}”姿势。`,
    source: "rules",
  }
}

type DirectorTimelineMotionDrawingSession = {
  trackId: string
  type: LibTvDirectorConsole3DMotionPathType
  points: LibTvDirectorConsole3DVector3[]
}

function DirectorConsole3DOverlay({
  node,
  upstreamNodes = [],
  projectId,
  onClose,
  onUpdateState,
  onUpdatePreview,
  onPanoramaEditApplied,
  onCreateCaptureNode,
  onCreateVideoNode,
}: {
  node: LibTvWorkflowNode
  upstreamNodes?: DirectorConsoleUpstreamNode[]
  projectId?: string
  onClose: () => void
  onUpdateState: (state: LibTvDirectorConsole3DState) => void
  onUpdatePreview?: (previewUrl: string) => void
  onPanoramaEditApplied?: (nextUrl: string, sourceNodeId?: string) => void
  onCreateCaptureNode?: (capture: LibTvDirectorConsole3DCapture, options?: { batchIndex?: number; batchTotal?: number }) => void
  onCreateVideoNode?: (exported: LibTvDirectorConsole3DVideoExport) => Promise<void> | void
}) {
  const connectedPanoramaSource = getDirectorConnectedPanoramaSource(node, upstreamNodes)
  const connectedPanoramaUrl = connectedPanoramaSource?.url || ""
  const [state, setState] = useState<LibTvDirectorConsole3DState>(() => normalizeDirectorConsoleStateForOpenWithPanorama(node.data?.directorConsole3D || node.data?.compositionData, connectedPanoramaUrl))
  const [viewMode, setViewMode] = useState<"director" | "camera">("director")
  const [selectedTab, setSelectedTab] = useState<"props" | "pose" | "captures" | "motion">("props")
  const [workspaceMode, setWorkspaceMode] = useState<"scene" | "timeline">("scene")
  const [timelinePlaying, setTimelinePlaying] = useState(false)
  const [timelineExporting, setTimelineExporting] = useState(false)
  const [timelineTime, setTimelineTime] = useState(0)
  const [timelineMinimized, setTimelineMinimized] = useState(false)
  const [timelineHeight, setTimelineHeight] = useState(130)
  const [timelineDrawingTrackId, setTimelineDrawingTrackId] = useState<string | null>(null)
  const [timelineDrawingSession, setTimelineDrawingSession] = useState<DirectorTimelineMotionDrawingSession | null>(null)
  const [timelineTourStep, setTimelineTourStep] = useState(0)
  const [search, setSearch] = useState("")
  const [fullscreen, setFullscreen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [transformMenuOpen, setTransformMenuOpen] = useState(false)
  const [panoramaMenuOpen, setPanoramaMenuOpen] = useState(false)
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false)
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false)
  const [panoramaHistoryOpen, setPanoramaHistoryOpen] = useState(false)
  const [panoramaAiOpen, setPanoramaAiOpen] = useState(false)
  const [panoramaAiImageUrl, setPanoramaAiImageUrl] = useState<string | null>(null)
  const [dockPanel, setDockPanel] = useState<DirectorDockPanel>(null)
  const [rightPanelMode, setRightPanelMode] = useState<DirectorRightPanelMode>("directives")
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [compactViewport, setCompactViewport] = useState(false)
  const [directiveMarking, setDirectiveMarking] = useState(false)
  const [activeDirectiveId, setActiveDirectiveId] = useState<string | null>(null)
  const [directiveApplyingId, setDirectiveApplyingId] = useState<string | null>(null)
  const [directiveReferenceUploadingId, setDirectiveReferenceUploadingId] = useState<string | null>(null)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const [sceneTreeMenu, setSceneTreeMenu] = useState<DirectorSceneTreeContextMenu>(null)
  const historyRef = useRef<{ past: LibTvDirectorConsole3DState[]; future: LibTvDirectorConsole3DState[] }>({ past: [], future: [] })
  const overlayRootRef = useRef<HTMLDivElement | null>(null)
  const toolbarRef = useRef<HTMLElement | null>(null)
  const glbInputRef = useRef<HTMLInputElement | null>(null)
  const panoInputRef = useRef<HTMLInputElement | null>(null)
  const panoAiInputRef = useRef<HTMLInputElement | null>(null)
  const directiveReferenceInputRef = useRef<HTMLInputElement | null>(null)
  const sceneRef = useRef<DirectorConsole3DSceneHandle | null>(null)
  const stageViewportRef = useRef<HTMLElement | null>(null)
  const sceneTreeMenuRef = useRef<HTMLDivElement | null>(null)
  const characterDetectionRequestRef = useRef<{ fingerprint: string; controller: AbortController; requestId: number } | null>(null)
  const characterDetectionRequestSequenceRef = useRef(0)
  const latestDirectorStateRef = useRef(state)
  const timelineDrawingPointsRef = useRef<LibTvDirectorConsole3DVector3[]>([])
  const timelineDrawingFrameRef = useRef(0)
  const timelineExportingRef = useRef(false)
  const timeline = state.timeline || createDirectorConsoleDefaultTimeline()
  const timelineTargetId = state.activeObjectId || state.activeCameraId || ""
  const activeTimelineTrack = timeline.tracks.find((item) => item.targetId === timelineTargetId)
  const activeTimelineMotionAction = activeTimelineTrack?.actions?.find((item) => item.type === "motion-path")
  const activeTimelineMotionPath = timeline.paths?.find((item) => item.id === activeTimelineMotionAction?.pathId)
  const timelineKeyframes = useMemo(() => {
    const track = timeline.tracks.find((item) => item.targetId === timelineTargetId)
    return new Set((track?.keyframes || [])
      .filter((keyframe) => Math.abs(keyframe.time - timelineTime) <= 0.01)
      .map((keyframe) => keyframe.property))
  }, [timeline.tracks, timelineTargetId, timelineTime])
  const renderState = useMemo(
    () => workspaceMode === "timeline" ? applyPersistedDirectorTimelineStateAtTime(state, timelineTime) : state,
    [state, timelineTime, workspaceMode],
  )
  const directives = state.directives || []
  const activeDirective = directives.find((directive) => directive.id === activeDirectiveId) || null
  const projectPanoramaAnchor = useCallback((anchor: LibTvDirectorConsole3DPanoramaAnchor) => (
    sceneRef.current?.getViewportRectForPanoramaAnchor(anchor) || null
  ), [])
  const stageLeft = fullscreen ? 0 : DIRECTOR_LEFT_RAIL_WIDTH + (dockPanel ? DIRECTOR_LEFT_DRAWER_WIDTH : 0)
  const stageRight = fullscreen || compactViewport || !rightPanelOpen ? 0 : 320
  const stageBottom = !fullscreen && compactViewport && rightPanelOpen ? "42%" : 0

  useEffect(() => {
    const root = overlayRootRef.current
    if (!root) return
    const update = () => setCompactViewport(root.getBoundingClientRect().width <= 900)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  const queueTimelineDrawingPoints = useCallback((points: LibTvDirectorConsole3DVector3[]) => {
    timelineDrawingPointsRef.current = points
    if (timelineDrawingFrameRef.current) return
    timelineDrawingFrameRef.current = window.requestAnimationFrame(() => {
      timelineDrawingFrameRef.current = 0
      const nextPoints = timelineDrawingPointsRef.current
      setTimelineDrawingSession((current) => current ? { ...current, points: nextPoints } : current)
    })
  }, [])

  useEffect(() => () => {
    if (timelineDrawingFrameRef.current) window.cancelAnimationFrame(timelineDrawingFrameRef.current)
  }, [])

  useEffect(() => () => {
    characterDetectionRequestRef.current?.controller.abort()
    characterDetectionRequestRef.current = null
  }, [])

  useEffect(() => {
    const body = document.body
    const previousOverflow = body.style.overflow
    const previousShortcutGuard = body.getAttribute("data-prevent-global-shortcut")
    body.style.overflow = "hidden"
    body.setAttribute("data-prevent-global-shortcut", "scene-composer")
    return () => {
      body.style.overflow = previousOverflow
      if (previousShortcutGuard === null) body.removeAttribute("data-prevent-global-shortcut")
      else body.setAttribute("data-prevent-global-shortcut", previousShortcutGuard)
    }
  }, [])

  useEffect(() => {
    characterDetectionRequestRef.current?.controller.abort()
    characterDetectionRequestRef.current = null
    characterDetectionRequestSequenceRef.current += 1
    setState(normalizeDirectorConsoleStateForOpenWithPanorama(node.data?.directorConsole3D || node.data?.compositionData, getDirectorConnectedPanoramaUrl(node, upstreamNodes)))
    setViewMode("director")
    setSelectedTab("props")
    setWorkspaceMode("scene")
    setTimelinePlaying(false)
    setTimelineExporting(false)
    timelineExportingRef.current = false
    setTimelineTime(0)
    setTimelineMinimized(false)
    setTimelineHeight(130)
    setTimelineDrawingTrackId(null)
    setTimelineDrawingSession(null)
    setTimelineTourStep(0)
    setSearch("")
    setAddMenuOpen(false)
    setTransformMenuOpen(false)
    setPanoramaMenuOpen(false)
    setCameraMenuOpen(false)
    setAspectMenuOpen(false)
    setPanoramaHistoryOpen(false)
    setPanoramaAiOpen(false)
    setPanoramaAiImageUrl(null)
    setDockPanel(null)
    setRightPanelMode("directives")
    setRightPanelOpen(false)
    setDirectiveMarking(false)
    setActiveDirectiveId(null)
    setDirectiveApplyingId(null)
    setDirectiveReferenceUploadingId(null)
    setShortcutHelpOpen(false)
    setSceneTreeMenu(null)
    historyRef.current = { past: [], future: [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id])

  useEffect(() => {
    if (!timelinePlaying || workspaceMode !== "timeline") return
    let frame = 0
    let previous = performance.now()
    const tick = (now: number) => {
      const elapsed = Math.max(0, Math.min(0.1, (now - previous) / 1000))
      previous = now
      setTimelineTime((current) => {
        const next = current + elapsed
        if (next < timeline.duration) return next
        if (timeline.loop) return 0
        setTimelinePlaying(false)
        return timeline.duration
      })
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [timeline.duration, timeline.loop, timelinePlaying, workspaceMode])

  useEffect(() => {
    if (!connectedPanoramaUrl) return
    setState((current) => applyConnectedPanoramaToDirectorState(current, connectedPanoramaUrl))
  }, [connectedPanoramaUrl])

  useEffect(() => {
    const sourceNodeId = connectedPanoramaSource?.nodeId
    const environmentUrl = String(state.environmentUrl || "").trim()
    const environmentSourceUrl = String(state.environmentSourceUrl || "").trim()
    if (!sourceNodeId || !environmentUrl || environmentUrl === connectedPanoramaUrl || environmentSourceUrl !== connectedPanoramaUrl) return
    onPanoramaEditApplied?.(environmentUrl, sourceNodeId)
  }, [connectedPanoramaSource?.nodeId, connectedPanoramaUrl, onPanoramaEditApplied, state.environmentSourceUrl, state.environmentUrl])

  useEffect(() => {
    latestDirectorStateRef.current = state
  }, [state])

  useEffect(() => {
    const handle = window.setTimeout(() => onUpdateState(state), 80)
    return () => window.clearTimeout(handle)
  }, [onUpdateState, state])

  useEffect(() => () => {
    onUpdateState(latestDirectorStateRef.current)
  }, [onUpdateState])

  const applyStateChange = useCallback((updater: (current: LibTvDirectorConsole3DState) => LibTvDirectorConsole3DState, options?: { history?: boolean }) => {
    setState((current) => {
      const next = compactDirectorConsoleGroups(updater(current))
      if (next === current) return current
      if (options?.history !== false) {
        historyRef.current = {
          past: [...historyRef.current.past.slice(-49), cloneDirectorConsoleStateForHistory(current)],
          future: [],
        }
      }
      return next
    })
  }, [])

  const patchDirective = useCallback((id: string, patch: Partial<LibTvDirectorConsole3DDirective>, options?: { history?: boolean }) => {
    applyStateChange((current) => ({
      ...current,
      directives: (current.directives || []).map((directive) => directive.id === id ? { ...directive, ...patch } : directive),
    }), options)
  }, [applyStateChange])

  const detectCharactersInEnvironment = useCallback(async (options?: { force?: boolean }) => {
    const environmentUrl = String(latestDirectorStateRef.current.environmentUrl || "").trim()
    if (!environmentUrl) {
      message.warning("请先上传场景图片")
      return
    }
    if (environmentUrl.startsWith("blob:")) {
      message.info("图片正在上传，请等待上传完成后再点击 AI识图")
      return
    }
    const sourceFingerprint = getDirectorEnvironmentFingerprint(environmentUrl)
    if (!sourceFingerprint) return
    const currentDetection = latestDirectorStateRef.current.characterDetection
    if (!options?.force && currentDetection?.sourceFingerprint === sourceFingerprint && currentDetection.status === "succeeded") return
    const activeRequest = characterDetectionRequestRef.current
    if (activeRequest && activeRequest.fingerprint !== sourceFingerprint) activeRequest.controller.abort()
    if (activeRequest?.fingerprint === sourceFingerprint) {
      if (!options?.force) return
      activeRequest.controller.abort()
    }

    const controller = new AbortController()
    const requestId = characterDetectionRequestSequenceRef.current + 1
    characterDetectionRequestSequenceRef.current = requestId
    characterDetectionRequestRef.current = { fingerprint: sourceFingerprint, controller, requestId }
    const isCurrentRequest = () => characterDetectionRequestRef.current?.requestId === requestId && !controller.signal.aborted
    const sameEnvironment = (candidate: LibTvDirectorConsole3DState) => getDirectorEnvironmentFingerprint(candidate.environmentUrl) === sourceFingerprint
    applyStateChange((current) => {
      if (!sameEnvironment(current)) return current
      const previous = current.characterDetection
      const sourceChanged = Boolean(previous?.sourceFingerprint && previous.sourceFingerprint !== sourceFingerprint)
      const previousIds = new Set(sourceChanged ? (previous?.characterObjectIds || []) : [])
      return {
        ...current,
        objects: previousIds.size > 0 ? current.objects.filter((object) => !previousIds.has(object.id)) : current.objects,
        characterDetection: {
          sourceFingerprint,
          sourceUrl: environmentUrl.startsWith("data:") ? undefined : environmentUrl,
          status: "pending",
          projection: sourceChanged ? undefined : previous?.projection,
          detections: sourceChanged ? [] : previous?.detections || [],
          characterObjectIds: sourceChanged ? [] : previous?.characterObjectIds || [],
          modelId: undefined,
          error: undefined,
          detectedAt: Date.now(),
        },
      }
    }, { history: false })
    message.info(options?.force ? "正在重新识别图片中的人物" : "正在识别图片中的人物")

    try {
      let imageSize = sceneRef.current?.getEnvironmentImageSize?.(environmentUrl) || null
      for (let attempt = 0; !imageSize && attempt < 60 && isCurrentRequest(); attempt += 1) {
        await waitForDirectorAssetPoll(120)
        imageSize = sceneRef.current?.getEnvironmentImageSize?.(environmentUrl) || null
      }
      const response = await fetch("/api/workflow/director-character-detection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          imageUrl: environmentUrl,
          imageWidth: imageSize?.width,
          imageHeight: imageSize?.height,
          availablePoses: DIRECTOR_POSE_PRESETS.map((pose) => ({ id: pose.id, label: pose.label })),
        }),
      })
      const payload = await response.json().catch(() => ({})) as DirectorCharacterDetectionApiResponse
      if (!response.ok) throw new Error(String(payload.error || "图片人物检测失败"))
      const parsedDetection = normalizeDirectorCharacterDetection({
        sourceFingerprint,
        sourceUrl: environmentUrl.startsWith("data:") ? undefined : environmentUrl,
        status: "succeeded",
        projection: payload.projection,
        detections: Array.isArray(payload.characters) ? payload.characters : [],
        characterObjectIds: [],
        modelId: payload.modelId,
        detectedAt: Date.now(),
      }, new Set())
      const detections = parsedDetection?.detections || []
      if (!isCurrentRequest()) return
      if (detections.length > 0) {
        let ready = sceneRef.current?.isEnvironmentReady(environmentUrl) === true
        for (let attempt = 0; !ready && attempt < 60 && isCurrentRequest(); attempt += 1) {
          await waitForDirectorAssetPoll(120)
          ready = sceneRef.current?.isEnvironmentReady(environmentUrl) === true
        }
        if (!ready) throw new Error("场景图片尚未加载完成，请稍后重试人物识别")
      }
      const placements = detections.map((detection) => ({
        detection,
        placement: sceneRef.current?.getCharacterPlacementForImageDetection(detection, parsedDetection?.projection) || null,
      })).filter((item): item is { detection: LibTvDirectorConsole3DDetectedCharacter; placement: DirectorDetectedCharacterPlacement } => Boolean(item.placement))
      const stagedObjects = placements.map(({ detection, placement }, index) => {
        const bodyType = normalizeDirectorCharacterBodyType(detection.bodyType) || "mannequin"
        const pose = getDirectorPosePreset(detection.poseId || "stand")
        const object = createDirectorStagingCharacter(index + 1, bodyType)
        const objectId = directorConsoleId("detected-character")
        const panoramaAnchor: LibTvDirectorConsole3DPanoramaAnchor | undefined = parsedDetection?.projection === "equirectangular"
          ? {
              projection: "equirectangular",
              points: [
                { u: detection.bbox.x, v: detection.bbox.y },
                { u: detection.bbox.x + detection.bbox.width, v: detection.bbox.y },
                { u: detection.bbox.x + detection.bbox.width, v: detection.bbox.y + detection.bbox.height },
                { u: detection.bbox.x, v: detection.bbox.y + detection.bbox.height },
              ],
            }
          : undefined
        const panoramaBinding = panoramaAnchor
          ? sceneRef.current?.createPanoramaBinding(panoramaAnchor, placement.position, placement.rotationY) || undefined
          : undefined
        return {
          ...object,
          id: objectId,
          name: detection.label || `识别角色${index + 1}`,
          position: placement.position,
          rotation: { x: 0, y: Number(placement.rotationY.toFixed(2)), z: 0 },
          panoramaBinding,
          uniformScale: Number(placement.uniformScale.toFixed(2)),
          pose: pose.id,
          jointAngles: cloneDirectorJointAngles(pose.jointAngles),
          panoramaGroundSnapEnabled: true,
        } satisfies LibTvDirectorConsole3DObject
      })
      applyStateChange((current) => {
        if (!sameEnvironment(current)) return current
        const previous = current.characterDetection
        const previousIds = new Set(previous?.sourceFingerprint === sourceFingerprint ? (previous.characterObjectIds || []) : [])
        const shouldRemoveStarter = stagedObjects.length > 0 && current.objects.some((object) => isDirectorUntouchedStarterCharacter(current, object))
        const retainedObjects = current.objects.filter((object) => !previousIds.has(object.id) && !(shouldRemoveStarter && isDirectorUntouchedStarterCharacter(current, object)))
        const activeStillExists = Boolean(current.activeObjectId && (
          retainedObjects.some((object) => object.id === current.activeObjectId)
          || current.cameras.some((camera) => camera.id === current.activeObjectId)
        ))
        const activeObjectId = activeStillExists
          ? current.activeObjectId
          : current.activeCameraId
        return {
          ...current,
          objects: [...retainedObjects, ...stagedObjects],
          activeObjectId,
          selectedObjectIds: [],
          characterDetection: {
            sourceFingerprint,
            sourceUrl: environmentUrl.startsWith("data:") ? undefined : environmentUrl,
            status: "succeeded",
            projection: parsedDetection?.projection,
            detections,
            characterObjectIds: stagedObjects.map((object) => object.id),
            modelId: payload.modelId,
            error: placements.length === detections.length ? undefined : `有 ${detections.length - placements.length} 个人物未能投射到地面`,
            detectedAt: Date.now(),
          },
        }
      }, { history: false })
      if (detections.length === 0) message.info("图片中没有检测到可替换的人物")
      else if (placements.length < detections.length) message.warning(`已创建 ${placements.length} 个角色，另有 ${detections.length - placements.length} 个未能定位`)
      else message.success(`已识别并创建 ${placements.length} 个角色占位`)
    } catch (error) {
      if (controller.signal.aborted || !isCurrentRequest()) return
      const errorMessage = error instanceof Error ? error.message : "图片人物检测失败"
      applyStateChange((current) => sameEnvironment(current) ? {
        ...current,
        characterDetection: {
          ...(current.characterDetection || { sourceFingerprint, detections: [], characterObjectIds: [] }),
          sourceFingerprint,
          sourceUrl: environmentUrl.startsWith("data:") ? undefined : environmentUrl,
          status: "failed",
          error: errorMessage,
          detectedAt: Date.now(),
        },
      } : current, { history: false })
      message.error(errorMessage)
    } finally {
      if (characterDetectionRequestRef.current?.requestId === requestId) characterDetectionRequestRef.current = null
    }
  }, [applyStateChange])

  const handleUploadPanoramaFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ""
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    applyStateChange((current) => {
      const detectedObjectIds = new Set(current.characterDetection?.characterObjectIds || [])
      return {
        ...current,
        objects: detectedObjectIds.size > 0 ? current.objects.filter((object) => !detectedObjectIds.has(object.id)) : current.objects,
        environmentUrl: previewUrl,
        environmentSourceUrl: undefined,
        characterDetection: undefined,
      }
    })
    void uploadCanvasNodeFile(file)
      .then(({ publicUrl }) => {
        const uploadedUrl = String(publicUrl || "").trim()
        if (!uploadedUrl) return
        applyStateChange((current) => (
          current.environmentUrl === previewUrl ? { ...current, environmentUrl: uploadedUrl, environmentSourceUrl: undefined } : current
        ), { history: false })
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 15000)
      })
      .catch((error) => {
        console.warn("[director-console-3d] panorama upload failed", error)
        message.error(error instanceof Error ? error.message : "全景图上传失败，已保留本地预览")
      })
  }, [applyStateChange])

  const handleUploadDirectiveReferenceFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ""
    const directiveId = activeDirectiveId
    if (!file || !directiveId) return
    if (!file.type.startsWith("image/")) {
      message.warning("请上传图片参考")
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setDirectiveReferenceUploadingId(directiveId)
    patchDirective(directiveId, {
      referenceImageUrl: previewUrl,
      generationStatus: "idle",
      generationTaskId: undefined,
      generationModelRuntimeId: undefined,
      generatedModelUrl: undefined,
      generationError: undefined,
      status: "draft",
      summary: undefined,
    }, { history: false })
    void uploadCanvasNodeFile(file)
      .then(({ publicUrl }) => {
        const uploadedUrl = String(publicUrl || "").trim()
        if (!uploadedUrl) throw new Error("参考图上传失败")
        applyStateChange((current) => ({
          ...current,
          directives: (current.directives || []).map((directive) => directive.id === directiveId && directive.referenceImageUrl === previewUrl
            ? { ...directive, referenceImageUrl: uploadedUrl }
            : directive),
        }), { history: false })
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 15_000)
      })
      .catch((error) => {
        applyStateChange((current) => ({
          ...current,
          directives: (current.directives || []).map((directive) => directive.id === directiveId && directive.referenceImageUrl === previewUrl
            ? { ...directive, referenceImageUrl: undefined, generationError: error instanceof Error ? error.message : "参考图上传失败" }
            : directive),
        }), { history: false })
        URL.revokeObjectURL(previewUrl)
        message.error(error instanceof Error ? error.message : "参考图上传失败")
      })
      .finally(() => setDirectiveReferenceUploadingId((current) => current === directiveId ? null : current))
  }, [activeDirectiveId, applyStateChange, patchDirective])

  function createDirective(rect: LibTvDirectorConsole3DDirective["rect"]) {
    const id = directorConsoleId("directive")
    const targetObjectIds = sceneRef.current?.getObjectIdsInViewportRect(rect) || []
    const targetCharacter = state.objects.find((object) => targetObjectIds.includes(object.id) && object.kind === "character")
    const panoramaAnchor = sceneRef.current?.getPanoramaAnchorFromViewportRect(rect) || undefined
    const stageRect = stageViewportRef.current?.getBoundingClientRect()
    const position = stageRect
      ? sceneRef.current?.getGroundPositionFromClient(
          stageRect.left + (rect.x + rect.width / 2) * stageRect.width,
          stageRect.top + Math.min(0.995, rect.y + rect.height) * stageRect.height,
        ) || undefined
      : undefined
    const panoramaBinding = panoramaAnchor && position
      ? sceneRef.current?.createPanoramaBinding(panoramaAnchor, position, 0, id) || undefined
      : undefined
    const directive: LibTvDirectorConsole3DDirective = {
      id,
      name: `空间指令 ${directives.length + 1}`,
      rect,
      panoramaAnchor,
      panoramaBinding,
      prompt: "",
      action: "character",
      panoramaOperation: "edit",
      targetObjectId: targetCharacter?.id,
      targetObjectIds,
      targetCharacterPreset: targetCharacter ? undefined : "mannequin",
      attachmentMode: "auto",
      generationStatus: "idle",
      status: "draft",
      facing: "keep",
      position,
      createdAt: Date.now(),
    }
    applyStateChange((current) => ({ ...current, directives: [...(current.directives || []), directive] }))
    setActiveDirectiveId(id)
    setDirectiveMarking(false)
    setRightPanelMode("directives")
    setRightPanelOpen(true)
  }

  function deleteDirective(id: string) {
    applyStateChange((current) => ({
      ...current,
      directives: (current.directives || []).filter((directive) => directive.id !== id),
    }))
    setActiveDirectiveId((current) => current === id ? null : current)
  }

  function startDirectiveMarking() {
    setDirectiveMarking(true)
    setWorkspaceMode("scene")
    setRightPanelMode("directives")
  }

  function getDirectorDirectiveViewportRect(directive: LibTvDirectorConsole3DDirective) {
    return directive.panoramaAnchor
      ? sceneRef.current?.getViewportRectForPanoramaAnchor(directive.panoramaAnchor) || null
      : directive.rect
  }

  function getDirectorDirectiveGroundPosition(directive: LibTvDirectorConsole3DDirective) {
    if (directive.position) return { ...directive.position }
    const stage = stageViewportRef.current
    if (!stage) return null
    const stageRect = stage.getBoundingClientRect()
    const viewportRect = getDirectorDirectiveViewportRect(directive)
    if (!viewportRect) return null
    const clientX = stageRect.left + (viewportRect.x + viewportRect.width / 2) * stageRect.width
    const clientY = stageRect.top + Math.min(0.995, viewportRect.y + viewportRect.height) * stageRect.height
    return sceneRef.current?.getGroundPositionFromClient(clientX, clientY) || null
  }

  function resolveDirectorDirectiveTargetIds(directive: LibTvDirectorConsole3DDirective) {
    const existingIds = new Set(state.objects.map((object) => object.id))
    const savedIds = [
      ...(directive.targetObjectIds || []),
      ...(directive.targetObjectId ? [directive.targetObjectId] : []),
    ].filter((id) => existingIds.has(id))
    const viewportRect = getDirectorDirectiveViewportRect(directive)
    const viewportIds = viewportRect ? sceneRef.current?.getObjectIdsInViewportRect(viewportRect) || [] : []
    return Array.from(new Set(savedIds.length > 0 ? savedIds : viewportIds.filter((id) => existingIds.has(id))))
  }

  function applyDirectorRemoveDirective(directive: LibTvDirectorConsole3DDirective) {
    const targetObjectIds = resolveDirectorDirectiveTargetIds(directive)
    if (targetObjectIds.length === 0) {
      patchDirective(directive.id, { status: "error", summary: "框选区域内没有可移除的 3D 对象。" }, { history: false })
      message.warning("框选区域内没有可移除的 3D 对象")
      return
    }
    const removedIds = new Set(targetObjectIds)
    let changed = true
    while (changed) {
      changed = false
      state.objects.forEach((object) => {
        if (object.parentObjectId && removedIds.has(object.parentObjectId) && !removedIds.has(object.id)) {
          removedIds.add(object.id)
          changed = true
        }
      })
    }
    const removedNames = state.objects.filter((object) => removedIds.has(object.id)).map((object) => object.name)
    applyStateChange((current) => ({
      ...current,
      objects: current.objects.filter((object) => !removedIds.has(object.id)),
      cameras: current.cameras.map((camera) => camera.targetObjectId && removedIds.has(camera.targetObjectId) ? { ...camera, targetObjectId: undefined } : camera),
      selectedObjectIds: (current.selectedObjectIds || []).filter((id) => !removedIds.has(id)),
      activeObjectId: current.activeObjectId && removedIds.has(current.activeObjectId) ? undefined : current.activeObjectId,
      activeGroupId: undefined,
      directives: (current.directives || []).map((item) => item.id === directive.id ? {
        ...item,
        action: "remove",
        targetObjectIds: Array.from(removedIds),
        status: "applied",
        summary: `已移除 ${removedNames.slice(0, 3).join("、")}${removedNames.length > 3 ? ` 等 ${removedNames.length} 个对象` : ""}`,
      } : item),
    }))
    message.success(`已移除 ${removedIds.size} 个对象`)
  }

  async function requestDirectorAsset(
    operation: "submit" | "status",
    directive: LibTvDirectorConsole3DDirective,
    generationPrompt: string,
    task?: { taskId: string; modelRuntimeId: string },
  ) {
    const response = await fetch("/api/workflow/director-asset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation,
        projectId,
        prompt: generationPrompt,
        referenceImageUrl: directive.referenceImageUrl,
        taskId: task?.taskId,
        modelRuntimeId: task?.modelRuntimeId,
      }),
    })
    const payload = await response.json().catch(() => ({})) as DirectorAssetApiResponse
    if (!response.ok) throw new Error(String(payload.message || "3D 资产生成失败"))
    return payload
  }

  async function requestDirectorAssetLayout(
    directive: LibTvDirectorConsole3DDirective,
    prompt: string,
    availableCharacters: LibTvDirectorConsole3DObject[],
    preferredCharacters: LibTvDirectorConsole3DObject[],
  ): Promise<DirectorAssetLayoutPlan> {
    const fallback = getDirectorFallbackAssetLayout(
      prompt,
      availableCharacters,
      preferredCharacters,
      directive.attachmentMode,
      directive.attachmentCharacterId,
    )
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 12_000)
    try {
      const response = await fetch("/api/workflow/director-staging", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode: "asset",
          projectId,
          prompt,
          region: getDirectorDirectiveViewportRect(directive) || directive.rect,
          panoramaUrl: state.environmentUrl,
          targetObject: { name: getDirectorGeneratedObjectName(prompt) },
          availableCharacters: availableCharacters.map((character) => ({ id: character.id, name: character.name })),
          preferredCharacterIds: preferredCharacters.map((character) => character.id),
          attachment: {
            mode: directive.attachmentMode || "auto",
            targetCharacterId: directive.attachmentCharacterId,
          },
          availablePoses: DIRECTOR_POSE_PRESETS.map((pose) => ({ id: pose.id, label: pose.label })),
        }),
      })
      const payload = await response.json().catch(() => ({})) as Partial<DirectorAssetLayoutPlan> & { message?: string }
      if (!response.ok) throw new Error(String(payload.message || "AI 道具布局失败"))
      const availableCharacterIds = new Set(availableCharacters.map((character) => character.id))
      const requestedMode = directive.attachmentMode || "auto"
      const responseAttachment = payload.attachment
      const responseTargetId = String(responseAttachment?.targetCharacterId || "").trim()
      const explicitTargetId = String(directive.attachmentCharacterId || "").trim()
      const targetCharacterId = availableCharacterIds.has(explicitTargetId)
        ? explicitTargetId
        : availableCharacterIds.has(responseTargetId)
          ? responseTargetId
          : fallback.attachment.targetCharacterId
      const responseBone = responseAttachment?.attachBone === "leftHand" || responseAttachment?.attachBone === "rightHand"
        ? responseAttachment.attachBone
        : undefined
      const explicitBone = requestedMode === "leftHand" || requestedMode === "rightHand" ? requestedMode : undefined
      const attachBone = explicitBone || responseBone || fallback.attachment.attachBone
      const attachmentEnabled = requestedMode !== "none"
        && Boolean(targetCharacterId && attachBone && (requestedMode !== "auto" || responseAttachment?.enabled !== false))
      const targetLongestDimensionMeters = clampWorkflowNumber(
        Number(payload.targetLongestDimensionMeters ?? fallback.targetLongestDimensionMeters),
        0.03,
        8,
      )
      const gripOffset = payload.gripOffset
        ? {
            x: clampWorkflowNumber(Number(payload.gripOffset.x), -2, 2),
            y: clampWorkflowNumber(Number(payload.gripOffset.y), -2, 2),
            z: clampWorkflowNumber(Number(payload.gripOffset.z), -2, 2),
          }
        : fallback.gripOffset
      const rotation = payload.rotation
        ? {
            x: clampWorkflowNumber(Number(payload.rotation.x), -180, 180),
            y: clampWorkflowNumber(Number(payload.rotation.y), -180, 180),
            z: clampWorkflowNumber(Number(payload.rotation.z), -180, 180),
          }
        : fallback.rotation
      const poseId = DIRECTOR_POSE_PRESETS.some((pose) => pose.id === payload.poseId)
        ? String(payload.poseId)
        : fallback.poseId
      return {
        attachment: {
          enabled: attachmentEnabled,
          targetCharacterId: attachmentEnabled ? targetCharacterId : undefined,
          attachBone: attachmentEnabled ? attachBone : undefined,
        },
        targetLongestDimensionMeters,
        gripOffset,
        rotation,
        poseId,
        summary: String(payload.summary || fallback.summary).slice(0, 240),
        source: payload.source === "ai" ? "ai" : "fallback",
      }
    } catch (error) {
      console.warn("[director-console-3d] AI asset layout fallback", error)
      return fallback
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  async function applyDirectorAssetDirective(directive: LibTvDirectorConsole3DDirective) {
    const action = getDirectorDirectiveAction(directive)
    const prompt = String(directive.prompt || "").trim()
    const hasReferenceImage = Boolean(String(directive.referenceImageUrl || "").trim())
    if (!projectId) {
      message.error("当前项目尚未保存，无法生成并持久化 3D 资产")
      return
    }
    if (!prompt && !hasReferenceImage) {
      message.warning("请输入要生成或修改的对象，或上传参考图")
      return
    }
    if (String(directive.referenceImageUrl || "").startsWith("blob:")) {
      message.info("参考图仍在上传，请稍候")
      return
    }

    const targetObjectIds = resolveDirectorDirectiveTargetIds(directive)
    const editTarget = action === "edit"
      ? state.objects.find((object) => object.id === directive.targetObjectId)
        || state.objects.find((object) => targetObjectIds.includes(object.id) && object.kind !== "character")
        || state.objects.find((object) => targetObjectIds.includes(object.id))
      : undefined
    if (action === "edit" && !editTarget) {
      patchDirective(directive.id, { status: "error", summary: "请选择一个需要重新生成的 3D 对象。" }, { history: false })
      message.warning("框选区域内没有可修改的 3D 对象")
      return
    }
    if (editTarget?.kind === "character") {
      message.info("角色姿势请使用“角色调度”；角色手持道具请使用“新增对象”")
      return
    }

    const allCharacters = state.objects.filter((object) => object.kind === "character")
    const regionCharacters = allCharacters.filter((object) => targetObjectIds.includes(object.id))
    const assetLayout = action === "add"
      ? await requestDirectorAssetLayout(directive, prompt, allCharacters, regionCharacters)
      : null
    const attachmentCharacter = assetLayout?.attachment.enabled
      ? state.objects.find((object) => object.id === assetLayout.attachment.targetCharacterId && object.kind === "character")
      : undefined
    const groundPosition = attachmentCharacter ? { x: 0, y: 0, z: 0 } : getDirectorDirectiveGroundPosition(directive)
    if (action === "add" && !groundPosition) {
      patchDirective(directive.id, { status: "error", summary: "无法将此区域投射到 3D 地面，请重新框选。" }, { history: false })
      message.error("此区域无法定位到 3D 地面")
      return
    }

    const generationPrompt = buildDirectorAssetGenerationPrompt(prompt)
    const existingGeneration = directive.generationStatus === "processing"
      && directive.generationTaskId
      && directive.generationModelRuntimeId
      ? { taskId: directive.generationTaskId, modelRuntimeId: directive.generationModelRuntimeId }
      : null
    const generatedName = prompt
      ? getDirectorGeneratedObjectName(prompt)
      : editTarget?.name || "参考图模型"
    const placeholderId = action === "add"
      ? (existingGeneration && directive.targetObjectId ? directive.targetObjectId : directorConsoleId("generated-object"))
      : editTarget?.id
    if (!placeholderId) return

    if (action === "add" && !state.objects.some((object) => object.id === placeholderId)) {
      const viewportScale = groundPosition && !attachmentCharacter
        ? sceneRef.current?.getCharacterScaleForViewportRect(groundPosition, getDirectorDirectiveViewportRect(directive) || directive.rect) ?? 1
        : 0.38
      const savedPanoramaBinding = normalizeDirectorPanoramaBinding(directive.panoramaBinding)
      const environmentFingerprint = getDirectorEnvironmentFingerprint(state.environmentUrl)
      const panoramaBinding = !attachmentCharacter && groundPosition && directive.panoramaAnchor
        ? savedPanoramaBinding?.environmentFingerprint === environmentFingerprint
          ? updateDirectorPanoramaBindingRotation(savedPanoramaBinding, state, 0)
          : sceneRef.current?.createPanoramaBinding(directive.panoramaAnchor, groundPosition, 0, directive.id) || undefined
        : undefined
      const placeholder: LibTvDirectorConsole3DObject = {
        id: placeholderId,
        name: generatedName,
        kind: "primitive",
        primitive: "box",
        color: "#72d7c6",
        position: attachmentCharacter ? assetLayout?.gripOffset || { x: 0, y: -0.18, z: 0 } : groundPosition || { x: 0, y: 0, z: 0 },
        rotation: attachmentCharacter ? assetLayout?.rotation || { x: 0, y: 0, z: 0 } : { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        uniformScale: attachmentCharacter
          ? Number(clampWorkflowNumber(Number(assetLayout?.targetLongestDimensionMeters || 0.36) / 1.6, 0.05, 5).toFixed(3))
          : Number(clampWorkflowNumber(viewportScale, 0.2, 6).toFixed(2)),
        visible: true,
        locked: Boolean(attachmentCharacter),
        parentObjectId: attachmentCharacter?.id,
        attachBone: assetLayout?.attachment.attachBone,
        panoramaBinding,
      }
      applyStateChange((current) => ({
        ...current,
        activeObjectId: placeholder.id,
        selectedObjectIds: [placeholder.id],
        activeGroupId: undefined,
        objects: [...current.objects, placeholder],
        directives: (current.directives || []).map((item) => item.id === directive.id ? {
          ...item,
          action,
          targetObjectId: placeholder.id,
          targetObjectIds,
          panoramaBinding,
          status: "planning",
          generationStatus: existingGeneration ? "processing" : "submitting",
          generationError: undefined,
          summary: existingGeneration ? "正在继续检查 3D 生成任务。" : "已放置生成占位，正在创建 3D 模型。",
        } : item),
      }))
    } else {
      patchDirective(directive.id, {
        action,
        targetObjectId: placeholderId,
        targetObjectIds,
        status: "planning",
        generationStatus: existingGeneration ? "processing" : "submitting",
        generationError: undefined,
        summary: existingGeneration ? "正在继续检查 3D 生成任务。" : "正在重新生成选中的 3D 对象。",
      }, { history: false })
    }

    setDirectiveApplyingId(directive.id)
    try {
      let payload = existingGeneration
        ? await requestDirectorAsset("status", directive, generationPrompt, existingGeneration)
        : await requestDirectorAsset("submit", directive, generationPrompt)
      let taskId = String(payload.taskId || existingGeneration?.taskId || "").trim()
      let modelRuntimeId = String(payload.modelRuntimeId || existingGeneration?.modelRuntimeId || "").trim()
      if (taskId || modelRuntimeId) {
        patchDirective(directive.id, {
          generationStatus: payload.status === "succeeded" ? "succeeded" : "processing",
          generationTaskId: taskId || undefined,
          generationModelRuntimeId: modelRuntimeId || undefined,
          summary: payload.status === "succeeded" ? "3D 模型已生成，正在放入场景。" : "WaveSpeed 正在生成 3D 模型。",
        }, { history: false })
      }

      let attempts = 0
      while (payload.status === "processing" && taskId && modelRuntimeId && attempts < 150) {
        attempts += 1
        await waitForDirectorAssetPoll(attempts === 1 ? 1800 : 4000)
        payload = await requestDirectorAsset("status", directive, generationPrompt, { taskId, modelRuntimeId })
        taskId = String(payload.taskId || taskId).trim()
        modelRuntimeId = String(payload.modelRuntimeId || modelRuntimeId).trim()
        if (attempts % 3 === 0 && payload.status === "processing") {
          patchDirective(directive.id, {
            generationStatus: "processing",
            summary: Number.isFinite(Number(payload.progress)) ? `3D 模型生成中 ${Math.round(Number(payload.progress))}%` : "3D 模型仍在生成，请稍候。",
          }, { history: false })
        }
      }

      if (payload.status === "processing") {
        patchDirective(directive.id, {
          status: "planning",
          generationStatus: "processing",
          generationTaskId: taskId || undefined,
          generationModelRuntimeId: modelRuntimeId || undefined,
          summary: "任务仍在后台生成，稍后再次点击即可继续检查。",
        }, { history: false })
        message.info("3D 模型仍在后台生成，稍后可继续检查")
        return
      }
      const modelUrl = String(payload.modelUrl || "").trim()
      if (payload.status !== "succeeded" || !modelUrl) throw new Error(payload.message || "3D 模型生成失败")

      const heldPose = getDirectorPosePreset(assetLayout?.poseId || "stretch")
      applyStateChange((current) => ({
        ...current,
        activeObjectId: placeholderId,
        selectedObjectIds: [placeholderId],
        activeGroupId: undefined,
        objects: current.objects.map((object) => {
          if (object.id === placeholderId) {
            return {
              ...object,
              name: generatedName,
              kind: "uploaded" as const,
              primitive: undefined,
              modelUrl,
              color: "#ffffff",
              crowdCount: undefined,
              crowdRows: undefined,
              crowdCols: undefined,
              crowdSpacing: undefined,
            }
          }
          if (attachmentCharacter && object.id === attachmentCharacter.id) {
            return { ...object, pose: heldPose.id, jointAngles: cloneDirectorJointAngles(heldPose.jointAngles) }
          }
          return object
        }),
        directives: (current.directives || []).map((item) => item.id === directive.id ? {
          ...item,
          action,
          targetObjectId: placeholderId,
          targetObjectIds: Array.from(new Set([...targetObjectIds, placeholderId])),
          status: "applied",
          generationStatus: "succeeded",
          generationTaskId: taskId || undefined,
          generationModelRuntimeId: modelRuntimeId || undefined,
          generatedModelUrl: modelUrl,
          generationError: undefined,
          summary: attachmentCharacter
            ? `已生成“${generatedName}”并绑定到${attachmentCharacter.name}的${assetLayout?.attachment.attachBone === "leftHand" ? "左手" : "右手"}。`
            : action === "edit"
              ? `已重新生成并替换“${editTarget?.name || generatedName}”。`
              : `已生成“${generatedName}”并放入框选区域。`,
        } : item),
      }))
      message.success(action === "edit" ? "3D 对象已重新生成" : attachmentCharacter ? "道具已生成并绑定角色" : "3D 对象已加入场景")
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "3D 模型生成失败"
      applyStateChange((current) => ({
        ...current,
        objects: action === "add" && !directive.generatedModelUrl
          ? current.objects.filter((object) => object.id !== placeholderId)
          : current.objects,
        directives: (current.directives || []).map((item) => item.id === directive.id ? {
          ...item,
          status: "error",
          generationStatus: "failed",
          generationError: errorMessage,
          summary: errorMessage,
        } : item),
      }), { history: false })
      message.error(errorMessage)
    } finally {
      setDirectiveApplyingId((current) => current === directive.id ? null : current)
    }
  }

  async function applyDirectorPanoramaDirective(directive: LibTvDirectorConsole3DDirective) {
    const environmentUrl = String(state.environmentUrl || "").trim()
    const sourceNodeId = directorPanoramaUsesConnectedSource(state, connectedPanoramaSource)
      ? connectedPanoramaSource?.nodeId
      : undefined
    const operation = directive.panoramaOperation || "edit"
    const prompt = String(directive.prompt || "").trim()
    if (!environmentUrl) {
      patchDirective(directive.id, { status: "error", summary: "请先上传 2:1 全景图。" }, { history: false })
      message.warning("请先上传 2:1 全景图")
      return
    }
    if (operation !== "remove" && !prompt) {
      message.warning(operation === "add" ? "请输入要新增的全景内容" : "请输入要修改的全景内容")
      return
    }
    const mask = sceneRef.current?.createPanoramaMask(directive.rect, directive.panoramaAnchor)
    if (!mask || "error" in mask) {
      const errorMessage = mask && "error" in mask ? mask.error : "无法创建全景编辑蒙版"
      patchDirective(directive.id, { status: "error", summary: errorMessage }, { history: false })
      message.error(errorMessage)
      return
    }

    const editPrompt = operation === "remove"
      ? ""
      : [
          operation === "add" ? "只在白色蒙版区域内新增用户指定的内容。" : "只在白色蒙版区域内按用户要求修改原有内容。",
          prompt,
          "保持 2:1 等距柱状全景投影、原始画幅、透视、光照与接缝连续，不得改变蒙版外任何像素。",
        ].join(" ")
    setDirectiveApplyingId(directive.id)
    patchDirective(directive.id, {
      status: "planning",
      generationStatus: "submitting",
      generationError: undefined,
      summary: operation === "remove" ? "正在移除框选区域的全景元素。" : "正在局部编辑全景图。",
    }, { history: false })
    try {
      const response = await fetch("/api/erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: environmentUrl,
          maskData: mask.maskData,
          prompt: editPrompt,
          operation,
          lockOutsideMask: true,
          projectId,
        }),
      })
      const payload = await response.json().catch(() => ({})) as { success?: boolean; url?: string; error?: string }
      if (!response.ok || !payload.url) throw new Error(String(payload.error || "全景局部编辑失败"))
      const editedPanoramaUrl = String(payload.url).trim()
      const operationLabel = operation === "add" ? "新增" : operation === "remove" ? "移除" : "修改"
      applyStateChange((current) => {
        const previousFingerprint = getDirectorEnvironmentFingerprint(current.environmentUrl)
        const nextFingerprint = getDirectorEnvironmentFingerprint(editedPanoramaUrl)
        const preserveBinding = (binding: LibTvDirectorConsole3DPanoramaBinding | undefined) => (
          binding?.environmentFingerprint === previousFingerprint
            ? { ...binding, environmentFingerprint: nextFingerprint }
            : binding
        )
        return {
          ...current,
          environmentUrl: editedPanoramaUrl,
          environmentSourceUrl: sourceNodeId ? editedPanoramaUrl : current.environmentSourceUrl,
          objects: current.objects.map((object) => ({ ...object, panoramaBinding: preserveBinding(object.panoramaBinding) })),
          directives: (current.directives || []).map((item) => ({
            ...item,
            panoramaBinding: preserveBinding(item.panoramaBinding),
            ...(item.id === directive.id ? {
              action: "panorama" as const,
              panoramaOperation: operation,
              status: "applied" as const,
              generationStatus: "succeeded" as const,
              generationError: undefined,
              summary: `已完成全景局部${operationLabel}，框外画面保持原图。`,
            } : {}),
          })),
        }
      })
      onPanoramaEditApplied?.(editedPanoramaUrl, sourceNodeId)
      message.success(`全景局部${operationLabel}已完成`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "全景局部编辑失败"
      patchDirective(directive.id, {
        status: "error",
        generationStatus: "failed",
        generationError: errorMessage,
        summary: errorMessage,
      }, { history: false })
      message.error(errorMessage)
    } finally {
      setDirectiveApplyingId((current) => current === directive.id ? null : current)
    }
  }

  async function applyDirectorDirective(directive: LibTvDirectorConsole3DDirective) {
    const action = getDirectorDirectiveAction(directive)
    if (action === "panorama") {
      await applyDirectorPanoramaDirective(directive)
      return
    }
    if (action === "remove") {
      applyDirectorRemoveDirective(directive)
      return
    }
    if (action === "add" || action === "edit") {
      await applyDirectorAssetDirective(directive)
      return
    }
    await applyDirectorCharacterDirective(directive)
  }

  async function applyDirectorCharacterDirective(directive: LibTvDirectorConsole3DDirective) {
    const prompt = String(directive.prompt || "").trim()
    if (!prompt) {
      message.warning("请先输入调度要求")
      return
    }
    const existingTarget = state.objects.find((object) => object.id === directive.targetObjectId && object.kind === "character")
    const targetPreset = getDirectorCharacterBodyOption(directive.targetCharacterPreset)
    const createsTarget = !existingTarget
    const target = existingTarget || createDirectorStagingCharacter(
      state.objects.filter((object) => object.kind === "character").length + 1,
      targetPreset.id,
    )
    const position = getDirectorDirectiveGroundPosition(directive)
    if (!position) {
      patchDirective(directive.id, { status: "error", summary: "无法将此区域投射到地面，请重新框选。" }, { history: false })
      message.error("此区域无法定位到 3D 地面")
      return
    }

    setDirectiveApplyingId(directive.id)
    try {
      patchDirective(directive.id, { status: "planning", summary: undefined }, { history: false })
      const localPlan = inferDirectorDirectivePlan(prompt)
      let plan = localPlan
      let usedFallback = false
      try {
        const requestController = new AbortController()
        const requestTimeout = window.setTimeout(() => requestController.abort(), 12_000)
        try {
          const snapshot = sceneRef.current?.capture(null)?.dataUrl
          const response = await fetch("/api/workflow/director-staging", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: requestController.signal,
            body: JSON.stringify({
              projectId,
              prompt,
              region: getDirectorDirectiveViewportRect(directive) || directive.rect,
              panoramaUrl: state.environmentUrl,
              imageDataUrl: snapshot,
              targetObject: { id: target.id, name: target.name, poseId: target.pose || "stand" },
              availablePoses: DIRECTOR_POSE_PRESETS.map((pose) => ({ id: pose.id, label: pose.label })),
            }),
          })
          const payload = await response.json().catch(() => ({})) as Partial<DirectorDirectivePlan> & { message?: string }
          if (!response.ok) throw new Error(String(payload.message || "AI 调度失败"))
          const poseId = DIRECTOR_POSE_PRESETS.some((pose) => pose.id === payload.poseId) ? String(payload.poseId) : localPlan.poseId
          const facing = payload.facing === "camera" || payload.facing === "away" || payload.facing === "left" || payload.facing === "right" || payload.facing === "keep"
            ? payload.facing
            : localPlan.facing
          plan = {
            poseId,
            facing,
            scale: clampWorkflowNumber(Number(payload.scale ?? localPlan.scale), 0.6, 1.6),
            summary: String(payload.summary || localPlan.summary).slice(0, 240),
            source: payload.source === "ai" ? "ai" : "rules",
          }
          usedFallback = plan.source !== "ai"
        } finally {
          window.clearTimeout(requestTimeout)
        }
      } catch (error) {
        usedFallback = true
        console.warn("[director-console-3d] AI staging fallback", error)
      }

      const cameraPose = sceneRef.current?.getDirectorCameraState()
      const cameraFacing = cameraPose
        ? THREE.MathUtils.radToDeg(Math.atan2(cameraPose.position.x - position.x, cameraPose.position.z - position.z))
        : target.rotation.y
      const rotationY = plan.facing === "camera"
        ? cameraFacing
        : plan.facing === "away"
          ? cameraFacing + 180
          : plan.facing === "left"
            ? cameraFacing - 90
            : plan.facing === "right"
              ? cameraFacing + 90
              : target.rotation.y
      const pose = getDirectorPosePreset(plan.poseId)
      const viewportScale = sceneRef.current?.getCharacterScaleForViewportRect(position, getDirectorDirectiveViewportRect(directive) || directive.rect) ?? 1
      const uniformScale = clampWorkflowNumber(viewportScale * plan.scale, 0.25, 6)
      const savedPanoramaBinding = normalizeDirectorPanoramaBinding(directive.panoramaBinding)
      const environmentFingerprint = getDirectorEnvironmentFingerprint(state.environmentUrl)
      const panoramaBinding = directive.panoramaAnchor
        ? savedPanoramaBinding?.environmentFingerprint === environmentFingerprint
          ? updateDirectorPanoramaBindingRotation(savedPanoramaBinding, state, rotationY)
          : sceneRef.current?.createPanoramaBinding(directive.panoramaAnchor, position, rotationY, directive.id) || undefined
        : undefined
      const completionSummary = createsTarget
        ? `已新建${targetPreset.label}角色，${plan.summary}`.slice(0, 240)
        : plan.summary

      applyStateChange((current) => ({
        ...current,
        activeObjectId: target.id,
        selectedObjectIds: [target.id],
        activeGroupId: undefined,
        objects: (createsTarget && !current.objects.some((object) => object.id === target.id)
          ? [...current.objects, target]
          : current.objects).map((object) => object.id === target.id ? {
          ...object,
          position: { ...position },
          rotation: { ...object.rotation, y: Number(rotationY.toFixed(2)) },
          panoramaBinding,
          pose: pose.id,
          jointAngles: cloneDirectorJointAngles(pose.jointAngles),
          uniformScale: Number(uniformScale.toFixed(2)),
        } : object),
        directives: (current.directives || []).map((item) => item.id === directive.id ? {
          ...item,
          action: "character",
          targetObjectId: target.id,
          targetObjectIds: Array.from(new Set([...(item.targetObjectIds || []), target.id])),
          targetCharacterPreset: undefined,
          status: "applied",
          poseId: pose.id,
          facing: plan.facing,
          position: { ...position },
          panoramaBinding,
          summary: completionSummary,
        } : item),
      }))
      if (usedFallback) message.info("AI 服务暂未返回，已按本地调度规则完成")
      else message.success(createsTarget ? "新角色已创建并完成调度" : "AI 调度已应用")
    } finally {
      setDirectiveApplyingId((current) => current === directive.id ? null : current)
    }
  }

  const undoDirectorConsole = useCallback(() => {
    setState((current) => {
      const previous = historyRef.current.past.at(-1)
      if (!previous) return current
      historyRef.current = {
        past: historyRef.current.past.slice(0, -1),
        future: [cloneDirectorConsoleStateForHistory(current), ...historyRef.current.future].slice(0, 50),
      }
      return previous
    })
  }, [])

  const redoDirectorConsole = useCallback(() => {
    setState((current) => {
      const next = historyRef.current.future[0]
      if (!next) return current
      historyRef.current = {
        past: [...historyRef.current.past.slice(-49), cloneDirectorConsoleStateForHistory(current)],
        future: historyRef.current.future.slice(1),
      }
      return next
    })
  }, [])

  const handleUsePanoramaHistoryFile = useCallback((file: WorkflowHistoryFile) => {
    const url = String(file.fileUrl || "").trim()
    if (!url) {
      message.warning("该历史记录没有可用文件")
      return
    }
    if (String(file.fileType || "").toLowerCase() !== "image") {
      message.warning("全景图背景仅支持使用图片历史")
      return
    }
    applyStateChange((current) => ({ ...current, environmentUrl: url, environmentSourceUrl: undefined }))
    setPanoramaHistoryOpen(false)
  }, [applyStateChange])

  useEffect(() => {
    if (!addMenuOpen && !transformMenuOpen && !panoramaMenuOpen && !cameraMenuOpen && !aspectMenuOpen && !sceneTreeMenu && !shortcutHelpOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (event.target instanceof globalThis.Node) {
        if (toolbarRef.current?.contains(event.target)) return
        if (sceneTreeMenuRef.current?.contains(event.target)) return
      }
      setAddMenuOpen(false)
      setTransformMenuOpen(false)
      setPanoramaMenuOpen(false)
      setCameraMenuOpen(false)
      setAspectMenuOpen(false)
      setSceneTreeMenu(null)
      setShortcutHelpOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown, true)
    return () => document.removeEventListener("mousedown", handlePointerDown, true)
  }, [addMenuOpen, aspectMenuOpen, cameraMenuOpen, panoramaMenuOpen, sceneTreeMenu, shortcutHelpOpen, transformMenuOpen])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest("input,textarea,select,[contenteditable='true']")) return
      const key = event.key.toLowerCase()
      if (key === "escape") {
        event.preventDefault()
        if (timelineDrawingSession) {
          timelineDrawingPointsRef.current = []
          setTimelineDrawingSession(null)
          setTimelineDrawingTrackId(null)
          return
        }
        if (panoramaHistoryOpen) {
          setPanoramaHistoryOpen(false)
          return
        }
        if (panoramaAiOpen) {
          setPanoramaAiOpen(false)
          return
        }
        if (addMenuOpen || transformMenuOpen || panoramaMenuOpen || cameraMenuOpen || aspectMenuOpen) {
          setAddMenuOpen(false)
          setTransformMenuOpen(false)
          setPanoramaMenuOpen(false)
          setCameraMenuOpen(false)
          setAspectMenuOpen(false)
          return
        }
        if (shortcutHelpOpen) {
          setShortcutHelpOpen(false)
          return
        }
        onClose()
        return
      }
      if (key === "enter" && timelineDrawingSession?.type === "pen") {
        event.preventDefault()
        finishTimelineMotionDrawing(timelineDrawingSession)
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        if (key === "v") {
          event.preventDefault()
          applyStateChange((current) => ({ ...current, transformMode: "translate" }), { history: false })
        }
        if (key === "r") {
          event.preventDefault()
          applyStateChange((current) => ({ ...current, transformMode: "rotate" }), { history: false })
        }
        if (key === "s") {
          event.preventDefault()
          applyStateChange((current) => ({ ...current, transformMode: "scale" }), { history: false })
        }
        if (key === "x") {
          event.preventDefault()
          applyStateChange((current) => ({ ...current, gridSnap: !current.gridSnap }))
        }
        if (key === "t") {
          event.preventDefault()
          sceneRef.current?.setPresetView("top")
        }
        if (key === "y") {
          event.preventDefault()
          sceneRef.current?.setPresetView("front")
        }
        if (key === "q") {
          event.preventDefault()
          sceneRef.current?.resetView()
        }
      }
      if ((event.metaKey || event.ctrlKey) && key === "d") {
        event.preventDefault()
        duplicateActiveSelection()
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault()
        deleteActiveObject()
      }
      if ((event.metaKey || event.ctrlKey) && key === "g") {
        event.preventDefault()
        if (event.shiftKey) groupActiveSelection()
        else ungroupActiveSelection()
      }
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault()
        if (event.shiftKey) redoDirectorConsole()
        else undoDirectorConsole()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  })

	  const activeCamera = state.cameras.find((camera) => camera.id === state.activeCameraId) || state.cameras[0]
  const activeObject = state.objects.find((object) => object.id === state.activeObjectId)
  const activeGroup = state.activeGroupId ? state.objectGroups?.find((group) => group.id === state.activeGroupId) : undefined
  const activeGroupObjects = activeGroup
    ? activeGroup.objectIds.map((id) => state.objects.find((object) => object.id === id)).filter(Boolean) as LibTvDirectorConsole3DObject[]
    : []
  const activeIsGroup = Boolean(activeGroup && activeGroupObjects.length > 1)
  const activeIsScene = state.activeObjectId === "scene" || (!activeIsGroup && !activeObject && !state.cameras.some((camera) => camera.id === state.activeObjectId))
  const activeIsCamera = !activeObject && state.cameras.some((camera) => camera.id === state.activeObjectId)
  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const items: DirectorSceneTreeItem[] = []
    const groupedIds = new Set<string>()
    ;(state.objectGroups || []).forEach((group) => group.objectIds.forEach((id) => groupedIds.add(id)))
    const matchesNeedle = (name: string) => !needle || name.toLowerCase().includes(needle)
    const cameras = state.cameras.map((camera) => ({ id: camera.id, name: camera.name, type: "camera" as const, visible: camera.visible !== false, locked: Boolean(camera.locked), objectIds: [] }))
    cameras.forEach((camera) => {
      if (matchesNeedle(camera.name)) items.push(camera)
    })
    ;(state.objectGroups || []).forEach((group) => {
      const objects = group.objectIds.map((id) => state.objects.find((object) => object.id === id)).filter(Boolean) as LibTvDirectorConsole3DObject[]
      const groupItem: DirectorSceneTreeItem = { id: group.id, name: group.name, type: "group", visible: objects.some((object) => object.visible !== false), locked: objects.every((object) => object.locked), objectIds: group.objectIds }
      const childItems = objects.map((object) => ({ id: object.id, name: object.name, type: object.kind, visible: object.visible !== false, locked: Boolean(object.locked), objectIds: [], depth: 1, parentGroupId: group.id }))
      if (matchesNeedle(group.name) || childItems.some((item) => matchesNeedle(item.name))) {
        items.push(groupItem)
        childItems.filter((item) => matchesNeedle(group.name) || matchesNeedle(item.name)).forEach((item) => items.push(item))
      }
    })
    state.objects
      .filter((object) => !groupedIds.has(object.id))
      .map((object) => ({ id: object.id, name: object.name, type: object.kind, visible: object.visible !== false, locked: Boolean(object.locked), objectIds: [] }))
      .filter((item) => matchesNeedle(item.name))
      .forEach((item) => items.push(item))
    return items
  }, [search, state.cameras, state.objectGroups, state.objects])

  function updateObject(id: string, patch: Partial<LibTvDirectorConsole3DObject>, options?: { history?: boolean }) {
    applyStateChange((current) => ({
      ...current,
      objects: current.objects.map((object) => object.id === id ? applyDirectorObjectStatePatch(object, patch) : object),
    }), options)
  }

  function updateCamera(id: string, patch: Partial<LibTvDirectorConsole3DCamera>) {
    applyStateChange((current) => ({
      ...current,
      cameras: current.cameras.map((camera) => camera.id === id ? applyDirectorCameraPatch(camera, patch) : camera),
    }))
  }

  function getSceneTreeItemSelection(current: LibTvDirectorConsole3DState, item: DirectorSceneTreeItem) {
    if (item.type === "group") {
      const group = current.objectGroups?.find((group) => group.id === item.id)
      return {
        activeObjectId: group?.objectIds.at(-1),
        activeCameraId: current.activeCameraId,
        selectedObjectIds: group?.objectIds || [],
        activeGroupId: group?.id,
      }
    }
    const isObject = current.objects.some((object) => object.id === item.id)
    if (!isObject) {
      return {
        activeObjectId: item.type === "camera" ? item.id : undefined,
        activeCameraId: item.type === "camera" ? item.id : current.activeCameraId,
        selectedObjectIds: [],
        activeGroupId: undefined,
      }
    }
    return {
      activeObjectId: item.id,
      activeCameraId: current.activeCameraId,
      selectedObjectIds: [item.id],
      activeGroupId: undefined,
    }
  }

  function selectSceneTreeItem(item: DirectorSceneTreeItem, additive = false) {
    applyStateChange((current) => {
      if (additive && item.type !== "camera" && item.type !== "group") {
        const currentSelected = current.selectedObjectIds || []
        const selectedObjectIds = currentSelected.includes(item.id)
          ? currentSelected.filter((id) => id !== item.id)
          : [...currentSelected, item.id]
        return {
          ...current,
          activeObjectId: item.id,
          selectedObjectIds,
          activeGroupId: undefined,
        }
      }
      return { ...current, ...getSceneTreeItemSelection(current, item) }
    }, { history: false })
    if (item.type !== "character") setSelectedTab("props")
  }

  function setSceneTreeItemVisible(item: DirectorSceneTreeItem, visible: boolean) {
    applyStateChange((current) => {
      if (item.type === "group") {
        return { ...current, objects: current.objects.map((object) => item.objectIds.includes(object.id) ? { ...object, visible } : object) }
      }
      if (item.type === "camera") {
        return { ...current, cameras: current.cameras.map((camera) => camera.id === item.id ? { ...camera, visible } : camera) }
      }
      return { ...current, objects: current.objects.map((object) => object.id === item.id ? { ...object, visible } : object) }
    })
  }

  function setSceneTreeItemLocked(item: DirectorSceneTreeItem, locked: boolean) {
    applyStateChange((current) => {
      if (item.type === "group") {
        return { ...current, objects: current.objects.map((object) => item.objectIds.includes(object.id) ? { ...object, locked } : object) }
      }
      if (item.type === "camera") {
        return { ...current, cameras: current.cameras.map((camera) => camera.id === item.id ? { ...camera, locked } : camera) }
      }
      return { ...current, objects: current.objects.map((object) => object.id === item.id ? { ...object, locked } : object) }
    })
  }

  function pruneDirectorTimelineTargets(current: LibTvDirectorConsole3DState, targetIds: Set<string>) {
    if (!current.timeline || targetIds.size === 0) return current.timeline
    const currentTimeline = normalizePersistedDirectorTimeline(current.timeline, current)
    const removedPathIds = new Set((currentTimeline.paths || [])
      .filter((path) => targetIds.has(path.targetId))
      .map((path) => path.id))
    return {
      ...currentTimeline,
      paths: (currentTimeline.paths || []).filter((path) => !targetIds.has(path.targetId)),
      tracks: currentTimeline.tracks
        .filter((track) => !targetIds.has(track.targetId))
        .map((track) => ({
          ...track,
          actions: (track.actions || []).filter((action) => !removedPathIds.has(action.pathId)),
        })),
    }
  }

  function deleteSceneTreeItem(item: DirectorSceneTreeItem) {
    applyStateChange((current) => {
      if (item.type === "camera") {
        if (current.cameras.length <= 1) return current
        const cameras = current.cameras.filter((camera) => camera.id !== item.id)
        const removeSet = new Set([item.id])
        return {
          ...current,
          cameras,
          timeline: pruneDirectorTimelineTargets(current, removeSet),
          activeCameraId: current.activeCameraId === item.id ? cameras[0]?.id : current.activeCameraId,
          activeObjectId: current.activeObjectId === item.id ? undefined : current.activeObjectId,
        }
      }
      const removeIds = item.type === "group" ? item.objectIds : [item.id]
      const removeSet = new Set(removeIds)
      return {
        ...current,
        objects: current.objects.filter((object) => !removeSet.has(object.id)),
        timeline: pruneDirectorTimelineTargets(current, removeSet),
        objectGroups: (current.objectGroups || [])
          .map((group) => ({ ...group, objectIds: group.objectIds.filter((id) => !removeSet.has(id)) }))
          .filter((group) => group.objectIds.length > 1 && group.id !== item.id),
        cameras: current.cameras.map((camera) => camera.targetObjectId && removeSet.has(camera.targetObjectId) ? { ...camera, targetObjectId: undefined } : camera),
        activeObjectId: removeSet.has(String(current.activeObjectId || "")) ? undefined : current.activeObjectId,
        selectedObjectIds: (current.selectedObjectIds || []).filter((id) => !removeSet.has(id)),
        activeGroupId: current.activeGroupId === item.id ? undefined : current.activeGroupId,
      }
    })
  }

  function ungroupSceneTreeItem(item: DirectorSceneTreeItem) {
    applyStateChange((current) => {
      const groupId = item.type === "group" ? item.id : item.parentGroupId || current.objects.find((object) => object.id === item.id)?.groupId
      if (!groupId) return current
      const group = current.objectGroups?.find((group) => group.id === groupId)
      const objectIds = group?.objectIds || []
      return {
        ...current,
        objectGroups: (current.objectGroups || []).filter((group) => group.id !== groupId),
        objects: current.objects.map((object) => objectIds.includes(object.id) ? { ...object, groupId: undefined } : object),
        selectedObjectIds: objectIds,
        activeObjectId: objectIds.at(-1),
        activeGroupId: undefined,
      }
    })
  }

  function groupSceneTreeItem(item: DirectorSceneTreeItem) {
    if (item.type === "camera") return
    applyStateChange((current) => {
      const selectedObjectIds = current.selectedObjectIds?.length ? current.selectedObjectIds : [item.id]
      if (selectedObjectIds.length < 2) return current
      const group = { id: directorConsoleId("group"), name: `人物组${(current.objectGroups || []).length + 1}`, objectIds: selectedObjectIds }
      return {
        ...current,
        objectGroups: [...(current.objectGroups || []), group],
        objects: current.objects.map((object) => selectedObjectIds.includes(object.id) ? { ...object, groupId: group.id } : object),
        selectedObjectIds,
        activeObjectId: selectedObjectIds.at(-1),
        activeGroupId: group.id,
      }
    })
  }

  function addObject(kind: LibTvDirectorConsole3DObject["kind"], primitive: LibTvDirectorConsole3DPrimitive = "box", patch: Partial<LibTvDirectorConsole3DObject> = {}) {
    const index = state.objects.length + 1
    const defaultCharacterColor = DIRECTOR_CHARACTER_COLORS[(index - 1) % DIRECTOR_CHARACTER_COLORS.length]
    const basePosition = patch.position || DIRECTOR_SCENE_OBJECT_SPAWN_POSITION
    const bodyType = patch.bodyType || (kind === "character" ? "mannequin" : undefined)
    const object: LibTvDirectorConsole3DObject = {
      id: directorConsoleId(kind),
      name: patch.name || (kind === "character" ? `人物${index}` : kind === "crowd" ? `群众阵列${index}` : kind === "uploaded" ? `上传模型${index}` : `元素${index}`),
      kind,
      primitive,
      color: patch.color || (kind === "character" || kind === "crowd" ? defaultCharacterColor : "#d7b46a"),
      position: { ...basePosition, y: kind === "primitive" && primitive !== "plane" ? 0.5 : 0 },
      rotation: patch.rotation || { x: 0, y: 0, z: 0 },
      scale: patch.scale || (kind === "character" ? getDirectorCharacterPresetScaleVector(bodyType) : { x: 1, y: 1, z: 1 }),
      uniformScale: Number.isFinite(Number(patch.uniformScale))
        ? clampWorkflowNumber(Number(patch.uniformScale), 0.05, 10)
        : kind === "character" ? 1 : undefined,
      shadowEnabled: kind === "character" ? patch.shadowEnabled === true : undefined,
      panoramaGroundSnapEnabled: kind === "character" ? patch.panoramaGroundSnapEnabled === true : undefined,
      visible: true,
      locked: false,
      pose: patch.pose || (kind === "character" ? "stand" : undefined),
      jointAngles: patch.jointAngles || (kind === "character" ? cloneDirectorJointAngles(getDirectorPosePreset("stand").jointAngles) : undefined),
      bodyType,
      crowdCount: patch.crowdCount || (kind === "crowd" ? 12 : undefined),
      crowdRows: patch.crowdRows || (kind === "crowd" ? 3 : undefined),
      crowdCols: patch.crowdCols || (kind === "crowd" ? 3 : undefined),
      crowdSpacing: patch.crowdSpacing || (kind === "crowd" ? 1.2 : undefined),
      modelUrl: patch.modelUrl,
    }
    applyStateChange((current) => ({ ...current, objects: [...current.objects, object], activeObjectId: object.id, selectedObjectIds: [object.id], activeGroupId: undefined }))
    return object.id
  }

  function handleUploadGlbFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ""
    if (!file) return
    if (!file.name.toLowerCase().endsWith(".glb")) {
      message.warning("当前导演台仅支持单文件 GLB 模型")
      return
    }
    const previewUrl = URL.createObjectURL(file)
    const objectId = addObject("uploaded", "box", {
      name: file.name.replace(/\.glb$/i, "") || "上传模型",
      modelUrl: previewUrl,
      color: "#ffffff",
    })
    void uploadCanvasNodeFile(file)
      .then(({ publicUrl }) => {
        const uploadedUrl = String(publicUrl || "").trim()
        if (!uploadedUrl) throw new Error("GLB 模型上传失败")
        applyStateChange((current) => ({
          ...current,
          objects: current.objects.map((object) => object.id === objectId && object.modelUrl === previewUrl
            ? { ...object, modelUrl: uploadedUrl }
            : object),
        }), { history: false })
        window.setTimeout(() => URL.revokeObjectURL(previewUrl), 15_000)
        message.success("GLB 模型已加入场景并保存")
      })
      .catch((error) => {
        console.warn("[director-console-3d] GLB upload failed", error)
        message.error(error instanceof Error ? error.message : "GLB 模型上传失败，当前仅保留本地预览")
      })
  }

  function addCrowdCharacters(rows: number, cols: number, spacing: number) {
    const safeRows = Math.max(1, Math.min(12, Math.round(rows)))
    const safeCols = Math.max(1, Math.min(12, Math.round(cols)))
    const safeSpacing = clampWorkflowNumber(Number(spacing) || 1.2, 0.2, 4)
    const count = safeRows * safeCols
    const center = DIRECTOR_SCENE_OBJECT_SPAWN_POSITION
    const viewportCameraPosition = getCurrentViewportCameraState()?.position
    applyStateChange((current) => {
      const existingNames = new Set(current.objects.map((object) => object.name))
      let nameCursor = 0
      const nextCharacterName = () => {
        let candidate = ""
        do {
          candidate = `人物${directorCharacterLetterName(nameCursor)}`
          nameCursor += 1
        } while (existingNames.has(candidate))
        existingNames.add(candidate)
        return candidate
      }
      const startIndex = current.objects.length
      const bodyType = "mannequin"
      const created: LibTvDirectorConsole3DObject[] = Array.from({ length: count }, (_, index) => {
        const row = Math.floor(index / safeCols)
        const col = index % safeCols
        const x = center.x + (col - (safeCols - 1) / 2) * safeSpacing
        const z = center.z + (row - (safeRows - 1) / 2) * safeSpacing
        const facingYaw = viewportCameraPosition
          ? THREE.MathUtils.radToDeg(Math.atan2(viewportCameraPosition.x - x, viewportCameraPosition.z - z))
          : 0
        return {
          id: directorConsoleId("character"),
          name: nextCharacterName(),
          kind: "character",
          primitive: "box",
          color: DIRECTOR_CHARACTER_COLORS[(startIndex + index) % DIRECTOR_CHARACTER_COLORS.length],
          position: { x, y: 0, z },
          rotation: { x: 0, y: Number(facingYaw.toFixed(2)), z: 0 },
          scale: getDirectorCharacterPresetScaleVector(bodyType),
          uniformScale: 1,
          shadowEnabled: false,
          panoramaGroundSnapEnabled: false,
          visible: true,
          locked: false,
          pose: "stand",
          jointAngles: cloneDirectorJointAngles(getDirectorPosePreset("stand").jointAngles),
          bodyType,
        }
      })
      const group = {
        id: directorConsoleId("group"),
        name: `群众 (${safeRows}x${safeCols})`,
        objectIds: created.map((object) => object.id),
      }
      return {
        ...current,
        objects: [
          ...current.objects,
          ...created.map((object) => ({ ...object, groupId: group.id })),
        ],
        objectGroups: [...(current.objectGroups || []), group],
        activeObjectId: created.at(-1)?.id,
        selectedObjectIds: group.objectIds,
        activeGroupId: group.id,
      }
    })
  }

  function getCurrentViewportCameraState() {
    if (viewMode === "camera" && activeCamera) {
      return {
        position: activeCamera.position,
        target: activeCamera.target,
      }
    }
    return sceneRef.current?.getDirectorCameraState() || null
  }

  function addCameraFromCurrentView(label = "当前视角") {
    const captureState = getCurrentViewportCameraState()
    return addDirectorCameraFromPreset({
      label,
      position: captureState?.position || { x: 0, y: 2.2, z: 10 },
      target: captureState?.target || { x: 0, y: 1.2, z: 0 },
      fov: activeCamera?.fov || 50,
    })
  }

  function addDirectorCameraFromPreset(preset: { label: string; position: LibTvDirectorConsole3DVector3; target: LibTvDirectorConsole3DVector3; fov?: number }) {
    const nextIndex = state.cameras.length + 1
    const position = cloneDirectorConsoleVector(preset.position, DIRECTOR_SCENE_CAMERA_POSITION)
    const target = cloneDirectorConsoleVector(preset.target, DIRECTOR_SCENE_CAMERA_TARGET)
    const camera: LibTvDirectorConsole3DCamera = {
      id: directorConsoleId("camera"),
      name: `机位${nextIndex}`,
      position,
      target,
      rotation: getDirectorCameraRotationFromTarget(position, target),
      fov: clampWorkflowNumber(Number(preset.fov || activeCamera?.fov || 50), 15, 90),
      aspectRatio: activeCamera?.aspectRatio || "16:9",
      visible: true,
      captures: [],
    }
    applyStateChange((current) => ({ ...current, cameras: [...current.cameras, camera], activeCameraId: camera.id, activeObjectId: camera.id, selectedObjectIds: [], activeGroupId: undefined }))
    return camera
  }

  function addCameraByPreset(presetId: DirectorCameraPresetId) {
    const preset = resolveDirectorCameraPreset(presetId, state, getCurrentViewportCameraState())
    addDirectorCameraFromPreset(preset)
    setCameraMenuOpen(false)
    setSelectedTab("props")
  }

  function deleteActiveObject() {
    applyStateChange((current) => {
      const activeGroup = current.activeGroupId ? current.objectGroups?.find((group) => group.id === current.activeGroupId) : undefined
      const selectedObjectIds = activeGroup?.objectIds || getDirectorConsoleSelectedObjectIds(current)
      if (selectedObjectIds.length > 0) {
        const removeSet = new Set(selectedObjectIds)
        return {
          ...current,
          objects: current.objects.filter((object) => !removeSet.has(object.id)),
          timeline: pruneDirectorTimelineTargets(current, removeSet),
          objectGroups: (current.objectGroups || [])
            .map((group) => ({ ...group, objectIds: group.objectIds.filter((id) => !removeSet.has(id)) }))
            .filter((group) => group.objectIds.length > 1 && group.id !== activeGroup?.id),
          cameras: current.cameras.map((camera) => camera.targetObjectId && removeSet.has(camera.targetObjectId) ? { ...camera, targetObjectId: undefined } : camera),
          activeObjectId: undefined,
          selectedObjectIds: [],
          activeGroupId: undefined,
        }
      }
      const activeId = current.activeObjectId
      if (activeId && current.cameras.length > 1 && current.cameras.some((camera) => camera.id === activeId)) {
        const cameras = current.cameras.filter((camera) => camera.id !== activeId)
        return { ...current, cameras, timeline: pruneDirectorTimelineTargets(current, new Set([activeId])), activeCameraId: cameras[0]?.id, activeObjectId: undefined, selectedObjectIds: [], activeGroupId: undefined }
      }
      return current
    })
  }

  function duplicateActiveSelection() {
    applyStateChange((current) => {
      const selectedObjectIds = getDirectorConsoleSelectedObjectIds(current)
      if (selectedObjectIds.length > 0) {
        const duplicates = current.objects
          .filter((object) => selectedObjectIds.includes(object.id))
          .map((object, index) => ({
            ...object,
            id: directorConsoleId("object"),
            name: `${object.name}副本`,
            position: { ...object.position, x: object.position.x + 0.8 + index * 0.12 },
            rotation: { ...object.rotation },
            scale: { ...object.scale },
            jointAngles: object.jointAngles ? cloneDirectorJointAngles(object.jointAngles) : undefined,
            groupId: undefined,
            panoramaBinding: undefined,
          }))
        const duplicateIds = duplicates.map((object) => object.id)
        return { ...current, objects: [...current.objects, ...duplicates], activeObjectId: duplicateIds.at(-1), selectedObjectIds: duplicateIds, activeGroupId: undefined }
      }
      const activeId = current.activeObjectId
      const camera = current.cameras.find((item) => item.id === activeId)
      if (camera) {
        const duplicate: LibTvDirectorConsole3DCamera = {
          ...camera,
          id: directorConsoleId("camera"),
          name: `${camera.name}副本`,
          position: { ...camera.position, x: camera.position.x + 0.5 },
          target: { ...camera.target },
          rotation: cloneDirectorConsoleVector(camera.rotation, getDirectorCameraRotationFromTarget(camera.position, camera.target)),
          captures: (camera.captures || []).map((capture) => ({ ...capture, id: directorConsoleId("capture") })),
        }
        return { ...current, cameras: [...current.cameras, duplicate], activeCameraId: duplicate.id, activeObjectId: duplicate.id, selectedObjectIds: [], activeGroupId: undefined }
      }
      return current
    })
  }

  function groupActiveSelection() {
    applyStateChange((current) => {
      const selectedObjectIds = getDirectorConsoleSelectedObjectIds(current)
      if (selectedObjectIds.length < 2) {
        message.info("至少选择 2 个人物或元素后才能编组")
        return current
      }
      const group = { id: directorConsoleId("group"), name: `人物组${(current.objectGroups || []).length + 1}`, objectIds: selectedObjectIds }
      return {
        ...current,
        objectGroups: [...(current.objectGroups || []), group],
        objects: current.objects.map((object) => selectedObjectIds.includes(object.id) ? { ...object, groupId: group.id } : object),
        selectedObjectIds,
        activeObjectId: selectedObjectIds.at(-1),
        activeGroupId: group.id,
      }
    })
  }

  function ungroupActiveSelection() {
    applyStateChange((current) => {
      const groupId = current.activeGroupId || current.objects.find((object) => object.id === current.activeObjectId)?.groupId
      if (!groupId) return current
      const group = current.objectGroups?.find((item) => item.id === groupId)
      const selectedObjectIds = group?.objectIds || getDirectorConsoleSelectedObjectIds(current)
      return {
        ...current,
        objectGroups: (current.objectGroups || []).filter((item) => item.id !== groupId),
        objects: current.objects.map((object) => selectedObjectIds.includes(object.id) ? { ...object, groupId: undefined } : object),
        selectedObjectIds,
        activeObjectId: selectedObjectIds.at(-1),
        activeGroupId: undefined,
      }
    })
  }

  function updateActiveVector(field: "position" | "rotation" | "scale" | "target", axis: keyof LibTvDirectorConsole3DVector3, value: number) {
    const activeId = state.activeObjectId
    if (activeIsGroup && activeGroup) {
      const groupValues = getDirectorGroupTransform(activeGroupObjects)
      const nextValues = { ...groupValues[field === "target" ? "position" : field], [axis]: value }
      updateActiveGroupTransform(field === "target" ? "position" : field, nextValues)
      return
    }
    if (!activeId) return
    if (activeObject && field !== "target") {
      updateObject(activeObject.id, { [field]: { ...activeObject[field], [axis]: value } } as Partial<LibTvDirectorConsole3DObject>)
      if (workspaceMode === "timeline" && timeline.autoKey) setTimelineKeyframe([field, axis].join("."), value)
      return
    }
    const camera = state.cameras.find((item) => item.id === activeId)
    if (camera && (field === "position" || field === "target" || field === "rotation")) {
      const source = field === "rotation"
        ? cloneDirectorConsoleVector(camera.rotation, getDirectorCameraRotationFromTarget(camera.position, camera.target))
        : camera[field]
      updateCamera(camera.id, { [field]: { ...source, [axis]: value } } as Partial<LibTvDirectorConsole3DCamera>)
      if (workspaceMode === "timeline" && timeline.autoKey) setTimelineKeyframe([field, axis].join("."), value)
    }
  }

  function updateActiveGroupTransform(field: "position" | "rotation" | "scale", value: LibTvDirectorConsole3DVector3) {
    if (!activeGroup || activeGroupObjects.length === 0) return
    const currentTransform = getDirectorGroupTransform(activeGroupObjects)
    applyStateChange((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        if (!activeGroup.objectIds.includes(object.id)) return object
        if (field === "position") {
          return {
            ...object,
            panoramaBinding: undefined,
            position: {
              x: Number((object.position.x + value.x - currentTransform.position.x).toFixed(3)),
              y: Number((object.position.y + value.y - currentTransform.position.y).toFixed(3)),
              z: Number((object.position.z + value.z - currentTransform.position.z).toFixed(3)),
            },
          }
        }
        if (field === "rotation") {
          return applyDirectorObjectStatePatch(object, {
            rotation: {
              x: Number((object.rotation.x + value.x - currentTransform.rotation.x).toFixed(2)),
              y: Number((object.rotation.y + value.y - currentTransform.rotation.y).toFixed(2)),
              z: Number((object.rotation.z + value.z - currentTransform.rotation.z).toFixed(2)),
            },
          })
        }
        const factor = {
          x: currentTransform.scale.x ? value.x / currentTransform.scale.x : 1,
          y: currentTransform.scale.y ? value.y / currentTransform.scale.y : 1,
          z: currentTransform.scale.z ? value.z / currentTransform.scale.z : 1,
        }
        return {
          ...object,
          scale: {
            x: Number((object.scale.x * factor.x).toFixed(4)),
            y: Number((object.scale.y * factor.y).toFixed(4)),
            z: Number((object.scale.z * factor.z).toFixed(4)),
          },
        }
      }),
    }))
  }

  function placeActiveSelectionAt(position: LibTvDirectorConsole3DVector3) {
    applyStateChange((current) => {
      const group = current.activeGroupId ? current.objectGroups?.find((item) => item.id === current.activeGroupId) : undefined
      const selectedObjectIds = group?.objectIds || getDirectorConsoleSelectedObjectIds(current)
      if (selectedObjectIds.length === 0) return current
      const selectedObjects = selectedObjectIds
        .map((id) => current.objects.find((object) => object.id === id))
        .filter(Boolean) as LibTvDirectorConsole3DObject[]
      if (selectedObjects.length === 0 || selectedObjects.every((object) => object.locked)) return current
      const sourceCenter = getDirectorGroupTransform(selectedObjects).position
      const delta = {
        x: position.x - sourceCenter.x,
        y: position.y - sourceCenter.y,
        z: position.z - sourceCenter.z,
      }
      return {
        ...current,
        objects: current.objects.map((object) => {
          if (!selectedObjectIds.includes(object.id) || object.locked) return object
          return {
            ...object,
            panoramaBinding: undefined,
            position: {
              x: Number(clampWorkflowNumber(object.position.x + delta.x, -80, 80).toFixed(3)),
              y: Number(clampWorkflowNumber(object.position.y + delta.y, -20, 40).toFixed(3)),
              z: Number(clampWorkflowNumber(object.position.z + delta.z, -80, 80).toFixed(3)),
            },
          }
        }),
      }
    })
  }

  function captureCurrentView(createCamera: boolean) {
    const camera = createCamera ? addCameraFromCurrentView() : activeCamera
    window.setTimeout(() => {
      const result = sceneRef.current?.capture(createCamera ? camera : null)
      if (!result || !camera) {
        message.warning("当前 3D 画面还不能截图")
        return
      }
      const captureAspectRatio = createCamera ? (camera.aspectRatio || "16:9") : `${result.width}:${result.height}`
      const capture: LibTvDirectorConsole3DCapture = {
        id: directorConsoleId("capture"),
        name: `${camera.name} 截图${(camera.captures?.length || 0) + 1}`,
        dataUrl: result.dataUrl,
        width: result.width,
        height: result.height,
        cameraId: camera.id,
        aspectRatio: captureAspectRatio,
        createdAt: Date.now(),
      }
	      onUpdatePreview?.(result.dataUrl)
	      applyStateChange((current) => ({
	        ...current,
	        cameras: current.cameras.map((item) => item.id === camera.id ? { ...item, captures: [...(item.captures || []), capture] } : item),
	        activeCameraId: camera.id,
	        activeObjectId: camera.id,
	        selectedObjectIds: [],
	        activeGroupId: undefined,
	      }), { history: false })
	      setSelectedTab("captures")
	      message.success("已保存摄像机截图")
	    }, 30)
	  }

  function closeDirectorConsoleWithPreview() {
    const result = sceneRef.current?.capture(viewMode === "camera" ? activeCamera : null)
    if (result?.dataUrl) onUpdatePreview?.(result.dataUrl)
    onClose()
  }

  function activateWorkspaceMode(mode: "scene" | "timeline") {
    setWorkspaceMode(mode)
    setTimelineMinimized(false)
    setRightPanelMode(mode === "timeline" ? "precision" : "directives")
    if (mode === "scene") {
      timelineDrawingPointsRef.current = []
      setTimelineDrawingTrackId(null)
      setTimelineDrawingSession(null)
      if (selectedTab === "motion") setSelectedTab("props")
    }
  }

  function updateDirectorTimeline(patch: Partial<LibTvDirectorConsole3DTimeline>) {
    applyStateChange((current) => {
      const currentTimeline = normalizePersistedDirectorTimeline(current.timeline || current, current)
      return { ...current, timeline: { ...currentTimeline, ...patch } }
    }, { history: false })
  }

  function addTimelineTrack(explicitTargetId?: string) {
    const selectedId = explicitTargetId || state.activeObjectId || state.activeCameraId
    if (!selectedId) {
      message.info("请先选择一个人物、元素或摄像机")
      return
    }
    applyStateChange((current) => {
      const currentTimeline = normalizePersistedDirectorTimeline(current.timeline || current, current)
      if (currentTimeline.tracks.some((track) => track.targetId === selectedId)) return current
      const object = current.objects.find((item) => item.id === selectedId)
      const camera = current.cameras.find((item) => item.id === selectedId)
      if (!object && !camera) return current
      const track: LibTvDirectorConsole3DTimelineTrack = {
        id: directorConsoleId("timeline-track"),
        targetId: selectedId,
        targetType: camera ? "camera" : "object",
        name: camera ? (currentTimeline.tracks.length === 0 ? "主机位" : camera.name) : object?.name || "对象",
        keyframes: [],
        expanded: !camera,
        autoWalk: camera ? undefined : true,
        actions: [],
      }
      return { ...current, timeline: { ...currentTimeline, tracks: [...currentTimeline.tracks, track] } }
    }, { history: false })
  }

  function removeTimelineTrack(trackId: string) {
    applyStateChange((current) => {
      const currentTimeline = normalizePersistedDirectorTimeline(current.timeline || current, current)
      const track = currentTimeline.tracks.find((item) => item.id === trackId)
      if (!track) return current
      const pathIds = new Set((track.actions || []).filter((action) => action.type === "motion-path").map((action) => action.pathId))
      return {
        ...current,
        timeline: {
          ...currentTimeline,
          tracks: currentTimeline.tracks.filter((item) => item.id !== trackId),
          paths: (currentTimeline.paths || []).filter((path) => !pathIds.has(path.id)),
        },
      }
    }, { history: false })
    if (timelineDrawingTrackId === trackId) setTimelineDrawingTrackId(null)
  }

  function commitTimelineMotionPath(
    trackId: string,
    type: LibTvDirectorConsole3DMotionPathType,
    explicitPoints?: LibTvDirectorConsole3DVector3[],
  ) {
    applyStateChange((current) => {
      const currentTimeline = normalizePersistedDirectorTimeline(current.timeline || current, current)
      const track = currentTimeline.tracks.find((item) => item.id === trackId || item.targetId === trackId)
      if (!track) return current
      const target = track.targetType === "camera"
        ? current.cameras.find((camera) => camera.id === track.targetId)
        : current.objects.find((object) => object.id === track.targetId)
      if (!target) return current
      const generated = createDirectorConsoleMotionPath(type, track.targetId, target.position, directorConsoleId("motion-path"))
      const path: LibTvDirectorConsole3DMotionPath = explicitPoints && explicitPoints.length >= 2
        ? { ...generated, points: explicitPoints.map((point) => ({ ...point })), closed: type === "circle" || type === "rectangle", position: getDirectorConsoleMotionPathCenter(explicitPoints), rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
        : generated
      const action = createDirectorConsoleMotionPathAction(path.id, currentTimeline.duration, directorConsoleId("motion-action"))
      const markerTimes = type === "line"
        ? [0, currentTimeline.duration]
        : [0, currentTimeline.duration * 0.25, currentTimeline.duration * 0.5, currentTimeline.duration * 0.75, currentTimeline.duration]
      const pathKeyframes = markerTimes.flatMap((markerTime) => {
        const sampled = sampleDirectorConsoleMotionPath(path, currentTimeline.duration > 0 ? markerTime / currentTimeline.duration : 0)
        if (!sampled) return []
        return (["x", "y", "z"] as const).map((axis) => ({
          id: directorConsoleId("timeline-keyframe"),
          time: markerTime,
          property: "position." + axis,
          value: sampled.position[axis],
        }))
      })
      const previousPathIds = new Set((track.actions || []).filter((item) => item.type === "motion-path").map((item) => item.pathId))
      return {
        ...current,
        activeObjectId: track.targetId,
        activeCameraId: track.targetType === "camera" ? track.targetId : current.activeCameraId,
        selectedObjectIds: track.targetType === "camera" ? [] : [track.targetId],
        timeline: {
          ...currentTimeline,
          paths: [...(currentTimeline.paths || []).filter((item) => !previousPathIds.has(item.id) && item.targetId !== track.targetId), path],
          tracks: currentTimeline.tracks.map((item) => item.id === track.id ? {
            ...item,
            expanded: item.targetType === "object",
            actions: [action],
            keyframes: [...item.keyframes.filter((keyframe) => !keyframe.property.startsWith("position.")), ...pathKeyframes]
              .sort((a, b) => a.time - b.time || a.property.localeCompare(b.property)),
          } : item),
        },
      }
    }, { history: false })
    timelineDrawingPointsRef.current = []
    setTimelineDrawingTrackId(null)
    setTimelineDrawingSession(null)
    setSelectedTab("motion")
  }

  function finishTimelineMotionDrawing(session: DirectorTimelineMotionDrawingSession | null = timelineDrawingSession) {
    if (!session) return
    const sourcePoints = timelineDrawingPointsRef.current.length > session.points.length
      ? timelineDrawingPointsRef.current
      : session.points
    const points = sourcePoints.filter((point, index, source) => {
      if (index === 0) return true
      const previous = source[index - 1]
      return Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z) >= 0.01
    })
    if (points.length < 2) return
    commitTimelineMotionPath(session.trackId, session.type, points)
  }

  function startTimelineMotionPath(trackId: string, type: LibTvDirectorConsole3DMotionPathType) {
    if (type === "pencil" || type === "pen") {
      timelineDrawingPointsRef.current = []
      setTimelineDrawingTrackId(trackId)
      setTimelineDrawingSession({ trackId, type, points: [] })
      setTimelinePlaying(false)
      setViewMode("director")
      setSelectedTab("props")
      applyStateChange((current) => ({
        ...current,
        activeObjectId: "scene",
        selectedObjectIds: [],
        activeGroupId: undefined,
      }), { history: false })
      return
    }
    commitTimelineMotionPath(trackId, type)
  }

  function setTimelineTrackExpanded(trackId: string, expanded: boolean) {
    updateDirectorTimeline({
      tracks: timeline.tracks.map((track) => track.id === trackId ? { ...track, expanded } : track),
    })
  }

  function updateTimelineMotionAction(trackId: string, patch: Partial<LibTvDirectorConsole3DTimelineMotionAction>) {
    updateDirectorTimeline({
      tracks: timeline.tracks.map((track) => track.id === trackId ? {
        ...track,
        actions: (track.actions || []).map((action) => ({ ...action, ...patch })),
      } : track),
    })
  }

  function updateTimelineMotionPath(pathId: string, patch: Partial<LibTvDirectorConsole3DMotionPath>) {
    applyStateChange((current) => {
      const currentTimeline = normalizePersistedDirectorTimeline(current.timeline || current, current)
      const path = (currentTimeline.paths || []).find((item) => item.id === pathId)
      if (!path) return current
      const center = path.position || getDirectorConsoleMotionPathCenter(path.points)
      const currentRotation = path.rotation || { x: 0, y: 0, z: 0 }
      const currentScale = path.scale || { x: 1, y: 1, z: 1 }
      let points = path.points.map((point) => ({ ...point }))
      if (patch.position) {
        const delta = { x: patch.position.x - center.x, y: patch.position.y - center.y, z: patch.position.z - center.z }
        points = points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z }))
      }
      if (patch.rotation) {
        const delta = new THREE.Euler(
          THREE.MathUtils.degToRad(patch.rotation.x - currentRotation.x),
          THREE.MathUtils.degToRad(patch.rotation.y - currentRotation.y),
          THREE.MathUtils.degToRad(patch.rotation.z - currentRotation.z),
          "XYZ",
        )
        const pivot = patch.position || center
        points = points.map((point) => {
          const rotated = new THREE.Vector3(point.x - pivot.x, point.y - pivot.y, point.z - pivot.z).applyEuler(delta)
          return { x: rotated.x + pivot.x, y: rotated.y + pivot.y, z: rotated.z + pivot.z }
        })
      }
      if (patch.scale) {
        const pivot = patch.position || center
        const ratio = {
          x: patch.scale.x / Math.max(0.0001, currentScale.x),
          y: patch.scale.y / Math.max(0.0001, currentScale.y),
          z: patch.scale.z / Math.max(0.0001, currentScale.z),
        }
        points = points.map((point) => ({ x: pivot.x + (point.x - pivot.x) * ratio.x, y: pivot.y + (point.y - pivot.y) * ratio.y, z: pivot.z + (point.z - pivot.z) * ratio.z }))
      }
      return {
        ...current,
        timeline: {
          ...currentTimeline,
          paths: (currentTimeline.paths || []).map((item) => item.id === pathId ? { ...item, ...patch, points } : item),
        },
      }
    }, { history: false })
  }

  function setTimelineKeyframe(property: string, explicitValue?: number, toggle = false) {
    const selectedId = state.activeObjectId || state.activeCameraId
    if (!selectedId) return
    applyStateChange((current) => {
      const currentTimeline = normalizePersistedDirectorTimeline(current.timeline || current, current)
      const value = explicitValue ?? getDirectorTimelineTargetValue(current, selectedId, property)
      if (!Number.isFinite(value)) return current
      const object = current.objects.find((item) => item.id === selectedId)
      const camera = current.cameras.find((item) => item.id === selectedId)
      if (!object && !camera) return current
      let track = currentTimeline.tracks.find((item) => item.targetId === selectedId)
      const tracks = track ? [...currentTimeline.tracks] : [...currentTimeline.tracks, {
        id: directorConsoleId("timeline-track"),
        targetId: selectedId,
        targetType: camera ? "camera" as const : "object" as const,
        name: camera?.name || object?.name || "对象",
        keyframes: [],
        expanded: !camera,
        autoWalk: camera ? undefined : true,
        actions: [],
      }]
      track = tracks.find((item) => item.targetId === selectedId)
      if (!track) return current
      const existing = track.keyframes.find((keyframe) => keyframe.property === property && Math.abs(keyframe.time - timelineTime) <= 0.01)
      const keyframes = toggle && existing
        ? track.keyframes.filter((keyframe) => keyframe.id !== existing.id)
        : [
          ...track.keyframes.filter((keyframe) => !(keyframe.property === property && Math.abs(keyframe.time - timelineTime) <= 0.01)),
          { id: existing?.id || directorConsoleId("timeline-keyframe"), time: timelineTime, property, value: Number(value) },
        ].sort((a, b) => a.time - b.time)
      return {
        ...current,
        timeline: {
          ...currentTimeline,
          tracks: tracks.map((item) => item.id === track?.id ? { ...item, keyframes } : item),
        },
      }
    }, { history: false })
  }

  function toggleTimelineKeyframe(property: string) {
    setTimelineKeyframe(property, undefined, true)
  }

  async function exportDirectorViewToCanvas() {
    if (timelineExportingRef.current) return
    if (!onCreateVideoNode) {
      message.warning("当前画布暂不支持接收动画视频")
      return
    }
    const sceneApi = sceneRef.current
    const camera = activeCamera
    if (!sceneApi || !camera) {
      message.warning("当前 3D 画面还不能导出")
      return
    }
    if (typeof MediaRecorder === "undefined") {
      message.warning("当前浏览器不支持导出动画视频")
      return
    }
    const mimeType = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4;codecs=h264",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type)) || ""
    if (!mimeType) {
      message.warning("当前浏览器不支持 MP4 画布录制")
      return
    }
    const aspect = parseDirectorAspectRatio(camera.aspectRatio, DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO)
    const output = getDirectorAnimationVideoSize(aspect.ratio)
    const outputCanvas = document.createElement("canvas")
    outputCanvas.width = output.width
    outputCanvas.height = output.height
    const outputContext = outputCanvas.getContext("2d")
    if (!outputContext || typeof outputCanvas.captureStream !== "function") {
      message.warning("当前浏览器不支持导出动画视频")
      return
    }

    const duration = Math.max(0.1, Math.min(Number(timeline.duration) || DIRECTOR_ANIMATION_VIDEO_MAX_DURATION, DIRECTOR_ANIMATION_VIDEO_MAX_DURATION))
    const exportState: LibTvDirectorConsole3DState = {
      ...state,
      timeline: {
        ...timeline,
        duration,
        loop: false,
      },
    }
    const previousTimelineTime = timelineTime
    let stream: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    let requestVideoFrame: (() => void) | null = null
    let stopPromise: Promise<void> | null = null
    const chunks: Blob[] = []

    timelineExportingRef.current = true
    setTimelinePlaying(false)
    setTimelineExporting(true)
    sceneApi.setVideoRecordingMode(true)
    message.info("正在导出动画视频...")
    try {
      await waitForDirectorAnimationReady()
      stream = outputCanvas.captureStream(0)
      const videoTrack = stream.getVideoTracks()[0] as DirectorCanvasCaptureTrack | undefined
      if (videoTrack?.requestFrame) {
        requestVideoFrame = () => videoTrack.requestFrame?.()
      } else {
        stream.getTracks().forEach((track) => track.stop())
        stream = outputCanvas.captureStream(DIRECTOR_ANIMATION_VIDEO_FPS)
      }
      try {
        recorder = new MediaRecorder(stream, { mimeType })
      } catch {
        throw new Error("当前浏览器无法录制画布视频")
      }
      stopPromise = new Promise<void>((resolve, reject) => {
        if (!recorder) {
          reject(new Error("动画视频录制失败"))
          return
        }
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data)
        }
        recorder.onerror = () => reject(new Error("动画视频录制失败"))
        recorder.onstop = () => resolve()
      })
      recorder.start(1000)
      await waitForDirectorAnimationFrame()

      const frameCount = Math.max(1, Math.ceil(DIRECTOR_ANIMATION_VIDEO_FPS * duration))
      const recordingStartedAt = performance.now()
      for (let frameIndex = 0; frameIndex <= frameCount; frameIndex += 1) {
        const frameTime = Math.min(duration, frameIndex / DIRECTOR_ANIMATION_VIDEO_FPS)
        setTimelineTime(frameTime)
        const frameState = applyPersistedDirectorTimelineStateAtTime(exportState, frameTime)
        const rendered = sceneApi.renderAnimationVideoFrame(outputCanvas, frameState, output.aspectRatio)
        if (!rendered) throw new Error("导出视频画面为空")
        requestVideoFrame?.()
        if (frameIndex < frameCount) {
          await waitForDirectorAnimationDeadline(recordingStartedAt + (frameIndex + 1) * (1000 / DIRECTOR_ANIMATION_VIDEO_FPS))
        }
      }

      await waitForDirectorAnimationFrame()
      if (recorder.state !== "inactive") recorder.stop()
      await stopPromise
      const videoBlob = new Blob(chunks, { type: recorder.mimeType || mimeType })
      if (videoBlob.size <= 0) throw new Error("导出视频为空")
      const fileName = "3d-director-animation-" + Date.now() + ".mp4"
      await onCreateVideoNode({
        videoBlob,
        fileName,
        duration,
        aspectRatio: output.aspectRatio,
        width: output.width,
        height: output.height,
        mimeType: videoBlob.type || "video/mp4",
        cameraId: camera.id,
      })
      message.success("动画视频已导出到画布")
    } catch (error) {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop()
        await stopPromise?.catch(() => undefined)
      }
      message.error(error instanceof Error ? error.message : "动画视频导出失败")
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
      sceneApi.setVideoRecordingMode(false)
      setTimelineTime(previousTimelineTime)
      setTimelinePlaying(false)
      timelineExportingRef.current = false
      setTimelineExporting(false)
    }
  }

	  const selectedCamera = state.cameras.find((camera) => camera.id === state.activeObjectId)
	  const inspectorCamera = selectedCamera || (!activeIsScene ? activeCamera : undefined)
	  const showCapturesTab = Boolean(activeIsCamera)

	  useEffect(() => {
	    if (selectedTab === "captures" && !showCapturesTab) setSelectedTab("props")
	    if (selectedTab === "pose" && activeObject?.kind !== "character") setSelectedTab("props")
	  }, [activeObject?.kind, selectedTab, showCapturesTab])

  return createPortal(
    <div
      ref={overlayRootRef}
      tabIndex={-1}
      data-prevent-global-shortcut="scene-composer"
      className="fixed inset-0 flex flex-col text-neutral-50"
      style={{
        zIndex: 600,
        background: "#111513",
        fontFamily: '-apple-system, system-ui, "Segoe UI", "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
        lineHeight: 1.55,
        "--radius": "8px",
        "--radius-sm": "4px",
        "--radius-md": "6px",
        "--radius-lg": "8px",
        "--radius-xl": "12px",
        "--color-neutral-50": "#f7f7f7",
        "--color-neutral-800": "#303734",
      } as React.CSSProperties}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-x-0 top-0 z-40 flex h-16 items-center border-b border-white/8 bg-[#141917] px-4 max-[900px]:px-2">
          <div className="flex min-w-[230px] items-center gap-3 max-[900px]:w-8 max-[900px]:min-w-8">
            <span className="flex size-8 items-center justify-center rounded-md bg-[#58c7b5]/12 text-[#72d7c6]"><Clapperboard className="size-4" /></span>
            <div className="min-w-0 max-[900px]:hidden">
              <div className="truncate text-sm font-semibold text-white/92">空间导演台</div>
              <div className="text-[10px] text-white/35">{String(state.environmentUrl || "").trim() ? "全景场景已就绪" : "等待全景场景"}</div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-3 max-[900px]:justify-start max-[900px]:gap-1 max-[900px]:overflow-x-auto">
            <div className="flex h-9 items-center rounded-lg border border-white/8 bg-black/15 p-1">
              <button type="button" className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] transition-colors ${workspaceMode === "scene" ? "bg-[#58c7b5] font-medium text-[#0c1815]" : "text-white/55 hover:bg-white/6 hover:text-white/85"}`} onClick={() => activateWorkspaceMode("scene")}>
                <Sparkles className="size-3.5" />空间调度
              </button>
              <button type="button" className={`flex h-7 items-center gap-1.5 rounded-md px-3 text-[12px] transition-colors ${workspaceMode === "timeline" ? "bg-[#58c7b5] font-medium text-[#0c1815]" : "text-white/55 hover:bg-white/6 hover:text-white/85"}`} onClick={() => activateWorkspaceMode("timeline")}>
                <Video className="size-3.5" />动画编排
              </button>
            </div>
            <div className="flex h-9 items-center rounded-lg border border-white/8 bg-black/15 p-1">
	              <button type="button" title="自由视角" className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors ${viewMode === "director" ? "bg-white/10 text-white/90" : "text-white/40 hover:text-white/75"}`} onClick={() => {
	                setViewMode("director")
	                if (activeIsCamera) applyStateChange((current) => clearDirectorConsoleSelection(current), { history: false })
	              }}><MousePointer2 className="size-3.5" />自由视角</button>
		              <button type="button" title="机位预览" className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors ${viewMode === "camera" ? "bg-white/10 text-white/90" : "text-white/40 hover:text-white/75"}`} onClick={() => {
		                const selectedCamera = state.cameras.find((camera) => camera.id === state.activeObjectId)
		                const targetCamera = selectedCamera || activeCamera
		                if (!targetCamera) return
		                setViewMode("camera")
		                setSelectedTab("props")
		                applyStateChange((current) => ({ ...current, activeCameraId: targetCamera.id, activeObjectId: targetCamera.id, selectedObjectIds: [], activeGroupId: undefined }), { history: false })
		              }}><Camera className="size-3.5" />机位预览</button>
            </div>
          </div>
          <div className="relative flex min-w-[230px] items-center justify-end gap-1 max-[900px]:w-8 max-[900px]:min-w-8">
            {workspaceMode === "timeline" ? (
              <button
                type="button"
                className="mr-2 flex h-8 w-[96px] items-center justify-center rounded-md bg-[#58c7b5] px-3 text-[12px] font-semibold text-[#0c1815] transition-colors hover:bg-[#72d7c6] disabled:pointer-events-none disabled:opacity-60"
                onClick={exportDirectorViewToCanvas}
                disabled={timelineExporting}
                aria-busy={timelineExporting}
              >
                {timelineExporting ? <><ColorfulLoader className="mr-1 size-3.5" thickness={2} />导出中</> : "导出到画布"}
              </button>
            ) : null}
            {!fullscreen ? (
              <button
                type="button"
                aria-label={rightPanelOpen ? "收起右侧面板" : "展开右侧面板"}
                title={rightPanelOpen ? "收起右侧面板" : "展开右侧面板"}
                className={`flex size-8 items-center justify-center rounded-md transition-colors ${rightPanelOpen ? "bg-white/8 text-white/80" : "text-white/45 hover:bg-white/6 hover:text-white/85"}`}
                onClick={() => setRightPanelOpen((open) => !open)}
              >
                {rightPanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </button>
            ) : null}
            <button type="button" aria-label="撤销" title="撤销" className="flex size-8 items-center justify-center rounded-md text-white/45 hover:bg-white/6 hover:text-white/85 max-[900px]:hidden" onClick={undoDirectorConsole}><Undo2 className="size-4" /></button>
            <button type="button" aria-label="重做" title="重做" className="flex size-8 items-center justify-center rounded-md text-white/45 hover:bg-white/6 hover:text-white/85 max-[900px]:hidden" onClick={redoDirectorConsole}><Redo2 className="size-4" /></button>
            <button type="button" aria-label={fullscreen ? "退出全屏" : "全屏预览"} title={fullscreen ? "退出全屏" : "全屏预览"} className="flex size-8 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/6 hover:text-white/85" onClick={() => setFullscreen((value) => !value)}>
              {fullscreen ? <Minimize2 className="size-4" /> : <Fullscreen className="size-4" />}
            </button>
            <button
              type="button"
              aria-label="帮助"
              title="帮助"
              className="flex size-8 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/6 hover:text-white/85 max-[900px]:hidden"
              onClick={(event) => {
                event.stopPropagation()
                setShortcutHelpOpen((open) => !open)
              }}
            >
              <CircleHelp className="size-4" />
            </button>
            {shortcutHelpOpen ? <DirectorShortcutHelpPanel /> : null}
            <button type="button" aria-label="关闭并更新预览" title="关闭并更新预览" className="ml-1 flex size-8 items-center justify-center rounded-md text-white/45 transition-colors hover:bg-white/6 hover:text-white/85" onClick={closeDirectorConsoleWithPreview}><X className="size-4" /></button>
          </div>
        </div>

	        {!fullscreen ? <>
	          <nav ref={toolbarRef} aria-label="导演台工具" className="absolute bottom-0 left-0 top-16 z-30 flex w-[72px] flex-col items-center border-r border-white/8 bg-[#141917] px-1.5 py-2">
	            <input ref={glbInputRef} accept=".glb,model/gltf-binary,application/octet-stream" className="hidden" type="file" onChange={handleUploadGlbFile} />
	            <input ref={panoInputRef} accept="image/*" className="hidden" type="file" onChange={handleUploadPanoramaFile} />
	            <input ref={panoAiInputRef} accept="image/*" className="hidden" type="file" onChange={(event) => {
	              const file = event.target.files?.[0]
	              if (file) setPanoramaAiImageUrl(URL.createObjectURL(file))
	              event.currentTarget.value = ""
	            }} />
	            <input ref={directiveReferenceInputRef} accept="image/*" className="hidden" type="file" onChange={handleUploadDirectiveReferenceFile} />

	            <div className="flex w-full flex-col items-center">
	              <span className="mb-1 text-[9px] font-medium text-white/25">布置</span>
	              <DirectorToolButton
	                label="移动"
	                tooltip="移动元素 (V)"
	                active={transformMenuOpen}
	                icon={<DirectorLibTvMoveIcon />}
	                ariaHaspopup="menu"
	                ariaExpanded={transformMenuOpen}
	                menu={transformMenuOpen ? (
	                  <DirectorTransformModeMenu
	                    value={state.transformMode || "translate"}
	                    onSelect={(mode) => {
	                      applyStateChange((current) => ({ ...current, transformMode: mode }), { history: false })
	                      setTransformMenuOpen(false)
	                    }}
	                  />
	                ) : null}
	                onClick={() => {
	                  setAddMenuOpen(false)
	                  setPanoramaMenuOpen(false)
	                  setCameraMenuOpen(false)
	                  setAspectMenuOpen(false)
	                  setTransformMenuOpen((open) => !open)
	                }}
	              />
	              <DirectorToolButton
	                label="角色"
	                tooltip="添加人物或模型"
	                active={addMenuOpen}
	                icon={<DirectorLibTvCharacterIcon />}
	                ariaHaspopup="menu"
	                ariaExpanded={addMenuOpen}
	                menu={addMenuOpen ? (
	                  <DirectorAddObjectMenu
	                    onUpload={() => {
	                      setAddMenuOpen(false)
	                      glbInputRef.current?.click()
	                    }}
	                    onAddCharacter={(bodyType, name) => {
	                      addObject("character", "box", { bodyType, name })
	                      setAddMenuOpen(false)
	                    }}
	                    onAddCrowd={(rows, cols, spacing) => {
	                      addCrowdCharacters(rows, cols, spacing)
	                      setAddMenuOpen(false)
	                    }}
	                    onAddPrimitive={(primitive, label) => {
	                      addObject("primitive", primitive, { name: label })
	                      setAddMenuOpen(false)
	                    }}
	                  />
	                ) : null}
	                onClick={() => {
	                  setTransformMenuOpen(false)
	                  setPanoramaMenuOpen(false)
	                  setCameraMenuOpen(false)
	                  setAspectMenuOpen(false)
	                  setAddMenuOpen((open) => !open)
	                }}
	              />
              <DirectorPanoramaButton
                open={panoramaMenuOpen}
                projection={state.environmentProjection}
                onToggle={() => {
	                  setAddMenuOpen(false)
	                  setTransformMenuOpen(false)
	                  setCameraMenuOpen(false)
	                  setAspectMenuOpen(false)
	                  setPanoramaMenuOpen((open) => !open)
	                }}
	                onLocalUpload={() => {
	                  setPanoramaMenuOpen(false)
	                  panoInputRef.current?.click()
	                }}
	                onHistory={() => {
	                  setPanoramaMenuOpen(false)
	                  setPanoramaHistoryOpen(true)
	                }}
                onAiGenerate={() => {
                  setPanoramaMenuOpen(false)
                  setPanoramaAiOpen(true)
                }}
                onProjectionChange={(projection) => {
                  applyStateChange((current) => ({ ...current, environmentProjection: projection }))
                  setPanoramaMenuOpen(false)
                }}
              />

	              <span className="my-1.5 h-px w-9 bg-white/8" />
	              <span className="mb-1 text-[9px] font-medium text-white/25">镜头</span>
	              <DirectorCameraPresetButton
	                open={cameraMenuOpen}
	                onToggle={() => {
	                  setAddMenuOpen(false)
	                  setTransformMenuOpen(false)
	                  setPanoramaMenuOpen(false)
	                  setAspectMenuOpen(false)
	                  setCameraMenuOpen((open) => !open)
	                }}
	                onSelect={addCameraByPreset}
	              />
	              <DirectorAspectButton
	                open={aspectMenuOpen}
	                value={activeCamera?.aspectRatio || "16:9"}
	                onOpenChange={(open) => {
	                  if (open) {
	                    setAddMenuOpen(false)
	                    setTransformMenuOpen(false)
	                    setPanoramaMenuOpen(false)
	                    setCameraMenuOpen(false)
	                  }
	                  setAspectMenuOpen(open)
	                }}
	                onChange={(value) => activeCamera && updateCamera(activeCamera.id, { aspectRatio: value })}
	              />
	              <DirectorToolButton label="截图" tooltip="截图并保存到当前机位" icon={<DirectorLibTvCameraIcon />} onClick={() => {
	                setCameraMenuOpen(false)
	                setAspectMenuOpen(false)
	                captureCurrentView(false)
	              }} />

	              <span className="my-1.5 h-px w-9 bg-white/8" />
	              <span className="mb-1 text-[9px] font-medium text-white/25">视图</span>
	              <DirectorToolButton
	                testId="director-ground-visibility-toggle"
	                active={state.groundVisible !== false}
	                label="地面"
	                tooltip={state.groundVisible !== false ? "隐藏地面和网格" : "显示地面和网格"}
	                icon={state.groundVisible !== false ? <Eye className="size-[18px]" /> : <EyeOff className="size-[18px]" />}
	                onClick={() => applyStateChange((current) => ({ ...current, groundVisible: current.groundVisible === false }))}
	              />
		              <DirectorToolButton
		                active={state.characterDetection?.status === "pending"}
		                label="AI识图"
		                tooltip={state.characterDetection?.status === "pending" ? "正在识别人物" : state.environmentUrl ? "重新识别人物占位" : "上传图片并识别人像"}
		                icon={state.characterDetection?.status === "pending" ? <ColorfulLoader className="size-[18px]" thickness={2} /> : <DirectorAiImportIcon />}
		                onClick={() => {
		                setAddMenuOpen(false)
		                setTransformMenuOpen(false)
		                setPanoramaMenuOpen(false)
		                setCameraMenuOpen(false)
		                setAspectMenuOpen(false)
		                if (state.characterDetection?.status === "pending") return
		                if (String(state.environmentUrl || "").trim()) void detectCharactersInEnvironment({ force: true })
		                else panoInputRef.current?.click()
		              }} />
	              <DirectorToolButton active={directiveMarking} label="框选" tooltip="框选调度区域" icon={<ScanLine className="size-[18px]" />} onClick={startDirectiveMarking} />
	            </div>

	            <div className="mt-auto flex w-full justify-center border-t border-white/8 pt-1.5">
	              <DirectorToolButton
	                active={Boolean(dockPanel)}
	                label="资源"
	                tooltip={dockPanel ? "收起场景资源" : "展开场景资源"}
	                icon={dockPanel ? <PanelLeftClose className="size-[18px]" /> : <PanelLeftOpen className="size-[18px]" />}
	                onClick={() => setDockPanel((current) => current ? null : "cast")}
	              />
	            </div>
	          </nav>
	          {dockPanel ? <aside className="absolute bottom-0 left-[72px] top-16 z-[25] flex w-[248px] flex-col overflow-hidden border-r border-white/8 bg-[#181e1b]/98 backdrop-blur-xl">
	          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-white/8 px-2">
	            {([
	              { id: "panorama" as const, label: "全景", icon: <ImageIcon className="size-3.5" /> },
	              { id: "cast" as const, label: "角色", icon: <Users className="size-3.5" /> },
	              { id: "cameras" as const, label: "机位", icon: <Camera className="size-3.5" /> },
	            ]).map((item) => (
	              <button key={item.id} type="button" className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-md text-[11px] transition-colors ${dockPanel === item.id ? "bg-[#58c7b5]/13 text-[#72d7c6]" : "text-white/38 hover:bg-white/5 hover:text-white/75"}`} onClick={() => setDockPanel(item.id)}>
	                {item.icon}<span>{item.label}</span>
	              </button>
	            ))}
	            <button type="button" aria-label="收起面板" title="收起" className="flex size-7 shrink-0 items-center justify-center rounded-md text-white/35 hover:bg-white/6 hover:text-white/75" onClick={() => setDockPanel(null)}><PanelLeftClose className="size-4" /></button>
	          </div>
          {dockPanel === "panorama" ? (
            <div className="flex flex-col divide-y divide-white/8">
              <button type="button" className="flex h-14 items-center gap-3 px-4 text-left text-[13px] text-white/75 hover:bg-white/[0.035]" onClick={() => panoInputRef.current?.click()}>
                <span className="flex size-8 items-center justify-center rounded-md bg-[#58c7b5]/10 text-[#72d7c6]"><ImagePlus className="size-4" /></span>
                <span className="min-w-0 flex-1"><span className="block">{state.environmentUrl ? "替换全景图" : "上传全景图"}</span><span className="mt-0.5 block truncate text-[10px] text-white/32">{state.environmentUrl ? "当前场景已连接" : "支持 2:1 全景图片"}</span></span>
              </button>
              <button type="button" className="flex h-12 items-center gap-3 px-4 text-left text-[12px] text-white/60 hover:bg-white/[0.035]" onClick={() => setPanoramaHistoryOpen(true)}><FolderDown className="size-4 text-white/35" />从项目历史选择</button>
              <button type="button" className="flex h-12 items-center gap-3 px-4 text-left text-[12px] text-white/60 hover:bg-white/[0.035]" onClick={() => setPanoramaAiOpen(true)}><Sparkles className="size-4 text-white/35" />AI 创建全景</button>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
              <div className="flex gap-2">
                {dockPanel === "cast" ? <button type="button" className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#58c7b5]/12 text-[12px] text-[#72d7c6] hover:bg-[#58c7b5]/18" onClick={() => addObject("character", "box", { bodyType: "mannequin" })}><Plus className="size-3.5" />添加角色</button> : null}
                {dockPanel === "cameras" ? <button type="button" className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#58c7b5]/12 text-[12px] text-[#72d7c6] hover:bg-[#58c7b5]/18" onClick={() => addCameraByPreset("front_medium")}><Plus className="size-3.5" />添加机位</button> : null}
              </div>
              <label className="relative mt-3 block h-8 shrink-0">
                <span className="sr-only">搜索场景对象</span>
                <input placeholder="搜索" className="h-8 w-full rounded-md bg-white/[0.055] pl-3 pr-8 text-[12px] text-neutral-50 outline-none placeholder:text-white/25 focus:bg-white/[0.075]" value={search} onChange={(event) => setSearch(event.target.value)} />
                <Search className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-white/28" />
              </label>
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto [scrollbar-color:rgba(255,255,255,0.28)_transparent] [scrollbar-width:thin]">
                {visibleItems.filter((item) => dockPanel === "cameras" ? item.type === "camera" : item.type !== "camera").map((item) => (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={`group relative flex h-8 w-full cursor-pointer items-center py-1 pr-2 text-[12px] leading-none outline-none transition-colors after:pointer-events-none after:absolute after:left-0 after:right-0 after:top-1/2 after:z-0 after:h-6 after:-translate-y-1/2 after:rounded after:transition-colors ${state.activeObjectId === item.id || state.activeGroupId === item.id || state.selectedObjectIds?.includes(item.id) ? "text-neutral-50 after:bg-white/8" : "text-white/75 hover:text-neutral-50 hover:after:bg-white/4"}`}
                    onClick={(event) => selectSceneTreeItem(item, event.metaKey || event.ctrlKey || event.shiftKey)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      selectSceneTreeItem(item)
                      setSceneTreeMenu({ item, x: event.clientX, y: event.clientY })
                    }}
                  >
                    <span className="z-10 flex h-6 w-4 shrink-0 items-center justify-center">{item.type === "group" ? <ChevronDown className="size-3 text-white/45" /> : null}</span>
                    {item.depth ? <span className="z-10 h-px w-4 shrink-0" /> : null}
                    <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg">{item.type === "camera" ? <DirectorSceneCameraIcon /> : item.type === "group" ? <Folder className="size-3.5" /> : item.type === "character" || item.type === "crowd" ? <DirectorSceneCharacterIcon /> : <Box className="size-3.5" />}</span>
                    <span className="z-10 min-w-0 flex-1 truncate pl-1">{item.name}</span>
	                    <div className="absolute right-1 top-1/2 z-20 flex -translate-y-1/2 items-center gap-0.5 rounded-md bg-[#2b2b2b]/95 opacity-0 transition-opacity group-hover:opacity-100">
	                      <button type="button" className="flex h-5 w-5 items-center justify-center rounded text-white/35 hover:bg-white/10 hover:text-white/75" title={item.visible ? "隐藏" : "显示"} onClick={(event) => {
	                        event.stopPropagation()
	                        setSceneTreeItemVisible(item, !item.visible)
	                      }}>{item.visible ? <Eye className="size-3" /> : <EyeOff className="size-3" />}</button>
	                      <button type="button" className="flex h-5 w-5 items-center justify-center rounded text-white/35 hover:bg-white/10 hover:text-white/75" title={item.locked ? "解锁" : "锁定"} onClick={(event) => {
	                        event.stopPropagation()
	                        setSceneTreeItemLocked(item, !item.locked)
	                      }}>{item.locked ? <LockClosedIcon /> : <LockOpenIcon />}</button>
	                    </div>
	                  </div>
                ))}
              </div>
            </div>
          )}
	        </aside> : null}
        </> : null}
        {sceneTreeMenu ? (
          <DirectorSceneTreeContextMenu
            menu={sceneTreeMenu}
            menuRef={sceneTreeMenuRef}
            canGroup={(state.selectedObjectIds || []).length > 1 && sceneTreeMenu.item.type !== "camera"}
            onClose={() => setSceneTreeMenu(null)}
            onGroup={() => groupSceneTreeItem(sceneTreeMenu.item)}
            onUngroup={() => ungroupSceneTreeItem(sceneTreeMenu.item)}
            onToggleVisible={() => setSceneTreeItemVisible(sceneTreeMenu.item, !sceneTreeMenu.item.visible)}
            onToggleLocked={() => setSceneTreeItemLocked(sceneTreeMenu.item, !sceneTreeMenu.item.locked)}
            onDelete={() => deleteSceneTreeItem(sceneTreeMenu.item)}
          />
        ) : null}

	        <section
            ref={stageViewportRef}
            data-testid="director-stage-viewport"
            className="absolute overflow-hidden bg-[#252a28] transition-[left,right] duration-200"
            style={{ left: stageLeft, right: stageRight, top: 64, bottom: stageBottom }}
          >
	        <DirectorConsole3DScene
	          ref={sceneRef}
	          state={renderState}
	          viewMode={viewMode}
	          motionPathsVisible={workspaceMode === "timeline" && !timelinePlaying && !timelineExporting}
	          hideCameraElements={timelinePlaying || timelineExporting}
	          motionDrawingSession={timelinePlaying || timelineExporting ? null : timelineDrawingSession}
	          activeMotionPath={workspaceMode === "timeline" && !timelinePlaying && !timelineExporting && selectedTab === "motion" ? activeTimelineMotionPath : undefined}
	          onMotionDrawingPointsChange={queueTimelineDrawingPoints}
	          onMotionDrawingComplete={finishTimelineMotionDrawing}
	          onMotionPathTransform={updateTimelineMotionPath}
	          onSelect={(id) => {
	            const nextId = id || undefined
	            const selectedObject = nextId ? state.objects.find((object) => object.id === nextId) : undefined
	            if (!nextId || !selectedObject || selectedObject.kind !== "character") setSelectedTab("props")
	            if (nextId) {
	              setRightPanelMode("precision")
	              setRightPanelOpen(true)
	            }
	            applyStateChange((current) => {
		              if (!nextId) {
		                return { ...current, activeObjectId: undefined, selectedObjectIds: [], activeGroupId: undefined }
		              }
		              const isObject = current.objects.some((object) => object.id === nextId)
		              const activeGroup = (current.objectGroups || []).find((group) => group.objectIds.includes(nextId))
	              return {
	                ...current,
	                activeObjectId: nextId,
	                activeCameraId: current.activeCameraId,
	                selectedObjectIds: isObject ? [nextId] : [],
	                activeGroupId: activeGroup?.id,
	              }
	            }, { history: false })
	          }}
		          onObjectTransform={(id, patch) => {
		            applyStateChange((current) => ({
		              ...current,
		              objects: current.objects.map((object) => object.id === id ? applyDirectorObjectStatePatch(object, patch) : object),
		            }), { history: false })
		          }}
		          onPlaceSelection={placeActiveSelectionAt}
		          onDirectorCameraChange={(camera) => {
	            const selectedCamera = state.cameras.find((item) => item.id === state.activeObjectId)
	            const targetCamera = selectedCamera || (viewMode === "camera" ? activeCamera : undefined)
	            if (!targetCamera) return
		            applyStateChange((current) => ({
		              ...current,
		              cameras: current.cameras.map((item) => item.id === targetCamera.id ? applyDirectorCameraPatch(item, camera) : item),
		            }), { history: false })
		          }}
	        />
	        <DirectorCompositionFrameOverlay
	          aspectRatio={activeCamera?.aspectRatio || "16:9"}
	          enabled={viewMode === "director"}
	        />
	        {workspaceMode === "scene" && !timelinePlaying && !timelineExporting ? (
            <DirectorSpatialDirectiveOverlay
              directives={directives}
              activeId={activeDirectiveId}
              marking={directiveMarking}
              projectPanoramaAnchor={projectPanoramaAnchor}
              onCreate={createDirective}
              onSelect={(id) => {
                setActiveDirectiveId(id)
                setRightPanelMode("directives")
                setRightPanelOpen(true)
              }}
              onCancel={() => setDirectiveMarking(false)}
            />
          ) : null}
	        <DirectorConsoleOrientationWidget
	          getPose={() => sceneRef.current?.getDirectorCameraState() || null}
	          onSelect={(view) => {
	            if (viewMode === "camera") {
	              setViewMode("director")
	              if (activeIsCamera) applyStateChange((current) => clearDirectorConsoleSelection(current), { history: false })
	              window.requestAnimationFrame(() => sceneRef.current?.setPresetView(view))
	              return
	            }
	            sceneRef.current?.setPresetView(view)
		          }}
		          onReset={() => sceneRef.current?.resetView()}
		        />
		        </section>

        {!fullscreen && rightPanelOpen ? <aside className={`absolute z-30 flex flex-col overflow-hidden border-white/8 bg-[#181e1b] ${compactViewport ? "bottom-0 left-[72px] right-0 h-[42%] w-auto border-t" : "bottom-0 right-0 top-16 w-[320px] border-l"}`}>
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-white/8 px-3">
            <button type="button" className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] transition-colors ${rightPanelMode === "directives" ? "bg-[#58c7b5]/12 text-[#72d7c6]" : "text-white/38 hover:bg-white/5 hover:text-white/75"}`} onClick={() => setRightPanelMode("directives")}><ListChecks className="size-3.5" />调度</button>
            <button type="button" className={`flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[12px] transition-colors ${rightPanelMode === "precision" ? "bg-white/8 text-white/85" : "text-white/38 hover:bg-white/5 hover:text-white/75"}`} onClick={() => setRightPanelMode("precision")}><SlidersHorizontal className="size-3.5" />精调</button>
          </div>
          {rightPanelMode === "directives" && workspaceMode === "scene" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <DirectorDirectivePanel
                directives={directives}
                activeId={activeDirectiveId}
                objects={state.objects}
                onCreate={startDirectiveMarking}
                onSelect={(id) => setActiveDirectiveId(id)}
                onDelete={deleteDirective}
              />
              <DirectorAiCommandPanel
                directive={activeDirective}
                objects={state.objects}
                hasPanorama={Boolean(String(state.environmentUrl || "").trim())}
                busy={directiveApplyingId === activeDirective?.id}
                referenceUploading={directiveReferenceUploadingId === activeDirective?.id}
                onStartMarking={startDirectiveMarking}
                onUploadReference={() => directiveReferenceInputRef.current?.click()}
                onPatch={(patch) => activeDirective && patchDirective(activeDirective.id, patch, { history: false })}
                onApply={() => activeDirective && void applyDirectorDirective(activeDirective)}
              />
            </div>
          ) : <>
          <div className="flex h-11 shrink-0 items-center border-b border-white/8 px-4">
	          <span className="truncate text-[13px] font-medium text-white/75">{activeIsScene ? "场景参数" : activeIsGroup ? `${activeGroup?.name || "组"} (${activeGroupObjects.length})` : activeObject ? activeObject.name : inspectorCamera?.name || "机位参数"}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-0 py-0 [scrollbar-color:rgba(255,255,255,0.36)_transparent] [scrollbar-width:thin]">
            {!activeIsScene ? (
              <section className="border-b border-white/8 px-4 pb-3 pt-4">
	                <div className="flex gap-2">
	                  <button type="button" className={`h-7 min-w-12 rounded-lg px-3 text-[13px] transition-colors ${selectedTab === "props" ? "bg-white/10 text-neutral-50" : "text-white/45 hover:bg-white/6 hover:text-white/75"}`} onClick={() => setSelectedTab("props")}>属性</button>
	                  {activeObject?.kind === "character" ? <button type="button" className={`h-7 min-w-12 rounded-lg px-3 text-[13px] transition-colors ${selectedTab === "pose" ? "bg-white/10 text-neutral-50" : "text-white/45 hover:bg-white/6 hover:text-white/75"}`} onClick={() => setSelectedTab("pose")}>姿势</button> : null}
	                  {showCapturesTab ? <button type="button" className={`h-7 min-w-12 rounded-lg px-3 text-[13px] transition-colors ${selectedTab === "captures" ? "bg-white/10 text-neutral-50" : "text-white/45 hover:bg-white/6 hover:text-white/75"}`} onClick={() => setSelectedTab("captures")}>摄像机截图</button> : null}
	                  {workspaceMode === "timeline" ? <button type="button" className={`h-7 min-w-12 rounded-lg px-3 text-[13px] transition-colors ${selectedTab === "motion" ? "bg-white/10 text-neutral-50" : "text-white/45 hover:bg-white/6 hover:text-white/75"}`} onClick={() => setSelectedTab("motion")}>运动轨迹</button> : null}
	                </div>
              </section>
            ) : null}
            {activeIsScene ? (
              <DirectorConsole3DSceneProperties
                state={state}
                connectedPanoramaUrl={connectedPanoramaUrl}
                onChange={(patch) => applyStateChange((current) => ({ ...current, ...patch }))}
                onUploadPanorama={() => panoInputRef.current?.click()}
              />
            ) : selectedTab === "props" || selectedTab === "pose" ? (
              <DirectorConsole3DProperties
                tab={selectedTab}
	                activeObject={activeIsGroup ? undefined : activeObject}
	                activeGroup={activeGroup}
	                activeGroupObjects={activeGroupObjects}
	                activeCamera={inspectorCamera}
                sceneRef={sceneRef}
                objects={state.objects}
                cameras={state.cameras}
                groundSnapAvailable={Boolean(String(state.environmentUrl || "").trim())}
                groundSnapY={Number(state.groundHeight || 0) / clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)}
	                onRename={(name) => {
	                  if (activeIsGroup && activeGroup) {
	                    applyStateChange((current) => ({
	                      ...current,
	                      objectGroups: (current.objectGroups || []).map((group) => group.id === activeGroup.id ? { ...group, name } : group),
	                    }))
	                  } else if (activeObject) updateObject(activeObject.id, { name })
	                  else if (state.activeObjectId) updateCamera(state.activeObjectId, { name })
	                }}
	                onVectorChange={updateActiveVector}
	                onObjectColor={(color) => {
	                  if (activeIsGroup && activeGroup) {
	                    applyStateChange((current) => ({ ...current, objects: current.objects.map((object) => activeGroup.objectIds.includes(object.id) ? { ...object, color } : object) }))
	                  } else if (activeObject) updateObject(activeObject.id, { color })
	                }}
                onPoseChange={(pose) => {
                  if (!activeObject) return
                  updateObject(activeObject.id, { pose, jointAngles: cloneDirectorJointAngles(getDirectorPosePreset(pose).jointAngles) })
                }}
                onJointAnglesChange={(jointAngles) => activeObject && updateObject(activeObject.id, { jointAngles, pose: "custom" }, { history: false })}
	                onObjectPatch={(patch) => activeObject && updateObject(activeObject.id, patch)}
		                onUniformScaleChange={(scale) => {
		                  if (activeIsGroup && activeGroup) {
		                    applyStateChange((current) => ({
		                      ...current,
		                      objects: current.objects.map((object) => activeGroup.objectIds.includes(object.id) ? { ...object, uniformScale: scale } : object),
		                    }))
		                  } else if (activeObject) updateObject(activeObject.id, { uniformScale: scale })
		                }}
	                onCameraChange={(id, patch) => {
                  updateCamera(id, patch)
                  if (workspaceMode === "timeline" && timeline.autoKey && Number.isFinite(Number(patch.fov))) setTimelineKeyframe("fov", Number(patch.fov))
                }}
                onSetActiveCamera={(id) => {
	                  applyStateChange((current) => ({ ...current, activeCameraId: id, activeObjectId: id, selectedObjectIds: [], activeGroupId: undefined }), { history: false })
	                  setSelectedTab("props")
	                }}
                onSwitchToCameraView={(id) => {
                  applyStateChange((current) => ({ ...current, activeCameraId: id, activeObjectId: id, selectedObjectIds: [], activeGroupId: undefined }), { history: false })
                  setViewMode("camera")
                }}
                timelineMode={workspaceMode === "timeline"}
                timelineKeyframes={timelineKeyframes}
                onToggleTimelineKeyframe={toggleTimelineKeyframe}
              />
            ) : selectedTab === "captures" ? (
              <DirectorConsole3DCaptures
                cameras={state.cameras}
                onSend={onCreateCaptureNode}
                onDelete={(cameraId, captureId) => {
                  const camera = state.cameras.find((item) => item.id === cameraId)
                  if (camera) updateCamera(camera.id, { captures: (camera.captures || []).filter((capture) => capture.id !== captureId) })
                }}
                onClear={() => applyStateChange((current) => ({ ...current, cameras: current.cameras.map((camera) => ({ ...camera, captures: [] })) }))}
              />
            ) : (
              <DirectorMotionTrackPanel
                activeName={activeObject?.name || inspectorCamera?.name || activeGroup?.name || "未选择对象"}
                activeObject={activeObject}
                action={activeTimelineMotionAction}
                duration={timeline.duration}
                drawing={Boolean(timelineDrawingTrackId && activeTimelineTrack && (timelineDrawingTrackId === activeTimelineTrack.id || timelineDrawingTrackId === activeTimelineTrack.targetId))}
                onToggleDrawing={() => {
                  const selectedId = state.activeObjectId || state.activeCameraId
                  if (!selectedId) return
                  const track = timeline.tracks.find((item) => item.targetId === selectedId)
                  if (track) startTimelineMotionPath(track.id, "circle")
                }}
                path={activeTimelineMotionPath}
                onPathPatch={(patch) => activeTimelineMotionPath && updateTimelineMotionPath(activeTimelineMotionPath.id, patch)}
                onActionChange={(patch) => activeTimelineTrack && updateTimelineMotionAction(activeTimelineTrack.id, patch)}
              />
            )}
          </div>
	        </>}
	        </aside> : null}

        {workspaceMode === "timeline" ? (
          <DirectorTimelinePanel
            state={renderState}
            timeline={timeline}
            time={timelineTime}
            playing={timelinePlaying}
            minimized={timelineMinimized}
            height={timelineHeight}
            drawingTrackId={timelineDrawingTrackId}
            onHeightChange={setTimelineHeight}
            onTimeChange={setTimelineTime}
            onPlayingChange={setTimelinePlaying}
            onTimelineChange={updateDirectorTimeline}
            onAddTrack={() => addTimelineTrack()}
            onRemoveTrack={removeTimelineTrack}
            onToggleMinimized={() => setTimelineMinimized((current) => !current)}
            onToggleDrawing={(trackId) => setTimelineDrawingTrackId((current) => current === trackId ? null : trackId)}
            onCreateMotionPath={startTimelineMotionPath}
            onToggleTrackExpanded={setTimelineTrackExpanded}
            onSelectTrack={(targetId) => {
              applyStateChange((current) => {
                const isCamera = current.cameras.some((camera) => camera.id === targetId)
                return { ...current, activeObjectId: targetId, activeCameraId: isCamera ? targetId : current.activeCameraId, selectedObjectIds: isCamera ? [] : [targetId], activeGroupId: undefined }
              }, { history: false })
              setSelectedTab(timeline.tracks.some((track) => track.targetId === targetId && (track.actions?.length || 0) > 0) ? "motion" : "props")
            }}
          />
        ) : null}
        {workspaceMode === "timeline" && timelineTourStep > 0 ? (
          <DirectorTimelineTour step={timelineTourStep} onSkip={() => setTimelineTourStep(0)} onNext={() => setTimelineTourStep((current) => current >= 5 ? 0 : current + 1)} />
        ) : null}
        {panoramaAiOpen ? (
          <DirectorPanoramaAiDialog
            imageUrl={panoramaAiImageUrl}
            onUpload={() => panoAiInputRef.current?.click()}
            onClose={() => setPanoramaAiOpen(false)}
            onGenerate={() => {
              if (!panoramaAiImageUrl) return
              applyStateChange((current) => ({ ...current, environmentUrl: panoramaAiImageUrl, environmentSourceUrl: undefined }))
              setPanoramaAiOpen(false)
            }}
          />
        ) : null}
        <WorkflowHistoryDialog
          open={panoramaHistoryOpen}
          projectId={projectId}
          onClose={() => setPanoramaHistoryOpen(false)}
          onUseFile={handleUsePanoramaHistoryFile}
        />
      </div>
    </div>,
    document.body,
  )
}

function DirectorSpatialDirectiveOverlay({
  directives,
  activeId,
  marking,
  projectPanoramaAnchor,
  onCreate,
  onSelect,
  onCancel,
}: {
  directives: LibTvDirectorConsole3DDirective[]
  activeId: string | null
  marking: boolean
  projectPanoramaAnchor: (anchor: LibTvDirectorConsole3DPanoramaAnchor) => LibTvDirectorConsole3DDirective["rect"] | null
  onCreate: (rect: LibTvDirectorConsole3DDirective["rect"]) => void
  onSelect: (id: string) => void
  onCancel: () => void
}) {
  const draftRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; width: number; height: number } | null>(null)
  const projectedKeyRef = useRef("")
  const [projectedRects, setProjectedRects] = useState<Record<string, LibTvDirectorConsole3DDirective["rect"] | null>>({})
  const visibleDirectives = directives.filter((directive) => directive.status !== "applied")

  useEffect(() => {
    let animationFrame = 0
    const update = () => {
      const next: Record<string, LibTvDirectorConsole3DDirective["rect"] | null> = {}
      directives.forEach((directive) => {
        if (directive.panoramaAnchor) next[directive.id] = projectPanoramaAnchor(directive.panoramaAnchor)
      })
      const nextKey = JSON.stringify(next)
      if (nextKey !== projectedKeyRef.current) {
        projectedKeyRef.current = nextKey
        setProjectedRects(next)
      }
      animationFrame = window.requestAnimationFrame(update)
    }
    update()
    return () => window.cancelAnimationFrame(animationFrame)
  }, [directives, projectPanoramaAnchor])

  const updateDraft = useCallback((x: number, y: number) => {
    const drag = dragRef.current
    const draft = draftRef.current
    if (!drag || !draft) return
    const left = Math.min(drag.startX, x)
    const top = Math.min(drag.startY, y)
    const width = Math.abs(x - drag.startX)
    const height = Math.abs(y - drag.startY)
    Object.assign(draft.style, {
      display: "block",
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    })
  }, [])

  const finishDraft = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const host = event.currentTarget
    const rect = host.getBoundingClientRect()
    const currentX = clampWorkflowNumber(event.clientX - rect.left, 0, rect.width)
    const currentY = clampWorkflowNumber(event.clientY - rect.top, 0, rect.height)
    let left = Math.min(drag.startX, currentX)
    let top = Math.min(drag.startY, currentY)
    let width = Math.abs(currentX - drag.startX)
    let height = Math.abs(currentY - drag.startY)
    if (width < 12 || height < 12) {
      width = Math.min(rect.width * 0.18, 180)
      height = Math.min(rect.height * 0.2, 160)
      left = clampWorkflowNumber(currentX - width / 2, 0, Math.max(0, rect.width - width))
      top = clampWorkflowNumber(currentY - height / 2, 0, Math.max(0, rect.height - height))
    }
    dragRef.current = null
    if (draftRef.current) draftRef.current.style.display = "none"
    try { host.releasePointerCapture(event.pointerId) } catch {}
    if (rect.width <= 0 || rect.height <= 0) return
    onCreate(normalizeDirectorDirectiveRect({
      x: Number((left / rect.width).toFixed(5)),
      y: Number((top / rect.height).toFixed(5)),
      width: Number((width / rect.width).toFixed(5)),
      height: Number((height / rect.height).toFixed(5)),
    }))
  }, [onCreate])

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {visibleDirectives.map((directive, index) => {
        const active = directive.id === activeId
        const viewportRect = directive.panoramaAnchor ? projectedRects[directive.id] : directive.rect
        if (!viewportRect) return null
        const placePromptBelow = viewportRect.y + viewportRect.height < 0.78
        return (
          <button
            key={directive.id}
            type="button"
            data-testid="director-directive-region"
            aria-label={`${directive.name}${directive.prompt ? `：${directive.prompt}` : ""}`}
            className={`pointer-events-auto absolute min-h-8 min-w-8 border text-left transition-colors ${active ? "border-[#72d7c6] bg-[#58c7b5]/12 shadow-[0_0_0_1px_rgba(88,199,181,0.28)]" : "border-white/45 bg-black/5 hover:border-white/75"}`}
            style={{
              left: `${viewportRect.x * 100}%`,
              top: `${viewportRect.y * 100}%`,
              width: `${viewportRect.width * 100}%`,
              height: `${viewportRect.height * 100}%`,
              borderRadius: 6,
            }}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(directive.id)
            }}
          >
            <span className={`absolute -top-px left-0 flex h-6 max-w-[calc(100%+80px)] items-center gap-1.5 rounded-br-md px-2 text-[11px] font-medium ${active ? "bg-[#58c7b5] text-[#0b1714]" : "bg-black/70 text-white/85"}`}>
              <span className="size-1.5 rounded-full border border-current" />
              <span className="truncate">{directive.name || `调度 ${index + 1}`}</span>
            </span>
            {directive.prompt ? (
              <span className={`pointer-events-none absolute left-0 right-0 line-clamp-2 rounded bg-black/75 px-2 py-1 text-[11px] leading-4 text-white/90 shadow-lg backdrop-blur-sm ${placePromptBelow ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]"}`}>
                {directive.prompt}
              </span>
            ) : null}
          </button>
        )
      })}
      {marking ? (
        <div
          data-testid="director-directive-drawing-layer"
          className="pointer-events-auto absolute inset-0 cursor-crosshair touch-none"
          onPointerDown={(event) => {
            if (event.button !== 0) return
            const rect = event.currentTarget.getBoundingClientRect()
            const startX = clampWorkflowNumber(event.clientX - rect.left, 0, rect.width)
            const startY = clampWorkflowNumber(event.clientY - rect.top, 0, rect.height)
            dragRef.current = { pointerId: event.pointerId, startX, startY, width: rect.width, height: rect.height }
            try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
            updateDraft(startX, startY)
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            const rect = event.currentTarget.getBoundingClientRect()
            updateDraft(
              clampWorkflowNumber(event.clientX - rect.left, 0, rect.width),
              clampWorkflowNumber(event.clientY - rect.top, 0, rect.height),
            )
          }}
          onPointerUp={finishDraft}
          onPointerCancel={() => {
            dragRef.current = null
            if (draftRef.current) draftRef.current.style.display = "none"
          }}
        >
          <div ref={draftRef} className="absolute hidden border border-[#72d7c6] bg-[#58c7b5]/12 shadow-[0_0_0_1px_rgba(88,199,181,0.24)]" style={{ borderRadius: 6 }} />
          <button type="button" className="absolute right-4 top-4 flex h-8 items-center gap-1.5 rounded-md border border-white/12 bg-[#111615]/90 px-3 text-xs text-white/80 backdrop-blur-md hover:bg-[#1b2421]" onClick={(event) => { event.stopPropagation(); onCancel() }}>
            <X className="size-3.5" />取消框选
          </button>
        </div>
      ) : null}
    </div>
  )
}

function DirectorDirectivePanel({
  directives,
  activeId,
  objects,
  onCreate,
  onSelect,
  onDelete,
}: {
  directives: LibTvDirectorConsole3DDirective[]
  activeId: string | null
  objects: LibTvDirectorConsole3DObject[]
  onCreate: () => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-white/90"><ListChecks className="size-4 text-[#58c7b5]" />调度清单</div>
        <button type="button" className="flex h-7 items-center gap-1 rounded-md bg-[#58c7b5] px-2.5 text-[12px] font-medium text-[#0c1815] transition-colors hover:bg-[#72d7c6]" onClick={onCreate}>
          <ScanLine className="size-3.5" />框选
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:rgba(255,255,255,0.28)_transparent] [scrollbar-width:thin]">
        {directives.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 px-8 text-center text-white/40">
            <ScanLine className="size-7" strokeWidth={1.4} />
            <span className="text-[13px]">尚无调度标注</span>
            <button type="button" className="h-8 rounded-md border border-white/12 px-3 text-xs text-white/70 hover:bg-white/6" onClick={onCreate}>框选调度区域</button>
          </div>
        ) : directives.map((directive, index) => {
          const action = getDirectorDirectiveAction(directive)
          const targetIds = new Set([...(directive.targetObjectIds || []), ...(directive.targetObjectId ? [directive.targetObjectId] : [])])
          const targetObjects = objects.filter((object) => targetIds.has(object.id))
          const targetCharacter = objects.find((object) => object.id === directive.targetObjectId && object.kind === "character")
          const targetLabel = action === "character"
            ? targetCharacter?.name || `新建 · ${getDirectorCharacterBodyOption(directive.targetCharacterPreset).label}角色`
            : action === "panorama"
              ? `全景${directive.panoramaOperation === "add" ? "新增" : directive.panoramaOperation === "remove" ? "移除" : "修改"}`
            : targetObjects.length > 0
              ? targetObjects.slice(0, 3).map((object) => object.name).join("、") + (targetObjects.length > 3 ? ` 等 ${targetObjects.length} 项` : "")
              : directive.summary || (action === "add" ? "框选位置" : "框内暂无对象")
          const active = directive.id === activeId
          return (
            <div key={directive.id} className={`group relative border-b border-white/8 px-4 py-3 transition-colors ${active ? "bg-[#58c7b5]/8" : "hover:bg-white/[0.025]"}`}>
              <button type="button" className="block w-full pr-7 text-left" onClick={() => onSelect(directive.id)}>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-white/85">{directive.name || `调度 ${index + 1}`}</span>
                    <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-white/42">{DIRECTOR_DIRECTIVE_ACTION_LABELS[action]}</span>
                  </span>
                  <span className={`size-1.5 shrink-0 rounded-full ${directive.status === "applied" ? "bg-[#58c7b5]" : directive.status === "error" ? "bg-[#df665f]" : directive.status === "planning" ? "animate-pulse bg-[#f0c36a]" : "border border-white/45"}`} />
                </span>
                <span className="mt-1 block truncate text-[11px] text-white/40">{targetLabel}</span>
                <span className="mt-1.5 line-clamp-2 block text-[12px] leading-5 text-white/60">{directive.prompt || directive.summary || "等待输入空间指令"}</span>
              </button>
              <button type="button" aria-label={`删除${directive.name}`} title="删除标注" className="absolute right-3 top-3 flex size-6 items-center justify-center rounded text-white/25 opacity-0 transition-opacity hover:bg-white/8 hover:text-white/70 group-hover:opacity-100" onClick={() => onDelete(directive.id)}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DirectorAiCommandPanel({
  directive,
  objects,
  hasPanorama,
  busy,
  referenceUploading,
  onStartMarking,
  onUploadReference,
  onPatch,
  onApply,
}: {
  directive: LibTvDirectorConsole3DDirective | null
  objects: LibTvDirectorConsole3DObject[]
  hasPanorama: boolean
  busy: boolean
  referenceUploading: boolean
  onStartMarking: () => void
  onUploadReference: () => void
  onPatch: (patch: Partial<LibTvDirectorConsole3DDirective>) => void
  onApply: () => void
}) {
  const action = getDirectorDirectiveAction(directive)
  const panoramaOperation = directive?.panoramaOperation || "edit"
  const targetIds = new Set([...(directive?.targetObjectIds || []), ...(directive?.targetObjectId ? [directive.targetObjectId] : [])])
  const regionObjects = objects.filter((object) => targetIds.has(object.id))
  const characters = objects.filter((object) => object.kind === "character")
  const regionCharacters = regionObjects.filter((object) => object.kind === "character")
  const editableObjects = regionObjects.filter((object) => object.kind !== "character")
  const existingTarget = directive
    ? characters.find((character) => character.id === directive.targetObjectId)
    : undefined
  const selectedPreset = getDirectorCharacterBodyOption(directive?.targetCharacterPreset)
  const targetValue = existingTarget ? `existing:${existingTarget.id}` : `new:${selectedPreset.id}`
  const editTarget = directive
    ? editableObjects.find((object) => object.id === directive.targetObjectId) || editableObjects[0]
    : undefined
  const hasGenerationInput = Boolean(directive?.prompt.trim() || directive?.referenceImageUrl)
  const canApply = action === "remove"
    || (action === "character" ? Boolean(directive?.prompt.trim())
      : action === "panorama" ? hasPanorama && (panoramaOperation === "remove" || Boolean(directive?.prompt.trim()))
        : hasGenerationInput)
  const actionOptions: Array<{
    id: NonNullable<LibTvDirectorConsole3DDirective["action"]>
    label: string
    icon: React.ReactNode
  }> = [
    { id: "character", label: "角色调度", icon: <User className="size-3.5" /> },
    { id: "add", label: "新增对象", icon: <Plus className="size-3.5" /> },
    { id: "edit", label: "修改对象", icon: <RefreshCw className="size-3.5" /> },
    { id: "remove", label: "移除对象", icon: <Trash2 className="size-3.5" /> },
    { id: "panorama", label: "编辑全景", icon: <ImageIcon className="size-3.5" /> },
  ]
  const applyLabel = action === "character"
    ? busy ? "调度中" : "执行角色调度"
    : action === "add"
      ? busy ? "生成中" : "生成并放入场景"
      : action === "edit"
        ? busy ? "重新生成中" : "重新生成对象"
        : action === "remove"
          ? busy ? "移除中" : regionObjects.length > 0 ? `移除 ${regionObjects.length} 个对象` : "移除框内对象"
          : busy ? "编辑中" : panoramaOperation === "remove" ? "移除全景元素" : panoramaOperation === "add" ? "在全景中新增" : "局部修改全景"

  function switchAction(nextAction: NonNullable<LibTvDirectorConsole3DDirective["action"]>) {
    if (!directive || nextAction === action) return
    const nextCharacter = regionCharacters[0]
    const nextEditableObject = editableObjects[0]
    onPatch({
      action: nextAction,
      panoramaOperation: nextAction === "panorama" ? directive.panoramaOperation || "edit" : undefined,
      targetObjectId: nextAction === "character" ? nextCharacter?.id : nextAction === "edit" ? nextEditableObject?.id : undefined,
      targetCharacterPreset: nextAction === "character" && !nextCharacter ? directive.targetCharacterPreset || "mannequin" : undefined,
      referenceImageUrl: nextAction === "add" || nextAction === "edit" ? directive.referenceImageUrl : undefined,
      generationStatus: "idle",
      generationTaskId: undefined,
      generationModelRuntimeId: undefined,
      generatedModelUrl: undefined,
      generationError: undefined,
      status: "draft",
      poseId: undefined,
      position: undefined,
      summary: undefined,
    })
  }

  function resetGenerationPatch(patch: Partial<LibTvDirectorConsole3DDirective>) {
    onPatch({
      ...patch,
      generationStatus: "idle",
      generationTaskId: undefined,
      generationModelRuntimeId: undefined,
      generatedModelUrl: undefined,
      generationError: undefined,
      status: "draft",
      summary: undefined,
    })
  }

  return (
    <section data-testid="director-ai-command-panel" className="shrink-0 border-t border-white/8 bg-[#151a18]">
      {directive ? (
        <div className="max-h-[430px] overflow-y-auto p-3 [scrollbar-color:rgba(255,255,255,0.24)_transparent] [scrollbar-width:thin] max-[900px]:max-h-[260px]">
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium text-[#72d7c6]"><ScanLine className="size-3.5 shrink-0" /><span className="truncate">{directive.name}</span></span>
            {directive.summary ? <span className="max-w-[48%] truncate text-[10px] text-white/35">{directive.summary}</span> : null}
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1.5" role="group" aria-label="空间操作">
            {actionOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={action === option.id}
                className={`flex h-8 items-center justify-center gap-1.5 rounded-md border text-[11px] transition-colors ${option.id === "panorama" ? "col-span-2" : ""} ${action === option.id ? "border-[#58c7b5]/45 bg-[#58c7b5]/14 text-[#8de3d3]" : "border-white/8 bg-white/[0.025] text-white/45 hover:bg-white/[0.055] hover:text-white/75"}`}
                onClick={() => switchAction(option.id)}
              >
                {option.icon}{option.label}
              </button>
            ))}
          </div>

          <div className="mb-2 flex min-h-8 items-center gap-2 border-y border-white/7 py-1.5 text-[11px]">
            <span className="shrink-0 text-white/32">{action === "panorama" ? "编辑目标" : "框内对象"}</span>
            <span className="min-w-0 flex-1 truncate text-right text-white/62" title={regionObjects.map((object) => object.name).join("、")}>
              {action === "panorama" ? "全景原图像素" : regionObjects.length > 0 ? regionObjects.map((object) => object.name).join("、") : "未命中对象"}
            </span>
          </div>

          {action === "panorama" ? (
            <div className="mb-2">
              <div className="grid grid-cols-3 gap-1 rounded-md bg-white/[0.035] p-1" role="group" aria-label="全景编辑方式">
                {([
                  ["add", "新增"],
                  ["edit", "修改"],
                  ["remove", "移除"],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={panoramaOperation === id}
                    className={`h-7 rounded text-[11px] transition-colors ${panoramaOperation === id ? "bg-white/12 text-white/90" : "text-white/38 hover:bg-white/6 hover:text-white/68"}`}
                    onClick={() => onPatch({ panoramaOperation: id, status: "draft", summary: undefined, generationError: undefined })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/32">
                <Check className="size-3 text-[#58c7b5]" />框外像素锁定，框内内容由模型生成
              </div>
              {!hasPanorama ? <div className="mt-1 text-[10px] text-[#df817b]">请先上传 2:1 全景图</div> : null}
            </div>
          ) : action === "character" ? (
            <div className="mb-2 flex h-8 items-center gap-2 rounded-md bg-white/[0.05] px-2.5 text-[11px] text-white/38">
              <User className="size-3.5 shrink-0" />
              <span className="shrink-0">选择角色</span>
              <WorkflowSelect
                value={targetValue}
                onValueChange={(value) => {
                  if (value.startsWith("new:")) {
                    onPatch({
                      targetObjectId: undefined,
                      targetCharacterPreset: normalizeDirectorCharacterBodyType(value.slice(4)) || "mannequin",
                      status: "draft",
                      summary: undefined,
                    })
                    return
                  }
                  onPatch({
                    targetObjectId: value.startsWith("existing:") ? value.slice(9) || undefined : undefined,
                    targetCharacterPreset: undefined,
                    status: "draft",
                    summary: undefined,
                  })
                }}
              >
                <WorkflowSelectTrigger className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-right text-[12px] text-white/78 hover:border-transparent focus:border-transparent" aria-label="选择角色">
                  <WorkflowSelectValue />
                </WorkflowSelectTrigger>
                <WorkflowSelectContent>
                  <WorkflowSelectGroup>
                    <WorkflowSelectLabel>新建角色</WorkflowSelectLabel>
                    {DIRECTOR_CHARACTER_BODY_OPTIONS.map((option) => (
                      <WorkflowSelectItem key={option.id} value={"new:" + option.id}>
                        新建 · {option.label}角色
                      </WorkflowSelectItem>
                    ))}
                  </WorkflowSelectGroup>
                {characters.length > 0 ? (
                    <WorkflowSelectGroup>
                      <WorkflowSelectLabel>场景已有角色</WorkflowSelectLabel>
                      {characters.map((character) => (
                        <WorkflowSelectItem key={character.id} value={"existing:" + character.id}>
                          已有 · {character.name}
                        </WorkflowSelectItem>
                      ))}
                    </WorkflowSelectGroup>
                ) : null}
                </WorkflowSelectContent>
              </WorkflowSelect>
            </div>
          ) : action === "edit" ? (
            <div className="mb-2 flex h-8 items-center gap-2 rounded-md bg-white/[0.05] px-2.5 text-[11px] text-white/38">
              <Box className="size-3.5 shrink-0" />
              <span className="shrink-0">修改目标</span>
              <WorkflowSelect
                value={editTarget?.id || "__none__"}
                onValueChange={(value) => resetGenerationPatch({ targetObjectId: value === "__none__" ? undefined : value })}
              >
                <WorkflowSelectTrigger className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-right text-[12px] text-white/78 hover:border-transparent focus:border-transparent" aria-label="选择修改对象">
                  <WorkflowSelectValue />
                </WorkflowSelectTrigger>
                <WorkflowSelectContent>
                  {editableObjects.length === 0 ? (
                    <WorkflowSelectItem value="__none__" disabled>框内暂无可修改对象</WorkflowSelectItem>
                  ) : null}
                  {editableObjects.map((object) => (
                    <WorkflowSelectItem key={object.id} value={object.id}>{object.name}</WorkflowSelectItem>
                  ))}
                </WorkflowSelectContent>
              </WorkflowSelect>
            </div>
          ) : action === "add" ? (
            <div className="mb-2 flex min-h-8 items-center gap-2 rounded-md bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/38">
              <User className="size-3.5 shrink-0" />
              <span className="shrink-0">角色绑定</span>
              <WorkflowSelect
                value={directive.attachmentMode === "leftHand" || directive.attachmentMode === "rightHand"
                  ? `${directive.attachmentCharacterId || ""}:${directive.attachmentMode}`
                  : directive.attachmentMode || "auto"}
                onValueChange={(value) => {
                  if (value === "auto" || value === "none") {
                    resetGenerationPatch({ attachmentMode: value, attachmentCharacterId: undefined })
                    return
                  }
                  const separator = value.lastIndexOf(":")
                  const characterId = separator > 0 ? value.slice(0, separator) : ""
                  const attachBone = value.slice(separator + 1) === "leftHand" ? "leftHand" : "rightHand"
                  resetGenerationPatch({ attachmentMode: attachBone, attachmentCharacterId: characterId || undefined })
                }}
              >
                <WorkflowSelectTrigger className="h-7 min-w-0 flex-1 border-0 bg-transparent px-0 text-right text-[12px] text-white/78 hover:border-transparent focus:border-transparent" aria-label="选择道具绑定角色">
                  <WorkflowSelectValue />
                </WorkflowSelectTrigger>
                <WorkflowSelectContent>
                  <WorkflowSelectItem value="auto">AI 自动判断</WorkflowSelectItem>
                  <WorkflowSelectItem value="none">不绑定角色</WorkflowSelectItem>
                {characters.length > 0 ? (
                    <WorkflowSelectGroup>
                      <WorkflowSelectLabel>指定场景角色</WorkflowSelectLabel>
                    {characters.flatMap((character) => [
                        <WorkflowSelectItem key={character.id + ":leftHand"} value={character.id + ":leftHand"}>
                          {character.name} · 左手
                        </WorkflowSelectItem>,
                        <WorkflowSelectItem key={character.id + ":rightHand"} value={character.id + ":rightHand"}>
                          {character.name} · 右手
                        </WorkflowSelectItem>,
                    ])}
                    </WorkflowSelectGroup>
                ) : null}
                </WorkflowSelectContent>
              </WorkflowSelect>
            </div>
          ) : null}

          {action === "add" || action === "edit" ? (
            <div className="mb-2 flex min-h-12 items-center gap-2 rounded-md bg-white/[0.04] p-2">
              {directive.referenceImageUrl ? (
                <img src={directive.referenceImageUrl} alt="3D 参考" className="size-10 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded bg-white/[0.045] text-white/25"><ImageIcon className="size-4" /></span>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-white/68">{directive.referenceImageUrl ? "已添加 3D 参考图" : "图片生成 3D"}</div>
                <div className="mt-0.5 text-[9px] text-white/30">PNG · JPG · WEBP</div>
              </div>
              <button type="button" title={directive.referenceImageUrl ? "更换参考图" : "上传参考图"} aria-label={directive.referenceImageUrl ? "更换参考图" : "上传参考图"} disabled={referenceUploading || busy} className="flex size-7 shrink-0 items-center justify-center rounded text-white/45 hover:bg-white/8 hover:text-white/80 disabled:opacity-35" onClick={onUploadReference}>
                {referenceUploading ? <ColorfulLoader className="size-3.5" thickness={2} /> : <ImagePlus className="size-3.5" />}
              </button>
              {directive.referenceImageUrl ? (
                <button type="button" title="移除参考图" aria-label="移除参考图" disabled={referenceUploading || busy} className="flex size-7 shrink-0 items-center justify-center rounded text-white/35 hover:bg-white/8 hover:text-[#df665f] disabled:opacity-35" onClick={() => resetGenerationPatch({ referenceImageUrl: undefined })}>
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          ) : null}

          {action !== "remove" && !(action === "panorama" && panoramaOperation === "remove") ? (
            <textarea
              aria-label={action === "character" ? "调度要求" : action === "add" ? "新增对象要求" : action === "panorama" ? "全景编辑要求" : "修改对象要求"}
              value={directive.prompt}
              placeholder={action === "character"
                ? "例如：让人物站在这里，面向镜头招手"
                : action === "add"
                  ? "例如：新增一棵树；让角色右手拿着弓箭"
                  : action === "panorama"
                    ? panoramaOperation === "add" ? "例如：在框选区域新增一棵松树" : "例如：把框内的木门改成打开状态"
                    : "例如：重新生成成一张带扶手的木椅"}
              className="h-[72px] w-full resize-none rounded-md bg-white/[0.055] px-3 py-2 text-[12px] leading-5 text-white/90 outline-none placeholder:text-white/28 focus:bg-white/[0.075] focus:ring-1 focus:ring-[#58c7b5]/55"
              onChange={(event) => resetGenerationPatch({ prompt: event.target.value.slice(0, 2000) })}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault()
                  onApply()
                }
              }}
            />
          ) : (
            <div className="rounded-md border border-[#df665f]/20 bg-[#df665f]/7 px-3 py-2 text-[11px] leading-5 text-[#edaaa5]">
              {action === "panorama"
                ? "将移除全景原图框选区域内的可见元素，并根据周围画面补全背景。"
                : regionObjects.length > 0 ? `将从场景移除：${regionObjects.map((object) => object.name).join("、")}` : "执行时会重新检测框选区域内的对象"}
            </div>
          )}

          {directive.generationStatus === "processing" || directive.generationStatus === "submitting" ? (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#f0c36a]"><ColorfulLoader className="size-3" thickness={2} />{directive.summary || "WaveSpeed 正在生成 3D 模型"}</div>
          ) : directive.generationStatus === "failed" && directive.generationError ? (
            <div className="mt-2 line-clamp-2 text-[10px] leading-4 text-[#df817b]">{directive.generationError}</div>
          ) : null}
          <button
            type="button"
            disabled={busy || referenceUploading || !canApply}
            className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#58c7b5] px-3 text-[12px] font-semibold text-[#0c1815] transition-colors hover:bg-[#72d7c6] disabled:pointer-events-none disabled:opacity-35"
            onClick={onApply}
          >
            {busy ? <ColorfulLoader className="size-4" thickness={2} /> : action === "remove" || (action === "panorama" && panoramaOperation === "remove") ? <Trash2 className="size-4" /> : <WandSparkles className="size-4" />}
            {applyLabel}
          </button>
        </div>
      ) : (
        <div className="p-3">
          <div className="mb-3 flex items-start gap-2.5 text-[12px] leading-5 text-white/48">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-[#58c7b5]/12 text-[#72d7c6]"><Sparkles className="size-3.5" /></span>
            <span>先在全景画面中框选需要调度的位置</span>
          </div>
          <button type="button" className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-[#58c7b5] px-3 text-[12px] font-medium text-[#0c1815] hover:bg-[#72d7c6]" onClick={onStartMarking}>
            <ScanLine className="size-4" />框选位置
          </button>
        </div>
      )}
    </section>
  )
}

function DirectorToolButton({
  testId,
  active,
  label,
  tooltip,
  icon,
  menu,
  ariaHaspopup,
  ariaExpanded,
  onClick,
}: {
  testId?: string
  active?: boolean
  label: string
  tooltip?: string
  icon: React.ReactNode
  menu?: React.ReactNode
  ariaHaspopup?: React.AriaAttributes["aria-haspopup"]
  ariaExpanded?: boolean
  onClick: () => void
}) {
  return (
    <div className="group relative flex w-full shrink-0 justify-center">
      {menu}
      <button
        type="button"
        data-testid={testId}
        title={tooltip || label}
        aria-label={tooltip || label}
        aria-haspopup={ariaHaspopup}
        aria-expanded={ariaExpanded}
        aria-pressed={active === undefined ? undefined : active}
        className={`flex h-12 w-[60px] shrink-0 flex-col items-center justify-center gap-1 rounded-md px-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72d7c6]/70 ${active ? "bg-[#58c7b5]/18 text-[#8de3d3] ring-1 ring-inset ring-[#58c7b5]/25" : "text-white/62 hover:bg-white/[0.075] hover:text-white"}`}
        onClick={onClick}
      >
        <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span>
        <span className="max-w-full truncate text-[10px] leading-none">{label}</span>
      </button>
      {menu ? null : <span className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-[1800] max-w-44 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/8 bg-[#202522] px-2 py-1 text-[11px] leading-5 text-white/85 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{tooltip || label}</span>}
    </div>
  )
}

const DIRECTOR_SHORTCUT_GROUPS = [
  {
    title: "模式切换",
    items: [
      ["移动", "V"],
      ["旋转", "R"],
      ["缩放", "S"],
      ["网格吸附", "X"],
    ],
  },
  {
    title: "视角切换",
    items: [
      ["俯视视角", "T"],
      ["正面视角", "Y"],
      ["重置视角", "Q"],
    ],
  },
  {
    title: "基础操作",
    items: [
      ["解组", "Ctrl+G"],
      ["编组", "Ctrl+Shift+G"],
      ["撤销", "Ctrl+Z"],
      ["删除", "Delete"],
    ],
  },
] as const

function DirectorShortcutHelpPanel() {
  return (
    <div className="nodrag nopan nowheel absolute right-8 top-[calc(100%+12px)] z-[1900] w-[560px] rounded-xl border border-white/12 bg-[rgba(31,31,31,0.92)] p-4 text-neutral-50 shadow-[0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[14px] font-medium leading-none text-white/90">操作快捷键</div>
        <Keyboard className="size-4 text-white/45" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {DIRECTOR_SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="rounded-lg bg-white/[0.045] p-3">
            <div className="mb-2 text-[13px] font-medium leading-none text-white/82">{group.title}</div>
            <div className="space-y-2">
              {group.items.map(([label, shortcut], index) => (
                <div key={label} className="flex items-center justify-between gap-3 text-[12px] leading-5">
                  <span className="min-w-0 truncate text-white/62">{index + 1}. {label}</span>
                  <kbd className="shrink-0 rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] leading-none text-white/86">{shortcut}</kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function DirectorSceneTreeContextMenu({
  menu,
  menuRef,
  canGroup,
  onClose,
  onGroup,
  onUngroup,
  onToggleVisible,
  onToggleLocked,
  onDelete,
}: {
  menu: Exclude<DirectorSceneTreeContextMenu, null>
  menuRef?: React.RefObject<HTMLDivElement>
  canGroup: boolean
  onClose: () => void
  onGroup: () => void
  onUngroup: () => void
  onToggleVisible: () => void
  onToggleLocked: () => void
  onDelete: () => void
}) {
  const canUngroup = menu.item.type === "group" || Boolean(menu.item.parentGroupId)
  const run = (action: () => void) => {
    action()
    onClose()
  }
  return (
    <div
      ref={menuRef}
      className="nodrag nopan nowheel fixed z-[1900] flex w-[180px] flex-col rounded-xl border border-white/12 bg-[rgba(31,31,31,0.92)] p-1 text-[13px] text-white/80 shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur-lg"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <DirectorSceneTreeMenuItem disabled={!canGroup} icon={<Folder className="size-3.5" />} label="打组" onClick={() => run(onGroup)} />
      <DirectorSceneTreeMenuItem disabled={!canUngroup} icon={<FolderDown className="size-3.5" />} label="解组" onClick={() => run(onUngroup)} />
      <DirectorSceneTreeMenuItem icon={menu.item.visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />} label="显示/隐藏" onClick={() => run(onToggleVisible)} />
      <DirectorSceneTreeMenuItem icon={menu.item.locked ? <LockOpenIcon /> : <LockClosedIcon />} label="锁定/解锁" onClick={() => run(onToggleLocked)} />
      <div className="my-1 h-px bg-white/8" />
      <DirectorSceneTreeMenuItem danger icon={<Trash2 className="size-3.5" />} label="删除" onClick={() => run(onDelete)} />
    </div>
  )
}

function DirectorSceneTreeMenuItem({
  icon,
  label,
  disabled,
  danger,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  disabled?: boolean
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${danger ? "text-red-200 hover:bg-red-500/12 hover:text-red-100" : "text-white/78 hover:bg-white/8 hover:text-white"}`}
      onClick={onClick}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

type DirectorCameraPresetId =
  | "current"
  | "front_medium"
  | "front_closeup"
  | "front_wide"
  | "side_tracking"
  | "side_close"
  | "back_medium"
  | "top_wide"
  | "top_45"
  | "low_angle"
  | "low_wide"
  | "over_shoulder_l"
  | "over_shoulder_r"
  | "birdseye"
  | "dutch"

const DIRECTOR_CAMERA_PRESETS: Array<{
  id: DirectorCameraPresetId
  label: string
  position?: LibTvDirectorConsole3DVector3
  target?: LibTvDirectorConsole3DVector3
  fov?: number
}> = [
  { id: "current", label: "当前视角" },
  { id: "front_medium", label: "正面中景", position: { x: 0, y: 1.5, z: 4 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 },
  { id: "front_closeup", label: "正面特写", position: { x: 0, y: 1.7, z: 2 }, target: { x: 0, y: 1.6, z: 0 }, fov: 35 },
  { id: "front_wide", label: "正面全景", position: { x: 0, y: 2.5, z: 8 }, target: { x: 0, y: 1, z: 0 }, fov: 60 },
  { id: "side_tracking", label: "侧面跟拍", position: { x: 4, y: 1.5, z: 0 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 },
  { id: "side_close", label: "侧面近景", position: { x: 2.5, y: 1.5, z: 0 }, target: { x: 0, y: 1.5, z: 0 }, fov: 40 },
  { id: "back_medium", label: "背面中景", position: { x: 0, y: 1.5, z: -4 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 },
  { id: "top_wide", label: "俯拍全景", position: { x: 0, y: 8, z: 3 }, target: { x: 0, y: 0, z: 0 }, fov: 55 },
  { id: "top_45", label: "45° 俯拍", position: { x: 0, y: 5, z: 5 }, target: { x: 0, y: 1, z: 0 }, fov: 50 },
  { id: "low_angle", label: "低角度仰拍", position: { x: 0, y: 0.3, z: 3 }, target: { x: 0, y: 1.8, z: 0 }, fov: 45 },
  { id: "low_wide", label: "低角度广角", position: { x: 0, y: 0.5, z: 5 }, target: { x: 0, y: 1, z: 0 }, fov: 70 },
  { id: "over_shoulder_l", label: "过肩镜头", position: { x: -0.5, y: 1.7, z: 2.5 }, target: { x: 0.5, y: 1.6, z: 0 }, fov: 50 },
  { id: "over_shoulder_r", label: "过肩镜头（右）", position: { x: 0.5, y: 1.7, z: 2.5 }, target: { x: -0.5, y: 1.6, z: 0 }, fov: 50 },
  { id: "birdseye", label: "鸟瞰", position: { x: 0, y: 12, z: 0.5 }, target: { x: 0, y: 0, z: 0 }, fov: 60 },
  { id: "dutch", label: "荷兰角", position: { x: 1, y: 1.5, z: 3.5 }, target: { x: 0, y: 1.2, z: 0 }, fov: 50 },
]

function resolveDirectorCameraPreset(
  presetId: DirectorCameraPresetId,
  state: LibTvDirectorConsole3DState,
  currentPose: { position: LibTvDirectorConsole3DVector3; target: LibTvDirectorConsole3DVector3 } | null
) {
  const preset = DIRECTOR_CAMERA_PRESETS.find((item) => item.id === presetId) || DIRECTOR_CAMERA_PRESETS[0]
  const activeCamera = state.cameras.find((camera) => camera.id === state.activeCameraId) || state.cameras[0]
  if (presetId === "current") {
    return {
      label: preset.label,
      position: currentPose?.position || activeCamera?.position || DIRECTOR_SCENE_CAMERA_POSITION,
      target: currentPose?.target || activeCamera?.target || DIRECTOR_SCENE_CAMERA_TARGET,
      fov: activeCamera?.fov || 50,
    }
  }
  return {
    label: preset.label,
    position: preset.position || DIRECTOR_SCENE_CAMERA_POSITION,
    target: preset.target || DIRECTOR_SCENE_CAMERA_TARGET,
    fov: preset.fov || 50,
  }
}

function DirectorCameraPresetButton({
  open,
  onToggle,
  onSelect,
}: {
  open: boolean
  onToggle: () => void
  onSelect: (presetId: DirectorCameraPresetId) => void
}) {
  return (
    <DirectorToolButton
      label="机位"
      tooltip="添加或选择机位"
      active={open}
      ariaHaspopup="menu"
      ariaExpanded={open}
      icon={<DirectorLibTvVideoCameraIcon />}
      menu={open ? (
        <div className="nodrag nopan nowheel absolute left-[calc(100%+10px)] top-1/2 z-[1700] flex w-[240px] -translate-y-1/2 flex-col rounded-lg border border-white/12 bg-[rgba(25,30,29,0.97)] p-1.5 shadow-[0_14px_32px_rgba(0,0,0,0.38)] backdrop-blur-xl">
            <div className="px-2.5 pb-1 pt-1 text-[10px] font-semibold text-white/35">选择机位视角</div>
            <div className="max-h-[280px] overflow-y-auto [scrollbar-color:rgba(255,255,255,0.36)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-corner]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/35 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-2">
              <div className="grid grid-cols-2 gap-1.5">
                {DIRECTOR_CAMERA_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="flex cursor-pointer select-none flex-col items-center justify-center gap-1.5 rounded-md bg-white/[0.06] px-1.5 py-3 transition-colors hover:bg-white/10 active:bg-white/15"
                    onClick={() => onSelect(preset.id)}
                  >
                    <span className="text-white/45"><DirectorLibTvVideoCameraIcon size={28} /></span>
                    <span className="text-center text-[11px] leading-tight text-white/75">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
        </div>
      ) : null}
      onClick={onToggle}
    />
  )
}

function DirectorPanoramaButton({
  open,
  projection,
  onToggle,
  onLocalUpload,
  onHistory,
  onAiGenerate,
  onProjectionChange,
}: {
  open: boolean
  projection?: LibTvDirectorConsole3DState["environmentProjection"]
  onToggle: () => void
  onLocalUpload: () => void
  onHistory: () => void
  onAiGenerate: () => void
  onProjectionChange: (projection: "flat" | "equirectangular") => void
}) {
  return (
    <DirectorToolButton
      label="全景"
      tooltip="上传、选择或生成全景图"
      active={open}
      ariaHaspopup="menu"
      ariaExpanded={open}
      icon={<DirectorLibTvPanoramaIcon />}
      menu={open ? (
        <div className="nodrag nopan nowheel absolute left-[calc(100%+10px)] top-0 z-[1700] flex w-[190px] flex-col gap-1 rounded-lg border border-white/12 bg-[rgba(25,30,29,0.97)] p-1 shadow-[0_14px_32px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <DirectorPanoramaMenuItem icon={<DirectorLibTvUploadIcon />} label="本地上传" hint={<DirectorLibTvHelpIcon />} onClick={onLocalUpload} />
          <DirectorPanoramaMenuItem icon={<DirectorLibTvHistoryIcon />} label="历史记录" onClick={onHistory} />
          <DirectorPanoramaMenuItem icon={<DirectorLibTvPanoramaSmallIcon />} label="AI生成" onClick={onAiGenerate} />
          <div className="mt-1 border-t border-white/8 px-1 pt-2">
            <div className="px-1 pb-1 text-[10px] font-medium text-white/35">背景构图</div>
            <div className="grid grid-cols-2 gap-1" role="group" aria-label="背景构图">
              {[
                { id: "equirectangular" as const, label: "720全景", icon: <DirectorLibTvPanoramaSmallIcon /> },
                { id: "flat" as const, label: "平面构图", icon: <ImageIcon className="size-3.5" /> },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={projection === option.id}
                  className={`flex h-8 items-center justify-center gap-1 rounded-md text-[11px] transition-colors ${projection === option.id ? "bg-[#58c7b5]/16 text-[#8de3d3]" : "bg-white/[0.035] text-white/48 hover:bg-white/8 hover:text-white/78"}`}
                  onClick={() => onProjectionChange(option.id)}
                >
                  {option.icon}<span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      onClick={onToggle}
    />
  )
}

function DirectorPanoramaMenuItem({ icon, label, hint, onClick }: { icon: React.ReactNode; label: string; hint?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="flex h-8 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-[13px] text-white/70 transition-colors hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:hover:bg-transparent" onClick={onClick}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-white/72">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {hint ? <span className="text-white/45">{hint}</span> : null}
    </button>
  )
}

function DirectorPanoramaAiDialog({
  imageUrl,
  onUpload,
  onClose,
  onGenerate,
}: {
  imageUrl: string | null
  onUpload: () => void
  onClose: () => void
  onGenerate: () => void
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <div className="flex h-[448px] w-[640px] flex-col justify-end gap-4 rounded-xl border border-white/10 bg-[#1f1f1f] pb-4 pt-3 shadow-2xl">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 px-4 pb-3">
          <div className="text-sm font-medium leading-5 text-white">AI生成</div>
          <button type="button" title="关闭" className="flex h-6 w-6 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white" onClick={onClose}>
            <DirectorLibTvCloseIcon />
          </button>
        </div>
        <div className="flex w-full shrink-0 items-center justify-center px-4">
          <button type="button" className="group flex h-[320px] min-w-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] px-6 py-4 transition-colors hover:border-white/20 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-70" onClick={onUpload}>
            {imageUrl ? (
              <img src={imageUrl} alt="" draggable={false} className="h-full w-full rounded-md object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-white/85">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors group-hover:bg-white/10">
                  <DirectorLibTvPlusIcon />
                </span>
                <span className="text-xs leading-[17px]">上传图片</span>
              </span>
            )}
          </button>
        </div>
        <div className="flex h-8 shrink-0 items-center justify-between px-4">
          <div className="text-[13px] leading-[18px] text-white/55">退出不会中断生成过程，全景图生成成功后，会自动加载到背景</div>
          <div className="flex h-8 items-center gap-2 text-white/45">
            <span className="flex shrink-0 items-center gap-[2px]">
              <DirectorLibTvCreditIcon />
              <span className="min-w-5 text-center text-[12px] font-normal leading-[15px] text-white/45">0</span>
            </span>
            <button type="button" disabled={!imageUrl} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-white text-neutral-950 transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50" title="生成" onClick={onGenerate}>
              <DirectorLibTvSendUpIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DirectorLibTvMoveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M1.95142 3.50461C1.66312 2.698 2.44169 1.91954 3.2483 2.20774L11.8635 5.28977C12.7361 5.60204 12.7748 6.82247 11.9241 7.19016L11.7795 7.25266C9.63473 8.17963 7.92343 9.89014 6.99634 12.0349L6.93287 12.1804C6.56517 13.0312 5.34571 12.9925 5.03345 12.1198L1.95142 3.50461ZM2.94166 3.06418C2.85851 3.03482 2.77855 3.11483 2.80787 3.19797L5.89087 11.8142C5.92525 11.9086 6.05749 11.9129 6.09791 11.821L6.16138 11.6745C7.18029 9.31722 9.05998 7.4367 11.4172 6.4177L11.5637 6.35422C11.6563 6.31415 11.6524 6.18167 11.5579 6.14719L2.94166 3.06418Z" fill="currentColor" />
    </svg>
  )
}

function DirectorLibTvCharacterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M12.5 6.75C13.8347 6.75 14.917 7.8323 14.917 9.16699V12.5C14.917 13.3745 14.2075 14.084 13.333 14.084H13.25V18.333C13.25 18.7472 12.9142 19.084 12.5 19.084C12.0858 19.084 11.75 18.7472 11.75 18.333V13.333C11.7502 12.9189 12.0859 12.583 12.5 12.583H13.333C13.379 12.583 13.416 12.546 13.416 12.5V9.16699C13.416 8.66073 13.0063 8.25 12.5 8.25H7.5C6.99374 8.25 6.58398 8.66073 6.58398 9.16699V12.5C6.58398 12.546 6.62097 12.583 6.66699 12.583H7.5C7.9141 12.583 8.24982 12.9189 8.25 13.333V18.333C8.25 18.7472 7.91421 19.084 7.5 19.084C7.08579 19.084 6.75 18.7472 6.75 18.333V14.084H6.66699C5.79254 14.084 5.08301 13.3745 5.08301 12.5V9.16699C5.08301 7.8323 6.16531 6.75 7.5 6.75H12.5ZM10 0.916016C11.3346 0.916016 12.4168 1.99847 12.417 3.33301C12.417 4.6677 11.3347 5.75 10 5.75C8.66531 5.75 7.58301 4.6677 7.58301 3.33301C7.58318 1.99847 8.66542 0.916016 10 0.916016ZM10 2.41699C9.49385 2.41699 9.08416 2.8269 9.08398 3.33301C9.08398 3.83927 9.49374 4.25 10 4.25C10.5063 4.25 10.916 3.83927 10.916 3.33301C10.9158 2.8269 10.5062 2.41699 10 2.41699Z" fill="currentColor" />
    </svg>
  )
}

function DirectorLibTvPanoramaIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 14 14" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M1.48 7.624a.13.13 0 0 1 .198.112.14.14 0 0 1-.045.102c-.299.28-.465.588-.465.912 0 .99 1.543 1.835 3.718 2.174v-.88c0-.192.221-.301.375-.184l1.588 1.222a.35.35 0 0 1-.007.56L5.256 12.8a.233.233 0 0 1-.37-.189v-.565C2.218 11.662.294 10.569.293 9.28c0-.615.438-1.186 1.186-1.656m10.845.112a.13.13 0 0 1 .198-.112c.748.47 1.186 1.041 1.186 1.656 0 1.36-2.14 2.5-5.033 2.824a.2.2 0 0 1-.22-.198v-.716c0-.102.078-.188.18-.2 2.425-.283 4.197-1.179 4.198-2.24 0-.324-.166-.632-.465-.912a.14.14 0 0 1-.044-.102m-1.977-6.355a1.34 1.34 0 0 1 1.254.78q.174.356.174.797v4.294q0 .441-.174.804a1.37 1.37 0 0 1-.496.564 1.35 1.35 0 0 1-.758.21q-.456 0-.779-.21a1.35 1.35 0 0 1-.485-.564 1.9 1.9 0 0 1-.164-.804V2.958q0-.446.169-.803.172-.357.495-.565.323-.21.764-.21M4.622 2.532 3.551 8.75H2.44l1.09-6.229H1.925v-1.06h2.697zm2.073-1.151q.392 0 .665.13.274.128.442.366t.243.575q.08.333.079.744 0 .492-.148 1.062a9 9 0 0 1-.388 1.165q-.238.594-.535 1.175-.298.575-.605 1.09h1.696V8.75H5.238V7.688q.343-.525.664-1.105.323-.58.58-1.166a8 8 0 0 0 .417-1.14q.154-.55.154-1.011 0-.328-.065-.61-.064-.283-.293-.283-.227 0-.292.282a2.7 2.7 0 0 0-.064.61v.506h-1.07v-.505q-.001-.436.073-.784.079-.351.248-.595.169-.247.441-.376.273-.13.664-.13m3.653 1.042a.28.28 0 0 0-.273.168.8.8 0 0 0-.084.367v4.294q0 .213.084.377.084.159.273.16a.29.29 0 0 0 .273-.16.8.8 0 0 0 .084-.377V2.958a.8.8 0 0 0-.084-.377.29.29 0 0 0-.273-.158" />
    </svg>
  )
}

function DirectorLibTvPanoramaSmallIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden="true">
      <path fill="currentColor" d="M1.48 7.624a.13.13 0 0 1 .198.112.14.14 0 0 1-.045.102c-.299.28-.465.588-.465.912 0 .99 1.543 1.835 3.718 2.174v-.88c0-.192.221-.301.375-.184l1.588 1.222a.35.35 0 0 1-.007.56L5.256 12.8a.233.233 0 0 1-.37-.189v-.565C2.218 11.662.294 10.569.293 9.28c0-.615.438-1.186 1.186-1.656m10.845.112a.13.13 0 0 1 .198-.112c.748.47 1.186 1.041 1.186 1.656 0 1.36-2.14 2.5-5.033 2.824a.2.2 0 0 1-.22-.198v-.716c0-.102.078-.188.18-.2 2.425-.283 4.197-1.179 4.198-2.24 0-.324-.166-.632-.465-.912a.14.14 0 0 1-.044-.102m-1.977-6.355a1.34 1.34 0 0 1 1.254.78q.174.356.174.797v4.294q0 .441-.174.804a1.37 1.37 0 0 1-.496.564 1.35 1.35 0 0 1-.758.21q-.456 0-.779-.21a1.35 1.35 0 0 1-.485-.564 1.9 1.9 0 0 1-.164-.804V2.958q0-.446.169-.803.172-.357.495-.565.323-.21.764-.21M4.622 2.532 3.551 8.75H2.44l1.09-6.229H1.925v-1.06h2.697zm2.073-1.151q.392 0 .665.13.274.128.442.366t.243.575q.08.333.079.744 0 .492-.148 1.062a9 9 0 0 1-.388 1.165q-.238.594-.535 1.175-.298.575-.605 1.09h1.696V8.75H5.238V7.688q.343-.525.664-1.105.323-.58.58-1.166a8 8 0 0 0 .417-1.14q.154-.55.154-1.011 0-.328-.065-.61-.064-.283-.293-.283-.227 0-.292.282a2.7 2.7 0 0 0-.064.61v.506h-1.07v-.505q-.001-.436.073-.784.079-.351.248-.595.169-.247.441-.376.273-.13.664-.13m3.653 1.042a.28.28 0 0 0-.273.168.8.8 0 0 0-.084.367v4.294q0 .213.084.377.084.159.273.16a.29.29 0 0 0 .273-.16.8.8 0 0 0 .084-.377V2.958a.8.8 0 0 0-.084-.377.29.29 0 0 0-.273-.158" />
    </svg>
  )
}

function DirectorLibTvUploadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="pointer-events-none shrink-0 text-current" width="12" height="12" viewBox="0 0 19.8008 19.8006">
      <path d="M1.80078 16.9003C1.80087 17.1919 1.91684 17.4714 2.12305 17.6776C2.32932 17.8838 2.60874 17.9999 2.90039 17.9999H16.9004C17.192 17.9999 17.4715 17.8838 17.6777 17.6776C17.8839 17.4714 17.9999 17.1919 18 16.9003V11.9999H19.8008V16.9003C19.8007 17.6693 19.4949 18.4073 18.9512 18.951C18.4073 19.4948 17.6694 19.8006 16.9004 19.8006H2.90039C2.13135 19.8006 1.39345 19.4948 0.849609 18.951C0.305837 18.4073 9.33702e-05 17.6693 0 16.9003V11.9999H1.80078V16.9003ZM9.33203 0.202009C9.68553 -0.086443 10.2076 -0.0660213 10.5371 0.263533L16.1729 5.90025L14.9004 7.17271L10.8008 3.07408V13.8006H9V3.07408L4.90039 7.17271L3.62793 5.90025L9.26367 0.263533L9.33203 0.202009Z" fill="currentColor" />
    </svg>
  )
}

function DirectorLibTvHelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M7 12.25C9.89949 12.25 12.25 9.89949 12.25 7C12.25 4.10051 9.89949 1.75 7 1.75C4.10051 1.75 1.75 4.10051 1.75 7C1.75 9.89949 4.10051 12.25 7 12.25Z" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.54167 5.54167C5.54167 4.73625 6.19458 4.08333 7 4.08333C7.80542 4.08333 8.45833 4.73625 8.45833 5.54167C8.45833 6.0865 8.15908 6.56133 7.71692 6.81217C7.34125 7.02508 7 7.34825 7 7.77933V8.16667M7 9.91667H7.00583" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function DirectorLibTvHistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M7 3.20833V7L9.33333 8.16667M3.04312 4.08333C4.00425 2.62598 5.65672 1.75 7.42875 1.75C10.0675 1.75 12.25 3.9325 12.25 6.57125C12.25 9.21001 10.0675 11.3925 7.42875 11.3925C4.79001 11.3925 2.6075 9.21001 2.6075 6.57125M2.6075 6.57125H1.75M2.6075 6.57125V5.71375" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DirectorLibTvCloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  )
}

function DirectorLibTvXIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

function DirectorLibTvPlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M7 2.333V11.667M2.333 7H11.667" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  )
}

function DirectorLibTvCreditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="pointer-events-none h-[14px] w-[10px] text-white/45" width="1em" height="1em" viewBox="0 0 16 16">
      <g transform="translate(2.2857 0) scale(0.933347)">
        <path d="M6.79577 0.652118C7.72979 -0.427779 8.49498 -0.136386 8.49498 1.30348V7.47438H11.0956C12.2734 7.47448 12.6016 8.21128 11.8192 9.1111L5.44909 16.491C4.51536 17.5703 3.74914 17.2787 3.74889 15.8396V9.66872H1.14928C-0.0287394 9.66872 -0.356821 8.9309 0.425648 8.03102L6.79577 0.652118Z" fill="currentColor" />
      </g>
    </svg>
  )
}

function DirectorLibTvSendUpIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" role="img" className="pointer-events-none size-3 text-neutral-950" width="1em" height="1em" viewBox="0 0 18 18">
      <path d="M8.29289 0.292893C8.68342 -0.0976311 9.31658 -0.0976311 9.70711 0.292893L17.7071 8.29289C18.0976 8.68342 18.0976 9.31658 17.7071 9.70711C17.3166 10.0976 16.6834 10.0976 16.2929 9.70711L10 3.41421V17C10 17.5523 9.55229 18 9 18C8.44772 18 8 17.5523 8 17V3.41421L1.70711 9.70711C1.31658 10.0976 0.683418 10.0976 0.292893 9.70711C-0.0976311 9.31658 -0.0976311 8.68342 0.292893 8.29289L8.29289 0.292893Z" fill="currentColor" />
    </svg>
  )
}

function DirectorLibTvVideoCameraIcon({ size = 20 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M11.9854 3.33691C13.4159 3.40991 14.5537 4.59327 14.5537 6.04199V6.18848L16.6748 4.32617C17.4574 3.63878 18.6722 4.15543 18.7471 5.16602L18.75 5.26562V14.7412C18.75 15.8162 17.4825 16.3899 16.6748 15.6807L14.5537 13.8174V13.958L14.5498 14.0967C14.4794 15.481 13.3696 16.5915 11.9854 16.6621L11.8457 16.666H3.95801L3.81934 16.6621C2.43458 16.592 1.32339 15.4813 1.25293 14.0967L1.25 13.958V6.04199C1.25 4.59289 2.38824 3.40935 3.81934 3.33691L3.95801 3.33301H11.8457L11.9854 3.33691ZM3.95801 4.83301C3.29081 4.83318 2.75 5.37476 2.75 6.04199V13.958C2.75067 14.6247 3.29122 15.1649 3.95801 15.165H11.8457C12.5124 15.1647 13.053 14.6246 13.0537 13.958V6.04199C13.0537 5.37485 12.5128 4.83334 11.8457 4.83301H3.95801ZM14.5586 8.18164V11.8242L17.25 14.1895V5.81738L14.5586 8.18164Z" fill="currentColor" />
    </svg>
  )
}

function DirectorLibTvAspectIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M16.8369 1.67676C17.6773 1.76205 18.3328 2.47115 18.333 3.33398V16.668L18.3242 16.8379C18.2446 17.6224 17.6214 18.2456 16.8369 18.3252L16.667 18.334H3.33301C2.47017 18.3338 1.76107 17.6783 1.67578 16.8379L1.66699 16.668V3.33398C1.66717 2.41377 2.41279 1.66814 3.33301 1.66797H16.667L16.8369 1.67676ZM3.33301 3.16699C3.24122 3.16717 3.16619 3.24219 3.16602 3.33398V16.668C3.16619 16.7598 3.24122 16.8338 3.33301 16.834H16.667C16.7588 16.8338 16.8328 16.7598 16.833 16.668V3.33398C16.8328 3.2422 16.7588 3.16717 16.667 3.16699H3.33301ZM5 10.9473C5.39764 10.9473 5.71973 11.2703 5.71973 11.668V14.2803H8.33301C8.73065 14.2803 9.05371 14.6033 9.05371 15.001C9.05371 15.3986 8.73065 15.7207 8.33301 15.7207H5C4.60236 15.7207 4.2793 15.3986 4.2793 15.001V11.668C4.2793 11.2703 4.60235 10.9473 5 10.9473ZM15 4.28027C15.3976 4.28027 15.7197 4.60333 15.7197 5.00098V8.33398C15.7197 8.73163 15.3976 9.05469 15 9.05469C14.6024 9.05469 14.2793 8.73163 14.2793 8.33398V5.7207H11.667C11.2693 5.7207 10.9463 5.39862 10.9463 5.00098C10.9463 4.60333 11.2693 4.28027 11.667 4.28027H15Z" fill="currentColor" />
    </svg>
  )
}

function DirectorLibTvCameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M12.5459 1.25293C13.0632 1.28537 13.5384 1.55764 13.8281 1.99219L15 3.75H17.25C18.3084 3.75009 19.1669 4.60858 19.167 5.66699V16.417L19.1572 16.6133C19.0654 17.5149 18.348 18.2315 17.4463 18.3232L17.25 18.333H2.75C1.75789 18.3329 0.941194 17.5794 0.842773 16.6133L0.833008 16.417V5.66699C0.833096 4.60858 1.69158 3.75009 2.75 3.75H5L6.17188 1.99219C6.48098 1.52854 7.00136 1.25002 7.55859 1.25H12.4414L12.5459 1.25293ZM7.55859 2.75C7.50303 2.75002 7.45085 2.77808 7.41992 2.82422L6.09961 4.80469C5.91418 5.08274 5.60178 5.24992 5.26758 5.25H2.75C2.52001 5.25009 2.3331 5.437 2.33301 5.66699V16.417C2.33318 16.6469 2.52006 16.8339 2.75 16.834H17.25C17.4799 16.8339 17.6668 16.6469 17.667 16.417V5.66699C17.6669 5.437 17.48 5.25009 17.25 5.25H14.7324C14.3982 5.24992 14.0858 5.08274 13.9004 4.80469L12.5801 2.82422C12.5491 2.77808 12.497 2.75002 12.4414 2.75H7.55859ZM10 6.66699C12.3011 6.66699 14.1668 8.53197 14.167 10.833C14.167 13.1342 12.3012 15 10 15C7.69881 15 5.83301 13.1342 5.83301 10.833C5.83318 8.53197 7.69892 6.66699 10 6.66699ZM10 8.16699C8.52735 8.16699 7.33318 9.3604 7.33301 10.833C7.33301 12.3058 8.52724 13.5 10 13.5C11.4728 13.5 12.667 12.3058 12.667 10.833C12.6668 9.3604 11.4727 8.16699 10 8.16699Z" fill="currentColor" />
    </svg>
  )
}

function LockClosedIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function LockOpenIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 7.4-2.1" />
    </svg>
  )
}

function DirectorTransformModeMenu({
  value,
  onSelect,
}: {
  value: "translate" | "rotate" | "scale"
  onSelect: (value: "translate" | "rotate" | "scale") => void
}) {
  const items: Array<{ value: "translate" | "rotate" | "scale"; label: string; shortcut: string; icon: React.ReactNode }> = [
    { value: "translate", label: "移动元素", shortcut: "V", icon: <MousePointer2 className="size-3.5" /> },
    { value: "rotate", label: "旋转元素", shortcut: "R", icon: <RefreshCw className="size-3.5" /> },
    { value: "scale", label: "缩放元素", shortcut: "S", icon: <Fullscreen className="size-3.5" /> },
  ]
  return (
    <div className="nodrag nopan nowheel absolute left-[calc(100%+10px)] top-0 z-[1700] flex w-[160px] flex-col gap-1 rounded-lg border border-white/12 bg-[rgba(25,30,29,0.97)] p-1 shadow-[0_14px_32px_rgba(0,0,0,0.38)] backdrop-blur-xl">
      {items.map((item) => (
        <button key={item.value} type="button" className={`group flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] leading-none transition-colors hover:bg-white/8 hover:text-white ${value === item.value ? "bg-white/10 text-white" : "text-white/70"}`} onClick={() => onSelect(item.value)}>
          <span className="flex size-5 shrink-0 items-center justify-center text-white/72 group-hover:text-white">{item.icon}</span>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="text-[11px] text-white/40">{item.shortcut}</span>
        </button>
      ))}
    </div>
  )
}

type DirectorConsolePresetView = "right" | "top" | "front" | "left" | "bottom" | "back"

const DIRECTOR_ORIENTATION_AXES: Array<{
  dir: [number, number, number]
  color: string
  view: DirectorConsolePresetView
  positive: boolean
}> = [
  { dir: [1, 0, 0], color: "#fd5b5d", view: "right", positive: true },
  { dir: [0, 1, 0], color: "#38e2b3", view: "top", positive: true },
  { dir: [0, 0, 1], color: "#4d79ff", view: "front", positive: true },
  { dir: [-1, 0, 0], color: "#888888", view: "left", positive: false },
  { dir: [0, -1, 0], color: "#888888", view: "bottom", positive: false },
  { dir: [0, 0, -1], color: "#888888", view: "back", positive: false },
]

const directorOrientationForward = new THREE.Vector3()
const directorOrientationRight = new THREE.Vector3()
const directorOrientationUp = new THREE.Vector3()
const directorOrientationAxis = new THREE.Vector3()
const directorOrientationWorldUp = new THREE.Vector3(0, 1, 0)
const directorOrientationWorldRight = new THREE.Vector3(1, 0, 0)

function getDirectorOrientationPoints(
  pose: { position: LibTvDirectorConsole3DVector3; target: LibTvDirectorConsole3DVector3 } | null,
  previousRight: THREE.Vector3,
) {
  if (pose) {
    directorOrientationForward
      .set(pose.position.x - pose.target.x, pose.position.y - pose.target.y, pose.position.z - pose.target.z)
      .normalize()
  } else {
    directorOrientationForward.set(0, 0, 1)
  }
  if (directorOrientationForward.lengthSq() < 1e-8) directorOrientationForward.set(0, 0, 1)
  directorOrientationRight.crossVectors(directorOrientationWorldUp, directorOrientationForward)
  if (directorOrientationRight.lengthSq() < 1e-8) {
    directorOrientationRight.copy(previousRight.lengthSq() > 1e-8 ? previousRight : directorOrientationWorldRight)
  } else {
    directorOrientationRight.normalize()
    if (previousRight.lengthSq() > 1e-8 && directorOrientationRight.dot(previousRight) < 0) directorOrientationRight.negate()
  }
  previousRight.copy(directorOrientationRight)
  directorOrientationUp.crossVectors(directorOrientationForward, directorOrientationRight).normalize()
  return DIRECTOR_ORIENTATION_AXES.map((axis) => {
    directorOrientationAxis.set(...axis.dir)
    const x = directorOrientationAxis.dot(directorOrientationRight)
    const y = directorOrientationAxis.dot(directorOrientationUp)
    const z = directorOrientationAxis.dot(directorOrientationForward)
    return {
      ...axis,
      sx: 36 + 28 * x,
      sy: 36 - 28 * y,
      lx: 36 + 28 * x * 0.8,
      ly: 36 - 28 * y * 0.8,
      z,
    }
  })
}

function DirectorConsoleOrientationWidget({
  getPose,
  onSelect,
  onReset,
}: {
  getPose: () => { position: LibTvDirectorConsole3DVector3; target: LibTvDirectorConsole3DVector3 } | null
  onSelect: (view: DirectorConsolePresetView) => void
  onReset: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const previousRightRef = useRef(new THREE.Vector3(1, 0, 0))

  useEffect(() => {
    let frame = 0
    let disposed = false
    const schedule = () => {
      if (!disposed && document.visibilityState !== "hidden" && frame === 0) frame = window.requestAnimationFrame(render)
    }
    const render = () => {
      frame = 0
      if (disposed || document.visibilityState === "hidden") return
      const canvas = canvasRef.current
      const context = canvas?.getContext("2d")
      if (!canvas || !context) { schedule(); return }
      const ratio = window.devicePixelRatio || 1
      const size = Math.round(72 * ratio)
      if (canvas.width !== size) {
        canvas.width = size
        canvas.height = size
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, 72, 72)
      context.beginPath()
      context.arc(36, 36, 35, 0, Math.PI * 2)
      context.fillStyle = "rgba(22, 24, 34, 0.92)"
      context.fill()
      const points = getDirectorOrientationPoints(getPose(), previousRightRef.current).sort((a, b) => a.z - b.z)
      for (const point of points) {
        context.globalAlpha = point.positive ? 1 : 0.3
        context.beginPath()
        context.moveTo(36, 36)
        context.lineTo(point.lx, point.ly)
        context.strokeStyle = point.color
        context.lineWidth = 0.8
        context.stroke()
        context.globalAlpha = point.positive ? 1 : point.z > 0 ? 0.8 : 0.4
        context.beginPath()
        context.arc(point.sx, point.sy, 4.5, 0, Math.PI * 2)
        context.fillStyle = point.color
        context.fill()
      }
      context.globalAlpha = 1
      schedule()
    }
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (frame) window.cancelAnimationFrame(frame)
        frame = 0
      } else schedule()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    schedule()
    return () => {
      disposed = true
      document.removeEventListener("visibilitychange", handleVisibility)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [getPose])

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (72 / rect.width)
    const y = (event.clientY - rect.top) * (72 / rect.height)
    const points = getDirectorOrientationPoints(getPose(), previousRightRef.current).sort((a, b) => b.z - a.z)
    let closest: (typeof points)[number] | null = null
    let distance = Infinity
    for (const point of points) {
      const nextDistance = Math.hypot(x - point.sx, y - point.sy)
      if (nextDistance < distance) {
        distance = nextDistance
        closest = point
      }
    }
    if (closest && distance < 10.5) onSelect(closest.view)
  }, [getPose, onSelect])

  return (
    <div className="absolute right-4 top-4 z-20">
      <canvas
        ref={canvasRef}
        width={72}
        height={72}
        className="block cursor-pointer rounded-full"
        style={{ width: 72, height: 72, filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.5))" }}
        onClick={handleCanvasClick}
      />
      <button type="button" className="mt-1.5 w-full rounded-md bg-white/10 py-0.5 text-[11px] text-white/60 transition-colors hover:bg-white/15 hover:text-white/85" onClick={onReset}>重置视角</button>
    </div>
  )
}

function DirectorCompositionFrameOverlay({ aspectRatio, enabled }: { aspectRatio: string; enabled: boolean }) {
  const frameHostRef = useRef<HTMLDivElement | null>(null)
  const [frame, setFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [guidesVisible, setGuidesVisible] = useState(false)
  const isAuto = String(aspectRatio || "").trim().toLowerCase() === "auto"

  useEffect(() => {
    const host = frameHostRef.current
    if (!host || !enabled || isAuto) {
      setFrame(null)
      return
    }
    const updateFrame = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      const viewportRatio = width / height
      const ratio = parseDirectorAspectRatio(aspectRatio, viewportRatio).ratio
      const maxWidth = width * 0.88
      const maxHeight = height * 0.78
      let frameWidth = maxWidth
      let frameHeight = frameWidth / ratio
      if (frameHeight > maxHeight) {
        frameHeight = maxHeight
        frameWidth = frameHeight * ratio
      }
      setFrame({
        left: Math.round((width - frameWidth) / 2),
        top: Math.round((height - frameHeight) / 2),
        width: Math.round(frameWidth),
        height: Math.round(frameHeight),
      })
    }
    updateFrame()
    const observer = new ResizeObserver(updateFrame)
    observer.observe(host)
    return () => observer.disconnect()
  }, [aspectRatio, enabled, isAuto])

  if (!enabled || isAuto) return null

  return (
    <div ref={frameHostRef} className="pointer-events-none absolute inset-0 z-10">
      {frame ? (
        <>
          <div className="absolute inset-x-0 top-0 bg-black/20 backdrop-blur-md" style={{ height: frame.top }} />
          <div className="absolute inset-x-0 bottom-0 bg-black/20 backdrop-blur-md" style={{ top: frame.top + frame.height }} />
          <div className="absolute bg-black/20 backdrop-blur-md" style={{ left: 0, top: frame.top, width: frame.left, height: frame.height }} />
          <div className="absolute bg-black/20 backdrop-blur-md" style={{ left: frame.left + frame.width, right: 0, top: frame.top, height: frame.height }} />
          <div
            className="absolute rounded-xl outline outline-1 -outline-offset-1 outline-white/18"
            style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}
          />
          {guidesVisible ? (
            <div
              className="absolute rounded-xl"
              style={{
                left: frame.left,
                top: frame.top,
                width: frame.width,
                height: frame.height,
                backgroundImage: [
                  "linear-gradient(to right, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.22) calc(33.333% - 0.5px), rgba(255,255,255,0.22) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px))",
                  "linear-gradient(to right, transparent calc(66.666% - 0.5px), rgba(255,255,255,0.22) calc(66.666% - 0.5px), rgba(255,255,255,0.22) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px))",
                  "linear-gradient(to bottom, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.22) calc(33.333% - 0.5px), rgba(255,255,255,0.22) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px))",
                  "linear-gradient(to bottom, transparent calc(66.666% - 0.5px), rgba(255,255,255,0.22) calc(66.666% - 0.5px), rgba(255,255,255,0.22) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px))",
                ].join(","),
              }}
            />
          ) : null}
          <button
            type="button"
            title="构图参考线"
            className={`nodrag nopan nowheel pointer-events-auto absolute z-20 flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${guidesVisible ? "bg-white/10 text-white/80" : "text-white/50 hover:bg-white/10 hover:text-white/80"}`}
            style={{ left: Math.max(8, frame.left + frame.width - 40), top: frame.top + 8 }}
            onClick={() => setGuidesVisible((visible) => !visible)}
          >
            <DirectorCompositionGuideIcon />
          </button>
        </>
      ) : null}
    </div>
  )
}

function DirectorAspectButton({
  open,
  value,
  onOpenChange,
  onChange,
}: {
  open: boolean
  value: string
  onOpenChange: (open: boolean) => void
  onChange: (value: string) => void
}) {
  const options = ["Auto", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]
  const normalizedValue = String(value || "16:9")
  return (
    <DirectorToolButton
      label="画幅"
      tooltip={`选择画幅比例 (${normalizedValue})`}
      active={open}
      ariaHaspopup="menu"
      ariaExpanded={open}
      icon={<DirectorLibTvAspectIcon />}
      menu={open ? (
        <div className="nodrag nopan nowheel absolute left-[calc(100%+10px)] top-1/2 z-[1700] flex w-[280px] -translate-y-1/2 flex-col gap-2 rounded-lg border border-white/12 bg-[rgba(25,30,29,0.97)] p-3 shadow-[0_14px_32px_rgba(0,0,0,0.38)] backdrop-blur-xl">
          <div className="text-[12px] leading-none text-white/45">比例</div>
          <div className="grid grid-cols-4 gap-2">
            {options.map((option) => {
              const selected = normalizedValue === option || (option === "Auto" && normalizedValue.toLowerCase() === "auto")
              return (
                <button
                  key={option}
                  type="button"
                  className={`flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-white/20 px-1 py-3 text-[12px] leading-none transition-colors hover:bg-white/8 ${selected ? "bg-white/10 text-white" : "bg-transparent text-white/55"}`}
                  onClick={() => {
                    onChange(option)
                    onOpenChange(false)
                  }}
                >
                  <DirectorAspectOptionIcon value={option} />
                  <span>{option}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      onClick={() => onOpenChange(!open)}
    />
  )
}

function DirectorAspectOptionIcon({ value }: { value: string }) {
  if (value === "Auto") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0 text-current">
        <path d="M16.8369 1.67676C17.6773 1.76205 18.3328 2.47115 18.333 3.33398V16.668L18.3242 16.8379C18.2446 17.6224 17.6214 18.2456 16.8369 18.3252L16.667 18.334H3.33301C2.47017 18.3338 1.76107 17.6783 1.67578 16.8379L1.66699 16.668V3.33398C1.66717 2.41377 2.41279 1.66814 3.33301 1.66797H16.667L16.8369 1.67676ZM3.33301 3.16699C3.24122 3.16717 3.16619 3.24219 3.16602 3.33398V16.668C3.16619 16.7598 3.24122 16.8338 3.33301 16.834H16.667C16.7588 16.8338 16.8328 16.7598 16.833 16.668V3.33398C16.8328 3.2422 16.7588 3.16717 16.667 3.16699H3.33301ZM5 10.9473C5.39764 10.9473 5.71973 11.2703 5.71973 11.668V14.2803H8.33301C8.73065 14.2803 9.05371 14.6033 9.05371 15.001C9.05371 15.3986 8.73065 15.7207 8.33301 15.7207H5C4.60236 15.7207 4.2793 15.3986 4.2793 15.001V11.668C4.2793 11.2703 4.60235 10.9473 5 10.9473ZM15 4.28027C15.3976 4.28027 15.7197 4.60333 15.7197 5.00098V8.33398C15.7197 8.73163 15.3976 9.05469 15 9.05469C14.6024 9.05469 14.2793 8.73163 14.2793 8.33398V5.7207H11.667C11.2693 5.7207 10.9463 5.39862 10.9463 5.00098C10.9463 4.60333 11.2693 4.28027 11.667 4.28027H15Z" fill="currentColor" />
      </svg>
    )
  }
  const { ratio } = parseDirectorAspectRatio(value)
  const max = 20
  let width = max
  let height = Math.round(max / ratio)
  if (height > max) {
    height = max
    width = Math.round(max * ratio)
  }
  return (
    <span className="flex size-5 items-center justify-center">
      <span className="rounded-[1px] border border-white/55" style={{ width, height }} />
    </span>
  )
}

function DirectorCompositionGuideIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path fill="currentColor" d="M12.266 1.4a.6.6 0 0 1 .6.6v1.134h1.133a.6.6 0 1 1 0 1.199h-1.134v3.066H14a.601.601 0 0 1 0 1.202h-1.134v3.066H14a.6.6 0 1 1 0 1.2h-1.134V14a.6.6 0 1 1-1.199 0v-1.134H8.6V14a.601.601 0 0 1-1.202 0v-1.134H4.332V14a.6.6 0 1 1-1.2 0v-1.134H2a.6.6 0 1 1 0-1.199h1.134V8.601H1.999a.601.601 0 0 1 0-1.202h1.134V4.333H1.999a.6.6 0 1 1 0-1.2h1.134V2a.6.6 0 1 1 1.199 0v1.134h3.066V2A.601.601 0 0 1 8.6 2v1.134h3.066V2a.6.6 0 0 1 .6-.6M4.332 11.666h3.066V8.601H4.332zm4.268 0h3.066V8.601H8.6zM4.332 7.399h3.066V4.333H4.332zm4.268 0h3.066V4.333H8.6z" />
    </svg>
  )
}

function DirectorAddObjectMenu({
  onUpload,
  onAddCharacter,
  onAddCrowd,
  onAddPrimitive,
}: {
  onUpload: () => void
  onAddCharacter: (bodyType: string, name: string) => void
  onAddCrowd: (rows: number, cols: number, spacing: number) => void
  onAddPrimitive: (primitive: LibTvDirectorConsole3DPrimitive, label: string) => void
}) {
  const [submenu, setSubmenu] = useState<"crowd" | "geometry" | null>(null)
  const [crowdRows, setCrowdRows] = useState("3")
  const [crowdCols, setCrowdCols] = useState("3")
  const [crowdSpacing, setCrowdSpacing] = useState("1.2")
  const primitiveOptions: Array<[LibTvDirectorConsole3DPrimitive, string]> = [["box", "立方体"], ["sphere", "球体"], ["cylinder", "圆柱体"], ["torus", "环状体"], ["cone", "圆锥"], ["pyramid", "棱锥"]]
  const rows = Math.max(1, Math.min(12, Number.parseInt(crowdRows, 10) || 3))
  const cols = Math.max(1, Math.min(12, Number.parseInt(crowdCols, 10) || 3))
  const spacing = clampWorkflowNumber(Number.parseFloat(crowdSpacing) || 1.2, 0.2, 4)
  return (
    <div className="absolute left-[calc(100%+10px)] top-0 z-[1700] flex w-[160px] flex-col gap-1 rounded-lg border border-white/12 bg-[rgba(25,30,29,0.97)] p-1 shadow-[0_14px_32px_rgba(0,0,0,0.38)] backdrop-blur-xl">
      <DirectorAddMenuItem icon={<Upload className="size-3.5" />} label="本地上传" onClick={onUpload} />
      <div className="my-0.5 h-px w-full bg-white/8" />
      {DIRECTOR_CHARACTER_BODY_OPTIONS.map((option) => <DirectorAddMenuItem key={option.id} icon={<User className="size-3.5" />} label={option.menuLabel} onClick={() => onAddCharacter(option.id, option.label)} />)}
      <div className="relative">
        {submenu === "crowd" ? (
          <DirectorCrowdArrayPanel
            rows={crowdRows}
            cols={crowdCols}
            spacing={crowdSpacing}
            resolvedRows={rows}
            resolvedCols={cols}
            onRowsChange={setCrowdRows}
            onColsChange={setCrowdCols}
            onSpacingChange={setCrowdSpacing}
            onCancel={() => setSubmenu(null)}
            onAdd={() => onAddCrowd(rows, cols, spacing)}
          />
        ) : null}
        <DirectorAddMenuItem icon={<Grid2X2 className="size-3.5" />} label="群众 (3x3)" hasSubmenu active={submenu === "crowd"} onPointerEnter={() => setSubmenu("crowd")} onClick={() => setSubmenu("crowd")} />
      </div>
      <div className="my-0.5 h-px w-full bg-white/8" />
      <div className="relative">
        {submenu === "geometry" ? (
	          <div className="nodrag nopan nowheel absolute bottom-0 left-[calc(100%+8px)] z-[1700] flex w-[148px] flex-col gap-1 rounded-xl border border-white/12 bg-[rgba(31,31,31,0.72)] p-1 shadow-[0_4px_10px_rgba(0,0,0,0.35),0_2px_4px_rgba(0,0,0,0.24)] backdrop-blur-lg">
            {primitiveOptions.map(([primitive, label]) => <DirectorAddMenuItem key={primitive} icon={<DirectorPrimitiveMenuIcon primitive={primitive} />} label={label} onClick={() => onAddPrimitive(primitive, label)} />)}
          </div>
        ) : null}
        <DirectorAddMenuItem icon={<Box className="size-3.5" />} label="几何模型" hasSubmenu active={submenu === "geometry"} onPointerEnter={() => setSubmenu("geometry")} onClick={() => setSubmenu("geometry")} />
      </div>
    </div>
  )
}

function DirectorCrowdArrayPanel({
  rows,
  cols,
  spacing,
  resolvedRows,
  resolvedCols,
  onRowsChange,
  onColsChange,
  onSpacingChange,
  onCancel,
  onAdd,
}: {
  rows: string
  cols: string
  spacing: string
  resolvedRows: number
  resolvedCols: number
  onRowsChange: (value: string) => void
  onColsChange: (value: string) => void
  onSpacingChange: (value: string) => void
  onCancel: () => void
  onAdd: () => void
}) {
  const total = resolvedRows * resolvedCols
  return (
	    <div className="nodrag nopan nowheel absolute bottom-0 left-[calc(100%+8px)] z-[1700] flex w-[240px] flex-col gap-3 overflow-hidden rounded-xl border border-white/12 bg-[rgba(31,31,31,0.72)] p-4 shadow-[0_4px_10px_rgba(0,0,0,0.35),0_2px_4px_rgba(0,0,0,0.24)] backdrop-blur-lg">
      <div className="flex h-5 w-full items-center justify-between text-[14px] leading-none text-white/45">
        <span>添加群众阵列</span>
        <span className="text-[12px]">共{total}人</span>
      </div>
      <div className="flex w-full flex-col gap-2">
        <div className="flex w-full items-center">
          <DirectorCrowdNumberInput label="行数" min="1" step="1" inputMode="numeric" value={rows} onChange={onRowsChange} />
          <span className="flex size-7 shrink-0 items-center justify-center text-white/55">
            <DirectorLibTvXIcon />
          </span>
          <DirectorCrowdNumberInput label="列数" min="1" step="1" inputMode="numeric" value={cols} onChange={onColsChange} />
        </div>
        <DirectorCrowdNumberInput label="间距" min="0.1" step="0.1" inputMode="decimal" value={spacing} onChange={onSpacingChange} />
      </div>
      <div className="flex w-full gap-2">
        <button type="button" className="flex h-7 min-w-0 flex-1 items-center justify-center rounded-lg bg-white/10 px-3 text-[13px] text-white/80 transition-colors hover:bg-white/15" onClick={onCancel}>取消</button>
        <button type="button" className="flex h-7 min-w-0 flex-1 items-center justify-center rounded-lg bg-white px-3 text-[13px] text-[#262626] transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50" disabled={total <= 0} onClick={onAdd}>添加</button>
      </div>
    </div>
  )
}

function DirectorCrowdNumberInput({
  label,
  value,
  min,
  step,
  inputMode,
  onChange,
}: {
  label: string
  value: string
  min: string
  step: string
  inputMode: "numeric" | "decimal"
  onChange: (value: string) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="w-7 shrink-0 whitespace-nowrap text-[13px] leading-7 text-white/55">{label}</span>
      <input
        min={min}
        step={step}
        inputMode={inputMode}
        className="h-7 w-[54px] rounded-lg border-0 bg-white/10 px-2 text-center text-[14px] text-white/80 outline-none transition-colors placeholder:text-white/25 focus:bg-white/15"
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function DirectorAddMenuItem({
  icon,
  label,
  hasSubmenu,
  active,
  onPointerEnter,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  hasSubmenu?: boolean
  active?: boolean
  onPointerEnter?: () => void
  onClick: () => void
}) {
  return (
    <button type="button" className={`group flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] leading-none transition-colors hover:bg-white/8 hover:text-white focus-visible:bg-white/8 focus-visible:text-white ${active ? "bg-white/8 text-white" : "text-white/70"}`} onPointerEnter={onPointerEnter} onClick={onClick}>
      <span className="flex size-5 shrink-0 items-center justify-center text-white/72 group-hover:text-white">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hasSubmenu ? <span className="text-white/55">›</span> : null}
    </button>
  )
}

function DirectorPrimitiveMenuIcon({ primitive }: { primitive: LibTvDirectorConsole3DPrimitive }) {
  if (primitive === "sphere") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
        <path d="M7 0.640625C10.1381 0.640625 12.7439 2.91408 13.2637 5.90332C13.3256 6.25965 13.3584 6.62574 13.3584 6.99902C13.3584 10.1869 11.0127 12.8258 7.95312 13.2861C7.64196 13.3329 7.3236 13.3574 7 13.3574C3.48839 13.3574 0.641602 10.5106 0.641602 6.99902C0.641602 6.45077 0.710832 5.91783 0.841797 5.40918C1.54785 2.66725 4.03681 0.640638 7 0.640625ZM1.69434 7.09375C1.74192 9.80067 3.81389 12.0137 6.46191 12.2803C5.40928 11.2777 4.71621 10.1554 4.35742 8.96875C3.29278 8.59162 2.3809 7.93986 1.69434 7.09375ZM12.3066 7.0625C10.0387 8.87343 7.74346 9.52314 5.74805 9.29004C5.69244 9.28354 5.63709 9.27544 5.58203 9.26758C6.03133 10.3193 6.81874 11.3202 8.00586 12.2119C10.4361 11.7459 12.2765 9.62152 12.3066 7.0625ZM7.24414 1.69629C5.80229 3.46952 5.0535 5.38676 5.11816 7.19043C5.12949 7.50613 5.16584 7.8208 5.22852 8.13281C5.43638 8.18286 5.65084 8.22144 5.87012 8.24707C7.67179 8.45748 9.89825 7.82219 12.1729 5.80469C11.6487 3.52495 9.65588 1.80559 7.24414 1.69629ZM5.83691 1.81934C3.95517 2.24013 2.44964 3.65964 1.9082 5.49316C2.38087 6.4539 3.1438 7.23224 4.10547 7.7207C4.08803 7.55754 4.07525 7.39316 4.06934 7.22852C4.0035 5.39229 4.65233 3.52861 5.83691 1.81934Z" fill="currentColor" />
      </svg>
    )
  }
  if (primitive === "cylinder") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
        <path d="M7 0.640625C8.49022 0.640625 9.86128 0.840892 10.8779 1.17969C11.3834 1.34819 11.8307 1.56114 12.1621 1.82227C12.4876 2.07879 12.7754 2.44461 12.7754 2.91602V11.082C12.7754 11.5384 12.5027 11.9011 12.1797 12.1611C11.8517 12.425 11.4025 12.6435 10.8779 12.8184C9.82513 13.1692 8.43057 13.3574 7 13.3574C5.56943 13.3574 4.17487 13.1692 3.12207 12.8184C2.59748 12.6435 2.1483 12.425 1.82031 12.1611C1.49728 11.9011 1.22461 11.5384 1.22461 11.082V2.91602C1.22461 2.44461 1.51241 2.07879 1.83789 1.82227C2.16929 1.56114 2.61656 1.34819 3.12207 1.17969C4.13872 0.840892 5.50978 0.640625 7 0.640625ZM11.7246 4.29297C11.4729 4.42936 11.1861 4.54864 10.8779 4.65137C9.86127 4.99018 8.49027 5.19141 7 5.19141C5.50973 5.19141 4.13873 4.99018 3.12207 4.65137C2.81389 4.54864 2.52713 4.42936 2.27539 4.29297V11.082C2.27539 11.0897 2.27897 11.1832 2.47852 11.3438C2.67323 11.5004 2.99438 11.669 3.4541 11.8223C4.37034 12.1276 5.64628 12.3076 7 12.3076C8.35372 12.3076 9.62966 12.1276 10.5459 11.8223C11.0056 11.669 11.3268 11.5004 11.5215 11.3438C11.721 11.1832 11.7246 11.0897 11.7246 11.082V4.29297ZM7 1.69141C5.59109 1.69141 4.33752 1.88232 3.4541 2.17676C3.00974 2.32488 2.68722 2.48897 2.4873 2.64648C2.28157 2.80865 2.27539 2.9042 2.27539 2.91602C2.27552 2.92915 2.28351 3.02389 2.4873 3.18457C2.68722 3.34209 3.00974 3.50715 3.4541 3.65527C4.33751 3.94967 5.5912 4.14062 7 4.14062C8.4088 4.14062 9.66249 3.94967 10.5459 3.65527C10.9903 3.50715 11.3128 3.34209 11.5127 3.18457C11.7165 3.02389 11.7245 2.92915 11.7246 2.91602C11.7246 2.9042 11.7184 2.80865 11.5127 2.64648C11.3128 2.48897 10.9903 2.32488 10.5459 2.17676C9.66248 1.88232 8.40891 1.69141 7 1.69141Z" fill="currentColor" />
      </svg>
    )
  }
  if (primitive === "torus") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
        <path d="M7 0.640625C10.5116 0.640625 13.3584 3.48741 13.3584 6.99902C13.3584 10.5106 10.5116 13.3574 7 13.3574C3.48839 13.3574 0.641602 10.5106 0.641602 6.99902C0.641602 3.48741 3.48839 0.640625 7 0.640625ZM7 1.69141C4.06829 1.69141 1.69238 4.06731 1.69238 6.99902C1.69238 9.93074 4.06829 12.3076 7 12.3076C9.93171 12.3076 12.3086 9.93074 12.3086 6.99902C12.3086 4.06731 9.93171 1.69141 7 1.69141ZM7 2.97363C9.22295 2.97363 11.0254 4.77608 11.0254 6.99902C11.0254 9.22197 9.22295 11.0244 7 11.0244C4.77705 11.0244 2.97461 9.22197 2.97461 6.99902C2.97461 4.77608 4.77705 2.97363 7 2.97363ZM7 4.02441C5.35695 4.02441 4.02539 5.35598 4.02539 6.99902C4.02539 8.64207 5.35695 9.97363 7 9.97363C8.64305 9.97363 9.97461 8.64207 9.97461 6.99902C9.97461 5.35598 8.64305 4.02441 7 4.02441Z" fill="currentColor" />
      </svg>
    )
  }
  if (primitive === "cone") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
        <path d="M6.99835 0.640625C7.20656 0.640625 7.41082 0.69997 7.58722 0.810547C7.76142 0.919811 7.90167 1.07541 7.99249 1.25977L12.6292 10.5244C12.6451 10.5539 12.6596 10.5844 12.6732 10.6152C12.6763 10.6226 12.6801 10.6302 12.6829 10.6377C12.7397 10.7735 12.7737 10.9215 12.7737 11.082C12.7737 11.5535 12.486 11.9192 12.1605 12.1758C11.8291 12.437 11.3818 12.6498 10.8763 12.8184C9.85963 13.1572 8.48855 13.3584 6.99835 13.3584C5.50809 13.3584 4.13707 13.1573 3.12042 12.8184C2.61487 12.6498 2.16765 12.437 1.83624 12.1758C1.51075 11.9192 1.22296 11.5534 1.22296 11.082C1.22299 10.9214 1.25794 10.7736 1.31476 10.6377C1.31756 10.6302 1.32135 10.6227 1.32452 10.6152C1.3381 10.5845 1.35165 10.5539 1.36749 10.5244L6.00421 1.25977C6.09507 1.07529 6.23614 0.919842 6.41046 0.810547C6.58675 0.700114 6.79032 0.640658 6.99835 0.640625ZM6.99835 9.85645C5.58946 9.85646 4.33584 10.0482 3.45245 10.3428C3.00816 10.4909 2.68656 10.6559 2.48663 10.8135C2.28204 10.9748 2.27383 11.0692 2.27374 11.082C2.27374 11.094 2.28087 11.1893 2.48663 11.3516C2.68658 11.509 3.00839 11.6742 3.45245 11.8223C4.33583 12.1168 5.58954 12.3076 6.99835 12.3076C8.4071 12.3076 9.66086 12.1167 10.5443 11.8223C10.9887 11.6741 11.3111 11.5091 11.511 11.3516C11.7168 11.1893 11.723 11.094 11.723 11.082C11.7229 11.0692 11.7154 10.9746 11.511 10.8135C11.3111 10.6559 10.9887 10.491 10.5443 10.3428C9.66085 10.0483 8.40718 9.85645 6.99835 9.85645ZM6.96808 1.7002C6.95886 1.70597 6.95042 1.71382 6.94562 1.72363L6.94366 1.73047L3.13312 9.3418C4.14845 9.00547 5.51438 8.80665 6.99835 8.80664C8.48234 8.80664 9.84823 9.00547 10.8636 9.3418L7.05402 1.73047L7.05109 1.72363C7.04636 1.714 7.0386 1.70594 7.0296 1.7002C7.02037 1.69446 7.0092 1.69141 6.99835 1.69141C6.98759 1.69144 6.97725 1.69451 6.96808 1.7002Z" fill="currentColor" />
      </svg>
    )
  }
  if (primitive === "pyramid") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
        <path d="M7.07507 0.646484C7.22722 0.656899 7.37685 0.696848 7.51257 0.767578C7.67068 0.850091 7.80697 0.969969 7.90905 1.11621L7.91003 1.11816L13.1581 8.70508C13.2461 8.83087 13.3078 8.97346 13.3378 9.12402C13.3677 9.27479 13.3662 9.431 13.3329 9.58105C13.2995 9.73089 13.2352 9.87233 13.1444 9.99609C13.0534 10.12 12.9367 10.224 12.8036 10.3008L12.8026 10.3018L7.83874 13.1367H7.83776C7.58273 13.282 7.29339 13.3583 6.99987 13.3584C6.70653 13.3583 6.41788 13.2819 6.16296 13.1367H6.16198L1.19812 10.3018L1.19421 10.2988C1.06265 10.222 0.947224 10.1191 0.857296 9.99609C0.767476 9.87315 0.704043 9.73256 0.670772 9.58398C0.63754 9.43537 0.636037 9.28136 0.664913 9.13184C0.693854 8.98222 0.753407 8.83946 0.839718 8.71387V8.71289L6.08972 1.11816L6.09069 1.11621C6.19274 0.970057 6.32916 0.850069 6.48718 0.767578C6.62263 0.696979 6.77186 0.657006 6.9237 0.646484C6.94837 0.6429 6.97421 0.640658 6.99987 0.640625C7.02518 0.640648 7.05072 0.642993 7.07507 0.646484ZM1.70398 9.30859C1.69956 9.3151 1.69671 9.32335 1.69519 9.33105C1.69377 9.33872 1.69352 9.34688 1.69519 9.35449C1.69689 9.36208 1.70044 9.36964 1.70495 9.37598C1.70947 9.38212 1.71602 9.38764 1.72253 9.3916L6.47546 12.1064V2.40723L1.70398 9.30859ZM7.52526 12.1064L12.2801 9.39062C12.2869 9.38666 12.2931 9.38127 12.2977 9.375C12.3024 9.36852 12.3058 9.36036 12.3075 9.35254C12.3091 9.34481 12.309 9.33686 12.3075 9.3291C12.3059 9.32121 12.3023 9.31324 12.2977 9.30664L12.2967 9.30469L7.52526 2.40625V12.1064Z" fill="currentColor" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0 text-current">
      <path d="M7 0.642578C7.29611 0.642578 7.58712 0.720505 7.84375 0.868164L11.9268 3.20117L11.9297 3.20312C12.1863 3.35143 12.3995 3.56465 12.5479 3.82129C12.6963 4.07809 12.7751 4.36941 12.7754 4.66602V9.33398C12.7751 9.63058 12.6963 9.92192 12.5479 10.1787C12.3994 10.4355 12.1865 10.6495 11.9297 10.7979L11.9268 10.7988L7.8457 13.1299C7.60526 13.2687 7.33449 13.345 7.05762 13.3545C7.0387 13.3566 7.01947 13.3584 7 13.3584C6.9805 13.3584 6.96133 13.3566 6.94238 13.3545C6.66571 13.345 6.39458 13.2695 6.1543 13.1309L2.07324 10.7988L2.07031 10.7979C1.81347 10.6495 1.60059 10.4355 1.45215 10.1787C1.30372 9.92192 1.22494 9.63058 1.22461 9.33398V4.66602C1.22493 4.36941 1.30372 4.07809 1.45215 3.82129C1.6005 3.56465 1.81365 3.35143 2.07031 3.20312L2.07324 3.20117L6.15625 0.868164C6.41288 0.720505 6.70389 0.642578 7 0.642578ZM2.27539 9.33301L2.28027 9.41699C2.29134 9.49992 2.31921 9.5804 2.36133 9.65332C2.4176 9.75054 2.49843 9.8315 2.5957 9.8877L6.47461 12.1045V7.30273L2.27539 4.88965V9.33301ZM7.52539 7.30273V12.1045L11.4043 9.8877C11.5016 9.8315 11.5824 9.75054 11.6387 9.65332C11.6948 9.55611 11.7244 9.44526 11.7246 9.33301V4.88965L7.52539 7.30273ZM7 1.69336C6.91566 1.69336 6.83233 1.70921 6.75488 1.74121L6.67676 1.78027L2.8125 3.98828L7 6.39453L11.1875 3.98828L7.32324 1.78027L7.24512 1.74121C7.16767 1.70921 7.08434 1.69336 7 1.69336Z" fill="currentColor" />
    </svg>
  )
}

type DirectorConsole3DSceneHandle = {
  capture: (camera?: string | LibTvDirectorConsole3DCamera | null) => { dataUrl: string; width: number; height: number } | null
  renderCameraPreview: (canvas: HTMLCanvasElement, camera?: string | LibTvDirectorConsole3DCamera) => boolean
  renderAnimationVideoFrame: (canvas: HTMLCanvasElement, state: LibTvDirectorConsole3DState, aspectRatio: number) => boolean
  setVideoRecordingMode: (recording: boolean) => void
  resetView: () => void
  setPresetView: (view: DirectorConsolePresetView) => void
  getDirectorCameraState: () => { position: LibTvDirectorConsole3DVector3; target: LibTvDirectorConsole3DVector3 } | null
  getGroundPositionFromViewportCenter: () => LibTvDirectorConsole3DVector3 | null
  getGroundPositionFromClient: (clientX: number, clientY: number) => LibTvDirectorConsole3DVector3 | null
  getCharacterScaleForViewportRect: (position: LibTvDirectorConsole3DVector3, rect: LibTvDirectorConsole3DDirective["rect"]) => number | null
  getCharacterPlacementForImageDetection: (
    detection: LibTvDirectorConsole3DDetectedCharacter,
    projection?: LibTvDirectorConsole3DCharacterDetection["projection"],
  ) => DirectorDetectedCharacterPlacement | null
  isEnvironmentReady: (environmentUrl: string) => boolean
  getEnvironmentImageSize: (environmentUrl: string) => { width: number; height: number } | null
  getObjectIdsInViewportRect: (rect: LibTvDirectorConsole3DDirective["rect"]) => string[]
  getPanoramaAnchorFromViewportRect: (rect: LibTvDirectorConsole3DDirective["rect"]) => LibTvDirectorConsole3DPanoramaAnchor | null
  getViewportRectForPanoramaAnchor: (anchor: LibTvDirectorConsole3DPanoramaAnchor) => LibTvDirectorConsole3DDirective["rect"] | null
  createPanoramaBinding: (
    anchor: LibTvDirectorConsole3DPanoramaAnchor,
    position: LibTvDirectorConsole3DVector3,
    rotationY: number,
    sourceDirectiveId?: string,
  ) => LibTvDirectorConsole3DPanoramaBinding | null
  createPanoramaMask: (rect: LibTvDirectorConsole3DDirective["rect"], anchor?: LibTvDirectorConsole3DPanoramaAnchor) => DirectorPanoramaMaskResult
}

type DirectorConsole3DScenePack = {
  disposed?: boolean
  scene: THREE.Scene
  renderer: THREE.WebGLRenderer
  directorCamera: THREE.PerspectiveCamera
  shotCamera: THREE.PerspectiveCamera
  orbitControls: OrbitControls
  transformControls: LibTvTransformControls
  transformHelper: THREE.Object3D
  group: THREE.Group
  grid: THREE.Group
  ground: THREE.Mesh
  panoramaSphere: THREE.Mesh
  panoramaPlate: THREE.Mesh
  raycaster: THREE.Raycaster
  pointer: THREE.Vector2
  meshes: Map<string, THREE.Object3D>
  cameraHelpers: Map<string, THREE.Object3D>
  cameraGuides: Map<string, THREE.Object3D>
  selectionHelpers: Map<string, THREE.Object3D>
  motionPathHelpers: Map<string, THREE.Object3D>
  motionPathDraftHelper?: THREE.Object3D
  motionPathTransformProxy: THREE.Group
  motionPathsVisible: boolean
  hideCameraElements: boolean
  videoRecordingMode: boolean
  activeMotionPath?: LibTvDirectorConsole3DMotionPath
  hiddenMotionPathTargetId?: string
  uploadedModels: Map<string, { url: string; object?: THREE.Object3D; loading?: boolean; failed?: boolean }>
  previewRenderers: Map<HTMLCanvasElement, THREE.WebGLRenderer>
  groupTransformProxy: THREE.Group
  groupTransformSnapshot?: {
    groupId: string
    origin: THREE.Vector3
    objects: Array<{
      id: string
      position: LibTvDirectorConsole3DVector3
      rotation: LibTvDirectorConsole3DVector3
      scale: LibTvDirectorConsole3DVector3
    }>
  }
  target: THREE.Vector3
  cameraFovDrag?: {
    cameraId: string
    startX: number
    startY: number
    startFov: number
  }
  renderedStateKey: string
  renderedStateRef?: LibTvDirectorConsole3DState
  renderedSelectionKey?: string
  needsRender: boolean
  attachedTransformId?: string
  transformSyncing?: boolean
  transformDraggingId?: string
  transformMoved?: boolean
  lastCommittedTransformPatch?: { id: string; patch: Partial<LibTvDirectorConsole3DObject> }
  environmentTexture?: THREE.Texture | null
  environmentUrl?: string
  viewMode?: "director" | "camera"
  lastFocusedSelectionId?: string
  cameraViewSyncKey?: string
  editorCameraAnimation?: {
    startedAt: number
    durationMs: number
    fromPosition: THREE.Vector3
    toPosition: THREE.Vector3
    fromTarget: THREE.Vector3
    toTarget: THREE.Vector3
  }
}

function getDirectorPanoramaTextureAspect(texture: THREE.Texture) {
  const image = texture.image as {
    width?: number
    height?: number
    naturalWidth?: number
    naturalHeight?: number
    videoWidth?: number
    videoHeight?: number
  } | undefined
  const width = Number(image?.naturalWidth || image?.videoWidth || image?.width || 0)
  const height = Number(image?.naturalHeight || image?.videoHeight || image?.height || 0)
  return width > 0 && height > 0 ? width / height : 2
}

function getDirectorPanoramaTextureSize(texture: THREE.Texture) {
  const image = texture.image as {
    width?: number
    height?: number
    naturalWidth?: number
    naturalHeight?: number
    videoWidth?: number
    videoHeight?: number
  } | undefined
  return {
    width: Math.max(1, Math.round(Number(image?.naturalWidth || image?.videoWidth || image?.width || 0))),
    height: Math.max(1, Math.round(Number(image?.naturalHeight || image?.videoHeight || image?.height || 0))),
  }
}

function isDirectorEquirectangularPanorama(texture: THREE.Texture) {
  return Math.abs(getDirectorPanoramaTextureAspect(texture) - 2) <= 0.08
}

function getDirectorEnvironmentProjection(
  state: LibTvDirectorConsole3DState,
  override?: LibTvDirectorConsole3DCharacterDetection["projection"],
) {
  if (state.environmentProjection === "flat" || state.environmentProjection === "equirectangular") return state.environmentProjection
  if (override === "flat" || override === "equirectangular") return override
  const detection = state.characterDetection
  const sourceFingerprint = getDirectorEnvironmentFingerprint(state.environmentUrl)
  return detection?.sourceFingerprint === sourceFingerprint ? detection.projection : undefined
}

function usesDirectorEquirectangularEnvironment(
  texture: THREE.Texture,
  state: LibTvDirectorConsole3DState,
  override?: LibTvDirectorConsole3DCharacterDetection["projection"],
) {
  const projection = getDirectorEnvironmentProjection(state, override)
  if (projection === "flat") return false
  if (projection === "equirectangular") return true
  return isDirectorEquirectangularPanorama(texture)
}

function syncDirectorEnvironmentTextureProjection(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  override?: LibTvDirectorConsole3DCharacterDetection["projection"],
) {
  const texture = pack.environmentTexture
  if (!texture) return
  const usesEquirectangularSphere = usesDirectorEquirectangularEnvironment(texture, state, override)
  const mapping = usesEquirectangularSphere ? THREE.EquirectangularReflectionMapping : THREE.UVMapping
  if (texture.mapping !== mapping) {
    texture.mapping = mapping
    texture.needsUpdate = true
  }
  const sphereMaterial = pack.panoramaSphere.material as THREE.MeshBasicMaterial
  const plateMaterial = pack.panoramaPlate.material as THREE.MeshBasicMaterial
  if (sphereMaterial.map !== (usesEquirectangularSphere ? texture : null)) {
    sphereMaterial.map = usesEquirectangularSphere ? texture : null
    sphereMaterial.needsUpdate = true
  }
  if (plateMaterial.map !== (usesEquirectangularSphere ? null : texture)) {
    plateMaterial.map = usesEquirectangularSphere ? null : texture
    plateMaterial.needsUpdate = true
  }
  pack.panoramaPlate.userData.sourceAspect = getDirectorPanoramaTextureAspect(texture)
  pack.panoramaSphere.visible = usesEquirectangularSphere
  pack.panoramaPlate.visible = !usesEquirectangularSphere
}

type DirectorPanoramaCameraContext = {
  camera: THREE.PerspectiveCamera
  viewport: LibTvDirectorConsole3DDirective["rect"]
  canvasRect: DOMRect
}

function getDirectorPanoramaCameraContext(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
): DirectorPanoramaCameraContext | null {
  const canvasRect = pack.renderer.domElement.getBoundingClientRect()
  if (canvasRect.width <= 1 || canvasRect.height <= 1) return null
  let camera = pack.directorCamera
  let viewport: LibTvDirectorConsole3DDirective["rect"] = { x: 0, y: 0, width: 1, height: 1 }
  if (pack.viewMode === "camera") {
    const activeCamera = state.cameras.find((item) => item.id === state.activeCameraId) || state.cameras[0]
    if (!activeCamera) return null
    const aspect = parseDirectorAspectRatio(activeCamera.aspectRatio, DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO)
    camera = configureThreeCameraFromDirectorCameraState(pack.shotCamera, activeCamera, state, aspect.ratio)
    const contained = getDirectorContainedViewport(canvasRect.width, canvasRect.height, aspect.ratio)
    viewport = {
      x: contained.x / canvasRect.width,
      y: contained.y / canvasRect.height,
      width: contained.width / canvasRect.width,
      height: contained.height / canvasRect.height,
    }
  }
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return { camera, viewport, canvasRect }
}

function getDirectorPanoramaAnchorFromViewportRect(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  viewportRect: LibTvDirectorConsole3DDirective["rect"],
  samplesPerEdge = 12,
): LibTvDirectorConsole3DPanoramaAnchor | null {
  const texture = pack.environmentTexture
  if (!texture || !usesDirectorEquirectangularEnvironment(texture, state) || !pack.panoramaSphere.visible) return null
  const context = getDirectorPanoramaCameraContext(pack, state)
  if (!context) return null
  const normalized = normalizeDirectorDirectiveRect(viewportRect)
  const viewportRight = context.viewport.x + context.viewport.width
  const viewportBottom = context.viewport.y + context.viewport.height
  const left = Math.max(context.viewport.x, normalized.x)
  const top = Math.max(context.viewport.y, normalized.y)
  const right = Math.min(viewportRight, normalized.x + normalized.width)
  const bottom = Math.min(viewportBottom, normalized.y + normalized.height)
  if (right - left < 0.002 || bottom - top < 0.002) return null
  const cameraRect = {
    x: (left - context.viewport.x) / context.viewport.width,
    y: (top - context.viewport.y) / context.viewport.height,
    width: (right - left) / context.viewport.width,
    height: (bottom - top) / context.viewport.height,
  }
  const panoramaRotation = THREE.MathUtils.degToRad(Number(state.panoramaRotation || 0))
  const panoramaAxis = new THREE.Vector3(0, 1, 0)
  const points: Array<{ u: number; v: number }> = []
  const direction = new THREE.Vector3()
  const appendPoint = (x: number, y: number) => {
    direction
      .set(x * 2 - 1, 1 - y * 2, 0.5)
      .unproject(context.camera)
      .sub(context.camera.position)
      .normalize()
      .applyAxisAngle(panoramaAxis, -panoramaRotation)
    let u = Math.atan2(direction.z, direction.x) / (Math.PI * 2)
    if (u < 0) u += 1
    const previousU = points.at(-1)?.u
    if (typeof previousU === "number") {
      while (u - previousU > 0.5) u -= 1
      while (u - previousU < -0.5) u += 1
    }
    points.push({
      u: Number(u.toFixed(6)),
      v: Number((Math.acos(THREE.MathUtils.clamp(direction.y, -1, 1)) / Math.PI).toFixed(6)),
    })
  }
  for (let index = 0; index <= samplesPerEdge; index += 1) appendPoint(cameraRect.x + cameraRect.width * index / samplesPerEdge, cameraRect.y)
  for (let index = 1; index <= samplesPerEdge; index += 1) appendPoint(cameraRect.x + cameraRect.width, cameraRect.y + cameraRect.height * index / samplesPerEdge)
  for (let index = 1; index <= samplesPerEdge; index += 1) appendPoint(cameraRect.x + cameraRect.width - cameraRect.width * index / samplesPerEdge, cameraRect.y + cameraRect.height)
  for (let index = 1; index < samplesPerEdge; index += 1) appendPoint(cameraRect.x, cameraRect.y + cameraRect.height - cameraRect.height * index / samplesPerEdge)
  return { projection: "equirectangular", points }
}

function getDirectorViewportRectForPanoramaAnchor(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  value: LibTvDirectorConsole3DPanoramaAnchor,
): LibTvDirectorConsole3DDirective["rect"] | null {
  const anchor = normalizeDirectorPanoramaAnchor(value)
  const texture = pack.environmentTexture
  if (!anchor || !texture || !usesDirectorEquirectangularEnvironment(texture, state) || !pack.panoramaSphere.visible) return null
  const context = getDirectorPanoramaCameraContext(pack, state)
  if (!context) return null
  const panoramaRotation = THREE.MathUtils.degToRad(Number(state.panoramaRotation || 0))
  const panoramaAxis = new THREE.Vector3(0, 1, 0)
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(context.camera.quaternion)
  const direction = new THREE.Vector3()
  const projected = new THREE.Vector3()
  const visiblePoints: Array<{ x: number; y: number }> = []
  anchor.points.forEach((point) => {
    const phi = point.v * Math.PI
    const theta = point.u * Math.PI * 2
    const sinPhi = Math.sin(phi)
    direction
      .set(Math.cos(theta) * sinPhi, Math.cos(phi), Math.sin(theta) * sinPhi)
      .applyAxisAngle(panoramaAxis, panoramaRotation)
      .normalize()
    if (direction.dot(forward) <= 0.001) return
    projected.copy(context.camera.position).addScaledVector(direction, 10).project(context.camera)
    if (projected.z < -1 || projected.z > 1) return
    visiblePoints.push({
      x: context.viewport.x + (projected.x + 1) / 2 * context.viewport.width,
      y: context.viewport.y + (1 - projected.y) / 2 * context.viewport.height,
    })
  })
  if (visiblePoints.length < 2) return null
  const minX = Math.max(0, Math.min(...visiblePoints.map((point) => point.x)))
  const minY = Math.max(0, Math.min(...visiblePoints.map((point) => point.y)))
  const maxX = Math.min(1, Math.max(...visiblePoints.map((point) => point.x)))
  const maxY = Math.min(1, Math.max(...visiblePoints.map((point) => point.y)))
  if (maxX - minX < 0.004 || maxY - minY < 0.004) return null
  return {
    x: Number(minX.toFixed(5)),
    y: Number(minY.toFixed(5)),
    width: Number((maxX - minX).toFixed(5)),
    height: Number((maxY - minY).toFixed(5)),
  }
}

function createDirectorPanoramaUvMask(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  viewportRect: LibTvDirectorConsole3DDirective["rect"],
  savedAnchor?: LibTvDirectorConsole3DPanoramaAnchor,
): DirectorPanoramaMaskResult {
  const texture = pack.environmentTexture
  if (!texture || !usesDirectorEquirectangularEnvironment(texture, state) || !pack.panoramaSphere.visible) {
    return { error: "当前背景不是已加载完成的 2:1 全景图" }
  }
  const anchor = normalizeDirectorPanoramaAnchor(savedAnchor)
    || getDirectorPanoramaAnchorFromViewportRect(pack, state, viewportRect, 48)
  if (!anchor) return { error: "框选区域没有落在当前全景画面内" }
  const sourceSize = getDirectorPanoramaTextureSize(texture)
  const width = Math.max(512, Math.min(2048, sourceSize.width || 2048))
  const height = Math.max(256, Math.round(width / 2))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return { error: "无法创建全景编辑蒙版" }
  context.fillStyle = "#000000"
  context.fillRect(0, 0, width, height)
  context.fillStyle = "#ffffff"
  context.strokeStyle = "#ffffff"
  context.lineWidth = 2
  for (let shift = -2; shift <= 2; shift += 1) {
    context.beginPath()
    anchor.points.forEach((point, index) => {
      const x = (point.u + shift) * width
      const y = point.v * height
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.closePath()
    context.fill()
    context.stroke()
  }
  return { maskData: canvas.toDataURL("image/png"), width, height }
}

function syncDirectorPanoramaPlateToCamera(plate: THREE.Mesh, camera: THREE.Camera) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return
  const distance = Math.min(500, camera.far * 0.45)
  const sourceAspect = clampWorkflowNumber(Number(plate.userData.sourceAspect || 16 / 9), 0.25, 4)
  const viewportAspect = clampWorkflowNumber(Number(camera.aspect || 16 / 9), 0.25, 4)
  const viewportHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2) * distance
  const viewportWidth = viewportHeight * viewportAspect
  const plateWidth = sourceAspect >= viewportAspect ? viewportHeight * sourceAspect : viewportWidth
  const plateHeight = sourceAspect >= viewportAspect ? viewportHeight : viewportWidth / sourceAspect
  const forward = (plate.userData.cameraForward ||= new THREE.Vector3()) as THREE.Vector3
  forward.set(0, 0, -1).applyQuaternion(camera.quaternion)
  plate.position.copy(camera.position).addScaledVector(forward, distance)
  plate.quaternion.copy(camera.quaternion)
  plate.scale.set(plateWidth, plateHeight, 1)
  plate.updateMatrixWorld()
}

function getDirectorResponsiveEditorFov(width: number, height: number) {
  const baseFov = 50
  const aspect = Math.max(0.2, width / Math.max(1, height))
  const referenceAspect = 16 / 9
  if (aspect >= referenceAspect) return baseFov
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(
    Math.tan(THREE.MathUtils.degToRad(baseFov) / 2) * referenceAspect / aspect,
  ))
  return clampWorkflowNumber(fov, baseFov, 100)
}

const DirectorConsole3DScene = React.forwardRef<DirectorConsole3DSceneHandle, {
  state: LibTvDirectorConsole3DState
  viewMode: "director" | "camera"
  motionPathsVisible: boolean
  hideCameraElements: boolean
  motionDrawingSession: DirectorTimelineMotionDrawingSession | null
  activeMotionPath?: LibTvDirectorConsole3DMotionPath
  onSelect: (id: string | null) => void
  onObjectTransform: (id: string, patch: Partial<LibTvDirectorConsole3DObject>) => void
  onPlaceSelection: (position: LibTvDirectorConsole3DVector3) => void
  onDirectorCameraChange: (camera: Partial<LibTvDirectorConsole3DCamera>) => void
  onMotionDrawingPointsChange: (points: LibTvDirectorConsole3DVector3[]) => void
  onMotionDrawingComplete: (session: DirectorTimelineMotionDrawingSession) => void
  onMotionPathTransform: (pathId: string, patch: Partial<LibTvDirectorConsole3DMotionPath>) => void
}>(function DirectorConsole3DScene({ state, viewMode, motionPathsVisible, hideCameraElements, motionDrawingSession, activeMotionPath, onSelect, onObjectTransform, onPlaceSelection, onDirectorCameraChange, onMotionDrawingPointsChange, onMotionDrawingComplete, onMotionPathTransform }, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const scenePackRef = useRef<DirectorConsole3DScenePack | null>(null)
  const stateRef = useRef(state)
  const viewModeRef = useRef(viewMode)
  const motionPathsVisibleRef = useRef(motionPathsVisible)
  const hideCameraElementsRef = useRef(hideCameraElements)
  const onSelectRef = useRef(onSelect)
  const onObjectTransformRef = useRef(onObjectTransform)
  const onPlaceSelectionRef = useRef(onPlaceSelection)
  const onDirectorCameraChangeRef = useRef(onDirectorCameraChange)
  const motionDrawingSessionRef = useRef(motionDrawingSession)
  const activeMotionPathRef = useRef(activeMotionPath)
  const onMotionDrawingPointsChangeRef = useRef(onMotionDrawingPointsChange)
  const onMotionDrawingCompleteRef = useRef(onMotionDrawingComplete)
  const onMotionPathTransformRef = useRef(onMotionPathTransform)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { viewModeRef.current = viewMode }, [viewMode])
  useEffect(() => { motionPathsVisibleRef.current = motionPathsVisible }, [motionPathsVisible])
  useEffect(() => { hideCameraElementsRef.current = hideCameraElements }, [hideCameraElements])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onObjectTransformRef.current = onObjectTransform }, [onObjectTransform])
  useEffect(() => { onPlaceSelectionRef.current = onPlaceSelection }, [onPlaceSelection])
  useEffect(() => { onDirectorCameraChangeRef.current = onDirectorCameraChange }, [onDirectorCameraChange])
  useEffect(() => { motionDrawingSessionRef.current = motionDrawingSession }, [motionDrawingSession])
  useEffect(() => { activeMotionPathRef.current = activeMotionPath }, [activeMotionPath])
  useEffect(() => { onMotionDrawingPointsChangeRef.current = onMotionDrawingPointsChange }, [onMotionDrawingPointsChange])
  useEffect(() => { onMotionDrawingCompleteRef.current = onMotionDrawingComplete }, [onMotionDrawingComplete])
  useEffect(() => { onMotionPathTransformRef.current = onMotionPathTransform }, [onMotionPathTransform])
  useEffect(() => {
    const pack = scenePackRef.current
    if (!pack) return
    if (pack.motionPathDraftHelper) {
      pack.motionPathDraftHelper.removeFromParent()
      disposeDirectorMotionPathHelper(pack.motionPathDraftHelper)
      pack.motionPathDraftHelper = undefined
    }
    if (motionDrawingSession && motionDrawingSession.points.length >= 2) {
      const helper = buildDirectorMotionPathHelper(motionDrawingSession.points, false, true, motionDrawingSession.type)
      pack.motionPathDraftHelper = helper
      pack.group.add(helper)
    }
    pack.needsRender = true
  }, [motionDrawingSession])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(state.backgroundColor || DIRECTOR_STAGE_VIEWPORT_BACKGROUND)
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.display = "block"
    renderer.domElement.style.width = "100%"
	    renderer.domElement.style.height = "100%"
	    host.appendChild(renderer.domElement)
	    let lastGizmoPointerTime = 0

	    const directorCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
	    const shotCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
		    const defaultEditorPose = getDirectorConsoleDefaultEditorPose(state)
		    const target = defaultEditorPose.target
		    directorCamera.position.copy(defaultEditorPose.position)
    directorCamera.lookAt(target)
    const orbitControls = new OrbitControls(directorCamera, renderer.domElement)
    orbitControls.target.copy(target)
    orbitControls.enableDamping = true
    orbitControls.dampingFactor = 0.08
    orbitControls.minDistance = 1
    orbitControls.maxDistance = 60
    orbitControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
    orbitControls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY
    orbitControls.mouseButtons.RIGHT = THREE.MOUSE.PAN
    // Legacy director console uses the older fixed-step OrbitControls zoom
    // curve. Three r183 scales by delta magnitude, making trackpad deltas (~1)
    // roughly 100x weaker than the original product.
    const orbitControlsWithLegacyZoom = orbitControls as OrbitControls & { _getZoomScale: (delta: number) => number }
    orbitControlsWithLegacyZoom._getZoomScale = () => Math.pow(0.95, orbitControls.zoomSpeed)

    const transformControls = new LibTvTransformControls(directorCamera, renderer.domElement)
    transformControls.setMode("translate")
    transformControls.setSpace("world")
    transformControls.setSize(0.7)
    const transformHelper = transformControls.getHelper()
    scene.add(transformHelper)

    scene.add(new THREE.AmbientLight(0xffffff, 1.05))
    scene.add(new THREE.HemisphereLight(0xffffff, 0x2c3140, 0.85))
    const light = new THREE.DirectionalLight(0xffffff, 1.2)
    light.position.set(5, 10, 5)
    light.castShadow = true
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = 50
    scene.add(light)
    const fillLight = new THREE.DirectionalLight(0xf5f7ff, 0.75)
    fillLight.position.set(-5, 3, -5)
    scene.add(fillLight)

    const group = new THREE.Group()
    scene.add(group)
    const grid = buildDirectorStageGrid()
    group.add(grid)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({
        color: DIRECTOR_STAGE_GROUND_COLOR,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: DIRECTOR_STAGE_GROUND_OPACITY,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    group.add(ground)
    const panoramaGeometry = new THREE.SphereGeometry(500, 60, 30)
    panoramaGeometry.scale(-1, 1, 1)
    const panoramaSphere = new THREE.Mesh(panoramaGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }))
    panoramaSphere.visible = false
    panoramaSphere.frustumCulled = false
    panoramaSphere.renderOrder = -1000
    panoramaSphere.onBeforeRender = (_renderer, _scene, camera) => {
      panoramaSphere.position.copy(camera.position)
    }
    scene.add(panoramaSphere)
    const panoramaPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, toneMapped: false }),
    )
    panoramaPlate.visible = false
    panoramaPlate.frustumCulled = false
    panoramaPlate.renderOrder = -1000
    panoramaPlate.onBeforeRender = (_renderer, _scene, camera) => {
      syncDirectorPanoramaPlateToCamera(panoramaPlate, camera)
    }
    scene.add(panoramaPlate)

    const groupTransformProxy = new THREE.Group()
    groupTransformProxy.visible = false
    group.add(groupTransformProxy)
    const motionPathTransformProxy = new THREE.Group()
    group.add(motionPathTransformProxy)
    const pack: DirectorConsole3DScenePack = {
      disposed: false,
      scene,
      renderer,
      directorCamera,
      shotCamera,
      orbitControls,
      transformControls,
      transformHelper,
      group,
      grid,
      ground,
      panoramaSphere,
      panoramaPlate,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      meshes: new Map<string, THREE.Object3D>(),
      cameraHelpers: new Map<string, THREE.Object3D>(),
      cameraGuides: new Map<string, THREE.Object3D>(),
      selectionHelpers: new Map<string, THREE.Object3D>(),
      motionPathHelpers: new Map<string, THREE.Object3D>(),
      motionPathDraftHelper: undefined,
      motionPathTransformProxy,
      motionPathsVisible: motionPathsVisibleRef.current,
      hideCameraElements: hideCameraElementsRef.current,
      videoRecordingMode: false,
      activeMotionPath: undefined,
      hiddenMotionPathTargetId: undefined,
      uploadedModels: new Map<string, { url: string; object?: THREE.Object3D; loading?: boolean; failed?: boolean }>(),
      previewRenderers: new Map<HTMLCanvasElement, THREE.WebGLRenderer>(),
      groupTransformProxy,
      groupTransformSnapshot: undefined,
		      target,
		      cameraFovDrag: undefined,
		      renderedStateKey: "",
		      renderedStateRef: undefined,
		      renderedSelectionKey: undefined,
		      needsRender: true,
		      attachedTransformId: undefined,
		      transformSyncing: false,
		      transformDraggingId: undefined,
		      transformMoved: false,
		      lastCommittedTransformPatch: undefined,
		      environmentTexture: null,
		      environmentUrl: undefined,
		      viewMode: "director",
		      lastFocusedSelectionId: undefined,
		      cameraViewSyncKey: undefined,
		      editorCameraAnimation: undefined,
    }
    scenePackRef.current = pack

    const resize = () => {
      if (!host || disposed) return
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      renderer.setSize(width, height, false)
	      directorCamera.aspect = width / height
	      if (pack.viewMode === "director") directorCamera.fov = getDirectorResponsiveEditorFov(width, height)
	      directorCamera.updateProjectionMatrix()
	      pack.needsRender = true
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(host)

	    let animationId = 0
	    const animate = () => {
	      if (disposed) return
	      animationId = requestAnimationFrame(animate)
	      if (document.visibilityState === "hidden") return
	      const nextViewMode = viewModeRef.current
	      const viewModeChanged = pack.viewMode !== nextViewMode
	      pack.viewMode = nextViewMode
	      if (viewModeChanged) pack.renderedSelectionKey = undefined
	      const nextMotionPathsVisible = !pack.videoRecordingMode && motionPathsVisibleRef.current
	      const nextHideCameraElements = pack.videoRecordingMode || hideCameraElementsRef.current
	      if (pack.motionPathsVisible !== nextMotionPathsVisible || pack.hideCameraElements !== nextHideCameraElements) {
	        pack.motionPathsVisible = nextMotionPathsVisible
	        pack.hideCameraElements = nextHideCameraElements
	        pack.renderedStateKey = ""
	        pack.renderedSelectionKey = undefined
	        pack.needsRender = true
	      }
	      const nextActiveMotionPath = pack.motionPathsVisible ? activeMotionPathRef.current : undefined
	      if (pack.activeMotionPath?.id !== nextActiveMotionPath?.id || pack.activeMotionPath !== nextActiveMotionPath) {
	        pack.activeMotionPath = nextActiveMotionPath
	        pack.renderedSelectionKey = undefined
	      }
	      const drawingTrackId = motionDrawingSessionRef.current?.trackId
	      const nextHiddenMotionPathTargetId = drawingTrackId
	        ? stateRef.current.timeline?.tracks.find((track) => track.id === drawingTrackId || track.targetId === drawingTrackId)?.targetId
	        : undefined
	      if (pack.hiddenMotionPathTargetId !== nextHiddenMotionPathTargetId) {
	        pack.hiddenMotionPathTargetId = nextHiddenMotionPathTargetId
	        pack.renderedStateKey = ""
	      }
	      const sceneChanged = renderDirectorConsoleScene(pack, stateRef.current)
	      updateDirectorStageGridLoading(pack.grid)
	      orbitControls.enabled = !pack.videoRecordingMode && viewModeRef.current === "director" && !transformControls.dragging && !motionDrawingSessionRef.current
	      if (pack.videoRecordingMode || motionDrawingSessionRef.current) {
	        pack.transformControls.enabled = false
	        pack.transformHelper.visible = false
	      }
	      const cameraAnimating = updateDirectorEditorCameraAnimation(pack)
	      const activeCamera = stateRef.current.cameras.find((camera) => camera.id === stateRef.current.activeCameraId) || stateRef.current.cameras[0]
	      if (viewModeRef.current === "camera" && activeCamera) {
	        const aspect = parseDirectorAspectRatio(activeCamera.aspectRatio, DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO)
	        configureThreeCameraFromDirectorCameraState(shotCamera, activeCamera, stateRef.current, aspect.ratio)
	        const cameraViewSyncKey = getDirectorCameraGuideKey(activeCamera, stateRef.current)
	        if (viewModeChanged || pack.cameraViewSyncKey !== cameraViewSyncKey) {
	          syncDirectorEditorCameraToShot(pack, activeCamera, stateRef.current)
	          pack.cameraViewSyncKey = cameraViewSyncKey
	        }
	      } else if (viewModeChanged) {
	        pack.cameraViewSyncKey = undefined
	        const viewport = host.getBoundingClientRect()
	        directorCamera.fov = getDirectorResponsiveEditorFov(viewport.width, viewport.height)
	        directorCamera.updateProjectionMatrix()
	      }
		      const controlsChanged = cameraAnimating ? false : orbitControls.update()
		      pack.target.copy(orbitControls.target)
		      const renderCamera = viewModeRef.current === "camera" && activeCamera ? shotCamera : directorCamera
		      const panoramaObjects = syncDirectorPanoramaBoundObjects(pack, stateRef.current, renderCamera)
		      if (panoramaObjects.changed) updateDirectorSelectionHelpers(pack, stateRef.current)
		      if (!sceneChanged && !controlsChanged && !viewModeChanged && !pack.needsRender && !panoramaObjects.changed) return
	      pack.needsRender = false
	      const rendererSize = new THREE.Vector2()
	      renderer.getSize(rendererSize)
	      if (viewModeRef.current === "camera" && activeCamera) {
	        const aspect = parseDirectorAspectRatio(activeCamera.aspectRatio, DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO)
	        const restoreEditorHelpers = hideDirectorConsoleCameraViewHelpers(pack)
	        renderDirectorSceneContained(renderer, scene, shotCamera, rendererSize.x, rendererSize.y, aspect.ratio)
	        restoreEditorHelpers()
	      } else {
	        renderer.setScissorTest(false)
	        renderer.setViewport(0, 0, rendererSize.x, rendererSize.y)
	        syncDirectorSkinnedMeshesBeforeRender(scene)
	        renderer.render(scene, directorCamera)
	      }
    }
    animate()

    const pointerFromEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((event.clientY - rect.top) / rect.height) * 2) + 1,
        button: event.button,
      }
    }
    const handleTransformPointerDownCapture = (event: PointerEvent) => {
      if (event.button === 0) {
        const rect = renderer.domElement.getBoundingClientRect()
        const hit = pickDirectorConsoleCameraFovHandle(pack, event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, viewModeRef.current, stateRef.current)
        if (hit) {
          event.preventDefault()
          event.stopImmediatePropagation()
          pointerDownId = null
          pack.cameraFovDrag = { cameraId: hit.id, startX: event.clientX, startY: event.clientY, startFov: hit.fov }
          renderer.domElement.setPointerCapture(event.pointerId)
          orbitControls.enabled = false
          lastGizmoPointerTime = performance.now()
          return
        }
      }
      const controls = pack.transformControls as LibTvTransformControls & { pointerHover?: (pointer: { x: number; y: number; button: number }) => void; axis?: string | null }
	      if (!controls.enabled || !controls.object || controls.dragging) return
	      controls.pointerHover?.(pointerFromEvent(event))
	      if (controls.axis) {
	        lastGizmoPointerTime = performance.now()
	        orbitControls.enabled = false
	      }
	    }
    const handleTransformWheelCapture = (event: WheelEvent) => {
      if (!pack.transformControls.dragging) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    let pointerDownId: number | null = null
    let pointerDownX = 0
    let pointerDownY = 0
    let pointerMoved = false
    const handlePointerDown = (event: PointerEvent) => {
	      const drawing = motionDrawingSessionRef.current
	      if (drawing && event.button === 0) {
	        event.preventDefault()
	        const point = getDirectorConsoleGroundPositionFromScreen(pack, event.clientX, event.clientY, stateRef.current)
	        if (!point) return
	        const logical = vectorFromThree(point)
	        const nextPoints = drawing.type === "pen" ? [...drawing.points, logical] : [logical]
	        motionDrawingSessionRef.current = { ...drawing, points: nextPoints }
	        onMotionDrawingPointsChangeRef.current(nextPoints)
	        try { renderer.domElement.setPointerCapture(event.pointerId) } catch {}
	        pointerDownId = event.pointerId
	        pointerDownX = event.clientX
	        pointerDownY = event.clientY
	        pointerMoved = false
	        return
	      }
	      if (pack.cameraFovDrag) return
	      if (event.button !== 0 || pack.transformControls.dragging) return
	      const transformAxis = (pack.transformControls as unknown as { axis?: string | null }).axis
	      if (transformAxis) return
	      pointerDownId = event.pointerId
	      pointerDownX = event.clientX
	      pointerDownY = event.clientY
	      pointerMoved = false
    }
    const handlePointerMove = (event: PointerEvent) => {
	      const drawing = motionDrawingSessionRef.current
	      if (drawing?.type === "pencil" && pointerDownId === event.pointerId) {
	        event.preventDefault()
	        const point = getDirectorConsoleGroundPositionFromScreen(pack, event.clientX, event.clientY, stateRef.current)
	        if (!point) return
	        const logical = vectorFromThree(point)
	        const previous = drawing.points[drawing.points.length - 1]
	        if (previous && Math.hypot(logical.x - previous.x, logical.y - previous.y, logical.z - previous.z) < 0.12) return
	        const nextPoints = drawing.points.length < 256
	          ? [...drawing.points, logical]
	          : [...drawing.points.filter((_, index) => index % 2 === 0), logical].slice(0, 256)
	        motionDrawingSessionRef.current = { ...drawing, points: nextPoints }
	        onMotionDrawingPointsChangeRef.current(nextPoints)
	        pointerMoved = true
	        return
	      }
      if (pack.cameraFovDrag) {
        event.preventDefault()
        const drag = pack.cameraFovDrag
        const delta = (event.clientX - drag.startX) * 0.18 - (event.clientY - drag.startY) * 0.18
        const fov = Number(clampWorkflowNumber(drag.startFov + delta, 15, 90).toFixed(1))
        stateRef.current = {
          ...stateRef.current,
          cameras: stateRef.current.cameras.map((camera) => camera.id === drag.cameraId ? { ...camera, fov } : camera),
        }
        pack.renderedStateKey = ""
        return
      }
      if (pointerDownId !== event.pointerId) return
      if (Math.abs(event.clientX - pointerDownX) > 4 || Math.abs(event.clientY - pointerDownY) > 4) pointerMoved = true
    }
    const handlePointerUp = (event: PointerEvent) => {
	      const drawing = motionDrawingSessionRef.current
	      if (drawing && pointerDownId === event.pointerId) {
	        try { renderer.domElement.releasePointerCapture(event.pointerId) } catch {}
	        pointerDownId = null
	        if (drawing.type === "pencil" && drawing.points.length >= 2) {
	          motionDrawingSessionRef.current = null
	          onMotionDrawingCompleteRef.current(drawing)
	        }
	        return
	      }
      if (pack.cameraFovDrag) {
        const drag = pack.cameraFovDrag
        const camera = stateRef.current.cameras.find((item) => item.id === drag.cameraId)
        pack.cameraFovDrag = undefined
        try {
          renderer.domElement.releasePointerCapture(event.pointerId)
        } catch {}
        orbitControls.enabled = viewModeRef.current === "director"
        lastGizmoPointerTime = performance.now()
        if (camera) onDirectorCameraChangeRef.current({ fov: camera.fov })
        return
      }
      if (event.button !== 0 || pointerDownId !== event.pointerId) return
      pointerDownId = null
      if (pointerMoved || pack.transformControls.dragging || performance.now() - lastGizmoPointerTime < 250) return
      const transformAxis = (pack.transformControls as unknown as { axis?: string | null }).axis
      if (transformAxis) return
      const rect = renderer.domElement.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const hit = pickDirectorConsoleObject(pack, x, y, rect.width, rect.height, viewModeRef.current)
	      if (hit?.id) {
	        const object = stateRef.current.objects.find((item) => item.id === hit.id)
	        if (object && !object.locked) {
	          onSelectRef.current(hit.id)
	          return
        }
        const camera = stateRef.current.cameras.find((item) => item.id === hit.id)
        if (camera && !camera.locked) {
          onSelectRef.current(hit.id)
          return
	        }
	      }
	      onSelectRef.current(null)
	    }
	    const handleDoubleClick = (event: MouseEvent) => {
	      const drawing = motionDrawingSessionRef.current
	      if (drawing?.type !== "pen") return
	      event.preventDefault()
	      event.stopPropagation()
	      const points = drawing.points.filter((point, index, source) => {
	        if (index === 0) return true
	        const previous = source[index - 1]
	        return Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z) >= 0.01
	      })
	      if (points.length < 2) return
	      const completed = { ...drawing, points }
	      motionDrawingSessionRef.current = null
	      onMotionDrawingCompleteRef.current(completed)
	    }
	    const handleOrbitStart = () => {
	      pack.editorCameraAnimation = undefined
	      pack.needsRender = true
	    }
	    const handleOrbitChange = () => {
	      pack.needsRender = true
	    }
	    const handleOrbitEnd = () => {
	      pack.target.copy(pack.orbitControls.target)
	      pack.needsRender = true
	    }
	    const handleTransformDrag = (event: { value: unknown }) => {
		      lastGizmoPointerTime = performance.now()
		      const dragging = Boolean(event.value)
		      orbitControls.enabled = !dragging
		      if (dragging) {
		        pack.transformDraggingId = pack.attachedTransformId
		        pack.transformMoved = false
            const groupId = pack.transformDraggingId?.startsWith("group:") ? pack.transformDraggingId.slice(6) : ""
            const group = groupId ? stateRef.current.objectGroups?.find((item) => item.id === groupId) : null
            if (group) {
              pack.groupTransformSnapshot = {
                groupId,
                origin: pack.groupTransformProxy.position.clone(),
                objects: group.objectIds
                  .map((id) => stateRef.current.objects.find((object) => object.id === id))
                  .filter(Boolean)
                  .map((object) => ({
                    id: object!.id,
                    position: { ...object!.position },
                    rotation: { ...object!.rotation },
                    scale: { ...object!.scale },
                  })),
              }
            }
		      }
		    }
				    const handleTransformObjectChange = (options: { commit?: boolean } = {}) => {
				      lastGizmoPointerTime = performance.now()
				      const attachedId = pack.attachedTransformId
			      const attached = pack.transformControls.object
		      if (!attachedId || !attached || pack.transformSyncing) return
		      pack.transformDraggingId = attachedId
		      pack.transformMoved = true
		      const snap = stateRef.current.gridSnap ? 1 : 0
		      const snapValue = (value: number) => snap > 0 ? Math.round(value / snap) * snap : value
          if (attachedId.startsWith("motion-path:")) {
            const pathId = attachedId.slice("motion-path:".length)
            const position = { x: snapValue(attached.position.x), y: snapValue(attached.position.y), z: snapValue(attached.position.z) }
            const rotation = {
              x: Number(THREE.MathUtils.radToDeg(attached.rotation.x).toFixed(2)),
              y: Number(THREE.MathUtils.radToDeg(attached.rotation.y).toFixed(2)),
              z: Number(THREE.MathUtils.radToDeg(attached.rotation.z).toFixed(2)),
            }
            const scale = { x: Number(attached.scale.x.toFixed(4)), y: Number(attached.scale.y.toFixed(4)), z: Number(attached.scale.z.toFixed(4)) }
            if (options.commit || !pack.transformControls.dragging) onMotionPathTransformRef.current(pathId, { position, rotation, scale })
            return
          }
          if (attachedId.startsWith("group:")) {
            const groupId = attachedId.slice(6)
            const group = stateRef.current.objectGroups?.find((item) => item.id === groupId)
            if (!group) return
            const snapshot = pack.groupTransformSnapshot?.groupId === groupId
              ? pack.groupTransformSnapshot
              : {
                groupId,
                origin: attached.position.clone(),
                objects: group.objectIds
                  .map((id) => stateRef.current.objects.find((object) => object.id === id))
                  .filter(Boolean)
                  .map((object) => ({
                    id: object!.id,
                    position: { ...object!.position },
                    rotation: { ...object!.rotation },
                    scale: { ...object!.scale },
                  })),
              }
            const logicalPosition = directorConsoleVectorFromWorld(attached.position, stateRef.current)
	            const logicalOrigin = directorConsoleVectorFromWorld(snapshot.origin, stateRef.current)
	            const logicalOriginVector = new THREE.Vector3(logicalOrigin.x, logicalOrigin.y, logicalOrigin.z)
            const delta = new THREE.Vector3(
              snapValue(logicalPosition.x) - logicalOrigin.x,
              snapValue(logicalPosition.y) - logicalOrigin.y,
              snapValue(logicalPosition.z) - logicalOrigin.z,
            )
	            const deltaRotation = new THREE.Euler(
	              attached.rotation.x,
	              attached.rotation.y,
	              attached.rotation.z,
	              "XYZ",
	            )
	            const deltaScale = attached.scale.clone()
	            const nextObjects = snapshot.objects.map((object) => {
	              const sourcePosition = new THREE.Vector3(object.position.x, object.position.y, object.position.z)
	              const relative = sourcePosition.sub(logicalOriginVector)
	              relative.multiply(deltaScale)
	              relative.applyEuler(deltaRotation)
	              const nextPosition = logicalOriginVector.clone().add(relative).add(delta)
		              return {
		                id: object.id,
		                patch: {
		                  panoramaBinding: undefined,
		                  position: {
	                    x: Number(nextPosition.x.toFixed(3)),
	                    y: Number(nextPosition.y.toFixed(3)),
	                    z: Number(nextPosition.z.toFixed(3)),
	                  },
	                  rotation: {
	                    x: Number((object.rotation.x + THREE.MathUtils.radToDeg(deltaRotation.x)).toFixed(2)),
	                    y: Number((object.rotation.y + THREE.MathUtils.radToDeg(deltaRotation.y)).toFixed(2)),
	                    z: Number((object.rotation.z + THREE.MathUtils.radToDeg(deltaRotation.z)).toFixed(2)),
	                  },
	                  scale: {
	                    x: Number((object.scale.x * deltaScale.x).toFixed(4)),
	                    y: Number((object.scale.y * deltaScale.y).toFixed(4)),
	                    z: Number((object.scale.z * deltaScale.z).toFixed(4)),
	                  },
	                },
	              }
	            })
            stateRef.current = {
              ...stateRef.current,
              objects: stateRef.current.objects.map((object) => {
                const next = nextObjects.find((item) => item.id === object.id)
                return next ? { ...object, ...next.patch } : object
              }),
            }
            if (options.commit || !pack.transformControls.dragging) {
              nextObjects.forEach((item) => onObjectTransformRef.current(item.id, item.patch))
              pack.groupTransformSnapshot = undefined
            }
            return
          }
		      if (stateRef.current.cameras.some((camera) => camera.id === attachedId)) {
		        const camera = stateRef.current.cameras.find((item) => item.id === attachedId)
		        const logicalPosition = directorConsoleVectorFromWorld(attached.position, stateRef.current)
		        const position = { x: Number(snapValue(logicalPosition.x).toFixed(3)), y: Number(snapValue(logicalPosition.y).toFixed(3)), z: Number(snapValue(logicalPosition.z).toFixed(3)) }
		        const delta = camera ? new THREE.Vector3(position.x - camera.position.x, position.y - camera.position.y, position.z - camera.position.z) : new THREE.Vector3()
		        const target = camera
		          ? {
		            x: Number((camera.target.x + delta.x).toFixed(3)),
		            y: Number((camera.target.y + delta.y).toFixed(3)),
		            z: Number((camera.target.z + delta.z).toFixed(3)),
		          }
		          : vectorFromThree(pack.orbitControls.target)
			        stateRef.current = {
			          ...stateRef.current,
			          cameras: stateRef.current.cameras.map((item) => item.id === attachedId ? { ...item, position, target } : item),
			        }
			        if (options.commit || !pack.transformControls.dragging) {
			          onDirectorCameraChangeRef.current({
			            position,
			            target,
			          })
			        }
				        return
		      }
		      const logicalPosition = directorConsoleVectorFromWorld(attached.getWorldPosition(new THREE.Vector3()), stateRef.current)
		      const sourceObject = stateRef.current.objects.find((object) => object.id === attachedId)
		      const uniformScale = clampWorkflowNumber(Number(sourceObject?.uniformScale ?? 1), 0.1, 10)
		      const patch: Partial<LibTvDirectorConsole3DObject> = {
	        panoramaBinding: undefined,
	        position: { x: snapValue(logicalPosition.x), y: snapValue(logicalPosition.y), z: snapValue(logicalPosition.z) },
	        rotation: { x: Number(THREE.MathUtils.radToDeg(attached.rotation.x).toFixed(2)), y: Number(THREE.MathUtils.radToDeg(attached.rotation.y).toFixed(2)), z: Number(THREE.MathUtils.radToDeg(attached.rotation.z).toFixed(2)) },
	        scale: { x: Number((attached.scale.x / uniformScale).toFixed(4)), y: Number((attached.scale.y / uniformScale).toFixed(4)), z: Number((attached.scale.z / uniformScale).toFixed(4)) },
	      }
			      stateRef.current = {
			        ...stateRef.current,
			        objects: stateRef.current.objects.map((object) => object.id === attachedId ? { ...object, ...patch } : object),
			      }
			      const attachedGroup = pack.meshes.get(attachedId) as THREE.Group | undefined
			      if (attachedGroup) {
			        attachedGroup.userData.directorTransformKey = getDirectorObjectTransformKey({ ...stateRef.current.objects.find((object) => object.id === attachedId), ...patch } as LibTvDirectorConsole3DObject)
			      }
			      if (options.commit || !pack.transformControls.dragging) {
			        pack.lastCommittedTransformPatch = { id: attachedId, patch }
			        onObjectTransformRef.current(attachedId, patch)
			      }
		    }
	    const handleTransformMouseDown = () => {
	      lastGizmoPointerTime = performance.now()
	      pack.transformDraggingId = pack.attachedTransformId
	      pack.transformMoved = false
	      orbitControls.enabled = false
	    }
		    const handleTransformMouseUp = () => {
		      lastGizmoPointerTime = performance.now()
		      handleTransformObjectChange({ commit: true })
	      orbitControls.enabled = viewModeRef.current === "director"
	      window.requestAnimationFrame(() => {
	        if (disposed) return
	        pack.transformDraggingId = undefined
	        pack.transformMoved = false
	        pack.renderedStateKey = ""
	        pack.renderedSelectionKey = undefined
	      })
	    }
	    orbitControls.addEventListener("start", handleOrbitStart)
	    orbitControls.addEventListener("change", handleOrbitChange)
	    orbitControls.addEventListener("end", handleOrbitEnd)
	    transformControls.addEventListener("dragging-changed", handleTransformDrag)
	    transformControls.addEventListener("objectChange", handleTransformObjectChange)
	    transformControls.addEventListener("mouseDown", handleTransformMouseDown)
	    transformControls.addEventListener("mouseUp", handleTransformMouseUp)
	    renderer.domElement.addEventListener("pointerdown", handleTransformPointerDownCapture, true)
    renderer.domElement.addEventListener("wheel", handleTransformWheelCapture, { capture: true, passive: false })
	    renderer.domElement.addEventListener("pointerdown", handlePointerDown)
	    renderer.domElement.addEventListener("pointermove", handlePointerMove)
	    renderer.domElement.addEventListener("pointerup", handlePointerUp)
	    renderer.domElement.addEventListener("pointercancel", handlePointerUp)
	    renderer.domElement.addEventListener("dblclick", handleDoubleClick)

    return () => {
      disposed = true
      pack.disposed = true
      cancelAnimationFrame(animationId)
      observer.disconnect()
	      orbitControls.removeEventListener("start", handleOrbitStart)
	      orbitControls.removeEventListener("change", handleOrbitChange)
	      orbitControls.removeEventListener("end", handleOrbitEnd)
	      transformControls.removeEventListener("dragging-changed", handleTransformDrag)
	      transformControls.removeEventListener("objectChange", handleTransformObjectChange)
	      transformControls.removeEventListener("mouseDown", handleTransformMouseDown)
	      transformControls.removeEventListener("mouseUp", handleTransformMouseUp)
      renderer.domElement.removeEventListener("pointerdown", handleTransformPointerDownCapture, true)
      renderer.domElement.removeEventListener("wheel", handleTransformWheelCapture, true)
	      renderer.domElement.removeEventListener("pointerdown", handlePointerDown)
	      renderer.domElement.removeEventListener("pointermove", handlePointerMove)
	      renderer.domElement.removeEventListener("pointerup", handlePointerUp)
	      renderer.domElement.removeEventListener("pointercancel", handlePointerUp)
	      renderer.domElement.removeEventListener("dblclick", handleDoubleClick)
      transformControls.dispose()
      orbitControls.dispose()
      pack.previewRenderers.forEach((previewRenderer) => previewRenderer.dispose())
      pack.previewRenderers.clear()
      renderer.domElement.remove()
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose?.()
        const material = mesh.material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material?.dispose?.()
      })
      pack.environmentTexture?.dispose()
      renderer.dispose()
      scenePackRef.current = null
    }
  }, [])

  React.useImperativeHandle(ref, () => ({
    capture: (cameraInput?: string | LibTvDirectorConsole3DCamera | null) => {
      const pack = scenePackRef.current
      if (!pack) return null
      const state = stateRef.current
      const currentSize = new THREE.Vector2()
      pack.renderer.getSize(currentSize)
      const currentRatio = currentSize.y > 0 ? currentSize.x / currentSize.y : 16 / 9
      if (cameraInput === null || typeof cameraInput === "undefined") {
        const activeCamera = state.cameras.find((item) => item.id === state.activeCameraId) || state.cameras[0]
        const captureRatio = pack.viewMode === "camera" && activeCamera
          ? parseDirectorAspectRatio(activeCamera.aspectRatio, DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO).ratio
          : currentRatio
        const width = captureRatio >= 1 ? 1280 : Math.round(1280 * captureRatio)
        const height = captureRatio >= 1 ? Math.round(1280 / captureRatio) : 1280
        renderDirectorConsoleScene(pack, state)
        const restoreEditorHelpers = hideDirectorConsoleEditorHelpers(pack)
        const captureCamera = pack.viewMode === "camera" && activeCamera
          ? configureThreeCameraFromDirectorCameraState(pack.shotCamera, activeCamera, state, width / height)
          : pack.directorCamera.clone()
        captureCamera.aspect = width / height
        captureCamera.updateProjectionMatrix()
        const panoramaObjects = syncDirectorPanoramaBoundObjects(pack, state, captureCamera, { restoreAfterRender: true })
        let dataUrl = ""
        try {
          dataUrl = captureDirectorSceneDataUrl(pack.renderer, pack.scene, captureCamera, width, height)
        } finally {
          panoramaObjects.restore()
          restoreEditorHelpers()
        }
        return { dataUrl, width, height }
      }
      const camera = typeof cameraInput === "object"
        ? cameraInput
        : state.cameras.find((item) => item.id === cameraInput) || state.cameras.find((item) => item.id === state.activeCameraId) || state.cameras[0]
      if (!camera) return null
	      const aspect = parseDirectorAspectRatio(camera.aspectRatio, DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO)
	      const width = aspect.ratio >= 1 ? 1280 : Math.round(1280 * aspect.ratio)
	      const height = aspect.ratio >= 1 ? Math.round(1280 / aspect.ratio) : 1280
      const captureCamera = configureThreeCameraFromDirectorCameraState(pack.shotCamera, camera, state, aspect.ratio)
      renderDirectorConsoleScene(pack, state)
      const restoreEditorHelpers = hideDirectorConsoleEditorHelpers(pack)
      const panoramaObjects = syncDirectorPanoramaBoundObjects(pack, state, captureCamera, { restoreAfterRender: true })
      let dataUrl = ""
      try {
        dataUrl = captureDirectorSceneDataUrl(pack.renderer, pack.scene, captureCamera, width, height)
      } finally {
        panoramaObjects.restore()
        restoreEditorHelpers()
      }
      return { dataUrl, width, height }
    },
    renderAnimationVideoFrame: (canvas, frameState, aspectRatio) => {
      const pack = scenePackRef.current
      const outputContext = canvas.getContext("2d")
      const camera = frameState.cameras.find((item) => item.id === frameState.activeCameraId) || frameState.cameras[0]
      if (!pack || !outputContext || !camera) return false
      const rendererSize = new THREE.Vector2()
      pack.renderer.getSize(rendererSize)
      if (rendererSize.x <= 0 || rendererSize.y <= 0) return false
      const previousMotionPathsVisible = pack.motionPathsVisible
      const previousHideCameraElements = pack.hideCameraElements
      const previousActiveMotionPath = pack.activeMotionPath
      const previousHiddenMotionPathTargetId = pack.hiddenMotionPathTargetId
      pack.motionPathsVisible = false
      pack.hideCameraElements = true
      pack.activeMotionPath = undefined
      pack.hiddenMotionPathTargetId = undefined
      pack.renderedStateKey = ""
      pack.renderedSelectionKey = undefined
      try {
        renderDirectorConsoleScene(pack, frameState)
        pack.transformControls.enabled = false
        pack.transformHelper.visible = false
        const restoreVideoHelpers = hideDirectorConsoleVideoHelpers(pack)
        let restorePanoramaObjects = () => {}
        try {
          const captureCamera = configureThreeCameraFromDirectorCameraState(
            pack.shotCamera,
            camera,
            frameState,
            rendererSize.x / rendererSize.y,
          )
          restorePanoramaObjects = syncDirectorPanoramaBoundObjects(pack, frameState, captureCamera, { restoreAfterRender: true }).restore
          pack.renderer.setScissorTest(false)
          pack.renderer.setViewport(0, 0, rendererSize.x, rendererSize.y)
          pack.renderer.clear(true, true, true)
          syncDirectorSkinnedMeshesBeforeRender(pack.scene)
          pack.renderer.render(pack.scene, captureCamera)
          return drawDirectorAnimationVideoFrame(pack.renderer.domElement, canvas, outputContext, aspectRatio)
        } finally {
          restorePanoramaObjects()
          restoreVideoHelpers()
        }
      } finally {
        pack.motionPathsVisible = previousMotionPathsVisible
        pack.hideCameraElements = previousHideCameraElements
        pack.activeMotionPath = previousActiveMotionPath
        pack.hiddenMotionPathTargetId = previousHiddenMotionPathTargetId
        pack.renderedStateKey = ""
        pack.renderedSelectionKey = undefined
        pack.needsRender = true
        if (pack.videoRecordingMode) {
          pack.transformControls.enabled = false
          pack.transformHelper.visible = false
        }
      }
    },
    setVideoRecordingMode: (recording) => {
      const pack = scenePackRef.current
      if (!pack || pack.videoRecordingMode === recording) return
      pack.videoRecordingMode = recording
      if (recording) {
        pack.orbitControls.enabled = false
        pack.transformControls.enabled = false
        pack.transformHelper.visible = false
      }
      pack.renderedStateKey = ""
      pack.renderedSelectionKey = undefined
      pack.needsRender = true
    },
    renderCameraPreview: (canvas, cameraInput) => {
      const pack = scenePackRef.current
      if (!pack) return false
      const state = stateRef.current
      const camera = typeof cameraInput === "object"
        ? cameraInput
        : state.cameras.find((item) => item.id === cameraInput) || state.cameras.find((item) => item.id === state.activeCameraId) || state.cameras[0]
      if (!camera) return false
      let previewRenderer = pack.previewRenderers.get(canvas)
      if (!previewRenderer) {
        previewRenderer = new THREE.WebGLRenderer({ canvas, antialias: true })
        previewRenderer.outputColorSpace = THREE.SRGBColorSpace
        previewRenderer.shadowMap.enabled = true
        previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap
        pack.previewRenderers.set(canvas, previewRenderer)
      }
      const previewWidth = 240
      const previewHeight = 135
      const aspect = parseDirectorAspectRatio(camera.aspectRatio, DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO)
      previewRenderer.setSize(previewWidth, previewHeight, false)
      previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderDirectorConsoleScene(pack, state)
      const previewCamera = configureThreeCameraFromDirectorCameraState(new THREE.PerspectiveCamera(50, aspect.ratio, 0.1, 2000), camera, state, aspect.ratio)
      const restoreEditorHelpers = hideDirectorConsoleEditorHelpers(pack)
      const panoramaObjects = syncDirectorPanoramaBoundObjects(pack, state, previewCamera, { restoreAfterRender: true })
      try {
        renderDirectorSceneContained(previewRenderer, pack.scene, previewCamera, previewWidth, previewHeight, aspect.ratio)
      } finally {
        panoramaObjects.restore()
        restoreEditorHelpers()
      }
      return true
    },
	    resetView: () => {
	      const pack = scenePackRef.current
	      if (!pack) return
	      animateDirectorEditorCameraDirection(pack, new THREE.Vector3(0, 1, 10), 550)
	    },
    setPresetView: (view) => {
      const pack = scenePackRef.current
      if (!pack) return
	      const direction = new THREE.Vector3()
	      if (view === "top") direction.set(0, 1, 0.001)
	      else if (view === "bottom") direction.set(0, -1, 0.001)
	      else if (view === "right") direction.set(1, 0, 0)
	      else if (view === "left") direction.set(-1, 0, 0)
	      else if (view === "back") direction.set(0, 0, -1)
	      else direction.set(0, 0, 1)
	      animateDirectorEditorCameraDirection(pack, direction, 550)
    },
	    getDirectorCameraState: () => {
	      const pack = scenePackRef.current
	      if (!pack) return null
	      return {
	        position: directorConsoleVectorFromWorld(pack.directorCamera.position, stateRef.current),
	        target: directorConsoleVectorFromWorld(pack.orbitControls.target, stateRef.current),
	      }
	    },
		    getGroundPositionFromViewportCenter: () => {
		      const pack = scenePackRef.current
		      if (!pack) return null
		      const rect = pack.renderer.domElement.getBoundingClientRect()
		      const point = getDirectorConsoleGroundPositionFromScreen(pack, rect.left + rect.width / 2, rect.top + rect.height / 2, stateRef.current)
		      return point ? vectorFromThree(point) : null
		    },
		    getGroundPositionFromClient: (clientX, clientY) => {
		      const pack = scenePackRef.current
		      if (!pack) return null
		      const point = getDirectorConsoleGroundPositionFromScreen(pack, clientX, clientY, stateRef.current)
		      return point ? vectorFromThree(point) : null
		    },
			    getCharacterScaleForViewportRect: (position, viewportRect) => {
		      const pack = scenePackRef.current
		      if (!pack) return null
		      const canvasRect = pack.renderer.domElement.getBoundingClientRect()
		      if (canvasRect.height <= 0) return null
		      const state = stateRef.current
		      const foot = directorConsoleVectorToWorld(position, state)
		      const head = directorConsoleVectorToWorld({ ...position, y: position.y + 1.75 }, state)
		      pack.directorCamera.updateMatrixWorld()
		      const footNdc = foot.project(pack.directorCamera)
		      const headNdc = head.project(pack.directorCamera)
		      const projectedHeight = Math.abs(headNdc.y - footNdc.y) * canvasRect.height / 2
		      if (!Number.isFinite(projectedHeight) || projectedHeight < 1) return null
		      const desiredHeight = clampWorkflowNumber(viewportRect.height * canvasRect.height * 0.72, 56, canvasRect.height * 0.5)
			      return clampWorkflowNumber(desiredHeight / projectedHeight, 0.35, 5)
			    },
		    getCharacterPlacementForImageDetection: (detection, projection) => {
		      const pack = scenePackRef.current
		      if (!pack) return null
		      return getDirectorDetectedCharacterPlacement(pack, stateRef.current, detection, projection)
		    },
			    isEnvironmentReady: (environmentUrl) => {
			      const pack = scenePackRef.current
			      return Boolean(pack?.environmentTexture && pack.environmentUrl === String(environmentUrl || '').trim())
			    },
			    getEnvironmentImageSize: (environmentUrl) => {
			      const pack = scenePackRef.current
			      if (!pack?.environmentTexture || pack.environmentUrl !== String(environmentUrl || '').trim()) return null
			      const size = getDirectorPanoramaTextureSize(pack.environmentTexture)
			      return size.width > 1 && size.height > 1 ? size : null
			    },
		    getObjectIdsInViewportRect: (viewportRect) => {
		      const pack = scenePackRef.current
		      if (!pack) return []
		      return getDirectorObjectIdsInViewportRect(pack, stateRef.current, viewportRect)
		    },
		    getPanoramaAnchorFromViewportRect: (viewportRect) => {
		      const pack = scenePackRef.current
		      if (!pack) return null
		      return getDirectorPanoramaAnchorFromViewportRect(pack, stateRef.current, viewportRect)
		    },
		    getViewportRectForPanoramaAnchor: (anchor) => {
		      const pack = scenePackRef.current
		      if (!pack) return null
		      return getDirectorViewportRectForPanoramaAnchor(pack, stateRef.current, anchor)
		    },
		    createPanoramaBinding: (anchor, position, rotationY, sourceDirectiveId) => {
		      const pack = scenePackRef.current
		      if (!pack) return null
		      return createDirectorPanoramaObjectBinding(pack, stateRef.current, anchor, position, rotationY, sourceDirectiveId)
		    },
		    createPanoramaMask: (viewportRect, anchor) => {
		      const pack = scenePackRef.current
		      if (!pack) return { error: "导演台画面尚未就绪" }
		      return createDirectorPanoramaUvMask(pack, stateRef.current, viewportRect, anchor)
		    },
		  }), [])

  return <div className="absolute inset-0 h-full w-full" ref={hostRef} style={{ touchAction: "none" }} />
})

function vectorFromThree(value: THREE.Vector3): LibTvDirectorConsole3DVector3 {
  return { x: Number(value.x.toFixed(3)), y: Number(value.y.toFixed(3)), z: Number(value.z.toFixed(3)) }
}

function directorCameraEaseInOutCubic(progress: number) {
  const value = THREE.MathUtils.clamp(progress, 0, 1)
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2
}

function animateDirectorEditorCameraDirection(pack: DirectorConsole3DScenePack, direction: THREE.Vector3, durationMs = 550) {
  const target = pack.orbitControls.target.clone()
  const measuredDistance = pack.directorCamera.position.distanceTo(target)
  const distance = Number.isFinite(measuredDistance) && measuredDistance > 0 ? measuredDistance : Math.hypot(0, 1, 10)
  const normalizedDirection = direction.clone().normalize()
  pack.editorCameraAnimation = {
    startedAt: performance.now(),
    durationMs,
    fromPosition: pack.directorCamera.position.clone(),
    toPosition: target.clone().addScaledVector(normalizedDirection, distance),
    fromTarget: target.clone(),
    toTarget: target.clone(),
  }
  pack.needsRender = true
}

function updateDirectorEditorCameraAnimation(pack: DirectorConsole3DScenePack) {
  const animation = pack.editorCameraAnimation
  if (!animation) return false
  const progress = THREE.MathUtils.clamp((performance.now() - animation.startedAt) / animation.durationMs, 0, 1)
  const eased = directorCameraEaseInOutCubic(progress)
  pack.directorCamera.position.lerpVectors(animation.fromPosition, animation.toPosition, eased)
  pack.orbitControls.target.lerpVectors(animation.fromTarget, animation.toTarget, eased)
  pack.directorCamera.lookAt(pack.orbitControls.target)
  pack.target.copy(pack.orbitControls.target)
  pack.needsRender = true
  if (progress >= 1) {
    pack.editorCameraAnimation = undefined
    pack.orbitControls.update()
  }
  return true
}

function syncDirectorEditorCameraToShot(pack: DirectorConsole3DScenePack, camera: LibTvDirectorConsole3DCamera, state: LibTvDirectorConsole3DState) {
  const target = getDirectorConsoleCameraTarget(camera, state)
  pack.editorCameraAnimation = undefined
  pack.directorCamera.position.copy(pack.shotCamera.position)
  pack.directorCamera.quaternion.copy(pack.shotCamera.quaternion)
  pack.directorCamera.fov = pack.shotCamera.fov
  pack.directorCamera.zoom = pack.shotCamera.zoom
  pack.directorCamera.updateProjectionMatrix()
  pack.orbitControls.target.copy(target)
  pack.target.copy(target)
  pack.needsRender = true
}

function getDirectorConsoleDefaultEditorPose(state: LibTvDirectorConsole3DState) {
  const sceneScale = clampWorkflowNumber(Number(state.sceneScale || 3), 0.1, 10)
  const target = new THREE.Vector3(
    DIRECTOR_SCENE_CAMERA_TARGET.x * sceneScale,
    DIRECTOR_SCENE_CAMERA_TARGET.y * sceneScale,
    DIRECTOR_SCENE_CAMERA_TARGET.z * sceneScale,
  )
  const position = new THREE.Vector3(
    DIRECTOR_SCENE_CAMERA_POSITION.x * sceneScale,
    DIRECTOR_SCENE_CAMERA_POSITION.y * sceneScale,
    DIRECTOR_SCENE_CAMERA_POSITION.z * sceneScale,
  )
  return { target, position }
}

function hideDirectorConsoleEditorHelpers(pack: DirectorConsole3DScenePack) {
  const entries: Array<{ object: THREE.Object3D; visible: boolean }> = []
  const remember = (object: THREE.Object3D) => {
    entries.push({ object, visible: object.visible })
    object.visible = false
  }
  remember(pack.transformHelper)
  remember(pack.grid)
  pack.cameraHelpers.forEach((helper) => remember(helper))
  pack.cameraGuides.forEach((guide) => remember(guide))
  pack.selectionHelpers.forEach((helper) => remember(helper))
  pack.motionPathHelpers.forEach((helper) => remember(helper))
  if (pack.motionPathDraftHelper) remember(pack.motionPathDraftHelper)
  pack.group.traverse((object) => {
    if (object.userData?.isDirectorCharacterLabel) remember(object)
  })
  return () => {
    for (const entry of entries) entry.object.visible = entry.visible
  }
}

function hideDirectorConsoleVideoHelpers(pack: DirectorConsole3DScenePack) {
  const entries: Array<{ object: THREE.Object3D; visible: boolean }> = []
  const remember = (object: THREE.Object3D) => {
    entries.push({ object, visible: object.visible })
    object.visible = false
  }
  remember(pack.transformHelper)
  pack.cameraHelpers.forEach((helper) => remember(helper))
  pack.cameraGuides.forEach((guide) => remember(guide))
  pack.selectionHelpers.forEach((helper) => remember(helper))
  pack.motionPathHelpers.forEach((helper) => remember(helper))
  if (pack.motionPathDraftHelper) remember(pack.motionPathDraftHelper)
  return () => {
    for (const entry of entries) entry.object.visible = entry.visible
  }
}

function hideDirectorConsoleCameraViewHelpers(pack: DirectorConsole3DScenePack) {
  const entries: Array<{ object: THREE.Object3D; visible: boolean }> = []
  const remember = (object: THREE.Object3D) => {
    entries.push({ object, visible: object.visible })
    object.visible = false
  }
  remember(pack.transformHelper)
  pack.cameraHelpers.forEach((helper) => remember(helper))
  pack.cameraGuides.forEach((guide) => remember(guide))
  pack.selectionHelpers.forEach((helper) => remember(helper))
  pack.motionPathHelpers.forEach((helper) => remember(helper))
  if (pack.motionPathDraftHelper) remember(pack.motionPathDraftHelper)
  pack.group.traverse((object) => {
    if (object.userData?.isDirectorCharacterLabel) remember(object)
  })
  return () => {
    for (const entry of entries) entry.object.visible = entry.visible
  }
}

function configureThreeCameraFromDirectorCameraState(camera: THREE.PerspectiveCamera, data: LibTvDirectorConsole3DCamera, state: LibTvDirectorConsole3DState, aspectRatio?: number) {
  const target = getDirectorConsoleCameraTarget(data, state)
  const position = directorConsoleVectorToWorld(data.position, state)
  camera.fov = data.fov
  camera.aspect = aspectRatio || parseDirectorAspectRatio(data.aspectRatio).ratio
  camera.position.copy(position)
  camera.lookAt(target)
  camera.updateProjectionMatrix()
  return camera
}

function buildDirectorStageGrid() {
  const grid = new THREE.Group()
  const material = new THREE.ShaderMaterial({
    uniforms: {
      minorColor: { value: new THREE.Color(0x59615e) },
      majorColor: { value: new THREE.Color(0x75807b) },
      xAxisColor: { value: new THREE.Color(0xdf665f) },
      groundYAxisColor: { value: new THREE.Color(0x58c7b5) },
    },
    vertexShader: `
      varying vec2 vGridPosition;

      void main() {
        vGridPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vGridPosition;
      uniform vec3 minorColor;
      uniform vec3 majorColor;
      uniform vec3 xAxisColor;
      uniform vec3 groundYAxisColor;

      float gridLine(vec2 point, float spacing, float width) {
        vec2 coordinate = point / spacing;
        vec2 derivative = max(fwidth(coordinate), vec2(0.0001)) * width;
        vec2 distanceToLine = abs(fract(coordinate - 0.5) - 0.5) / derivative;
        return 1.0 - min(min(distanceToLine.x, distanceToLine.y), 1.0);
      }

      float axisLine(float distanceFromAxis, float width) {
        float derivative = max(fwidth(distanceFromAxis), 0.0001) * width;
        return 1.0 - smoothstep(0.0, derivative, abs(distanceFromAxis));
      }

      void main() {
        vec2 footprint = fwidth(vGridPosition);
        float pixelFootprint = max(footprint.x, footprint.y);
        float minorFade = 1.0 - smoothstep(0.18, 0.52, pixelFootprint);
        float majorFade = 1.0 - smoothstep(1.2, 4.0, pixelFootprint);
        float minor = gridLine(vGridPosition, 1.0, 1.05) * minorFade;
        float major = gridLine(vGridPosition, 5.0, 1.35) * majorFade;
        float xAxis = axisLine(vGridPosition.y, 1.5);
        float groundYAxis = axisLine(vGridPosition.x, 1.5);

        vec3 color = mix(minorColor, majorColor, major);
        float alpha = max(minor * 0.82, major * 0.96);
        color = mix(color, xAxisColor, xAxis);
        alpha = max(alpha, xAxis * 0.98);
        color = mix(color, groundYAxisColor, groundYAxis);
        alpha = max(alpha, groundYAxis * 0.98);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  })
  const helper = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material)
  helper.rotation.x = -Math.PI / 2
  helper.renderOrder = 2
  grid.add(helper)
  grid.traverse((object) => {
    object.userData.isDirectorStageGrid = true
  })
  return grid
}

function updateDirectorStageGridLoading(grid: THREE.Object3D) {
  grid.updateMatrixWorld()
}

function directorConsoleScenePosition(state: LibTvDirectorConsole3DState) {
  return state.scenePosition || { x: 0, y: 0, z: 0 }
}

function directorConsoleSceneRotation(state: LibTvDirectorConsole3DState) {
  return state.sceneRotation || { x: 0, y: 0, z: 0 }
}

function applyDirectorConsoleSceneTransform(pack: DirectorConsole3DScenePack, state: LibTvDirectorConsole3DState) {
  const sceneScale = clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)
  const scenePosition = directorConsoleScenePosition(state)
  const sceneRotation = directorConsoleSceneRotation(state)
  pack.group.position.set(scenePosition.x, scenePosition.y, scenePosition.z)
  pack.group.rotation.set(THREE.MathUtils.degToRad(sceneRotation.x), THREE.MathUtils.degToRad(sceneRotation.y), THREE.MathUtils.degToRad(sceneRotation.z))
  pack.group.scale.setScalar(sceneScale)
  const localGroundHeight = Number(state.groundHeight || 0) / sceneScale
  pack.grid.position.set(0, localGroundHeight + 0.002 / sceneScale, 0)
  pack.grid.rotation.set(0, 0, 0)
  pack.grid.scale.setScalar(1)
  pack.grid.visible = state.groundVisible !== false
  pack.ground.position.set(0, localGroundHeight, 0)
  pack.ground.rotation.set(-Math.PI / 2, 0, 0)
  pack.ground.scale.setScalar(1)
  pack.ground.visible = state.groundVisible !== false
  const groundMaterial = pack.ground.material as THREE.MeshStandardMaterial
  groundMaterial.opacity = clampWorkflowNumber(Number(state.groundOpacity ?? DIRECTOR_STAGE_GROUND_OPACITY), 0, 1)
  groundMaterial.needsUpdate = true
}

function getDirectorConsoleSceneMatrix(state: LibTvDirectorConsole3DState) {
  const sceneScale = clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)
  const scenePosition = directorConsoleScenePosition(state)
  const sceneRotation = directorConsoleSceneRotation(state)
  const matrix = new THREE.Matrix4()
  matrix.compose(
    new THREE.Vector3(scenePosition.x, scenePosition.y, scenePosition.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(sceneRotation.x), THREE.MathUtils.degToRad(sceneRotation.y), THREE.MathUtils.degToRad(sceneRotation.z), "XYZ")),
    new THREE.Vector3(sceneScale, sceneScale, sceneScale),
  )
  return matrix
}

function directorConsoleVectorToWorld(value: LibTvDirectorConsole3DVector3, state: LibTvDirectorConsole3DState) {
  return new THREE.Vector3(value.x, value.y, value.z).applyMatrix4(getDirectorConsoleSceneMatrix(state))
}

function directorConsoleVectorFromWorld(value: THREE.Vector3, state: LibTvDirectorConsole3DState) {
  const logical = value.clone().applyMatrix4(getDirectorConsoleSceneMatrix(state).invert())
  return vectorFromThree(logical)
}

function getDirectorConsoleCameraTarget(camera: LibTvDirectorConsole3DCamera, state: LibTvDirectorConsole3DState) {
  const targetObject = camera.targetObjectId ? state.objects.find((object) => object.id === camera.targetObjectId) : null
  const target = targetObject ? new THREE.Vector3(targetObject.position.x, targetObject.position.y + 1, targetObject.position.z) : new THREE.Vector3(camera.target.x, camera.target.y, camera.target.z)
  return target.applyMatrix4(getDirectorConsoleSceneMatrix(state))
}

function pickDirectorConsoleObject(pack: DirectorConsole3DScenePack, x: number, y: number, width: number, height: number, viewMode: "director" | "camera") {
  const camera = viewMode === "camera" ? pack.shotCamera : pack.directorCamera
  pack.pointer.set((x / width) * 2 - 1, -(y / height) * 2 + 1)
  pack.raycaster.setFromCamera(pack.pointer, camera)
  const objectHit = pickDirectorConsoleObjectFromHits(pack.raycaster.intersectObjects([...pack.meshes.values()], true))
  if (objectHit) return objectHit
  if (pack.hideCameraElements) return null
  return pickDirectorConsoleObjectFromHits(pack.raycaster.intersectObjects([...pack.cameraHelpers.values()], true))
}

function pickDirectorConsoleCameraFovHandle(
  pack: DirectorConsole3DScenePack,
  x: number,
  y: number,
  width: number,
  height: number,
  viewMode: "director" | "camera",
  state: LibTvDirectorConsole3DState,
) {
  if (pack.hideCameraElements) return null
  const activeId = state.activeObjectId
  if (!activeId || !state.cameras.some((camera) => camera.id === activeId)) return null
  const camera = viewMode === "camera" ? pack.shotCamera : pack.directorCamera
  pack.pointer.set((x / width) * 2 - 1, -(y / height) * 2 + 1)
  pack.raycaster.setFromCamera(pack.pointer, camera)
  const guide = pack.cameraGuides.get(activeId)
  const hits = guide ? pack.raycaster.intersectObjects([guide], true) : []
  for (const hit of hits) {
    let cursor: THREE.Object3D | null = hit.object
    while (cursor) {
      if (cursor.userData?.isCameraFovHandle) {
        const activeCamera = state.cameras.find((item) => item.id === activeId)
        return activeCamera ? { id: activeCamera.id, fov: activeCamera.fov } : null
      }
      cursor = cursor.parent
    }
  }
  return null
}

function pickDirectorConsoleObjectFromHits(hits: THREE.Intersection[]) {
  for (const hit of hits) {
    let cursor: THREE.Object3D | null = hit.object
    let skipped = false
    while (cursor) {
      if (cursor.userData?.isCameraDirectionGuide || cursor.userData?.isCameraFovHandle || cursor.userData?.isDirectorCameraPickProxy === false) {
        skipped = true
        break
      }
      cursor = cursor.parent
    }
    if (skipped) continue
    cursor = hit.object
    while (cursor) {
      const id = cursor.userData?.directorObjectId
      if (id) return { id: String(id) }
      cursor = cursor.parent
    }
  }
  return null
}

function getDirectorObjectIdsInViewportRect(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  viewportRect: LibTvDirectorConsole3DDirective["rect"],
) {
  renderDirectorConsoleScene(pack, state)
  pack.scene.updateMatrixWorld(true)
  const camera = pack.viewMode === "camera" ? pack.shotCamera : pack.directorCamera
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  syncDirectorPanoramaBoundObjects(pack, state, camera)
  pack.scene.updateMatrixWorld(true)
  const rect = normalizeDirectorDirectiveRect(viewportRect)
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3())

  return state.objects
    .filter((object) => object.visible !== false)
    .filter((object) => {
      const mesh = pack.meshes.get(object.id)
      if (!mesh) return false
      const bounds = new THREE.Box3().setFromObject(mesh)
      if (bounds.isEmpty()) return false
      corners[0].set(bounds.min.x, bounds.min.y, bounds.min.z)
      corners[1].set(bounds.min.x, bounds.min.y, bounds.max.z)
      corners[2].set(bounds.min.x, bounds.max.y, bounds.min.z)
      corners[3].set(bounds.min.x, bounds.max.y, bounds.max.z)
      corners[4].set(bounds.max.x, bounds.min.y, bounds.min.z)
      corners[5].set(bounds.max.x, bounds.min.y, bounds.max.z)
      corners[6].set(bounds.max.x, bounds.max.y, bounds.min.z)
      corners[7].set(bounds.max.x, bounds.max.y, bounds.max.z)

      let minX = Number.POSITIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let maxY = Number.NEGATIVE_INFINITY
      let inFront = false
      for (const corner of corners) {
        const cameraSpace = corner.clone().applyMatrix4(camera.matrixWorldInverse)
        if (cameraSpace.z < 0) inFront = true
        const projected = corner.clone().project(camera)
        if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) continue
        const x = (projected.x + 1) / 2
        const y = (1 - projected.y) / 2
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
      if (!inFront || !Number.isFinite(minX) || !Number.isFinite(minY)) return false
      return maxX >= rect.x && minX <= right && maxY >= rect.y && minY <= bottom
    })
    .map((object) => object.id)
}

function getDirectorConsoleGroundPositionFromScreen(pack: DirectorConsole3DScenePack, clientX: number, clientY: number, state: LibTvDirectorConsole3DState) {
  const rect = pack.renderer.domElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  pack.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2) + 1)
  pack.raycaster.setFromCamera(pack.pointer, pack.directorCamera)
  pack.group.updateWorldMatrix(true, false)
  pack.ground.updateWorldMatrix(true, false)
  const groundNormal = new THREE.Vector3(0, 0, 1).transformDirection(pack.ground.matrixWorld)
  const groundPoint = pack.ground.getWorldPosition(new THREE.Vector3())
  const groundPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(groundNormal, groundPoint)
  const worldPoint = new THREE.Vector3()
  if (!pack.raycaster.ray.intersectPlane(groundPlane, worldPoint)) {
    return new THREE.Vector3(DIRECTOR_SCENE_CAMERA_TARGET.x, 0, DIRECTOR_SCENE_CAMERA_TARGET.z)
  }
  const logical = directorConsoleVectorFromWorld(worldPoint, state)
  logical.y = Number(state.groundHeight || 0) / clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)
  return new THREE.Vector3(logical.x, logical.y, logical.z)
}

function getDirectorGroundPlane(pack: DirectorConsole3DScenePack) {
  pack.group.updateWorldMatrix(true, false)
  pack.ground.updateWorldMatrix(true, false)
  const groundNormal = new THREE.Vector3(0, 0, 1).transformDirection(pack.ground.matrixWorld)
  const groundPoint = pack.ground.getWorldPosition(new THREE.Vector3())
  return new THREE.Plane().setFromNormalAndCoplanarPoint(groundNormal, groundPoint)
}

function getDirectorPanoramaDirectionFromUv(u: number, v: number, rotation: number) {
  const theta = THREE.MathUtils.clamp(v, 0, 1) * Math.PI
  const phi = u * Math.PI * 2
  return new THREE.Vector3(
    Math.sin(theta) * Math.cos(phi),
    Math.cos(theta),
    Math.sin(theta) * Math.sin(phi),
  ).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).normalize()
}

function getDirectorPanoramaAnchorPlacementPoint(value: LibTvDirectorConsole3DPanoramaAnchor) {
  const anchor = normalizeDirectorPanoramaAnchor(value)
  if (!anchor) return null
  const fractionalIndex = anchor.points.length * 5 / 8
  const startIndex = Math.floor(fractionalIndex) % anchor.points.length
  const endIndex = (startIndex + 1) % anchor.points.length
  const amount = fractionalIndex - Math.floor(fractionalIndex)
  const start = anchor.points[startIndex]
  const end = anchor.points[endIndex]
  return {
    u: THREE.MathUtils.euclideanModulo(THREE.MathUtils.lerp(start.u, end.u, amount), 1),
    v: THREE.MathUtils.clamp(THREE.MathUtils.lerp(start.v, end.v, amount), 0, 1),
  }
}

function getDirectorPanoramaBindingFacingRotationY(
  binding: LibTvDirectorConsole3DPanoramaBinding,
  state: LibTvDirectorConsole3DState,
) {
  const panoramaRotation = THREE.MathUtils.degToRad(Number(state.panoramaRotation || 0))
  const logicalDirection = getDirectorPanoramaDirectionFromUv(binding.u, binding.v, panoramaRotation)
    .transformDirection(getDirectorConsoleSceneMatrix(state).invert())
  return THREE.MathUtils.radToDeg(Math.atan2(-logicalDirection.x, -logicalDirection.z))
}

function updateDirectorPanoramaBindingRotation(
  binding: LibTvDirectorConsole3DPanoramaBinding,
  state: LibTvDirectorConsole3DState,
  rotationY: number,
) {
  const facingRotationY = getDirectorPanoramaBindingFacingRotationY(binding, state)
  return {
    ...binding,
    rotationOffsetY: Number((THREE.MathUtils.euclideanModulo(rotationY - facingRotationY + 180, 360) - 180).toFixed(2)),
  }
}

function createDirectorPanoramaObjectBinding(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  anchorValue: LibTvDirectorConsole3DPanoramaAnchor,
  position: LibTvDirectorConsole3DVector3,
  rotationY: number,
  sourceDirectiveId?: string,
): LibTvDirectorConsole3DPanoramaBinding | null {
  const texture = pack.environmentTexture
  const point = getDirectorPanoramaAnchorPlacementPoint(anchorValue)
  const context = getDirectorPanoramaCameraContext(pack, state)
  const environmentFingerprint = getDirectorEnvironmentFingerprint(state.environmentUrl)
  if (
    !texture
    || !point
    || !context
    || !environmentFingerprint
    || !pack.panoramaSphere.visible
    || !usesDirectorEquirectangularEnvironment(texture, state)
  ) return null

  const direction = getDirectorPanoramaDirectionFromUv(
    point.u,
    point.v,
    THREE.MathUtils.degToRad(Number(state.panoramaRotation || 0)),
  )
  const relativePosition = directorConsoleVectorToWorld(position, state).sub(context.camera.position)
  const projectedDepth = relativePosition.dot(direction)
  const depth = projectedDepth > 0.1 ? projectedDepth : relativePosition.length()
  if (!Number.isFinite(depth) || depth <= 0.1) return null
  return updateDirectorPanoramaBindingRotation({
    projection: "equirectangular",
    environmentFingerprint,
    u: Number(point.u.toFixed(6)),
    v: Number(point.v.toFixed(6)),
    depth: Number(clampWorkflowNumber(depth, 0.1, 1500).toFixed(4)),
    rotationOffsetY: 0,
    sourceDirectiveId,
  }, state, rotationY)
}

type DirectorPanoramaObjectTransformSnapshot = {
  object: THREE.Object3D
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
  visible: boolean
  panoramaBound: boolean
}

function syncDirectorPanoramaBoundObjects(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  camera: THREE.Camera,
  options?: { restoreAfterRender?: boolean },
) {
  const snapshots: DirectorPanoramaObjectTransformSnapshot[] = options?.restoreAfterRender
    ? [...pack.meshes.values()].map((object) => ({
      object,
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
      visible: object.visible,
      panoramaBound: object.userData.directorPanoramaBound === true,
    }))
    : []
  const restore = () => {
    snapshots.forEach((snapshot) => {
      snapshot.object.position.copy(snapshot.position)
      snapshot.object.quaternion.copy(snapshot.quaternion)
      snapshot.object.scale.copy(snapshot.scale)
      snapshot.object.visible = snapshot.visible
      snapshot.object.userData.directorPanoramaBound = snapshot.panoramaBound
    })
    if (snapshots.length > 0) pack.group.updateWorldMatrix(true, true)
  }

  const texture = pack.environmentTexture
  const environmentFingerprint = getDirectorEnvironmentFingerprint(state.environmentUrl)
  if (
    !texture
    || !environmentFingerprint
    || !pack.panoramaSphere.visible
    || !usesDirectorEquirectangularEnvironment(texture, state)
  ) return { changed: false, restore }

  camera.updateMatrixWorld(true)
  pack.group.updateWorldMatrix(true, false)
  const inverseSceneMatrix = pack.group.matrixWorld.clone().invert()
  const panoramaRotation = THREE.MathUtils.degToRad(Number(state.panoramaRotation || 0))
  const draggingIds = new Set<string>()
  if (pack.transformControls.dragging && pack.transformDraggingId) {
    if (pack.transformDraggingId.startsWith("group:")) {
      const groupId = pack.transformDraggingId.slice(6)
      state.objectGroups?.find((group) => group.id === groupId)?.objectIds.forEach((id) => draggingIds.add(id))
    } else {
      draggingIds.add(pack.transformDraggingId)
    }
  }

  let changed = false
  for (const object of state.objects) {
    const binding = normalizeDirectorPanoramaBinding(object.panoramaBinding)
    const group = pack.meshes.get(object.id)
    if (
      !binding
      || !group
      || object.parentObjectId
      || draggingIds.has(object.id)
      || binding.environmentFingerprint !== environmentFingerprint
    ) continue

    const direction = getDirectorPanoramaDirectionFromUv(binding.u, binding.v, panoramaRotation)
    const worldPosition = camera.position.clone().addScaledVector(direction, binding.depth)
    const localPosition = worldPosition.applyMatrix4(inverseSceneMatrix)
    const rotationY = getDirectorPanoramaBindingFacingRotationY(binding, state) + binding.rotationOffsetY
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(object.rotation.x),
      THREE.MathUtils.degToRad(rotationY),
      THREE.MathUtils.degToRad(object.rotation.z),
      "XYZ",
    ))
    const uniformScale = clampWorkflowNumber(Number(object.uniformScale ?? 1), 0.1, 10)
    const scale = new THREE.Vector3(
      object.scale.x * uniformScale,
      object.scale.y * uniformScale,
      object.scale.z * uniformScale,
    )
    if (
      group.position.distanceToSquared(localPosition) > 1e-10
      || group.quaternion.angleTo(quaternion) > 1e-7
      || group.scale.distanceToSquared(scale) > 1e-10
    ) changed = true
    group.position.copy(localPosition)
    group.quaternion.copy(quaternion)
    group.scale.copy(scale)
    group.visible = object.visible !== false
    group.userData.directorPanoramaBound = true
    group.updateMatrixWorld(true)
  }
  if (changed) {
    pack.group.updateWorldMatrix(true, true)
    syncDirectorObjectAttachments(pack, state)
  }
  return { changed, restore }
}

function getDirectorCharacterFacingRotationY(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  position: LibTvDirectorConsole3DVector3,
  facing: LibTvDirectorConsole3DDetectedCharacter["facing"],
  camera = pack.directorCamera,
) {
  const cameraLogical = directorConsoleVectorFromWorld(camera.position, state)
  const cameraFacing = THREE.MathUtils.radToDeg(Math.atan2(cameraLogical.x - position.x, cameraLogical.z - position.z))
  if (facing === "away") return cameraFacing + 180
  if (facing === "left") return cameraFacing - 90
  if (facing === "right") return cameraFacing + 90
  return cameraFacing
}

function getDirectorDetectionCamera(pack: DirectorConsole3DScenePack, state: LibTvDirectorConsole3DState) {
  const activeCamera = state.cameras.find((camera) => camera.id === state.activeCameraId) || state.cameras[0]
  if (!activeCamera) return pack.directorCamera
  return configureThreeCameraFromDirectorCameraState(
    pack.shotCamera,
    activeCamera,
    state,
    parseDirectorAspectRatio(activeCamera.aspectRatio, DIRECTOR_CAMERA_PREVIEW_FALLBACK_RATIO).ratio,
  )
}

function getDirectorDetectionGroundPositionFromViewport(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  camera: THREE.PerspectiveCamera,
  groundPlane: THREE.Plane,
  viewportX: number,
  viewportY: number,
  viewportHeight: number,
  bodyScale: number,
) {
  const rect = pack.renderer.domElement.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  pack.pointer.set(viewportX * 2 - 1, -viewportY * 2 + 1)
  pack.raycaster.setFromCamera(pack.pointer, camera)
  const worldPoint = new THREE.Vector3()
  if (!pack.raycaster.ray.intersectPlane(groundPlane, worldPoint)) {
    const groundOrigin = groundPlane.projectPoint(camera.position, new THREE.Vector3())
    const horizontalDirection = pack.raycaster.ray.direction.clone().projectOnPlane(groundPlane.normal).normalize()
    if (horizontalDirection.lengthSq() < 0.0001) return null
    const sceneScale = clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)
    const fovHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV()) / 2)
    const normalizedHeight = Math.max(viewportHeight, 18 / Math.max(1, rect.height))
    const worldCharacterHeight = 1.75 * sceneScale * bodyScale
    const distance = clampWorkflowNumber(worldCharacterHeight / Math.max(0.01, normalizedHeight * fovHeight), 1.5, 80)
    worldPoint.copy(groundOrigin).addScaledVector(horizontalDirection, distance)
  }
  const logical = directorConsoleVectorFromWorld(worldPoint, state)
  logical.y = Number(state.groundHeight || 0) / clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)
  return logical
}

function getDirectorDetectedCharacterPlacement(
  pack: DirectorConsole3DScenePack,
  state: LibTvDirectorConsole3DState,
  detection: LibTvDirectorConsole3DDetectedCharacter,
  projection?: LibTvDirectorConsole3DCharacterDetection["projection"],
): DirectorDetectedCharacterPlacement | null {
  const texture = pack.environmentTexture
  const canvasRect = pack.renderer.domElement.getBoundingClientRect()
  if (!texture || canvasRect.width <= 1 || canvasRect.height <= 1) return null
  const sourceAspect = getDirectorPanoramaTextureAspect(texture)
  const sceneScale = clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)
  const baseScale = getDirectorCharacterModelPreset(detection.bodyType).scale
  const groundPlane = getDirectorGroundPlane(pack)
  const camera = getDirectorDetectionCamera(pack, state)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()

  if (!usesDirectorEquirectangularEnvironment(texture, state, projection)) {
    const viewportAspect = camera.aspect
    const imageScaleX = sourceAspect >= viewportAspect ? sourceAspect / viewportAspect : 1
    const imageScaleY = sourceAspect < viewportAspect ? viewportAspect / sourceAspect : 1
    const mapPoint = (x: number, y: number) => ({
      x: 0.5 + (x - 0.5) * imageScaleX,
      y: 0.5 + (y - 0.5) * imageScaleY,
    })
    const viewportFoot = mapPoint(detection.footPoint.x, detection.footPoint.y)
    const viewportTopLeft = mapPoint(detection.bbox.x, detection.bbox.y)
    const viewportBottomRight = mapPoint(detection.bbox.x + detection.bbox.width, detection.bbox.y + detection.bbox.height)
    const viewportRect = {
      x: viewportTopLeft.x,
      y: viewportTopLeft.y,
      width: clampWorkflowNumber(Math.abs(viewportBottomRight.x - viewportTopLeft.x), 0.01, 4),
      height: clampWorkflowNumber(Math.abs(viewportBottomRight.y - viewportTopLeft.y), 0.01, 4),
    }
    const position = getDirectorDetectionGroundPositionFromViewport(pack, state, camera, groundPlane, viewportFoot.x, viewportFoot.y, viewportRect.height, baseScale)
    if (!position) return null
    const foot = directorConsoleVectorToWorld(position, state)
    const head = directorConsoleVectorToWorld({ ...position, y: position.y + 1.75 }, state)
    const footNdc = foot.project(camera)
    const headNdc = head.project(camera)
    const projectedHeight = Math.abs(headNdc.y - footNdc.y) / 2
    if (!Number.isFinite(projectedHeight) || projectedHeight < 0.0001) return null
    const desiredHeight = clampWorkflowNumber(viewportRect.height * 0.92, 0.02, 0.8)
    const viewportScale = clampWorkflowNumber(desiredHeight / projectedHeight, 0.15, 6)
    return {
      position,
      uniformScale: clampWorkflowNumber(viewportScale / baseScale, 0.15, 6),
      rotationY: getDirectorCharacterFacingRotationY(pack, state, position, detection.facing, camera),
    }
  }

  const rotation = THREE.MathUtils.degToRad(Number(state.panoramaRotation || 0))
  const centerX = clampWorkflowNumber(detection.bbox.x + detection.bbox.width / 2, 0, 1)
  const footDirection = getDirectorPanoramaDirectionFromUv(detection.footPoint.x, detection.footPoint.y, rotation)
  const topDirection = getDirectorPanoramaDirectionFromUv(centerX, detection.bbox.y, rotation)
  const footWorld = new THREE.Vector3()
  const footRay = new THREE.Ray(camera.position, footDirection)
  let hasGroundIntersection = footRay.intersectPlane(groundPlane, footWorld) !== null
  if (!hasGroundIntersection) {
    const groundOrigin = groundPlane.projectPoint(camera.position, new THREE.Vector3())
    const horizontalDirection = footDirection.clone().projectOnPlane(groundPlane.normal).normalize()
    if (horizontalDirection.lengthSq() < 0.0001) return null
    const elevation = Math.abs(Math.PI / 2 - Math.acos(THREE.MathUtils.clamp(footDirection.y, -1, 1)))
    const distance = clampWorkflowNumber(1.75 / Math.tan(Math.max(0.08, elevation)), 1.5, 40)
    footWorld.copy(groundOrigin).addScaledVector(horizontalDirection, distance)
    hasGroundIntersection = true
  }
  if (!hasGroundIntersection) return null

  const localUp = new THREE.Vector3(0, 1, 0).transformDirection(pack.group.matrixWorld).normalize()
  const cameraToFoot = camera.position.clone().sub(footWorld)
  const alignment = topDirection.dot(localUp)
  const topAlongView = topDirection.dot(cameraToFoot)
  const topAlongUp = localUp.dot(cameraToFoot)
  const denominator = Math.max(0.05, 1 - alignment * alignment)
  const worldHeight = (topAlongUp - alignment * topAlongView) / denominator
  const safeWorldHeight = Number.isFinite(worldHeight) && worldHeight > 0.2 * sceneScale
    ? clampWorkflowNumber(worldHeight, 0.35 * sceneScale, 8 * sceneScale)
    : 1.75 * sceneScale * baseScale
  const logicalPosition = directorConsoleVectorFromWorld(footWorld, state)
  logicalPosition.y = Number(state.groundHeight || 0) / sceneScale
  return {
    position: logicalPosition,
    uniformScale: clampWorkflowNumber(safeWorldHeight / (1.75 * sceneScale * baseScale), 0.15, 6),
    rotationY: getDirectorCharacterFacingRotationY(pack, state, logicalPosition, detection.facing, camera),
  }
}

function findDirectorCharacterAttachmentBone(root: THREE.Object3D, attachBone: "leftHand" | "rightHand") {
  const aliases = attachBone === "leftHand"
    ? ["lefthand", "handl", "lhand", "leftwrist", "wristl"]
    : ["righthand", "handr", "rhand", "rightwrist", "wristr"]
  const bones: THREE.Object3D[] = []
  root.traverse((child) => {
    if ((child as THREE.Bone).isBone) bones.push(child)
  })
  const exact = bones.find((bone) => aliases.includes(normalizeDirectorBoneName(bone.name)))
  if (exact) return exact
  const fuzzy = bones.find((bone) => aliases.some((alias) => normalizeDirectorBoneName(bone.name).includes(alias)))
  if (fuzzy) return fuzzy

  let rig: DirectorCharacterRig | undefined
  root.traverse((child) => {
    if (!rig && child.userData.directorGlbRig) rig = child.userData.directorGlbRig as DirectorCharacterRig
  })
  return attachBone === "leftHand" ? rig?.bones.l_elbow || null : rig?.bones.r_elbow || null
}

function syncDirectorObjectAttachments(pack: DirectorConsole3DScenePack, state: LibTvDirectorConsole3DState) {
  pack.group.updateWorldMatrix(true, true)
  const inverseSceneMatrix = pack.group.matrixWorld.clone().invert()
  for (const object of state.objects) {
    if (!object.parentObjectId || !object.attachBone) continue
    const group = pack.meshes.get(object.id)
    const parent = state.objects.find((item) => item.id === object.parentObjectId && item.kind === "character")
    const parentGroup = parent ? pack.meshes.get(parent.id) : undefined
    if (!group || !parent || !parentGroup) continue

    parentGroup.updateWorldMatrix(true, true)
    const bone = findDirectorCharacterAttachmentBone(parentGroup, object.attachBone)
    const anchorMatrix = bone
      ? bone.matrixWorld.clone()
      : parentGroup.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(object.attachBone === "leftHand" ? -0.32 : 0.32, 1.12, 0.08))
    const uniformScale = clampWorkflowNumber(Number(object.uniformScale ?? 1), 0.05, 10)
    const localMatrix = new THREE.Matrix4().compose(
      new THREE.Vector3(object.position.x, object.position.y, object.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(object.rotation.x),
        THREE.MathUtils.degToRad(object.rotation.y),
        THREE.MathUtils.degToRad(object.rotation.z),
        "XYZ",
      )),
      new THREE.Vector3(object.scale.x * uniformScale, object.scale.y * uniformScale, object.scale.z * uniformScale),
    )
    const sceneLocalMatrix = inverseSceneMatrix.clone().multiply(anchorMatrix).multiply(localMatrix)
    sceneLocalMatrix.decompose(group.position, group.quaternion, group.scale)
    group.visible = object.visible !== false && parent.visible !== false
    group.updateMatrixWorld(true)
  }
}

function renderDirectorConsoleScene(pack: DirectorConsole3DScenePack, state: LibTvDirectorConsole3DState) {
  if (pack.renderedStateRef === state && pack.renderedStateKey && pack.renderedSelectionKey) return false
  const stateKey = JSON.stringify({
    objects: state.objects,
    cameras: state.cameras.map((camera) => ({ ...camera, captures: undefined })),
    backgroundColor: state.backgroundColor,
    skyColor: state.skyColor,
    environmentUrl: state.environmentUrl,
    environmentProjection: getDirectorEnvironmentProjection(state),
    gridSnap: state.gridSnap,
    transformMode: state.transformMode,
    sceneScale: state.sceneScale,
    scenePosition: state.scenePosition,
    sceneRotation: state.sceneRotation,
    panoramaRotation: state.panoramaRotation,
    panoramaRadius: state.panoramaRadius,
    screenPlacementEnabled: state.screenPlacementEnabled,
    screenPlacementDepth: state.screenPlacementDepth,
    showCharacterLabels: state.showCharacterLabels,
    groundVisible: state.groundVisible,
    groundOpacity: state.groundOpacity,
    groundHeight: state.groundHeight,
    motionPaths: state.timeline?.paths || [],
    hiddenMotionPathTargetId: pack.hiddenMotionPathTargetId,
    motionPathsVisible: pack.motionPathsVisible,
    hideCameraElements: pack.hideCameraElements,
  })
  const selectionKey = JSON.stringify({
    activeObjectId: state.activeObjectId,
    activeCameraId: state.activeCameraId,
    selectedObjectIds: state.selectedObjectIds || [],
    activeGroupId: state.activeGroupId,
    activeMotionPathId: pack.activeMotionPath?.id,
    motionPathsVisible: pack.motionPathsVisible,
    hideCameraElements: pack.hideCameraElements,
    transformMode: state.transformMode,
    gridSnap: state.gridSnap,
    viewMode: pack.viewMode,
  })
  const sceneChanged = pack.renderedStateKey !== stateKey
  const selectionChanged = pack.renderedSelectionKey !== selectionKey
  if (!sceneChanged && !selectionChanged) {
    pack.renderedStateRef = state
    return false
  }
  if (sceneChanged) {
    pack.renderedStateKey = stateKey
    applyDirectorConsoleSceneTransform(pack, state)
    const skyColor = state.skyColor || state.backgroundColor || DIRECTOR_STAGE_VIEWPORT_BACKGROUND
    if (state.environmentUrl && state.environmentUrl !== pack.environmentUrl) {
      pack.environmentTexture?.dispose()
      pack.environmentTexture = null
      pack.environmentUrl = state.environmentUrl
      const requestedEnvironmentUrl = state.environmentUrl
      const loader = new THREE.TextureLoader()
      loader.setCrossOrigin("anonymous")
      loader.load(getDirectorConsoleImageRenderUrl(state.environmentUrl), (texture) => {
        if (pack.disposed || pack.environmentUrl !== requestedEnvironmentUrl) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        pack.environmentTexture = texture
        pack.scene.background = new THREE.Color(skyColor)
        const sphereMaterial = pack.panoramaSphere.material
        if (Array.isArray(sphereMaterial)) sphereMaterial.forEach((item) => item.dispose())
        else sphereMaterial.dispose()
        const plateMaterial = pack.panoramaPlate.material
        if (Array.isArray(plateMaterial)) plateMaterial.forEach((item) => item.dispose())
        else plateMaterial.dispose()
        pack.panoramaSphere.material = new THREE.MeshBasicMaterial({ depthWrite: false, toneMapped: false })
        pack.panoramaPlate.material = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false })
        syncDirectorEnvironmentTextureProjection(pack, state)
        pack.renderedStateKey = ""
      }, undefined, () => {
        if (pack.environmentUrl !== requestedEnvironmentUrl) return
        pack.scene.background = new THREE.Color(skyColor)
        pack.panoramaSphere.visible = false
        pack.panoramaPlate.visible = false
      })
    } else if (!state.environmentUrl) {
      pack.environmentTexture?.dispose()
      pack.environmentTexture = null
      pack.environmentUrl = undefined
      pack.scene.background = new THREE.Color(skyColor)
      pack.panoramaSphere.visible = false
      pack.panoramaPlate.visible = false
    } else {
      pack.scene.background = new THREE.Color(skyColor)
    }
    if (pack.environmentTexture && pack.environmentUrl === state.environmentUrl) {
      syncDirectorEnvironmentTextureProjection(pack, state)
    }
    const panoramaRadius = clampWorkflowNumber(Number(state.panoramaRadius || 60), 10, 500)
    pack.panoramaSphere.scale.setScalar(panoramaRadius / 500)
    pack.panoramaSphere.rotation.y = THREE.MathUtils.degToRad(state.panoramaRotation || 0)
  }
  pack.renderedSelectionKey = selectionKey
	  const existingIds = new Set<string>()
	  for (const object of state.objects) {
	    existingIds.add(object.id)
	    let group = pack.meshes.get(object.id) as THREE.Group | undefined
	    if (!group) {
      group = new THREE.Group()
      group.userData.directorObjectId = object.id
	      pack.meshes.set(object.id, group)
	      pack.group.add(group)
	    }
	    const skipTransformSync = pack.transformControls.dragging && pack.transformDraggingId === object.id && pack.attachedTransformId === object.id
	    if (!skipTransformSync) {
	      syncDirectorObjectGroup(group, object, pack, state)
	    }
	    group.visible = object.visible !== false
	    const transformKey = getDirectorObjectTransformKey(object)
		    if (!skipTransformSync && (group.userData.directorTransformKey !== transformKey || group.userData.directorPanoramaBound === true)) {
		      const uniformScale = clampWorkflowNumber(Number(object.uniformScale ?? 1), 0.1, 10)
		      group.position.set(object.position.x, object.position.y, object.position.z)
		      group.rotation.set(THREE.MathUtils.degToRad(object.rotation.x), THREE.MathUtils.degToRad(object.rotation.y), THREE.MathUtils.degToRad(object.rotation.z))
		      group.scale.set(object.scale.x * uniformScale, object.scale.y * uniformScale, object.scale.z * uniformScale)
		      group.userData.directorTransformKey = transformKey
		      group.userData.directorPanoramaBound = false
		    }
	  }
	  for (const [id, object] of pack.meshes.entries()) {
    if (!existingIds.has(id)) {
      object.removeFromParent()
      disposeDirectorObject3D(object)
      pack.meshes.delete(id)
    }
  }
  syncDirectorObjectAttachments(pack, state)
  updateDirectorMotionPathHelpers(pack, state)
  const existingCameraIds = new Set<string>()
  for (const camera of state.cameras) {
    existingCameraIds.add(camera.id)
    let helper = pack.cameraHelpers.get(camera.id) as THREE.Group | undefined
    if (!helper) {
      helper = buildDirectorCameraIndicator()
      pack.cameraHelpers.set(camera.id, helper)
      pack.scene.add(helper)
    }
    setDirectorObjectId(helper, camera.id)
	    const skipTransformSync = pack.transformControls.dragging && pack.transformDraggingId === camera.id && pack.attachedTransformId === camera.id
	    const target = getDirectorConsoleCameraTarget(camera, state)
	    const sceneScale = clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)
	    if (!skipTransformSync) {
	      helper.position.copy(directorConsoleVectorToWorld(camera.position, state))
	      helper.lookAt(target)
	      helper.scale.setScalar(0.6 * sceneScale)
	    }
	    const guide = updateDirectorCameraDirectionGuide(pack, camera, state, helper)
	    guide.visible = !pack.hideCameraElements
	    syncDirectorCameraLabel(helper, camera.name, state.showCharacterLabels !== false)
	    helper.visible = pack.viewMode === "director" && camera.visible !== false && !pack.hideCameraElements
	  }
  for (const [id, helper] of pack.cameraHelpers.entries()) {
    if (!existingCameraIds.has(id)) {
      helper.removeFromParent()
      pack.cameraHelpers.delete(id)
    }
  }
  for (const [id, guide] of pack.cameraGuides.entries()) {
    if (!existingCameraIds.has(id)) {
      guide.removeFromParent()
      disposeDirectorCameraGuide(guide)
      pack.cameraGuides.delete(id)
    }
  }
	  const activeObject = state.objects.find((object) => object.id === state.activeObjectId)
  const activeCameraObject = state.cameras.find((camera) => camera.id === state.activeObjectId)
	  const activeMotionPath = pack.activeMotionPath
	  const activeMotionPathMovable = Boolean(activeMotionPath && activeMotionPath.points.length >= 2)
	  updateDirectorSelectionHelpers(pack, state)
	  const activeGroup = activeObject ? pack.meshes.get(activeObject.id) : undefined
    const selectedGroup = state.activeGroupId ? state.objectGroups?.find((group) => group.id === state.activeGroupId) : undefined
    const selectedGroupObjects = selectedGroup
      ? selectedGroup.objectIds.map((id) => state.objects.find((object) => object.id === id)).filter(Boolean) as LibTvDirectorConsole3DObject[]
      : []
    const selectedGroupMovable = Boolean(selectedGroup && selectedGroupObjects.length > 0 && selectedGroupObjects.some((object) => object.visible !== false) && !selectedGroupObjects.every((object) => object.locked))
    if (selectedGroupMovable && !pack.transformControls.dragging) {
      const box = new THREE.Box3()
      selectedGroupObjects.forEach((object) => {
        const mesh = pack.meshes.get(object.id)
        if (mesh) box.expandByObject(mesh)
        else box.expandByPoint(directorConsoleVectorToWorld(object.position, state))
      })
      const center = new THREE.Vector3()
      if (Number.isFinite(box.min.x) && Number.isFinite(box.max.x)) box.getCenter(center)
      else center.copy(directorConsoleVectorToWorld(selectedGroupObjects[0].position, state))
      const logicalCenter = directorConsoleVectorFromWorld(center, state)
      pack.groupTransformProxy.position.set(logicalCenter.x, logicalCenter.y, logicalCenter.z)
      pack.groupTransformProxy.rotation.set(0, 0, 0)
      pack.groupTransformProxy.scale.set(1, 1, 1)
    }
	  if (activeMotionPathMovable && activeMotionPath && !(pack.transformControls.dragging && pack.transformDraggingId === `motion-path:${activeMotionPath.id}`)) {
	    const center = activeMotionPath.position || getDirectorConsoleMotionPathCenter(activeMotionPath.points)
	    const rotation = activeMotionPath.rotation || { x: 0, y: 0, z: 0 }
	    const scale = activeMotionPath.scale || { x: 1, y: 1, z: 1 }
	    pack.motionPathTransformProxy.position.set(center.x, center.y, center.z)
	    pack.motionPathTransformProxy.rotation.set(THREE.MathUtils.degToRad(rotation.x), THREE.MathUtils.degToRad(rotation.y), THREE.MathUtils.degToRad(rotation.z))
	    pack.motionPathTransformProxy.scale.set(scale.x, scale.y, scale.z)
	  }
	  pack.transformControls.setMode(state.transformMode || "translate")
		  pack.transformControls.setTranslationSnap(state.gridSnap ? 1 : null)
	  pack.transformControls.setRotationSnap(state.gridSnap ? THREE.MathUtils.degToRad(5) : null)
	  pack.transformControls.setScaleSnap(state.gridSnap ? 0.05 : null)
	  const activeCameraHelper = !pack.hideCameraElements && activeCameraObject ? pack.cameraHelpers.get(activeCameraObject.id) : undefined
	  const shouldShowTransform = Boolean(
	    activeMotionPathMovable
	      || selectedGroupMovable
        || (activeGroup && activeObject?.visible !== false && !activeObject?.locked)
        || (activeCameraObject && activeCameraHelper && activeCameraObject.visible !== false && !activeCameraObject.locked)
	  )
	  pack.transformControls.enabled = shouldShowTransform
	  pack.transformHelper.visible = shouldShowTransform
    if (activeMotionPathMovable && activeMotionPath) {
      const transformId = `motion-path:${activeMotionPath.id}`
      if (pack.attachedTransformId !== transformId || pack.transformControls.object !== pack.motionPathTransformProxy) {
        pack.transformControls.attach(pack.motionPathTransformProxy)
        pack.attachedTransformId = transformId
      }
    } else if (selectedGroupMovable && selectedGroup) {
      const transformId = `group:${selectedGroup.id}`
      if (pack.attachedTransformId !== transformId || pack.transformControls.object !== pack.groupTransformProxy) {
        pack.transformControls.attach(pack.groupTransformProxy)
        pack.attachedTransformId = transformId
      }
    } else if (activeCameraObject && activeCameraHelper && activeCameraObject.visible !== false && !activeCameraObject.locked) {
      if (pack.attachedTransformId !== activeCameraObject.id || pack.transformControls.object !== activeCameraHelper) {
        pack.transformControls.attach(activeCameraHelper)
        pack.attachedTransformId = activeCameraObject.id
      }
    } else if (activeObject && activeGroup && activeObject.visible !== false && !activeObject.locked) {
	    if (pack.attachedTransformId !== activeObject.id || pack.transformControls.object !== activeGroup) {
	      pack.transformControls.attach(activeGroup)
	      pack.attachedTransformId = activeObject.id
	    }
	    const activeTransformKey = getDirectorObjectTransformKey(activeObject)
		    if (!(pack.transformControls.dragging && pack.transformDraggingId === activeObject.id) && activeGroup.userData.directorTransformKey !== activeTransformKey) {
		      const uniformScale = clampWorkflowNumber(Number(activeObject.uniformScale ?? 1), 0.1, 10)
		      pack.transformSyncing = true
		      activeGroup.position.set(activeObject.position.x, activeObject.position.y, activeObject.position.z)
		      activeGroup.rotation.set(THREE.MathUtils.degToRad(activeObject.rotation.x), THREE.MathUtils.degToRad(activeObject.rotation.y), THREE.MathUtils.degToRad(activeObject.rotation.z))
		      activeGroup.scale.set(activeObject.scale.x * uniformScale, activeObject.scale.y * uniformScale, activeObject.scale.z * uniformScale)
		      activeGroup.userData.directorTransformKey = activeTransformKey
		      pack.transformSyncing = false
		    }
		    } else if (pack.attachedTransformId) {
			    pack.transformControls.detach()
			    pack.attachedTransformId = undefined
			  }
	pack.renderedStateRef = state
	return true
}

function buildDirectorCameraFrame(camera: LibTvDirectorConsole3DCamera, state: LibTvDirectorConsole3DState) {
  const group = new THREE.Group()
  group.userData.isCameraDirectionGuide = true
  group.userData.currentGuideKey = getDirectorCameraGuideKey(camera, state)
  const scale = THREE.MathUtils.clamp(camera.fov, 1, 90) / 90
  const normalizedScale = THREE.MathUtils.clamp(scale, 0.35, 1)
  const distance = 4.5 * normalizedScale
  const halfHeight = 0.68 * normalizedScale
  const halfWidth = 1.05 * normalizedScale
  const origin = new THREE.Vector3(0, -0.01, 0.005)
  const center = new THREE.Vector3(0, 0, distance)
  const corners = [
    new THREE.Vector3(-halfWidth, halfHeight, distance),
    new THREE.Vector3(halfWidth, halfHeight, distance),
    new THREE.Vector3(halfWidth, -halfHeight, distance),
    new THREE.Vector3(-halfWidth, -halfHeight, distance),
  ]
  const segments = [
    origin, corners[0],
    origin, corners[1],
    origin, corners[2],
    origin, corners[3],
    origin, center,
    corners[0], corners[1],
    corners[1], corners[2],
    corners[2], corners[3],
    corners[3], corners[0],
  ]
  const material = new THREE.LineBasicMaterial({ color: 0x7ddcff, transparent: true, opacity: 0.36, depthWrite: false })
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segments), material))
  return group
}

function getDirectorCameraGuideKey(camera: LibTvDirectorConsole3DCamera, state: LibTvDirectorConsole3DState) {
  const target = getDirectorConsoleCameraTarget(camera, state)
  const position = directorConsoleVectorToWorld(camera.position, state)
  return [
    camera.fov,
    camera.visible === false ? 0 : 1,
    position.x.toFixed(3),
    position.y.toFixed(3),
    position.z.toFixed(3),
    target.x.toFixed(3),
    target.y.toFixed(3),
    target.z.toFixed(3),
    state.sceneScale,
    state.scenePosition?.x,
    state.scenePosition?.y,
    state.scenePosition?.z,
    state.sceneRotation?.x,
    state.sceneRotation?.y,
    state.sceneRotation?.z,
  ].join("|")
}

function directorCameraMaterial(color: string, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.1, ...options })
}

function buildDirectorCameraIndicator() {
  const group = new THREE.Group()
  group.userData.isCameraIndicator = true
  const orange = directorCameraMaterial("#FF9F0A", { roughness: 0.65, metalness: 0.1 })
  const darkOrange = directorCameraMaterial("#D98500", { roughness: 0.75, metalness: 0.1 })
  const metal = directorCameraMaterial("#aaaaaa", { roughness: 0.2, metalness: 0.9 })
  const graphite = directorCameraMaterial("#3a3a3a", { roughness: 0.4, metalness: 0.75 })
  const black = directorCameraMaterial("#181818", { roughness: 0.3, metalness: 0.8 })
  const glass = directorCameraMaterial("#2244bb", { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.55 })
  const lensBlack = directorCameraMaterial("#0a0a12", { roughness: 0.02, metalness: 0.1 })
  const red = directorCameraMaterial("#ff2200", { emissive: new THREE.Color("#ff2200"), emissiveIntensity: 0.8 })
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => new THREE.Mesh(geometry, material)

  const body = mesh(new THREE.BoxGeometry(0.3, 0.22, 0.17), orange)
  body.position.set(-0.02, 0, -0.195)
  const grip = mesh(new THREE.BoxGeometry(0.1, 0.27, 0.17), darkOrange)
  grip.position.set(0.19, -0.015, -0.195)
  const top = mesh(new THREE.BoxGeometry(0.12, 0.055, 0.11), orange)
  top.position.set(-0.055, 0.135, -0.195)
  const viewfinder = mesh(new THREE.BoxGeometry(0.05, 0.038, 0.013), graphite)
  viewfinder.position.set(-0.055, 0.146, -0.287)
  const knob = mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.012, 12), metal)
  knob.position.set(0.155, 0.126, -0.116)
  const sideKnob = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.016, 14), graphite)
  sideKnob.position.set(0.065, 0.128, -0.137)
  const secondKnob = mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.018, 14), graphite)
  secondKnob.position.set(-0.035, 0.128, -0.14)
  const ring = mesh(new THREE.TorusGeometry(0.065, 0.01, 8, 28), metal)
  ring.position.set(0, -0.01, -0.105)
  const plate = mesh(new THREE.CircleGeometry(0.062, 28), graphite)
  plate.position.set(0, -0.01, -0.106)
  const lens1 = mesh(new THREE.CylinderGeometry(0.068, 0.072, 0.036, 22), black)
  lens1.rotation.x = Math.PI / 2
  lens1.position.set(0, -0.01, -0.088)
  const lens2 = mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.039, 22), black)
  lens2.rotation.x = Math.PI / 2
  lens2.position.set(0, -0.01, -0.05)
  const lensRing1 = mesh(new THREE.TorusGeometry(0.066, 0.0075, 8, 24), graphite)
  lensRing1.position.set(0, -0.01, -0.062)
  const lensRing2 = mesh(new THREE.TorusGeometry(0.066, 0.006, 8, 24), graphite)
  lensRing2.position.set(0, -0.01, -0.039)
  const lens3 = mesh(new THREE.CylinderGeometry(0.054, 0.062, 0.028, 22), black)
  lens3.rotation.x = Math.PI / 2
  lens3.position.set(0, -0.01, -0.017)
  const frontRing = mesh(new THREE.TorusGeometry(0.056, 0.006, 8, 24), metal)
  frontRing.position.set(0, -0.01, -0.002)
  const frontGlass = mesh(new THREE.CircleGeometry(0.05, 24), glass)
  frontGlass.position.set(0, -0.01, 0)
  const rear = mesh(new THREE.BoxGeometry(0.165, 0.12, 0.004), lensBlack)
  rear.position.set(-0.02, -0.02, -0.284)
  const tripod = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 8), metal)
  tripod.position.set(0.01, -0.115, -0.177)
  const light = mesh(new THREE.SphereGeometry(0.009, 8, 6), red)
  light.position.set(0.148, 0.064, -0.107)
  const side = mesh(new THREE.BoxGeometry(0.011, 0.07, 0.08), darkOrange)
  side.position.set(-0.153, -0.02, -0.185)
  const pickProxy = mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.2, 16), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }))
  pickProxy.rotation.x = Math.PI / 2
  pickProxy.position.set(0, -0.01, 0.1)
  pickProxy.userData.isDirectorCameraPickProxy = true
  group.add(body, grip, top, viewfinder, knob, sideKnob, secondKnob, ring, plate, lens1, lens2, lensRing1, lensRing2, lens3, frontRing, frontGlass, rear, tripod, light, side, pickProxy)
  return group
}

function updateDirectorCameraDirectionGuide(pack: DirectorConsole3DScenePack, camera: LibTvDirectorConsole3DCamera, state: LibTvDirectorConsole3DState, cameraGroup: THREE.Object3D) {
  const guide = pack.cameraGuides.get(camera.id)
  const guideKey = getDirectorCameraGuideKey(camera, state)
  if (!guide) {
    const created = buildDirectorCameraFrame(camera, state)
    pack.cameraGuides.set(camera.id, created)
    cameraGroup.add(created)
    return created
  }
  if (guide.userData.currentGuideKey === guideKey) return guide
  const replacement = buildDirectorCameraFrame(camera, state)
  replacement.visible = guide.visible
  guide.removeFromParent()
  disposeDirectorCameraGuide(guide)
  pack.cameraGuides.set(camera.id, replacement)
  cameraGroup.add(replacement)
  return replacement
}

function disposeDirectorCameraGuide(guide: THREE.Object3D) {
  guide.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose?.()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material?.dispose?.()
  })
}

function syncDirectorCameraLabel(group: THREE.Group, text: string, visible: boolean) {
  const key = (visible ? "1:" : "0:") + text
  if (group.userData.directorCameraLabelKey === key) return
  const existing = group.children.find((child) => child.userData?.isCameraLabel) as THREE.Sprite | undefined
  if (existing) {
    existing.material.map?.dispose()
    existing.material.dispose()
    existing.removeFromParent()
  }
  group.userData.directorCameraLabelKey = key
  if (!visible) return
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return
  const fontSize = 14
  const label = String(text || "机位")
  const font = "bold 14px \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
  context.font = font
  canvas.width = Math.ceil(context.measureText(label).width + fontSize * 0.8)
  canvas.height = Math.ceil(fontSize * 1.5)
  const radius = fontSize * 0.3
  context.font = font
  context.fillStyle = "rgba(0,0,0,0.55)"
  context.beginPath()
  context.roundRect(0, 0, canvas.width, canvas.height, radius)
  context.fill()
  context.fillStyle = "#aaddff"
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.fillText(label, canvas.width / 2, canvas.height / 2)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }))
  const scale = Math.max(0.14, Math.min(0.5, fontSize / 100))
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1)
  sprite.position.set(0, 0.48, 0)
  sprite.userData.isCameraLabel = true
  group.add(sprite)
}

function disposeDirectorMotionPathHelper(helper: THREE.Object3D) {
  helper.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose?.()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
    else material?.dispose?.()
  })
}

function buildDirectorMotionPathHelper(
  points: LibTvDirectorConsole3DVector3[],
  closed: boolean,
  selected: boolean,
  type?: LibTvDirectorConsole3DMotionPathType,
) {
  const helper = new THREE.Group()
  helper.userData.isDirectorMotionPathHelper = true
  const source = closed && points.length > 2 && points[0] !== points[points.length - 1] ? [...points, points[0]] : points
  const pathPoints = source.map((point) => new THREE.Vector3(point.x, point.y + 0.035, point.z))
  if (pathPoints.length >= 2) {
    const curve = new THREE.CurvePath<THREE.Vector3>()
    for (let index = 1; index < pathPoints.length; index += 1) {
      curve.add(new THREE.LineCurve3(pathPoints[index - 1], pathPoints[index]))
    }
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, Math.max(2, pathPoints.length * 2), 0.018, 6, false),
      new THREE.MeshBasicMaterial({ color: 0x65c8ff, transparent: true, opacity: selected ? 0.56 : 0.42 }),
    )
    tube.userData.isMotionPathStroke = true
    helper.add(tube)
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(pathPoints)
  const material = new THREE.LineBasicMaterial({
    color: 0x65c8ff,
    transparent: true,
    opacity: selected ? 1 : 0.8,
  })
  const line = new THREE.Line(geometry, material)
  helper.add(line)
  if (selected) {
    const markerGeometry = new THREE.SphereGeometry(0.075, 14, 10)
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
    const presetMarkerIndices = type === "circle"
      ? [0, 0.25, 0.5, 0.75].map((ratio) => Math.round((points.length - 1) * ratio))
      : type === "rectangle"
        ? [0, 1, 2, 3].filter((index) => index < points.length)
        : type === "line"
          ? [0, Math.max(0, points.length - 1)]
          : [0, 1 / 3, 2 / 3, 1].map((ratio) => Math.round((points.length - 1) * ratio))
    const markerSet = new Set(presetMarkerIndices)
    points.forEach((point, index) => {
      if (!markerSet.has(index)) return
      const marker = new THREE.Mesh(markerGeometry.clone(), markerMaterial.clone())
      marker.position.set(point.x, point.y + 0.055, point.z)
      helper.add(marker)
    })
  }
  return helper
}

function updateDirectorMotionPathHelpers(pack: DirectorConsole3DScenePack, state: LibTvDirectorConsole3DState) {
  const paths = pack.motionPathsVisible
    ? (state.timeline?.paths || []).filter((path) => path.targetId !== pack.hiddenMotionPathTargetId)
    : []
  const existing = new Set<string>()
  paths.forEach((path) => {
    existing.add(path.id)
    const selected = pack.activeMotionPath?.id === path.id
    const key = JSON.stringify([path.points, path.closed, selected])
    const current = pack.motionPathHelpers.get(path.id)
    if (current?.userData.currentPathKey === key) return
    if (current) {
      current.removeFromParent()
      disposeDirectorMotionPathHelper(current)
    }
    const helper = buildDirectorMotionPathHelper(path.points, path.closed, selected, path.type)
    helper.userData.currentPathKey = key
    pack.motionPathHelpers.set(path.id, helper)
    pack.group.add(helper)
  })
  for (const [id, helper] of pack.motionPathHelpers.entries()) {
    if (existing.has(id)) continue
    helper.removeFromParent()
    disposeDirectorMotionPathHelper(helper)
    pack.motionPathHelpers.delete(id)
  }
}

function updateDirectorSelectionHelpers(pack: DirectorConsole3DScenePack, state: LibTvDirectorConsole3DState) {
  const selectedIds = getDirectorConsoleSelectedObjectIds(state)
  const selectedSet = new Set(selectedIds)
  for (const id of selectedIds) {
    const object = pack.meshes.get(id)
    if (!object) continue
    let ring = pack.selectionHelpers.get(id)
    if (!ring) {
      ring = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.51, 48),
        new THREE.MeshBasicMaterial({ color: 0x4f8ef7, side: THREE.DoubleSide, transparent: true, opacity: 0.7, depthWrite: false }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.02
      ring.userData._isSelectionRing = true
      pack.selectionHelpers.set(id, ring)
      pack.group.add(ring)
    }
    ring.position.x = object.position.x
    ring.position.z = object.position.z
    ring.visible = object.visible
  }
  for (const [id, ring] of pack.selectionHelpers.entries()) {
    if (!selectedSet.has(id)) {
      ring.removeFromParent()
      pack.selectionHelpers.delete(id)
    }
  }
}

function createDirectorInvisiblePickMaterial() {
  return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
}

function getDirectorObjectLocalContentBounds(group: THREE.Group) {
  group.updateMatrixWorld(true)
  const inverse = group.matrixWorld.clone().invert()
  const bounds = new THREE.Box3()
  let hasBounds = false
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || child.userData?.isPickProxy || child.userData?.isDirectorCharacterLabel || child.userData?.isCameraLabel) return
    const childBounds = new THREE.Box3().setFromObject(child)
    if (childBounds.isEmpty()) return
    childBounds.applyMatrix4(inverse)
    bounds.union(childBounds)
    hasBounds = true
  })
  return hasBounds ? bounds : null
}

function ensureDirectorPickProxy(group: THREE.Group, object: LibTvDirectorConsole3DObject) {
  if (object.kind === "primitive") return
  let proxy = group.getObjectByName("__pick_proxy") as THREE.Mesh | undefined
  if (!proxy) {
    proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.4, 12), createDirectorInvisiblePickMaterial())
    proxy.name = "__pick_proxy"
    proxy.userData.isPickProxy = true
    group.add(proxy)
  }
  const bounds = getDirectorObjectLocalContentBounds(group)
  const size = bounds?.getSize(new THREE.Vector3())
  const center = bounds?.getCenter(new THREE.Vector3())
  const fallbackHeight = getDirectorCharacterLabelHeight(object.bodyType)
  const height = Math.max(size?.y || fallbackHeight, 1.6)
  const radius = size ? 0.35 * Math.max(size.x, size.z) + 0.2 : object.kind === "crowd" ? Math.max(0.8, Math.sqrt(object.crowdCount || 9) * 0.45) : 0.4
  proxy.geometry.dispose()
  proxy.geometry = new THREE.CylinderGeometry(radius, radius, height, 12)
  proxy.position.set(center?.x || 0, bounds ? bounds.min.y + height / 2 : height / 2, center?.z || 0)
  setDirectorObjectId(proxy, object.id)
}

function getDirectorObjectMeshKey(object: LibTvDirectorConsole3DObject, pack?: DirectorConsole3DScenePack) {
	if (object.kind === "character") {
    const model = getDirectorCharacterModelPreset(object.bodyType)
    const cacheKey = model ? `character:${model.bodyType}` : ""
    const cached = cacheKey && pack ? pack.uploadedModels.get(cacheKey) : undefined
    return [
      "character",
      model?.bodyType || object.bodyType || "mannequin",
      model?.modelUrl || "",
      cached?.object ? "loaded" : cached?.failed ? "failed" : "loading",
    ].join(":")
  }
  if (object.kind === "uploaded") {
    const cached = object.modelUrl && pack ? pack.uploadedModels.get(object.id) : undefined
    return ["uploaded", object.modelUrl || "", cached?.object ? "loaded" : cached?.failed ? "failed" : "loading"].join(":")
  }
  if (object.kind === "crowd") {
    return [
      "crowd",
      object.crowdCount || 9,
      object.crowdRows || 3,
      object.crowdCols || 3,
      object.crowdSpacing || 1.2,
    ].join(":")
  }
  return ["primitive", object.primitive || "box"].join(":")
}

function getDirectorObjectTransformKey(object: LibTvDirectorConsole3DObject) {
  return JSON.stringify({
    position: object.position,
    rotation: object.rotation,
    scale: object.scale,
    uniformScale: object.uniformScale ?? 1,
    parentObjectId: object.parentObjectId,
    attachBone: object.attachBone,
    panoramaBinding: object.panoramaBinding,
  })
}

function getDirectorObjectRenderKey(object: LibTvDirectorConsole3DObject, pack: DirectorConsole3DScenePack, state: LibTvDirectorConsole3DState) {
  return JSON.stringify({
    mesh: getDirectorObjectMeshKey(object, pack),
    kind: object.kind,
    name: object.name,
    bodyType: object.bodyType,
    color: object.color,
    pose: object.pose,
    jointAngles: object.kind === "character" ? object.jointAngles : undefined,
    shadowEnabled: object.kind === "character" ? object.shadowEnabled === true : undefined,
    showCharacterLabels: object.kind === "character" ? state.showCharacterLabels !== false : undefined,
    crowdCount: object.crowdCount,
    crowdRows: object.crowdRows,
    crowdCols: object.crowdCols,
    crowdSpacing: object.crowdSpacing,
    modelUrl: object.modelUrl,
    primitive: object.primitive,
  })
}

function disposeDirectorObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    const sprite = child as THREE.Sprite
    const sharedCharacterAsset = child.userData?.directorSharedCharacterAsset === true
    if (mesh.geometry && !sharedCharacterAsset) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach((item) => item.dispose())
	    else material?.dispose?.()
	    const materialMap = (material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial | undefined)?.map
	    if (!sharedCharacterAsset) materialMap?.dispose?.()
	    const spriteMaterial = sprite.material as THREE.SpriteMaterial | undefined
    if (sprite.isSprite) spriteMaterial?.map?.dispose?.()
  })
}

function rebuildDirectorObjectGroup(group: THREE.Group, object: LibTvDirectorConsole3DObject, pack: DirectorConsole3DScenePack, meshKey: string) {
  const children = [...group.children]
  children.forEach((child) => {
    child.removeFromParent()
    disposeDirectorObject3D(child)
  })
  buildDirectorObjectMesh(object, pack).forEach((mesh) => {
    setDirectorObjectId(mesh, object.id)
    group.add(mesh)
  })
  group.userData.directorMeshKey = meshKey
  group.userData.directorColor = undefined
  group.userData.directorShadowEnabled = undefined
  group.userData.directorJointAnglesKey = undefined
  group.userData.directorLabelKey = undefined
}

function syncDirectorObjectGroup(group: THREE.Group, object: LibTvDirectorConsole3DObject, pack: DirectorConsole3DScenePack, state: LibTvDirectorConsole3DState) {
  const renderKey = getDirectorObjectRenderKey(object, pack, state)
  if (group.userData.directorRenderKey === renderKey) return
  const meshKey = getDirectorObjectMeshKey(object, pack)
  if (group.userData.directorMeshKey !== meshKey || group.children.length === 0) {
    rebuildDirectorObjectGroup(group, object, pack, meshKey)
  }
  setDirectorObjectId(group, object.id)
  ensureDirectorPickProxy(group, object)
  syncDirectorObjectColor(group, object)
  syncDirectorCharacterShadow(group, object)
  syncDirectorCharacterPose(group, object)
  syncDirectorCharacterLabel(group, object, state.showCharacterLabels !== false)
  group.userData.directorRenderKey = renderKey
}

function syncDirectorObjectColor(group: THREE.Group, object: LibTvDirectorConsole3DObject) {
  const colorValue = object.color || "#8fb8ff"
  if (group.userData.directorColor === colorValue) return
  const color = new THREE.Color(colorValue)
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || mesh.userData?.isPickProxy) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => {
      const colored = material as THREE.Material & { color?: THREE.Color }
      if (colored.color) {
        colored.color.copy(color)
        colored.needsUpdate = true
      }
    })
  })
  group.userData.directorColor = colorValue
}

function syncDirectorCharacterShadow(group: THREE.Group, object: LibTvDirectorConsole3DObject) {
  if (object.kind !== "character") return
  const enabled = object.shadowEnabled === true
  if (group.userData.directorShadowEnabled === enabled) return
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh || mesh.userData?.isPickProxy) return
    mesh.castShadow = enabled
    mesh.receiveShadow = false
  })
  group.userData.directorShadowEnabled = enabled
}

function syncDirectorCharacterPose(group: THREE.Group, object: LibTvDirectorConsole3DObject) {
  if (object.kind !== "character") return
  const jointAngles = object.jointAngles || getDirectorPosePreset(object.pose).jointAngles
  const jointAnglesKey = JSON.stringify(jointAngles)
  if (group.userData.directorJointAnglesKey === jointAnglesKey) return
  group.children.forEach((child) => {
    if (child.userData?.isCharacterLoadingMarker || child.userData?.isDirectorCharacterLabel || child.userData?.isPickProxy) return
    applyDirectorCharacterPose(child, jointAngles)
  })
  group.userData.directorJointAnglesKey = jointAnglesKey
}

function syncDirectorCharacterLabel(group: THREE.Group, object: LibTvDirectorConsole3DObject, visible: boolean) {
  const existing = group.children.find((child) => child.userData?.isDirectorCharacterLabel)
  const characterContent = group.children.find((child) => !child.userData?.isDirectorCharacterLabel && !child.userData?.isPickProxy && !child.userData?.isCharacterLoadingMarker)
  const measuredHeadY = Number(characterContent?.userData.directorHeadY)
  const labelHeight = Number.isFinite(measuredHeadY) && measuredHeadY > 0 ? measuredHeadY : getDirectorCharacterLabelHeight(object.bodyType)
  const labelKey = `${visible ? "1" : "0"}:${object.name || ""}:${object.bodyType || ""}`
  if (group.userData.directorLabelKey === labelKey) {
    if (existing) existing.visible = visible
    return
  }
  if (existing) {
    existing.removeFromParent()
    disposeDirectorObject3D(existing)
  }
  if (object.kind === "character" && visible) {
    group.add(createDirectorCharacterLabel(object.name, object.bodyType, labelHeight))
  }
  group.userData.directorLabelKey = labelKey
}

function buildDirectorUploadedModelStatusMarker(object: LibTvDirectorConsole3DObject, status: "loading" | "failed") {
  const failed = status === "failed"
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: failed ? "#ff6b6b" : object.color || "#8fb8ff",
      transparent: true,
      opacity: failed ? 0.72 : 0.32,
      wireframe: true,
    }),
  )
  marker.position.y = 0.5
  marker.userData.isUploadedModelStatusMarker = status
  if (!failed) return marker

  const group = new THREE.Group()
  group.add(marker)
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (context) {
    const label = "模型加载失败"
    const font = 'bold 16px "PingFang SC", "Microsoft YaHei", sans-serif'
    context.font = font
    canvas.width = Math.ceil(context.measureText(label).width + 20)
    canvas.height = 28
    context.font = font
    context.fillStyle = "rgba(35, 10, 10, 0.88)"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = "#ffb4b4"
    context.textAlign = "center"
    context.textBaseline = "middle"
    context.fillText(label, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }))
  label.position.set(0, 1.18, 0)
  label.scale.set((canvas.width / Math.max(1, canvas.height)) * 0.18, 0.18, 1)
  label.userData.isUploadedModelStatusMarker = status
  group.add(label)
  return group
}

function buildDirectorObjectMesh(object: LibTvDirectorConsole3DObject, pack?: DirectorConsole3DScenePack) {
  const meshes: THREE.Object3D[] = []
  if (object.kind === "uploaded" && object.modelUrl && pack) {
    const cached = pack.uploadedModels.get(object.id)
    if (cached?.url === object.modelUrl && cached.object) return [cached.object.clone(true)]
    if (cached?.url === object.modelUrl && cached.loading) return [buildDirectorUploadedModelStatusMarker(object, "loading")]
    if (cached?.url === object.modelUrl && cached.failed) return [buildDirectorUploadedModelStatusMarker(object, "failed")]
    const placeholder = buildDirectorUploadedModelStatusMarker(object, "loading")
    const request = {
      url: object.modelUrl,
      loadUrl: getDirectorConsoleModelLoadUrl(object.modelUrl),
      loading: true as const,
    }
    pack.uploadedModels.set(object.id, request)
    const loader = new GLTFLoader()
    loader.load(request.loadUrl, (gltf) => {
      if (pack.disposed || pack.uploadedModels.get(object.id) !== request) {
        disposeDirectorObject3D(gltf.scene)
        return
      }
      const loaded = gltf.scene
      loaded.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh) {
          mesh.castShadow = true
          mesh.receiveShadow = true
        }
      })
      normalizeDirectorUploadedModel(loaded)
      pack.uploadedModels.set(object.id, { url: request.url, object: loaded })
      pack.renderedStateKey = ""
    }, undefined, (error) => {
      if (pack.disposed || pack.uploadedModels.get(object.id) !== request) return
      console.error("[DirectorConsole3D] Failed to load uploaded GLB", {
        objectId: object.id,
        modelUrl: request.url,
        loadUrl: request.loadUrl,
        error,
      })
      pack.uploadedModels.set(object.id, { url: request.url, failed: true })
      pack.renderedStateKey = ""
    })
    return [placeholder]
  }
  if (object.kind === "character") {
    const model = getDirectorCharacterModelPreset(object.bodyType)
    if (model && pack) {
      const cacheKey = `character:${model.bodyType}`
      const cached = pack.uploadedModels.get(cacheKey)
	      if (cached?.url === model.modelUrl && cached.object) return [cloneDirectorCharacterModel(cached.object, object)]
	      preloadDirectorCharacterModel(pack, model)
    }
	    return [buildDirectorCharacterLoadingMarker(object)]
	  }
  if (object.kind === "crowd") {
    const rows = Math.max(1, Math.min(12, Math.round(object.crowdRows || Math.sqrt(object.crowdCount || 9))))
    const cols = Math.max(1, Math.min(12, Math.round(object.crowdCols || Math.ceil((object.crowdCount || rows * rows) / rows))))
    const spacing = clampWorkflowNumber(Number(object.crowdSpacing || 1.2), 0.2, 4)
    const count = Math.max(1, Math.min(120, object.crowdCount || rows * cols))
    for (let index = 0; index < count; index += 1) {
      const proxy: LibTvDirectorConsole3DObject = { ...object, kind: "character", bodyType: "mannequin", pose: "stand", color: object.color || "#6fa3ff" }
      const member = new THREE.Group()
      member.position.set((index % cols - (cols - 1) / 2) * spacing, 0, (Math.floor(index / cols) - (rows - 1) / 2) * spacing)
      member.scale.setScalar(getDirectorCharacterModelPreset("mannequin").scale)
      const model = getDirectorCharacterModelPreset(proxy.bodyType)
      if (model && pack) {
        const cacheKey = `character:${model.bodyType}`
        const cached = pack.uploadedModels.get(cacheKey)
        if (cached?.url === model.modelUrl && cached.object) member.add(cloneDirectorCharacterModel(cached.object, proxy))
        else preloadDirectorCharacterModel(pack, model)
      }
      meshes.push(member)
    }
    return meshes
  }
  const primitive = object.primitive || "box"
  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(object.color || "#8fb8ff"), roughness: 0.62, metalness: 0.05 })
  const geometry = primitive === "sphere"
    ? new THREE.SphereGeometry(0.55, 32, 20)
    : primitive === "cylinder"
      ? new THREE.CylinderGeometry(0.45, 0.45, 1, 32)
      : primitive === "torus"
        ? new THREE.TorusGeometry(0.42, 0.14, 18, 48)
        : primitive === "cone"
          ? new THREE.ConeGeometry(0.5, 1, 32)
          : primitive === "pyramid"
            ? new THREE.ConeGeometry(0.58, 1, 4)
            : primitive === "plane"
              ? new THREE.PlaneGeometry(1.6, 1)
              : new THREE.BoxGeometry(1, 1, 1)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (primitive === "plane") mesh.rotation.x = -Math.PI / 2
  if (primitive !== "plane") mesh.position.y = 0.5
  meshes.push(mesh)
  return meshes
}

function preloadDirectorCharacterModel(pack: DirectorConsole3DScenePack, model: { bodyType: string; modelUrl: string }) {
  const cacheKey = `character:${model.bodyType}`
  const cached = pack.uploadedModels.get(cacheKey)
  if (cached?.object || cached?.loading) return
  const request = { url: model.modelUrl, loading: true as const }
  pack.uploadedModels.set(cacheKey, request)
  const loader = new GLTFLoader()
  loader.setCrossOrigin("anonymous")
  loader.load(model.modelUrl, (gltf) => {
    if (pack.disposed || pack.uploadedModels.get(cacheKey) !== request) {
      disposeDirectorObject3D(gltf.scene)
      return
    }
    const loaded = normalizeDirectorCharacterSourceModel(gltf.scene)
    loaded.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = false
        mesh.receiveShadow = false
      }
    })
    pack.uploadedModels.set(cacheKey, { url: model.modelUrl, object: loaded })
    pack.renderedStateKey = ""
  }, undefined, () => {
    if (pack.disposed || pack.uploadedModels.get(cacheKey) !== request) return
    pack.uploadedModels.set(cacheKey, { url: model.modelUrl, failed: true })
    pack.renderedStateKey = ""
  })
}

function normalizeDirectorCharacterSourceModel(source: THREE.Object3D) {
  source.updateMatrixWorld(true)
  const sourceBounds = new THREE.Box3().setFromObject(source)
  const size = new THREE.Vector3()
  sourceBounds.getSize(size)
  source.scale.multiplyScalar(1.75 / (size.y || 1))
  source.updateMatrixWorld(true)

  const normalizedBounds = new THREE.Box3().setFromObject(source)
  const center = normalizedBounds.getCenter(new THREE.Vector3())
  source.position.x -= center.x
  source.position.z -= center.z
  source.position.y -= normalizedBounds.min.y
  source.rotation.y = THREE.MathUtils.degToRad(-90)
  source.updateMatrixWorld(true)
  source.userData.directorBaseRotationY = source.rotation.y
  source.userData.directorHeadY = new THREE.Box3().setFromObject(source).max.y || 1.75
  return source
}

function getDirectorCharacterModelPreset(bodyType: string | undefined) {
  const presets: Record<string, { bodyType: string; modelUrl: string; scale: number }> = {
    mannequin: { bodyType: "mannequin", modelUrl: directorCharacterAssetUrl("1-男性-低模.glb"), scale: 1.03 },
    male: { bodyType: "mannequin", modelUrl: directorCharacterAssetUrl("1-男性-低模.glb"), scale: 1.03 },
    female: { bodyType: "female", modelUrl: directorCharacterAssetUrl("2 女性-低模.glb"), scale: 0.94 },
    athletic: { bodyType: "muscular", modelUrl: directorCharacterAssetUrl("03+健硕.glb"), scale: 1.14 },
    muscular: { bodyType: "muscular", modelUrl: directorCharacterAssetUrl("03+健硕.glb"), scale: 1.14 },
    slim: { bodyType: "slim", modelUrl: directorCharacterAssetUrl("04+纤细.glb"), scale: 0.97 },
    broad: { bodyType: "broad", modelUrl: directorCharacterAssetUrl("05+宽厚.glb"), scale: 1 },
    child: { bodyType: "child", modelUrl: directorCharacterAssetUrl("06+儿童.glb"), scale: 0.63 },
    teen: { bodyType: "teen", modelUrl: directorCharacterAssetUrl("07+少年.glb"), scale: 0.86 },
    chibi: { bodyType: "chibi", modelUrl: directorCharacterAssetUrl("08-二头身.glb"), scale: 0.46 },
  }
  return presets[bodyType || "mannequin"] || presets.mannequin
}

function cloneDirectorCharacterModel(source: THREE.Object3D, object: LibTvDirectorConsole3DObject) {
  const inner = cloneSkeletonObject(source)
  const instance = new THREE.Group()
  const color = new THREE.Color(object.color || "#4F8EF7")
  inner.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.userData.directorSharedCharacterAsset = true
    mesh.castShadow = false
    mesh.receiveShadow = false
    const material = mesh.material
    if (Array.isArray(material)) {
      mesh.material = material.map((item) => cloneDirectorCharacterMaterial(item, color))
    } else if (material) {
      mesh.material = cloneDirectorCharacterMaterial(material, color)
    }
  })
  const rig = bindDirectorCharacterRig(inner)
  if (rig) instance.userData.directorGlbRig = rig
  instance.userData.directorHeadY = Number(inner.userData.directorHeadY || source.userData.directorHeadY || 1.75)
  instance.add(inner)
  applyDirectorCharacterPose(instance, object.jointAngles || getDirectorPosePreset(object.pose).jointAngles)
  return instance
}

function buildDirectorCharacterLoadingMarker(object: LibTvDirectorConsole3DObject) {
  const color = new THREE.Color(object.color || "#4F8EF7")
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.38, depthWrite: false })
  const group = new THREE.Group()
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 8, 32), material)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.02
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, getDirectorCharacterLabelHeight(object.bodyType) * 0.82, 0)]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.32 }),
  )
  group.add(ring, line)
  group.userData.isCharacterLoadingMarker = true
  return group
}

type DirectorCharacterRig = {
  bones: Partial<Record<keyof DirectorResolvedJointAngles, THREE.Object3D>>
  bindQuaternions: Map<string, THREE.Quaternion>
}

const DIRECTOR_CHARACTER_BONE_ALIASES: Record<keyof DirectorResolvedJointAngles, string[]> = {
  root: ["root"],
  body: ["hips", "pelvis", "hip", "root"],
  torso: ["upperchest", "chest", "spine2", "spine1", "spine"],
  head: ["head"],
  l_arm: ["leftupperarm", "leftarm", "lupperarm", "larm", "upperarml", "arml"],
  r_arm: ["rightupperarm", "rightarm", "rupperarm", "rarm", "upperarmr", "armr"],
  l_elbow: ["leftforearm", "leftlowerarm", "lforearm", "llowerarm", "forearml", "lowerarml"],
  r_elbow: ["rightforearm", "rightlowerarm", "rforearm", "rlowerarm", "forearmr", "lowerarmr"],
  l_wrist: ["lefthand", "lhand", "handl"],
  r_wrist: ["righthand", "rhand", "handr"],
  l_leg: ["leftupleg", "leftupperleg", "leftthigh", "lupleg", "lupperleg", "lthigh", "uplegl", "upperlegl", "thighl"],
  r_leg: ["rightupleg", "rightupperleg", "rightthigh", "rupleg", "rupperleg", "rthigh", "uplegr", "upperlegr", "thighr"],
  l_knee: ["leftleg", "leftlowerleg", "leftcalf", "lleg", "llowerleg", "lcalf", "legl", "lowerlegl", "calfl"],
  r_knee: ["rightleg", "rightlowerleg", "rightcalf", "rleg", "rlowerleg", "rcalf", "legr", "lowerlegr", "calfr"],
  l_ankle: ["leftfoot", "lfoot", "footl"],
  r_ankle: ["rightfoot", "rfoot", "footr"],
}

function normalizeDirectorBoneName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function bindDirectorCharacterRig(root: THREE.Object3D): DirectorCharacterRig | null {
  const bones: THREE.Object3D[] = []
  root.traverse((child) => {
    if ((child as THREE.Bone).isBone) bones.push(child)
  })
  if (bones.length === 0) return null
  const rigBones: DirectorCharacterRig["bones"] = {}
  Object.entries(DIRECTOR_CHARACTER_BONE_ALIASES).forEach(([key, aliases]) => {
    const exact = bones.find((bone) => aliases.some((alias) => normalizeDirectorBoneName(bone.name) === alias))
    const fuzzy = exact || bones.find((bone) => aliases.some((alias) => normalizeDirectorBoneName(bone.name).includes(alias)))
    if (fuzzy) rigBones[key as keyof DirectorResolvedJointAngles] = fuzzy
  })
  const bindQuaternions = new Map<string, THREE.Quaternion>()
  Object.values(rigBones).forEach((bone) => {
    if (bone) bindQuaternions.set(bone.uuid, bone.quaternion.clone())
  })
  if (bindQuaternions.size === 0) return null
  const rig = { bones: rigBones, bindQuaternions }
  root.userData.directorGlbRig = rig
  return rig
}

function applyDirectorRigRotation(rig: DirectorCharacterRig, key: keyof DirectorResolvedJointAngles, euler: THREE.Euler) {
  const bone = rig.bones[key]
  if (!bone) return
  const baseQuaternion = rig.bindQuaternions.get(bone.uuid)
  if (!baseQuaternion) return
  const libTvEuler = new THREE.Euler(-euler.x, -euler.y, -euler.z, euler.order)
  const delta = new THREE.Quaternion().setFromEuler(libTvEuler)
  bone.quaternion.copy(baseQuaternion).multiply(delta)
}

function applyDirectorCharacterRootPose(root: THREE.Object3D, angles: DirectorResolvedJointAngles) {
  const basePosition = (root.userData.directorPoseBasePosition ||= root.position.clone()) as THREE.Vector3
  const baseQuaternion = (root.userData.directorPoseBaseQuaternion ||= root.quaternion.clone()) as THREE.Quaternion
  const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(angles.root.pitch),
    0,
    THREE.MathUtils.degToRad(angles.root.roll),
    "YXZ",
  ))
  root.position.copy(basePosition)
  root.position.y += angles.root.height
  root.quaternion.copy(baseQuaternion).multiply(delta)
}

function applyDirectorCharacterPose(root: THREE.Object3D, jointAngles: LibTvDirectorConsole3DJointAngles) {
  const rig = (root.userData.directorGlbRig as DirectorCharacterRig | undefined) || bindDirectorCharacterRig(root)
  if (rig) {
    const angles = cloneDirectorJointAngles(jointAngles)
    const deg = THREE.MathUtils.degToRad
    applyDirectorCharacterRootPose(root, angles)
    applyDirectorRigRotation(rig, "body", new THREE.Euler(deg(angles.body.bend), deg(angles.body.turn), deg(angles.body.tilt), "YXZ"))
    applyDirectorRigRotation(rig, "torso", new THREE.Euler(deg(angles.torso.bend), deg(angles.torso.turn), deg(angles.torso.tilt), "YXZ"))
    applyDirectorRigRotation(rig, "head", new THREE.Euler(deg(angles.head.nod), deg(angles.head.turn), deg(angles.head.tilt), "YXZ"))
    applyDirectorRigRotation(rig, "l_arm", new THREE.Euler(deg(-angles.l_arm.raise), deg(angles.l_arm.turn), deg(-angles.l_arm.straddle), "ZXY"))
    applyDirectorRigRotation(rig, "r_arm", new THREE.Euler(deg(-angles.r_arm.raise), deg(-angles.r_arm.turn), deg(angles.r_arm.straddle), "ZXY"))
    applyDirectorRigRotation(rig, "l_elbow", new THREE.Euler(deg(-angles.l_elbow.bend), 0, 0))
    applyDirectorRigRotation(rig, "r_elbow", new THREE.Euler(deg(-angles.r_elbow.bend), 0, 0))
    applyDirectorRigRotation(rig, "l_wrist", new THREE.Euler(deg(-angles.l_wrist.bend), deg(angles.l_wrist.turn), deg(-angles.l_wrist.tilt), "YXZ"))
    applyDirectorRigRotation(rig, "r_wrist", new THREE.Euler(deg(-angles.r_wrist.bend), deg(-angles.r_wrist.turn), deg(angles.r_wrist.tilt), "YXZ"))
    applyDirectorRigRotation(rig, "l_leg", new THREE.Euler(deg(-angles.l_leg.raise), deg(angles.l_leg.turn), deg(-angles.l_leg.straddle), "ZXY"))
    applyDirectorRigRotation(rig, "r_leg", new THREE.Euler(deg(-angles.r_leg.raise), deg(-angles.r_leg.turn), deg(angles.r_leg.straddle), "ZXY"))
    applyDirectorRigRotation(rig, "l_knee", new THREE.Euler(deg(angles.l_knee.bend), 0, 0))
    applyDirectorRigRotation(rig, "r_knee", new THREE.Euler(deg(angles.r_knee.bend), 0, 0))
    applyDirectorRigRotation(rig, "l_ankle", new THREE.Euler(deg(-angles.l_ankle.bend), deg(angles.l_ankle.turn), deg(-angles.l_ankle.tilt), "YXZ"))
    applyDirectorRigRotation(rig, "r_ankle", new THREE.Euler(deg(-angles.r_ankle.bend), deg(-angles.r_ankle.turn), deg(angles.r_ankle.tilt), "YXZ"))
    return
  }
  const angles = cloneDirectorJointAngles(jointAngles)
  const deg = THREE.MathUtils.degToRad
  applyDirectorCharacterRootPose(root, angles)
  const bone = (name: string) => root.getObjectByName(name)
  const setRotation = (name: string, x: number, y: number, z: number) => {
    const target = bone(name)
    if (!target) return
    const baseQuaternion = getDirectorCharacterBaseQuaternion(target)
    const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(deg(x), deg(y), deg(z), "XYZ"))
    target.quaternion.copy(baseQuaternion).multiply(delta)
  }
  const bendSign = -1
  const rightSign = -1
  const leftSign = 1
  setRotation("Hip", angles.body.bend * bendSign * 0.45, angles.body.turn, angles.body.tilt)
  setRotation("Waist", angles.torso.bend * bendSign * 0.45, angles.torso.turn * 0.45, angles.torso.tilt * 0.45)
  setRotation("Spine01", angles.torso.bend * bendSign * 0.35, angles.torso.turn * 0.35, angles.torso.tilt * 0.35)
  setRotation("Spine02", angles.torso.bend * bendSign * 0.25, angles.torso.turn * 0.25, angles.torso.tilt * 0.25)
  setRotation("Head", angles.head.nod * 0.55, angles.head.turn * 0.65, angles.head.tilt * 0.65)
  setRotation("L_Upperarm", angles.l_arm.raise * 0.85, angles.l_arm.turn * 0.35, angles.l_arm.straddle * leftSign * 0.95)
  setRotation("R_Upperarm", angles.r_arm.raise * 0.85, angles.r_arm.turn * 0.35, angles.r_arm.straddle * rightSign * 0.95)
  setRotation("L_Forearm", 0, angles.l_elbow.bend * 0.12, angles.l_elbow.bend * -0.95)
  setRotation("R_Forearm", 0, angles.r_elbow.bend * -0.12, angles.r_elbow.bend * 0.95)
  setRotation("L_Hand", angles.l_wrist.bend, angles.l_wrist.turn, angles.l_wrist.tilt)
  setRotation("R_Hand", angles.r_wrist.bend, angles.r_wrist.turn * -1, angles.r_wrist.tilt * -1)
  setRotation("L_Thigh", angles.l_leg.raise * 0.95, angles.l_leg.turn * 0.35, angles.l_leg.straddle * leftSign * 0.8)
  setRotation("R_Thigh", angles.r_leg.raise * 0.95, angles.r_leg.turn * 0.35, angles.r_leg.straddle * rightSign * 0.8)
  setRotation("L_Calf", angles.l_knee.bend * -0.95, 0, 0)
  setRotation("R_Calf", angles.r_knee.bend * -0.95, 0, 0)
  setRotation("L_Foot", angles.l_knee.bend * 0.25 + angles.l_ankle.bend, angles.l_ankle.turn, angles.l_ankle.tilt)
  setRotation("R_Foot", angles.r_knee.bend * 0.25 + angles.r_ankle.bend, angles.r_ankle.turn * -1, angles.r_ankle.tilt * -1)
}

function getDirectorCharacterBaseQuaternion(object: THREE.Object3D) {
  const cached = object.userData.directorBaseQuaternion as THREE.Quaternion | undefined
  if (cached) return cached
  const base = object.quaternion.clone()
  object.userData.directorBaseQuaternion = base
  return base
}

function cloneDirectorCharacterMaterial(material: THREE.Material, color: THREE.Color) {
  const cloned = material.clone() as THREE.Material & { color?: THREE.Color }
  if (cloned.color) cloned.color.copy(color)
  cloned.needsUpdate = true
  return cloned
}

function setDirectorObjectId(object: THREE.Object3D, id: string) {
  object.userData.directorObjectId = id
  object.traverse((child) => {
    child.userData.directorObjectId = id
  })
}

function getDirectorCharacterLabelHeight(bodyType: string | undefined) {
  const heights: Record<string, number> = {
    mannequin: 2.08,
    male: 2.08,
    female: 1.95,
    athletic: 2.18,
    muscular: 2.18,
    slim: 2.02,
    broad: 2.04,
    teen: 1.78,
    child: 1.42,
    chibi: 1.03,
  }
  return heights[bodyType || "mannequin"] || heights.mannequin
}

function createDirectorCharacterLabel(text: string, bodyType?: string, measuredHeadY?: number) {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (context) {
    const fontSize = 18
    const label = String(text || "人物").slice(0, 12)
    const font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
    context.font = font
    const paddingX = Math.round(fontSize * 0.4)
    const width = Math.ceil(context.measureText(label).width + paddingX * 2)
    const height = Math.ceil(fontSize * 1.5)
    canvas.width = width
    canvas.height = height
    context.clearRect(0, 0, width, height)
    context.font = font
    context.textAlign = "center"
    context.textBaseline = "middle"
    const radius = Math.round(fontSize * 0.3)
    context.fillStyle = "rgba(0,0,0,0.55)"
    context.beginPath()
    context.moveTo(radius, 0)
    context.lineTo(width - radius, 0)
    context.quadraticCurveTo(width, 0, width, radius)
    context.lineTo(width, height - radius)
    context.quadraticCurveTo(width, height, width - radius, height)
    context.lineTo(radius, height)
    context.quadraticCurveTo(0, height, 0, height - radius)
    context.lineTo(0, radius)
    context.quadraticCurveTo(0, 0, radius, 0)
    context.fill()
    context.fillStyle = "#ffffff"
    context.fillText(label, width / 2, height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }))
  sprite.userData.isDirectorCharacterLabel = true
  const height = canvas.height || 1
  const labelScale = Math.max(0.16, Math.min(0.58, 18 / 100))
  const headY = Number.isFinite(measuredHeadY) && Number(measuredHeadY) > 0 ? Number(measuredHeadY) : getDirectorCharacterLabelHeight(bodyType)
  sprite.position.set(0, headY + 0.14, 0)
  sprite.scale.set((canvas.width / height) * labelScale, labelScale, 1)
  return sprite
}

function normalizeDirectorUploadedModel(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const maxSize = Math.max(size.x, size.y, size.z, 0.001)
  const scale = 1.6 / maxSize
  object.scale.multiplyScalar(scale)
  object.position.sub(center.multiplyScalar(scale))
  object.position.y += Math.max(0, (size.y * scale) / 2)
}

function getDirectorGroupTransform(objects: LibTvDirectorConsole3DObject[]) {
  if (objects.length === 0) {
    return {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: "#8fb8ff",
    }
  }
  const sum = objects.reduce((acc, object) => ({
    position: {
      x: acc.position.x + object.position.x,
      y: acc.position.y + object.position.y,
      z: acc.position.z + object.position.z,
    },
    rotation: {
      x: acc.rotation.x + object.rotation.x,
      y: acc.rotation.y + object.rotation.y,
      z: acc.rotation.z + object.rotation.z,
    },
    scale: {
      x: acc.scale.x + object.scale.x,
      y: acc.scale.y + object.scale.y,
      z: acc.scale.z + object.scale.z,
    },
  }), {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 0, y: 0, z: 0 },
  })
  const count = objects.length
  const firstColor = objects[0]?.color || "#8fb8ff"
  const sameColor = objects.every((object) => (object.color || "#8fb8ff").toLowerCase() === firstColor.toLowerCase())
  return {
    position: { x: sum.position.x / count, y: sum.position.y / count, z: sum.position.z / count },
    rotation: { x: sum.rotation.x / count, y: sum.rotation.y / count, z: sum.rotation.z / count },
    scale: { x: sum.scale.x / count, y: sum.scale.y / count, z: sum.scale.z / count },
    color: sameColor ? firstColor : "#34C759",
  }
}

function DirectorConsole3DSceneProperties({
  state,
  connectedPanoramaUrl,
  onChange,
  onUploadPanorama,
}: {
  state: LibTvDirectorConsole3DState
  connectedPanoramaUrl?: string
  onChange: (patch: Partial<LibTvDirectorConsole3DState>) => void
  onUploadPanorama: () => void
}) {
  const sceneScale = clampWorkflowNumber(Number(state.sceneScale || 1), 0.1, 10)
  const scenePosition = state.scenePosition || { x: 0, y: 0, z: 0 }
  const sceneRotation = state.sceneRotation || { x: 0, y: 0, z: 0 }
  const skyColor = state.skyColor || state.backgroundColor || DIRECTOR_STAGE_VIEWPORT_BACKGROUND
  const skyHex = skyColor.replace("#", "").slice(0, 6).padEnd(6, "0")
  const hasPanorama = Boolean(String(state.environmentUrl || "").trim())
  const usesConnectedPanorama = hasPanorama && String(state.environmentUrl || "").trim() === String(connectedPanoramaUrl || "").trim()
  return (
    <div className="flex flex-col">
      <section className="border-b border-white/8 px-4 py-4">
        <div className="space-y-3">
          <DirectorSliderField
            label="场景缩放"
            min={0.1}
            max={10}
            step={0.1}
            value={sceneScale}
            display={`${Math.round(sceneScale * 100)}%`}
            onChange={(value) => onChange({ sceneScale: value })}
          />
          <DirectorVectorInput label="场景平移" value={scenePosition} onChange={(axis, value) => onChange({ scenePosition: { ...scenePosition, [axis]: value } })} />
          <DirectorVectorInput label="场景旋转" value={sceneRotation} step={1} onChange={(axis, value) => onChange({ sceneRotation: { ...sceneRotation, [axis]: value } })} />
        </div>
      </section>
      <section className="border-b border-white/8 px-4 py-4">
        <div className="mb-5 text-[15px] font-medium leading-none text-neutral-50">全景背景</div>
        <div className="space-y-3">
          <DirectorField label="已连接全景图">
            <button type="button" className="flex w-full items-start gap-2 rounded-[10px] border border-dashed border-white/12 bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]" onClick={onUploadPanorama}>
              <ImageIcon className="mt-0.5 size-3.5 shrink-0 text-white/35" />
              <span className="text-[11px] leading-relaxed text-white/40">{hasPanorama ? (usesConnectedPanorama ? "已连接全景图，点击替换" : "已上传全景图，点击替换") : "请将图片节点连接到 3D 导演台左侧输入口"}</span>
            </button>
          </DirectorField>
          <DirectorField label="天空颜色">
            <div className="flex items-start gap-2">
              <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-lg" style={{ background: `#${skyHex}` }}>
                <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="color" value={`#${skyHex}`} onChange={(event) => onChange({ skyColor: event.target.value, backgroundColor: event.target.value })} />
              </label>
              <div className="flex h-7 min-w-px flex-1 items-center gap-0.5 rounded-lg bg-white/10 px-2">
                <span className="text-[12px] text-white/45">#</span>
                <input maxLength={6} spellCheck={false} className="h-full min-w-0 flex-1 bg-transparent text-[12px] uppercase text-white outline-none" type="text" value={skyHex.toUpperCase()} onChange={(event) => {
                  const next = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6)
                  onChange({ skyColor: `#${next.padEnd(6, "0")}`, backgroundColor: `#${next.padEnd(6, "0")}` })
                }} />
              </div>
            </div>
          </DirectorField>
        </div>
      </section>
      <section className="border-b border-white/8 px-4 py-4">
        <div className="mb-5 text-[15px] font-medium leading-none text-neutral-50">全景球</div>
        <div className="space-y-3 [&>*:nth-child(3)]:hidden">
          <DirectorSliderField label="水平旋转" min={0} max={360} step={1} value={state.panoramaRotation || 0} display={`${Math.round(state.panoramaRotation || 0)}°`} onChange={(value) => onChange({ panoramaRotation: value })} />
          <DirectorSliderField label="球形半径" min={10} max={500} step={10} value={state.panoramaRadius || 60} display={`${Math.round(state.panoramaRadius || 60)}`} onChange={(value) => onChange({ panoramaRadius: value })} />
          <DirectorSliderField label="垂直位置" min={-60} max={60} step={1} value={state.panoramaHeight ?? -18} display={`${Math.round(state.panoramaHeight ?? -18)}`} onChange={(value) => onChange({ panoramaHeight: value })} />
        </div>
      </section>
      <section>
        <DirectorSwitch label="人物标签" checked={state.showCharacterLabels !== false} onChange={(checked) => onChange({ showCharacterLabels: checked })} />
        <DirectorSwitch label="网格吸附" checked={Boolean(state.gridSnap)} onChange={(checked) => onChange({ gridSnap: checked })} />
        <DirectorSwitch label="高斯地面吸附" checked={state.gaussianGroundSnapEnabled === true} onChange={(checked) => onChange({ gaussianGroundSnapEnabled: checked })} />
      </section>
      <section className="px-5 py-5">
        <button type="button" role="switch" aria-checked={state.groundVisible !== false} className="mb-5 flex w-full items-center justify-between text-left" onClick={() => onChange({ groundVisible: state.groundVisible === false })}>
          <span className="text-[15px] font-medium leading-none text-neutral-50">地面</span>
          <DirectorSwitchIndicator checked={state.groundVisible !== false} />
        </button>
        <div className="space-y-3">
          <DirectorSliderField label="透明度" min={0} max={1} step={0.05} value={state.groundOpacity ?? DIRECTOR_STAGE_GROUND_OPACITY} display={(state.groundOpacity ?? DIRECTOR_STAGE_GROUND_OPACITY).toFixed(2)} onChange={(value) => onChange({ groundOpacity: value })} />
          <DirectorSliderField label="高度" min={-2} max={2} step={0.05} value={state.groundHeight ?? 0} display={(state.groundHeight ?? 0).toFixed(1)} onChange={(value) => onChange({ groundHeight: value })} />
        </div>
      </section>
    </div>
  )
}

function DirectorConsole3DProperties({
  tab,
  activeObject,
  activeGroup,
  activeGroupObjects,
  activeCamera,
  sceneRef,
  objects,
  cameras,
  groundSnapAvailable,
  groundSnapY,
  onRename,
  onVectorChange,
  onObjectColor,
  onPoseChange,
  onJointAnglesChange,
  onObjectPatch,
  onUniformScaleChange,
  onCameraChange,
  onSetActiveCamera,
  onSwitchToCameraView,
  timelineMode,
  timelineKeyframes,
  onToggleTimelineKeyframe,
}: {
  tab: "props" | "pose"
  activeObject?: LibTvDirectorConsole3DObject
  activeGroup?: { id: string; name: string; objectIds: string[] }
  activeGroupObjects?: LibTvDirectorConsole3DObject[]
  activeCamera?: LibTvDirectorConsole3DCamera
  sceneRef: React.RefObject<DirectorConsole3DSceneHandle | null>
  objects: LibTvDirectorConsole3DObject[]
  cameras: LibTvDirectorConsole3DCamera[]
  groundSnapAvailable: boolean
  groundSnapY: number
  onRename: (name: string) => void
  onVectorChange: (field: "position" | "rotation" | "scale" | "target", axis: keyof LibTvDirectorConsole3DVector3, value: number) => void
  onObjectColor: (color: string) => void
  onPoseChange: (pose: string) => void
  onJointAnglesChange: (jointAngles: LibTvDirectorConsole3DJointAngles) => void
  onObjectPatch: (patch: Partial<LibTvDirectorConsole3DObject>) => void
  onUniformScaleChange: (scale: number) => void
  onCameraChange: (id: string, patch: Partial<LibTvDirectorConsole3DCamera>) => void
  onSetActiveCamera: (id: string) => void
  onSwitchToCameraView: (id: string) => void
  timelineMode?: boolean
  timelineKeyframes?: Set<string>
  onToggleTimelineKeyframe?: (property: string) => void
}) {
  const camera = activeObject || activeGroup ? undefined : activeCamera
  const groupObjects = activeGroupObjects || []
  const groupTransform = activeGroup && groupObjects.length > 0 ? getDirectorGroupTransform(groupObjects) : null
  const groupUniformScale = groupObjects.length > 0
    ? groupObjects.reduce((sum, object) => sum + Number(object.uniformScale ?? 1), 0) / groupObjects.length
    : 1
  const uniformScale = activeObject ? Number(activeObject.uniformScale ?? 1) : activeGroup ? groupUniformScale : 1
  const showObjectColor = !activeObject?.modelUrl || activeObject.modelUrl.includes("/assets/3d-characters/")
  if (tab === "pose" && activeObject?.kind === "character") {
    return (
      <div className="flex flex-col">
        <section className="border-b border-white/8 px-2 pb-4 pt-2">
          <div className="px-2">
            <div className="mb-1 flex h-7 items-center text-[13px] font-normal leading-none text-white/45">姿势预设</div>
          </div>
          <div className="grid grid-cols-4 gap-1 px-2">
            {DIRECTOR_POSE_PRESETS.map((pose) => (
              <button key={pose.id} type="button" title={pose.label} className={`flex h-7 min-w-0 items-center justify-center rounded-lg px-2 text-center transition-colors ${activeObject.pose === pose.id ? "bg-white/14 text-neutral-50" : "bg-white/8 text-white/70 hover:bg-white/12 hover:text-neutral-50"}`} onClick={() => onPoseChange(pose.id)}>
                <span className="truncate text-[12px] leading-none">{pose.label}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="px-2 pb-4 pt-4">
          <div className="mb-1 flex h-7 items-start px-2 text-[13px] font-normal leading-none text-neutral-50">姿势调节</div>
          <div className="px-2">
            <DirectorJointAngleEditor
              value={cloneDirectorJointAngles(activeObject.jointAngles || getDirectorPosePreset(activeObject.pose).jointAngles)}
              onChange={onJointAnglesChange}
            />
          </div>
        </section>
      </div>
    )
  }
  return (
    <div>
      {camera && !activeObject ? (
        <section className="border-b border-white/8 px-4 py-4">
          <DirectorCameraLivePreview camera={camera} sceneRef={sceneRef} onSwitchToCameraView={() => onSwitchToCameraView(camera.id)} />
        </section>
      ) : null}
      <section className="border-b border-white/8 px-4 py-4">
        <div className="space-y-3">
          {activeGroup ? (
            <div className="mb-4 text-[12px] leading-5 text-white/45">已选中 {groupObjects.length} 个人物，修改将同步应用到全部选中对象</div>
          ) : null}
	              {!activeGroup ? <DirectorField label="名称"><DirectorCommitNameInput value={activeObject?.name || camera?.name || ""} onCommit={onRename} /></DirectorField> : null}
	              {activeObject?.kind === "character" && groundSnapAvailable ? (
	                <button
	                  type="button"
	                  role="switch"
	                  aria-checked={activeObject.panoramaGroundSnapEnabled === true}
	                  className="flex h-14 w-full items-center justify-between border-b border-white/8 text-left transition-colors hover:bg-white/4"
	                  onClick={() => {
	                    const checked = activeObject.panoramaGroundSnapEnabled !== true
	                    onObjectPatch({
	                      panoramaGroundSnapEnabled: checked,
	                      position: checked ? { ...activeObject.position, y: Number(groundSnapY.toFixed(3)) } : activeObject.position,
	                    })
	                  }}
	                >
	                  <span className="text-[13px] font-normal leading-none text-white/85">地面吸附</span>
	                  <DirectorSwitchIndicator checked={activeObject.panoramaGroundSnapEnabled === true} />
	                </button>
	              ) : null}
	              {camera ? (
	                <DirectorField label="切换机位">
	                  <WorkflowSelect value={camera.id} onValueChange={onSetActiveCamera}>
	                    <WorkflowSelectTrigger className="h-7 w-full border-0 bg-white/10 px-2 text-[12px] text-neutral-50 hover:border-transparent focus:border-transparent focus:bg-white/13" aria-label="切换机位">
	                      <WorkflowSelectValue />
	                    </WorkflowSelectTrigger>
	                    <WorkflowSelectContent>
	                      {cameras.map((item) => (
	                        <WorkflowSelectItem key={item.id} value={item.id}>{item.name}</WorkflowSelectItem>
	                      ))}
	                    </WorkflowSelectContent>
	                  </WorkflowSelect>
	                </DirectorField>
	              ) : null}
	          <DirectorVectorInput label="位置" value={groupTransform?.position || activeObject?.position || camera?.position || { x: 0, y: 0, z: 0 }} onChange={(axis, value) => onVectorChange("position", axis, value)} keyframePrefix={timelineMode ? "position" : undefined} keyframedKeys={timelineKeyframes} onToggleKeyframe={onToggleTimelineKeyframe} />
          {activeGroup || activeObject ? (
            <>
              <DirectorVectorInput label="旋转" value={groupTransform?.rotation || activeObject?.rotation || { x: 0, y: 0, z: 0 }} step={1} onChange={(axis, value) => onVectorChange("rotation", axis, value)} keyframePrefix={timelineMode ? "rotation" : undefined} keyframedKeys={timelineKeyframes} onToggleKeyframe={onToggleTimelineKeyframe} />
              <DirectorVectorInput label="缩放" value={groupTransform?.scale || activeObject?.scale || { x: 1, y: 1, z: 1 }} step={0.05} onChange={(axis, value) => onVectorChange("scale", axis, value)} keyframePrefix={timelineMode ? "scale" : undefined} keyframedKeys={timelineKeyframes} onToggleKeyframe={onToggleTimelineKeyframe} />
              <DirectorSliderField label="统一缩放" min={0.1} max={10} step={0.05} value={uniformScale} display={uniformScale.toFixed(1)} onChange={onUniformScaleChange} />
              {showObjectColor ? <DirectorField label="颜色">
                <div className="flex items-center gap-2">
                  <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-lg" style={{ background: groupTransform?.color || activeObject?.color || "#8fb8ff" }}>
                    <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="color" value={groupTransform?.color || activeObject?.color || "#8fb8ff"} onChange={(event) => onObjectColor(event.target.value)} />
                  </label>
                  <DirectorHexColorInput value={groupTransform?.color || activeObject?.color || "#8fb8ff"} onChange={onObjectColor} />
                  <div className="hidden">
                    <span className="text-[12px] text-white/45">#</span>
                    <input maxLength={6} spellCheck={false} className="h-full min-w-0 flex-1 bg-transparent text-[12px] uppercase text-white outline-none" type="text" value={(groupTransform?.color || activeObject?.color || "#8fb8ff").replace("#", "").toUpperCase()} onChange={(event) => onObjectColor(`#${event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).padEnd(6, "0")}`)} />
                  </div>
                </div>
              </DirectorField> : null}
              {activeObject?.kind === "crowd" ? (
                <>
                  <DirectorField label="群众阵列">
                    <div className="grid grid-cols-3 gap-1">
                      <DirectorNumericMiniField label="行" value={activeObject.crowdRows || 3} min={1} max={12} step={1} onChange={(value) => onObjectPatch({ crowdRows: Math.round(value), crowdCount: Math.round(value) * Math.round(activeObject.crowdCols || 3) })} />
                      <DirectorNumericMiniField label="列" value={activeObject.crowdCols || 3} min={1} max={12} step={1} onChange={(value) => onObjectPatch({ crowdCols: Math.round(value), crowdCount: Math.round(activeObject.crowdRows || 3) * Math.round(value) })} />
                      <DirectorNumericMiniField label="距" value={activeObject.crowdSpacing || 1.2} min={0.2} max={4} step={0.1} onChange={(value) => onObjectPatch({ crowdSpacing: value })} />
                    </div>
                  </DirectorField>
                </>
              ) : null}
            </>
          ) : camera ? (
            <>
              <DirectorField label="跟随目标">
                <WorkflowSelect value={camera.targetObjectId || "__none__"} onValueChange={(value) => onCameraChange(camera.id, { targetObjectId: value === "__none__" ? undefined : value })}>
                  <WorkflowSelectTrigger className="h-7 w-full border-0 bg-white/10 px-2 text-[12px] text-neutral-50 hover:border-transparent focus:border-transparent" aria-label="跟随目标">
                    <WorkflowSelectValue />
                  </WorkflowSelectTrigger>
                  <WorkflowSelectContent>
                    <WorkflowSelectItem value="__none__">不跟随</WorkflowSelectItem>
                    {objects.filter((object) => object.kind === "character").map((object) => (
                      <WorkflowSelectItem key={object.id} value={object.id}>{object.name}</WorkflowSelectItem>
                    ))}
                  </WorkflowSelectContent>
                </WorkflowSelect>
              </DirectorField>
              {!camera.targetObjectId ? <DirectorVectorInput label="旋转" value={cloneDirectorConsoleVector(camera.rotation, getDirectorCameraRotationFromTarget(camera.position, camera.target))} step={0.1} onChange={(axis, value) => onVectorChange("rotation", axis, value)} keyframePrefix={timelineMode ? "rotation" : undefined} keyframedKeys={timelineKeyframes} onToggleKeyframe={onToggleTimelineKeyframe} /> : null}
              <DirectorField label="注视目标">
                <WorkflowSelect value={camera.targetObjectId || "manual-coordinate"} onValueChange={(value) => onCameraChange(camera.id, { targetObjectId: value.startsWith("manual-") ? undefined : value })}>
                  <WorkflowSelectTrigger className="h-7 w-full border-0 bg-white/10 px-2 text-[12px] text-neutral-50 hover:border-transparent focus:border-transparent" aria-label="注视目标">
                    <WorkflowSelectValue />
                  </WorkflowSelectTrigger>
                  <WorkflowSelectContent>
                    <WorkflowSelectItem value="manual-coordinate">手动坐标</WorkflowSelectItem>
                    <WorkflowSelectItem value="manual-rotation">手动旋转</WorkflowSelectItem>
                    {objects.filter((object) => object.kind === "character").map((object) => (
                      <WorkflowSelectItem key={object.id} value={object.id}>{object.name}</WorkflowSelectItem>
                    ))}
                  </WorkflowSelectContent>
                </WorkflowSelect>
              </DirectorField>
              {!camera.targetObjectId ? <DirectorVectorInput label="注视坐标" value={camera.target} onChange={(axis, value) => onVectorChange("target", axis, value)} /> : null}
            </>
          ) : null}
        </div>
      </section>
      {camera && !activeObject ? (
        <section className="border-b border-white/8 px-4 py-4">
          <div className="mb-3 flex items-center gap-1">
            <div className="text-[13px] font-medium leading-none text-white/45">视野角度 (FOV)</div>
            <span className="group relative flex size-4 items-center justify-center text-white/45">
              <CircleHelp className="size-3.5" />
              <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-[1700] w-[236px] -translate-x-1/2 rounded-lg bg-[#2b2b2b] px-2.5 py-2 text-[12px] font-normal leading-5 text-white/80 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-opacity group-hover:opacity-100">
                控制镜头视野范围。数值越小，画面越近、越聚焦；数值越大，画面越广、能看到更多环境。
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2"><input type="range" min={15} max={90} step={1} className="w-[170px]" value={camera.fov} onChange={(event) => onCameraChange(camera.id, { fov: Number(event.target.value) })} /><input className="h-7 min-w-px flex-1 rounded-lg border-0 bg-white/10 px-2 text-center text-[13px] text-neutral-50 outline-none" value={camera.fov.toFixed(1)} onChange={(event) => onCameraChange(camera.id, { fov: clampWorkflowNumber(Number(event.target.value), 15, 90) })} />{timelineMode ? <DirectorKeyframeButton active={Boolean(timelineKeyframes?.has("fov"))} onClick={() => onToggleTimelineKeyframe?.("fov")} /> : null}</div>
        </section>
      ) : null}
      {camera && !activeObject ? (
        <section className="border-b border-white/8 px-4 py-4">
          <div className="mb-5 text-[15px] font-medium leading-none text-neutral-50">相机截图</div>
          <div className="grid grid-cols-3 gap-1">
            {(camera.captures || []).map((capture, index) => (
              <div key={capture.id} className="group flex min-w-0 flex-col gap-1">
                <div className="relative aspect-video overflow-hidden rounded-lg bg-white/8">
                  <img src={capture.dataUrl} alt={capture.name} className="h-full w-full object-cover" />
                </div>
                <span className="w-full truncate text-left text-[12px] leading-[18px] text-white/45">截图{String(index + 1).padStart(2, "0")}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function DirectorCommitNameInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const cancelNextBlurRef = useRef(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    const next = draft.trim()
    if (!next) {
      setDraft(value)
      return
    }
    setDraft(next)
    if (next !== value) onCommit(next)
  }

  return (
    <input
      className="h-7 w-full rounded-lg border-0 bg-white/10 px-2 text-[12px] text-neutral-50 outline-none focus:bg-white/13"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelNextBlurRef.current) cancelNextBlurRef.current = false
        else commit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          cancelNextBlurRef.current = true
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function DirectorHexColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const normalizedValue = value.replace("#", "").slice(0, 6).toUpperCase()
  const [draft, setDraft] = useState(normalizedValue)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDraft(normalizedValue)
  }, [focused, normalizedValue])

  return (
    <div className="flex h-7 min-w-px flex-1 items-center gap-0.5 rounded-lg bg-white/10 px-2">
      <span className="text-[12px] text-white/45">#</span>
      <input
        maxLength={6}
        spellCheck={false}
        className="h-full min-w-0 flex-1 bg-transparent text-[12px] uppercase text-white outline-none"
        type="text"
        value={draft}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false)
          setDraft(normalizedValue)
        }}
        onChange={(event) => {
          const next = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase()
          setDraft(next)
          if (next.length === 3 || next.length === 6) onChange("#" + next)
        }}
      />
    </div>
  )
}

function DirectorField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 flex h-7 items-center text-[13px] font-normal leading-none text-white/45">{label}</div>{children}</div>
}

function DirectorNumericMiniField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div className="relative block min-w-0">
      <span className="absolute left-0 top-0 z-10 flex h-7 w-5 items-center justify-center rounded-l-lg text-[12px] text-white/45">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(clampWorkflowNumber(Number(event.target.value), min, max))}
        className="h-7 w-full rounded-lg border-0 bg-white/10 pl-6 pr-2 text-[12px] tabular-nums text-neutral-50 outline-none [appearance:textfield] focus:bg-white/13"
      />
    </div>
  )
}

function DirectorCameraLivePreview({
  camera,
  sceneRef,
  onSwitchToCameraView,
}: {
  camera: LibTvDirectorConsole3DCamera
  sceneRef: React.RefObject<DirectorConsole3DSceneHandle | null>
  onSwitchToCameraView: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [ready, setReady] = useState(false)
  const readyRef = useRef(false)

  useEffect(() => {
    let frame = 0
    let disposed = false
    let visible = true
    const updateReady = (next: boolean) => {
      if (readyRef.current === next) return
      readyRef.current = next
      setReady(next)
    }
    const schedule = () => {
      if (!disposed && visible && document.visibilityState !== "hidden" && frame === 0) frame = window.requestAnimationFrame(render)
    }
    const render = () => {
      frame = 0
      if (disposed || !visible || document.visibilityState === "hidden") return
      const canvas = canvasRef.current
      if (!canvas) { schedule(); return }
      updateReady(sceneRef.current?.renderCameraPreview(canvas, camera.id) || false)
      schedule()
    }
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting !== false
      if (!visible && frame) { window.cancelAnimationFrame(frame); frame = 0 }
      if (visible) schedule()
    }, { threshold: 0.01 })
    if (canvasRef.current) observer?.observe(canvasRef.current)
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (frame) window.cancelAnimationFrame(frame)
        frame = 0
      } else schedule()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    schedule()
    return () => {
      disposed = true
      observer?.disconnect()
      document.removeEventListener("visibilitychange", handleVisibility)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [camera.id, sceneRef])

  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{ width: 240, height: 135, background: "rgba(8,8,16,0.95)", borderColor: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)" }}
    >
      <canvas ref={canvasRef} width={240} height={135} style={{ width: 240, height: 135, display: "block" }} />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/25"><Camera className="size-9" /></div>
      ) : null}
      <div className="pointer-events-none absolute left-3 top-3 text-[13px] leading-none text-white/55">FOV {Math.round(camera.fov)}°</div>
      <button type="button" className="absolute bottom-3 right-3 flex size-6 items-center justify-center rounded-lg bg-white/10 text-white/85 transition-colors hover:bg-white/16 hover:text-white" aria-label="切换到机位视角" title="切换到机位视角" onClick={onSwitchToCameraView}>
        <DirectorCameraSwitchIcon />
      </button>
    </div>
  )
}

const DIRECTOR_JOINT_EDITOR_GROUPS: Array<{
  title: string
  items: Array<
    | { type: "side"; side: "left" | "right" }
    | { type: "row"; group: keyof DirectorResolvedJointAngles; axis: string; label: string; min: number; max: number; step?: number }
  >
}> = [
  {
    title: "整体姿态",
    items: [
      { type: "row", group: "root", axis: "height", label: "离地高度", min: -1.2, max: 0.6, step: 0.01 },
      { type: "row", group: "root", axis: "pitch", label: "整体俯仰", min: -90, max: 90 },
      { type: "row", group: "root", axis: "roll", label: "整体侧翻", min: -90, max: 90 },
    ],
  },
  {
    title: "身体",
    items: [
      { type: "row", group: "body", axis: "bend", label: "前倾", min: -90, max: 90 },
      { type: "row", group: "body", axis: "turn", label: "转身", min: -90, max: 90 },
      { type: "row", group: "body", axis: "tilt", label: "侧倾", min: -45, max: 45 },
    ],
  },
  {
    title: "躯干",
    items: [
      { type: "row", group: "torso", axis: "bend", label: "前倾", min: -45, max: 45 },
      { type: "row", group: "torso", axis: "turn", label: "扭转", min: -45, max: 45 },
      { type: "row", group: "torso", axis: "tilt", label: "侧倾", min: -30, max: 30 },
    ],
  },
  {
    title: "头部",
    items: [
      { type: "row", group: "head", axis: "nod", label: "点头", min: -60, max: 60 },
      { type: "row", group: "head", axis: "turn", label: "转头", min: -90, max: 90 },
      { type: "row", group: "head", axis: "tilt", label: "歪头", min: -30, max: 30 },
    ],
  },
  {
    title: "手臂 — 肩",
    items: [
      { type: "side", side: "left" },
      { type: "row", group: "l_arm", axis: "raise", label: "前举", min: -90, max: 180 },
      { type: "row", group: "l_arm", axis: "straddle", label: "外展", min: -45, max: 90 },
      { type: "row", group: "l_arm", axis: "turn", label: "扭转", min: -90, max: 90 },
      { type: "side", side: "right" },
      { type: "row", group: "r_arm", axis: "raise", label: "前举", min: -90, max: 180 },
      { type: "row", group: "r_arm", axis: "straddle", label: "外展", min: -45, max: 90 },
      { type: "row", group: "r_arm", axis: "turn", label: "扭转", min: -90, max: 90 },
    ],
  },
  {
    title: "肘部",
    items: [
      { type: "side", side: "left" },
      { type: "row", group: "l_elbow", axis: "bend", label: "弯曲", min: 0, max: 150 },
      { type: "side", side: "right" },
      { type: "row", group: "r_elbow", axis: "bend", label: "弯曲", min: 0, max: 150 },
    ],
  },
  {
    title: "手腕",
    items: [
      { type: "side", side: "left" },
      { type: "row", group: "l_wrist", axis: "bend", label: "屈伸", min: -90, max: 90 },
      { type: "row", group: "l_wrist", axis: "turn", label: "旋转", min: -90, max: 90 },
      { type: "row", group: "l_wrist", axis: "tilt", label: "侧摆", min: -60, max: 60 },
      { type: "side", side: "right" },
      { type: "row", group: "r_wrist", axis: "bend", label: "屈伸", min: -90, max: 90 },
      { type: "row", group: "r_wrist", axis: "turn", label: "旋转", min: -90, max: 90 },
      { type: "row", group: "r_wrist", axis: "tilt", label: "侧摆", min: -60, max: 60 },
    ],
  },
  {
    title: "腿部 — 髋",
    items: [
      { type: "side", side: "left" },
      { type: "row", group: "l_leg", axis: "raise", label: "前抬", min: -90, max: 90 },
      { type: "row", group: "l_leg", axis: "straddle", label: "外展", min: -30, max: 60 },
      { type: "row", group: "l_leg", axis: "turn", label: "扭转", min: -45, max: 45 },
      { type: "side", side: "right" },
      { type: "row", group: "r_leg", axis: "raise", label: "前抬", min: -90, max: 90 },
      { type: "row", group: "r_leg", axis: "straddle", label: "外展", min: -30, max: 60 },
      { type: "row", group: "r_leg", axis: "turn", label: "扭转", min: -45, max: 45 },
    ],
  },
  {
    title: "膝部",
    items: [
      { type: "side", side: "left" },
      { type: "row", group: "l_knee", axis: "bend", label: "弯曲", min: 0, max: 150 },
      { type: "side", side: "right" },
      { type: "row", group: "r_knee", axis: "bend", label: "弯曲", min: 0, max: 150 },
    ],
  },
  {
    title: "脚踝",
    items: [
      { type: "side", side: "left" },
      { type: "row", group: "l_ankle", axis: "bend", label: "屈伸", min: -60, max: 60 },
      { type: "row", group: "l_ankle", axis: "turn", label: "旋转", min: -45, max: 45 },
      { type: "row", group: "l_ankle", axis: "tilt", label: "侧摆", min: -45, max: 45 },
      { type: "side", side: "right" },
      { type: "row", group: "r_ankle", axis: "bend", label: "屈伸", min: -60, max: 60 },
      { type: "row", group: "r_ankle", axis: "turn", label: "旋转", min: -45, max: 45 },
      { type: "row", group: "r_ankle", axis: "tilt", label: "侧摆", min: -45, max: 45 },
    ],
  },
]

function DirectorJointAngleEditor({
  value,
  onChange,
}: {
  value: DirectorResolvedJointAngles
  onChange: (value: LibTvDirectorConsole3DJointAngles) => void
}) {
  const updateAngle = useCallback((group: keyof DirectorResolvedJointAngles, axis: string, next: number) => {
    onChange({
      ...value,
      [group]: {
        ...value[group],
        [axis]: next,
      },
    })
  }, [onChange, value])

  return (
    <div className="flex flex-col gap-3">
      {DIRECTOR_JOINT_EDITOR_GROUPS.map((group) => (
        <div key={group.title}>
          <div className="mb-3 text-[13px] font-medium leading-none text-white/50">{group.title}</div>
          <div className="flex flex-col gap-2.5">
            {group.items.map((item, index) => {
              if (item.type === "side") {
                return (
                  <div key={`${group.title}-${item.side}-${index}`} className={`${index === 0 ? "mb-1" : "mb-1 mt-2"} flex items-center gap-1.5`}>
                    <span className="text-[13px] font-normal leading-none text-white/45">
                      {item.side === "left" ? "左侧" : "右侧"}
                    </span>
                  </div>
                )
              }
              const row = item
              const current = Number((value[row.group] as Record<string, number>)[row.axis] || 0)
              return (
                <DirectorCompactAngleSlider
                  key={`${row.group}-${row.axis}`}
                  label={row.label}
                  value={current}
                  min={row.min}
                  max={row.max}
                  step={row.step}
                  onChange={(next) => updateAngle(row.group, row.axis, next)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function DirectorCompactAngleSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  const percent = clampWorkflowNumber(((value - min) / (max - min)) * 100, 0, 100)
  const displayValue = step < 1 ? value.toFixed(2) : `${Math.round(value)}`
  return (
    <div className="flex h-7 items-center gap-2">
      <span className="w-16 shrink-0 text-[13px] leading-none text-white/45">{label}</span>
      <div className="relative h-5 min-w-0 flex-1">
        <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-white/22">
          <div className="h-full rounded-full bg-white/90" style={{ width: `${percent}%` }} />
        </div>
        <div className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#262626] bg-white" style={{ left: `${percent}%` }} />
        <input type="range" min={min} max={max} step={step} value={value} className="absolute inset-x-0 top-1/2 h-5 w-full -translate-y-1/2 cursor-pointer opacity-0" onChange={(event) => onChange(Number(event.target.value))} />
      </div>
      <input
        type="text"
        inputMode="decimal"
        aria-label={step < 1 ? label : `${label}角度`}
        value={displayValue}
        onChange={(event) => {
          const next = Number(event.target.value.replace(/[^0-9.-]/g, ""))
          if (Number.isFinite(next)) onChange(clampWorkflowNumber(next, min, max))
        }}
        className="h-7 w-[70px] shrink-0 rounded-lg border-0 bg-white/10 px-2 text-center text-[13px] tabular-nums text-neutral-50 outline-none transition-colors focus:bg-white/13"
      />
    </div>
  )
}

function DirectorSliderField({ label, min, max, step, value, display, onChange }: { label: string; min: number; max: number; step: number; value: number; display: string; onChange: (value: number) => void }) {
  const percent = ((value - min) / (max - min)) * 100
  return (
    <DirectorField label={label}>
      <div className="flex items-center justify-center gap-2">
        <div className="relative h-5 w-[170px] shrink-0">
          <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-[#5c5c5c]">
            <div className="h-full rounded-full bg-[#09caf5]" style={{ width: `${clampWorkflowNumber(percent, 0, 100)}%` }} />
          </div>
          <div className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#262626] bg-white" style={{ left: `${clampWorkflowNumber(percent, 0, 100)}%` }} />
          <input min={min} max={max} step={step} className="absolute inset-x-0 top-1/2 h-5 w-full -translate-y-1/2 cursor-pointer opacity-0" type="range" value={value} onChange={(event) => onChange(Number(event.target.value))} />
        </div>
        <DirectorSliderNumberInput display={display} min={min} max={max} step={step} onChange={onChange} />
      </div>
    </DirectorField>
  )
}

function DirectorSliderNumberInput({ display, min, max, step, onChange }: { display: string; min: number; max: number; step: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(display)
  const [focused, setFocused] = useState(false)
  const cancelNextBlurRef = useRef(false)
  useEffect(() => {
    if (!focused) setDraft(display)
  }, [display, focused])
  const commit = () => {
    const numeric = Number(draft.replace(/[^0-9.-]/g, ""))
    if (!Number.isFinite(numeric)) {
      setDraft(display)
      return
    }
    const clamped = clampWorkflowNumber(numeric, min, max)
    const quantized = min + Math.round((clamped - min) / step) * step
    onChange(Number(clampWorkflowNumber(quantized, min, max).toFixed(4)))
  }
  return (
    <input
      className="h-7 min-w-px flex-1 rounded-lg border-0 bg-white/10 px-2 text-center text-[13px] tabular-nums text-neutral-50 outline-none transition-colors focus:bg-white/13"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelNextBlurRef.current) cancelNextBlurRef.current = false
        else commit()
        setFocused(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          cancelNextBlurRef.current = true
          setDraft(display)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function DirectorSwitchIndicator({ checked }: { checked: boolean }) {
  return <span className={`relative h-[14px] w-6 rounded-full transition-colors ${checked ? "bg-white" : "bg-white/18"}`}><span className={`absolute top-0.5 size-2.5 rounded-full transition-transform ${checked ? "translate-x-3 bg-[#1f1f1f]" : "translate-x-0.5 bg-white/65"}`} /></span>
}

function DirectorSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="flex h-14 w-full items-center justify-between border-b border-white/8 px-4 text-left transition-colors hover:bg-white/4" onClick={() => onChange(!checked)}>
      <span className="text-[13px] font-normal leading-none text-white/85">{label}</span>
      <DirectorSwitchIndicator checked={checked} />
    </button>
  )
}

function DirectorVectorInput({ label, value, step = 0.1, onChange, keyframePrefix, keyframedKeys, onToggleKeyframe }: { label: string; value: LibTvDirectorConsole3DVector3; step?: number; onChange: (axis: keyof LibTvDirectorConsole3DVector3, value: number) => void; keyframePrefix?: string; keyframedKeys?: Set<string>; onToggleKeyframe?: (property: string) => void }) {
  const dragRef = useRef<{
    axis: keyof LibTvDirectorConsole3DVector3
    pointerId: number
    startX: number
    startValue: number
    previousCursor: string
    previousUserSelect: string
  } | null>(null)
  useEffect(() => () => {
    const drag = dragRef.current
    if (!drag) return
    document.body.style.cursor = drag.previousCursor
    document.body.style.userSelect = drag.previousUserSelect
    dragRef.current = null
  }, [])
  const finishAxisDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>, axis: keyof LibTvDirectorConsole3DVector3) => {
    const drag = dragRef.current
    if (!drag || drag.axis !== axis || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    document.body.style.cursor = drag.previousCursor
    document.body.style.userSelect = drag.previousUserSelect
    dragRef.current = null
  }, [])
  const beginAxisDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>, axis: keyof LibTvDirectorConsole3DVector3) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      axis,
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: Number(value[axis] || 0),
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect,
    }
    document.body.style.cursor = "ew-resize"
    document.body.style.userSelect = "none"
  }, [value])
  const moveAxisDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>, axis: keyof LibTvDirectorConsole3DVector3) => {
    const drag = dragRef.current
    if (!drag || drag.axis !== axis || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const speed = event.shiftKey ? 10 : event.altKey ? 0.1 : 1
    const next = Number((drag.startValue + (event.clientX - drag.startX) * step * speed).toFixed(2))
    onChange(axis, next)
  }, [onChange, step])
  const formatAxisValue = (next: number) => {
    if (!Number.isFinite(next)) return "0"
    return Number(next.toFixed(2)).toString()
  }
  return (
    <DirectorField label={label}>
      <div className="grid grid-cols-3 gap-1">
        {(["x", "y", "z"] as const).map((axis) => (
          <div key={axis} className="relative block min-w-0">
            <button
              type="button"
              aria-label={`左右拖动调整 ${axis.toUpperCase()} 轴`}
              title={`左右拖动调整 ${axis.toUpperCase()} 轴`}
              className="absolute left-0 top-0 z-10 flex h-7 w-5 cursor-ew-resize touch-none select-none items-center justify-center rounded-l-lg bg-transparent text-[12px] uppercase text-white/45 transition-colors hover:bg-white/8 hover:text-white/75 active:text-[#5FE8FF]"
              onPointerDown={(event) => beginAxisDrag(event, axis)}
              onPointerMove={(event) => moveAxisDrag(event, axis)}
              onPointerUp={(event) => finishAxisDrag(event, axis)}
              onPointerCancel={(event) => finishAxisDrag(event, axis)}
              onLostPointerCapture={(event) => finishAxisDrag(event, axis)}
            >
              {axis}
            </button>
            <input step={step} className={["h-7 w-full rounded-lg border-0 bg-white/10 pl-6 text-[12px] tabular-nums text-neutral-50 outline-none [appearance:textfield] focus:bg-white/13", keyframePrefix ? "pr-6" : "pr-2"].join(" ")} type="number" value={formatAxisValue(Number(value[axis]))} onChange={(event) => onChange(axis, Number(event.target.value))} />
            {keyframePrefix ? <span className="absolute right-0 top-0"><DirectorKeyframeButton compact active={Boolean(keyframedKeys?.has([keyframePrefix, axis].join(".")))} onClick={() => onToggleKeyframe?.([keyframePrefix, axis].join("."))} /></span> : null}
          </div>
        ))}
      </div>
    </DirectorField>
  )
}

function DirectorKeyframeButton({ active, compact, onClick }: { active: boolean; compact?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={active ? "当前帧已有关键帧" : "当前帧无关键帧"}
      title={active ? "移除当前帧关键帧" : "添加当前帧关键帧"}
      className={[compact ? "h-7 w-5 rounded-r-lg" : "h-7 w-7 rounded-lg", "flex shrink-0 items-center justify-center text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"].join(" ")}
      onClick={onClick}
    >
      <span className={["block size-2 rotate-45 border", active ? "border-[#5FE8FF] bg-[#5FE8FF]" : "border-white/45 bg-transparent"].join(" ")} />
    </button>
  )
}

function DirectorConsole3DCaptures({
  cameras,
  onSend,
  onDelete,
  onClear,
}: {
  cameras: LibTvDirectorConsole3DCamera[]
  onSend?: (capture: LibTvDirectorConsole3DCapture, options?: { batchIndex?: number; batchTotal?: number }) => void
  onDelete: (cameraId: string, captureId: string) => void
  onClear: () => void
	}) {
	  const allCaptureGroups = cameras
	    .map((camera) => ({ camera, captures: camera.captures || [] }))
	    .filter((group) => group.captures.length > 0)
    const allCaptures = allCaptureGroups.flatMap((group) => group.captures)
	  const sendCapture = useCallback((capture: LibTvDirectorConsole3DCapture) => {
	    if (!onSend) return
	    onSend(capture)
	    message.success("已发送截图到画布")
	  }, [onSend])
	  const sendAllCaptures = () => {
	    if (!onSend || allCaptures.length === 0) return
	    allCaptures.forEach((capture, index) => onSend(capture, { batchIndex: index, batchTotal: allCaptures.length }))
	    message.success(["已发送", allCaptures.length, "张截图到画布"].join(" "))
	  }
	  return (
    <div className="flex min-h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-2 pb-4 pt-3">
        {allCaptureGroups.length > 0 ? allCaptureGroups.map(({ camera, captures: cameraCaptures }) => (
          <section key={camera.id} className="flex w-full flex-col gap-1 px-2">
            <div className="flex h-7 items-center text-[13px] font-normal leading-none text-white/45">{camera.name}截图</div>
            <div className="grid grid-cols-3 gap-1">
              {cameraCaptures.map((capture, index) => (
                <div key={capture.id} className="group flex min-w-0 flex-col gap-1">
                  <div className="relative aspect-video overflow-hidden rounded-lg bg-white/8">
                    <img src={capture.dataUrl} alt={capture.name} className="h-full w-full object-cover" />
                    <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
	                      <button type="button" aria-label="发送到画布" className="flex size-5 items-center justify-center rounded bg-black/55 text-white/90 hover:bg-black/75" onClick={() => sendCapture(capture)}><Share2 className="size-3" /></button>
                      <button type="button" aria-label="删除" className="flex size-5 items-center justify-center rounded bg-black/55 text-white/90 hover:bg-black/75" onClick={() => onDelete(camera.id, capture.id)}><X className="size-3" /></button>
                    </div>
                  </div>
                  <span className="w-full truncate text-left text-[12px] leading-[18px] text-white/45">{camera.name}-截图{String(index + 1).padStart(2, "0")}</span>
                </div>
              ))}
            </div>
          </section>
        )) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-[13px] leading-5 text-white/40">暂无摄像机截图</div>
        )}
      </div>
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 gap-2 border-t border-white/8 bg-[#1f1f1f] p-4">
        <button type="button" disabled={allCaptures.length === 0} className="flex h-10 flex-1 items-center justify-center rounded-lg bg-white/10 text-[13px] text-white/70 transition-colors hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => { if (window.confirm("确认清空全部摄像机截图？")) onClear() }}>全部清空</button>
		        <button type="button" disabled={allCaptures.length === 0 || !onSend} className="flex h-10 flex-1 items-center justify-center rounded-lg bg-white text-[13px] text-neutral-950 transition-[filter,opacity] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40" onClick={sendAllCaptures}>发送到画布</button>
      </div>
    </div>
  )
}
