import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import {
  CODEX_DEFAULT_PROJECT_ID,
  CODEX_DEFAULT_PROJECT_SLUG,
  CODEX_RUNTIME_ROOT,
  ensureCodexRuntimeDefaultProjectDir,
  ensureCodexRuntimeProjectDir,
} from "./runtime-storage"

export type CodexProject = {
  id: string
  userId: string
  name: string
  slug: string
  path: string
  workflowProjectId?: string
  source?: "managed" | "local" | "github"
  repoUrl?: string
  createdAt: string
  updatedAt: string
}

export type CodexProjectsStore = {
  projects: CodexProject[]
}

const PROJECTS_PATH = path.join(CODEX_RUNTIME_ROOT, "projects.json")

function now() {
  return new Date().toISOString()
}

function normalizedWorkflowProjectId(value: unknown) {
  return String(value || "").trim().slice(0, 191)
}

function normalizedProjectName(value: unknown, fallback: string) {
  return String(value || "").trim().slice(0, 80) || fallback
}

function workflowProjectDigest(userId: string, workflowProjectId: string) {
  return createHash("sha256")
    .update(`${userId}\0${workflowProjectId}`)
    .digest("hex")
    .slice(0, 32)
}

export function codexWorkflowProjectId(userId: string, workflowProjectId: string) {
  const normalizedUserId = String(userId || "").trim()
  const normalizedWorkflowId = normalizedWorkflowProjectId(workflowProjectId)
  if (!normalizedUserId || !normalizedWorkflowId) {
    throw new Error("user id and workflow project id are required")
  }
  return `codex_project_workflow_${workflowProjectDigest(normalizedUserId, normalizedWorkflowId)}`
}

export function projectsStore(): CodexProjectsStore {
  fs.mkdirSync(CODEX_RUNTIME_ROOT, { recursive: true })
  if (!fs.existsSync(PROJECTS_PATH)) return { projects: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(PROJECTS_PATH, "utf8")) as Partial<CodexProjectsStore>
    return { projects: Array.isArray(parsed.projects) ? parsed.projects : [] }
  } catch {
    return { projects: [] }
  }
}

export function writeProjectsStore(store: CodexProjectsStore) {
  fs.mkdirSync(CODEX_RUNTIME_ROOT, { recursive: true })
  fs.writeFileSync(PROJECTS_PATH, JSON.stringify(store, null, 2))
}

export function ensureCodexDefaultProject(userId: string) {
  const store = projectsStore()
  const projectPath = ensureCodexRuntimeDefaultProjectDir(userId)
  const existing = store.projects.find(project => project.userId === userId && project.slug === CODEX_DEFAULT_PROJECT_SLUG)
  if (existing) {
    if (existing.id !== CODEX_DEFAULT_PROJECT_ID || existing.path !== projectPath || existing.name !== "造梦工作区") {
      existing.id = CODEX_DEFAULT_PROJECT_ID
      existing.name = "造梦工作区"
      existing.path = projectPath
      existing.updatedAt = now()
      writeProjectsStore(store)
    }
    fs.mkdirSync(existing.path, { recursive: true })
    return existing
  }

  const ts = now()
  const project: CodexProject = {
    id: CODEX_DEFAULT_PROJECT_ID,
    userId,
    name: "造梦工作区",
    slug: CODEX_DEFAULT_PROJECT_SLUG,
    path: projectPath,
    source: "managed",
    createdAt: ts,
    updatedAt: ts,
  }
  store.projects.push(project)
  writeProjectsStore(store)
  return project
}

export function ensureCodexWorkflowProject(
  userId: string,
  workflowProjectId: string,
  workflowProjectName?: string,
) {
  const normalizedUserId = String(userId || "").trim()
  const normalizedWorkflowId = normalizedWorkflowProjectId(workflowProjectId)
  if (!normalizedUserId || !normalizedWorkflowId) {
    throw new Error("user id and workflow project id are required")
  }

  const projectId = codexWorkflowProjectId(normalizedUserId, normalizedWorkflowId)
  const projectPath = ensureCodexRuntimeProjectDir(normalizedUserId, projectId)
  const projectName = normalizedProjectName(workflowProjectName, "工作流项目")
  const store = projectsStore()
  const existing = store.projects.find(project => (
    project.userId === normalizedUserId
    && (project.workflowProjectId === normalizedWorkflowId || project.id === projectId)
  ))

  if (existing) {
    let changed = false
    if (existing.workflowProjectId !== normalizedWorkflowId) {
      existing.workflowProjectId = normalizedWorkflowId
      changed = true
    }
    if (existing.path !== projectPath) {
      existing.path = projectPath
      changed = true
    }
    if (workflowProjectName && existing.name !== projectName) {
      existing.name = projectName
      changed = true
    }
    if (changed) {
      existing.updatedAt = now()
      writeProjectsStore(store)
    }
    return existing
  }

  const ts = now()
  const digest = workflowProjectDigest(normalizedUserId, normalizedWorkflowId)
  const project: CodexProject = {
    id: projectId,
    userId: normalizedUserId,
    name: projectName,
    slug: `workflow-${digest}`,
    path: projectPath,
    workflowProjectId: normalizedWorkflowId,
    source: "managed",
    createdAt: ts,
    updatedAt: ts,
  }
  store.projects.push(project)
  writeProjectsStore(store)
  return project
}
