import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  execFile,
  execFileSync,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { Hono } from "hono";
import { openCodexAppServerSocket } from "./app-server-transport";
import {
  codexModelCatalogItems,
  filterCodexModelsByCapabilities,
  resolveCodexModelId,
} from "./codex-model-catalog";
import { loadPluginManifest } from "./plugin-manifest";
import { generateCodexPlatformMedia } from "./platform-media";
import {
  findCodexWorkflowAttachmentMetadata,
  upsertCodexWorkflowAttachmentMetadata,
} from "./workflow-attachment-metadata";
import {
  codexCanvasGenerationEventType,
  codexCanvasGenerationKind as canvasGenerationKind,
  codexCanvasGenerationMediaKind,
  codexCanvasGenerationOutputName,
  codexCanvasGenerationPayloadType,
  type CodexCanvasGenerationKind,
} from "./canvas-generation";
import {
  isPixarAnimationAdTask,
  validatePixarAnimationAdCanvasCommand,
} from "./pixar-canvas-gate";
import {
  CODEX_RUNTIME_ROOT,
  codexRuntimeAttachmentDir,
  codexRuntimeProjectRoot,
  codexRuntimeTaskWorkspaceDir,
  codexRuntimeTerminalDir,
} from "./runtime-storage";
import {
  commandLineMatchesCodexAppServer,
  directorySizeBytes,
  formatByteLimit,
  readCodexRuntimeLimits,
} from "./runtime-guardrails";
import {
  ensureCodexDefaultProject,
  ensureCodexWorkflowProject,
  projectsStore,
  writeProjectsStore,
  type CodexProject,
} from "./project-registry";
import {
  bindCanvasSession,
  createCanvasSessionLeaseState,
  findCanvasSessionCommandToClaim,
  markCanvasSessionSeen,
  pruneCanvasSessionLeaseState,
  resolveBoundCanvasSessionId,
  type CanvasSessionLeaseState,
} from "./canvas-session-lease";

const app = new Hono();

app.use("*", async (_c, next) => {
  initializeCodexRuntimeMaintenance();
  await next();
});

function now() {
  return new Date().toISOString();
}

function waitForTimeoutOrAbort(ms: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", handleAbort);
      resolve(completed);
    };
    const timer = setTimeout(() => finish(true), ms);
    const handleAbort = () => finish(false);
    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) handleAbort();
  });
}

function success(c: any, data: unknown) {
  return c.json(data);
}

function badRequest(c: any, message: string) {
  return c.json({ error: message }, 400);
}

function serverError(c: any, err: unknown) {
  const message =
    err instanceof Error ? err.message : String(err || "server error");
  return c.json({ error: message }, 500);
}

async function uploadCodexPlatformFile(input: {
  buffer: Buffer;
  filename: string;
  contentType?: string;
}) {
  const baseUrl = String(process.env.CODEX_PLATFORM_MEDIA_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const token = String(process.env.CODEX_PLATFORM_TOKEN || "").trim();
  if (!baseUrl || !token) {
    throw new Error("桌面端造梦 API 文件服务尚未启动");
  }

  const form = new FormData();
  form.append(
    "file",
    new Blob([Uint8Array.from(input.buffer)], {
      type: input.contentType || "application/octet-stream",
    }),
    input.filename || "codex-attachment",
  );
  const response = await fetch(baseUrl + "/api/platform/files", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: form,
  });
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      String(payload.error || payload.message || "").trim() ||
        "造梦 API 开放平台文件上传失败: HTTP " + response.status,
    );
  }
  const id = Number(payload.id || 0);
  const url = String(payload.url || "").trim();
  if (!id || !url) {
    throw new Error("造梦 API 开放平台没有返回文件 ID 或公网地址");
  }
  return { id, url };
}

async function resolveCodexPlatformFile(fileId: number) {
  const baseUrl = String(process.env.CODEX_PLATFORM_MEDIA_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const token = String(process.env.CODEX_PLATFORM_TOKEN || "").trim();
  if (!baseUrl || !token) {
    throw new Error("桌面端造梦 API 文件服务尚未启动");
  }
  const response = await fetch(
    baseUrl + "/api/platform/files/" + encodeURIComponent(String(fileId)),
    {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    },
  );
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    throw new Error(
      String(payload.error || payload.message || "").trim() ||
        "读取造梦 API 开放平台文件失败: HTTP " + response.status,
    );
  }
  const id = Number(payload.id || 0);
  const url = String(payload.url || "").trim();
  if (!id || !url) throw new Error("造梦 API 开放平台文件记录无效");
  return { id, url };
}

function currentAuthUserId(c: any) {
  return String(
    c.get("userId") || c.req.header("x-ideart-user-id") || "",
  ).trim();
}

const DATA_ROOT = CODEX_RUNTIME_ROOT;
const WORKSPACE_ROOT = path.join(DATA_ROOT, "workspaces");
const LOG_ROOT = path.join(DATA_ROOT, "logs");
const TASKS_PATH = path.join(DATA_ROOT, "tasks.json");
const CONFIGS_PATH = path.join(DATA_ROOT, "configs.json");
const CANVAS_COMMANDS_PATH = path.join(DATA_ROOT, "canvas-commands.json");
const CODEX_BIN_CANDIDATES = [
  process.env.CODEX_BIN,
  path.resolve(process.cwd(), "node_modules/.bin/codex"),
  path.resolve(process.cwd(), "backend/node_modules/.bin/codex"),
  path.resolve(process.cwd(), "../node_modules/.bin/codex"),
  path.resolve(process.cwd(), "../backend/node_modules/.bin/codex"),
].filter((item): item is string => Boolean(item));
const CODEX_BIN =
  CODEX_BIN_CANDIDATES.find((item) => fs.existsSync(item)) ||
  CODEX_BIN_CANDIDATES[0];
const APP_SERVER_TOKENS_ROOT = path.join(DATA_ROOT, "app-server-tokens");
const APP_SERVER_HOMES_ROOT = path.join(DATA_ROOT, "homes");
const PROJECT_ROOT = path.resolve(
  String(process.env.ZAOMENG_DESKTOP_PROJECT_ROOT || "").trim() ||
    process.cwd(),
);
const PROJECT_TOOL_BIN_PATH = path.join(
  PROJECT_ROOT,
  "resources",
  "workflow-tools",
  "bin",
);
const AGENT_REACH_HOST_BIN = path.join(
  os.homedir(),
  ".local",
  "bin",
  "agent-reach",
);
const MCPORTER_HOST_BIN = path.join(
  os.homedir(),
  ".npm-global",
  "bin",
  "mcporter",
);
const YTDLP_HOST_BIN = path.join(os.homedir(), ".local", "bin", "yt-dlp");
const GH_HOST_BIN =
  [
    process.env.GH_BIN,
    "/opt/homebrew/bin/gh",
    "/usr/local/bin/gh",
    "/usr/bin/gh",
  ].find((candidate): candidate is string =>
    Boolean(candidate && fs.existsSync(candidate)),
  ) || "gh";
const SYSTEM_BIN_PATH = [
  PROJECT_TOOL_BIN_PATH,
  path.join(os.homedir(), ".local", "bin"),
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
].join(":");
const CODEX_AUTO_COMPACT_TOKEN_LIMIT = Math.max(
  32_000,
  Math.min(
    240_000,
    Number(process.env.CODEX_AUTO_COMPACT_TOKEN_LIMIT || 120_000) || 120_000,
  ),
);
const PROJECT_GLOBAL_SKILLS_ROOT = path.resolve(
  String(process.env.ZAOMENG_WORKFLOW_SKILLS_ROOT || "").trim() ||
    path.join(PROJECT_ROOT, "resources", "workflow-skills"),
);
const PROJECT_GLOBAL_SKILL_IDS = [
  "agent-reach",
  "video-shotcraft",
  "tvc-director",
  "ai-film-director",
  "novel-to-film-pipeline",
  "saas-product-demo-video",
  "short-form-video",
  "pixar-animation-ad",
  "viral-commerce-short-drama",
  "video-replication",
  "product-page-design",
  "ecommerce-product-system",
  "ecommerce-image-workflow",
  "amazon-listing-images",
] as const;
const PROJECT_GLOBAL_SKILLS_VERSION = "2026-07-31-pixar-stage-contract-v7";
const PROJECT_PLUGIN_CACHE_ROOT = path.join(
  PROJECT_ROOT,
  ".codex",
  "plugins",
  "cache",
);
const COWART_DEFAULT_PORT = Number(process.env.COWART_PORT || 43217);
const runtimeImport = new Function("specifier", "return import(specifier)") as (
  specifier: string,
) => Promise<any>;
type CowartCanvasServerState = {
  child?: ChildProcessWithoutNullStreams;
  port: number;
  projectPath: string;
  url: string;
  lastUsedAt: number;
};
const cowartRuntimeGlobal = globalThis as typeof globalThis & {
  __ideartCowartCanvasServers?: Map<string, CowartCanvasServerState>;
};
const cowartCanvasServers =
  cowartRuntimeGlobal.__ideartCowartCanvasServers ||
  new Map<string, CowartCanvasServerState>();
cowartRuntimeGlobal.__ideartCowartCanvasServers = cowartCanvasServers;
const codexRuntimeLimits = readCodexRuntimeLimits();

export function getCodexWorkspaceStatus() {
  const memory = process.memoryUsage();
  const appServerPids = [...appServers.values()]
    .map((state) => Number(state.process?.pid || state.pid || 0))
    .filter((pid) => pid > 0);
  const appServerRssByPid = processTreeRssBytesByRoot(appServerPids);
  const appServerRssBytes = appServerPids.reduce(
    (total, pid) => total + (appServerRssByPid.get(pid) || 0),
    0,
  );
  refreshRuntimeStorageUsage();
  const runtimeStorageBytes = runtimeState.runtimeStorageBytes;
  return {
    installed: Boolean(CODEX_BIN && fs.existsSync(CODEX_BIN)),
    bin: CODEX_BIN,
    running: running.size,
    active_turns: activeAppTurns.size,
    app_servers: appServers.size,
    app_server_limit: codexRuntimeLimits.appServerMaxActive,
    app_server_soft_memory_limit_mb: Math.round(
      codexRuntimeLimits.appServerAggregateMaxRssBytes / 1024 / 1024,
    ),
    app_server_hard_memory_limit_mb: Math.round(
      codexRuntimeLimits.appServerAggregateHardMaxRssBytes / 1024 / 1024,
    ),
    app_turn_max_runtime_minutes: Math.round(
      codexRuntimeLimits.appTurnMaxRuntimeMs / 60_000,
    ),
    pending_approvals: pendingApprovals.size,
    terminal_sessions: terminalSessions.size,
    task_log_cache_entries: codexTaskLogCache.size,
    task_log_cache_mb: Math.round(
      [...codexTaskLogCache.values()].reduce(
        (total, item) => total + item.size,
        0,
      ) /
        1024 /
        1024,
    ),
    canvas_sessions: runtimeState.canvasSessionLeases.lastSeenAt.size,
    process_memory: {
      rss_mb: Math.round(memory.rss / 1024 / 1024),
      child_rss_mb: Math.round(appServerRssBytes / 1024 / 1024),
      total_rss_mb: Math.round((memory.rss + appServerRssBytes) / 1024 / 1024),
      heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
      external_mb: Math.round(memory.external / 1024 / 1024),
    },
    storage_limits: {
      current_runtime_mb:
        runtimeStorageBytes === undefined
          ? null
          : Math.round(runtimeStorageBytes / 1024 / 1024),
      runtime_gb: codexRuntimeLimits.runtimeMaxBytes / 1024 / 1024 / 1024,
      user_home_mb: codexRuntimeLimits.userHomeMaxBytes / 1024 / 1024,
      user_runtime_gb:
        codexRuntimeLimits.userRuntimeMaxBytes / 1024 / 1024 / 1024,
      project_runtime_gb:
        codexRuntimeLimits.projectRuntimeMaxBytes / 1024 / 1024 / 1024,
    },
    workspace_root: WORKSPACE_ROOT,
  };
}

type CodexTaskEvent = {
  ts: string;
  stream: "stdout" | "stderr" | "system";
  type?: string;
  role?: "user" | "assistant" | "system" | "tool";
  text: string;
  raw?: string;
};

type CodexTaskLogCache = {
  size: number;
  lastAccessAt: number;
  events: CodexTaskEvent[];
  mergeTargets: Map<string, number>;
  changes: Array<{ revision: number; index: number }>;
  changeFloorRevision: number;
};

type CodexSelectedContext = {
  id?: string;
  name: string;
  type: "skill" | "mention" | "plugin";
  path: string;
};

type UserPluginSummary = {
  id: string;
  name: string;
  description: string;
  path: string;
  scope: string;
  version?: string;
  skills?: string[];
  apps?: string[];
  mcpServers?: string[];
  interface?: Record<string, unknown>;
  keywords?: string[];
};

type CodexTask = {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  prompt: string;
  model: string;
  reasoningEffort?: string;
  sandbox?: string;
  images?: string[];
  attachments?: string[];
  selectedContext?: CodexSelectedContext | null;
  clientScope?: string;
  workflowProjectId?: string;
  canvasSessionId?: string;
  threadId?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  pid?: number;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  runtime?: "app-server" | "exec";
  outputTail: CodexTaskEvent[];
  createdAt: string;
  updatedAt: string;
};

type CanvasCommandOperation =
  | "snapshot"
  | "models"
  | "create"
  | "update"
  | "connect"
  | "disconnect"
  | "delete"
  | "run"
  | "run-batch"
  | "wait"
  | "inspect-result"
  | "script-create-input"
  | "script-import-assets"
  | "storyboard-create-images"
  | "storyboard-regenerate-images"
  | "storyboard-create-videos";

type CanvasCommand = {
  id: string;
  userId: string;
  codexTaskId?: string;
  workflowProjectId: string;
  canvasSessionId: string;
  operation: CanvasCommandOperation;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  result?: unknown;
  error?: string;
  consumedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type CodexUserConfig = {
  userId: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  updatedAt: string;
};

type AppServerState = {
  userId: string;
  process: ChildProcessWithoutNullStreams | null;
  pid?: number;
  url: string;
  token: string;
  configSignature?: string;
  starting: Promise<{ url: string; token: string }> | null;
  lastUsedAt: number;
  activeRequests: number;
};

type PersistedAppServerState = {
  pid: number;
  url: string;
  token: string;
  configSignature: string;
  lastUsedAt?: number;
};

type PtyProcess = {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): void;
  onExit(
    callback: (event: { exitCode: number; signal?: number }) => void,
  ): void;
};

let ptyModule:
  | {
      spawn: (
        command: string,
        args: string[],
        options: Record<string, unknown>,
      ) => PtyProcess;
    }
  | null
  | undefined;

type CodexApproval = {
  id: string;
  userId: string;
  taskId: string;
  requestId: string | number;
  method: string;
  kind: "command" | "file" | "permissions";
  params: any;
  createdAt: string;
};

type TerminalSession = {
  id: string;
  userId: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  terminal: PtyProcess;
  outputSeq: number;
  outputBytes: number;
  output: Array<{
    seq: number;
    ts: string;
    stream: "stdout" | "stderr" | "system";
    text: string;
  }>;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
};

type ActiveAppTurn = {
  ws: any;
  runId: string;
  startedAt: number;
  threadId?: string;
  turnId?: string;
  interrupting?: boolean;
  forceCloseTimer?: ReturnType<typeof setTimeout>;
};

type CodexWorkspaceRuntimeState = {
  running: Map<string, ChildProcessWithoutNullStreams>;
  activeAppTurns: Map<string, ActiveAppTurn>;
  appServers: Map<string, AppServerState>;
  pendingApprovals: Map<string, CodexApproval>;
  terminalSessions: Map<string, TerminalSession>;
  taskLogCache: Map<string, CodexTaskLogCache>;
  tasksStoreCache: { tasks: CodexTask[] } | null;
  canvasCommandsStoreCache: { commands: CanvasCommand[] } | null;
  canvasCommandStartupReconciled: boolean;
  canvasSessionLeases: CanvasSessionLeaseState;
  tasksStoreFlushTimer?: ReturnType<typeof setTimeout>;
  taskLogCompactionTimers?: Map<string, ReturnType<typeof setTimeout>>;
  maintenanceTimer?: ReturnType<typeof setInterval>;
  maintenanceInitialized?: boolean;
  shutdownHooksInstalled?: boolean;
  storageUsageCache?: Map<string, { bytes: number; measuredAt: number }>;
  runtimeStorageBytes?: number;
  runtimeStorageMeasuredAt?: number;
  runtimeStorageScanInFlight?: boolean;
  runtimeStoragePressureActive?: boolean;
};

const runtimeGlobal = globalThis as typeof globalThis & {
  __ideartCodexWorkspaceRuntimeState?: CodexWorkspaceRuntimeState;
};
const runtimeState: CodexWorkspaceRuntimeState =
  runtimeGlobal.__ideartCodexWorkspaceRuntimeState || {
    running: new Map(),
    activeAppTurns: new Map(),
    appServers: new Map(),
    pendingApprovals: new Map(),
    terminalSessions: new Map(),
    taskLogCache: new Map(),
    tasksStoreCache: null,
    canvasCommandsStoreCache: null,
    canvasCommandStartupReconciled: false,
    canvasSessionLeases: createCanvasSessionLeaseState(),
    taskLogCompactionTimers: new Map(),
    storageUsageCache: new Map(),
  };
runtimeGlobal.__ideartCodexWorkspaceRuntimeState = runtimeState;
runtimeState.taskLogCompactionTimers ||= new Map();
runtimeState.storageUsageCache ||= new Map();

const running = runtimeState.running;
const activeAppTurns = runtimeState.activeAppTurns;
const appServers = runtimeState.appServers;
const pendingApprovals = runtimeState.pendingApprovals;
const terminalSessions = runtimeState.terminalSessions;
const codexTaskLogCache = runtimeState.taskLogCache;

const BUILT_IN_PLUGINS = [
  {
    id: "spreadsheets",
    name: "Spreadsheets",
    description: "Create and edit spreadsheet files.",
    icon: "spreadsheets",
    category: "Built by OpenAI",
    installedByDefault: true,
  },
  {
    id: "presentations",
    name: "Presentations",
    description: "Create and edit presentations.",
    icon: "presentations",
    category: "Built by OpenAI",
    installedByDefault: true,
  },
  {
    id: "github",
    name: "GitHub",
    description: "Triage PRs, issues, CI, and publish flows.",
    icon: "github",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Read and manage Slack.",
    icon: "slack",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "notion",
    name: "Notion",
    description: "Notion workflows for specs, research, and docs.",
    icon: "notion",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "linear",
    name: "Linear",
    description: "Find and reference issues and projects.",
    icon: "linear",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "statsig",
    name: "Statsig",
    description: "Bring your Statsig workspace into Codex.",
    icon: "statsig",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Read and manage Gmail.",
    icon: "gmail",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Manage Google Calendar events and scheduling.",
    icon: "calendar",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Work across Drive, Docs, Sheets, and files.",
    icon: "drive",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "teams",
    name: "Teams",
    description: "Summarize Teams and draft follow-ups.",
    icon: "teams",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
  {
    id: "sharepoint",
    name: "SharePoint",
    description: "Summarize SharePoint sites and files.",
    icon: "sharepoint",
    category: "Built by OpenAI",
    installedByDefault: false,
  },
];

function ensureDirs() {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
  fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });
  fs.mkdirSync(LOG_ROOT, { recursive: true });
  fs.mkdirSync(APP_SERVER_TOKENS_ROOT, { recursive: true });
  fs.mkdirSync(APP_SERVER_HOMES_ROOT, { recursive: true });
}

function readJsonFile<T>(file: string, fallback: T): T {
  ensureDirs();
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(file: string, value: unknown) {
  ensureDirs();
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function writeHotJsonFile(file: string, value: unknown) {
  ensureDirs();
  fs.writeFileSync(file, JSON.stringify(value));
}

function tasksStore() {
  if (runtimeState.tasksStoreCache) return runtimeState.tasksStoreCache;
  const store = readJsonFile<{ tasks: CodexTask[] }>(TASKS_PATH, { tasks: [] });
  let changed = false;
  for (const task of store.tasks) {
    const outputTail = compactCodexTaskEvents(
      Array.isArray(task.outputTail) ? task.outputTail : [],
      12,
    );
    if (
      !Array.isArray(task.outputTail) ||
      outputTail.length !== task.outputTail.length
    )
      changed = true;
    task.outputTail = outputTail;
  }
  runtimeState.tasksStoreCache = store;
  if (changed) writeHotJsonFile(TASKS_PATH, store);
  return store;
}

function writeTasksStore(store: { tasks: CodexTask[] }) {
  if (runtimeState.tasksStoreFlushTimer) {
    clearTimeout(runtimeState.tasksStoreFlushTimer);
    runtimeState.tasksStoreFlushTimer = undefined;
  }
  for (const task of store.tasks) {
    task.outputTail = compactCodexTaskEvents(
      Array.isArray(task.outputTail) ? task.outputTail : [],
      12,
    );
  }
  runtimeState.tasksStoreCache = store;
  writeHotJsonFile(TASKS_PATH, store);
}

function flushTasksStore() {
  if (runtimeState.tasksStoreFlushTimer) {
    clearTimeout(runtimeState.tasksStoreFlushTimer);
    runtimeState.tasksStoreFlushTimer = undefined;
  }
  const store = runtimeState.tasksStoreCache;
  if (!store) return;
  for (const task of store.tasks) {
    task.outputTail = compactCodexTaskEvents(
      Array.isArray(task.outputTail) ? task.outputTail : [],
      12,
    );
  }
  writeHotJsonFile(TASKS_PATH, store);
}

function scheduleTasksStoreFlush() {
  if (runtimeState.tasksStoreFlushTimer) return;
  runtimeState.tasksStoreFlushTimer = setTimeout(() => {
    runtimeState.tasksStoreFlushTimer = undefined;
    flushTasksStore();
  }, codexRuntimeLimits.taskStoreFlushDelayMs);
  runtimeState.tasksStoreFlushTimer.unref?.();
}

function canvasCommandTerminalTaskError(status: CodexTask["status"]) {
  if (status === "cancelled") return "Codex 任务已取消，画布命令已停止";
  if (status === "completed") return "Codex 任务已结束，未完成的画布命令已停止";
  return "Codex 任务失败，画布命令已停止";
}

function stopOpenCanvasCommandsForTask(
  taskId: string,
  status: CodexTask["status"],
) {
  if (!taskId || !["completed", "failed", "cancelled"].includes(status)) return;
  const store = canvasCommandsStore();
  let changed = false;
  for (const command of store.commands) {
    if (
      command.codexTaskId !== taskId ||
      !["pending", "running"].includes(command.status)
    )
      continue;
    command.status = "cancelled";
    command.error = canvasCommandTerminalTaskError(status);
    command.updatedAt = now();
    changed = true;
  }
  if (changed) writeCanvasCommandsStore(store);
}

function configsStore() {
  return readJsonFile<{ configs: CodexUserConfig[] }>(CONFIGS_PATH, {
    configs: [],
  });
}

function writeConfigsStore(store: { configs: CodexUserConfig[] }) {
  writeJsonFile(CONFIGS_PATH, store);
}

function canvasCommandsStore() {
  const store =
    runtimeState.canvasCommandsStoreCache ||
    readJsonFile<{ commands: CanvasCommand[] }>(CANVAS_COMMANDS_PATH, {
      commands: [],
    });
  runtimeState.canvasCommandsStoreCache = store;
  let changed = false;
  if (!runtimeState.canvasCommandStartupReconciled) {
    runtimeState.canvasCommandStartupReconciled = true;
    const activeTaskIds = new Set(
      store.commands
        .filter(
          (command) =>
            command.codexTaskId &&
            ["pending", "running"].includes(command.status),
        )
        .map((command) => String(command.codexTaskId)),
    );
    if (activeTaskIds.size > 0) {
      const taskStatuses = new Map(
        tasksStore()
          .tasks.filter(
            (task) =>
              activeTaskIds.has(task.id) &&
              ["completed", "failed", "cancelled"].includes(task.status),
          )
          .map((task) => [task.id, task.status] as const),
      );
      for (const command of store.commands) {
        const taskStatus = command.codexTaskId
          ? taskStatuses.get(command.codexTaskId)
          : undefined;
        if (!taskStatus || !["pending", "running"].includes(command.status))
          continue;
        command.status = "cancelled";
        command.error = canvasCommandTerminalTaskError(taskStatus);
        command.updatedAt = now();
        changed = true;
      }
    }
  }
  const currentTime = Date.now();
  const openCutoff = currentTime - 2 * 60 * 60 * 1000;
  const unconsumedTerminalCutoff = currentTime - 30 * 60 * 1000;
  const consumedTerminalCutoff = currentTime - 2 * 60 * 1000;
  const activePixarTaskIds = new Set(
    tasksStore()
      .tasks.filter(
        (task) => task.status === "running" && isPixarAnimationAdTask(task),
      )
      .map((task) => task.id),
  );
  const filteredCommands = store.commands.filter((command) => {
    // Pixar's staged gate needs the full create/run/review history until the active task ends.
    if (command.codexTaskId && activePixarTaskIds.has(command.codexTaskId))
      return true;
    const open = command.status === "pending" || command.status === "running";
    const timestamp = Date.parse(
      open
        ? command.updatedAt || command.createdAt
        : command.consumedAt || command.updatedAt || command.createdAt,
    );
    if (!Number.isFinite(timestamp)) return true;
    if (open) return timestamp >= openCutoff;
    return (
      timestamp >=
      (command.consumedAt ? consumedTerminalCutoff : unconsumedTerminalCutoff)
    );
  });
  if (filteredCommands.length !== store.commands.length) changed = true;
  store.commands = filteredCommands;
  if (changed) writeCanvasCommandsStore(store);
  return store;
}

function writeCanvasCommandsStore(store: { commands: CanvasCommand[] }) {
  runtimeState.canvasCommandsStoreCache = store;
  writeHotJsonFile(CANVAS_COMMANDS_PATH, store);
}

function safeSegment(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function publicConfig(config: CodexUserConfig | null) {
  const apiKey = config?.apiKey || "";
  return {
    provider: normalizeProvider(
      config?.provider || inferProviderFromBaseUrl(config?.baseUrl || ""),
    ),
    base_url: config?.baseUrl || "",
    model: config?.model || "",
    api_key_set: Boolean(apiKey),
    api_key_preview: apiKey ? `...${apiKey.slice(-4)}` : "",
    updated_at: config?.updatedAt || "",
  };
}

function environmentCodexConfig(userId: string): CodexUserConfig | null {
  const baseUrl = normalizeBaseUrl(
    process.env.CODEX_BASE_URL || process.env.OPENAI_BASE_URL || "",
  );
  const apiKey = String(
    process.env.CODEX_API_KEY ||
      process.env.ZENMUX_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "",
  ).trim();
  const model = normalizedCodexModelAlias(
    normalizeConfigModel(process.env.CODEX_MODEL || "openai/gpt-5.6-sol"),
  );
  if (!baseUrl || !apiKey || !model) return null;

  return {
    userId,
    provider: normalizeProvider(
      process.env.CODEX_PROVIDER || inferProviderFromBaseUrl(baseUrl),
    ),
    baseUrl,
    apiKey,
    model,
    updatedAt: "",
  };
}

function userConfig(userId: string) {
  return (
    configsStore().configs.find((config) => config.userId === userId) ||
    environmentCodexConfig(userId)
  );
}

function normalizedCodexModelAlias(model: string) {
  const raw = String(model || "").trim();
  if (raw === "google/gemini-3.5-flash") return "google/gemini-2.5-flash";
  return raw;
}

function normalizeConfigModel(value: unknown) {
  return String(value || "")
    .trim()
    .slice(0, 120);
}

function normalizeProvider(value: unknown) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  return (
    raw
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "custom"
  );
}

function inferProviderFromBaseUrl(value: unknown) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("zenmux.ai")) return "zenmux";
  if (raw.includes("api.openai.com")) return "openai";
  if (raw.includes("openrouter.ai")) return "openrouter";
  if (raw.includes("aihubmix.com")) return "aihubmix";
  if (raw.includes("agnes-ai.com")) return "agnes";
  return "custom";
}

function normalizeBaseUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase().includes("zenmux.ai")) {
      parsed.pathname = "/api/v1";
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/+$/, "");
    }
  } catch {}
  return raw.replace(/\/+$/, "");
}

function isHtmlResponse(text: string) {
  return /^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text);
}

function responseErrorMessage(
  prefix: string,
  text: string,
  json: any,
  status: number,
) {
  if (isHtmlResponse(text)) {
    return `${prefix}：Base URL 返回了网页 HTML，请填写 API 地址，例如 https://zenmux.ai/api/v1`;
  }
  const message =
    json?.error?.message || json?.message || text || `HTTP ${status}`;
  return `${prefix}：${String(message).slice(0, 600)}`;
}

function validateBaseUrl(value: string) {
  if (!value) return "Base URL 不能为空";
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol))
      return "Base URL 必须是 http 或 https 地址";
  } catch {
    return "Base URL 格式不正确";
  }
  return "";
}

async function fetchCodexModelCatalog(config: CodexUserConfig) {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  const apiKey = String(config.apiKey || "").trim();
  if (!baseUrl || !apiKey) throw new Error("Codex provider 配置不完整");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(baseUrl + "/models", {
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const text = await response.text().catch(() => "");
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {}
    if (!response.ok) {
      throw new Error(
        responseErrorMessage(
          "读取模型列表失败",
          text,
          payload,
          response.status,
        ),
      );
    }
    const providerModels = codexModelCatalogItems(payload);
    const verifiedModels =
      await filterCodexModelsByCapabilities(providerModels);
    if (!verifiedModels.length) {
      throw new Error(
        "当前 provider 没有通过能力验证的视觉文本模型（需要图片输入、文本输出和 Responses 接口）",
      );
    }
    return verifiedModels;
  } finally {
    clearTimeout(timer);
  }
}

async function testCodexConnection(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const modelsResp = await fetch(`${input.baseUrl}/models`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const modelsText = await modelsResp.text();
    let modelsJson: any = null;
    try {
      modelsJson = modelsText ? JSON.parse(modelsText) : null;
    } catch {}
    if (!modelsResp.ok) {
      throw new Error(
        responseErrorMessage(
          "连接失败",
          modelsText,
          modelsJson,
          modelsResp.status,
        ),
      );
    }
    const models = Array.isArray(modelsJson?.data)
      ? modelsJson.data
          .map((item: any) => String(item?.id || ""))
          .filter(Boolean)
      : [];
    if (input.model && models.length && !models.includes(input.model)) {
      throw new Error(`连接成功，但模型列表里没有 ${input.model}`);
    }

    const generationResp = await fetch(`${input.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model: input.model,
        input: "Reply with OK.",
        max_output_tokens: 8,
        stream: true,
      }),
      signal: controller.signal,
    });
    if (!generationResp.ok) {
      const text = await generationResp.text().catch(() => "");
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}
      throw new Error(
        responseErrorMessage(
          "生成接口不可用",
          text,
          json,
          generationResp.status,
        ),
      );
    }
    if (generationResp.body) {
      const reader = generationResp.body.getReader();
      const decoder = new TextDecoder();
      let received = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += decoder.decode(value, { stream: true });
        if (
          received.includes("response.completed") ||
          received.includes("[DONE]")
        )
          break;
        if (
          received.includes('"type":"error"') ||
          received.includes("event: error")
        ) {
          throw new Error(`生成接口返回错误：${received.slice(0, 500)}`);
        }
      }
    }
    return {
      ok: true,
      models: models.slice(0, 80),
      checked_model: input.model,
      message: "连接成功，生成接口可用。请点击应用后再发送任务",
    };
  } finally {
    clearTimeout(timer);
  }
}

function publicProject(project: CodexProject) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    path: project.path,
    workflow_project_id: project.workflowProjectId || "",
    source: project.source || "managed",
    repo_url: project.repoUrl || "",
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

const CODEX_COMMAND_DELTA_LIMIT = 4 * 1024;
const CODEX_COMMAND_OUTPUT_LIMIT = 16 * 1024;
const CODEX_REASONING_DELTA_LIMIT = 16 * 1024;
const CODEX_AGENT_DELTA_LIMIT = 128 * 1024;
const CODEX_DIFF_LIMIT = 32 * 1024;
const CODEX_EVENT_FALLBACK_LIMIT = 96 * 1024;

function truncateCodexEventText(value: unknown, limit: number) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  const marker = `\n...[${text.length - limit} characters omitted]...\n`;
  const available = Math.max(0, limit - marker.length);
  const headLength = Math.ceil(available * 0.55);
  const tailLength = Math.max(0, available - headLength);
  return `${text.slice(0, headLength)}${marker}${tailLength ? text.slice(-tailLength) : ""}`;
}

function parseCodexEventRaw(raw: unknown) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, any>)
      : null;
  } catch {
    return null;
  }
}

function compactCodexEventRaw(event: CodexTaskEvent) {
  const type = String(event.type || "");
  const parsed = parseCodexEventRaw(event.raw);
  if (!parsed)
    return event.raw
      ? truncateCodexEventText(event.raw, CODEX_EVENT_FALLBACK_LIMIT)
      : undefined;
  const params =
    parsed.params &&
    typeof parsed.params === "object" &&
    !Array.isArray(parsed.params)
      ? (parsed.params as Record<string, any>)
      : {};
  const commonParams = {
    threadId: params.threadId,
    turnId: params.turnId,
  };

  if (
    type === "app.command_delta" ||
    type === "app.agent_delta" ||
    type === "app.reasoning_delta"
  ) {
    return JSON.stringify({
      method: parsed.method,
      params: {
        ...commonParams,
        itemId: params.itemId || params.item_id || params.processId,
      },
    });
  }

  if (type === "app.command_started" || type === "app.command") {
    const item =
      params.item &&
      typeof params.item === "object" &&
      !Array.isArray(params.item)
        ? (params.item as Record<string, any>)
        : {};
    return JSON.stringify({
      method: parsed.method,
      params: {
        ...commonParams,
        item: {
          id: item.id,
          type: item.type,
          status: item.status,
          command: truncateCodexEventText(item.command, 16 * 1024),
          ...(type === "app.command"
            ? {
                aggregatedOutput: truncateCodexEventText(
                  item.aggregatedOutput,
                  CODEX_COMMAND_OUTPUT_LIMIT,
                ),
              }
            : {}),
        },
      },
    });
  }

  if (type === "app.diff") {
    return JSON.stringify({
      method: parsed.method,
      params: commonParams,
    });
  }

  return truncateCodexEventText(event.raw, CODEX_EVENT_FALLBACK_LIMIT);
}

function compactCodexTaskEvent(event: CodexTaskEvent): CodexTaskEvent {
  const type = String(event.type || "");
  const textLimit =
    type === "app.command_delta"
      ? CODEX_COMMAND_DELTA_LIMIT
      : type === "app.command"
        ? CODEX_COMMAND_OUTPUT_LIMIT + 16 * 1024
        : type === "app.reasoning_delta"
          ? CODEX_REASONING_DELTA_LIMIT
          : type === "app.agent_delta"
            ? CODEX_AGENT_DELTA_LIMIT
            : type === "app.diff"
              ? CODEX_DIFF_LIMIT
              : CODEX_EVENT_FALLBACK_LIMIT;
  return {
    ...event,
    text: truncateCodexEventText(event.text, textLimit),
    raw: compactCodexEventRaw(event),
  };
}

function codexEventMergeKey(event: CodexTaskEvent) {
  const type = String(event.type || "");
  if (
    type === "app.imageGeneration" ||
    type === "app.videoGeneration" ||
    type === "app.audioGeneration"
  ) {
    const payload = firstJsonObjectFromText(event.text || event.raw || "");
    const nodeId = String(payload?.nodeId || payload?.node_id || "").trim();
    const taskId = String(
      payload?.taskId || payload?.task_id || payload?.providerTaskId || "",
    ).trim();
    const identity = nodeId || taskId;
    return identity
      ? `${type}:${String(payload?.source || "generation")}:${identity}`
      : "";
  }
  if (
    ![
      "app.command_delta",
      "app.agent_delta",
      "app.reasoning_delta",
      "app.diff",
    ].includes(type)
  )
    return "";
  const parsed = parseCodexEventRaw(event.raw);
  const params =
    parsed?.params && typeof parsed.params === "object"
      ? (parsed.params as Record<string, any>)
      : {};
  if (type === "app.diff") {
    const turnId = String(params.turnId || params.turn_id || "").trim();
    return turnId ? `${type}:${turnId}` : "";
  }
  const itemId = String(
    params.itemId || params.item_id || params.processId || "",
  ).trim();
  return itemId ? `${type}:${itemId}` : "";
}

function mergedCodexEventText(previous: string, next: string, type: string) {
  const limit =
    type === "app.command_delta"
      ? CODEX_COMMAND_OUTPUT_LIMIT
      : type === "app.reasoning_delta"
        ? CODEX_REASONING_DELTA_LIMIT
        : CODEX_AGENT_DELTA_LIMIT;
  return truncateCodexEventText(`${previous || ""}${next || ""}`, limit);
}

function mergeCodexTaskEvent(target: CodexTaskEvent, next: CodexTaskEvent) {
  const targetKey = codexEventMergeKey(target);
  if (!targetKey || targetKey !== codexEventMergeKey(next)) return false;
  if (
    next.type === "app.imageGeneration" ||
    next.type === "app.videoGeneration" ||
    next.type === "app.audioGeneration"
  ) {
    Object.assign(target, next);
    return true;
  }
  target.ts = next.ts;
  target.text =
    next.type === "app.diff"
      ? next.text
      : mergedCodexEventText(target.text, next.text, String(next.type || ""));
  target.raw = next.raw || target.raw;
  return true;
}

function compactCodexTaskEvents(events: CodexTaskEvent[], limit = 600) {
  const result: CodexTaskEvent[] = [];
  const mergeTargets = new Map<string, CodexTaskEvent>();
  for (const source of events) {
    if (source?.type === "app.token_usage") continue;
    const event = compactCodexTaskEvent(source);
    const mergeKey = codexEventMergeKey(event);
    const existing = mergeKey ? mergeTargets.get(mergeKey) : undefined;
    if (existing && mergeCodexTaskEvent(existing, event)) continue;
    result.push(event);
    if (mergeKey) mergeTargets.set(mergeKey, event);
  }
  return limit > 0 ? result.slice(-limit) : result;
}

function mergeCodexTaskLogCacheEvent(
  cache: CodexTaskLogCache,
  source: CodexTaskEvent,
) {
  if (source?.type === "app.token_usage") return null;
  const event = compactCodexTaskEvent(source);
  const mergeKey = codexEventMergeKey(event);
  const existingIndex = mergeKey ? cache.mergeTargets.get(mergeKey) : undefined;
  if (
    existingIndex !== undefined &&
    mergeCodexTaskEvent(cache.events[existingIndex], event)
  )
    return existingIndex;
  const nextIndex = cache.events.length;
  cache.events.push(event);
  if (mergeKey) cache.mergeTargets.set(mergeKey, nextIndex);
  return nextIndex;
}

function recordCodexTaskLogChange(
  cache: CodexTaskLogCache,
  revision: number,
  index: number,
) {
  cache.changes.push({ revision, index });
  if (cache.changes.length <= 5000) return;
  const removed = cache.changes.splice(0, cache.changes.length - 5000);
  cache.changeFloorRevision =
    removed[removed.length - 1]?.revision || cache.changeFloorRevision;
}

function pruneCodexTaskLogCache(protectedPath = "") {
  const entries = [...codexTaskLogCache.entries()];
  let totalBytes = entries.reduce((total, [, cache]) => total + cache.size, 0);
  if (
    entries.length <= codexRuntimeLimits.taskLogCacheMaxEntries &&
    totalBytes <= codexRuntimeLimits.taskLogCacheMaxBytes
  )
    return;
  entries
    .sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt)
    .forEach(([logPath, cache]) => {
      if (logPath === protectedPath) return;
      if (
        codexTaskLogCache.size <= codexRuntimeLimits.taskLogCacheMaxEntries &&
        totalBytes <= codexRuntimeLimits.taskLogCacheMaxBytes
      )
        return;
      codexTaskLogCache.delete(logPath);
      totalBytes -= cache.size;
    });
}

function readCompactedCodexTaskLog(logPath: string) {
  const stat = fs.statSync(logPath);
  let cache = codexTaskLogCache.get(logPath);
  if (!cache || stat.size < cache.size) {
    cache = {
      size: 0,
      lastAccessAt: Date.now(),
      events: [],
      mergeTargets: new Map<string, number>(),
      changes: [],
      changeFloorRevision: 0,
    };
    codexTaskLogCache.set(logPath, cache);
  }
  cache.lastAccessAt = Date.now();
  if (stat.size === cache.size) {
    pruneCodexTaskLogCache(logPath);
    return cache;
  }

  const buffer = Buffer.allocUnsafe(stat.size - cache.size);
  const descriptor = fs.openSync(logPath, "r");
  try {
    fs.readSync(descriptor, buffer, 0, buffer.length, cache.size);
  } finally {
    fs.closeSync(descriptor);
  }
  let revision = cache.size;
  buffer
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .forEach((line) => {
      revision += Buffer.byteLength(line) + 1;
      try {
        const index = mergeCodexTaskLogCacheEvent(
          cache!,
          JSON.parse(line) as CodexTaskEvent,
        );
        if (index !== null) recordCodexTaskLogChange(cache!, revision, index);
      } catch {}
    });
  cache.size = stat.size;
  cache.lastAccessAt = Date.now();
  pruneCodexTaskLogCache(logPath);
  return cache;
}

function compactTaskLogFile(taskId: string) {
  const logPath = path.join(LOG_ROOT, `${taskId}.jsonl`);
  if (!fs.existsSync(logPath)) return;
  const stat = fs.statSync(logPath);
  if (stat.size < codexRuntimeLimits.taskLogCompactThresholdBytes) return;
  const cache = readCompactedCodexTaskLog(logPath);
  const payload = cache.events.map((event) => JSON.stringify(event)).join("\n");
  const temporaryPath = `${logPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, payload ? `${payload}\n` : "");
  fs.renameSync(temporaryPath, logPath);
  codexTaskLogCache.delete(logPath);
}

function scheduleTaskLogCompaction(taskId: string) {
  const timers = runtimeState.taskLogCompactionTimers!;
  const existing = timers.get(taskId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    timers.delete(taskId);
    const task = tasksStore().tasks.find((item) => item.id === taskId);
    if (!task || !["completed", "failed", "cancelled"].includes(task.status))
      return;
    try {
      compactTaskLogFile(taskId);
    } catch (error) {
      console.warn(
        "[codex runtime] task log compaction failed",
        error instanceof Error ? error.message : String(error || ""),
      );
    }
  }, 2_000);
  timer.unref?.();
  timers.set(taskId, timer);
}

function publicTaskAttachmentDetails(task: CodexTask) {
  const attachmentPaths = task.attachments?.length
    ? task.attachments
    : task.images || [];
  const runtimeRoot = codexRuntimeProjectRoot(task.userId, task.projectId);
  return attachmentPaths.map((filePath) => {
    const normalizedFilePath = String(filePath || "")
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
    const relativePath = projectContainsFile(runtimeRoot, filePath)
      ? path.relative(runtimeRoot, filePath).split(path.sep).join("/")
      : /^(?:attachments|artifacts)\//.test(normalizedFilePath)
        ? normalizedFilePath
        : path.basename(filePath);
    const metadata = findCodexWorkflowAttachmentMetadata(runtimeRoot, filePath);
    const publicUrl = String(metadata?.publicUrl || "").trim();
    return {
      name: path.basename(filePath),
      path: filePath,
      relative_path: relativePath,
      url: publicUrl || undefined,
      public_url: publicUrl || undefined,
      local_url: `/api/codex/projects/${encodeURIComponent(task.projectId)}/runtime-files/view?path=${encodeURIComponent(relativePath)}`,
      workflowNodeId: metadata?.nodeId,
      workflowSourceUrl: metadata?.sourceUrl,
      workflowSeedanceAssetId: metadata?.seedanceAssetId,
      workflowSeedanceAssetUrl: metadata?.seedanceAssetUrl,
      workflowSeedanceAssetStatus: metadata?.seedanceAssetStatus,
      workflowSeedanceAssetCategory: metadata?.seedanceAssetCategory,
      portraitCompliantExempt: metadata?.portraitCompliantExempt,
      naturalWidth: metadata?.naturalWidth,
      naturalHeight: metadata?.naturalHeight,
    };
  });
}

function publicTask(
  task: CodexTask,
  options: { includeOutputTail?: boolean } = {},
) {
  return {
    id: task.id,
    project_id: task.projectId,
    project_name: task.projectName,
    project_path: task.projectPath,
    prompt: task.prompt,
    model: task.model,
    reasoning_effort: task.reasoningEffort,
    sandbox: task.sandbox,
    images: task.images || [],
    attachments: task.attachments || task.images || [],
    attachment_details: publicTaskAttachmentDetails(task),
    selected_context: task.selectedContext || null,
    client_scope: task.clientScope || "",
    workflow_project_id: task.workflowProjectId || "",
    canvas_session_id: task.canvasSessionId || "",
    thread_id: task.threadId,
    status: task.status,
    pid: task.pid,
    exit_code: task.exitCode,
    signal: task.signal,
    runtime: task.runtime,
    ...(options.includeOutputTail === false
      ? {}
      : { output_tail: compactCodexTaskEvents(task.outputTail, 300) }),
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

function extractEvent(
  line: string,
  stream: "stdout" | "stderr",
): CodexTaskEvent {
  const trimmed = line.trimEnd();
  if (!trimmed) {
    return { ts: now(), stream, text: "" };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const text =
      parsed.message ||
      parsed.text ||
      parsed.delta ||
      parsed.output ||
      parsed.item?.text ||
      parsed.event?.message ||
      JSON.stringify(parsed);
    return {
      ts: now(),
      stream,
      type: parsed.type || parsed.event || parsed.kind,
      text: String(text),
      raw: trimmed,
    };
  } catch {
    return { ts: now(), stream, text: trimmed, raw: trimmed };
  }
}

function parseThreadId(event: CodexTaskEvent) {
  if (!event.raw) return "";
  try {
    const parsed = JSON.parse(event.raw);
    return parsed?.type === "thread.started" && parsed?.thread_id
      ? String(parsed.thread_id)
      : "";
  } catch {
    return "";
  }
}

function updateTask(taskId: string, patch: Partial<CodexTask>) {
  const store = tasksStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) return null;
  Object.assign(task, patch, { updatedAt: now() });
  writeTasksStore(store);
  if (
    patch.status &&
    ["completed", "failed", "cancelled"].includes(patch.status)
  ) {
    stopOpenCanvasCommandsForTask(taskId, patch.status);
    scheduleTaskLogCompaction(taskId);
  }
  return task;
}

function appendTaskEvent(taskId: string, event: CodexTaskEvent) {
  if (
    /Model metadata for `[^`]+` not found\. Defaulting to fallback metadata/i.test(
      event.text || "",
    )
  )
    return;
  const store = tasksStore();
  const task = store.tasks.find((item) => item.id === taskId);
  if (!task) return;
  const compactEvent = compactCodexTaskEvent(event);
  const previous = task.outputTail[task.outputTail.length - 1];
  if (!previous || !mergeCodexTaskEvent(previous, compactEvent))
    task.outputTail.push(compactEvent);
  const threadId = parseThreadId(compactEvent);
  if (threadId) task.threadId = threadId;
  task.outputTail = task.outputTail.slice(-12);
  task.updatedAt = now();
  runtimeState.tasksStoreCache = store;
  scheduleTasksStoreFlush();
  const logPath = path.join(LOG_ROOT, `${taskId}.jsonl`);
  const serializedEvent = `${JSON.stringify(compactEvent)}\n`;
  fs.appendFileSync(logPath, serializedEvent);
  const logCache = codexTaskLogCache.get(logPath);
  if (logCache) {
    const index = mergeCodexTaskLogCacheEvent(logCache, compactEvent);
    logCache.size += Buffer.byteLength(serializedEvent);
    logCache.lastAccessAt = Date.now();
    if (index !== null)
      recordCodexTaskLogChange(logCache, logCache.size, index);
  }
}

function appendUserMessage(
  taskId: string,
  prompt: string,
  images: string[] = [],
  attachments: string[] = images,
) {
  appendTaskEvent(taskId, {
    ts: now(),
    stream: "system",
    type: "user_message",
    role: "user",
    text: prompt,
    raw:
      images.length || attachments.length
        ? JSON.stringify({ images, attachments })
        : undefined,
  });
}

function approvalKind(method: string): CodexApproval["kind"] | null {
  if (method === "item/commandExecution/requestApproval") return "command";
  if (method === "item/fileChange/requestApproval") return "file";
  if (method === "item/permissions/requestApproval") return "permissions";
  return null;
}

function publicApproval(approval: CodexApproval) {
  return {
    id: approval.id,
    task_id: approval.taskId,
    method: approval.method,
    kind: approval.kind,
    params: approval.params,
    created_at: approval.createdAt,
  };
}

function storeApproval(userId: string, taskId: string, message: any) {
  const kind = approvalKind(message?.method);
  if (!kind || message?.id === undefined || message?.id === null) return null;
  const requestId = message.id;
  const id = `${taskId}:${String(requestId)}`;
  const approval: CodexApproval = {
    id,
    userId,
    taskId,
    requestId,
    method: message.method,
    kind,
    params: message.params || {},
    createdAt: now(),
  };
  pendingApprovals.set(id, approval);
  appendTaskEvent(taskId, {
    ts: approval.createdAt,
    stream: "system",
    type: "app.approval_request",
    role: "system",
    text: JSON.stringify({ kind, params: approval.params }),
    raw: JSON.stringify(message),
  });
  return approval;
}

function approvalResponseFor(
  approval: CodexApproval,
  decision: string,
  scope = "turn",
) {
  const allow = decision === "accept" || decision === "acceptForSession";
  const commandDecision =
    decision === "acceptForSession"
      ? "acceptForSession"
      : allow
        ? "accept"
        : "decline";
  const fileDecision =
    decision === "acceptForSession"
      ? "acceptForSession"
      : allow
        ? "accept"
        : "decline";
  if (approval.kind === "permissions") {
    if (!allow) {
      return {
        error: {
          code: -32000,
          message: "用户拒绝授权",
        },
      };
    }
    return {
      result: {
        permissions: approval.params.permissions || {},
        scope: scope === "session" ? "session" : "turn",
        strictAutoReview: false,
      },
    };
  }
  return {
    result: {
      decision: approval.kind === "file" ? fileDecision : commandDecision,
    },
  };
}

function resolveApproval(
  userId: string,
  approvalId: string,
  decision: string,
  scope?: string,
) {
  const approval = pendingApprovals.get(approvalId);
  if (!approval || approval.userId !== userId) return null;
  const active = activeAppTurns.get(approval.taskId);
  if (!active?.ws) throw new Error("Codex 任务连接已断开");
  const payload = {
    jsonrpc: "2.0",
    id: approval.requestId,
    ...approvalResponseFor(approval, decision, scope),
  };
  active.ws.send(JSON.stringify(payload));
  pendingApprovals.delete(approvalId);
  appendTaskEvent(approval.taskId, {
    ts: now(),
    stream: "system",
    type: "app.approval_resolved",
    role: "system",
    text:
      decision === "accept" || decision === "acceptForSession"
        ? "用户已授权"
        : "用户已拒绝授权",
  });
  return approval;
}

function silentlyResolveApproval(
  userId: string,
  approvalId: string,
  decision: string,
  scope?: string,
) {
  const approval = pendingApprovals.get(approvalId);
  if (!approval || approval.userId !== userId) return null;
  const active = activeAppTurns.get(approval.taskId);
  if (!active?.ws) throw new Error("Codex 任务连接已断开");
  sendApprovalResponse(active.ws, approval, decision, scope);
  pendingApprovals.delete(approvalId);
  return approval;
}

function deleteTaskLog(taskId: string) {
  const compactionTimer = runtimeState.taskLogCompactionTimers?.get(taskId);
  if (compactionTimer) clearTimeout(compactionTimer);
  runtimeState.taskLogCompactionTimers?.delete(taskId);
  const logPath = path.join(LOG_ROOT, `${taskId}.jsonl`);
  codexTaskLogCache.delete(logPath);
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
}

function stopTaskRuntime(
  taskId: string,
  canvasCommandStatus: CodexTask["status"] = "cancelled",
) {
  const child = running.get(taskId);
  const activeTurn = activeAppTurns.get(taskId);
  stopOpenCanvasCommandsForTask(taskId, canvasCommandStatus);
  if (child && !child.killed) child.kill("SIGTERM");
  running.delete(taskId);
  if (activeTurn?.ws) {
    for (const [approvalId, approval] of pendingApprovals) {
      if (approval.taskId !== taskId) continue;
      try {
        sendApprovalResponse(activeTurn.ws, approval, "decline");
      } catch {}
      pendingApprovals.delete(approvalId);
    }
    if (activeTurn.threadId && activeTurn.turnId) {
      activeTurn.interrupting = true;
      try {
        activeTurn.ws.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: Date.now(),
            method: "turn/interrupt",
            params: {
              threadId: activeTurn.threadId,
              turnId: activeTurn.turnId,
            },
          }),
        );
      } catch {}
      if (!activeTurn.forceCloseTimer) {
        activeTurn.forceCloseTimer = setTimeout(() => {
          const current = activeAppTurns.get(taskId);
          if (current?.runId !== activeTurn.runId) return;
          try {
            current.ws?.close();
          } catch {}
          cleanupActiveTaskRuntime(taskId);
        }, 1_500);
        activeTurn.forceCloseTimer.unref?.();
      }
      return;
    }
    try {
      activeTurn.ws.close();
    } catch {}
  }
  cleanupActiveTaskRuntime(taskId);
}

function resolveCodexTaskForBridge(params: {
  userId: string;
  taskId?: unknown;
  workflowProjectId?: unknown;
  canvasSessionId?: unknown;
  projectId?: unknown;
}) {
  const requestedTaskId = String(params.taskId || "").trim();
  if (requestedTaskId) {
    const requestedTask = findTask(params.userId, requestedTaskId);
    const workflowProjectId = String(params.workflowProjectId || "").trim();
    const canvasSessionId = String(params.canvasSessionId || "").trim();
    const projectId = String(params.projectId || "").trim();
    if (
      requestedTask?.status === "running" &&
      (!workflowProjectId ||
        requestedTask.workflowProjectId === workflowProjectId) &&
      (!canvasSessionId || requestedTask.canvasSessionId === canvasSessionId) &&
      (!projectId || requestedTask.projectId === projectId)
    )
      return requestedTask;
  }
  const workflowProjectId = String(params.workflowProjectId || "").trim();
  const canvasSessionId = String(params.canvasSessionId || "").trim();
  const projectId = String(params.projectId || "").trim();
  return (
    tasksStore()
      .tasks.filter(
        (task) =>
          task.userId === params.userId &&
          task.status === "running" &&
          (!workflowProjectId ||
            task.workflowProjectId === workflowProjectId) &&
          (!canvasSessionId || task.canvasSessionId === canvasSessionId) &&
          (!projectId || task.projectId === projectId),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] || null
  );
}

function cleanupActiveTaskRuntime(taskId: string) {
  const active = activeAppTurns.get(taskId);
  if (active?.forceCloseTimer) clearTimeout(active.forceCloseTimer);
  activeAppTurns.delete(taskId);
  const task = tasksStore().tasks.find((item) => item.id === taskId);
  const appServer = task ? appServers.get(appServerKey(task.userId)) : null;
  if (appServer) touchAppServerState(appServer, true);
  for (const [approvalId, approval] of pendingApprovals) {
    if (approval.taskId === taskId) pendingApprovals.delete(approvalId);
  }
}

function activeAppTurnIsCurrent(taskId: string, runId: string) {
  return activeAppTurns.get(taskId)?.runId === runId;
}

function normalizeReasoningEffort(value: unknown) {
  const effort = String(value || "")
    .trim()
    .toLowerCase();
  if (effort === "xhigh") return "high";
  return ["minimal", "low", "medium", "high"].includes(effort) ? effort : "";
}

function normalizeSandbox(value: unknown) {
  const sandbox = String(value || "").trim();
  return ["read-only", "workspace-write", "danger-full-access"].includes(
    sandbox,
  )
    ? sandbox
    : "workspace-write";
}

function normalizeProjectSandbox(project: CodexProject, value: unknown) {
  const sandbox = normalizeSandbox(value);
  if (
    isProtectedApplicationProject(project) &&
    sandbox === "danger-full-access"
  )
    return "workspace-write";
  return sandbox;
}

function pushCodexConfigArgs(
  args: string[],
  options: { reasoningEffort?: string },
) {
  if (options.reasoningEffort) {
    args.push("-c", `model_reasoning_effort="${options.reasoningEffort}"`);
  }
}
void pushCodexConfigArgs;

function findProject(userId: string, projectId: string) {
  return projectsStore().projects.find(
    (project) => project.userId === userId && project.id === projectId,
  );
}

function codexProjectScopeError(
  project: CodexProject,
  clientScope: string,
  workflowProjectId: string,
) {
  const boundWorkflowProjectId = String(project.workflowProjectId || "").trim();
  if (boundWorkflowProjectId) {
    if (clientScope !== "workflow")
      return "workflow Codex project requires workflow scope";
    if (workflowProjectId !== boundWorkflowProjectId)
      return "workflow Codex project scope mismatch";
    return "";
  }
  if (clientScope === "workflow")
    return "workflow Codex project scope mismatch";
  return "";
}

function execGit(cwd: string, args: string[], timeout = 20_000) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile("git", args, { cwd, timeout }, (err, stdout, stderr) => {
      const out = String(stdout || "");
      const errorOut = String(stderr || "");
      if (err) {
        reject(new Error(errorOut.trim() || err.message));
        return;
      }
      resolve({ stdout: out, stderr: errorOut });
    });
  });
}

function execOptional(
  cwd: string,
  command: string,
  args: string[],
  timeout = 10_000,
) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(command, args, { cwd, timeout }, (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: String(stdout || ""),
          stderr: String(stderr || ""),
        });
      });
    },
  );
}

function execFileWithInput(
  cwd: string,
  command: string,
  args: string[],
  input: string,
  timeout = 30_000,
) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} timeout`));
    }, timeout);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(
            stderr.trim() || stdout.trim() || `${command} exited with ${code}`,
          ),
        );
    });
    child.stdin.end(input);
  });
}

function parseGitNumstat(text: string) {
  return String(text || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce(
      (acc, line) => {
        const [added, removed] = line.split(/\s+/);
        const addedNumber = Number(added);
        const removedNumber = Number(removed);
        return {
          added: acc.added + (Number.isFinite(addedNumber) ? addedNumber : 0),
          removed:
            acc.removed + (Number.isFinite(removedNumber) ? removedNumber : 0),
        };
      },
      { added: 0, removed: 0 },
    );
}

function parseGitBranches(text: string, currentBranch: string) {
  const seen = new Set<string>();
  const branches = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\*+\s*/, ""))
    .filter(Boolean)
    .filter((branch) => {
      if (seen.has(branch)) return false;
      seen.add(branch);
      return true;
    });
  if (currentBranch && !seen.has(currentBranch))
    branches.unshift(currentBranch);
  return branches;
}

function publicGitRemote(value: string) {
  const remote = String(value || "").trim();
  if (!remote) return "";
  const github = remote.match(/github\.com[:/]([^/\s]+\/[^/\s.]+)(?:\.git)?$/i);
  if (github) return github[1];
  return remote.replace(/^https?:\/\//, "").replace(/\.git$/, "");
}

function normalizeGitHubRepoUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (
    /^git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/i.test(raw)
  ) {
    return raw.endsWith(".git") ? raw : `${raw}.git`;
  }

  const shorthand = raw.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/);
  if (shorthand) return `https://github.com/${shorthand[1]}.git`;

  try {
    const url = new URL(raw);
    if (url.hostname.toLowerCase() !== "github.com") return "";
    const parts = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .replace(/\.git$/i, "")
      .split("/");
    if (parts.length < 2 || !parts[0] || !parts[1]) return "";
    return `https://github.com/${parts[0]}/${parts[1]}.git`;
  } catch {
    return "";
  }
}

function projectNameFromRepoUrl(value: string) {
  const label = publicGitRemote(value);
  const name = label.split("/").filter(Boolean).pop() || "";
  return name.replace(/\.git$/i, "") || "GitHub 项目";
}

async function projectGitStatus(project: CodexProject) {
  if (!fs.existsSync(project.path)) {
    throw new Error("project path not found");
  }

  try {
    const inside = await execGit(
      project.path,
      ["rev-parse", "--is-inside-work-tree"],
      8_000,
    );
    if (inside.stdout.trim() !== "true") {
      return { is_repo: false, message: "当前项目不是 Git 仓库" };
    }
  } catch {
    return { is_repo: false, message: "当前项目不是 Git 仓库" };
  }

  const [
    branchResult,
    branchesResult,
    rootResult,
    statusResult,
    unstagedResult,
    stagedResult,
    remoteResult,
    ghResult,
  ] = await Promise.all([
    execGit(project.path, ["branch", "--show-current"], 8_000).catch(() => ({
      stdout: "",
      stderr: "",
    })),
    execGit(project.path, ["branch", "--format=%(refname:short)"], 8_000).catch(
      () => ({ stdout: "", stderr: "" }),
    ),
    execGit(project.path, ["rev-parse", "--show-toplevel"], 8_000).catch(
      () => ({ stdout: project.path, stderr: "" }),
    ),
    execGit(project.path, ["status", "--porcelain=v1"], 10_000),
    execGit(project.path, ["diff", "--numstat"], 15_000).catch(() => ({
      stdout: "",
      stderr: "",
    })),
    execGit(project.path, ["diff", "--cached", "--numstat"], 15_000).catch(
      () => ({ stdout: "", stderr: "" }),
    ),
    execGit(project.path, ["remote", "get-url", "origin"], 8_000).catch(() => ({
      stdout: "",
      stderr: "",
    })),
    execOptional(project.path, "gh", ["auth", "status"], 8_000),
  ]);

  let branch = branchResult.stdout.trim();
  if (!branch) {
    const head = await execGit(
      project.path,
      ["rev-parse", "--short", "HEAD"],
      8_000,
    ).catch(() => ({ stdout: "", stderr: "" }));
    branch = head.stdout.trim() ? `HEAD ${head.stdout.trim()}` : "无分支";
  }

  const unstaged = parseGitNumstat(unstagedResult.stdout);
  const staged = parseGitNumstat(stagedResult.stdout);
  const statusLines = statusResult.stdout.split(/\r?\n/).filter(Boolean);
  const remote = remoteResult.stdout.trim();
  const ghOutput = `${ghResult.stdout}\n${ghResult.stderr}`.trim();
  const githubAuthenticated =
    ghResult.ok && /Logged in|Token scopes|github\.com/i.test(ghOutput);

  return {
    is_repo: true,
    local: true,
    branch,
    branches: parseGitBranches(branchesResult.stdout, branch),
    root: rootResult.stdout.trim() || project.path,
    remote,
    remote_label: publicGitRemote(remote),
    changed_files: statusLines.length,
    additions: unstaged.added + staged.added,
    deletions: unstaged.removed + staged.removed,
    github_authenticated: githubAuthenticated,
    github_status: ghResult.ok
      ? githubAuthenticated
        ? "GitHub CLI 已登录"
        : "GitHub CLI 未确认登录"
      : "GitHub CLI 未登录或未安装",
    status: statusLines.map((line) => ({
      code: line.slice(0, 2).trim(),
      path: line.slice(3).trim(),
    })),
  };
}

function findTask(userId: string, taskId: string) {
  return tasksStore().tasks.find(
    (task) => task.userId === userId && task.id === taskId,
  );
}

function appendTerminalOutput(
  session: TerminalSession,
  stream: TerminalSession["output"][number]["stream"],
  text: string,
) {
  const boundedText = String(text || "").slice(-64 * 1024);
  const bytes = Buffer.byteLength(boundedText);
  session.outputSeq += 1;
  session.output.push({
    seq: session.outputSeq,
    ts: now(),
    stream,
    text: boundedText,
  });
  session.outputBytes += bytes;
  while (
    session.output.length > codexRuntimeLimits.terminalOutputMaxEntries ||
    session.outputBytes > codexRuntimeLimits.terminalOutputMaxBytes
  ) {
    const removed = session.output.shift();
    if (!removed) break;
    session.outputBytes = Math.max(
      0,
      session.outputBytes - Buffer.byteLength(removed.text),
    );
  }
  session.updatedAt = now();
}

function publicTerminalSession(session: TerminalSession, afterSeq = 0) {
  const alive = !session.closedAt;
  return {
    id: session.id,
    project_id: session.projectId,
    project_name: session.projectName,
    project_path: session.projectPath,
    cwd: session.projectPath,
    running: alive,
    pid: session.terminal.pid,
    output_seq: session.outputSeq,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    closed_at: session.closedAt || "",
    output: session.output.filter((item) => item.seq > afterSeq),
  };
}

function findTerminalSession(userId: string, sessionId: string) {
  const session = terminalSessions.get(sessionId);
  return session && session.userId === userId ? session : null;
}

function terminalShell() {
  if (process.platform === "win32") return { command: "cmd.exe", args: [] };
  const candidates = [
    String(process.env.SHELL || ""),
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ].filter(Boolean);
  const command =
    candidates.find((candidate) => {
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }) || "/bin/sh";
  return { command, args: ["-l"] };
}

function getPtyModule() {
  if (ptyModule !== undefined) return ptyModule;
  try {
    ptyModule = require("node-pty");
    return ptyModule;
  } catch (err: any) {
    ptyModule = null;
    throw new Error(`终端模块不可用：${err?.message || "node-pty 加载失败"}`);
  }
}

function createTerminalSession(userId: string, project: CodexProject) {
  const shell = terminalShell();
  const pty = getPtyModule();
  if (!pty) throw new Error("终端模块不可用：node-pty 加载失败");
  const cwd = terminalExecutionPath(project);
  let terminal: PtyProcess;
  try {
    terminal = pty.spawn(shell.command, shell.args, {
      name: "xterm-256color",
      cols: 100,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        SHELL: shell.command,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
      },
    });
  } catch (err: any) {
    throw new Error(
      `终端启动失败：${err?.message || "PTY 启动失败"}，shell=${shell.command}`,
    );
  }
  const ts = now();
  const session: TerminalSession = {
    id: `terminal_${randomUUID()}`,
    userId,
    projectId: project.id,
    projectName: project.name,
    projectPath: cwd,
    terminal,
    outputSeq: 0,
    outputBytes: 0,
    output: [],
    createdAt: ts,
    updatedAt: ts,
  };
  terminalSessions.set(session.id, session);
  terminal.onData((data) => appendTerminalOutput(session, "stdout", data));
  terminal.onExit(({ exitCode, signal }) => {
    session.closedAt = now();
    appendTerminalOutput(
      session,
      "system",
      `\r\n终端已退出：code=${exitCode ?? "null"} signal=${signal ?? "null"}\r\n`,
    );
  });
  return session;
}

function userThreadIds(userId: string) {
  return new Set(
    tasksStore()
      .tasks.filter((task) => task.userId === userId && task.threadId)
      .map((task) => task.threadId as string),
  );
}

function publicThreadTask(task: CodexTask) {
  return {
    task_id: task.id,
    thread_id: task.threadId,
    project_id: task.projectId,
    project_name: task.projectName,
    prompt: task.prompt,
    status: task.status,
    runtime: task.runtime,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

function threadItemId(item: any) {
  return String(
    item?.id || item?.threadId || item?.thread_id || item?.thread?.id || "",
  );
}

function filterNativeThreads(result: any, allowed: Set<string>) {
  if (Array.isArray(result))
    return result.filter((item) => allowed.has(threadItemId(item)));
  if (Array.isArray(result?.threads)) {
    return {
      ...result,
      threads: result.threads.filter((item: any) =>
        allowed.has(threadItemId(item)),
      ),
    };
  }
  if (Array.isArray(result?.items)) {
    return {
      ...result,
      items: result.items.filter((item: any) =>
        allowed.has(threadItemId(item)),
      ),
    };
  }
  if (Array.isArray(result?.data)) {
    return {
      ...result,
      data: result.data.filter((item: any) => allowed.has(threadItemId(item))),
    };
  }
  return null;
}

function projectContainsFile(projectPath: string, filePath: string) {
  const resolvedProject = path.resolve(projectPath);
  const resolvedFile = path.resolve(filePath);
  return (
    resolvedFile === resolvedProject ||
    resolvedFile.startsWith(`${resolvedProject}${path.sep}`)
  );
}

function isProtectedApplicationProjectPath(projectPath: string) {
  return path.resolve(projectPath) === path.resolve(PROJECT_ROOT);
}

function isProtectedApplicationProject(project: Pick<CodexProject, "path">) {
  return isProtectedApplicationProjectPath(project.path);
}

function taskUsesProtectedProject(task: CodexTask) {
  return isProtectedApplicationProjectPath(task.projectPath);
}

function taskExecutionPath(task: CodexTask) {
  if (!taskUsesProtectedProject(task)) return task.projectPath;
  const cwd = codexRuntimeTaskWorkspaceDir(
    task.userId,
    task.projectId,
    task.id,
  );
  fs.mkdirSync(cwd, { recursive: true });
  return cwd;
}

function terminalExecutionPath(project: CodexProject) {
  if (!isProtectedApplicationProject(project)) return project.path;
  const cwd = codexRuntimeTerminalDir(project.userId, project.id);
  fs.mkdirSync(cwd, { recursive: true });
  return cwd;
}

function runtimeProjectRoot(project: CodexProject) {
  return codexRuntimeProjectRoot(project.userId, project.id);
}

function resolveRuntimeProjectFilePath(
  project: CodexProject,
  requestedPath: string,
) {
  const root = path.resolve(runtimeProjectRoot(project));
  const raw = String(requestedPath || "").trim();
  if (!raw) return null;
  const target = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(root, raw);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  return target;
}

function relativeRuntimeProjectPath(project: CodexProject, filePath: string) {
  return path
    .relative(runtimeProjectRoot(project), filePath)
    .split(path.sep)
    .join("/");
}

function contentTypeForFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    (
      {
        ".avif": "image/avif",
        ".bmp": "image/bmp",
        ".css": "text/css; charset=utf-8",
        ".gif": "image/gif",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
        ".3g2": "video/3gpp2",
        ".3gp": "video/3gpp",
        ".avi": "video/x-msvideo",
        ".flv": "video/x-flv",
        ".m4v": "video/x-m4v",
        ".mkv": "video/x-matroska",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".m2ts": "video/mp2t",
        ".mpeg": "video/mpeg",
        ".mpg": "video/mpeg",
        ".mts": "video/mp2t",
        ".ogv": "video/ogg",
        ".vob": "video/dvd",
        ".webm": "video/webm",
        ".wmv": "video/x-ms-wmv",
        ".aac": "audio/aac",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
        ".wma": "audio/x-ms-wma",
      } as Record<string, string>
    )[ext] || "application/octet-stream"
  );
}

function isPreviewableFilePath(filePath: string) {
  const type = contentTypeForFile(filePath);
  if (
    type.startsWith("image/") ||
    type.startsWith("video/") ||
    type.startsWith("audio/")
  )
    return true;
  return new Set([
    ".csv",
    ".doc",
    ".docx",
    ".key",
    ".md",
    ".mdx",
    ".odp",
    ".ods",
    ".odt",
    ".pdf",
    ".ppt",
    ".pptx",
    ".rtf",
    ".tsv",
    ".txt",
    ".xls",
    ".xlsm",
    ".xlsx",
  ]).has(path.extname(filePath).toLowerCase());
}

function isAllowedTempPreviewPath(filePath: string) {
  const target = path.resolve(filePath);
  const tempRoots = [os.tmpdir(), "/tmp", "/private/tmp"].map((item) =>
    path.resolve(item),
  );
  return (
    tempRoots.some((root) => pathContains(root, target)) &&
    isPreviewableFilePath(target)
  );
}

function resolveProjectFilePath(
  project: CodexProject,
  requestedPath: string,
  options: { allowTempPreview?: boolean } = {},
) {
  const root = path.resolve(project.path);
  const raw = String(requestedPath || "").trim();
  if (!raw) return null;
  const target = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(root, raw);
  if (options.allowTempPreview && isAllowedTempPreviewPath(target))
    return target;
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  return target;
}

function detectLanguage(filePath: string) {
  const ext = path.extname(filePath).toLowerCase().replace(/^\./, "");
  const map: Record<string, string> = {
    cjs: "javascript",
    css: "css",
    html: "html",
    js: "javascript",
    json: "json",
    jsx: "javascript",
    md: "markdown",
    mjs: "javascript",
    py: "python",
    ts: "typescript",
    tsx: "typescript",
    vue: "vue",
    yaml: "yaml",
    yml: "yaml",
  };
  return map[ext] || ext || "text";
}

function pathContains(parentPath: string, childPath: string) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

function realPath(value: string) {
  return fs.realpathSync(path.resolve(value));
}

function requestHostname(c: any) {
  try {
    return new URL(c.req.url).hostname.toLowerCase();
  } catch {
    const host = String(c.req.header("host") || "")
      .trim()
      .toLowerCase();
    if (host.startsWith("[")) {
      const end = host.indexOf("]");
      return end > 0 ? host.slice(1, end) : host;
    }
    return host.split(":")[0];
  }
}

function isLocalProjectAccessAllowed(c: any) {
  const explicit = String(
    process.env.CODEX_ENABLE_LOCAL_PROJECTS || "",
  ).toLowerCase();
  if (["1", "true", "yes", "on"].includes(explicit)) return true;
  const host = requestHostname(c);
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost")
  );
}

function localProjectPathError(
  userId: string,
  requestedPath: string,
  store = projectsStore(),
) {
  if (!requestedPath) return "local project path required";
  const resolvedPath = path.resolve(requestedPath);
  if (!fs.existsSync(resolvedPath)) return "local project path not found";
  if (!fs.statSync(resolvedPath).isDirectory())
    return "local project path must be a directory";

  const projectPath = realPath(resolvedPath);
  const roots = localDirectoryRoots();
  if (!roots.some((root) => pathContains(root, projectPath))) {
    return "local project path is outside the allowed local roots";
  }
  const appRoot = realPath(path.resolve(process.cwd(), ".."));
  if (
    pathContains(appRoot, projectPath) ||
    pathContains(projectPath, appRoot)
  ) {
    return "cannot bind the 造梦 application directory";
  }
  if (
    store.projects.some((project) => {
      if (project.userId !== userId) return false;
      try {
        return realPath(project.path) === projectPath;
      } catch {
        return path.resolve(project.path) === projectPath;
      }
    })
  ) {
    return "local project path already added";
  }
  return "";
}

function localDirectoryRoots() {
  const configured = String(process.env.CODEX_LOCAL_PROJECT_ROOTS || "")
    .split(/[,:]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const candidates = configured.length
    ? configured
    : [os.homedir(), "/private/tmp", "/Volumes"].filter(Boolean);
  return [...new Set(candidates)]
    .filter((item) => fs.existsSync(item))
    .map((item) => realPath(item));
}

function pickMacDirectory() {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "osascript",
      [
        "-e",
        'POSIX path of (choose folder with prompt "选择要导入 Codex 的本地项目文件夹")',
      ],
      { timeout: 120_000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message));
          return;
        }
        resolve(String(stdout || "").trim());
      },
    );
  });
}

const IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".avif",
  ".bmp",
]);

function normalizeProjectAttachmentPaths(
  project: CodexProject,
  value: unknown,
) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const paths: string[] = [];
  const runtimeRoot = runtimeProjectRoot(project);
  for (const raw of value) {
    const item = String(raw || "").trim();
    if (!item) continue;
    const candidates = [
      path.resolve(path.isAbsolute(item) ? item : path.join(runtimeRoot, item)),
      path.resolve(
        path.isAbsolute(item) ? item : path.join(project.path, item),
      ),
    ];
    const target = candidates.find((candidate) => {
      if (!fs.existsSync(candidate)) return false;
      return (
        projectContainsFile(runtimeRoot, candidate) ||
        projectContainsFile(project.path, candidate)
      );
    });
    if (!target || seen.has(target)) continue;
    seen.add(target);
    paths.push(target);
    if (paths.length >= 8) break;
  }
  return paths;
}

function normalizeImagePaths(project: CodexProject, value: unknown) {
  return normalizeProjectAttachmentPaths(project, value).filter((item) =>
    IMAGE_ATTACHMENT_EXTENSIONS.has(path.extname(item).toLowerCase()),
  );
}

function normalizeAttachmentPaths(project: CodexProject, value: unknown) {
  if (!Array.isArray(value)) return [];
  return normalizeProjectAttachmentPaths(project, value)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function resolveSelectedContext(
  userId: string,
  value: unknown,
): CodexSelectedContext | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const name = String(input.name || "").trim();
  const rawType = String(input.type || "").trim();
  const type: CodexSelectedContext["type"] =
    rawType === "skill" ? "skill" : rawType === "plugin" ? "plugin" : "mention";
  if (!name) return null;

  if (type === "skill") {
    const requestedPath = String(input.path || "").trim();
    const skill = listUserSkills(userId).find((item) => {
      return (
        item.name === name ||
        item.id === input.id ||
        (requestedPath &&
          path.resolve(item.path) === path.resolve(requestedPath))
      );
    });
    if (!skill || !fs.existsSync(path.join(skill.path, "SKILL.md")))
      return null;
    return {
      id: String(input.id || skill.id || name),
      name: skill.name,
      type: "skill",
      path: path.join(skill.path, "SKILL.md"),
    };
  }

  const requestedPath = String(input.path || "").trim();
  const plugin = listUserPlugins(userId).find((item) => {
    return (
      item.name === name ||
      item.id === input.id ||
      (requestedPath && path.resolve(item.path) === path.resolve(requestedPath))
    );
  });
  const pluginName = plugin?.name || name;
  return {
    id: String(input.id || plugin?.id || pluginName),
    name: pluginName,
    type,
    path:
      requestedPath.startsWith("plugin://") ||
      requestedPath.startsWith("app://")
        ? requestedPath
        : `plugin://${pluginName}`,
  };
}

function pushImageArgs(args: string[], images: string[]) {
  images.forEach((imagePath) => args.push("--image", imagePath));
}
void pushImageArgs;

function pushPromptArg(args: string[], prompt: string) {
  args.push("--", prompt);
}
void pushPromptArg;

function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start = 5791) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("no free app-server port");
}

async function cowartCanvasResponds(port: number) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!response.ok) return false;
    const text = await response.text();
    return /Cowart Canvas|\/src\/main\.jsx|cowart/i.test(text);
  } catch {
    return false;
  }
}

async function waitForCowartCanvas(
  port: number,
  child: ChildProcessWithoutNullStreams,
  logs: string[],
) {
  const started = Date.now();
  while (Date.now() - started < 18_000) {
    if (child.exitCode !== null || child.killed) {
      throw new Error(`Cowart 画布服务启动失败。\n${logs.slice(-30).join("")}`);
    }
    if (await cowartCanvasResponds(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Cowart 画布服务启动超时。\n${logs.slice(-30).join("")}`);
}

async function ensureCowartCanvasServer(
  plugin: UserPluginSummary,
  project: CodexProject,
) {
  const key = `${project.userId}:${project.id}`;
  const cached = cowartCanvasServers.get(key);
  if (
    cached &&
    cached.projectPath === project.path &&
    (!cached.child || cached.child.exitCode === null)
  ) {
    if (await cowartCanvasResponds(cached.port)) {
      cached.lastUsedAt = Date.now();
      return cached;
    }
  }

  const startScript = path.join(plugin.path, "scripts", "start-canvas.sh");
  if (!fs.existsSync(startScript))
    throw new Error("Cowart 插件缺少 scripts/start-canvas.sh");

  let port = COWART_DEFAULT_PORT;
  if (await cowartCanvasResponds(port)) {
    const server = {
      port,
      projectPath: project.path,
      url: `http://127.0.0.1:${port}/`,
      lastUsedAt: Date.now(),
    };
    cowartCanvasServers.set(key, server);
    return server;
  }
  if (!(await isPortAvailable(port))) {
    port = await findFreePort(COWART_DEFAULT_PORT + 1);
  }

  const logs: string[] = [];
  const child = spawn("bash", [startScript, project.path], {
    cwd: plugin.path,
    env: {
      ...process.env,
      PATH: `${SYSTEM_BIN_PATH}:${process.env.PATH || ""}`,
      COWART_PORT: String(port),
      COWART_PROJECT_DIR: project.path,
      COWART_CANVAS_DIR: path.join(project.path, "canvas"),
      BROWSER: "none",
    },
  });
  child.stdout.on("data", (chunk) => {
    logs.push(String(chunk));
    if (logs.length > 80) logs.shift();
  });
  child.stderr.on("data", (chunk) => {
    logs.push(String(chunk));
    if (logs.length > 80) logs.shift();
  });
  child.once("exit", () => {
    const current = cowartCanvasServers.get(key);
    if (current?.child === child) cowartCanvasServers.delete(key);
  });
  child.unref();
  await waitForCowartCanvas(port, child, logs);

  const server = {
    child,
    port,
    projectPath: project.path,
    url: `http://127.0.0.1:${port}/`,
    lastUsedAt: Date.now(),
  };
  cowartCanvasServers.set(key, server);
  return server;
}

function appServerKey(userId: string) {
  return safeSegment(userId, "user");
}

function userAppServerHome(userId: string) {
  return path.join(APP_SERVER_HOMES_ROOT, appServerKey(userId));
}

function userAppServerTokenPath(userId: string) {
  return path.join(APP_SERVER_TOKENS_ROOT, `${appServerKey(userId)}.token`);
}

function userAppServerTokenUserPath(userId: string) {
  return path.join(APP_SERVER_TOKENS_ROOT, `${appServerKey(userId)}.user`);
}

function userAppServerStatePath(userId: string) {
  return path.join(
    APP_SERVER_TOKENS_ROOT,
    `${appServerKey(userId)}.server.json`,
  );
}

function readPersistedAppServerState(
  userId: string,
): PersistedAppServerState | null {
  try {
    const statePath = userAppServerStatePath(userId);
    if (!fs.existsSync(statePath)) return null;
    const value = JSON.parse(
      fs.readFileSync(statePath, "utf8"),
    ) as Partial<PersistedAppServerState>;
    const pid = Number(value.pid || 0);
    const url = String(value.url || "").trim();
    const token = String(value.token || "").trim();
    const configSignature = String(value.configSignature || "");
    const fallbackLastUsedAt = fs.statSync(statePath).mtimeMs;
    const lastUsedAt = Number(
      value.lastUsedAt || fallbackLastUsedAt || Date.now(),
    );
    return pid > 0 && url && token && configSignature
      ? {
          pid,
          url,
          token,
          configSignature,
          lastUsedAt: Number.isFinite(lastUsedAt) ? lastUsedAt : Date.now(),
        }
      : null;
  } catch {
    return null;
  }
}

function writePersistedAppServerState(
  userId: string,
  state: PersistedAppServerState,
) {
  fs.writeFileSync(userAppServerStatePath(userId), JSON.stringify(state), {
    mode: 0o600,
  });
}

function removePersistedAppServerState(userId: string, expectedPid?: number) {
  const statePath = userAppServerStatePath(userId);
  if (!fs.existsSync(statePath)) return;
  if (expectedPid) {
    const persisted = readPersistedAppServerState(userId);
    if (persisted?.pid && persisted.pid !== expectedPid) return;
  }
  try {
    fs.unlinkSync(statePath);
  } catch {}
}

function processIsAlive(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processCommandLine(pid: number) {
  if (!processIsAlive(pid)) return "";
  if (process.platform === "linux") {
    try {
      return fs
        .readFileSync(`/proc/${pid}/cmdline`, "utf8")
        .replaceAll("\0", " ")
        .trim();
    } catch {}
  }
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 1_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function processRssBytes(pid: number) {
  if (!processIsAlive(pid)) return 0;
  if (process.platform === "linux") {
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
      if (match) return Number(match[1]) * 1024;
    } catch {}
  }
  try {
    const kib = Number(
      execFileSync("ps", ["-p", String(pid), "-o", "rss="], {
        encoding: "utf8",
        timeout: 1_000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
    return Number.isFinite(kib) ? kib * 1024 : 0;
  } catch {
    return 0;
  }
}

function processTreeRssBytesByRoot(rootPids: number[]) {
  const roots = [
    ...new Set(rootPids.filter((pid) => pid > 0 && processIsAlive(pid))),
  ];
  const totals = new Map<number, number>();
  if (roots.length === 0) return totals;
  try {
    const output = execFileSync("ps", ["-axo", "pid=,ppid=,rss="], {
      encoding: "utf8",
      timeout: 1_500,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const rows = output
      .split(/\r?\n/)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
        return match
          ? {
              pid: Number(match[1]),
              parentPid: Number(match[2]),
              rssBytes: Number(match[3]) * 1024,
            }
          : null;
      })
      .filter(
        (row): row is { pid: number; parentPid: number; rssBytes: number } =>
          Boolean(row),
      );
    const children = new Map<number, number[]>();
    const rssByPid = new Map<number, number>();
    for (const row of rows) {
      rssByPid.set(row.pid, row.rssBytes);
      const siblings = children.get(row.parentPid) || [];
      siblings.push(row.pid);
      children.set(row.parentPid, siblings);
    }
    for (const rootPid of roots) {
      const pending = [rootPid];
      const visited = new Set<number>();
      let total = 0;
      while (pending.length > 0) {
        const pid = pending.pop()!;
        if (visited.has(pid)) continue;
        visited.add(pid);
        total += rssByPid.get(pid) || 0;
        pending.push(...(children.get(pid) || []));
      }
      totals.set(rootPid, total || processRssBytes(rootPid));
    }
  } catch {
    for (const rootPid of roots) totals.set(rootPid, processRssBytes(rootPid));
  }
  return totals;
}

function isOwnedAppServerProcess(
  pid: number,
  userId: string,
  expectedUrl: string,
) {
  return commandLineMatchesCodexAppServer(
    processCommandLine(pid),
    expectedUrl,
    userAppServerTokenPath(userId),
  );
}

function readUserAppServerToken(userId: string) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return "";
  try {
    const tokenPath = userAppServerTokenPath(normalizedUserId);
    if (!fs.existsSync(tokenPath)) return "";
    return fs.readFileSync(tokenPath, "utf8").trim();
  } catch {
    return "";
  }
}

export function resolveCodexInternalUserIdFromToken(token: string) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return "";
  ensureDirs();
  if (!fs.existsSync(APP_SERVER_TOKENS_ROOT)) return "";
  for (const entry of fs.readdirSync(APP_SERVER_TOKENS_ROOT, {
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith(".token")) continue;
    const tokenPath = path.join(APP_SERVER_TOKENS_ROOT, entry.name);
    try {
      const storedToken = fs.readFileSync(tokenPath, "utf8").trim();
      if (storedToken && storedToken === normalizedToken) {
        const userPath = path.join(
          APP_SERVER_TOKENS_ROOT,
          entry.name.replace(/\.token$/, ".user"),
        );
        if (fs.existsSync(userPath)) {
          const mappedUserId = fs.readFileSync(userPath, "utf8").trim();
          if (mappedUserId) return mappedUserId;
        }
        return entry.name.replace(/\.token$/, "");
      }
    } catch {}
  }
  return "";
}

function userSkillsPath(userId: string) {
  return path.join(userAppServerHome(userId), "skills");
}

function userPluginsPath(userId: string) {
  return path.join(userAppServerHome(userId), "plugins");
}

function userMarketplacePath(userId: string) {
  return path.join(
    userAppServerHome(userId),
    ".agents",
    "plugins",
    "marketplace.json",
  );
}

function codexProviderKey(config: CodexUserConfig) {
  return normalizeProvider(
    config.provider || inferProviderFromBaseUrl(config.baseUrl || ""),
  );
}

function codexProviderEnvKey(config: CodexUserConfig) {
  const provider = codexProviderKey(config);
  if (provider === "zenmux") return "ZENMUX_API_KEY";
  if (provider === "openai") return "OPENAI_API_KEY";
  return "CODEX_API_KEY";
}

function appServerConfigSignature(config: CodexUserConfig) {
  const platformTokenHash = createHash("sha256")
    .update(String(process.env.CODEX_PLATFORM_TOKEN || ""))
    .digest("hex");
  return JSON.stringify({
    provider: codexProviderKey(config),
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: normalizeConfigModel(config.model),
    platformMediaSkillVersion: "2026-07-31-compact-canvas-v3",
    platformMediaBaseUrl: platformMediaBaseUrl(),
    platformTokenHash,
    projectGlobalSkillsVersion: PROJECT_GLOBAL_SKILLS_VERSION,
    autoCompactTokenLimit: CODEX_AUTO_COMPACT_TOKEN_LIMIT,
  });
}

function tomlString(value: string) {
  return JSON.stringify(String(value || ""));
}

function preservedProjectConfig(home: string) {
  const configPath = path.join(home, "config.toml");
  if (!fs.existsSync(configPath)) return "";
  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*\[projects\./.test(line));
  return start >= 0 ? lines.slice(start).join("\n").trim() : "";
}

function writeCodexUserConfig(userId: string, config: CodexUserConfig) {
  const home = userAppServerHome(userId);
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(userSkillsPath(userId), { recursive: true });
  fs.mkdirSync(userPluginsPath(userId), { recursive: true });
  fs.mkdirSync(path.dirname(userMarketplacePath(userId)), { recursive: true });
  ensureBuiltInSkills(userId);
  const provider = codexProviderKey(config);
  const envKey = codexProviderEnvKey(config);
  const preservedProjects = preservedProjectConfig(home);
  const providerName =
    provider === "zenmux"
      ? "ZenMux"
      : provider === "openai"
        ? "OpenAI"
        : provider === "openrouter"
          ? "OpenRouter"
          : provider === "aihubmix"
            ? "AiHubMix"
            : provider === "agnes"
              ? "Agnes"
              : "Custom";
  const content = [
    `model_provider = ${tomlString(provider)}`,
    `model = ${tomlString(normalizeConfigModel(config.model) || "openai/gpt-5.6-sol")}`,
    `model_auto_compact_token_limit = ${CODEX_AUTO_COMPACT_TOKEN_LIMIT}`,
    'model_auto_compact_token_limit_scope = "total"',
    "",
    `[model_providers.${provider}]`,
    `name = ${tomlString(providerName)}`,
    `base_url = ${tomlString(normalizeBaseUrl(config.baseUrl))}`,
    `env_key = ${tomlString(envKey)}`,
    'wire_api = "responses"',
    preservedProjects ? `\n${preservedProjects}` : "",
    "",
  ]
    .filter((item) => item !== "")
    .join("\n");
  fs.writeFileSync(path.join(home, "config.toml"), content, { mode: 0o600 });
}

function readFrontmatterValue(content: string, key: string) {
  const line = content
    .split(/\r?\n/)
    .find((item) =>
      item.trim().toLowerCase().startsWith(`${key.toLowerCase()}:`),
    );
  if (!line) return "";
  return line
    .replace(new RegExp(`^\\s*${key}\\s*:`, "i"), "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function readSkillMeta(skillDir: string) {
  const skillPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillPath))
    return { name: path.basename(skillDir), description: "" };
  const content = fs.readFileSync(skillPath, "utf8");
  const lines = content.split(/\r?\n/);
  const description =
    readFrontmatterValue(content, "description") ||
    lines
      .find(
        (line) =>
          line.trim() && !line.trim().startsWith("#") && line.trim() !== "---",
      )
      ?.trim() ||
    "";
  return {
    name: readFrontmatterValue(content, "name") || path.basename(skillDir),
    description,
  };
}

function syncSkillDirectory(
  sourceDir: string,
  targetDir: string,
  options: { linkDirectories?: boolean } = {},
) {
  fs.mkdirSync(targetDir, { recursive: true });

  const sourceEntries = fs.readdirSync(sourceDir);
  const sourceEntrySet = new Set(sourceEntries);
  for (const targetEntry of fs.readdirSync(targetDir)) {
    if (!sourceEntrySet.has(targetEntry)) {
      fs.rmSync(path.join(targetDir, targetEntry), {
        recursive: true,
        force: true,
      });
    }
  }

  for (const entry of sourceEntries) {
    const sourcePath = path.join(sourceDir, entry);
    const targetPath = path.join(targetDir, entry);
    const sourceStat = fs.lstatSync(sourcePath);

    if (sourceStat.isDirectory()) {
      if (options.linkDirectories) {
        let linkedToSource = false;
        try {
          linkedToSource =
            fs.lstatSync(targetPath).isSymbolicLink() &&
            fs.realpathSync(targetPath) === fs.realpathSync(sourcePath);
        } catch {}
        if (!linkedToSource) {
          fs.rmSync(targetPath, { recursive: true, force: true });
          fs.symlinkSync(sourcePath, targetPath, "dir");
        }
      } else {
        try {
          const targetStat = fs.lstatSync(targetPath);
          if (!targetStat.isDirectory() || targetStat.isSymbolicLink()) {
            fs.rmSync(targetPath, { recursive: true, force: true });
          }
        } catch {}
        syncSkillDirectory(sourcePath, targetPath, options);
      }
      continue;
    }

    if (!sourceStat.isFile()) continue;
    try {
      const targetStat = fs.lstatSync(targetPath);
      if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      }
    } catch {}
    fs.copyFileSync(sourcePath, targetPath);
    fs.chmodSync(targetPath, sourceStat.mode & 0o777);
  }
}

function ensureProjectGlobalSkill(userId: string, skillId: string) {
  const sourceDir = path.join(PROJECT_GLOBAL_SKILLS_ROOT, skillId);
  if (!fs.existsSync(path.join(sourceDir, "SKILL.md"))) return;

  syncSkillDirectory(sourceDir, path.join(userSkillsPath(userId), skillId));
}

function ensureBuiltInSkills(userId: string) {
  const skillCreatorDir = path.join(
    userSkillsPath(userId),
    ".system",
    "skill-creator",
  );
  const skillCreatorPath = path.join(skillCreatorDir, "SKILL.md");
  if (!fs.existsSync(skillCreatorPath)) {
    fs.mkdirSync(skillCreatorDir, { recursive: true });
    fs.writeFileSync(
      skillCreatorPath,
      [
        "---",
        "name: Skill Creator",
        "description: Create or install Codex skills only for the current 造梦 user.",
        "---",
        "",
        "You help create, update, and install Codex skills for the current 造梦 user only.",
        "Install skills under this isolated CODEX_HOME skills directory. Do not write to global ~/.codex/skills.",
        "When the user gives a GitHub repository, inspect it and install the requested skill into the current user skills directory.",
        "When the user describes a new capability, create a focused SKILL.md with clear trigger rules and workflow instructions.",
        "",
      ].join("\n"),
    );
  }
  const legacySkillCreatorExtensionStart =
    "<!-- ideart-skill-creator-extension:start -->";
  const legacySkillCreatorExtensionEnd =
    "<!-- ideart-skill-creator-extension:end -->";
  const skillCreatorExtensionStart =
    "<!-- zaomeng-skill-creator-extension:start -->";
  const skillCreatorExtensionEnd =
    "<!-- zaomeng-skill-creator-extension:end -->";
  const skillCreatorExtension = [
    skillCreatorExtensionStart,
    "",
    "## 造梦 personal Skill workflow",
    "",
    "- Create or update the requested Skill only under `$CODEX_HOME/skills/<skill-id>` for the current 造梦 user. Never write it into `.system` or a machine-global Skill directory.",
    "- Clarify the problem, trigger scenarios, inputs, outputs, execution steps, and quality checks before finalizing the Skill.",
    "- After validating `SKILL.md`, create one professional square cover image that visually represents the Skill description. Use the built-in `platform-media` Skill, request no text, letters, logo, interface, or watermark, download the result, and save it as `$CODEX_HOME/skills/<skill-id>/cover.png`.",
    "- Treat the cover as part of completion. If generation fails, retry once and report the unresolved cover failure explicitly instead of substituting an unrelated stock image.",
    "",
    skillCreatorExtensionEnd,
  ].join("\n");
  const skillCreatorSource = fs.readFileSync(skillCreatorPath, "utf8");
  const brandedSkillCreatorSource = skillCreatorSource.replaceAll(
    "Ideart",
    "造梦",
  );
  const skillCreatorExtensionPattern = new RegExp(
    `(?:${legacySkillCreatorExtensionStart}[\\s\\S]*?${legacySkillCreatorExtensionEnd}|${skillCreatorExtensionStart}[\\s\\S]*?${skillCreatorExtensionEnd})`,
    "g",
  );
  const hasSkillCreatorExtension =
    brandedSkillCreatorSource.includes(skillCreatorExtensionStart) ||
    brandedSkillCreatorSource.includes(legacySkillCreatorExtensionStart);
  const nextSkillCreatorSource = hasSkillCreatorExtension
    ? brandedSkillCreatorSource.replace(
        skillCreatorExtensionPattern,
        skillCreatorExtension,
      )
    : `${brandedSkillCreatorSource.trimEnd()}\n\n${skillCreatorExtension}\n`;
  if (nextSkillCreatorSource !== skillCreatorSource) {
    fs.writeFileSync(skillCreatorPath, nextSkillCreatorSource);
  }

  const legacyAgnesSkillDir = path.join(
    userSkillsPath(userId),
    ".system",
    "agnes-media",
  );
  if (fs.existsSync(legacyAgnesSkillDir)) {
    fs.rmSync(legacyAgnesSkillDir, { recursive: true, force: true });
  }

  const platformMediaSourceDir = path.join(
    PROJECT_GLOBAL_SKILLS_ROOT,
    "platform-media",
  );
  const platformMediaSkillDir = path.join(
    userSkillsPath(userId),
    ".system",
    "platform-media",
  );
  if (fs.existsSync(path.join(platformMediaSourceDir, "SKILL.md"))) {
    syncSkillDirectory(platformMediaSourceDir, platformMediaSkillDir);
  } else {
    console.warn(
      "[codex] platform-media project skill source is missing:",
      platformMediaSourceDir,
    );
  }

  for (const skillId of PROJECT_GLOBAL_SKILL_IDS) {
    ensureProjectGlobalSkill(userId, skillId);
  }

  const userYtDlpConfig = path.join(
    userAppServerHome(userId),
    ".config",
    "yt-dlp",
    "config",
  );
  fs.mkdirSync(path.dirname(userYtDlpConfig), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(userYtDlpConfig)) {
    fs.writeFileSync(userYtDlpConfig, "--js-runtimes node\n", { mode: 0o600 });
  }

  const userMcporterConfig = path.join(
    userAppServerHome(userId),
    ".mcporter",
    "mcporter.json",
  );
  fs.mkdirSync(path.dirname(userMcporterConfig), {
    recursive: true,
    mode: 0o700,
  });
  if (!fs.existsSync(userMcporterConfig)) {
    fs.writeFileSync(
      userMcporterConfig,
      JSON.stringify(
        {
          mcpServers: {
            exa: { baseUrl: "https://mcp.exa.ai/mcp" },
          },
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  }
}

function listUserSkills(userId: string) {
  const root = userSkillsPath(userId);
  fs.mkdirSync(root, { recursive: true });
  ensureBuiltInSkills(userId);
  const skills: Array<{
    id: string;
    name: string;
    description: string;
    path: string;
    scope: string;
  }> = [];
  const visit = (dir: string, depth = 0) => {
    if (depth > 4 || !fs.existsSync(dir)) return;
    if (fs.existsSync(path.join(dir, "SKILL.md"))) {
      const meta = readSkillMeta(dir);
      const relativePath = path.relative(root, dir);
      skills.push({
        id: relativePath || meta.name,
        name: meta.name,
        description: meta.description,
        path: dir,
        scope:
          relativePath.startsWith(".system") ||
          (PROJECT_GLOBAL_SKILL_IDS as readonly string[]).includes(relativePath)
            ? "system"
            : "user",
      });
      return;
    }
    fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => visit(path.join(dir, entry.name), depth + 1));
  };
  visit(root);
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function listPluginSkillIds(skillRoot: string) {
  if (!fs.existsSync(skillRoot)) return [];
  try {
    return fs
      .readdirSync(skillRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          fs.existsSync(path.join(skillRoot, entry.name, "SKILL.md")),
      )
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function listNamedEntriesFromJson(filePath: string, topLevelKey: string) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!raw || typeof raw !== "object") return [];
    const value = raw[topLevelKey] ?? raw;
    if (Array.isArray(value))
      return value
        .map((item: unknown) => String(item || "").trim())
        .filter(Boolean);
    if (value && typeof value === "object")
      return Object.keys(value).sort((a, b) => a.localeCompare(b));
    return [];
  } catch {
    return [];
  }
}

function readUserPluginSummary(
  pluginDir: string,
  fallback?: Partial<UserPluginSummary>,
): UserPluginSummary | null {
  const manifest = loadPluginManifest(pluginDir);
  if (!manifest) {
    if (!fallback?.id && !fallback?.name) return null;
    const name = String(
      fallback.name || fallback.id || path.basename(pluginDir),
    );
    return {
      id: String(fallback.id || name),
      name,
      description: String(fallback.description || ""),
      path: pluginDir,
      scope: String(fallback.scope || "user"),
    };
  }

  const id = manifest.name || String(fallback?.id || path.basename(pluginDir));
  return {
    id,
    name: manifest.name || String(fallback?.name || id),
    description:
      manifest.description ||
      manifest.interface?.shortDescription ||
      String(fallback?.description || ""),
    path: pluginDir,
    scope: String(fallback?.scope || "user"),
    version: manifest.version,
    skills: manifest.paths.skills
      ? listPluginSkillIds(manifest.paths.skills)
      : [],
    apps: manifest.paths.apps
      ? listNamedEntriesFromJson(manifest.paths.apps, "apps")
      : [],
    mcpServers: manifest.paths.mcpServers
      ? listNamedEntriesFromJson(manifest.paths.mcpServers, "mcpServers")
      : [],
    interface: manifest.interface as Record<string, unknown> | undefined,
    keywords: manifest.keywords || [],
  };
}

function projectPluginRoot(marketplaceName: string, pluginName: string) {
  const versionRoot = path.join(
    PROJECT_PLUGIN_CACHE_ROOT,
    marketplaceName,
    pluginName,
  );
  if (!fs.existsSync(versionRoot)) return null;
  try {
    const versions = fs
      .readdirSync(versionRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of versions) {
      const candidate = path.join(versionRoot, version);
      if (fs.existsSync(path.join(candidate, ".codex-plugin", "plugin.json")))
        return candidate;
    }
  } catch {}
  return null;
}

function globalCowartPluginRoot() {
  return projectPluginRoot("local", "cowart");
}

function addGlobalCowartPlugin(plugins: Map<string, UserPluginSummary>) {
  const pluginDir = globalCowartPluginRoot();
  if (!pluginDir) return;
  const plugin = readUserPluginSummary(pluginDir, {
    id: "cowart",
    name: "cowart",
    scope: "global",
  });
  if (plugin)
    plugins.set("cowart", {
      ...plugin,
      id: "cowart",
      name: "cowart",
      scope: "global",
    });
}

function installedPluginMap(userId: string) {
  const root = userPluginsPath(userId);
  fs.mkdirSync(root, { recursive: true });
  const plugins = new Map<string, UserPluginSummary>();
  const addPlugin = (pluginDir: string) => {
    const plugin = readUserPluginSummary(pluginDir, { scope: "user" });
    if (plugin) plugins.set(plugin.id, plugin);
  };
  fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => addPlugin(path.join(root, entry.name)));

  const marketplacePath = userMarketplacePath(userId);
  if (fs.existsSync(marketplacePath)) {
    try {
      const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
      const entries = Array.isArray(marketplace.plugins)
        ? marketplace.plugins
        : [];
      entries.forEach((entry: any) => {
        const name = String(entry?.name || "").trim();
        if (!name) return;
        const sourcePath =
          entry?.source?.source === "local"
            ? String(entry.source.path || "")
            : "";
        const pluginDir = sourcePath
          ? path.resolve(path.dirname(marketplacePath), "..", "..", sourcePath)
          : path.join(root, name);
        const plugin = readUserPluginSummary(pluginDir, {
          id: name,
          name,
          description: String(entry?.description || entry?.category || ""),
          path: pluginDir,
          scope: "user",
        });
        if (plugin) plugins.set(plugin.id, plugin);
      });
    } catch {}
  }
  addGlobalCowartPlugin(plugins);
  return plugins;
}

function listUserPlugins(userId: string) {
  return [...installedPluginMap(userId).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function pluginInstalled(
  installed: Map<string, { id: string; name: string }>,
  plugin: { id: string; name: string },
) {
  return installed.has(plugin.name) || installed.has(plugin.id);
}

function listPluginMarketplace(userId: string) {
  const installed = installedPluginMap(userId);
  return BUILT_IN_PLUGINS.map((plugin) => ({
    ...plugin,
    scope: "builtin",
    installed: plugin.installedByDefault || pluginInstalled(installed, plugin),
  }));
}

function killAppServerProcess(
  pid: number,
  options: {
    userId: string;
    expectedUrl: string;
    knownChild?: ChildProcessWithoutNullStreams | null;
  },
) {
  if (!processIsAlive(pid)) return true;
  const knownOwned = Boolean(
    options.knownChild?.pid === pid &&
    options.knownChild.exitCode === null &&
    options.knownChild.signalCode === null,
  );
  if (
    !knownOwned &&
    !isOwnedAppServerProcess(pid, options.userId, options.expectedUrl)
  ) {
    console.warn(
      "[codex runtime] refused to terminate an unverified persisted pid",
      {
        userId: appServerKey(options.userId),
        pid,
      },
    );
    return false;
  }
  try {
    if (process.platform !== "win32") process.kill(-pid, "SIGTERM");
    else process.kill(pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  const forceTimer = setTimeout(() => {
    if (!processIsAlive(pid)) return;
    const stillKnownChild = Boolean(
      options.knownChild?.pid === pid &&
      options.knownChild.exitCode === null &&
      options.knownChild.signalCode === null,
    );
    if (
      !stillKnownChild &&
      !isOwnedAppServerProcess(pid, options.userId, options.expectedUrl)
    )
      return;
    try {
      if (process.platform !== "win32") process.kill(-pid, "SIGKILL");
      else process.kill(pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  }, 3_000);
  forceTimer.unref?.();
  return true;
}

function stopUserAppServer(userId: string, reason = "") {
  const key = appServerKey(userId);
  const state = appServers.get(key);
  const pid = Number(state?.process?.pid || state?.pid || 0);
  if (pid) {
    killAppServerProcess(pid, {
      userId,
      expectedUrl: state?.url || "",
      knownChild: state?.process,
    });
  }
  removePersistedAppServerState(userId, pid || undefined);
  appServers.delete(key);
  if (reason)
    console.info("[codex runtime] stopped idle app-server", {
      userId: key,
      pid,
      reason,
    });
}

function removeStaleDirectoryChildren(root: string, cutoffMs: number) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    try {
      const stat = fs.statSync(target);
      if (stat.mtimeMs >= cutoffMs) continue;
      fs.rmSync(target, { recursive: true, force: true });
    } catch {}
  }
}

function pruneIdleUserTransientFiles(nowMs = Date.now()) {
  if (!fs.existsSync(APP_SERVER_HOMES_ROOT)) return;
  const cutoffMs = nowMs - codexRuntimeLimits.transientFileRetentionMs;
  for (const entry of fs.readdirSync(APP_SERVER_HOMES_ROOT, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory() || appServers.has(entry.name)) continue;
    const home = path.join(APP_SERVER_HOMES_ROOT, entry.name);
    for (const name of [".tmp", "tmp", "shell_snapshots"]) {
      removeStaleDirectoryChildren(path.join(home, name), cutoffMs);
    }
  }
}

function cachedDirectorySizeBytes(root: string, stopAfterBytes: number) {
  const cache = runtimeState.storageUsageCache!;
  const cached = cache.get(root);
  const currentTime = Date.now();
  if (
    cached &&
    currentTime - cached.measuredAt < codexRuntimeLimits.maintenanceIntervalMs
  ) {
    return cached.bytes;
  }
  const bytes = directorySizeBytes(root, stopAfterBytes);
  cache.set(root, { bytes, measuredAt: currentTime });
  return bytes;
}

function refreshRuntimeStorageUsage() {
  const measuredAt = runtimeState.runtimeStorageMeasuredAt || 0;
  if (runtimeState.runtimeStorageScanInFlight) return;
  if (Date.now() - measuredAt < codexRuntimeLimits.maintenanceIntervalMs)
    return;
  runtimeState.runtimeStorageScanInFlight = true;
  execFile(
    "du",
    ["-sk", CODEX_RUNTIME_ROOT],
    { timeout: 30_000 },
    (error, stdout) => {
      runtimeState.runtimeStorageScanInFlight = false;
      if (error) return;
      const kib = Number.parseInt(String(stdout || "").trim(), 10);
      if (!Number.isFinite(kib)) return;
      runtimeState.runtimeStorageBytes = kib * 1024;
      runtimeState.runtimeStorageMeasuredAt = Date.now();
      enforceRuntimeStorageLimit(runtimeState.runtimeStorageBytes);
    },
  );
}

function enforceRuntimeStorageLimit(bytes: number) {
  const overLimit = bytes > codexRuntimeLimits.runtimeMaxBytes;
  if (!overLimit) {
    runtimeState.runtimeStoragePressureActive = false;
    return;
  }
  if (runtimeState.runtimeStoragePressureActive) return;
  runtimeState.runtimeStoragePressureActive = true;
  const message = `智能体运行目录已超过 ${formatByteLimit(codexRuntimeLimits.runtimeMaxBytes)} 上限，任务已停止，请先清理旧附件或交付文件`;
  console.error("[codex runtime] storage hard limit reached", {
    bytes,
    limit: codexRuntimeLimits.runtimeMaxBytes,
  });
  const openTasks = tasksStore().tasks.filter((task) =>
    ["running", "queued"].includes(task.status),
  );
  for (const task of openTasks) {
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "stderr",
      type: "app.resource_limit",
      role: "system",
      text: message,
    });
    updateTask(task.id, { status: "failed", exitCode: 1, signal: null });
    stopTaskRuntime(task.id, "failed");
  }
  for (const state of [...appServers.values()])
    stopUserAppServer(state.userId, "storage-pressure");
  for (const [key, state] of cowartCanvasServers)
    stopCowartCanvasServer(key, state);
  for (const [sessionId, session] of terminalSessions) {
    try {
      if (!session.closedAt) session.terminal.kill("SIGTERM");
    } catch {}
    terminalSessions.delete(sessionId);
  }
}

function addCachedDirectoryBytes(root: string, bytes: number) {
  const cached = runtimeState.storageUsageCache?.get(root);
  if (!cached || bytes <= 0) return;
  cached.bytes += bytes;
  cached.measuredAt = Date.now();
  if (root === CODEX_RUNTIME_ROOT) {
    runtimeState.runtimeStorageBytes =
      (runtimeState.runtimeStorageBytes || 0) + bytes;
    runtimeState.runtimeStorageMeasuredAt = Date.now();
    enforceRuntimeStorageLimit(runtimeState.runtimeStorageBytes);
  }
}

function codexRuntimeCapacityError(
  userId: string,
  projectId = "",
  incomingBytes = 0,
) {
  const home = userAppServerHome(userId);
  const homeBytes = cachedDirectorySizeBytes(
    home,
    codexRuntimeLimits.userHomeMaxBytes,
  );
  if (homeBytes > codexRuntimeLimits.userHomeMaxBytes) {
    return `智能体历史与缓存已达到 ${formatByteLimit(codexRuntimeLimits.userHomeMaxBytes)} 上限，请先清理旧会话`;
  }

  const userRoot = path.join(CODEX_RUNTIME_ROOT, "users", appServerKey(userId));
  const userBytes = cachedDirectorySizeBytes(
    userRoot,
    codexRuntimeLimits.userRuntimeMaxBytes,
  );
  if (userBytes + incomingBytes > codexRuntimeLimits.userRuntimeMaxBytes) {
    return `当前用户的运行文件已达到 ${formatByteLimit(codexRuntimeLimits.userRuntimeMaxBytes)} 上限，请先删除旧附件或交付文件`;
  }

  if (projectId) {
    const projectRoot = codexRuntimeProjectRoot(userId, projectId);
    const projectBytes = cachedDirectorySizeBytes(
      projectRoot,
      codexRuntimeLimits.projectRuntimeMaxBytes,
    );
    if (
      projectBytes + incomingBytes >
      codexRuntimeLimits.projectRuntimeMaxBytes
    ) {
      return `当前项目运行文件已达到 ${formatByteLimit(codexRuntimeLimits.projectRuntimeMaxBytes)} 上限，请先删除旧附件或交付文件`;
    }
  }

  refreshRuntimeStorageUsage();
  const runtimeBytes = runtimeState.runtimeStorageBytes;
  if (
    runtimeBytes !== undefined &&
    runtimeBytes + incomingBytes > codexRuntimeLimits.runtimeMaxBytes
  ) {
    return `智能体服务器运行目录已达到 ${formatByteLimit(codexRuntimeLimits.runtimeMaxBytes)} 上限，请联系管理员清理`;
  }
  return "";
}

function assertCodexRuntimeCapacity(
  userId: string,
  projectId = "",
  incomingBytes = 0,
) {
  const error = codexRuntimeCapacityError(userId, projectId, incomingBytes);
  if (error) throw new Error(error);
}

function appServerUserHasActiveTurn(userId: string) {
  for (const taskId of activeAppTurns.keys()) {
    const task = tasksStore().tasks.find((item) => item.id === taskId);
    if (task?.userId === userId) return true;
  }
  return false;
}

function appServerStateIsBusy(state: AppServerState) {
  return Boolean(
    state.starting ||
    state.activeRequests > 0 ||
    appServerUserHasActiveTurn(state.userId),
  );
}

function touchAppServerState(state: AppServerState, persist = false) {
  state.lastUsedAt = Date.now();
  if (
    persist &&
    state.pid &&
    state.url &&
    state.token &&
    state.configSignature
  ) {
    writePersistedAppServerState(state.userId, {
      pid: state.pid,
      url: state.url,
      token: state.token,
      configSignature: state.configSignature,
      lastUsedAt: state.lastUsedAt,
    });
  }
}

function sweepIdleAppServers(nowMs = Date.now()) {
  for (const state of [...appServers.values()]) {
    if (appServerStateIsBusy(state)) continue;
    if (nowMs - state.lastUsedAt < codexRuntimeLimits.appServerIdleMs) continue;
    stopUserAppServer(state.userId, "idle-timeout");
  }
}

function stopUserAppServerForHardMemoryPressure(state: AppServerState) {
  const message = `智能体子进程内存超过 ${formatByteLimit(codexRuntimeLimits.appServerAggregateHardMaxRssBytes)} 总上限，本轮任务已自动停止`;
  const activeTasks = tasksStore().tasks.filter(
    (task) => task.userId === state.userId && task.status === "running",
  );
  for (const task of activeTasks) {
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "stderr",
      type: "app.resource_limit",
      role: "system",
      text: message,
    });
    updateTask(task.id, { status: "failed", exitCode: 1, signal: null });
    stopTaskRuntime(task.id, "failed");
  }
  stopUserAppServer(state.userId, "hard-memory-pressure");
}

function sweepAppServersOverMemoryLimit() {
  const entries = [...appServers.values()].map((state) => ({
    state,
    pid: Number(state.process?.pid || state.pid || 0),
  }));
  const rssByPid = processTreeRssBytesByRoot(entries.map((entry) => entry.pid));
  const rssFor = (entry: (typeof entries)[number]) =>
    rssByPid.get(entry.pid) || 0;
  let totalRss = entries.reduce((total, entry) => total + rssFor(entry), 0);
  if (totalRss <= codexRuntimeLimits.appServerAggregateMaxRssBytes) return;
  const idleCandidates = entries
    .filter((entry) => !appServerStateIsBusy(entry.state))
    .sort((a, b) => a.state.lastUsedAt - b.state.lastUsedAt);
  while (
    totalRss > codexRuntimeLimits.appServerAggregateMaxRssBytes &&
    idleCandidates.length > 0
  ) {
    const candidate = idleCandidates.shift()!;
    const rss = rssFor(candidate);
    stopUserAppServer(candidate.state.userId, "memory-pressure");
    totalRss = Math.max(0, totalRss - rss);
  }
  if (totalRss <= codexRuntimeLimits.appServerAggregateHardMaxRssBytes) return;
  const busyCandidates = entries
    .filter((entry) => appServers.has(appServerKey(entry.state.userId)))
    .sort(
      (a, b) =>
        rssFor(b) - rssFor(a) || a.state.lastUsedAt - b.state.lastUsedAt,
    );
  while (
    totalRss > codexRuntimeLimits.appServerAggregateHardMaxRssBytes &&
    busyCandidates.length > 0
  ) {
    const candidate = busyCandidates.shift()!;
    const rss = rssFor(candidate);
    stopUserAppServerForHardMemoryPressure(candidate.state);
    totalRss = Math.max(0, totalRss - rss);
  }
}

function ensureAppServerCapacity(userId: string) {
  sweepIdleAppServers();
  sweepAppServersOverMemoryLimit();
  const requestedKey = appServerKey(userId);
  if (
    appServers.has(requestedKey) ||
    appServers.size < codexRuntimeLimits.appServerMaxActive
  )
    return;
  const idleCandidates = [...appServers.values()]
    .filter((state) => !appServerStateIsBusy(state))
    .sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  while (
    appServers.size >= codexRuntimeLimits.appServerMaxActive &&
    idleCandidates.length > 0
  ) {
    const candidate = idleCandidates.shift()!;
    stopUserAppServer(candidate.userId, "capacity-reclaim");
  }
  if (appServers.size >= codexRuntimeLimits.appServerMaxActive) {
    throw new Error("当前智能体任务较多，请稍后重试");
  }
}

function stopCowartCanvasServer(key: string, state: CowartCanvasServerState) {
  const child = state.child;
  if (child && !child.killed && child.exitCode === null) {
    try {
      child.kill("SIGTERM");
    } catch {}
    const forceTimer = setTimeout(() => {
      if (child.exitCode !== null || child.killed) return;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, 3_000);
    forceTimer.unref?.();
  }
  cowartCanvasServers.delete(key);
}

function pruneClosedTerminalSessions(nowMs = Date.now()) {
  for (const [sessionId, session] of terminalSessions) {
    if (!session.closedAt) continue;
    const closedAt = Date.parse(session.closedAt);
    if (
      Number.isFinite(closedAt) &&
      nowMs - closedAt >= codexRuntimeLimits.closedTerminalRetentionMs
    ) {
      terminalSessions.delete(sessionId);
    }
  }
}

function sweepOverlongAppTurns(nowMs = Date.now()) {
  for (const [taskId, activeTurn] of activeAppTurns) {
    if (nowMs - activeTurn.startedAt < codexRuntimeLimits.appTurnMaxRuntimeMs)
      continue;
    const task = tasksStore().tasks.find((item) => item.id === taskId);
    if (!task || task.status !== "running") {
      cleanupActiveTaskRuntime(taskId);
      continue;
    }
    appendTaskEvent(taskId, {
      ts: now(),
      stream: "stderr",
      type: "app.resource_limit",
      role: "system",
      text: `本轮智能体任务运行超过 ${Math.round(codexRuntimeLimits.appTurnMaxRuntimeMs / 60_000)} 分钟，已自动停止`,
    });
    updateTask(taskId, { status: "failed", exitCode: 1, signal: null });
    stopTaskRuntime(taskId, "failed");
  }
}

function reconcilePersistedAppServerOrphans() {
  ensureDirs();
  for (const entry of fs.readdirSync(APP_SERVER_TOKENS_ROOT, {
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !entry.name.endsWith(".server.json")) continue;
    const key = entry.name.replace(/\.server\.json$/, "");
    const userPath = path.join(APP_SERVER_TOKENS_ROOT, `${key}.user`);
    let userId = key;
    try {
      if (fs.existsSync(userPath))
        userId = fs.readFileSync(userPath, "utf8").trim() || key;
    } catch {}
    const persisted = readPersistedAppServerState(userId);
    if (persisted?.pid && processIsAlive(persisted.pid)) {
      killAppServerProcess(persisted.pid, {
        userId,
        expectedUrl: persisted.url,
      });
    }
    removePersistedAppServerState(userId, persisted?.pid);
  }
}

function runCodexRuntimeMaintenance() {
  const nowMs = Date.now();
  sweepIdleAppServers(nowMs);
  sweepAppServersOverMemoryLimit();
  sweepOverlongAppTurns(nowMs);
  pruneClosedTerminalSessions(nowMs);
  pruneIdleUserTransientFiles(nowMs);
  runtimeState.storageUsageCache?.clear();
  refreshRuntimeStorageUsage();
  pruneCanvasSessionLeaseState(runtimeState.canvasSessionLeases, nowMs);
  pruneCodexTaskLogCache();
  for (const [key, state] of cowartCanvasServers) {
    if (nowMs - state.lastUsedAt >= codexRuntimeLimits.cowartIdleMs)
      stopCowartCanvasServer(key, state);
  }
}

function shutdownCodexRuntimeChildren() {
  flushTasksStore();
  for (const timer of runtimeState.taskLogCompactionTimers?.values() || [])
    clearTimeout(timer);
  runtimeState.taskLogCompactionTimers?.clear();
  for (const taskId of [...activeAppTurns.keys()])
    cleanupActiveTaskRuntime(taskId);
  for (const [taskId, child] of running) {
    try {
      if (!child.killed) child.kill("SIGTERM");
    } catch {}
    running.delete(taskId);
  }
  for (const state of [...appServers.values()]) stopUserAppServer(state.userId);
  for (const [key, state] of cowartCanvasServers)
    stopCowartCanvasServer(key, state);
  for (const [sessionId, session] of terminalSessions) {
    try {
      if (!session.closedAt) session.terminal.kill("SIGTERM");
    } catch {}
    terminalSessions.delete(sessionId);
  }
}

function initializeCodexRuntimeMaintenance() {
  if (runtimeState.maintenanceInitialized) return;
  runtimeState.maintenanceInitialized = true;
  reconcilePersistedAppServerOrphans();
  pruneIdleUserTransientFiles();
  refreshRuntimeStorageUsage();
  runtimeState.maintenanceTimer = setInterval(
    runCodexRuntimeMaintenance,
    codexRuntimeLimits.maintenanceIntervalMs,
  );
  runtimeState.maintenanceTimer.unref?.();
  if (!runtimeState.shutdownHooksInstalled) {
    runtimeState.shutdownHooksInstalled = true;
    const terminate = () => {
      shutdownCodexRuntimeChildren();
      setTimeout(() => process.exit(0), 25);
    };
    process.once("SIGTERM", terminate);
    process.once("SIGINT", terminate);
    process.once("beforeExit", shutdownCodexRuntimeChildren);
  }
}

function isCodexChildSensitiveEnvKey(key: string) {
  const normalized = key.toUpperCase();
  if (
    [
      "OPENAI_API_KEY",
      "OPENAI_BASE_URL",
      "OPENAI_API_BASE",
      "CODEX_API_KEY",
      "CODEX_BASE_URL",
      "ANTHROPIC_API_KEY",
      "ZENMUX_API_KEY",
      "DATABASE_URL",
      "DIRECT_URL",
      "REDIS_URL",
      "NEXTAUTH_SECRET",
      "AUTH_SECRET",
    ].includes(normalized)
  )
    return true;
  return (
    normalized.includes("WAVESPEED") ||
    normalized.includes("APIMART") ||
    normalized.includes("AISHUCH") ||
    normalized.includes("TTAPI") ||
    normalized.includes("KLING") ||
    normalized.includes("VECTORENGINE") ||
    normalized.includes("VOLCENGINE") ||
    normalized.includes("DASHSCOPE") ||
    normalized.includes("WORLDLABS") ||
    normalized.includes("FAL_") ||
    normalized.includes("GOOGLE_GEMINI") ||
    normalized.includes("GEMINI_API") ||
    normalized.includes("ARK_API") ||
    normalized.includes("SECRET_KEY") ||
    normalized.endsWith("_API_KEY") ||
    normalized.endsWith("_TOKEN")
  );
}

function platformMediaBaseUrl() {
  const fallbackPort =
    process.env.PORT ||
    (process.env.NODE_ENV === "development" ? "3001" : "3000");
  const localFallback = `http://127.0.0.1:${fallbackPort}`;
  const explicit = normalizeBaseUrl(
    String(process.env.CODEX_PLATFORM_MEDIA_BASE_URL || "").trim(),
  );
  if (explicit) return explicit;
  if (process.env.NODE_ENV === "development") return localFallback;
  const configured = String(
    process.env.BACKEND_URL ||
      process.env.IDEART_APP_BASE_URL ||
      process.env.NEXTAUTH_URL ||
      process.env.APP_URL ||
      "",
  ).trim();
  const normalized = normalizeBaseUrl(configured || localFallback);
  return normalized || localFallback;
}

function appServerEnv(userId: string, config: CodexUserConfig, token?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key === "CODEX_HOME" || isCodexChildSensitiveEnvKey(key))
      delete env[key];
  }
  const envKey = codexProviderEnvKey(config);
  return {
    ...env,
    CI: "1",
    NO_COLOR: "1",
    RUST_LOG: env.RUST_LOG || "warn",
    PATH: [PROJECT_TOOL_BIN_PATH, env.PATH, SYSTEM_BIN_PATH]
      .filter(Boolean)
      .join(":"),
    CODEX_HOME: userAppServerHome(userId),
    AGENT_REACH_HOST_BIN,
    MCPORTER_HOST_BIN,
    YTDLP_HOST_BIN,
    GH_HOST_BIN,
    CODEX_PLATFORM_MEDIA_URL: `${platformMediaBaseUrl()}/api/codex/platform/media/generate`,
    CODEX_CANVAS_COMMAND_URL: `${platformMediaBaseUrl()}/api/codex/workflow/canvas/commands`,
    CODEX_PLATFORM_TOKEN:
      process.env.CODEX_PLATFORM_TOKEN ||
      token ||
      readUserAppServerToken(userId) ||
      "",
    [envKey]: config.apiKey || "",
  };
}

function attachBoundedAppServerLogs(
  child: ChildProcessWithoutNullStreams,
  key: string,
) {
  const forwardStdout = process.env.CODEX_APP_SERVER_LOG_STDOUT === "1";
  let windowStartedAt = Date.now();
  let emitted = 0;
  let dropped = 0;
  const emitLine = (line: string, warning: boolean) => {
    const currentTime = Date.now();
    if (currentTime - windowStartedAt >= 60_000) {
      if (dropped > 0)
        console.warn(
          `[codex app-server:${key}] suppressed ${dropped} log lines`,
        );
      windowStartedAt = currentTime;
      emitted = 0;
      dropped = 0;
    }
    if (emitted >= codexRuntimeLimits.appServerLogLinesPerMinute) {
      dropped += 1;
      return;
    }
    emitted += 1;
    if (warning) console.warn(`[codex app-server:${key}] ${line}`);
    else console.log(`[codex app-server:${key}] ${line}`);
  };
  child.stdout.on("data", (chunk) => {
    if (!forwardStdout) return;
    String(chunk)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => emitLine(line, false));
  });
  child.stderr.on("data", (chunk) => {
    String(chunk)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => emitLine(line, true));
  });
}

async function waitForAppServerReady(url: string) {
  const deadline = Date.now() + 15_000;
  const readyUrl = `${url.replace("ws://", "http://")}/readyz`;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(readyUrl);
      if (resp.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("codex app-server is not ready");
}

async function appServerResponds(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(`${url.replace("ws://", "http://")}/readyz`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureAppServer(userId: string) {
  const config = userConfig(userId);
  if (!config?.apiKey) {
    throw new Error("请先在 Codex 设置中填写 API Key");
  }
  const key = appServerKey(userId);
  const signature = appServerConfigSignature(config);
  const existing = appServers.get(key);
  if (existing?.starting && existing.configSignature === signature) {
    touchAppServerState(existing);
    return existing.starting;
  }
  const existingAlive =
    existing?.process &&
    !existing.process.killed &&
    existing.process.exitCode === null &&
    existing.process.signalCode === null;
  if (
    existing?.url &&
    existing.token &&
    existingAlive &&
    existing.configSignature === signature
  ) {
    touchAppServerState(existing, true);
    return { url: existing.url, token: existing.token };
  }
  if (
    existing?.url &&
    existing.token &&
    existing.pid &&
    existing.configSignature === signature &&
    processIsAlive(existing.pid) &&
    (await appServerResponds(existing.url))
  ) {
    touchAppServerState(existing, true);
    return { url: existing.url, token: existing.token };
  }
  if (!existing) {
    const persisted = readPersistedAppServerState(userId);
    if (
      persisted &&
      processIsAlive(persisted.pid) &&
      (await appServerResponds(persisted.url))
    ) {
      if (persisted.configSignature === signature) {
        appServers.set(key, {
          userId,
          process: null,
          pid: persisted.pid,
          url: persisted.url,
          token: persisted.token,
          configSignature: persisted.configSignature,
          starting: null,
          lastUsedAt: Date.now(),
          activeRequests: 0,
        });
        const restored = appServers.get(key);
        if (restored) touchAppServerState(restored, true);
        return { url: persisted.url, token: persisted.token };
      }
      killAppServerProcess(persisted.pid, {
        userId,
        expectedUrl: persisted.url,
      });
    }
    removePersistedAppServerState(userId, persisted?.pid);
  }
  if (existing && (!existingAlive || existing.configSignature !== signature)) {
    stopUserAppServer(userId);
  }
  assertCodexRuntimeCapacity(userId);
  ensureAppServerCapacity(userId);
  const state: AppServerState = {
    userId,
    process: null,
    url: "",
    token: "",
    configSignature: signature,
    starting: null,
    lastUsedAt: Date.now(),
    activeRequests: 0,
  };
  appServers.set(key, state);

  state.starting = (async () => {
    ensureDirs();
    writeCodexUserConfig(userId, config);
    const port = await findFreePort();
    const token = randomUUID();
    const tokenPath = userAppServerTokenPath(userId);
    fs.writeFileSync(tokenPath, token, { mode: 0o600 });
    fs.writeFileSync(userAppServerTokenUserPath(userId), userId, {
      mode: 0o600,
    });
    const url = `ws://127.0.0.1:${port}`;
    const child = spawn(
      CODEX_BIN,
      [
        "app-server",
        "--listen",
        url,
        "--ws-auth",
        "capability-token",
        "--ws-token-file",
        tokenPath,
      ],
      {
        cwd: userAppServerHome(userId),
        env: appServerEnv(userId, config, token),
        detached: process.platform !== "win32",
      },
    );

    state.process = child;
    state.pid = child.pid;
    state.url = url;
    state.token = token;
    if (child.pid) {
      writePersistedAppServerState(userId, {
        pid: child.pid,
        url,
        token,
        configSignature: signature,
        lastUsedAt: state.lastUsedAt,
      });
    }

    attachBoundedAppServerLogs(child, key);
    child.on("exit", () => {
      removePersistedAppServerState(userId, child.pid);
      if (appServers.get(key) === state) appServers.delete(key);
      state.process = null;
      state.pid = undefined;
      state.url = "";
      state.token = "";
    });

    await waitForAppServerReady(url);
    touchAppServerState(state, true);
    return { url, token };
  })();

  try {
    return await state.starting;
  } finally {
    state.starting = null;
  }
}

function appServerRequest(
  ws: any,
  idRef: { value: number },
  method: string,
  params: unknown,
) {
  const id = idRef.value++;
  ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  return id;
}

async function appServerRpc(
  userId: string,
  method: string,
  params: unknown = {},
) {
  const { url, token } = await ensureAppServer(userId);
  const state = appServers.get(appServerKey(userId));
  if (state) {
    state.activeRequests += 1;
    touchAppServerState(state);
  }
  try {
    return await new Promise<any>((resolve, reject) => {
      const ws = openCodexAppServerSocket(url, token);
      const idRef = { value: 1 };
      let targetId = 0;
      let settled = false;
      const finish = (err: Error | null, result?: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {}
        if (err) reject(err);
        else resolve(result);
      };
      const timer = setTimeout(() => {
        finish(new Error(`Codex app-server request timeout: ${method}`));
      }, 15_000);

      ws.onopen = () => {
        appServerRequest(ws, idRef, "initialize", {
          clientInfo: { name: "ideart", title: "造梦", version: "0.1.0" },
          capabilities: { experimentalApi: true, requestAttestation: false },
        });
      };
      ws.onerror = () => {
        finish(new Error("Codex app-server WebSocket 连接失败"));
      };
      ws.onmessage = (event: any) => {
        const message = JSON.parse(String(event.data));
        if (message.id === 1 && message.error) {
          finish(
            new Error(message.error.message || JSON.stringify(message.error)),
          );
          return;
        }
        if (message.id === 1 && message.result) {
          targetId = appServerRequest(ws, idRef, method, params);
          return;
        }
        if (targetId && message.id === targetId) {
          if (message.error) {
            finish(
              new Error(message.error.message || JSON.stringify(message.error)),
            );
          } else {
            finish(null, message.result ?? null);
          }
        }
      };
      ws.onclose = () => {
        if (!settled)
          finish(
            new Error(`Codex app-server connection closed during ${method}`),
          );
      };
    });
  } finally {
    const current = appServers.get(appServerKey(userId));
    if (current) {
      current.activeRequests = Math.max(0, current.activeRequests - 1);
      touchAppServerState(current, true);
    }
  }
}

function sandboxForAppServer(sandbox: string) {
  return sandbox === "danger-full-access" || sandbox === "read-only"
    ? sandbox
    : "workspace-write";
}

function taskHasPreauthorizedWorkflowCanvas(task: CodexTask) {
  return Boolean(
    task.clientScope === "workflow" &&
    task.workflowProjectId &&
    task.canvasSessionId,
  );
}

function approvalPolicyForTask(task: CodexTask) {
  if (taskHasPreauthorizedWorkflowCanvas(task)) return "never";
  if (taskUsesProtectedProject(task)) return "on-request";
  return task.sandbox === "danger-full-access" ? "never" : "on-request";
}

function workflowSandboxPolicyForTask(
  task: CodexTask,
  workspaceRoots: string[],
) {
  if (!taskHasPreauthorizedWorkflowCanvas(task)) return null;
  return {
    type: "workspaceWrite",
    writableRoots: workspaceRoots,
    networkAccess: true,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function shouldAutoApprove(task: CodexTask) {
  const current =
    tasksStore().tasks.find((item) => item.id === task.id) || task;
  if (taskHasPreauthorizedWorkflowCanvas(current)) return true;
  if (taskUsesProtectedProject(current)) return false;
  return current.sandbox === "danger-full-access";
}

function approvalFromMessage(
  userId: string,
  taskId: string,
  message: any,
): CodexApproval | null {
  const kind = approvalKind(message?.method);
  if (!kind || message?.id === undefined || message?.id === null) return null;
  return {
    id: `${taskId}:${String(message.id)}`,
    userId,
    taskId,
    requestId: message.id,
    method: message.method,
    kind,
    params: message.params || {},
    createdAt: now(),
  };
}

function sendApprovalResponse(
  ws: any,
  approval: CodexApproval,
  decision: string,
  scope = "turn",
) {
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id: approval.requestId,
      ...approvalResponseFor(approval, decision, scope),
    }),
  );
}

function autoResolveWorkflowApprovalsForUser(userId: string) {
  for (const approval of [...pendingApprovals.values()]) {
    if (approval.userId !== userId) continue;
    const task = findTask(userId, approval.taskId);
    if (!task || !shouldAutoApprove(task)) continue;
    try {
      silentlyResolveApproval(
        userId,
        approval.id,
        "acceptForSession",
        "session",
      );
    } catch {}
  }
}

function selectedContextInput(context?: CodexSelectedContext | null) {
  if (!context?.name || !context.path) return [];
  if (context.type === "skill") {
    return [
      {
        type: "skill",
        name: context.name,
        path: context.path,
      },
    ];
  }
  if (context.type === "mention") {
    return [
      {
        type: "mention",
        name: context.name,
        path: context.path,
      },
    ];
  }
  return [
    {
      type: "text",
      text: [
        `当前用户在前端选择了插件：${context.name}。`,
        `插件上下文路径：${context.path}。`,
        "如果这是 Cowart，请使用已安装的 Cowart skill/MCP 能力处理画布相关请求；不要把 plugin 作为输入类型发送给运行时。",
      ].join("\n"),
      text_elements: [],
    },
  ];
}

function buildUserInput(task: CodexTask, recoveryContext = "") {
  const cwd = taskExecutionPath(task);
  const attachmentPaths = task.attachments?.length
    ? task.attachments
    : task.images || [];
  const attachmentInstruction = attachmentPaths.length
    ? [
        "用户上传的本地附件如下，可直接读取这些路径处理；图片附件也会作为图像输入提供:",
        ...attachmentPaths.map((filePath, index) => {
          const runtimeRoot = codexRuntimeProjectRoot(
            task.userId,
            task.projectId,
          );
          const relativePath = projectContainsFile(runtimeRoot, filePath)
            ? path.relative(runtimeRoot, filePath).split(path.sep).join("/")
            : projectContainsFile(cwd, filePath)
              ? path.relative(cwd, filePath).split(path.sep).join("/")
              : path.basename(filePath);
          const publicUrl = findCodexWorkflowAttachmentMetadata(
            runtimeRoot,
            filePath,
          )?.publicUrl;
          return [
            `${index + 1}. ${path.basename(filePath)}`,
            `relative: ${relativePath}`,
            `absolute: ${filePath}`,
            publicUrl ? `public_url: ${publicUrl}` : "",
          ]
            .filter(Boolean)
            .join(" | ");
        }),
      ].join("\n")
    : "";
  const brandInstruction = [
    "造梦智能体身份与输出规则:",
    "当用户询问“你是谁”“你是什么”“介绍一下你自己”等身份问题时，必须直接回复: 我是由造梦设计与影视平台研发的智能体，擅长制作文案，设计图制作和生成，专业电影制作，请问有什么我可以帮你？",
    "你面向用户的名称是“造梦智能体”，不要自称 Codex 客服，不要向用户展示或强调底层供应商、Base URL、API Key 或模型名称。",
    "当用户要求生图、生视频、生成音频或生成 3D 资产时，优先使用 Platform Media skill，通过当前动态模型配置和模型参数自动执行；不要直接调用外部供应商 API 或绕过工作流原生执行链路。",
    "媒体制作默认全自动执行：根据用户目标、发布场景、现有素材和当前模型能力，自主选择方案、画幅、分辨率、时长、数量、声音、字幕、模型及参数，并连续推进到可交付结果。除缺少不可推断的必要事实或素材、权利限制或供应商返回不可恢复错误外，不要为可合理推断的偏好暂停等待确认。",
    "所有影视、短剧、广告、分镜和一键成片任务的场景主图/场景参考图必须是干净空场：不得出现角色、人物、动物、吉祥物、身体局部、角色倒影、角色影子或正在表演的主体。场景资产只锁定空间拓扑、建筑、家具、中性道具、材质、天气、时间和基础光线；角色只能在后续分镜/关键帧阶段按镜头需要加入。发现人物或角色必须拒绝该场景图并重做，不得批准或导入分镜。",
    `调用 platform_media.py 时必须附带 --codex-task-id "${task.id}"。`,
    "当生成图片或视频后，不要在最终回复里输出本地文件路径或“图片路径/视频路径”。聊天面板会直接展示图片或视频，你只需要简洁说明已完成。",
    "当生成 PPT、文档、表格、PDF 或其他文件后，可以说明已生成文件，但不要输出本地绝对路径；前端会提供下载入口。",
  ].join("\n");
  const skillInstruction = [
    "造梦 Codex runtime note:",
    "When a task has a selected Skill, read that Skill's SKILL.md before the first mutating tool or canvas command. Its numbered workflow stages and prerequisites are authoritative. Generic runtime filmmaking notes explain mechanisms only and must never reorder, skip, or replace the selected Skill stages.",
    "Persist each declared Skill stage on the workflow canvas when the Skill defines stage-node metadata. Do not claim a stage is complete until its documented artifacts and machine review gates are complete.",
    "If the user asks to install, create, update, or use a Codex skill, install it only for the current 造梦 user under this isolated CODEX_HOME skills directory.",
    "Do not install skills into the machine global ~/.codex/skills directory or any shared user directory.",
    "After installing a skill, use it only in this current user workspace.",
  ].join("\n");
  const workspaceInstruction = [
    "Current 造梦 Codex workspace:",
    `Project name: ${task.projectName}`,
    `Project ID: ${task.projectId}`,
    `Codex Task ID: ${task.id}`,
    task.clientScope === "workflow"
      ? "Frontend surface: workflow canvas. Do not open or use Cowart for canvas work."
      : "",
    task.clientScope === "workflow" && task.workflowProjectId
      ? `Workflow Project ID: ${task.workflowProjectId}`
      : "",
    task.clientScope === "workflow" && task.canvasSessionId
      ? `Canvas Session ID: ${task.canvasSessionId}`
      : "",
    task.clientScope === "workflow" &&
    task.workflowProjectId &&
    task.canvasSessionId
      ? [
          "For workflow canvas inspection, node creation, node updates, connections, generation, waiting, and result inspection, use the built-in canvas command bridge:",
          `python3 "$CODEX_HOME/skills/.system/platform-media/scripts/canvas_command.py" OPERATION --workflow-project-id "${task.workflowProjectId}" --canvas-session-id "${task.canvasSessionId}" --codex-task-id "${task.id}" [--payload 'JSON']`,
          "Workflow canvas bridge commands are pre-authorized for this task. Execute them directly and never ask the user for canvas permission.",
          "The workflow runtime already enables bridge network access and uses approvalPolicy=never. Never announce that a canvas command needs network permission, authorization, escalation, or an authorized retry.",
          "A Python launcher, bad-interpreter, missing-file, missing-module or command-path failure that occurs before an HTTP response is not a sandbox or authorization failure. Keep the same canvas command and retry it with the explicit python3 launcher. Only report authorization failure when the bridge itself returns an explicit HTTP 401/403 or authorization error.",
          "Run one lightweight snapshot at the start of the task. It returns live node IDs, kinds, compact semantic state, geometry, edges, layout and revision. Do not snapshot before each creation batch: native create placement checks the live canvas for collisions at commit time. A later snapshot is only justified after a user manually changes the canvas, a target node disappears, or a revision conflict occurs; pass knownRevision so an unchanged canvas returns only unchanged=true.",
          "Ordinary create commands use live production-stage placement: source -> script -> assets -> storyboard -> video -> compose -> output from left to right, with nodes in the same stage stacked from top to bottom. Omit position and frame x/y for normal creation. The canvas reads current occupied rectangles before every commit; use placementMode=exact only for a genuinely fixed structural location.",
          "Workflow canvas contract 2026-07-31.compact-v3 is built into the project-global platform-media Skill. It already defines text, image, video, audio, script, script-v2, playlist, threed, director-console-3d and group nodes, staged Skill metadata, and every bridge operation. Never request includeContract=true or mine snapshot output to rediscover static node fields during normal production.",
          "Never wrap canvas_command.py in sleep, shell polling loops, background jobs, head, or escalating timeout retries. The bridge already waits for native completion and reconnects a refreshed canvas session. For non-trivial JSON use --payload-file in the isolated task workspace. Canvas stdout is a bounded receipt; use --result-file only when QA needs the full result.",
          "For filmmaking, follow the selected Skill stages first. When that Skill reaches its script/storyboard stage, create or reuse exactly one script-v2 and never create one generic script node per shot. Run that same script-v2 with scriptV2Stage=confirm-shots, then scriptV2Stage=prepare-assets, and continue with native asset import, storyboard images, storyboard videos and composition. Never move script-v2 ahead of a Skill's required brief, style, character or other preproduction stages.",
          "On this workflow canvas, every plot keyframe is a native storyboard image produced by storyboard-create-images. Never replace it with a generic image generator or manually create per-shot plot video generators.",
          ...(isPixarAnimationAdTask(task)
            ? [
                "PIXAR ANIMATION AD STRICT STAGE GATE: full automation remains enabled, but the numbered pixar-animation-ad SKILL.md stages are the authoritative execution order and cannot be skipped or reordered.",
                "Stage 1: create one connected text-editor with workflowSkillId=pixar-animation-ad, workflowSkillStage=delivery-spec and workflowSkillStageStatus=completed. Its content must lock the verified input and delivery specification.",
                "Stage 2: create one downstream text-editor with workflowSkillId=pixar-animation-ad, workflowSkillStage=brand-style-bible and workflowSkillStageStatus=completed. Its content must hold brand facts, product locks, original style and continuity rules.",
                "Stage 3: create one downstream character-bible text-editor with workflowSkillId=pixar-animation-ad, workflowSkillStage=character-bible, workflowSkillStageStatus=draft and workflowSkillPersonaIds containing every planned stable persona ID. Then create and run exactly one independent character identity master per persona: kind=image, mediaRole=generator, componentType=image-generator, workflowAssetStage=character-identity-master, workflowAssetPersonaId=<stable persona id>, workflowScriptV2AssetKind=角色, workflowScriptV2AssetId=<stable asset id>, generationCount=1. The prompt must request one character on a clean or neutral background and must not request a contact sheet, turnaround, multi-view layout or expression sheet.",
                "Prepare every independent asset node in the current dependency wave before generation. If the wave has two or more assets, submit every node in one run-batch with concurrency=min(200,item count); never fall back to sequential run calls. After the whole batch settles, inspect every output and approve passing nodes. Retry only failed or non-compliant original nodes, batching retries when more than one failed.",
                "Create face turnaround, body turnaround and expression sheet only after the identity master is approved; connect the approved master into every derived generator, use the identical image model, prepare the complete derived wave, and execute that wave with run-batch. After every declared persona has approved identity, face, body and expression assets, update character-bible to workflowSkillStageStatus=completed.",
                "Stage 4 only now begins: create or reuse exactly one script-v2 with workflowSkillId=pixar-animation-ad and workflowSkillStage=creative-script-lyrics. Connect the prior stage nodes and approved character masters. Run it with scriptV2Stage=confirm-shots to produce the advertising concept, script, lyrics, native audio/subtitle plan and complete shot rows, then run the same node with scriptV2Stage=prepare-assets to extract stable scene, product and prop keys. Do not create generic script nodes.",
                "After prepare-assets, generate and approve scene-master and product-master separately. Generate scene lighting variants and product turnaround as separate derived assets; never place cold/warm scene variants or product views in one master reference sheet.",
                "Every scene-master and scene-lighting-variant must be a clean empty plate with no character, person, animal, mascot, body part, performer reflection or performer shadow. After visual inspection, set workflowSceneCleanPlate=true together with workflowAssetReviewStatus=approved; otherwise reject and regenerate the scene asset.",
                "Only after all required assets are generated, inspected and approved may you use one script-import-assets. Pass only nodeId unless a specific override is required: the native bridge automatically reads approved canvas assets and their media URLs, so never hand-build assetsByKind or imageUrl lists. The script-v2 node already owns the complete rows and the gate reads its compact row-key manifest; do not copy the full script rows into the command payload. Then call storyboard-create-images exactly once with every row index and the same image model as the character identity master. It runs the independent shots concurrently up to 200. Inspect and approve every result; use storyboard-regenerate-images only for failed or blank rows, then use storyboard-create-videos.",
                "Do not manually create or run plot keyframe generators or plot video generators. Do not connect every reference sheet to every shot: each script row must name stable character, scene and prop/product asset keys so the native compound operation connects only the references used by that shot.",
              ]
            : []),
          "For media generation: create or update every required generator node with its visible prompt, model and parameters, connect references, then execute through the native canvas bridge. The run and run-batch commands invoke the same native send button as the canvas UI and wait for provider tasks to settle.",
          "Enabled model configuration is dynamic and is not part of snapshot. Query only the required kind through the models operation with a concise intent, choose one returned runtimeId, then query that exact model once with modelId and includeParameters=true. Never load all image, video, audio, text and 3D catalogs together.",
          "Use the selected models response for supported ratios, resolutions, durations, modes and workflowExtraParameters. For character/concept sketches prefer an enabled Midjourney, MJ, Niji or other sketch/design-specialized model when present instead of blindly using the default.",
          'Every run payload must include nodeId, kind, prompt, modelId and aspectRatio, plus width and height when known. Example: {"nodeId":"NODE_ID","kind":"image","prompt":"VISIBLE_PROMPT","modelId":"RUNTIME_ID","aspectRatio":"3:4","width":768,"height":1024}. This metadata drives the matching media placeholder in chat.',
          'For two or more independent media slots, prepare all nodes and references first, then use run-batch with {"concurrency":200,"items":[RUN_PAYLOAD,...]}. The bridge supports at most 200 items and 200 concurrent native runs. Wait for the complete batch, inspect all outputs together, and retry only failed or non-compliant nodes.',
          "After run or run-batch returns, save the full result with --result-file and create QA contact sheets with media_qa_preview.py --result-json. Do not manually copy every imageUrl. Call view_image only on those previews; never load generated 2K/4K originals directly into model context. If the preview tool reports dependency_unavailable, skip that preview and continue from the native canvas result. Never run pip install, npm install, apt install, or any package installer during a user turn. Do not run the same unchanged node twice. A deliberate retry must first update the prompt/model/parameters and pass force=true; reuse the same generator instead of creating duplicate provider jobs.",
          "Every Codex-created video generator must use a model and mode that support synchronized native audio, set generateAudio=true, and carry the storyboard dialogue, voice, ambience, foley, music intent, and any exact subtitle text/timing into the first video-generation pass. If the selected model or mode cannot do this, choose a compatible enabled model before submission.",
          "For commercial video composition, inspect the clips and script first. Connect completed native-audio video nodes to one playlist editing node, then order playlistItems and set each item trimStart/trimEnd to remove weak heads, tails and pauses while preserving the requested pacing. Post-production is for final editing and assembly, or for replacing/adjusting native background music that does not fit the finished piece. Do not use silent video plus later voiceover, music, or newly written subtitles as the default route; subtitle text and timing must already come from the storyboard.",
          "The playlist is only a processing tool. Connections alone are not completion. Do not report completion unless playlistExportUrl is non-empty and the result includes one outgoing ordinary video output node with workflowPlaylistSourceNodeId equal to the playlist ID and a durable mediaUrl.",
          "Do not call platform_media.py or an external provider directly while this workflow canvas bridge is available. Native canvas generation owns provider request contracts, dynamic model routing, fallback, polling and durable result placement.",
        ].join("\n")
      : "",
    `Current working directory (cwd): ${cwd}`,
    "When asked about the current working directory, answer with this cwd.",
    "Run commands and resolve relative file paths from this cwd unless the user explicitly asks otherwise.",
    taskUsesProtectedProject(task)
      ? `Platform source directory is protected and is not writable from this Codex session: ${PROJECT_ROOT}. Use the current runtime cwd for any temporary files, logs, downloads, and generated assets.`
      : "",
    "This workspace context is for execution accuracy; do not repeat it unless it is directly relevant to the user request.",
  ].join("\n");
  const input: Array<Record<string, unknown>> = [];
  if (task.sandbox !== "danger-full-access") {
    input.push({ type: "text", text: skillInstruction, text_elements: [] });
  }
  input.push({ type: "text", text: workspaceInstruction, text_elements: [] });
  input.push(...selectedContextInput(task.selectedContext));
  input.push({ type: "text", text: brandInstruction, text_elements: [] });
  if (attachmentInstruction)
    input.push({
      type: "text",
      text: attachmentInstruction,
      text_elements: [],
    });
  if (recoveryContext) {
    input.push({
      type: "text",
      text: [
        "The previous native thread exceeded its upstream context-size limit and was replaced automatically.",
        "Use this compact conversation continuity only when it is relevant; inspect live workspace or canvas state instead of reconstructing old tool output.",
        recoveryContext,
      ].join("\n\n"),
      text_elements: [],
    });
  }
  input.push(
    { type: "text", text: task.prompt, text_elements: [] },
    ...(task.images || []).map((imagePath) => ({
      type: "localImage",
      path: imagePath,
    })),
  );
  return input;
}

function firstJsonObjectFromText(value: unknown) {
  const text = String(value || "");
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function shellFlagValue(command: unknown, flag: string) {
  const text = String(command || "");
  const escapedFlag = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(
    new RegExp(
      `--${escapedFlag}\\s+(?:"((?:\\\\.|[^"])*)"|'((?:\\\\.|[^'])*)'|([^\\s]+))`,
    ),
  );
  const raw = match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  return String(raw || "")
    .replace(/\\(["'\\$`])/g, "$1")
    .trim();
}

function platformMediaKindFromCommand(command: unknown) {
  const text = String(command || "");
  if (!/platform_media\.py/i.test(text)) return "";
  const match = text.match(/platform_media\.py['"]?\s+(image|video)\b/i);
  return String(match?.[1] || "").toLowerCase();
}

function commandExecutionCommand(item: any) {
  const actions = Array.isArray(item?.commandActions)
    ? item.commandActions
    : [];
  const direct = actions
    .map((action: any) => String(action?.command || "").trim())
    .find(
      (command: string) =>
        command.includes("canvas_command.py") ||
        command.includes("platform_media.py"),
    );
  return direct || String(item?.command || "").trim();
}

function canvasCommandOperationFromCommand(command: unknown) {
  const text = String(command || "");
  if (!/canvas_command\.py/i.test(text)) return "";
  const match = text.match(
    /canvas_command\.py["']?\s+(snapshot|models|create|update|connect|disconnect|delete|run-batch|run|wait|inspect-result|script-create-input|script-import-assets|storyboard-create-images|storyboard-regenerate-images|storyboard-create-videos)\b/i,
  );
  return String(match?.[1] || "").toLowerCase();
}

function canvasCommandPayloadFromCommand(command: unknown) {
  const raw = shellFlagValue(command, "payload");
  if (!raw) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function canvasGenerationPayloadsFromCommand(command: unknown) {
  const operation = canvasCommandOperationFromCommand(command);
  const payload = canvasCommandPayloadFromCommand(command);
  if (operation === "run") return [payload];
  if (operation !== "run-batch") return [];
  return (Array.isArray(payload.items) ? payload.items : [])
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .slice(0, 200);
}

function canvasGenerationFiles(result: any, kind: CodexCanvasGenerationKind) {
  const node =
    result?.node && typeof result.node === "object" ? result.node : {};
  const outputNode =
    result?.outputNode && typeof result.outputNode === "object"
      ? result.outputNode
      : {};
  const data = node?.data && typeof node.data === "object" ? node.data : {};
  const outputData =
    outputNode?.data && typeof outputNode.data === "object"
      ? outputNode.data
      : {};
  const task =
    result?.task && typeof result.task === "object" ? result.task : {};
  const candidates = [
    result?.mediaUrl,
    ...(Array.isArray(result?.mediaUrls) ? result.mediaUrls : []),
    data.playlistExportUrl,
    outputData.mediaUrl,
    data.mediaUrl,
    task.mediaUrl,
    ...(Array.isArray(data.workflowImageResults)
      ? data.workflowImageResults
      : []),
    ...(Array.isArray(data.workflowVideoResults)
      ? data.workflowVideoResults
      : []),
    ...(Array.isArray(task.imageResults) ? task.imageResults : []),
    ...(Array.isArray(task.videoResults) ? task.videoResults : []),
    ...(Array.isArray(task.audioResults) ? task.audioResults : []),
  ];
  const urls = candidates
    .map((entry: any) =>
      String(
        typeof entry === "string"
          ? entry
          : entry?.url ||
              entry?.mediaUrl ||
              entry?.outputUrl ||
              entry?.videoUrl ||
              entry?.imageUrl ||
              entry?.audioUrl ||
              "",
      ).trim(),
    )
    .filter((url: string) => /^(?:https?:\/\/|\/api\/|\/uploads\/)/i.test(url));
  return Array.from(new Set(urls)).map((url, index) => ({
    url,
    name:
      codexCanvasGenerationOutputName(kind) +
      (urls.length > 1 ? " " + (index + 1) : ""),
  }));
}

function canvasGenerationEventPayload(params: {
  kind: CodexCanvasGenerationKind;
  nodeKind?: string;
  status: "generating" | "completed" | "failed";
  taskId: string;
  nodeId?: string;
  prompt?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  modelId?: string;
  outputs?: Array<{ url: string; name: string }>;
  error?: string;
}) {
  const outputs = params.outputs || [];
  const mediaKind = codexCanvasGenerationMediaKind(params.kind);
  return {
    type: codexCanvasGenerationPayloadType(params.kind),
    source: "canvas-command",
    kind: params.kind,
    nodeKind: params.nodeKind || params.kind,
    mediaKind,
    status: params.status,
    taskId: params.taskId,
    nodeId: params.nodeId || "",
    prompt: params.prompt || "",
    revisedPrompt: params.prompt || "",
    aspectRatio: params.aspectRatio || "",
    width: Number.isFinite(Number(params.width))
      ? Number(params.width)
      : undefined,
    height: Number.isFinite(Number(params.height))
      ? Number(params.height)
      : undefined,
    modelId: params.modelId || "",
    result: outputs[0]?.url || "",
    outputs,
    files: outputs,
    error: params.error || "",
  };
}

function canvasGenerationStartedEventsFromCommand(
  message: any,
): CodexTaskEvent[] {
  if (message?.method !== "item/started") return [];
  const item = message?.params?.item || {};
  if (item.type !== "commandExecution") return [];
  const command = commandExecutionCommand(item);
  const payloads = canvasGenerationPayloadsFromCommand(command);
  return payloads.flatMap((payload) => {
    const kind = canvasGenerationKind(
      payload.kind || payload.mediaKind || payload.outputType,
    );
    const nodeId = String(payload.nodeId || "").trim();
    if (!kind || !nodeId) return [];
    const eventPayload = canvasGenerationEventPayload({
      kind,
      status: "generating",
      taskId: `${String(item.id || "").trim()}:${nodeId}`,
      nodeId,
      prompt: String(payload.prompt || "").trim(),
      aspectRatio: String(payload.aspectRatio || "").trim(),
      width: Number(payload.width),
      height: Number(payload.height),
      modelId: String(payload.modelId || "").trim(),
    });
    return [
      {
        ts: now(),
        stream: "stdout" as const,
        type: codexCanvasGenerationEventType(kind),
        role: "tool" as const,
        text: JSON.stringify(eventPayload),
        raw: JSON.stringify(eventPayload),
      },
    ];
  });
}

function canvasGenerationEventsFromCommand(message: any): CodexTaskEvent[] {
  if (message?.method !== "item/completed") return [];
  const item = message?.params?.item || {};
  if (item.type !== "commandExecution") return [];
  const command = commandExecutionCommand(item);
  const requestedPayloads = canvasGenerationPayloadsFromCommand(command);
  if (!requestedPayloads.length) return [];
  const result = firstJsonObjectFromText(item.aggregatedOutput);
  const commandError =
    item.status !== "completed"
      ? String(item.aggregatedOutput || "")
          .replace(/\u001b\[[0-9;]*m/g, "")
          .split(/\r?\n/)
          .map((line: string) => line.trim())
          .filter(Boolean)
          .slice(-1)[0] || ""
      : "";
  const batchItems = Array.isArray(result?.items) ? result.items : [];
  return requestedPayloads.flatMap((requested) => {
    const requestedNodeId = String(requested.nodeId || "").trim();
    const settledItem = batchItems.find(
      (candidate: any) =>
        String(
          candidate?.nodeId ||
            candidate?.result?.nodeId ||
            candidate?.result?.node?.id ||
            "",
        ).trim() === requestedNodeId,
    );
    const itemResult =
      settledItem?.result || (batchItems.length ? null : result);
    const node =
      itemResult?.node && typeof itemResult.node === "object"
        ? itemResult.node
        : {};
    const data = node?.data && typeof node.data === "object" ? node.data : {};
    const task =
      itemResult?.task && typeof itemResult.task === "object"
        ? itemResult.task
        : {};
    const kind = canvasGenerationKind(
      itemResult?.kind || node.kind || requested.kind || requested.mediaKind,
    );
    if (!kind || !requestedNodeId) return [];
    const outputs = itemResult ? canvasGenerationFiles(itemResult, kind) : [];
    const interruptionText = [
      commandError,
      String(settledItem?.error || "").trim(),
      String(itemResult?.error || "").trim(),
      String(data.workflowGenerationError || "").trim(),
      String(task.error || "").trim(),
    ].join(" ");
    const detachedFromCodexTurn =
      /Codex 任务已(?:取消|结束)|画布命令已停止/i.test(interruptionText);
    const failed =
      !detachedFromCodexTurn &&
      (item.status !== "completed" ||
        settledItem?.ok === false ||
        itemResult?.status === "failed" ||
        task.status === "failed" ||
        Boolean(data.workflowGenerationError));
    const status = failed
      ? "failed"
      : outputs.length > 0
        ? "completed"
        : "generating";
    const eventPayload = canvasGenerationEventPayload({
      kind,
      status,
      taskId: `${String(item.id || "").trim()}:${requestedNodeId}`,
      nodeId: String(itemResult?.nodeId || node.id || requestedNodeId).trim(),
      prompt: String(
        data.prompt || data.workflowInternalPrompt || requested.prompt || "",
      ).trim(),
      aspectRatio: String(
        itemResult?.aspectRatio ||
          data.aspectRatio ||
          requested.aspectRatio ||
          "",
      ).trim(),
      width: Number(
        itemResult?.width ||
          data.workflowMediaNaturalWidth ||
          node.width ||
          requested.width,
      ),
      height: Number(
        itemResult?.height ||
          data.workflowMediaNaturalHeight ||
          node.height ||
          requested.height,
      ),
      modelId: String(
        itemResult?.modelId ||
          data.modelId ||
          task.modelId ||
          requested.modelId ||
          "",
      ).trim(),
      outputs,
      error: failed
        ? String(
            settledItem?.error ||
              itemResult?.error ||
              data.workflowGenerationError ||
              task.error ||
              commandError ||
              "画布生成失败",
          ).trim()
        : "",
    });
    return [
      {
        ts: now(),
        stream: "stdout" as const,
        type: codexCanvasGenerationEventType(kind),
        role: "tool" as const,
        text: JSON.stringify(eventPayload),
        raw: JSON.stringify(eventPayload),
      },
    ];
  });
}

function platformMediaGenerationStartedEventFromCommand(
  message: any,
): CodexTaskEvent | null {
  if (message?.method !== "item/started") return null;
  const item = message?.params?.item || {};
  if (item.type !== "commandExecution") return null;
  const outputType = platformMediaKindFromCommand(item.command);
  if (outputType !== "image" && outputType !== "video") return null;
  const prompt = shellFlagValue(item.command, "prompt");
  if (!prompt) return null;
  const payload = {
    type: outputType === "video" ? "videoGeneration" : "imageGeneration",
    status: "generating",
    taskId: String(item.id || "").trim(),
    prompt,
    revisedPrompt: prompt,
    outputs: [],
    files: [],
  };
  return {
    ts: now(),
    stream: "stdout",
    type:
      outputType === "video" ? "app.videoGeneration" : "app.imageGeneration",
    role: "tool",
    text: JSON.stringify(payload),
    raw: JSON.stringify(payload),
  };
}

function platformMediaGenerationPayloadFromResult(
  result: any,
  taskId: string,
  prompt: string,
) {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return null;
  const outputType = String(result.type || "")
    .trim()
    .toLowerCase();
  if (outputType !== "image" && outputType !== "video") return null;
  const outputs = Array.isArray(result.outputs) ? result.outputs : [];
  const publicOutputs = outputs
    .map((entry: any) => ({
      url: String(entry?.viewUrl || entry?.url || "").trim(),
      name: String(entry?.name || entry?.title || "").trim(),
    }))
    .filter((entry: { url: string }) => entry.url);
  if (!publicOutputs.length) return null;
  return {
    outputType,
    payload: {
      type: outputType === "video" ? "videoGeneration" : "imageGeneration",
      status: "completed",
      taskId,
      prompt,
      revisedPrompt: prompt,
      result: publicOutputs[0]?.url || "",
      outputs: publicOutputs,
      files: publicOutputs,
    },
  };
}

function platformMediaGenerationEventFromOutputDelta(
  message: any,
): CodexTaskEvent | null {
  if (message?.method !== "item/commandExecution/outputDelta") return null;
  const params = message?.params || {};
  const result = firstJsonObjectFromText(params.delta || params.output);
  const parsed = platformMediaGenerationPayloadFromResult(
    result,
    String(params.itemId || "").trim(),
    "",
  );
  if (!parsed) return null;
  return {
    ts: now(),
    stream: "stdout",
    type:
      parsed.outputType === "video"
        ? "app.videoGeneration"
        : "app.imageGeneration",
    role: "tool",
    text: JSON.stringify(parsed.payload),
    raw: JSON.stringify(parsed.payload),
  };
}

function platformMediaGenerationEventFromCommand(
  message: any,
): CodexTaskEvent | null {
  if (message?.method !== "item/completed") return null;
  const item = message?.params?.item || {};
  if (item.type !== "commandExecution" || item.status !== "completed")
    return null;
  const result = firstJsonObjectFromText(item.aggregatedOutput);
  const prompt = shellFlagValue(item.command, "prompt");
  const parsed = platformMediaGenerationPayloadFromResult(
    result,
    String(item.id || "").trim(),
    prompt,
  );
  if (!parsed) return null;
  return {
    ts: now(),
    stream: "stdout",
    type:
      parsed.outputType === "video"
        ? "app.videoGeneration"
        : "app.imageGeneration",
    role: "tool",
    text: JSON.stringify(parsed.payload),
    raw: JSON.stringify(parsed.payload),
  };
}

function normalizeAppServerEvent(message: any): CodexTaskEvent | null {
  const method = message?.method;
  const params = message?.params || {};
  const item = params.item || {};

  if (appServerMessageWillRetry(message)) return null;

  if (method === "item/started") {
    if (item.type === "commandExecution") {
      return {
        ts: now(),
        stream: "stdout",
        type: "app.command_started",
        role: "tool",
        text: item.command || "",
        raw: JSON.stringify(message),
      };
    }
    if (item.type === "fileChange") {
      return {
        ts: now(),
        stream: "stdout",
        type: "app.fileChange",
        role: "tool",
        text: JSON.stringify({ ...item, status: item.status || "inProgress" }),
        raw: JSON.stringify(message),
      };
    }
    if (item.type === "webSearch") {
      return {
        ts: now(),
        stream: "stdout",
        type: "app.webSearch",
        role: "tool",
        text: JSON.stringify(item),
        raw: JSON.stringify(message),
      };
    }
    if (
      item.type === "mcpToolCall" ||
      item.type === "dynamicToolCall" ||
      item.type === "collabAgentToolCall"
    ) {
      return {
        ts: now(),
        stream: "stdout",
        type: `app.${item.type}`,
        role: "tool",
        text: JSON.stringify({ ...item, status: item.status || "inProgress" }),
        raw: JSON.stringify(message),
      };
    }
    if (
      item.type === "enteredReviewMode" ||
      item.type === "exitedReviewMode" ||
      item.type === "contextCompaction"
    ) {
      return {
        ts: now(),
        stream: "stdout",
        type: `app.${item.type}`,
        role: "tool",
        text: JSON.stringify(item),
        raw: JSON.stringify(message),
      };
    }
    if (item.type === "reasoning" || item.type === "hookPrompt") return null;
  }

  if (method === "item/completed") {
    if (item.type === "userMessage") {
      const parts = Array.isArray(item.content) ? item.content : [];
      const textParts = parts
        .map((part: any) => (part.type === "text" ? part.text : ""))
        .filter(Boolean);
      const images = parts
        .map((part: any) =>
          part.type === "localImage" ? String(part.path || "") : "",
        )
        .filter(Boolean);
      const text = String(textParts[textParts.length - 1] || "").trim();
      return {
        ts: now(),
        stream: "system",
        type: "user_message",
        role: "user",
        text,
        raw: JSON.stringify({ ...message, ideartImages: images }),
      };
    }
    if (item.type === "agentMessage") {
      return {
        ts: now(),
        stream: "stdout",
        type: "app.agent_message",
        role: "assistant",
        text: item.text || "",
        raw: JSON.stringify(message),
      };
    }
    if (item.type === "commandExecution") {
      return {
        ts: now(),
        stream: "stdout",
        type: "app.command",
        role: "tool",
        text: `${item.command || ""}${item.aggregatedOutput ? `\n${item.aggregatedOutput}` : ""}`,
        raw: JSON.stringify(message),
      };
    }
    if (item.type === "webSearch") {
      return {
        ts: now(),
        stream: "stdout",
        type: "app.webSearch",
        role: "tool",
        text: JSON.stringify(item),
        raw: JSON.stringify(message),
      };
    }
    if (item.type === "fileChange") {
      return {
        ts: now(),
        stream: "stdout",
        type: "app.fileChange",
        role: "tool",
        text: JSON.stringify(item),
        raw: JSON.stringify(message),
      };
    }
    if (
      item.type === "imageGeneration" ||
      item.type === "imageView" ||
      item.type === "mcpToolCall" ||
      item.type === "dynamicToolCall" ||
      item.type === "collabAgentToolCall" ||
      item.type === "enteredReviewMode" ||
      item.type === "exitedReviewMode" ||
      item.type === "contextCompaction"
    ) {
      return {
        ts: now(),
        stream: "stdout",
        type: `app.${item.type}`,
        role: "tool",
        text: JSON.stringify(item),
        raw: JSON.stringify(message),
      };
    }
    if (item.type === "reasoning" || item.type === "hookPrompt") return null;
    return {
      ts: now(),
      stream: "stdout",
      type: `app.${item.type || "item"}`,
      role: "tool",
      text: item.text || item.command || JSON.stringify(item),
      raw: JSON.stringify(message),
    };
  }

  if (method === "item/agentMessage/delta") {
    return {
      ts: now(),
      stream: "stdout",
      type: "app.agent_delta",
      role: "assistant",
      text: params.delta || "",
      raw: JSON.stringify(message),
    };
  }

  if (
    method === "item/commandExecution/outputDelta" ||
    method === "command/exec/outputDelta" ||
    method === "process/outputDelta"
  ) {
    return {
      ts: now(),
      stream: "stdout",
      type: "app.command_delta",
      role: "tool",
      text: params.delta || params.output || "",
      raw: JSON.stringify(message),
    };
  }

  if (method === "process/exited") {
    return {
      ts: now(),
      stream: Number(params.exitCode || 0) === 0 ? "stdout" : "stderr",
      type: "app.processExited",
      role: "tool",
      text: `Process exited${params.exitCode === undefined ? "" : ` with code ${params.exitCode}`}`,
      raw: JSON.stringify(message),
    };
  }

  if (method === "item/fileChange/outputDelta") {
    return {
      ts: now(),
      stream: "stdout",
      type: "app.file_delta",
      role: "tool",
      text: params.delta || params.output || "",
      raw: JSON.stringify(message),
    };
  }

  if (method === "item/fileChange/patchUpdated") {
    return {
      ts: now(),
      stream: "stdout",
      type: "app.fileChange",
      role: "tool",
      text: JSON.stringify({
        type: "fileChange",
        id: params.itemId || params.item?.id || "",
        changes: Array.isArray(params.changes) ? params.changes : [],
        status: "inProgress",
      }),
      raw: JSON.stringify(message),
    };
  }

  if (method === "turn/diff/updated") {
    return {
      ts: now(),
      stream: "stdout",
      type: "app.diff",
      role: "tool",
      text: JSON.stringify(params.diff || params.patch || params),
      raw: JSON.stringify(message),
    };
  }

  if (method === "context/compacted" || method === "thread/compacted") {
    return {
      ts: now(),
      stream: "system",
      type: "app.contextCompaction",
      role: "system",
      text: JSON.stringify(params),
      raw: JSON.stringify(message),
    };
  }

  if (method === "item/mcpToolCall/progress") {
    return {
      ts: now(),
      stream: "stdout",
      type: "app.mcpToolCallProgress",
      role: "tool",
      text: String(params.message || ""),
      raw: JSON.stringify(message),
    };
  }

  if (
    method === "item/autoApprovalReview/started" ||
    method === "item/autoApprovalReview/completed"
  ) {
    return {
      ts: now(),
      stream: "system",
      type: "app.autoApprovalReview",
      role: "system",
      text: JSON.stringify({
        ...params,
        phase: method.endsWith("/started") ? "started" : "completed",
      }),
      raw: JSON.stringify(message),
    };
  }

  if (method === "item/commandExecution/terminalInteraction") {
    return {
      ts: now(),
      stream: "stdout",
      type: "app.terminalInteraction",
      role: "tool",
      text: String(params.stdin || ""),
      raw: JSON.stringify(message),
    };
  }

  if (method === "thread/goal/updated") {
    return {
      ts: now(),
      stream: "system",
      type: "app.threadGoal",
      role: "system",
      text: JSON.stringify(params.goal || params),
      raw: JSON.stringify(message),
    };
  }

  if (method === "thread/goal/cleared") {
    return {
      ts: now(),
      stream: "system",
      type: "app.threadGoalCleared",
      role: "system",
      text: "",
      raw: JSON.stringify(message),
    };
  }

  if (method === "model/rerouted") {
    return {
      ts: now(),
      stream: "system",
      type: "app.modelRerouted",
      role: "system",
      text: `Model rerouted from ${params.fromModel || "current model"} to ${params.toModel || "new model"}`,
      raw: JSON.stringify(message),
    };
  }

  if (method === "model/verification") {
    return {
      ts: now(),
      stream: "system",
      type: "app.modelVerification",
      role: "system",
      text: JSON.stringify(params.verifications || []),
      raw: JSON.stringify(message),
    };
  }

  if (
    method === "warning" ||
    method === "guardianWarning" ||
    method === "configWarning" ||
    method === "deprecationNotice" ||
    method === "windows/worldWritableWarning"
  ) {
    const warningText =
      params.message ||
      params.summary ||
      (Array.isArray(params.samplePaths) && params.samplePaths.length
        ? `Windows sandbox warning: ${params.samplePaths.join(", ")}`
        : "") ||
      JSON.stringify(params);
    return {
      ts: now(),
      stream: "system",
      type: "app.warning",
      role: "system",
      text: String(warningText || "Codex warning"),
      raw: JSON.stringify(message),
    };
  }

  if (method === "turn/plan/updated") {
    const plan = params.plan || params.items || [];
    const text = Array.isArray(plan)
      ? plan
          .map(
            (step: any) =>
              `${step.status ? `[${step.status}] ` : ""}${step.step || step.text || step.title || JSON.stringify(step)}`,
          )
          .join("\n")
      : JSON.stringify(plan);
    return {
      ts: now(),
      stream: "system",
      type: "app.plan",
      role: "system",
      text,
      raw: JSON.stringify(message),
    };
  }

  if (method === "item/plan/delta") {
    return {
      ts: now(),
      stream: "system",
      type: "app.plan_delta",
      role: "system",
      text: params.delta || params.text || "",
      raw: JSON.stringify(message),
    };
  }

  if (
    method === "item/reasoning/delta" ||
    method === "item/reasoning/summaryDelta" ||
    method === "item/reasoning/summaryTextDelta" ||
    method === "item/reasoning/textDelta" ||
    method === "item/reasoning/summaryPartAdded"
  ) {
    return {
      ts: now(),
      stream: "stdout",
      type: "app.reasoning_delta",
      role: "assistant",
      text: params.delta || params.text || "",
      raw: JSON.stringify(message),
    };
  }

  if (method === "turn/started")
    return {
      ts: now(),
      stream: "system",
      type: "app.turn_started",
      text: "Codex 开始处理",
      raw: JSON.stringify(message),
    };
  if (method === "turn/completed")
    return {
      ts: now(),
      stream: "system",
      type: "app.turn_completed",
      text: "本轮完成",
      raw: JSON.stringify(message),
    };
  if (method === "turn/failed")
    return {
      ts: now(),
      stream: "stderr",
      type: "app.turn_failed",
      text:
        friendlyCodexErrorMessage(params.error || params.message || message) ||
        "本轮失败",
      raw: JSON.stringify(message),
    };
  if (method === "thread/started")
    return {
      ts: now(),
      stream: "system",
      type: "app.thread_started",
      text: `线程已连接 ${params.thread?.id || ""}`,
      raw: JSON.stringify(message),
    };
  if (method === "thread/status/changed")
    return {
      ts: now(),
      stream: "system",
      type: "app.thread_status",
      text: `线程状态 ${params.status?.type || ""}`,
      raw: JSON.stringify(message),
    };
  if (method === "thread/tokenUsage/updated") {
    const usage = params.tokenUsage?.last || params.tokenUsage?.total || {};
    return {
      ts: now(),
      stream: "system",
      type: "app.token_usage",
      text: `用量 输入 ${usage.inputTokens ?? 0} / 输出 ${usage.outputTokens ?? 0}`,
      raw: JSON.stringify(message),
    };
  }
  if (method === "error" || message?.error) {
    return {
      ts: now(),
      stream: "stderr",
      type: "app.error",
      text:
        friendlyCodexErrorMessage(message.error || params) || "Codex 执行失败",
      raw: JSON.stringify(message),
    };
  }
  return null;
}

function friendlyCodexErrorMessage(input: any) {
  const raw = typeof input === "string" ? input : JSON.stringify(input || {});
  const message =
    typeof input === "string"
      ? input
      : String(input?.message || input?.error?.message || raw);
  const status =
    input?.codexErrorInfo?.responseTooManyFailedAttempts?.httpStatusCode ||
    input?.codexErrorInfo?.responseStatusCode ||
    input?.httpStatusCode ||
    input?.status;
  if (isCodexContextSizeError(raw)) {
    return "本线程上下文超过上游限制，下一条消息会自动整理到新的运行线程后继续。";
  }
  if (
    /quota exceeded|usage[_\s-]*limit[_\s-]*exceeded|insufficient quota|check your plan and billing details/i.test(
      raw,
    )
  ) {
    return "当前造梦智能体对话额度暂不可用，请稍后重试或联系管理员补充对话额度。";
  }
  if (
    status === 429 ||
    /\b429\b|too many requests|exceeded retry limit/i.test(raw)
  ) {
    return "当前造梦智能体请求过于频繁或对话额度受限，请稍后重试。";
  }
  if (/401|unauthorized|invalid api key|authentication/i.test(raw)) {
    return "造梦智能体服务认证异常，请联系管理员处理。";
  }
  if (/403|forbidden|permission/i.test(raw)) {
    return "造梦智能体服务权限异常，请联系管理员处理。";
  }
  if (/404|not found|model/i.test(raw)) {
    return "造梦智能体服务暂不可用，请稍后重试。";
  }
  if (/stream disconnected|connection reset|reconnecting/i.test(raw)) {
    return "造梦智能体响应中断，请稍后重试。";
  }
  return message;
}

function isCodexContextSizeError(input: unknown) {
  const raw = typeof input === "string" ? input : JSON.stringify(input || {});
  return /total text input size exceeds|input size exceeds|request body (?:is )?too large|payload too large|context(?: length| size)? exceeds|上下文超过上游限制/i.test(
    raw,
  );
}

function taskHasCodexContextSizeFailure(taskId: string) {
  const logPath = path.join(LOG_ROOT, `${taskId}.jsonl`);
  if (!fs.existsSync(logPath)) return false;
  return readCompactedCodexTaskLog(logPath)
    .events.slice(-80)
    .some((event) => isCodexContextSizeError(event.text || event.raw || ""));
}

function codexThreadRecoveryContext(taskId: string) {
  const logPath = path.join(LOG_ROOT, `${taskId}.jsonl`);
  if (!fs.existsSync(logPath)) return "";
  const messages = readCompactedCodexTaskLog(logPath)
    .events.filter(
      (event) =>
        event.type === "user_message" || event.type === "app.agent_message",
    )
    .slice(-8)
    .map((event) => {
      const role = event.type === "user_message" ? "User" : "Assistant";
      return `${role}: ${truncateCodexEventText(event.text, 3_000)}`;
    });
  return truncateCodexEventText(messages.join("\n\n"), 16_000);
}

function appServerMessageWillRetry(message: any) {
  return Boolean(
    message?.willRetry ||
    message?.error?.willRetry ||
    message?.params?.willRetry ||
    message?.params?.error?.willRetry,
  );
}

async function runCodexAppTurn(
  task: CodexTask,
  options: { resumeThreadId?: string; recoveryContext?: string },
) {
  const { url, token } = await ensureAppServer(task.userId);
  const ws = openCodexAppServerSocket(url, token);
  const runId = randomUUID();
  const idRef = { value: 1 };
  let threadId = options.resumeThreadId || task.threadId || "";
  let turnStarted = false;
  let assistantDelta = "";
  let sawRetryableDisconnect = false;
  const cwd = taskExecutionPath(task);
  const workspaceRoots = [cwd, userSkillsPath(task.userId)];
  const sandbox =
    taskUsesProtectedProject(task) && task.sandbox === "danger-full-access"
      ? "workspace-write"
      : task.sandbox || "workspace-write";

  activeAppTurns.set(task.id, { ws, runId, startedAt: Date.now(), threadId });
  appendTaskEvent(task.id, {
    ts: now(),
    stream: "system",
    type: "app.connect",
    text: `连接 Codex app-server：${url}`,
  });

  ws.onmessage = (event: any) => {
    const message = JSON.parse(String(event.data));
    const currentTask = findTask(task.userId, task.id);
    if (!activeAppTurnIsCurrent(task.id, runId)) {
      ws.close();
      return;
    }
    const activeTurn = activeAppTurns.get(task.id);
    if (
      !currentTask ||
      (currentTask.status !== "running" && !activeTurn?.interrupting)
    ) {
      cleanupActiveTaskRuntime(task.id);
      ws.close();
      return;
    }
    const eventThreadId = String(
      message?.params?.threadId || message?.result?.thread?.id || "",
    ).trim();
    const eventTurnId = String(
      message?.params?.turn?.id ||
        message?.params?.turnId ||
        message?.result?.turn?.id ||
        "",
    ).trim();
    if (eventThreadId) {
      threadId = eventThreadId;
      if (currentTask.status === "running") updateTask(task.id, { threadId });
      if (activeTurn) activeTurn.threadId = threadId;
    }
    if (eventTurnId && activeTurn) activeTurn.turnId = eventTurnId;
    if (approvalKind(message?.method)) {
      if (activeTurn?.interrupting) {
        const approval = approvalFromMessage(task.userId, task.id, message);
        if (approval) sendApprovalResponse(ws, approval, "decline");
        return;
      }
      if (shouldAutoApprove(task)) {
        const approval = approvalFromMessage(task.userId, task.id, message);
        if (approval) {
          sendApprovalResponse(ws, approval, "acceptForSession", "session");
        }
      } else {
        storeApproval(task.userId, task.id, message);
      }
      return;
    }
    if (appServerMessageWillRetry(message)) {
      sawRetryableDisconnect = true;
      return;
    }
    const normalized = normalizeAppServerEvent(message);
    if (message?.result?.thread?.id) {
      threadId = message.result.thread.id;
      updateTask(task.id, { threadId });
      const active = activeAppTurns.get(task.id);
      if (active) active.threadId = threadId;
    }
    if (message?.result?.turn?.id) {
      const active = activeAppTurns.get(task.id);
      if (active) active.turnId = message.result.turn.id;
    }
    if (message.method === "item/agentMessage/delta") {
      assistantDelta += message.params?.delta || "";
      if (message.params?.delta && normalized)
        appendTaskEvent(task.id, normalized);
      return;
    }
    if (
      message.method === "item/completed" &&
      message.params?.item?.type === "agentMessage"
    ) {
      assistantDelta = "";
    }
    if (normalized) appendTaskEvent(task.id, normalized);
    const canvasGenerationStarted =
      canvasGenerationStartedEventsFromCommand(message);
    canvasGenerationStarted.forEach((generationEvent) =>
      appendTaskEvent(task.id, generationEvent),
    );
    const canvasGeneration = canvasGenerationEventsFromCommand(message);
    canvasGeneration.forEach((generationEvent) =>
      appendTaskEvent(task.id, generationEvent),
    );
    const platformMediaGenerationStarted =
      platformMediaGenerationStartedEventFromCommand(message);
    if (platformMediaGenerationStarted)
      appendTaskEvent(task.id, platformMediaGenerationStarted);
    const platformMediaGenerationDelta =
      platformMediaGenerationEventFromOutputDelta(message);
    if (platformMediaGenerationDelta)
      appendTaskEvent(task.id, platformMediaGenerationDelta);
    const platformMediaGeneration =
      platformMediaGenerationEventFromCommand(message);
    if (platformMediaGeneration)
      appendTaskEvent(task.id, platformMediaGeneration);

    if (message.id === 1 && message.result) {
      if (threadId) {
        appServerRequest(ws, idRef, "thread/resume", {
          threadId,
          cwd,
          runtimeWorkspaceRoots: workspaceRoots,
          approvalPolicy: approvalPolicyForTask(task),
          approvalsReviewer: "user",
          config: task.reasoningEffort
            ? { model_reasoning_effort: task.reasoningEffort }
            : null,
          includeTurnHistory: false,
        });
      } else {
        appServerRequest(ws, idRef, "thread/start", {
          cwd,
          runtimeWorkspaceRoots: workspaceRoots,
          model: task.model || null,
          sandbox: sandboxForAppServer(sandbox),
          approvalPolicy: approvalPolicyForTask(task),
          approvalsReviewer: "user",
          config: task.reasoningEffort
            ? { model_reasoning_effort: task.reasoningEffort }
            : null,
          experimentalRawEvents: false,
          persistExtendedHistory: false,
        });
      }
    } else if (
      (message.id === 2 || message.id === 3) &&
      message.result &&
      threadId &&
      !turnStarted
    ) {
      turnStarted = true;
      appServerRequest(ws, idRef, "turn/start", {
        threadId,
        input: buildUserInput(task, options.recoveryContext),
        model: task.model || null,
        effort: task.reasoningEffort || null,
        cwd,
        runtimeWorkspaceRoots: workspaceRoots,
        approvalPolicy: approvalPolicyForTask(task),
        approvalsReviewer: "user",
        sandboxPolicy: workflowSandboxPolicyForTask(task, workspaceRoots),
      });
    }

    if (message.method === "turn/completed") {
      if (assistantDelta) {
        appendTaskEvent(task.id, {
          ts: now(),
          stream: "stdout",
          type: "app.agent_message",
          role: "assistant",
          text: assistantDelta,
        });
      }
      const latestTask = findTask(task.userId, task.id);
      if (latestTask?.status === "running")
        updateTask(task.id, { status: "completed", exitCode: 0, signal: null });
      cleanupActiveTaskRuntime(task.id);
      ws.close();
    }
    if (
      message.method === "turn/failed" &&
      !appServerMessageWillRetry(message)
    ) {
      const latestTask = findTask(task.userId, task.id);
      if (latestTask?.status === "running")
        updateTask(task.id, { status: "failed", exitCode: 1, signal: null });
      cleanupActiveTaskRuntime(task.id);
      ws.close();
    }
    if (
      (message.method === "error" || message.error) &&
      !appServerMessageWillRetry(message)
    ) {
      const latestTask = findTask(task.userId, task.id);
      if (latestTask?.status === "running")
        updateTask(task.id, { status: "failed", exitCode: 1, signal: null });
      cleanupActiveTaskRuntime(task.id);
      ws.close();
    }
  };

  ws.onopen = () => {
    if (!activeAppTurnIsCurrent(task.id, runId)) {
      ws.close();
      return;
    }
    const currentTask = findTask(task.userId, task.id);
    if (!currentTask || currentTask.status !== "running") {
      cleanupActiveTaskRuntime(task.id);
      ws.close();
      return;
    }
    updateTask(task.id, { status: "running", runtime: "app-server" });
    appServerRequest(ws, idRef, "initialize", {
      clientInfo: { name: "ideart", title: "造梦", version: "0.1.0" },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
  };
  ws.onerror = () => {
    if (sawRetryableDisconnect) return;
    if (!activeAppTurnIsCurrent(task.id, runId)) return;
    const currentTask = findTask(task.userId, task.id);
    if (!currentTask || currentTask.status !== "running") {
      cleanupActiveTaskRuntime(task.id);
      return;
    }
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "stderr",
      type: "app.error",
      text: "Codex app-server WebSocket 连接失败",
    });
    updateTask(task.id, { status: "failed", exitCode: 1 });
    cleanupActiveTaskRuntime(task.id);
  };
  ws.onclose = () => {
    if (!activeAppTurnIsCurrent(task.id, runId)) return;
    const current = findTask(task.userId, task.id);
    if (current?.status === "running" && !sawRetryableDisconnect) {
      updateTask(task.id, { status: "failed", exitCode: 1 });
    }
    if (!sawRetryableDisconnect) cleanupActiveTaskRuntime(task.id);
  };
}

function attachCodexProcess(task: CodexTask, args: string[]) {
  appendTaskEvent(task.id, {
    ts: now(),
    stream: "system",
    text: `启动 Codex：${CODEX_BIN} ${args.map((arg) => JSON.stringify(arg)).join(" ")}`,
  });

  const config = userConfig(task.userId);
  if (!config?.apiKey) throw new Error("请先在 Codex 设置中填写 API Key");

  const child = spawn(CODEX_BIN, args, {
    cwd: taskExecutionPath(task),
    env: appServerEnv(task.userId, config),
  });
  child.stdin.end();
  running.set(task.id, child);
  updateTask(task.id, { pid: child.pid, status: "running" });

  child.stdout.on("data", (chunk) => {
    String(chunk)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) =>
        appendTaskEvent(task.id, extractEvent(line, "stdout")),
      );
  });
  child.stderr.on("data", (chunk) => {
    String(chunk)
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) =>
        appendTaskEvent(task.id, extractEvent(line, "stderr")),
      );
  });
  child.on("error", (err) => {
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "system",
      text: err.message,
    });
    updateTask(task.id, { status: "failed" });
    running.delete(task.id);
  });
  child.on("exit", (code, signal) => {
    const current = tasksStore().tasks.find((item) => item.id === task.id);
    const wasCancelled = current?.status === "cancelled";
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "system",
      text: wasCancelled
        ? "任务已取消"
        : `Codex 退出：code=${code ?? "null"} signal=${signal ?? "null"}`,
    });
    updateTask(task.id, {
      status: wasCancelled ? "cancelled" : code === 0 ? "completed" : "failed",
      exitCode: code,
      signal,
    });
    running.delete(task.id);
  });

  return child;
}
void attachCodexProcess;

app.get("/config", (c) => {
  const userId = currentAuthUserId(c);
  return success(c, publicConfig(userConfig(userId)));
});

app.get("/models", async (c) => {
  const userId = currentAuthUserId(c);
  const config = userConfig(userId);
  if (!config?.apiKey || !config.baseUrl || !config.model) {
    return badRequest(c, "Codex 默认配置不完整，无法读取模型列表");
  }
  const configuredModel = String(config.model || "").trim();
  try {
    const models = await fetchCodexModelCatalog(config);
    const resolvedConfiguredModel = resolveCodexModelId(
      configuredModel,
      models,
    );
    return success(c, {
      provider: normalizeProvider(
        config.provider || inferProviderFromBaseUrl(config.baseUrl),
      ),
      configured_model: resolvedConfiguredModel,
      models: models.slice(0, 200),
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : String(cause || "");
    return success(c, {
      provider: normalizeProvider(
        config.provider || inferProviderFromBaseUrl(config.baseUrl),
      ),
      configured_model: "",
      models: [],
      warning:
        message.slice(0, 240) || "无法验证模型能力，请检查网络后刷新模型列表",
    });
  }
});

app.get("/skills", (c) => {
  const userId = currentAuthUserId(c);
  return success(c, {
    skills: listUserSkills(userId),
    plugins: listUserPlugins(userId),
    marketplace_plugins: listPluginMarketplace(userId),
    skills_path: userSkillsPath(userId),
    plugins_path: userPluginsPath(userId),
  });
});

app.get("/skills/cover", (c) => {
  const userId = currentAuthUserId(c);
  const requestedId = String(c.req.query("id") || "").trim();
  const skill = listUserSkills(userId).find(
    (item) => item.id === requestedId && item.scope !== "system",
  );
  if (!skill) return c.json({ error: "Skill cover not found" }, 404);
  const cover = ["cover.png", "cover.webp", "cover.jpg", "cover.jpeg"]
    .map((fileName) => path.join(skill.path, fileName))
    .find(
      (filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile(),
    );
  if (!cover) return c.json({ error: "Skill cover not found" }, 404);
  const extension = path.extname(cover).toLowerCase();
  const contentType =
    extension === ".webp"
      ? "image/webp"
      : extension === ".jpg" || extension === ".jpeg"
        ? "image/jpeg"
        : "image/png";
  c.header("Content-Type", contentType);
  c.header("Cache-Control", "private, max-age=300");
  return c.body(fs.readFileSync(cover));
});

app.post("/plugins/install", async (c) => {
  const userId = currentAuthUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const pluginId = String(
    body.plugin_id || body.pluginId || body.id || "",
  ).trim();
  const plugin = BUILT_IN_PLUGINS.find(
    (item) => item.id === pluginId || item.name === pluginId,
  );
  if (!plugin) return badRequest(c, "plugin not found");
  if (plugin.installedByDefault) {
    return success(c, {
      plugin: { ...plugin, scope: "builtin", installed: true },
      plugins: listUserPlugins(userId),
      marketplace_plugins: listPluginMarketplace(userId),
    });
  }

  const pluginDir = path.join(userPluginsPath(userId), plugin.id);
  const manifestDir = path.join(pluginDir, ".codex-plugin");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(
    path.join(manifestDir, "plugin.json"),
    JSON.stringify(
      {
        name: plugin.name,
        version: "0.1.0",
        description: plugin.description,
        interface: {
          description: plugin.description,
        },
        ideart: {
          builtin_id: plugin.id,
          status: "placeholder",
          runtime: "connector",
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(pluginDir, "README.md"),
    [
      `# ${plugin.name}`,
      "",
      plugin.description,
      "",
      "This plugin is installed in the current 造梦 user CODEX_HOME only.",
      "Connector authorization and runtime bridge still need to be configured before this plugin can access external services.",
      "",
    ].join("\n"),
  );

  return success(c, {
    plugin: { ...plugin, scope: "user", installed: true, path: pluginDir },
    plugins: listUserPlugins(userId),
    marketplace_plugins: listPluginMarketplace(userId),
  });
});

app.delete("/skills", (c) => {
  const userId = currentAuthUserId(c);
  const skillId = String(
    c.req.query("skill_id") || c.req.query("id") || "",
  ).trim();
  if (!skillId) return badRequest(c, "skill id is required");

  const root = realPath(userSkillsPath(userId));
  const skill = listUserSkills(userId).find((item) => item.id === skillId);
  if (!skill) return badRequest(c, "skill not found");
  if (skill.scope === "system") return badRequest(c, "内置技能不能卸载");

  let target = "";
  try {
    target = realPath(skill.path);
  } catch {
    return badRequest(c, "skill path not found");
  }
  if (!pathContains(root, target) || target === root)
    return badRequest(c, "invalid skill path");

  fs.rmSync(target, { recursive: true, force: true });
  return success(c, {
    id: skill.id,
    deleted: true,
    skills: listUserSkills(userId),
  });
});

app.get("/approvals", (c) => {
  const userId = currentAuthUserId(c);
  autoResolveWorkflowApprovalsForUser(userId);
  return success(
    c,
    [...pendingApprovals.values()]
      .filter((approval) => approval.userId === userId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(publicApproval),
  );
});

app.post("/approvals/:id/respond", async (c) => {
  const userId = currentAuthUserId(c);
  const id = decodeURIComponent(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const decision = String(body.decision || "").trim();
  const scope = String(body.scope || "").trim();
  if (!["accept", "acceptForSession", "decline"].includes(decision)) {
    return badRequest(c, "invalid approval decision");
  }
  try {
    const approval = resolveApproval(userId, id, decision, scope);
    if (!approval) return badRequest(c, "approval request not found");
    return success(c, { id, decision });
  } catch (err: any) {
    return badRequest(c, err.message || "approval response failed");
  }
});

app.post("/tasks/:id/sandbox", async (c) => {
  const userId = currentAuthUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const sandbox = normalizeSandbox(body.sandbox);
  const task = findTask(userId, id);
  if (!task) return badRequest(c, "codex task not found");
  const project = findProject(userId, task.projectId);
  if (!project) return badRequest(c, "codex project not found");
  const effectiveSandbox = normalizeProjectSandbox(project, sandbox);

  updateTask(id, { sandbox: effectiveSandbox });

  const resolvedApprovals: string[] = [];
  if (effectiveSandbox === "danger-full-access") {
    for (const approval of [...pendingApprovals.values()]) {
      if (approval.userId !== userId || approval.taskId !== id) continue;
      const resolved = resolveApproval(
        userId,
        approval.id,
        "acceptForSession",
        "session",
      );
      if (resolved) resolvedApprovals.push(approval.id);
    }
  }

  const updated = findTask(userId, id) || task;
  return success(c, {
    task: publicTask(updated, { includeOutputTail: false }),
    sandbox: effectiveSandbox,
    resolved_approvals: resolvedApprovals,
  });
});

app.put("/config", async (c) => {
  const userId = currentAuthUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const provider = normalizeProvider(
    body.provider || inferProviderFromBaseUrl(body.base_url ?? body.baseUrl),
  );
  const baseUrl = normalizeBaseUrl(body.base_url ?? body.baseUrl);
  const inputApiKey = String(body.api_key ?? body.apiKey ?? "").trim();
  const model = normalizedCodexModelAlias(normalizeConfigModel(body.model));
  const existing = userConfig(userId);
  const apiKey = inputApiKey || existing?.apiKey || "";

  const baseUrlError = validateBaseUrl(baseUrl);
  if (baseUrlError) return badRequest(c, baseUrlError);
  if (!apiKey) return badRequest(c, "API Key 不能为空");
  if (!model) return badRequest(c, "模型不能为空");

  const store = configsStore();
  const current = store.configs.find((config) => config.userId === userId);
  const next: CodexUserConfig = {
    userId,
    provider,
    baseUrl,
    apiKey,
    model,
    updatedAt: now(),
  };
  if (current) Object.assign(current, next);
  else store.configs.push(next);
  writeConfigsStore(store);
  stopUserAppServer(userId);
  return success(c, publicConfig(next));
});

app.post("/config/test", async (c) => {
  const userId = currentAuthUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const baseUrl = normalizeBaseUrl(body.base_url ?? body.baseUrl);
  const inputApiKey = String(body.api_key ?? body.apiKey ?? "").trim();
  const model = normalizeConfigModel(body.model);
  const existing = userConfig(userId);
  const apiKey = inputApiKey || existing?.apiKey || "";
  const baseUrlError = validateBaseUrl(baseUrl);
  if (baseUrlError) return badRequest(c, baseUrlError);
  if (!apiKey) return badRequest(c, "API Key 不能为空");
  if (!model) return badRequest(c, "模型不能为空");

  try {
    return success(c, await testCodexConnection({ baseUrl, apiKey, model }));
  } catch (err: any) {
    return badRequest(c, err?.message || "连接测试失败");
  }
});

app.delete("/config", (c) => {
  const userId = currentAuthUserId(c);
  const store = configsStore();
  store.configs = store.configs.filter((config) => config.userId !== userId);
  writeConfigsStore(store);
  stopUserAppServer(userId);
  return success(c, publicConfig(userConfig(userId)));
});

app.post("/support/session", async (c) => {
  const userId = currentAuthUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const workflowProjectId = String(
    body.workflow_project_id || body.workflowProjectId || "",
  ).trim();
  const workflowProjectName = String(
    body.workflow_project_name || body.workflowProjectName || "",
  ).trim();
  const config = userConfig(userId);
  if (!config?.apiKey || !config.baseUrl || !config.model) {
    return badRequest(
      c,
      "Codex 默认配置不完整，请检查后端 CODEX_BASE_URL、CODEX_API_KEY 和 CODEX_MODEL",
    );
  }
  if (!CODEX_BIN || !fs.existsSync(CODEX_BIN)) {
    return badRequest(c, "project Codex CLI is not installed");
  }

  const project = workflowProjectId
    ? ensureCodexWorkflowProject(userId, workflowProjectId, workflowProjectName)
    : ensureCodexDefaultProject(userId);
  const latestTask = tasksStore()
    .tasks.filter(
      (task) => task.userId === userId && task.projectId === project.id,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return success(c, {
    config: publicConfig(config),
    project: publicProject(project),
    task: latestTask
      ? publicTask(latestTask, { includeOutputTail: false })
      : null,
  });
});

app.get("/projects", (c) => {
  const userId = currentAuthUserId(c);
  ensureCodexDefaultProject(userId);
  const workflowProjectId = String(
    c.req.query("workflow_project_id") ||
      c.req.query("workflowProjectId") ||
      "",
  ).trim();
  const projects = projectsStore()
    .projects.filter((project) => project.userId === userId)
    .filter((project) =>
      workflowProjectId
        ? project.workflowProjectId === workflowProjectId
        : !project.workflowProjectId,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(publicProject);
  return success(c, projects);
});

app.get("/project-directories", (c) => {
  if (!isLocalProjectAccessAllowed(c)) {
    return badRequest(
      c,
      "local project binding is only available when 造梦 backend runs on this machine",
    );
  }

  const userId = currentAuthUserId(c);
  const queryPath = String(c.req.query("path") || os.homedir()).trim();
  const roots = localDirectoryRoots();
  let currentPath = "";

  try {
    const resolved = realPath(queryPath || os.homedir());
    if (!roots.some((root) => pathContains(root, resolved)))
      return badRequest(c, "directory is outside the allowed local roots");
    if (!fs.statSync(resolved).isDirectory())
      return badRequest(c, "path must be a directory");
    currentPath = resolved;
  } catch {
    return badRequest(c, "directory not found");
  }

  const store = projectsStore();
  const appRoot = realPath(path.resolve(process.cwd(), ".."));
  const entries = fs
    .readdirSync(currentPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .slice(0, 200)
    .map((entry) => {
      const entryPath = path.join(currentPath, entry.name);
      let fullPath = entryPath;
      let selectable = false;
      let reason = "";
      try {
        fullPath = realPath(entryPath);
        reason = localProjectPathError(userId, fullPath, store);
        selectable = !reason;
      } catch {
        reason = "directory not found";
      }
      return {
        name: entry.name,
        path: fullPath,
        selectable,
        reason,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentPath = path.dirname(currentPath);
  return success(c, {
    path: currentPath,
    parent:
      parentPath !== currentPath &&
      roots.some((root) => pathContains(root, parentPath))
        ? parentPath
        : "",
    roots,
    selectable: !localProjectPathError(userId, currentPath, store),
    reason: localProjectPathError(userId, currentPath, store),
    app_root: appRoot,
    entries,
  });
});

app.post("/project-directories/pick", async (c) => {
  if (!isLocalProjectAccessAllowed(c)) {
    return badRequest(
      c,
      "local project binding is only available when 造梦 backend runs on this machine",
    );
  }
  if (process.platform !== "darwin") {
    return badRequest(
      c,
      "native folder picker is only available on macOS in this build",
    );
  }

  const userId = currentAuthUserId(c);
  try {
    const pickedPath = await pickMacDirectory();
    if (!pickedPath) return badRequest(c, "folder selection cancelled");
    const projectPath = realPath(pickedPath);
    const error = localProjectPathError(userId, projectPath);
    if (error) return badRequest(c, error);
    return success(c, {
      path: projectPath,
      name: path.basename(projectPath) || "本地项目",
    });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message.includes("User canceled") || message.includes("-128")) {
      return badRequest(c, "folder selection cancelled");
    }
    return serverError(c, err);
  }
});

app.post("/projects", async (c) => {
  const userId = currentAuthUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const source =
    body.source === "local"
      ? "local"
      : body.source === "github"
        ? "github"
        : "managed";
  const requestedPath = String(body.path || body.local_path || "").trim();
  const repoUrl =
    source === "github"
      ? normalizeGitHubRepoUrl(body.repo_url || body.repoUrl || body.url)
      : "";
  const nameFallback =
    source === "github" && repoUrl ? projectNameFromRepoUrl(repoUrl) : "新项目";
  const name =
    String(body.name || nameFallback)
      .trim()
      .slice(0, 80) || nameFallback;
  const baseSlug = safeSegment(String(body.slug || name), "project");
  const userSlug = safeSegment(userId, "user");
  const store = projectsStore();
  let slug = baseSlug;
  let i = 2;
  while (
    store.projects.some(
      (project) => project.userId === userId && project.slug === slug,
    )
  ) {
    slug = `${baseSlug}-${i++}`;
  }

  let projectPath = "";
  if (source === "local") {
    if (!isLocalProjectAccessAllowed(c)) {
      return badRequest(
        c,
        "local project binding is only available when 造梦 backend runs on this machine",
      );
    }
    const localError = localProjectPathError(userId, requestedPath, store);
    if (localError) return badRequest(c, localError);
    projectPath = realPath(requestedPath);
  } else if (source === "github") {
    if (!repoUrl) return badRequest(c, "请输入有效的 GitHub 仓库地址");
    projectPath = path.join(WORKSPACE_ROOT, userSlug, slug);
    if (fs.existsSync(projectPath) && fs.readdirSync(projectPath).length) {
      return badRequest(c, "目标项目目录已存在");
    }
    fs.mkdirSync(path.dirname(projectPath), { recursive: true });
    try {
      await execGit(
        path.dirname(projectPath),
        ["clone", repoUrl, projectPath],
        180_000,
      );
    } catch (err: any) {
      if (fs.existsSync(projectPath) && !fs.readdirSync(projectPath).length) {
        fs.rmSync(projectPath, { recursive: true, force: true });
      }
      return badRequest(c, err.message || "GitHub 仓库拉取失败");
    }
  } else {
    projectPath = path.join(WORKSPACE_ROOT, userSlug, slug);
    fs.mkdirSync(projectPath, { recursive: true });
  }

  const ts = now();
  const project: CodexProject = {
    id: `codex_project_${randomUUID()}`,
    userId,
    name,
    slug,
    path: projectPath,
    source,
    repoUrl,
    createdAt: ts,
    updatedAt: ts,
  };
  store.projects.push(project);
  writeProjectsStore(store);
  return success(c, publicProject(project));
});

app.delete("/projects/:id", (c) => {
  const userId = currentAuthUserId(c);
  const id = c.req.param("id");
  const store = projectsStore();
  const project = store.projects.find(
    (item) => item.userId === userId && item.id === id,
  );
  if (!project) return badRequest(c, "codex project not found");

  const taskStore = tasksStore();
  const deletedTasks = taskStore.tasks.filter(
    (task) => task.userId === userId && task.projectId === id,
  );
  deletedTasks.forEach((task) => {
    stopTaskRuntime(task.id);
    deleteTaskLog(task.id);
  });
  for (const [sessionId, session] of terminalSessions) {
    if (session.userId === userId && session.projectId === id) {
      if (!session.closedAt) session.terminal.kill("SIGTERM");
      terminalSessions.delete(sessionId);
    }
  }
  taskStore.tasks = taskStore.tasks.filter(
    (task) => !(task.userId === userId && task.projectId === id),
  );
  writeTasksStore(taskStore);
  store.projects = store.projects.filter(
    (item) => !(item.userId === userId && item.id === id),
  );
  writeProjectsStore(store);

  return success(c, { id, deleted_tasks: deletedTasks.length });
});

app.get("/projects/:id/git", async (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  try {
    return success(c, await projectGitStatus(project));
  } catch (err: any) {
    return serverError(c, err.message || "failed to read git status");
  }
});

app.post("/projects/:id/git/commit", async (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const body = await c.req.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  if (!message) return badRequest(c, "提交说明不能为空");

  const status = await projectGitStatus(project);
  if (!status.is_repo)
    return badRequest(c, status.message || "当前项目不是 Git 仓库");
  if (!status.changed_files) return badRequest(c, "没有可提交的变更");

  try {
    await execGit(project.path, ["add", "-A"], 30_000);
    const commit = await execGit(
      project.path,
      ["commit", "-m", message],
      60_000,
    );
    return success(c, {
      output: `${commit.stdout}${commit.stderr}`.trim(),
      git: await projectGitStatus(project),
    });
  } catch (err: any) {
    return badRequest(c, err.message || "提交失败");
  }
});

app.post("/projects/:id/git/push", async (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const status = await projectGitStatus(project);
  if (!status.is_repo)
    return badRequest(c, status.message || "当前项目不是 Git 仓库");
  if (!status.remote) return badRequest(c, "当前仓库没有配置 origin remote");

  try {
    const push = await execGit(project.path, ["push"], 120_000);
    return success(c, {
      output: `${push.stdout}${push.stderr}`.trim(),
      git: await projectGitStatus(project),
    });
  } catch (err: any) {
    return badRequest(c, err.message || "推送失败");
  }
});

app.post("/projects/:id/patches/undo", async (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const body = await c.req.json().catch(() => ({}));
  const patch = String(body.patch || body.diff || "").trim();
  if (!patch) return badRequest(c, "patch is required");

  try {
    await execFileWithInput(
      project.path,
      "git",
      ["apply", "-R", "--whitespace=nowarn"],
      `${patch}\n`,
      60_000,
    );
    return success(c, {
      undone: true,
      git: await projectGitStatus(project).catch(() => null),
    });
  } catch (err: any) {
    return badRequest(c, err.message || "Undo failed");
  }
});

app.get("/projects/:id/files", (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const requestedPath = String(c.req.query("path") || "").trim();
  const targetPath = resolveProjectFilePath(project, requestedPath);
  if (!targetPath) return badRequest(c, "file path is outside project");
  if (!fs.existsSync(targetPath)) return badRequest(c, "file not found");

  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) return badRequest(c, "path is a directory");

  const maxBytes = 1024 * 1024;
  const readBytes = Math.min(stat.size, maxBytes);
  const fd = fs.openSync(targetPath, "r");
  try {
    const buffer = Buffer.alloc(readBytes);
    fs.readSync(fd, buffer, 0, readBytes, 0);
    const binary = buffer.includes(0);
    if (binary) {
      return success(c, {
        path: path.relative(project.path, targetPath),
        absolute_path: targetPath,
        content: "",
        size: stat.size,
        truncated: stat.size > maxBytes,
        binary: true,
        language: detectLanguage(targetPath),
      });
    }
    return success(c, {
      path: path.relative(project.path, targetPath),
      absolute_path: targetPath,
      content: buffer.toString("utf8"),
      size: stat.size,
      truncated: stat.size > maxBytes,
      binary: false,
      language: detectLanguage(targetPath),
    });
  } finally {
    fs.closeSync(fd);
  }
});

app.get("/projects/:id/files/view", (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const requestedPath = String(c.req.query("path") || "").trim();
  const targetPath = resolveProjectFilePath(project, requestedPath, {
    allowTempPreview: true,
  });
  if (!targetPath) return badRequest(c, "file path is outside project");
  if (!fs.existsSync(targetPath)) return badRequest(c, "file not found");
  const stat = fs.statSync(targetPath);
  if (!stat.isFile()) return badRequest(c, "not a file");

  const headers: Record<string, string> = {
    "content-type": contentTypeForFile(targetPath),
    "cache-control": "private, max-age=3600",
  };
  if (String(c.req.query("download") || "") === "1") {
    const filename = path.basename(targetPath).replace(/[\r\n"]/g, "_");
    headers["content-disposition"] =
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(path.basename(targetPath))}`;
  }
  return new Response(fs.readFileSync(targetPath), {
    headers,
  });
});

app.get("/projects/:id/runtime-files/view", (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const requestedPath = String(c.req.query("path") || "").trim();
  const targetPath = resolveRuntimeProjectFilePath(project, requestedPath);
  if (!targetPath)
    return badRequest(c, "file path is outside codex runtime project");
  if (!fs.existsSync(targetPath)) return badRequest(c, "file not found");
  const stat = fs.statSync(targetPath);
  if (!stat.isFile()) return badRequest(c, "not a file");

  const headers: Record<string, string> = {
    "content-type": contentTypeForFile(targetPath),
    "cache-control": "private, max-age=3600",
  };
  if (String(c.req.query("download") || "") === "1") {
    const filename = path.basename(targetPath).replace(/[\r\n"]/g, "_");
    headers["content-disposition"] =
      `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(path.basename(targetPath))}`;
  }
  return new Response(fs.readFileSync(targetPath), { headers });
});

const CANVAS_COMMAND_OPERATIONS = new Set<CanvasCommandOperation>([
  "snapshot",
  "models",
  "create",
  "update",
  "connect",
  "disconnect",
  "delete",
  "run",
  "run-batch",
  "wait",
  "inspect-result",
  "script-create-input",
  "script-import-assets",
  "storyboard-create-images",
  "storyboard-regenerate-images",
  "storyboard-create-videos",
]);

app.post("/workflow/canvas/commands", async (c) => {
  const userId = currentAuthUserId(c);
  if (!userId) return badRequest(c, "Unauthorized");
  const body = await c.req.json().catch(() => ({}));
  const workflowProjectId = String(
    body.workflow_project_id || body.workflowProjectId || "",
  ).trim();
  const canvasSessionId = String(
    body.canvas_session_id || body.canvasSessionId || "",
  ).trim();
  const requestedTaskId = String(
    body.codex_task_id || body.codexTaskId || "",
  ).trim();
  const operation = String(
    body.operation || "",
  ).trim() as CanvasCommandOperation;
  if (!workflowProjectId)
    return badRequest(c, "workflow project id is required");
  if (!canvasSessionId) return badRequest(c, "canvas session id is required");
  if (!CANVAS_COMMAND_OPERATIONS.has(operation))
    return badRequest(c, "unsupported canvas command operation");
  const payload =
    body.payload &&
    typeof body.payload === "object" &&
    !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : {};
  if (operation === "run-batch") {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (!items.length) return badRequest(c, "run-batch items are required");
    if (items.length > 200)
      return badRequest(c, "run-batch supports at most 200 items");
    const nodeIds = items.map((item) =>
      String(
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>).nodeId || ""
          : "",
      ).trim(),
    );
    if (nodeIds.some((nodeId) => !nodeId))
      return badRequest(c, "every run-batch item requires nodeId");
    if (new Set(nodeIds).size !== nodeIds.length)
      return badRequest(c, "run-batch nodeId values must be unique");
    payload.concurrency = Math.max(
      1,
      Math.min(200, Math.floor(Number(payload.concurrency) || 200)),
    );
  }
  const timestamp = now();
  const requestedTask = requestedTaskId
    ? findTask(userId, requestedTaskId)
    : null;
  if (requestedTaskId) {
    if (!requestedTask) return badRequest(c, "codex task not found");
    if (requestedTask.status !== "running")
      return badRequest(c, "codex task is not running");
    if (
      requestedTask.workflowProjectId &&
      requestedTask.workflowProjectId !== workflowProjectId
    )
      return badRequest(c, "codex task scope mismatch");
    if (
      requestedTask.canvasSessionId &&
      requestedTask.canvasSessionId !== canvasSessionId
    )
      return badRequest(c, "codex task scope mismatch");
  }
  const resolvedCanvasSessionId = resolveBoundCanvasSessionId({
    state: runtimeState.canvasSessionLeases,
    userId,
    workflowProjectId,
    canvasSessionId,
  });
  const codexTask =
    requestedTask ||
    resolveCodexTaskForBridge({
      userId,
      taskId: requestedTaskId,
      workflowProjectId,
      canvasSessionId,
    });
  const store = canvasCommandsStore();
  const pixarGateError = validatePixarAnimationAdCanvasCommand({
    task: codexTask,
    operation,
    payload,
    commands: store.commands.filter(
      (item) =>
        item.userId === userId &&
        item.workflowProjectId === workflowProjectId &&
        (codexTask?.id
          ? item.codexTaskId === codexTask.id
          : item.canvasSessionId === resolvedCanvasSessionId),
    ),
  });
  if (pixarGateError) return badRequest(c, pixarGateError);
  const command: CanvasCommand = {
    id: `canvas_command_${randomUUID()}`,
    userId,
    codexTaskId: codexTask?.id,
    workflowProjectId,
    canvasSessionId: resolvedCanvasSessionId,
    operation,
    payload,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  store.commands.push(command);
  writeCanvasCommandsStore(store);
  return success(c, command);
});

app.post("/workflow/canvas/commands/claim", async (c) => {
  const userId = currentAuthUserId(c);
  if (!userId) return badRequest(c, "Unauthorized");
  const body = await c.req.json().catch(() => ({}));
  const workflowProjectId = String(
    body.workflow_project_id || body.workflowProjectId || "",
  ).trim();
  const canvasSessionId = String(
    body.canvas_session_id || body.canvasSessionId || "",
  ).trim();
  const waitMs = Math.max(
    0,
    Math.min(20_000, Number(body.wait_ms || body.waitMs || 0)),
  );
  if (!workflowProjectId || !canvasSessionId)
    return badRequest(
      c,
      "workflow project id and canvas session id are required",
    );
  const requestSignal = c.req.raw.signal;
  const deadline = Date.now() + waitMs;
  do {
    if (requestSignal.aborted) return success(c, null);
    markCanvasSessionSeen({
      state: runtimeState.canvasSessionLeases,
      userId,
      workflowProjectId,
      canvasSessionId,
    });
    const store = canvasCommandsStore();
    const activeTaskIds = new Set(
      tasksStore()
        .tasks.filter(
          (task) =>
            task.userId === userId &&
            task.workflowProjectId === workflowProjectId &&
            task.status === "running",
        )
        .map((task) => task.id),
    );
    const claim = findCanvasSessionCommandToClaim({
      state: runtimeState.canvasSessionLeases,
      commands: store.commands.filter(
        (item) => !item.codexTaskId || activeTaskIds.has(item.codexTaskId),
      ),
      userId,
      workflowProjectId,
      canvasSessionId,
    });
    let command = claim?.command;
    if (
      command &&
      claim?.rebound &&
      claim.sourceCanvasSessionId !== canvasSessionId
    ) {
      bindCanvasSession({
        state: runtimeState.canvasSessionLeases,
        userId,
        workflowProjectId,
        sourceCanvasSessionId: claim.sourceCanvasSessionId,
        targetCanvasSessionId: canvasSessionId,
      });
      store.commands.forEach((item) => {
        if (
          item.userId === userId &&
          item.workflowProjectId === workflowProjectId &&
          item.canvasSessionId === claim.sourceCanvasSessionId &&
          item.status === "pending"
        ) {
          item.canvasSessionId = canvasSessionId;
          item.updatedAt = now();
        }
      });
      command = store.commands.find((item) => item.id === command?.id);
    }
    if (command) {
      if (command.operation === "snapshot") {
        const duplicateSnapshots = store.commands.filter(
          (item) =>
            item.userId === userId &&
            item.workflowProjectId === workflowProjectId &&
            item.canvasSessionId === canvasSessionId &&
            item.codexTaskId === command?.codexTaskId &&
            item.operation === "snapshot" &&
            item.status === "pending",
        );
        const latestSnapshot =
          duplicateSnapshots[duplicateSnapshots.length - 1];
        duplicateSnapshots.forEach((item) => {
          if (item.id === latestSnapshot?.id) return;
          item.status = "cancelled";
          item.error = "已由刷新后的最新画布快照请求替代";
          item.updatedAt = now();
        });
        if (latestSnapshot) command = latestSnapshot;
      }
      command.status = "running";
      command.updatedAt = now();
      writeCanvasCommandsStore(store);
      return success(c, command);
    }
    if (Date.now() >= deadline) break;
    const completedDelay = await waitForTimeoutOrAbort(
      Math.min(400, Math.max(25, deadline - Date.now())),
      requestSignal,
    );
    if (!completedDelay) return success(c, null);
  } while (Date.now() < deadline);
  return success(c, null);
});

app.get("/workflow/canvas/commands/:id", (c) => {
  const userId = currentAuthUserId(c);
  const store = canvasCommandsStore();
  const command = store.commands.find(
    (item) => item.id === c.req.param("id") && item.userId === userId,
  );
  if (!command) return badRequest(c, "canvas command not found");
  if (
    (command.status === "completed" ||
      command.status === "failed" ||
      command.status === "cancelled") &&
    !command.consumedAt
  ) {
    command.consumedAt = now();
    writeCanvasCommandsStore(store);
  }
  return success(c, command);
});

app.post("/workflow/canvas/commands/:id/cancel", async (c) => {
  const userId = currentAuthUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const workflowProjectId = String(
    body.workflow_project_id || body.workflowProjectId || "",
  ).trim();
  const requestedCanvasSessionId = String(
    body.canvas_session_id || body.canvasSessionId || "",
  ).trim();
  const canvasSessionId = resolveBoundCanvasSessionId({
    state: runtimeState.canvasSessionLeases,
    userId,
    workflowProjectId,
    canvasSessionId: requestedCanvasSessionId,
  });
  const store = canvasCommandsStore();
  const command = store.commands.find(
    (item) => item.id === c.req.param("id") && item.userId === userId,
  );
  if (!command) return badRequest(c, "canvas command not found");
  if (
    command.workflowProjectId !== workflowProjectId ||
    command.canvasSessionId !== canvasSessionId
  ) {
    return badRequest(c, "canvas command scope mismatch");
  }
  if (command.status === "pending") {
    command.status = "cancelled";
    command.error =
      "Canvas bridge session disconnected before the command was claimed.";
    command.updatedAt = now();
    writeCanvasCommandsStore(store);
  }
  return success(c, command);
});

app.post("/workflow/canvas/commands/:id/result", async (c) => {
  const userId = currentAuthUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const workflowProjectId = String(
    body.workflow_project_id || body.workflowProjectId || "",
  ).trim();
  const canvasSessionId = String(
    body.canvas_session_id || body.canvasSessionId || "",
  ).trim();
  const store = canvasCommandsStore();
  const command = store.commands.find(
    (item) => item.id === c.req.param("id") && item.userId === userId,
  );
  if (!command) return badRequest(c, "canvas command not found");
  if (
    command.workflowProjectId !== workflowProjectId ||
    command.canvasSessionId !== canvasSessionId
  ) {
    return badRequest(c, "canvas command scope mismatch");
  }
  if (["completed", "failed", "cancelled"].includes(command.status)) {
    if (!command.consumedAt) {
      command.consumedAt = now();
      writeCanvasCommandsStore(store);
    }
    return success(c, command);
  }
  const succeeded = body.ok !== false && !String(body.error || "").trim();
  command.status = succeeded ? "completed" : "failed";
  command.result = body.result;
  command.error = succeeded
    ? ""
    : String(body.error || "canvas command failed").trim();
  command.updatedAt = now();
  writeCanvasCommandsStore(store);
  return success(c, command);
});

app.post("/platform/media/generate", async (c) => {
  const userId = currentAuthUserId(c);
  if (!userId) return badRequest(c, "Unauthorized");
  const body = await c.req.json().catch(() => ({}));
  const projectId = String(body.project_id || body.projectId || "").trim();
  const project = projectId ? findProject(userId, projectId) : null;
  if (projectId && !project) return badRequest(c, "codex project not found");
  try {
    return success(
      c,
      await generateCodexPlatformMedia({
        userId,
        project: project
          ? { id: project.id, userId: project.userId, path: project.path }
          : null,
        requestUrl: c.req.url,
        body,
      }),
    );
  } catch (err) {
    console.error("[codex platform media] failed", err);
    return serverError(c, err);
  }
});

app.get("/plugins/:pluginId/cowart/canvas", async (c) => {
  const userId = currentAuthUserId(c);
  const pluginId = safeSegment(c.req.param("pluginId"), "");
  if (pluginId !== "cowart") return badRequest(c, "unsupported Cowart plugin");
  const plugin = installedPluginMap(userId).get(pluginId);
  if (!plugin) return badRequest(c, "plugin not installed");
  const projectId = String(
    c.req.query("project_id") || c.req.query("projectId") || "",
  ).trim();
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");
  try {
    const server = await ensureCowartCanvasServer(plugin, project);
    return c.redirect(server.url, 302);
  } catch (err) {
    return serverError(c, err);
  }
});

app.get("/plugins/:pluginId/files/*", (c) => {
  const userId = currentAuthUserId(c);
  const pluginId = safeSegment(c.req.param("pluginId"), "");
  if (!pluginId) return badRequest(c, "plugin id is required");
  const plugin = installedPluginMap(userId).get(pluginId);
  if (!plugin) return badRequest(c, "plugin not installed");

  const root = path.resolve(plugin.path);
  const pathPrefix = `/plugins/${pluginId}/files/`;
  const requestPath = c.req.path || "";
  const requestedPath =
    decodeURIComponent(
      requestPath.startsWith(pathPrefix)
        ? requestPath.slice(pathPrefix.length)
        : "",
    ).trim() || "dist/index.html";
  const targetPath = path.resolve(root, requestedPath);
  if (targetPath !== root && !targetPath.startsWith(`${root}${path.sep}`)) {
    return badRequest(c, "plugin file is outside plugin directory");
  }
  if (!fs.existsSync(targetPath)) return badRequest(c, "plugin file not found");
  const stat = fs.statSync(targetPath);
  if (!stat.isFile()) return badRequest(c, "not a file");

  const headers = {
    "content-type": contentTypeForFile(targetPath),
    "cache-control": "private, max-age=3600",
  };
  if (path.extname(targetPath).toLowerCase() !== ".html") {
    return new Response(fs.readFileSync(targetPath), { headers });
  }

  const basePath = `/api/codex/plugins/${encodeURIComponent(pluginId)}/files/dist/`;
  const projectId = String(
    c.req.query("project_id") || c.req.query("projectId") || "",
  ).trim();
  const project = projectId ? findProject(userId, projectId) : null;
  const projectDir = project?.path || "";
  const canvasDir = projectDir ? path.join(projectDir, "canvas") : "";
  const bridge = projectDir
    ? [
        '<script id="zaomengCowartHostBridge">',
        `window.openai=Object.assign(window.openai||{},{
      toolOutput:${JSON.stringify({ projectDir, canvasDir, preferredDisplayMode: "fullscreen" })},
      displayMode:"fullscreen",
      availableDisplayModes:["fullscreen","inline"],
      widgetInstanceId:"zaomeng-cowart-${pluginId}"
    });`,
        `window.cowartMcp={callServerTool:async function(request){
      const response=await fetch("/api/codex/plugins/${encodeURIComponent(pluginId)}/cowart/tool",{
        method:"POST",
        credentials:"include",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({project_id:${JSON.stringify(projectId)},name:request&&request.name,arguments:request&&request.arguments})
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok)return {isError:true,content:[{type:"text",text:payload&&payload.error?payload.error:"Cowart tool failed"}]};
      return {structuredContent:payload,content:[{type:"text",text:"OK"}]};
    }};`,
        'window.dispatchEvent(new CustomEvent("openai:set_globals",{detail:{globals:window.openai}}));',
        "</script>",
      ].join("\n")
    : "";
  const html = fs
    .readFileSync(targetPath, "utf8")
    .replace(/(src|href)="\/assets\//g, `$1="${basePath}assets/`)
    .replace(/(src|href)="\/([^"/][^"]*)"/g, `$1="${basePath}$2"`)
    .replace("</head>", `${bridge}\n</head>`);
  return new Response(html, { headers });
});

function invokeCowartMcpTool(
  pluginPath: string,
  name: string,
  args: Record<string, unknown>,
) {
  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(process.execPath, ["mcp/server.mjs"], {
      cwd: pluginPath,
      env: {
        ...process.env,
        COWART_PROJECT_DIR:
          typeof args.projectDir === "string" ? args.projectDir : "",
        COWART_CANVAS_DIR:
          typeof args.canvasDir === "string" ? args.canvasDir : "",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (err: Error | null, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {
        // ignore
      }
      if (child.exitCode === null) {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
      if (err) reject(err);
      else resolve(value);
    };
    const send = (message: Record<string, unknown>) => {
      child.stdin.write(JSON.stringify(message) + "\n");
    };
    const timer = setTimeout(() => {
      const suffix = stderr.trim() ? ": " + stderr.trim() : "";
      finish(new Error("Cowart MCP tool timed out: " + name + "." + suffix));
    }, 30_000);
    timer.unref?.();

    child.on("error", (err) => finish(err));
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });
    child.on("close", (code) => {
      if (!settled && code !== 0) {
        const suffix = stderr.trim() ? ": " + stderr.trim() : "";
        finish(
          new Error("Cowart MCP server exited with " + code + "." + suffix),
        );
      }
    });
    child.on("spawn", () => {
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "ideart-cowart-bridge", version: "1.0.0" },
        },
      });
    });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
      let newline = stdout.indexOf("\n");
      while (newline >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (line) {
          try {
            const message = JSON.parse(line);
            if (message.id === 1) {
              if (message.error) {
                finish(
                  new Error(
                    message.error.message || "Cowart MCP initialize failed.",
                  ),
                );
              } else {
                send({
                  jsonrpc: "2.0",
                  method: "notifications/initialized",
                  params: {},
                });
                send({
                  jsonrpc: "2.0",
                  id: 2,
                  method: "tools/call",
                  params: { name, arguments: args },
                });
              }
            } else if (message.id === 2) {
              if (message.error) {
                finish(
                  new Error(
                    message.error.message || "Cowart MCP tool failed: " + name,
                  ),
                );
              } else if (message.result?.isError) {
                const text = Array.isArray(message.result.content)
                  ? message.result.content.find(
                      (item: any) => item?.type === "text",
                    )?.text
                  : "";
                finish(new Error(text || "Cowart MCP tool failed: " + name));
              } else {
                finish(
                  null,
                  message.result?.structuredContent ?? message.result,
                );
              }
            }
          } catch (err) {
            finish(err instanceof Error ? err : new Error(String(err)));
          }
        }
        newline = stdout.indexOf("\n");
      }
    });
  });
}

async function importCowartCanvasStorage(pluginPath: string) {
  const storagePath = path.join(pluginPath, "mcp", "lib", "canvas-storage.mjs");
  if (!fs.existsSync(storagePath)) {
    throw new Error(
      `Cowart 全局插件缺少 mcp/lib/canvas-storage.mjs，请重新安装 Cowart：${storagePath}`,
    );
  }
  const stat = fs.statSync(storagePath);
  const storageUrl = pathToFileURL(storagePath);
  storageUrl.searchParams.set("mtime", String(Math.floor(stat.mtimeMs)));
  return runtimeImport(storageUrl.href);
}

app.post("/plugins/:pluginId/cowart/tool", async (c) => {
  try {
    const userId = currentAuthUserId(c);
    const pluginId = safeSegment(c.req.param("pluginId"), "");
    if (pluginId !== "cowart") return badRequest(c, "unsupported plugin tool");
    const plugin = installedPluginMap(userId).get(pluginId);
    if (!plugin) return badRequest(c, "plugin not installed");

    const body = await c.req.json().catch(() => ({}));
    const projectId = String(body.project_id || body.projectId || "").trim();
    const project = findProject(userId, projectId);
    if (!project) return badRequest(c, "codex project not found");
    const name = String(body.name || "").trim();
    const input =
      body.arguments && typeof body.arguments === "object"
        ? body.arguments
        : {};
    const args = {
      ...input,
      projectDir: project.path,
      canvasDir: path.join(project.path, "canvas"),
    };
    const storage = await importCowartCanvasStorage(plugin.path);
    if (name === "get_cowart_canvas_state") {
      return success(
        c,
        await storage.readCowartCanvasState(args, {
          hydrateAssets: input.hydrateAssets === true,
        }),
      );
    }
    if (name === "save_cowart_canvas_state") {
      return success(
        c,
        await storage.saveCowartCanvasSnapshot(args, input.snapshot),
      );
    }
    if (name === "save_cowart_selection_state") {
      return success(
        c,
        await storage.writeCowartSelectionState(args, input.selection),
      );
    }
    if (name === "save_cowart_view_state") {
      return success(
        c,
        await storage.writeCowartViewState(args, input.viewState),
      );
    }
    if (name === "read_cowart_page_asset") {
      return success(
        c,
        await storage.readCowartPageAsset(args, { assetUrl: input.assetUrl }),
      );
    }
    if (name === "save_cowart_reference_image") {
      let pageId =
        typeof input.pageId === "string" && input.pageId.trim()
          ? input.pageId.trim()
          : "";
      if (!pageId) {
        const view = await storage.readCowartViewState(args).catch(() => null);
        pageId =
          typeof view?.viewState?.currentPageId === "string"
            ? view.viewState.currentPageId
            : "";
      }
      if (!pageId) {
        const state = await storage
          .readCowartCanvasState(args, { hydrateAssets: false })
          .catch(() => null);
        const page = Object.values(state?.snapshot?.store || {}).find(
          (record: any) => record?.typeName === "page",
        ) as any;
        pageId = typeof page?.id === "string" ? page.id : "";
      }
      return success(
        c,
        await storage.writeCowartPageAsset(args, { ...input, pageId }),
      );
    }
    if (
      name === "download_cowart_file" ||
      name === "insert_cowart_html_draft" ||
      name === "insert_cowart_image" ||
      name === "get_cowart_selection"
    ) {
      return success(c, await invokeCowartMcpTool(plugin.path, name, args));
    }
    return badRequest(c, `unsupported Cowart tool: ${name}`);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err || "Cowart tool failed");
    console.error("[codex cowart tool] failed", {
      tool: (() => {
        try {
          return String((err as any)?.tool || "");
        } catch {
          return "";
        }
      })(),
      error: message,
    });
    return success(c, {
      isError: true,
      content: [{ type: "text", text: message }],
      structuredContent: { error: message },
    });
  }
});

app.get("/projects/:id/attachments/view", (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const requestedPath = String(c.req.query("path") || "").trim();
  const targetPath =
    resolveRuntimeProjectFilePath(project, requestedPath) ||
    resolveProjectFilePath(project, requestedPath);
  if (!targetPath) return badRequest(c, "file path is outside project");
  if (!fs.existsSync(targetPath)) return badRequest(c, "file not found");
  if (
    !projectContainsFile(
      codexRuntimeAttachmentDir(project.userId, project.id),
      targetPath,
    )
  ) {
    return badRequest(c, "attachment is outside attachment directory");
  }

  return new Response(fs.readFileSync(targetPath), {
    headers: {
      "content-type": contentTypeForFile(targetPath),
      "cache-control": "private, max-age=3600",
    },
  });
});

app.post("/projects/:id/open-file", async (c) => {
  if (!isLocalProjectAccessAllowed(c)) {
    return badRequest(
      c,
      "opening local files is only available when 造梦 backend runs on this machine",
    );
  }
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const body = await c.req.json().catch(() => ({}));
  const requestedPath = String(body.path || "").trim();
  const targetPath = resolveProjectFilePath(project, requestedPath);
  if (!targetPath) return badRequest(c, "file path is outside project");
  if (!fs.existsSync(targetPath)) return badRequest(c, "file not found");

  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    process.platform === "win32"
      ? ["/c", "start", "", targetPath]
      : [targetPath];
  await new Promise<void>((resolve, reject) => {
    execFile(opener, args, { timeout: 10_000 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve();
    });
  });
  return success(c, {
    path: path.relative(project.path, targetPath),
    absolute_path: targetPath,
  });
});

app.post("/projects/:id/attachments", async (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  const body = await c.req.parseBody();
  const uploaded = body.file;
  if (!uploaded || !(uploaded instanceof File))
    return badRequest(c, "file is required");
  if (uploaded.size > codexRuntimeLimits.attachmentMaxBytes) {
    return badRequest(
      c,
      `单个附件不能超过 ${formatByteLimit(codexRuntimeLimits.attachmentMaxBytes)}`,
    );
  }
  const runtimeCapacityError = codexRuntimeCapacityError(
    userId,
    project.id,
    uploaded.size,
  );
  if (runtimeCapacityError) return badRequest(c, runtimeCapacityError);

  const attachmentDir = codexRuntimeAttachmentDir(project.userId, project.id);
  fs.mkdirSync(attachmentDir, { recursive: true });
  const currentAttachmentBytes = directorySizeBytes(
    attachmentDir,
    codexRuntimeLimits.projectAttachmentMaxBytes,
  );
  if (
    currentAttachmentBytes + uploaded.size >
    codexRuntimeLimits.projectAttachmentMaxBytes
  ) {
    return badRequest(
      c,
      `当前项目附件已达到 ${formatByteLimit(codexRuntimeLimits.projectAttachmentMaxBytes)} 上限，请先删除不再需要的附件`,
    );
  }
  const ext = path.extname(uploaded.name || "") || ".png";
  const filename = `${randomUUID()}${ext}`;
  const filePath = path.join(attachmentDir, filename);
  const fileBuffer = Buffer.from(await uploaded.arrayBuffer());
  fs.writeFileSync(filePath, fileBuffer);
  let publicUpload: Awaited<ReturnType<typeof uploadCodexPlatformFile>>;
  const existingPlatformFileId = Number(body.workflowPlatformFileId || 0);
  try {
    if (existingPlatformFileId > 0) {
      try {
        publicUpload = await resolveCodexPlatformFile(existingPlatformFileId);
      } catch (error) {
        console.warn(
          "[codex attachment] platform file reuse failed, uploading again:",
          error instanceof Error ? error.message : String(error),
        );
        publicUpload = await uploadCodexPlatformFile({
          buffer: fileBuffer,
          filename: uploaded.name || filename,
          contentType: uploaded.type,
        });
      }
    } else {
      publicUpload = await uploadCodexPlatformFile({
        buffer: fileBuffer,
        filename: uploaded.name || filename,
        contentType: uploaded.type,
      });
    }
  } catch (error) {
    try {
      fs.unlinkSync(filePath);
    } catch {}
    throw new Error(
      `附件上传造梦 API 开放平台失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  addCachedDirectoryBytes(runtimeProjectRoot(project), uploaded.size);
  addCachedDirectoryBytes(
    path.join(CODEX_RUNTIME_ROOT, "users", appServerKey(userId)),
    uploaded.size,
  );
  addCachedDirectoryBytes(CODEX_RUNTIME_ROOT, uploaded.size);
  const relativePath = relativeRuntimeProjectPath(project, filePath);
  const localUrl = `/api/codex/projects/${encodeURIComponent(project.id)}/runtime-files/view?path=${encodeURIComponent(relativePath)}`;
  const seedanceAssetId = String(body.workflowSeedanceAssetId || "").trim();
  const seedanceAssetStatus = String(
    body.workflowSeedanceAssetStatus || "",
  ).trim();
  const portraitCompliantExempt =
    String(body.portraitCompliantExempt || "")
      .trim()
      .toLowerCase() === "true";
  const mediaKind = String(body.workflowMediaKind || "")
    .trim()
    .toLowerCase();
  upsertCodexWorkflowAttachmentMetadata(
    runtimeProjectRoot(project),
    relativePath,
    {
      nodeId: String(body.workflowNodeId || "").trim() || undefined,
      sourceUrl: String(body.workflowSourceUrl || "").trim() || undefined,
      publicUrl: publicUpload.url,
      mediaKind:
        mediaKind === "video" || mediaKind === "audio" ? mediaKind : "image",
      seedanceAssetId: seedanceAssetId || undefined,
      seedanceAssetUrl:
        String(body.workflowSeedanceAssetUrl || "").trim() || undefined,
      seedanceAssetStatus: seedanceAssetStatus || undefined,
      seedanceAssetCategory:
        String(body.workflowSeedanceAssetCategory || "").trim() || undefined,
      portraitCompliantExempt,
      naturalWidth:
        Number(body.workflowNaturalWidth || 0) > 0
          ? Number(body.workflowNaturalWidth)
          : undefined,
      naturalHeight:
        Number(body.workflowNaturalHeight || 0) > 0
          ? Number(body.workflowNaturalHeight)
          : undefined,
    },
  );

  return success(c, {
    name: uploaded.name,
    type: uploaded.type,
    size: uploaded.size,
    path: relativePath,
    absolute_path: filePath,
    relative_path: relativePath,
    url: publicUpload.url,
    public_url: publicUpload.url,
    local_url: localUrl,
    platform_file_id: publicUpload.id,
    naturalWidth:
      Number(body.workflowNaturalWidth || 0) > 0
        ? Number(body.workflowNaturalWidth)
        : undefined,
    naturalHeight:
      Number(body.workflowNaturalHeight || 0) > 0
        ? Number(body.workflowNaturalHeight)
        : undefined,
  });
});

app.get("/projects/:id/terminals", (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");

  return success(
    c,
    Array.from(terminalSessions.values())
      .filter(
        (session) =>
          session.userId === userId && session.projectId === project.id,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(publicTerminalSession),
  );
});

app.post("/projects/:id/terminals", (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.param("id");
  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");
  if (!fs.existsSync(project.path))
    return badRequest(c, "project path not found");
  pruneClosedTerminalSessions();
  const activeTerminalCount = [...terminalSessions.values()].filter(
    (session) => session.userId === userId && !session.closedAt,
  ).length;
  if (activeTerminalCount >= codexRuntimeLimits.terminalMaxActivePerUser) {
    return badRequest(
      c,
      `每个用户最多同时打开 ${codexRuntimeLimits.terminalMaxActivePerUser} 个终端`,
    );
  }

  const session = createTerminalSession(userId, project);
  return success(c, publicTerminalSession(session));
});

app.get("/terminals/:terminalId", (c) => {
  const userId = currentAuthUserId(c);
  const session = findTerminalSession(userId, c.req.param("terminalId"));
  if (!session) return badRequest(c, "terminal session not found");
  const afterSeq = Number(
    c.req.query("after_seq") || c.req.query("afterSeq") || 0,
  );
  return success(
    c,
    publicTerminalSession(session, Number.isFinite(afterSeq) ? afterSeq : 0),
  );
});

app.post("/terminals/:terminalId/input", async (c) => {
  const userId = currentAuthUserId(c);
  const session = findTerminalSession(userId, c.req.param("terminalId"));
  if (!session) return badRequest(c, "terminal session not found");
  if (session.closedAt) {
    return badRequest(c, "terminal session is closed");
  }

  const body = await c.req.json().catch(() => ({}));
  const input = String(body.input ?? body.text ?? "");
  if (!input) return success(c, publicTerminalSession(session));
  session.terminal.write(input);
  session.updatedAt = now();
  return success(c, publicTerminalSession(session));
});

app.post("/terminals/:terminalId/interrupt", (c) => {
  const userId = currentAuthUserId(c);
  const session = findTerminalSession(userId, c.req.param("terminalId"));
  if (!session) return badRequest(c, "terminal session not found");
  if (!session.closedAt) {
    session.terminal.write("\x03");
  }
  return success(c, publicTerminalSession(session));
});

app.post("/terminals/:terminalId/resize", async (c) => {
  const userId = currentAuthUserId(c);
  const session = findTerminalSession(userId, c.req.param("terminalId"));
  if (!session) return badRequest(c, "terminal session not found");
  if (session.closedAt) return success(c, publicTerminalSession(session));
  const body = await c.req.json().catch(() => ({}));
  const cols = Math.max(20, Math.min(300, Number(body.cols || 100)));
  const rows = Math.max(6, Math.min(120, Number(body.rows || 24)));
  session.terminal.resize(cols, rows);
  session.updatedAt = now();
  return success(c, publicTerminalSession(session));
});

app.delete("/terminals/:terminalId", (c) => {
  const userId = currentAuthUserId(c);
  const sessionId = c.req.param("terminalId");
  const session = findTerminalSession(userId, sessionId);
  if (!session) return badRequest(c, "terminal session not found");
  if (!session.closedAt) {
    session.terminal.kill("SIGTERM");
  }
  terminalSessions.delete(sessionId);
  return success(c, { id: sessionId });
});

app.get("/tasks", (c) => {
  const userId = currentAuthUserId(c);
  const projectId = c.req.query("project_id");
  let tasks = tasksStore().tasks.filter((task) => task.userId === userId);
  if (projectId) tasks = tasks.filter((task) => task.projectId === projectId);
  tasks = tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return success(
    c,
    tasks.map((task) => publicTask(task, { includeOutputTail: false })),
  );
});

app.get("/tasks/:id", (c) => {
  const userId = currentAuthUserId(c);
  const id = c.req.param("id");
  const task = findTask(userId, id);
  if (!task) return badRequest(c, "codex task not found");
  return success(
    c,
    publicTask(task, {
      includeOutputTail: c.req.query("include_tail") !== "0",
    }),
  );
});

app.post("/tasks/:id/generations/settle", async (c) => {
  const userId = currentAuthUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const task = findTask(userId, id);
  // Canvas media may outlive a deleted chat. Settlement is idempotent and has
  // no destination once that owning task is gone, so acknowledge it quietly.
  if (!task) return success(c, { detached: true, taskId: id });
  const nodeId = String(body.node_id || body.nodeId || "").trim();
  const kind = canvasGenerationKind(
    body.kind || body.media_kind || body.mediaKind,
  );
  const requestedStatus = String(body.status || "")
    .trim()
    .toLowerCase();
  const status =
    requestedStatus === "complete" ||
    requestedStatus === "completed" ||
    requestedStatus === "success"
      ? "completed"
      : requestedStatus === "failed" || requestedStatus === "error"
        ? "failed"
        : null;
  if (!nodeId) return badRequest(c, "generation node id is required");
  if (!kind)
    return badRequest(
      c,
      "generation kind must be image, video, audio or playlist",
    );
  if (!status)
    return badRequest(c, "generation status must be complete or failed");
  const rawUrls = Array.isArray(body.result_urls || body.resultUrls)
    ? body.result_urls || body.resultUrls
    : [];
  const outputs = Array.from(
    new Set<string>(
      (rawUrls as unknown[])
        .map((value: unknown) => String(value || "").trim())
        .filter((value: string) =>
          /^(?:https?:\/\/|\/api\/|\/uploads\/)/i.test(value),
        ),
    ),
  )
    .slice(0, 200)
    .map((url, index) => ({
      url,
      name: `${codexCanvasGenerationOutputName(kind)}${rawUrls.length > 1 ? ` ${index + 1}` : ""}`,
    }));
  if (status === "completed" && outputs.length === 0) {
    return badRequest(
      c,
      "completed generation requires at least one result url",
    );
  }
  const payload = canvasGenerationEventPayload({
    kind,
    nodeKind: String(body.node_kind || body.nodeKind || kind).trim(),
    status,
    taskId: String(
      body.generation_task_id ||
        body.generationTaskId ||
        body.provider_task_id ||
        body.providerTaskId ||
        nodeId,
    ).trim(),
    nodeId,
    prompt: String(body.prompt || "").trim(),
    aspectRatio: String(body.aspect_ratio || body.aspectRatio || "").trim(),
    width: Number(body.width),
    height: Number(body.height),
    modelId: String(body.model_id || body.modelId || "").trim(),
    outputs,
    error:
      status === "failed" ? String(body.error || "画布生成失败").trim() : "",
  });
  const event: CodexTaskEvent = {
    ts: now(),
    stream: "stdout",
    type: codexCanvasGenerationEventType(kind),
    role: "tool",
    text: JSON.stringify(payload),
    raw: JSON.stringify(payload),
  };
  const logPath = path.join(LOG_ROOT, `${id}.jsonl`);
  const mergeKey = codexEventMergeKey(event);
  if (mergeKey && fs.existsSync(logPath)) {
    const existing = readCompactedCodexTaskLog(logPath).events.find(
      (candidate) => codexEventMergeKey(candidate) === mergeKey,
    );
    const existingPayload = existing
      ? firstJsonObjectFromText(existing.text || existing.raw || "")
      : null;
    const existingUrls = (
      Array.isArray(existingPayload?.outputs) ? existingPayload.outputs : []
    )
      .map((item: any) =>
        String(typeof item === "string" ? item : item?.url || "").trim(),
      )
      .filter(Boolean);
    const sameUrls =
      JSON.stringify(existingUrls) ===
      JSON.stringify(outputs.map((item) => item.url));
    if (
      existingPayload &&
      String(existingPayload.status || "") === status &&
      sameUrls
    ) {
      return success(c, { ...payload, unchanged: true });
    }
  }
  appendTaskEvent(id, event);
  return success(c, payload);
});

app.delete("/tasks/:id", (c) => {
  const userId = currentAuthUserId(c);
  const id = c.req.param("id");
  const store = tasksStore();
  const task = store.tasks.find(
    (item) => item.userId === userId && item.id === id,
  );
  if (!task) return badRequest(c, "codex task not found");
  stopTaskRuntime(id);
  deleteTaskLog(id);
  store.tasks = store.tasks.filter(
    (item) => !(item.userId === userId && item.id === id),
  );
  writeTasksStore(store);
  return success(c, { id });
});

app.get("/tasks/:id/logs", (c) => {
  const userId = currentAuthUserId(c);
  const id = c.req.param("id");
  const task = findTask(userId, id);
  if (!task) return badRequest(c, "codex task not found");
  const logPath = path.join(LOG_ROOT, `${id}.jsonl`);
  const paged = c.req.query("paged") === "1";
  if (!fs.existsSync(logPath)) {
    return success(
      c,
      paged ? { events: [], total: 0, start: 0, end: 0, has_more: false } : [],
    );
  }
  const logCache = readCompactedCodexTaskLog(logPath);
  const compacted = logCache.events;
  if (!paged) return success(c, compacted.slice(-600));

  const total = compacted.length;
  const requestedLimit = Number.parseInt(
    String(c.req.query("limit") || "600"),
    10,
  );
  const limit = Math.min(
    1000,
    Math.max(100, Number.isFinite(requestedLimit) ? requestedLimit : 600),
  );
  const requestedBefore = Number.parseInt(
    String(c.req.query("before") || total),
    10,
  );
  const end = Math.min(
    total,
    Math.max(0, Number.isFinite(requestedBefore) ? requestedBefore : total),
  );
  const start = Math.max(0, end - limit);
  const revision = String(logCache.size);
  const requestedRevision = Number.parseInt(
    String(c.req.query("revision") || ""),
    10,
  );
  const requestedEnd = Number.parseInt(String(c.req.query("end") || ""), 10);
  const canReturnDelta =
    !c.req.query("before") &&
    Number.isFinite(requestedRevision) &&
    requestedRevision >= logCache.changeFloorRevision &&
    requestedRevision <= logCache.size &&
    Number.isFinite(requestedEnd) &&
    requestedEnd <= total;
  if (canReturnDelta && requestedRevision === logCache.size) {
    return success(c, {
      events: [],
      patches: [],
      unchanged: true,
      revision,
      total,
      start: Math.max(0, total - limit),
      end: total,
      has_more: total > limit,
    });
  }
  if (canReturnDelta) {
    const patchIndices = Array.from(
      new Set(
        logCache.changes
          .filter((change) => change.revision > requestedRevision)
          .map((change) => change.index),
      ),
    ).sort((a, b) => a - b);
    let nextAppendIndex = requestedEnd;
    const deltaIsContinuous = patchIndices.every((index) => {
      if (index < requestedEnd) return true;
      if (index !== nextAppendIndex) return false;
      nextAppendIndex += 1;
      return true;
    });
    if (deltaIsContinuous) {
      return success(c, {
        events: [],
        patches: patchIndices.map((index) => ({
          index,
          event: compacted[index],
        })),
        delta: true,
        revision,
        total,
        start: Math.max(0, total - limit),
        end: total,
        has_more: total > limit,
      });
    }
  }
  return success(c, {
    events: compacted.slice(start, end),
    revision,
    total,
    start,
    end,
    has_more: start > 0,
  });
});

app.get("/threads/native", async (c) => {
  const userId = currentAuthUserId(c);
  const allowed = userThreadIds(userId);
  if (!allowed.size) return success(c, { local: [], native: [] });
  try {
    const native = filterNativeThreads(
      await appServerRpc(userId, "thread/list", {}),
      allowed,
    );
    const local = tasksStore()
      .tasks.filter((task) => task.userId === userId && task.threadId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(publicThreadTask);
    return success(c, { local, native });
  } catch (err: any) {
    return serverError(c, err.message || "Codex thread/list failed");
  }
});

app.get("/threads/:threadId/native", async (c) => {
  const userId = currentAuthUserId(c);
  const threadId = c.req.param("threadId");
  if (!userThreadIds(userId).has(threadId))
    return badRequest(c, "codex thread not found");
  try {
    const thread = await appServerRpc(userId, "thread/read", { threadId });
    return success(c, thread);
  } catch (err: any) {
    return serverError(c, err.message || "Codex thread/read failed");
  }
});

app.get("/threads/:threadId/turns/native", async (c) => {
  const userId = currentAuthUserId(c);
  const threadId = c.req.param("threadId");
  if (!userThreadIds(userId).has(threadId))
    return badRequest(c, "codex thread not found");
  try {
    const turns = await appServerRpc(userId, "thread/turns/list", { threadId });
    return success(c, turns);
  } catch (err: any) {
    return serverError(c, err.message || "Codex thread/turns/list failed");
  }
});

app.post("/tasks", async (c) => {
  const userId = currentAuthUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const projectId = String(body.project_id || "");
  const prompt = String(body.prompt || "").trim();
  const config = userConfig(userId);
  const model = String(body.model || config?.model || "").trim();
  const reasoningEffort = normalizeReasoningEffort(
    body.reasoning_effort ?? body.reasoningEffort,
  );
  const sandbox = normalizeSandbox(body.sandbox);
  const resumeTaskId = String(body.resume_task_id || "").trim();
  const clientScope = String(
    body.client_scope || body.clientScope || "",
  ).trim();
  const workflowProjectId = String(
    body.workflow_project_id || body.workflowProjectId || "",
  ).trim();
  const canvasSessionId = String(
    body.canvas_session_id || body.canvasSessionId || "",
  ).trim();
  if (!prompt) return badRequest(c, "prompt required");

  const project = findProject(userId, projectId);
  if (!project) return badRequest(c, "codex project not found");
  const runtimeCapacityError = codexRuntimeCapacityError(userId, project.id);
  if (runtimeCapacityError) return badRequest(c, runtimeCapacityError);
  const projectScopeError = codexProjectScopeError(
    project,
    clientScope,
    workflowProjectId,
  );
  if (projectScopeError) return badRequest(c, projectScopeError);
  if (!fs.existsSync(CODEX_BIN))
    return badRequest(c, "project Codex CLI is not installed");
  const images = normalizeImagePaths(project, body.images);
  const attachments = normalizeAttachmentPaths(project, [
    ...(Array.isArray(body.attachments) ? body.attachments : []),
    ...(Array.isArray(body.images) ? body.images : []),
  ]);
  const selectedContext = resolveSelectedContext(
    userId,
    body.selected_context ?? body.selectedContext,
  );
  const resumeTask = resumeTaskId
    ? tasksStore().tasks.find(
        (item) =>
          item.userId === userId &&
          item.projectId === project.id &&
          item.id === resumeTaskId,
      )
    : null;
  if (resumeTaskId && !resumeTask)
    return badRequest(c, "codex thread not found");
  if (resumeTask && !resumeTask.threadId)
    return badRequest(c, "codex thread has no session id yet");
  const resetOversizedThread = Boolean(
    resumeTask?.threadId && taskHasCodexContextSizeFailure(resumeTask.id),
  );
  const resumeThreadId = resetOversizedThread ? "" : resumeTask?.threadId || "";
  const recoveryContext =
    resetOversizedThread && resumeTask
      ? codexThreadRecoveryContext(resumeTask.id)
      : "";

  const ts = now();
  const task: CodexTask = {
    id: `codex_task_${randomUUID()}`,
    userId,
    projectId: project.id,
    projectName: project.name,
    projectPath: project.path,
    prompt,
    model,
    reasoningEffort,
    sandbox: normalizeProjectSandbox(project, sandbox),
    images,
    attachments,
    selectedContext,
    clientScope,
    workflowProjectId,
    canvasSessionId,
    threadId: resumeThreadId || undefined,
    status: "running",
    runtime: "app-server",
    outputTail: [],
    createdAt: ts,
    updatedAt: ts,
  };

  const store = tasksStore();
  store.tasks.push(task);
  writeTasksStore(store);
  if (resetOversizedThread) {
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "system",
      type: "app.contextCompaction",
      role: "system",
      text: "旧运行线程已超过上下文上限，已自动切换到干净线程继续。",
    });
  }
  appendUserMessage(task.id, prompt, images, attachments);

  const runner = runCodexAppTurn(task, { resumeThreadId, recoveryContext });
  runner.catch((err) => {
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "stderr",
      type: "app.error",
      text: err.message || "Codex app-server 启动失败",
    });
    updateTask(task.id, { status: "failed", exitCode: 1 });
  });

  return success(
    c,
    publicTask(
      updateTask(task.id, { status: "running", runtime: "app-server" }) || task,
      { includeOutputTail: false },
    ),
  );
});

app.post("/tasks/:id/messages", async (c) => {
  const userId = currentAuthUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const prompt = String(body.prompt || "").trim();
  const model = String(body.model || "").trim();
  if (!prompt) return badRequest(c, "prompt required");

  const task = findTask(userId, id);
  if (!task) return badRequest(c, "codex task not found");
  const clientScope = String(
    body.client_scope || body.clientScope || task.clientScope || "",
  ).trim();
  const workflowProjectId = String(
    body.workflow_project_id ||
      body.workflowProjectId ||
      task.workflowProjectId ||
      "",
  ).trim();
  const canvasSessionId = String(
    body.canvas_session_id ||
      body.canvasSessionId ||
      task.canvasSessionId ||
      "",
  ).trim();
  const config = userConfig(userId);
  const reasoningEffort =
    normalizeReasoningEffort(body.reasoning_effort ?? body.reasoningEffort) ||
    task.reasoningEffort ||
    "";
  const project = findProject(userId, task.projectId);
  if (!project) return badRequest(c, "codex project not found");
  const runtimeCapacityError = codexRuntimeCapacityError(userId, project.id);
  if (runtimeCapacityError) return badRequest(c, runtimeCapacityError);
  const projectScopeError = codexProjectScopeError(
    project,
    clientScope,
    workflowProjectId,
  );
  if (projectScopeError) return badRequest(c, projectScopeError);
  const images = normalizeImagePaths(project, body.images);
  const attachments = normalizeAttachmentPaths(project, [
    ...(Array.isArray(body.attachments) ? body.attachments : []),
    ...(Array.isArray(body.images) ? body.images : []),
  ]);
  const selectedContext = resolveSelectedContext(
    userId,
    body.selected_context ?? body.selectedContext,
  );
  const wasRunning = task.status === "running" || task.status === "queued";
  const resetOversizedThread = Boolean(
    task.threadId && taskHasCodexContextSizeFailure(task.id),
  );
  const resumeThreadId = resetOversizedThread ? "" : task.threadId || "";
  const recoveryContext = resetOversizedThread
    ? codexThreadRecoveryContext(task.id)
    : "";
  if (wasRunning) {
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "system",
      type: "app.turn_interrupted",
      text: "已根据新的输入停止上一轮回复",
    });
    stopTaskRuntime(task.id, "cancelled");
  }
  if (!task.threadId && !wasRunning && !resetOversizedThread) {
    const ts = now();
    const newTask: CodexTask = {
      id: `codex_task_${randomUUID()}`,
      userId,
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      prompt,
      model: model || task.model || config?.model || "",
      reasoningEffort,
      sandbox: normalizeProjectSandbox(project, body.sandbox || task.sandbox),
      images,
      attachments,
      selectedContext,
      clientScope,
      workflowProjectId,
      canvasSessionId,
      status: "running",
      runtime: "app-server",
      outputTail: [],
      createdAt: ts,
      updatedAt: ts,
    };
    const store = tasksStore();
    store.tasks.push(newTask);
    writeTasksStore(store);
    appendUserMessage(newTask.id, prompt, images, attachments);
    const runner = runCodexAppTurn(newTask, {});
    runner.catch((err) => {
      appendTaskEvent(newTask.id, {
        ts: now(),
        stream: "stderr",
        type: "app.error",
        text: err.message || "Codex app-server 启动失败",
      });
      updateTask(newTask.id, { status: "failed", exitCode: 1 });
    });
    return success(c, publicTask(newTask, { includeOutputTail: false }));
  }

  updateTask(task.id, {
    prompt,
    model: model || task.model || config?.model || "",
    reasoningEffort,
    sandbox: normalizeProjectSandbox(project, body.sandbox || task.sandbox),
    images,
    attachments,
    selectedContext,
    clientScope,
    workflowProjectId,
    canvasSessionId,
    ...(resetOversizedThread ? { threadId: undefined } : {}),
    status: "running",
    exitCode: null,
    signal: null,
  });
  if (resetOversizedThread) {
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "system",
      type: "app.contextCompaction",
      role: "system",
      text: "旧运行线程已超过上下文上限，已自动切换到干净线程继续。",
    });
  }
  appendUserMessage(task.id, prompt, images, attachments);

  const updated = tasksStore().tasks.find((item) => item.id === id) || task;
  runCodexAppTurn(updated, { resumeThreadId, recoveryContext }).catch((err) => {
    appendTaskEvent(task.id, {
      ts: now(),
      stream: "stderr",
      type: "app.error",
      text: err.message || "Codex app-server 续聊失败",
    });
    updateTask(task.id, { status: "failed", exitCode: 1 });
  });
  return success(
    c,
    publicTask(
      updateTask(id, { status: "running", runtime: "app-server" }) || updated,
      { includeOutputTail: false },
    ),
  );
});

app.post("/tasks/:id/cancel", (c) => {
  const userId = currentAuthUserId(c);
  const id = c.req.param("id");
  const task = findTask(userId, id);
  if (!task) return badRequest(c, "codex task not found");
  updateTask(id, { status: "cancelled" });
  stopTaskRuntime(id);
  appendTaskEvent(id, {
    ts: now(),
    stream: "system",
    type: "app.turn_interrupted",
    text: "任务已停止",
  });
  return success(
    c,
    publicTask(updateTask(id, { status: "cancelled" }) || task, {
      includeOutputTail: false,
    }),
  );
});

app.get("/status", (c) => {
  return success(c, getCodexWorkspaceStatus());
});

export const codexWorkspaceApp = app;
export default app;
