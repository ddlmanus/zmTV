"use client"

type ColorfulLoaderProps = {
  className?: string
  thickness?: number
  "aria-label"?: string
}

export function ColorfulLoader({
  className = "size-4",
  thickness = 3,
  "aria-label": ariaLabel,
}: ColorfulLoaderProps) {
  const mask = `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${Math.max(1, thickness - 1)}px))`

  return (
    <span
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={`inline-flex shrink-0 animate-spin rounded-full ${className}`}
      style={{
        background: "conic-gradient(from 90deg, #00E0FF 0deg, #3B82F6 82deg, #8B5CF6 168deg, #FF50B8 252deg, #FFD666 324deg, #00E0FF 360deg)",
        WebkitMask: mask,
        mask,
      }}
    />
  )
}
