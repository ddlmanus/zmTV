import { ImageOff } from "lucide-react";
import { useEffect, useMemo, useState, type ImgHTMLAttributes } from "react";
import { codexMediaDisplayUrl } from "./codex-media-url";

type CodexMediaImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError"
> & {
  source: string;
  fallbackClassName?: string;
};

const DESKTOP_REMOTE_PREFIX = "local-asset://remote/";

function unwrapImageSource(value: string) {
  const source = String(value || "").trim();
  if (source.startsWith(DESKTOP_REMOTE_PREFIX)) {
    try {
      return decodeURIComponent(source.slice(DESKTOP_REMOTE_PREFIX.length));
    } catch {
      return source;
    }
  }
  try {
    const parsed = new URL(
      source,
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost",
    );
    if (parsed.pathname === "/api/image-proxy") {
      return String(parsed.searchParams.get("url") || "").trim() || source;
    }
  } catch {}
  return source;
}

function imageCandidates(source: string) {
  const raw = String(source || "").trim();
  if (!raw) return [];
  const publicSource = unwrapImageSource(raw);
  const candidates = [
    raw,
    publicSource,
    codexMediaDisplayUrl(publicSource, "image"),
  ];
  if (/^https?:\/\//i.test(publicSource)) {
    candidates.push(`/api/image-proxy?url=${encodeURIComponent(publicSource)}`);
  }
  return candidates.filter(
    (candidate, index, list) =>
      Boolean(candidate) && list.indexOf(candidate) === index,
  );
}

export function CodexMediaImage({
  source,
  alt = "图片",
  fallbackClassName = "",
  onLoad,
  ...props
}: CodexMediaImageProps) {
  const candidates = useMemo(() => imageCandidates(source), [source]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => setCandidateIndex(0), [source]);

  const currentSource = candidates[candidateIndex];
  if (!currentSource) {
    return (
      <span
        role="img"
        aria-label={`${alt}加载失败`}
        className={`flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 bg-[var(--color-token-bg-tertiary)] px-3 py-4 text-center text-[11px] text-[var(--color-token-description-foreground)] ${fallbackClassName}`}
      >
        <ImageOff className="h-5 w-5" />
        <span>图片加载失败</span>
      </span>
    );
  }

  return (
    <img
      {...props}
      src={currentSource}
      alt={alt}
      onLoad={onLoad}
      onError={() => setCandidateIndex((index) => index + 1)}
    />
  );
}
