import fs from "node:fs";
import path from "node:path";

type CodexTarget = {
  packageName: string;
  triple: string;
};

function currentCodexTarget(): CodexTarget {
  if (process.platform === "darwin") {
    return process.arch === "arm64"
      ? {
          packageName: "@openai/codex-darwin-arm64",
          triple: "aarch64-apple-darwin",
        }
      : {
          packageName: "@openai/codex-darwin-x64",
          triple: "x86_64-apple-darwin",
        };
  }
  if (process.platform === "win32") {
    return process.arch === "arm64"
      ? {
          packageName: "@openai/codex-win32-arm64",
          triple: "aarch64-pc-windows-msvc",
        }
      : {
          packageName: "@openai/codex-win32-x64",
          triple: "x86_64-pc-windows-msvc",
        };
  }
  return process.arch === "arm64"
    ? {
        packageName: "@openai/codex-linux-arm64",
        triple: "aarch64-unknown-linux-musl",
      }
    : {
        packageName: "@openai/codex-linux-x64",
        triple: "x86_64-unknown-linux-musl",
      };
}

function unpackedAppRoot(appRoot: string) {
  return appRoot.endsWith(".asar") ? appRoot + ".unpacked" : appRoot;
}

export function codexBinaryCandidates(appRoot: string) {
  const target = currentCodexTarget();
  const executable = process.platform === "win32" ? "codex.exe" : "codex";
  const roots = Array.from(
    new Set([unpackedAppRoot(appRoot), appRoot].filter(Boolean)),
  );
  const packageSegments = target.packageName.split("/");
  const binaryTail = ["vendor", target.triple, "bin", executable];
  const candidates = roots.flatMap((root) => [
    path.join(root, "node_modules", ...packageSegments, ...binaryTail),
    path.join(
      root,
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      ...packageSegments,
      ...binaryTail,
    ),
  ]);
  candidates.push(
    path.join(
      appRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "codex.cmd" : "codex",
    ),
  );
  return Array.from(new Set(candidates));
}

export function resolveCodexBinary(appRoot: string) {
  const explicit = String(process.env.CODEX_BIN || "").trim();
  if (explicit) return explicit;
  const candidates = codexBinaryCandidates(appRoot);
  return (
    candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
  );
}
