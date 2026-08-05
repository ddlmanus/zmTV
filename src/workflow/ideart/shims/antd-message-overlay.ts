type MessageKind = "success" | "error" | "warning" | "info" | "loading";

export type MessageConfig = {
  content?: unknown;
  type?: MessageKind | string;
  key?: unknown;
  duration?: number;
};

type MessageInput = unknown | MessageConfig;

type MessageEntry = {
  key: string;
  element: HTMLDivElement;
  timer: number | null;
};

const ROOT_ID = "zaomeng-workflow-message-root";
const DEFAULT_DURATION_SECONDS = 3;
const entries = new Map<string, MessageEntry>();
let sequence = 0;
let positionListenerInstalled = false;

const COLORS: Record<MessageKind, string> = {
  success: "#4ade80",
  error: "#fb7185",
  warning: "#facc15",
  info: "#67e8f9",
  loading: "#60a5fa",
};

function messageText(value: MessageInput, fallback: string) {
  const content =
    value && typeof value === "object" && "content" in value
      ? (value as MessageConfig).content
      : value;
  if (typeof content === "string") return content.trim() || fallback;
  if (content instanceof Error) return content.message || fallback;
  if (content === null || content === undefined) return fallback;
  try {
    const serialized = JSON.stringify(content);
    return serialized && serialized !== "{}" ? serialized : fallback;
  } catch {
    return fallback;
  }
}

function configFor(value: MessageInput) {
  return value && typeof value === "object" && "content" in value
    ? (value as MessageConfig)
    : null;
}

function ensureRoot() {
  if (typeof document === "undefined") return null;
  let root = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("aria-live", "polite");
    root.style.position = "fixed";
    root.style.zIndex = "2147483000";
    root.style.display = "flex";
    root.style.width = "min(560px, calc(100vw - 32px))";
    root.style.flexDirection = "column";
    root.style.alignItems = "center";
    root.style.gap = "8px";
    root.style.pointerEvents = "none";
    root.style.transform = "translateX(-50%)";
    document.body.appendChild(root);
  }
  positionRoot(root);
  if (!positionListenerInstalled) {
    positionListenerInstalled = true;
    window.addEventListener("resize", refreshPosition, { passive: true });
    window.addEventListener("scroll", refreshPosition, {
      passive: true,
      capture: true,
    });
  }
  return root;
}

function positionRoot(root: HTMLDivElement) {
  const canvas = document.querySelector<HTMLElement>(
    '[data-canvas-container="true"]',
  );
  const rect = canvas?.getBoundingClientRect();
  const left = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const top = rect ? Math.max(rect.top + 18, 18) : 72;
  root.style.left = `${Math.round(left)}px`;
  root.style.top = `${Math.round(top)}px`;
}

function refreshPosition() {
  const root = document.getElementById(ROOT_ID) as HTMLDivElement | null;
  if (root) positionRoot(root);
}

function removeMessage(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  entries.delete(key);
  if (entry.timer !== null) window.clearTimeout(entry.timer);
  entry.element.style.opacity = "0";
  entry.element.style.transform = "translateY(-6px) scale(0.98)";
  window.setTimeout(() => entry.element.remove(), 150);
}

function messageKey(config: MessageConfig | null) {
  const explicit = String(config?.key ?? "").trim();
  if (explicit) return explicit;
  sequence += 1;
  return `workflow-message-${sequence}`;
}

function indicator(kind: MessageKind, color: string) {
  const node = document.createElement("span");
  node.style.display = "block";
  node.style.width = "8px";
  node.style.height = "8px";
  node.style.flex = "0 0 auto";
  if (kind === "loading") {
    node.style.width = "12px";
    node.style.height = "12px";
    node.style.border = "2px solid rgba(96, 165, 250, 0.28)";
    node.style.borderTopColor = color;
    node.style.borderRadius = "999px";
    node.style.animation = "zaomeng-workflow-message-spin 0.8s linear infinite";
  } else {
    node.style.borderRadius = "999px";
    node.style.background = color;
    node.style.boxShadow = `0 0 10px ${color}55`;
  }
  return node;
}

function ensureAnimationStyle() {
  if (document.getElementById("zaomeng-workflow-message-style")) return;
  const style = document.createElement("style");
  style.id = "zaomeng-workflow-message-style";
  style.textContent =
    "@keyframes zaomeng-workflow-message-spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(style);
}

function renderEntry(element: HTMLDivElement, kind: MessageKind, text: string) {
  ensureAnimationStyle();
  const canvasLight = Boolean(document.querySelector(".canvas-light"));
  const color = COLORS[kind];
  element.replaceChildren();
  element.setAttribute("role", kind === "error" ? "alert" : "status");
  element.style.display = "flex";
  element.style.maxWidth = "100%";
  element.style.alignItems = "center";
  element.style.gap = "9px";
  element.style.padding = "9px 14px";
  element.style.border = canvasLight
    ? "1px solid rgba(15, 23, 42, 0.12)"
    : "1px solid rgba(255, 255, 255, 0.12)";
  element.style.borderRadius = "8px";
  element.style.background = canvasLight
    ? "rgba(255, 255, 255, 0.96)"
    : "rgba(31, 31, 31, 0.96)";
  element.style.boxShadow = canvasLight
    ? "0 10px 28px rgba(15, 23, 42, 0.14)"
    : "0 12px 32px rgba(0, 0, 0, 0.38)";
  element.style.backdropFilter = "blur(12px)";
  element.style.color = color;
  element.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "PingFang SC", Inter, "Noto Sans SC", "Microsoft YaHei", sans-serif';
  element.style.fontSize = "14px";
  element.style.fontWeight = "600";
  element.style.lineHeight = "20px";
  element.style.textAlign = "left";
  element.style.letterSpacing = "0";
  element.style.opacity = "1";
  element.style.transform = "translateY(0) scale(1)";
  element.style.transition =
    "opacity 150ms ease, transform 150ms ease, background-color 150ms ease";
  element.append(indicator(kind, color), document.createTextNode(text));
}

export function showWorkflowMessage(
  kind: MessageKind,
  value: MessageInput,
  fallback: string,
) {
  const root = ensureRoot();
  if (!root) return () => undefined;
  const config = configFor(value);
  const key = messageKey(config);
  const text = messageText(value, fallback);
  let entry = entries.get(key);
  if (!entry) {
    const element = document.createElement("div");
    entry = { key, element, timer: null };
    entries.set(key, entry);
    root.appendChild(element);
  }
  if (entry.timer !== null) window.clearTimeout(entry.timer);
  renderEntry(entry.element, kind, text);
  root.appendChild(entry.element);

  const duration =
    typeof config?.duration === "number"
      ? config.duration
      : kind === "loading"
        ? 0
        : DEFAULT_DURATION_SECONDS;
  entry.timer =
    duration > 0
      ? window.setTimeout(() => removeMessage(key), duration * 1000)
      : null;
  return () => removeMessage(key);
}

export function destroyWorkflowMessage(key?: unknown) {
  const normalized = String(key ?? "").trim();
  if (normalized) {
    removeMessage(normalized);
    return;
  }
  for (const entryKey of [...entries.keys()]) removeMessage(entryKey);
}

export function normalizeMessageKind(value: unknown): MessageKind {
  const kind = String(value || "").trim() as MessageKind;
  return ["success", "error", "warning", "info", "loading"].includes(kind)
    ? kind
    : "info";
}
