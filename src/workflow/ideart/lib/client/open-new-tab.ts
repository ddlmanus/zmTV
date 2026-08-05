"use client"

export function openNewTab(url: string) {
  if (typeof window === "undefined") return null
  const popup = window.open(url, "_blank", "noopener,noreferrer")
  if (popup) {
    try {
      popup.opener = null
    } catch {
      // Some browsers disallow touching opener when noopener is honored.
    }
  }
  return popup
}
