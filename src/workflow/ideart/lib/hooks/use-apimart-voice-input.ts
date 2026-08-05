"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type UseApimartVoiceInputOptions = {
  language?: string
  endpoint?: string
  onTranscript: (text: string) => void
  onStatus?: (status: string) => void
  onPermissionError?: () => void
}

function pickAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ]
  return candidates.find((item) => MediaRecorder.isTypeSupported(item)) || ""
}

export function useApimartVoiceInput({
  language,
  endpoint = "/api/chat/transcribe-audio",
  onTranscript,
  onStatus,
  onPermissionError,
}: UseApimartVoiceInputOptions) {
  const [active, setActive] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }, [])

  const transcribe = useCallback(async (blob: Blob) => {
    if (blob.size <= 0) {
      onStatus?.("没有录到声音，请再试一次")
      return
    }

    onStatus?.("正在转写...")
    const form = new FormData()
    const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("mpeg") ? "mp3" : "webm"
    form.append("audio", blob, `voice-input.${extension}`)
    if (language) form.append("locale", language)

    const response = await fetch(endpoint, {
      method: "POST",
      body: form,
      credentials: "include",
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(String(payload?.error || "语音转写失败"))
    }
    const text = String(payload?.text || "").trim()
    if (!text) {
      onStatus?.("没有识别到语音内容")
      return
    }
    onTranscript(text)
    onStatus?.("")
  }, [endpoint, language, onStatus, onTranscript])

  const stop = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) {
      setActive(false)
      cleanup()
      return
    }
    if (recorder.state !== "inactive") {
      recorder.stop()
    }
  }, [cleanup])

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onStatus?.("当前浏览器不支持录音，请使用 Chrome 或 Edge")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickAudioMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      streamRef.current = stream
      recorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        setActive(false)
        cleanup()
        onStatus?.("录音失败，请再试一次")
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" })
        setActive(false)
        cleanup()
        void transcribe(blob).catch((error) => {
          onStatus?.(error instanceof Error ? error.message : "语音转写失败，请再试一次")
        })
      }

      recorder.start()
      setActive(true)
      onStatus?.("录音中")
    } catch (error: any) {
      setActive(false)
      cleanup()
      const name = String(error?.name || "")
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        onPermissionError?.()
        onStatus?.("麦克风权限被拒绝，请在浏览器地址栏允许麦克风")
        return
      }
      onStatus?.("录音启动失败，请再试一次")
    }
  }, [cleanup, onPermissionError, onStatus, transcribe])

  const toggle = useCallback(() => {
    if (active) {
      stop()
      return
    }
    void start()
  }, [active, start, stop])

  useEffect(() => cleanup, [cleanup])

  return { active, toggle, stop, start }
}
