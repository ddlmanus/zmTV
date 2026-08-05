export const parseDurationSeconds = (value: unknown): number => {
    if (value === null || value === undefined) return 0

    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(0, Math.round(value))
    }

    if (typeof value === "string") {
        const cleaned = value.trim().toLowerCase().replace(/s$/, "")
        const parsed = Number(cleaned)
        if (Number.isFinite(parsed)) {
            return Math.max(0, Math.round(parsed))
        }
    }

    return 0
}

export const formatDuration = (value: unknown): string => {
    const totalSeconds = parseDurationSeconds(value)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
