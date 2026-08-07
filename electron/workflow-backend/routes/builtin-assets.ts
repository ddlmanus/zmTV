import fs from "node:fs";
import path from "node:path";
import type { Hono } from "hono";
import type { WorkflowBackendContext } from "../context";

const DIRECTOR_CHARACTER_FILENAMES = new Set([
  "1-男性-低模.glb",
  "2 女性-低模.glb",
  "03+健硕.glb",
  "04+纤细.glb",
  "05+宽厚.glb",
  "06+儿童.glb",
  "07+少年.glb",
  "08-二头身.glb",
]);

function directorCharacterPath(
  context: WorkflowBackendContext,
  filename: string,
) {
  if (!DIRECTOR_CHARACTER_FILENAMES.has(filename)) return "";
  const candidates = [
    path.join(
      context.appRoot,
      "out",
      "renderer",
      "assets",
      "3d-characters",
      filename,
    ),
    path.resolve(
      context.appRoot,
      "..",
      "renderer",
      "assets",
      "3d-characters",
      filename,
    ),
    path.join(context.appRoot, "public", "assets", "3d-characters", filename),
  ];
  return (
    candidates.find(
      (candidate) =>
        fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
    ) || ""
  );
}

export function registerBuiltinAssetRoutes(
  app: Hono,
  context: WorkflowBackendContext,
) {
  app.get("/api/workflow-assets/3d-characters/:filename", (c) => {
    let filename = c.req.param("filename");
    try {
      filename = decodeURIComponent(filename);
    } catch {
      return c.text("Not found", 404);
    }
    const target = directorCharacterPath(context, filename);
    if (!target) return c.text("Not found", 404);
    const buffer = fs.readFileSync(target);
    return new Response(Uint8Array.from(buffer), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(buffer.length),
        "Content-Type": "model/gltf-binary",
      },
    });
  });
}
