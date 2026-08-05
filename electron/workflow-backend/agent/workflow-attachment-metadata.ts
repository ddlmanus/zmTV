import fs from "node:fs";
import path from "node:path";

export type CodexWorkflowAttachmentMetadata = {
  attachmentPath: string;
  nodeId?: string;
  sourceUrl?: string;
  publicUrl?: string;
  mediaKind?: "image" | "video" | "audio";
  seedanceAssetId?: string;
  seedanceAssetUrl?: string;
  seedanceAssetStatus?: string;
  seedanceAssetCategory?: string;
  portraitCompliantExempt?: boolean;
  naturalWidth?: number;
  naturalHeight?: number;
  updatedAt: string;
};

type CodexWorkflowAttachmentMetadataFile = {
  version: 1;
  entries: CodexWorkflowAttachmentMetadata[];
};

const METADATA_FILENAME = ".workflow-metadata.json";
const MAX_METADATA_ENTRIES = 256;

function metadataPath(projectPath: string) {
  return path.join(projectPath, "attachments", METADATA_FILENAME);
}

function normalizeIdentity(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  return decoded.replace(/\\/g, "/").replace(/^\.\//, "");
}

function identityKeys(projectPath: string, value: unknown): Set<string> {
  const keys = new Set<string>();
  const push = (candidate: unknown) => {
    const normalized = normalizeIdentity(candidate);
    if (!normalized) return;
    keys.add(normalized);
    keys.add(normalized.toLowerCase());
  };
  const raw = String(value || "").trim();
  push(raw);
  try {
    const parsed = new URL(raw, "http://codex.local");
    push(parsed.pathname);
    push(parsed.searchParams.get("path"));
  } catch {}
  if (path.isAbsolute(raw)) {
    const relative = path.relative(projectPath, raw);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative))
      push(relative);
  }
  return keys;
}

export function readCodexWorkflowAttachmentMetadata(
  projectPath: string,
): CodexWorkflowAttachmentMetadata[] {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(metadataPath(projectPath), "utf8"),
    ) as CodexWorkflowAttachmentMetadataFile;
    return Array.isArray(parsed?.entries)
      ? parsed.entries.filter((entry) => Boolean(entry?.attachmentPath))
      : [];
  } catch {
    return [];
  }
}

export function upsertCodexWorkflowAttachmentMetadata(
  projectPath: string,
  attachmentPath: string,
  metadata: Omit<
    CodexWorkflowAttachmentMetadata,
    "attachmentPath" | "updatedAt"
  >,
) {
  const normalizedAttachmentPath = normalizeIdentity(attachmentPath);
  if (!normalizedAttachmentPath) return;
  const target = metadataPath(projectPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const entries = readCodexWorkflowAttachmentMetadata(projectPath).filter(
    (entry) =>
      normalizeIdentity(entry.attachmentPath) !== normalizedAttachmentPath,
  );
  entries.push({
    attachmentPath: normalizedAttachmentPath,
    ...metadata,
    updatedAt: new Date().toISOString(),
  });
  const payload: CodexWorkflowAttachmentMetadataFile = {
    version: 1,
    entries: entries.slice(-MAX_METADATA_ENTRIES),
  };
  fs.writeFileSync(target, JSON.stringify(payload, null, 2) + "\n");
}

export function findCodexWorkflowAttachmentMetadata(
  projectPath: string,
  reference: unknown,
): CodexWorkflowAttachmentMetadata | null {
  const referenceKeys = identityKeys(projectPath, reference);
  if (referenceKeys.size === 0) return null;
  const entries = readCodexWorkflowAttachmentMetadata(projectPath);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entryKeys = identityKeys(projectPath, entries[index].attachmentPath);
    if (Array.from(entryKeys).some((key) => referenceKeys.has(key)))
      return entries[index];
  }
  return null;
}
