"use client"

import React from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

export type WorldLabsMarbleViewerHandle = {
  resetCamera: () => void
  rotateYaw: (degrees: number) => void
  zoomBy: (delta: number) => void
  captureFrame: () => WorldLabsMarbleCapture | null
  getCameraState: () => WorldLabsMarbleCameraState | null
  setCameraState: (state: WorldLabsMarbleCameraState) => void
}

export type WorldLabsMarbleViewState = {
  yaw: number
  zoom: number
}

export type WorldLabsMarbleCameraState = {
  position: [number, number, number]
  yaw: number
  pitch: number
  fov: number
}

export type WorldLabsMarbleCapture = {
  dataUrl: string
  width: number
  height: number
  cameraState: WorldLabsMarbleCameraState
}

type WorldLabsMarbleViewerProps = {
  splatUrl?: string
  spzUrls?: Record<string, string> | null
  colliderMeshUrl?: string
  marbleUrl?: string
  previewImageUrl?: string
  className?: string
  onViewChange?: (state: WorldLabsMarbleViewState) => void
}

type SceneRuntime = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  sparkRenderer?: THREE.Object3D & { dispose: () => void }
  mainObject?: THREE.Object3D & { dispose?: () => void; getBoundingBox?: (centersOnly?: boolean) => THREE.Box3 }
  worldMode: "splat" | "mesh"
  yaw: number
  pitch: number
  baseDistance: number
}

type RenderAssetKind = "mesh" | "splat"

const DEFAULT_FOV = 53.13
const MIN_FOV = 24
const MAX_FOV = 82

function cleanUrl(value?: string | null) {
  return String(value || "").trim()
}

function chooseWorldSplatUrls(splatUrl?: string, spzUrls?: Record<string, string> | null) {
  const direct = cleanUrl(splatUrl)
  if (!spzUrls || typeof spzUrls !== "object") return { previewUrl: direct, fullResUrl: "" }
  const fullResUrl = cleanUrl(spzUrls.full_res) || cleanUrl(spzUrls.fullRes)
  const previewUrl =
    cleanUrl(spzUrls["100k"]) ||
    direct ||
    cleanUrl(spzUrls["500k"]) ||
    cleanUrl(spzUrls.medium) ||
    fullResUrl ||
    Object.values(spzUrls).map(cleanUrl).find(Boolean) ||
    ""
  return { previewUrl, fullResUrl: fullResUrl && fullResUrl !== previewUrl ? fullResUrl : "" }
}

function hasLoadableMeshUrl(url: string) {
  const pathname = url.split("?")[0]?.toLowerCase() || ""
  return pathname.endsWith(".glb") || pathname.endsWith(".gltf")
}

function getRenderAssetOrder(meshUrl: string, splatUrl: string): RenderAssetKind[] {
  const order: RenderAssetKind[] = []
  if (splatUrl) order.push("splat")
  if (hasLoadableMeshUrl(meshUrl)) order.push("mesh")
  return order
}

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"))
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    const geometry = mesh.geometry as THREE.BufferGeometry | undefined
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    geometry?.dispose()
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose())
    } else {
      material?.dispose()
    }
  })
}

function applyCameraPose(runtime: SceneRuntime) {
  const euler = new THREE.Euler(runtime.pitch, runtime.yaw, 0, "YXZ")
  runtime.camera.quaternion.setFromEuler(euler)
}

function readViewState(runtime: SceneRuntime): WorldLabsMarbleViewState {
  return {
    yaw: THREE.MathUtils.radToDeg(runtime.yaw),
    zoom: Number(((DEFAULT_FOV / runtime.camera.fov) * 2).toFixed(1)),
  }
}

function readCameraState(runtime: SceneRuntime): WorldLabsMarbleCameraState {
  return {
    position: [runtime.camera.position.x, runtime.camera.position.y, runtime.camera.position.z],
    yaw: runtime.yaw,
    pitch: runtime.pitch,
    fov: runtime.camera.fov,
  }
}

function applyCameraState(runtime: SceneRuntime, state: WorldLabsMarbleCameraState) {
  const [x, y, z] = state.position
  runtime.camera.position.set(
    Number.isFinite(x) ? x : 0,
    Number.isFinite(y) ? y : 0,
    Number.isFinite(z) ? z : 0,
  )
  runtime.yaw = Number.isFinite(state.yaw) ? state.yaw : 0
  runtime.pitch = Number.isFinite(state.pitch) ? THREE.MathUtils.clamp(state.pitch, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04) : 0
  runtime.camera.fov = THREE.MathUtils.clamp(Number.isFinite(state.fov) ? state.fov : DEFAULT_FOV, MIN_FOV, MAX_FOV)
  runtime.camera.updateProjectionMatrix()
  applyCameraPose(runtime)
}

function resetRuntimeCamera(runtime: SceneRuntime) {
  if (runtime.worldMode === "splat") {
    runtime.camera.position.set(0, 0, 0)
    runtime.yaw = 0
    runtime.pitch = 0
    runtime.camera.fov = DEFAULT_FOV
    runtime.camera.updateProjectionMatrix()
    applyCameraPose(runtime)
    return
  }

  const distance = Math.max(1.8, runtime.baseDistance || 2.8)
  runtime.camera.position.set(0, Math.min(0.45, distance * 0.12), distance)
  runtime.yaw = 0
  runtime.pitch = -Math.atan2(runtime.camera.position.y, distance)
  runtime.camera.fov = DEFAULT_FOV
  runtime.camera.updateProjectionMatrix()
  applyCameraPose(runtime)
}

function fitRuntimeToObject(runtime: SceneRuntime, object: THREE.Object3D, customBounds?: THREE.Box3) {
  const bounds = customBounds || new THREE.Box3().setFromObject(object)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  if (!Number.isFinite(size.x) || !Number.isFinite(center.x)) {
    runtime.baseDistance = 2.8
    resetRuntimeCamera(runtime)
    return
  }

  object.position.sub(center)
  const maxSize = Math.max(size.x, size.y, size.z)
  const scale = maxSize > 0 ? 2.4 / maxSize : 1
  object.scale.multiplyScalar(scale)
  runtime.baseDistance = Math.max(2.0, 2.7 / Math.tan(THREE.MathUtils.degToRad(DEFAULT_FOV) / 2))
  resetRuntimeCamera(runtime)
}

export const WorldLabsMarbleViewer = React.forwardRef<WorldLabsMarbleViewerHandle, WorldLabsMarbleViewerProps>(function WorldLabsMarbleViewer(
  { splatUrl, spzUrls, colliderMeshUrl, marbleUrl, previewImageUrl, className = "", onViewChange },
  ref
) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const runtimeRef = React.useRef<SceneRuntime | null>(null)
  const keysRef = React.useRef<Set<string>>(new Set())
  const pointerRef = React.useRef<{ active: boolean; lastX: number; lastY: number }>({ active: false, lastX: 0, lastY: 0 })
  const onViewChangeRef = React.useRef(onViewChange)
  const [mode, setMode] = React.useState<"canvas" | "iframe" | "empty">("canvas")
  const [loading, setLoading] = React.useState(true)
  const [progress, setProgress] = React.useState(0)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    onViewChangeRef.current = onViewChange
  }, [onViewChange])

  const resolvedSplatUrls = React.useMemo(() => chooseWorldSplatUrls(splatUrl, spzUrls), [splatUrl, spzUrls])
  const resolvedSplatUrl = resolvedSplatUrls.previewUrl
  const resolvedFullResSplatUrl = resolvedSplatUrls.fullResUrl
  const resolvedMeshUrl = cleanUrl(colliderMeshUrl)
  const resolvedMarbleUrl = cleanUrl(marbleUrl)

  React.useImperativeHandle(ref, () => ({
    resetCamera: () => {
      const runtime = runtimeRef.current
      if (!runtime) return
      resetRuntimeCamera(runtime)
      onViewChangeRef.current?.(readViewState(runtime))
    },
    rotateYaw: (degrees: number) => {
      const runtime = runtimeRef.current
      if (!runtime) return
      runtime.yaw += THREE.MathUtils.degToRad(degrees)
      applyCameraPose(runtime)
      onViewChangeRef.current?.(readViewState(runtime))
    },
    zoomBy: (delta: number) => {
      const runtime = runtimeRef.current
      if (!runtime) return
      runtime.camera.fov = THREE.MathUtils.clamp(runtime.camera.fov - delta * 8, MIN_FOV, MAX_FOV)
      runtime.camera.updateProjectionMatrix()
      onViewChangeRef.current?.(readViewState(runtime))
    },
    captureFrame: () => {
      const runtime = runtimeRef.current
      if (!runtime) return null
      runtime.renderer.render(runtime.scene, runtime.camera)
      const canvas = runtime.renderer.domElement
      try {
        return {
          dataUrl: canvas.toDataURL("image/jpeg", 0.92),
          width: canvas.width,
          height: canvas.height,
          cameraState: readCameraState(runtime),
        }
      } catch {
        return null
      }
    },
    getCameraState: () => {
      const runtime = runtimeRef.current
      return runtime ? readCameraState(runtime) : null
    },
    setCameraState: (state: WorldLabsMarbleCameraState) => {
      const runtime = runtimeRef.current
      if (!runtime) return
      applyCameraState(runtime, state)
      runtime.renderer.render(runtime.scene, runtime.camera)
      onViewChangeRef.current?.(readViewState(runtime))
    },
  }), [])

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderAssetOrder = getRenderAssetOrder(resolvedMeshUrl, resolvedSplatUrl)
    if (renderAssetOrder.length === 0) {
      setLoading(false)
      setProgress(0)
      setError("")
      setMode(resolvedMarbleUrl ? "iframe" : "empty")
      return
    }

    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let animationFrame = 0
    let lastTime = performance.now()

    setMode("canvas")
    setLoading(true)
    setProgress(0)
    setError("")
    host.innerHTML = ""

    const scene = new THREE.Scene()
    scene.background = new THREE.Color("#030303")
    const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, 1, 0.03, 1000)
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x030303, 1)
    renderer.domElement.dataset.engine = "three.js r183"
    renderer.domElement.tabIndex = 0
    renderer.domElement.style.display = "block"
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.touchAction = "none"
    host.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1f2937, 1.2))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6)
    keyLight.position.set(2.5, 4, 3)
    scene.add(keyLight)

    const runtime: SceneRuntime = {
      scene,
      camera,
      renderer,
      worldMode: "splat",
      yaw: 0,
      pitch: 0,
      baseDistance: 2.8,
    }
    runtimeRef.current = runtime
    resetRuntimeCamera(runtime)

    const renderScene = () => {
      renderer.render(scene, camera)
    }

    const updateSize = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      renderScene()
    }

    resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(host)
    updateSize()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (["w", "a", "s", "d", "q", "e", "shift"].includes(key)) {
        keysRef.current.add(key)
        event.preventDefault()
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase())
    }
    const handlePointerDown = (event: PointerEvent) => {
      pointerRef.current = { active: true, lastX: event.clientX, lastY: event.clientY }
      renderer.domElement.setPointerCapture(event.pointerId)
      renderer.domElement.focus()
      event.preventDefault()
    }
    const handlePointerMove = (event: PointerEvent) => {
      const pointer = pointerRef.current
      if (!pointer.active) return
      const dx = event.clientX - pointer.lastX
      const dy = event.clientY - pointer.lastY
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      runtime.yaw -= dx * 0.0032
      runtime.pitch = THREE.MathUtils.clamp(runtime.pitch - dy * 0.0032, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04)
      applyCameraPose(runtime)
      onViewChangeRef.current?.(readViewState(runtime))
    }
    const handlePointerUp = (event: PointerEvent) => {
      pointerRef.current.active = false
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId)
    }
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      runtime.camera.fov = THREE.MathUtils.clamp(runtime.camera.fov + Math.sign(event.deltaY) * 3, MIN_FOV, MAX_FOV)
      runtime.camera.updateProjectionMatrix()
      onViewChangeRef.current?.(readViewState(runtime))
    }
    const handleContextMenu = (event: MouseEvent) => event.preventDefault()

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    renderer.domElement.addEventListener("pointerdown", handlePointerDown)
    renderer.domElement.addEventListener("pointermove", handlePointerMove)
    renderer.domElement.addEventListener("pointerup", handlePointerUp)
    renderer.domElement.addEventListener("pointercancel", handlePointerUp)
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false })
    renderer.domElement.addEventListener("contextmenu", handleContextMenu)

    const tick = (time: number) => {
      if (disposed) return
      const delta = Math.min(0.05, Math.max(0.001, (time - lastTime) / 1000))
      lastTime = time
      const keys = keysRef.current
      const speed = (keys.has("shift") ? 3.2 : 1.25) * delta
      const move = new THREE.Vector3()
      if (keys.has("w")) move.z -= 1
      if (keys.has("s")) move.z += 1
      if (keys.has("a")) move.x -= 1
      if (keys.has("d")) move.x += 1
      if (keys.has("e")) move.y += 1
      if (keys.has("q")) move.y -= 1
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
        const up = new THREE.Vector3(0, 1, 0)
        camera.position.addScaledVector(right, move.x)
        camera.position.addScaledVector(up, move.y)
        camera.position.addScaledVector(forward, -move.z)
      }
      renderScene()
      animationFrame = window.requestAnimationFrame(tick)
    }
    animationFrame = window.requestAnimationFrame(tick)

    const clearRuntimeObject = () => {
      if (runtime.mainObject) {
        scene.remove(runtime.mainObject)
        runtime.mainObject.dispose?.()
        if (!runtime.mainObject.dispose) disposeObject3D(runtime.mainObject)
        runtime.mainObject = undefined
      }
      if (runtime.sparkRenderer) scene.remove(runtime.sparkRenderer)
      runtime.sparkRenderer?.dispose()
      runtime.sparkRenderer = undefined
    }

    const finishLoadedObject = (object: THREE.Object3D, customBounds?: THREE.Box3) => {
      if (disposed) return
      fitRuntimeToObject(runtime, object, customBounds)
      setProgress(100)
      setLoading(false)
      onViewChangeRef.current?.(readViewState(runtime))
      renderScene()
    }

    const loadSplatObject = async (url: string, onProgress?: (event: ProgressEvent) => void) => {
      const { SplatMesh } = await import("@sparkjsdev/spark")
      if (disposed) return null
      const splat = new SplatMesh({
        url,
        lod: true,
        onProgress,
      }) as THREE.Object3D & { initialized?: Promise<any>; dispose?: () => void; getBoundingBox?: (centersOnly?: boolean) => THREE.Box3 }
      splat.scale.set(1, -1, -1)
      scene.add(splat)
      await splat.initialized
      if (disposed) {
        scene.remove(splat)
        splat.dispose?.()
        return null
      }
      return splat
    }

    const loadSplatScene = async () => {
      renderer.domElement.dataset.engine = "three.js r183 + Spark 3DGS"
      const { SparkRenderer } = await import("@sparkjsdev/spark")
      if (disposed) return
      runtime.worldMode = "splat"
      const sparkRenderer = new SparkRenderer({ renderer, onDirty: renderScene, enableLod: true }) as THREE.Object3D & { dispose: () => void }
      runtime.sparkRenderer = sparkRenderer
      scene.add(sparkRenderer)
      const splat = await loadSplatObject(resolvedSplatUrl, (event: ProgressEvent) => {
        const total = Number(event.total || 0)
        const loaded = Number(event.loaded || 0)
        if (total > 0) setProgress(Math.min(99, Math.round((loaded / total) * 100)))
      })
      if (!splat || disposed) return
      runtime.mainObject = splat
      resetRuntimeCamera(runtime)
      setProgress(100)
      setLoading(false)
      onViewChangeRef.current?.(readViewState(runtime))
      renderScene()

      if (resolvedFullResSplatUrl) {
        void loadSplatObject(resolvedFullResSplatUrl, (event: ProgressEvent) => {
          const total = Number(event.total || 0)
          const loaded = Number(event.loaded || 0)
          if (total > 0) setProgress(Math.min(99, Math.round((loaded / total) * 100)))
        }).then((fullResSplat) => {
          if (!fullResSplat || disposed || runtime.mainObject !== splat) return
          scene.remove(splat)
          splat.dispose?.()
          runtime.mainObject = fullResSplat
          renderScene()
        }).catch(() => {
          renderScene()
        })
      }
    }

    const loadMeshScene = async () => {
      renderer.domElement.dataset.engine = "three.js r183 + GLTF"
      runtime.worldMode = "mesh"
      const loader = new GLTFLoader()
      const gltf = await loader.loadAsync(resolvedMeshUrl, (event) => {
        const total = Number(event.total || 0)
        const loaded = Number(event.loaded || 0)
        if (total > 0) setProgress(Math.min(99, Math.round((loaded / total) * 100)))
      })
      if (disposed) return
      const model = gltf.scene
      scene.add(model)
      runtime.mainObject = model
      finishLoadedObject(model)
    }

    const loadScene = async () => {
      let lastLoadError: any = null
      for (const assetKind of renderAssetOrder) {
        try {
          clearRuntimeObject()
          setProgress(0)
          if (assetKind === "mesh") await loadMeshScene()
          else await loadSplatScene()
          return
        } catch (loadError: any) {
          if (disposed) return
          lastLoadError = loadError
          clearRuntimeObject()
        }
      }

      if (!disposed) {
        setLoading(false)
        setError(String(lastLoadError?.message || "3D 世界加载失败"))
        if (resolvedMarbleUrl) setMode("iframe")
      }
    }

    void loadScene()

    return () => {
      disposed = true
      window.cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown)
      renderer.domElement.removeEventListener("pointermove", handlePointerMove)
      renderer.domElement.removeEventListener("pointerup", handlePointerUp)
      renderer.domElement.removeEventListener("pointercancel", handlePointerUp)
      renderer.domElement.removeEventListener("wheel", handleWheel)
      renderer.domElement.removeEventListener("contextmenu", handleContextMenu)
      runtime.mainObject?.dispose?.()
      if (runtime.mainObject && !runtime.mainObject.dispose) disposeObject3D(runtime.mainObject)
      runtime.sparkRenderer?.dispose()
      renderer.dispose()
      host.innerHTML = ""
      if (runtimeRef.current === runtime) runtimeRef.current = null
    }
  }, [resolvedSplatUrl, resolvedFullResSplatUrl, resolvedMeshUrl, resolvedMarbleUrl])

  if (mode === "iframe" && resolvedMarbleUrl) {
    return (
      <div className={`relative h-full w-full overflow-hidden bg-black ${className}`}>
        <iframe
          title="World Labs Marble"
          src={resolvedMarbleUrl}
          className="h-full w-full border-0"
          allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
        />
        {error ? <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-amber-300/20 bg-amber-950/55 px-3 py-1.5 text-xs text-amber-100/80 backdrop-blur-xl">本地 SPZ 渲染失败，已切换到 Marble 真实场景页</div> : null}
      </div>
    )
  }

  if (mode === "empty") {
    return (
      <div className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[#050505] ${className}`}>
        {previewImageUrl ? <img src={previewImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 blur-sm" /> : null}
        <div className="relative rounded-[24px] border border-white/10 bg-[#262626]/60 px-6 py-5 text-center text-sm leading-6 text-white/70 backdrop-blur-[28px]">
          这个节点还没有可加载的 Marble 3D 资产。
        </div>
      </div>
    )
  }

  return (
    <div className={`relative h-full w-full overflow-hidden bg-black ${className}`}>
      <div ref={hostRef} className="absolute inset-0" />
      {previewImageUrl ? <img src={previewImageUrl} alt="" className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loading ? "opacity-35 blur-sm" : "opacity-0"}`} /> : null}
      <div className={`pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${loading || error ? "opacity-100" : "opacity-0"}`}>
        <div className="rounded-full border border-white/10 bg-[rgba(38,38,38,0.55)] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white/72 backdrop-blur-[18px]">
          {error || (progress > 0 ? `加载 3D ${progress}%` : "加载 3D...")}
        </div>
      </div>
    </div>
  )
})

WorldLabsMarbleViewer.displayName = "WorldLabsMarbleViewer"
