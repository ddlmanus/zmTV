import fs from "node:fs";
import path from "node:path";
import type { WorkflowBackendContext } from "./context";
import { findCodexWorkflowAttachmentMetadata } from "./agent/workflow-attachment-metadata";

type RuntimeAttachmentReference = {
  projectId: string;
  attachmentPath: string;
};

function runtimeAttachmentReference(
  value: string,
): RuntimeAttachmentReference | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw, "http://workflow.local");
    const match = parsed.pathname.match(
      /^\/api\/codex\/projects\/([^/]+)\/runtime-files\/view$/,
    );
    if (!match) return null;
    const projectId = decodeURIComponent(match[1] || "").trim();
    const attachmentPath = String(parsed.searchParams.get("path") || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
    if (
      !projectId ||
      path.basename(projectId) !== projectId ||
      !attachmentPath ||
      attachmentPath.split("/").includes("..")
    ) {
      return null;
    }
    return { projectId, attachmentPath };
  } catch {
    return null;
  }
}

function codexRuntimeProjectRoot(runtimeRoot: string, projectId: string) {
  const usersRoot = path.join(runtimeRoot, "users");
  try {
    for (const userId of fs.readdirSync(usersRoot)) {
      const projectRoot = path.join(usersRoot, userId, "projects", projectId);
      if (fs.existsSync(projectRoot)) return projectRoot;
    }
  } catch {}
  return "";
}

function publicAttachmentUrl(context: WorkflowBackendContext, value: string) {
  const reference = runtimeAttachmentReference(value);
  if (!reference) return "";
  const projectRoot = codexRuntimeProjectRoot(
    context.runtimeRoot,
    reference.projectId,
  );
  if (!projectRoot) return "";
  const metadata = findCodexWorkflowAttachmentMetadata(
    projectRoot,
    reference.attachmentPath,
  );
  const publicUrl = String(
    metadata?.publicUrl || metadata?.sourceUrl || "",
  ).trim();
  return /^https?:\/\//i.test(publicUrl) ? publicUrl : "";
}

function normalizeValue(
  context: WorkflowBackendContext,
  value: unknown,
): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const publicUrl = publicAttachmentUrl(context, value);
    return publicUrl
      ? { value: publicUrl, changed: publicUrl !== value }
      : { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const normalized = normalizeValue(context, item);
      changed ||= normalized.changed;
      return normalized.value;
    });
    return { value: changed ? next : value, changed };
  }
  if (!value || typeof value !== "object") {
    return { value, changed: false };
  }
  let changed = false;
  const next = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const normalized = normalizeValue(context, item);
      changed ||= normalized.changed;
      return [key, normalized.value];
    }),
  );
  return { value: changed ? next : value, changed };
}

export function normalizeDesktopProjectMediaUrls(
  context: WorkflowBackendContext,
  content: string | null,
) {
  if (!content) return { content, changed: false };
  try {
    const parsed = JSON.parse(content) as unknown;
    const normalized = normalizeValue(context, parsed);
    return normalized.changed
      ? { content: JSON.stringify(normalized.value), changed: true }
      : { content, changed: false };
  } catch {
    return { content, changed: false };
  }
}
