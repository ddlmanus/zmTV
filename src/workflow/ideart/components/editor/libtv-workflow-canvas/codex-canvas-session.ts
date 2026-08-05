type CanvasSessionStorage = Pick<Storage, "getItem" | "setItem">

const SESSION_PREFIX = "zaomeng:workflow-codex-canvas-session:"

function createCanvasSessionId() {
    const uuid = typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `workflow_canvas_${uuid}`
}

export function getOrCreateCodexCanvasSessionId(
    workflowProjectId: string,
    storage?: CanvasSessionStorage | null,
) {
    const projectId = String(workflowProjectId || "").trim() || "unscoped"
    const sessionStorage = storage === undefined
        ? (typeof window === "undefined" ? null : window.sessionStorage)
        : storage
    const key = `${SESSION_PREFIX}${encodeURIComponent(projectId)}`
    if (sessionStorage) {
        try {
            const existing = String(sessionStorage.getItem(key) || "").trim()
            if (/^workflow_canvas_[a-z0-9-]+$/i.test(existing)) return existing
        } catch {}
    }
    const created = createCanvasSessionId()
    if (sessionStorage) {
        try {
            sessionStorage.setItem(key, created)
        } catch {}
    }
    return created
}
