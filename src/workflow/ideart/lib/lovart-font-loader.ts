const loadedFontFamilies = new Set<string>()
const pendingFontFamilies = new Map<string, Promise<boolean>>()
const loadedFontUrls = new Set<string>()
const pendingFontUrls = new Map<string, Promise<boolean>>()

const CUSTOM_FONT_URLS: Record<string, { url: string; format: string }> = {
  "Bob Bold": { url: "https://web-static3.lovart.ai/shakker_font/Dob-Bold.ttf", format: "truetype" },
  IMAGICA: { url: "https://web-static3.lovart.ai/shakker_font/Imagica.ttf", format: "truetype" },
}

const FONT_PRIMARY_FAMILY_MAP: Record<string, string> = {
  Inter: "Inter",
  "Anonymous Pro": "Anonymous Pro",
  "Crimson Text": "Crimson Text",
  "Albert Sans": "Albert Sans",
  Roboto: "Roboto",
  "Roboto Mono": "Roboto Mono",
  "Source Serif Pro": "Source Serif Pro",
  Pacifico: "Pacifico",
  FuturistStencil: "FuturistStencil",
  "Krona One": "Krona One",
  IMAGICA: "IMAGICA",
  "Oleo Script": "Oleo Script",
  Lemon: "Lemon",
  "Bob Bold": "Dob Bold",
  Shrikhand: "Shrikhand",
  "D-DIN": "D-DIN",
  "D-DIN Condensed": "D-DIN Condensed",
  "D-DIN Exp": "D-DIN Exp",
  "Lack Line": "Lack Line",
  Lack: "Lack",
}

const FONT_SECONDARY_FAMILY_MAP: Record<string, string> = {
  "Source Serif Pro": "Source Serif 4",
  FuturistStencil: "Black Ops One",
  IMAGICA: "Bungee",
  "Bob Bold": "Black Ops One",
  "D-DIN": "Barlow Condensed",
  "D-DIN Condensed": "Barlow Condensed",
  "D-DIN Exp": "Barlow Condensed",
  "Lack Line": "Monoton",
  Lack: "Monoton",
}

const normalizeFontFamily = (fontFamily: string) => String(fontFamily || "").trim().replace(/^["']|["']$/g, "")

const quoteCssFamily = (fontFamily: string) => `"${String(fontFamily).replace(/"/g, '\\"')}"`

export const resolveLovartRenderableFontFamilies = (fontFamily: string) => {
  const family = normalizeFontFamily(fontFamily)
  if (!family) return []
  const primary = FONT_PRIMARY_FAMILY_MAP[family] || family
  const secondary = FONT_SECONDARY_FAMILY_MAP[family]
  return Array.from(new Set([primary, secondary].filter(Boolean)))
}

export const buildLovartRenderFontFamily = (fontFamily: string) => {
  const families = resolveLovartRenderableFontFamilies(fontFamily)
  const cssFamilies = families.map(quoteCssFamily)
  cssFamilies.push('"PingFang SC"', '"Microsoft YaHei"', 'sans-serif')
  return cssFamilies.join(", ")
}

export const resolveLovartLayerSeparationFontName = (
  fontFamily: string,
  text: string,
  fontSize: number,
  fontWeight?: number | string,
) => {
  const family = normalizeFontFamily(fontFamily) || "Inter"
  const normalized = family.replace(/\s+/g, "").toLowerCase()
  const weight = Number(fontWeight)
  const isBodyText = String(text || "").includes("\n") || String(text || "").length > 8
  const isSmallRegularText = Number(fontSize) > 0
    && Number(fontSize) <= 20
    && (!Number.isFinite(weight) || weight < 600)
  if (normalized === "museomoderno" && isBodyText && isSmallRegularText) {
    return "D-DIN Condensed"
  }
  return family
}

const loadFontFace = async (fontFamily: string, url: string, format: string) => {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return false
  const face = new FontFace(fontFamily, `url(${JSON.stringify(url)})${format ? ` format("${format}")` : ""}`)
  const loadedFace = await face.load()
  document.fonts.add(loadedFace)
  return loadedFace.status === "loaded"
}

/** Loads an exact provider-supplied font asset instead of accepting a CSS
 * fallback as proof that the detected family is available. */
export const ensureLovartFontUrlLoaded = async (fontFamily: string, fontUrl: string) => {
  const family = normalizeFontFamily(fontFamily)
  const url = String(fontUrl || "").trim()
  if (!family || !url || typeof document === "undefined" || typeof FontFace === "undefined") return false

  const cacheKey = `${family}\u0000${url}`
  if (loadedFontUrls.has(cacheKey)) return true
  const pending = pendingFontUrls.get(cacheKey)
  if (pending) return pending

  const promise = (async () => {
    try {
      const ok = await loadFontFace(family, url, "")
      if (ok) {
        loadedFontUrls.add(cacheKey)
        loadedFontFamilies.add(family)
      }
      return ok
    } catch {
      return false
    }
  })().finally(() => {
    pendingFontUrls.delete(cacheKey)
  })

  pendingFontUrls.set(cacheKey, promise)
  return promise
}

const loadGoogleFontCss = async (fontFamily: string) => {
  if (typeof document === "undefined") return false
  const id = `lovart-font-${fontFamily.replace(/[^a-z0-9_-]+/gi, "-")}`
  if (!document.getElementById(id)) {
    const link = document.createElement("link")
    link.id = id
    link.rel = "stylesheet"
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily).replace(/%20/g, "+")}:ital,wght@0,100..900;1,100..900&display=swap`
    document.head.appendChild(link)
  }
  if (typeof document.fonts?.load !== "function") return false
  try {
    await document.fonts.load(`16px "${fontFamily}"`)
    return document.fonts.check(`16px "${fontFamily}"`)
  } catch {
    return false
  }
}

export const ensureLovartFontLoaded = async (fontFamily: string) => {
  const family = normalizeFontFamily(fontFamily)
  if (!family || typeof document === "undefined") return false
  const families = resolveLovartRenderableFontFamilies(family)
  const cacheKey = [family, ...families].join("|")
  if (families.some((candidate) => loadedFontFamilies.has(candidate))) return true
  const pending = pendingFontFamilies.get(cacheKey)
  if (pending) return pending

  const promise = (async () => {
    for (const candidate of families) {
      try {
        if (document.fonts?.check?.(`16px "${candidate}"`)) {
          loadedFontFamilies.add(candidate)
          return true
        }
      } catch {
        // continue with explicit loading
      }
    }

    const primary = families[0] || family
    const custom = CUSTOM_FONT_URLS[family]
    if (custom) {
      try {
        const ok = await loadFontFace(primary, custom.url, custom.format)
        if (ok) {
          loadedFontFamilies.add(primary)
          return true
        }
      } catch {
        // fall through to secondary/web fonts
      }
    }

    for (const candidate of families) {
      try {
        const ok = await loadGoogleFontCss(candidate)
        if (ok) {
          loadedFontFamilies.add(candidate)
          return true
        }
      } catch {
        // try next candidate
      }
    }
    return false
  })().finally(() => {
    pendingFontFamilies.delete(cacheKey)
  })

  pendingFontFamilies.set(cacheKey, promise)
  return promise
}
