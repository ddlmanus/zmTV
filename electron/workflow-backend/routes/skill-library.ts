import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import type { WorkflowBackendContext } from "../context";
import { contentTypeFromName, record, text } from "./shared";

type BundledSkillLibraryItem = Record<string, unknown> & {
  id: string;
  title: string;
  slug: string;
  categorySlug: string;
  coverImageUrl: string;
  hoverImageUrl: string;
  tags: string[];
  sortOrder: number;
};

type SkillLibraryUserState = {
  favorites: string[];
  recent: Record<string, string>;
  usage: Record<string, number>;
};

const PRESET_ROUTE_PREFIX = "/api/workflow-presets/skill-library/";
const SOURCE_IMAGE_PREFIX = "/images/zmtv/skill-library/";

let cachedItemsPath = "";
let cachedItemsMtime = 0;
let cachedItems: BundledSkillLibraryItem[] = [];

function presetRoot(context: WorkflowBackendContext) {
  return path.join(context.resourcesRoot, "workflow-presets", "skill-library");
}

function presetUrl(relativePath: string) {
  return (
    "zaomeng-workflow://local" +
    PRESET_ROUTE_PREFIX +
    relativePath
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/")
  );
}

function localPresetUrl(value: unknown) {
  const raw = text(value, 20_000);
  if (!raw.startsWith(SOURCE_IMAGE_PREFIX)) return raw;
  return presetUrl(raw.slice(SOURCE_IMAGE_PREFIX.length));
}

function loadItems(context: WorkflowBackendContext) {
  const source = path.join(presetRoot(context), "items.json");
  const mtime = fs.statSync(source).mtimeMs;
  if (source === cachedItemsPath && mtime === cachedItemsMtime) {
    return cachedItems;
  }
  const parsed = JSON.parse(fs.readFileSync(source, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("技能素材清单格式错误");
  cachedItems = parsed.map((value, index) => {
    const input = record(value);
    const slug = text(input.slug, 191) || "preset-" + (index + 1);
    return {
      ...input,
      id: text(input.id, 191) || slug,
      title: text(input.title, 180) || "未命名素材",
      slug,
      categorySlug: text(input.categorySlug, 120) || "style-library",
      coverImageUrl: localPresetUrl(input.coverImageUrl),
      hoverImageUrl: localPresetUrl(input.hoverImageUrl || input.coverImageUrl),
      tags: Array.isArray(input.tags)
        ? input.tags.map((tag) => text(tag, 120)).filter(Boolean)
        : [],
      sortOrder: Number(input.sortOrder) || 0,
    };
  });
  cachedItemsPath = source;
  cachedItemsMtime = mtime;
  return cachedItems;
}

function readUserState(context: WorkflowBackendContext) {
  return context.store.read<SkillLibraryUserState>("skill-library-user-state", {
    favorites: [],
    recent: {},
    usage: {},
  });
}

function categories(items: BundledSkillLibraryItem[]) {
  const names: Record<string, string> = {
    "style-library": "风格广场",
    "effect-library": "特效广场",
  };
  return Array.from(new Set(items.map((item) => item.categorySlug))).map(
    (slug) => ({ slug, name: names[slug] || slug }),
  );
}

function searchText(item: BundledSkillLibraryItem) {
  return [
    item.title,
    item.slug,
    item.shortDescription,
    item.description,
    item.author,
    ...item.tags,
  ]
    .map((value) => text(value, 2_000).toLowerCase())
    .join("\n");
}

function resolvedPresetPath(context: WorkflowBackendContext, requestPath: string) {
  const encoded = requestPath.slice(PRESET_ROUTE_PREFIX.length);
  let decoded = encoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  const root = path.resolve(presetRoot(context));
  const target = path.resolve(root, decoded);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

export function registerSkillLibraryRoutes(
  app: Hono,
  context: WorkflowBackendContext,
) {
  app.get("/api/skill-library", (c) => {
    const allItems = loadItems(context);
    const state = readUserState(context);
    const keyword = text(c.req.query("keyword"), 200).toLowerCase();
    const tab = text(c.req.query("tab"), 32);
    const categorySlug = text(c.req.query("categorySlug"), 120);
    const page = Math.max(1, Number(c.req.query("page") || 1) || 1);
    const pageSize = Math.max(
      1,
      Math.min(100, Number(c.req.query("pageSize") || 48) || 48),
    );
    const favorites = new Set(state.favorites);

    let filtered = allItems.filter(
      (item) => !categorySlug || item.categorySlug === categorySlug,
    );
    if (keyword) {
      filtered = filtered.filter((item) => searchText(item).includes(keyword));
    }
    if (tab === "favorite") {
      filtered = filtered.filter((item) => favorites.has(item.id));
    } else if (tab === "recent") {
      filtered = filtered.filter((item) => Boolean(state.recent[item.id]));
      filtered.sort(
        (left, right) =>
          String(state.recent[right.id]).localeCompare(
            String(state.recent[left.id]),
          ),
      );
    } else {
      filtered.sort((left, right) => right.sortOrder - left.sortOrder);
    }

    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const list = filtered.slice(start, start + pageSize).map((item) => ({
      ...item,
      isFavorited: favorites.has(item.id),
      lastUsedAt: state.recent[item.id] || null,
      usageCount: state.usage[item.id] || 0,
    }));
    return c.json({
      categories: categories(allItems),
      list,
      page,
      pageSize,
      total,
      hasMore: start + list.length < total,
    });
  });

  app.post("/api/skill-library", async (c) => {
    const body = record(await c.req.json().catch(() => ({})));
    const action = text(body.action, 64);
    const itemId = text(body.itemId, 191);
    if (!itemId) return c.json({ error: "itemId 不能为空" }, 400);
    if (!loadItems(context).some((item) => item.id === itemId))
      return c.json({ error: "素材不存在" }, 404);
    const state = readUserState(context);
    if (action === "toggle_favorite") {
      const favorites = new Set(state.favorites);
      if (body.favorited === false) favorites.delete(itemId);
      else favorites.add(itemId);
      state.favorites = Array.from(favorites);
    } else if (action === "record_recent") {
      state.recent[itemId] = new Date().toISOString();
      state.usage[itemId] = (state.usage[itemId] || 0) + 1;
    } else {
      return c.json({ error: "Unsupported action" }, 400);
    }
    context.store.write("skill-library-user-state", state);
    return c.json({ success: true });
  });

  app.get(PRESET_ROUTE_PREFIX + "*", (c) => {
    const target = resolvedPresetPath(context, c.req.path);
    if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return c.text("Not found", 404);
    }
    const buffer = fs.readFileSync(target);
    return new Response(Uint8Array.from(buffer), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(buffer.length),
        "Content-Type": contentTypeFromName(target),
      },
    });
  });
}
