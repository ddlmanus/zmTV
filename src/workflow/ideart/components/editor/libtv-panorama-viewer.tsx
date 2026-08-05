"use client"

import React from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { toImageProxyUrl } from "@/workflow/ideart/lib/url/image-proxy-policy"

const DEFAULT_CAMERA_FOV = 75
const DEFAULT_YAW = 0
const DEFAULT_PITCH = 0
const DEFAULT_GUIDE_COLOR = "rgba(255,255,255,0.82)"

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180
}

function radiansToDegrees(value: number) {
  return (value * 180) / Math.PI
}

function normalizeDegrees(value: number) {
  let next = value % 360
  if (next < 0) next += 360
  return next
}

function getDirectionVector(yawDeg: number, pitchDeg: number) {
  const phi = degreesToRadians(90 - pitchDeg)
  const theta = degreesToRadians(yawDeg)
  return new THREE.Vector3(
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.cos(theta)
  )
}

export function updateCameraFromAngles(
  camera: THREE.PerspectiveCamera,
  yawDeg: number,
  pitchDeg: number,
  controls?: OrbitControls | null
) {
  const direction = getDirectionVector(yawDeg, pitchDeg)
  const target = camera.position.clone().add(direction)
  if (controls) {
    controls.target.copy(target)
  }
  camera.lookAt(target)
  camera.updateMatrixWorld()
}

export function readCameraAngles(camera: THREE.PerspectiveCamera) {
  const direction = new THREE.Vector3()
  camera.getWorldDirection(direction)
  const yaw = normalizeDegrees(radiansToDegrees(Math.atan2(direction.x, direction.z)))
  const pitch = clamp(radiansToDegrees(Math.asin(clamp(direction.y, -1, 1))), -85, 85)
  return { yaw, pitch }
}

type CaptureShot = {
  suffix: string
  yawDeg: number
  pitchDeg?: number
}

type CaptureResult = CaptureShot & {
  dataUrl: string
}

type Props = {
  imageUrl: string
  initialYaw?: number
  initialPitch?: number
  showGuides?: boolean
  className?: string
  hostClassName?: string
  overlayClassName?: string
  hint?: React.ReactNode
  topLeft?: React.ReactNode
  topRight?: React.ReactNode
  bottomLeft?: React.ReactNode
  bottomRight?: React.ReactNode
  loadingLabel?: React.ReactNode
  onViewChange?: (angles: { yaw: number; pitch: number }) => void
  onReadyChange?: (ready: boolean) => void
  onErrorChange?: (error: string) => void
  onCaptureApiReady?: ((api: {
    reset: () => void
    capture: (shots: CaptureShot[]) => CaptureResult[]
    getViewAngles: () => { yaw: number; pitch: number }
  } | null) => void)
}

export function LibTvPanoramaViewer({
  imageUrl,
  initialYaw = DEFAULT_YAW,
  initialPitch = DEFAULT_PITCH,
  showGuides = false,
  className = "",
  hostClassName = "",
  overlayClassName = "",
  hint = null,
  topLeft = null,
  topRight = null,
  bottomLeft = null,
  bottomRight = null,
  loadingLabel = "正在加载可环视全景...",
  onViewChange,
  onReadyChange,
  onErrorChange,
  onCaptureApiReady,
}: Props) {
  const canvasHostRef = React.useRef<HTMLDivElement | null>(null)
  const guideCanvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const sceneStateRef = React.useRef<{
    scene: THREE.Scene
    renderer: THREE.WebGLRenderer
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    texture: THREE.Texture | null
    resizeObserver: ResizeObserver | null
  } | null>(null)
  const viewFrameRef = React.useRef<number | null>(null)

  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")
  const onViewChangeRef = React.useRef(onViewChange)
  const onReadyChangeRef = React.useRef(onReadyChange)
  const onErrorChangeRef = React.useRef(onErrorChange)
  const onCaptureApiReadyRef = React.useRef(onCaptureApiReady)

  const normalizedImageUrl = React.useMemo(() => {
    const raw = String(imageUrl || "").trim()
    const proxied = toImageProxyUrl(raw)
    if (!proxied) return ""
    if (proxied.startsWith("/api/image-proxy?") || proxied.startsWith("data:") || proxied.startsWith("blob:")) {
      return proxied
    }
    if (!/^https?:\/\//i.test(proxied)) return proxied

    if (typeof window === "undefined") {
      return `/api/image-proxy?url=${encodeURIComponent(proxied)}`
    }

    try {
      const parsed = new URL(proxied, window.location.origin)
      if (parsed.origin === window.location.origin) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`
      }
    } catch {
      return proxied
    }

    return `/api/image-proxy?url=${encodeURIComponent(proxied)}`
  }, [imageUrl])

  React.useEffect(() => {
    onViewChangeRef.current = onViewChange
  }, [onViewChange])

  React.useEffect(() => {
    onReadyChangeRef.current = onReadyChange
  }, [onReadyChange])

  React.useEffect(() => {
    onErrorChangeRef.current = onErrorChange
  }, [onErrorChange])

  React.useEffect(() => {
    onCaptureApiReadyRef.current = onCaptureApiReady
  }, [onCaptureApiReady])

  const drawGuides = React.useCallback(() => {
    const canvas = guideCanvasRef.current
    const host = canvasHostRef.current
    if (!canvas || !host) return
    const rect = host.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(rect.width * dpr))
    canvas.height = Math.max(1, Math.round(rect.height * dpr))
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)
    if (!showGuides) return

    ctx.strokeStyle = DEFAULT_GUIDE_COLOR
    ctx.lineWidth = 1
    ctx.setLineDash([6, 6])
    ctx.globalAlpha = 0.7

    ctx.beginPath()
    ctx.moveTo(rect.width / 3, 0)
    ctx.lineTo(rect.width / 3, rect.height)
    ctx.moveTo((rect.width * 2) / 3, 0)
    ctx.lineTo((rect.width * 2) / 3, rect.height)
    ctx.moveTo(0, rect.height / 3)
    ctx.lineTo(rect.width, rect.height / 3)
    ctx.moveTo(0, (rect.height * 2) / 3)
    ctx.lineTo(rect.width, (rect.height * 2) / 3)
    ctx.stroke()

    ctx.setLineDash([])
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(rect.width / 2, 0)
    ctx.lineTo(rect.width / 2, rect.height)
    ctx.moveTo(0, rect.height / 2)
    ctx.lineTo(rect.width, rect.height / 2)
    ctx.stroke()
  }, [showGuides])

  React.useEffect(() => {
    drawGuides()
  }, [drawGuides])

  React.useEffect(() => {
    if (!canvasHostRef.current || !normalizedImageUrl) {
      setLoading(false)
      setError(normalizedImageUrl ? "" : "可环视全景贴图地址为空")
      onReadyChangeRef.current?.(false)
      onErrorChangeRef.current?.(normalizedImageUrl ? "" : "可环视全景贴图地址为空")
      onCaptureApiReadyRef.current?.(null)
      return
    }

    const host = canvasHostRef.current
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, 1, 0.1, 1000)
    camera.position.set(0, 0, 0.1)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.dataset.engine = "three.js r159"
    renderer.domElement.style.display = "block"
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.touchAction = "none"
    host.innerHTML = ""
    host.appendChild(renderer.domElement)

    scene.background = new THREE.Color("#000000")

    const renderScene = () => {
      renderer.render(scene, camera)
    }

    const scheduleViewChange = () => {
      if (viewFrameRef.current !== null) return
      viewFrameRef.current = window.requestAnimationFrame(() => {
        viewFrameRef.current = null
        onViewChangeRef.current?.(readCameraAngles(camera))
      })
    }

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableZoom = true
    controls.rotateSpeed = -0.3
    controls.zoomSpeed = 0.8
    controls.minDistance = 0.1
    controls.maxDistance = 0.1
    controls.enableDamping = false
    controls.target.set(0, 0, 0)
    updateCameraFromAngles(camera, Number(initialYaw || 0), Number(initialPitch || 0), controls)
    controls.update()

    const updateSize = () => {
      const rect = host.getBoundingClientRect()
      const width = Math.max(1, rect.width)
      const height = Math.max(1, rect.height)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      drawGuides()
      renderScene()
    }

    const resizeObserver = new ResizeObserver(() => updateSize())
    resizeObserver.observe(host)
    updateSize()

    const handleChange = () => {
      renderScene()
      scheduleViewChange()
    }
    controls.addEventListener("change", handleChange)
    handleChange()

    const setReadyState = (nextReady: boolean, nextError = "") => {
      setLoading(!nextReady && !nextError)
      setError(nextError)
      onReadyChangeRef.current?.(nextReady)
      onErrorChangeRef.current?.(nextError)
    }

    setReadyState(false, "")

    const capture = (shots: CaptureShot[]) => {
      const originalAngles = readCameraAngles(camera)
      const images = shots.map((shot) => {
        updateCameraFromAngles(camera, shot.yawDeg, shot.pitchDeg ?? 0, controls)
        controls.update()
        renderScene()
        return {
          ...shot,
          dataUrl: renderer.domElement.toDataURL("image/png"),
        }
      })
      updateCameraFromAngles(camera, originalAngles.yaw, originalAngles.pitch, controls)
      controls.update()
      renderScene()
      onViewChangeRef.current?.(readCameraAngles(camera))
      return images
    }

    onCaptureApiReadyRef.current?.({
      reset: () => {
        updateCameraFromAngles(camera, Number(initialYaw || 0), Number(initialPitch || 0), controls)
        controls.update()
        renderScene()
        onViewChangeRef.current?.(readCameraAngles(camera))
      },
      capture,
      getViewAngles: () => readCameraAngles(camera),
    })

    let cancelled = false
    const textureLoader = new THREE.TextureLoader()
    let objectUrl = ""

    const loadPanoramaTexture = async () => {
      try {
        const response = await fetch(normalizedImageUrl, {
          cache: "no-store",
          credentials: "include",
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const blob = await response.blob()
        if (!blob.size) {
          throw new Error("empty_blob")
        }
        objectUrl = URL.createObjectURL(blob)

        textureLoader.load(
          objectUrl,
          (texture) => {
            if (cancelled) {
              texture.dispose()
              return
            }
            texture.colorSpace = THREE.SRGBColorSpace
            texture.mapping = THREE.EquirectangularReflectionMapping
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            scene.background = texture
            sceneStateRef.current = {
              scene,
              renderer,
              camera,
              controls,
              texture,
              resizeObserver,
            }
            setReadyState(true, "")
            renderScene()
            scheduleViewChange()
          },
          undefined,
          () => {
            if (cancelled) return
            setReadyState(false, "可环视全景贴图加载失败。图片资源可能无法访问，或当前文件还不是可环视的标准 2:1 全景贴图。")
          }
        )
      } catch {
        if (cancelled) return
        setReadyState(false, "可环视全景贴图加载失败。图片资源可能被跨域策略拦截、地址失效，或当前文件还不是可环视的标准 2:1 全景贴图。")
      }
    }

    void loadPanoramaTexture()

    return () => {
      cancelled = true
      onCaptureApiReadyRef.current?.(null)
      controls.removeEventListener("change", handleChange)
      resizeObserver.disconnect()
      if (viewFrameRef.current !== null) {
        window.cancelAnimationFrame(viewFrameRef.current)
        viewFrameRef.current = null
      }
      if (sceneStateRef.current?.texture) {
        sceneStateRef.current.texture.dispose()
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
      scene.background = null
      renderer.dispose()
      sceneStateRef.current = null
      host.innerHTML = ""
    }
  }, [drawGuides, normalizedImageUrl])

  return (
    <div className={`relative min-h-0 min-w-0 overflow-hidden ${className}`}>
      {topLeft ? <div className={`absolute left-0 top-0 z-20 ${overlayClassName}`}>{topLeft}</div> : null}
      {topRight ? <div className={`absolute right-0 top-0 z-20 ${overlayClassName}`}>{topRight}</div> : null}
      {bottomLeft ? <div className={`absolute bottom-0 left-0 z-20 ${overlayClassName}`}>{bottomLeft}</div> : null}
      {bottomRight ? <div className={`absolute bottom-0 right-0 z-20 ${overlayClassName}`}>{bottomRight}</div> : null}
      {hint ? <div className={`absolute left-0 top-0 z-10 ${overlayClassName}`}>{hint}</div> : null}
      <div ref={canvasHostRef} className={`absolute inset-0 ${hostClassName}`} />
      <canvas ref={guideCanvasRef} className="pointer-events-none absolute inset-0" />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/60">
          {loadingLabel}
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-[520px] rounded-[22px] border border-[#7F1D1D] bg-[#1F1115]/90 px-5 py-4 text-sm leading-6 text-[#FCA5A5]">
            {error}
          </div>
        </div>
      ) : null}
    </div>
  )
}
