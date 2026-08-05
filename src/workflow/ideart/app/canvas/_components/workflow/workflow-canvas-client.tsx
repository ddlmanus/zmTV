"use client"

import { LibTvWorkflowCanvas } from "@/components/editor"
import { ColorfulLoader } from "@/workflow/ideart/components/ui/colorful-loader"
import { buildCanvasProjectUrl } from "@/workflow/ideart/lib/canvas/canvas-routes"
import { normalizeCanvasProjectContent, type LibTvProjectCanvas } from "@/workflow/ideart/lib/canvas-project-content"
import { useCanvasStore } from "@/workflow/ideart/lib/store/canvas-store"
import { message } from "@/workflow/ideart/shims/antd"
import { useRouter } from "@/workflow/ideart/shims/next-navigation"
import { Suspense, useEffect, useRef, useState } from "react"

type CanvasProjectResponse = {
  id?: string
  title?: string | null
  thumbnail?: string | null
  content?: string | null
  canvasType?: string | null
}

const inflightCanvasProjectLoads = new Map<string, Promise<CanvasProjectResponse>>()

function loadCanvasProject(projectId: string) {
  const normalizedProjectId = String(projectId || "").trim()
  const existing = inflightCanvasProjectLoads.get(normalizedProjectId)
  if (existing) return existing

  const promise = fetch(`/api/projects/${encodeURIComponent(normalizedProjectId)}`, { cache: "no-store", credentials: "include" })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const error = new Error(String(data?.error || "加载项目失败")) as Error & { status?: number }
        error.status = res.status
        throw error
      }
      return data as CanvasProjectResponse
    })
    .finally(() => {
      inflightCanvasProjectLoads.delete(normalizedProjectId)
    })

  inflightCanvasProjectLoads.set(normalizedProjectId, promise)
  return promise
}

function resetEmptyWorkflowProject() {
  const canvasStore = useCanvasStore.getState()
  canvasStore.initialize([])
  canvasStore.setProjectMaterials([])
  canvasStore.setLibTvWorkflow({
    enabled: false,
    nodes: [],
    edges: [],
    activeNodeId: null,
    lastRun: null,
  })
}

function CanvasLoadingScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-black text-white/80">
      <div className="flex flex-col items-center gap-3">
        <ColorfulLoader className="size-8" thickness={4} />
        <div className="text-[16px] font-medium">正在加载工作流...</div>
      </div>
    </div>
  )
}

export default function WorkflowCanvasPage({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [isNewBlankProject, setIsNewBlankProject] = useState(false)
  const [newProjectTitle, setNewProjectTitle] = useState("")
  const projectLoadSeqRef = useRef(0)
  const [projectReady, setProjectReady] = useState(false)
  const [projectCanvases, setProjectCanvases] = useState<LibTvProjectCanvas[]>()
  const [activeProjectCanvasId, setActiveProjectCanvasId] = useState<string>()

  useEffect(() => {
    if (typeof window === "undefined") return
    const search = new URLSearchParams(window.location.search)
    setIsNewBlankProject(search.get("new") === "1")
    setNewProjectTitle(String(search.get("title") || "").trim())
  }, [])

  useEffect(() => {
    if (!projectId) return
    const loadSeq = projectLoadSeqRef.current + 1
    projectLoadSeqRef.current = loadSeq

    const canvasStore = useCanvasStore.getState()
    canvasStore.setProjectId(projectId)
    canvasStore.setZoom(1)
    canvasStore.setStagePos({ x: 0, y: 0 })
    setProjectReady(false)

    const clearNewProjectQuery = () => {
      if (!isNewBlankProject || typeof window === "undefined") return
      const url = new URL(window.location.href)
      url.searchParams.delete("new")
      url.searchParams.delete("title")
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
    }

    const applyProject = async () => {
      try {
        const data = await loadCanvasProject(projectId)
        if (projectLoadSeqRef.current !== loadSeq) return
        if (data.canvasType && data.canvasType !== "workflow") {
          message.error("这个项目不是工作流画布")
          router.replace(buildCanvasProjectUrl(projectId))
          return
        }

        const nextCanvasStore = useCanvasStore.getState()
        if (data.title) {
          nextCanvasStore.setProjectName(data.title)
        } else if (newProjectTitle) {
          nextCanvasStore.setProjectName(newProjectTitle)
        }
        nextCanvasStore.setProjectThumbnail(typeof data.thumbnail === "string" && data.thumbnail.trim().length > 0 ? data.thumbnail : null)

        if (data.content) {
          try {
            const parsed = JSON.parse(data.content)
            const projectContent = normalizeCanvasProjectContent(parsed)
            nextCanvasStore.initialize([])
            nextCanvasStore.setProjectMaterials(projectContent.projectMaterials || [])
            nextCanvasStore.setLibTvWorkflow(projectContent.libtvWorkflow)
            setProjectCanvases(projectContent.libtvCanvases)
            setActiveProjectCanvasId(projectContent.activeLibTvCanvasId)
          } catch (error) {
            console.error("Failed to parse workflow project content:", error)
            resetEmptyWorkflowProject()
            const emptyContent = normalizeCanvasProjectContent(null)
            setProjectCanvases(emptyContent.libtvCanvases)
            setActiveProjectCanvasId(emptyContent.activeLibTvCanvasId)
          }
        } else {
          resetEmptyWorkflowProject()
          const emptyContent = normalizeCanvasProjectContent(null)
          setProjectCanvases(emptyContent.libtvCanvases)
          setActiveProjectCanvasId(emptyContent.activeLibTvCanvasId)
        }

        setProjectReady(true)
        clearNewProjectQuery()
      } catch (error) {
        if (projectLoadSeqRef.current !== loadSeq) return
        const status = Number((error as { status?: number })?.status || 0)
        if (status === 401) {
          message.error("请先登录后再打开项目")
          router.replace("/projects")
          return
        }
        if (status === 403) {
          message.error("没有权限访问该项目")
          router.replace("/projects")
          return
        }
        if (status === 404) {
          message.error("项目不存在或已被删除")
          router.replace("/projects")
          return
        }
        console.error("Failed to fetch workflow project:", error)
        message.error("加载工作流失败")
        router.replace("/projects")
      }
    }

    void applyProject()
  }, [isNewBlankProject, newProjectTitle, projectId, router])

  return (
    <Suspense fallback={<CanvasLoadingScreen />}>
      {!projectReady ? (
        <CanvasLoadingScreen />
      ) : (
        <main className="flex h-screen w-screen overflow-hidden bg-black">
          <LibTvWorkflowCanvas
            imageUrl={null}
            initialCanvases={projectCanvases}
            initialActiveCanvasId={activeProjectCanvasId}
          />
        </main>
      )}
    </Suspense>
  )
}
