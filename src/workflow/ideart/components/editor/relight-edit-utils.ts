"use client"

export type RelightViewMode = "perspective" | "front"
export type RelightDirection = "left" | "top" | "right" | "front" | "bottom" | "back"

export type RelightControls = {
  viewMode: RelightViewMode
  brightness: number
  colorTemperature: number
  mainLightDirection: RelightDirection
  rimLight: boolean
  lightPosition: {
    x: number
    y: number
    z: number
  }
}

export const RELIGHT_RUN_CREDITS = 20
export const RELIGHT_BRIGHTNESS_MIN = 10
export const RELIGHT_BRIGHTNESS_MAX = 100
export const RELIGHT_TEMPERATURE_MIN = 2000
export const RELIGHT_TEMPERATURE_MAX = 8000

export const RELIGHT_DEFAULT_CONTROLS: RelightControls = {
  viewMode: "perspective",
  brightness: 50,
  colorTemperature: 5600,
  mainLightDirection: "front",
  rimLight: true,
  lightPosition: {
    x: 0,
    y: 0,
    z: 1,
  },
}

export function clampRelightValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const RELIGHT_DIRECTION_LABELS: Record<RelightDirection, string> = {
  left: "左侧",
  top: "顶部",
  right: "右侧",
  front: "前方",
  bottom: "底部",
  back: "后方",
}

function getTemperatureLabel(value: number) {
  if (value <= 4200) return "偏暖"
  if (value >= 6500) return "偏冷"
  return "自然日光"
}

export function buildRelightPrompt(controls: RelightControls) {
  const brightness = Math.round(clampRelightValue(controls.brightness, RELIGHT_BRIGHTNESS_MIN, RELIGHT_BRIGHTNESS_MAX))
  const colorTemperature = Math.round(clampRelightValue(controls.colorTemperature, RELIGHT_TEMPERATURE_MIN, RELIGHT_TEMPERATURE_MAX))
  const direction = RELIGHT_DIRECTION_LABELS[controls.mainLightDirection] || "前方"
  const viewMode = controls.viewMode === "front" ? "正面布光控制" : "透视布光控制"
  const lightX = Number(clampRelightValue(controls.lightPosition?.x ?? 0, -1, 1).toFixed(2))
  const lightY = Number(clampRelightValue(controls.lightPosition?.y ?? 0, -1, 1).toFixed(2))
  const lightZ = Number(clampRelightValue(controls.lightPosition?.z ?? 1, -1, 1).toFixed(2))

  return [
    "基于参考图进行单张图片打光重绘。",
    "必须严格保持原图主体身份、构图、轮廓、姿态、造型、材质、颜色、纹理、文字、logo、比例、镜头和背景内容一致。",
    "只调整光照效果，不要改变主体结构，不要更换场景，不要添加或删除物体。",
    `布光模式：${viewMode}。`,
    `全局亮度：${brightness}%。色温：${colorTemperature}K（${getTemperatureLabel(colorTemperature)}）。`,
    `主光源方向：${direction}。主光源空间位置控制：x=${lightX}, y=${lightY}, z=${lightZ}。`,
    controls.rimLight ? "开启轮廓光：在主体边缘增加自然的分离光和高光轮廓。" : "关闭轮廓光：不要额外增加明显边缘光。",
    "光影变化必须自然可信，阴影、高光、反射和环境光需要随主光源方向协调变化。",
    "输出一张完整、干净、自然的单张图片。不要生成拼图、宫格、对比图、分镜、边框、水印、AI 字样或解释文字。",
  ].join("\n")
}

export async function runRelightGeneration(params: {
  imageUrl: string
  modelId?: string
  forceModelId?: boolean
  controls: RelightControls
  projectId?: string
}) {
  const prompt = buildRelightPrompt(params.controls)
  const response = await fetch("/api/workflow/relight-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageUrl: params.imageUrl,
      modelId: params.modelId || undefined,
      forceModelId: params.forceModelId || undefined,
      projectId: params.projectId || undefined,
      controls: params.controls,
      prompt,
    }),

    credentials: "include"
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(String(result?.error || `打光生成失败 (${response.status})`))
  }

  const resultUrl = String(result?.imageUrl || result?.url || "").trim()
  if (!resultUrl) throw new Error("打光生成未返回图片")
  return { imageUrl: resultUrl, prompt: String(result?.prompt || prompt) }
}
