"use client";

import Image from "@/opencut-compat/next-image";
import { usePathname } from "@/opencut-compat/next-navigation";
import {
  AlertCircle,
  Box,
  Clapperboard,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileCode2,
  FolderOpen,
  History,
  ImagePlus,
  ListChecks,
  Loader2,
  MessageCircleMore,
  Music,
  Plus,
  Search,
  Send,
  Sparkles,
  SquareTerminal,
  Square,
  Trash2,
  Video,
  Wrench,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  codexSkillDisplayDescription,
  codexSkillDisplayName,
  isCodexSkillCreator,
  isFrontEndSelectableCodexSkill,
  SKILL_CREATOR_STARTER_PROMPT,
} from "@/workflow/ideart/lib/codex/skill-visibility";
import {
  normalizeWorkflowGenerationKind,
  workflowGenerationMediaKind,
  workflowGenerationStatusTitle,
  type WorkflowGenerationKind,
} from "@/workflow/ideart/lib/codex/workflow-generation-kind";
import {
  isWorkflowChatAttachmentUrl,
  settleWorkflowChatAttachmentRequest,
  WORKFLOW_CHAT_ATTACHMENTS_EVENT,
  type WorkflowChatAttachmentPayload,
} from "@/workflow/ideart/lib/codex/workflow-chat-attachments";
import {
  settleTerminalTaskActivities,
  type CodexTaskLifecycleStatus,
} from "./codex-task-terminal-state";
import {
  CodexModelPicker,
  normalizeCodexModelOptions,
  type CodexModelOption,
  type CodexModelsResponse,
} from "./codex-model-picker";
import { codexMediaDisplayUrl } from "./codex-media-url";
import { CodexMediaImage } from "./codex-media-image";
import {
  workflowApiUrl,
  workflowFetch as fetch,
} from "@/workflow/backend/client";

const LAUNCHER_POSITION_STORAGE_KEY = "zaomeng-codex-launcher-position";
const LAUNCHER_MARGIN = 12;
const LAUNCHER_DESKTOP_SIZE = 72;
const LAUNCHER_MOBILE_SIZE = 64;
const DIRECTOR_LAUNCHER_DESKTOP_WIDTH = 126;
const DIRECTOR_LAUNCHER_DESKTOP_HEIGHT = 40;
const DIRECTOR_LAUNCHER_MOBILE_WIDTH = 116;
const DIRECTOR_LAUNCHER_MOBILE_HEIGHT = 38;
const DIRECTOR_LAUNCHER_DESKTOP_TOP = 20;
const DIRECTOR_LAUNCHER_MOBILE_TOP = 16;
const WORKFLOW_ATTACHMENT_SOURCE_STORAGE_KEY =
  "zaomeng-codex-workflow-attachment-sources-v1";
const CODEX_LOG_PAGE_SIZE = 80;
const TIMELINE_BOTTOM_THRESHOLD = 24;
const TIMELINE_TOP_LOAD_THRESHOLD = 64;

type CodexSupportWidgetProps = {
  label?: string;
  scope?: "global" | "workflow";
  launcherIcon?: "default" | "director";
  workflowProjectId?: string | null;
  canvasSessionId?: string | null;
};

function CodexAgentAvatar({
  label,
  variant = "default",
  className = "",
  imageSizes = "72px",
  priority = false,
}: {
  label: string;
  variant?: CodexSupportWidgetProps["launcherIcon"];
  className?: string;
  imageSizes?: string;
  priority?: boolean;
}) {
  const baseClassName = `relative shrink-0 overflow-hidden rounded-full border border-[var(--color-token-border)] bg-[var(--color-token-bg-secondary)] ${className}`;
  if (variant === "director") {
    return (
      <div
        className={`${baseClassName} grid place-items-center border-white/12 bg-[#2B2B2B] text-[#E4E9F0] shadow-[0_10px_24px_rgba(0,0,0,0.24)]`}
      >
        <MessageCircleMore className="h-[52%] w-[52%]" strokeWidth={1.9} />
        <span className="sr-only">{label}</span>
      </div>
    );
  }
  return (
    <div className={baseClassName}>
      <Image
        src="/images/codex-support.png"
        alt={label}
        fill
        sizes={imageSizes}
        className="object-cover"
        priority={priority}
      />
    </div>
  );
}

type CodexConfig = {
  provider?: string;
  base_url?: string;
  model: string;
  api_key_set?: boolean;
};

type CodexProject = {
  id: string;
  name: string;
  path: string;
  workflow_project_id?: string;
};

type CodexEvent = {
  ts: string;
  stream: "stdout" | "stderr" | "system";
  type?: string;
  role?: "user" | "assistant" | "system" | "tool";
  text: string;
  raw?: string;
};

type CodexLogPage = {
  events: CodexEvent[];
  patches?: Array<{ index: number; event: CodexEvent }>;
  delta?: boolean;
  unchanged?: boolean;
  revision?: string;
  total: number;
  start: number;
  end: number;
  has_more: boolean;
};

type CodexLogWindow = {
  taskId: string;
  total: number;
  start: number;
  end: number;
  hasMore: boolean;
  revision: string;
};

function codexEventRevision(event: CodexEvent) {
  return [
    event.ts,
    event.stream,
    event.type || "",
    event.role || "",
    String(event.text || "").length,
    String(event.raw || "").length,
  ].join("\u0000");
}

function sameCodexEventSequence(previous: CodexEvent[], next: CodexEvent[]) {
  return (
    previous.length === next.length &&
    previous.every(
      (event, index) =>
        codexEventRevision(event) === codexEventRevision(next[index]),
    )
  );
}

type CodexTask = {
  id: string;
  project_id: string;
  project_name?: string;
  project_path?: string;
  prompt?: string;
  thread_id?: string;
  model?: string;
  images?: string[];
  attachments?: string[];
  attachment_details?: Attachment[];
  selected_context?: SelectedContext | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  output_tail?: CodexEvent[];
  created_at?: string;
  updated_at?: string;
};

function codexTaskViewRevision(task: CodexTask) {
  return JSON.stringify({
    id: task.id,
    project_id: task.project_id,
    project_name: task.project_name,
    project_path: task.project_path,
    prompt: task.prompt,
    thread_id: task.thread_id,
    model: task.model,
    images: task.images || [],
    attachments: task.attachments || [],
    attachment_details: task.attachment_details || [],
    selected_context: task.selected_context || null,
    status: task.status,
    created_at: task.created_at,
  });
}

function sameCodexTaskView(previous: CodexTask | null, next: CodexTask | null) {
  if (!previous || !next) return previous === next;
  return codexTaskViewRevision(previous) === codexTaskViewRevision(next);
}

function sameCodexTaskList(previous: CodexTask[], next: CodexTask[]) {
  return (
    previous.length === next.length &&
    previous.every(
      (task, index) =>
        codexTaskViewRevision(task) === codexTaskViewRevision(next[index]),
    )
  );
}

type CodexSkill = {
  id: string;
  name: string;
  description: string;
  path: string;
  scope: string;
};

type CodexPlugin = {
  id: string;
  name: string;
  description?: string;
  path?: string;
  scope?: string;
  icon?: string;
  category?: string;
  installed?: boolean;
  status?: "installed" | "available" | "stub" | "disabled";
  apps?: string[];
  mcpServers?: string[];
  marketplaceName?: string;
  keywords?: string[];
  interface?: {
    displayName?: string;
    shortDescription?: string;
    longDescription?: string;
    developerName?: string;
    category?: string;
    capabilities?: string[];
    brandColor?: string;
    defaultPrompt?: string[];
  };
};

type SelectedContext = {
  id?: string;
  name: string;
  type: "skill" | "mention" | "plugin";
  path: string;
};

type Attachment = {
  name: string;
  path: string;
  relative_path: string;
  url?: string;
  public_url?: string;
  local_url?: string;
  size?: number;
  type?: string;
  platform_file_id?: number;
  workflowNodeId?: string;
  workflowSourceUrl?: string;
  workflowSeedanceAssetId?: string;
  workflowSeedanceAssetUrl?: string;
  workflowSeedanceAssetStatus?: string;
  workflowSeedanceAssetCategory?: string;
  portraitCompliantExempt?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
};

type WorkflowAttachmentSource = {
  nodeId?: string;
  sourceUrl?: string;
  publicUrl?: string;
  naturalWidth?: number;
  naturalHeight?: number;
};

function taskAttachmentDetails(task: CodexTask | null | undefined) {
  if (task?.attachment_details?.length) return task.attachment_details;
  return (task?.attachments || task?.images || []).map((filePath) => {
    const mediaKind = mediaKindForPath(filePath);
    return {
      name: filePath.split("/").pop() || "上传附件",
      path: filePath,
      relative_path: filePath,
      type: attachmentMimeForKind(mediaKind, filePath),
    } satisfies Attachment;
  });
}

function readWorkflowAttachmentSources() {
  if (typeof window === "undefined")
    return new Map<string, WorkflowAttachmentSource>();
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(WORKFLOW_ATTACHMENT_SOURCE_STORAGE_KEY) ||
        "[]",
    );
    if (!Array.isArray(value))
      return new Map<string, WorkflowAttachmentSource>();
    return new Map<string, WorkflowAttachmentSource>(
      value
        .filter(
          (entry): entry is [string, WorkflowAttachmentSource] =>
            Array.isArray(entry) &&
            typeof entry[0] === "string" &&
            Boolean(entry[1]) &&
            typeof entry[1] === "object",
        )
        .slice(-160),
    );
  } catch {
    return new Map<string, WorkflowAttachmentSource>();
  }
}

type SupportSession = {
  config: CodexConfig;
  project: CodexProject;
  task: CodexTask | null;
};

type TimelineItem = {
  id: string;
  kind:
    | "message"
    | "activity"
    | "tool"
    | "artifact"
    | "generation"
    | "changes"
    | "error";
  role?: "user" | "assistant";
  text: string;
  detail?: string;
  title?: string;
  subtitle?: string;
  activityType?: "command" | "file" | "search" | "tool" | "plan";
  images?: Array<{ path: string; name: string; url: string }>;
  files?: Array<{
    path: string;
    name: string;
    url: string;
    mediaKind:
      | "image"
      | "video"
      | "audio"
      | "presentation"
      | "spreadsheet"
      | "document"
      | "pdf"
      | "markdown"
      | "file";
  }>;
  mediaKind?:
    | "image"
    | "video"
    | "audio"
    | "presentation"
    | "spreadsheet"
    | "document"
    | "pdf"
    | "markdown"
    | "file";
  url?: string;
  previewUrl?: string;
  generationStatus?: "generating" | "complete" | "failed";
  generationKind?: WorkflowGenerationKind;
  generationPrompt?: string;
  generationError?: string;
  generationTaskId?: string;
  generationTaskType?: string;
  generationStatusUrl?: string;
  generationModelId?: string;
  generationModelName?: string;
  generationNodeId?: string;
  generationNodeKind?: string;
  generationAspectRatio?: string;
  generationWidth?: number;
  generationHeight?: number;
  generationProgress?: number;
  resultUrls?: string[];
  changedFiles?: TimelineChangedFile[];
  stats?: { added: number; removed: number };
  commandCount?: number;
  streaming?: boolean;
  interrupted?: boolean;
};

type ActivitySliceKind = "thinking" | "search" | "plan" | "tool" | "explore";
type TimelineFile = {
  path: string;
  name: string;
  url: string;
  mediaKind: NonNullable<TimelineItem["mediaKind"]>;
};
type TimelineChangedFile = {
  path: string;
  name: string;
  displayPath: string;
  action: string;
  added: number;
  removed: number;
  patch?: string;
};
type MediaPreview = {
  url: string;
  title: string;
  mediaKind: "image" | "video";
};
type LauncherPosition = { x: number; y: number };
type LauncherDragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};
type ArtifactExtractionMode = "text" | "structured" | "user";
type TabContextMenu = { tab: CodexTask; x: number; y: number };
type ProviderTaskResult = {
  status: "generating" | "complete" | "failed";
  kind: WorkflowGenerationKind;
  urls: string[];
  error?: string;
};
type ProviderTaskResultMap = Record<string, ProviderTaskResult>;
type WorkflowCanvasGenerationSettledDetail = {
  source?: string;
  commandId?: string;
  codexTaskId?: string;
  nodeId?: string;
  status?: "complete" | "failed";
  kind?: WorkflowGenerationKind;
  nodeKind?: string;
  prompt?: string;
  resultUrls?: string[];
  error?: string;
};
type CodexWorkflowGenerationReference = {
  url: string;
  path?: string;
  name?: string;
  mediaKind?: TimelineItem["mediaKind"];
  nodeId?: string;
  sourceUrl?: string;
  naturalWidth?: number;
  naturalHeight?: number;
};
type CodexWorkflowGenerationDetail = {
  source: "codex";
  codexTaskId?: string;
  codexTaskStatus?: string;
  itemId: string;
  nodeId?: string;
  providerTaskId?: string;
  taskType?: string;
  statusUrl?: string;
  status: "generating" | "complete" | "failed";
  kind: WorkflowGenerationKind;
  nodeKind?: string;
  prompt: string;
  modelId?: string;
  modelName?: string;
  resultUrls?: string[];
  references?: CodexWorkflowGenerationReference[];
  aspectRatio?: string;
  width?: number;
  height?: number;
  error?: string;
};

type ApiOptions = RequestInit & { json?: unknown };
type JsonObject = Record<string, unknown>;

function asJsonObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function readJsonPath(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    const object = asJsonObject(current);
    if (!object) return undefined;
    current = object[key];
  }
  return current;
}

function apiErrorMessage(payload: unknown, status: number) {
  const error = readJsonPath(payload, ["error"]);
  const nestedErrorMessage = readJsonPath(error, ["message"]);
  const message = readJsonPath(payload, ["message"]);
  return String(
    nestedErrorMessage || error || message || payload || `请求失败: ${status}`,
  );
}

async function codexFetch<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.json !== undefined)
    headers.set("Content-Type", "application/json");
  const response = await fetch(`/api/codex${path}`, {
    ...options,
    headers,
    body:
      options.json !== undefined ? JSON.stringify(options.json) : options.body,
    credentials: "include",
    cache: "no-store",
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(apiErrorMessage(payload, response.status));
  }
  return payload as T;
}

function parseEventJson(event: CodexEvent): unknown {
  try {
    return JSON.parse(event.text || event.raw || "{}");
  } catch {
    try {
      return JSON.parse(event.raw || "{}");
    } catch {
      return null;
    }
  }
}

function compactLine(value: unknown, max = 180) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

type TokenUsageSummary = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

function numberFromTokenValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function formatTokenNumber(value: number) {
  if (value >= 1000000)
    return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}m`;
  if (value >= 1000)
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function tokenUsageFromEvent(event: CodexEvent): TokenUsageSummary | null {
  const type = String(event.type || "");
  if (
    type !== "app.token_usage" &&
    !/token_usage|tokenUsage|token_count/i.test(type)
  )
    return null;
  const data = parseEventJson(event);
  const candidates = [
    readJsonPath(data, ["params", "tokenUsage", "total"]),
    readJsonPath(data, ["params", "tokenUsage", "last"]),
    readJsonPath(data, ["tokenUsage", "total"]),
    readJsonPath(data, ["tokenUsage", "last"]),
    readJsonPath(data, ["params", "usage"]),
    readJsonPath(data, ["usage"]),
    readJsonPath(data, ["params"]),
    data,
  ];
  for (const candidate of candidates) {
    const inputTokens = numberFromTokenValue(
      readJsonPath(candidate, ["inputTokens"]) ||
        readJsonPath(candidate, ["input_tokens"]) ||
        readJsonPath(candidate, ["promptTokens"]) ||
        readJsonPath(candidate, ["prompt_tokens"]),
    );
    const outputTokens = numberFromTokenValue(
      readJsonPath(candidate, ["outputTokens"]) ||
        readJsonPath(candidate, ["output_tokens"]) ||
        readJsonPath(candidate, ["completionTokens"]) ||
        readJsonPath(candidate, ["completion_tokens"]),
    );
    const totalTokens = numberFromTokenValue(
      readJsonPath(candidate, ["totalTokens"]) ||
        readJsonPath(candidate, ["total_tokens"]) ||
        readJsonPath(candidate, ["tokens"]) ||
        inputTokens + outputTokens,
    );
    if (inputTokens || outputTokens || totalTokens) {
      return {
        inputTokens,
        outputTokens,
        totalTokens: totalTokens || inputTokens + outputTokens,
      };
    }
  }
  const match = String(event.text || "").match(
    /输入\s*([\d,]+)\s*\/\s*输出\s*([\d,]+)/,
  );
  if (match) {
    const inputTokens = numberFromTokenValue(match[1].replace(/,/g, ""));
    const outputTokens = numberFromTokenValue(match[2].replace(/,/g, ""));
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }
  return null;
}

function latestTokenUsage(events: CodexEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const usage = tokenUsageFromEvent(events[index]);
    if (usage) return usage;
  }
  return null;
}

function tokenUsageLabel(usage: TokenUsageSummary | null) {
  if (!usage) return null;
  const label =
    usage.inputTokens || usage.outputTokens
      ? `输入 ${formatTokenNumber(usage.inputTokens)} · 输出 ${formatTokenNumber(usage.outputTokens)}`
      : `${formatTokenNumber(usage.totalTokens)} tokens`;
  const title = `Token 用量：输入 ${usage.inputTokens.toLocaleString()} · 输出 ${usage.outputTokens.toLocaleString()} · 合计 ${usage.totalTokens.toLocaleString()}`;
  return { label, title };
}

const MAX_TIMELINE_COMMAND_DETAIL = 48 * 1024;

function boundedTimelineDetail(
  value: unknown,
  limit = MAX_TIMELINE_COMMAND_DETAIL,
) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  const marker = `\n...[${text.length - limit} characters omitted]...\n`;
  const available = Math.max(0, limit - marker.length);
  const headLength = Math.ceil(available * 0.55);
  const tailLength = Math.max(0, available - headLength);
  return `${text.slice(0, headLength)}${marker}${tailLength ? text.slice(-tailLength) : ""}`;
}

function attachmentUrl(projectId: string, filePath: string) {
  if (
    isExternalUrl(filePath) ||
    /^data:/i.test(filePath) ||
    /^blob:/i.test(filePath) ||
    /^\/(?:api|uploads)\//.test(filePath)
  ) {
    return filePath;
  }
  const params = new URLSearchParams({ path: filePath });
  const route = /^(?:attachments|artifacts)\//.test(filePath)
    ? "runtime-files"
    : "files";
  if (typeof window !== "undefined" && window.electronAPI) {
    return workflowApiUrl(
      "/api/codex/projects/" +
        encodeURIComponent(projectId) +
        "/" +
        route +
        "/view?" +
        params.toString(),
    );
  }
  return `/api/codex/projects/${encodeURIComponent(projectId)}/${route}/view?${params.toString()}`;
}

function fileExt(filePath = "") {
  const clean = String(filePath || "").split(/[?#]/)[0];
  const name = clean.split("/").pop() || "";
  if (!name.includes(".")) return "";
  return name.split(".").pop()?.toLowerCase() || "";
}

function isExternalUrl(value?: string) {
  return /^https?:\/\//i.test(String(value || ""));
}

function isPublicUploadUrl(value?: string) {
  return /^\/uploads\/codex-files\//.test(String(value || ""));
}

function isCodexProjectFileViewUrl(projectId: string, value: string) {
  if (!projectId || !value) return false;
  try {
    const parsed = new URL(
      value,
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    );
    return (
      parsed.pathname ===
        `/api/codex/projects/${encodeURIComponent(projectId)}/files/view` ||
      parsed.pathname ===
        `/api/codex/projects/${encodeURIComponent(projectId)}/runtime-files/view`
    );
  } catch {
    return false;
  }
}

function projectPathFromCodexProjectFileViewUrl(
  projectId: string,
  value: string,
) {
  if (!isCodexProjectFileViewUrl(projectId, value)) return "";
  try {
    const parsed = new URL(
      value,
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    );
    return String(parsed.searchParams.get("path") || "").trim();
  } catch {
    return "";
  }
}

function proxiedMediaSourceUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(
      raw,
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    );
    if (
      parsed.pathname === "/api/image-proxy" ||
      parsed.pathname === "/api/video-proxy"
    ) {
      return String(parsed.searchParams.get("url") || "").trim();
    }
  } catch {}
  return "";
}

function workflowAttachmentDisplayUrl(
  value: string,
  mediaKind: TimelineItem["mediaKind"],
) {
  return codexMediaDisplayUrl(value, mediaKind || "file");
}

function looksLikeProjectRelativeMediaPath(value: string) {
  const raw = String(value || "").trim();
  if (!raw || isExternalUrl(raw) || isWorkflowChatAttachmentUrl(raw))
    return false;
  if (
    raw
      .split(/[?#]/)[0]
      .split("/")
      .some((segment) => segment === "..")
  )
    return false;
  return Boolean(fileExt(raw));
}

function attachmentPreviewUrl(projectId: string, item: Attachment) {
  const explicitUrl = String(item.public_url || item.url || "").trim();
  const mediaKind =
    mediaKindForPath(
      explicitUrl || item.path || item.relative_path || item.name,
    ) || "file";
  if (explicitUrl) return codexMediaDisplayUrl(explicitUrl, mediaKind);
  const localUrl = String(item.local_url || "").trim();
  if (localUrl) return codexMediaDisplayUrl(localUrl, mediaKind);
  const path = String(item.path || item.relative_path || "").trim();
  return projectId && path
    ? codexMediaDisplayUrl(attachmentUrl(projectId, path), mediaKind)
    : "";
}

function projectFileUrl(projectId: string, filePath: string) {
  if (isPublicUploadUrl(filePath)) return filePath;
  const params = new URLSearchParams({ path: filePath });
  const route = /^(?:attachments|artifacts)\//.test(filePath)
    ? "runtime-files"
    : "files";
  if (typeof window !== "undefined" && window.electronAPI) {
    return workflowApiUrl(
      "/api/codex/projects/" +
        encodeURIComponent(projectId) +
        "/" +
        route +
        "/view?" +
        params.toString(),
    );
  }
  return `/api/codex/projects/${encodeURIComponent(projectId)}/${route}/view?${params.toString()}`;
}

function mediaKindForPath(filePath: string): TimelineItem["mediaKind"] {
  const ext = fileExt(filePath);
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "avif", "bmp"].includes(ext))
    return "image";
  if (["mp4", "mov", "webm", "mkv", "avi", "m4v", "ogv", "wmv"].includes(ext))
    return "video";
  if (["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext)) return "audio";
  if (["ppt", "pptx", "key", "odp"].includes(ext)) return "presentation";
  if (["xls", "xlsx", "xlsm", "csv", "tsv", "numbers", "ods"].includes(ext))
    return "spreadsheet";
  if (["doc", "docx", "pages", "odt", "rtf", "txt"].includes(ext))
    return "document";
  if (ext === "pdf") return "pdf";
  if (["md", "mdx"].includes(ext)) return "markdown";
  return "file";
}

function mediaKindLabel(kind: TimelineItem["mediaKind"]) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  if (kind === "audio") return "音频";
  if (kind === "presentation") return "演示文稿";
  if (kind === "spreadsheet") return "表格";
  if (kind === "document") return "文档";
  if (kind === "pdf") return "PDF";
  if (kind === "markdown") return "Markdown";
  return "文件";
}

function attachmentMimeForKind(kind: TimelineItem["mediaKind"], path: string) {
  if (kind === "image") return "image/*";
  if (kind === "video") return "video/*";
  if (kind === "audio") return "audio/*";
  if (kind === "pdf") return "application/pdf";
  if (kind === "presentation")
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (kind === "spreadsheet")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (kind === "document") return "application/octet-stream";
  return fileExt(path) ? "application/octet-stream" : undefined;
}

function extensionForMime(type: string) {
  const mime = String(type || "").toLowerCase();
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("svg")) return "svg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("ogg")) return "ogg";
  return "";
}

function ensureFileNameExtension(
  name: string,
  type: string,
  source: string,
  fallback: string,
) {
  const cleanName = String(name || "")
    .trim()
    .replace(/[\\/:\0]/g, "-");
  const sourceExt = fileExt(source);
  const mimeExt = extensionForMime(type);
  const ext = sourceExt || mimeExt;
  const base = cleanName || fallback;
  if (!ext || fileExt(base)) return base;
  return `${base}.${ext}`;
}

function statusLabelForTask(status?: CodexTask["status"]) {
  if (status === "running" || status === "queued") return "进行中";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已停止";
  return "已完成";
}

function pluginDisplayName(plugin: CodexPlugin) {
  return plugin.interface?.displayName || plugin.name || plugin.id;
}

function pluginIsCowart(plugin: CodexPlugin) {
  return [plugin.id, plugin.name, plugin.path]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes("cowart");
}

function isCowartClosePrompt(value: string) {
  const text = String(value || "")
    .trim()
    .toLowerCase();
  return (
    Boolean(text) &&
    (/关闭\s*(cowart|画布|canvas)/i.test(text) ||
      /(close|hide)\s*(cowart|canvas)/i.test(text))
  );
}

function cowartPromptFromMessage(message: unknown) {
  if (typeof message === "string") return message.trim();
  const object = asJsonObject(message);
  if (!object) return "";
  if (object.prompt) return String(object.prompt).trim();
  if (typeof object.content === "string") return object.content.trim();
  if (Array.isArray(object.content)) {
    return object.content
      .map((item) => {
        const part = asJsonObject(item);
        return part?.type === "text" ? String(part.text || "").trim() : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return "";
}

function pluginSearchText(plugin: CodexPlugin) {
  return [
    plugin.id,
    plugin.name,
    plugin.description,
    plugin.category,
    plugin.interface?.displayName,
    plugin.interface?.shortDescription,
    plugin.interface?.longDescription,
    ...(plugin.interface?.capabilities || []),
    ...(plugin.keywords || []),
    ...(plugin.apps || []),
    ...(plugin.mcpServers || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pluginHasAppSurface(plugin: CodexPlugin) {
  const text = pluginSearchText(plugin);
  return (
    Boolean(plugin.apps?.length) ||
    /\b(cowart|canvas|canva|paint|draw|design|image|visual|board|whiteboard)\b/i.test(
      text,
    ) ||
    /画布|画板|设计|绘图|生图|视觉/.test(text)
  );
}

function pluginContextPath(plugin: CodexPlugin) {
  if (plugin.path?.startsWith("plugin://") || plugin.path?.startsWith("app://"))
    return plugin.path;
  return `plugin://${plugin.name || plugin.id}`;
}

function findPluginForContext(
  plugins: CodexPlugin[],
  context?: SelectedContext | null,
) {
  if (!context || context.type !== "plugin") return null;
  const contextText =
    `${context.id || ""} ${context.name || ""} ${context.path || ""}`.toLowerCase();
  return (
    plugins.find((plugin) => {
      const id = String(plugin.id || "").toLowerCase();
      const name = String(plugin.name || "").toLowerCase();
      return Boolean(
        (id && contextText.includes(id)) ||
        (name && contextText.includes(name)) ||
        (id === "cowart" && /cowart/.test(contextText)),
      );
    }) || null
  );
}

function cowartFrameUrl(plugin: CodexPlugin, projectId: string) {
  const pluginId = encodeURIComponent(plugin.id || plugin.name || "cowart");
  const params = new URLSearchParams({ project_id: projectId });
  if (typeof window !== "undefined" && window.electronAPI) {
    return workflowApiUrl(
      "/api/codex/plugins/" + pluginId + "/cowart/canvas?" + params.toString(),
    );
  }
  return `/api/codex/plugins/${pluginId}/cowart/canvas?${params.toString()}`;
}

function eventRequestsCowartWidget(event: CodexEvent) {
  const data = eventItemData(event);
  const payload = eventPayloadItem(data);
  const toolName = toolNameFromData(data);
  const pluginId = firstStringValue(data, [
    ["params", "item", "pluginId"],
    ["item", "pluginId"],
    ["pluginId"],
  ]);
  const resourceUri = firstStringValue(data, [
    ["params", "item", "mcpAppResourceUri"],
    ["item", "mcpAppResourceUri"],
    ["mcpAppResourceUri"],
    ["params", "item", "result", "_meta", "openai/outputTemplate"],
    ["item", "result", "_meta", "openai/outputTemplate"],
    ["result", "_meta", "openai/outputTemplate"],
  ]);
  const payloadText = stringifyEventDetail(payload);
  return (
    /render_cowart_canvas_widget/i.test(toolName) ||
    /cowart/i.test(pluginId) ||
    /ui:\/\/widget\/cowart\/canvas\.html/i.test(resourceUri) ||
    /cowart-canvas-widget/i.test(payloadText)
  );
}

function latestCowartWidgetSignal(events: CodexEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (eventRequestsCowartWidget(events[index])) {
      return [
        events[index].ts,
        events[index].type || events[index].stream,
        index,
      ].join("-");
    }
  }
  return "";
}

function tabStatusClass(status?: CodexTask["status"]) {
  if (status === "running" || status === "queued") return "running";
  if (status === "failed" || status === "cancelled") return "failed";
  return "done";
}

function formatTaskTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function taskPreview(task: CodexTask) {
  const prompt = sanitizeVisibleText(
    removeGeneratedPathText(task.prompt || ""),
  );
  if (prompt) return compactLine(prompt, 72);
  const firstMessage = (task.output_tail || []).find(
    (event) => event.role === "user" || event.type === "user_message",
  );
  const text = sanitizeVisibleText(
    removeGeneratedPathText(firstMessage?.text || ""),
  );
  return compactLine(text, 72) || "未命名对话";
}

function taskTabTitle(task: CodexTask) {
  return compactLine(taskPreview(task), 28);
}

function isImageAttachment(item: Attachment) {
  return (
    String(item.type || "").startsWith("image/") ||
    mediaKindForPath(item.path || item.name) === "image"
  );
}

function artifactTitleForFile(filePath: string, type: string) {
  const mediaKind = mediaKindForPath(filePath);
  if (type === "imageGeneration") return "生成图片";
  if (type === "imageView") return "生成图片";
  if (mediaKind === "video") return filePath.split("/").pop() || "生成视频";
  if (mediaKind === "presentation")
    return filePath.split("/").pop() || "演示文稿";
  if (mediaKind === "spreadsheet") return filePath.split("/").pop() || "表格";
  const display = filePath.split("/").pop() || filePath;
  return display || "文件";
}

function artifactUrl(projectId: string, filePath: string) {
  if (!filePath) return "";
  if (isExternalUrl(filePath)) return filePath;
  if (isPublicUploadUrl(filePath)) return filePath;
  return projectId ? projectFileUrl(projectId, filePath) : "";
}

function downloadUrlForProjectFileUrl(url: string) {
  if (!url || isExternalUrl(url) || !url.startsWith("/api/codex/projects/"))
    return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}download=1`;
}

function isProjectArtifactPath(filePath: string) {
  const path = normalizeArtifactPath(filePath);
  return /^(?:attachments|artifacts|\.codex\/outputs|\.codex-artifacts|\.codex-attachments|public\/uploads|output|outputs)\//.test(
    path,
  );
}

const SOURCE_PATH_ROOTS = new Set([
  "app",
  "assets",
  "backend",
  "build",
  "components",
  "coverage",
  "dist",
  "docs",
  "e2e",
  "frontend",
  "lib",
  "node_modules",
  "pages",
  "prisma",
  "public",
  "scripts",
  "src",
  "static",
  "styles",
  "test",
  "tests",
  "__tests__",
]);

function isGeneratedWorkspaceArtifactPath(filePath: string) {
  const path = normalizeArtifactPath(filePath);
  if (
    !path ||
    isExternalUrl(path) ||
    path.startsWith("/") ||
    !path.includes("/")
  )
    return false;
  if (path.split("/").some((segment) => segment === "..")) return false;
  const [root] = path.split("/");
  const normalizedRoot = root.toLowerCase();
  if (normalizedRoot.startsWith(".") && !normalizedRoot.startsWith(".codex-"))
    return false;
  if (SOURCE_PATH_ROOTS.has(normalizedRoot)) return false;
  return Boolean(fileExt(path));
}

function isRenderableArtifactPath(
  filePath: string,
  mode: ArtifactExtractionMode,
) {
  if (!filePath) return false;
  if (mode === "user") return true;
  if (isPublicUploadUrl(filePath)) return true;
  if (isProjectArtifactPath(filePath)) return true;
  if (
    mode === "structured" &&
    /^\/(?:tmp|var\/folders|private\/var\/folders)\//.test(filePath)
  )
    return true;
  if (mode === "text")
    return isExternalUrl(filePath) && mediaKindForPath(filePath) !== "file";
  if (isGeneratedWorkspaceArtifactPath(filePath)) return true;
  if (isExternalUrl(filePath)) return mode === "structured";
  return false;
}

function stripQueryAndHash(value: string) {
  return value.split(/[?#]/)[0];
}

function decodePathMaybe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeArtifactPath(value: string) {
  const cleaned = cleanArtifactPath(value);
  if (!cleaned) return "";
  if (isExternalUrl(cleaned)) return cleaned;

  try {
    const parsed = new URL(
      cleaned,
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    );
    if (
      /^\/api\/codex\/projects\/[^/]+\/(?:files|runtime-files)\/view$/i.test(
        parsed.pathname,
      )
    ) {
      const projectPath = parsed.searchParams.get("path") || "";
      if (projectPath) return normalizeArtifactPath(projectPath);
    }
  } catch {}

  let pathValue = decodePathMaybe(stripQueryAndHash(cleaned))
    .replace(/^file:\/\//i, "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\/+/, "");

  const supportMarker = "/codex-support/";
  const supportIndex = pathValue.lastIndexOf(supportMarker);
  if (supportIndex >= 0) {
    pathValue = pathValue.slice(supportIndex + supportMarker.length);
  } else {
    const publicUploadMarker = "/uploads/codex-files/";
    const publicUploadIndex = pathValue.lastIndexOf(publicUploadMarker);
    if (publicUploadIndex >= 0) {
      pathValue = pathValue.slice(publicUploadIndex);
    }
    for (const marker of [
      "/artifacts/",
      "/attachments/",
      "/.codex/outputs/",
      "/.codex-artifacts/",
      "/.codex-attachments/",
      "/public/uploads/",
      "/outputs/",
      "/output/",
    ]) {
      const markerIndex = pathValue.lastIndexOf(marker);
      if (markerIndex >= 0) {
        pathValue = `${marker.slice(1)}${pathValue.slice(markerIndex + marker.length)}`;
        break;
      }
    }
  }

  const normalizedPath = pathValue
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");

  if (normalizedPath.startsWith(".codex/outputs/wavespeed-media/")) {
    return `output/${normalizedPath.slice(".codex/outputs/".length)}`;
  }
  return normalizedPath;
}

function artifactDedupeKey(value: string) {
  const normalized = normalizeArtifactPath(value);
  if (!normalized) return "";
  if (isExternalUrl(normalized)) {
    try {
      const url = new URL(normalized);
      return `${url.origin}${url.pathname}`.toLowerCase();
    } catch {
      return normalized.toLowerCase();
    }
  }
  return normalized.toLowerCase();
}

function parseJsonMaybe(value: unknown) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const ARTIFACT_PATH_PATTERN =
  /(?:\/[^\s`'"<>]+\.(?:png|jpe?g|webp|gif|svg|avif|bmp|mp4|mov|webm|mkv|avi|m4v|ogv|wmv|mp3|wav|m4a|ogg|flac|aac|pptx?|key|odp|xlsx?|xlsm|csv|tsv|numbers|ods|docx?|pages|odt|rtf|txt|pdf|mdx?)|(?:\.?\/)?(?:(?:output|outputs|\.codex\/outputs|\.codex-artifacts|\.codex-attachments|public\/uploads|uploads\/codex-files)[^\s`'"<>]*|(?:[^\s`'"<>/:]+\/)+[^\s`'"<>]+)\.(?:png|jpe?g|webp|gif|svg|avif|bmp|mp4|mov|webm|mkv|avi|m4v|ogv|wmv|mp3|wav|m4a|ogg|flac|aac|pptx?|key|odp|xlsx?|xlsm|csv|tsv|numbers|ods|docx?|pages|odt|rtf|txt|pdf|mdx?))(?:[?#][^\s`'"<>]*)?/gi;

function cleanArtifactPath(value: string) {
  return String(value || "")
    .trim()
    .replace(/^`+|`+$/g, "")
    .replace(/[，。；;、]+$/g, "");
}

function artifactFileFromPath(
  pathValue: unknown,
  nameValue: unknown,
  projectId = "",
  mode: ArtifactExtractionMode = "structured",
) {
  const path = normalizeArtifactPath(String(pathValue || ""));
  if (!path) return null;
  if (!isRenderableArtifactPath(path, mode)) return null;
  const mediaKind = mediaKindForPath(path) || "file";
  const looksLikeProjectArtifact =
    path.includes(".codex-artifacts") ||
    path.includes(".codex-attachments") ||
    path.startsWith("artifacts/") ||
    path.startsWith("attachments/");
  const looksLikeFile =
    mediaKind !== "file" || Boolean(fileExt(path)) || looksLikeProjectArtifact;
  if (!looksLikeFile) return null;
  return {
    path,
    name: String(nameValue || path.split(/[?#]/)[0].split("/").pop() || "文件"),
    url: artifactUrl(projectId, path),
    mediaKind,
  };
}

function isTimelineFile(value: TimelineFile | null): value is TimelineFile {
  return Boolean(value);
}

function extractArtifactsFromText(value: string, projectId = "") {
  const items: TimelineFile[] = [];
  const seen = new Set<string>();
  for (const match of String(value || "").matchAll(ARTIFACT_PATH_PATTERN)) {
    const file = artifactFileFromPath(match[0], "", projectId, "text");
    const key = file ? artifactDedupeKey(file.path) : "";
    if (!file || seen.has(key)) continue;
    seen.add(key);
    items.push(file);
  }
  return items;
}

function removeGeneratedPathText(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => {
      const text = line.trim();
      if (!text) return line;
      ARTIFACT_PATH_PATTERN.lastIndex = 0;
      const hasArtifactPath = ARTIFACT_PATH_PATTERN.test(text);
      ARTIFACT_PATH_PATTERN.lastIndex = 0;
      if (!hasArtifactPath) return line;
      if (
        /^(?:[-*]\s*)?(?:图片|图像|视频|音频|文件|文档|PPT|PDF|表格)?(?:路径|地址|下载地址)\s*[:：]/i.test(
          text,
        )
      )
        return false;
      const withoutPath = text
        .replace(ARTIFACT_PATH_PATTERN, "")
        .replace(/[`*\s:：，。；;、-]/g, "");
      ARTIFACT_PATH_PATTERN.lastIndex = 0;
      if (!withoutPath) return false;
      return line
        .replace(ARTIFACT_PATH_PATTERN, "")
        .replace(/`+/g, "")
        .replace(/\s+([，。；;、])/g, "$1")
        .trimEnd();
    })
    .filter((line): line is string => line !== false)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeVisibleText(value: unknown) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "已隐藏凭证")
    .replace(/\bwsk_(?:live|test)_[A-Za-z0-9_-]{12,}/gi, "已隐藏凭证")
    .replace(
      /\b(?:api[_-]?key|token|secret|access[_-]?key)\s*[:=]\s*[A-Za-z0-9_.-]{12,}/gi,
      "访问凭证: 已隐藏",
    )
    .replace(
      /图片\s*(?:模型|能力)\s*[:：]?\s*(?:openai\/)?gpt-image-[A-Za-z0-9_.-]*/gi,
      "图片能力",
    )
    .replace(
      /视频\s*(?:模型|能力)\s*[:：]?\s*grok[A-Za-z0-9_.-]*/gi,
      "视频能力",
    )
    .replace(
      /(?:openai\/)?gpt-image-[A-Za-z0-9_.-]*(?:\/text-to-image)?/gi,
      "图片能力",
    )
    .replace(/\bgpt-image-[A-Za-z0-9_.-]*/gi, "图片能力")
    .replace(/\bgrok[A-Za-z0-9_.-]*/gi, "视频能力")
    .replace(/https?:\/\/(?:www\.)?wavespeed\.ai\/?/gi, "服务官网")
    .replace(/\bWaveSpeed\b/gi, "媒体服务")
    .replace(/CODEX_HOME/g, "工作目录")
    .replace(
      /(?:\/Users|\/var|\/tmp|\/private\/var)\/[^\s`'"<>，。；;、)]+/g,
      "工作文件",
    )
    .replace(/\bCodex\b/gi, "造梦智能体")
    .replace(/API\s*Key|api[_-]?key/gi, "访问凭证")
    .replace(/Base\s*URL/gi, "服务地址")
    .replace(/供应商/g, "服务")
    .replace(/模型/g, "能力");
}

function friendlyCodexTimelineErrorText(value: unknown, raw: unknown = null) {
  const text = String(value || "");
  const merged = `${text} ${JSON.stringify(raw || {})}`;
  if (
    /quota exceeded|usage[_\s-]*limit[_\s-]*exceeded|insufficient quota|check your plan and billing details/i.test(
      merged,
    )
  ) {
    return "当前造梦智能体对话额度暂不可用，请稍后重试或联系管理员补充对话额度。";
  }
  if (/\b429\b|too many requests|exceeded retry limit/i.test(merged)) {
    return "当前造梦智能体请求过于频繁或对话额度受限，请稍后重试。";
  }
  if (/401|unauthorized|invalid api key|authentication/i.test(merged)) {
    return "造梦智能体服务认证异常，请联系管理员处理。";
  }
  if (/403|forbidden|permission/i.test(merged)) {
    return "造梦智能体服务权限异常，请联系管理员处理。";
  }
  if (/stream disconnected|connection reset|reconnecting/i.test(merged)) {
    return "造梦智能体响应中断，请稍后重试。";
  }
  return sanitizeVisibleText(text);
}

function extractArtifactsFromValue(value: unknown, projectId = "") {
  const items: TimelineFile[] = [];
  const seen = new Set<string>();
  const add = (pathValue: unknown, nameValue?: unknown) => {
    const file = artifactFileFromPath(
      pathValue,
      nameValue,
      projectId,
      "structured",
    );
    const key = file ? artifactDedupeKey(file.path) : "";
    if (!file || seen.has(key)) return;
    seen.add(key);
    items.push(file);
  };
  const object = parseJsonMaybe(value);
  const collectPathLikeFields = (
    candidate: any,
    keys: string[],
    nameValue?: unknown,
  ) => {
    for (const key of keys) {
      const raw = candidate?.[key];
      if (Array.isArray(raw))
        raw.forEach((entry) =>
          add(entry, nameValue || candidate?.name || candidate?.title),
        );
      else if (raw) add(raw, nameValue || candidate?.name || candidate?.title);
    }
  };
  const scan = (candidate: any, artifactContext = false) => {
    if (!candidate) return;
    if (typeof candidate === "string") {
      if (artifactContext) add(candidate);
      return;
    }
    if (typeof candidate !== "object") return;
    const rawType = String(
      candidate.type ||
        candidate.kind ||
        candidate.artifactType ||
        candidate.mediaKind ||
        "",
    ).toLowerCase();
    const typeSignalsArtifact =
      /artifact|imagegeneration|imageview|video|audio|presentation|spreadsheet|document|asset|media/.test(
        rawType,
      );
    collectPathLikeFields(candidate, [
      "result",
      "savedPath",
      "saved_path",
      "localPath",
      "local_path",
      "outputPath",
      "output_path",
      "outputUrl",
      "output_url",
      "output_file",
      "outputFile",
      "fileUrl",
      "file_url",
      "downloadUrl",
      "download_url",
      "imageUrl",
      "image_url",
      "videoUrl",
      "video_url",
      "audioUrl",
      "audio_url",
    ]);
    if (artifactContext || typeSignalsArtifact) {
      collectPathLikeFields(candidate, [
        "filePath",
        "file_path",
        "path",
        "src",
        "url",
        "uri",
        "resourceUri",
        "resource_uri",
        "previewUrl",
        "preview_url",
        "artifactUrl",
        "artifact_url",
      ]);
    }
    for (const key of [
      "artifact",
      "output",
      "document",
      "presentation",
      "spreadsheet",
      "asset",
      "media",
    ]) {
      if (candidate[key]) scan(candidate[key], true);
    }
    for (const key of [
      "artifacts",
      "outputs",
      "assets",
      "media",
      "files",
      "resultFiles",
      "result_files",
      "items",
    ]) {
      if (Array.isArray(candidate[key]))
        candidate[key].forEach((item: unknown) => scan(item, true));
    }
    if (candidate.result && typeof candidate.result === "object")
      scan(candidate.result, true);
    if (candidate.data && typeof candidate.data === "object")
      scan(candidate.data, true);
    if (typeSignalsArtifact && Array.isArray(candidate.files)) {
      candidate.files.forEach((item: unknown) => scan(item, true));
    }
  };
  scan(object);
  return items;
}

function shouldExtractStructuredArtifacts(type: string, data: unknown) {
  if (
    /imageGeneration|imageView|videoGeneration|audioGeneration|artifact|presentation|spreadsheet|document/i.test(
      type,
    )
  )
    return true;
  const payload = eventPayloadItem(data);
  const payloadType = String(
    readJsonPath(payload, ["type"]) ||
      readJsonPath(payload, ["kind"]) ||
      readJsonPath(payload, ["artifactType"]) ||
      "",
  );
  const tool = toolNameFromData(data);
  const hasArtifactPayload = Boolean(
    readJsonPath(payload, ["artifact"]) ||
    readJsonPath(payload, ["artifacts"]) ||
    readJsonPath(payload, ["outputs"]) ||
    readJsonPath(payload, ["files"]) ||
    readJsonPath(payload, ["result", "files"]) ||
    readJsonPath(payload, ["result", "artifacts"]) ||
    readJsonPath(payload, ["result", "outputs"]) ||
    readJsonPath(payload, ["result", "fileUrl"]) ||
    readJsonPath(payload, ["result", "downloadUrl"]) ||
    readJsonPath(payload, ["data", "outputs"]),
  );
  return (
    hasArtifactPayload ||
    /artifact|imagegeneration|imageview|video|audio|presentation|spreadsheet|document|asset|media/i.test(
      `${payloadType} ${tool}`,
    )
  );
}

function extractStructuredArtifactsForEvent(
  type: string,
  data: unknown,
  projectId = "",
) {
  return shouldExtractStructuredArtifacts(type, data)
    ? extractArtifactsFromValue(data, projectId)
    : [];
}

function generationEventPayload(event: CodexEvent, raw?: unknown) {
  const type = String(event.type || "");
  const data = raw === undefined ? eventItemData(event) : raw;
  const payload = eventPayloadItem(data);
  const payloadType = String(
    readJsonPath(payload, ["type"]) || readJsonPath(data, ["type"]) || "",
  );
  if (
    !/imageGeneration|videoGeneration|audioGeneration/i.test(
      `${type} ${payloadType}`,
    )
  )
    return null;
  return asJsonObject(payload) || asJsonObject(data);
}

function normalizeGenerationStatus(
  value: unknown,
): "generating" | "complete" | "failed" {
  const status = String(value || "")
    .trim()
    .toLowerCase();
  if (/fail|error|cancel|reject|timeout/.test(status)) return "failed";
  if (/succeed|success|complete|completed|done|finish/.test(status))
    return "complete";
  return "generating";
}

function generationKindFromPayload(
  event: CodexEvent,
  payload: JsonObject | null,
  files: TimelineFile[] = [],
): WorkflowGenerationKind {
  const signal = [
    event.type,
    payload?.type,
    payload?.kind,
    payload?.taskType,
    payload?.mediaKind,
    payload?.outputType,
    payload?.category,
  ]
    .map((value) => String(value || ""))
    .join(" ");
  const nodeKind = String(payload?.nodeKind || payload?.node_kind || "").trim();
  if (nodeKind) return normalizeWorkflowGenerationKind(signal, nodeKind);
  if (files.some((file) => file.mediaKind === "audio")) return "audio";
  if (files.some((file) => file.mediaKind === "video")) return "video";
  return normalizeWorkflowGenerationKind(signal);
}

function generationResultFiles(
  payload: JsonObject | null,
  projectId: string,
  providerResult?: ProviderTaskResult,
) {
  const files = [
    ...extractArtifactsFromValue(payload, projectId),
    ...(providerResult?.urls || [])
      .map((url, index) =>
        artifactFileFromPath(
          url,
          `生成结果 ${index + 1}`,
          projectId,
          "structured",
        ),
      )
      .filter(isTimelineFile),
  ];
  return files.filter(
    (file, index, list) =>
      list.findIndex(
        (item) => artifactDedupeKey(item.path) === artifactDedupeKey(file.path),
      ) === index,
  );
}

function timelineGenerationFromEvent(
  event: CodexEvent,
  raw: unknown,
  projectId: string,
  providerTaskResults: ProviderTaskResultMap,
  fallbackId: string,
  codexTaskId = "",
): TimelineItem | null {
  const payload = generationEventPayload(event, raw);
  if (!payload) return null;
  const taskId = String(
    payload.taskId ||
      payload.task_id ||
      payload.providerTaskId ||
      payload.backgroundTaskId ||
      payload.jobId ||
      "",
  ).trim();
  const statusUrl = String(
    payload.statusUrl || payload.status_url || "",
  ).trim();
  const prompt = String(
    payload.revisedPrompt ||
      payload.prompt ||
      payload.inputPrompt ||
      payload.finalPrompt ||
      "",
  ).trim();
  const nodeId = String(payload.nodeId || payload.node_id || "").trim();
  const preliminaryKind = generationKindFromPayload(event, payload, []);
  const providerResult =
    (taskId ? providerTaskResults[taskId] : undefined) ||
    (statusUrl ? providerTaskResults[statusUrl] : undefined) ||
    (codexTaskId && nodeId
      ? providerTaskResults[`canvas:${codexTaskId}:node:${nodeId}`]
      : undefined) ||
    (codexTaskId && prompt
      ? providerTaskResults[
          `canvas:${codexTaskId}:prompt:${preliminaryKind}:${prompt}`
        ]
      : undefined);
  const files = generationResultFiles(payload, projectId, providerResult);
  const kind =
    providerResult?.kind || generationKindFromPayload(event, payload, files);
  const payloadStatus = normalizeGenerationStatus(
    payload.status || payload.task_status || payload.state,
  );
  const status =
    providerResult?.status || (files.length > 0 ? "complete" : payloadStatus);
  const title = workflowGenerationStatusTitle(kind, status);
  const resultUrls = files.map((file) => file.url).filter(Boolean);
  const mediaKind = workflowGenerationMediaKind(kind);
  return {
    id: `generation-${taskId || fallbackId}`,
    kind: "generation",
    text: title,
    title,
    subtitle:
      status === "generating"
        ? "正在等待生成结果"
        : files[0]?.name || mediaKindLabel(mediaKind),
    detail: prompt,
    mediaKind,
    url: resultUrls[0] || "",
    previewUrl: resultUrls[0] || "",
    files,
    generationStatus: status,
    generationKind: kind,
    generationPrompt: prompt,
    generationError: providerResult?.error,
    generationTaskId: taskId,
    generationTaskType: String(
      payload.taskType || payload.task_type || "",
    ).trim(),
    generationStatusUrl: statusUrl,
    generationModelId: String(
      payload.modelId || payload.model || payload.runtimeModelId || "",
    ).trim(),
    generationModelName: String(payload.modelName || "").trim(),
    generationNodeId: nodeId,
    generationNodeKind: String(
      payload.nodeKind || payload.node_kind || "",
    ).trim(),
    generationAspectRatio: String(
      payload.aspectRatio || payload.aspect_ratio || "",
    ).trim(),
    generationWidth:
      Number(payload.width || payload.naturalWidth || payload.natural_width) ||
      undefined,
    generationHeight:
      Number(
        payload.height || payload.naturalHeight || payload.natural_height,
      ) || undefined,
    generationProgress: Number.isFinite(Number(payload.progress))
      ? Math.max(0, Math.min(1, Number(payload.progress)))
      : undefined,
    resultUrls,
    streaming: status === "generating",
  };
}

function collectProviderTaskMedia(
  payload: unknown,
  kind: WorkflowGenerationKind,
) {
  const urls: string[] = [];
  const expectedMediaKind = workflowGenerationMediaKind(kind);
  const push = (value: unknown) => {
    const raw = typeof value === "string" ? value.trim() : "";
    if (!raw) return;
    if (!/^(data:|blob:|\/|https?:\/\/)/i.test(raw)) return;
    const mediaKind = mediaKindForPath(raw);
    if (mediaKind !== expectedMediaKind) return;
    urls.push(workflowAttachmentDisplayUrl(raw, expectedMediaKind));
  };
  const visit = (value: unknown, keyHint = "") => {
    if (!value) return;
    if (typeof value === "string") {
      if (
        /url|file|media|result|image|video|audio|output|download/i.test(keyHint)
      )
        push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, keyHint));
      return;
    }
    if (typeof value !== "object") return;
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (
        /^(url|urls|image|images|image_url|imageUrl|video|videos|video_url|videoUrl|audio|audios|audio_url|audioUrl|file_url|fileUrl|media_url|mediaUrl|download_url|downloadUrl|output_url|outputUrl|result|results|task_result|data|outputs|assets)$/i.test(
          key,
        )
      ) {
        visit(entry, key);
      }
    });
  };
  visit(payload);
  return Array.from(new Set(urls.filter(Boolean)));
}

function providerTaskStatus(
  payload: unknown,
): "generating" | "complete" | "failed" {
  const status = String(
    readJsonPath(payload, ["data", "task_status"]) ||
      readJsonPath(payload, ["task_status"]) ||
      readJsonPath(payload, ["data", "status"]) ||
      readJsonPath(payload, ["status"]) ||
      readJsonPath(payload, ["data", "raw", "data", "status"]) ||
      "",
  )
    .trim()
    .toLowerCase();
  if (/fail|error|cancel|reject|timeout/.test(status)) return "failed";
  if (/succeed|success|complete|completed|done|finish/.test(status))
    return "complete";
  return "generating";
}

function providerTaskError(payload: unknown) {
  const candidates = [
    readJsonPath(payload, ["data", "error", "message"]),
    readJsonPath(payload, ["error", "message"]),
    readJsonPath(payload, ["data", "error_message"]),
    readJsonPath(payload, ["error_message"]),
    readJsonPath(payload, ["data", "message"]),
    readJsonPath(payload, ["message"]),
    readJsonPath(payload, ["data", "raw", "data", "error"]),
    readJsonPath(payload, ["data", "error"]),
    readJsonPath(payload, ["error"]),
  ];
  const message = candidates.find(
    (value) => typeof value === "string" && value.trim(),
  );
  return typeof message === "string" ? message.trim() : "";
}

async function fetchProviderTaskResult(
  item: TimelineItem,
  signal?: AbortSignal,
): Promise<ProviderTaskResult> {
  const kind =
    item.generationKind || normalizeWorkflowGenerationKind(item.mediaKind);
  let url = String(item.generationStatusUrl || "").trim();
  if (!url && item.generationTaskId) {
    if (!item.generationTaskType)
      return { status: "generating", kind, urls: [] };
    const params = new URLSearchParams({ taskId: item.generationTaskId });
    params.set("type", item.generationTaskType);
    if (item.generationModelId) params.set("modelId", item.generationModelId);
    url = `/api/chat/task-status?${params.toString()}`;
  }
  if (!url) return { status: "generating", kind, urls: [] };
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");
  if (!response.ok) {
    if (response.status >= 500 || response.status === 429)
      return { status: "generating", kind, urls: [] };
    return {
      status: "failed",
      kind,
      urls: [],
      error: apiErrorMessage(payload, response.status),
    };
  }
  const urls = collectProviderTaskMedia(payload, kind);
  const status = providerTaskStatus(payload);
  return {
    status: urls.length > 0 && status === "complete" ? "complete" : status,
    kind,
    urls,
    error:
      status === "failed" ? providerTaskError(payload) || undefined : undefined,
  };
}

function extractArtifactsFromCommandOutput(value: string, projectId = "") {
  if (
    /"ok"\s*:\s*true[\s\S]*"type"\s*:\s*"(?:image|video|audio|playlist)"[\s\S]*"outputs"\s*:\s*\[/i.test(
      String(value || ""),
    )
  ) {
    return [];
  }
  const artifacts = [
    ...extractArtifactsFromValue(value, projectId),
    ...extractArtifactsFromText(value, projectId),
  ];
  return artifacts.filter(
    (artifact, artifactIndex, list) =>
      list.findIndex(
        (item) =>
          artifactDedupeKey(item.path) === artifactDedupeKey(artifact.path),
      ) === artifactIndex,
  );
}

function pushArtifactItems(
  items: TimelineItem[],
  artifacts: TimelineFile[],
  id: string,
  fallbackType: string,
) {
  if (!artifacts.length) return false;
  const existingPaths = new Set(
    items.flatMap(
      (item) => item.files?.map((file) => artifactDedupeKey(file.path)) || [],
    ),
  );
  artifacts.forEach((artifact, artifactIndex) => {
    const dedupeKey = artifactDedupeKey(artifact.path);
    if (existingPaths.has(dedupeKey)) return;
    existingPaths.add(dedupeKey);
    items.push({
      id: `${id}-artifact-${artifactIndex}`,
      kind: "artifact",
      title: artifactTitleForFile(artifact.path, fallbackType),
      text: artifact.name,
      detail: artifact.path,
      subtitle: mediaKindLabel(artifact.mediaKind),
      mediaKind: artifact.mediaKind,
      url: artifact.url,
      previewUrl:
        artifact.mediaKind === "image" || artifact.mediaKind === "video"
          ? artifact.url
          : "",
      files: [artifact],
    });
  });
  return true;
}

function pushChangedFilesItem(
  items: TimelineItem[],
  files: TimelineChangedFile[],
  id: string,
  streaming = false,
) {
  if (!files.length) return false;
  const stats = files.reduce(
    (acc, file) => ({
      added: acc.added + (file.added || 0),
      removed: acc.removed + (file.removed || 0),
    }),
    { added: 0, removed: 0 },
  );
  items.push({
    id: `${id}-changes`,
    kind: "changes",
    text: changedFilesTitle(files, streaming),
    title: changedFilesTitle(files, streaming),
    subtitle: files
      .map((file) => file.displayPath)
      .slice(0, 2)
      .join("、"),
    activityType: "file",
    changedFiles: files,
    stats,
    streaming,
  });
  return true;
}

function userEventImages(event: CodexEvent, projectId = "") {
  return userEventFiles(event, projectId)
    .filter((file) => file.mediaKind === "image")
    .map((file) => ({ path: file.path, name: file.name, url: file.url }));
}
void userEventImages;

function userEventFiles(event: CodexEvent, projectId = "") {
  const data = parseEventJson(event);
  const parts =
    readJsonPath(data, ["params", "item", "content"]) ||
    readJsonPath(data, ["item", "content"]) ||
    [];
  const fromContent = Array.isArray(parts)
    ? parts
        .map((part) => {
          const object = asJsonObject(part);
          const path =
            object?.type === "localImage"
              ? object.path
              : object?.type === "file" || object?.type === "localFile"
                ? object.path || object.filePath
                : "";
          return path
            ? artifactFileFromPath(
                path,
                object?.name || object?.label,
                projectId,
                "user",
              )
            : null;
        })
        .filter(isTimelineFile)
    : [];
  const images =
    readJsonPath(data, ["images"]) || readJsonPath(data, ["ideartImages"]);
  const attachments =
    readJsonPath(data, ["attachments"]) ||
    readJsonPath(data, ["ideartAttachments"]);
  const directFiles = [
    ...(Array.isArray(images) ? images : []),
    ...(Array.isArray(attachments) ? attachments : []),
  ]
    .map((filePath) => artifactFileFromPath(filePath, "", projectId, "user"))
    .filter(isTimelineFile);
  return [...fromContent, ...directFiles].filter(
    (file, index, list) =>
      list.findIndex(
        (item) => artifactDedupeKey(item.path) === artifactDedupeKey(file.path),
      ) === index,
  );
}

function timelineFileKey(file: { path: string }) {
  return artifactDedupeKey(file.path) || file.path;
}

function mergeTimelineFiles(
  previous: TimelineFile[] = [],
  next: TimelineFile[] = [],
) {
  const seen = new Set<string>();
  return [...previous, ...next].filter((file) => {
    const key = timelineFileKey(file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function userMessageTextSignature(text: string) {
  return sanitizeVisibleText(removeGeneratedPathText(text))
    .replace(/\s+/g, " ")
    .trim();
}

function userMessageSignature(text: string, files: Array<{ path: string }>) {
  return [
    userMessageTextSignature(text),
    ...files.map(timelineFileKey).sort(),
  ].join("|");
}

function mergeUserTimelineItem(target: TimelineItem, next: TimelineItem) {
  const files = mergeTimelineFiles(target.files || [], next.files || []);
  target.files = files;
  target.images = files
    .filter((file) => file.mediaKind === "image")
    .map((file) => ({ path: file.path, name: file.name, url: file.url }));
}

function dedupeMirroredUserMessages(items: TimelineItem[]) {
  const result: TimelineItem[] = [];
  const activeUserMessagesBySignature = new Map<string, TimelineItem>();
  const activeUserMessagesByText = new Map<string, TimelineItem>();

  for (const item of items) {
    if (item.kind === "message" && item.role === "assistant") {
      activeUserMessagesBySignature.clear();
      activeUserMessagesByText.clear();
      result.push(item);
      continue;
    }

    if (item.kind === "message" && item.role === "user") {
      const signature = userMessageSignature(item.text, item.files || []);
      const textSignature = userMessageTextSignature(item.text);
      const previous =
        (signature ? activeUserMessagesBySignature.get(signature) : null) ||
        (textSignature ? activeUserMessagesByText.get(textSignature) : null);
      if (previous) {
        mergeUserTimelineItem(previous, item);
        continue;
      }
      if (signature) activeUserMessagesBySignature.set(signature, item);
      if (textSignature) activeUserMessagesByText.set(textSignature, item);
    }

    result.push(item);
  }

  return result;
}

function collapseCommandActivityRows(items: TimelineItem[]) {
  const result: TimelineItem[] = [];
  let turnItems: TimelineItem[] = [];

  const flushTurn = () => {
    if (!turnItems.length) return;
    const commandRows = turnItems.filter(
      (item) => item.kind === "tool" && item.activityType === "command",
    );
    if (commandRows.length <= 1) {
      result.push(...turnItems);
      turnItems = [];
      return;
    }

    const firstCommand = commandRows[0];
    const latestCommand = commandRows[commandRows.length - 1];
    const activeCommand = [...commandRows]
      .reverse()
      .find((item) => item.streaming);
    const latestFailed = Boolean(latestCommand.title?.includes("失败"));
    const displayCommand = latestFailed
      ? latestCommand
      : activeCommand || latestCommand;
    const commandCount = commandRows.reduce(
      (count, item) => count + Math.max(1, item.commandCount || 1),
      0,
    );
    const detail = commandRows
      .map((item) => String(item.detail || "").trim())
      .filter(Boolean)
      .join("\n\n");
    const title = latestFailed
      ? "命令执行失败"
      : activeCommand
        ? "正在运行命令"
        : "已运行命令";
    const mergedCommand: TimelineItem = {
      ...latestCommand,
      id: `command-activity-${firstCommand.id}`,
      title,
      text: title,
      detail,
      subtitle: displayCommand.subtitle,
      commandCount,
      streaming: latestFailed ? false : Boolean(activeCommand),
    };

    for (const item of turnItems) {
      if (item.kind !== "tool" || item.activityType !== "command") {
        result.push(item);
      } else if (item === latestCommand) {
        result.push(mergedCommand);
      }
    }
    turnItems = [];
  };

  for (const item of items) {
    if (item.kind === "message" && item.role === "user") {
      flushTurn();
      result.push(item);
      continue;
    }
    turnItems.push(item);
  }
  flushTurn();

  return result;
}

function eventItemData(event: CodexEvent) {
  return parseJsonMaybe(event.raw) || parseJsonMaybe(event.text);
}

function eventPayloadItem(data: unknown) {
  return (
    readJsonPath(data, ["params", "item"]) ||
    readJsonPath(data, ["item"]) ||
    data
  );
}

function stringifyEventDetail(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.trim();
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function firstStringValue(value: unknown, paths: string[][]) {
  for (const path of paths) {
    const next = readJsonPath(value, path);
    if (next !== undefined && next !== null && String(next).trim())
      return String(next).trim();
  }
  return "";
}

function toolNameFromData(value: unknown) {
  return firstStringValue(value, [
    ["params", "item", "invocation", "tool"],
    ["params", "item", "tool"],
    ["item", "invocation", "tool"],
    ["item", "tool"],
    ["tool"],
    ["name"],
  ]);
}

function toolServerFromData(value: unknown) {
  return firstStringValue(value, [
    ["params", "item", "invocation", "server"],
    ["params", "item", "server"],
    ["params", "item", "namespace"],
    ["item", "invocation", "server"],
    ["item", "server"],
    ["item", "namespace"],
    ["server"],
    ["namespace"],
  ]);
}

function statusLabelFromData(value: unknown) {
  const status = firstStringValue(value, [
    ["params", "item", "status"],
    ["params", "item", "state"],
    ["item", "status"],
    ["item", "state"],
    ["status"],
    ["state"],
  ]);
  if (/fail|error|denied|aborted|cancel/i.test(status)) return "失败";
  if (/complete|success|finished|done/i.test(status)) return "完成";
  if (/progress|running|pending|started/i.test(status)) return "进行中";
  return status;
}

function commandTextFromEvent(event: CodexEvent, data: unknown) {
  return String(
    readJsonPath(data, ["params", "item", "command"]) ||
      readJsonPath(data, ["item", "command"]) ||
      readJsonPath(data, ["command"]) ||
      event.text ||
      "",
  ).trim();
}

function commandOutputFromEvent(event: CodexEvent, data: unknown) {
  return boundedTimelineDetail(
    String(
      readJsonPath(data, ["params", "item", "aggregatedOutput"]) ||
        readJsonPath(data, ["item", "aggregatedOutput"]) ||
        readJsonPath(data, ["output"]) ||
        (event.type === "app.command_delta" ? event.text : "") ||
        "",
    ),
  ).trim();
}

function appendDetail(previous: string | undefined, next: string) {
  const clean = removeGeneratedPathText(next).trim();
  if (!clean) return previous || "";
  if (!previous) return clean;
  return `${previous.trimEnd()}\n${clean}`;
}

function appendRawDetail(previous: string | undefined, next: string) {
  const clean = String(next || "").trim();
  if (!clean) return previous || "";
  if (!previous) return boundedTimelineDetail(clean);
  return boundedTimelineDetail(`${previous.trimEnd()}\n${clean}`);
}

function isLifecycleEvent(type: string) {
  return [
    "app.connect",
    "app.turn_started",
    "app.turn_completed",
    "app.thread_started",
    "app.thread_status",
    "app.token_usage",
  ].includes(type);
}

function eventFilesFromChanges(data: unknown) {
  const changes =
    readJsonPath(data, ["changes"]) ||
    readJsonPath(data, ["params", "changes"]) ||
    readJsonPath(data, ["params", "item", "changes"]) ||
    readJsonPath(data, ["item", "changes"]) ||
    [];
  if (!Array.isArray(changes)) return "";
  return changes
    .map(
      (item) =>
        readJsonPath(item, ["path"]) ||
        readJsonPath(item, ["filePath"]) ||
        readJsonPath(item, ["file_path"]),
    )
    .filter(Boolean)
    .map(String)
    .join("、");
}

function normalizeDisplayPath(value: string) {
  return normalizeArtifactPath(String(value || ""))
    .replace(/^a\//, "")
    .replace(/^b\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function cleanPatchPath(value: string) {
  return normalizeDisplayPath(String(value || "").replace(/^["']|["']$/g, ""));
}

function looksLikeProjectFilePath(value: string) {
  const text = String(value || "").trim();
  if (!text || /\s/.test(text) || /^https?:\/\//i.test(text)) return false;
  return /(?:^|\/)[\w.@()[\]-]+\.[A-Za-z0-9]{1,8}(?::\d+)?$/.test(text);
}

function changedFileAction(
  text: string,
  added: number,
  removed: number,
  kind = "",
) {
  const label = String(kind || "").toLowerCase();
  if (
    /add|create|new/.test(label) ||
    /new file mode|---\s+\/dev\/null/.test(text)
  )
    return "新增";
  if (
    /delete|remove/.test(label) ||
    /deleted file mode|\+\+\+\s+\/dev\/null/.test(text)
  )
    return "删除";
  if (added > 0 && removed > 0) return "修改";
  if (added > 0) return "新增";
  if (removed > 0) return "删除";
  return "修改";
}

function parseChangedFile(
  pathValue: unknown,
  patchValue: unknown,
  kindValue: unknown,
): TimelineChangedFile | null {
  const rawPatch = String(patchValue || "").trim();
  const rawPath = String(pathValue || "").trim();
  const diffPath =
    rawPatch.match(/^diff --git a\/.+ b\/(.+)$/m)?.[1] ||
    rawPatch.match(/^\+\+\+\s+b\/(.+)$/m)?.[1] ||
    rawPatch.match(/^---\s+a\/(.+)$/m)?.[1];
  const firstLine = rawPatch.split(/\r?\n/)[0] || "";
  const linePath =
    !diffPath &&
    !firstLine.startsWith("diff ") &&
    !firstLine.startsWith("@@") &&
    looksLikeProjectFilePath(firstLine)
      ? firstLine
      : "";
  const displayPath = cleanPatchPath(rawPath || diffPath || linePath);
  if (!displayPath) return null;
  const patchLines = rawPatch.split(/\r?\n/);
  const added = patchLines.filter(
    (line) => line.startsWith("+") && !line.startsWith("+++"),
  ).length;
  const removed = patchLines.filter(
    (line) => line.startsWith("-") && !line.startsWith("---"),
  ).length;
  const name = displayPath.split("/").pop() || displayPath;
  return {
    path: displayPath,
    displayPath,
    name,
    action: changedFileAction(
      rawPatch,
      added,
      removed,
      String(kindValue || ""),
    ),
    added,
    removed,
    patch: rawPatch,
  };
}

function mergeChangedFile(
  previous: TimelineChangedFile | undefined,
  next: TimelineChangedFile,
) {
  if (!previous) return next;
  const added = (previous.added || 0) + (next.added || 0);
  const removed = (previous.removed || 0) + (next.removed || 0);
  return {
    ...previous,
    ...next,
    added,
    removed,
    action:
      previous.action === next.action
        ? previous.action
        : changedFileAction("", added, removed, "modify"),
    patch: [previous.patch, next.patch].filter(Boolean).join("\n"),
  };
}

function artifactsFromChangedFiles(
  files: TimelineChangedFile[],
  projectId = "",
) {
  return files
    .filter(
      (file) =>
        file.action === "新增" || isProjectArtifactPath(file.displayPath),
    )
    .map((file) =>
      artifactFileFromPath(
        file.displayPath,
        file.name,
        projectId,
        "structured",
      ),
    )
    .filter(isTimelineFile)
    .filter((file) =>
      [
        "image",
        "video",
        "audio",
        "presentation",
        "spreadsheet",
        "document",
        "pdf",
      ].includes(file.mediaKind),
    )
    .filter(
      (file, index, list) =>
        list.findIndex(
          (item) =>
            artifactDedupeKey(item.path) === artifactDedupeKey(file.path),
        ) === index,
    );
}

function extractChangedFilesFromEvent(event: CodexEvent, data: unknown) {
  const payload = eventPayloadItem(data);
  const files: TimelineChangedFile[] = [];
  const addFile = (item: any) => {
    if (!item || typeof item !== "object") return;
    const pathValue =
      item.path ||
      item.filePath ||
      item.file_path ||
      item.newPath ||
      item.oldPath ||
      item.name ||
      "";
    const patchValue =
      item.patch ||
      item.diff ||
      item.content ||
      item.after ||
      item.newContent ||
      item.text ||
      "";
    const kindValue =
      item.type || item.kind?.type || item.kind || item.action || "";
    const parsed = parseChangedFile(pathValue, patchValue, kindValue);
    if (parsed) files.push(parsed);
  };
  for (const candidate of [
    readJsonPath(payload, ["changes"]),
    readJsonPath(payload, ["files"]),
    readJsonPath(payload, ["diff", "files"]),
    readJsonPath(payload, ["patch", "files"]),
    readJsonPath(data, ["params", "changes"]),
    readJsonPath(data, ["params", "files"]),
    readJsonPath(data, ["params", "item", "changes"]),
    readJsonPath(data, ["params", "item", "files"]),
  ]) {
    if (Array.isArray(candidate)) candidate.forEach(addFile);
  }
  addFile({
    path:
      readJsonPath(payload, ["path"]) ||
      readJsonPath(payload, ["filePath"]) ||
      readJsonPath(data, ["params", "path"]) ||
      readJsonPath(data, ["params", "filePath"]),
    patch:
      readJsonPath(payload, ["patch"]) ||
      readJsonPath(payload, ["diff"]) ||
      readJsonPath(data, ["params", "patch"]) ||
      readJsonPath(data, ["params", "diff"]),
    kind:
      readJsonPath(payload, ["type"]) || readJsonPath(data, ["params", "type"]),
  });
  if (!files.length && /diff|patch/i.test(String(event.type || ""))) {
    const parsed = parseChangedFile("", event.text, "");
    if (parsed) files.push(parsed);
  }
  const merged = new Map<string, TimelineChangedFile>();
  files.forEach((file) =>
    merged.set(
      file.displayPath.toLowerCase(),
      mergeChangedFile(merged.get(file.displayPath.toLowerCase()), file),
    ),
  );
  return Array.from(merged.values());
}

function changedFilesTitle(files: TimelineChangedFile[], streaming?: boolean) {
  const count = files.length;
  const hasDelete = files.some((file) => file.action === "删除");
  const hasCreate = files.some((file) => file.action === "新增");
  const verb =
    hasDelete && !hasCreate
      ? "删除"
      : hasCreate && !hasDelete
        ? "新增"
        : "修改";
  return `${streaming ? "正在" : "已"}${verb} ${count} 个文件`;
}

function safeEventDetail(event: CodexEvent, data: unknown) {
  const type = String(event.type || "");
  if (type === "app.connect") return "工作环境连接已建立";
  if (/modelRerouted|modelVerification/i.test(type)) return "";
  if (/imageGeneration|imageView/i.test(type)) return "";
  if (type === "app.threadGoalCleared") return "目标已清除";
  if (type === "app.enteredReviewMode") return "开始审阅变更";
  if (type === "app.exitedReviewMode") return "结束审阅变更";
  if (/contextCompaction|compacted/i.test(type)) return "上下文已整理";
  if (/approval_request/i.test(type)) {
    return (
      firstStringValue(data, [
        ["params", "reason"],
        ["reason"],
        ["params", "request", "reason"],
      ]) || "需要确认后继续"
    );
  }
  if (/approval_resolved/i.test(type))
    return removeGeneratedPathText(event.text || "已确认继续");
  if (/autoApprovalReview/i.test(type)) {
    const action = firstStringValue(data, [
      ["params", "action", "command"],
      ["params", "action", "reason"],
      ["action", "command"],
      ["action", "reason"],
    ]);
    const status = firstStringValue(data, [
      ["params", "review", "status"],
      ["review", "status"],
      ["params", "phase"],
      ["phase"],
    ]);
    const risk = firstStringValue(data, [
      ["params", "review", "riskLevel"],
      ["review", "riskLevel"],
    ]);
    return (
      [
        status ? `状态：${status}` : "",
        action ? `操作：${displayShellCommand(action)}` : "",
        risk ? `风险：${risk}` : "",
      ]
        .filter(Boolean)
        .join("\n") || "授权检查"
    );
  }
  if (
    /mcpToolCall|dynamicToolCall|collabAgentToolCall|mcpToolCallProgress/i.test(
      type,
    )
  ) {
    const name = [toolServerFromData(data), toolNameFromData(data)]
      .filter(Boolean)
      .join(".");
    const status = statusLabelFromData(data);
    return [name || event.text, status ? `状态：${status}` : ""]
      .filter(Boolean)
      .join("\n");
  }
  if (/terminalInteraction/i.test(type)) {
    const stdin =
      event.text || firstStringValue(data, [["params", "stdin"], ["stdin"]]);
    return stdin ? `终端输入：${stdin}` : "终端交互";
  }
  if (/warning/i.test(type))
    return removeGeneratedPathText(
      event.text ||
        firstStringValue(data, [
          ["params", "message"],
          ["params", "summary"],
          ["message"],
          ["summary"],
        ]) ||
        "提醒",
    );
  if (/token_usage/i.test(type)) return compactLine(event.text, 180);
  if (type === "app.webSearch") {
    const query =
      readJsonPath(data, ["query"]) ||
      readJsonPath(data, ["params", "item", "query"]) ||
      readJsonPath(data, ["item", "query"]);
    return query ? String(query) : "";
  }
  if (/command/i.test(type)) {
    const command = commandTextFromEvent(event, data);
    const output = commandOutputFromEvent(event, data);
    return [command, output].filter(Boolean).join("\n\n");
  }
  if (/fileChange|file_delta|diff/i.test(type)) {
    return (
      eventFilesFromChanges(eventPayloadItem(data)) ||
      removeGeneratedPathText(event.text)
    );
  }
  const payload = eventPayloadItem(data);
  const detail = stringifyEventDetail(payload) || event.text;
  return removeGeneratedPathText(detail);
}

function isSilentWorkflowApprovalEvent(event: CodexEvent, data: unknown) {
  const type = String(event.type || "");
  if (!/approval_request|approval_resolved/i.test(type)) return false;
  const text = [
    event.text,
    firstStringValue(data, [
      ["params", "reason"],
      ["reason"],
      ["params", "request", "reason"],
    ]),
  ]
    .filter(Boolean)
    .join("\n");
  return /工作流画布.*自动授权|连接当前造梦工作流画布|操作工作流画布/i.test(
    text,
  );
}

function eventLabel(event: CodexEvent, _data: unknown) {
  const type = String(event.type || "");
  if (type === "app.connect") return "已连接工作环境";
  if (type === "app.turn_started") return "开始处理";
  if (type === "app.turn_completed") return "本轮完成";
  if (type === "app.thread_started") return "线程已连接";
  if (type === "app.thread_status") return "线程状态更新";
  if (type === "app.token_usage") return "用量已更新";
  if (type === "app.command_started") return "正在运行命令";
  if (type === "app.command_delta") return "命令输出";
  if (type === "app.command") return "已运行命令";
  if (type === "app.processExited")
    return event.stream === "stderr" ? "命令执行失败" : "命令已退出";
  if (type === "app.terminalInteraction") return "终端交互";
  if (/fileChange|file_delta/i.test(type))
    return type === "app.file_delta" ? "文件输出" : "文件变更";
  if (type === "app.diff") return "差异已更新";
  if (type === "app.webSearch") return "联网搜索";
  if (/mcpToolCallProgress/i.test(type)) return "工具进度";
  if (/mcpToolCall|dynamicToolCall|collabAgentToolCall/i.test(type))
    return "工具调用";
  if (/imageGeneration/i.test(type)) return "生成图片";
  if (/imageView/i.test(type)) return "查看图片";
  if (/reasoning/i.test(type)) return "正在思考";
  if (/plan/i.test(type)) return "计划更新";
  if (/approval_request/i.test(type)) return "需要授权";
  if (/approval_resolved/i.test(type))
    return /拒绝/.test(event.text) ? "已拒绝授权" : "已授权";
  if (/autoApprovalReview/i.test(type)) return "授权检查";
  if (type === "app.threadGoalCleared") return "目标已清除";
  if (/threadGoal/i.test(type)) return "目标更新";
  if (type === "app.enteredReviewMode") return "开始审阅";
  if (type === "app.exitedReviewMode") return "结束审阅";
  if (/contextCompaction|compacted/i.test(type)) return "上下文整理";
  if (/warning/i.test(type)) return "提醒";
  if (/modelRerouted|modelVerification/i.test(type)) return "运行配置已更新";
  if (event.stream === "stderr" || /failed|error/i.test(type))
    return "执行错误";
  return type ? type.replace(/^app[._]/, "").replace(/_/g, " ") : "事件";
}

function eventActivityType(event: CodexEvent): TimelineItem["activityType"] {
  const type = String(event.type || "");
  if (/command|processExited|terminalInteraction/i.test(type)) return "command";
  if (/fileChange|file_delta|diff/i.test(type)) return "file";
  if (/webSearch/i.test(type)) return "search";
  if (/plan|reasoning|threadGoal/i.test(type)) return "plan";
  return "tool";
}

type ActivitySliceStats = {
  thinking: number;
  search: number;
  plan: number;
  tool: number;
  explore: number;
};

function groupedActivityKind(event: CodexEvent) {
  const type = String(event.type || "");
  if (/webSearch/i.test(type)) return "search" as const;
  if (/reasoning/i.test(type)) return "thinking" as const;
  if (/plan|threadGoal|enteredReviewMode|exitedReviewMode/i.test(type))
    return "plan" as const;
  if (
    /mcpToolCall|dynamicToolCall|collabAgentToolCall|contextCompaction|compacted|autoApprovalReview|approval_request|approval_resolved|warning/i.test(
      type,
    )
  )
    return "tool" as const;
  return null;
}

function groupedActivityLabel(
  kind: ActivitySliceKind,
  event: CodexEvent,
  data: unknown,
) {
  if (kind === "search") return "联网搜索";
  if (kind === "thinking") return "思考";
  if (kind === "explore") return "探索项目";
  if (kind === "plan") return eventLabel(event, data);
  return eventLabel(event, data);
}

function groupedActivityTitle(stats: ActivitySliceStats, streaming: boolean) {
  const activeKinds = [
    stats.search > 0 ? "search" : "",
    stats.explore > 0 ? "explore" : "",
    stats.plan > 0 ? "plan" : "",
    stats.tool > 0 ? "tool" : "",
    stats.thinking > 0 ? "thinking" : "",
  ].filter(Boolean);
  if (activeKinds.length === 1 && stats.search > 0)
    return streaming ? "正在联网搜索" : "已完成联网搜索";
  if (activeKinds.length === 1 && stats.explore > 0)
    return streaming ? "正在读取文件运行命令" : "已读取文件运行了多个命令";
  if (activeKinds.length === 1 && stats.plan > 0)
    return streaming ? "正在规划" : "已更新计划";
  if (activeKinds.length === 1 && stats.tool > 0)
    return streaming ? "正在调用工具" : "已完成工具调用";
  return streaming ? "正在处理" : "已完成处理";
}

function groupedActivitySubtitle(stats: ActivitySliceStats) {
  const parts = [
    stats.search > 0 ? { label: "联网搜索", count: stats.search } : null,
    stats.explore > 0 ? { label: "项目探索", count: stats.explore } : null,
    stats.tool > 0 ? { label: "工具调用", count: stats.tool } : null,
    stats.plan > 0 ? { label: "计划", count: stats.plan } : null,
  ].filter((part): part is { label: string; count: number } => Boolean(part));
  if (parts.length === 1 && parts[0].label === "项目探索") return "";
  if (parts.length === 1)
    return parts[0].count > 1 ? `${parts[0].count} 次` : "";
  return parts.map((part) => `${part.label} ${part.count} 次`).join(" · ");
}

function groupedActivityType(
  stats: ActivitySliceStats,
): TimelineItem["activityType"] {
  if (
    stats.search > 0 &&
    stats.tool === 0 &&
    stats.plan === 0 &&
    stats.thinking === 0
  )
    return "search";
  if (
    stats.explore > 0 &&
    stats.search === 0 &&
    stats.tool === 0 &&
    stats.plan === 0
  )
    return "file";
  if (
    stats.tool > 0 &&
    stats.search === 0 &&
    stats.plan === 0 &&
    stats.thinking === 0
  )
    return "tool";
  return "plan";
}

function displayShellCommand(value: string) {
  const command = String(value || "").trim();
  const match = command.match(
    /^(?:\/[^\s]+\/)?(?:bash|zsh|sh)\s+-lc\s+([\s\S]+)$/,
  );
  if (!match) return command;
  const raw = match[1].trim();
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return raw
        .slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\")
        .trim();
    }
  }
  return raw;
}

function compactCommandForDisplay(value: string, max = 96) {
  const command = sanitizeVisibleText(value)
    .split(/\r?\n/)[0]
    .replace(/\s+/g, " ")
    .replace(/^['"]+|['"]+$/g, "")
    .trim();
  return command.length > max ? `${command.slice(0, max)}...` : command;
}

function shortCommandTarget(value: string) {
  return String(value || "")
    .replace(/['"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => !part.startsWith("-"))
    .slice(0, 2)
    .join(" ")
    .slice(0, 72);
}

function summarizeSearchQuery(value: string) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  const quoted = cleaned.match(/["']([^"']{1,80})["']/)?.[1];
  if (quoted) return quoted;
  return (
    cleaned
      .split(" ")
      .filter((part) => !part.startsWith("-"))
      .slice(0, 4)
      .join(" ")
      .slice(0, 80) || "文件"
  );
}

function commandDisplaySummary(
  commandValue: string,
  state: "running" | "completed",
) {
  const command = displayShellCommand(commandValue);
  const lower = command.toLowerCase();
  const running = state === "running";
  const readTarget = command.match(
    /^(?:cat|sed|nl|head|tail|less|more)\s+(?:-[^\s]+\s+)*(.+)$/,
  )?.[1];
  if (readTarget) {
    const target = shortCommandTarget(readTarget);
    return {
      exploration: true,
      title: running ? "正在读取文件" : "已读取文件",
      detail: `${running ? "读取" : "已读取"} ${target || "文件"}`,
    };
  }
  const searchCommand = command.match(/^(?:rg|grep)\s+(.+)$/)?.[1];
  if (searchCommand) {
    const query = summarizeSearchQuery(searchCommand);
    return {
      exploration: true,
      title: running ? "正在搜索代码" : "已搜索代码",
      detail: `${running ? "搜索" : "已搜索"} ${query}`,
    };
  }
  const listTarget = command.match(/^(?:ls|find)\s*(.*)$/)?.[1];
  if (listTarget != null && /^(?:ls|find)\b/.test(lower)) {
    const target = shortCommandTarget(listTarget);
    return {
      exploration: true,
      title: running ? "正在列出文件" : "已列出文件",
      detail: target
        ? `${running ? "列出" : "已列出"} ${target}`
        : running
          ? "列出文件"
          : "已列出文件",
    };
  }
  if (/sk-[A-Za-z0-9_-]{12,}|api[_-]?key/i.test(command)) {
    return {
      exploration: false,
      title: running ? "正在运行命令" : "已运行命令",
      detail: "使用访问凭证运行命令",
    };
  }
  return {
    exploration: false,
    title: running ? "正在运行命令" : "已运行命令",
    detail: compactCommandForDisplay(command),
  };
}

function buildTimeline(
  events: CodexEvent[],
  projectId = "",
  providerTaskResults: ProviderTaskResultMap = {},
  codexTaskId = "",
  taskStatus: CodexTaskLifecycleStatus = "",
) {
  const items: TimelineItem[] = [];
  let pendingAssistantIndex = -1;
  let pendingCommandIndex = -1;
  let pendingCommandWasExploration = false;
  let pendingCommandWasCanvasCommand = false;
  let pendingActivityIndex = -1;
  let pendingFileIndex = -1;
  const activityDetails = new Map<number, Set<string>>();
  const activityStats = new Map<number, ActivitySliceStats>();

  const emptyActivityStats = (): ActivitySliceStats => ({
    thinking: 0,
    search: 0,
    plan: 0,
    tool: 0,
    explore: 0,
  });

  const refreshActivitySummary = (itemIndex: number, streaming: boolean) => {
    const item = items[itemIndex];
    if (!item) return;
    const stats = activityStats.get(itemIndex) || emptyActivityStats();
    item.streaming = streaming;
    item.title = groupedActivityTitle(stats, streaming);
    item.text = item.title;
    item.subtitle = groupedActivitySubtitle(stats);
    item.activityType = groupedActivityType(stats);
  };

  const finishActivitySlice = () => {
    if (pendingActivityIndex < 0) return;
    const pending = items[pendingActivityIndex];
    const stats = activityStats.get(pendingActivityIndex);
    const onlyThinking = Boolean(
      stats &&
      stats.thinking > 0 &&
      stats.search === 0 &&
      stats.plan === 0 &&
      stats.tool === 0 &&
      stats.explore === 0,
    );
    if (onlyThinking && pendingActivityIndex === items.length - 1) {
      items.pop();
      activityDetails.delete(pendingActivityIndex);
      activityStats.delete(pendingActivityIndex);
    } else if (pending?.kind === "activity") {
      refreshActivitySummary(pendingActivityIndex, false);
    }
    pendingActivityIndex = -1;
  };

  const pushGroupedActivity = (params: {
    id: string;
    kind: ActivitySliceKind;
    label: string;
    detail?: string;
    streaming?: boolean;
  }) => {
    const line = params.detail
      ? `${params.label}：${compactLine(params.detail, 320)}`
      : params.label;
    const targetIndex =
      pendingActivityIndex >= 0 &&
      items[pendingActivityIndex]?.kind === "activity"
        ? pendingActivityIndex
        : items.length;

    if (targetIndex === items.length) {
      pendingActivityIndex = targetIndex;
      activityDetails.set(targetIndex, new Set<string>());
      activityStats.set(targetIndex, emptyActivityStats());
      items.push({
        id: params.id,
        kind: "activity",
        title: "正在处理",
        text: "正在处理",
        activityType:
          params.kind === "search"
            ? "search"
            : params.kind === "tool"
              ? "tool"
              : params.kind === "explore"
                ? "file"
                : "plan",
        streaming: params.streaming !== false,
      });
    }

    const seen = activityDetails.get(targetIndex) || new Set<string>();
    const stats = activityStats.get(targetIndex) || emptyActivityStats();
    if (!seen.has(line)) {
      seen.add(line);
      activityDetails.set(targetIndex, seen);
      stats[params.kind] += 1;
      activityStats.set(targetIndex, stats);
      items[targetIndex].detail = appendDetail(items[targetIndex].detail, line);
    }
    refreshActivitySummary(targetIndex, params.streaming !== false);
  };

  events.forEach((event, index) => {
    const type = String(event.type || "");
    const text = String(event.text || "").trim();
    const id = `${event.ts}-${type || event.stream}-${index}`;
    const raw = eventItemData(event);

    if (isLifecycleEvent(type)) {
      if (type === "app.turn_completed") finishActivitySlice();
      return;
    }
    if (/modelRerouted|modelVerification/i.test(type)) return;
    if (type === "app.terminalInteraction") return;
    if (isSilentWorkflowApprovalEvent(event, raw)) return;

    const pushArtifacts = (
      source: unknown,
      fallbackType = type,
      options: { includeText?: boolean } = {},
    ) => {
      const artifacts = [
        ...extractStructuredArtifactsForEvent(fallbackType, source, projectId),
        ...(options.includeText
          ? extractArtifactsFromText(
              typeof source === "string" ? source : text,
              projectId,
            )
          : []),
      ].filter(
        (artifact, artifactIndex, list) =>
          list.findIndex(
            (item) =>
              artifactDedupeKey(item.path) === artifactDedupeKey(artifact.path),
          ) === artifactIndex,
      );
      return pushArtifactItems(items, artifacts, id, fallbackType);
    };

    if (event.role === "user" || type === "user_message") {
      pendingAssistantIndex = -1;
      finishActivitySlice();
      pendingFileIndex = -1;
      const files = userEventFiles(event, projectId);
      if (!text && !files.length) return;
      const images = files
        .filter((file) => file.mediaKind === "image")
        .map((file) => ({ path: file.path, name: file.name, url: file.url }));
      const signature = userMessageSignature(text, files);
      const textSignature = userMessageTextSignature(text);
      const previous = items[items.length - 1];
      const previousFiles = previous?.files || [];
      const previousSignature =
        previous?.kind === "message" && previous.role === "user"
          ? userMessageSignature(previous.text, previousFiles)
          : "";
      const previousTextSignature =
        previous?.kind === "message" && previous.role === "user"
          ? userMessageTextSignature(previous.text)
          : "";
      if (
        previous?.kind === "message" &&
        previous.role === "user" &&
        (previousSignature === signature ||
          (textSignature && previousTextSignature === textSignature))
      ) {
        previous.files = mergeTimelineFiles(previousFiles, files);
        previous.images = previous.files
          .filter((file) => file.mediaKind === "image")
          .map((file) => ({ path: file.path, name: file.name, url: file.url }));
        return;
      }
      items.push({ id, kind: "message", role: "user", text, images, files });
      return;
    }

    if (type === "app.agent_delta") {
      if (!text) return;
      finishActivitySlice();
      pendingFileIndex = -1;
      const pending = items[pendingAssistantIndex];
      if (
        pending?.kind === "message" &&
        pending.role === "assistant" &&
        pending.streaming
      ) {
        pending.text += text;
      } else {
        pendingAssistantIndex = items.length;
        items.push({
          id,
          kind: "message",
          role: "assistant",
          text,
          streaming: true,
        });
      }
      return;
    }

    if (event.role === "assistant" && type === "app.agent_message") {
      finishActivitySlice();
      pendingFileIndex = -1;
      const messageArtifacts = extractArtifactsFromText(text, projectId);
      const visibleText = removeGeneratedPathText(text);
      const pending = items[pendingAssistantIndex];
      if (
        pending?.kind === "message" &&
        pending.role === "assistant" &&
        pending.streaming
      ) {
        pending.text = visibleText;
        pending.streaming = false;
        pendingAssistantIndex = -1;
      } else if (visibleText) {
        items.push({
          id,
          kind: "message",
          role: "assistant",
          text: visibleText,
        });
      }
      pushArtifactItems(items, messageArtifacts, id, "assistantMessage");
      return;
    }

    pendingAssistantIndex = -1;

    const groupedKind = groupedActivityKind(event);
    if (groupedKind) {
      pendingFileIndex = -1;
      const label = groupedActivityLabel(groupedKind, event, raw);
      const detail = removeGeneratedPathText(
        text || safeEventDetail(event, raw),
      ).trim();
      pushGroupedActivity({
        id,
        kind: groupedKind,
        label,
        detail,
        streaming: true,
      });
      pushArtifacts(raw || text, type);
      return;
    }

    if (type === "app.command_started") {
      pendingFileIndex = -1;
      const command = commandTextFromEvent(event, raw);
      pendingCommandWasCanvasCommand = /canvas_command\.py["']?\s+/i.test(
        command,
      );
      const commandSummary = commandDisplaySummary(command, "running");
      pendingCommandWasExploration = commandSummary.exploration;
      if (commandSummary.exploration) {
        pendingCommandIndex = -1;
        pushGroupedActivity({
          id,
          kind: "explore",
          label: commandSummary.title,
          detail: commandSummary.detail,
          streaming: true,
        });
        return;
      }
      finishActivitySlice();
      pendingCommandIndex = items.length;
      items.push({
        id,
        kind: "tool",
        title: commandSummary.title,
        text: commandSummary.title,
        detail: command,
        subtitle: commandSummary.detail,
        activityType: "command",
        streaming: true,
      });
      return;
    }

    if (type === "app.command_delta") {
      pendingFileIndex = -1;
      const output = commandOutputFromEvent(event, raw) || text;
      if (!pendingCommandWasCanvasCommand)
        pushArtifactItems(
          items,
          extractArtifactsFromCommandOutput(output, projectId),
          id,
          type,
        );
      if (pendingCommandWasExploration) {
        return;
      }
      finishActivitySlice();
      const pending = items[pendingCommandIndex];
      if (pending?.kind === "tool" && pending.activityType === "command") {
        pending.detail = appendRawDetail(pending.detail, output);
        pending.streaming = true;
      } else {
        pendingCommandIndex = items.length;
        items.push({
          id,
          kind: "tool",
          title: "正在运行命令",
          text: "正在运行命令",
          detail: output,
          activityType: "command",
          streaming: true,
        });
      }
      return;
    }

    if (type === "app.command") {
      pendingFileIndex = -1;
      const command = commandTextFromEvent(event, raw);
      const output = commandOutputFromEvent(event, raw);
      const commandSummary = commandDisplaySummary(command, "completed");
      const canvasCommand = /canvas_command\.py["']?\s+/i.test(command);
      const commandArtifacts = canvasCommand
        ? []
        : extractArtifactsFromCommandOutput(output, projectId);
      pushArtifactItems(items, commandArtifacts, id, type);
      if (pendingCommandWasExploration || commandSummary.exploration) {
        pushGroupedActivity({
          id,
          kind: "explore",
          label: commandSummary.title,
          detail: commandSummary.detail,
          streaming: true,
        });
        pendingCommandWasExploration = false;
        pendingCommandWasCanvasCommand = false;
        return;
      }
      finishActivitySlice();
      const pending = items[pendingCommandIndex];
      if (pending?.kind === "tool" && pending.activityType === "command") {
        pending.title = commandSummary.title;
        pending.text = commandSummary.title;
        pending.subtitle = commandSummary.detail || pending.subtitle;
        pending.detail =
          [command, output].filter(Boolean).join("\n\n") || pending.detail;
        pending.streaming = false;
      } else {
        items.push({
          id,
          kind: "tool",
          title: commandSummary.title,
          text: commandSummary.title,
          detail: [command, output].filter(Boolean).join("\n\n"),
          subtitle: commandSummary.detail,
          activityType: "command",
        });
      }
      pendingCommandWasCanvasCommand = false;
      return;
    }

    if (type === "app.processExited" && pendingCommandIndex >= 0) {
      const pending = items[pendingCommandIndex];
      if (pending?.kind === "tool" && pending.activityType === "command") {
        pending.streaming = false;
        if (event.stream === "stderr") pending.title = "命令执行失败";
      }
      return;
    }
    if (type === "app.processExited") return;

    finishActivitySlice();
    if (/fileChange|file_delta|diff/i.test(type)) {
      const detail = safeEventDetail(event, raw);
      const title = type === "app.file_delta" ? "正在编辑文件" : "文件变更";
      const changedFiles = extractChangedFilesFromEvent(event, raw);
      if (changedFiles.length) {
        const streaming = /delta|patchUpdated/i.test(type);
        const pending = items[pendingFileIndex];
        if (pending?.kind === "changes") {
          const merged = new Map<string, TimelineChangedFile>(
            (pending.changedFiles || []).map((file) => [
              file.displayPath.toLowerCase(),
              file,
            ]),
          );
          changedFiles.forEach((file) =>
            merged.set(
              file.displayPath.toLowerCase(),
              mergeChangedFile(
                merged.get(file.displayPath.toLowerCase()),
                file,
              ),
            ),
          );
          const nextFiles = Array.from(merged.values());
          const stats = nextFiles.reduce(
            (acc, file) => ({
              added: acc.added + (file.added || 0),
              removed: acc.removed + (file.removed || 0),
            }),
            { added: 0, removed: 0 },
          );
          pending.changedFiles = nextFiles;
          pending.stats = stats;
          pending.title = changedFilesTitle(nextFiles, streaming);
          pending.text = pending.title;
          pending.subtitle = nextFiles
            .map((file) => file.displayPath)
            .slice(0, 2)
            .join("、");
          pending.streaming = streaming;
        } else {
          pendingFileIndex = items.length;
          pushChangedFilesItem(items, changedFiles, id, streaming);
        }
        pushArtifactItems(
          items,
          artifactsFromChangedFiles(changedFiles, projectId),
          id,
          type,
        );
        return;
      }
      const pending = items[pendingFileIndex];
      if (
        pending?.kind === "activity" &&
        pending.activityType === "file" &&
        pending.streaming
      ) {
        pending.title = title;
        pending.text = title;
        pending.detail = appendDetail(pending.detail, detail);
        pending.streaming = /delta|patchUpdated/i.test(type);
      } else {
        pendingFileIndex = items.length;
        items.push({
          id,
          kind: "activity",
          title,
          text: title,
          detail,
          activityType: "file",
          streaming: /delta|patchUpdated/i.test(type),
        });
      }
      return;
    }
    pendingFileIndex = -1;

    if (
      (event.stream === "stderr" || /failed|error/i.test(type)) &&
      !/imageGeneration|videoGeneration|audioGeneration/i.test(type)
    ) {
      if (text)
        items.push({
          id,
          kind: "error",
          text: friendlyCodexTimelineErrorText(text, raw),
        });
      return;
    }

    const generationItem = timelineGenerationFromEvent(
      event,
      raw,
      projectId,
      providerTaskResults,
      id,
      codexTaskId,
    );
    if (generationItem) {
      const generationPrompt = String(
        generationItem.generationPrompt || "",
      ).trim();
      const existingIndex = items.findIndex(
        (item) =>
          item.kind === "generation" &&
          ((generationItem.generationTaskId &&
            item.generationTaskId === generationItem.generationTaskId) ||
            (generationItem.generationNodeId &&
              item.generationNodeId === generationItem.generationNodeId) ||
            (item.generationKind === generationItem.generationKind &&
              ((generationPrompt &&
                String(item.generationPrompt || "").trim() ===
                  generationPrompt) ||
                (!generationPrompt && item.generationStatus === "generating") ||
                (!String(item.generationPrompt || "").trim() &&
                  generationItem.generationStatus === "generating") ||
                (!String(item.generationPrompt || "").trim() &&
                  Boolean(generationPrompt))))),
      );
      if (existingIndex >= 0) {
        const previous = items[existingIndex];
        const keepCompleted =
          previous.generationStatus === "complete" &&
          generationItem.generationStatus === "generating";
        items[existingIndex] = {
          ...previous,
          ...generationItem,
          generationStatus: keepCompleted
            ? previous.generationStatus
            : generationItem.generationStatus,
          text: keepCompleted ? previous.text : generationItem.text,
          title: keepCompleted ? previous.title : generationItem.title,
          subtitle: generationItem.subtitle || previous.subtitle,
          detail: generationItem.detail || previous.detail,
          generationPrompt:
            generationItem.generationPrompt || previous.generationPrompt,
          generationError:
            generationItem.generationStatus === "failed"
              ? generationItem.generationError || previous.generationError
              : undefined,
          url: generationItem.url || previous.url,
          previewUrl: generationItem.previewUrl || previous.previewUrl,
          files: generationItem.files?.length
            ? generationItem.files
            : previous.files,
          resultUrls: generationItem.resultUrls?.length
            ? generationItem.resultUrls
            : previous.resultUrls,
          generationAspectRatio:
            generationItem.generationAspectRatio ||
            previous.generationAspectRatio,
          generationWidth:
            generationItem.generationWidth || previous.generationWidth,
          generationHeight:
            generationItem.generationHeight || previous.generationHeight,
          generationProgress:
            generationItem.generationProgress ?? previous.generationProgress,
          generationNodeId:
            generationItem.generationNodeId || previous.generationNodeId,
          generationNodeKind:
            generationItem.generationNodeKind || previous.generationNodeKind,
          streaming: keepCompleted ? false : generationItem.streaming,
        };
      } else {
        items.push(generationItem);
      }
      return;
    }

    const artifacts = [
      ...extractStructuredArtifactsForEvent(type, raw || text, projectId),
      ...(/imageGeneration|imageView/i.test(type)
        ? extractArtifactsFromText(text, projectId)
        : []),
    ].filter(
      (artifact, artifactIndex, list) =>
        list.findIndex(
          (item) =>
            artifactDedupeKey(item.path) === artifactDedupeKey(artifact.path),
        ) === artifactIndex,
    );
    if (/imageGeneration|imageView/i.test(type)) {
      const mirrorsGeneratedMedia =
        /imageView/i.test(type) &&
        items.some(
          (item) =>
            item.kind === "generation" &&
            item.generationStatus === "complete" &&
            (item.resultUrls || []).some((resultUrl) =>
              items
                .slice(-5)
                .some((recent) =>
                  String(recent.detail || "").includes(resultUrl),
                ),
            ),
        );
      if (mirrorsGeneratedMedia) return;
      pushArtifactItems(items, artifacts, id, type);
      return;
    }
    const visibleDetail = safeEventDetail(event, raw);
    const artifactOnly = artifacts.length > 0 && !visibleDetail;
    const summarySource =
      type === "app.webSearch" ? visibleDetail : visibleDetail || text;
    const summary = artifactOnly
      ? `输出了 ${artifacts.length} 个${artifacts.every((item) => item.mediaKind === "image") ? "图片" : artifacts.every((item) => item.mediaKind === "video") ? "视频" : "文件"}`
      : compactLine(summarySource, 220);

    items.push({
      id,
      kind: /command/i.test(type) ? "tool" : "activity",
      title: eventLabel(event, raw),
      text: eventLabel(event, raw),
      detail: summary,
      activityType: eventActivityType(event),
      streaming: /started|delta|inProgress/i.test(`${type} ${text}`),
    });
    pushArtifactItems(items, artifacts, id, type);
  });

  return settleTerminalTaskActivities(
    collapseCommandActivityRows(dedupeMirroredUserMessages(items)),
    taskStatus,
  );
}

function isLegacyWorkflowPermissionRetryMessage(item: TimelineItem) {
  if (item.kind !== "message" || item.role !== "assistant") return false;
  const text = String(item.text || "").trim();
  if (!/(?:画布|canvas)/i.test(text)) return false;
  return (
    /(?:网络权限|授权方式|申请授权|需要授权)/i.test(text) &&
    /(?:重试|重新执行|继续执行|快照)/i.test(text)
  );
}

function ActivityIcon({ type }: { type?: TimelineItem["activityType"] }) {
  const className = "h-4 w-4 shrink-0";
  if (type === "command") return <SquareTerminal className={className} />;
  if (type === "file") return <FolderOpen className={className} />;
  if (type === "search") return <Search className={className} />;
  if (type === "plan") return <ListChecks className={className} />;
  return <Wrench className={className} />;
}

function ActivityLeadingIcon({
  item,
  failed = false,
}: {
  item: TimelineItem;
  failed?: boolean;
}) {
  if (item.streaming) return <Loader2 className="h-4 w-4 animate-spin" />;
  if (failed) return <AlertCircle className="h-4 w-4" />;
  return <ActivityIcon type={item.activityType || "tool"} />;
}

function commandInlineDetail(item: TimelineItem, detail: string) {
  const failed = Boolean(item.title?.includes("失败"));
  if (!item.streaming && !failed && (item.commandCount || 1) > 1) return "";
  const subtitle = sanitizeVisibleText(item.subtitle || "");
  if (subtitle) return compactLine(subtitle, 150);
  const firstLine = detail.split(/\r?\n/).find((line) => line.trim()) || "";
  return compactLine(displayShellCommand(firstLine), 150);
}

function commandRowTitle(item: TimelineItem) {
  if (item.title?.includes("失败")) return "命令执行失败";
  if (item.interrupted) return item.title || "命令已停止";
  if (item.streaming) return "正在运行";
  const count = Math.max(1, item.commandCount || 1);
  return count === 1 ? "已运行" : `已运行 ${count} 个命令`;
}

function commandRowIcon(item: TimelineItem, failed: boolean) {
  if (failed) return <AlertCircle className="h-[18px] w-[18px]" />;
  if (item.streaming) return <SquareTerminal className="h-[18px] w-[18px]" />;
  return <SquareTerminal className="h-[18px] w-[18px]" />;
}

function AssistantMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children: content }) => (
          <p className="mb-2 last:mb-0">{content}</p>
        ),
        a: ({ children: content, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-token-text-link-foreground)] underline underline-offset-2"
          >
            {content}
          </a>
        ),
        ul: ({ children: content }) => (
          <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{content}</ul>
        ),
        ol: ({ children: content }) => (
          <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">
            {content}
          </ol>
        ),
        pre: ({ children: content }) => (
          <pre className="my-2 max-w-full overflow-x-auto rounded-[8px] border border-[var(--color-token-border)] bg-[var(--color-token-bg-secondary)] p-3 text-[12px] leading-5">
            {content}
          </pre>
        ),
        code: ({ children: content, className }) =>
          className ? (
            <code className={className}>{content}</code>
          ) : (
            <code className="rounded-[4px] bg-[var(--color-token-bg-secondary)] px-1 py-0.5 text-[12px]">
              {content}
            </code>
          ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function TimelineToolCard({ item }: { item: TimelineItem }) {
  const [expanded, setExpanded] = useState(false);
  const detail =
    item.detail && item.detail !== item.text
      ? boundedTimelineDetail(sanitizeVisibleText(item.detail))
      : "";
  if (item.activityType === "command") {
    const failed = Boolean(item.title?.includes("失败"));
    const inlineDetail = commandInlineDetail(item, detail);
    const showDetails = Boolean(detail);
    return (
      <div className="zaomeng-codex-activity zaomeng-codex-command-row">
        <button
          type="button"
          className="zaomeng-codex-activity-header zaomeng-codex-command-header"
          aria-expanded={expanded}
          onClick={() => showDetails && setExpanded((value) => !value)}
        >
          <span
            className={`zaomeng-codex-command-icon ${failed ? "failed" : item.streaming ? "running" : ""}`}
          >
            {commandRowIcon(item, failed)}
          </span>
          <span className="zaomeng-codex-command-title">
            {commandRowTitle(item)}
          </span>
          {inlineDetail ? (
            <code className="zaomeng-codex-command-detail">{inlineDetail}</code>
          ) : null}
          {showDetails ? (
            <ChevronRight
              className={`zaomeng-codex-activity-chevron ${expanded ? "expanded" : ""}`}
            />
          ) : null}
        </button>
        {showDetails ? (
          <div
            className={`zaomeng-codex-activity-body zaomeng-codex-command-body ${expanded ? "expanded" : ""}`}
          >
            <pre className="zaomeng-codex-terminal">{detail}</pre>
          </div>
        ) : null}
      </div>
    );
  }
  const inlineDetail = sanitizeVisibleText(
    item.subtitle || (!detail.includes("\n") ? detail : ""),
  );
  const title = sanitizeVisibleText(item.title || item.text || "工具调用");
  const showDetails = Boolean(
    detail && (detail.includes("\n") || detail !== inlineDetail),
  );
  return (
    <div className="zaomeng-codex-activity">
      <button
        type="button"
        className="zaomeng-codex-activity-header"
        aria-expanded={expanded}
        onClick={() => showDetails && setExpanded((value) => !value)}
      >
        <span className="zaomeng-codex-activity-icon">
          <ActivityLeadingIcon
            item={item}
            failed={item.title?.includes("失败")}
          />
        </span>
        <span className="zaomeng-codex-activity-title">{title}</span>
        {inlineDetail ? (
          <code className="zaomeng-codex-activity-detail">
            {compactLine(inlineDetail, 140)}
          </code>
        ) : null}
        {showDetails ? (
          <ChevronRight
            className={`zaomeng-codex-activity-chevron ${expanded ? "expanded" : ""}`}
          />
        ) : null}
      </button>
      {showDetails ? (
        <div
          className={`zaomeng-codex-activity-body ${expanded ? "expanded" : ""}`}
        >
          <pre>{detail}</pre>
        </div>
      ) : null}
    </div>
  );
}

function TimelineActivityRow({ item }: { item: TimelineItem }) {
  const [expanded, setExpanded] = useState(false);
  const detail = sanitizeVisibleText(item.detail || "");
  const hasLongDetail =
    item.activityType === "plan" ||
    detail.includes("\n") ||
    detail.length > 150;
  const inlineDetail = sanitizeVisibleText(
    item.subtitle || (!hasLongDetail ? detail : ""),
  );
  const title = sanitizeVisibleText(item.title || item.text);
  return (
    <div className="zaomeng-codex-activity">
      <button
        type="button"
        className="zaomeng-codex-activity-header"
        aria-expanded={expanded}
        onClick={() =>
          detail && hasLongDetail && setExpanded((value) => !value)
        }
      >
        <span className="zaomeng-codex-activity-icon">
          <ActivityLeadingIcon item={item} />
        </span>
        <span className="zaomeng-codex-activity-title">{title}</span>
        {inlineDetail ? (
          <span className="zaomeng-codex-activity-detail">
            {compactLine(inlineDetail, 140)}
          </span>
        ) : null}
        {detail && hasLongDetail ? (
          <ChevronRight
            className={`zaomeng-codex-activity-chevron ${expanded ? "expanded" : ""}`}
          />
        ) : null}
      </button>
      {detail && hasLongDetail ? (
        <div
          className={`zaomeng-codex-activity-body ${expanded ? "expanded" : ""}`}
        >
          <pre>{detail}</pre>
        </div>
      ) : null}
    </div>
  );
}

function TimelineChangesCard({ item }: { item: TimelineItem }) {
  const [expanded, setExpanded] = useState(false);
  const files = item.changedFiles || [];
  const stats = item.stats || { added: 0, removed: 0 };
  const title = sanitizeVisibleText(
    item.title || item.text || changedFilesTitle(files, item.streaming),
  );
  const subtitle = files
    .map((file) => file.displayPath)
    .slice(0, 2)
    .join("、");
  return (
    <div className="zaomeng-codex-changes">
      <button
        type="button"
        className="zaomeng-codex-activity-header"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="zaomeng-codex-activity-icon">
          {item.streaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileCode2 className="h-4 w-4" />
          )}
        </span>
        <span className="zaomeng-codex-activity-title">{title}</span>
        {subtitle ? (
          <span className="zaomeng-codex-activity-detail">
            {compactLine(subtitle, 140)}
          </span>
        ) : null}
        <span className="zaomeng-codex-changes-stat">
          {stats.added ? <span className="add">+{stats.added}</span> : null}
          {stats.removed ? (
            <span className="remove">-{stats.removed}</span>
          ) : null}
        </span>
        <ChevronRight
          className={`zaomeng-codex-activity-chevron ${expanded ? "expanded" : ""}`}
        />
      </button>
      <div
        className={`zaomeng-codex-changes-body ${expanded ? "expanded" : ""}`}
      >
        {files.map((file) => (
          <div key={file.displayPath} className="zaomeng-codex-changes-file">
            <span className={`zaomeng-codex-changes-badge ${file.action}`}>
              {file.action}
            </span>
            <span className="zaomeng-codex-changes-name">
              {sanitizeVisibleText(file.displayPath || file.name)}
            </span>
            <span className="zaomeng-codex-changes-lines">
              {file.added ? <em className="add">+{file.added}</em> : null}
              {file.removed ? (
                <em className="remove">-{file.removed}</em>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineArtifactCard({
  item,
  onMediaLoad,
  onPreviewMedia,
}: {
  item: TimelineItem;
  onMediaLoad: () => void;
  onPreviewMedia: (preview: MediaPreview) => void;
}) {
  const mediaKind = item.mediaKind || "file";
  const url = item.url || item.files?.[0]?.url || "";
  const displayUrl = workflowAttachmentDisplayUrl(url, mediaKind);
  const title = sanitizeVisibleText(item.title || item.text || "文件");
  const subtitle = sanitizeVisibleText(
    item.subtitle || mediaKindLabel(mediaKind),
  );
  const openFile = () => {
    if (url)
      window.open(
        downloadUrlForProjectFileUrl(url),
        "_blank",
        "noopener,noreferrer",
      );
  };
  const previewMedia = () => {
    if (url && (mediaKind === "image" || mediaKind === "video")) {
      onPreviewMedia({ url, title, mediaKind });
    }
  };

  if (mediaKind === "image") {
    return (
      <div className="zaomeng-codex-media">
        <div className="group relative inline-block max-w-full">
          {url ? (
            <button
              type="button"
              onClick={previewMedia}
              className="block max-w-full cursor-zoom-in"
              aria-label="查看图片"
            >
              <CodexMediaImage
                source={url}
                alt={title}
                onLoad={onMediaLoad}
                fallbackClassName="aspect-square w-[240px] rounded-[10px]"
              />
            </button>
          ) : (
            <div className="grid aspect-square w-[240px] place-items-center rounded-[10px] bg-[var(--color-token-bg-tertiary)] text-[var(--color-token-description-foreground)]">
              <ImagePlus className="h-7 w-7" />
            </div>
          )}
          <button
            type="button"
            title="查看图片"
            aria-label="查看图片"
            disabled={!url}
            onClick={previewMedia}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-[8px] bg-black/45 text-white/82 opacity-0 shadow-[0_6px_18px_rgba(0,0,0,0.24)] backdrop-blur transition-opacity hover:bg-black/62 hover:text-white disabled:hidden group-hover:opacity-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (mediaKind === "video") {
    return (
      <div className="zaomeng-codex-media">
        <div className="group relative inline-block max-w-full">
          {displayUrl ? (
            <video
              src={displayUrl}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={onMediaLoad}
            />
          ) : (
            <div className="grid aspect-video w-[320px] place-items-center rounded-[10px] bg-[var(--color-token-bg-tertiary)] text-[var(--color-token-description-foreground)]">
              <FileCode2 className="h-7 w-7" />
            </div>
          )}
          <button
            type="button"
            title="全屏查看视频"
            aria-label="全屏查看视频"
            disabled={!url}
            onClick={previewMedia}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-[8px] bg-black/45 text-white/82 opacity-0 shadow-[0_6px_18px_rgba(0,0,0,0.24)] backdrop-blur transition-opacity hover:bg-black/62 hover:text-white disabled:hidden group-hover:opacity-100"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="zaomeng-codex-file">
      <button
        type="button"
        disabled={!url}
        onClick={openFile}
        className="zaomeng-codex-file-icon disabled:cursor-default"
        aria-label="打开附件"
      >
        <FileCode2 className="h-5 w-5" />
      </button>
      <button
        type="button"
        disabled={!url}
        onClick={openFile}
        className="min-w-0 text-left disabled:cursor-default"
      >
        <div className="zaomeng-codex-file-title">{title}</div>
        <div className="zaomeng-codex-file-subtitle">{subtitle}</div>
        {mediaKind === "audio" && displayUrl ? (
          <audio
            src={displayUrl}
            controls
            className="mt-2 h-8 w-full"
            onLoadedMetadata={onMediaLoad}
          />
        ) : null}
      </button>
      <button
        type="button"
        title={mediaKind === "audio" ? "打开附件" : "下载文件"}
        aria-label={mediaKind === "audio" ? "打开附件" : "下载文件"}
        disabled={!url}
        onClick={openFile}
        className="zaomeng-codex-icon-button"
      >
        {mediaKind === "audio" ? (
          <ExternalLink className="h-3.5 w-3.5" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function generationFrameForItem(item: TimelineItem) {
  const ratioMatch = String(item.generationAspectRatio || "")
    .trim()
    .replace(/\s+/g, "")
    .match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  let width = Number(ratioMatch?.[1] || item.generationWidth || 0);
  let height = Number(ratioMatch?.[2] || item.generationHeight || 0);
  if (!(width > 0 && height > 0)) {
    width =
      item.generationKind === "audio"
        ? 16
        : item.generationKind === "video" || item.generationKind === "playlist"
          ? 16
          : 1;
    height =
      item.generationKind === "audio"
        ? 5
        : item.generationKind === "video" || item.generationKind === "playlist"
          ? 9
          : 1;
  }
  const ratio = Math.max(0.25, Math.min(4, width / height));
  const maxWidth = ratio < 0.82 ? 246 : ratio < 1.15 ? 304 : 430;
  return { width, height, maxWidth };
}

function TimelineGenerationCard({
  item,
  onMediaLoad,
  onPreviewMedia,
}: {
  item: TimelineItem;
  onMediaLoad: () => void;
  onPreviewMedia: (preview: MediaPreview) => void;
}) {
  const generationKind =
    item.generationKind || normalizeWorkflowGenerationKind(item.mediaKind);
  const mediaKind = workflowGenerationMediaKind(generationKind);
  const status = item.generationStatus || "generating";
  const url = item.resultUrls?.[0] || item.url || "";
  const title = sanitizeVisibleText(
    item.title || workflowGenerationStatusTitle(generationKind, status),
  );
  const generationDetail = sanitizeVisibleText(
    status === "failed"
      ? item.generationError || ""
      : item.generationPrompt || item.detail || "",
  );
  const frame = generationFrameForItem(item);
  const progressLabel = Number.isFinite(Number(item.generationProgress))
    ? Math.round(
        Math.max(0, Math.min(1, Number(item.generationProgress))) * 100,
      ) + "%"
    : "生成中";
  const previewMedia = () => {
    if (url && (mediaKind === "image" || mediaKind === "video"))
      onPreviewMedia({ url, title, mediaKind });
  };

  if (status === "complete" && url) {
    return (
      <TimelineArtifactCard
        item={{
          ...item,
          kind: "artifact",
          mediaKind,
          url,
          previewUrl: url,
          title:
            generationKind === "playlist"
              ? "合成视频"
              : mediaKind === "audio"
                ? "生成音频"
                : mediaKind === "video"
                  ? "生成视频"
                  : "生成图片",
          subtitle: mediaKindLabel(mediaKind),
        }}
        onMediaLoad={onMediaLoad}
        onPreviewMedia={onPreviewMedia}
      />
    );
  }

  return (
    <div className="zaomeng-codex-media">
      <div
        className={
          "zaomeng-codex-generation-frame " +
          (status === "failed" ? "is-failed" : "is-generating")
        }
        style={{
          width: "min(100%, " + frame.maxWidth + "px)",
          aspectRatio: frame.width + " / " + frame.height,
        }}
      >
        {status === "generating" ? (
          <div className="zaomeng-codex-generation-sweep" aria-hidden="true" />
        ) : null}
        <div className="zaomeng-codex-generation-kind" aria-hidden="true">
          {generationKind === "playlist" ? (
            <Clapperboard className="h-4 w-4" />
          ) : mediaKind === "audio" ? (
            <Music className="h-4 w-4" />
          ) : mediaKind === "video" ? (
            <Video className="h-4 w-4" />
          ) : (
            <ImagePlus className="h-4 w-4" />
          )}
        </div>
        <div className="zaomeng-codex-generation-copy">
          <div className="flex items-center gap-2 text-[13px] font-medium leading-5 text-white/90">
            {status === "failed" ? (
              <AlertCircle className="h-4 w-4 text-[#ff8b84]" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin text-white/65" />
            )}
            <span>{status === "failed" ? title : progressLabel}</span>
          </div>
          {generationDetail ? (
            <div className="mt-1 line-clamp-2 text-[11px] leading-[17px] text-white/46">
              {generationDetail}
            </div>
          ) : null}
        </div>
        {url ? (
          <button
            type="button"
            aria-label="查看结果"
            onClick={previewMedia}
            className="absolute inset-0"
          />
        ) : null}
      </div>
    </div>
  );
}

function UserAttachmentPreview({
  file,
  onMediaLoad,
  onPreviewMedia,
}: {
  file: {
    path: string;
    name: string;
    url: string;
    mediaKind: NonNullable<TimelineItem["mediaKind"]>;
  };
  onMediaLoad: () => void;
  onPreviewMedia: (preview: MediaPreview) => void;
}) {
  const openFile = () => {
    if (file.url) window.open(file.url, "_blank", "noopener,noreferrer");
  };
  const label = mediaKindLabel(file.mediaKind);
  const title = sanitizeVisibleText(
    file.name || file.path.split("/").pop() || label,
  );
  const previewMedia = () => {
    if (
      file.url &&
      (file.mediaKind === "image" || file.mediaKind === "video")
    ) {
      onPreviewMedia({ url: file.url, title, mediaKind: file.mediaKind });
    }
  };

  if (file.mediaKind === "image") {
    return (
      <button
        type="button"
        title={`查看 ${title}`}
        aria-label={`查看 ${title}`}
        className="zaomeng-codex-user-attachment image"
        onClick={previewMedia}
      >
        {file.url ? (
          <CodexMediaImage
            source={file.url}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
            fallbackClassName="absolute inset-0"
            onLoad={onMediaLoad}
          />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
      </button>
    );
  }

  if (file.mediaKind === "video") {
    return (
      <button
        type="button"
        title={`查看 ${title}`}
        aria-label={`查看 ${title}`}
        className="zaomeng-codex-user-attachment video"
        onClick={previewMedia}
      >
        {file.url ? (
          <video
            src={file.url}
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={onMediaLoad}
          />
        ) : (
          <FileCode2 className="h-4 w-4" />
        )}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      title={`打开 ${title}`}
      aria-label={`打开 ${title}`}
      className="zaomeng-codex-user-file"
      onClick={openFile}
    >
      <span className="zaomeng-codex-user-file-icon">
        <FileCode2 className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <strong>{title}</strong>
        <em>{label}</em>
      </span>
    </button>
  );
}

export function CodexSupportWidget({
  label = "造梦智能体",
  scope = "global",
  launcherIcon = "default",
  workflowProjectId = null,
  canvasSessionId = null,
}: CodexSupportWidgetProps = {}) {
  const pathname = usePathname();
  const agentLabel = label.trim() || "造梦智能体";
  const launcherStorageKey =
    scope === "workflow"
      ? "zaomeng-director-agent-launcher-position-v2-top-right"
      : LAUNCHER_POSITION_STORAGE_KEY;
  const [open, setOpen] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [sending, setSending] = useState(false);
  const [session, setSession] = useState<SupportSession | null>(null);
  const [task, setTask] = useState<CodexTask | null>(null);
  const [tasks, setTasks] = useState<CodexTask[]>([]);
  const [selectedCodexModel, setSelectedCodexModel] = useState("");
  const [codexModels, setCodexModels] = useState<CodexModelOption[]>([]);
  const [codexModelsLoading, setCodexModelsLoading] = useState(false);
  const [codexModelsWarning, setCodexModelsWarning] = useState("");
  const [events, setEvents] = useState<CodexEvent[]>([]);
  const [skills, setSkills] = useState<CodexSkill[]>([]);
  const [plugins, setPlugins] = useState<CodexPlugin[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedContext, setSelectedContext] =
    useState<SelectedContext | null>(null);
  const [activePluginApp, setActivePluginApp] = useState<CodexPlugin | null>(
    null,
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [activeHeaderMenu, setActiveHeaderMenu] = useState<
    "new" | "history" | null
  >(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [olderHistoryLoading, setOlderHistoryLoading] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState("");
  const [providerTaskResults, setProviderTaskResults] =
    useState<ProviderTaskResultMap>({});
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenu | null>(
    null,
  );
  const [hiddenConversationTabIds, setHiddenConversationTabIds] = useState<
    string[]
  >([]);
  const [mediaPreview, setMediaPreview] = useState<MediaPreview | null>(null);
  const [launcherPosition, setLauncherPosition] =
    useState<LauncherPosition | null>(null);
  const [showLauncherGreeting, setShowLauncherGreeting] = useState(true);
  const [error, setError] = useState("");
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const wasTimelineOpenRef = useRef(false);
  const eventsRef = useRef<CodexEvent[]>([]);
  const logWindowRef = useRef<CodexLogWindow>({
    taskId: "",
    total: 0,
    start: 0,
    end: 0,
    hasMore: false,
    revision: "",
  });
  const activeLogRequestRef = useRef("");
  const loadingOlderHistoryRef = useRef(false);
  const followingTimelineRef = useRef(true);
  const prependScrollAnchorRef = useRef<{
    taskId: string;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftModeRef = useRef(false);
  const preserveComposerAttachmentsRef = useRef(false);
  const pendingExternalSkillRef = useRef<SelectedContext | null>(null);
  const initializeRequestRef = useRef(0);
  const codexModelsRequestRef = useRef(0);
  const codexModelContextRef = useRef("");
  const launcherDragRef = useRef<LauncherDragState | null>(null);
  const suppressLauncherClickRef = useRef(false);
  const providerPollsRef = useRef<
    Map<string, { controller: AbortController; timer: number | null }>
  >(new Map());
  const dispatchedWorkflowGenerationRef = useRef<Map<string, string>>(
    new Map(),
  );
  const [workflowAttachmentSources, setWorkflowAttachmentSources] = useState<
    Map<string, WorkflowAttachmentSource>
  >(readWorkflowAttachmentSources);
  const timeline = useMemo(() => {
    const activeTaskId = String(task?.id || "").trim();
    const logTaskId = String(logWindowRef.current.taskId || "").trim();
    const taskEvents =
      !activeTaskId || activeTaskId === logTaskId ? events : [];
    const items = buildTimeline(
      taskEvents,
      session?.project?.id,
      providerTaskResults,
      task?.id || "",
      task?.status || "",
    );
    return scope === "workflow"
      ? items.filter((item) => !isLegacyWorkflowPermissionRetryMessage(item))
      : items;
  }, [
    events,
    providerTaskResults,
    scope,
    session?.project?.id,
    task?.id,
    task?.status,
  ]);
  const lastTimelineText = timeline[timeline.length - 1]?.text || "";
  const composerTokenUsage = useMemo(
    () => tokenUsageLabel(latestTokenUsage(events)),
    [events],
  );
  const taskRunning = task?.status === "running" || task?.status === "queued";
  const backgroundRunning = tasks.some(
    (item) => item.status === "running" || item.status === "queued",
  );
  const visiblePlugins = useMemo(
    () =>
      scope === "workflow"
        ? plugins.filter((plugin) => !pluginIsCowart(plugin))
        : plugins,
    [plugins, scope],
  );
  const selectableSkills = useMemo(
    () => skills.filter(isFrontEndSelectableCodexSkill),
    [skills],
  );
  const activePluginFrameSrc =
    scope !== "workflow" && activePluginApp && session?.project?.id
      ? cowartFrameUrl(activePluginApp, session.project.id)
      : "";
  const cowartWidgetSignal = useMemo(
    () => latestCowartWidgetSignal(events),
    [events],
  );
  const hiddenConversationTabIdSet = useMemo(
    () => new Set(hiddenConversationTabIds),
    [hiddenConversationTabIds],
  );
  const conversationTabs = useMemo(() => {
    const byId = new Map<string, CodexTask>();
    tasks.forEach((item) => byId.set(item.id, item));
    if (task?.id) byId.set(task.id, task);
    return Array.from(byId.values())
      .filter((item) => !hiddenConversationTabIdSet.has(item.id))
      .sort((a, b) =>
        String(b.updated_at || b.created_at || "").localeCompare(
          String(a.updated_at || a.created_at || ""),
        ),
      )
      .slice(0, 12);
  }, [hiddenConversationTabIdSet, task, tasks]);
  const slashQuery =
    draft.trimStart().startsWith("/") && !draft.includes("\n")
      ? draft.trimStart().slice(1).trim().toLowerCase()
      : "";
  const slashMenuItems = useMemo(() => {
    const items = [
      ...selectableSkills.map((skill) => ({
        ...skill,
        name: codexSkillDisplayName(skill),
        description: codexSkillDisplayDescription(skill),
        type: "skill" as const,
      })),
      ...visiblePlugins.map((plugin) => ({
        ...plugin,
        type: "plugin" as const,
      })),
    ];
    if (!slashQuery) return items;
    return items.filter((item) =>
      `${item.name || ""} ${item.description || ""}`
        .toLowerCase()
        .includes(slashQuery),
    );
  }, [selectableSkills, slashQuery, visiblePlugins]);

  const commitLogWindow = useCallback(
    (nextEvents: CodexEvent[], nextWindow: CodexLogWindow) => {
      const currentEvents = eventsRef.current;
      const eventsChanged = !sameCodexEventSequence(currentEvents, nextEvents);
      eventsRef.current = eventsChanged ? nextEvents : currentEvents;
      logWindowRef.current = nextWindow;
      if (eventsChanged) setEvents(nextEvents);
    },
    [],
  );

  const clearLogWindow = useCallback(() => {
    activeLogRequestRef.current = "";
    loadingOlderHistoryRef.current = false;
    followingTimelineRef.current = true;
    prependScrollAnchorRef.current = null;
    setOlderHistoryLoading(false);
    commitLogWindow([], {
      taskId: "",
      total: 0,
      start: 0,
      end: 0,
      hasMore: false,
      revision: "",
    });
  }, [commitLogWindow]);

  const applyLatestLogPage = useCallback(
    (taskId: string, page: CodexLogPage, resetHistory = false) => {
      const currentWindow = logWindowRef.current;
      const currentEvents = eventsRef.current;
      if (resetHistory || currentWindow.taskId !== taskId) {
        commitLogWindow(page.events, {
          taskId,
          total: page.total,
          start: page.start,
          end: page.end,
          hasMore: page.has_more,
          revision: page.revision || "",
        });
        return;
      }

      if (page.unchanged) {
        commitLogWindow(currentEvents, {
          ...currentWindow,
          total: page.total,
          end: page.end,
          hasMore: currentWindow.start > 0,
          revision: page.revision || currentWindow.revision,
        });
        return;
      }

      if (page.delta && page.patches) {
        const nextEvents = [...currentEvents];
        let validDelta = true;
        for (const patch of page.patches) {
          const offset = patch.index - currentWindow.start;
          if (offset < 0) continue;
          if (offset < nextEvents.length) nextEvents[offset] = patch.event;
          else if (offset === nextEvents.length) nextEvents.push(patch.event);
          else validDelta = false;
        }
        if (validDelta) {
          commitLogWindow(nextEvents, {
            ...currentWindow,
            total: page.total,
            end: page.end,
            hasMore: currentWindow.start > 0,
            revision: page.revision || currentWindow.revision,
          });
          return;
        }
        logWindowRef.current = { ...currentWindow, revision: "" };
        return;
      }

      const overlapOffset = page.start - currentWindow.start;
      const overlapsLoadedWindow =
        overlapOffset >= 0 && overlapOffset <= currentEvents.length;
      const nextEvents = overlapsLoadedWindow
        ? [...currentEvents.slice(0, overlapOffset), ...page.events]
        : page.events;
      const nextStart = overlapsLoadedWindow ? currentWindow.start : page.start;
      commitLogWindow(nextEvents, {
        taskId,
        total: page.total,
        start: nextStart,
        end: page.end,
        hasMore: nextStart > 0,
        revision: page.revision || currentWindow.revision,
      });
    },
    [commitLogWindow],
  );

  const scrollTimelineToBottom = useCallback(
    (behavior: ScrollBehavior = "auto", forceFollow = true) => {
      const element = timelineRef.current;
      if (!element) return;
      if (!forceFollow && !followingTimelineRef.current) return;
      if (forceFollow) followingTimelineRef.current = true;
      if (scrollFrameRef.current !== null)
        window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        element.scrollTo({ top: element.scrollHeight, behavior });
      });
    },
    [],
  );

  const followLatestTimelineLayout = useCallback(() => {
    scrollTimelineToBottom("auto", false);
  }, [scrollTimelineToBottom]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        WORKFLOW_ATTACHMENT_SOURCE_STORAGE_KEY,
        JSON.stringify(
          Array.from(workflowAttachmentSources.entries()).slice(-160),
        ),
      );
    } catch {}
  }, [workflowAttachmentSources]);

  const workflowGenerationReferences = useMemo<
    CodexWorkflowGenerationReference[]
  >(() => {
    const projectId = session?.project?.id || "";
    const attachmentsByIdentity = new Map<string, Attachment>();
    attachments.forEach((item) => {
      [item.path, item.relative_path, item.url, item.public_url, item.local_url]
        .map((value) => artifactDedupeKey(String(value || "")))
        .filter(Boolean)
        .forEach((identity) => attachmentsByIdentity.set(identity, item));
    });
    const filePaths = [
      ...(task?.images || []),
      ...(task?.attachments || []),
      ...attachments
        .map((item) => item.path || item.relative_path)
        .filter(Boolean),
    ];
    const files = filePaths
      .map((filePath) => artifactFileFromPath(filePath, "", projectId, "user"))
      .filter(isTimelineFile)
      .filter(
        (file) =>
          file.mediaKind === "image" ||
          file.mediaKind === "video" ||
          file.mediaKind === "audio",
      );
    return files
      .filter(
        (file, index, list) =>
          list.findIndex(
            (item) =>
              artifactDedupeKey(item.path) === artifactDedupeKey(file.path),
          ) === index,
      )
      .map((file) => {
        const source = [file.path, file.url]
          .map((value) =>
            workflowAttachmentSources.get(artifactDedupeKey(value)),
          )
          .find(Boolean);
        const attachment = [file.path, file.url]
          .map((value) => attachmentsByIdentity.get(artifactDedupeKey(value)))
          .find(Boolean);
        const attachmentPublicUrl = String(
          attachment?.public_url ||
            (isExternalUrl(attachment?.url) ? attachment?.url : "") ||
            source?.publicUrl ||
            "",
        ).trim();
        const canvasUrl = attachmentPublicUrl || source?.sourceUrl || file.url;
        return {
          url: canvasUrl,
          path: file.path,
          name: file.name,
          mediaKind: file.mediaKind,
          nodeId: source?.nodeId || attachment?.workflowNodeId,
          sourceUrl: canvasUrl,
          naturalWidth:
            Number(attachment?.naturalWidth || source?.naturalWidth || 0) ||
            undefined,
          naturalHeight:
            Number(attachment?.naturalHeight || source?.naturalHeight || 0) ||
            undefined,
        };
      });
  }, [
    attachments,
    session?.project?.id,
    task?.attachments,
    task?.images,
    workflowAttachmentSources,
  ]);

  useEffect(() => {
    for (const runtime of providerPollsRef.current.values()) {
      runtime.controller.abort();
      if (runtime.timer !== null) window.clearTimeout(runtime.timer);
    }
    providerPollsRef.current.clear();
    dispatchedWorkflowGenerationRef.current.clear();
    setProviderTaskResults({});
  }, [task?.id]);

  useEffect(() => {
    const taskAllowsPolling =
      task?.status !== "cancelled" && task?.status !== "failed";
    const pendingItems = taskAllowsPolling
      ? timeline.filter(
          (item) =>
            item.kind === "generation" &&
            item.generationStatus === "generating" &&
            (item.generationStatusUrl ||
              (item.generationTaskId && item.generationTaskType)),
        )
      : [];
    const activePollKeys = new Set(
      pendingItems.map((item) => {
        const key =
          item.generationTaskId || item.generationStatusUrl || item.id;
        return `${task?.id || "draft"}:${key}`;
      }),
    );
    for (const [pollKey, runtime] of providerPollsRef.current) {
      if (activePollKeys.has(pollKey)) continue;
      runtime.controller.abort();
      if (runtime.timer !== null) window.clearTimeout(runtime.timer);
      providerPollsRef.current.delete(pollKey);
    }
    pendingItems.forEach((item) => {
      const key = item.generationTaskId || item.generationStatusUrl || item.id;
      const pollKey = `${task?.id || "draft"}:${key}`;
      if (providerPollsRef.current.has(pollKey)) return;
      const runtime = {
        controller: new AbortController(),
        timer: null as number | null,
      };
      providerPollsRef.current.set(pollKey, runtime);
      const finish = () => {
        const current = providerPollsRef.current.get(pollKey);
        if (current !== runtime) return;
        if (current.timer !== null) window.clearTimeout(current.timer);
        providerPollsRef.current.delete(pollKey);
      };
      const poll = async (attempt = 0) => {
        if (runtime.controller.signal.aborted) return finish();
        try {
          const result = await fetchProviderTaskResult(
            item,
            runtime.controller.signal,
          );
          if (runtime.controller.signal.aborted) return finish();
          setProviderTaskResults((previous) => ({
            ...previous,
            [key]: result,
            ...(item.generationTaskId && item.generationTaskId !== key
              ? { [item.generationTaskId]: result }
              : {}),
          }));
          if (
            result.status === "complete" ||
            result.status === "failed" ||
            attempt >= 160
          ) {
            return finish();
          }
        } catch (cause) {
          if (
            runtime.controller.signal.aborted ||
            (cause instanceof DOMException && cause.name === "AbortError")
          )
            return finish();
          if (attempt >= 160) {
            return finish();
          }
        }
        runtime.timer = window.setTimeout(
          () => {
            void poll(attempt + 1);
          },
          Math.min(10000, 1800 + attempt * 350),
        );
      };
      void poll();
    });
  }, [task?.id, task?.status, timeline]);

  useEffect(
    () => () => {
      for (const runtime of providerPollsRef.current.values()) {
        runtime.controller.abort();
        if (runtime.timer !== null) window.clearTimeout(runtime.timer);
      }
      providerPollsRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    if (scope !== "workflow" || typeof window === "undefined") return;
    timeline.forEach((item) => {
      if (item.kind !== "generation") return;
      const status = item.generationStatus || "generating";
      const hasGenerationPayload = Boolean(
        String(item.generationPrompt || item.detail || "").trim() ||
        item.resultUrls?.length ||
        item.files?.length ||
        item.url ||
        item.previewUrl,
      );
      if (status === "generating" && !hasGenerationPayload) return;
      const providerTaskId = item.generationTaskId || "";
      const signature = [
        status,
        item.resultUrls?.join("|") || "",
        item.generationPrompt || "",
        item.generationNodeId || "",
        item.generationNodeKind || "",
        workflowGenerationReferences
          .map(
            (ref) => `${ref.mediaKind}:${ref.sourceUrl || ref.url || ref.path}`,
          )
          .join("|"),
      ].join("::");
      const key = providerTaskId || item.id;
      if (dispatchedWorkflowGenerationRef.current.get(key) === signature)
        return;
      dispatchedWorkflowGenerationRef.current.set(key, signature);
      const detail: CodexWorkflowGenerationDetail = {
        source: "codex",
        codexTaskId: task?.id,
        codexTaskStatus: task?.status,
        itemId: item.id,
        nodeId: item.generationNodeId,
        providerTaskId,
        taskType: item.generationTaskType,
        statusUrl: item.generationStatusUrl,
        status,
        kind:
          item.generationKind ||
          normalizeWorkflowGenerationKind(item.mediaKind),
        nodeKind: item.generationNodeKind,
        prompt: item.generationPrompt || item.detail || "",
        modelId: item.generationModelId,
        modelName: item.generationModelName,
        aspectRatio: item.generationAspectRatio,
        width: item.generationWidth,
        height: item.generationHeight,
        resultUrls: item.resultUrls || [],
        references: workflowGenerationReferences,
        error: status === "failed" ? item.generationError : undefined,
      };
      window.dispatchEvent(
        new CustomEvent("ideart.codex-workflow-generation", { detail }),
      );
    });
  }, [scope, task?.id, task?.status, timeline, workflowGenerationReferences]);

  useEffect(() => {
    if (scope !== "workflow" || typeof window === "undefined") return;
    const handleWorkflowCanvasGenerationSettled = (event: Event) => {
      const detail = (
        event as CustomEvent<WorkflowCanvasGenerationSettledDetail>
      ).detail;
      const codexTaskId = String(detail?.codexTaskId || "").trim();
      if (
        !detail ||
        detail.source !== "workflow-canvas" ||
        !codexTaskId ||
        codexTaskId !== task?.id
      )
        return;
      const nodeId = String(detail.nodeId || "").trim();
      const prompt = String(detail.prompt || "").trim();
      const kind = normalizeWorkflowGenerationKind(
        detail.kind,
        detail.nodeKind,
      );
      const result: ProviderTaskResult = {
        status: detail.status === "complete" ? "complete" : "failed",
        kind,
        urls: Array.isArray(detail.resultUrls)
          ? detail.resultUrls
              .map(String)
              .map((item) => item.trim())
              .filter(Boolean)
          : [],
        error: String(detail.error || "").trim() || undefined,
      };
      setProviderTaskResults((previous) => ({
        ...previous,
        ...(nodeId ? { [`canvas:${codexTaskId}:node:${nodeId}`]: result } : {}),
        ...(prompt
          ? { [`canvas:${codexTaskId}:prompt:${kind}:${prompt}`]: result }
          : {}),
      }));
    };
    window.addEventListener(
      "ideart.workflow-codex-generation-settled",
      handleWorkflowCanvasGenerationSettled as EventListener,
    );
    return () =>
      window.removeEventListener(
        "ideart.workflow-codex-generation-settled",
        handleWorkflowCanvasGenerationSettled as EventListener,
      );
  }, [scope, task?.id]);

  const launcherDimensions = () => {
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    if (launcherIcon === "director") {
      return mobile
        ? {
            width: DIRECTOR_LAUNCHER_MOBILE_WIDTH,
            height: DIRECTOR_LAUNCHER_MOBILE_HEIGHT,
          }
        : {
            width: DIRECTOR_LAUNCHER_DESKTOP_WIDTH,
            height: DIRECTOR_LAUNCHER_DESKTOP_HEIGHT,
          };
    }
    const size = mobile ? LAUNCHER_MOBILE_SIZE : LAUNCHER_DESKTOP_SIZE;
    return { width: size, height: size };
  };

  const clampLauncherPosition = useCallback(
    (position: LauncherPosition): LauncherPosition => {
      const dimensions = launcherDimensions();
      const maxX = Math.max(
        LAUNCHER_MARGIN,
        window.innerWidth - dimensions.width - LAUNCHER_MARGIN,
      );
      const maxY = Math.max(
        LAUNCHER_MARGIN,
        window.innerHeight - dimensions.height - LAUNCHER_MARGIN,
      );
      return {
        x: Math.min(Math.max(LAUNCHER_MARGIN, position.x), maxX),
        y: Math.min(Math.max(LAUNCHER_MARGIN, position.y), maxY),
      };
    },
    [],
  );

  const defaultLauncherPosition = useCallback(() => {
    const dimensions = launcherDimensions();
    if (launcherIcon === "director") {
      const top = window.matchMedia("(max-width: 640px)").matches
        ? DIRECTOR_LAUNCHER_MOBILE_TOP
        : DIRECTOR_LAUNCHER_DESKTOP_TOP;
      return clampLauncherPosition({
        x: window.innerWidth - dimensions.width - 24,
        y: top,
      });
    }
    return clampLauncherPosition({
      x: window.innerWidth - dimensions.width - 24,
      y: window.innerHeight - dimensions.height - 20,
    });
  }, [clampLauncherPosition, launcherIcon]);

  const refreshTask = useCallback(
    async (taskId: string, options: { resetHistory?: boolean } = {}) => {
      activeLogRequestRef.current = taskId;
      const nextTask = await codexFetch<CodexTask>(
        `/tasks/${encodeURIComponent(taskId)}?include_tail=0`,
      );
      const currentWindow = logWindowRef.current;
      const revisionQuery =
        options.resetHistory !== true &&
        currentWindow.taskId === taskId &&
        currentWindow.revision
          ? `&revision=${encodeURIComponent(currentWindow.revision)}&end=${currentWindow.end}`
          : "";
      const logs = await codexFetch<CodexLogPage>(
        `/tasks/${encodeURIComponent(taskId)}/logs?paged=1&limit=${CODEX_LOG_PAGE_SIZE}${revisionQuery}`,
      );
      if (activeLogRequestRef.current !== taskId) return nextTask;
      setTask((current) =>
        sameCodexTaskView(current, nextTask) ? current : nextTask,
      );
      applyLatestLogPage(
        taskId,
        logs,
        options.resetHistory === true || logWindowRef.current.taskId !== taskId,
      );
      return nextTask;
    },
    [applyLatestLogPage],
  );

  const loadOlderHistory = useCallback(async () => {
    const currentWindow = logWindowRef.current;
    if (
      !currentWindow.taskId ||
      !currentWindow.hasMore ||
      loadingOlderHistoryRef.current
    )
      return;
    loadingOlderHistoryRef.current = true;
    setOlderHistoryLoading(true);
    const before = currentWindow.start;
    try {
      const page = await codexFetch<CodexLogPage>(
        `/tasks/${encodeURIComponent(currentWindow.taskId)}/logs?paged=1&limit=${CODEX_LOG_PAGE_SIZE}&before=${before}`,
      );
      const latestWindow = logWindowRef.current;
      if (
        latestWindow.taskId !== currentWindow.taskId ||
        latestWindow.start !== before
      )
        return;
      const element = timelineRef.current;
      if (element) {
        prependScrollAnchorRef.current = {
          taskId: currentWindow.taskId,
          scrollHeight: element.scrollHeight,
          scrollTop: element.scrollTop,
        };
      }
      commitLogWindow([...page.events, ...eventsRef.current], {
        taskId: currentWindow.taskId,
        total: Math.max(latestWindow.total, page.total),
        start: page.start,
        end: latestWindow.end,
        hasMore: page.has_more,
        revision: latestWindow.revision || page.revision || "",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取更早消息失败");
    } finally {
      loadingOlderHistoryRef.current = false;
      setOlderHistoryLoading(false);
    }
  }, [commitLogWindow]);

  const handleTimelineScroll = useCallback(() => {
    const element = timelineRef.current;
    if (!element) return;
    const distanceFromBottom = Math.max(
      0,
      element.scrollHeight - element.clientHeight - element.scrollTop,
    );
    followingTimelineRef.current =
      distanceFromBottom <= TIMELINE_BOTTOM_THRESHOLD;
    if (
      element.scrollTop <= TIMELINE_TOP_LOAD_THRESHOLD &&
      logWindowRef.current.hasMore
    ) {
      void loadOlderHistory();
    }
  }, [loadOlderHistory]);

  const refreshTasks = useCallback(async (projectId: string) => {
    const normalizedProjectId = String(projectId || "").trim();
    if (!normalizedProjectId) {
      setTasks([]);
      return [];
    }
    const nextTasks = await codexFetch<CodexTask[]>(
      `/tasks?project_id=${encodeURIComponent(normalizedProjectId)}`,
    );
    const normalizedTasks = Array.isArray(nextTasks) ? nextTasks : [];
    setTasks((current) =>
      sameCodexTaskList(current, normalizedTasks) ? current : normalizedTasks,
    );
    return normalizedTasks;
  }, []);

  const loadCodexModels = useCallback(async () => {
    const requestId = codexModelsRequestRef.current + 1;
    codexModelsRequestRef.current = requestId;
    setCodexModelsLoading(true);
    setCodexModelsWarning("");
    try {
      const payload = await codexFetch<CodexModelsResponse>("/models");
      if (codexModelsRequestRef.current !== requestId) return;
      const configuredModel = String(payload.configured_model || "").trim();
      const nextModels = normalizeCodexModelOptions(payload.models);
      setCodexModels(nextModels);
      setCodexModelsWarning(String(payload.warning || "").trim());
      setSelectedCodexModel((current) => {
        if (nextModels.some((item) => item.id === current)) return current;
        if (nextModels.some((item) => item.id === configuredModel)) {
          return configuredModel;
        }
        return nextModels[0]?.id || "";
      });
    } catch (cause) {
      if (codexModelsRequestRef.current !== requestId) return;
      setCodexModels([]);
      setCodexModelsWarning(
        cause instanceof Error ? cause.message : "读取模型列表失败",
      );
      setSelectedCodexModel("");
    } finally {
      if (codexModelsRequestRef.current === requestId) {
        setCodexModelsLoading(false);
      }
    }
  }, []);

  const initializeSupport = useCallback(async () => {
    const requestId = initializeRequestRef.current + 1;
    initializeRequestRef.current = requestId;
    setInitializing(true);
    setError("");
    try {
      const normalizedWorkflowProjectId =
        scope === "workflow" ? String(workflowProjectId || "").trim() : "";
      if (scope === "workflow" && !normalizedWorkflowProjectId) {
        throw new Error("当前工作流项目尚未准备完成");
      }
      const [nextSession, skillPayload] = await Promise.all([
        codexFetch<SupportSession>("/support/session", {
          method: "POST",
          json: {
            workflow_project_id: normalizedWorkflowProjectId || undefined,
          },
        }),
        codexFetch<{ skills?: CodexSkill[]; plugins?: CodexPlugin[] }>(
          "/skills",
        ),
      ]);
      const taskList = await codexFetch<CodexTask[]>(
        `/tasks?project_id=${encodeURIComponent(nextSession.project.id)}`,
      );
      if (initializeRequestRef.current !== requestId) return;
      const shouldPreserveComposerAttachments =
        preserveComposerAttachmentsRef.current;
      const pendingExternalSkill = pendingExternalSkillRef.current;
      preserveComposerAttachmentsRef.current = false;
      pendingExternalSkillRef.current = null;
      setTasks(Array.isArray(taskList) ? taskList : []);
      setSkills(skillPayload.skills || []);
      setPlugins(skillPayload.plugins || []);
      setSession(nextSession);
      const modelContextKey = scope + ":" + nextSession.project.id;
      if (codexModelContextRef.current !== modelContextKey) {
        codexModelContextRef.current = modelContextKey;
        setSelectedCodexModel(String(nextSession.task?.model || "").trim());
      }
      void loadCodexModels();
      if (draftModeRef.current) {
        setTask(null);
        clearLogWindow();
        setSelectedContext(pendingExternalSkill);
        setActivePluginApp(null);
        if (!shouldPreserveComposerAttachments) setAttachments([]);
      } else if (nextSession.task?.id) {
        const nextContext = nextSession.task.selected_context || null;
        const pluginApp =
          scope === "workflow"
            ? null
            : findPluginForContext(skillPayload.plugins || [], nextContext);
        setTask(nextSession.task);
        setSelectedContext(pendingExternalSkill || nextContext);
        setActivePluginApp(
          pendingExternalSkill
            ? null
            : pluginApp && pluginHasAppSurface(pluginApp)
              ? pluginApp
              : null,
        );
        if (!shouldPreserveComposerAttachments) {
          setAttachments(taskAttachmentDetails(nextSession.task));
        }
        await refreshTask(nextSession.task.id, { resetHistory: true });
      } else {
        setTask(null);
        clearLogWindow();
        setSelectedContext(pendingExternalSkill);
        setActivePluginApp(null);
        if (!shouldPreserveComposerAttachments) setAttachments([]);
      }
    } catch (cause) {
      if (initializeRequestRef.current === requestId) {
        setError(
          cause instanceof Error ? cause.message : `${agentLabel}暂时无法连接`,
        );
      }
    } finally {
      if (initializeRequestRef.current === requestId) setInitializing(false);
    }
  }, [
    agentLabel,
    clearLogWindow,
    loadCodexModels,
    refreshTask,
    scope,
    workflowProjectId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (scope === "workflow") {
      setLauncherPosition(null);
      return;
    }
    try {
      const saved = window.localStorage.getItem(launcherStorageKey);
      const parsed = saved
        ? (JSON.parse(saved) as Partial<LauncherPosition>)
        : null;
      if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
        setLauncherPosition(
          clampLauncherPosition({ x: Number(parsed.x), y: Number(parsed.y) }),
        );
        return;
      }
    } catch {}
    setLauncherPosition(defaultLauncherPosition());
  }, [
    clampLauncherPosition,
    defaultLauncherPosition,
    launcherStorageKey,
    scope,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || scope === "workflow") return;
    const handleResize = () => {
      setLauncherPosition((previous) => {
        const next = clampLauncherPosition(
          previous || defaultLauncherPosition(),
        );
        try {
          window.localStorage.setItem(launcherStorageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [
    clampLauncherPosition,
    defaultLauncherPosition,
    launcherStorageKey,
    scope,
  ]);

  useEffect(() => {
    if (!open) return;
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => void initializeSupport(), 32);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer) window.clearTimeout(timer);
    };
  }, [initializeSupport, open]);

  useEffect(() => {
    if (scope === "workflow") {
      setActivePluginApp(null);
      return;
    }
    const pluginApp = findPluginForContext(plugins, selectedContext);
    if (pluginApp && pluginHasAppSurface(pluginApp)) {
      setActivePluginApp((current) =>
        current?.id === pluginApp.id ? current : pluginApp,
      );
      return;
    }
    if (!selectedContext || selectedContext.type !== "plugin") {
      setActivePluginApp(null);
    }
  }, [plugins, scope, selectedContext]);

  useEffect(() => {
    if (scope === "workflow") return;
    if (!open || !session?.project?.id || !cowartWidgetSignal) return;
    const pluginApp = plugins.find(pluginIsCowart);
    if (!pluginApp) return;
    setActivePluginApp((current) =>
      current?.id === pluginApp.id ? current : pluginApp,
    );
    setSelectedContext((current) => {
      const currentPlugin = findPluginForContext([pluginApp], current);
      if (currentPlugin) return current;
      return {
        id: pluginApp.id,
        name: pluginDisplayName(pluginApp),
        type: "plugin",
        path: pluginContextPath(pluginApp),
      };
    });
  }, [cowartWidgetSignal, open, plugins, scope, session?.project?.id]);

  useEffect(() => {
    if (open || !showLauncherGreeting) return;
    const timer = window.setTimeout(
      () => setShowLauncherGreeting(false),
      10000,
    );
    return () => window.clearTimeout(timer);
  }, [open, showLauncherGreeting]);

  useEffect(() => {
    if (!open || !task?.id || !taskRunning) return;
    const timer = window.setInterval(() => {
      void refreshTask(task.id).catch((cause) => {
        setError(
          cause instanceof Error ? cause.message : `读取${agentLabel}状态失败`,
        );
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [agentLabel, open, refreshTask, task?.id, taskRunning]);

  useEffect(() => {
    if (!open || !backgroundRunning || !session?.project?.id) return;
    const timer = window.setInterval(() => {
      void refreshTasks(session.project.id).catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [backgroundRunning, open, refreshTasks, session?.project?.id]);

  useEffect(() => {
    if (!task?.id) return;
    setHiddenConversationTabIds((current) =>
      current.includes(task.id)
        ? current.filter((item) => item !== task.id)
        : current,
    );
  }, [task?.id]);

  useEffect(() => {
    if (!tabContextMenu) return;
    const close = () => setTabContextMenu(null);
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", close);
    };
  }, [tabContextMenu]);

  useLayoutEffect(() => {
    if (!open) {
      wasTimelineOpenRef.current = false;
      return;
    }
    if (!wasTimelineOpenRef.current) {
      wasTimelineOpenRef.current = true;
      scrollTimelineToBottom("auto");
      return;
    }
    const anchor = prependScrollAnchorRef.current;
    const element = timelineRef.current;
    if (anchor && element && anchor.taskId === logWindowRef.current.taskId) {
      prependScrollAnchorRef.current = null;
      element.scrollTop =
        anchor.scrollTop + element.scrollHeight - anchor.scrollHeight;
      return;
    }
    followLatestTimelineLayout();
  }, [
    error,
    events.length,
    followLatestTimelineLayout,
    lastTimelineText,
    open,
    taskRunning,
    timeline.length,
  ]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null)
        window.cancelAnimationFrame(scrollFrameRef.current);
    };
  }, []);

  const handleOpen = () => {
    if (suppressLauncherClickRef.current) {
      suppressLauncherClickRef.current = false;
      return;
    }
    setShowLauncherGreeting(false);
    setOpen(true);
  };

  const handleLauncherPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    const current = launcherPosition || defaultLauncherPosition();
    launcherDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleLauncherPointerMove = (
    event: PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = launcherDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    if (!drag.moved) return;
    const next = clampLauncherPosition({
      x: drag.originX + deltaX,
      y: drag.originY + deltaY,
    });
    setLauncherPosition(next);
  };

  const handleLauncherPointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = launcherDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    launcherDragRef.current = null;
    if (drag.moved) {
      suppressLauncherClickRef.current = true;
      const next = clampLauncherPosition({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY,
      });
      setLauncherPosition(next);
      try {
        window.localStorage.setItem(launcherStorageKey, JSON.stringify(next));
      } catch {}
      window.setTimeout(() => {
        suppressLauncherClickRef.current = false;
      }, 0);
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  };

  const submitCodexPrompt = useCallback(
    async (
      prompt: string,
      options: { clearDraft?: boolean; restoreDraftOnError?: boolean } = {},
    ) => {
      if (!prompt || !session?.project?.id || uploading || sending) return null;
      const codexModel = String(selectedCodexModel || task?.model || "").trim();
      if (!codexModel) {
        setError("请选择模型");
        return null;
      }
      const pendingAttachments = attachments;
      const pendingSelectedContext = selectedContext;
      if (
        scope !== "workflow" &&
        activePluginApp &&
        pluginIsCowart(activePluginApp) &&
        isCowartClosePrompt(prompt)
      ) {
        setActivePluginApp(null);
        setSelectedContext(null);
        if (options.clearDraft !== false) setDraft("");
        setAttachments([]);
        setSlashMenuOpen(false);
        setError("");
        window.setTimeout(() => scrollTimelineToBottom("auto"), 0);
        return null;
      }
      followingTimelineRef.current = true;
      setSending(true);
      setError("");
      if (options.clearDraft !== false) setDraft("");
      setAttachments([]);
      setSelectedContext(null);
      setSlashMenuOpen(false);
      try {
        const payload = {
          project_id: session.project.id,
          prompt,
          model: codexModel,
          reasoning_effort: "high",
          sandbox: "danger-full-access",
          client_scope: scope,
          workflow_project_id:
            scope === "workflow"
              ? String(workflowProjectId || "").trim() || undefined
              : undefined,
          canvas_session_id:
            scope === "workflow"
              ? String(canvasSessionId || "").trim() || undefined
              : undefined,
          images: pendingAttachments
            .filter(isImageAttachment)
            .map((item) => String(item.path || item.relative_path || "").trim())
            .filter(Boolean),
          attachments: pendingAttachments
            .map((item) => String(item.path || item.relative_path || "").trim())
            .filter(Boolean),
          selected_context: pendingSelectedContext,
        };
        const shouldAppendToTask = Boolean(
          task && (task.thread_id || taskRunning),
        );
        const nextTask =
          shouldAppendToTask && task
            ? await codexFetch<CodexTask>(
                `/tasks/${encodeURIComponent(task.id)}/messages`,
                { method: "POST", json: payload },
              )
            : await codexFetch<CodexTask>("/tasks", {
                method: "POST",
                json: payload,
              });
        draftModeRef.current = false;
        if (nextTask.id !== task?.id) clearLogWindow();
        setTask(nextTask);
        if (nextTask.model) setSelectedCodexModel(nextTask.model);
        void refreshTasks(nextTask.project_id || session.project.id).catch(
          () => undefined,
        );
        await refreshTask(nextTask.id);
        window.setTimeout(() => scrollTimelineToBottom("auto"), 0);
        return nextTask;
      } catch (cause) {
        if (options.restoreDraftOnError !== false) setDraft(prompt);
        setError(cause instanceof Error ? cause.message : "消息发送失败");
        throw cause;
      } finally {
        setSending(false);
      }
    },
    [
      activePluginApp,
      attachments,
      canvasSessionId,
      clearLogWindow,
      refreshTask,
      refreshTasks,
      scope,
      scrollTimelineToBottom,
      selectedContext,
      selectedCodexModel,
      sending,
      session?.config.model,
      session?.project?.id,
      task,
      taskRunning,
      uploading,
      workflowProjectId,
    ],
  );

  const sendMessage = async () => {
    const prompt = draft.trim() || (attachments.length ? "请分析这些附件" : "");
    await submitCodexPrompt(prompt, {
      clearDraft: true,
      restoreDraftOnError: true,
    }).catch(() => undefined);
  };

  useEffect(() => {
    if (scope === "workflow") return;
    if (!open || !session?.project?.id) return;
    const handleCowartBridgeMessage = (event: MessageEvent) => {
      const data = asJsonObject(event.data);
      const type = String(data?.type || "");
      const id = String(data?.id || "");
      if (!id || !type.startsWith("zaomeng:cowart:")) return;

      const respond = (payload: {
        ok: boolean;
        result?: unknown;
        error?: string;
      }) => {
        const message = {
          type: "zaomeng:cowart:bridge-response",
          id,
          ...payload,
        };
        const targetOrigin = event.origin || "*";
        try {
          event.source?.postMessage(message, { targetOrigin });
        } catch {
          event.source?.postMessage(message, { targetOrigin: "*" });
        }
      };

      if (type === "zaomeng:cowart:call-server-tool") {
        const request = asJsonObject(data?.request);
        void codexFetch(`/plugins/cowart/cowart/tool`, {
          method: "POST",
          json: {
            project_id: session.project.id,
            name: request?.name,
            arguments: request?.arguments,
          },
        })
          .then((result) => {
            const toolResult = asJsonObject(result);
            if (toolResult?.isError === true) {
              respond({ ok: true, result: toolResult });
              return;
            }
            respond({
              ok: true,
              result: {
                structuredContent: result,
                content: [{ type: "text", text: "OK" }],
              },
            });
          })
          .catch((cause) =>
            respond({
              ok: false,
              error:
                cause instanceof Error ? cause.message : "Cowart 工具调用失败",
            }),
          );
        return;
      }

      if (type === "zaomeng:cowart:send-follow-up") {
        const prompt = cowartPromptFromMessage(data?.message);
        if (!prompt) {
          respond({ ok: false, error: "Cowart 生成请求缺少提示词" });
          return;
        }
        void submitCodexPrompt(prompt, {
          clearDraft: false,
          restoreDraftOnError: false,
        })
          .then(() => respond({ ok: true, result: {} }))
          .catch((cause) =>
            respond({
              ok: false,
              error:
                cause instanceof Error
                  ? cause.message
                  : "发送 Cowart 生成请求失败",
            }),
          );
      }
    };
    window.addEventListener("message", handleCowartBridgeMessage);
    return () =>
      window.removeEventListener("message", handleCowartBridgeMessage);
  }, [open, scope, session?.project?.id, submitCodexPrompt]);

  const stopTask = async () => {
    if (!task?.id || !taskRunning) return;
    try {
      const nextTask = await codexFetch<CodexTask>(
        `/tasks/${encodeURIComponent(task.id)}/cancel`,
        { method: "POST", json: {} },
      );
      setTask(nextTask);
      await refreshTask(task.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : `停止${agentLabel}失败`,
      );
    }
  };

  const startNewChat = () => {
    draftModeRef.current = true;
    setTask(null);
    clearLogWindow();
    setDraft("");
    setAttachments([]);
    setSelectedContext(null);
    setActivePluginApp(null);
    setSlashMenuOpen(false);
    setActiveHeaderMenu(null);
    setTabContextMenu(null);
    setError("");
    window.setTimeout(
      () => document.getElementById("codex-support-input")?.focus(),
      0,
    );
  };

  const selectHistoryTask = async (targetTask: CodexTask) => {
    if (!targetTask.id || deletingTaskId === targetTask.id) return;
    setHiddenConversationTabIds((current) =>
      current.filter((item) => item !== targetTask.id),
    );
    if (targetTask.id === task?.id) {
      setSelectedCodexModel(String(targetTask.model || "").trim());
      setActiveHeaderMenu(null);
      setTabContextMenu(null);
      window.setTimeout(() => scrollTimelineToBottom("auto"), 0);
      return;
    }
    setHistoryLoading(true);
    setError("");
    try {
      draftModeRef.current = false;
      clearLogWindow();
      setTask(targetTask);
      const nextTask = await refreshTask(targetTask.id, { resetHistory: true });
      setSelectedCodexModel(String(nextTask.model || "").trim());
      const nextContext = nextTask.selected_context || null;
      const pluginApp = findPluginForContext(plugins, nextContext);
      setSelectedContext(nextContext);
      setActivePluginApp(
        pluginApp && pluginHasAppSurface(pluginApp) ? pluginApp : null,
      );
      setAttachments(taskAttachmentDetails(nextTask));
      setDraft("");
      setSlashMenuOpen(false);
      setActiveHeaderMenu(null);
      setTabContextMenu(null);
      window.setTimeout(() => scrollTimelineToBottom("auto"), 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取历史记录失败");
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteHistoryTask = async (targetTask: CodexTask) => {
    if (!targetTask.id || deletingTaskId) return;
    setDeletingTaskId(targetTask.id);
    setError("");
    try {
      await codexFetch<{ id: string }>(
        `/tasks/${encodeURIComponent(targetTask.id)}`,
        { method: "DELETE" },
      );
      setTasks((previous) =>
        previous.filter((item) => item.id !== targetTask.id),
      );
      setHiddenConversationTabIds((current) =>
        current.filter((item) => item !== targetTask.id),
      );
      if (task?.id === targetTask.id) {
        draftModeRef.current = true;
        setTask(null);
        clearLogWindow();
        setDraft("");
        setAttachments([]);
        setSelectedContext(null);
        setActivePluginApp(null);
        setSlashMenuOpen(false);
        setTabContextMenu(null);
      }
      if (session?.project?.id)
        await refreshTasks(session.project.id).catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除线程失败");
    } finally {
      setDeletingTaskId("");
      setTabContextMenu(null);
    }
  };

  const closeConversationTab = useCallback(
    (targetTask: CodexTask) => {
      if (!targetTask.id) return;
      setHiddenConversationTabIds((current) =>
        current.includes(targetTask.id) ? current : [...current, targetTask.id],
      );
      setTabContextMenu(null);
      if (task?.id !== targetTask.id) return;
      const fallback = conversationTabs.find(
        (item) => item.id !== targetTask.id,
      );
      if (fallback) {
        void selectHistoryTask(fallback);
        return;
      }
      startNewChat();
    },
    [conversationTabs, task?.id],
  );

  const closeAllConversationTabs = useCallback(() => {
    setHiddenConversationTabIds(conversationTabs.map((item) => item.id));
    setTabContextMenu(null);
    startNewChat();
  }, [conversationTabs]);

  const handleConversationTabContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    tab: CodexTask,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 184;
    const menuHeight = 132;
    const maxX =
      typeof window === "undefined"
        ? event.clientX
        : window.innerWidth - menuWidth - 8;
    const maxY =
      typeof window === "undefined"
        ? event.clientY
        : window.innerHeight - menuHeight - 8;
    setTabContextMenu({
      tab,
      x: Math.max(8, Math.min(event.clientX, maxX)),
      y: Math.max(8, Math.min(event.clientY, maxY)),
    });
    setActiveHeaderMenu(null);
  };

  const ensureSupportProject = useCallback(async () => {
    const normalizedWorkflowProjectId =
      scope === "workflow" ? String(workflowProjectId || "").trim() : "";
    const sessionMatchesWorkflow =
      scope !== "workflow" ||
      session?.project?.workflow_project_id === normalizedWorkflowProjectId;
    if (session?.project?.id && sessionMatchesWorkflow) return session.project;
    if (scope === "workflow" && !normalizedWorkflowProjectId) {
      throw new Error("当前工作流项目尚未准备完成");
    }
    const nextSession = await codexFetch<SupportSession>("/support/session", {
      method: "POST",
      json: { workflow_project_id: normalizedWorkflowProjectId || undefined },
    });
    setSession(nextSession);
    return nextSession.project;
  }, [scope, session, workflowProjectId]);

  const uploadAttachmentFile = useCallback(
    async (
      projectId: string,
      file: File,
      metadata?: WorkflowChatAttachmentPayload,
    ) => {
      const form = new FormData();
      form.append("file", file);
      if (metadata?.nodeId) form.append("workflowNodeId", metadata.nodeId);
      if (metadata?.url || metadata?.path)
        form.append("workflowSourceUrl", String(metadata.url || metadata.path));
      if (metadata?.mediaKind)
        form.append("workflowMediaKind", metadata.mediaKind);
      if (metadata?.platformFileId)
        form.append("workflowPlatformFileId", String(metadata.platformFileId));
      if (metadata?.platformFileUrl)
        form.append("workflowPlatformFileUrl", metadata.platformFileUrl);
      if (metadata?.seedanceAssetId)
        form.append("workflowSeedanceAssetId", metadata.seedanceAssetId);
      if (metadata?.seedanceAssetUrl)
        form.append("workflowSeedanceAssetUrl", metadata.seedanceAssetUrl);
      if (metadata?.seedanceAssetStatus)
        form.append(
          "workflowSeedanceAssetStatus",
          metadata.seedanceAssetStatus,
        );
      if (metadata?.seedanceAssetCategory)
        form.append(
          "workflowSeedanceAssetCategory",
          metadata.seedanceAssetCategory,
        );
      if (metadata?.portraitCompliantExempt)
        form.append("portraitCompliantExempt", "true");
      if (Number(metadata?.naturalWidth || 0) > 0)
        form.append("workflowNaturalWidth", String(metadata?.naturalWidth));
      if (Number(metadata?.naturalHeight || 0) > 0)
        form.append("workflowNaturalHeight", String(metadata?.naturalHeight));
      return codexFetch<Attachment>(
        `/projects/${encodeURIComponent(projectId)}/attachments`,
        {
          method: "POST",
          body: form,
        },
      );
    },
    [],
  );

  const workflowPayloadToAttachment = useCallback(
    async (
      projectId: string,
      file: WorkflowChatAttachmentPayload,
      index: number,
    ): Promise<Attachment | null> => {
      const rawPath = String(
        file.platformFileUrl || file.path || file.url || "",
      ).trim();
      if (!rawPath) return null;
      const hintedKind = String(file.mediaKind || "")
        .trim()
        .toLowerCase();
      const mediaKind = (
        [
          "image",
          "video",
          "audio",
          "presentation",
          "spreadsheet",
          "document",
          "pdf",
          "markdown",
          "file",
        ].includes(hintedKind)
          ? hintedKind
          : mediaKindForPath(rawPath)
      ) as TimelineItem["mediaKind"];
      const proxiedSource = proxiedMediaSourceUrl(rawPath);
      const codexProjectPath =
        projectPathFromCodexProjectFileViewUrl(projectId, rawPath) ||
        (proxiedSource
          ? projectPathFromCodexProjectFileViewUrl(projectId, proxiedSource)
          : "");
      const displayUrl = workflowAttachmentDisplayUrl(rawPath, mediaKind);
      const fallbackName = (() => {
        try {
          return decodeURIComponent(
            new URL(proxiedSource || rawPath, window.location.href).pathname
              .split("/")
              .pop() || "",
          );
        } catch {
          return "";
        }
      })();
      const name = String(
        file.name || fallbackName || `画布素材-${index + 1}`,
      ).trim();
      const mime =
        file.type ||
        attachmentMimeForKind(mediaKind, rawPath) ||
        "application/octet-stream";

      const projectRelativePath =
        codexProjectPath ||
        (looksLikeProjectRelativeMediaPath(rawPath) ? rawPath : "");
      const fetchUrl = projectRelativePath
        ? attachmentUrl(projectId, projectRelativePath)
        : displayUrl || rawPath;
      if (
        !isExternalUrl(fetchUrl) &&
        !isWorkflowChatAttachmentUrl(fetchUrl) &&
        !fetchUrl.startsWith("/")
      )
        return null;
      const response = await fetch(fetchUrl, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(`素材上传失败: HTTP ${response.status}`);
      const blob = await response.blob();
      const uploadName = ensureFileNameExtension(
        name,
        blob.type || mime,
        proxiedSource || rawPath,
        `canvas-attachment-${index + 1}`,
      );
      const uploaded = await uploadAttachmentFile(
        projectId,
        new File([blob], uploadName, { type: blob.type || mime }),
        file,
      );
      return {
        ...uploaded,
        name: uploaded.name || uploadName,
        url: uploaded.public_url || uploaded.url,
        public_url: uploaded.public_url || uploaded.url,
        local_url:
          uploaded.local_url ||
          attachmentUrl(projectId, uploaded.path || uploaded.relative_path),
        workflowNodeId: String(file.nodeId || "").trim() || undefined,
        workflowSourceUrl: rawPath,
        workflowSeedanceAssetId:
          String(file.seedanceAssetId || "").trim() || undefined,
        workflowSeedanceAssetUrl:
          String(file.seedanceAssetUrl || "").trim() || undefined,
        workflowSeedanceAssetStatus:
          String(file.seedanceAssetStatus || "").trim() || undefined,
        workflowSeedanceAssetCategory:
          String(file.seedanceAssetCategory || "").trim() || undefined,
        portraitCompliantExempt: Boolean(file.portraitCompliantExempt),
      };
    },
    [uploadAttachmentFile],
  );

  const uploadAttachmentFiles = async (files: File[]) => {
    if (!session?.project?.id || !files.length) return;
    const available = Math.max(0, 8 - attachments.length);
    if (!available) {
      setError("最多同时添加 8 个附件");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setUploading(true);
    setError("");
    try {
      const uploaded: Attachment[] = [];
      for (const file of files.slice(0, available)) {
        uploaded.push(await uploadAttachmentFile(session.project.id, file));
      }
      setAttachments((previous) => [...previous, ...uploaded].slice(-8));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "附件上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAttachmentChange = (files: FileList | null) => {
    void uploadAttachmentFiles(files ? Array.from(files) : []);
  };

  useEffect(() => {
    if (scope !== "workflow" || typeof window === "undefined") return;
    const handleWorkflowAttachments = (event: Event) => {
      setShowLauncherGreeting(false);
      preserveComposerAttachmentsRef.current = true;
      setActiveHeaderMenu(null);
      setSlashMenuOpen(false);
      setError("");
      setOpen(true);
      window.setTimeout(
        () => document.getElementById("codex-support-input")?.focus(),
        0,
      );
      void (async () => {
        const detail = (
          event as CustomEvent<{
            requestId?: string;
            files?: WorkflowChatAttachmentPayload[];
          }>
        ).detail;
        const requestId = String(detail?.requestId || "").trim();
        const settle = (result: {
          ok: boolean;
          count?: number;
          error?: string;
        }) => settleWorkflowChatAttachmentRequest({ requestId, ...result });
        const files = Array.isArray(detail?.files) ? detail.files : [];
        if (!files.length) {
          const error = "当前节点没有可发送到聊天的素材";
          setError(error);
          settle({ ok: false, error });
          return;
        }
        setUploading(true);
        try {
          const project = await ensureSupportProject();
          const nextAttachments = (
            await Promise.all(
              files
                .slice(0, 8)
                .map((file, index) =>
                  workflowPayloadToAttachment(project.id, file, index),
                ),
            )
          ).filter((file): file is Attachment => Boolean(file));

          if (!nextAttachments.length) {
            const error = "当前节点没有可发送到聊天的素材";
            setError(error);
            settle({ ok: false, error });
            return;
          }

          setWorkflowAttachmentSources((previous) => {
            const next = new Map(previous);
            let changed = false;
            for (const item of nextAttachments) {
              const publicUrl = String(
                item.public_url ||
                  (isExternalUrl(item.url) ? item.url : "") ||
                  "",
              ).trim();
              const source = {
                nodeId: String(item.workflowNodeId || "").trim() || undefined,
                sourceUrl:
                  String(item.workflowSourceUrl || "").trim() || undefined,
                publicUrl: publicUrl || undefined,
                naturalWidth: Number(item.naturalWidth || 0) || undefined,
                naturalHeight: Number(item.naturalHeight || 0) || undefined,
              };
              if (!source.nodeId && !source.sourceUrl && !source.publicUrl)
                continue;
              for (const value of [
                item.path,
                item.relative_path,
                item.url,
                item.public_url,
                item.local_url,
                item.workflowSourceUrl,
              ]) {
                const identity = artifactDedupeKey(String(value || ""));
                if (!identity) continue;
                next.set(identity, source);
                changed = true;
              }
            }
            return changed ? next : previous;
          });

          setAttachments((previous) => {
            const merged = [...previous];
            for (const item of nextAttachments) {
              const key = String(
                item.path || item.relative_path || item.url || "",
              ).trim();
              if (
                !key ||
                merged.some(
                  (entry) =>
                    String(
                      entry.path || entry.relative_path || entry.url || "",
                    ).trim() === key,
                )
              )
                continue;
              merged.push(item);
            }
            return merged.slice(-8);
          });
          settle({ ok: true, count: nextAttachments.length });
        } catch (cause) {
          const error =
            cause instanceof Error ? cause.message : "画布素材上传失败";
          setError(error);
          settle({ ok: false, error });
        } finally {
          setUploading(false);
        }
      })();
    };
    window.addEventListener(
      WORKFLOW_CHAT_ATTACHMENTS_EVENT,
      handleWorkflowAttachments as EventListener,
    );
    return () =>
      window.removeEventListener(
        WORKFLOW_CHAT_ATTACHMENTS_EVENT,
        handleWorkflowAttachments as EventListener,
      );
  }, [ensureSupportProject, scope, workflowPayloadToAttachment]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleExternalSkillSelection = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          id?: string;
          name?: string;
          path?: string;
          targetScope?: CodexSupportWidgetProps["scope"];
        }>
      ).detail;
      if (detail?.targetScope && detail.targetScope !== scope) return;
      const id = String(detail?.id || "").trim();
      const name = String(detail?.name || id).trim();
      const rawPath = String(detail?.path || "").trim();
      const candidate = {
        id,
        name,
        path: rawPath,
        scope: String(
          (detail as { scope?: string } | undefined)?.scope || "user",
        ),
      };
      if (
        !id ||
        !name ||
        !rawPath ||
        !isFrontEndSelectableCodexSkill(candidate)
      )
        return;
      const context: SelectedContext = {
        id,
        name,
        type: "skill",
        path: rawPath.endsWith("/SKILL.md")
          ? rawPath
          : `${rawPath.replace(/\/+$/, "")}/SKILL.md`,
      };
      if (session) {
        setSelectedContext(context);
        setActivePluginApp(null);
      } else {
        pendingExternalSkillRef.current = context;
      }
      setDraft("");
      setSlashMenuOpen(false);
      setShowLauncherGreeting(false);
      setOpen(true);
      window.setTimeout(
        () => document.getElementById("codex-support-input")?.focus(),
        0,
      );
    };
    window.addEventListener(
      "zaomeng:codex:select-skill",
      handleExternalSkillSelection as EventListener,
    );
    return () =>
      window.removeEventListener(
        "zaomeng:codex:select-skill",
        handleExternalSkillSelection as EventListener,
      );
  }, [scope, session]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleCreateSkill = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          id?: string;
          name?: string;
          path?: string;
          scope?: string;
          targetScope?: CodexSupportWidgetProps["scope"];
        }>
      ).detail;
      if (detail?.targetScope && detail.targetScope !== scope) return;
      const creator = detail?.path
        ? {
            id: String(detail.id || "skill-creator"),
            name: String(detail.name || "Skill Creator"),
            path: String(detail.path),
            scope: String(detail.scope || "system"),
          }
        : skills.find(isCodexSkillCreator);
      if (!creator || !isCodexSkillCreator(creator)) return;
      const context: SelectedContext = {
        id: creator.id,
        name: codexSkillDisplayName(creator),
        type: "skill",
        path: creator.path.endsWith("/SKILL.md")
          ? creator.path
          : `${creator.path.replace(/\/+$/, "")}/SKILL.md`,
      };
      if (session) {
        setSelectedContext(context);
        setActivePluginApp(null);
      } else {
        pendingExternalSkillRef.current = context;
      }
      setDraft(SKILL_CREATOR_STARTER_PROMPT);
      setSlashMenuOpen(false);
      setShowLauncherGreeting(false);
      setOpen(true);
      window.setTimeout(
        () => document.getElementById("codex-support-input")?.focus(),
        0,
      );
    };
    window.addEventListener(
      "zaomeng:codex:create-skill",
      handleCreateSkill as EventListener,
    );
    return () =>
      window.removeEventListener(
        "zaomeng:codex:create-skill",
        handleCreateSkill as EventListener,
      );
  }, [scope, session, skills]);

  const handleComposerPaste = async (
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) => {
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === "file")
      .map((item, index) => {
        const file = item.getAsFile();
        if (!file) return null;
        const ext =
          fileExt(file.name) || String(file.type || "").split("/")[1] || "bin";
        const name =
          file.name || `attachment-${Date.now()}-${index + 1}.${ext}`;
        return new File([file], name, {
          type: file.type || "application/octet-stream",
        });
      })
      .filter(Boolean) as File[];
    if (!files.length) return;
    event.preventDefault();
    await uploadAttachmentFiles(files);
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    setSlashMenuOpen(
      value.trimStart().startsWith("/") && !value.includes("\n"),
    );
  };

  const applySlashItem = (
    item: (CodexSkill & { type: "skill" }) | (CodexPlugin & { type: "plugin" }),
  ) => {
    if (item.type === "skill" && !isFrontEndSelectableCodexSkill(item)) return;
    const pluginApp =
      item.type === "plugin" && pluginHasAppSurface(item) ? item : null;
    setSelectedContext({
      id: item.id,
      name: item.name,
      type: item.type,
      path:
        item.type === "skill"
          ? `${item.path}/SKILL.md`
          : pluginContextPath(item),
    });
    setActivePluginApp(pluginApp);
    setDraft("");
    setSlashMenuOpen(false);
    window.setTimeout(
      () => document.getElementById("codex-support-input")?.focus(),
      0,
    );
  };

  const openAttachmentPreview = (item: Attachment, url: string) => {
    if (!url) return;
    const mediaKind = mediaKindForPath(item.path || item.name);
    const title = sanitizeVisibleText(
      item.name || item.path.split("/").pop() || "附件",
    );
    if (mediaKind === "image" || mediaKind === "video") {
      setMediaPreview({ url, title, mediaKind });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      setSlashMenuOpen(false);
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const launcherGreetingWidth = 220;
  const launcherGreetingHeight = 42;
  const launcherGreetingGap = 12;
  const launcherGreetingOnRight = Boolean(
    launcherPosition &&
    typeof window !== "undefined" &&
    launcherPosition.x <
      launcherGreetingWidth + LAUNCHER_MARGIN + launcherGreetingGap,
  );
  const launcherGreetingStyle = (() => {
    if (
      scope === "workflow" ||
      !launcherPosition ||
      typeof window === "undefined"
    )
      return undefined;
    const dimensions = launcherDimensions();
    const left = launcherGreetingOnRight
      ? Math.min(
          window.innerWidth - launcherGreetingWidth - LAUNCHER_MARGIN,
          launcherPosition.x + dimensions.width + launcherGreetingGap,
        )
      : Math.max(
          LAUNCHER_MARGIN,
          launcherPosition.x - launcherGreetingWidth - launcherGreetingGap,
        );
    const top = Math.min(
      Math.max(
        LAUNCHER_MARGIN,
        launcherPosition.y +
          Math.max(0, (dimensions.height - launcherGreetingHeight) / 2),
      ),
      window.innerHeight - launcherGreetingHeight - LAUNCHER_MARGIN,
    );
    return { left, top, width: launcherGreetingWidth };
  })();

  if (
    scope === "global" &&
    (pathname === "/tools/ai-assistant" ||
      pathname === "/canvas" ||
      pathname.startsWith("/canvas/"))
  )
    return null;

  const launcherGreetingFallbackClassName =
    launcherIcon === "director"
      ? "right-[162px] top-5 max-sm:right-[146px] max-sm:top-4"
      : "bottom-[calc(35px+env(safe-area-inset-bottom))] right-[104px] max-sm:bottom-[calc(27px+env(safe-area-inset-bottom))] max-sm:right-[92px]";
  const launcherButtonClassName =
    launcherIcon === "director"
      ? `absolute right-6 top-5 z-[240] inline-flex h-10 w-[126px] cursor-pointer items-center justify-center rounded-[14px] border border-white/10 bg-[#202020]/94 p-1 text-[#E4E9F0] shadow-[0_10px_30px_rgba(0,0,0,0.24)] backdrop-blur-xl transition-[transform,background-color,border-color] hover:scale-[1.02] hover:border-white/18 hover:bg-[#2B2B2B] active:scale-[0.99] max-sm:right-5 max-sm:top-4 max-sm:h-[38px] max-sm:w-[116px] max-sm:rounded-[13px]`
      : `fixed z-[240] h-[72px] w-[72px] cursor-grab overflow-hidden rounded-full border-2 border-white bg-white shadow-[0_12px_34px_rgba(0,0,0,0.26)] transition-transform hover:scale-[1.04] active:scale-[0.98] active:cursor-grabbing max-sm:h-16 max-sm:w-16 ${launcherPosition ? "" : "bottom-[calc(20px+env(safe-area-inset-bottom))] right-5 max-sm:bottom-[calc(16px+env(safe-area-inset-bottom))] max-sm:right-4"}`;

  return (
    <>
      {open ? (
        <div
          className={
            scope === "workflow"
              ? "pointer-events-none relative h-full flex-shrink-0 overflow-hidden"
              : "pointer-events-none fixed inset-0 z-[260]"
          }
        >
          {scope === "workflow" ? null : (
            <button
              type="button"
              aria-label={`关闭${agentLabel}`}
              className="pointer-events-auto absolute inset-0 cursor-default bg-black/0 max-sm:bg-black/30"
              onClick={() => setOpen(false)}
            />
          )}
          <section
            aria-label={agentLabel}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
            className={`zaomeng-codex-native zaomeng-codex-window ${scope === "workflow" ? "zaomeng-codex-inline-panel pointer-events-auto relative h-full" : "zaomeng-codex-docked pointer-events-auto absolute bottom-0 right-0 top-0"} flex max-sm:w-full ${activePluginApp ? (scope === "workflow" ? "w-[min(760px,48vw)] flex-row max-sm:fixed max-sm:inset-0 max-sm:z-[260] max-sm:w-full max-sm:flex-col" : "w-[min(1180px,calc(100vw-16px))] flex-row max-sm:flex-col") : scope === "workflow" ? "w-[400px] flex-col max-sm:fixed max-sm:inset-0 max-sm:z-[260] max-sm:w-full" : "w-[min(420px,calc(100vw-16px))] flex-col"}`}
          >
            {activePluginApp && activePluginFrameSrc ? (
              <aside className="zaomeng-codex-plugin-panel relative flex min-w-0 flex-1 flex-col overflow-hidden border-r border-[var(--color-token-border-light)] bg-[#f7f8f9] max-sm:h-[42dvh] max-sm:flex-none max-sm:border-b max-sm:border-r-0">
                <button
                  type="button"
                  title="关闭画布"
                  aria-label="关闭画布"
                  onClick={() => setActivePluginApp(null)}
                  className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#202124] shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur transition-colors hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </button>
                <iframe
                  key={`${activePluginApp.id}-${session?.project?.id || ""}`}
                  src={activePluginFrameSrc}
                  title={`${pluginDisplayName(activePluginApp)} 画布`}
                  className="min-h-0 flex-1 border-0 bg-[#f7f8f9]"
                  allow="clipboard-read; clipboard-write"
                />
              </aside>
            ) : null}
            <div
              className={`zaomeng-codex-chat-pane relative flex h-full min-h-0 shrink-0 flex-col max-sm:min-h-0 max-sm:w-full max-sm:flex-1 ${scope === "workflow" ? "w-[400px]" : "w-[min(420px,calc(100vw-16px))]"}`}
            >
              <header className="zaomeng-codex-header">
                <div
                  className="zaomeng-codex-header-tabs"
                  aria-label="会话标签"
                >
                  <button
                    type="button"
                    title="新建对话"
                    aria-current={!task?.id ? "true" : undefined}
                    aria-expanded={activeHeaderMenu === "new"}
                    onClick={() => {
                      setActiveHeaderMenu((current) =>
                        current === "new" ? null : "new",
                      );
                      setSlashMenuOpen(false);
                    }}
                    className={`zaomeng-codex-tab zaomeng-codex-tab-primary ${!task?.id || activeHeaderMenu === "new" ? "active" : ""}`}
                  >
                    <ListChecks className="h-4 w-4 shrink-0" />
                    <span className="zaomeng-codex-tab-title">新建对话</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${activeHeaderMenu === "new" ? "rotate-180" : ""}`}
                    />
                  </button>
                  {conversationTabs.map((item) => {
                    const active = item.id === task?.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        title={`${taskPreview(item)} · ${statusLabelForTask(item.status)}`}
                        aria-current={active ? "true" : undefined}
                        className={`zaomeng-codex-tab ${active ? "active" : ""}`}
                        onClick={() => void selectHistoryTask(item)}
                        onContextMenu={(event) =>
                          handleConversationTabContextMenu(event, item)
                        }
                      >
                        <span
                          className={`zaomeng-codex-tab-dot ${tabStatusClass(item.status)}`}
                        />
                        <span className="zaomeng-codex-tab-title">
                          {taskTabTitle(item)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="zaomeng-codex-header-actions">
                  <button
                    type="button"
                    title="历史记录"
                    aria-label="历史记录"
                    aria-pressed={activeHeaderMenu === "history"}
                    aria-expanded={activeHeaderMenu === "history"}
                    onClick={() => {
                      const nextOpen = activeHeaderMenu !== "history";
                      setActiveHeaderMenu(nextOpen ? "history" : null);
                      setSlashMenuOpen(false);
                      if (nextOpen && session?.project?.id)
                        void refreshTasks(session.project.id).catch(
                          () => undefined,
                        );
                    }}
                    className={`zaomeng-codex-icon-button ${activeHeaderMenu === "history" ? "active" : ""}`}
                  >
                    <History className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="关闭"
                    aria-label="关闭"
                    onClick={() => setOpen(false)}
                    className="zaomeng-codex-icon-button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {tabContextMenu ? (
                <div
                  className="zaomeng-codex-tab-context-menu"
                  style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => closeConversationTab(tabContextMenu.tab)}
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>关闭标签</span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(deletingTaskId)}
                    className="danger"
                    onClick={() => void deleteHistoryTask(tabContextMenu.tab)}
                  >
                    {deletingTaskId === tabContextMenu.tab.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span>删除线程</span>
                  </button>
                  <button
                    type="button"
                    disabled={!conversationTabs.length}
                    onClick={closeAllConversationTabs}
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span>全部关闭</span>
                  </button>
                </div>
              ) : null}

              {activeHeaderMenu === "new" ? (
                <div className="zaomeng-codex-header-popover zaomeng-codex-new-menu">
                  <button
                    type="button"
                    onClick={startNewChat}
                    className="zaomeng-codex-new-menu-action"
                  >
                    <Plus className="h-4 w-4" />
                    <span>新建对话</span>
                  </button>
                  <p>开启一个独立会话，适合同时推进多个创作任务。</p>
                </div>
              ) : null}

              {activeHeaderMenu === "history" ? (
                <div className="zaomeng-codex-header-popover zaomeng-codex-history">
                  <div className="zaomeng-codex-history-head">
                    <strong>历史记录</strong>
                    <button
                      type="button"
                      disabled={historyLoading}
                      onClick={() => {
                        if (!session?.project?.id) return;
                        setHistoryLoading(true);
                        void refreshTasks(session.project.id)
                          .catch((cause) =>
                            setError(
                              cause instanceof Error
                                ? cause.message
                                : "刷新历史记录失败",
                            ),
                          )
                          .finally(() => setHistoryLoading(false));
                      }}
                    >
                      {historyLoading ? "刷新中" : "刷新"}
                    </button>
                  </div>
                  <div className="zaomeng-codex-history-list">
                    {tasks.length ? (
                      tasks.map((item) => {
                        const active = item.id === task?.id;
                        return (
                          <div
                            key={item.id}
                            className={`zaomeng-codex-history-row ${active ? "active" : ""}`}
                          >
                            <button
                              type="button"
                              onClick={() => void selectHistoryTask(item)}
                              className="zaomeng-codex-history-main"
                            >
                              <strong>{taskPreview(item)}</strong>
                              <em>
                                {[
                                  formatTaskTime(
                                    item.updated_at || item.created_at,
                                  ),
                                  statusLabelForTask(item.status),
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </em>
                            </button>
                            <button
                              type="button"
                              title="删除线程"
                              aria-label={`删除线程 ${taskPreview(item)}`}
                              className="zaomeng-codex-history-delete"
                              disabled={Boolean(deletingTaskId)}
                              onClick={() => void deleteHistoryTask(item)}
                            >
                              {deletingTaskId === item.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="zaomeng-codex-history-empty">
                        暂无历史记录
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div
                ref={timelineRef}
                onScroll={handleTimelineScroll}
                className="zaomeng-codex-thread min-h-0 flex-1 overflow-y-auto px-4 py-5"
              >
                {initializing ? (
                  <div className="flex h-full items-center justify-center gap-2 text-[13px] text-[var(--color-token-description-foreground)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在连接
                  </div>
                ) : timeline.length === 0 && !error ? (
                  <div className="zaomeng-codex-empty">
                    <h2>今天一起创作点什么？</h2>
                    <div className="zaomeng-codex-empty-cards">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(
                            "帮我分析当前画布内容，并给出电影级分镜与镜头调度建议",
                          );
                          window.setTimeout(
                            () =>
                              document
                                .getElementById("codex-support-input")
                                ?.focus(),
                            0,
                          );
                        }}
                        className="zaomeng-codex-empty-card"
                      >
                        <span className="zaomeng-codex-empty-card-icon">
                          <ListChecks className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <strong>分析画布</strong>
                          <em>分镜、构图、节奏</em>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(
                            "根据当前画布内容生成一组电影感视觉方案，包括图片提示词和视频镜头描述",
                          );
                          window.setTimeout(
                            () =>
                              document
                                .getElementById("codex-support-input")
                                ?.focus(),
                            0,
                          );
                        }}
                        className="zaomeng-codex-empty-card"
                      >
                        <span className="zaomeng-codex-empty-card-icon">
                          <ImagePlus className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <strong>视觉方案</strong>
                          <em>图片、视频、PPT</em>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="zaomeng-codex-thread-inner">
                    {olderHistoryLoading ? (
                      <div className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-[var(--color-token-description-foreground)]">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        正在读取更早消息
                      </div>
                    ) : null}
                    {timeline.map((item) => {
                      if (item.kind === "message") {
                        return item.role === "user" ? (
                          <div
                            key={item.id}
                            className="zaomeng-codex-turn zaomeng-codex-user"
                          >
                            {item.files?.length ? (
                              <div className="zaomeng-codex-user-attachments">
                                {item.files.map((file) => (
                                  <UserAttachmentPreview
                                    key={timelineFileKey(file)}
                                    file={file}
                                    onMediaLoad={followLatestTimelineLayout}
                                    onPreviewMedia={setMediaPreview}
                                  />
                                ))}
                              </div>
                            ) : null}
                            {item.text ? (
                              <div className="zaomeng-codex-user-bubble">
                                {sanitizeVisibleText(item.text)}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div
                            key={item.id}
                            className="zaomeng-codex-assistant"
                          >
                            <div className="zaomeng-codex-avatar">
                              <CodexAgentAvatar
                                label={agentLabel}
                                variant={launcherIcon}
                                className="h-5 w-5 border-0"
                                imageSizes="20px"
                              />
                            </div>
                            <div className="zaomeng-codex-markdown">
                              <AssistantMarkdown>
                                {sanitizeVisibleText(item.text)}
                              </AssistantMarkdown>
                              {item.streaming ? (
                                <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-[var(--color-token-foreground)] align-middle" />
                              ) : null}
                            </div>
                          </div>
                        );
                      }
                      if (item.kind === "artifact") {
                        return (
                          <TimelineArtifactCard
                            key={item.id}
                            item={item}
                            onMediaLoad={followLatestTimelineLayout}
                            onPreviewMedia={setMediaPreview}
                          />
                        );
                      }
                      if (item.kind === "generation") {
                        return (
                          <TimelineGenerationCard
                            key={item.id}
                            item={item}
                            onMediaLoad={followLatestTimelineLayout}
                            onPreviewMedia={setMediaPreview}
                          />
                        );
                      }
                      if (item.kind === "tool") {
                        return <TimelineToolCard key={item.id} item={item} />;
                      }
                      if (item.kind === "changes") {
                        return (
                          <TimelineChangesCard key={item.id} item={item} />
                        );
                      }
                      if (item.kind === "error") {
                        return (
                          <div
                            key={item.id}
                            className="flex items-start gap-2 rounded-[8px] border border-[#fecdca] bg-[var(--color-token-editor-error-background)] px-3 py-2 text-[12px] leading-5 text-[var(--color-token-error-foreground)]"
                          >
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span className="break-words">
                              {sanitizeVisibleText(item.text)}
                            </span>
                          </div>
                        );
                      }
                      return <TimelineActivityRow key={item.id} item={item} />;
                    })}
                  </div>
                )}
              </div>

              {error ? (
                <div className="mx-4 mb-2 flex items-start gap-2 rounded-[8px] border border-[#fecdca] bg-[var(--color-token-editor-error-background)] px-3 py-2 text-[12px] leading-5 text-[var(--color-token-error-foreground)]">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 break-words">
                    {sanitizeVisibleText(error)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void initializeSupport()}
                    className="shrink-0 underline underline-offset-2"
                  >
                    重试
                  </button>
                </div>
              ) : null}

              <footer className="zaomeng-codex-composer relative shrink-0 px-3 pb-3 pt-2.5">
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  multiple
                  onChange={(event) =>
                    handleAttachmentChange(event.target.files)
                  }
                />
                {slashMenuOpen ? (
                  <div className="absolute bottom-[calc(100%-2px)] left-3 right-3 z-20 max-h-[min(320px,42dvh)] overflow-y-auto rounded-[12px] border border-[var(--color-token-border)] bg-[var(--color-token-dropdown-background)] p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.16)]">
                    <div className="flex items-center justify-between px-2.5 py-2 text-[11px] text-[var(--color-token-description-foreground)]">
                      <span className="font-medium text-[var(--color-token-foreground)]">
                        选择 Skill 或插件
                      </span>
                      <span>当前用户</span>
                    </div>
                    {slashMenuItems.length ? (
                      slashMenuItems.map((item) => (
                        <button
                          key={`${item.type}-${item.id}`}
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            applySlashItem(item);
                          }}
                          className="grid min-h-[52px] w-full grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--color-token-list-hover-background)]"
                        >
                          <span className="grid h-7 w-7 place-items-center rounded-[6px] bg-[var(--color-token-bg-secondary)] text-[14px] text-[var(--color-token-description-foreground)]">
                            {item.type === "skill" ? (
                              <Box className="h-3.5 w-3.5" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate text-[12px] font-medium text-[var(--color-token-foreground)]">
                              {item.name}
                            </strong>
                            <em className="mt-0.5 block truncate text-[11px] not-italic text-[var(--color-token-description-foreground)]">
                              {item.description ||
                                (item.type === "skill"
                                  ? "使用当前用户已安装的 Skill"
                                  : "插件")}
                            </em>
                          </span>
                          <small className="rounded-full bg-[var(--color-token-bg-secondary)] px-1.5 py-1 text-[10px] text-[var(--color-token-description-foreground)]">
                            {item.type === "skill" ? "Skill" : "Plugin"}
                          </small>
                        </button>
                      ))
                    ) : (
                      <div className="px-2.5 py-3 text-[11px] leading-4 text-[var(--color-token-description-foreground)]">
                        暂无可用 Skill 或插件
                      </div>
                    )}
                  </div>
                ) : null}
                <div className="zaomeng-codex-composer-shell relative flex flex-col justify-between gap-2 p-2.5 text-sm transition-[border-color,box-shadow]">
                  {selectedContext ? (
                    <div className="mb-0.5 flex min-h-6 items-center px-1">
                      <div className="group flex max-w-full items-center gap-1.5 text-[14px] leading-5 text-[#8ec5ff]">
                        <span className="grid h-5 w-5 shrink-0 place-items-center text-[#8ec5ff]">
                          {selectedContext.type === "plugin" ? (
                            <Sparkles className="h-4 w-4" strokeWidth={1.8} />
                          ) : (
                            <Box className="h-4 w-4" strokeWidth={1.8} />
                          )}
                        </span>
                        <span className="min-w-0 max-w-[260px] truncate font-medium">
                          {sanitizeVisibleText(selectedContext.name)}
                        </span>
                        <button
                          type="button"
                          title="移除"
                          aria-label={`移除 ${selectedContext.name}`}
                          disabled={sending}
                          onClick={() => {
                            setSelectedContext(null);
                            setActivePluginApp(null);
                          }}
                          className="ml-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[#8ec5ff] opacity-0 transition-opacity hover:bg-white/5 group-hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {attachments.length ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {attachments.map((item) => {
                        const url = session?.project?.id
                          ? attachmentPreviewUrl(session.project.id, item)
                          : String(item.url || "");
                        const image = isImageAttachment(item);
                        return (
                          <div
                            key={item.path}
                            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[10px] border border-[var(--color-token-border)] bg-[var(--color-token-bg-secondary)]"
                          >
                            <button
                              type="button"
                              title={`查看 ${item.name}`}
                              aria-label={`查看 ${item.name}`}
                              className="absolute inset-0 grid place-items-center"
                              onClick={() => openAttachmentPreview(item, url)}
                            >
                              {url && image ? (
                                <CodexMediaImage
                                  source={String(
                                    item.public_url || item.url || url,
                                  )}
                                  alt={item.name}
                                  className="absolute inset-0 h-full w-full object-cover"
                                  fallbackClassName="absolute inset-0 px-1 text-[8px]"
                                />
                              ) : (
                                <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[var(--color-token-description-foreground)]">
                                  <FileCode2 className="h-4 w-4 shrink-0" />
                                  <span className="max-w-full truncate text-[8px] leading-3">
                                    {fileExt(
                                      item.name || item.path,
                                    ).toUpperCase() || "FILE"}
                                  </span>
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              title="移除附件"
                              aria-label={`移除附件 ${item.name}`}
                              onClick={() =>
                                setAttachments((previous) =>
                                  previous.filter(
                                    (entry) => entry.path !== item.path,
                                  ),
                                )
                              }
                              className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-white transition-colors hover:bg-black"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  <textarea
                    id="codex-support-input"
                    value={draft}
                    onChange={(event) => handleDraftChange(event.target.value)}
                    onFocus={(event) => {
                      if (
                        event.currentTarget.value.trimStart().startsWith("/") &&
                        !event.currentTarget.value.includes("\n")
                      ) {
                        setSlashMenuOpen(true);
                      }
                    }}
                    onPaste={handleComposerPaste}
                    onKeyDown={handleInputKeyDown}
                    rows={3}
                    disabled={initializing || sending}
                    placeholder={
                      taskRunning
                        ? "输入新需求，继续当前创作"
                        : "输入你的创作需求..."
                    }
                    className="max-h-[130px] min-h-[54px] min-w-0 w-full resize-none bg-transparent px-1 py-1 text-[14px] leading-5 text-[var(--color-token-foreground)] outline-none placeholder:text-[var(--color-token-input-placeholder-foreground)] disabled:cursor-not-allowed"
                  />
                  <div className="mt-1 flex h-8 items-center gap-1.5">
                    <button
                      type="button"
                      title="添加附件"
                      aria-label="添加附件"
                      disabled={
                        uploading || initializing || sending || !session
                      }
                      onClick={() => fileInputRef.current?.click()}
                      className="zaomeng-codex-icon-button shrink-0 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </button>
                    <span className="min-w-0 flex-1" aria-hidden="true" />
                    {composerTokenUsage ? (
                      <span
                        className="zaomeng-codex-runtime-chip zaomeng-codex-token-usage-chip"
                        title={composerTokenUsage.title}
                        aria-label={composerTokenUsage.title}
                      >
                        {composerTokenUsage.label}
                      </span>
                    ) : null}
                    <CodexModelPicker
                      value={selectedCodexModel || task?.model || ""}
                      models={codexModels}
                      loading={codexModelsLoading}
                      warning={codexModelsWarning}
                      disabled={initializing || sending || !session}
                      onChange={setSelectedCodexModel}
                      onRefresh={() => void loadCodexModels()}
                    />
                    {taskRunning && !draft.trim() && !attachments.length ? (
                      <button
                        type="button"
                        title="停止"
                        aria-label="停止"
                        onClick={() => void stopTask()}
                        className="zaomeng-codex-icon-button zaomeng-codex-send shrink-0"
                      >
                        <Square className="h-3.5 w-3.5 fill-current" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title={taskRunning ? "发送并打断当前回复" : "发送"}
                        aria-label={taskRunning ? "发送并打断当前回复" : "发送"}
                        disabled={
                          (!draft.trim() && !attachments.length) ||
                          uploading ||
                          sending ||
                          initializing ||
                          !session ||
                          (!selectedCodexModel && !task?.model)
                        }
                        onClick={() => void sendMessage()}
                        className="zaomeng-codex-icon-button zaomeng-codex-send shrink-0 disabled:cursor-not-allowed disabled:bg-[var(--color-token-bg-tertiary)] disabled:text-[var(--color-token-description-foreground)]"
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </footer>
            </div>
          </section>
        </div>
      ) : (
        <>
          {scope !== "workflow" && showLauncherGreeting ? (
            <div
              aria-hidden="true"
              style={launcherGreetingStyle}
              className={`pointer-events-none fixed z-[239] rounded-[14px] border border-white/70 bg-white/95 px-4 py-2.5 text-[13px] font-medium leading-5 text-[#1f2937] shadow-[0_14px_40px_rgba(15,23,42,0.18)] backdrop-blur-xl ${launcherGreetingStyle ? "" : launcherGreetingFallbackClassName}`}
            >
              欢迎来到造梦影视与设计平台
              <span
                className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-white/70 bg-white/95 ${launcherGreetingOnRight ? "left-[-6px] border-b border-l" : "right-[-6px] border-r border-t"}`}
              />
            </div>
          ) : null}
          <button
            type="button"
            aria-label={agentLabel}
            title={agentLabel}
            onClick={handleOpen}
            onPointerDown={
              scope === "workflow" ? undefined : handleLauncherPointerDown
            }
            onPointerMove={
              scope === "workflow" ? undefined : handleLauncherPointerMove
            }
            onPointerUp={
              scope === "workflow" ? undefined : handleLauncherPointerEnd
            }
            onPointerCancel={
              scope === "workflow" ? undefined : handleLauncherPointerEnd
            }
            onDragStart={(event) => event.preventDefault()}
            style={
              scope !== "workflow" && launcherPosition
                ? {
                    left: launcherPosition.x,
                    top: launcherPosition.y,
                    touchAction: "none",
                  }
                : undefined
            }
            className={launcherButtonClassName}
          >
            {launcherIcon === "director" ? (
              <span className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-[10px] bg-white/[0.07] px-2.5 text-[13px] font-medium leading-none text-[#F2F5F8] transition-colors hover:bg-white/[0.10] max-sm:h-[30px] max-sm:px-2">
                <MessageCircleMore
                  className="h-4 w-4 shrink-0 text-[#DCE3EC]"
                  strokeWidth={1.9}
                />
                <span className="whitespace-nowrap">{agentLabel}</span>
              </span>
            ) : (
              <Image
                src="/images/codex-support.png"
                alt={agentLabel}
                fill
                sizes="72px"
                className="object-cover"
                priority
              />
            )}
          </button>
        </>
      )}

      {mediaPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={mediaPreview.title}
          className="fixed inset-0 z-[280] bg-black/90 backdrop-blur-sm"
          onClick={() => setMediaPreview(null)}
        >
          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
            <a
              href={mediaPreview.url}
              download={mediaPreview.title}
              title="下载"
              aria-label="下载"
              onClick={(event) => event.stopPropagation()}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              <Download className="h-5 w-5" />
            </a>
            <button
              type="button"
              title="关闭"
              aria-label="关闭"
              onClick={() => setMediaPreview(null)}
              className="grid h-10 w-10 place-items-center rounded-full bg-white/12 text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <div
            className="flex h-full w-full items-center justify-center p-4 sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            {mediaPreview.mediaKind === "image" ? (
              <CodexMediaImage
                source={mediaPreview.url}
                alt={mediaPreview.title}
                className="max-h-full max-w-full rounded-[10px] object-contain shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
                fallbackClassName="h-56 w-80 rounded-[10px]"
              />
            ) : (
              <video
                src={mediaPreview.url}
                controls
                autoPlay
                playsInline
                className="max-h-full max-w-full rounded-[10px] bg-black shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
