/**
 * Codex Plugin System — Core Types
 *
 * 1:1 replication of the Codex (OpenAI) plugin system's type architecture,
 * adapted to TypeScript/Node.js.
 */

// ── PluginId ──────────────────────────────────────────────

export type PluginId = {
  pluginName: string
  marketplaceName: string
}

export function parsePluginId(key: string): PluginId {
  const idx = key.lastIndexOf("@")
  if (idx < 1 || idx === key.length - 1) {
    throw new Error(`invalid plugin key "${key}"; expected <plugin>@<marketplace>`)
  }
  const pluginName = key.slice(0, idx)
  const marketplaceName = key.slice(idx + 1)
  validatePluginSegment(pluginName, "plugin name")
  validatePluginSegment(marketplaceName, "marketplace name")
  return { pluginName, marketplaceName }
}

export function pluginIdAsKey(id: PluginId): string {
  return `${id.pluginName}@${id.marketplaceName}`
}

export function validatePluginSegment(segment: string, kind: string): void {
  if (!segment) throw new Error(`invalid ${kind}: must not be empty`)
  if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
    throw new Error(`invalid ${kind} "${segment}": only ASCII letters, digits, _, and - are allowed`)
  }
}

export function validatePluginVersionSegment(version: string): void {
  if (!version) throw new Error("invalid plugin version: must not be empty")
  if (version === "." || version === "..") throw new Error("invalid plugin version: path traversal")
  if (!/^[a-zA-Z0-9._+-]+$/.test(version)) {
    throw new Error(`invalid plugin version "${version}": only ASCII letters, digits, ., +, _, -`)
  }
}

// ── Plugin Manifest ───────────────────────────────────────

export type PluginManifestInterface = {
  displayName?: string
  shortDescription?: string
  longDescription?: string
  developerName?: string
  category?: string
  capabilities?: string[]
  websiteUrl?: string
  privacyPolicyUrl?: string
  termsOfServiceUrl?: string
  defaultPrompt?: string[] // max 3 entries, max 128 chars each
  brandColor?: string
  composerIcon?: string // absolute path
  logo?: string // absolute path
  screenshots?: string[] // absolute paths
}

export type PluginManifestPaths = {
  skills?: string
  mcpServers?: string
  apps?: string
  hooks?: string | string[]
}

export type PluginManifest = {
  name: string
  version?: string
  description?: string
  keywords?: string[]
  paths: PluginManifestPaths
  interface?: PluginManifestInterface
}

// ── Marketplace ───────────────────────────────────────────

export type MarketplacePluginSource =
  | { type: "local"; path: string }
  | { type: "git"; url: string; path?: string; refName?: string; sha?: string }

export type MarketplacePluginInstallPolicy = "NOT_AVAILABLE" | "AVAILABLE" | "INSTALLED_BY_DEFAULT"
export type MarketplacePluginAuthPolicy = "ON_INSTALL" | "ON_USE"

export type MarketplacePluginPolicy = {
  installation: MarketplacePluginInstallPolicy
  authentication: MarketplacePluginAuthPolicy
}

export type MarketplacePlugin = {
  name: string
  source: MarketplacePluginSource
  policy: MarketplacePluginPolicy
  interface?: PluginManifestInterface
  keywords: string[]
}

export type MarketplaceInterface = {
  displayName?: string
}

export type Marketplace = {
  name: string
  path: string
  interface?: MarketplaceInterface
  plugins: MarketplacePlugin[]
}

export type MarketplaceListOutcome = {
  marketplaces: Marketplace[]
  errors: Array<{ path: string; message: string }>
}

// ── Plugin Source (protocol-level) ────────────────────────

export type PluginSource =
  | { type: "local"; path: string }
  | { type: "git"; url: string; path?: string; refName?: string; sha?: string }

// ── Plugin Summary / Detail ───────────────────────────────

export type PluginAvailability = "AVAILABLE" | "DISABLED_BY_ADMIN"
export type PluginInstallPolicy = "NOT_AVAILABLE" | "AVAILABLE" | "INSTALLED_BY_DEFAULT"
export type PluginAuthPolicy = "ON_INSTALL" | "ON_USE"

export type PluginSummary = {
  id: string // "{pluginName}@{marketplaceName}"
  name: string
  source: PluginSource
  installed: boolean
  enabled: boolean
  installPolicy: PluginInstallPolicy
  authPolicy: PluginAuthPolicy
  availability: PluginAvailability
  interface?: PluginManifestInterface
  keywords: string[]
}

export type SkillSummary = {
  name: string
  description: string
  path?: string
  enabled: boolean
}

export type PluginHookSummary = {
  key: string
  eventName: "preToolUse" | "permissionRequest" | "postToolUse" | "preCompact" | "postCompact" | "sessionStart" | "userPromptSubmit" | "stop"
}

export type PluginDetail = {
  marketplaceName: string
  marketplacePath?: string
  summary: PluginSummary
  description?: string
  skills: SkillSummary[]
  hooks: PluginHookSummary[]
  apps: string[]
  mcpServers: string[]
}

// ── Configured Marketplace (list response) ────────────────

export type ConfiguredMarketplace = {
  name: string
  path: string
  interface?: MarketplaceInterface
  plugins: ConfiguredMarketplacePlugin[]
}

export type ConfiguredMarketplacePlugin = {
  id: string
  name: string
  source: MarketplacePluginSource
  policy: MarketplacePluginPolicy
  interface?: PluginManifestInterface
  keywords: string[]
  installed: boolean
  enabled: boolean
}

export type ConfiguredMarketplaceListOutcome = {
  marketplaces: ConfiguredMarketplace[]
  errors: Array<{ path: string; message: string }>
}

// ── Install / Uninstall Results ───────────────────────────

export type PluginInstallOutcome = {
  pluginId: PluginId
  pluginVersion: string
  installedPath: string
  authPolicy: MarketplacePluginAuthPolicy
}

export type PluginInstallResult = {
  pluginId: PluginId
  pluginVersion: string
  installedPath: string
}

// ── Plugin List Response ──────────────────────────────────

export type PluginMarketplaceEntry = {
  name: string
  path?: string
  interface?: MarketplaceInterface
  plugins: PluginSummary[]
}

export type PluginListResponse = {
  marketplaces: PluginMarketplaceEntry[]
  marketplaceLoadErrors: Array<{ path: string; message: string }>
  featuredPluginIds: string[]
}

// ── Marketplace Add/Remove/Upgrade ────────────────────────

export type MarketplaceAddRequest = {
  source: string // git URL or local path
  refName?: string
  sparsePaths?: string[]
}

export type MarketplaceAddOutcome = {
  marketplaceName: string
  installedRoot: string
  alreadyAdded: boolean
}

export type MarketplaceRemoveRequest = {
  marketplaceName: string
}

export type MarketplaceRemoveOutcome = {
  marketplaceName: string
  removedInstalledRoot?: string
}

export type MarketplaceUpgradeOutcome = {
  selectedMarketplaces: string[]
  upgradedRoots: string[]
  errors: Array<{ marketplaceName: string; message: string }>
}

// ── Backward-compatible CodexPluginSummary ────────────────

export type CodexPluginSummary = {
  id: string
  name: string
  description: string
  status: "installed" | "available" | "stub" | "disabled"
  path?: string
  version?: string
  skills?: string[]
  apps?: string[]
  mcpServers?: string[]
  source?: PluginSource
  marketplaceName?: string
  interface?: PluginManifestInterface
  keywords?: string[]
}
