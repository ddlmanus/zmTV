/**
 * Codex Plugin System — Manifest Loader
 *
 * Parses `.codex-plugin/plugin.json` (or `.claude-plugin/plugin.json`) manifests,
 * matching the Codex manifest.rs specification.
 */

import { existsSync, readFileSync, statSync } from "fs"
import path from "path"
import type { PluginManifest, PluginManifestInterface, PluginManifestPaths } from "./plugin-types"

const DISCOVERABLE_PLUGIN_MANIFEST_PATHS = [
  ".codex-plugin/plugin.json",
  ".claude-plugin/plugin.json",
]

/**
 * Find the plugin manifest path within a plugin root directory.
 * Checks `.codex-plugin/plugin.json` first, then `.claude-plugin/plugin.json`.
 */
export function findPluginManifestPath(pluginRoot: string): string | null {
  for (const relPath of DISCOVERABLE_PLUGIN_MANIFEST_PATHS) {
    const fullPath = path.join(pluginRoot, relPath)
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      return fullPath
    }
  }
  return null
}

/**
 * Resolve a relative path from the manifest, ensuring it stays within the plugin root.
 * All manifest paths must start with `./` and must not contain `..` or be absolute.
 */
function resolveManifestPath(pluginRoot: string, rawValue: unknown): string | null {
  const raw = String(rawValue ?? "").trim()
  if (!raw) return null

  // Must start with ./
  if (!raw.startsWith("./")) {
    // If it's a bare name like "skills" (not a path), treat as relative
    if (!raw.includes("/") && !raw.includes("\\") && !raw.startsWith("..") && !path.isAbsolute(raw)) {
      const resolved = path.resolve(pluginRoot, raw)
      if (!resolved.startsWith(path.resolve(pluginRoot) + path.sep) && resolved !== path.resolve(pluginRoot)) {
        return null
      }
      return resolved
    }
    return null
  }

  // Reject path traversal
  if (raw.includes("..")) return null
  if (path.isAbsolute(raw)) return null

  const resolved = path.resolve(pluginRoot, raw)
  const root = path.resolve(pluginRoot) + path.sep
  if (!resolved.startsWith(root) && resolved !== path.resolve(pluginRoot)) return null
  return resolved
}

/**
 * Sanitize defaultPrompt: max 3 entries, max 128 chars each, whitespace collapsed.
 */
function sanitizeDefaultPrompt(raw: unknown): string[] | undefined {
  if (!raw) return undefined
  const items = Array.isArray(raw) ? raw : [raw]
  const result: string[] = []
  for (const item of items) {
    if (result.length >= 3) break
    const text = String(item ?? "")
      .split(/\s+/)
      .join(" ")
      .trim()
    if (!text) continue
    result.push(text.length > 128 ? text.slice(0, 128) : text)
  }
  return result.length > 0 ? result : undefined
}

/**
 * Parse the interface section of a manifest.
 */
function parseManifestInterface(raw: Record<string, unknown> | undefined, pluginRoot: string): PluginManifestInterface | undefined {
  if (!raw || typeof raw !== "object") return undefined

  const iface: PluginManifestInterface = {}
  if (raw.displayName) iface.displayName = String(raw.displayName)
  if (raw.shortDescription) iface.shortDescription = String(raw.shortDescription)
  if (raw.longDescription) iface.longDescription = String(raw.longDescription)
  if (raw.developerName) iface.developerName = String(raw.developerName)
  if (raw.category) iface.category = String(raw.category)
  if (raw.capabilities) {
    iface.capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities.map((c: unknown) => String(c ?? "")).filter(Boolean)
      : []
  }
  if (raw.websiteUrl || raw.websiteURL) iface.websiteUrl = String(raw.websiteUrl ?? raw.websiteURL)
  if (raw.privacyPolicyUrl || raw.privacyPolicyURL) iface.privacyPolicyUrl = String(raw.privacyPolicyUrl ?? raw.privacyPolicyURL)
  if (raw.termsOfServiceUrl || raw.termsOfServiceURL) iface.termsOfServiceUrl = String(raw.termsOfServiceUrl ?? raw.termsOfServiceURL)

  const dp = sanitizeDefaultPrompt(raw.defaultPrompt)
  if (dp) iface.defaultPrompt = dp

  if (raw.brandColor) iface.brandColor = String(raw.brandColor)

  // Resolve local asset paths
  if (raw.composerIcon) {
    const resolved = resolveManifestPath(pluginRoot, raw.composerIcon)
    if (resolved) iface.composerIcon = resolved
  }
  if (raw.logo) {
    const resolved = resolveManifestPath(pluginRoot, raw.logo)
    if (resolved) iface.logo = resolved
  }
  if (raw.screenshots) {
    const shots = Array.isArray(raw.screenshots)
      ? raw.screenshots.map((s: unknown) => resolveManifestPath(pluginRoot, s)).filter(Boolean) as string[]
      : []
    if (shots.length > 0) iface.screenshots = shots
  }

  return iface
}

/**
 * Load and parse a plugin.json manifest from a plugin root directory.
 * Returns null if no manifest found or if the manifest is invalid.
 */
export function loadPluginManifest(pluginRoot: string): PluginManifest | null {
  const manifestPath = findPluginManifestPath(pluginRoot)
  if (!manifestPath) return null

  let raw: Record<string, unknown>
  try {
    const text = readFileSync(manifestPath, "utf8")
    raw = JSON.parse(text)
    if (!raw || typeof raw !== "object") return null
  } catch {
    return null
  }

  const name = String(raw.name ?? "").trim()
  if (!name) return null

  // Parse paths
  const paths: PluginManifestPaths = {}
  if (raw.skills) {
    const resolved = resolveManifestPath(pluginRoot, raw.skills)
    if (resolved) paths.skills = resolved
  }
  if (raw.mcpServers || raw.mcp_servers) {
    const resolved = resolveManifestPath(pluginRoot, raw.mcpServers ?? raw.mcp_servers)
    if (resolved) paths.mcpServers = resolved
  }
  if (raw.apps) {
    const resolved = resolveManifestPath(pluginRoot, raw.apps)
    if (resolved) paths.apps = resolved
  }
  if (raw.hooks) {
    if (typeof raw.hooks === "string") {
      const resolved = resolveManifestPath(pluginRoot, raw.hooks)
      if (resolved) paths.hooks = resolved
    } else if (Array.isArray(raw.hooks)) {
      paths.hooks = raw.hooks
        .map((h: unknown) => (typeof h === "string" ? resolveManifestPath(pluginRoot, h) : null))
        .filter(Boolean) as string[]
    }
  }

  const manifest: PluginManifest = {
    name,
    version: raw.version ? String(raw.version).trim() : undefined,
    description: raw.description ? String(raw.description).trim() : undefined,
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.map((k: unknown) => String(k ?? "").trim()).filter(Boolean)
      : [],
    paths,
  }

  // Parse interface
  const iface = parseManifestInterface(raw.interface as Record<string, unknown> | undefined, pluginRoot)
  if (iface) manifest.interface = iface

  return manifest
}
