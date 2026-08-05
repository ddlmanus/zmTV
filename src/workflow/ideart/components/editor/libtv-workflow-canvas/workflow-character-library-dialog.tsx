"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from "lucide-react"

export type WorkflowCharacterLibraryItem = {
  id: string
  characterUuid: string
  name: string
  subtitle: string
  summaryText: string
  categoryCode: string
  categoryName: string
  gender: string
  ageGroup: string
  race: string
  era: string
  cultureRegion: string
  temperaments: string[]
  coverUrl: string
  fullBodyUrl: string
  faceCloseupUrl: string
  expressionGridUrl: string
  characterSheetUrl: string
  description: string
}

function withPreviewParams(url: string, width: number) {
  const cleanUrl = String(url || "").trim()
  if (!cleanUrl) return ""
  if (cleanUrl.includes("x-oss-process=")) return cleanUrl
  return `${cleanUrl}?x-oss-process=image/resize,w_${width},m_lfit/format,webp/ignore-error,1`
}

function uniqueUrls(urls: string[]) {
  return Array.from(new Set(urls.map((url) => String(url || "").trim()).filter(Boolean)))
}

type WorkflowCharacterLibraryTheme = "light" | "dark"

const CHARACTER_LIBRARY_THEME = {
  light: {
    panelBg: "#FFFFFF",
    panelBorder: "rgba(0,0,0,0.08)",
    previewContainerBg: "rgba(0,0,0,0.05)",
    text: "#262626",
    mutedText: "#A8A8A8",
    subtleText: "#8A8D91",
    descriptionText: "#525252",
    tagBg: "rgba(0,0,0,0.08)",
    cardBorder: "#C4C4C4",
    thumbBg: "#FFFFFF",
    selectedCardBg: "rgba(0,0,0,0.04)",
    arrowText: "#262626",
    arrowBorder: "rgba(0,0,0,0.08)",
    arrowHover: "hover:bg-[rgba(0,0,0,0.08)]",
    filterBg: "rgba(0,0,0,0.04)",
    filterHover: "hover:bg-[rgba(0,0,0,0.08)]",
    filterBorder: "#C4C4C4",
    applyBg: "#141414",
    applyText: "#FFFFFF",
    errorBg: "rgba(254, 226, 226, 0.96)",
    errorBorder: "rgba(185, 28, 28, 0.28)",
    errorText: "#991B1B",
    closeHover: "hover:bg-black/5",
    checkboxBorder: "rgba(0,0,0,0.15)",
    checkboxBg: "transparent",
    edgeGradientLeft: "linear-gradient(to right, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0) 100%)",
    edgeGradientRight: "linear-gradient(to left, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0) 100%)",
  },
  dark: {
    panelBg: "#222222",
    panelBorder: "rgba(255,255,255,0.08)",
    previewContainerBg: "rgba(255,255,255,0.05)",
    text: "#F5F5F5",
    mutedText: "#5F5F5F",
    subtleText: "#9A9A9A",
    descriptionText: "#9A9A9A",
    tagBg: "rgba(255,255,255,0.08)",
    cardBorder: "#3D3D3D",
    thumbBg: "#242424",
    selectedCardBg: "rgba(255,255,255,0.04)",
    arrowText: "#F5F5F5",
    arrowBorder: "rgba(255,255,255,0.08)",
    arrowHover: "hover:bg-[rgba(255,255,255,0.25)]",
    filterBg: "rgba(255,255,255,0.10)",
    filterHover: "hover:bg-[rgba(255,255,255,0.25)]",
    filterBorder: "rgba(255,255,255,0.08)",
    applyBg: "#FFFFFF",
    applyText: "#25272A",
    errorBg: "rgba(127, 29, 29, 0.78)",
    errorBorder: "rgba(248, 113, 113, 0.42)",
    errorText: "#FECACA",
    closeHover: "hover:bg-white/10",
    checkboxBorder: "rgba(255,255,255,0.25)",
    checkboxBg: "rgba(0,0,0,0.3)",
    edgeGradientLeft: "linear-gradient(to right, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 100%)",
    edgeGradientRight: "linear-gradient(to left, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0) 100%)",
  },
} as const

export function WorkflowCharacterLibraryDialog({
  open,
  theme,
  onClose,
  onApply,
}: {
  open: boolean
  theme: WorkflowCharacterLibraryTheme
  onClose: () => void
  onApply: (item: WorkflowCharacterLibraryItem) => void
}) {
  const [items, setItems] = useState<WorkflowCharacterLibraryItem[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const listRef = useRef<HTMLDivElement | null>(null)
  const palette = CHARACTER_LIBRARY_THEME[theme]

  useEffect(() => {
    if (!open) return
    let disposed = false
    setLoading(true)
    setError("")
    fetch("/api/libtv/character-library", {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        const json = await response.json().catch(() => null)
        if (!response.ok || !json?.success) {
          throw new Error(String(json?.error || "人物库加载失败"))
        }
        return Array.isArray(json.items) ? json.items : []
      })
      .then((nextItems) => {
        if (disposed) return
        setItems(nextItems)
        setSelectedId((current) => current || String(nextItems[0]?.id || ""))
      })
      .catch((err) => {
        if (disposed) return
        setError(err instanceof Error ? err.message : "人物库加载失败")
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, open])

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId]
  )

  const detailImages = useMemo(() => {
    if (!selectedItem) return []
    return [
      { key: "full", alt: "人物立绘", url: selectedItem.fullBodyUrl, aspect: 3 / 4 },
      { key: "face", alt: "脸部近景", url: selectedItem.faceCloseupUrl, aspect: 3 / 4 },
      { key: "expression", alt: "表情参考", url: selectedItem.expressionGridUrl, aspect: 3 / 4 },
      { key: "sheet", alt: "人物三视图", url: selectedItem.characterSheetUrl, aspect: 16 / 9 },
    ].filter((item) => String(item.url || "").trim())
  }, [selectedItem])

  const tagText = selectedItem
    ? uniqueUrls([
        selectedItem.categoryName,
        selectedItem.gender,
        selectedItem.era,
        selectedItem.ageGroup,
        ...(Array.isArray(selectedItem.temperaments) ? selectedItem.temperaments : []),
      ]).join(" ")
    : ""

  const scrollList = useCallback((direction: -1 | 1) => {
    const element = listRef.current
    if (!element) return
    element.scrollBy({ left: direction * 575, behavior: "smooth" })
  }, [])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl !rounded-2xl"
        style={{
          color: palette.text,
          fontFamily: '-apple-system, system-ui, "Segoe UI", "Helvetica Neue", Helvetica, Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
          lineHeight: 1.55,
          "--radius": "8px",
          "--radius-sm": "4px",
          "--radius-md": "6px",
          "--radius-lg": "8px",
          "--radius-xl": "12px",
          backgroundColor: palette.panelBg,
          border: "1px solid " + palette.panelBorder,
          backdropFilter: "none",
          boxShadow: "rgba(0, 0, 0, 0.28) 0px 24px 72px",
          width: "720px",
          maxWidth: "calc(100vw - 48px)",
          maxHeight: "calc(100vh - 120px)",
          height: "calc(100vh - 120px)",
        } as React.CSSProperties}
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <span className="text-[16px] font-semibold" style={{ color: palette.text }}>人物库</span>
          <button
            type="button"
            aria-label="close"
            className={theme === "light" ? "flex size-6 items-center justify-center rounded-lg transition-colors hover:bg-black/5" : "flex size-6 items-center justify-center rounded-lg transition-colors hover:bg-white/10"}
            style={{ color: palette.text }}
            onClick={onClose}
          >
            <X className="pointer-events-none size-3.5" strokeWidth={2} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-[13px]" style={{ color: palette.subtleText }}>人物库加载中...</div>
        ) : error ? (
          <div
            className="mx-4 mb-4 flex flex-1 items-center justify-center rounded-xl border px-4 text-[13px]"
            style={{ backgroundColor: palette.errorBg, borderColor: palette.errorBorder, color: palette.errorText }}
          >
            {error}
          </div>
        ) : selectedItem ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden rounded-xl p-4" style={{ backgroundColor: palette.previewContainerBg }}>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="shrink-0 text-[14px] font-semibold" style={{ color: palette.text }}>{selectedItem.name}</span>
                  <span
                    className="max-w-[min(420px,40vw)] truncate rounded-lg px-2 py-1 text-[12px]"
                    style={{ backgroundColor: palette.tagBg, color: palette.text, height: "24px" }}
                  >
                    {tagText}
                  </span>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-x-auto overflow-y-hidden" style={{ minHeight: "100px" }}>
                  <div className="flex h-full shrink-0 items-center justify-start" style={{ gap: "8px" }}>
                    {detailImages.map((image) => (
                      <div
                        key={image.key}
                        className="shrink-0 overflow-hidden rounded-lg bg-white"
                        style={{ height: "100%", aspectRatio: String(image.aspect), borderRadius: "var(--radius-lg)" }}
                      >
                        <img
                          alt={image.alt}
                          className="h-full w-full object-cover object-top"
                          draggable={false}
                          src={withPreviewParams(image.url, 1920)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4">
                  <p className="min-w-0 truncate text-[12px]" style={{ color: palette.descriptionText }}>
                    {selectedItem.description || `${selectedItem.name}，详见人物全身图、面部特写、表情参考与人物设定板。`}
                  </p>
                  <button
                    type="button"
                    className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-3 text-[13px] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: palette.applyBg, color: palette.applyText }}
                    onClick={() => onApply(selectedItem)}
                  >
                    <Plus className="pointer-events-none size-4" />
                    应用至画布
                  </button>
                </div>
              </div>
            </div>

            <div className="relative flex shrink-0 flex-col gap-4 pb-4">
              <div className="h-px w-full shrink-0" style={{ backgroundColor: palette.panelBorder }} />
              <div className="flex shrink-0 items-center justify-between px-4">
                <button
                  type="button"
                  aria-expanded="false"
                  className={theme === "light" ? "flex h-7 shrink-0 items-center gap-1 rounded-lg border-[0.5px] px-2 text-[13px] transition-colors hover:bg-[rgba(0,0,0,0.08)]" : "flex h-7 shrink-0 items-center gap-1 rounded-lg border-[0.5px] px-2 text-[13px] transition-colors hover:bg-[rgba(255,255,255,0.25)]"}
                  style={{ color: palette.text, borderColor: palette.filterBorder, backgroundColor: palette.filterBg }}
                >
                  人物筛选
                  <ChevronDown className="pointer-events-none size-4 shrink-0" />
                </button>
                <button type="button" role="checkbox" aria-checked="false" className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 py-2">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded border transition-colors" style={{ backgroundColor: palette.checkboxBg, borderColor: palette.checkboxBorder }} />
                  <span className="text-[12px] leading-normal" style={{ color: palette.text }}>最近使用</span>
                </button>
              </div>
              <div className="relative min-h-0">
                <div className="flex w-full items-center" style={{ height: "159px", gap: "12px", paddingLeft: "16px", paddingRight: "16px" }}>
                  <button
                    type="button"
                    aria-label="prev"
                    className={theme === "light" ? "flex size-7 shrink-0 items-center justify-center self-center rounded-lg border bg-transparent transition-colors hover:bg-[rgba(0,0,0,0.08)]" : "flex size-7 shrink-0 items-center justify-center self-center rounded-lg border bg-transparent transition-colors hover:bg-[rgba(255,255,255,0.25)]"}
                    style={{ color: palette.arrowText, borderColor: palette.arrowBorder }}
                    onClick={() => scrollList(-1)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <div className="relative min-w-0 flex-1 overflow-x-hidden" style={{ height: "159px" }}>
                    <div ref={listRef} className="scrollbar-hide flex h-full items-start overflow-x-auto" style={{ gap: "15px" }}>
                      {items.map((item) => {
                        const active = item.id === selectedItem.id
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="flex shrink-0 flex-col items-center rounded-[10px] transition-colors"
                            style={{
                              gap: "4px",
                              padding: "2px",
                              backgroundColor: active ? palette.selectedCardBg : "transparent",
                              boxShadow: active ? "inset 0 0 0 0.5px " + palette.cardBorder : "none",
                            }}
                            onClick={() => setSelectedId(item.id)}
                          >
                            <div
                              className="overflow-hidden rounded-lg transition-colors"
                              style={{
                                width: "100px",
                                height: "134px",
                                backgroundColor: palette.thumbBg,
                                borderStyle: "solid",
                                borderColor: active ? "transparent" : palette.cardBorder,
                                borderWidth: active ? "0px" : "0.5px",
                              }}
                            >
                              <img
                                alt={item.name}
                                className="size-full object-cover object-top"
                                draggable={false}
                                src={withPreviewParams(item.coverUrl, 284)}
                              />
                            </div>
                            <span
                              className={`w-full truncate text-center text-[12px] leading-[17px] ${active ? "font-medium" : "font-normal"}`}
                              style={{ color: active ? palette.text : palette.mutedText }}
                            >
                              {item.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="pointer-events-none absolute bottom-0 left-0 opacity-0 transition-opacity duration-200" style={{ width: "14px", height: "159px", backgroundImage: palette.edgeGradientLeft }} />
                    <div className="pointer-events-none absolute bottom-0 right-0 transition-opacity duration-200" style={{ width: "14px", height: "159px", backgroundImage: palette.edgeGradientRight }} />
                  </div>
                  <button
                    type="button"
                    aria-label="next"
                    className={theme === "light" ? "flex size-7 shrink-0 items-center justify-center self-center rounded-lg border bg-transparent transition-colors hover:bg-[rgba(0,0,0,0.08)]" : "flex size-7 shrink-0 items-center justify-center self-center rounded-lg border bg-transparent transition-colors hover:bg-[rgba(255,255,255,0.25)]"}
                    style={{ color: palette.arrowText, borderColor: palette.arrowBorder }}
                    onClick={() => scrollList(1)}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-[13px]" style={{ color: palette.subtleText }}>暂无人物</div>
        )}
      </div>
    </>,
    document.body
  )
}
