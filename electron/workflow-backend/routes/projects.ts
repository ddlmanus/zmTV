import type { Hono } from "hono";
import type { WorkflowBackendContext } from "../context";
import { normalizeDesktopProjectMediaUrls } from "../project-media-url-normalizer";
import { newId, now, record, text } from "./shared";

type DesktopProject = {
  id: string;
  title: string;
  canvasType: string;
  content: string | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
};

type ProjectStore = { items: DesktopProject[] };
type PublicProject = {
  id: string;
  sourceProjectId: string;
  title: string;
  description: string;
  coverUrl: string;
  videoUrl: string;
  content: unknown;
  updatedAt: string;
};
type PublicProjectStore = { items: PublicProject[] };

function projects(context: WorkflowBackendContext) {
  return context.store.read<ProjectStore>("projects", { items: [] });
}

function ensureDesktopProject(context: WorkflowBackendContext, id: string) {
  const store = projects(context);
  let project = store.items.find((item) => item.id === id);
  if (!project && id === "zaomeng-desktop-workflow") {
    const timestamp = now();
    project = {
      id,
      title: "画布",
      canvasType: "workflow",
      content: null,
      thumbnail: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    store.items.unshift(project);
    context.store.write("projects", store);
  }
  return project;
}

function serializedContent(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? {});
}

function normalizeProjectMediaUrls(
  context: WorkflowBackendContext,
  store: ProjectStore,
) {
  let changed = false;
  for (const project of store.items) {
    const normalized = normalizeDesktopProjectMediaUrls(
      context,
      project.content,
    );
    if (!normalized.changed) continue;
    project.content = normalized.content;
    changed = true;
  }
  if (changed) context.store.write("projects", store);
}

export function registerProjectRoutes(
  app: Hono,
  context: WorkflowBackendContext,
) {
  app.get("/api/projects", (c) => {
    const store = projects(context);
    normalizeProjectMediaUrls(context, store);
    return c.json({ projects: store.items, items: store.items });
  });

  app.post("/api/projects", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const timestamp = now();
    const project: DesktopProject = {
      id: newId("project"),
      title: text(body.title, 120) || "未命名项目",
      canvasType: text(body.canvasType || body.projectType, 32) || "workflow",
      content: serializedContent(body.content) ?? null,
      thumbnail: text(body.thumbnail, 20_000) || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const store = projects(context);
    store.items.unshift(project);
    context.store.write("projects", store);
    return c.json(project, 201);
  });

  app.get("/api/projects/:id", (c) => {
    const store = projects(context);
    normalizeProjectMediaUrls(context, store);
    const project = ensureDesktopProject(context, c.req.param("id"));
    return project
      ? c.json(project)
      : c.json({ error: "Project not found" }, 404);
  });

  app.put("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    const body = record(await c.req.json().catch(() => ({})));
    const store = projects(context);
    let project = store.items.find((item) => item.id === id);
    if (!project) project = ensureDesktopProject(context, id);
    if (!project) return c.json({ error: "Project not found" }, 404);
    const content = serializedContent(body.content);
    if (content !== undefined) {
      project.content = normalizeDesktopProjectMediaUrls(
        context,
        content,
      ).content;
    }
    if (body.title !== undefined)
      project.title = text(body.title, 120) || project.title;
    if (body.thumbnail !== undefined)
      project.thumbnail = text(body.thumbnail, 20_000) || null;
    if (body.canvasType !== undefined || body.projectType !== undefined)
      project.canvasType =
        text(body.canvasType || body.projectType, 32) || "workflow";
    project.updatedAt = now();
    context.store.write("projects", store);
    return c.json(
      body.responseView === "lite" ? { id: project.id, saved: true } : project,
    );
  });

  app.delete("/api/projects/:id", (c) => {
    const id = c.req.param("id");
    const store = projects(context);
    const before = store.items.length;
    store.items = store.items.filter((item) => item.id !== id);
    if (store.items.length === before)
      return c.json({ error: "Project not found" }, 404);
    context.store.write("projects", store);
    return c.json({ success: true });
  });

  app.get("/api/public-workflow-projects", (c) => {
    const store = context.store.read<PublicProjectStore>("public-projects", {
      items: [],
    });
    return c.json({ items: store.items });
  });

  app.post("/api/public-workflow-projects", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const projectId = text(body.projectId, 191);
    const source = ensureDesktopProject(context, projectId);
    if (!source) return c.json({ error: "项目不存在" }, 404);
    const store = context.store.read<PublicProjectStore>("public-projects", {
      items: [],
    });
    const existing = store.items.find(
      (item) => item.sourceProjectId === projectId,
    );
    const item: PublicProject = {
      id: existing?.id || newId("public_workflow"),
      sourceProjectId: projectId,
      title: text(body.title, 120) || source.title,
      description: text(body.description, 500),
      coverUrl: text(body.coverUrl, 20_000),
      videoUrl: text(body.videoUrl, 20_000),
      content:
        body.content || (source.content ? JSON.parse(source.content) : {}),
      updatedAt: now(),
    };
    store.items = [item, ...store.items.filter((row) => row.id !== item.id)];
    context.store.write("public-projects", store);
    return c.json({
      success: true,
      id: item.id,
      publicUrl: "/canvas?publicProjectId=" + encodeURIComponent(item.id),
    });
  });

  app.get("/api/public-workflow-projects/:id", (c) => {
    const store = context.store.read<PublicProjectStore>("public-projects", {
      items: [],
    });
    const item = store.items.find((row) => row.id === c.req.param("id"));
    return item ? c.json(item) : c.json({ error: "Not found" }, 404);
  });

  app.post("/api/public-workflow-projects/:id/duplicate", (c) => {
    const publicStore = context.store.read<PublicProjectStore>(
      "public-projects",
      {
        items: [],
      },
    );
    const source = publicStore.items.find(
      (row) => row.id === c.req.param("id"),
    );
    if (!source) return c.json({ error: "Not found" }, 404);
    const timestamp = now();
    const project: DesktopProject = {
      id: newId("project"),
      title: source.title + " 副本",
      canvasType: "workflow",
      content: JSON.stringify(source.content || {}),
      thumbnail: source.coverUrl || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const store = projects(context);
    store.items.unshift(project);
    context.store.write("projects", store);
    return c.json(project, 201);
  });
}
