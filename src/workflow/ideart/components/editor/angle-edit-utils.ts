"use client";

import {
  waitForQuickEditImageTask,
  type QuickEditAsyncTask,
} from "@/workflow/ideart/components/editor/quick-edit-task-polling";
import { getWorkflowErrorMessage } from "@/workflow/ideart/lib/error-message";

export type AngleEditMode = "subject" | "camera";

export type AngleEditControls = {
  mode: AngleEditMode;
  rotation: number;
  tilt: number;
  zoom: number;
  wideAngle?: boolean;
  promptEnabled?: boolean;
  promptText?: string;
};

export const ANGLE_EDIT_ROTATION_MIN = -180;
export const ANGLE_EDIT_ROTATION_MAX = 180;
export const ANGLE_EDIT_TILT_MIN = -90;
export const ANGLE_EDIT_TILT_MAX = 90;
export const ANGLE_EDIT_ZOOM_MIN = 0;
export const ANGLE_EDIT_ZOOM_MAX = 10;
export const ANGLE_EDIT_RUN_CREDITS = 1;
export const ANGLE_EDIT_DEFAULT_CONTROLS: AngleEditControls = {
  mode: "subject",
  rotation: 45,
  tilt: 0,
  zoom: 0,
  wideAngle: false,
  promptEnabled: false,
  promptText: "",
};

export function clampAngleEditValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAngleEditRotation(value: number) {
  if (!Number.isFinite(value)) return 0;
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && value > 0 ? 180 : wrapped;
}

export function snapAngleEditRotation(value: number, threshold = 4) {
  const normalized = normalizeAngleEditRotation(value);
  const stops = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  const nearest = stops.reduce(
    (best, stop) =>
      Math.abs(stop - normalized) < Math.abs(best - normalized) ? stop : best,
    stops[0],
  );
  return Math.abs(nearest - normalized) <= threshold ? nearest : normalized;
}

export function snapAngleEditTilt(value: number, threshold = 3) {
  const normalized = clampAngleEditValue(
    value,
    ANGLE_EDIT_TILT_MIN,
    ANGLE_EDIT_TILT_MAX,
  );
  const stops = [-90, -60, -30, 0, 30, 60, 90];
  const nearest = stops.reduce(
    (best, stop) =>
      Math.abs(stop - normalized) < Math.abs(best - normalized) ? stop : best,
    stops[0],
  );
  return Math.abs(nearest - normalized) <= threshold ? nearest : normalized;
}

export function getAngleEditTiltDegrees(tilt: number) {
  return Math.round(
    clampAngleEditValue(tilt, ANGLE_EDIT_TILT_MIN, ANGLE_EDIT_TILT_MAX),
  );
}

function getZoomLabel(value: number) {
  if (value <= 0) return "全景";
  if (value <= 5) return "中景";
  return "特写";
}

function describeHorizontalView(rotation: number) {
  const normalized = Math.round(normalizeAngleEditRotation(rotation));
  if (normalized === 0) return "正面视角，主体正面朝向镜头";
  if (normalized === 45)
    return "左前方 45° 三分之四视角，同时看见主体正面与左侧面";
  if (normalized === 90) return "左侧 90° 纯侧面视角，左侧轮廓清晰";
  if (normalized === 135)
    return "左后方 135° 三分之四视角，同时看见主体背面与左侧面";
  if (Math.abs(normalized) === 180)
    return "180° 自然背面视角，完整展示同一主体的背面结构";
  if (normalized === -135)
    return "右后方 135° 三分之四视角，同时看见主体背面与右侧面";
  if (normalized === -90) return "右侧 90° 纯侧面视角，右侧轮廓清晰";
  if (normalized === -45)
    return "右前方 45° 三分之四视角，同时看见主体正面与右侧面";
  return normalized > 0
    ? `从主体左侧方向观察，水平转角约 ${normalized}°`
    : `从主体右侧方向观察，水平转角约 ${Math.abs(normalized)}°`;
}

function describeVerticalView(tilt: number, mode: AngleEditMode) {
  const normalized = getAngleEditTiltDegrees(tilt);
  if (normalized === 0)
    return mode === "subject" ? "主体保持自然水平朝向" : "保持自然平视高度";
  if (mode === "subject") {
    return normalized > 0
      ? `保持相机不动，让主体绕自身水平轴倾转 ${normalized}°，使顶部/上表面自然朝向镜头并可见`
      : `保持相机不动，让主体绕自身水平轴反向倾转 ${Math.abs(normalized)}°，使底部/下表面自然朝向镜头并可见`;
  }
  if (normalized > 0) {
    return `从主体上方 ${normalized}° 俯视，真实展示顶部/上表面，近处上缘更大、远处下缘更小`;
  }
  return `从主体下方 ${Math.abs(normalized)}° 仰视，真实展示底部/下表面，近处下缘更大、远处上缘更小`;
}

export function buildAngleEditPrompt({
  mode,
  rotation,
  tilt,
  zoom,
  wideAngle,
  promptEnabled,
  promptText,
}: AngleEditControls) {
  const normalizedRotation = Math.round(normalizeAngleEditRotation(rotation));
  const normalizedTilt = getAngleEditTiltDegrees(tilt);
  const normalizedZoom = Math.round(
    clampAngleEditValue(zoom, ANGLE_EDIT_ZOOM_MIN, ANGLE_EDIT_ZOOM_MAX),
  );
  const horizontalView = describeHorizontalView(normalizedRotation);
  const verticalView = describeVerticalView(normalizedTilt, mode);
  const zoomLabel = getZoomLabel(normalizedZoom);
  const extraPrompt =
    promptEnabled && typeof promptText === "string" ? promptText.trim() : "";

  const modeInstruction =
    mode === "subject"
      ? [
          "这是主体多视图重建任务。识别参考图中的主要主体，把它当作具有真实体积和隐藏表面的同一个三维对象。",
          "相机位置、画幅、背景布局与光线尽量保持参考图不变；只让同一主体相对镜头转到目标观察角度，并重新绘制该角度下真实可见的正面、侧面、背面、顶部或底部。",
          "根据参考图的设计语言合理补全原图未展示的隐藏表面，但不能改变主体身份、造型设计、比例、材质、颜色、纹理、服装、logo、文字或关键细节。",
          "不要把原图做平面旋转、镜像、拉伸、裁切或仅移动位置；必须产生真实的三维朝向变化和自然遮挡关系。",
        ]
      : [
          "这是环绕机位重建任务。主体身份、姿态和所在位置保持不变，把主体、承托面与背景当作可重建的三维场景。",
          "让虚拟相机沿主体周围的球面轨道移动到目标机位，重新建立整张画面的透视、遮挡、承托面和背景关系。",
          "不要让主体主动换造型、换身份或换设计；不要把原图做平面旋转、拉伸或简单裁切来伪造新机位。",
        ];

  return [
    "基于参考图生成同一主体的一张新角度图片，只输出一张完整、自然、可直接使用的结果图。",
    ...modeInstruction,
    `目标角度：${horizontalView}；${verticalView}。`,
    `景别：${normalizedZoom}/10（${zoomLabel}），主体关键轮廓、品牌标识和结构不能被无意裁掉。`,
    wideAngle
      ? "使用明显但自然的广角透视，扩大环境视野；不得把主体边缘夸张拉伸或变形。"
      : "使用自然镜头透视，不要产生鱼眼或广角边缘畸变。",
    extraPrompt ? `额外要求：${extraPrompt}` : "",
    "保持原图整体画质、摄影/插画风格、色彩、光照方向和质感一致。若原图有背景，在主体模式下尽量锁定背景，在机位模式下按新视点自然重建背景透视。",
    "禁止拼图、宫格、分屏、对比图、分镜、边框、水印、AI 字样、角度标注或解释文字；禁止额外增加重复主体。",
  ]
    .filter(Boolean)
    .join("\n");
}

export type AngleEditGenerationResult = {
  imageUrl: string;
  modelId?: string;
  providerKey?: string;
};

export async function runAngleEditGeneration(params: {
  imageUrl: string;
  modelId?: string;
  forceModelId?: boolean;
  controls: AngleEditControls;
  projectId?: string;
  sessionId?: string;
  taskId?: string;
  onTaskSubmitted?: (task: QuickEditAsyncTask) => void;
  onProgress?: (message: string) => void;
}): Promise<AngleEditGenerationResult> {
  const prompt = buildAngleEditPrompt(params.controls);
  const explicitModelId = params.forceModelId ? params.modelId : undefined;
  const response = await fetch("/api/chat/edit-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: explicitModelId || undefined,
      forceModelId: Boolean(explicitModelId) || undefined,
      projectId: params.projectId || undefined,
      sessionId: params.sessionId || undefined,
      taskId: params.taskId || undefined,
      locale: "zh-CN",
      message: prompt,
      images: [params.imageUrl],
      history: [],
      source: "angle_edit",
      angleControls: params.controls,
    }),
    credentials: "include",
  });

  if (!response.ok || !response.body) {
    const responseText = await response.text().catch(() => "");
    throw new Error(responseText || `多角度生成失败 (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let resultUrl = "";
  let resultModelId = "";
  let resultProviderKey = "";
  let asyncTask: QuickEditAsyncTask | null = null;

  const parsePayload = (line: string): Record<string, unknown> | null => {
    if (!line.startsWith("data:")) return null;
    const data = line.slice(5).trim();
    if (!data) return null;
    try {
      return JSON.parse(data) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      for (const line of eventText.split("\n")) {
        const payload = parsePayload(line);
        if (!payload) continue;
        if (typeof payload.imageUrl === "string" && payload.imageUrl) {
          resultUrl = payload.imageUrl;
        }
        if (typeof payload.modelId === "string" && payload.modelId.trim()) {
          resultModelId = payload.modelId.trim();
        }
        if (
          typeof payload.providerKey === "string" &&
          payload.providerKey.trim()
        ) {
          resultProviderKey = payload.providerKey.trim();
        }
        const submittedTaskId =
          typeof payload.taskId === "string" ? payload.taskId.trim() : "";
        const statusUrl =
          typeof payload.statusUrl === "string" ? payload.statusUrl.trim() : "";
        if (submittedTaskId || statusUrl) {
          asyncTask = {
            taskId: submittedTaskId,
            statusUrl,
            taskType:
              typeof payload.taskType === "string"
                ? payload.taskType
                : undefined,
            modelId: resultModelId || explicitModelId,
            projectId: params.projectId,
            providerKey: resultProviderKey || undefined,
          };
          params.onTaskSubmitted?.(asyncTask);
        }
        if (
          (payload.type === "done" && payload.success === false) ||
          payload.type === "error"
        ) {
          throw new Error(getWorkflowErrorMessage(payload, "多角度生成失败"));
        }
      }
    }
  }

  if (!resultUrl) {
    if (!asyncTask) throw new Error("多角度生成未返回图片");
    resultUrl = await waitForQuickEditImageTask(asyncTask, {
      onProgress: params.onProgress,
    });
  }

  return {
    imageUrl: resultUrl,
    modelId: resultModelId || asyncTask?.modelId || explicitModelId,
    providerKey: resultProviderKey || asyncTask?.providerKey,
  };
}
