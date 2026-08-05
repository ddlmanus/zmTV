import type React from "react"

export function stopWorkflowNodeChromeEvent(event: React.SyntheticEvent) {
  event.stopPropagation()
}

export function preventWorkflowNodeChromeContextMenu(event: React.SyntheticEvent) {
  event.preventDefault()
  event.stopPropagation()
}

export function clampWorkflowNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
