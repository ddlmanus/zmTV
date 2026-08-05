export const LAYER_PANEL_WIDTH = 268
// Right sidebar width is user-resizable. Keep a default for SSR/initial layout only.
export const DEFAULT_RIGHT_SIDEBAR_WIDTH = 400
export const MIN_RIGHT_SIDEBAR_WIDTH = 320
export const MAX_RIGHT_SIDEBAR_WIDTH = 400
export const RIGHT_SIDEBAR_GAP = 12
export const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = 'ideart.rightSidebarWidth'
export const RIGHT_SIDEBAR_WIDTH_CSS_VAR = '--ideart-right-sidebar-width'
// 10% is often not enough to "show all content" on very large/infinite canvases.
export const MIN_CANVAS_ZOOM = 0.02
export const MAX_CANVAS_ZOOM = 2
export const DEFAULT_CANVAS_OPEN_ZOOM = 1
export const CANVAS_ZOOM_STEPS = [0.02, 0.05, 0.1, 0.2, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2] as const

// Deprecated: kept for older callers that still want a constant-ish offset.
export const TOPBAR_RIGHT_OFFSET_WHEN_SIDEBAR_OPEN = DEFAULT_RIGHT_SIDEBAR_WIDTH + RIGHT_SIDEBAR_GAP
