"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  Filter,
  Fullscreen,
  Grid2X2,
  ImageIcon,
  Plus,
  RefreshCw,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import type { LibTvWorkflowNode } from "@/workflow/ideart/lib/libtv/workflow";
import {
  LIBTV_TAPNOW_SCRIPT_HEIGHT,
  LIBTV_TAPNOW_SCRIPT_WIDTH,
} from "@/workflow/ideart/lib/libtv/layer";
import {
  createEmptyStoryboardScriptRow,
  deriveLibTvScriptV2AssetsByKind,
  LIBTV_STORYBOARD_SCRIPT_COLUMNS,
  LIBTV_STORYBOARD_SCRIPT_TABLE_MIN_WIDTH,
  normalizeLibTvStoryboardScriptResult,
  type LibTvScriptV2AssetKind,
  type LibTvStoryboardScriptColumnKey,
  type LibTvStoryboardScriptResult,
  type LibTvStoryboardScriptRow,
} from "@/workflow/ideart/lib/libtv/script";
import { uploadCanvasNodeFile } from "../libtv-upload-utils";
import {
  WorkflowSelect,
  WorkflowSelectContent,
  WorkflowSelectItem,
  WorkflowSelectTrigger,
  WorkflowSelectValue,
} from "../workflow-select";
import { TapNowNodeIcon } from "./nodes/workflow-node-icons";
import { stopWorkflowNodeChromeEvent } from "./nodes/workflow-node-utils";
import { message } from "@/workflow/ideart/shims/antd";
import {
  WORKFLOW_NODE_TITLE_BAR_CLASS,
  WORKFLOW_NODE_TITLE_BAR_STYLE,
  getWorkflowNodeTitleWidth,
  getWorkflowScriptNodeTitle,
} from "./workflow-connections";
import {
  ZMTV_NODE_SURFACE_BACKGROUND,
  ZMTV_NODE_SURFACE_BORDER,
  ZMTV_NODE_SURFACE_SELECTED_OUTLINE,
  ZMTV_NODE_SURFACE_SELECTED_SHADOW,
  ZMTV_NODE_SURFACE_SHADOW,
  ZmtvNodeEmptyGlyph,
} from "./node-shared-ui";
import { CANVAS_CONTROLS_MENU_PANEL_STYLE } from "./surface-contracts";
import { isWorkflowVideoAnalysisScriptNode } from "./workflow-node-kinds";
import { NodeGenerationBar } from "./generation-composer";
import type {
  ScriptTryPromptType,
  WorkflowGenerateNodeHandler,
  WorkflowStoryboardGenerateRequest,
} from "./surface-contracts";
import type {
  ScriptInputCreationType,
  WorkflowUpstreamNodeSummary,
} from "./workflow-models";

export const DEFAULT_STORYBOARD_SCRIPT_INPUT_TEXT = `请生成一个画面非常好看、节奏抓人的原创短剧剧本。

题材方向：高概念奇幻 / 都市情绪 / 视觉大片感
时长建议：60-90秒
核心要求：开场3秒有钩子，中段有反转，结尾有强记忆点。

请直接补全为可拍摄、可分镜、适合图片和视频生成的完整剧本：
1. 角色要有鲜明身份、外貌锚点和情绪变化。
2. 场景要有强视觉符号，例如雨夜天台、霓虹街区、悬浮档案室、裂开的天空或发光海面。
3. 每一幕都要有明确动作、光影、镜头氛围和声音节奏。
4. 不要使用真实明星、已有影视动漫角色、品牌Logo或受版权保护的世界观。
5. 输出要像可直接制作的短剧脚本，而不是普通故事梗概。`;

export const SCRIPT_TRY_PROMPTS: Array<{
  type: ScriptTryPromptType;
  optionId: string;
  label: string;
  prompt: string;
  initialContent?: string;
}> = [
  {
    type: "story",
    optionId: "storyboard-script",
    label: "故事生成镜头脚本",
    prompt:
      "请根据下面的故事内容生成镜头脚本，包含镜号、画面描述、镜头运动、人物动作、旁白/对白和时长建议：",
    initialContent: DEFAULT_STORYBOARD_SCRIPT_INPUT_TEXT,
  },
  {
    type: "video",
    optionId: "video-storyboard-script",
    label: "视频参考生成镜头脚本",
    prompt:
      "请结合参考视频生成镜头脚本，重点拆解镜头节奏、主体运动、景别切换、镜头衔接和时长建议：",
  },
  {
    type: "character",
    optionId: "character-storyboard-script",
    label: "人物生成镜头脚本",
    prompt:
      "请围绕人物设定生成镜头脚本，突出人物动机、动作表演、情绪变化和镜头语言：",
  },
];

export function summarizeWorkflowScriptResult(
  result: LibTvStoryboardScriptResult | null | undefined,
) {
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  if (rows.length === 0) return "";
  return rows
    .slice(0, 5)
    .map((row, index) => {
      const shot = String(row.shotNumber || index + 1).trim();
      const visual = String(
        row.visualDescription ||
          row.storyboardPrompt ||
          row.characterAction ||
          row.dialogue ||
          "",
      ).trim();
      return `${shot}. ${visual}`.trim();
    })
    .filter(Boolean)
    .join("\n");
}

export type WorkflowScriptViewMode = "script" | "creative";

export type WorkflowScriptFilterOperator =
  | "contains"
  | "notContains"
  | "equals"
  | "notEmpty";

export type WorkflowScriptFilterRule = {
  columnKey: LibTvStoryboardScriptColumnKey;
  operator: WorkflowScriptFilterOperator;
  value: string;
};

export const WORKFLOW_SCRIPT_DOCUMENT_BORDER =
  "var(--canvas-node-border, rgba(255,255,255,0.10))";

export const WORKFLOW_SCRIPT_DOCUMENT_SELECTED_BORDER =
  "rgba(0, 219, 205, 0.62)";

export const WORKFLOW_SCRIPT_VIEW_OPTIONS: Array<{
  mode: WorkflowScriptViewMode;
  label: string;
  icon: React.ReactNode;
}> = [
  { mode: "script", label: "脚本生成器", icon: <Table2 className="size-4" /> },
  {
    mode: "creative",
    label: "创意视图",
    icon: <Sparkles className="size-4" />,
  },
];

export function getWorkflowScriptImageUrl(row: LibTvStoryboardScriptRow) {
  return String(
    row.referenceImage || row.characterImage1 || row.characterImage2 || "",
  ).trim();
}

export function getWorkflowScriptTextCandidate(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text && text !== "-") return text;
  }
  return "";
}

export function getWorkflowScriptCellValue(
  row: LibTvStoryboardScriptRow,
  key: LibTvStoryboardScriptColumnKey,
) {
  const record = row as LibTvStoryboardScriptRow & Record<string, unknown>;
  if (key !== "motionPrompt")
    return getWorkflowScriptTextCandidate(
      row[key as keyof LibTvStoryboardScriptRow],
    );
  return getWorkflowScriptTextCandidate(
    row.motionPrompt,
    record.cameraMovement,
    record.motion_prompt,
    record.videoMotionPrompt,
    record.video_motion_prompt,
    record.videoPrompt,
    record.video_prompt,
    record.camera_movement,
    record.cameraMotion,
    record.camera_motion,
    record.movement,
    record.motion,
    record["视频运动提示词"],
    record["视频运镜提示词"],
    record["视频提示词"],
    record["运镜提示词"],
  );
}

export type WorkflowScriptHighlightAssets = Partial<
  Record<LibTvScriptV2AssetKind | string, unknown[]>
>;

export const WORKFLOW_SCRIPT_HIGHLIGHT_SKIP_TERMS = new Set([
  "无",
  "没有",
  "人物",
  "角色",
  "场景",
  "道具",
  "镜头",
  "画面",
  "背景",
  "前景",
  "特写",
  "近景",
  "中景",
  "远景",
  "全景",
]);

export function normalizeWorkflowScriptHighlightTerm(value: unknown) {
  return String(value || "")
    .replace(/^@+/, "")
    .replace(/^[【［\[\(（<《"“']+|[】］\]\)）>》"”']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitWorkflowScriptHighlightTerms(value: unknown) {
  const text = normalizeWorkflowScriptHighlightTerm(value);
  if (!text) return [];
  const parts = text.split(/[、,，;；/|｜\n]+/g).flatMap((part) => {
    const normalized = normalizeWorkflowScriptHighlightTerm(part);
    const colonHead = normalizeWorkflowScriptHighlightTerm(
      normalized.split(/[：:]/)[0],
    );
    const underscoreHead = normalizeWorkflowScriptHighlightTerm(
      normalized.split(/[_-]/)[0],
    );
    return [normalized, colonHead, underscoreHead];
  });
  return Array.from(
    new Set(parts.map(normalizeWorkflowScriptHighlightTerm).filter(Boolean)),
  );
}

export function collectWorkflowScriptHighlightTerms(
  row: LibTvStoryboardScriptRow,
  assetsByKind?: WorkflowScriptHighlightAssets,
) {
  const record = row as LibTvStoryboardScriptRow & Record<string, unknown>;
  const haystack = [
    row.visualDescription,
    row.storyboardPrompt,
    row.imageGenerationPrompt,
    row.character1,
    row.character2,
    row.sceneTags,
    row.sceneKey,
    row.sceneAssetKey,
    record.props,
    record.propNames,
    record.propKeys,
    record.usedProps,
    record.objects,
    record.objectNames,
  ]
    .map((value) =>
      Array.isArray(value) ? value.join("、") : String(value || ""),
    )
    .join("\n");
  const terms = new Set<string>();
  const push = (value: unknown, requireInText = false) => {
    splitWorkflowScriptHighlightTerms(value).forEach((term) => {
      if (term.length < 2 || WORKFLOW_SCRIPT_HIGHLIGHT_SKIP_TERMS.has(term))
        return;
      if (requireInText && !haystack.includes(term)) return;
      terms.add(term);
    });
  };

  push(row.character1);
  push(row.character2);
  if (Array.isArray(row.characters)) {
    row.characters.forEach((character) => {
      if (!character || typeof character !== "object") return;
      const item = character as Record<string, unknown>;
      push(
        item.characterName ||
          item.character_name ||
          item.name ||
          item.title ||
          item.role,
      );
    });
  }
  push(row.sceneKey);
  push(row.sceneAssetKey);
  push(row.sceneTags);
  push(record.props);
  push(record.propNames);
  push(record.propKeys);
  push(record.usedProps);
  push(record.objects);
  push(record.objectNames);

  Object.values(assetsByKind || {}).forEach((items) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const asset = item as Record<string, unknown>;
      push(
        asset.title || asset.name || asset.label || asset.key || asset.id,
        true,
      );
    });
  });

  return Array.from(terms).sort((a, b) => b.length - a.length);
}

export function renderWorkflowScriptHighlightedText(
  text: string,
  terms: string[],
) {
  const value = String(text || "");
  if (!value) return <span className="text-white/24">-</span>;
  const matchedTerms = terms.filter((term) => value.includes(term));
  if (matchedTerms.length === 0) return <span>{value}</span>;
  const pattern = new RegExp(
    `(${matchedTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "g",
  );
  return (
    <span
      className="text-xs"
      style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
    >
      {value.split(pattern).map((part, index) => {
        if (!part) return null;
        const isMatch = matchedTerms.includes(part);
        return isMatch ? (
          <span
            key={`${part}-${index}`}
            className="inline-flex items-center rounded-sm bg-[#3CB5CC]/10 px-0.5 align-middle leading-[1.2] text-[#5DDCFF] canvas-light:text-[#07B8DD]"
          >
            @{part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        );
      })}
    </span>
  );
}

export function normalizeWorkflowScriptResultForDisplay(
  result: LibTvStoryboardScriptResult,
): LibTvStoryboardScriptResult {
  const normalizedResult =
    normalizeLibTvStoryboardScriptResult(result) || result;
  const rows = Array.isArray(normalizedResult.rows)
    ? normalizedResult.rows.map((row) => ({
        ...row,
        motionPrompt: getWorkflowScriptCellValue(row, "motionPrompt").trim(),
      }))
    : [];
  return {
    ...normalizedResult,
    rows,
  };
}

export function formatWorkflowScriptDuration(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "--";
  const numeric = Number(raw.replace(/秒|s$/i, "").trim());
  if (Number.isFinite(numeric)) return `${numeric.toFixed(2)}s`;
  return raw;
}

export function getWorkflowScriptColumnLabel(column: {
  key: LibTvStoryboardScriptColumnKey;
  label: string;
}) {
  if (column.key === "referenceImage") return "视频参考图";
  if (column.key === "emotion") return "表情";
  if (column.key === "sceneTags") return "场景";
  if (column.key === "motionPrompt") return "视频提示词";
  if (column.key === "dialogue") return "对白·旁白";
  if (column.key === "cameraMovement") return "运镜";
  if (column.key === "storyboardPrompt") return "最终提示词";
  return column.label;
}

export function getWorkflowScriptVisibleColumns(
  visibleColumnKeys?: Set<LibTvStoryboardScriptColumnKey>,
) {
  if (!visibleColumnKeys) return LIBTV_STORYBOARD_SCRIPT_COLUMNS;
  return LIBTV_STORYBOARD_SCRIPT_COLUMNS.filter((column) =>
    visibleColumnKeys.has(column.key),
  );
}

export function workflowScriptFilterMatches(
  row: LibTvStoryboardScriptRow,
  rule: WorkflowScriptFilterRule | null,
) {
  if (!rule) return true;
  const cellValue = getWorkflowScriptCellValue(row, rule.columnKey).trim();
  const needle = rule.value.trim();
  if (rule.operator === "notEmpty")
    return cellValue.length > 0 && cellValue !== "-";
  if (!needle) return true;
  const normalizedCell = cellValue.toLowerCase();
  const normalizedNeedle = needle.toLowerCase();
  if (rule.operator === "equals") return normalizedCell === normalizedNeedle;
  if (rule.operator === "notContains")
    return !normalizedCell.includes(normalizedNeedle);
  return normalizedCell.includes(normalizedNeedle);
}

export function downloadWorkflowScriptResult(
  result: LibTvStoryboardScriptResult,
) {
  if (typeof window === "undefined") return;
  const normalizedResult = normalizeWorkflowScriptResultForDisplay(result);
  const filenameBase =
    String(result.title || "镜头脚本")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "_")
      .slice(0, 80) || "镜头脚本";
  const blob = new Blob([JSON.stringify(normalizedResult, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenameBase}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export function WorkflowScriptToolbarButton({
  title,
  children,
  onClick,
}: {
  title: string;
  children: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      className="nodrag nopan inline-flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg px-3 text-[13px] text-white/76 transition-colors hover:bg-white/[0.08] hover:text-white"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function WorkflowScriptImageCell({
  value,
  compact = false,
}: {
  value: string;
  compact?: boolean;
}) {
  const src = String(value || "").trim();
  return (
    <div
      className={`flex h-full items-center justify-center p-1 ${compact ? "min-h-[60px]" : "min-h-[86px]"}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          className={`${compact ? "max-h-[72px]" : "max-h-[112px]"} w-full object-cover`}
        />
      ) : (
        <ImageIcon className="size-4 text-white/24" />
      )}
    </div>
  );
}

export function WorkflowVideoStoryNodeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-4 w-4 shrink-0 text-purple-400"
      width="1.01em"
      height="1em"
      viewBox="0 0 21.2473 21.2471"
    >
      <path
        d="M10.5996 1.2471C10.8204 1.2471 10.9998 1.42574 11 1.64652V2.64652C11 2.86743 10.8205 3.04691 10.5996 3.04691H6.92383L6.90039 19.4473H13.1006L13.0996 10.6465C13.0998 10.4257 13.2792 10.2471 13.5 10.2471H14.5C14.7208 10.2471 14.9002 10.4257 14.9004 10.6465V13.6162H18.2002V10.6465C18.2004 10.4257 18.3798 10.2471 18.6006 10.2471H19.5996C19.8204 10.2471 19.9998 10.4257 20 10.6465V18.2168L19.9961 18.3731C19.9172 19.9221 18.6751 21.1645 17.126 21.2432L16.9697 21.2471H3.03027C1.40921 21.2471 0.0853847 19.9739 0.00390625 18.3731L0 18.2168V4.27738C0.000169039 2.60394 1.3568 1.24712 3.03027 1.2471H10.5996ZM1.7998 18.2168C1.79998 18.8961 2.35092 19.4473 3.03027 19.4473H5.09961L5.10547 15.417H1.7998V18.2168ZM14.9004 19.4473H16.9697C17.6491 19.4473 18.2 18.8961 18.2002 18.2168V15.417H14.9004V19.4473ZM1.7998 13.6162H5.1084L5.11621 8.41703H1.7998V13.6162ZM16.625 0.260776C16.754 -0.0869253 17.246 -0.0869256 17.375 0.260776L18.2871 2.72464C18.3277 2.83385 18.4142 2.92053 18.5234 2.96097L20.9863 3.8721C21.3343 4.00103 21.3343 4.49312 20.9863 4.6221L18.5234 5.53421C18.414 5.57474 18.3276 5.66109 18.2871 5.77054L17.375 8.23343C17.246 8.58133 16.754 8.58133 16.625 8.23343L15.7129 5.77054C15.6724 5.66109 15.586 5.57474 15.4766 5.53421L13.0137 4.6221C12.6657 4.49312 12.6657 4.00103 13.0137 3.8721L15.4766 2.96097C15.5858 2.92053 15.6723 2.83385 15.7129 2.72464L16.625 0.260776ZM3.03027 3.04691C2.35091 3.04693 1.79997 3.59805 1.7998 4.27738V6.61625H5.11816L5.12305 3.04691H3.03027Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WorkflowVideoStoryExpandIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      role="img"
      className="pointer-events-none h-3.5 w-3.5"
      width="1em"
      height="1em"
      viewBox="0 0 17.8008 17.8008"
    >
      <path
        d="M1.40039 8.90039C1.62129 8.90039 1.80076 9.07988 1.80078 9.30078V14.8447L7.0625 9.58301C7.21875 9.42676 7.47271 9.4267 7.62891 9.58301L8.33594 10.29C8.49204 10.4463 8.4921 10.7003 8.33594 10.8564L3.19141 16H8.5C8.7209 16 8.90037 16.1795 8.90039 16.4004V17.4014C8.9003 17.6222 8.72086 17.8008 8.5 17.8008H0.799805C0.358011 17.8007 0 17.4428 0 17.001V9.30078C1.9471e-05 9.08004 0.178725 8.90064 0.399414 8.90039H1.40039ZM17.001 0C17.4427 0.000171625 17.8008 0.359059 17.8008 0.800781V8.50098C17.8007 8.72182 17.6213 8.90039 17.4004 8.90039H16.3994C16.1788 8.90014 16.0001 8.72166 16 8.50098V3.13672L10.8066 8.33105C10.6504 8.48728 10.3964 8.48728 10.2402 8.33105L9.5332 7.62305C9.37729 7.46686 9.37722 7.21375 9.5332 7.05762L14.7891 1.80078H9.2998C9.07916 1.80053 8.90048 1.62205 8.90039 1.40137V0.400391C8.90041 0.179648 9.07912 0.000250219 9.2998 0H17.001Z"
        fill="currentColor"
      />
    </svg>
  );
}

export const WORKFLOW_VIDEO_STORY_COLUMNS: Array<{
  key: LibTvStoryboardScriptColumnKey | "voiceAndSound" | "keyframe";
  label: string;
  width: number;
}> = [
  { key: "shotNumber", label: "镜号", width: 140 },
  { key: "startTime", label: "开始时间", width: 140 },
  { key: "endTime", label: "结束时间", width: 140 },
  { key: "duration", label: "时长", width: 140 },
  { key: "visualDescription", label: "画面描述", width: 200 },
  { key: "narrativeContent", label: "叙事内容", width: 200 },
  { key: "shotType", label: "景别", width: 140 },
  { key: "cameraAngle", label: "摄影机角度", width: 140 },
  { key: "cameraMovement", label: "摄影机运动", width: 140 },
  { key: "focalDepth", label: "焦距与景深", width: 200 },
  { key: "lightingAtmosphere", label: "光线", width: 200 },
  { key: "musicRhythm", label: "背景音乐", width: 140 },
  { key: "voiceAndSound", label: "人声/音效", width: 140 },
  { key: "storyboardPrompt", label: "图像生成提示词", width: 140 },
  { key: "motionPrompt", label: "视频运动提示词", width: 140 },
  { key: "keyframe", label: "关键帧", width: 90 },
];

export function getWorkflowVideoStoryCellValue(
  row: LibTvStoryboardScriptRow,
  key: (typeof WORKFLOW_VIDEO_STORY_COLUMNS)[number]["key"],
) {
  if (key === "voiceAndSound")
    return getWorkflowScriptTextCandidate(row.voice, row.soundEffect);
  if (key === "keyframe")
    return getWorkflowScriptTextCandidate(
      row.referenceImage,
      row.characterImage1,
      row.characterImage2,
    );
  return getWorkflowScriptCellValue(row, key);
}

export function WorkflowVideoAnalysisStoryView({
  nodeId,
  result,
  title,
  selected,
  onFullscreen,
}: {
  nodeId: string;
  result: LibTvStoryboardScriptResult;
  title: string;
  selected: boolean;
  onFullscreen: () => void;
}) {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const displayTitle = getWorkflowScriptNodeTitle(
    title || result.title || "视频故事",
  );
  const tableMinWidth = WORKFLOW_VIDEO_STORY_COLUMNS.reduce(
    (sum, column) => sum + column.width,
    0,
  );

  return (
    <div
      className="node-shell relative flex h-full w-full flex-col overflow-hidden rounded-xl"
      data-video-story-node="true"
      data-nodeid={nodeId}
      style={{
        background: "var(--Surface-Panel-background)",
        border: "1px solid var(--canvas-node-border)",
        boxShadow: selected ? ZMTV_NODE_SURFACE_SELECTED_SHADOW : "none",
        transition: "box-shadow 0.2s, border-color 0.15s",
      }}
    >
      <div className="workflow-video-story-drag-handle border-border-muted flex h-9 shrink-0 cursor-grab items-center gap-2 border-b px-3 active:cursor-grabbing">
        <WorkflowVideoStoryNodeIcon />
        <div className="flex min-w-0 flex-1 items-center gap-1 select-none">
          <span
            className="truncate text-[13px] font-medium text-fg-muted"
            title={displayTitle}
          >
            {displayTitle}
          </span>
        </div>
        <button
          type="button"
          className="nodrag nopan text-fg-muted hover:bg-canvas-controls-hover hover:text-fg-default shrink-0 rounded p-0.5 transition-colors"
          title="全屏展开"
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={(event) => {
            event.stopPropagation();
            onFullscreen();
          }}
        >
          <WorkflowVideoStoryExpandIcon />
        </button>
      </div>
      <div className="nodrag tiny-scrollbar flex-1 cursor-default overflow-auto nowheel">
        <table
          className="w-full border-collapse"
          style={{ minWidth: tableMinWidth }}
        >
          <thead className="sticky top-[-1px] z-10">
            <tr>
              {WORKFLOW_VIDEO_STORY_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className="border-border-muted text-fg-muted select-none border px-2 py-1.5 text-left text-[11px] font-medium"
                  style={{
                    width: column.width,
                    background: "var(--bg-surface-secondary)",
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={`${row.shotNumber || rowIndex + 1}-${rowIndex}`}
                className="hover:bg-canvas-controls-hover"
              >
                {WORKFLOW_VIDEO_STORY_COLUMNS.map((column) => {
                  const value = getWorkflowVideoStoryCellValue(row, column.key);
                  const isKeyframe = column.key === "keyframe";
                  return (
                    <td
                      key={column.key}
                      className="border-border-muted border p-0 align-top"
                      style={isKeyframe ? { width: column.width } : undefined}
                    >
                      {isKeyframe ? (
                        <div
                          className="flex w-full items-center justify-center px-1 py-2"
                          style={{ height: 160 }}
                        >
                          {value ? (
                            <img
                              src={value}
                              alt="frameUrl"
                              className="max-h-full max-w-full object-contain"
                              draggable={false}
                              decoding="async"
                            />
                          ) : (
                            <ImageIcon className="size-4 text-fg-disabled" />
                          )}
                        </div>
                      ) : (
                        <div className="px-2 py-2" style={{ height: 160 }}>
                          <div className="nodrag nowheel tiny-scrollbar text-fg-default h-full w-full cursor-text select-text overflow-y-auto whitespace-pre-wrap break-words text-xs">
                            {value || "-"}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-fg-muted">
            暂无视频镜头脚本
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WorkflowScriptTable({
  result,
  onRowChange,
  onRowImageUpload,
  uploadingRowImageKeys,
  compact = false,
  visibleColumnKeys,
  filterRule,
  scriptV2AssetsByKind,
  selectable = false,
  selectedRowIndexes,
  onSelectedRowIndexesChange,
}: {
  result: LibTvStoryboardScriptResult;
  onRowChange: (
    rowIndex: number,
    key: LibTvStoryboardScriptColumnKey,
    value: string,
  ) => void;
  onRowImageUpload?: (
    rowIndex: number,
    key: "characterImage1" | "characterImage2" | "referenceImage",
    file: File,
  ) => void;
  uploadingRowImageKeys?: Set<string>;
  compact?: boolean;
  visibleColumnKeys?: Set<LibTvStoryboardScriptColumnKey>;
  filterRule?: WorkflowScriptFilterRule | null;
  scriptV2AssetsByKind?: WorkflowScriptHighlightAssets;
  selectable?: boolean;
  selectedRowIndexes?: Set<number>;
  onSelectedRowIndexesChange?: (indexes: Set<number>) => void;
}) {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    columnKey: LibTvStoryboardScriptColumnKey;
  } | null>(null);
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const visibleColumns = getWorkflowScriptVisibleColumns(visibleColumnKeys);
  const highlightAssetsByKind = useMemo<WorkflowScriptHighlightAssets>(() => {
    const hasProvidedAssets = Object.values(scriptV2AssetsByKind || {}).some(
      (items) => Array.isArray(items) && items.length > 0,
    );
    return hasProvidedAssets
      ? scriptV2AssetsByKind || {}
      : deriveLibTvScriptV2AssetsByKind(result);
  }, [result, scriptV2AssetsByKind]);
  const visibleRows = rows
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .filter(({ row }) => workflowScriptFilterMatches(row, filterRule || null));
  const tableMinWidth = visibleColumns.reduce(
    (sum, column) => sum + column.width,
    0,
  );
  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every(({ sourceIndex }) =>
      selectedRowIndexes?.has(sourceIndex),
    );

  return (
    <div className="nodrag nopan nowheel h-full overflow-auto bg-[var(--Surface-Panel-background)] text-fg-default">
      <table
        className="w-full border-collapse"
        style={{
          minWidth: Math.max(
            420,
            tableMinWidth || LIBTV_STORYBOARD_SCRIPT_TABLE_MIN_WIDTH,
          ),
        }}
      >
        <thead className="sticky top-0 z-10">
          <tr>
            {selectable ? (
              <th
                className="select-none border border-border-muted bg-bg-surface-secondary px-0 py-1.5 text-center text-[11px] font-medium text-fg-muted"
                style={{ width: 42 }}
              >
                <input
                  type="checkbox"
                  className="nodrag nopan nowheel size-4 accent-[var(--fg-default)]"
                  checked={allVisibleSelected}
                  onPointerDown={stopWorkflowNodeChromeEvent}
                  onMouseDown={stopWorkflowNodeChromeEvent}
                  onChange={(event) => {
                    const next = new Set(selectedRowIndexes || []);
                    visibleRows.forEach(({ sourceIndex }) => {
                      if (event.target.checked) next.add(sourceIndex);
                      else next.delete(sourceIndex);
                    });
                    onSelectedRowIndexesChange?.(next);
                  }}
                />
              </th>
            ) : null}
            {visibleColumns.map((column) => (
              <th
                key={column.key}
                className={`select-none border border-border-muted bg-bg-surface-secondary px-2 py-1.5 text-[11px] font-medium text-fg-muted ${column.align === "center" ? "text-center" : "text-left"}`}
                style={{ width: column.width }}
              >
                {getWorkflowScriptColumnLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map(({ row, sourceIndex }) => (
            <tr
              key={`${row.shotNumber}-${sourceIndex}`}
              className="min-h-[60px] hover:bg-canvas-controls-hover"
            >
              {selectable ? (
                <td
                  className="border border-border-muted align-middle text-center"
                  style={{ width: 42, padding: 0 }}
                >
                  <input
                    type="checkbox"
                    className="nodrag nopan nowheel size-4 accent-[var(--fg-default)]"
                    checked={Boolean(selectedRowIndexes?.has(sourceIndex))}
                    onPointerDown={stopWorkflowNodeChromeEvent}
                    onMouseDown={stopWorkflowNodeChromeEvent}
                    onChange={(event) => {
                      const next = new Set(selectedRowIndexes || []);
                      if (event.target.checked) next.add(sourceIndex);
                      else next.delete(sourceIndex);
                      onSelectedRowIndexesChange?.(next);
                    }}
                  />
                </td>
              ) : null}
              {visibleColumns.map((column) => {
                const value = getWorkflowScriptCellValue(row, column.key);
                const isImageColumn =
                  column.key === "characterImage1" ||
                  column.key === "characterImage2" ||
                  column.key === "referenceImage";
                const isHighlightedDescription =
                  column.key === "visualDescription";
                const isEditingCell =
                  editingCell?.rowIndex === sourceIndex &&
                  editingCell.columnKey === column.key;
                const uploadKey = `${sourceIndex}:${column.key}`;
                const isUploading = Boolean(
                  uploadingRowImageKeys?.has(uploadKey),
                );
                return (
                  <td
                    key={column.key}
                    className={`border border-border-muted align-top text-[12px] leading-5 text-fg-default ${column.align === "center" ? "text-center" : "text-left"}`}
                    style={{ width: column.width, padding: 0 }}
                  >
                    {isImageColumn ? (
                      <button
                        type="button"
                        className="group/slot relative flex h-full w-full items-center justify-center"
                        title="双击上传或替换图片"
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.multiple = false;
                          input.onchange = () => {
                            const file = input.files?.[0];
                            if (file)
                              onRowImageUpload?.(
                                sourceIndex,
                                column.key as
                                  | "characterImage1"
                                  | "characterImage2"
                                  | "referenceImage",
                                file,
                              );
                          };
                          input.click();
                        }}
                      >
                        <WorkflowScriptImageCell
                          value={value}
                          compact={compact}
                        />
                        {isUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <div className="rounded-full border border-white/12 bg-black/60 px-2.5 py-1 text-[11px] text-white/80">
                              上传中
                            </div>
                          </div>
                        ) : null}
                      </button>
                    ) : isHighlightedDescription && !isEditingCell ? (
                      <div className="tiny-scrollbar min-h-[60px] max-h-[120px] overflow-hidden overflow-y-auto">
                        <button
                          type="button"
                          className={`box-border flex w-full cursor-pointer items-start whitespace-pre-wrap px-2 py-2 text-left text-[12px] leading-5 text-fg-default ${compact ? "min-h-[60px]" : "min-h-[92px]"}`}
                          title="双击编辑画面描述"
                          onPointerDown={stopWorkflowNodeChromeEvent}
                          onMouseDown={stopWorkflowNodeChromeEvent}
                          onClick={stopWorkflowNodeChromeEvent}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            setEditingCell({
                              rowIndex: sourceIndex,
                              columnKey: column.key,
                            });
                          }}
                          style={{ wordBreak: "break-word" }}
                        >
                          {renderWorkflowScriptHighlightedText(
                            value,
                            collectWorkflowScriptHighlightTerms(
                              row,
                              highlightAssetsByKind,
                            ),
                          )}
                        </button>
                      </div>
                    ) : (
                      <textarea
                        className={`nodrag nopan nowheel w-full resize-none border-0 bg-transparent px-2 py-2 text-inherit outline-none placeholder:text-fg-disabled ${compact ? "min-h-[60px]" : "min-h-[92px]"}`}
                        value={value}
                        placeholder="-"
                        autoFocus={isEditingCell}
                        onPointerDown={stopWorkflowNodeChromeEvent}
                        onMouseDown={stopWorkflowNodeChromeEvent}
                        onClick={stopWorkflowNodeChromeEvent}
                        onDoubleClick={stopWorkflowNodeChromeEvent}
                        onKeyDown={(event) => event.stopPropagation()}
                        onBlur={() => {
                          if (isEditingCell) setEditingCell(null);
                        }}
                        onChange={(event) =>
                          onRowChange(
                            sourceIndex,
                            column.key,
                            event.target.value,
                          )
                        }
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {visibleRows.length === 0 ? (
        <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-fg-subtle">
          {rows.length === 0 ? "暂无脚本内容" : "没有符合筛选条件的镜头"}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowScriptCreativeGrid({
  result,
  compact = false,
}: {
  result: LibTvStoryboardScriptResult;
  compact?: boolean;
}) {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return (
    <div
      className={`nodrag nopan nowheel h-full overflow-auto bg-[var(--Surface-Panel-background)] ${compact ? "p-2" : "p-4"}`}
    >
      <div
        className="grid justify-center"
        style={{
          gridTemplateColumns: `repeat(auto-fill, ${compact ? 220 : 248}px)`,
          gap: compact ? 8 : 12,
        }}
      >
        {rows.map((row, index) => {
          const imageUrl = getWorkflowScriptImageUrl(row);
          const character = String(
            row.character1 || row.character2 || "",
          ).trim();
          const shotType = String(row.shotType || "").trim();
          const emotion = String(row.emotion || "").trim();
          const description = String(
            row.visualDescription || row.storyboardPrompt || row.dialogue || "",
          ).trim();
          return (
            <div
              key={`${row.shotNumber || index + 1}-${index}`}
              className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border-muted bg-[var(--workflow-node-control-background)]"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/25">
                <div className="absolute left-2 top-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                  {row.shotNumber || index + 1}
                </div>
                <div className="absolute right-2 top-2 z-10 rounded bg-black/60 px-1.5 py-0.5 text-[10px] tabular-nums text-white/80">
                  {formatWorkflowScriptDuration(row.duration)}
                </div>
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={`镜头 ${row.shotNumber || index + 1}`}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-fg-disabled">
                    <ImageIcon className="size-6" />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 px-2.5 pb-2.5 pt-2">
                {character ? (
                  <span className="inline-flex max-w-full truncate rounded bg-canvas-controls-hover px-1.5 py-0.5 text-[10px] text-fg-muted">
                    {character}
                  </span>
                ) : null}
                <p
                  className="line-clamp-3 break-words text-xs leading-relaxed text-fg-default"
                  title={description}
                >
                  {description || "暂无画面描述"}
                </p>
                <p
                  className="truncate text-[10px] text-fg-subtle"
                  title={[shotType, emotion].filter(Boolean).join(" · ")}
                >
                  {[shotType, emotion].filter(Boolean).join(" · ") ||
                    "镜头信息"}
                </p>
                <div className="mt-auto pt-1">
                  <span className="text-[10px] text-fg-disabled">
                    场景 {row.shotNumber || index + 1}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-fg-subtle">
          暂无创意分镜
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowScriptViewDropdown({
  viewMode,
  onViewModeChange,
  align = "right",
}: {
  viewMode: WorkflowScriptViewMode;
  onViewModeChange: (mode: WorkflowScriptViewMode) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const activeOption =
    WORKFLOW_SCRIPT_VIEW_OPTIONS.find((option) => option.mode === viewMode) ||
    WORKFLOW_SCRIPT_VIEW_OPTIONS[0];

  return (
    <div className="nodrag nopan nowheel relative">
      <button
        type="button"
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-fg-default transition-colors hover:bg-canvas-controls-hover"
        onPointerDown={stopWorkflowNodeChromeEvent}
        onMouseDown={stopWorkflowNodeChromeEvent}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <span className="whitespace-nowrap">{activeOption.label}</span>
        <ChevronDown
          className={`size-3.5 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          className={`absolute top-full z-50 mt-1 w-32 rounded-xl p-1 text-canvas-controls-text ${align === "right" ? "right-0" : "left-0"}`}
          style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
        >
          {WORKFLOW_SCRIPT_VIEW_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs transition-colors ${viewMode === option.mode ? "bg-canvas-controls-hover text-canvas-controls-text" : "text-canvas-controls-text opacity-70 hover:bg-canvas-controls-hover hover:opacity-100"}`}
              onClick={(event) => {
                event.stopPropagation();
                onViewModeChange(option.mode);
                setOpen(false);
              }}
            >
              {option.icon}
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowScriptColumnVisibilityPanel({
  visibleColumnKeys,
  onVisibleColumnKeysChange,
}: {
  visibleColumnKeys: Set<LibTvStoryboardScriptColumnKey>;
  onVisibleColumnKeysChange: (
    keys: Set<LibTvStoryboardScriptColumnKey>,
  ) => void;
}) {
  return (
    <div
      className="tiny-scrollbar absolute left-4 top-full z-50 mt-1 max-h-[400px] min-w-[320px] overflow-auto rounded-xl p-4 text-canvas-controls-text"
      style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-fg-default">
            字段可见性
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="text-xs text-fg-muted transition-colors hover:text-fg-default"
              onClick={(event) => {
                event.stopPropagation();
                onVisibleColumnKeysChange(
                  new Set(
                    LIBTV_STORYBOARD_SCRIPT_COLUMNS.map((column) => column.key),
                  ),
                );
              }}
            >
              全部显示
            </button>
            <button
              type="button"
              className="text-xs text-fg-muted transition-colors hover:text-fg-default"
              onClick={(event) => {
                event.stopPropagation();
                onVisibleColumnKeysChange(
                  new Set(["shotNumber", "visualDescription"]),
                );
              }}
            >
              全部隐藏
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          {LIBTV_STORYBOARD_SCRIPT_COLUMNS.map((column) => {
            const visible = visibleColumnKeys.has(column.key);
            return (
              <button
                key={column.key}
                type="button"
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-canvas-controls-hover"
                onClick={(event) => {
                  event.stopPropagation();
                  const next = new Set(visibleColumnKeys);
                  if (visible) {
                    if (next.size <= 1) return;
                    next.delete(column.key);
                  } else {
                    next.add(column.key);
                  }
                  onVisibleColumnKeysChange(next);
                }}
              >
                {visible ? (
                  <Eye className="size-3.5 text-fg-muted" />
                ) : (
                  <EyeOff className="size-3.5 text-fg-disabled" />
                )}
                <span
                  className={visible ? "text-fg-default" : "text-fg-subtle"}
                >
                  {getWorkflowScriptColumnLabel(column)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function WorkflowScriptFilterPanel({
  filterDraft,
  onFilterDraftChange,
  onApply,
  onClear,
}: {
  filterDraft: WorkflowScriptFilterRule;
  onFilterDraftChange: (rule: WorkflowScriptFilterRule) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="absolute left-4 top-full z-50 mt-1 w-[445px] rounded-xl p-4 text-canvas-controls-text"
      style={CANVAS_CONTROLS_MENU_PANEL_STYLE}
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <div className="flex flex-col gap-4">
        <div className="text-sm font-medium text-fg-default">筛选条件</div>
        <div className="rounded-lg border border-border-muted p-3">
          <div className="mb-3 flex gap-2">
            <WorkflowSelect
              value={filterDraft.columnKey}
              onValueChange={(value) =>
                onFilterDraftChange({
                  ...filterDraft,
                  columnKey: value as LibTvStoryboardScriptColumnKey,
                })
              }
            >
              <WorkflowSelectTrigger
                className="h-9 flex-1 border-border-muted bg-bg-surface-secondary text-sm text-fg-default"
                aria-label="筛选列"
              >
                <WorkflowSelectValue />
              </WorkflowSelectTrigger>
              <WorkflowSelectContent>
                {LIBTV_STORYBOARD_SCRIPT_COLUMNS.map((column) => (
                  <WorkflowSelectItem key={column.key} value={column.key}>
                    {getWorkflowScriptColumnLabel(column)}
                  </WorkflowSelectItem>
                ))}
              </WorkflowSelectContent>
            </WorkflowSelect>
            <WorkflowSelect
              value={filterDraft.operator}
              onValueChange={(value) =>
                onFilterDraftChange({
                  ...filterDraft,
                  operator: value as WorkflowScriptFilterOperator,
                })
              }
            >
              <WorkflowSelectTrigger
                className="h-9 w-[92px] border-border-muted bg-bg-surface-secondary px-2 text-sm text-fg-default"
                aria-label="筛选条件"
              >
                <WorkflowSelectValue />
              </WorkflowSelectTrigger>
              <WorkflowSelectContent>
                <WorkflowSelectItem value="contains">包含</WorkflowSelectItem>
                <WorkflowSelectItem value="notContains">
                  不包含
                </WorkflowSelectItem>
                <WorkflowSelectItem value="equals">等于</WorkflowSelectItem>
                <WorkflowSelectItem value="notEmpty">非空</WorkflowSelectItem>
              </WorkflowSelectContent>
            </WorkflowSelect>
          </div>
          <div className="flex gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-border-muted bg-bg-surface-secondary px-3 text-sm text-fg-default outline-none placeholder:text-fg-disabled disabled:opacity-45"
              placeholder="输入筛选值..."
              value={filterDraft.value}
              disabled={filterDraft.operator === "notEmpty"}
              onChange={(event) =>
                onFilterDraftChange({
                  ...filterDraft,
                  value: event.target.value,
                })
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") onApply();
              }}
            />
            <button
              type="button"
              className="h-9 rounded-lg bg-canvas-controls-hover px-4 text-sm text-fg-default transition-colors hover:bg-canvas-controls-active"
              onClick={(event) => {
                event.stopPropagation();
                onApply();
              }}
            >
              添加
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="h-8 rounded-lg px-3 text-sm text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
            onClick={(event) => {
              event.stopPropagation();
              onClear();
            }}
          >
            清除筛选
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowScriptDocumentHeader({
  title,
  viewMode,
  onViewModeChange,
  onFullscreen,
  showTitle = true,
}: {
  title: string;
  viewMode: WorkflowScriptViewMode;
  onViewModeChange: (mode: WorkflowScriptViewMode) => void;
  onFullscreen: () => void;
  showTitle?: boolean;
}) {
  const displayTitle = getWorkflowScriptNodeTitle(title);
  return (
    <div className="workflow-node-drag-handle nopan nowheel flex h-10 shrink-0 cursor-grab items-center justify-between border-b border-border-muted px-3 active:cursor-grabbing">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {showTitle ? (
          <span
            className="truncate text-sm font-medium text-fg-default"
            title={displayTitle}
          >
            {displayTitle}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <WorkflowScriptViewDropdown
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
        <button
          type="button"
          className="nodrag nopan flex cursor-pointer items-center justify-center rounded-md p-1.5 text-fg-muted transition-colors hover:bg-canvas-controls-hover hover:text-fg-default"
          title="全屏展开"
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={(event) => {
            event.stopPropagation();
            onFullscreen();
          }}
        >
          <Fullscreen className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function WorkflowScriptDocumentView({
  result,
  title,
  selected,
  viewMode,
  fullscreen = false,
  onViewModeChange,
  onRowChange,
  onRowImageUpload,
  uploadingRowImageKeys,
  onFullscreen,
  showTitle = true,
  selectable = false,
  selectedRowIndexes,
  onSelectedRowIndexesChange,
  scriptV2AssetsByKind,
}: {
  result: LibTvStoryboardScriptResult;
  title: string;
  selected: boolean;
  viewMode: WorkflowScriptViewMode;
  fullscreen?: boolean;
  onViewModeChange: (mode: WorkflowScriptViewMode) => void;
  onRowChange: (
    rowIndex: number,
    key: LibTvStoryboardScriptColumnKey,
    value: string,
  ) => void;
  onRowImageUpload?: (
    rowIndex: number,
    key: "characterImage1" | "characterImage2" | "referenceImage",
    file: File,
  ) => void;
  uploadingRowImageKeys?: Set<string>;
  onFullscreen: () => void;
  showTitle?: boolean;
  selectable?: boolean;
  selectedRowIndexes?: Set<number>;
  onSelectedRowIndexesChange?: (indexes: Set<number>) => void;
  scriptV2AssetsByKind?: WorkflowScriptHighlightAssets;
}) {
  return (
    <div
      className={`nowheel nopan flex h-full w-full flex-col overflow-hidden bg-[var(--Surface-Panel-background)] text-fg-default ${fullscreen ? "rounded-none" : "cursor-grab rounded-xl active:cursor-grabbing"}`}
      data-script-interaction-mode={fullscreen ? "edit" : "drag"}
      style={{
        border: `1px solid ${WORKFLOW_SCRIPT_DOCUMENT_BORDER}`,
        outline:
          selected && !fullscreen
            ? `2px solid ${WORKFLOW_SCRIPT_DOCUMENT_SELECTED_BORDER}`
            : "0 solid transparent",
        outlineOffset: -1,
      }}
    >
      {showTitle ? (
        <WorkflowScriptDocumentHeader
          title={title || result.title || "脚本生成器"}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          onFullscreen={onFullscreen}
          showTitle={showTitle}
        />
      ) : null}
      <div
        className={`min-h-0 flex-1 ${fullscreen ? "cursor-default" : "pointer-events-none select-none"}`}
      >
        {viewMode === "creative" ? (
          <WorkflowScriptCreativeGrid result={result} compact={!fullscreen} />
        ) : (
          <WorkflowScriptTable
            result={result}
            compact={!fullscreen}
            onRowChange={onRowChange}
            onRowImageUpload={onRowImageUpload}
            uploadingRowImageKeys={uploadingRowImageKeys}
            scriptV2AssetsByKind={scriptV2AssetsByKind}
            selectable={selectable}
            selectedRowIndexes={selectedRowIndexes}
            onSelectedRowIndexesChange={onSelectedRowIndexesChange}
          />
        )}
      </div>
    </div>
  );
}

export function WorkflowScriptFullscreenEditor({
  result,
  title,
  viewMode,
  onViewModeChange,
  onRowChange,
  onRowImageUpload,
  uploadingRowImageKeys,
  onRegenerate,
  onExport,
  onClose,
}: {
  result: LibTvStoryboardScriptResult;
  title: string;
  viewMode: WorkflowScriptViewMode;
  onViewModeChange: (mode: WorkflowScriptViewMode) => void;
  onRowChange: (
    rowIndex: number,
    key: LibTvStoryboardScriptColumnKey,
    value: string,
  ) => void;
  onRowImageUpload?: (
    rowIndex: number,
    key: "characterImage1" | "characterImage2" | "referenceImage",
    file: File,
  ) => void;
  uploadingRowImageKeys?: Set<string>;
  onRegenerate: () => void;
  onExport: () => void;
  onClose: () => void;
}) {
  const allColumnKeys = useMemo(
    () =>
      new Set<LibTvStoryboardScriptColumnKey>(
        LIBTV_STORYBOARD_SCRIPT_COLUMNS.map((column) => column.key),
      ),
    [],
  );
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<
    Set<LibTvStoryboardScriptColumnKey>
  >(() => new Set(allColumnKeys));
  const [toolsOpen, setToolsOpen] = useState<"fields" | "filter" | null>(null);
  const [activeFilter, setActiveFilter] =
    useState<WorkflowScriptFilterRule | null>(null);
  const [filterDraft, setFilterDraft] = useState<WorkflowScriptFilterRule>({
    columnKey: "visualDescription",
    operator: "contains",
    value: "",
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const activeFilterEnabled = Boolean(
    activeFilter &&
    (activeFilter.operator === "notEmpty" || activeFilter.value.trim()),
  );
  const displayTitle = getWorkflowScriptNodeTitle(title || result.title);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-[#101010] text-white"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-white/88">
            {displayTitle}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-white/38">
            {Array.isArray(result.rows) ? result.rows.length : 0} 个镜头
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-3 text-sm text-white/66 transition-colors hover:bg-white/[0.08] hover:text-white"
            onClick={(event) => {
              event.stopPropagation();
              onRegenerate();
            }}
          >
            <RefreshCw className="size-4" />
            <span>重新生成</span>
          </button>
          <button
            type="button"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-white/66 transition-colors hover:bg-white/[0.08] hover:text-white"
            title="下载"
            onClick={(event) => {
              event.stopPropagation();
              onExport();
            }}
          >
            <Download className="size-4" />
          </button>
          <button
            type="button"
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-white/66 transition-colors hover:bg-white/[0.08] hover:text-white"
            title="关闭"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="min-w-0 text-sm text-white/52">
          {viewMode === "script" ? "表格编辑" : "创意预览"}
        </div>
        <WorkflowScriptViewDropdown
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
        />
      </div>
      {viewMode === "script" ? (
        <div className="relative flex h-11 shrink-0 items-center gap-2 border-b border-white/10 px-5">
          <button
            type="button"
            className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors ${toolsOpen === "fields" ? "bg-white/[0.12] text-white" : "text-white/52 hover:bg-white/[0.08] hover:text-white"}`}
            onClick={(event) => {
              event.stopPropagation();
              setToolsOpen((current) =>
                current === "fields" ? null : "fields",
              );
            }}
          >
            <Grid2X2 className="size-4" />
            <span>字段</span>
          </button>
          <button
            type="button"
            className={`inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm transition-colors ${toolsOpen === "filter" || activeFilterEnabled ? "bg-white/[0.12] text-white" : "text-white/52 hover:bg-white/[0.08] hover:text-white"}`}
            onClick={(event) => {
              event.stopPropagation();
              setToolsOpen((current) =>
                current === "filter" ? null : "filter",
              );
            }}
          >
            <Filter className="size-4" />
            <span>筛选</span>
          </button>
          {toolsOpen === "fields" ? (
            <WorkflowScriptColumnVisibilityPanel
              visibleColumnKeys={visibleColumnKeys}
              onVisibleColumnKeysChange={setVisibleColumnKeys}
            />
          ) : null}
          {toolsOpen === "filter" ? (
            <WorkflowScriptFilterPanel
              filterDraft={filterDraft}
              onFilterDraftChange={setFilterDraft}
              onApply={() => {
                setActiveFilter(filterDraft);
                setToolsOpen(null);
              }}
              onClear={() => {
                const nextRule: WorkflowScriptFilterRule = {
                  columnKey: "visualDescription",
                  operator: "contains",
                  value: "",
                };
                setFilterDraft(nextRule);
                setActiveFilter(null);
                setToolsOpen(null);
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {viewMode === "creative" ? (
          <WorkflowScriptCreativeGrid result={result} />
        ) : (
          <WorkflowScriptTable
            result={result}
            onRowChange={onRowChange}
            onRowImageUpload={onRowImageUpload}
            uploadingRowImageKeys={uploadingRowImageKeys}
            visibleColumnKeys={visibleColumnKeys}
            filterRule={activeFilter}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

export const SCRIPT_V2_VISIBLE_COLUMN_KEYS =
  new Set<LibTvStoryboardScriptColumnKey>([
    "shotNumber",
    "duration",
    "visualDescription",
    "shotType",
    "lightingAtmosphere",
    "dialogue",
    "soundEffect",
    "musicRhythm",
    "voice",
    "subtitleText",
    "subtitleStartTime",
    "subtitleEndTime",
    "cameraMovement",
    "storyboardPrompt",
  ]);

export function createWorkflowScriptV2Result(
  title = "脚本生成器",
): LibTvStoryboardScriptResult {
  const row = createEmptyStoryboardScriptRow(0);
  row.duration = "5s";
  return {
    title,
    summary: "",
    sourceScript: "",
    userPrompt: "",
    selectedOptionId: "custom",
    rows: [row],
    generatedAt: Date.now(),
  };
}

export function ScriptV2FullscreenEditor({
  result,
  title,
  onRowChange,
  onAddRow,
  onClose,
  scriptV2AssetsByKind,
}: {
  result: LibTvStoryboardScriptResult;
  title: string;
  onRowChange: (
    rowIndex: number,
    key: LibTvStoryboardScriptColumnKey,
    value: string,
  ) => void;
  onAddRow: () => void;
  onClose: () => void;
  scriptV2AssetsByKind?: WorkflowScriptHighlightAssets;
}) {
  const rows = Array.isArray(result.rows) ? result.rows : [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex flex-col bg-[#101010] text-white"
      data-testid="scriptv2-fullscreen-container"
      onPointerDown={stopWorkflowNodeChromeEvent}
      onMouseDown={stopWorkflowNodeChromeEvent}
      onClick={stopWorkflowNodeChromeEvent}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-5">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-white/90">
            {title || result.title || "脚本生成器"}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-white/38">
            {rows.length} 个镜头
          </div>
        </div>
        <button
          type="button"
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-white/66 transition-colors hover:bg-white/[0.08] hover:text-white"
          title="关闭 (ESC)"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        {[
          {
            label: "确认镜头",
            hint: `${rows.length || 0}个镜头待核对`,
            active: true,
          },
          { label: "准备资产", hint: "暂无资产", active: false },
          {
            label: "合成提示词",
            hint: `0/${rows.length || 0} 已合成`,
            active: false,
          },
        ].map((step, index) => (
          <div key={step.label} className="flex min-w-0 items-center gap-3">
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${step.active ? "bg-white text-black" : "bg-white/10 text-white/45"}`}
            >
              {index + 1}
            </div>
            <div className="min-w-0">
              <div
                className={`truncate text-sm ${step.active ? "text-white/90" : "text-white/45"}`}
              >
                {step.label}
              </div>
              <div className="truncate text-[11px] text-white/32">
                {step.hint}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1" data-testid="scriptv2-table-root">
        <WorkflowScriptTable
          result={result}
          onRowChange={onRowChange}
          visibleColumnKeys={SCRIPT_V2_VISIBLE_COLUMN_KEYS}
          scriptV2AssetsByKind={scriptV2AssetsByKind}
        />
      </div>
      <div className="flex h-14 shrink-0 items-center justify-between border-t border-white/10 px-5">
        <button
          type="button"
          className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-3 text-sm text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
          onClick={(event) => {
            event.stopPropagation();
            onAddRow();
          }}
        >
          <Plus className="size-4" />
          <span>添加镜头</span>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 cursor-pointer items-center rounded-lg bg-white px-3 text-sm font-medium text-black transition-opacity hover:opacity-80"
            onClick={(event) => {
              event.stopPropagation();
              message.info("准备资产功能开发中");
            }}
          >
            → 下一步：准备资产
          </button>
          <button
            type="button"
            className="inline-flex h-8 cursor-pointer items-center rounded-lg bg-white/[0.10] px-3 text-sm text-white/70 transition-colors hover:bg-white/[0.16] hover:text-white"
            onClick={(event) => {
              event.stopPropagation();
              message.info("一键合成全部提示词开发中");
            }}
          >
            一键合成全部提示词
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TapNowScriptNode({
  node,
  selected,
  showFloatingControls,
  dragging,
  nodeEventsSuppressed,
  upstreamNodes,
  onUpdateNode,
  onReferenceFilesUploaded,
  onReferenceNodeRemoved,
  onGenerateNode,
  onGenerateStoryboard,
  onRequestGenerationFrame,
  onRequestImageResultFrame,
  projectId,
}: {
  node: LibTvWorkflowNode;
  selected: boolean;
  showFloatingControls: boolean;
  dragging: boolean;
  nodeEventsSuppressed?: boolean;
  upstreamNodes?: WorkflowUpstreamNodeSummary[];
  onUpdateNode?: (
    id: string,
    patch: Partial<LibTvWorkflowNode["data"]>,
  ) => void;
  onCreateScriptInputNode?: (
    id: string,
    type: ScriptInputCreationType,
    initialContent?: string,
  ) => void;
  onReferenceFilesUploaded?: (id: string, files: File[]) => void;
  onReferenceNodeRemoved?: (id: string, sourceId: string) => void;
  onGenerateNode?: WorkflowGenerateNodeHandler;
  onGenerateStoryboard?: (
    id: string,
    request: WorkflowStoryboardGenerateRequest,
  ) => void;
  onRequestGenerationFrame?: (id: string, aspectRatio: string) => void;
  onRequestImageResultFrame?: (id: string, imageUrl: string) => void;
  projectId?: string;
}) {
  const [title, setTitle] = useState(
    getWorkflowScriptNodeTitle(node.data?.title),
  );
  const prompt = String(node.data?.prompt || "");
  const referenceImages = Array.isArray(node.data?.referenceImages)
    ? node.data.referenceImages
    : [];
  const referenceImageNodeIds = Array.isArray(node.data?.referenceImageNodeIds)
    ? node.data.referenceImageNodeIds
    : [];
  const referenceImageRoles = Array.isArray(node.data?.referenceImageRoles)
    ? node.data.referenceImageRoles
    : [];
  const scriptResult = node.data?.scriptResult || null;
  const isScriptDocument =
    node.data?.componentType === "script-document" ||
    Boolean(scriptResult?.rows?.length);
  const isVideoAnalysisScript = isWorkflowVideoAnalysisScriptNode(node);
  const scriptViewMode: WorkflowScriptViewMode =
    node.data?.scriptViewMode === "creative" ? "creative" : "script";
  const showNodeChrome = !nodeEventsSuppressed && !dragging;
  const [scriptFullscreenOpen, setScriptFullscreenOpen] = useState(false);
  const [storyboardMode, setStoryboardMode] = useState(false);
  const [, setStoryboardPrompt] = useState("");
  const [storyboardModelId, setStoryboardModelId] = useState(() =>
    String((node.data as any)?.storyboardImageModelId || ""),
  );
  const [storyboardAspectRatio, setStoryboardAspectRatio] = useState(
    String((node.data as any)?.storyboardImageAspectRatio || ""),
  );
  const [storyboardImageSize, setStoryboardImageSize] = useState(
    String((node.data as any)?.storyboardImageSize || ""),
  );
  const [selectedStoryboardRows, setSelectedStoryboardRows] = useState<
    Set<number>
  >(() => new Set());
  const [uploadingRowImageKeys, setUploadingRowImageKeys] = useState<
    Set<string>
  >(() => new Set());
  const storyboardRows = Array.isArray(scriptResult?.rows)
    ? scriptResult.rows
    : [];

  useEffect(() => {
    setTitle(getWorkflowScriptNodeTitle(node.data?.title));
  }, [node.data?.title]);

  useEffect(() => {
    if (!storyboardMode) return;
    setSelectedStoryboardRows(new Set(storyboardRows.map((_, index) => index)));
  }, [storyboardMode, storyboardRows.length]);

  const applyPrompt = useCallback(
    (value: string) => {
      onUpdateNode?.(node.id, { prompt: value });
    },
    [node.id, onUpdateNode],
  );

  const updateScriptRow = useCallback(
    (rowIndex: number, key: LibTvStoryboardScriptColumnKey, value: string) => {
      if (!scriptResult) return;
      const rows = Array.isArray(scriptResult.rows) ? scriptResult.rows : [];
      const nextRows = rows.map((row, index) =>
        index === rowIndex ? { ...row, [key]: value } : row,
      );
      onUpdateNode?.(node.id, {
        scriptResult: { ...scriptResult, rows: nextRows },
      });
    },
    [node.id, onUpdateNode, scriptResult],
  );

  const handleScriptRowImageUpload = useCallback(
    (
      rowIndex: number,
      key: "characterImage1" | "characterImage2" | "referenceImage",
      file: File,
    ) => {
      if (!scriptResult) return;
      const rows = Array.isArray(scriptResult.rows) ? scriptResult.rows : [];
      const row = rows[rowIndex];
      if (!row) return;
      const uploadKey = `${rowIndex}:${key}`;
      setUploadingRowImageKeys((current) => new Set(current).add(uploadKey));
      void uploadCanvasNodeFile(file)
        .then(({ publicUrl, libtvUrl }) => {
          const uploadedUrl = libtvUrl || publicUrl;
          const currentRows = Array.isArray(
            (
              node.data?.scriptResult as
                | LibTvStoryboardScriptResult
                | null
                | undefined
            )?.rows,
          )
            ? (node.data?.scriptResult as LibTvStoryboardScriptResult).rows
            : rows;
          const patchedRows = currentRows.map((item, index) =>
            index === rowIndex ? { ...item, [key]: uploadedUrl } : item,
          );
          onUpdateNode?.(node.id, {
            scriptResult: {
              ...(scriptResult as LibTvStoryboardScriptResult),
              rows: patchedRows,
            },
          });
        })
        .catch((error) => {
          message.error(
            error instanceof Error ? error.message : "图片上传失败",
          );
          console.error(
            "[LibTvWorkflowSurface] script row image upload failed",
            error,
          );
        })
        .finally(() => {
          setUploadingRowImageKeys((current) => {
            const next = new Set(current);
            next.delete(uploadKey);
            return next;
          });
        });
    },
    [node.data?.scriptResult, node.id, onUpdateNode, scriptResult],
  );

  return (
    <div
      className="group node-shell relative h-full w-full overflow-visible rounded-xl text-fg-default"
      data-testid={`canvas-node-script-${node.id}`}
      style={{
        minWidth: isScriptDocument ? 800 : LIBTV_TAPNOW_SCRIPT_WIDTH,
        minHeight: isScriptDocument ? 400 : LIBTV_TAPNOW_SCRIPT_HEIGHT,
        background: isScriptDocument
          ? "transparent"
          : ZMTV_NODE_SURFACE_BACKGROUND,
        border: isScriptDocument
          ? "0 solid transparent"
          : ZMTV_NODE_SURFACE_BORDER,
        outline:
          selected && showNodeChrome && !isScriptDocument
            ? ZMTV_NODE_SURFACE_SELECTED_OUTLINE
            : "0 solid transparent",
        outlineOffset: -1,
        boxShadow:
          selected && showNodeChrome && !isScriptDocument
            ? "var(--canvas-shadow-panel)"
            : isScriptDocument
              ? "none"
              : ZMTV_NODE_SURFACE_SHADOW,
        color: "var(--fg-default, rgba(255,255,255,0.9))",
      }}
    >
      {!isVideoAnalysisScript ? (
        <div
          className={`node-floating-ui origin-bottom-left ${WORKFLOW_NODE_TITLE_BAR_CLASS}`}
          style={WORKFLOW_NODE_TITLE_BAR_STYLE}
        >
          <span className="flex shrink-0 items-center text-fg-muted">
            <TapNowNodeIcon kind="script" size={14} opacity={0.82} />
          </span>
          <div
            className="relative min-w-0 max-w-full shrink"
            style={{
              width: getWorkflowNodeTitleWidth(
                getWorkflowScriptNodeTitle(title),
              ),
            }}
          >
            <span
              className="pointer-events-none invisible inline-block select-none whitespace-pre align-top text-[13px]"
              aria-hidden="true"
            >
              {getWorkflowScriptNodeTitle(title)}
            </span>
            <input
              placeholder="请输入标题"
              className="nodrag nopan nowheel absolute inset-0 box-border h-auto w-full cursor-text truncate border-none bg-transparent p-0 text-[13px] text-inherit outline-none"
              data-testid="canvas-node-title"
              value={title}
              title={getWorkflowScriptNodeTitle(title)}
              onPointerDown={stopWorkflowNodeChromeEvent}
              onMouseDown={stopWorkflowNodeChromeEvent}
              onClick={stopWorkflowNodeChromeEvent}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() =>
                onUpdateNode?.(node.id, {
                  title: getWorkflowScriptNodeTitle(title),
                })
              }
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
        </div>
      ) : null}

      {isScriptDocument &&
      scriptResult &&
      showFloatingControls &&
      showNodeChrome &&
      !storyboardMode &&
      !isVideoAnalysisScript ? (
        <div
          className="node-floating-ui nodrag nowheel nopan pointer-events-auto absolute left-1/2 z-20 flex origin-bottom -translate-x-1/2 items-center justify-center gap-1 rounded-xl p-1 text-canvas-controls-text"
          style={{
            ...CANVAS_CONTROLS_MENU_PANEL_STYLE,
            bottom: "calc(100% + 12px)",
          }}
          onPointerDown={stopWorkflowNodeChromeEvent}
          onMouseDown={stopWorkflowNodeChromeEvent}
          onClick={stopWorkflowNodeChromeEvent}
        >
          <WorkflowScriptToolbarButton
            title="重新生成"
            onClick={(event) => {
              event.stopPropagation();
              onUpdateNode?.(node.id, { suppressGenerationBar: true });
              onGenerateNode?.(node.id, prompt);
            }}
          >
            <RefreshCw className="size-4" />
            <span className="whitespace-nowrap">重新生成</span>
          </WorkflowScriptToolbarButton>
          <WorkflowScriptToolbarButton
            title="生成分镜"
            onClick={(event) => {
              event.stopPropagation();
              setStoryboardMode(true);
              setSelectedStoryboardRows(
                new Set(storyboardRows.map((_, index) => index)),
              );
              onUpdateNode?.(node.id, { scriptViewMode: "script" });
            }}
          >
            <Sparkles className="size-4" />
            <span className="whitespace-nowrap">生成分镜</span>
          </WorkflowScriptToolbarButton>
          <div className="mx-1 h-5 w-px bg-white/10" />
          <button
            type="button"
            title="下载"
            className="nodrag nopan flex size-8 cursor-pointer items-center justify-center rounded-lg text-white/72 transition-colors hover:bg-white/[0.08] hover:text-white"
            onPointerDown={stopWorkflowNodeChromeEvent}
            onMouseDown={stopWorkflowNodeChromeEvent}
            onClick={(event) => {
              event.stopPropagation();
              downloadWorkflowScriptResult(scriptResult);
            }}
          >
            <Download className="size-4" />
          </button>
        </div>
      ) : null}

      {isScriptDocument && scriptResult ? (
        isVideoAnalysisScript ? (
          <WorkflowVideoAnalysisStoryView
            nodeId={node.id}
            result={scriptResult}
            title={title}
            selected={selected}
            onFullscreen={() => setScriptFullscreenOpen(true)}
          />
        ) : (
          <WorkflowScriptDocumentView
            result={scriptResult}
            title={title}
            selected={selected && showNodeChrome}
            viewMode={scriptViewMode}
            onViewModeChange={(mode) =>
              onUpdateNode?.(node.id, { scriptViewMode: mode })
            }
            onRowChange={updateScriptRow}
            onRowImageUpload={handleScriptRowImageUpload}
            uploadingRowImageKeys={uploadingRowImageKeys}
            onFullscreen={() => setScriptFullscreenOpen(true)}
            showTitle={false}
            selectable={storyboardMode}
            selectedRowIndexes={selectedStoryboardRows}
            onSelectedRowIndexesChange={setSelectedStoryboardRows}
          />
        )
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-6">
          {node.data?.workflowGenerationRunning ? (
            <div className="w-full">
              <div className="mb-2 text-sm text-fg-muted">生成中：</div>
              <pre className="max-h-32 overflow-hidden whitespace-pre-wrap text-sm leading-6 text-fg-muted">
                {String(node.data?.note || "正在生成脚本表格...")}
              </pre>
            </div>
          ) : (
            <ZmtvNodeEmptyGlyph />
          )}
        </div>
      )}

      {showFloatingControls &&
      showNodeChrome &&
      !scriptFullscreenOpen &&
      !node.data?.suppressGenerationBar &&
      !isVideoAnalysisScript ? (
        <NodeGenerationBar
          kind={storyboardMode ? "image" : node.kind}
          modelId={storyboardMode ? storyboardModelId : node.data?.modelId}
          workflowEndpointMethod={
            storyboardMode
              ? String(
                  (node.data as any)?.storyboardImageEndpointMethod || "",
                ) || undefined
              : node.data?.workflowEndpointMethod
          }
          selectedOptionId={
            storyboardMode ? undefined : node.data?.selectedOptionId
          }
          promptInputDisabled={
            storyboardMode ? false : node.data?.workflowPromptDisabled
          }
          promptPlaceholderText={
            storyboardMode ? undefined : node.data?.workflowPromptPlaceholder
          }
          prompt={prompt}
          onPromptChange={applyPrompt}
          onModelChange={(value) => {
            if (storyboardMode) {
              setStoryboardModelId(value);
              onUpdateNode?.(node.id, {
                storyboardImageModelId: value,
              } as any);
            } else onUpdateNode?.(node.id, { modelId: value });
          }}
          aspectRatio={
            storyboardMode ? storyboardAspectRatio : node.data?.aspectRatio
          }
          imageSize={
            storyboardMode ? storyboardImageSize : node.data?.imageSize
          }
          stylePreset={node.data?.stylePreset}
          videoMethod={node.data?.videoMethod}
          videoDuration={node.data?.videoDuration}
          videoResolution={node.data?.videoResolution}
          generateAudio={node.data?.generateAudio}
          enableWebSearch={
            storyboardMode
              ? (node.data as any)?.storyboardImageWebSearch
              : node.data?.enableWebSearch
          }
          generationCount={
            storyboardMode
              ? Number.isFinite(
                  Number((node.data as any)?.storyboardImageGenerationCount),
                )
                ? Math.max(
                    1,
                    Math.round(
                      Number(
                        (node.data as any)?.storyboardImageGenerationCount,
                      ),
                    ),
                  )
                : undefined
              : node.data?.generationCount
          }
          cameraControl={node.data?.cameraControl}
          videoCameraMotion={node.data?.videoCameraMotion}
          videoCharacterAssets={node.data?.videoCharacterAssets}
          workflowPortraitTextureSettings={
            node.data?.workflowPortraitTextureSettings
          }
          workflowExtraParameters={
            storyboardMode
              ? (node.data as any)?.storyboardImageExtraParameters
              : node.data?.workflowExtraParameters
          }
          onGenerationSettingsChange={(patch) => {
            if (storyboardMode) {
              const persistedPatch: Record<string, unknown> = {};
              if (Object.prototype.hasOwnProperty.call(patch, "modelId")) {
                const value = String(patch.modelId || "");
                setStoryboardModelId(value);
                persistedPatch.storyboardImageModelId = value || undefined;
              }
              if (
                Object.prototype.hasOwnProperty.call(
                  patch,
                  "workflowEndpointMethod",
                )
              )
                persistedPatch.storyboardImageEndpointMethod =
                  patch.workflowEndpointMethod;
              if (Object.prototype.hasOwnProperty.call(patch, "aspectRatio")) {
                const value = String(patch.aspectRatio || "");
                setStoryboardAspectRatio(value);
                persistedPatch.storyboardImageAspectRatio = value || undefined;
              }
              if (Object.prototype.hasOwnProperty.call(patch, "imageSize")) {
                const value = String(patch.imageSize || "");
                setStoryboardImageSize(value);
                persistedPatch.storyboardImageSize = value || undefined;
              }
              if (
                Object.prototype.hasOwnProperty.call(patch, "generationCount")
              )
                persistedPatch.storyboardImageGenerationCount =
                  patch.generationCount;
              if (
                Object.prototype.hasOwnProperty.call(
                  patch,
                  "workflowExtraParameters",
                )
              )
                persistedPatch.storyboardImageExtraParameters =
                  patch.workflowExtraParameters;
              if (
                Object.prototype.hasOwnProperty.call(patch, "enableWebSearch")
              )
                persistedPatch.storyboardImageWebSearch = patch.enableWebSearch;
              if (Object.keys(persistedPatch).length > 0)
                onUpdateNode?.(node.id, persistedPatch as any);
              return;
            }
            onUpdateNode?.(node.id, patch);
          }}
          onRequestGenerationFrame={
            storyboardMode
              ? undefined
              : (nextAspectRatio) =>
                  onRequestGenerationFrame?.(node.id, nextAspectRatio)
          }
          projectId={projectId}
          onGeneratedResult={
            storyboardMode
              ? undefined
              : (result) =>
                  onRequestImageResultFrame?.(node.id, result.imageUrl)
          }
          onGenerate={(promptDraft, settings) => {
            if (typeof promptDraft === "string") {
              onUpdateNode?.(node.id, {
                prompt: promptDraft,
                ...settings,
                suppressGenerationBar: true,
              });
              if (storyboardMode) setStoryboardPrompt(promptDraft);
            } else {
              onUpdateNode?.(node.id, {
                ...settings,
                suppressGenerationBar: true,
              });
            }
            if (storyboardMode) {
              const rowIndexes = Array.from(selectedStoryboardRows).sort(
                (a, b) => a - b,
              );
              onGenerateStoryboard?.(node.id, {
                rowIndexes,
                prompt: typeof promptDraft === "string" ? promptDraft : prompt,
                modelId: settings?.modelId || storyboardModelId,
                workflowEndpointMethod:
                  settings?.workflowEndpointMethod || undefined,
                aspectRatio:
                  settings?.aspectRatio || storyboardAspectRatio || undefined,
                imageSize:
                  settings?.imageSize || storyboardImageSize || undefined,
                generationCount: settings?.generationCount,
                stylePreset: node.data?.stylePreset,
                cameraControl: node.data?.cameraControl,
                workflowExtraParameters:
                  settings?.workflowExtraParameters ||
                  (node.data as any)?.storyboardImageExtraParameters,
                enableWebSearch:
                  typeof settings?.enableWebSearch === "boolean"
                    ? settings.enableWebSearch
                    : typeof (node.data as any)?.storyboardImageWebSearch ===
                        "boolean"
                      ? Boolean((node.data as any).storyboardImageWebSearch)
                      : undefined,
              });
              return;
            }
            onGenerateNode?.(node.id, promptDraft, settings);
          }}
          onCancel={storyboardMode ? () => setStoryboardMode(false) : undefined}
          selectedItemCount={
            storyboardMode ? selectedStoryboardRows.size : undefined
          }
          totalItemCount={storyboardMode ? storyboardRows.length : undefined}
          referenceImages={referenceImages}
          referenceImageNodeIds={referenceImageNodeIds}
          referenceImageRoles={referenceImageRoles}
          upstreamNodes={upstreamNodes}
          onReferenceFilesUploaded={(files) =>
            onReferenceFilesUploaded?.(node.id, files)
          }
          onReferenceRemoved={(index, sourceId) => {
            if (sourceId) {
              onReferenceNodeRemoved?.(node.id, sourceId);
              return;
            }
            const nextReferenceImages = referenceImages.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            const nextReferenceNodeIds = referenceImageNodeIds.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            const nextReferenceRoles = referenceImageRoles.filter(
              (_, itemIndex) => itemIndex !== index,
            );
            onUpdateNode?.(node.id, {
              referenceImages: nextReferenceImages,
              referenceImageNodeIds: nextReferenceNodeIds,
              referenceImageRoles: nextReferenceRoles,
            });
          }}
        />
      ) : null}

      {isScriptDocument && scriptResult && scriptFullscreenOpen ? (
        <WorkflowScriptFullscreenEditor
          result={scriptResult}
          title={title}
          viewMode={scriptViewMode}
          onViewModeChange={(mode) =>
            onUpdateNode?.(node.id, { scriptViewMode: mode })
          }
          onRowChange={updateScriptRow}
          onRowImageUpload={handleScriptRowImageUpload}
          uploadingRowImageKeys={uploadingRowImageKeys}
          onRegenerate={() => {
            onUpdateNode?.(node.id, { suppressGenerationBar: true });
            onGenerateNode?.(node.id, prompt);
          }}
          onExport={() => downloadWorkflowScriptResult(scriptResult)}
          onClose={() => setScriptFullscreenOpen(false)}
        />
      ) : null}
    </div>
  );
}
