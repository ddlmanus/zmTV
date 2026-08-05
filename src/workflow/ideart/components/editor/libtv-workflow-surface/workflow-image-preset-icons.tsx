"use client"

type WorkflowImagePresetGlyphProps = {
  presetId: string
  className?: string
}

const sharedSvgProps = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.55,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
}

export function WorkflowImagePresetGlyph({ presetId, className = "size-4" }: WorkflowImagePresetGlyphProps) {
  if (presetId === "portrait_texture_adjustment") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <path d="M4.2 15.8c.7-2.7 2.8-4.2 5.8-4.2s5.1 1.5 5.8 4.2" />
        <circle cx="10" cy="7" r="3.1" />
        <path d="M3 4.2h2.4M4.2 3v2.4M14.8 4.3h2.2M15.9 3.2v2.2" />
      </svg>
    )
  }

  if (presetId === "blocking-storyboard") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <rect x="2.5" y="3" width="15" height="14" rx="2" />
        <path d="M5.5 6.5h4M5.5 10h3M5.5 13.5h5" />
        <path d="m11 12 3.8-3.8M12.5 7.9h2.6v2.6" />
      </svg>
    )
  }

  if (presetId === "storyboard-sequence") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <path d="M4.2 3.2v13.6" />
        <circle cx="4.2" cy="5" r="1" />
        <circle cx="4.2" cy="10" r="1" />
        <circle cx="4.2" cy="15" r="1" />
        <rect x="7.2" y="3.4" width="9" height="3.2" rx="1" />
        <rect x="7.2" y="8.4" width="7" height="3.2" rx="1" />
        <rect x="7.2" y="13.4" width="8" height="3.2" rx="1" />
      </svg>
    )
  }

  if (presetId === "story-twenty-five-grid") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
        <path d="M7.5 2.5v15M12.5 2.5v15M2.5 7.5h15M2.5 12.5h15" opacity=".68" />
        <path d="m4.6 14.8 3.2-3.1 3 1.1 4.2-4.1M13.1 8.6H15v1.9" />
      </svg>
    )
  }

  if (presetId === "story-four-grid") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <rect x="2.5" y="2.5" width="15" height="15" rx="2" />
        <path d="M10 2.5v15M2.5 10h15" />
        <path d="m5 7 2-2 2 2M11 13l2 2 2-2" />
      </svg>
    )
  }

  if (presetId === "evolve-3-seconds-later" || presetId === "evolve-5-seconds-before") {
    const forward = presetId === "evolve-3-seconds-later"
    return (
      <svg {...sharedSvgProps} className={className}>
        <circle cx="10" cy="10" r="6.4" />
        <path d="M10 6.2v4.1l2.8 1.6" />
        {forward ? (
          <path d="M13.8 3.8h3v3M16.8 3.8l-2.1 2.1" />
        ) : (
          <path d="M6.2 3.8h-3v3M3.2 3.8l2.1 2.1" />
        )}
      </svg>
    )
  }

  if (presetId === "cinematic-lighting") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <circle cx="10" cy="10" r="4" />
        <path d="M10 6a4 4 0 0 0 0 8V6Z" fill="currentColor" stroke="none" opacity=".28" />
        <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4" />
      </svg>
    )
  }

  if (presetId === "panorama-720") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <ellipse cx="10" cy="10" rx="7.2" ry="4.4" />
        <path d="M2.8 10h14.4M10 5.6c1.5 1.3 2.3 2.7 2.3 4.4s-.8 3.1-2.3 4.4M10 5.6C8.5 6.9 7.7 8.3 7.7 10s.8 3.1 2.3 4.4" />
        <path d="m4.2 6.2-1.6.2.3 1.6M15.8 13.8l1.6-.2-.3-1.6" />
      </svg>
    )
  }

  if (presetId === "multi-angle-nine-grid") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <circle cx="10" cy="10" r="2.3" />
        <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
        <path d="M5.5 5.5 8.3 8.3M14.5 5.5l-2.8 2.8M14.5 14.5l-2.8-2.8M5.5 14.5l2.8-2.8" />
      </svg>
    )
  }

  if (presetId === "face-three-view") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <path d="M2.5 15.8c.3-2 1.4-3.2 3-3.8-1.1-.9-1.7-2.3-1.7-4 0-2.2 1.1-3.8 2.8-3.8S9.4 5.8 9.4 8c0 1.7-.6 3.1-1.7 4 1.5.6 2.6 1.8 3 3.8" />
        <path d="M11.3 4.7c1.9.1 3.2 1.3 3.2 3.3 0 1.5-.7 2.7-1.9 3.4 1.8.7 2.9 2.1 3.1 4.4M14.5 8.1h1.6" />
      </svg>
    )
  }

  if (presetId === "character-design-sheet") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <circle cx="7" cy="6.2" r="2.3" />
        <path d="M2.8 15.8c.5-3 1.9-4.8 4.2-4.8s3.7 1.8 4.2 4.8" />
        <rect x="13" y="4" width="4" height="2.3" rx=".7" />
        <rect x="13" y="8.8" width="4" height="2.3" rx=".7" />
        <rect x="13" y="13.6" width="4" height="2.3" rx=".7" />
      </svg>
    )
  }

  if (presetId === "character-three-view") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <circle cx="4" cy="5" r="1.5" />
        <circle cx="10" cy="5" r="1.5" />
        <circle cx="16" cy="5" r="1.5" />
        <path d="M4 6.5v5.3M2.3 9h3.4M4 11.8l-1.5 4M4 11.8l1.5 4" />
        <path d="M10 6.5v5.3M8.8 9h2.4M10 11.8l-.8 4M10 11.8l.8 4" />
        <path d="M16 6.5v5.3M14.4 9H16M16 11.8l-1.3 4M16 11.8l1.2 4" />
      </svg>
    )
  }

  if (presetId === "scene-design-sheet") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <rect x="2.5" y="3" width="15" height="14" rx="2" />
        <path d="m4.5 13 3.4-3.5 2.4 2.2 2.2-2.4 3 3.7" />
        <circle cx="13.8" cy="6.6" r="1.2" />
        <path d="M5 5.8h4M5 16.8v-2.4M15 16.8v-2.4" />
      </svg>
    )
  }

  if (presetId === "product-design-sheet") {
    return (
      <svg {...sharedSvgProps} className={className}>
        <path d="m10 2.5 6.2 3.2v8.5L10 17.5l-6.2-3.3V5.7L10 2.5Z" />
        <path d="m3.8 5.7 6.2 3.2 6.2-3.2M10 8.9v8.6" />
        <path d="m7 4 6.2 3.2v3.2" opacity=".65" />
      </svg>
    )
  }

  return (
    <svg {...sharedSvgProps} className={className}>
      <path d="M10 2.8 11.6 7l4.3 1.4-3.5 2.6.1 4.5-3.7-2.4-4.2 1.5L5.8 10 3 6.6l4.5-.3L10 2.8Z" />
    </svg>
  )
}
