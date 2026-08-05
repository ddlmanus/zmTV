type CanvasProjectUrlOptions = {
  mode?: "canvas" | "workflow"
  newProject?: boolean
  title?: string
}

export function buildCanvasProjectUrl(projectId: string, options: CanvasProjectUrlOptions = {}) {
  const normalizedProjectId = String(projectId || "").trim()
  const params = new URLSearchParams()

  if (normalizedProjectId) {
    params.set("projectId", normalizedProjectId)
  }
  if (options.mode === "workflow") {
    params.set("mode", "workflow")
  }
  if (options.newProject) {
    params.set("new", "1")
  }
  if (options.title) {
    params.set("title", options.title)
  }

  const query = params.toString()
  return query ? `/canvas?${query}` : "/canvas"
}
