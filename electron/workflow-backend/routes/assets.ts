import fs from "node:fs";
import type { Context, Hono } from "hono";
import type { WorkflowBackendContext } from "../context";
import { importPlatformFile, uploadPlatformFile } from "../platform-assets";
import {
  contentTypeFromName,
  fileStore,
  mediaTypeFromName,
  newId,
  now,
  record,
  text,
  unwrapWorkflowProxyUrl,
} from "./shared";

type Material = Record<string, unknown> & {
  id: string;
  name: string;
  src: string;
  createdAt: number;
};
type MaterialStore = { items: Material[] };

type LibraryAsset = Record<string, unknown> & {
  id: string;
  projectId: string | null;
  scope: "project" | "user";
  createdAt: number;
  updatedAt: number;
};
type LibraryAssetStore = { items: LibraryAsset[] };

type GeneratedFile = Record<string, unknown> & {
  id: string;
  fileType: string;
  fileUrl: string;
  createdAt: string;
};
type GeneratedFileStore = { items: GeneratedFile[] };

function assetStoreName(kind: string) {
  return "libtv-assets-" + kind;
}

function readAssetStore(context: WorkflowBackendContext, kind: string) {
  return context.store.read<LibraryAssetStore>(assetStoreName(kind), {
    items: [],
  });
}

function normalizeAsset(
  value: unknown,
  projectId: string,
  scope: "project" | "user",
  previous?: LibraryAsset,
): LibraryAsset {
  const input = record(value);
  const timestamp = Date.now();
  return {
    ...previous,
    ...input,
    id: text(input.id, 191) || previous?.id || newId("asset"),
    projectId: scope === "user" ? null : projectId,
    scope,
    createdAt: previous?.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

function registerLibraryAssetRoutes(
  app: Hono,
  context: WorkflowBackendContext,
  kind: "characters" | "scenes" | "props",
) {
  const base = "/api/libtv/assets/" + kind;
  app.get(base, (c) => {
    const projectId = text(c.req.query("projectId"), 191);
    const scope = c.req.query("scope") === "user" ? "user" : "project";
    const store = readAssetStore(context, kind);
    const items = store.items.filter((item) =>
      scope === "user"
        ? item.scope === "user"
        : item.scope === "user" || item.projectId === projectId,
    );
    return c.json({ success: true, project: { id: projectId }, items });
  });

  app.post(base, async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const projectId = text(body.projectId, 191);
    const scope = body.scope === "user" ? "user" : "project";
    if (!projectId && scope !== "user")
      return c.json({ error: "projectId is required" }, 400);
    const incoming = Array.isArray(body.assets)
      ? body.assets
      : body.asset
        ? [body.asset]
        : [];
    const store = readAssetStore(context, kind);
    const items = incoming.map((value) => {
      const id = text(record(value).id, 191);
      const previous = id
        ? store.items.find((item) => item.id === id)
        : undefined;
      return normalizeAsset(value, projectId, scope, previous);
    });
    for (const item of items) {
      store.items = [item, ...store.items.filter((row) => row.id !== item.id)];
    }
    context.store.write(assetStoreName(kind), store);
    return c.json({
      success: true,
      project: { id: projectId },
      items,
      item: items[0] || null,
    });
  });

  app.delete(base + "/:id", (c) => {
    const store = readAssetStore(context, kind);
    const before = store.items.length;
    store.items = store.items.filter((item) => item.id !== c.req.param("id"));
    if (before === store.items.length)
      return c.json({ error: "Not found" }, 404);
    context.store.write(assetStoreName(kind), store);
    return c.json({ success: true });
  });
}

function generatedFiles(context: WorkflowBackendContext) {
  return context.store.read<GeneratedFileStore>("generated-files", {
    items: [],
  });
}

function normalizedGeneratedFileType(value: unknown, fallbackName: string) {
  const explicit = text(value, 32).toLowerCase();
  if (["3d", "three-d", "threed", "model", "glb", "gltf"].includes(explicit)) {
    return "3d";
  }
  if (["image", "video", "audio", "text", "file"].includes(explicit)) {
    return explicit;
  }
  return mediaTypeFromName(fallbackName);
}

async function platformGeneratedFile(
  context: WorkflowBackendContext,
  body: Record<string, unknown>,
  sourceUrl: string,
  index = 0,
) {
  if (body.platformPersisted === true || !/^https?:\/\//i.test(sourceUrl)) {
    return { url: sourceUrl, platformFile: null };
  }
  const type = normalizedGeneratedFileType(body.fileType, sourceUrl);
  const imported = record(
    await importPlatformFile(
      context,
      sourceUrl,
      `${text(body.model, 120) || type || "generated-media"}_${index + 1}`,
    ),
  );
  const url = text(imported.url, 20_000);
  if (!url) throw new Error("造梦 API 开放平台没有返回生成文件公网地址");
  return { url, platformFile: imported };
}

export function persistGeneratedFile(
  context: WorkflowBackendContext,
  value: Record<string, unknown>,
) {
  const url = text(value.fileUrl || value.url, 20_000);
  const file: GeneratedFile = {
    ...value,
    id: text(value.id, 191) || newId("generated"),
    fileType: normalizedGeneratedFileType(
      value.fileType,
      url || text(value.fileName),
    ),
    fileUrl: url,
    createdAt: text(value.createdAt, 64) || now(),
  };
  const store = generatedFiles(context);
  store.items = [file, ...store.items.filter((item) => item.id !== file.id)];
  context.store.write("generated-files", store);
  return file;
}

function rangeFromHeader(value: string | undefined, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(value || ""));
  if (!match) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end = match[2] ? Number(match[2]) : size - 1;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start
  )
    return null;
  return { start, end: Math.min(size - 1, end) };
}

export function registerAssetRoutes(
  app: Hono,
  context: WorkflowBackendContext,
) {
  registerLibraryAssetRoutes(app, context, "characters");
  registerLibraryAssetRoutes(app, context, "scenes");
  registerLibraryAssetRoutes(app, context, "props");

  app.get("/api/materials", (c) => {
    const store = context.store.read<MaterialStore>("materials", { items: [] });
    return c.json({ success: true, items: store.items });
  });
  app.post("/api/materials", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const src = text(body.src, 20_000);
    if (!src) return c.json({ error: "src is required" }, 400);
    const store = context.store.read<MaterialStore>("materials", { items: [] });
    const previous = store.items.find((item) => item.src === src);
    const item: Material = {
      ...previous,
      ...body,
      id: previous?.id || newId("material"),
      name: text(body.name, 120) || "未命名素材",
      src,
      thumbnailSrc: text(body.thumbnailSrc || body.coverSrc, 20_000) || src,
      coverSrc: text(body.coverSrc || body.thumbnailSrc, 20_000) || src,
      createdAt: previous?.createdAt || Date.now(),
    };
    store.items = [item, ...store.items.filter((row) => row.id !== item.id)];
    context.store.write("materials", store);
    return c.json({ success: true, item });
  });
  app.delete("/api/materials/:id", (c) => {
    const store = context.store.read<MaterialStore>("materials", { items: [] });
    const before = store.items.length;
    store.items = store.items.filter((item) => item.id !== c.req.param("id"));
    if (before === store.items.length)
      return c.json({ error: "Not found" }, 404);
    context.store.write("materials", store);
    return c.json({ success: true });
  });

  app.post("/api/upload", async (c) => {
    try {
      const form = await c.req.formData().catch(() => null);
      const value = form?.get("file");
      if (!(value instanceof Blob))
        return c.json({ error: "file is required" }, 400);
      const file = value as Blob & { name?: string };
      const stored = await uploadPlatformFile(
        context,
        file,
        file.name || "upload.bin",
      );
      const row = record(stored);
      return c.json({
        success: true,
        url: text(row.url, 20_000),
        file: stored,
        fileId: row.id,
      });
    } catch (error) {
      const status = Number((error as Error & { status?: number }).status || 0);
      return c.json(
        { error: error instanceof Error ? error.message : String(error) },
        (status >= 400 && status < 600 ? status : 500) as 400,
      );
    }
  });

  app.get("/api/workflow-backend/files/:id", (c) => {
    const item = fileStore(context).items.find(
      (row) => row.id === c.req.param("id"),
    );
    if (!item || !fs.existsSync(item.path)) return c.text("Not found", 404);
    const size = fs.statSync(item.path).size;
    const range = rangeFromHeader(c.req.header("range"), size);
    if (range) {
      const buffer = Buffer.allocUnsafe(range.end - range.start + 1);
      const fd = fs.openSync(item.path, "r");
      try {
        fs.readSync(fd, buffer, 0, buffer.length, range.start);
      } finally {
        fs.closeSync(fd);
      }
      return new Response(Uint8Array.from(buffer), {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Range":
            "bytes " + range.start + "-" + range.end + "/" + size,
          "Content-Length": String(buffer.length),
          "Content-Type": item.mimeType || contentTypeFromName(item.name),
        },
      });
    }
    const buffer = fs.readFileSync(item.path);
    return new Response(Uint8Array.from(buffer), {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(buffer.length),
        "Content-Type": item.mimeType || contentTypeFromName(item.name),
      },
    });
  });

  app.get("/api/files", (c) => {
    const projectId = text(c.req.query("projectId"), 191);
    const fileType = text(c.req.query("fileType"), 32);
    const limit = Math.max(
      1,
      Math.min(500, Number(c.req.query("limit") || 500)),
    );
    const items = generatedFiles(context)
      .items.filter((item) => !projectId || item.projectId === projectId)
      .filter((item) => !fileType || item.fileType === fileType)
      .slice(0, limit);
    return c.json(items);
  });
  app.delete("/api/files", (c) => {
    const fileId = text(c.req.query("fileId"), 191);
    const store = generatedFiles(context);
    const before = store.items.length;
    store.items = store.items.filter((item) => item.id !== fileId);
    if (before === store.items.length)
      return c.json({ error: "File not found" }, 404);
    context.store.write("generated-files", store);
    return c.json({ success: true });
  });

  const proxyImage = async (c: Context) => {
    const source = unwrapWorkflowProxyUrl(c.req.query("url"));
    if (!/^https?:\/\//i.test(source)) return c.redirect(source || "/", 302);
    const upstream = await context.fetchRemote(source, {
      headers: {
        Accept: c.req.header("accept") || "image/*,*/*;q=0.8",
        ...(c.req.header("range") ? { Range: c.req.header("range")! } : {}),
      },
    });
    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  };
  app.get("/api/image-proxy", proxyImage);
  app.get("/api/image-proxy/proxy", proxyImage);
  app.get("/api/video-proxy", async (c) => {
    const source = unwrapWorkflowProxyUrl(c.req.query("url"));
    if (!/^https?:\/\//i.test(source)) return c.redirect(source || "/", 302);
    const upstream = await context.fetchRemote(source, {
      headers: {
        Accept: c.req.header("accept") || "video/*,*/*;q=0.8",
        ...(c.req.header("range") ? { Range: c.req.header("range")! } : {}),
      },
    });
    const headers = new Headers(upstream.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  });

  app.get("/api/libtv/character-library", (c) => {
    const projectId = text(c.req.query("projectId"), 191);
    const items = readAssetStore(context, "characters").items.filter(
      (item) =>
        item.scope === "user" || !projectId || item.projectId === projectId,
    );
    return c.json({ success: true, items, characters: items });
  });

  app.post("/api/workflow/persist-generated-video", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const sourceUrl = text(body.url || body.videoUrl, 20_000);
    if (!sourceUrl) return c.json({ error: "video url is required" }, 400);
    const persisted = await platformGeneratedFile(context, body, sourceUrl);
    const item = persistGeneratedFile(context, {
      ...body,
      fileType: "video",
      fileUrl: persisted.url,
      platformFileId: persisted.platformFile?.id,
    });
    return c.json({ success: true, url: persisted.url, file: item });
  });

  app.post("/api/workflow/persist-generated-media", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const urls = [
      ...(Array.isArray(body.urls) ? body.urls : []),
      body.url,
      body.fileUrl,
    ]
      .map((value) => text(value, 20_000))
      .filter(Boolean);
    if (!urls.length) return c.json({ error: "media url is required" }, 400);
    const persisted = await Promise.all(
      urls.map((url, index) =>
        platformGeneratedFile(context, body, url, index),
      ),
    );
    const files = persisted.map((item) =>
      persistGeneratedFile(context, {
        ...body,
        id: undefined,
        fileUrl: item.url,
        fileType: text(body.fileType, 32) || mediaTypeFromName(item.url),
        platformFileId: item.platformFile?.id,
      }),
    );
    return c.json({
      success: true,
      urls: persisted.map((item) => item.url),
      files,
      file: files[0] || null,
    });
  });
}
