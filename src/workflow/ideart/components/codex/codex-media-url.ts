import { toDesktopRemoteAssetUrl } from "@/workflow/ideart/lib/url/image-proxy-policy";

export type CodexMediaKind = "image" | "video" | "audio" | string;

function unwrapMediaProxyUrl(value: string) {
  try {
    const parsed = new URL(
      value,
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    );
    if (
      parsed.pathname === "/api/image-proxy" ||
      parsed.pathname === "/api/video-proxy"
    ) {
      return String(parsed.searchParams.get("url") || "").trim() || value;
    }
  } catch {}
  return value;
}

export function codexMediaDisplayUrl(value: string, mediaKind: CodexMediaKind) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const source = unwrapMediaProxyUrl(raw);
  const desktopUrl = toDesktopRemoteAssetUrl(source);
  if (desktopUrl) return desktopUrl;

  if (!/^https?:\/\//i.test(source)) return raw;
  if (mediaKind === "image") {
    return `/api/image-proxy?url=${encodeURIComponent(source)}`;
  }
  if (mediaKind === "video") {
    return `/api/video-proxy?url=${encodeURIComponent(source)}`;
  }
  return source;
}
