import type { LibTvStoryboardScriptRow } from "@/workflow/ideart/lib/libtv/script";
import type { LibTvWorkflowSubtitleCue } from "@/workflow/ideart/lib/libtv/workflow";

export type StoryboardVideoPlanReference = {
  nodeId: string;
  url: string;
  role: string;
  label: string;
};

export type StoryboardVideoPlanSourceItem = {
  row: Partial<LibTvStoryboardScriptRow>;
  rowIndex: number;
  storyboardNumber: string;
  imageNodeId: string;
  referenceImage: string;
  assetReferences: StoryboardVideoPlanReference[];
  duration: number;
};

export type StoryboardVideoTimelineItem = StoryboardVideoPlanSourceItem & {
  localStart: number;
  localEnd: number;
  sourceStart: number;
  sourceEnd: number;
};

export type WorkflowStoryboardVideoClipPlan = {
  clipIndex: number;
  clipDuration: number;
  timelineStart: number;
  timelineEnd: number;
  items: StoryboardVideoTimelineItem[];
  referenceImages: string[];
  referenceImageNodeIds: string[];
  referenceImageRoles: string[];
  referenceEdges: Array<{ source: string; target: string }>;
  storyboardLabel: string;
  prompt: string;
  subtitleTimeline: LibTvWorkflowSubtitleCue[];
};

function formatSeconds(value: number) {
  const rounded = Math.round(Math.max(0, Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function parseTimeSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value))
    return Math.max(0, value);
  const text = String(value || "")
    .trim()
    .toLowerCase();
  if (!text) return null;
  const clockParts = text
    .replace(/，/g, ".")
    .split(":")
    .map((item) => Number.parseFloat(item));
  if (clockParts.length >= 2 && clockParts.every(Number.isFinite)) {
    return Math.max(
      0,
      clockParts.reduce((total, part) => total * 60 + part, 0),
    );
  }
  const matched = text.match(/-?\d+(?:\.\d+)?/);
  if (!matched) return null;
  const numeric = Number(matched[0]);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

function stripMotionPromptDuration(value: unknown) {
  return String(value || "")
    .replace(/\s*\+\s*\[时长\s*[:：][^\]]+\]/g, "")
    .replace(/\[时长\s*[:：][^\]]+\]\s*\+\s*/g, "")
    .replace(/\[时长\s*[:：][^\]]+\]/g, "")
    .replace(/时长\s*[:：]\s*\d+(?:\.\d+)?\s*秒/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function resolveStoryboardVideoMotionPrompt(
  row: Partial<LibTvStoryboardScriptRow>,
  fallback = "",
) {
  const record = row as Record<string, unknown>;
  const aliases = [
    "videoMotionPrompt",
    "video_motion_prompt",
    "finalVideoMotionPrompt",
    "final_video_motion_prompt",
    "motionPrompt",
    "motion_prompt",
    "videoPrompt",
    "video_prompt",
    "最终视频运动提示词",
    "视频运动提示词",
    "视频运镜提示词",
    "视频提示词",
    "动态提示词",
    "运镜提示词",
  ];
  for (const key of aliases) {
    const value = String(record[key] || "").trim();
    if (value && value !== "-") return value;
  }
  return String(fallback || "").trim();
}

function buildSubtitleCuesForItem(
  item: StoryboardVideoTimelineItem,
): LibTvWorkflowSubtitleCue[] {
  const text = String(item.row.subtitleText || "").trim();
  if (!text) return [];
  const rowStart = parseTimeSeconds(item.row.startTime) || 0;
  const rowEnd = parseTimeSeconds(item.row.endTime);
  const rawStart = parseTimeSeconds(item.row.subtitleStartTime);
  const rawEnd = parseTimeSeconds(item.row.subtitleEndTime);
  const usesAbsoluteTimeline =
    rowStart > 0 &&
    rawStart !== null &&
    rawStart >= rowStart - 0.05 &&
    (rowEnd === null || rawEnd === null || rawEnd <= rowEnd + 0.05);
  const subtitleStart = Math.max(
    0,
    (rawStart ?? 0) - (usesAbsoluteTimeline ? rowStart : 0),
  );
  const subtitleEnd = Math.max(
    subtitleStart + 0.1,
    (rawEnd ?? Math.max(item.sourceEnd, Number(item.duration) || 0)) -
      (usesAbsoluteTimeline ? rowStart : 0),
  );
  const intersectionStart = Math.max(item.sourceStart, subtitleStart);
  const intersectionEnd = Math.min(item.sourceEnd, subtitleEnd);
  if (intersectionEnd <= intersectionStart) return [];
  return [
    {
      text,
      startTime: item.localStart + (intersectionStart - item.sourceStart),
      endTime: item.localStart + (intersectionEnd - item.sourceStart),
      shotNumber: item.storyboardNumber,
      speaker:
        String(item.row.subtitleSpeaker || item.row.character1 || "").trim() ||
        undefined,
      sourceStartTime:
        String(item.row.subtitleStartTime || item.row.startTime || "").trim() ||
        undefined,
      sourceEndTime:
        String(item.row.subtitleEndTime || item.row.endTime || "").trim() ||
        undefined,
    },
  ];
}

export function buildWorkflowStoryboardSubtitleTimeline(
  items: StoryboardVideoTimelineItem[],
): LibTvWorkflowSubtitleCue[] {
  return items.flatMap(buildSubtitleCuesForItem);
}

export function formatWorkflowStoryboardVideoRowPrompt(params: {
  item: StoryboardVideoTimelineItem;
  referenceIndex: number;
  generateAudio: boolean;
}) {
  const { item, referenceIndex, generateAudio } = params;
  const row = item.row || {};
  const localStart = formatSeconds(item.localStart);
  const localEnd = formatSeconds(item.localEnd);
  const duration = formatSeconds(item.duration);
  const motionPrompt = stripMotionPromptDuration(
    resolveStoryboardVideoMotionPrompt(row, row.motionPrompt as string),
  );
  const dialogue = String(row.dialogue || "").trim();
  const voice = String(row.voice || "").trim();
  const soundEffect = String(row.soundEffect || "").trim();
  const musicRhythm = String(row.musicRhythm || "").trim();
  const subtitleCues = buildSubtitleCuesForItem(item);
  const subtitleLine = subtitleCues
    .map(
      (cue) =>
        `${formatSeconds(cue.startTime)}-${formatSeconds(cue.endTime)}s “${cue.text}”`,
    )
    .join("；");
  return [
    `【分镜 ${item.storyboardNumber} | 局部时间 ${localStart}-${localEnd}s | 必须持续 ${duration}s】`,
    item.referenceImage
      ? `参考图：使用第 ${referenceIndex} 张分镜图作为本镜头视觉锚点，保持角色身份、构图关系、服装/毛发、场景和光影。`
      : "",
    "执行优先级：视频提示词 > 人物动作/表情 > 景别镜头 > 分镜提示词 > 画面描述；不得用泛化动作替代本镜头动作。",
    row.shotType ? `景别与机位：${row.shotType}` : "",
    row.characterAction ? `人物动作与表情：${row.characterAction}` : "",
    row.emotion ? `情绪变化：${row.emotion}` : "",
    row.sceneTags ? `场景：${row.sceneTags}` : "",
    row.lightingAtmosphere ? `光影气氛：${row.lightingAtmosphere}` : "",
    row.visualDescription ? `画面描述：${row.visualDescription}` : "",
    row.storyboardPrompt ? `静态分镜画面约束：${row.storyboardPrompt}` : "",
    motionPrompt
      ? `视频提示词，必须逐字执行并按本镜头时长 ${duration}s 重写节奏：${motionPrompt}`
      : "",
    generateAudio
      ? "原生有声硬规则：本镜头由视频模型一次生成同步声轨，不得先生成无声视频再默认交给后期补音。"
      : "当前生成配置未启用原生声音，只生成画面，不在请求中添加声音参数。",
    generateAudio
      ? dialogue
        ? `对白/旁白（原生口型与声音同步）：${dialogue}`
        : "对白/旁白：无；不要新增台词或旁白。"
      : "",
    generateAudio && voice ? `人声表演与收音：${voice}` : "",
    generateAudio && soundEffect ? `环境声与动作拟音：${soundEffect}` : "",
    generateAudio && musicRhythm ? `本镜音乐意图：${musicRhythm}` : "",
    subtitleLine
      ? `画内字幕（来自分镜脚本，必须原文原时执行）：${subtitleLine}`
      : "画内字幕：本片段不显示字幕；不要自动添加文字。",
    `时间约束：本镜头只能占用 ${duration}s，在 ${localEnd}s 前完成动作，不能延长、不能提前切到下一镜。`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildWorkflowStoryboardNativeAudioPrompt(
  items: StoryboardVideoTimelineItem[],
) {
  const subtitles = buildWorkflowStoryboardSubtitleTimeline(items);
  const subtitleLines = subtitles.map(
    (cue) =>
      `${formatSeconds(cue.startTime)}-${formatSeconds(cue.endTime)}s “${cue.text}”`,
  );
  return [
    "整段必须启用 generateAudio=true，由当前视频模型原生生成并同步对白/旁白、环境声、动作拟音和音乐意图。",
    "禁止把无声视频加后期配音当作默认流程；后期只用于最终剪辑，或原生背景音乐明显不符合成片时的替换与调整。",
    subtitleLines.length > 0
      ? `字幕时间轴（来自分镜脚本，必须原文原时执行）：\n${subtitleLines.join("\n")}`
      : "本片段没有字幕时间轴，不要自动生成字幕或画面文字。",
  ].join("\n");
}

export function buildWorkflowStoryboardVideoClipPlan(params: {
  items: StoryboardVideoPlanSourceItem[];
  maxClipDuration: number;
  title: string;
  generateAudio?: boolean;
}): WorkflowStoryboardVideoClipPlan[] {
  const maxClipDuration = Math.max(1, Number(params.maxClipDuration) || 1);
  const clips: WorkflowStoryboardVideoClipPlan[] = [];
  let currentItems: StoryboardVideoTimelineItem[] = [];
  let currentDuration = 0;
  let timelineCursor = 0;

  const flushClip = () => {
    if (currentItems.length === 0) return;
    const timelineStart = Math.max(0, timelineCursor - currentDuration);
    const timelineEnd = timelineCursor;
    const referencePairs: StoryboardVideoPlanReference[] = [];
    const pushReference = (reference: StoryboardVideoPlanReference) => {
      const url = String(reference.url || "").trim();
      const nodeId = String(reference.nodeId || "").trim();
      if (!url || !nodeId) return;
      if (
        referencePairs.some(
          (item) => item.url === url && item.nodeId === nodeId,
        )
      )
        return;
      referencePairs.push({
        nodeId,
        url,
        role: String(reference.role || "reference").trim() || "reference",
        label: String(reference.label || "参考素材").trim() || "参考素材",
      });
    };
    currentItems.forEach((item) => {
      pushReference({
        nodeId: item.imageNodeId,
        url: item.referenceImage,
        role: "storyboard",
        label: `分镜 ${item.storyboardNumber}`,
      });
      item.assetReferences.forEach(pushReference);
    });
    const referenceIndexByNodeId = new Map(
      referencePairs.map((item, index) => [item.nodeId, index + 1]),
    );
    const timelineLines = currentItems
      .map((item) => {
        const assetReferenceLine = item.assetReferences
          .map((reference) => {
            const referenceIndex = referenceIndexByNodeId.get(reference.nodeId);
            return referenceIndex
              ? `第 ${referenceIndex} 张参考图=${reference.label}`
              : "";
          })
          .filter(Boolean)
          .join("；");
        return [
          formatWorkflowStoryboardVideoRowPrompt({
            item,
            referenceIndex: referenceIndexByNodeId.get(item.imageNodeId) || 1,
            generateAudio: params.generateAudio === true,
          }),
          assetReferenceLine
            ? `本镜头附加资产参考：${assetReferenceLine}。只使用这些角色/场景/道具资产，不要套用其他分镜的资产。`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");
    const clipIndex = clips.length;
    const storyboardLabel =
      currentItems.length === 1
        ? currentItems[0].storyboardNumber
        : `${currentItems[0].storyboardNumber}-${currentItems[currentItems.length - 1].storyboardNumber}`;
    const subtitleTimeline =
      buildWorkflowStoryboardSubtitleTimeline(currentItems);
    clips.push({
      clipIndex,
      clipDuration: Math.max(1, currentDuration),
      timelineStart,
      timelineEnd,
      items: currentItems,
      referenceImages: referencePairs.map((item) => item.url),
      referenceImageNodeIds: referencePairs.map((item) => item.nodeId),
      referenceImageRoles: referencePairs.map((item) => item.role),
      referenceEdges: referencePairs.map((item) => ({
        source: item.nodeId,
        target: "",
      })),
      storyboardLabel,
      subtitleTimeline,
      prompt: [
        `连续分镜视频片段 ${clipIndex + 1}`,
        `全片标题：${String(params.title || "分镜").trim()}`,
        `本片段覆盖全局时间轴 ${formatSeconds(timelineStart)}-${formatSeconds(timelineEnd)}s，片段总时长 ${formatSeconds(currentDuration)}s。`,
        "硬性规则：严格按照下面的分镜顺序、局部时间、景别、人物动作、表情、场景、光影、音效、对白和【视频提示词】生成；不要重新分配时长，不要跳过任何分镜，不要改台词，不要新增剧情。",
        "连续性规则：每个分镜结束姿态必须自然衔接下一个分镜开始姿态；角色身份、服装/毛发/体型、场景方向、光影色温必须保持一致。",
        params.generateAudio === true
          ? buildWorkflowStoryboardNativeAudioPrompt(currentItems)
          : "当前生成配置未启用原生声音，本片段只生成画面。",
        referencePairs.length > 0
          ? `已附带 ${referencePairs.length} 张参考图：每条分镜的首张参考是分镜图，后续只追加该分镜实际用到的角色、场景、道具资产图；不要把其他分镜的资产错配到本镜头。`
          : "",
        "下面是逐镜头执行清单：",
        timelineLines,
        clipIndex > 0
          ? "承接上一片段的角色、场景、光线与动作连续性；第一帧必须贴近上一片段尾帧，不要突然换景或换动作。"
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    currentItems = [];
    currentDuration = 0;
  };

  for (const item of params.items) {
    let remaining = Math.max(0, Number(item.duration) || 0);
    let sourceCursor = 0;
    while (remaining > 0) {
      const available = Math.max(0, maxClipDuration - currentDuration);
      if (available <= 0) {
        flushClip();
        continue;
      }
      const used = Math.min(remaining, available);
      currentItems.push({
        ...item,
        duration: used,
        localStart: currentDuration,
        localEnd: currentDuration + used,
        sourceStart: sourceCursor,
        sourceEnd: sourceCursor + used,
      });
      currentDuration += used;
      timelineCursor += used;
      sourceCursor += used;
      remaining -= used;
      if (currentDuration >= maxClipDuration - 0.001) flushClip();
    }
  }
  flushClip();
  return clips;
}
