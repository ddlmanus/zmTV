"use client"

import React, { useCallback, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

export type WorkflowAnchoredPopoverSide = "top" | "bottom"
export type WorkflowAnchoredPopoverAlign = "start" | "center" | "end"

type WorkflowAnchoredPopoverLayout = {
  left: number
  top: number
  maxHeight: number
  maxWidth: number
  light: boolean
  ready: boolean
}

function clampWorkflowPopoverValue(value: number, min: number, max: number) {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

function sameWorkflowPopoverLayout(
  current: WorkflowAnchoredPopoverLayout,
  next: WorkflowAnchoredPopoverLayout,
) {
  return current.left === next.left
    && current.top === next.top
    && current.maxHeight === next.maxHeight
    && current.maxWidth === next.maxWidth
    && current.light === next.light
    && current.ready === next.ready
}

export function WorkflowAnchoredPopover({
  anchorRef,
  popoverRef,
  children,
  className = "",
  style,
  side = "top",
  align = "start",
  gap = 4,
  margin = 12,
  heightLimit,
  overflowY = "auto",
  role = "dialog",
  id,
  ariaLabel,
  testId,
}: {
  anchorRef: React.RefObject<HTMLElement | null>
  popoverRef?: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  side?: WorkflowAnchoredPopoverSide
  align?: WorkflowAnchoredPopoverAlign
  gap?: number
  margin?: number
  heightLimit?: number
  overflowY?: React.CSSProperties["overflowY"]
  role?: React.AriaRole
  id?: string
  ariaLabel?: string
  testId?: string
}) {
  const internalRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const [layout, setLayout] = useState<WorkflowAnchoredPopoverLayout>({
    left: 0,
    top: 0,
    maxHeight: 400,
    maxWidth: 400,
    light: false,
    ready: false,
  })

  const setPopoverElement = useCallback((element: HTMLDivElement | null) => {
    internalRef.current = element
    if (popoverRef) {
      ;(popoverRef as React.MutableRefObject<HTMLDivElement | null>).current = element
    }
  }, [popoverRef])

  const updatePosition = useCallback(() => {
    if (typeof window === "undefined") return
    const anchor = anchorRef.current
    const popover = internalRef.current
    if (!anchor || !popover) return

    const visualViewport = window.visualViewport
    const viewportLeft = Number(visualViewport?.offsetLeft || 0)
    const viewportTop = Number(visualViewport?.offsetTop || 0)
    const viewportWidth = Math.max(1, Number(visualViewport?.width || window.innerWidth || 1))
    const viewportHeight = Math.max(1, Number(visualViewport?.height || window.innerHeight || 1))
    const viewportRight = viewportLeft + viewportWidth
    const viewportBottom = viewportTop + viewportHeight
    const safeMargin = Math.max(0, Number(margin || 0))
    const safeGap = Math.max(0, Number(gap || 0))
    const anchorRect = anchor.getBoundingClientRect()
    const popoverRect = popover.getBoundingClientRect()
    const naturalWidth = Math.max(1, Math.ceil(popover.scrollWidth || popover.offsetWidth || popoverRect.width || 1))
    const naturalHeight = Math.max(1, Math.ceil(popover.scrollHeight || popover.offsetHeight || popoverRect.height || 1))
    const maxWidth = Math.max(1, Math.floor(viewportWidth - safeMargin * 2))
    const renderedWidth = Math.min(naturalWidth, maxWidth)
    const spaceAbove = Math.max(0, anchorRect.top - viewportTop - safeMargin - safeGap)
    const spaceBelow = Math.max(0, viewportBottom - anchorRect.bottom - safeMargin - safeGap)
    const resolvedSide = side === "top"
      ? (naturalHeight <= spaceAbove || spaceAbove >= spaceBelow ? "top" : "bottom")
      : (naturalHeight <= spaceBelow || spaceBelow >= spaceAbove ? "bottom" : "top")
    const availableHeight = resolvedSide === "top" ? spaceAbove : spaceBelow
    const maxHeight = Math.max(1, Math.min(
      Math.floor(availableHeight),
      Number.isFinite(heightLimit) ? Math.max(1, Number(heightLimit)) : Number.POSITIVE_INFINITY,
    ))
    const renderedHeight = Math.min(naturalHeight, maxHeight)

    let left = anchorRect.left
    if (align === "center") left = anchorRect.left + (anchorRect.width - renderedWidth) / 2
    if (align === "end") left = anchorRect.right - renderedWidth
    left = clampWorkflowPopoverValue(
      left,
      viewportLeft + safeMargin,
      viewportRight - safeMargin - renderedWidth,
    )

    const preferredTop = resolvedSide === "top"
      ? anchorRect.top - safeGap - renderedHeight
      : anchorRect.bottom + safeGap
    const top = clampWorkflowPopoverValue(
      preferredTop,
      viewportTop + safeMargin,
      viewportBottom - safeMargin - renderedHeight,
    )

    const nextLayout: WorkflowAnchoredPopoverLayout = {
      left: Math.round(left * 2) / 2,
      top: Math.round(top * 2) / 2,
      maxHeight,
      maxWidth,
      light: Boolean(anchor.closest(".canvas-light")),
      ready: true,
    }
    setLayout((current) => sameWorkflowPopoverLayout(current, nextLayout) ? current : nextLayout)
  }, [align, anchorRef, gap, heightLimit, margin, side])

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const popover = internalRef.current
    if (!anchor || !popover || typeof window === "undefined") return
    setLayout((current) => current.ready ? { ...current, ready: false } : current)

    const scheduleUpdate = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        updatePosition()
      })
    }
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleUpdate) : null
    resizeObserver?.observe(anchor)
    resizeObserver?.observe(popover)
    window.addEventListener("resize", scheduleUpdate)
    window.addEventListener("scroll", scheduleUpdate, true)
    window.visualViewport?.addEventListener("resize", scheduleUpdate)
    window.visualViewport?.addEventListener("scroll", scheduleUpdate)
    scheduleUpdate()

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener("resize", scheduleUpdate)
      window.removeEventListener("scroll", scheduleUpdate, true)
      window.visualViewport?.removeEventListener("resize", scheduleUpdate)
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate)
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [anchorRef, updatePosition])

  if (typeof document === "undefined") return null

  return createPortal(
    <div className={layout.light ? "canvas-light contents" : "contents"}>
      <div
        ref={setPopoverElement}
        id={id}
        role={role}
        aria-label={ariaLabel}
        data-testid={testId}
        data-workflow-anchored-popover="true"
        className={"canvas-theme-portal nodrag nopan nowheel fixed z-[300] overscroll-contain " + className}
        style={{
          ...style,
          left: layout.left,
          top: layout.top,
          maxHeight: layout.maxHeight,
          maxWidth: layout.maxWidth,
          visibility: layout.ready ? "visible" : "hidden",
          overflowY,
          touchAction: "manipulation",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
