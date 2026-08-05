import os from "node:os"
import fs from "node:fs"
import path from "node:path"

function safeRuntimeSegment(value: unknown, fallback: string) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return normalized || fallback
}

export const CODEX_RUNTIME_ROOT = path.resolve(
  String(process.env.CODEX_RUNTIME_ROOT || "").trim()
    || path.join(os.homedir(), ".zaomeng", "codex-runtime"),
)

export function codexRuntimeProjectRoot(userId: string, projectId: string) {
  return path.join(
    CODEX_RUNTIME_ROOT,
    "users",
    safeRuntimeSegment(userId, "user"),
    "projects",
    safeRuntimeSegment(projectId, "project"),
  )
}

export function codexRuntimeAttachmentDir(userId: string, projectId: string) {
  return path.join(codexRuntimeProjectRoot(userId, projectId), "attachments")
}

export function codexRuntimeArtifactDir(userId: string, projectId: string, namespace = "files") {
  return path.join(codexRuntimeProjectRoot(userId, projectId), "artifacts", safeRuntimeSegment(namespace, "files"))
}

export function codexRuntimeTaskWorkspaceDir(userId: string, projectId: string, taskId: string) {
  return path.join(
    codexRuntimeProjectRoot(userId, projectId),
    "tasks",
    safeRuntimeSegment(taskId, "task"),
    "workspace",
  )
}

export function codexRuntimeTerminalDir(userId: string, projectId: string) {
  return path.join(codexRuntimeProjectRoot(userId, projectId), "terminal")
}

export const CODEX_DEFAULT_PROJECT_ID = "codex_project_default"
export const CODEX_DEFAULT_PROJECT_SLUG = "default"

export function ensureCodexRuntimeProjectDir(userId: string, projectId: string) {
  const projectRoot = codexRuntimeProjectRoot(userId, projectId)
  fs.mkdirSync(projectRoot, { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "attachments"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "artifacts"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "tasks"), { recursive: true })
  fs.mkdirSync(path.join(projectRoot, "terminal"), { recursive: true })
  return projectRoot
}

export function ensureCodexRuntimeDefaultProjectDir(userId: string) {
  return ensureCodexRuntimeProjectDir(userId, CODEX_DEFAULT_PROJECT_ID)
}
