import {
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  RIGHT_SIDEBAR_GAP,
  RIGHT_SIDEBAR_WIDTH_CSS_VAR,
  RIGHT_SIDEBAR_WIDTH_STORAGE_KEY,
} from "@/workflow/ideart/lib/constants/editor-layout"

type Size = { width: number; height: number }

export function getClientRightSidebarWidthFallback(): number {
  if (typeof window === "undefined") return DEFAULT_RIGHT_SIDEBAR_WIDTH

  // Prefer CSS var so any part of the app can "broadcast" the live width.
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(RIGHT_SIDEBAR_WIDTH_CSS_VAR)
      .trim()
    if (raw) {
      const num = Number(raw.replace(/px$/i, ""))
      if (Number.isFinite(num) && num >= 0) return Math.max(0, Math.round(num))
    }
  } catch {
    // ignore
  }

  // Fall back to storage if the var isn't set yet.
  try {
    const raw = window.localStorage.getItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY)
    if (raw) {
      const num = Number(raw)
      if (Number.isFinite(num) && num > 0) return Math.round(num)
    }
  } catch {
    // ignore
  }

  return DEFAULT_RIGHT_SIDEBAR_WIDTH
}

export function fitCanvasMediaDisplaySize(
  natural: Size,
  options?: {
    maxViewportWidthRatio?: number
    maxViewportHeightRatio?: number
    minSize?: number
  }
): Size {
  const minSize = options?.minSize ?? 120
  const maxViewportWidthRatio = options?.maxViewportWidthRatio ?? 0.44
  const maxViewportHeightRatio = options?.maxViewportHeightRatio ?? 0.5

  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900

  const sidebarWidth = getClientRightSidebarWidthFallback()
  const canvasWidth = Math.max(
    320,
    viewportWidth - sidebarWidth - RIGHT_SIDEBAR_GAP
  )
  const maxWidth = Math.max(minSize, canvasWidth * maxViewportWidthRatio)
  const maxHeight = Math.max(minSize, viewportHeight * maxViewportHeightRatio)

  const baseWidth = Math.max(1, natural.width)
  const baseHeight = Math.max(1, natural.height)
  const ratio = Math.min(maxWidth / baseWidth, maxHeight / baseHeight, 1)

  return {
    width: Math.max(minSize, Math.round(baseWidth * ratio)),
    height: Math.max(minSize, Math.round(baseHeight * ratio)),
  }
}
