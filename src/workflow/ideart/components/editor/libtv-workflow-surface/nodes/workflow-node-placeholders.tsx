"use client"

import { WorldNodeIcon } from "./workflow-node-icons"

export function WorkflowImageLoadingSweep({ label = "重绘中" }: { label?: string } = {}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-2xl bg-black/18">
      <div className="absolute inset-0 bg-white/[0.04]" />
      <div className="workflow-image-loading-sweep absolute inset-y-[-18%] left-[-42%] w-[34%] rotate-12 animate-[workflow-image-sweep_1.45s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/55 to-transparent blur-[10px]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rounded-full border border-white/15 bg-black/35 px-3 py-1.5 text-[12px] font-medium text-white/82 shadow-[0_10px_30px_rgba(0,0,0,0.32)] backdrop-blur-md">
          {label}
        </div>
      </div>
    </div>
  )
}

export function WorkflowImageGenerationPlaceholder({ progress, label = "生成中" }: { progress: number; label?: string }) {
  const percent = Math.max(0, Math.min(99, Math.round(progress * 100)))
  const text = String(label || "生成中").trim()
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[#303030]">
      <div className="inline-flex h-[38px] items-center justify-center overflow-hidden rounded-[8px] border border-white/24 bg-[#262626]/72 px-4 text-[14px] leading-none text-white/90 shadow-[0_8px_20px_rgba(0,0,0,0.20)] backdrop-blur-md">
        <span className="font-semibold">{text} {percent}%...</span>
      </div>
    </div>
  )
}

export function WorkflowVideoGenerationPlaceholder({
  title,
  progress,
  variant = "solid",
}: {
  title: string
  progress?: number
  variant?: "solid" | "overlay"
}) {
  const hasProgress = Number.isFinite(Number(progress))
  const percent = hasProgress ? Math.max(1, Math.min(99, Math.round(Number(progress) * 100))) : 0
  const rawLabel = title.trim() || "视频生成中"
  const label = rawLabel === "生成中" ? "视频生成中" : rawLabel.replace(/(\s*\d+%?)?\.{0,3}$/i, "").trim() || "视频生成中"
  const overlay = variant === "overlay"
  return (
    <div className={`pointer-events-none absolute inset-0 z-30 overflow-hidden rounded-2xl ${overlay ? "bg-black/28" : "bg-[#262626]"}`}>
      {overlay ? (
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/10 to-black/20" />
      ) : (
        <>
          <div className="absolute inset-0 bg-[#262626]" />
        </>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="flex h-8 items-center justify-center rounded-lg px-4 py-2"
          style={{
            backdropFilter: "blur(16px)",
            background: "rgba(0,0,0,0.45)",
            border: "0.5px solid rgba(196,196,196,0.6)",
          }}
        >
          <span className="whitespace-nowrap text-sm font-medium text-white">
            {hasProgress ? `${label} ${percent}%...` : `${label}...`}
          </span>
        </div>
      </div>
    </div>
  )
}

export function WorkflowAudioGenerationPlaceholder({ title, progress }: { title: string; progress?: number }) {
  const normalized = Number.isFinite(Number(progress)) ? Math.max(0.03, Math.min(0.99, Number(progress))) : undefined
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#101010] text-white">
      <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.12),transparent_38%)]" />
      <div className="relative flex h-16 items-end gap-1.5">
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className="w-1.5 animate-pulse rounded-full bg-white/64"
            style={{
              height: `${18 + ((index * 17) % 34)}px`,
              animationDelay: `${index * 90}ms`,
            }}
          />
        ))}
      </div>
      <div className="relative flex flex-col items-center gap-1 text-center">
        <span className="text-sm font-medium text-white/82">{title || "音频生成中..."}</span>
        {typeof normalized === "number" ? (
          <span className="text-xs text-white/45">{Math.round(normalized * 100)}%</span>
        ) : (
          <span className="text-xs text-white/45">正在等待音频结果</span>
        )}
      </div>
    </div>
  )
}

export function WorkflowThreeDGenerationPlaceholder({ progress }: { progress?: number }) {
  const normalized = Number.isFinite(Number(progress)) ? Math.max(0.03, Math.min(0.99, Number(progress))) : 0.04
  const totalSeconds = 600
  const remainingSeconds = Math.max(1, Math.round((1 - normalized) * totalSeconds))
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const remainingLabel = `${minutes}:${String(seconds).padStart(2, "0")}`
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#050505]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),transparent_48%)]" />
      <WorldNodeIcon className="relative z-10 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]" size={48} />
      <span className="relative z-10 flex flex-col items-center text-center text-[12px] leading-tight text-white/70 tabular-nums select-none">
        <span>预计还需 {remainingLabel}</span>
      </span>
    </div>
  )
}
