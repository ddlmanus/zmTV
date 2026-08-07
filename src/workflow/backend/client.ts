const WORKFLOW_PROTOCOL_ORIGIN = "zaomeng-workflow://local";
const nativeFetch = globalThis.fetch.bind(globalThis);

const WORKFLOW_BACKEND_PREFIXES = [
  "/api/codex",
  "/api/workflow",
  "/api/libtv",
  "/api/canvas/jobs",
  "/api/chat/jobs",
  "/api/chat/edit-image",
  "/api/chat/task-status",
  "/api/chat/transcribe-audio",
  "/api/seedance",
  "/api/platform",
  "/api/files",
  "/api/skill-library",
  "/api/kling",
  "/api/workflow-presets",
] as const;

const ACTIVE_WORKFLOW_BACKEND_PREFIXES = [
  "/api/projects",
  "/api/public-workflow-projects",
  "/api/materials",
  "/api/upload",
  "/api/files",
  "/api/image-proxy",
  "/api/video-proxy",
  "/api/remove-bg",
  "/api/edit-image",
  "/api/erase",
  "/api/annotation-edit",
  "/api/prompt/translate",
] as const;

function hasDesktopWorkflowBackend() {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

function isWorkflowPageLocation() {
  if (window.location.pathname === "/workflow") return true;
  const hashPath = window.location.hash.replace(/^#/, "").split(/[?#]/, 1)[0];
  return hashPath === "/workflow" || hashPath.startsWith("/workflow/");
}

function isWorkflowBackendPath(value: string) {
  let pathname = value;
  try {
    pathname = new URL(value, window.location.origin).pathname;
  } catch {
    pathname = value.split(/[?#]/, 1)[0] || value;
  }
  if (
    WORKFLOW_BACKEND_PREFIXES.some((prefix) =>
      pathMatchesPrefix(pathname, prefix),
    )
  ) {
    return true;
  }
  if (!isWorkflowPageLocation()) return false;
  return ACTIVE_WORKFLOW_BACKEND_PREFIXES.some((prefix) =>
    pathMatchesPrefix(pathname, prefix),
  );
}

export function workflowApiUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw || !hasDesktopWorkflowBackend()) return raw;
  if (/^(?:data|blob|local-asset|zaomeng-workflow):/i.test(raw)) {
    return raw;
  }
  if (/^https?:/i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (
        parsed.origin === window.location.origin &&
        isWorkflowBackendPath(parsed.pathname)
      ) {
        return WORKFLOW_PROTOCOL_ORIGIN + parsed.pathname + parsed.search;
      }
    } catch {
      return raw;
    }
    return raw;
  }
  if (!isWorkflowBackendPath(raw)) return raw;
  return WORKFLOW_PROTOCOL_ORIGIN + raw;
}

export function workflowResourceUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw || !hasDesktopWorkflowBackend()) return raw;
  if (/^(?:data|blob|local-asset|zaomeng-workflow):/i.test(raw)) return raw;
  let parsed: URL;
  try {
    parsed = new URL(raw, window.location.origin);
  } catch {
    return raw;
  }
  if (/^https?:/i.test(raw) && parsed.origin !== window.location.origin) {
    return raw;
  }
  if (parsed.pathname.startsWith("/images/zmtv/skill-library/")) {
    const relative = parsed.pathname.slice(
      "/images/zmtv/skill-library/".length,
    );
    return (
      WORKFLOW_PROTOCOL_ORIGIN +
      "/api/workflow-presets/skill-library/" +
      relative +
      parsed.search
    );
  }
  const resourcePrefixes = [
    "/api/workflow-assets",
    "/api/image-proxy",
    "/api/video-proxy",
    "/api/workflow-backend/files",
    "/api/workflow-presets",
  ];
  if (
    resourcePrefixes.some((prefix) =>
      pathMatchesPrefix(parsed.pathname, prefix),
    )
  ) {
    return WORKFLOW_PROTOCOL_ORIGIN + parsed.pathname + parsed.search;
  }
  return raw;
}

export function workflowFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof input === "string")
    return nativeFetch(workflowApiUrl(input), init);
  if (input instanceof URL) {
    return nativeFetch(new URL(workflowApiUrl(input.toString())), init);
  }
  return nativeFetch(input, init);
}

let interceptorUsers = 0;
let previousWindowFetch: typeof window.fetch | null = null;
let resourceObserver: MutationObserver | null = null;

function rewriteResourceAttribute(element: Element, attribute: string) {
  const current = element.getAttribute(attribute);
  if (!current) return;
  const next = workflowResourceUrl(current);
  if (next && next !== current) element.setAttribute(attribute, next);
}

function rewriteElementResources(element: Element) {
  rewriteResourceAttribute(element, "src");
  rewriteResourceAttribute(element, "poster");
  if (element instanceof HTMLAnchorElement) {
    rewriteResourceAttribute(element, "href");
  }
  element
    .querySelectorAll(
      "img[src],video[src],video[poster],audio[src],source[src],a[href]",
    )
    .forEach((child) => {
      rewriteResourceAttribute(child, "src");
      rewriteResourceAttribute(child, "poster");
      if (child instanceof HTMLAnchorElement) {
        rewriteResourceAttribute(child, "href");
      }
    });
}

function installWorkflowResourceObserver() {
  if (typeof document === "undefined" || resourceObserver) return;
  rewriteElementResources(document.documentElement);
  resourceObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        rewriteElementResources(mutation.target as Element);
        continue;
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) rewriteElementResources(node);
      });
    }
  });
  resourceObserver.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "poster", "href"],
  });
}

export function installWorkflowFetchInterceptor() {
  if (typeof window === "undefined" || !hasDesktopWorkflowBackend()) {
    return () => undefined;
  }
  interceptorUsers += 1;
  if (interceptorUsers === 1) {
    previousWindowFetch = window.fetch;
    window.fetch = workflowFetch as typeof window.fetch;
    installWorkflowResourceObserver();
  }
  return () => {
    interceptorUsers = Math.max(0, interceptorUsers - 1);
    if (interceptorUsers === 0 && previousWindowFetch) {
      window.fetch = previousWindowFetch;
      previousWindowFetch = null;
      resourceObserver?.disconnect();
      resourceObserver = null;
    }
  };
}
