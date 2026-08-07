import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { WorkflowBackendContext } from "./context";
import { registerAssetRoutes } from "./routes/assets";
import { registerBuiltinAssetRoutes } from "./routes/builtin-assets";
import { registerChatToolRoutes } from "./routes/chat-tools";
import { registerDirectorAgentRoutes } from "./routes/director-agent";
import { registerGenerationRoutes } from "./routes/generation";
import { registerMediaToolRoutes } from "./routes/media-tools";
import { registerProjectRoutes } from "./routes/projects";
import { registerProviderAssetRoutes } from "./routes/provider-assets";
import { registerSkillLibraryRoutes } from "./routes/skill-library";
import { WorkflowJsonStore } from "./storage";
import { resolveCodexBinary } from "./codex-binary";

export type WorkflowBackendProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model?: string;
};

export type WorkflowBackendOptions = {
  appRoot: string;
  resourcesRoot: string;
  runtimeRoot: string;
  getProviderConfig: () => WorkflowBackendProviderConfig;
  getPlatformProviderConfig: () => WorkflowBackendProviderConfig;
  fetchRemote?: typeof fetch;
};

type RuntimeModule = typeof import("./agent/runtime");

type CodexTaskInput = {
  prompt: string;
  model?: string;
  workflowProjectId?: string;
  workflowProjectName?: string;
  canvasSessionId?: string;
  onProgress?: (progress: { status: string; taskId: string }) => void;
};

let runtimeModulePromise: Promise<RuntimeModule> | null = null;
let server: ServerType | null = null;
let localBaseUrl = "";
let localToken = "";
let providerConfig: WorkflowBackendOptions["getProviderConfig"] | null = null;
let workflowApp: Hono | null = null;

function configureEnvironment(options: WorkflowBackendOptions) {
  const skillsRoot = path.join(options.resourcesRoot, "workflow-skills");
  process.env.CODEX_RUNTIME_ROOT = options.runtimeRoot;
  process.env.ZAOMENG_DESKTOP_PROJECT_ROOT = options.appRoot;
  process.env.ZAOMENG_WORKFLOW_SKILLS_ROOT = skillsRoot;
  process.env.CODEX_BIN = resolveCodexBinary(options.appRoot);
  process.env.CODEX_ENABLE_LOCAL_PROJECTS = "0";
}

function syncProviderEnvironment() {
  const current = providerConfig?.();
  if (!current) return;
  const baseUrl = String(current.baseUrl || "")
    .trim()
    .replace(/\/+$/, "");
  const apiKey = String(current.apiKey || "").trim();
  if (baseUrl) process.env.CODEX_BASE_URL = baseUrl;
  if (apiKey) process.env.CODEX_API_KEY = apiKey;
  if (current.model) process.env.CODEX_MODEL = current.model;
}

async function runtimeModule() {
  if (!runtimeModulePromise) runtimeModulePromise = import("./agent/runtime");
  return runtimeModulePromise;
}

async function runCodexTask(input: CodexTaskInput) {
  const runtime = await runtimeModule();
  const call = async (pathname: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set("x-ideart-user-id", "desktop-user");
    return runtime.codexWorkspaceApp.fetch(
      new Request("http://workflow.local" + pathname, {
        ...init,
        headers,
        ...(init?.body ? { duplex: "half" as const } : {}),
      }),
    );
  };
  const readJson = async (response: Response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error =
        typeof payload?.error === "string"
          ? payload.error
          : "Codex 任务请求失败 (HTTP " + response.status + ")";
      throw new Error(error);
    }
    return payload as Record<string, any>;
  };

  const session = await readJson(
    await call("/support/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow_project_id: input.workflowProjectId || undefined,
        workflow_project_name: input.workflowProjectName || "造梦工作流分镜",
      }),
    }),
  );
  const project = session.project as Record<string, any> | undefined;
  const projectId = String(project?.id || "").trim();
  if (!projectId) throw new Error("Codex 工作流项目初始化失败");

  const created = await readJson(
    await call("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        prompt: input.prompt,
        model: input.model || session.config?.model || undefined,
        reasoning_effort: "medium",
        sandbox: "read-only",
        client_scope: "workflow",
        workflow_project_id: input.workflowProjectId || "",
        canvas_session_id: input.canvasSessionId || "",
      }),
    }),
  );
  const task = created as Record<string, any>;
  const taskId = String(task.id || "").trim();
  if (!taskId) throw new Error("Codex 未返回任务 ID");
  const model = String(task.model || session.config?.model || "").trim();

  const deadline = Date.now() + 12 * 60 * 1000;
  let status = "running";
  while (Date.now() < deadline) {
    const current = await readJson(
      await call(`/tasks/${encodeURIComponent(taskId)}?include_tail=1`),
    );
    status = String(current.status || "")
      .trim()
      .toLowerCase();
    input.onProgress?.({ status, taskId });
    if (["completed", "failed", "cancelled"].includes(status)) break;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (status === "running" || status === "queued") {
    throw new Error("Codex 分镜任务超时，请在 Codex 任务记录中查看详情");
  }
  if (status !== "completed") {
    const failedTask = await readJson(
      await call(`/tasks/${encodeURIComponent(taskId)}?include_tail=1`),
    );
    const tail = Array.isArray(failedTask.output_tail)
      ? failedTask.output_tail
      : [];
    const lastError = [...tail]
      .reverse()
      .map((event: any) => String(event?.text || "").trim())
      .find(Boolean);
    throw new Error(lastError || `Codex 分镜任务${status || "失败"}`);
  }

  const logs = await readJson(
    await call(`/tasks/${encodeURIComponent(taskId)}/logs`),
  );
  const events = Array.isArray(logs) ? logs : [];
  const assistantMessages = events
    .filter((event: any) =>
      ["app.agent_message", "app.agent_delta"].includes(
        String(event?.type || ""),
      ),
    )
    .map((event: any) => String(event?.text || "").trim())
    .filter(Boolean);
  const output = assistantMessages[assistantMessages.length - 1] || "";
  if (!output) throw new Error("Codex 分镜任务没有返回文本结果");
  return { output, taskId, model };
}

function requestAuthorized(request: Request) {
  const url = new URL(request.url);
  if (url.protocol === "zaomeng-workflow:") return true;
  const bearer = String(request.headers.get("authorization") || "");
  const token = bearer.toLowerCase().startsWith("bearer ")
    ? bearer.slice(7).trim()
    : String(request.headers.get("x-ideart-codex-token") || "").trim();
  return Boolean(localToken && token === localToken);
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Ideart-Codex-Token",
  );
  headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function createWorkflowApp(options: WorkflowBackendOptions) {
  const context: WorkflowBackendContext = {
    appRoot: options.appRoot,
    runtimeRoot: options.runtimeRoot,
    resourcesRoot: options.resourcesRoot,
    store: new WorkflowJsonStore(path.join(options.runtimeRoot, "data")),
    getProviderConfig: options.getProviderConfig,
    getPlatformProviderConfig: options.getPlatformProviderConfig,
    fetchRemote: options.fetchRemote || fetch,
    runCodexTask,
  };
  const app = new Hono();
  registerBuiltinAssetRoutes(app, context);
  registerProjectRoutes(app, context);
  registerAssetRoutes(app, context);
  registerSkillLibraryRoutes(app, context);
  registerGenerationRoutes(app, context);
  registerDirectorAgentRoutes(app, context);
  registerMediaToolRoutes(app, context);
  registerChatToolRoutes(app, context);
  registerProviderAssetRoutes(app, context);
  app.notFound((c) =>
    c.json({ error: "Workflow backend route not found" }, 404),
  );
  app.onError((error, c) => {
    console.error("[workflow-backend] request failed:", error);
    return c.json(
      {
        error:
          error instanceof Error ? error.message : "Workflow backend error",
      },
      500,
    );
  });
  return app;
}

function forwardedRequest(request: Request, pathname: string) {
  const sourceUrl = new URL(request.url);
  const targetUrl = new URL("http://workflow.local");
  targetUrl.pathname = pathname;
  targetUrl.search = sourceUrl.search;
  const headers = new Headers(request.headers);
  headers.set("x-ideart-user-id", "desktop-user");
  return new Request(targetUrl, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    ...(request.body ? { duplex: "half" as const } : {}),
  });
}

export async function handleWorkflowBackendRequest(request: Request) {
  if (request.method === "OPTIONS")
    return withCors(new Response(null, { status: 204 }));
  if (!requestAuthorized(request)) {
    return withCors(Response.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const sourceUrl = new URL(request.url);
  syncProviderEnvironment();
  const isCodexRoute =
    sourceUrl.pathname === "/api/codex" ||
    sourceUrl.pathname.startsWith("/api/codex/");
  if (isCodexRoute) {
    const runtime = await runtimeModule();
    const pathname = sourceUrl.pathname.slice("/api/codex".length) || "/";
    return withCors(
      await runtime.codexWorkspaceApp.fetch(
        forwardedRequest(request, pathname),
      ),
    );
  }
  if (!workflowApp) {
    return withCors(
      Response.json({ error: "Workflow backend is starting" }, { status: 503 }),
    );
  }
  return withCors(
    await workflowApp.fetch(forwardedRequest(request, sourceUrl.pathname)),
  );
}

export async function startWorkflowBackend(options: WorkflowBackendOptions) {
  if (server && localBaseUrl)
    return { baseUrl: localBaseUrl, token: localToken };
  configureEnvironment(options);
  providerConfig = options.getProviderConfig;
  workflowApp = createWorkflowApp(options);
  syncProviderEnvironment();
  localToken = randomUUID();
  process.env.CODEX_PLATFORM_TOKEN = localToken;

  await new Promise<void>((resolve, reject) => {
    try {
      server = serve(
        {
          fetch: handleWorkflowBackendRequest,
          hostname: "127.0.0.1",
          port: 0,
        },
        (info) => {
          localBaseUrl = "http://127.0.0.1:" + info.port;
          process.env.CODEX_PLATFORM_MEDIA_BASE_URL = localBaseUrl;
          resolve();
        },
      );
      server.once("error", reject);
    } catch (error) {
      reject(error);
    }
  });
  return { baseUrl: localBaseUrl, token: localToken };
}

export function workflowBackendConnection() {
  return { baseUrl: localBaseUrl, token: localToken };
}

export async function stopWorkflowBackend() {
  const active = server;
  if (process.env.CODEX_PLATFORM_TOKEN === localToken) {
    delete process.env.CODEX_PLATFORM_TOKEN;
  }
  server = null;
  localBaseUrl = "";
  localToken = "";
  providerConfig = null;
  workflowApp = null;
  if (!active) return;
  await new Promise<void>((resolve) => active.close(() => resolve()));
}
