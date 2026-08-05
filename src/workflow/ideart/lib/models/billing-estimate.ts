const BILLING_AMOUNT_DECIMALS = 2

type BillingHints = {
  isFree?: boolean | string | number | null
  defaultResolution?: string | null
  defaultQuality?: string | null
  resolutionRates?: Record<string, unknown> | null
  qualityResolutionRates?: Record<string, Record<string, unknown> | unknown> | null
}

export type BillingModelLike = {
  cost?: unknown
  billing?: BillingHints | null
  parameters?: Record<string, unknown> & {
    billing?: BillingHints | null
  } | null
}

export function parseBillingNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value
  if (typeof value === "string") {
    const normalized = value.trim()
    if (!normalized) return null
    const direct = Number(normalized)
    if (Number.isFinite(direct) && direct >= 0) return direct
    const matched = normalized.match(/(\d+(?:\.\d+)?)/)
    if (!matched) return null
    const parsed = Number(matched[1])
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return null
}

export function parsePositiveBillingNumber(value: unknown): number | null {
  const parsed = parseBillingNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

export function parseBillingBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false
  }
  return null
}

export function roundBillingPoints(value: number, digits = BILLING_AMOUNT_DECIMALS): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function formatBillingPoints(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--"
  const rounded = roundBillingPoints(Math.max(0, value))
  const amount = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "")
  return `$${amount}`
}

export function normalizeBillingResolutionKey(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return ""
  if (normalized === "hd") return "720p"
  if (normalized === "fhd") return "1080p"
  if (normalized === "uhd") return "4k"
  if (normalized.includes("4k") || normalized.includes("4096") || normalized.includes("2160")) return "4k"
  if (normalized.includes("2k") || normalized.includes("2048")) return "2k"
  if (normalized.includes("1k") || normalized.includes("1024")) return "1k"
  if (normalized.includes("1080")) return "1080p"
  if (normalized.includes("720")) return "720p"
  if (normalized.includes("480")) return "480p"
  return normalized.replace(/\s+/g, "")
}

export function normalizeBillingQualityKey(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase()
  if (!normalized) return ""
  if (normalized === "低") return "low"
  if (normalized === "中") return "medium"
  if (normalized === "高") return "high"
  if (normalized === "standard") return "medium"
  return normalized.replace(/\s+/g, "")
}

export function getModelBilling(model: BillingModelLike | null | undefined): BillingHints {
  return (model?.billing && typeof model.billing === "object"
    ? model.billing
    : model?.parameters?.billing && typeof model.parameters.billing === "object"
      ? model.parameters.billing
      : {}) as BillingHints
}

export function isFreeBillingModel(model: BillingModelLike | null | undefined): boolean {
  return parseBillingBoolean(getModelBilling(model).isFree) ?? false
}

export function resolveResolutionBillingRate(
  billing: BillingHints,
  resolution?: unknown
): number | null {
  const rates = billing?.resolutionRates
  if (!rates || typeof rates !== "object") return null
  const normalizedResolution = normalizeBillingResolutionKey(resolution)
  const configured = Object.values(rates)
    .map((value) => parseBillingNumber(value))
    .filter((value): value is number => value !== null)
  if (!normalizedResolution && configured.length) return Math.max(...configured)

  const candidates = [
    normalizedResolution,
    normalizedResolution.toUpperCase(),
    String(resolution ?? "").trim(),
    String(resolution ?? "").trim().toLowerCase(),
    String(resolution ?? "").trim().toUpperCase(),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const value = parseBillingNumber(rates[candidate])
    if (value !== null) return value
  }

  const normalizedDefault = normalizeBillingResolutionKey(billing.defaultResolution)
  if (normalizedDefault) {
    const value = parseBillingNumber(rates[normalizedDefault])
      ?? parseBillingNumber(rates[normalizedDefault.toUpperCase()])
    if (value !== null) return value
  }

  const twoK = parseBillingNumber(rates["2k"]) ?? parseBillingNumber(rates["2K"])
  if (twoK !== null) return twoK

  return configured.length ? Math.max(...configured) : null
}

export function resolveQualityResolutionBillingRate(
  billing: BillingHints,
  resolution?: unknown,
  quality?: unknown
): number | null {
  const matrix = billing?.qualityResolutionRates
  if (!matrix || typeof matrix !== "object") return null

  const normalizedQuality = normalizeBillingQualityKey(quality) || normalizeBillingQualityKey(billing.defaultQuality)
  const normalizedResolution = normalizeBillingResolutionKey(resolution) || normalizeBillingResolutionKey(billing.defaultResolution)
  if (!normalizedQuality || !normalizedResolution) return null

  const qualityCandidates = [
    normalizedQuality,
    normalizedQuality.toUpperCase(),
    String(quality ?? "").trim(),
    String(quality ?? "").trim().toLowerCase(),
    String(quality ?? "").trim().toUpperCase(),
  ].filter(Boolean)
  const resolutionCandidates = [
    normalizedResolution,
    normalizedResolution.toUpperCase(),
    String(resolution ?? "").trim(),
    String(resolution ?? "").trim().toLowerCase(),
    String(resolution ?? "").trim().toUpperCase(),
  ].filter(Boolean)

  for (const qualityKey of qualityCandidates) {
    const rates = matrix[qualityKey]
    if (!rates || typeof rates !== "object") continue
    for (const resolutionKey of resolutionCandidates) {
      const value = parseBillingNumber((rates as Record<string, unknown>)[resolutionKey])
      if (value !== null) return value
    }
  }

  return null
}

export function estimateImageGenerationPoints(
  model: BillingModelLike | null | undefined,
  quantity?: unknown,
  resolution?: unknown,
  quality?: unknown
) {
  return estimateFixedGenerationPoints(model, quantity, resolution, quality)
}

export function estimateFixedGenerationPoints(
  model: BillingModelLike | null | undefined,
  quantity?: unknown,
  resolution?: unknown,
  quality?: unknown
) {
  const billing = getModelBilling(model)
  const normalizedQuantity = normalizeBillingQuantity(quantity)
  const unitPoints = isFreeBillingModel(model)
    ? 0
    : resolveQualityResolutionBillingRate(billing, resolution, quality)
      ?? resolveResolutionBillingRate(billing, resolution)
      ?? Math.max(0, Number(model?.cost || 0))
  return {
    unitPoints: roundBillingPoints(unitPoints, 6),
    quantity: normalizedQuantity,
    totalPoints: roundBillingPoints(unitPoints * normalizedQuantity),
  }
}

export function normalizeBillingQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.max(1, Math.floor(value))
  if (typeof value === "string") {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.floor(parsed))
  }
  return 1
}
