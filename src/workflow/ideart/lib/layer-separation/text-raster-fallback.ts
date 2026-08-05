import type { CanvasLayer, CanvasTextRasterFallback } from '@/workflow/ideart/lib/store/canvas-store'

const finite = (value: unknown, fallback: number): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const positive = (value: unknown, fallback: number): number => (
  Math.max(1, finite(value, fallback))
)

const fallbackUrlOf = (layer: CanvasLayer): string => String(
  layer.textRasterFallback?.imageUrl
  || layer.layerSeparation?.rasterFallback?.imageUrl
  || '',
).trim()

const isLegacyRasterFallbackLayer = (layer: CanvasLayer): boolean => (
  layer.type === 'image'
  && layer.subtype === 'layer-separation-text-raster-fallback'
  && Boolean(String(layer.src || '').trim())
)

const sameOptionalParent = (left: CanvasLayer, right: CanvasLayer): boolean => (
  String(left.parentId || '') === String(right.parentId || '')
)

const findLegacyFallback = (
  textLayer: CanvasLayer,
  candidates: CanvasLayer[],
  claimedIds: Set<string>,
): CanvasLayer | undefined => {
  const expectedUrl = fallbackUrlOf(textLayer)
  const artifactId = String(textLayer.layerSeparation?.artifactId || '').trim()
  const eligible = candidates.filter((candidate) => (
    !claimedIds.has(candidate.id)
    && sameOptionalParent(textLayer, candidate)
  ))

  if (expectedUrl) {
    const urlMatch = eligible.find((candidate) => String(candidate.src || '').trim() === expectedUrl)
    if (urlMatch) return urlMatch
  }

  if (artifactId) {
    const artifactMatches = eligible.filter((candidate) => (
      String(candidate.layerSeparation?.artifactId || '').trim() === artifactId
    ))
    if (artifactMatches.length === 1) return artifactMatches[0]
  }

  return undefined
}

/**
 * Migrates the old raster-image + hidden-text twin representation into one
 * logical text layer. Pairing requires an exact fallback URL or a unique
 * artifact id under the same parent, so unrelated user image layers are never
 * consumed. The operation is idempotent.
 */
export const collapseLegacyTextRasterFallbackLayers = (input: CanvasLayer[]): CanvasLayer[] => {
  const layers = Array.isArray(input) ? input : []
  const legacyFallbacks = layers.filter(isLegacyRasterFallbackLayer)
  if (legacyFallbacks.length === 0) return layers

  const claimedIds = new Set<string>()
  const replacements = new Map<string, CanvasLayer>()

  for (const layer of layers) {
    if (
      layer.type !== 'text'
      || layer.subtype !== 'layer-separation-text'
      || layer.textRasterFallback
    ) continue

    const legacy = findLegacyFallback(layer, legacyFallbacks, claimedIds)
    if (!legacy) continue

    const imageUrl = String(legacy.src || fallbackUrlOf(layer)).trim()
    if (!imageUrl) continue

    claimedIds.add(legacy.id)
    const fallback: CanvasTextRasterFallback = {
      imageUrl,
      x: finite(legacy.x, finite(layer.x, 0)),
      y: finite(legacy.y, finite(layer.y, 0)),
      width: positive(legacy.width, positive(layer.width, 1)),
      height: positive(legacy.height, positive(layer.height, finite(layer.fontSize, 16))),
      active: legacy.visible !== false,
    }
    replacements.set(layer.id, {
      ...layer,
      visible: legacy.visible !== false || layer.visible !== false,
      name: String(layer.name || '').replace(/^可编辑文字/, '文字') || '文字',
      textRasterFallback: fallback,
    })
  }

  if (claimedIds.size === 0) return layers

  return layers
    .filter((layer) => !claimedIds.has(layer.id))
    .map((layer) => {
      const replacement = replacements.get(layer.id)
      const current = replacement || layer
      if (current.type !== 'group' || !Array.isArray(current.children)) return current
      return {
        ...current,
        children: current.children.filter((childId) => !claimedIds.has(childId)),
      }
    })
}

const FALLBACK_INVALIDATING_FIELDS = new Set<keyof CanvasLayer>([
  'text',
  'fontSize',
  'fontFamily',
  'fontFamilyLabel',
  'fontPostscriptName',
  'fontUrl',
  'fontWeight',
  'fontStyle',
  'textDecoration',
  'textAlign',
  'letterSpacing',
  'lineHeight',
  'width',
  'height',
  'rotation',
  'scaleX',
  'scaleY',
  'opacity',
  'fill',
  'fillType',
  'fillGradientType',
  'fillGradientStops',
  'fillGradientStart',
  'fillGradientEnd',
  'stroke',
  'strokeWidth',
  'effects',
])

/** Disable a stale pixel preview as soon as editable text presentation changes. */
export const withInvalidatedTextRasterFallback = (
  layer: CanvasLayer,
  attrs: Partial<CanvasLayer>,
): Partial<CanvasLayer> => {
  if (layer.type !== 'text') return attrs
  const existingFallback = layer.textRasterFallback
  if (!existingFallback && !attrs.textRasterFallback) return attrs

  let fallback = attrs.textRasterFallback || existingFallback as CanvasTextRasterFallback
  if (!attrs.textRasterFallback && existingFallback) {
    const nextX = Number(attrs.x)
    const nextY = Number(attrs.y)
    const deltaX = Number.isFinite(nextX) ? nextX - finite(layer.x, 0) : 0
    const deltaY = Number.isFinite(nextY) ? nextY - finite(layer.y, 0) : 0
    if (deltaX || deltaY) {
      fallback = {
        ...existingFallback,
        x: existingFallback.x + deltaX,
        y: existingFallback.y + deltaY,
      }
    }
  }

  const invalidates = Object.keys(attrs).some((key) => (
    FALLBACK_INVALIDATING_FIELDS.has(key as keyof CanvasLayer)
  ))
  if (!invalidates) {
    return fallback === existingFallback ? attrs : { ...attrs, textRasterFallback: fallback }
  }

  if (fallback.active === false || attrs.textRasterFallback?.active === false) {
    return fallback === attrs.textRasterFallback ? attrs : { ...attrs, textRasterFallback: fallback }
  }

  return {
    ...attrs,
    textRasterFallback: { ...fallback, active: false },
  }
}
