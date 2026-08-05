const BILLING_AMOUNT_DECIMALS = 2;

type BillingHints = {
  isFree?: boolean | string | number | null;
  billingMode?: string | null;
  mode?: string | null;
  chargeMode?: string | null;
  resolutionRates?: Record<string, unknown> | null;
};

type VideoBillingModelLike = {
  cost?: unknown;
  videoCost?: unknown;
  unitCost?: unknown;
  billing?: BillingHints | null;
  parameters?:
    | (Record<string, unknown> & {
        billing?: BillingHints | null;
      })
    | null;
};

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized.replace(/[^0-9.]+/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function parseBooleanFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return null;
}

function roundBillingAmount(
  value: number,
  digits = BILLING_AMOUNT_DECIMALS,
): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.floor(parsed));
    }
  }
  return 1;
}

function normalizeResolutionKey(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  if (normalized === "hd") return "720p";
  if (normalized === "fhd") return "1080p";
  if (normalized === "uhd") return "4k";
  if (/^\d{3,4}$/.test(normalized)) return `${normalized}p`;
  return normalized;
}

function resolveResolutionRate(
  billing: BillingHints,
  resolution?: unknown,
): number | null {
  const normalizedResolution = normalizeResolutionKey(resolution);
  const rates = billing?.resolutionRates;
  if (!rates || typeof rates !== "object") return null;
  const configured = Object.values(rates)
    .map((value) => parsePositiveNumber(value))
    .filter((value): value is number => value !== null);
  if (!normalizedResolution)
    return configured.length ? Math.max(...configured) : null;
  const exact = (rates as Record<string, unknown>)[normalizedResolution];
  const exactRate = parsePositiveNumber(exact);
  if (exactRate) return exactRate;
  const upper = (rates as Record<string, unknown>)[
    normalizedResolution.toUpperCase()
  ];
  return (
    parsePositiveNumber(upper) ??
    (configured.length ? Math.max(...configured) : null)
  );
}

export function estimateVideoGenerationPoints(
  model: VideoBillingModelLike | null | undefined,
  durationSeconds?: unknown,
  quantity?: unknown,
  resolution?: unknown,
) {
  const billing = (
    model?.billing && typeof model.billing === "object"
      ? model.billing
      : model?.parameters?.billing &&
          typeof model.parameters.billing === "object"
        ? model.parameters.billing
        : {}
  ) as BillingHints;

  const isFree = parseBooleanFlag(billing.isFree) ?? false;
  const billingMode = String(
    billing.billingMode || billing.mode || billing.chargeMode || "",
  )
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  const isFixedBillingMode = [
    "fixed",
    "flat",
    "per_generation",
    "per_request",
    "per_task",
    "per_job",
  ].includes(billingMode);
  const hasResolutionRates = Boolean(
    billing.resolutionRates &&
    typeof billing.resolutionRates === "object" &&
    Object.keys(billing.resolutionRates).length > 0,
  );
  const legacyPointsPerSecond =
    parsePositiveNumber(model?.videoCost) ??
    parsePositiveNumber(model?.unitCost) ??
    parsePositiveNumber(model?.cost) ??
    0;
  const basePrice = isFree
    ? 0
    : (resolveResolutionRate(billing, resolution) ?? legacyPointsPerSecond);
  const billableSeconds = parsePositiveNumber(durationSeconds) ?? 0;
  const normalizedQuantity = normalizeQuantity(quantity);
  const durationMultiplier =
    !isFixedBillingMode &&
    (hasResolutionRates || billingMode.includes("second"))
      ? Math.max(1, billableSeconds)
      : 1;
  const totalPoints = roundBillingAmount(
    Math.max(0, basePrice * durationMultiplier * normalizedQuantity),
  );

  return {
    pointsPerSecond: roundBillingAmount(basePrice, 6),
    billableSeconds: roundBillingAmount(billableSeconds, 4),
    quantity: normalizedQuantity,
    totalPoints,
  };
}

export function formatEstimatedVideoPoints(value: number): string {
  const rounded = roundBillingAmount(Math.max(0, value));
  const amount = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "");
  return `$${amount}`;
}
