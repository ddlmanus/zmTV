import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import OSS from "ali-oss";

const OSS_ENV_KEYS = [
  "OSS_BUCKET",
  "OSS_REGION",
  "OSS_ACCESS_KEY_ID",
  "OSS_ACCESS_KEY_SECRET",
  "OSS_ACCELERATE_ENABLED",
  "OSS_ACCELERATE_HOST",
  "OSS_PUBLIC_HOST",
] as const;

type OssEnvironmentKey = (typeof OSS_ENV_KEYS)[number];

type OssUploadConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint?: string;
  publicHost: string;
};

export type PublicOssUpload = {
  objectName: string;
  url: string;
};

let cachedClient: { fingerprint: string; client: OSS } | null = null;
let localEnvironmentLoaded = false;

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote)
    return trimmed;
  return trimmed.slice(1, -1);
}

function loadLocalEnvironment() {
  if (localEnvironmentLoaded) return;
  localEnvironmentLoaded = true;
  const appRoot = String(
    process.env.ZAOMENG_DESKTOP_PROJECT_ROOT || process.cwd(),
  ).trim();
  const envPath = path.join(appRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const accepted = new Set<string>(OSS_ENV_KEYS);
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || !accepted.has(match[1]) || process.env[match[1]]) continue;
    process.env[match[1]] = unquoteEnvValue(match[2]);
  }
}

function requiredEnv(key: OssEnvironmentKey) {
  const value = String(process.env[key] || "").trim();
  if (!value) throw new Error(`OSS 未配置: ${key}`);
  return value;
}

function normalizeHost(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

function readOssConfig(): OssUploadConfig {
  loadLocalEnvironment();
  const bucket = requiredEnv("OSS_BUCKET");
  const region = requiredEnv("OSS_REGION");
  const accelerateEnabled =
    String(process.env.OSS_ACCELERATE_ENABLED || "").trim() === "1";
  const accelerateHost = normalizeHost(
    String(process.env.OSS_ACCELERATE_HOST || "oss-accelerate.aliyuncs.com"),
  );
  const accelerateEndpointHost = accelerateHost.startsWith(`${bucket}.`)
    ? accelerateHost.slice(bucket.length + 1)
    : accelerateHost;
  const publicHost = normalizeHost(
    String(process.env.OSS_PUBLIC_HOST || "") ||
      `${bucket}.${accelerateEnabled ? accelerateEndpointHost : `${region}.aliyuncs.com`}`,
  );
  return {
    bucket,
    region,
    accessKeyId: requiredEnv("OSS_ACCESS_KEY_ID"),
    accessKeySecret: requiredEnv("OSS_ACCESS_KEY_SECRET"),
    endpoint: accelerateEnabled
      ? `https://${accelerateEndpointHost}`
      : undefined,
    publicHost,
  };
}

function ossClient(config: OssUploadConfig) {
  const fingerprint = JSON.stringify(config);
  if (cachedClient?.fingerprint === fingerprint) return cachedClient.client;
  const client = new OSS({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    secure: true,
    timeout: 120_000,
  });
  cachedClient = { fingerprint, client };
  return client;
}

function safeExtension(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
}

function objectName(filename: string) {
  const now = new Date();
  const datePath = [
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("/");
  return `lovarts-desktop/codex-attachments/${datePath}/${randomUUID()}${safeExtension(filename)}`;
}

export async function uploadPublicOssObject(input: {
  buffer: Buffer;
  filename: string;
  contentType?: string;
}): Promise<PublicOssUpload> {
  const config = readOssConfig();
  const name = objectName(input.filename);
  await ossClient(config).put(name, input.buffer, {
    headers: {
      "content-type": input.contentType || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-oss-object-acl": "public-read",
    },
  });
  return {
    objectName: name,
    url: `https://${config.publicHost}/${name
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  };
}
