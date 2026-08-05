import fs from 'node:fs'
import path from 'node:path'

function readBoundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
}

export type CodexRuntimeLimits = {
  appServerIdleMs: number
  appServerMaxActive: number
  appServerAggregateMaxRssBytes: number
  appServerAggregateHardMaxRssBytes: number
  appServerLogLinesPerMinute: number
  appTurnMaxRuntimeMs: number
  maintenanceIntervalMs: number
  taskStoreFlushDelayMs: number
  taskLogCacheMaxEntries: number
  taskLogCacheMaxBytes: number
  taskLogCompactThresholdBytes: number
  closedTerminalRetentionMs: number
  terminalMaxActivePerUser: number
  terminalOutputMaxBytes: number
  terminalOutputMaxEntries: number
  cowartIdleMs: number
  transientFileRetentionMs: number
  userHomeMaxBytes: number
  userRuntimeMaxBytes: number
  projectRuntimeMaxBytes: number
  runtimeMaxBytes: number
  attachmentMaxBytes: number
  projectAttachmentMaxBytes: number
}

export function readCodexRuntimeLimits(
  env: Record<string, string | undefined> = process.env,
): CodexRuntimeLimits {
  const appServerAggregateMaxRssBytes = readBoundedInteger(
    env.CODEX_APP_SERVER_AGGREGATE_MAX_RSS_BYTES,
    512 * 1024 * 1024,
    128 * 1024 * 1024,
    8 * 1024 * 1024 * 1024,
  )
  return {
    appServerIdleMs: readBoundedInteger(env.CODEX_APP_SERVER_IDLE_MS, 3 * 60_000, 30_000, 60 * 60_000),
    appServerMaxActive: readBoundedInteger(env.CODEX_APP_SERVER_MAX_ACTIVE, 4, 1, 32),
    appServerAggregateMaxRssBytes,
    appServerAggregateHardMaxRssBytes: readBoundedInteger(
      env.CODEX_APP_SERVER_AGGREGATE_HARD_MAX_RSS_BYTES,
      1024 * 1024 * 1024,
      appServerAggregateMaxRssBytes,
      8 * 1024 * 1024 * 1024,
    ),
    appServerLogLinesPerMinute: readBoundedInteger(env.CODEX_APP_SERVER_LOG_LINES_PER_MINUTE, 30, 0, 1_000),
    appTurnMaxRuntimeMs: readBoundedInteger(env.CODEX_APP_TURN_MAX_RUNTIME_MS, 2 * 60 * 60_000, 10 * 60_000, 24 * 60 * 60_000),
    maintenanceIntervalMs: readBoundedInteger(env.CODEX_RUNTIME_MAINTENANCE_INTERVAL_MS, 60_000, 10_000, 10 * 60_000),
    taskStoreFlushDelayMs: readBoundedInteger(env.CODEX_TASK_STORE_FLUSH_DELAY_MS, 300, 50, 2_000),
    taskLogCacheMaxEntries: readBoundedInteger(env.CODEX_TASK_LOG_CACHE_MAX_ENTRIES, 16, 2, 128),
    taskLogCacheMaxBytes: readBoundedInteger(env.CODEX_TASK_LOG_CACHE_MAX_BYTES, 64 * 1024 * 1024, 8 * 1024 * 1024, 512 * 1024 * 1024),
    taskLogCompactThresholdBytes: readBoundedInteger(env.CODEX_TASK_LOG_COMPACT_THRESHOLD_BYTES, 1024 * 1024, 128 * 1024, 64 * 1024 * 1024),
    closedTerminalRetentionMs: readBoundedInteger(env.CODEX_CLOSED_TERMINAL_RETENTION_MS, 5 * 60_000, 30_000, 24 * 60 * 60_000),
    terminalMaxActivePerUser: readBoundedInteger(env.CODEX_TERMINAL_MAX_ACTIVE_PER_USER, 4, 1, 16),
    terminalOutputMaxBytes: readBoundedInteger(env.CODEX_TERMINAL_OUTPUT_MAX_BYTES, 2 * 1024 * 1024, 256 * 1024, 32 * 1024 * 1024),
    terminalOutputMaxEntries: readBoundedInteger(env.CODEX_TERMINAL_OUTPUT_MAX_ENTRIES, 1_000, 100, 10_000),
    cowartIdleMs: readBoundedInteger(env.CODEX_COWART_IDLE_MS, 10 * 60_000, 60_000, 24 * 60 * 60_000),
    transientFileRetentionMs: readBoundedInteger(env.CODEX_TRANSIENT_FILE_RETENTION_MS, 6 * 60 * 60_000, 10 * 60_000, 7 * 24 * 60 * 60_000),
    userHomeMaxBytes: readBoundedInteger(env.CODEX_USER_HOME_MAX_BYTES, 512 * 1024 * 1024, 128 * 1024 * 1024, 8 * 1024 * 1024 * 1024),
    userRuntimeMaxBytes: readBoundedInteger(env.CODEX_USER_RUNTIME_MAX_BYTES, 2 * 1024 * 1024 * 1024, 256 * 1024 * 1024, 32 * 1024 * 1024 * 1024),
    projectRuntimeMaxBytes: readBoundedInteger(env.CODEX_PROJECT_RUNTIME_MAX_BYTES, 2 * 1024 * 1024 * 1024, 128 * 1024 * 1024, 16 * 1024 * 1024 * 1024),
    runtimeMaxBytes: readBoundedInteger(env.CODEX_RUNTIME_MAX_BYTES, 4 * 1024 * 1024 * 1024, 512 * 1024 * 1024, 64 * 1024 * 1024 * 1024),
    attachmentMaxBytes: readBoundedInteger(env.CODEX_ATTACHMENT_MAX_BYTES, 128 * 1024 * 1024, 1024 * 1024, 1024 * 1024 * 1024),
    projectAttachmentMaxBytes: readBoundedInteger(env.CODEX_PROJECT_ATTACHMENT_MAX_BYTES, 2 * 1024 * 1024 * 1024, 64 * 1024 * 1024, 32 * 1024 * 1024 * 1024),
  }
}

export function commandLineMatchesCodexAppServer(
  commandLine: string,
  expectedUrl: string,
  expectedTokenPath: string,
) {
  const normalized = String(commandLine || '').replaceAll('\0', ' ').replace(/\s+/g, ' ').trim()
  const url = String(expectedUrl || '').trim()
  const tokenPath = String(expectedTokenPath || '').trim()
  return Boolean(
    normalized
    && /(?:^|\s)app-server(?:\s|$)/.test(normalized)
    && url
    && normalized.includes(url)
    && tokenPath
    && normalized.includes(tokenPath)
  )
}

export function directorySizeBytes(root: string, stopAfterBytes = Number.POSITIVE_INFINITY) {
  if (!fs.existsSync(root)) return 0
  let total = 0
  const pending = [root]
  while (pending.length > 0 && total <= stopAfterBytes) {
    const current = pending.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(target)
      } else if (entry.isFile()) {
        try {
          total += fs.statSync(target).size
        } catch {}
      }
      if (total > stopAfterBytes) break
    }
  }
  return total
}

export function formatByteLimit(bytes: number) {
  const mib = bytes / 1024 / 1024
  if (mib < 1024) return `${Math.round(mib)} MB`
  return `${(mib / 1024).toFixed(1)} GB`
}
