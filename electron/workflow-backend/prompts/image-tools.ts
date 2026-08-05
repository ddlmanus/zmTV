export type RelightViewMode = "perspective" | "front";
export type RelightDirection =
  | "left"
  | "top"
  | "right"
  | "front"
  | "bottom"
  | "back";

export type RelightControls = {
  viewMode?: RelightViewMode;
  brightness?: number;
  colorTemperature?: number;
  mainLightDirection?: RelightDirection;
  rimLight?: boolean;
  lightPosition?: { x?: number; y?: number; z?: number };
};

export type AnnotationEditTask = {
  annotationId?: string;
  regionIndex?: number;
  instruction?: string;
  maskData?: string;
  maskWidth?: number;
  maskHeight?: number;
  bounds?: { x?: number; y?: number; width?: number; height?: number };
  kind?: "replace_text" | "inpaint";
  originalText?: string;
  replacementText?: string;
};

export type WorkflowRedrawPayload = {
  model?: string;
  aspectRatio?: string;
  size?: string;
  count?: number;
  cost?: number;
};

const DEFAULT_RELIGHT_CONTROLS: Required<RelightControls> = {
  viewMode: "perspective",
  brightness: 50,
  colorTemperature: 5600,
  mainLightDirection: "front",
  rimLight: true,
  lightPosition: { x: 0, y: 0, z: 1 },
};

const DIRECTION_LABELS: Record<RelightDirection, string> = {
  left: "左侧",
  top: "顶部",
  right: "右侧",
  front: "前方",
  bottom: "底部",
  back: "后方",
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function normalizeRelightControls(
  raw: unknown,
): Required<RelightControls> {
  const input = (raw && typeof raw === "object" ? raw : {}) as RelightControls;
  const directions: RelightDirection[] = [
    "left",
    "top",
    "right",
    "front",
    "bottom",
    "back",
  ];
  const mainLightDirection = directions.includes(
    input.mainLightDirection as RelightDirection,
  )
    ? (input.mainLightDirection as RelightDirection)
    : DEFAULT_RELIGHT_CONTROLS.mainLightDirection;
  return {
    viewMode: input.viewMode === "front" ? "front" : "perspective",
    brightness: Math.round(
      clamp(
        Number(input.brightness ?? DEFAULT_RELIGHT_CONTROLS.brightness),
        10,
        100,
      ),
    ),
    colorTemperature: Math.round(
      clamp(
        Number(
          input.colorTemperature ?? DEFAULT_RELIGHT_CONTROLS.colorTemperature,
        ),
        2000,
        8000,
      ),
    ),
    mainLightDirection,
    rimLight:
      typeof input.rimLight === "boolean"
        ? input.rimLight
        : DEFAULT_RELIGHT_CONTROLS.rimLight,
    lightPosition: {
      x: Number(
        clamp(
          Number(
            input.lightPosition?.x ?? DEFAULT_RELIGHT_CONTROLS.lightPosition.x,
          ),
          -1,
          1,
        ).toFixed(2),
      ),
      y: Number(
        clamp(
          Number(
            input.lightPosition?.y ?? DEFAULT_RELIGHT_CONTROLS.lightPosition.y,
          ),
          -1,
          1,
        ).toFixed(2),
      ),
      z: Number(
        clamp(
          Number(
            input.lightPosition?.z ?? DEFAULT_RELIGHT_CONTROLS.lightPosition.z,
          ),
          -1,
          1,
        ).toFixed(2),
      ),
    },
  };
}

export function buildServerRelightPrompt(
  controls: Required<RelightControls>,
  prompt?: string,
) {
  const clientPrompt = String(prompt || "").trim();
  const controlBlock = [
    "",
    "[Relight Control - highest priority]",
    "Task source: workflow_relight. This is a controlled single-image relighting edit, not storyboard, not multi-shot, not collage.",
    "Only change lighting. Preserve subject identity, composition, geometry, text, logo, materials, colors, proportions, camera framing and background content.",
    `Light view mode: ${controls.viewMode === "front" ? "front" : "perspective"}.`,
    `Global brightness: ${controls.brightness}%.`,
    `Color temperature: ${controls.colorTemperature}K.`,
    `Main light direction: ${DIRECTION_LABELS[controls.mainLightDirection]} (${controls.mainLightDirection}).`,
    `Main light position vector: x=${controls.lightPosition.x}, y=${controls.lightPosition.y}, z=${controls.lightPosition.z}.`,
    `Rim light: ${controls.rimLight ? "ON, add natural edge separation light" : "OFF, do not add obvious edge light"}.`,
    "Adjust shadows, highlights, reflections and ambient light consistently with the selected light direction.",
    "The output must be one clean standalone image. Do not create a grid, comparison, storyboard panel, frame, border, watermark or explanatory text.",
  ].join("\n");

  return `${clientPrompt || "基于参考图进行单张图片打光重绘。"}${controlBlock}`;
}

function normalizeTaskInstruction(task: AnnotationEditTask) {
  const kind = String(task.kind || "").trim();
  const instruction = String(task.instruction || "").trim();
  const originalText = String(task.originalText || "").trim();
  const replacementText = String(task.replacementText || "").trim();
  if (kind === "replace_text" && originalText && replacementText) {
    return `将该区域中的“${originalText}”替换为“${replacementText}”，保持其他未标注区域、排版和视觉风格不变`;
  }
  return instruction;
}

function splitInstructionExtras(instruction: string) {
  const segments = String(instruction || "")
    .split("；额外要求：")
    .map((item) => item.trim())
    .filter(Boolean);
  return { primary: segments[0] || "", extras: segments.slice(1) };
}

function normalizeAnnotationUserPrompt(value: string) {
  return String(value || "")
    .replace(/@(?=(?:位置|区域)\s*\d+)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizeWorkflowRedrawPayload(
  value: unknown,
): WorkflowRedrawPayload | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const aspectRatio = String(input.aspectRatio || "").trim();
  const size = String(input.size || "")
    .trim()
    .toUpperCase();
  const count = Math.max(1, Math.min(4, Math.floor(Number(input.count || 1))));
  const cost = Math.max(0, Number(input.cost || 0));
  return {
    model: String(input.model || "").trim() || undefined,
    aspectRatio: aspectRatio || undefined,
    size: size || undefined,
    count,
    cost,
  };
}

export function buildAnnotationEditPrompt(
  tasks: AnnotationEditTask[],
  rawPrompt: string,
  referenceImageCount: number,
  workflowRedraw?: WorkflowRedrawPayload | null,
) {
  const normalizedTasks = tasks
    .map((task, index) => ({
      ...task,
      regionIndex:
        Number.isFinite(Number(task.regionIndex)) &&
        Number(task.regionIndex) > 0
          ? Number(task.regionIndex)
          : index + 1,
      instruction: normalizeTaskInstruction(task),
    }))
    .filter((task) => String(task.instruction || "").trim());
  const extraRequirements = Array.from(
    new Set(
      normalizedTasks.flatMap(
        (task) => splitInstructionExtras(task.instruction || "").extras,
      ),
    ),
  );
  const regionLines = normalizedTasks.map((task) => {
    const parsed = splitInstructionExtras(task.instruction || "");
    return `位置${task.regionIndex}：${parsed.primary || "可按用户要求编辑该标注位置"}`;
  });
  const referenceHint =
    referenceImageCount > 0
      ? "其余参考图仅用于辅助理解要替换的元素、风格、材质或文字效果，不要把参考图拼贴进画面。"
      : "";
  const userPrompt = normalizeAnnotationUserPrompt(rawPrompt);
  return [
    "你将收到多张输入图：",
    "1. 第1张是原始待编辑图片。",
    "2. 第2张是标注引导图，带有高亮区域和编号。",
    referenceImageCount > 0 ? "3. 后续图片是额外参考图。" : "",
    "",
    "请严格按照标注编号修改，只改被标注的区域，未标注区域尽量保持不变。",
    referenceHint,
    "不要新增水印、AI 字样、额外边框或无关元素。",
    "",
    "可用标注位置：",
    ...regionLines,
    "",
    userPrompt ? `用户输入：${userPrompt}` : "",
    workflowRedraw?.aspectRatio || workflowRedraw?.size ? "" : "",
    workflowRedraw?.aspectRatio
      ? `输出比例：${workflowRedraw.aspectRatio}`
      : "",
    workflowRedraw?.size ? `输出清晰度：${workflowRedraw.size}` : "",
    extraRequirements.length > 0 ? "" : "",
    extraRequirements.length > 0
      ? `标注附加备注：${extraRequirements.join("；")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const DEFAULT_WAVESPEED_ERASE_PROMPT = [
  "你将收到两张输入图：",
  "1. 第1张是原始待编辑图片，是最终输出必须保持一致的基础图。",
  "2. 第2张是蒙版/标注引导图，只用于指示唯一允许编辑的区域；白色或高亮区域表示需要擦除和补全，黑色、透明或未标注区域表示锁定区域。",
  "任务：只根据第2张图标注的区域，在第1张原图对应位置进行精准擦除修图，完整移除该区域内的内容，并根据紧邻周围背景自然补全。必须严格保留第1张原图的背景、光影、构图、透视、色彩、清晰度和画面中其余所有物体。",
  "硬性限制：第2张图未标注区域对应到第1张原图的区域必须与原图完全一致，尽量逐像素保持不变。不要移动、缩放、替换、增删、重绘、扩散、修饰、美化、锐化、降噪、改色或重构任何未标注内容。不要改变文字、线条、主体、边缘、阴影、材质、构图和画幅。不要把整张图重新生成。",
  "输出要求：仅输出修改后的图片；除了第2张图白色/高亮标注区域在第1张原图对应位置被自然无痕删除和补全之外，其余元素不改动。",
].join(" ");
